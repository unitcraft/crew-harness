// ТРАНСПОРТ ЧЕРЕЗ NTFY (прототип, 2026-10-06). Письма между машинами через pub/sub ntfy.sh (или свой сервер ntfy).
// Тот же интерфейс, что у github.ts: send / pollOnce / flushOnce / start / stop.
//
// Канал публичный: кто знает имя темы, тот читает и пишет. Поэтому всё держится на общем секрете: из него выводятся
// и имя темы, и ключ AES-256-GCM. Сообщение без верного тега отбрасывается — подделать письмо без секрета нельзя;
// повтор перехваченного сообщения отсекается по mid и возрасту конверта (REPLAY_MS).
//
// Предел ntfy.sh — 4096 байт на сообщение (больше — уходит вложением), поэтому конверт шифруется целиком и режется
// на части: тело сообщения `peers1 <mid> <i>/<n> <base64-кусок>`. Приёмник собирает части по mid.
//
// Приём — подписка `GET /<тема>/json?since=<последний id>` (NDJSON-поток, keepalive раз в ~45 с): письмо приходит за
// доли секунды. Обрыв — переподключение с тем же since; ntfy.sh держит сообщения в кэше ~12 ч, так что за время
// обрыва ничего не теряется. pollOnce (`?poll=1`) — для тестов и разовой проверки: опрос раз в секунду быстро упрётся
// в лимит запросов ntfy.sh.
//
// Отправка — очередь с паузой между сообщениями и лимитом в минуту: у анонимного ntfy.sh лимит запросов (всплеск,
// затем ~1 запрос в несколько секунд) и дневной лимит сообщений — точные числа в документации ntfy. Накопившиеся
// письма уходят одним конвертом. 429 — пауза по retry-after, иначе минута.

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto"
import type { GhLetter as PeerLetter } from "./github.ts"

export type { PeerLetter }
export type NtfyConfig = {
  secret: string // общий для всех машин канала; ntfySecret() — новый
  node: string // имя этой машины/процесса: свои сообщения не читаем
  server?: string // по умолчанию https://ntfy.sh
  token?: string // токен доступа ntfy (свой сервер или аккаунт), необязательно
  since?: string // id сообщения или unix-время; по умолчанию — момент старта
  sendGapMs?: number
  maxPerMinute?: number
  maxParts?: number // частей в одном конверте: длинная пачка режется по письмам
  idleMs?: number // нет даже keepalive столько — переподключиться
  fetch?: typeof fetch
  now?: () => number
  log?: (line: string) => void
}
export type NtfyStats = { connects: number; polls: number; messages: number; posts: number; sent: number; received: number; rejected: number; errors: number; blockedUntil: number }

export const CHUNK = 3_800 // символов base64 на сообщение: с заголовком — меньше 4096 байт
export const REPLAY_MS = 15 * 60_000
const PARTIAL_MS = 5 * 60_000
const BODY_RE = /^peers1 ([0-9a-f]{12}) (\d+)\/(\d+) ([A-Za-z0-9+/=]+)$/

/** Новый общий секрет канала. */
export const ntfySecret = () => randomBytes(24).toString("base64url")

/** Из секрета — имя темы и ключ шифрования. */
export function ntfyKeys(secret: string): { topic: string; key: Buffer } {
  const topic = `peers-${createHash("sha256").update(`opencode-peers/ntfy/topic:${secret}`).digest("hex").slice(0, 32)}`
  const key = scryptSync(secret, "opencode-peers/ntfy/key", 32)
  return { topic, key }
}

type Envelope = { v: 1; node: string; at: number; letters: PeerLetter[] }

export function seal(key: Buffer, env: Envelope): string {
  const iv = randomBytes(12)
  const c = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([c.update(JSON.stringify(env), "utf8"), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")
}

export function unseal(key: Buffer, b64: string): Envelope | undefined {
  try {
    const buf = Buffer.from(b64, "base64")
    const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12))
    d.setAuthTag(buf.subarray(12, 28))
    const env = JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"))
    return env?.v === 1 && typeof env.node === "string" && typeof env.at === "number" && Array.isArray(env.letters) ? env : undefined
  } catch {
    return undefined
  }
}

/** Конверт → тела сообщений ntfy. */
export function frame(key: Buffer, env: Envelope, chunk = CHUNK): string[] {
  const sealed = seal(key, env)
  const mid = randomBytes(6).toString("hex")
  const n = Math.ceil(sealed.length / chunk)
  return Array.from({ length: n }, (_, i) => `peers1 ${mid} ${i + 1}/${n} ${sealed.slice(i * chunk, (i + 1) * chunk)}`)
}

type NtfyMessage = { id: string; time: number; event: string; message?: string }

export function createNtfyTransport(cfg: NtfyConfig) {
  const { topic, key } = ntfyKeys(cfg.secret)
  const server = (cfg.server ?? "https://ntfy.sh").replace(/\/+$/, "")
  const doFetch = cfg.fetch ?? fetch
  const now = cfg.now ?? Date.now
  const log = cfg.log ?? (() => {})
  const sendGapMs = cfg.sendGapMs ?? 2_000
  const maxPerMinute = cfg.maxPerMinute ?? 12
  const maxParts = cfg.maxParts ?? 8
  const idleMs = cfg.idleMs ?? 90_000

  let since = cfg.since ?? String(Math.floor(now() / 1000))
  const seenMsg = new Set<string>()
  const seenMid = new Map<string, number>()
  const partial = new Map<string, { parts: (string | undefined)[]; at: number }>()
  let failures = 0
  let lastPost = 0
  const posts: number[] = []
  const queue: { letter: PeerLetter; done: (err?: Error) => void }[] = []
  const stats: NtfyStats = { connects: 0, polls: 0, messages: 0, posts: 0, sent: 0, received: 0, rejected: 0, errors: 0, blockedUntil: 0 }

  const headers = (): Record<string, string> => (cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {})

  function backoff(res?: Response) {
    stats.errors++
    failures++
    let wait = Math.min(60_000, 1_000 * 2 ** (failures - 1))
    if (res?.status === 429) {
      const retry = Number(res.headers.get("retry-after"))
      wait = retry > 0 ? retry * 1_000 : 60_000
    }
    stats.blockedUntil = now() + wait
    log(`ntfy: ${res ? `HTTP ${res.status}` : "сеть"} — пауза ${Math.round(wait / 1000)} с`)
    return wait
  }

  // Старые хвосты: недособранные конверты и запомненные id — не растить без конца.
  function prune() {
    const t = now()
    for (const [mid, p] of partial) if (t - p.at > PARTIAL_MS) partial.delete(mid)
    for (const [mid, at] of seenMid) if (t - at > 2 * REPLAY_MS) seenMid.delete(mid)
    if (seenMsg.size > 1_000) for (const id of [...seenMsg].slice(0, seenMsg.size - 500)) seenMsg.delete(id)
  }

  /** Одно сообщение ntfy → письма, если им закончился конверт чужого узла. */
  function take(m: NtfyMessage): PeerLetter[] {
    if (m.event !== "message" || !m.id) return []
    since = m.id
    if (seenMsg.has(m.id)) return []
    seenMsg.add(m.id)
    stats.messages++
    const b = m.message?.match(BODY_RE)
    if (!b) return []
    const [, mid, iStr, nStr, data] = b
    const i = Number(iStr)
    const n = Number(nStr)
    if (seenMid.has(mid) || i < 1 || i > n || n > 64) return []
    const p = partial.get(mid) ?? { parts: new Array(n).fill(undefined), at: now() }
    if (p.parts.length !== n) return []
    p.parts[i - 1] = data
    partial.set(mid, p)
    if (p.parts.some((x) => x === undefined)) return []
    partial.delete(mid)
    seenMid.set(mid, now())
    const env = unseal(key, p.parts.join(""))
    if (!env || Math.abs(now() - env.at) > REPLAY_MS) {
      stats.rejected++
      return []
    }
    if (env.node === cfg.node) return []
    stats.received += env.letters.length
    return env.letters
  }

  function takeLines(text: string): PeerLetter[] {
    const out: PeerLetter[] = []
    for (const line of text.split("\n")) {
      if (!line.trim()) continue
      try {
        out.push(...take(JSON.parse(line)))
      } catch {}
    }
    return out
  }

  /** Разовый опрос кэша темы с последнего увиденного сообщения. */
  async function pollOnce(): Promise<PeerLetter[]> {
    if (now() < stats.blockedUntil) return []
    stats.polls++
    try {
      const res = await doFetch(`${server}/${topic}/json?poll=1&since=${encodeURIComponent(since)}`, { headers: headers() })
      if (!res.ok) {
        backoff(res)
        return []
      }
      failures = 0
      prune()
      return takeLines(await res.text())
    } catch (e: any) {
      log(`ntfy: опрос — ${e?.message ?? e}`)
      backoff()
      return []
    }
  }

  /** Отправить накопленное одним конвертом (в нём не больше maxParts частей). Число ушедших писем. */
  async function flushOnce(): Promise<number> {
    const t = now()
    if (!queue.length || t < stats.blockedUntil || t - lastPost < sendGapMs) return 0
    while (posts.length && t - posts[0] > 60_000) posts.shift()
    const room = Math.min(maxParts, maxPerMinute - posts.length)
    if (room <= 0) return 0
    let n = 0
    let bodies: string[] = []
    while (n < queue.length) {
      const next = frame(key, { v: 1, node: cfg.node, at: t, letters: queue.slice(0, n + 1).map((q) => q.letter) })
      if (next.length > room && n > 0) break
      bodies = next
      n++
      if (next.length > room) break
    }
    if (bodies.length > maxParts) {
      const big = queue.shift()!
      big.done(new Error(`письмо ${big.letter.id} длиннее ${maxParts} сообщений ntfy`))
      return 0
    }
    if (bodies.length > room) return 0 // одно письмо на несколько частей — ждать, пока освободится минутный лимит
    lastPost = t
    for (const body of bodies) {
      posts.push(t)
      let res: Response
      try {
        res = await doFetch(`${server}/${topic}`, { method: "POST", headers: { ...headers(), Firebase: "no" }, body })
      } catch (e: any) {
        log(`ntfy: отправка — ${e?.message ?? e}`)
        backoff()
        return 0 // конверт уйдёт заново целиком, с новым mid; недособранные части приёмник выбросит
      }
      if (!res.ok) {
        backoff(res)
        return 0
      }
      try {
        const m = (await res.json()) as NtfyMessage
        if (m?.id) seenMsg.add(m.id)
      } catch {}
    }
    failures = 0
    stats.posts += bodies.length
    stats.sent += n
    for (const q of queue.splice(0, n)) q.done()
    return n
  }

  function send(letter: PeerLetter): Promise<void> {
    return new Promise((resolve, reject) => queue.push({ letter, done: (err) => (err ? reject(err) : resolve()) }))
  }

  let running = false
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let abort: AbortController | undefined
  let wake: (() => void) | undefined
  const sleep = (ms: number) =>
    new Promise<void>((r) => {
      const t = setTimeout(r, ms)
      wake = () => {
        clearTimeout(t)
        r()
      }
    })

  // Подписка: поток NDJSON; обрыв или тишина дольше idleMs — переподключение с последнего id.
  async function listen(onLetters: (letters: PeerLetter[]) => void | Promise<void>) {
    while (running) {
      const wait = stats.blockedUntil - now()
      if (wait > 0) await sleep(wait)
      if (!running) return
      abort = new AbortController()
      let idle: ReturnType<typeof setTimeout> | undefined
      const touch = () => {
        if (idle) clearTimeout(idle)
        idle = setTimeout(() => abort?.abort(), idleMs)
      }
      try {
        touch()
        const res = await doFetch(`${server}/${topic}/json?since=${encodeURIComponent(since)}`, { headers: headers(), signal: abort.signal })
        if (!res.ok || !res.body) {
          backoff(res)
          continue
        }
        stats.connects++
        failures = 0
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          touch()
          buf += dec.decode(value, { stream: true })
          const cut = buf.lastIndexOf("\n")
          if (cut < 0) continue
          const got = takeLines(buf.slice(0, cut))
          buf = buf.slice(cut + 1)
          prune()
          if (got.length) await onLetters(got)
        }
        if (running) backoff() // сервер закрыл поток — переподключиться после короткой паузы
      } catch (e: any) {
        if (!running) return
        log(`ntfy: подписка — ${e?.name === "AbortError" ? "тишина, переподключение" : (e?.message ?? e)}`)
        backoff()
      } finally {
        if (idle) clearTimeout(idle)
      }
    }
  }

  function start(onLetters: (letters: PeerLetter[]) => void | Promise<void>) {
    if (running) return
    running = true
    void listen(onLetters)
    const tick = async () => {
      try {
        await flushOnce()
      } catch (e: any) {
        log(`ntfy: ${e?.message ?? e}`)
      }
      if (running) flushTimer = setTimeout(tick, Math.min(sendGapMs, 250))
    }
    void tick()
  }
  function stop() {
    running = false
    if (flushTimer) clearTimeout(flushTimer)
    abort?.abort()
    wake?.()
  }

  return { send, pollOnce, flushOnce, start, stop, stats, topic, pending: () => queue.length, cursor: () => since }
}
export type NtfyTransport = ReturnType<typeof createNtfyTransport>

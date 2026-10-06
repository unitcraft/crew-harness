// ТРАНСПОРТ ЧЕРЕЗ GITHUB ISSUE (прототип, 2026-10-06). Письма между машинами: один issue — один канал, комментарий —
// пачка писем. Модуль без зависимостей от core: доставку в ящик (postLetter) и источник исходящих подключает вызывающий.
//
// Комментарий: видимый текст для человека + скрытый маркер `<!-- peers:<base64 JSON> -->` с письмами и именем узла.
// Свои комментарии (тот же node) приёмник пропускает; правки комментариев не перечитываются (дедуп по id).
//
// Приём — опрос `GET …/issues/<n>/comments?since=<курсор>` с If-None-Match: ответ 304 не тратит лимит 5000/час,
// поэтому опрос раз в секунду почти бесплатен. Курсор (since) двигается только при новых комментариях — URL стабилен,
// ETag работает. since включителен: комментарий на границе приходит повторно и отсекается по id.
//
// Отправка — очередь: не чаще sendGapMs и не больше maxPerMinute комментариев в минуту (вторичный лимит GitHub на
// создание контента ~80/мин, 500/час). Накопившиеся письма уходят одним комментарием (до MAX_BODY символов).
// 403/429 — пауза по retry-after / x-ratelimit-reset, иначе минута; сетевые ошибки — экспоненциальная пауза до минуты.

import { execFileSync } from "node:child_process"

export type GhLetter = { id: string; from_role: string; to: string; text: string; time: number; [k: string]: unknown }
export type GhConfig = {
  repo: string // owner/name
  issue: number
  token: string
  node: string // имя этой машины/процесса: свои комментарии не читаем
  since?: string // ISO; по умолчанию — момент старта (историю канала не переигрываем)
  pollMs?: number
  sendGapMs?: number
  maxPerMinute?: number
  api?: string
  fetch?: typeof fetch
  now?: () => number
  log?: (line: string) => void
}
export type GhStats = { polls: number; notModified: number; posts: number; sent: number; received: number; errors: number; blockedUntil: number }

export const MAX_BODY = 60_000 // предел GitHub — 65 536 символов
const MARK_RE = /<!-- peers:([A-Za-z0-9+/=]+) -->/

export function encodeComment(node: string, letters: GhLetter[]): string {
  const human = letters.map((l) => `**${l.from_role} → ${l.to}**\n\n${l.text}`).join("\n\n---\n\n")
  const payload = Buffer.from(JSON.stringify({ v: 1, node, letters }), "utf8").toString("base64")
  return `${human}\n\n<!-- peers:${payload} -->`
}

export function decodeComment(body: string | undefined): { node: string; letters: GhLetter[] } | undefined {
  const m = body?.match(MARK_RE)
  if (!m) return undefined
  try {
    const d = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"))
    return d?.v === 1 && typeof d.node === "string" && Array.isArray(d.letters) ? { node: d.node, letters: d.letters } : undefined
  } catch {
    return undefined
  }
}

/** Токен: GITHUB_TOKEN / GH_TOKEN, иначе `gh auth token`. */
export function ghToken(): string | undefined {
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (env) return env
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined
  } catch {
    return undefined
  }
}

const nextLink = (link: string | null) => link?.match(/<([^>]+)>;\s*rel="next"/)?.[1]

export function createGhTransport(cfg: GhConfig) {
  const api = cfg.api ?? "https://api.github.com"
  const doFetch = cfg.fetch ?? fetch
  const now = cfg.now ?? Date.now
  const log = cfg.log ?? (() => {})
  const pollMs = cfg.pollMs ?? 1_000
  const sendGapMs = cfg.sendGapMs ?? 1_000
  const maxPerMinute = cfg.maxPerMinute ?? 60
  const base = `${api}/repos/${cfg.repo}/issues/${cfg.issue}/comments`

  let since = cfg.since ?? new Date(now()).toISOString()
  let etag: string | undefined
  let seen = new Set<number>()
  let failures = 0
  let lastPost = 0
  const posts: number[] = []
  const queue: { letter: GhLetter; done: (err?: Error) => void }[] = []
  const stats: GhStats = { polls: 0, notModified: 0, posts: 0, sent: 0, received: 0, errors: 0, blockedUntil: 0 }

  async function call(method: string, url: string, body?: unknown, ifNoneMatch?: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "opencode-peers",
    }
    if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch
    if (body !== undefined) headers["Content-Type"] = "application/json"
    return doFetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  }

  // Пауза после ошибки: лимиты GitHub — по его заголовкам, прочее — 2^n секунд, не больше минуты.
  function backoff(res?: Response) {
    stats.errors++
    failures++
    let wait = Math.min(60_000, 1_000 * 2 ** (failures - 1))
    if (res && (res.status === 403 || res.status === 429)) {
      const retry = Number(res.headers.get("retry-after"))
      const reset = Number(res.headers.get("x-ratelimit-reset"))
      if (retry > 0) wait = retry * 1_000
      else if (res.headers.get("x-ratelimit-remaining") === "0" && reset > 0) wait = Math.max(1_000, reset * 1_000 - now())
      else wait = 60_000
    }
    stats.blockedUntil = now() + wait
    log(`github: ${res ? `HTTP ${res.status}` : "сеть"} — пауза ${Math.round(wait / 1000)} с`)
  }
  const ok = () => {
    failures = 0
  }

  /** Один опрос: новые письма чужих узлов (по возрастанию времени комментариев). */
  async function pollOnce(): Promise<GhLetter[]> {
    if (now() < stats.blockedUntil) return []
    stats.polls++
    const first = `${base}?per_page=100&since=${encodeURIComponent(since)}`
    const out: GhLetter[] = []
    let maxUpdated = since
    let newEtag: string | undefined
    let url: string | undefined = first
    try {
      while (url) {
        const res = await call("GET", url, undefined, url === first ? etag : undefined)
        if (res.status === 304) {
          stats.notModified++
          ok()
          return out
        }
        if (!res.ok) {
          backoff(res)
          return out
        }
        if (url === first) newEtag = res.headers.get("etag") ?? undefined
        for (const c of (await res.json()) as { id: number; body?: string; updated_at: string }[]) {
          if (c.updated_at > maxUpdated) maxUpdated = c.updated_at
          if (seen.has(c.id)) continue
          seen.add(c.id)
          const d = decodeComment(c.body)
          if (!d || d.node === cfg.node) continue
          out.push(...d.letters)
        }
        url = nextLink(res.headers.get("link"))
      }
    } catch (e: any) {
      log(`github: опрос — ${e?.message ?? e}`)
      backoff()
      return out
    }
    ok()
    if (maxUpdated !== since) {
      since = maxUpdated // новый URL: старый ETag к нему не подходит; следующий запрос вернёт граничный комментарий
      etag = undefined
      seen = new Set([...seen].slice(-200)) // граничные id ещё нужны, остальное — не растить без конца
    } else etag = newEtag
    stats.received += out.length
    return out
  }

  /** Отправить накопленное одним комментарием, если позволяют паузы и лимит. Число ушедших писем. */
  async function flushOnce(): Promise<number> {
    const t = now()
    if (!queue.length || t < stats.blockedUntil || t - lastPost < sendGapMs) return 0
    while (posts.length && t - posts[0] > 60_000) posts.shift()
    if (posts.length >= maxPerMinute) return 0
    let n = 0
    let body = ""
    while (n < queue.length) {
      const next = encodeComment(cfg.node, queue.slice(0, n + 1).map((q) => q.letter))
      if (next.length > MAX_BODY) break
      body = next
      n++
    }
    if (n === 0) {
      const big = queue.shift()!
      big.done(new Error(`письмо ${big.letter.id} не помещается в комментарий (${MAX_BODY} символов)`))
      return 0
    }
    lastPost = t
    posts.push(t)
    let res: Response
    try {
      res = await call("POST", base, { body })
    } catch (e: any) {
      log(`github: отправка — ${e?.message ?? e}`)
      backoff()
      return 0
    }
    if (!res.ok) {
      backoff(res)
      return 0
    }
    ok()
    try {
      const c = (await res.json()) as { id?: number }
      if (typeof c.id === "number") seen.add(c.id)
    } catch {}
    stats.posts++
    stats.sent += n
    for (const q of queue.splice(0, n)) q.done()
    return n
  }

  /** В очередь; промис — когда письмо в issue (или не может туда попасть). */
  function send(letter: GhLetter): Promise<void> {
    return new Promise((resolve, reject) => queue.push({ letter, done: (err) => (err ? reject(err) : resolve()) }))
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  /** Цикл: опрос раз в pollMs, отправка — как только позволяют паузы. */
  function start(onLetters: (letters: GhLetter[]) => void | Promise<void>) {
    if (running) return
    running = true
    let nextPoll = 0
    const tick = async () => {
      try {
        await flushOnce()
        if (now() >= nextPoll) {
          nextPoll = now() + pollMs
          const got = await pollOnce()
          if (got.length) await onLetters(got)
        }
      } catch (e: any) {
        log(`github: ${e?.message ?? e}`)
      }
      if (running) timer = setTimeout(tick, Math.min(pollMs, sendGapMs, 250))
    }
    void tick()
  }
  function stop() {
    running = false
    if (timer) clearTimeout(timer)
  }

  return { send, pollOnce, flushOnce, start, stop, stats, pending: () => queue.length, cursor: () => since }
}
export type GhTransport = ReturnType<typeof createGhTransport>

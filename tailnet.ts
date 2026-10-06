// ТРАНСПОРТ ЧЕРЕЗ TAILSCALE (прототип, 2026-10-07). Письма — прямым HTTP между мостами машин одной сети Tailscale.
//
// Посредника нет: POST http://<машина>:<порт>/peers/v1/letters внутри сети (WireGuard шифрует сам). Отправителя
// называет не письмо, а сеть: приёмник спрашивает `tailscale whois <адрес>` и получает имя машины — подделать его
// нельзя, общий секрет не нужен. Неизвестная машина — 403; имя в теле не совпало с whois — 403.
//
// Ответ на пачку — решение по каждому письму ({id, why?}: why — отказ). Отказ возвращается отправителю сразу.
// Машина недоступна (сеть, 5xx) — письма ждут в очереди, повтор с паузой 1, 2, 4… до 60 с; старше maxAgeMs — ошибка.
//
// Сервер слушает только адрес Tailscale (`tailscale ip -4`), не 0.0.0.0: на VPS с публичным адресом порт не
// торчит в интернет. listenHost — для тестов и особых случаев.

import { execFile } from "node:child_process"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { PeerLetter } from "./ntfy.ts"

export const DEFAULT_PORT = 7647
export const LETTERS_PATH = "/peers/v1/letters"
const MAX_BODY = 4 * 1024 * 1024
const BATCH = 100

export type Verdict = { id: string; why?: string }
export type TailnetPeer = { host?: string; port?: number }
export type TailnetConfig = {
  node: string // имя этой машины в сети Tailscale (первая часть MagicDNS-имени)
  peers: Record<string, TailnetPeer> // машины, с которыми говорим; host по умолчанию — имя машины (MagicDNS)
  port?: number
  listenHost?: string // по умолчанию — `tailscale ip -4`
  cli?: string // путь к tailscale, по умолчанию из PATH
  whois?: (ip: string) => Promise<string | undefined>
  maxAgeMs?: number
  timeoutMs?: number
  fetch?: typeof fetch
  now?: () => number
  log?: (line: string) => void
}
export type TailnetStats = { posts: number; sent: number; refused: number; received: number; rejected: number; errors: number }
export type Receive = (letters: PeerLetter[], from: string) => Verdict[] | Promise<Verdict[]>

const run = (cli: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile(cli, args, { encoding: "utf8", windowsHide: true, timeout: 5_000 }, (err, out) => (err ? reject(err) : resolve(out))),
  )

/** Адрес этой машины в сети Tailscale. */
export async function tailscaleIp(cli = "tailscale"): Promise<string | undefined> {
  try {
    return (await run(cli, ["ip", "-4"])).split(/\s+/).find((x) => /^100\.\d+\.\d+\.\d+$/.test(x))
  } catch {
    return undefined
  }
}

/** Имя машины по адресу (из `tailscale whois --json`), с кэшем на минуту. */
export function tailscaleWhois(cli = "tailscale", now = Date.now) {
  const cache = new Map<string, { at: number; name?: string }>()
  return async (ip: string): Promise<string | undefined> => {
    const hit = cache.get(ip)
    if (hit && now() - hit.at < 60_000) return hit.name
    let name: string | undefined
    try {
      const j = JSON.parse(await run(cli, ["whois", "--json", ip]))
      name = String(j?.Node?.Name ?? j?.Node?.ComputedName ?? "").split(".")[0].toLowerCase() || undefined
    } catch {}
    cache.set(ip, { at: now(), name })
    return name
  }
}

type Item = { letter: PeerLetter; at: number; ok: (v: Verdict) => void; fail: (e: Error) => void }

export function createTailnetTransport(cfg: TailnetConfig) {
  const doFetch = cfg.fetch ?? fetch
  const now = cfg.now ?? Date.now
  const log = cfg.log ?? (() => {})
  const port = cfg.port ?? DEFAULT_PORT
  const maxAgeMs = cfg.maxAgeMs ?? 24 * 3_600_000
  const timeoutMs = cfg.timeoutMs ?? 10_000
  const whois = cfg.whois ?? tailscaleWhois(cfg.cli, now)
  const queues = new Map<string, Item[]>()
  const state = new Map<string, { busy: boolean; failures: number; blockedUntil: number }>()
  const stats: TailnetStats = { posts: 0, sent: 0, refused: 0, received: 0, rejected: 0, errors: 0 }
  const st = (node: string) => state.get(node) ?? (state.set(node, { busy: false, failures: 0, blockedUntil: 0 }), state.get(node)!)

  /** Одна попытка отправить очередь машины `node`. */
  async function flush(node: string) {
    const q = queues.get(node)
    const s = st(node)
    if (!q?.length || s.busy || now() < s.blockedUntil) return
    for (const it of q.filter((x) => now() - x.at > maxAgeMs)) {
      q.splice(q.indexOf(it), 1)
      it.fail(new Error(`машина ${node} недоступна дольше ${Math.round(maxAgeMs / 3_600_000)} ч`))
    }
    if (!q.length) return
    const peer = cfg.peers[node]
    const batch = q.slice(0, BATCH)
    s.busy = true
    try {
      const res = await doFetch(`http://${peer.host ?? node}:${peer.port ?? DEFAULT_PORT}${LETTERS_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node: cfg.node, letters: batch.map((x) => x.letter) }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`)
      const j: any = await res.json().catch(() => ({}))
      q.splice(0, batch.length)
      s.failures = 0
      stats.posts++
      if (!res.ok) {
        // 4xx — нас там не ждут (не та машина, нет в её списке): повтор не поможет
        for (const it of batch) it.fail(new Error(`машина ${node} отказала: ${j?.error ?? `HTTP ${res.status}`}`))
        return
      }
      const verdicts = new Map<string, Verdict>((Array.isArray(j?.verdicts) ? j.verdicts : []).map((v: Verdict) => [v.id, v]))
      for (const it of batch) {
        const v = verdicts.get(it.letter.id) ?? { id: it.letter.id, why: `машина ${node} не ответила по письму` }
        if (v.why) stats.refused++
        else stats.sent++
        it.ok(v)
      }
    } catch (e: any) {
      stats.errors++
      s.failures++
      const wait = Math.min(60_000, 1_000 * 2 ** (s.failures - 1))
      s.blockedUntil = now() + wait
      log(`tailnet: ${node} — ${e?.name === "TimeoutError" ? "нет ответа" : (e?.message ?? e)}; повтор через ${Math.round(wait / 1000)} с`)
    } finally {
      s.busy = false
    }
    if (q.length) void flush(node)
  }

  /** Письмо машине letter.to_node; промис — решение той машины (why — отказ) или ошибка, если не дойти. */
  function send(letter: PeerLetter): Promise<Verdict> {
    const node = String((letter as any).to_node ?? "")
    if (!cfg.peers[node]) return Promise.reject(new Error(`машина «${node}» не названа в nodes`))
    return new Promise((ok, fail) => {
      const q = queues.get(node) ?? (queues.set(node, []), queues.get(node)!)
      q.push({ letter, at: now(), ok, fail })
      void flush(node)
    })
  }

  /** Пройти все очереди (повторы после пауз). */
  async function flushAll() {
    await Promise.all([...queues.keys()].map(flush))
  }

  let server: Server | undefined
  let timer: ReturnType<typeof setInterval> | undefined

  async function handle(req: IncomingMessage, res: ServerResponse, onLetters: Receive) {
    const reply = (code: number, body: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" })
      res.end(JSON.stringify(body))
    }
    if (req.method !== "POST" || req.url !== LETTERS_PATH) return reply(404, { error: "not found" })
    const ip = String(req.socket.remoteAddress ?? "").replace(/^::ffff:/, "")
    const from = await whois(ip)
    if (!from || !cfg.peers[from]) {
      stats.rejected++
      log(`tailnet: ${ip} (${from ?? "не в сети Tailscale"}) — не из nodes, отказ`)
      return reply(403, { error: `машина ${from ?? ip} не названа в nodes у ${cfg.node}` })
    }
    let size = 0
    const chunks: Buffer[] = []
    for await (const c of req) {
      size += c.length
      if (size > MAX_BODY) return reply(413, { error: "пачка больше 4 МБ" })
      chunks.push(c)
    }
    let body: any
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    } catch {
      return reply(400, { error: "не JSON" })
    }
    if (body?.node !== from) {
      stats.rejected++
      return reply(403, { error: `имя ${body?.node} не совпадает с сетью (${from})` })
    }
    const letters: PeerLetter[] = Array.isArray(body.letters) ? body.letters : []
    stats.received += letters.length
    reply(200, { verdicts: await onLetters(letters, from) })
  }

  /** Слушать адрес Tailscale и отправлять очереди. */
  async function start(onLetters: Receive) {
    if (server) return
    const host = cfg.listenHost ?? (await tailscaleIp(cfg.cli))
    if (!host) {
      log("tailnet: адреса Tailscale нет (tailscale ip -4) — приём выключен, отправка работает")
    } else {
      server = createServer((req, res) =>
        void handle(req, res, onLetters).catch((e) => {
          log(`tailnet: приём — ${e?.message ?? e}`)
          if (!res.headersSent) res.writeHead(500).end()
        }),
      )
      server.on("error", (e: any) => log(`tailnet: сервер ${host}:${port} — ${e?.message ?? e}`))
      await new Promise<void>((r) => server!.listen(port, host, () => r()))
      log(`tailnet: слушаю ${host}:${port} как ${cfg.node}`)
    }
    timer = setInterval(() => void flushAll(), 1_000)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
    server?.close()
    server?.closeAllConnections?.()
    server = undefined
  }

  return { send, flushAll, start, stop, stats, pending: () => [...queues.values()].reduce((n, q) => n + q.length, 0), address: () => server?.address() }
}
export type TailnetTransport = ReturnType<typeof createTailnetTransport>

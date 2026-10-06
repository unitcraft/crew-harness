// ДРУГИЕ МАШИНЫ (прототип, 2026-10-06). Письма проектам на других машинах: через сеть Tailscale (tailnet.ts) или
// через канал ntfy (ntfy.ts).
//
// Настройки машины — <ящик>/remote.json (не в репозитории). Tailscale — машины по именам, права у каждой своя:
//   { "node": "home", "transport": "tailnet",
//     "nodes": { "vps-1": { "projects": ["site"], "may_write": ["nova.integrator"] } } }
//   nodes — машины, с которыми говорим (имя — как в сети Tailscale; host/port — если не MagicDNS-имя и не 7647);
//   projects — её проекты (crew_send роли такого проекта уходит ей); may_write — куда ей можно писать здесь:
//   `<проект>.<роль>`, `<проект>.*` или `*`. Отправителя называет сеть (whois), не письмо.
// ntfy — общий канал с общим секретом (все машины канала равны, отправитель не проверяется):
//   { "node": "home", "secret": "<ntfySecret()>", "projects": ["site"], "server": "...", "token": "..." }
//
// Сессия другой машины (from_session пришедшего письма) запоминается вместе с машиной — ответ ей уходит туда же.
//
// МОСТ — один процесс на машину (remote/bridge.lock: pid и отметка жизни; умер или молчит LOCK_STALE_MS — берёт
// следующий): отправляет outbox, принимает письма. Приёмник берёт:
//   роль `<проект>.<роль>` — проект местный (не из проектов других машин), его inbound пускает (none — нет,
//     integrator — только интегратору, any — всем), и для Tailscale — она в may_write машины-отправителя;
//   сессию — только местную и только ту, что сама писала этой машине (ответы, не холодные письма).
// Tailscale: отказ возвращается сразу, отправителю — служебное письмо. ntfy: канал общий, чужое молча пропускается,
// отказ остаётся в журнале получателя. Письмо, которое не ушло, — в remote/failed/, отправителю — служебное письмо.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from "node:fs"
import path from "node:path"
import { createNtfyTransport, type PeerLetter } from "./ntfy.ts"
import { BASE } from "./paths.ts"
import { createTailnetTransport, type Verdict } from "./tailnet.ts"

export const REMOTE_FILE = path.join(BASE, "remote.json")
export const REMOTE_DIR = path.join(BASE, "remote")
export const OUTBOX = path.join(REMOTE_DIR, "outbox")
export const FAILED = path.join(REMOTE_DIR, "failed")
const SESSIONS_FILE = path.join(REMOTE_DIR, "sessions.json") // сессия другой машины -> { node, at }
const ASKERS_FILE = path.join(REMOTE_DIR, "askers.json") // местная сессия -> { машина, которой писала: at }
const LOCK_FILE = path.join(REMOTE_DIR, "bridge.lock")
export const LOCK_STALE_MS = 15_000
const KEEP_MS = 7 * 86_400_000
const ANY_NODE = "*" // ntfy: машина-получатель неизвестна

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/
const PROJ_RE = /^[a-z0-9][a-z0-9-]{0,40}$/
const WRITE_RE = /^(\*|[a-z0-9][a-z0-9-]{0,40}\.(\*|[a-z][a-z0-9-]{0,40}))$/
export type RemoteNode = { host?: string; port?: number; projects: string[]; may_write: string[] }
export type RemoteConfig =
  | { node: string; transport: "tailnet"; port?: number; listen?: string; cli?: string; nodes: Record<string, RemoteNode> }
  | { node: string; transport: "ntfy"; secret: string; server?: string; token?: string; projects: string[] }
export type RemoteRoute = { cfg: RemoteConfig; to_node: string }
type Addr = { kind: "session"; session: string } | { kind: "all"; project: string } | { kind: "role"; project: string; role: string }

const readJson = <T>(file: string): T | undefined => {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
}
const writeJson = (file: string, value: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 1))
  renameSync(tmp, file)
}
const strList = (x: any, re: RegExp) => Array.isArray(x) && x.every((p: any) => typeof p === "string" && re.test(p))

/** Что не так с remote.json (пусто — годится). */
export function remoteProblems(j: any): string[] {
  const out: string[] = []
  if (!j || typeof j !== "object") return ["не объект JSON"]
  if (typeof j.node !== "string" || !NAME_RE.test(j.node)) out.push("node: имя этой машины — строчные латинские буквы, цифры, дефис")
  const transport = j.transport ?? "ntfy"
  if (transport === "tailnet") {
    if (!j.nodes || typeof j.nodes !== "object" || !Object.keys(j.nodes).length) out.push("nodes: машины сети Tailscale, хотя бы одна")
    else
      for (const [name, n] of Object.entries<any>(j.nodes)) {
        if (!NAME_RE.test(name)) out.push(`nodes.${name}: имя машины — как в сети Tailscale`)
        if (name === j.node) out.push(`nodes.${name}: это сама машина`)
        if (!strList(n?.projects ?? [], PROJ_RE)) out.push(`nodes.${name}.projects: список проектов той машины`)
        if (!strList(n?.may_write ?? [], WRITE_RE)) out.push(`nodes.${name}.may_write: «проект.роль», «проект.*» или «*»`)
        if (n?.host !== undefined && typeof n.host !== "string") out.push(`nodes.${name}.host: строка`)
        if (n?.port !== undefined && !Number.isInteger(n.port)) out.push(`nodes.${name}.port: число`)
      }
    if (j.port !== undefined && !Number.isInteger(j.port)) out.push("port: число")
  } else if (transport === "ntfy") {
    if (typeof j.secret !== "string" || j.secret.length < 16) out.push("secret: не короче 16 символов (новый — ntfySecret() из ntfy.ts)")
    if (!strList(j.projects, PROJ_RE)) out.push("projects: список проектов других машин")
    if (j.server !== undefined && (typeof j.server !== "string" || !/^https?:\/\//.test(j.server))) out.push("server: адрес http(s)")
    if (j.token !== undefined && typeof j.token !== "string") out.push("token: строка")
  } else out.push(`transport: tailnet или ntfy, не «${transport}»`)
  return out
}

let cache: { mtime: number; cfg?: RemoteConfig } | undefined
/** Настройки другим машинам; нет файла или он с ошибками — undefined (мост молчит, письма идут как раньше). */
export function loadRemote(): RemoteConfig | undefined {
  let mtime: number
  try {
    mtime = statSync(REMOTE_FILE).mtimeMs
  } catch {
    cache = undefined
    return undefined
  }
  if (cache?.mtime === mtime) return cache.cfg
  const j = readJson<any>(REMOTE_FILE)
  let cfg: RemoteConfig | undefined
  if (j && !remoteProblems(j).length)
    cfg =
      j.transport === "tailnet"
        ? {
            node: j.node,
            transport: "tailnet",
            port: j.port,
            listen: j.listen,
            cli: j.cli,
            nodes: Object.fromEntries(Object.entries<any>(j.nodes).map(([k, n]) => [k, { host: n.host, port: n.port, projects: n.projects ?? [], may_write: n.may_write ?? [] }])),
          }
        : { node: j.node, transport: "ntfy", secret: j.secret, server: j.server, token: j.token, projects: j.projects }
  cache = { mtime, cfg }
  return cfg
}

/** Машина, где живёт проект (ntfy — «*»: канал общий). */
export function nodeOfProject(cfg: RemoteConfig, project: string): string | undefined {
  if (cfg.transport === "ntfy") return cfg.projects.includes(project) ? ANY_NODE : undefined
  return Object.entries(cfg.nodes).find(([, n]) => n.projects.includes(project))?.[0]
}

const fresh = <T>(m: Record<string, T>, at: (v: T) => number, now: number) => Object.fromEntries(Object.entries(m).filter(([, v]) => now - at(v) < KEEP_MS))

export const remoteSessions = () => readJson<Record<string, { node: string; at: number }>>(SESSIONS_FILE) ?? {}
export const remoteAskers = () => readJson<Record<string, Record<string, number>>>(ASKERS_FILE) ?? {}

/** Адрес ведёт на другую машину? Тогда — настройки и машина-получатель. */
export function remoteRoute(addr: Addr, isLocalSession: (s: string) => boolean): RemoteRoute | undefined {
  const cfg = loadRemote()
  if (!cfg) return undefined
  if (addr.kind === "session") {
    if (isLocalSession(addr.session)) return undefined
    const known = remoteSessions()[addr.session]
    if (!known) return undefined
    if (cfg.transport === "ntfy") return { cfg, to_node: ANY_NODE }
    return cfg.nodes[known.node] ? { cfg, to_node: known.node } : undefined
  }
  const to_node = nodeOfProject(cfg, addr.project)
  return to_node ? { cfg, to_node } : undefined
}

/** Письмо на другую машину: в outbox; отправитель запоминается — той машине можно ему отвечать. */
export function queueRemote(letter: PeerLetter & { from_session: string }, route: RemoteRoute, now = Date.now()) {
  writeJson(path.join(OUTBOX, `${letter.id}.json`), { ...letter, from_node: route.cfg.node, to_node: route.to_node })
  const askers = fresh(remoteAskers(), (v) => Math.max(0, ...Object.values(v)), now)
  writeJson(ASKERS_FILE, { ...askers, [letter.from_session]: { ...(askers[letter.from_session] ?? {}), [route.to_node]: now } })
}

export type RemoteTransport = {
  send: (l: PeerLetter) => Promise<Verdict | void>
  start: (on: (ls: PeerLetter[], from?: string) => Verdict[]) => void | Promise<void>
  stop: () => void
}
export type BridgeDeps = {
  deliver: (to: string, letter: any) => void // postLetter
  exists: (to: string, id: string) => boolean // letterExists
  isLocalSession: (s: string) => boolean
  isLocalProject: (p: string) => boolean
  inboundOf: (project: string) => "integrator" | "any" | "none"
  notify: (session: string, text: string) => void
  log: (line: string) => void
  makeTransport?: (cfg: RemoteConfig) => RemoteTransport
  pid?: number
  now?: () => number
  pidAlive?: (pid: number) => boolean
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e: any) {
    return e?.code === "EPERM"
  }
}

const mayWrite = (rules: string[], key: string) => rules.some((r) => r === "*" || r === key || (r.endsWith(".*") && key.startsWith(r.slice(0, -1))))

/**
 * Пустая строка — письмо для этой машины; иначе — почему нет. «-» — не наше (ntfy: канал общий, молча мимо).
 * from — машина-отправитель, названная сетью (Tailscale); у ntfy её нет.
 */
export function refusal(l: any, cfg: RemoteConfig, deps: Pick<BridgeDeps, "isLocalSession" | "isLocalProject" | "inboundOf">, from?: string): string {
  const to = String(l?.to ?? "")
  if (!l?.id || !to || typeof l.text !== "string" || typeof l.from_session !== "string") return "письмо без id, адресата или текста"
  if (to.startsWith("ses_")) {
    if (!deps.isLocalSession(to)) return from ? `сессии ${to} на машине ${cfg.node} нет` : "-"
    const asked = remoteAskers()[to] ?? {}
    return asked[from ?? ANY_NODE] || (!from && Object.keys(asked).length) ? "" : `сессия ${to} не писала ${from ? `машине ${from}` : "на другие машины"} — холодные письма сессиям не принимаются`
  }
  const dot = to.indexOf(".")
  if (dot <= 0) return from ? `адрес ${to}: нужен «проект.роль» или id сессии` : "-"
  const project = to.slice(0, dot)
  const role = to.slice(dot + 1)
  if (nodeOfProject(cfg, project) || !deps.isLocalProject(project)) return from ? `проекта ${project} на машине ${cfg.node} нет` : "-"
  if (from && cfg.transport === "tailnet" && !mayWrite(cfg.nodes[from]?.may_write ?? [], to)) return `машине ${from} писать в ${to} нельзя (may_write у ${cfg.node})`
  const inbound = deps.inboundOf(project)
  if (inbound === "none") return `проект ${project} не принимает писем извне (inbound: none)`
  if (inbound === "integrator" && role !== "integrator") return `в ${project} извне — только интегратору (inbound: integrator)`
  return ""
}

export function createRemoteBridge(deps: BridgeDeps) {
  const pid = deps.pid ?? process.pid
  const now = deps.now ?? Date.now
  const pidAlive = deps.pidAlive ?? alive
  const makeTransport =
    deps.makeTransport ??
    ((cfg: RemoteConfig): RemoteTransport =>
      cfg.transport === "tailnet"
        ? createTailnetTransport({ node: cfg.node, peers: cfg.nodes, port: cfg.port, listenHost: cfg.listen, cli: cfg.cli, log: deps.log })
        : createNtfyTransport({ secret: cfg.secret, server: cfg.server, token: cfg.token, node: cfg.node, log: deps.log }))
  let transport: RemoteTransport | undefined
  let key = ""
  let inflight = new Set<string>()
  let watcher: ReturnType<typeof watch> | undefined
  let warned = ""

  function halt() {
    transport?.stop()
    transport = undefined
    key = ""
    inflight = new Set()
    try {
      watcher?.close()
    } catch {}
    watcher = undefined
  }

  /** Входящие: каждое письмо — в ящик или отказ. from — машина, названная сетью (Tailscale). */
  function receive(letters: PeerLetter[], from?: string): Verdict[] {
    const cfg = loadRemote()
    if (!cfg) return letters.map((l: any) => ({ id: String(l?.id), why: "мост выключен" }))
    const out: Verdict[] = []
    for (const l of letters as any[]) {
      if (from) l.from_node = from // имя машины — от сети, не из письма
      const why = refusal(l, cfg, deps, from)
      if (why === "-") continue
      out.push(why ? { id: String(l?.id), why } : { id: l.id })
      if (why) {
        deps.log(`remote: from ${l?.from_node ?? "?"} ${l?.from_role ?? "?"} -> ${l?.to ?? "?"} refused: ${why}`)
        continue
      }
      if (typeof l.from_node === "string") writeJson(SESSIONS_FILE, { ...fresh(remoteSessions(), (v) => v.at, now()), [l.from_session]: { node: l.from_node, at: now() } })
      if (deps.exists(l.to, l.id)) continue
      deps.deliver(l.to, l)
      deps.log(`remote: ${l.from_role}@${l.from_node ?? "?"} -> ${l.to}`)
    }
    return out
  }

  /** Отправить всё из outbox, что ещё не в пути. */
  function drain() {
    if (!transport) return
    const t = transport
    let files: string[] = []
    try {
      files = readdirSync(OUTBOX).filter((f) => f.endsWith(".json") && !inflight.has(f))
    } catch {}
    const tell = (l: any, text: string) => {
      if (typeof l.from_session === "string" && l.from_session.startsWith("ses_")) deps.notify(l.from_session, text)
    }
    for (const f of files.sort()) {
      const file = path.join(OUTBOX, f)
      const l = readJson<any>(file)
      if (!l?.id) {
        mkdirSync(FAILED, { recursive: true })
        try {
          renameSync(file, path.join(FAILED, f))
        } catch {}
        continue
      }
      inflight.add(f)
      const mine = inflight
      t.send(l)
        .then((v) => {
          rmSync(file, { force: true })
          if (v?.why) {
            deps.log(`remote: ${l.id} -> ${l.to}@${l.to_node} refused there: ${v.why}`)
            tell(l, `Письмо для ${l.to} (машина ${l.to_node}) не принято: ${v.why}.`)
          }
        })
        .catch((e: any) => {
          mkdirSync(FAILED, { recursive: true })
          try {
            renameSync(file, path.join(FAILED, f))
          } catch {}
          deps.log(`remote: ${l.id} -> ${l.to} failed: ${e?.message ?? e}`)
          tell(l, `Письмо для ${l.to} (другая машина) не ушло: ${e?.message ?? e}.`)
        })
        .finally(() => mine.delete(f))
    }
  }

  /** Шаг прохода: держать замок моста, поднять транспорт, отправить outbox. */
  async function step() {
    const cfg = loadRemote()
    if (!cfg) {
      if (existsSync(REMOTE_FILE)) {
        const problems = remoteProblems(readJson(REMOTE_FILE)).join("; ") || "файл не читается"
        if (warned !== problems) deps.log(`remote: ${REMOTE_FILE} is ignored: ${problems}`)
        warned = problems
      }
      halt()
      return
    }
    const lock = readJson<{ pid: number; at: number }>(LOCK_FILE)
    if (lock && lock.pid !== pid && pidAlive(lock.pid) && now() - lock.at < LOCK_STALE_MS) {
      halt()
      return
    }
    writeJson(LOCK_FILE, { pid, at: now() })
    if (readJson<{ pid: number }>(LOCK_FILE)?.pid !== pid) {
      halt()
      return
    }
    const k = JSON.stringify(cfg)
    if (k !== key) {
      halt()
      key = k
      transport = makeTransport(cfg)
      await transport.start(receive)
      mkdirSync(OUTBOX, { recursive: true })
      try {
        let soon: any
        watcher = watch(OUTBOX, () => {
          clearTimeout(soon)
          soon = setTimeout(drain, 50)
        })
      } catch {}
      deps.log(`remote: bridge up (${cfg.transport}), node ${cfg.node}, pid ${pid}`)
    }
    drain()
  }

  function stop() {
    halt()
    if (readJson<{ pid: number }>(LOCK_FILE)?.pid === pid) rmSync(LOCK_FILE, { force: true })
  }

  return { step, stop, receive, leading: () => !!transport }
}

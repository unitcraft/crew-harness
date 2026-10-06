// ДРУГИЕ МАШИНЫ (прототип, 2026-10-06). Письма проектам на других машинах — через канал ntfy (ntfy.ts).
//
// Настройки машины — <ящик>/remote.json (секрет не лежит в репозитории):
//   { "node": "home", "secret": "<ntfySecret()>", "server": "https://ntfy.sh", "token": "...", "projects": ["site"] }
// projects — проекты ДРУГИХ машин канала: peer_send роли такого проекта кладёт письмо не в ящик, а в remote/outbox/.
// Сессия другой машины (from_session пришедшего письма) запоминается — ответ ей уходит туда же.
//
// МОСТ — один процесс на машину (remote/bridge.lock: pid и отметка жизни; умер или молчит LOCK_STALE_MS — берёт
// следующий): отправляет outbox, принимает канал. Канал общий для всех машин, поэтому приёмник берёт только своё:
//   роль `<проект>.<роль>` — проект местный и не из projects; пропуск — по inbound проекта (none — нет, integrator —
//     только интегратору, any — всем), как для писем из другого проекта;
//   сессия — только местная и только та, что сама писала на другие машины (ответы, не холодные письма).
// Не ушло (письмо больше канала) — письмо в remote/failed/, отправителю служебное письмо.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from "node:fs"
import path from "node:path"
import { createNtfyTransport, type PeerLetter } from "./ntfy.ts"
import { BASE } from "./paths.ts"

export const REMOTE_FILE = path.join(BASE, "remote.json")
export const REMOTE_DIR = path.join(BASE, "remote")
export const OUTBOX = path.join(REMOTE_DIR, "outbox")
export const FAILED = path.join(REMOTE_DIR, "failed")
const SESSIONS_FILE = path.join(REMOTE_DIR, "sessions.json") // сессия другой машины -> { node, at }
const ASKERS_FILE = path.join(REMOTE_DIR, "askers.json") // местная сессия, писавшая на другие машины -> at
const LOCK_FILE = path.join(REMOTE_DIR, "bridge.lock")
export const LOCK_STALE_MS = 15_000
const KEEP_MS = 7 * 86_400_000

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,40}$/
export type RemoteConfig = { node: string; secret: string; server?: string; token?: string; projects: string[] }
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

/** Что не так с remote.json (пусто — годится). */
export function remoteProblems(j: any): string[] {
  const out: string[] = []
  if (!j || typeof j !== "object") return ["не объект JSON"]
  if (typeof j.node !== "string" || !NAME_RE.test(j.node)) out.push("node: имя машины — строчные латинские буквы, цифры, дефис")
  if (typeof j.secret !== "string" || j.secret.length < 16) out.push("secret: не короче 16 символов (новый — ntfySecret() из ntfy.ts)")
  if (!Array.isArray(j.projects) || !j.projects.every((p: any) => typeof p === "string" && NAME_RE.test(p))) out.push("projects: список проектов других машин")
  if (j.server !== undefined && (typeof j.server !== "string" || !/^https?:\/\//.test(j.server))) out.push("server: адрес http(s)")
  if (j.token !== undefined && typeof j.token !== "string") out.push("token: строка")
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
  const cfg = j && !remoteProblems(j).length ? { node: j.node, secret: j.secret, server: j.server, token: j.token, projects: j.projects } : undefined
  cache = { mtime, cfg }
  return cfg
}

const fresh = <T extends { at: number } | number>(m: Record<string, T>, now: number) =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => now - (typeof v === "number" ? v : v.at) < KEEP_MS))

export const remoteSessions = () => readJson<Record<string, { node: string; at: number }>>(SESSIONS_FILE) ?? {}
export const remoteAskers = () => readJson<Record<string, number>>(ASKERS_FILE) ?? {}

/** Адрес ведёт на другую машину? Тогда — её настройки. */
export function remoteRoute(addr: Addr, isLocalSession: (s: string) => boolean): RemoteConfig | undefined {
  const cfg = loadRemote()
  if (!cfg) return undefined
  if (addr.kind === "session") return !isLocalSession(addr.session) && remoteSessions()[addr.session] ? cfg : undefined
  return cfg.projects.includes(addr.project) ? cfg : undefined
}

/** Письмо на другую машину: в outbox; отправитель запоминается — ему можно отвечать. */
export function queueRemote(letter: PeerLetter & { from_session: string }, cfg: RemoteConfig, now = Date.now()) {
  writeJson(path.join(OUTBOX, `${letter.id}.json`), { ...letter, from_node: cfg.node })
  writeJson(ASKERS_FILE, { ...fresh(remoteAskers(), now), [letter.from_session]: now })
}

export type RemoteTransport = { send: (l: PeerLetter) => Promise<void>; start: (on: (ls: PeerLetter[]) => void | Promise<void>) => void; stop: () => void }
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

/** Пустая строка — письмо для этой машины; иначе — почему нет («-» — не наше, молча). */
export function refusal(l: any, cfg: RemoteConfig, deps: Pick<BridgeDeps, "isLocalSession" | "isLocalProject" | "inboundOf">): string {
  const to = String(l?.to ?? "")
  if (!l?.id || !to || typeof l.text !== "string" || typeof l.from_session !== "string") return "письмо без id, адресата или текста"
  if (to.startsWith("ses_")) {
    if (!deps.isLocalSession(to)) return "-"
    return remoteAskers()[to] ? "" : `сессия ${to} не писала на другие машины — холодные письма сессиям не принимаются`
  }
  const dot = to.indexOf(".")
  if (dot <= 0) return "-"
  const project = to.slice(0, dot)
  const role = to.slice(dot + 1)
  if (cfg.projects.includes(project) || !deps.isLocalProject(project)) return "-"
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
    deps.makeTransport ?? ((cfg: RemoteConfig) => createNtfyTransport({ secret: cfg.secret, server: cfg.server, token: cfg.token, node: cfg.node, log: deps.log }))
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

  function receive(letters: PeerLetter[]) {
    const cfg = loadRemote()
    if (!cfg) return
    for (const l of letters as any[]) {
      const why = refusal(l, cfg, deps)
      if (why === "-") continue
      if (why) {
        deps.log(`remote: from ${l?.from_node ?? "?"} ${l?.from_role ?? "?"} -> ${l?.to ?? "?"} refused: ${why}`)
        continue
      }
      if (typeof l.from_node === "string") writeJson(SESSIONS_FILE, { ...fresh(remoteSessions(), now()), [l.from_session]: { node: l.from_node, at: now() } })
      if (deps.exists(l.to, l.id)) continue
      deps.deliver(l.to, l)
      deps.log(`remote: ${l.from_role}@${l.from_node ?? "?"} -> ${l.to}`)
    }
  }

  /** Отправить всё из outbox, что ещё не в пути. */
  function drain() {
    if (!transport) return
    const t = transport
    let files: string[] = []
    try {
      files = readdirSync(OUTBOX).filter((f) => f.endsWith(".json") && !inflight.has(f))
    } catch {}
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
        .then(() => rmSync(file, { force: true }))
        .catch((e: any) => {
          mkdirSync(FAILED, { recursive: true })
          try {
            renameSync(file, path.join(FAILED, f))
          } catch {}
          deps.log(`remote: ${l.id} -> ${l.to} failed: ${e?.message ?? e}`)
          if (typeof l.from_session === "string" && l.from_session.startsWith("ses_"))
            deps.notify(l.from_session, `Письмо для ${l.to} (другая машина) не ушло: ${e?.message ?? e}. Сократи его или передай иначе.`)
        })
        .finally(() => mine.delete(f))
    }
  }

  /** Шаг прохода: держать замок моста, поднять канал, отправить outbox. */
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
    const k = JSON.stringify([cfg.node, cfg.secret, cfg.server, cfg.token])
    if (k !== key) {
      halt()
      key = k
      transport = makeTransport(cfg)
      transport.start(receive)
      mkdirSync(OUTBOX, { recursive: true })
      try {
        let soon: any
        watcher = watch(OUTBOX, () => {
          clearTimeout(soon)
          soon = setTimeout(drain, 50)
        })
      } catch {}
      deps.log(`remote: bridge up, node ${cfg.node}, pid ${pid}`)
    }
    drain()
  }

  function stop() {
    halt()
    if (readJson<{ pid: number }>(LOCK_FILE)?.pid === pid) rmSync(LOCK_FILE, { force: true })
  }

  return { step, stop, leading: () => !!transport }
}

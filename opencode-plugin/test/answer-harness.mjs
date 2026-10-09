// Shared set-up of the question-answering tests (task 007; node >= 24): a throwaway project, a real sqlite database of OpenCode with
// the tables `session_v2` and `session_message` (as much as the plugin reads), a fake OpenCode host over the real plugin modules,
// one window with the tabs of the sessions, and helpers that write the turns of a session as OpenCode records them.
// Not a test itself (no `.test.` in the name: `npm test` does not take it). The plugin code comes from CREW_PLUGIN_DIR (a copy with
// stubs, the proof of red) or from the folder above this one; the modules are loaded by file URL (a bare Windows path is not loadable).
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const PLUGIN = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
export const load = (f) => import(pathToFileURL(path.join(PLUGIN, f)).href)

/**
 * @param prefix temp folder prefix
 * @param opts {settings, sessions, window, plugin}
 *   settings: the project settings file content (written to proj/.opencode/crew-harness.json; setSettings() rewrites it)
 *   sessions: ids of the sessions that get a row in `session_v2` (the first one is the tab of the owner); default four
 *   window: the sessions with a tab in the window (default: all of them); false -- no window at all
 *   plugin: false -- the plugin is not started (the pure modules only); the host objects are still created
 */
export async function harness(prefix, opts = {}) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  process.env.XDG_DATA_HOME = tmp
  process.env.CREW_HARNESS_POLL_MS = "100"
  process.env.CREW_HARNESS_STATUS_MS = "100"
  process.env.CREW_HARNESS_FLOW_MS = "200"
  process.env.CREW_HARNESS_LEFT_MS = "3600000"
  process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
  process.env.CREW_HARNESS_DB = path.join(tmp, "opencode.db")
  delete process.env.CREW_HARNESS_PRESENCE
  const proj = path.join(tmp, "proj")
  mkdirSync(path.join(proj, ".opencode"), { recursive: true })
  const settingsFile = path.join(proj, ".opencode", "crew-harness.json")
  const setSettings = (s) => writeFileSync(settingsFile, JSON.stringify(s))
  setSettings(opts.settings ?? {})

  const sids = opts.sessions ?? ["sesOWNER1", "sesTASK01", "sesTASK02", "sesREV001"]
  const db = new DatabaseSync(process.env.CREW_HARNESS_DB)
  db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
  db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
  for (const s of sids) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, proj, s)
  let seq = 0
  const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))

  const core = await load("core.ts")
  const status = await load("status.ts")
  const tasks = await load("tasks.ts")
  const mod = await load("index.ts")
  const hooks = {}
  const tools = {}
  const events = {}
  const delivered = []
  const ctx = {
    location: { directory: proj },
    options: { projects: { proj } },
    session: {
      get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
      prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
      synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
      create: async (req) => ({ id: req.id }),
      update: async () => {},
      hook: async (name, cb) => (hooks[name] = cb),
    },
    tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
    events: { on: async (name, cb) => (events[name] = cb) },
  }
  const stop = opts.plugin === false ? undefined : await mod.default.setup(ctx)

  const WPID = 700000 + Math.floor(Math.random() * 90000)
  const tabIds = opts.window === false ? [] : (opts.window ?? sids)
  mkdirSync(core.WINDOWS, { recursive: true })
  const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: tabIds.map((sessionID, i) => ({ sessionID, active: i === 0, busy: false })) }))
  if (tabIds.length) beat()
  const heart = tabIds.length ? setInterval(beat, 300) : undefined

  const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms))
  const until = async (cond, ms = 8_000) => {
    for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
    return cond()
  }
  const readDir = (dir) => {
    try {
      return readdirSync(dir).map((f) => ({ file: f, ...JSON.parse(readFileSync(path.join(dir, f), "utf8")) }))
    } catch {
      return []
    }
  }
  const H = {
    tmp, proj, db, msg, core, status, tasks, mod, hooks, tools, events, delivered, wait, until, WPID, sids, setSettings, settingsFile, beat,
    call: async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content,
    cfg: () => core.loadConfig(proj),
    /** the card of a session with a tab: the request that opened the turn, as OpenCode does it */
    open: (sid) => hooks.context({ sessionID: sid, system: [], model: { id: "opus", providerID: "claude-code" } }),
    /**
     * a turn of a session as OpenCode records it: the request (busy card), the user row, the assistant text, the idle row and the
     * idle event. user: false -- the turn is not started by the owner's words but by a letter of the plugin
     */
    turn: async (sid, text, { user = "сделай", tool = false, at = Date.now(), event = true } = {}) => {
      await H.open(sid)
      if (user) msg(sid, "user", { text: user }, at - 2)
      msg(sid, "assistant", { content: [...(tool ? [{ type: "tool", name: "bash" }] : []), { type: "text", text }] }, at - 1)
      msg(sid, "idle", { outcome: "succeeded" }, at)
      db.prepare("update session_v2 set time_idle = ? where id = ?").run(at, sid)
      if (event) await events["session.idle"]({ properties: { sessionID: sid } })
    },
    /** a row of the owner after the turn ended */
    ownerSays: (sid, text, at = Date.now()) => msg(sid, "user", { text }, at),
    /** a card of a task session (spawned by `by`) with an open obligation to `by` */
    taskSession: (sid, by = "sesOWNER1", qid = "qTASK") => {
      const t = Date.now()
      core.saveCard({ session: sid, role: "worker", auto: false, title: sid, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: t, spawned: { by, task: "задача", tier: "light", status: "running", at: t - 120_000, qid } })
      core.addObligation(sid, { qid, from_session: by, from_role: "proj.integrator", at: t - 120_000, nudges: 0 })
    },
    notices: () => readDir(path.join(core.NOTICES, String(WPID))),
    letters: (to) => ["inbox", "read", "delivering"].flatMap((d) => (d === "delivering" ? [] : readDir(path.join(core.BASE, d, to)))),
    close: () => {
      if (heart) clearInterval(heart)
      stop?.()
      try {
        db.close()
      } catch {}
      try {
        rmSync(tmp, { recursive: true, force: true })
      } catch {}
    },
  }
  return H
}

/** the cell reporter shared by the question-answering tests */
export function reporter(name) {
  let fail = 0
  return {
    cell: (title, ok, detail) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${title}${ok ? "" : " :: " + detail}`)
      if (!ok) fail++
    },
    skip: (title, why) => console.log(`skip ${title}: ${why}`),
    done: (H) => {
      H?.close()
      console.log(fail ? `${name}: FAIL ${fail}` : `${name} ok`)
      process.exit(fail ? 1 : 0)
    },
  }
}

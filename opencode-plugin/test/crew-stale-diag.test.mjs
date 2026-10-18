// Self-test of the diagnostics of a stuck "busy" tab (node >= 24):  node test/crew-stale-diag.test.mjs
// The window says the turn is running (tab busy), the database has no open turn and the last turn ended long ago. The plugin
// already turns that into "waits for you"; now it also writes one line with the facts when the state starts and one when it
// ends, so that the pattern (after a restart? after Esc? after a night?) can be read from the log.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-stalediag-"))
process.env.XDG_DATA_HOME = tmp
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp // the plugin log lives in os.tmpdir(): a log of its own per run, not the one other parallel runs write (task 085)
process.env.CREW_HARNESS_POLL_MS = "100"
delete process.env.CREW_HARNESS_PRESENCE
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), "{}")

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, at, data = {}) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
const S = "sesSTALE01"
const now = Date.now()
db.prepare("insert into session_v2 values (?, ?, ?, null, null, ?, ?, null)").run(S, proj, S, now - 20 * 60_000, now - 25 * 60_000)
msg(S, "user", now - 31 * 60_000, { text: "hi" })
msg(S, "assistant", now - 30 * 60_000, { content: [] })
msg(S, "idle", now - 20 * 60_000) // the last turn ended 20 min ago

const core = await import("../core.ts")
core.saveCard({ session: S, role: "integrator", auto: false, title: S, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
let busy = true
mkdirSync(core.WINDOWS, { recursive: true })
const WPID = 818181
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [{ sessionID: S, active: true, busy }] }))
beat()
const heart = setInterval(beat, 300)

const mod = await import("../index.ts")
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    hook: async () => {},
  },
  tool: { transform: async () => {} },
}
const logPath = path.join(os.tmpdir(), "opencode-plugins.log")
const logText = () => {
  try {
    return readFileSync(logPath, "utf8")
  } catch {
    return ""
  }
}
const mark = logText().length
const fresh = () => logText().slice(mark)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

const stop = await mod.default.setup(ctx)
for (const end = Date.now() + 15_000; Date.now() < end && !/stale busy:/.test(fresh()); ) await wait(200)
await wait(800)
const lines = fresh().split("\n").filter((l) => /stale busy:/.test(l))
cell("a stuck busy tab writes one diagnostic line", lines.length === 1, JSON.stringify(lines))
const line = lines[0] ?? ""
cell("the line names the window and the tab flags", /window pid=818181/.test(line) && /tab active=true busy=true/.test(line), line)
cell("the line says how long the server has been idle", /server idle since \d\d:\d\d \(2\d min\)/.test(line), line)
cell("the line has the plugin process age", /plugin process up since \d\d:\d\d \(\d+ min\)/.test(line), line)
cell("the line has the db facts and the last rows", /db idle=\d\d:\d\d viewed=\d\d:\d\d/.test(line) && /last rows: user@\d\d:\d\d, assistant@\d\d:\d\d, idle@\d\d:\d\d/.test(line), line)

// the next passes do not repeat the line while the state lasts
await wait(1500)
cell("the line is not repeated on every pass", fresh().split("\n").filter((l) => /stale busy:/.test(l)).length === 1, "repeated")

// the owner pressed Esc and wrote again: the window is not busy, the state ends with one line
busy = false
beat()
for (const end = Date.now() + 15_000; Date.now() < end && !/stale busy cleared:/.test(fresh()); ) await wait(200)
await wait(500)
cell("the end of the state is logged once", fresh().split("\n").filter((l) => /stale busy cleared:/.test(l)).length === 1, fresh().split("\n").filter((l) => /stale busy/.test(l)).join(" | "))

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-stale-diag.test: FAIL ${fail}` : "crew-stale-diag.test ok")
process.exit(fail ? 1 : 0)

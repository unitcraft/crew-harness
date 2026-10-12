// Self-test of hung-turn detection, task 036 (node >= 24):  node test/crew-hung-turn.test.mjs
// The window says the turn runs, there is no idle after the last answer and the model is silent: the state is "hung".
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-hung-"))
process.env.XDG_DATA_HOME = tmp
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
const now = Date.now()
const MIN = 60_000
const A = "sesHUNG_A", B = "sesLIVE_B", C = "sesWATCH_C", D = "sesSWITCH_D"
for (const id of [A, B, C, D]) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, ?, null)").run(id, proj, id, now - 300 * MIN)
msg(A, "user", now - 121 * MIN, { text: "go" })
msg(A, "assistant", now - 120 * MIN, { content: [] }) // answer 2 h ago, no idle
msg(B, "user", now - 3 * MIN, { text: "go" })
msg(B, "assistant", now - 2 * MIN, { content: [] })
db.prepare("update session_message set time_updated = ? where id = ?").run(now - 60_000, `m${seq}`) // updated a minute ago
msg(C, "user", now - 61 * MIN, { text: "go" })
msg(C, "assistant", now - 60 * MIN, { content: [] })
msg(D, "user", now - 61 * MIN, { text: "go" })
msg(D, "assistant", now - 60 * MIN, { content: [] })
msg(D, "agent-switched", now - 1 * MIN, {}) // the owner switched the agent a minute ago: not model work

const core = await import("../core.ts")
const { WATCHES } = await import("../watch.ts")
const { readStatuses } = await import("../status.ts")
for (const id of [A, B, C, D]) core.saveCard({ session: id, role: "integrator", auto: false, title: id, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
mkdirSync(WATCHES, { recursive: true })
writeFileSync(path.join(WATCHES, "w1.json"), JSON.stringify({ id: "w1", session: C, command: "npm test", cwd: proj, minutes: 30, created: now - 50 * MIN, status: "running", pid: process.pid, started: now - 50 * MIN }))
mkdirSync(core.WINDOWS, { recursive: true })
const WPID = 828282
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [A, B, C, D].map((sessionID) => ({ sessionID, active: true, busy: true })) }))
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
for (const end = Date.now() + 15_000; Date.now() < end && !/hung turn:/.test(fresh()); ) await wait(200)
await wait(1500)
const lines = fresh().split("\n").filter((l) => /hung turn:/.test(l))
cell("one hung-turn line for A and one for D, none for B or C", lines.length === 2 && lines.some((l) => l.includes(A)) && lines.some((l) => l.includes(D)), JSON.stringify(lines))
const la = lines.find((l) => l.includes(A)) ?? ""
cell("the line has window, silence and last rows", /window pid=828282/.test(la) && /model silent since \d\d:\d\d \(1[12]\d min\)/.test(la) && /last rows: user@\d\d:\d\d, assistant@\d\d:\d\d/.test(la), la)
const st = (id) => readStatuses().find((s) => s.session === id)
cell("hung: state owner with the text", st(A)?.state === "owner" && /ход завис с \d\d:\d\d \(1[12]\d мин\): нажмите Esc в окне и напишите «продолжай»/.test(st(A)?.question ?? ""), JSON.stringify(st(A)))
cell("live turn updated a minute ago: not hung", st(B)?.state === "working", JSON.stringify(st(B)))
cell("turn with a running watch: not hung", st(C)?.state !== "owner", JSON.stringify(st(C)))
cell("agent-switched a minute ago is not model activity: hung", st(D)?.state === "owner" && /ход завис/.test(st(D)?.question ?? ""), JSON.stringify(st(D)))
await wait(1500)
cell("the line is not repeated", fresh().split("\n").filter((l) => /hung turn:/.test(l)).length === 2, "repeated")

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-hung-turn.test: FAIL ${fail}` : "crew-hung-turn.test ok")
process.exit(fail ? 1 : 0)

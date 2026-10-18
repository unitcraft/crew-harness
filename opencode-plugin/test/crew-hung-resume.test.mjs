// Self-test of the self-recovery of a hung turn, task 048 (node >= 24):  node test/crew-hung-resume.test.mjs
// A hung turn (task 036) is interrupted by the plugin itself (ctx.session.interrupt) and the tab is woken by a letter "go on".
// One try per hang, at most 2 tries per session in an hour; a failed try or the limit - the old notice to the owner.
// A running tool and an open question to the owner are not a hang: no interrupt.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-hung-resume-"))
process.env.XDG_DATA_HOME = tmp
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp // the plugin log lives in os.tmpdir(): a log of its own per run, not the one other parallel runs write (task 085)
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "300"
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
// A - hung, the interrupt works, and the tab hangs again after each resume; E - hung, the interrupt finds nothing to stop;
// F - hung by the rows, but a question to the owner is open; G - a tool is running; B - a live turn
const A = "sesHUNG_A", E = "sesNOSTOP_E", F = "sesFORM_F", G = "sesTOOL_G", B = "sesLIVE_B"
const ALL = [A, E, F, G, B]
for (const id of ALL) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, ?, null)").run(id, proj, id, now - 300 * MIN)
for (const id of [A, E, F]) {
  msg(id, "user", now - 121 * MIN, { text: "go" })
  msg(id, "assistant", now - 120 * MIN, { content: [] })
}
msg(G, "user", now - 61 * MIN, { text: "go" })
msg(G, "assistant", now - 60 * MIN, { content: [{ type: "tool", state: { status: "running" } }] })
msg(B, "user", now - 3 * MIN, { text: "go" })
msg(B, "assistant", now - 2 * MIN, { content: [] })
db.prepare("update session_message set time_updated = ? where id = ?").run(now - 60_000, `m${seq}`)

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const fw = await import("../form-wait.ts")
const { readStatuses } = await import("../status.ts")
for (const id of ALL) core.saveCard({ session: id, role: "integrator", auto: false, title: id, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
const task = tasks.createTask({ project: "proj", title: "hung work", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: "sesAUTHOR", author_role: "proj.integrator", qid: "q-hung", status: "running", kind: "assign", directory: proj, executor: A })
core.saveCard({ ...core.readJson(core.cardFile(A)), task: { project: "proj", n: task.n } })
fw.addForm(F, { id: "form-F", at: Date.now(), title: "q", question: "which one?", session: F })
mkdirSync(core.WINDOWS, { recursive: true })
const WPID = 838383
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: ALL.map((sessionID) => ({ sessionID, active: true, busy: true })) }))
beat()
const heart = setInterval(beat, 300)

const calls = []
let hangAgain = 0
const ctxTools = []
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    hook: async () => {},
    interrupt: async (input) => {
      calls.push(input)
      if (input.sessionID === A) {
        // the resumed turn wrote a little and hung again: a newer silent answer, still older than the threshold
        const at = now - 100 * MIN + ++hangAgain * MIN
        msg(A, "assistant", at, { content: [] })
        return { interrupted: true }
      }
      return { interrupted: false }
    },
  },
  tool: { transform: async (f) => f({ add: (t) => ctxTools.push(t) }) },
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
const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map((n) => path.join(dir, String(n))).filter((f) => f.endsWith(".json")) : [])
const lettersTo = (id) => [...filesIn(path.join(core.INBOX, core.safeKey(id))), ...filesIn(path.join(core.READ, core.safeKey(id)))].map((f) => readFileSync(f, "utf8"))
const noticesFor = (id) => filesIn(path.join(core.NOTICES, String(WPID))).map((f) => JSON.parse(readFileSync(f, "utf8"))).filter((n) => n.sessionID === id && /ждёт вас/.test(n.title))
const callsFor = (id) => calls.filter((c) => c.sessionID === id)
const st = (id) => readStatuses().find((s) => s.session === id)

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

const mod = await import("../index.ts")
const stop = await mod.default.setup(ctx)
for (const end = Date.now() + 20_000; Date.now() < end && !(callsFor(A).length >= 2 && st(A)?.state === "owner"); ) await wait(200)
await wait(2000)

cell("the probe at load names the interrupt method", /hung turn self-recovery: on \(session\.interrupt\)/.test(fresh()), fresh().split("\n").filter((l) => /self-recovery/.test(l)).join(" | "))
cell("hung A: the plugin interrupted the turn", callsFor(A).length >= 1 && callsFor(A)[0].resume === true, JSON.stringify(calls))
const la = lettersTo(A)
cell("hung A: the letter go-on went to the tab", la.length >= 1 && la.every((l) => /Ход завис и прерван плагином в \d\d:\d\d; продолжай с того места, где остановился/.test(l)), JSON.stringify(la))
cell("hung again within an hour: at most 2 tries", callsFor(A).length === 2 && la.length === 2, `calls ${callsFor(A).length}, letters ${la.length}`)
cell("limit reached: the old notice to the owner", st(A)?.state === "owner" && /ход завис с \d\d:\d\d .*нажмите Esc/.test(st(A)?.question ?? "") && noticesFor(A).length >= 1, JSON.stringify(st(A)))
cell("the log has the self-recovery lines and the limit", /hung turn resumed: .*sesHUNG_A/.test(fresh()) && /hung turn not resumed: .*sesHUNG_A.*2 tries in an hour/.test(fresh()), fresh().split("\n").filter((l) => /sesHUNG_A/.test(l)).join(" | "))
const hist = tasks.loadTask("proj", task.n)?.history ?? []
cell("the task history has the self-recovery", hist.some((h) => /ход завис с \d\d:\d\d; плагин прервал его в \d\d:\d\d и попросил продолжить/.test(h.note ?? "")), JSON.stringify(hist))
cell("interrupt found nothing (E): one try, no letter, the owner is told", callsFor(E).length === 1 && lettersTo(E).length === 0 && st(E)?.state === "owner" && noticesFor(E).length >= 1 && /hung turn not resumed: .*sesNOSTOP_E.*interrupted=false/.test(fresh()), `calls ${callsFor(E).length}, letters ${lettersTo(E).length}, ${JSON.stringify(st(E))}`)
cell("open question to the owner (F): no interrupt, not hung", callsFor(F).length === 0 && !/ход завис/.test(st(F)?.question ?? ""), `calls ${callsFor(F).length}, ${JSON.stringify(st(F))}`)
cell("running tool (G): no interrupt", callsFor(G).length === 0 && st(G)?.state !== "owner", `calls ${callsFor(G).length}, ${JSON.stringify(st(G))}`)
cell("live turn (B): no interrupt", callsFor(B).length === 0 && st(B)?.state === "working", `calls ${callsFor(B).length}, ${JSON.stringify(st(B))}`)
// the decision alone: a successful try waits for its result, then the owner; another hang within the hour - the second try
const hr = await import("../hung-resume.ts")
const T0 = 1_000_000_000
const okTry = [{ since: 5, at: T0, ok: true }]
cell("verdict: no method - owner", hr.resumeVerdict([], 5, T0, false).act === "owner", "")
cell("verdict: first hang - try", hr.resumeVerdict([], 5, T0, true).act === "try", "")
cell("verdict: same hang right after a good try - wait", hr.resumeVerdict(okTry, 5, T0 + 60_000, true).act === "wait", "")
cell("verdict: same hang long after a good try - owner", hr.resumeVerdict(okTry, 5, T0 + hr.RESUME_GRACE_MS + 1, true).act === "owner", "")
cell("verdict: same hang after a failed try - owner", hr.resumeVerdict([{ since: 5, at: T0, ok: false }], 5, T0 + 1, true).act === "owner", "")
cell("verdict: new hang, one try in the hour - try", hr.resumeVerdict(okTry, 9, T0 + 10 * MIN, true).act === "try", "")
cell("verdict: new hang, two tries in the hour - owner", hr.resumeVerdict([...okTry, { since: 9, at: T0 + 10 * MIN, ok: true }], 12, T0 + 20 * MIN, true).act === "owner", "")
cell("verdict: the old tries are older than an hour - try", hr.resumeVerdict([...okTry, { since: 9, at: T0 + 10 * MIN, ok: true }], 12, T0 + 71 * MIN, true).act === "try", "")
const doctor = ctxTools.find((t) => t.name === "crew_doctor")
const dr = doctor ? String((await doctor.execute({}, { sessionID: B }))?.content ?? "") : "no crew_doctor"
cell("crew_doctor does not complain about interrupt when it is there", !/session\.interrupt/.test(dr), dr)

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-hung-resume.test: FAIL ${fail}` : "crew-hung-resume.test ok")
process.exit(fail ? 1 : 0)

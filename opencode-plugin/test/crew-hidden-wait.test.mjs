// Red probe of task 263 (the incident of task 258): a tab blocked INSIDE the `question` tool shows as "busy"/"running"
// and its letters wait unread, while nobody can tell it waits for the OWNER (node >= 24):
//   node test/crew-hidden-wait.test.mjs
// Incident 2026-10-30: session ses_mvuzpremo5almpfbvj waited inside question since 17:26, /api/session/active said
// "running", letters were not read, the integrator took the check as still running.
// What is checked here:
//   1. a tab with an open call `question` (a form record in forms/) and a busy window mark: crew_list names the
//      blocking wait ("ждёт ответа владельца с ЧЧ:ММ", the question text, the form id) instead of a bare "занята";
//   2. the same without a form record (the call open in the database only): "(диалог без записи формы)";
//   3. a task session (spawned, no window) with an open call: the row gains the blocker next to the task status;
//   4. a really working tab (a running tool that is not question) stays plain "занята" — no false blocker;
//   5. letters to the blocked tab wait unread (the turn is held by the question), and crew_list still shows their count;
//   6. the diagnosis itself produces no push letters ("Не завершено"/"застряла").
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-hidden-wait-"))
process.env.XDG_DATA_HOME = tmp
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STEP_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ allow_default_models: true, step_term_minutes: 0.05, step_answer_minutes: 0.05, idle_tab_minutes: 0 }))

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
db.exec("create table session_inbox (id text primary key, session_id text)")
let seq = 0
const row = (session, type, data, at) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
const NOW = Date.now()
const T0 = NOW - 42 * 60_000 // the question waits since 42 minutes ago
const QUESTION = "Вливать кандидата в main?"
const qcall = (session, at, status = "running") =>
  row(session, "assistant", { content: [{ type: "tool", id: `call_${seq}`, name: "question", state: { status, input: { questions: [{ question: QUESTION, header: "Слияние", options: [{ label: "Влить (Recommended)" }, { label: "Подождать" }] }] } }, time: { created: at } }] }, at)
const otherTool = (session, at) => row(session, "assistant", { content: [{ type: "tool", id: `call_${seq}`, name: "shell", state: { status: "running", input: { command: "npm test" } }, time: { created: at } }] }, at)

const mod = await import("../index.ts")
const core = await import("../core.ts")
const fw = await import("../form-wait.ts")
const tasks = await import("../tasks.ts")
const watch = await import("../watch.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => ({ id: req.id ?? "sesNEVER" }),
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + String(detail ?? "").slice(0, 400)}`)
  if (!ok) fail++
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content

// the integrator's tab and three subjects in one live window
const WPID = 626262
const tabs = [
  { sessionID: "sesINTEG", active: true, busy: false },
  { sessionID: "sesBLOCK", active: false, busy: true }, // blocked inside question, with a form record
  { sessionID: "sesNOREC", active: false, busy: true }, // blocked inside question, no form record (the dialog only)
  { sessionID: "sesWORK", active: false, busy: true }, // really working (a running shell tool)
  { sessionID: "sesCONTROL", active: false, busy: false },
]
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
for (const t of tabs) {
  await hooks.context({ sessionID: t.sessionID, system: [], model: { id: "x", providerID: "y" } })
  if (!t.busy) await events["session.idle"]({ properties: { sessionID: t.sessionID } })
}
await call("crew_role", "sesINTEG", { role: "integrator" })
const heldTasks = []
for (const [sid, hold] of [["sesBLOCK", "HOLD"], ["sesNOREC", "STOP"], ["sesCONTROL", undefined]]) {
  const t = tasks.createTask({ project: "proj", title: `263 ${hold ?? "control"}`, goal: "fixture", criteria: "fixture", priority: "P2", tier: "light", role: "worker", author: "sesINTEG", author_role: "proj.integrator", qid: `q-${sid}`, status: "running", kind: "assign", directory: proj, executor: sid })
  t.created = t.updated = T0
  t.history = [{ at: T0, by: "sesINTEG", status: "running", note: "fixture" }]
  tasks.saveTask(t)
  core.saveCard({ ...core.readJson(core.cardFile(sid)), task: { project: "proj", n: t.n } })
  if (hold) {
    const r = await call("crew_step_note", "sesINTEG", { n: t.n, hold, who: `fixture owner, 2026-10-31, ${hold}` })
    heldTasks.push(t)
  }
}

// the open calls of `question` in the database
qcall("sesBLOCK", T0)
qcall("sesNOREC", T0)
otherTool("sesWORK", T0)
// the form record of sesBLOCK (what formWatch writes from form.created)
fw.handleFormEvent({ type: "form.created", data: { form: { id: "frm_BLOCK263", sessionID: "sesBLOCK", title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", question: QUESTION, options: [{ label: "Влить (Recommended)" }, { label: "Подождать" }] }] } } }, T0)

// a task session (spawned, no window) blocked inside question — the exact shape of the incident 258
const SESPAWN = "sesSPAWN263"
qcall(SESPAWN, T0)
core.saveCard({ session: SESPAWN, role: "worker", auto: false, title: "258 исп тест", directory: proj, repo: "proj", project: "proj", task: { project: "proj", n: 58 }, spawned: { by: "sesINTEG", task: "258", tier: "light", status: "running", at: T0, qid: "q258" }, busy: true, busySince: T0, pid: process.pid, updated: NOW })

// letters to the blocked tab wait unread (the turn is held by the question)
await call("crew_send", "sesINTEG", { to: "sesBLOCK", text: "как проверка?" })
await wait()

const list = await call("crew_list", "sesINTEG")
const rowOf = (s) => list.split("\n").find((l) => l.includes(s)) ?? "(нет строки)"
const hm = new Date(T0).toTimeString().slice(0, 5)

// 1. the form record: the blocker is named, with the time, the question and the form id
{
  const r = rowOf("sesBLOCK")
  cell("a tab blocked in question is not shown as plainly busy", !/занята/.test(r) || /ждёт ответа владельца/.test(r), r)
  cell("crew_list names the blocking wait with its age, the question and the form id", r.includes("ждёт ответа владельца") && r.includes(hm) && r.includes(QUESTION) && r.includes("frm_BLOCK263"), r)
  cell("crew_list exposes the stable identity, elapsed minutes and options", r.includes("rid frm_BLOCK263") && r.includes("42 мин") && r.includes("Влить (Recommended)") && r.includes("Подождать"), r)
}
// 2. no form record: the open call in the database still shows
{
  const r = rowOf("sesNOREC")
  cell("a dialog without a form record shows as waiting for the owner", r.includes("ждёт ответа владельца") && r.includes(hm) && /диалог без записи/.test(r), r)
}
// 3. the task session: the task status and the blocker are separate
{
  const r = rowOf(SESPAWN)
  cell("a task session blocked in question: the row gains the blocker next to the task status", r.includes("ждёт ответа владельца") && r.includes(QUESTION), r)
}
// 4. a really working tab stays plain busy
{
  const r = rowOf("sesWORK")
  cell("a working tab keeps plain busy, no false blocker", /занята/.test(r) && !/ждёт ответа владельца/.test(r), r)
}
// 5. the letters wait unread, the count is shown
{
  cell("letters to the blocked tab are not delivered while the question holds the turn", delivered.filter((d) => d.sessionID === "sesBLOCK" && d.text.includes("как проверка?")).length === 0, JSON.stringify(delivered))
  cell("crew_list still shows the waiting letters", rowOf("sesBLOCK").includes("ждут писем: 1"), rowOf("sesBLOCK"))
}
// 6. no pushes from the diagnosis: the blocked tab gets no "not finished"/"stuck" letters
await wait(7000)
{
  const pushes = delivered.filter((d) => d.sessionID === "sesBLOCK" && /Не завершено|застряла|submit|reassign/.test(d.text))
  cell("a blocked tab gets no push letters from the diagnosis", pushes.length === 0, JSON.stringify(pushes))
  const letters = (sid) => [core.INBOX, core.READ].flatMap((base) => {
    const d = path.join(base, core.safeKey(sid))
    return existsSync(d) ? readdirSync(d).filter(n => n.endsWith(".json")).map(n => core.readJson(path.join(d,n))) : []
  }).filter(Boolean)
  for (const sid of ["sesBLOCK", "sesNOREC"]) cell(`${sid}: HOLD/STOP produces no continue, submit or reassign demand`, !letters(sid).some(l => /Не завершено|Шаг стоит|submit|reassign/.test(l.text)), JSON.stringify(letters(sid)))
  cell("control: the actual step watcher ran without HOLD", letters("sesCONTROL").some(l => l.id.startsWith("idle-step-")), JSON.stringify(letters("sesCONTROL")))
  cell("HOLD/STOP changes no executor or task status", heldTasks.every(t => tasks.loadTask("proj",t.n)?.executor === t.executor && tasks.loadTask("proj",t.n)?.status === "running"))
}

clearInterval(heart)
stop?.()
// No watcher is running now: fixture metadata cannot start any command.
mkdirSync(watch.WATCHES, {recursive:true})
writeFileSync(path.join(watch.WATCHES,"diag263.json"),JSON.stringify({id:"diag263",session:"sesWORK",command:"fixture only",cwd:proj,created:T0,minutes:10,machine:true,status:"requested"}))
let evidence = await core.activityEvidence("sesWORK")
cell("source diagnosis: working shell and machine queue are independent", evidence.includes("shell с") && evidence.includes("очередь машины") && evidence.includes("session_message") && evidence.includes("PID неизвестен"),evidence)
writeFileSync(path.join(watch.WATCHES,"diag263.json"),JSON.stringify({id:"diag263",session:"sesWORK",command:"fixture only",cwd:proj,created:T0,started:T0,minutes:10,status:"running",pid:123456}))
evidence = await core.activityEvidence("sesWORK")
cell("source diagnosis: external process PID is metadata, not invented liveness", evidence.includes("внешняя команда") && evidence.includes("123456") && evidence.includes("живость PID неизвестна"),evidence)
process.env.CREW_HARNESS_DB = path.join(tmp,"missing.db")
evidence = await core.activityEvidence("sesUNKNOWN")
cell("source diagnosis: missing database is unknown, not working", evidence.includes("инструмент: неизвестно") && evidence.includes("очередь сервера: неизвестно"),evidence)
db.close()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-hidden-wait.test: FAIL ${fail}` : "crew-hidden-wait.test ok")
process.exit(fail ? 1 : 0)

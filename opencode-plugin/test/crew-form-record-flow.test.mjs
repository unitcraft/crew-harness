// Self-test of task 120 in the running plugin (node >= 24):  node test/crew-form-record-flow.test.mjs
// The same rules as test/crew-form-record.test.mjs, but through the passes of the service (index.ts) over a database of OpenCode made by hand:
//   A. a held form whose record is gone and whose call `question` is open: the pass makes the record again, the panel (status file) says "owner",
//      and an answer file from crew-answer is applied (interrupt, letter, record closed);
//   B. a tab with an open dialog and no record and no trace at all: the panel says "owner", dialog "norecord", not "working";
//   C. a record whose call was aborted by the restart of the service and a turn that went on: the record is kept as dead, the panel says so,
//      crew-answer is refused "dialog closed, close the tab by hand" and the form leaves the list of those who wait;
//   D. form.cancelled through the subscription while the call is open: not cancelled; when the call ended: cancelled.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { legacyAnswerPass } from "./legacy-answer-fixture.mjs"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-form-record-flow-"))
process.env.XDG_DATA_HOME = tmp
process.env.XDG_STATE_HOME = tmp
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FORM_MS = "100"
process.env.CREW_HARNESS_FORM_GONE_MS = "300"
process.env.CREW_HARNESS_FORM_CANCEL_GONE_MS = "300"
process.env.CREW_HARNESS_FORM_REPEAT_GAP_MS = "300"
process.env.CREW_HARNESS_FORM_RESTART_GRACE_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))
const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const row = (session, type, data, at) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
const NOW = Date.now()
const T0 = NOW - 90 * 60_000
const QUESTION = "Влить ветку кандидата в main после зелёного CI?"
const OPTIONS = [{ label: "Влить (Recommended)", description: "Слияние ветки" }, { label: "Подождать", description: "Не вливать" }]
const callRow = (session, at, status, error) =>
  row(session, "assistant", { content: [{ type: "tool", id: `call_${seq}`, name: "question", state: { status, input: { questions: [{ question: QUESTION, header: "Слияние", options: OPTIONS }] }, ...(error ? { error } : {}) }, time: { created: at } }] }, at)
const ABORTED = { type: "aborted", message: "Tool execution interrupted: question" }

const A = "ses_flowA", B = "ses_flowB", C = "ses_flowC", D = "ses_flowD"
for (const id of [A, B, C, D]) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(id, proj, id)
callRow(A, T0, "running")
callRow(B, T0, "running")
callRow(C, T0, "error", ABORTED)
row(C, "synthetic", { text: "The server restarted while you were working. Continue from where you left off without repeating completed work" }, T0 + 60_000)
row(C, "idle", { outcome: "succeeded" }, T0 + 120_000)
callRow(D, T0, "running")

const core = await import("../core.ts")
const fw = await import("../form-wait.ts")
const status = await import("../status.ts")
const oa = await import("../owner-answer.ts")
for (const id of [A, B, C, D]) core.saveCard({ session: id, role: "acceptor", auto: false, title: id, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
mkdirSync(core.WINDOWS, { recursive: true })
const WPID = 595960
let busyOf = { [A]: true, [B]: true, [C]: false, [D]: true }
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [A, B, C, D].map((sessionID) => ({ sessionID, active: true, busy: busyOf[sessionID] })) }))
beat()
const heart = setInterval(beat, 300)

// the traces of A: the marker "held" (the closed list left the form to the owner); no record; B has nothing; C has its record (the restart did not remove it: it is dead); D is made by the event
mkdirSync(path.join(fw.FORMS, "auto"), { recursive: true })
writeFileSync(path.join(fw.FORMS, "auto", "frm_FA.json"), JSON.stringify({ id: "frm_FA", session: A, project: "proj", type: "default", question: QUESTION, first: T0, at: T0, state: "held", reason: "closed", rule: "merge", why: "слияние" }))
const created = (id, session) => ({ type: "form.created", data: { form: { id, sessionID: session, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", question: QUESTION, options: OPTIONS.map((o) => ({ label: o.label })) }] } } })
fw.handleFormEvent(created("frm_FC", C), T0)

let cb
const interrupts = []
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  event: { subscribe: async (f) => void (cb = f) },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    hook: async () => {},
    interrupt: async (input) => (interrupts.push(input), { interrupted: true }),
  },
  tool: { transform: async () => {} },
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (f, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if (f()) return true
    } catch {}
    await wait(100)
  }
  return false
}
const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map((n) => path.join(dir, String(n))).filter((f) => f.endsWith(".json")) : [])
const lettersTo = (id) => [...filesIn(path.join(core.INBOX, core.safeKey(id))), ...filesIn(path.join(core.READ, core.safeKey(id)))].map((f) => readFileSync(f, "utf8"))
const stOf = (s) => core.readJson(path.join(status.STATUS, `${s}.json`))
const recOf = (s) => core.readJson(path.join(fw.FORMS, `${core.safeKey(s)}.json`)) ?? []
const put = (name, a) => (mkdirSync(oa.ANSWERS, { recursive: true }), writeFileSync(path.join(oa.ANSWERS, `${name}.json`), JSON.stringify({ id: name, at: Date.now(), ...a })))
const got = (name) => core.readJson(path.join(oa.ANSWERS, `${name}.json`))

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + String(detail ?? "").slice(0, 300)}`)
  if (!ok) fail++
}

const mod = await import("../index.ts")
const stop = await mod.default.setup(ctx)

// A
await until(() => recOf(A).some((f) => f.id === "frm_FA"))
const fa = recOf(A).find((f) => f.id === "frm_FA")
cell("A: the record of the held form is made again from the marker (the call is open)", !!fa && fa.question === QUESTION && fa.options?.[0] === "Влить (Recommended)" && fa.restored > 0, JSON.stringify(recOf(A)))
await until(() => stOf(A)?.state === "owner" && stOf(A)?.formId === "frm_FA")
cell("A: the panel says owner, with the form and the age of the wait", stOf(A)?.state === "owner" && stOf(A)?.formId === "frm_FA" && stOf(A)?.since === T0, JSON.stringify(stOf(A)))
put("fa1", { form: "frm_FA", session: A, option: "1", quote: "да, вливай" })
await legacyAnswerPass(oa, core, ctx)
await until(() => got("fa1")?.status)
cell("A: crew-answer on the restored form is applied (interrupt, record closed, letter)", got("fa1")?.status === "applied" && interrupts.some((i) => i.sessionID === A) && !recOf(A).length && lettersTo(A).some((t) => /Ответ владельца на ваш вопрос/.test(t)), JSON.stringify({ a: got("fa1"), i: interrupts, r: recOf(A) }))

// B
await until(() => stOf(B)?.state === "owner")
cell("B: an open dialog with no record at all: the panel says owner, dialog norecord (not working)", stOf(B)?.state === "owner" && stOf(B)?.dialog === "norecord" && stOf(B)?.since === T0, JSON.stringify(stOf(B)))
cell("B: counted in the line of /crew", /^Waiting for you: [1-9]/.test(status.waitingLine(status.readStatuses(), Date.now()) ?? ""), status.waitingLine(status.readStatuses(), Date.now()))

// C
await until(() => recOf(C).some((f) => f.id === "frm_FC" && f.dead))
cell("C: the turn went on after the aborted call: the record stays, marked dead", recOf(C).some((f) => f.id === "frm_FC" && f.dead > 0), JSON.stringify(recOf(C)))
await until(() => stOf(C)?.dialog === "dead")
cell("C: the panel says owner with the dead dialog", stOf(C)?.state === "owner" && stOf(C)?.dialog === "dead" && /диалог закрыт/.test(stOf(C)?.detail ?? ""), JSON.stringify(stOf(C)))
put("fc1", { form: "frm_FC", session: C, option: "1", quote: "да" })
await until(() => got("fc1")?.status)
cell("C: crew-answer is refused 'dialog closed, close the tab by hand'; no interrupt, no letter", got("fc1")?.status === "refused" && /диалог закрыт.*вручную/.test(got("fc1")?.why ?? "") && !interrupts.some((i) => i.sessionID === C) && !lettersTo(C).some((t) => /Ответ владельца/.test(t)), JSON.stringify(got("fc1")))
await until(() => stOf(C)?.state !== "owner")
cell("C: the form leaves the list of those who wait", !recOf(C).length && stOf(C)?.state !== "owner", JSON.stringify({ r: recOf(C), s: stOf(C) }))

// D
cb(created("frm_FD", D))
await until(() => recOf(D).some((f) => f.id === "frm_FD"))
cb({ type: "form.cancelled", data: { id: "frm_FD", sessionID: D } })
await wait(1500)
const d1 = recOf(D).find((f) => f.id === "frm_FD")
cell("D: form.cancelled while the call is open - not cancelled, not repeated", !!d1 && !d1.cancelled && !d1.repeats && lettersTo(D).every((t) => !/не получил ответа/.test(t)), JSON.stringify(d1))
db.prepare("update session_message set data = ? where session_id = ?").run(JSON.stringify({ content: [{ type: "tool", name: "question", state: { status: "error", input: { questions: [{ question: QUESTION, options: OPTIONS }] }, error: { type: "aborted", message: "The user dismissed this question" } }, time: { created: T0 } }] }), D)
row(D, "idle", { outcome: "interrupted" }, Date.now())
busyOf[D] = false
beat()
await until(() => recOf(D).some((f) => f.id === "frm_FD" && (f.cancelled || f.repeats)))
cell("D: the call ended - the cancel is taken, the repeat of task 040 goes on", recOf(D).some((f) => f.id === "frm_FD" && (f.cancelled || f.repeats)), JSON.stringify(recOf(D)))

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-form-record-flow.test: FAIL ${fail}` : "crew-form-record-flow.test ok")
process.exit(fail ? 1 : 0)

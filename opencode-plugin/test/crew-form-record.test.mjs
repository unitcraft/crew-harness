// Self-test of "the record of a question form lives while the dialog is open, the panel counts a dialog without a record", task 120 (node >= 24):
//   node test/crew-form-record.test.mjs
// Source: 2026-10-20 two dialogs "Questions" (acceptance of tasks 105 and 107, held for the owner by the closed list) hung in the window for 18-19 hours,
// while the orchestrator answered "no questions": forms/<session>.json was gone and crew-answer was refused with "no open question form".
// What the database of OpenCode showed (analysis.md): the server restarted at 05:28, the call `question` of both tabs ended with the error
// "Tool execution interrupted" (aborted) and the model went on; the dialog stayed in the window. The first model request of the tab after that
// (settleOnRequest, form-wait.ts) took the record for an answered one and removed it. Rules checked here:
//   1. the call `question` is read from the database (core.ts questionCall): open / answered / dead (aborted, or dismissed) / none;
//   2. a record whose call is open is not removed by a request of the tab or by the end of a turn; a call that ended with an abort and no reply makes
//      the record DEAD (kept, shown, nobody waits on it); a call that completed is an answer (removed, as before);
//   3. form.cancelled does not mark the record cancelled while the call is open (the owner closing the dialog ends the call too);
//   4. a held form whose record is gone is restored from forms/auto and forms/loops while its call is open (form-restore.ts);
//   5. the panel counts a dialog without a record (and a dead one) as waiting for the owner, with its age;
//   6. crew-answer applies to a restored form; for a dead dialog it is refused "dialog closed, close the tab by hand" and the form leaves the list.
// Red probe: the first run on the code of origin/main (every cell that needs the new code is red, the borders are green).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-form-record-"))
process.env.XDG_DATA_HOME = tmp
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp
process.env.CREW_HARNESS_FORM_GONE_MS = "1"
process.env.CREW_HARNESS_FORM_CANCEL_GONE_MS = "1"
process.env.CREW_HARNESS_FORM_RESTART_GRACE_MS = "1"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const row = (session, type, data, at) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
const QUESTION = "Влить ветку кандидата в main после зелёного CI?"
const OPTIONS = [{ label: "Влить (Recommended)", description: "Слияние ветки" }, { label: "Подождать", description: "Не вливать" }]
/** the assistant row with the call `question`; error: undefined (running / completed) or the error object */
const call = (session, at, status, { error, question = QUESTION } = {}) =>
  row(session, "assistant", { content: [{ type: "reasoning" }, { type: "tool", id: `call_${seq}`, name: "question", state: { status, input: { questions: [{ question, header: "Слияние", options: OPTIONS }] }, ...(error ? { error } : {}) }, time: { created: at } }] }, at)
const idle = (session, at, outcome = "succeeded") => row(session, "idle", { outcome }, at)
const ABORTED = { type: "aborted", message: "Tool execution interrupted: question" }
const DISMISSED = { type: "aborted", message: "The user dismissed this question" }

const core = await import("../core.ts")
const fw = await import("../form-wait.ts")
const { statusOf, waitingOf, waitingLine, stateText } = await import("../status.ts")
const oa = await import("../owner-answer.ts")
const loops = await import("../answer-loop.ts")
let restore
try {
  restore = await import("../form-restore.ts")
} catch (e) {
  restore = undefined
}

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + String(detail ?? "").slice(0, 300)}`)
  if (!ok) fail++
}
/** a cell whose code may be missing on the old tree: an exception is a red cell, not a crash of the file */
const safe = async (name, f) => {
  try {
    const r = await f()
    cell(name, r === true, r)
  } catch (e) {
    cell(name, false, `threw ${e}`)
  }
}
const NOW = Date.now()
const T0 = NOW - 90 * 60_000 // the form was made 90 minutes ago
const created = (id, session, extra = {}) => ({ type: "form.created", data: { form: { id, sessionID: session, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", question: QUESTION, options: OPTIONS.map((o) => ({ label: o.label })) }], ...extra } } })
const card = (session) => ({ session, project: "p", role: "acceptor", title: session })
const shown = (session, now = NOW) => (fw.shownForms ? fw.shownForms(session, now) : fw.pendingForms(session, now))
const deps = (over = {}) => ({
  processStart: 0,
  tab: async () => ({ open: true, busy: false }),
  idle: (s, since) => core.idleFactsAfter(s, since),
  ownerWrote: async () => false,
  wake: () => {},
  queued: async () => 0,
  call: (s) => core.questionCall(s),
  ...over,
})
const mark = (id, session, extra = {}) => {
  mkdirSync(path.join(fw.FORMS, "auto"), { recursive: true })
  writeFileSync(path.join(fw.FORMS, "auto", `${id}.json`), JSON.stringify({ id, session, project: "p", type: "default", question: QUESTION.slice(0, 200), first: T0, at: T0, state: "held", reason: "closed", rule: "merge", why: "слияние", ...extra }))
}

// ---- 1. the call `question` in the database
const S1 = "ses_open", S2 = "ses_idle_after", S3 = "ses_answered", S4 = "ses_aborted", S5 = "ses_dismissed", S6 = "ses_none", S7 = "ses_old"
call(S1, T0, "running")
call(S2, T0, "running")
idle(S2, T0 + 1000, "interrupted")
call(S3, T0, "completed")
call(S4, T0, "error", { error: ABORTED })
call(S5, T0, "error", { error: DISMISSED })
row(S6, "assistant", { content: [{ type: "tool", name: "shell", state: { status: "completed" } }] }, T0)
call(S7, T0 - 3_600_000, "completed")
row(S7, "assistant", { content: [{ type: "tool", name: "shell", state: { status: "completed" } }] }, T0) // later rows do not hide the last call
await safe("questionCall: running, no idle after - open, with the text and the options", async () => {
  const c = await core.questionCall(S1)
  return c.state === "open" && c.question === QUESTION && c.options?.[0] === "Влить (Recommended)" && c.at === T0 ? true : JSON.stringify(c)
})
await safe("questionCall: running but a turn ended after it - dead", async () => (await core.questionCall(S2)).state === "dead" || JSON.stringify(await core.questionCall(S2)))
await safe("questionCall: completed - answered", async () => (await core.questionCall(S3)).state === "answered" || JSON.stringify(await core.questionCall(S3)))
await safe("questionCall: aborted - dead, not dismissed", async () => {
  const c = await core.questionCall(S4)
  return c.state === "dead" && !c.dismissed ? true : JSON.stringify(c)
})
await safe("questionCall: dismissed by the owner - dead and dismissed", async () => {
  const c = await core.questionCall(S5)
  return c.state === "dead" && c.dismissed === true ? true : JSON.stringify(c)
})
await safe("questionCall: no call - none", async () => (await core.questionCall(S6)).state === "none")
await safe("questionCall: the last call is found behind later rows of other tools", async () => (await core.questionCall(S7)).state === "answered" || JSON.stringify(await core.questionCall(S7)))
await safe("questionCall: no database row for the session - none", async () => (await core.questionCall("ses_nobody")).state === "none")

// ---- 2. the cause (AC-1): a request of the tab after the restart removed the record of a dialog that was still on the screen
{
  const S = "ses_restart"
  call(S, T0, "error", { error: ABORTED })
  row(S, "synthetic", { text: "The server restarted while you were working. Continue from where you left off without repeating completed work" }, NOW - 60_000)
  fw.handleFormEvent(created("frm_R", S), T0)
  await fw.settleOnRequest(S, NOW, async () => false, fw.FORMS, core.questionCall)
  cell("the cause: the request after the restart does not remove the record of the dead call", fw.allForms(NOW).some((x) => x.form.id === "frm_R"), JSON.stringify(fw.allForms(NOW).map((x) => x.form.id)))
  cell("the cause: the record is marked dead and still shown", shown(S).length === 1 && typeof shown(S)[0].dead === "number", JSON.stringify(shown(S)))
  cell("dead record: nobody waits on it (no pending form for the queue gate, the reminders, the repeats)", fw.pendingForms(S, NOW).length === 0, JSON.stringify(fw.pendingForms(S, NOW)))
}
{
  const S = "ses_answered_req"
  call(S, T0, "completed")
  fw.handleFormEvent(created("frm_A", S), T0)
  await fw.settleOnRequest(S, NOW, async () => false, fw.FORMS, core.questionCall)
  cell("border: a call that completed is an answer (event lost): the record is removed as before", !fw.allForms(NOW).some((x) => x.form.id === "frm_A"), JSON.stringify(fw.allForms(NOW).map((x) => x.form.id)))
}
{
  const S = "ses_open_req"
  call(S, T0, "running")
  fw.handleFormEvent(created("frm_O", S), T0)
  await fw.settleOnRequest(S, NOW, async () => false, fw.FORMS, core.questionCall)
  cell("a request of the tab while the call is open does not remove the record, nor mark it dead", fw.allForms(NOW).some((x) => x.form.id === "frm_O" && !x.form.dead), JSON.stringify(fw.allForms(NOW).map((x) => x.form)))
}
{
  const S = "ses_nodb_req"
  fw.handleFormEvent(created("frm_N", S), T0)
  await fw.settleOnRequest(S, NOW, async () => false)
  cell("border: no call in the database and no reader - the old rule (the request closes the record)", !fw.allForms(NOW).some((x) => x.form.id === "frm_N"), "")
}
{
  // the end of the turn (formTick): a turn ended after the question; the call aborted - kept as dead, completed - removed
  const SD = "ses_tick_dead", SA = "ses_tick_answered", SO = "ses_tick_open"
  call(SD, T0, "error", { error: ABORTED })
  idle(SD, T0 + 5000)
  call(SA, T0, "completed")
  idle(SA, T0 + 5000)
  call(SO, T0, "running")
  for (const [id, s] of [["frm_TD", SD], ["frm_TA", SA], ["frm_TO", SO]]) fw.handleFormEvent(created(id, s), T0)
  await fw.formTick(deps(), NOW)
  await fw.formTick(deps(), NOW + 10_000)
  const ids = fw.allForms(NOW + 10_000).map((x) => x.form.id)
  cell("formTick: the turn ended after an aborted call - the record stays (dead)", ids.includes("frm_TD") && shown(SD, NOW + 10_000)[0]?.dead > 0, JSON.stringify(ids))
  cell("formTick border: the turn ended after a completed call - the record is removed", !ids.includes("frm_TA"), JSON.stringify(ids))
  cell("formTick: an open call is left alone", ids.includes("frm_TO") && !fw.allForms(NOW).find((x) => x.form.id === "frm_TO")?.form.dead, JSON.stringify(ids))
}

// ---- 3. cancelled is not set by a timer while the call is open
{
  const S = "ses_cancel"
  call(S, T0, "running")
  fw.handleFormEvent(created("frm_C", S), T0)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_C", sessionID: S } }, NOW, fw.FORMS, undefined, true)
  await fw.formTick(deps(), NOW + 1000)
  await fw.formTick(deps(), NOW + 12_000)
  const f = fw.allForms(NOW + 12_000).find((x) => x.form.id === "frm_C")?.form
  cell("form.cancelled while the call is open: the record is NOT cancelled", !!f && !f.cancelled && !f.repeats, JSON.stringify(f))
  db.prepare("update session_message set data = ? where session_id = ?").run(JSON.stringify({ content: [{ type: "tool", name: "question", state: { status: "error", input: { questions: [{ question: QUESTION, options: OPTIONS }] }, error: DISMISSED }, time: { created: T0 } }] }), S)
  idle(S, NOW + 13_000, "interrupted")
  await fw.formTick(deps(), NOW + 14_000)
  const g = fw.allForms(NOW + 14_000).find((x) => x.form.id === "frm_C")?.form
  cell("the call ended: the cancel is taken (cancelled set, the repeat of task 040 goes on)", !!g && (!!g.cancelled || !!g.repeats), JSON.stringify(g))
}
{
  const S = "ses_cancel_old"
  fw.handleFormEvent(created("frm_C2", S), T0)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_C2", sessionID: S } }, NOW)
  cell("border: without the new argument form.cancelled marks the record at once (task 040)", !!fw.allForms(NOW).find((x) => x.form.id === "frm_C2")?.form.cancelled, "")
}

// ---- 4. restore of a held form whose record is gone
const R1 = "ses_held_open", R2 = "ses_held_done", R3 = "ses_held_other", R4 = "ses_loop_only", R5 = "ses_held_dead"
call(R1, T0, "running")
call(R2, T0, "completed")
call(R3, T0 + 20 * 60_000, "running", { question: "Совсем другой вопрос про цвет?" })
call(R4, T0, "running")
call(R5, T0, "error", { error: ABORTED })
mark("frm_H1", R1)
mark("frm_H2", R2)
mark("frm_H3", R3)
mark("frm_H5", R5)
loops.noteAsk(R4, { id: "frm_L4", at: T0 + 5000, question: QUESTION, options: ["Влить (Recommended)", "Подождать"] }, fw.FORMS)
const rdeps = { call: (s) => core.questionCall(s) }
await safe("restore: a held form with an open call and no record comes back", async () => {
  const done = await restore.restoreForms(rdeps, NOW)
  const f = shown(R1)[0]
  return f && f.id === "frm_H1" && f.session === R1 && f.question === QUESTION && f.options?.[0] === "Влить (Recommended)" && f.born && Array.isArray(done) && done.some((x) => x.id === "frm_H1") ? true : JSON.stringify({ f, done })
})
await safe("restore: the restored form is the owner's wait in the panel", async () => {
  const s = statusOf({ card: card(R1), busy: true, busySince: NOW, asked: [], now: NOW, watches: [] })
  return s.state === "owner" && s.formId === "frm_H1" && s.since === T0 ? true : JSON.stringify(s)
})
await safe("restore: a second pass changes nothing (one record)", async () => {
  await restore.restoreForms(rdeps, NOW + 5000)
  return shown(R1).length === 1 ? true : JSON.stringify(shown(R1))
})
await safe("restore border: the call completed (the owner answered) - nothing comes back", async () => shown(R2).length === 0)
await safe("restore border: the open call is another question - the old mark does not come back", async () => shown(R3).length === 0)
await safe("restore border: the call is dead - not restored as an open wait", async () => shown(R5).length === 0)
await safe("restore: from the record of the loop when there is no mark", async () => {
  const f = shown(R4)[0]
  return f && f.id === "frm_L4" && f.question === QUESTION ? true : JSON.stringify(shown(R4))
})
await safe("restore: a form that is already in a file (even replaced) is not made again", async () => {
  fw.handleFormEvent(created("frm_H6", "ses_held_has"), T0)
  call("ses_held_has", T0, "running")
  mark("frm_H6", "ses_held_has")
  const before = JSON.stringify(readFileSync(path.join(fw.FORMS, "ses_held_has.json"), "utf8"))
  await restore.restoreForms(rdeps, NOW + 6000)
  return JSON.stringify(readFileSync(path.join(fw.FORMS, "ses_held_has.json"), "utf8")) === before ? true : "changed"
})

await safe("restore border: a form this process closed a moment ago (reply, answer) is not made again while the database still shows the call open", async () => {
  const S = "ses_closed_here"
  call(S, T0, "running")
  fw.handleFormEvent(created("frm_CH", S), T0)
  mark("frm_CH", S)
  fw.removeForm(S, "frm_CH")
  await restore.restoreForms(rdeps, NOW + 20_000)
  return shown(S).length === 0 ? true : JSON.stringify(shown(S))
})

// ---- 5. the panel
{
  const S = "ses_panel"
  const s = statusOf({ card: card(S), busy: true, busySince: NOW, asked: [], now: NOW, watches: [], dialog: { since: T0 } })
  cell("panel: an open dialog with no record is the owner's wait (state owner, since the dialog opened)", s.state === "owner" && s.since === T0, JSON.stringify(s))
  cell("panel: the detail says so and gives the age", /без записи/.test(s.detail ?? "") && /ждёт вас/.test(s.detail ?? ""), s.detail)
  cell("panel: counted by waitingOf and by the first line of /crew", waitingOf([s]).length === 1 && /^Waiting for you: 1/.test(waitingLine([s], NOW) ?? ""), waitingLine([s], NOW))
  cell("panel: /crew shows the age of the wait", /waiting you/.test(stateText(s, NOW)) && /90m|2h/.test(stateText(s, NOW)), stateText(s, NOW))
  const free = statusOf({ card: card(S), busy: false, asked: [], now: NOW, watches: [] })
  cell("border: no dialog - the tab is free", free.state === "idle", JSON.stringify(free))
}
{
  const S = "ses_restart"
  const s = statusOf({ card: card(S), busy: false, asked: [], now: NOW, watches: [] })
  cell("panel: a dead dialog (kept record) is shown, with the word", s.state === "owner" && /диалог закрыт/.test(s.detail ?? "") && s.formId === "frm_R", JSON.stringify(s))
}

// ---- 6. the answer from outside
const sayLog = []
const answerDeps = (over = {}) => {
  const letters = []
  const interrupts = []
  return {
    letters,
    interrupts,
    d: { interrupt: async (s) => (interrupts.push(s), { ok: true }), letter: (s, text, id) => letters.push({ s, text, id }), history: () => {}, say: (l) => sayLog.push(l), call: (s) => core.questionCall(s), ...over },
  }
}
const ANS = path.join(tmp, "answers")
const put = (name, a) => (mkdirSync(ANS, { recursive: true }), writeFileSync(path.join(ANS, `${name}.json`), JSON.stringify({ id: name, at: NOW, ...a })))
const got = (name) => core.readJson(path.join(ANS, `${name}.json`))
{
  const a = answerDeps()
  put("a1", { form: "frm_H1", session: R1, option: "1", quote: "да, вливай" })
  await oa.answerTick(a.d, NOW + 7000, ANS, fw.FORMS)
  const r = got("a1")
  cell("crew-answer on a restored form: applied (interrupt, letter, the form closed)", r?.status === "applied" && a.interrupts.length === 1 && a.letters.length === 1 && /Влить/.test(a.letters[0].text) && !shown(R1).length, JSON.stringify({ r, i: a.interrupts, l: a.letters.length }))
}
{
  const a = answerDeps()
  put("a2", { form: "frm_R", session: "ses_restart", option: "1", quote: "да" })
  await oa.answerTick(a.d, NOW + 8000, ANS, fw.FORMS)
  const r = got("a2")
  cell("dead dialog: refused with the reason 'dialog closed, close the tab by hand'", r?.status === "refused" && /диалог закрыт/.test(r.why ?? "") && /вручную/.test(r.why ?? ""), JSON.stringify(r))
  cell("dead dialog: no interrupt, no letter", a.interrupts.length === 0 && a.letters.length === 0, JSON.stringify(a.interrupts))
  cell("dead dialog: the form leaves the list of those who wait", !shown("ses_restart").length && !waitingOf([statusOf({ card: card("ses_restart"), busy: false, asked: [], now: NOW, watches: [] })]).length, JSON.stringify(shown("ses_restart")))
}
{
  // the dialogs of 2026-10-20: the record is long gone, the mark says "held", the call died - the answer is refused with the same reason
  const a = answerDeps()
  put("a3", { form: "frm_H5", session: R5, option: "1", quote: "да" })
  await oa.answerTick(a.d, NOW + 9000, ANS, fw.FORMS)
  const r = got("a3")
  cell("record gone, mark held, call dead: refused 'dialog closed, close the tab by hand'", r?.status === "refused" && /диалог закрыт/.test(r.why ?? "") && /вручную/.test(r.why ?? ""), JSON.stringify(r))
  const m = core.readJson(path.join(fw.FORMS, "auto", "frm_H5.json"))
  cell("record gone, mark held, call dead: the mark no longer counts as left to the owner", m?.state !== "held", JSON.stringify(m))
  const b = answerDeps()
  put("a4", { form: "frm_NOPE", session: "ses_nobody", option: "1", quote: "да" })
  await oa.answerTick(b.d, NOW + 10_000, ANS, fw.FORMS)
  cell("border: an unknown form is still 'no open question form'", got("a4")?.status === "refused" && /no open question form/.test(got("a4").why ?? ""), JSON.stringify(got("a4")))
}

{
  // a live question and a dead dialog of one tab: the answer by the session goes to the live one
  const forms = [
    { session: "ses_two", form: { id: "f_dead", at: 1, question: "q", options: ["Да", "Нет"], dead: 5 } },
    { session: "ses_two", form: { id: "f_live", at: 2, question: "q2", options: ["Да", "Нет"] } },
  ]
  const r = oa.resolveAnswer({ id: "x", at: 1, session: "ses_two", option: "1", quote: "да" }, forms, [])
  cell("resolve: a live question and a dead dialog of one tab - the answer by the session goes to the live one", r.ok && r.form.id === "f_live", JSON.stringify(r))
  const d = oa.resolveAnswer({ id: "x", at: 1, form: "f_dead", option: "1", quote: "да" }, forms, [])
  cell("resolve: the dead dialog named by its id is refused with the reason and named for removal", !d.ok && /диалог закрыт/.test(d.why) && d.dead?.id === "f_dead", JSON.stringify(d))
}

db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-form-record.test: FAIL ${fail}` : "crew-form-record.test ok")
process.exit(fail ? 1 : 0)

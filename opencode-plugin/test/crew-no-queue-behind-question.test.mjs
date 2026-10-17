// Self-test of "service messages do not pile up in the queue behind a waiting question", task 080 (node >= 24):  node test/crew-no-queue-behind-question.test.mjs
// Source: 2026-10-17 the tab of task #94 sat in a `question` turn for an hour. The plugin judged the tab idle and queued three repeats of
// "ask again" into the queue of the OpenCode server (delivery "queue"); at the end of every hour-long turn it queued one more reminder
// "Не завершено". The server hands the model ONE queued message per turn, the oldest, so the queue stood at four for five hours and the
// letters with the owner's answers (the tail of the queue) never reached the model (task 078, analysis.md). Rules:
//   1. while the tab has an open form of a question to the owner, no service message (reminder, repeat) is queued; letters wait in the mailbox.
//      A repeat of a LOST question is the only exception: ONE repeat, never while another message stands in the queue, never while the turn
//      is alive (a `question` tool still pending in the database);
//   2. after the owner's answer from outside the window the letter with the answer goes first and alone: no "Не завершено" in the same
//      pass; reminders resume after a working turn of the tab or after stall_minutes;
//   3. a service message of a kind that already stands in the queue is not queued again;
//   4. letters of people and tabs and the answer of the owner are never held (but by the end of the current turn, as before).
// Red probe: the first run before the code (every "queue" cell red, the borders green).
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-no-queue-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "200"
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
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ push_empty_turns: 50, push_max: 50 }))

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
db.exec("create table session_inbox (id text primary key, session_id text not null, type text not null, payload text not null, delivery text not null, enqueued_seq integer not null, time_created integer not null)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const fw = await import("../form-wait.ts")
const oa = await import("../owner-answer.ts")
let qg
try {
  qg = await import("../queue-gate.ts")
} catch (e) {
  qg = undefined
}

const AUTH = "sesQAUTH"
db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(AUTH, proj, AUTH)
core.saveCard({ session: AUTH, role: "integrator", auto: false, title: AUTH, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
const busyOf = {}
const names = []
function mkTab(name, { task = true } = {}) {
  const id = `ses_${name}`
  names.push(id)
  busyOf[id] = false
  db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(id, proj, id)
  core.saveCard({ session: id, role: "worker", auto: false, title: id, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
  if (task) {
    const t = tasks.createTask({ project: "proj", title: `work ${name}`, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: AUTH, author_role: "proj.integrator", qid: `q-${name}`, status: "running", kind: "assign", directory: proj, executor: id })
    core.saveCard({ ...core.readJson(core.cardFile(id)), task: { project: "proj", n: t.n } })
    core.addObligation(id, { qid: t.qid, from_session: AUTH, from_role: "proj.integrator", at: Date.now(), nudges: 0 })
  }
  return id
}
const S = mkTab("S") // the source: the question is alive (a tool waits), the window says "idle"
const N = mkTab("N") // the turn of the question ended: the form is lost; the reminder is held, ONE repeat stands
const A = mkTab("A") // the owner's answer from outside the window: it goes first and alone
const D = mkTab("D") // no form: a reminder stands in the queue, the second is not queued
const L = mkTab("L") // border: a lost question with no pending tool is repeated
const Q = mkTab("Q") // border: no form, the turn ended - the reminder goes
const H = mkTab("H") // border: a letter of a person goes although a question waits
const K = mkTab("K") // service letters of other kinds wait for the end of the wait
const P = mkTab("P") // border: a letter with the owner's answer is not held by an open form

mkdirSync(core.WINDOWS, { recursive: true })
const WPID = 717171
const open = new Set([AUTH, ...names])
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [...open].map((sessionID) => ({ sessionID, active: sessionID === AUTH, busy: !!busyOf[sessionID] })) }))
beat()
const heart = setInterval(beat, 300)

const hooks = {}
const events = {}
const interrupts = []
let qn = 0
/** the queue of the OpenCode server as the plugin sees it: session_inbox rows (the test consumes them by hand, one oldest per turn) */
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text, delivery }) => {
      if (delivery === "queue") db.prepare("insert into session_inbox values (?, ?, 'user', ?, 'queue', ?, ?)").run(`inb${++qn}`, sessionID, JSON.stringify({ text }), qn, Date.now())
    },
    synthetic: async () => {},
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
    interrupt: async (input) => (interrupts.push(input), { interrupted: true }),
  },
  tool: { transform: async () => {} },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const mod = await import("../index.ts")
const stop = await mod.default.setup(ctx)

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const safe = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    cell(name, false, String(e?.stack ?? e))
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (f, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await f()) return true
    await wait(50)
  }
  return false
}
/** the texts standing in the server queue of the tab, oldest first */
const queue = (s) => db.prepare("select payload from session_inbox where session_id = ? order by enqueued_seq").all(s).map((r) => JSON.parse(r.payload).text)
const queued = (s, t) => queue(s).filter((x) => x.includes(t))
const REPEAT = "не получил ответа"
const REMIND = "Не завершено"
/** the server takes the oldest queued message of the tab into a turn */
const consume = (s) => db.prepare("delete from session_inbox where id = (select id from session_inbox where session_id = ? order by enqueued_seq limit 1)").run(s)
const put = (name, a) => (mkdirSync(oa.ANSWERS, { recursive: true }), writeFileSync(path.join(oa.ANSWERS, `${name}.json`), JSON.stringify({ id: name, at: Date.now(), ...a })))
const result = (name) => core.readJson(path.join(oa.ANSWERS, `${name}.json`))
const created = (id, session, question, options) => ({ type: "form.created", data: { form: { id, sessionID: session, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: question, options: options.map((label) => ({ label })) }] } } })
const OPTS = ["Разрешить (Recommended)", "Оставить HOLD"]
let fn = 0
const ask = (tab, text = "Разрешить ли узкий запуск?") => {
  const id = `frm_${tab}_${++fn}`
  fw.handleFormEvent(created(id, tab, text, OPTS))
  return id
}
/** the question tool of the tab is pending in the database: the last answer has a running tool and no idle row after it */
const pendingQuestion = (tab) => msg(tab, "assistant", { content: [{ type: "tool", name: "question", state: { status: "running" } }] })
/** the turn of the tab ends as OpenCode records it: a message, the idle row, the idle event */
async function endTurn(tab, content = [{ type: "tool", name: "question" }], outcome = "interrupted") {
  const c = core.readJson(core.cardFile(tab))
  core.saveCard({ ...c, busy: true, busySince: Date.now() - 50, turnStart: Date.now() - 50 })
  msg(tab, "assistant", { content })
  msg(tab, "idle", { outcome })
  await events["session.idle"]({ properties: { sessionID: tab } })
}
const letter = (to, id, text, from = core.PLUGIN_SENDER) => core.postLetter(to, { id, from_role: from, from_session: from, to, time: Date.now(), text })

// pure: the kinds of service messages and the verdicts
await safe("pure", async () => {
  cell("pure: the module queue-gate.ts exists", !!qg && typeof qg.serviceKindOf === "function" && typeof qg.verdict === "function", "no ../queue-gate.ts")
  if (!qg) return
  const mk = (id, from = core.PLUGIN_SENDER) => ({ id, from_session: from })
  cell("pure: nudge, repeat, idle, hung-resume, gate, stall, accepted, resume, retry are service kinds", ["1792-nudge-q1", "form-repeat-frm_a-1", "idle-ses_a-1", "hung-resume-ses_a-1", "gate-ses_a-1", "stall-left-nova-3-x", "stale-accepted-nova-3-9", "resume-ses_a-1", "retry-ses_a-1"].every((id) => !!qg.serviceKindOf(mk(id))), "")
  cell("pure: a letter of a person or tab is no service kind, even with such an id", !qg.serviceKindOf(mk("1792-nudge-q1", "ses_other")) && !qg.serviceKindOf(mk("owner-answer-1")) && !qg.serviceKindOf(mk("task-proj-1-1")) && !qg.serviceKindOf(mk("watch-1")), "")
  const f = (x) => ({ formOpen: false, repeatRids: [], standing: [], queueRows: 0, answerPass: false, livePending: false, ...x })
  cell("pure: a reminder goes with nothing in the way", qg.verdict(mk("1-nudge-q"), f()) === "send", qg.verdict(mk("1-nudge-q"), f()))
  cell("pure: an open form holds a reminder", qg.verdict(mk("1-nudge-q"), f({ formOpen: true })) === "hold", "")
  cell("pure: a reminder of a kind that stands in the queue is dropped", qg.verdict(mk("1-nudge-q"), f({ standing: ["nudge"] })) === "drop", "")
  cell("pure: the answer of the owner in the pass holds the service letters", qg.verdict(mk("1-nudge-q"), f({ answerPass: true })) === "hold", "")
  cell("pure: a repeat of an open lost form goes", qg.verdict(mk("form-repeat-frm_a-1"), f({ formOpen: true, repeatRids: ["frm_a"] })) === "send", "")
  cell("pure: a repeat of a form that is closed is dropped", qg.verdict(mk("form-repeat-frm_a-1"), f({ repeatRids: [] })) === "drop", "")
  cell("pure: a repeat waits while anything stands in the queue", qg.verdict(mk("form-repeat-frm_a-1"), f({ formOpen: true, repeatRids: ["frm_a"], queueRows: 1 })) === "hold", "")
  cell("pure: a letter of a person is always sent", qg.verdict(mk("x-1", "ses_other"), f({ formOpen: true, standing: ["nudge"], answerPass: true, queueRows: 3 })) === "send", "")
  cell("pure: the answer of the owner is always sent", qg.verdict(mk("owner-answer-1"), f({ formOpen: true, standing: ["nudge"], answerPass: true, queueRows: 3 })) === "send", "")
  const day = 24 * 3_600_000
  cell("pure: the kind of a standing message is read from the text of the queue", qg.kindsOfTexts?.(["⚙  16:22 · crew → #94 исполнитель nova.worker (служебное, не отвечай)\nНе завершено: задача #94"]).includes("nudge") && qg.kindsOfTexts(["✉  16:22 · nova.integrator → x\nНе завершено: это письмо человека"]).length === 0, "")
  void day
})

// ---------- S. the source: the question is alive (the tool waits), the window says "idle" ----------
await safe("S", async () => {
  pendingQuestion(S)
  ask(S)
  await wait(2500)
  cell("S: a live question (a `question` tool still pending) - no repeat goes into the queue in 2.5 s", queued(S, REPEAT).length === 0, JSON.stringify(queue(S).map((x) => x.slice(0, 60))))
  cell("S: ... and no service message at all", queue(S).length === 0, JSON.stringify(queue(S).map((x) => x.slice(0, 60))))
})

// ---------- N. the turn ended with the question open: ONE repeat, no reminder ----------
await safe("N", async () => {
  ask(N)
  await endTurn(N)
  await until(() => queued(N, REPEAT).length >= 1, 4000)
  await wait(1800)
  cell("N: a lost question is repeated (one repeat is queued)", queued(N, REPEAT).length >= 1, JSON.stringify(queue(N).map((x) => x.slice(0, 60))))
  cell("N: ... only ONE repeat while it stands in the queue (the gap passed several times)", queued(N, REPEAT).length === 1, `${queued(N, REPEAT).length} repeats`)
  cell("N: the reminder 'Не завершено' is not queued behind the open question", queued(N, REMIND).length === 0, JSON.stringify(queue(N).map((x) => x.slice(0, 60))))
  consume(N)
  cell("N: the repeat taken by the server, the question still lost: the next repeat follows (task 040 works)", await until(() => queued(N, REPEAT).length === 1, 4000), JSON.stringify(queue(N).map((x) => x.slice(0, 60))))
})

// ---------- A. the owner answers from outside the window ----------
await safe("A", async () => {
  const id = ask(A)
  busyOf[A] = true // the turn with the question runs; the letters wait for its end
  beat()
  put("ans-A", { form: id, session: A, option: "1", quote: "по рекомендации (владелец, чат оркестратора, 2026-10-17)" })
  cell("A: the answer is applied", await until(() => result("ans-A")?.status === "applied", 6000), JSON.stringify(result("ans-A")))
  busyOf[A] = false // the interrupt ended the turn
  beat()
  await endTurn(A)
  cell("A: the letter with the answer is queued", await until(() => queued(A, "Ответ владельца").length >= 1, 6000), JSON.stringify(queue(A).map((x) => x.slice(0, 60))))
  await wait(1200)
  cell("A: no 'Не завершено' in the same pass or after it, before a working turn", queued(A, REMIND).length === 0, JSON.stringify(queue(A).map((x) => x.slice(0, 80))))
  cell("A: the answer stands first and alone in the queue (one row, no reminder in it)", queue(A).length === 1 && queue(A)[0].includes("Ответ владельца") && !queue(A)[0].includes(REMIND), JSON.stringify(queue(A).map((x) => x.slice(0, 80))))
  // the reminders resume after a working turn of the tab
  consume(A)
  msg(A, "assistant", { content: [{ type: "tool", name: "bash" }, { type: "text", text: "делаю по ответу" }] })
  await endTurn(A, [{ type: "text", text: "остановился" }], "succeeded")
  cell("A: after a working turn the reminder resumes", await until(() => queued(A, REMIND).length >= 1, 5000), JSON.stringify(queue(A).map((x) => x.slice(0, 80))))
})

// ---------- D. no form: a reminder stands in the queue, the second is not queued ----------
await safe("D", async () => {
  await endTurn(D, [{ type: "text", text: "остановился" }], "succeeded")
  cell("D: control - a turn end with no form gets the reminder", await until(() => queued(D, REMIND).length === 1, 5000), JSON.stringify(queue(D).map((x) => x.slice(0, 60))))
  await wait(60)
  await endTurn(D, [{ type: "text", text: "снова остановился" }], "succeeded")
  await wait(1200)
  cell("D: the second reminder of the same kind is not queued while the first stands", queued(D, REMIND).length === 1, `${queued(D, REMIND).length} reminders`)
  consume(D)
  await endTurn(D, [{ type: "text", text: "и ещё раз" }], "succeeded")
  cell("D: the first taken by the server - the next reminder is queued again", await until(() => queued(D, REMIND).length === 1, 5000), JSON.stringify(queue(D).map((x) => x.slice(0, 60))))
})

// ---------- borders ----------
await safe("L", async () => {
  ask(L) // no pending tool, the window says idle, no turn: the question is lost
  cell("L: a lost question (no turn, no pending tool) is repeated", await until(() => queued(L, REPEAT).length === 1, 5000), JSON.stringify(queue(L).map((x) => x.slice(0, 60))))
})
await safe("Q", async () => {
  await endTurn(Q, [{ type: "text", text: "остановился" }], "succeeded")
  cell("Q: no question waits - the reminder goes", await until(() => queued(Q, REMIND).length === 1, 5000), JSON.stringify(queue(Q).map((x) => x.slice(0, 60))))
})
await safe("H", async () => {
  pendingQuestion(H)
  ask(H)
  letter(H, "human-1", "Привет от интегратора: уточни по задаче.", "ses_other_tab")
  cell("H: a letter of a person goes although a question waits", await until(() => queued(H, "уточни по задаче").length === 1, 5000), JSON.stringify(queue(H).map((x) => x.slice(0, 60))))
})
await safe("K", async () => {
  ask(K)
  pendingQuestion(K)
  letter(K, "idle-ses_K-1", "Ты простаиваешь 30 мин: у задачи 5 нет идущей сессии — и нет вопроса владельцу.")
  letter(K, "stall-left-proj-9-abc", "У принятой задачи 009 остались хвосты — убери их")
  await wait(2000)
  cell("K: the reminders about idle time and cleanup wait in the mailbox while the question is open", queue(K).length === 0 && existsSync(path.join(core.INBOX, core.safeKey(K), "idle-ses_K-1.json")) && existsSync(path.join(core.INBOX, core.safeKey(K), "stall-left-proj-9-abc.json")), JSON.stringify({ queue: queue(K).map((x) => x.slice(0, 50)), inbox: existsSync(path.join(core.INBOX, core.safeKey(K))) }))
  for (const f of fw.allForms().filter((x) => x.session === K)) fw.removeForm(K, f.form.id) // the owner answered inside the window
  cell("K: ... they are not lost: after the wait they are queued", await until(() => queued(K, "простаиваешь").length === 1 && queued(K, "хвосты").length === 1, 6000), JSON.stringify(queue(K).map((x) => x.slice(0, 50))))
})
await safe("P", async () => {
  const id = ask(P)
  letter(P, "owner-answer-by-hand-1", "Ответ владельца на ваш вопрос «x»: Да. Вопросник закрыт прерыванием хода; не задавайте этот вопрос снова, продолжайте с этим ответом.")
  void id
  cell("P: the letter with the owner's answer goes although a form is open", await until(() => queued(P, "Ответ владельца").length === 1, 5000), JSON.stringify(queue(P).map((x) => x.slice(0, 60))))
})

// ---------- the threshold: the reminders resume after a working turn or after stall_minutes ----------
await safe("T", async () => {
  if (!qg) return cell("T: the module queue-gate.ts exists", false, "no ../queue-gate.ts")
  const al = await import("../answer-loop.ts")
  const Z = "ses_Z"
  const t0 = Date.now()
  al.noteAnswered(Z, { id: "frm_z", at: t0 - 1000 }, "owner-answer-z", t0)
  const no = async () => false
  const yes = async () => true
  const min = 60_000
  cell("T: right after the answer the reminder waits", !!(await qg.nudgeHold(Z, { now: t0 + 5_000, stallMs: 30 * min, worked: no })), "no hold")
  cell("T: ... after a working turn it does not", (await qg.nudgeHold(Z, { now: t0 + 5_000, stallMs: 30 * min, worked: yes })) === undefined, "held")
  cell("T: ... after stall_minutes it does not, though the tab did no work", (await qg.nudgeHold(Z, { now: t0 + 31 * min, stallMs: 30 * min, worked: no })) === undefined, "held")
  cell("T: ... just before stall_minutes it still waits", !!(await qg.nudgeHold(Z, { now: t0 + 29 * min, stallMs: 30 * min, worked: no })), "no hold")
  al.noteDelivered(Z, "owner-answer-z", t0 + 20 * min)
  cell("T: the threshold counts from the moment the letter was handed to the tab", !!(await qg.nudgeHold(Z, { now: t0 + 31 * min, stallMs: 30 * min, worked: no })) && (await qg.nudgeHold(Z, { now: t0 + 51 * min, stallMs: 30 * min, worked: no })) === undefined, "wrong threshold")
})

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-no-queue-behind-question.test: FAIL ${fail}` : "crew-no-queue-behind-question.test ok")
process.exit(fail ? 1 : 0)

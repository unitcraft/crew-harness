// Self-test of the loop "question -> answer -> reminder -> the same question", task 078 (node >= 24):  node test/crew-answer-loop.test.mjs
// Source: 2026-10-17 the tab of task #94 asked the owner the same question again and again, though the owner answered it four times
// from outside the window (crew-answer, task 059): the OpenCode queue of the tab held old service messages ahead of the answers, so the
// model saw "ask again" / "continue" and called `question` each time. The plugin cannot see the queue, so it counts what it can see:
// a form of the tab made AFTER a delivered answer of the owner, with no working turn (a tool call other than `question`) in between,
// and the same ask (the same text, or options that differ only in the wording of a label). The third such form in a row opens the loop:
//   - the reminders "Не завершено" and the repeats of a lost question stop (the answers of the owner still reach the tab);
//   - the owner gets ONE row (state owner, the mark ↻, the counter `loop` in /crew, a line in /ask) and the author of the task ONE letter;
//   - a working turn of the tab, the owner's word in the tab, a reassigned task or a closed tab clears the loop.
// Borders that must stay quiet: the answer was not delivered (a busy tab keeps its letters), a working turn between the questions, other
// questions, only two forms after answers. Red probe: the first run before the code (every "loop" cell red, the borders green).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-answer-loop-"))
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
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ push_empty_turns: 50, push_max: 50, stall_minutes: 0 }))

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const fw = await import("../form-wait.ts")
const oa = await import("../owner-answer.ts")
const status = await import("../status.ts")
let al
try {
  al = await import("../answer-loop.ts")
} catch (e) {
  al = undefined
}

const AUTH = "sesLOOPAUTH"
db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(AUTH, proj, AUTH)
core.saveCard({ session: AUTH, role: "integrator", auto: false, title: AUTH, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
const busyOf = {}
const names = []
const taskOf = {}
function mkTab(name, { busy = false } = {}) {
  const id = `ses_${name}`
  names.push(id)
  busyOf[id] = busy
  db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(id, proj, id)
  core.saveCard({ session: id, role: "worker", auto: false, title: id, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
  const t = tasks.createTask({ project: "proj", title: `work ${name}`, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: AUTH, author_role: "proj.integrator", qid: `q-${name}`, status: "running", kind: "assign", directory: proj, executor: id })
  core.saveCard({ ...core.readJson(core.cardFile(id)), task: { project: "proj", n: t.n } })
  core.addObligation(id, { qid: t.qid, from_session: AUTH, from_role: "proj.integrator", at: Date.now(), nudges: 0 })
  taskOf[id] = t
  return id
}
const A = mkTab("A") // the source: the live shape of the tab of task #94
const A2 = mkTab("A2") // a loop cleared by a working turn
const A3 = mkTab("A3") // a loop cleared by the owner's word
const A4 = mkTab("A4") // a loop cleared by a reassigned task
const A5 = mkTab("A5") // a loop cleared by a closed tab
const B = mkTab("B", { busy: true }) // the answers are not delivered: the tab is busy, the letters wait
const C = mkTab("C") // a working turn between the questions
const D = mkTab("D") // other questions
const E = mkTab("E") // two forms after answers only; also the control of the reminders

mkdirSync(core.WINDOWS, { recursive: true })
const WPID = 616161
const open = new Set([AUTH, ...names])
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [...open].map((sessionID) => ({ sessionID, active: sessionID === AUTH, busy: !!busyOf[sessionID] })) }))
beat()
const heart = setInterval(beat, 300)

const hooks = {}
const events = {}
const delivered = []
const interrupts = []
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
    synthetic: async ({ sessionID, text }) => delivered.push({ sessionID, text, synthetic: true }),
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
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const put = (name, a) => (mkdirSync(oa.ANSWERS, { recursive: true }), writeFileSync(path.join(oa.ANSWERS, `${name}.json`), JSON.stringify({ id: name, at: Date.now(), ...a })))
const result = (name) => core.readJson(path.join(oa.ANSWERS, `${name}.json`))
const created = (id, session, question, options) => ({ type: "form.created", data: { form: { id, sessionID: session, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: question, options: options.map((label) => ({ label })) }] } } })
const stateOf = (s) => status.statusOf({ card: core.readJson(core.cardFile(s)), busy: false, asked: [], now: Date.now() })

// the live shape: the labels drift (task 078), the texts differ every time
const O1 = ["Разрешить Phase 1 (Recommended)", "Оставить HOLD"]
const O2 = ["Разрешить (Recommended)", "Оставить HOLD"]
const LIVE = [
  ["Разрешить ли узкий Phase‑1 запуск через machine queue: собрать только три runtime static archive?", O1],
  ["Приёмщик независимо проверил v7 и считает manifest достаточным. Разрешить ли сборку трёх archives?", O1],
  ["Разрешить ли узкий Phase 1 в общей machine queue: собрать только три runtime static archives?", O1],
  ["Phase‑1 GO? Разрешить только machine-queue сборку runtime archives?", O2],
  ["Разрешить ли узкий Phase 1 через machine queue: собрать только runtime archives?", O1],
]
let n = 0
const forms = {}
/** the tab asks: a form.created event, as the window gives it */
async function ask(tab, [text, options], { work = false } = {}) {
  if (work) {
    await wait(20)
    msg(tab, "assistant", { content: [{ type: "tool", name: "bash" }, { type: "text", text: "делаю шаг" }] })
    await wait(20)
  }
  const id = `frm_${tab}_${++n}`
  fw.handleFormEvent(created(id, tab, text, options))
  forms[tab] = id
  return id
}
/** the owner answers it from outside the window (crew-answer); returns when the letter is delivered (or applied, for a busy tab) */
async function answer(tab, id, { delivery = true } = {}) {
  const name = `ans-${id}`
  put(name, { form: id, session: tab, option: "1", quote: "по рекомендации (владелец, чат оркестратора, 2026-10-17)" })
  const ok = await until(() => result(name)?.status === "applied", 8000)
  if (!ok) throw new Error(`answer ${name} not applied: ${JSON.stringify(result(name))}`)
  if (delivery && !(await until(() => existsSync(path.join(core.READ, core.safeKey(tab), `owner-answer-${name}.json`)), 8000))) throw new Error(`the letter of ${name} was not delivered`)
  await wait(40)
}
const loopOf = (s) => stateOf(s).loop
/** the turn of the tab ends as OpenCode records it: the tab was busy, a message, the idle row, the idle event (the card is set busy by hand: a model request would close an open form) */
async function endTurn(tab, content = [{ type: "tool", name: "question" }], outcome = "interrupted") {
  const c = core.readJson(core.cardFile(tab))
  core.saveCard({ ...c, busy: true, busySince: Date.now() - 50, turnStart: Date.now() - 50 })
  msg(tab, "assistant", { content })
  msg(tab, "idle", { outcome })
  await events["session.idle"]({ properties: { sessionID: tab } })
}
const settle = () => wait(700)
/** task 080: an open form holds the reminder "Не завершено" (queue-gate.ts), so a check of the reminder takes the record of the form away for the moment and puts it back */
async function withoutForm(tab, id, fn) {
  const rec = fw.allForms().find((x) => x.session === tab && x.form.id === id)
  if (rec) fw.removeForm(tab, id)
  try {
    return await fn()
  } finally {
    if (rec) fw.addForm(tab, rec.form)
  }
}
/** n rounds: ask, answer, delivered; the (n+1)-th ask is made and not answered */
async function rounds(tab, list, opt = {}) {
  let last
  for (let i = 0; i < list.length; i++) {
    last = await ask(tab, list[i], opt)
    if (i < list.length - 1) await answer(tab, last, opt)
  }
  return last
}

// pure: the same ask (text, or the labels that differ only in wording)
await safe("sameAsk", async () => {
  cell("sameAsk: the module answer-loop.ts exists", !!al && typeof al.sameAsk === "function", "no ../answer-loop.ts")
  if (!al) return
  const f = (question, options) => ({ question, options })
  cell("sameAsk: the same text and options", al.sameAsk(f("Вливать?", ["Да", "Нет"]), f("вливать?  ", ["да", "нет"])), "")
  cell("sameAsk: other text, the same options", al.sameAsk(f("Вливать?", ["Да (Recommended)", "Нет"]), f("Вливать сейчас?", ["Да", "Нет"])), "")
  cell("sameAsk: a label that is a word-prefix of the other (the live drift)", al.sameAsk(f("a", O1), f("b", O2)), "")
  cell("sameAsk: other options, other text", !al.sameAsk(f("Вливать?", ["Да", "Нет"]), f("Какой цвет?", ["Красный", "Зелёный"])), "")
  cell("sameAsk: a different number of options", !al.sameAsk(f("a", ["Да", "Нет"]), f("b", ["Да", "Нет", "Позже"])), "")
  cell("sameAsk: a label that only starts with the same letters is another label", !al.sameAsk(f("a", ["Разрешить", "Нет"]), f("b", ["Разрешитель", "Нет"])), "")
  cell("sameAsk: the same free text, no options", al.sameAsk(f("Что дальше?", []), f("что  дальше?", [])), "")
  cell("sameAsk: no text and no options is no ask", !al.sameAsk(f(undefined, undefined), f(undefined, undefined)), "")
})

// ---------- A. the source: the live shape, five asks, four answers ----------
const asksA = []
await safe("A", async () => {
  // the first two asks and answers: no loop yet
  asksA.push(await ask(A, LIVE[0]))
  await answer(A, asksA[0])
  asksA.push(await ask(A, LIVE[1]))
  await settle()
  cell("A: after one answer and one more ask there is no loop", !loopOf(A), JSON.stringify(stateOf(A).loop))
  // control: before the loop the end of a turn gets the reminder (the nudge works in this setup)
  await withoutForm(A, asksA[1], async () => {
    await endTurn(A)
    cell("A: before the loop a turn end gets the reminder 'Не завершено'", await until(() => got(A, "Не завершено").length >= 1, 4000), JSON.stringify(delivered.filter((d) => d.sessionID === A).map((d) => d.text.slice(0, 80))))
  })
  await answer(A, asksA[1])
  asksA.push(await ask(A, LIVE[2]))
  await settle()
  cell("A: the second ask after an answer (two links) opens no loop", !loopOf(A), JSON.stringify(stateOf(A).loop))
  await answer(A, asksA[2])
  asksA.push(await ask(A, LIVE[3]))
  // the third ask after delivered answers, with a drifted label: the loop is open
  const opened = await until(() => !!loopOf(A), 4000)
  cell("A: the third ask after answers opens the loop", opened, JSON.stringify(stateOf(A)))
  // the repeats of a lost question that went before the loop (the times of this test are short) are not counted below
  const repeats0 = got(A, "не получил ответа").length
  const st = stateOf(A)
  cell("A: the owner row: state owner, the mark ↻, the line names the question and the number of answers", st.state === "owner" && st.loop?.n === 3 && status.markOf(st) === "↻" && /вкладка зациклилась на вопросе/.test(st.detail) && /Phase‑1 GO/.test(st.detail) && /ответ дан 3 раза/.test(st.detail), JSON.stringify({ state: st.state, loop: st.loop, mark: status.markOf(st), detail: st.detail }))
  cell("A: the line offers the way out (reassign, or write to the tab)", /crew_task reassign/.test(st.detail) && /напишите вкладке/.test(st.detail), st.detail)
  cell("A: /crew counts the loop: `loop: 1`", /loop: 1/.test(status.formatStatuses([st], Date.now())), status.formatStatuses([st], Date.now()))
  cell("A: /ask names it once", (fw.askText().match(/зациклилась на вопросе/g) ?? []).length === 1, fw.askText())
  // the author of the task: ONE letter
  await until(() => got(AUTH, "зациклился на вопросе").length >= 1, 4000)
  await wait(600)
  const lt = got(AUTH, "зациклился на вопросе")
  cell("A: the author gets ONE letter: the tab, the question, the answers, reassign with the answer in the goal", lt.length === 1 && /ответил 3 раза/.test(lt[0].text) && /crew_task \{action: "reassign"/.test(lt[0].text) && /ses_A/.test(lt[0].text) && /Phase‑1 GO/.test(lt[0].text), JSON.stringify(lt.map((x) => x.text.slice(0, 300))))
  // the reminders stop
  const before = got(A, "Не завершено").length
  await withoutForm(A, asksA[3], async () => {
    await endTurn(A)
    await wait(900)
  })
  cell("A: while the loop is open the end of a turn gets no reminder", got(A, "Не завершено").length === before, `${before} -> ${got(A, "Не завершено").length}`)
  // a lost question is not repeated either
  const open4 = asksA[3]
  fw.updateForm(A, open4, (f) => void (f.cancelled = Date.now() - 1000))
  await wait(1500)
  cell("A: while the loop is open a cancelled question gets no repeat letter", opened && got(A, "не получил ответа").length === repeats0, `${repeats0} -> ${got(A, "не получил ответа").length}`)
  // the owner's answer still reaches the tab, and the number grows
  await answer(A, open4)
  cell("A: the answer of the owner is still delivered while the loop is open", existsSync(path.join(core.READ, core.safeKey(A), `owner-answer-ans-${open4}.json`)), "not in read/")
  asksA.push(await ask(A, LIVE[4]))
  await until(() => loopOf(A)?.n === 4, 4000)
  cell("A: the fifth ask: the same loop, the number of answers grows to 4, still one letter", loopOf(A)?.n === 4 && got(AUTH, "зациклился на вопросе").length === 1, JSON.stringify({ loop: loopOf(A), letters: got(AUTH, "зациклился на вопросе").length }))
})

// ---------- the clearing: a working turn, the owner's word, a reassigned task, a closed tab ----------
async function loopOn(tab) {
  await rounds(tab, [LIVE[0], LIVE[1], LIVE[2], LIVE[3]])
  return until(() => !!loopOf(tab), 4000)
}
await safe("clear", async () => {
  const [l2, l3, l4, l5] = await Promise.all([loopOn(A2), loopOn(A3), loopOn(A4), loopOn(A5)])
  cell("clear: four more loops open", l2 && l3 && l4 && l5, JSON.stringify({ l2, l3, l4, l5 }))
  await wait(200)
  // 1. a working turn of the tab (a tool call other than question)
  msg(A2, "assistant", { content: [{ type: "tool", name: "bash" }, { type: "text", text: "приступаю к сборке" }] })
  cell("clear: a working turn of the tab clears the loop", l2 && (await until(() => !loopOf(A2), 4000)), JSON.stringify(stateOf(A2).loop))
  cell("clear: ... and the row of the owner goes back to the form of the tab", l2 && stateOf(A2).state === "owner" && !/зациклилась/.test(stateOf(A2).detail) && status.markOf(stateOf(A2)) === "?", JSON.stringify(stateOf(A2)))
  // a call of `question` alone is not work
  msg(A3, "assistant", { content: [{ type: "tool", name: "question" }] })
  await settle()
  cell("clear: a turn with only `question` keeps the loop", l3 && !!loopOf(A3), JSON.stringify(stateOf(A3).loop))
  // 2. the owner writes in the tab
  msg(A3, "user", { text: "я тут, продолжай по ответу выше" })
  cell("clear: the owner's word in the tab clears the loop", l3 && (await until(() => !loopOf(A3), 4000)), JSON.stringify(stateOf(A3).loop))
  // 3. the task goes to another session
  const t4 = tasks.loadTask("proj", taskOf[A4].n)
  t4.executor = "ses_other_executor"
  tasks.saveTask(t4)
  cell("clear: a reassigned task clears the loop", l4 && (await until(() => !loopOf(A4), 4000)), JSON.stringify(stateOf(A4).loop))
  // 4. the tab is closed
  open.delete(A5)
  beat()
  cell("clear: a closed tab clears the loop", l5 && (await until(() => !loopOf(A5), 4000)), JSON.stringify(stateOf(A5).loop))
  cell("clear: no loop of A, the others stay as they were", !!loopOf(A), JSON.stringify(stateOf(A).loop))
})

// ---------- borders: no loop ----------
await safe("B", async () => {
  // B: the tab is busy, the letters wait in the mailbox: the answers are not delivered, the tab asks again
  const ids = []
  for (const q of LIVE.slice(0, 4)) {
    const id = await ask(B, q)
    ids.push(id)
    if (ids.length < 4) await answer(B, id, { delivery: false })
  }
  await settle()
  cell("B: answers not delivered (the tab is busy, the letters wait) - no loop", !loopOf(B) && !got(AUTH, "ses_B").length, JSON.stringify(stateOf(B).loop))
  cell("B: ... the letters are still in the mailbox (nothing was delivered)", !existsSync(path.join(core.READ, core.safeKey(B), "owner-answer-ans-" + ids[0] + ".json")), "delivered")
})
await safe("C", async () => {
  // C: the same Да/Нет with other texts, but a working turn between the questions
  const YN = ["Да (Recommended)", "Нет"]
  let id = await ask(C, ["Вливать в main?", YN])
  for (const text of ["Запускать полный набор?", "Удалять ветку после слияния?", "Обновлять README?"]) {
    await answer(C, id)
    id = await ask(C, [text, YN], { work: true })
  }
  await settle()
  cell("C: a working turn between the questions - no loop", !loopOf(C), JSON.stringify(stateOf(C).loop))
})
await safe("D", async () => {
  // D: other questions with other options, no work between them
  const list = [
    ["Вливать в main?", ["Да", "Нет"]],
    ["Какой цвет у кнопки?", ["Красный", "Зелёный", "Синий"]],
    ["Сколько потоков взять?", ["Два", "Четыре"]],
    ["Куда класть отчёт?", ["В папку задачи", "В scratch", "Не класть"]],
  ]
  await rounds(D, list)
  await settle()
  cell("D: other questions with other options - no loop", !loopOf(D), JSON.stringify(stateOf(D).loop))
})
await safe("E", async () => {
  // E: only two forms after answers (the third ask is not made yet)
  await rounds(E, [LIVE[0], LIVE[1], LIVE[2]])
  await settle()
  cell("E: two forms after answers - no loop", !loopOf(E), JSON.stringify(stateOf(E).loop))
  // the control of the reminders: no loop, the same turn end gets the reminder
  await withoutForm(E, forms[E], async () => {
    await endTurn(E)
    cell("E: control - without a loop the end of a turn gets the reminder", await until(() => got(E, "Не завершено").length >= 1, 4000), "no reminder")
  })
  // the control of the repeat: a cancelled question of a tab with no loop is returned to it
  fw.updateForm(E, forms[E], (f) => void (f.cancelled = Date.now() - 1000))
  cell("E: control - a cancelled question of a tab with no loop is repeated", await until(() => got(E, "не получил ответа").length >= 1, 5000), "no repeat")
})

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-answer-loop.test: FAIL ${fail}` : "crew-answer-loop.test ok")
process.exit(fail ? 1 : 0)

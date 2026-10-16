// Self-test of task 064, items 9 and 10 (node >= 24):  node test/crew-owner-wait.test.mjs
// Item 9 (the owner, 2026-10-17, «по рекомендации»): a tab bound to a closed task (the card keeps task {n: 73}, the task was cancelled)
//   is shown by its role, not as the task's executor, in the rows of the panel and in "Ждут вас"; an integrator tab is shown by its role
//   always; the plugin drops the binding of a tab of the owner (not spawned) once the task is closed.
// Item 10 (the owner, 2026-10-17: «Это нарушает правило из задачи 062: остановка на ваших воротах должна заканчиваться вопросом -
//   исправь»): a turn of a tab of the owner ended with a phrase of waiting for the owner's decision and no question form is open -
//   ONE letter to the tab «задай вопрос инструментом question», the gate mark ⚠ «ждёт вашего решения, вопроса нет» instead of
//   «ждёт вас»; an open question, the owner's word or a working turn clears it. A question in text («?» at the end) is a question: no
//   letter. A phrase that waits for another tab (the integrator), and a task session, get nothing.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-owner-wait-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FORM_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))

let fail = 0
const cell = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const core = await import("../core.ts")
const fw = await import("../form-wait.ts")
const status = await import("../status.ts")
const tasks = await import("../tasks.ts")

const NOW = Date.now()
const putTask = (project, n, st, extra = {}) => {
  mkdirSync(path.dirname(tasks.taskFile(project, n)), { recursive: true })
  writeFileSync(tasks.taskFile(project, n), JSON.stringify({ n, project, title: `задача ${n}`, slug: `t${n}`, author: "sesAUTH", author_role: "integrator", qid: `q${n}`, status: st, kind: "assign", priority: "P2", executors: [], attempt: 1, directory: proj, history: [], created: NOW - 3_600_000, updated: NOW - 3_600_000, ...extra }))
}

// ---- item 9: the status (pure)
{
  putTask("nova", 73, "cancelled", { executors: ["sesINT9"] })
  putTask("nova", 5, "running", { executor: "sesEX9" })
  const phrase = "#85 ждёт отдельного решения владельца о возобновлении работы."
  const st = (card, extra = {}) => status.statusOf({ card: { project: "nova", auto: false, directory: proj, repo: "nova", pid: 1, updated: NOW, title: card.session, ...card }, busy: false, asked: [], now: NOW, watches: [], ...extra })
  const integ = st({ session: "sesINT9", role: "integrator", task: { project: "nova", n: 73 } }, { end: { at: NOW - 60_000, text: phrase, ownerAfter: false } })
  cell("9a the source: an integrator bound to a cancelled task has no task in its status", !integ.task, JSON.stringify(integ.task))
  const side = status.sidebarLines([integ], NOW, "nova")
  const printed = side.rows.map((r) => status.sideText(r))
  cell("9b «Ждут вас» names the integrator, not «#73 исп»", printed.some((l) => /nova интегр\./.test(l)) && !printed.some((l) => l.includes("#73")), JSON.stringify(printed))
  cell("9c its row is the integrator's", side.rows.some((r) => r.who === "интегр."), JSON.stringify(side.rows))
  cell("9d /crew does not name the task either", !status.formatStatuses([integ], NOW, "nova").includes("#73"), status.formatStatuses([integ], NOW, "nova"))
  const worker = st({ session: "sesW9", role: "worker", task: { project: "nova", n: 73 } })
  cell("9e any tab whose task is closed is shown by its role", !worker.task && status.sidebarLines([worker], NOW, "nova").rows.some((r) => r.who === "worker"), JSON.stringify(worker.task))
  const integOpen = st({ session: "sesINT9b", role: "integrator", task: { project: "nova", n: 5 } })
  cell("9f an integrator bound to an open task is shown by its role too", status.sidebarLines([integOpen], NOW, "nova").rows.some((r) => r.who === "интегр.") && !status.sidebarLines([integOpen], NOW, "nova").rows.some((r) => /#5/.test(status.sideText(r))), JSON.stringify(status.sidebarLines([integOpen], NOW, "nova").rows))
  const ex = st({ session: "sesEX9", role: "worker", task: { project: "nova", n: 5 }, spawned: { by: "sesAUTH", task: "x", tier: "light", status: "running", at: NOW } })
  cell("9g the executor of an open task is still shown by the task", ex.task?.n === 5 && status.sidebarLines([ex], NOW, "nova").rows.some((r) => r.who === "#5 исп"), JSON.stringify(ex.task))
}

// ---- the plugin
const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
const SESS = ["sesOW1", "sesOW2", "sesOW3", "sesOW4", "sesOW5", "sesOW6", "sesOW7"]
for (const s of SESS) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, proj, s)

const mod = await import("../index.ts")
const hooks = {}
const tools = {}
const prompts = []
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async (p) => void prompts.push(p),
    synthetic: async () => {},
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  command: { list: async () => [], transform: async () => {} },
  events: { on: async () => {} },
}
const WPID = 646464
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: SESS.map((sessionID) => ({ sessionID, active: true, busy: false })) }))
beat()
const heart = setInterval(beat, 300)

const stop = await mod.default.setup(ctx)
for (const s of SESS) await hooks.context({ sessionID: s, system: [], model: { id: "opus", providerID: "claude-code" } })
const card = (s) => core.readJson(core.cardFile(s))
const idleTab = (s) => core.saveCard({ ...card(s), busy: false })
const endTurn = async (s, text, at = Date.now(), tool = false) => {
  msg(s, "assistant", { content: [...(tool ? [{ type: "tool", tool: "bash" }] : []), { type: "text", text }] }, at)
  msg(s, "idle", { outcome: "completed" }, at + 1)
  idleTab(s)
}
const letters = (s) => prompts.filter((p) => p.sessionID === s && /Ты ждёшь решения владельца, но вопроса нет/.test(p.text))
const stOf = (s) => core.readJson(path.join(status.STATUS, `${s}.json`))
const T0 = Date.now() - 60_000
for (const s of SESS) {
  msg(s, "user", { text: "#85 чего ждёт?" }, T0)
  msg(s, "assistant", { content: [{ type: "text", text: "смотрю" }] }, T0 + 1)
}
const SOURCE = "#85 ждёт отдельного решения владельца о возобновлении работы.\nВозобновлять работу без нового разрешения нельзя."

// item 10: the source - a tab of the owner ends with the phrase, no question form
await endTurn("sesOW1", SOURCE, Date.now() + 100)
await wait(2500)
const l1 = letters("sesOW1")
cell("10a the source: ONE letter to the tab - the question tool, a recommendation, a reason", l1.length === 1 && /задай его сейчас инструментом question — вопрос, рекомендация, довод/.test(l1[0].text), JSON.stringify(prompts.map((p) => [p.sessionID, p.text.slice(0, 90)])))
const s1 = stOf("sesOW1")
cell("10b the status: the gate mark ⚠ «ждёт вашего решения, вопроса нет», not «ждёт вас»", s1?.state === "owner" && s1.gate === true && status.markOf(s1) === "⚠" && /ждёт вашего решения, вопроса нет/.test(s1.detail) && !/ждёт вас с/.test(s1.detail), JSON.stringify(s1))
const p1 = status.sidebarLines([s1], Date.now(), s1?.project).rows.map((r) => status.sideText(r))
cell("10c the panel: «Ждут вас» marks it ⚠, its row says no question", p1.some((l) => l.startsWith("⚠ ")) && p1.some((l) => /вопроса нет/.test(l)), JSON.stringify(p1))
await wait(1500)
cell("10d no second letter for the same episode", letters("sesOW1").length === 1, String(letters("sesOW1").length))
// an empty turn in answer to the letter (no work, no question) keeps the mark and gives no letter
await endTurn("sesOW1", "Понял.", Date.now() + 100)
await wait(1500)
cell("10e an empty turn keeps the mark, no new letter", stOf("sesOW1")?.gate === true && letters("sesOW1").length === 1, JSON.stringify([stOf("sesOW1"), letters("sesOW1").length]))
msg("sesOW1", "user", { text: "возобновляй #85" }, Date.now() + 100)
await wait(1500)
cell("10f the owner's word clears the mark", !stOf("sesOW1")?.gate, JSON.stringify(stOf("sesOW1")))

// a question in text: the owner sees it and can answer by a word - no letter, the ordinary «ждёт вас»
await endTurn("sesOW2", "#85 ждёт решения.\n\nВозобновить #85?", Date.now() + 100)
await wait(2000)
cell("10g a question at the end of the turn is a question: no letter, ordinary owner state with ?", letters("sesOW2").length === 0 && stOf("sesOW2")?.state === "owner" && !stOf("sesOW2")?.gate && status.markOf(stOf("sesOW2")) === "?", JSON.stringify([letters("sesOW2").length, stOf("sesOW2")]))

// a question form is open: no letter, no mark
fw.handleFormEvent({ type: "form.created", data: { form: { id: "frm_ow3", sessionID: "sesOW3", title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Возобновить #85?", options: [{ label: "Да (Recommended)" }, { label: "Нет" }] }] } } })
await endTurn("sesOW3", SOURCE, Date.now() + 100)
await wait(2000)
cell("10h a question form is open: no letter, no gate mark", letters("sesOW3").length === 0 && !stOf("sesOW3")?.gate, JSON.stringify([letters("sesOW3").length, stOf("sesOW3")]))

// a working turn clears the mark
await endTurn("sesOW4", SOURCE, Date.now() + 100)
await wait(2000)
cell("10i another tab gets its letter and the mark", letters("sesOW4").length === 1 && stOf("sesOW4")?.gate === true, JSON.stringify([letters("sesOW4").length, stOf("sesOW4")]))
await endTurn("sesOW4", "Сделал проверку, всё зелёное.", Date.now() + 100, true)
await wait(2000)
cell("10j a working turn clears the mark, no second letter", !stOf("sesOW4")?.gate && letters("sesOW4").length === 1, JSON.stringify([stOf("sesOW4"), letters("sesOW4").length]))

// a phrase that waits for another tab (the integrator) is not a wait for the owner
await endTurn("sesOW5", "Жду указаний интегратора по #85.", Date.now() + 100)
// a task session (spawned): its wait goes to the integrator (task 056), not to the owner
core.saveCard({ ...card("sesOW6"), spawned: { by: "sesOW1", task: "x", tier: "light", status: "running", at: Date.now() } })
await endTurn("sesOW6", SOURCE, Date.now() + 100)
await wait(2000)
cell("10k a phrase naming the integrator: no letter, no mark", letters("sesOW5").length === 0 && !stOf("sesOW5")?.gate, JSON.stringify([letters("sesOW5").length, stOf("sesOW5")]))
cell("10l a task session: no letter, no mark", letters("sesOW6").length === 0 && !stOf("sesOW6")?.gate, JSON.stringify([letters("sesOW6").length, stOf("sesOW6")]))

// item 9: the plugin drops the binding of a tab of the owner to a closed task
const pj = card("sesOW7")?.project ?? "proj"
putTask(pj, 73, "cancelled", { executors: ["sesOW7"] })
core.saveCard({ ...card("sesOW7"), role: "integrator", task: { project: pj, n: 73 } })
await wait(2000)
cell("9h the binding of an integrator tab to a cancelled task is dropped", card("sesOW7") && !card("sesOW7").task, JSON.stringify(card("sesOW7")))

clearInterval(heart)
stop?.()
db.close()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-owner-wait.test: FAIL ${fail}` : "crew-owner-wait.test ok")
process.exit(fail ? 1 : 0)

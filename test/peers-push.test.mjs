// Self-test of pushing stalled tabs by empty turns (plan 002, Ph.2; node >= 24):  node test/peers-push.test.mjs
// The turn facts come from OpenCode's database (session_message between two `idle` rows): a turn with a tool call
// is a working one (resets the empty counter), a turn without one is empty; push_empty_turns empty turns in a row
// or push_max reminders -> the tab is stuck: no more reminders, the asker gets a call (letter + notice). A turn
// with an owner's message gets no reminder and resets the counter. peer_task push clears "stuck". A turn cut off
// by a server restart (time_suspended, no idle) is resumed by one letter.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-push-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_POLL_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.NOVA_PEERS_DB = dbPath
delete process.env.NOVA_PEERS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "opencode-peers.json"), JSON.stringify({ push_empty_turns: 3, push_max: 8 }))

// OpenCode's tables, as much as the plugin reads
const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
for (const s of ["sesINTEG1", "sesWORK01", "sesINTER1", "ses_fail01", "ses_retry1"]) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, proj, s)
// a turn of sesINTER1 cut off by a server restart a minute ago: time_suspended, no idle
db.prepare("update session_v2 set time_suspended = ? where id = ?").run(Date.now() - 60_000, "sesINTER1")

// the interrupted session's tree has traces of a git operation cut off by the restart
mkdirSync(path.join(proj, ".git"), { recursive: true })
writeFileSync(path.join(proj, ".git", "MERGE_HEAD"), "abc")
writeFileSync(path.join(proj, ".git", "index.lock"), "")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
// sesINTER1 owes an answer from before the restart
// its card still says "busy": the turn started, and only the end of the turn (never coming) would clear it
// (a task session, no window: its "busy" comes from the card, not from a window)
core.saveCard({ session: "sesINTER1", role: "worker", auto: false, title: "sesINTER1", directory: proj, repo: "proj", project: "proj", pid: 999999, updated: Date.now(), busy: true, busySince: Date.now() - 60_000, spawned: { by: "sesINTEG1", task: "old", tier: "light", status: "running", at: Date.now() - 120_000, qid: "qOLD" } })
core.addObligation("sesINTER1", { qid: "qOLD", from_session: "sesINTEG1", from_role: "proj.integrator", at: Date.now() - 120_000, nudges: 0 })

// ses_retry1 owes a review; its last turn, before this plugin started, failed before the model (no assistant row)
core.saveCard({ session: "ses_retry1", role: "worker", auto: false, title: "ses_retry1", directory: proj, repo: "proj", project: "proj", pid: 999999, updated: Date.now() })
core.addObligation("ses_retry1", { qid: "rqOLD", from_session: "sesINTEG1", from_role: "proj.integrator", at: Date.now() - 90_000, nudges: 0, task: "приёмка #7" })
msg("ses_retry1", "user", { text: "[opencode-peers] ПРИЁМКА задачи #7" }, Date.now() - 60_000)
msg("ses_retry1", "idle", { outcome: "failed" }, Date.now() - 60_000)

const mod = await import("../index.ts")
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
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const reminders = () => got("sesWORK01", "Не завершено").length
const calls = () => got("sesINTEG1", "застряла").length

// a turn of sesWORK01 as OpenCode records it: the request (busy), messages, the idle row, the idle event
async function turn({ tools: withTool = false, owner = false } = {}) {
  await hooks.context({ sessionID: "sesWORK01", system: [], model: { id: "x", providerID: "y" } })
  msg("sesWORK01", "user", { text: owner ? "продолжай, я тут" : "[opencode-peers] Письмо соседней вкладки" })
  msg("sesWORK01", "assistant", { content: withTool ? [{ type: "tool", name: "bash" }, { type: "text", text: "сделал шаг" }] : [{ type: "text", text: "статус: работаю" }] })
  msg("sesWORK01", "idle", { outcome: "succeeded" })
  await events["session.idle"]({ properties: { sessionID: "sesWORK01" } })
  await wait()
}

const WPID = 717171
const tabs = ["sesINTEG1", "sesWORK01", "ses_fail01", "ses_retry1"].map((sessionID, i) => ({ sessionID, active: i === 0, busy: false }))
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
for (const s of ["sesINTEG1", "sesWORK01"]) {
  await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })
  msg(s, "idle", { outcome: "succeeded" })
  await events["session.idle"]({ properties: { sessionID: s } })
}
await call("peer_role", "sesINTEG1", { role: "integrator" })

// 0. the turn cut off by a restart is resumed by one letter
await wait(800)
cell("an interrupted turn gets one 'resume' letter", got("sesINTER1", "прервана перезапуском").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesINTER1")))
await wait(600)
cell("and only one", got("sesINTER1", "прервана перезапуском").length === 1, got("sesINTER1", "прервана").length)
cell("the resume letter names the git traces: the stale index.lock and the merge in progress", /index.lock/.test(got("sesINTER1", "прервана")[0]?.text ?? "") && /незаконченное слияние/.test(got("sesINTER1", "прервана")[0]?.text ?? ""), got("sesINTER1", "прервана")[0]?.text)
{
  // a worktree: .git is a file pointing to its git dir
  const { gitTraces } = await import("../review.ts")
  const wt = path.join(tmp, "wt1")
  const gd = path.join(tmp, "gitdirs", "wt1")
  mkdirSync(wt, { recursive: true })
  mkdirSync(path.join(gd, "rebase-merge"), { recursive: true })
  writeFileSync(path.join(wt, ".git"), `gitdir: ${gd}
`)
  const tr = gitTraces(wt)
  cell("gitTraces follows a worktree's .git file", tr.length === 1 && /rebase/.test(tr[0]), JSON.stringify(tr))
  cell("gitTraces of a clean tree is empty", gitTraces(tmp + "/nowhere").length === 0, "not empty")
}
cell("a turn that failed before the plugin started: one 'continue' letter", got("ses_retry1", "кончился ошибкой").length === 1 && got("ses_retry1", "приёмка #7").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "ses_retry1").map((d) => d.text.slice(0, 200))))
cell("the resume letter says how to report", got("sesINTER1", 'reply_to: "qOLD"').length === 1, got("sesINTER1", "прервана")[0]?.text)
const toPlugin = await call("peer_send", "sesINTER1", { to: "opencode-peers", text: "принял, продолжаю" })
cell("a letter to the plugin itself is refused with a hint", /это сам плагин/.test(toPlugin) && /reply_to/.test(toPlugin), toPlugin)

// the integrator gives sesWORK01 a task
await call("peer_task", "sesINTEG1", { action: "assign", session: "sesWORK01", title: "парсер", goal: "дописать парсер", criteria: "тесты зелёные" })
await wait()
const task = tasks.loadTask("proj", 1)
cell("the task reached the tab", got("sesWORK01", "ЗАДАЧА #1").length === 1, JSON.stringify(delivered.map((d) => d.sessionID)))
const obl = () => core.obligationsOf("sesWORK01").find((o) => o.qid === task.qid)

// 1. working turns: a reminder after each, never stuck. Before them: an owner's message of a turn cut off long ago
// (no idle row after it) must not make the next turn count as the owner's.
msg("sesWORK01", "user", { text: "старое сообщение владельца из оборванного хода" }, Date.now() - 120_000)
await turn({ tools: true })
await turn({ tools: true })
cell("working turns: a reminder after each", reminders() === 2, reminders())
cell("working turns keep the empty counter at zero", obl()?.empty === 0 && !obl()?.stuck, JSON.stringify(obl()))

// 2. an owner's turn: no reminder, the counter starts over
await turn({ tools: false })
cell("an empty turn: a reminder, empty 1", reminders() === 3 && obl()?.empty === 1, JSON.stringify(obl()))
await turn({ tools: true })
cell("a working turn after an empty one resets the counter", reminders() === 4 && obl()?.empty === 0, JSON.stringify(obl()))
await turn()
cell("empty again: empty 1", reminders() === 5 && obl()?.empty === 1, JSON.stringify(obl()))
await turn({ owner: true })
cell("a turn with the owner's message: no reminder", reminders() === 5, reminders())
cell("the owner's turn resets the counter", obl()?.empty === 0, JSON.stringify(obl()))

// 3. three empty turns in a row -> stuck: no reminder, a call to the asker, then silence
await turn()
await turn()
cell("two empty turns: two reminders", reminders() === 7 && obl()?.empty === 2, JSON.stringify(obl()))
await turn()
cell("the third empty turn: no reminder", reminders() === 7, reminders())
cell("the third empty turn: the tab is stuck", obl()?.stuck === true, JSON.stringify(obl()))
await wait()
cell("the asker gets a call", calls() === 1 && got("sesINTEG1", "3 хода подряд остановилась без работы").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesINTEG1").map((d) => d.text.slice(0, 160))))
const notes = readdirSync(path.join(core.NOTICES, String(WPID))).length
cell("the asker's window gets a notice", notes >= 1, notes)
cell("the task history records it", tasks.loadTask("proj", 1).history.some((h) => /застряла/.test(h.note ?? "")), JSON.stringify(tasks.loadTask("proj", 1).history))
await turn()
await turn({ tools: true })
cell("a stuck tab gets no more reminders and no second call", reminders() === 7 && calls() === 1, `${reminders()} ${calls()}`)

// 4. peer_task push clears "stuck"; reminders start again
await call("peer_task", "sesINTEG1", { action: "push", n: 1, text: "доделай" })
await wait()
cell("push wakes the tab", got("sesWORK01", "Подталкивание по задаче #1").length === 1, "no push")
cell("push clears stuck and the counters", obl()?.stuck === false && obl()?.empty === 0 && obl()?.nudges === 0, JSON.stringify(obl()))
await turn()
cell("after push an empty turn gets a reminder again", reminders() === 8, reminders())

// 5. push_max: reminders without an answer stop at the project's limit (8 here)
for (let i = 0; i < 7; i++) await turn({ tools: true })
cell("reminders up to push_max", reminders() === 15 && obl()?.nudges === 8, `${reminders()} ${JSON.stringify(obl())}`)
await turn({ tools: true })
cell("over push_max: stuck, a call 'reminders without an answer'", obl()?.stuck === true && got("sesINTEG1", "8 напоминаний остались без ответа").length === 1 && reminders() === 15, JSON.stringify(obl()))

// 5b. waiting the honest way (2026-10-06): an open peer_watch or a question waiting for its answer -> no
// reminders (executor #17 of nova got one a minute while waiting for a commit in main and took to polling in Bash)
{
  await call("peer_task", "sesINTEG1", { action: "push", n: 1 })
  const watch = await import("../watch.ts")
  const w = watch.requestWatch({ session: "sesWORK01", command: "sleep 4", cwd: proj, note: "хеш в main", minutes: 5 })
  await wait(600)
  const r0 = reminders()
  await turn()
  await turn()
  cell("an open peer_watch: no reminders", reminders() === r0, reminders() - r0)
  for (let i = 0; i < 40 && !got("sesWORK01", "хеш в main").length; i++) await wait(250)
  cell("the watch's end wakes the tab", got("sesWORK01", "хеш в main").length >= 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesWORK01").map((d) => d.text.slice(0, 80))))
  await turn()
  cell("after the watch the reminders are back", reminders() === r0 + 1, reminders() - r0)
  cell("the reminder says how to wait", /peer_watch/.test(got("sesWORK01", "Не завершено").at(-1)?.text ?? ""), got("sesWORK01", "Не завершено").at(-1)?.text)
  await call("peer_send", "sesWORK01", { to: "sesINTEG1", text: "какой хеш влит в main?", expect_reply: true })
  const r1 = reminders()
  await turn()
  cell("a question waiting for its answer: no reminders", reminders() === r1, reminders() - r1)
  void w
}

// 6. the answer settles it
await call("peer_task", "sesINTEG1", { action: "push", n: 1 })
await call("peer_send", "sesWORK01", { to: "sesINTEG1", text: "парсер готов", reply_to: task.qid })
const before = reminders()
await turn()
cell("after the report no reminders", reminders() === before && !obl(), `${reminders()} ${JSON.stringify(obl())}`)

// 7. a turn that fails BEFORE any model request (the model is unavailable): no request hook, only a failed idle row.
// The waking delivery marks the tab busy, so the end of such a turn is seen: a reminder; failing turns in a row ->
// stuck, and the call says the turns fail with an error (found live in Ph.7: a reviewer on a model the server lacks).
const failReminders = () => got("ses_fail01", "Не завершено").length
await call("peer_send", "sesINTEG1", { to: "ses_fail01", text: "проверь сборку", expect_reply: true })
await wait(800)
cell("the question reached the tab", got("ses_fail01", "проверь сборку").length === 1, JSON.stringify(delivered.map((d) => d.sessionID)))
async function failedTurn() {
  msg("ses_fail01", "user", { text: "[opencode-peers] Письмо соседней вкладки" })
  msg("ses_fail01", "idle", { outcome: "failed" })
  await wait(800) // no idle event: the database fallback of the plugin's pass finds the idle row
}
await failedTurn()
cell("a turn failed before the model: a reminder", failReminders() === 1, failReminders())
await failedTurn()
await failedTurn()
cell("three failed turns: stuck, the call says the turns fail", got("sesINTEG1", "ход падает с ошибкой").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesINTEG1").map((d) => d.text.slice(0, 200))))

// 9. a long provider turn OpenCode itself resumed after a restart (#14 nova, 2026-10-06): the assistant row is written
// at the start and updated only at the end, the card is not busy (the plugin did not start the turn). It is running:
// letters wait for its end instead of piling up in OpenCode's queue (replayed as seven empty turns after it)
{
  db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run("ses_long1", proj, "ses_long1")
  core.saveCard({ session: "ses_long1", role: "worker", auto: false, title: "ses_long1", directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now(), spawned: { by: "sesINTEG1", task: "long", tier: "light", status: "running", at: Date.now() - 3_600_000, qid: "qLONG" } })
  msg("ses_long1", "idle", { outcome: "succeeded" }, Date.now() - 3_600_000)
  msg("ses_long1", "synthetic", { text: "The server restarted while you were working." }, Date.now() - 1000)
  const at = Date.now() - 1000 // started in this process; checked 10 min later below: the row is not updated meanwhile
  db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, "ses_long1", "assistant", seq, at, at, JSON.stringify({ time: { created: at } }))
  cell("a turn started in this process and not ended is open", await core.openTurn("ses_long1", Date.now() + 600_000), "closed")
  cell("the same turn from a previous process is not (it was cut off)", !(await core.openTurn("ses_long1", Date.now() + 600_000, 300_000, Date.now())), "open")
  core.postLetter("ses_long1", { id: "long-l1", from_role: "proj.integrator", from_session: "sesINTEG1", to: "ses_long1", time: Date.now(), text: "письмо в долгий ход" })
  await wait(800)
  cell("letters wait for the end of such a turn", !got("ses_long1", "письмо в долгий ход").length, "delivered into a running turn")
  msg("ses_long1", "idle", { outcome: "succeeded" })
  cell("after its idle row the turn is over", !(await core.openTurn("ses_long1", Date.now() + 600_000)), "open")
  await wait(1200)
  cell("then the waiting letter is delivered", got("ses_long1", "письмо в долгий ход").length === 1, "still waiting")
}

// 8. OpenCode loads the plugin again in the same process for a new directory: a turn running right now (its session
// has time_suspended too, no idle yet) is not "cut off by a restart" for the new instance (found live 2026-10-05:
// two working reviewers got "работа прервана перезапуском")
db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, ?)").run("ses_run1", proj, "ses_run1", Date.now())
core.saveCard({ session: "ses_run1", role: "worker", auto: false, title: "ses_run1", directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
core.addObligation("ses_run1", { qid: "rqRUN", from_session: "sesINTEG1", from_role: "proj.integrator", at: Date.now(), nudges: 0, task: "приёмка #8" })
const stop2 = await mod.default.setup(ctx)
await wait(1500)
const resumes = ["inbox", "read"].flatMap((d) => {
  try {
    return readdirSync(path.join(core.BASE, d, "ses_run1")).filter((f) => f.startsWith("resume-"))
  } catch {
    return []
  }
})
cell("a second plugin instance does not call a running turn interrupted", resumes.length === 0, JSON.stringify(resumes))
stop2?.()

clearInterval(heart)
stop?.()
db.close()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-push.test: FAIL ${fail}` : "peers-push.test ok")
process.exit(fail ? 1 : 0)

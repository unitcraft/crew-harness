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
for (const s of ["sesINTEG1", "sesWORK01", "sesINTER1"]) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, proj, s)
// a turn of sesINTER1 cut off by a server restart a minute ago: time_suspended, no idle
db.prepare("update session_v2 set time_suspended = ? where id = ?").run(Date.now() - 60_000, "sesINTER1")

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
// sesINTER1 owes an answer from before the restart
core.saveCard({ session: "sesINTER1", role: "worker", auto: true, title: "sesINTER1", directory: proj, repo: "proj", project: "proj", pid: 999999, updated: Date.now() })
core.addObligation("sesINTER1", { qid: "qOLD", from_session: "sesINTEG1", from_role: "proj.integrator", at: Date.now() - 120_000, nudges: 0 })

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
const tabs = ["sesINTEG1", "sesWORK01", "sesINTER1"].map((sessionID, i) => ({ sessionID, active: i === 0, busy: false }))
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

// 6. the answer settles it
await call("peer_task", "sesINTEG1", { action: "push", n: 1 })
await call("peer_send", "sesWORK01", { to: "sesINTEG1", text: "парсер готов", reply_to: task.qid })
const before = reminders()
await turn()
cell("after the report no reminders", reminders() === before && !obl(), `${reminders()} ${JSON.stringify(obl())}`)

clearInterval(heart)
stop?.()
db.close()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-push.test: FAIL ${fail}` : "peers-push.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the busy rows of the side panel and of the busy flag of closed tasks (task 111; node >= 24):  node test/crew-panel-busy.test.mjs
// 1. A working session without a live task (role worker, reviewer, ...) is named by the title of its card (at most two rows, "..." at the
//    end), not only by its role; a task session and the integrator's tab are not changed; an empty title leaves the role alone.
// 2. A working session without an update of its turn for longer than long_turn_minutes (6 h; 0 - off) is shown as "завис? Nч" in the
//    accent tone, not as "работает N мин"; isFree (the choice of a window for a letter) does not change.
// 3. A closed task (cancelled, merged) or a transferred session drops the busy flag of its sessions when no turn runs in the database of
//    OpenCode; a going turn is not touched.
import { DatabaseSync } from "node:sqlite"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-panel-busy-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ spawn_limits: { worker: 8 }, inflight_limit: 8, spawn_models: { light: "kimi/k3" } }))

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))

const core = await import("../core.ts")
const status = await import("../status.ts")
const schema = await import("../config-schema.ts")
const tasksMod = await import("../tasks.ts")
const { sidebarLines, sideText, statusOf } = status
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const H = 3_600_000
const now = Date.now()
const st = (session, state, extra = {}) => ({ session, project: "nova", role: "worker", title: session, state, detail: "", watches: [], asked: [], tasks: [], updated: now, ...extra })
const printed = (v) => v.rows.map((r) => sideText(r))
// the rows of one working session on a panel of its own
const panel = (s) => sidebarLines([s], now, "nova")

// 1. the name of a working session without a task
{
  const title = "Выпустить Windows seed Carina 0.2.1"
  const v = panel(st("sW", "working", { since: now - 12 * 60_000, title }))
  const p = printed(v)
  cell("111 AC-1 a working worker without a task is named by the title of its card", p.some((l) => l.startsWith("Выпустить Windows seed Carina")), JSON.stringify(p))
  cell("111 AC-1 the role and the time stay on the state row", v.rows.some((r) => r.who === "worker" && r.what === "работает 12 мин"), JSON.stringify(v.rows))
  cell("111 AC-1 the title rows are base tone and fit the panel, none begins with a space", v.rows.filter((r) => !r.who && !r.what.startsWith("Ждут")).every((r) => r.tone === "base" && sideText(r).length <= 32 && !sideText(r).startsWith(" ")) && p.every((l) => l.length <= 32), JSON.stringify(v.rows))
  const long = "Подготовить и выпустить второй релиз Windows seed Carina с проверкой подписи установщика и обновлением документации"
  const lv = panel(st("sL", "working", { since: now - 5 * 60_000, title: long }))
  const titleRows = lv.rows.filter((r) => !r.who)
  cell("111 AC-1 a long title takes two rows at most and ends with the ellipsis", titleRows.length === 2 && titleRows[1].what.endsWith("…") && titleRows[1].what.startsWith("· ") && printed(lv).every((l) => l.length <= 32), JSON.stringify(lv.rows))
  const ev = panel(st("sE", "working", { since: now - 12 * 60_000, title: "  " }))
  cell("111 AC-1 an empty title leaves the row as before: the role only", ev.rows.length === 1 && ev.rows[0].who === "worker" && ev.rows[0].what === "работает 12 мин", JSON.stringify(ev.rows))
  const rv = panel(st("sR", "working", { since: now - 12 * 60_000, role: "reviewer", title: "Принять Carina 0.2.1" }))
  cell("111 AC-1 a reviewer without a task is named the same way", printed(rv).some((l) => l === "Принять Carina 0.2.1") && rv.rows.some((r) => r.who === "reviewer"), JSON.stringify(rv.rows))
  const same = panel(st("sS", "working", { since: now - 12 * 60_000, title: "worker" }))
  cell("111 AC-1 a title equal to the role is not repeated", same.rows.length === 1, JSON.stringify(same.rows))
  const task = { n: 94, status: "running", as: "executor", title: "Выпустить Windows seed" }
  const withTask = panel(st("sT", "working", { since: now - 12 * 60_000, title: "094 исп Выпустить Windows seed", task }))
  const noTitle = panel(st("sT", "working", { since: now - 12 * 60_000, title: "sT", task }))
  cell("111 AC-1 a row of a session with a task does not change with the title of the card", JSON.stringify(withTask.rows) === JSON.stringify(noTitle.rows), JSON.stringify(withTask.rows))
  const integ = panel(st("sI", "working", { since: now - 12 * 60_000, role: "integrator", title: "Интегратор Нова" }))
  cell("111 AC-1 the integrator's tab keeps its row", integ.rows.length === 1 && integ.rows[0].who === "интегр.", JSON.stringify(integ.rows))
  const idle = panel(st("sD", "idle", { title: "Старая сессия" }))
  cell("111 AC-1 a session that does not work gets no title rows", idle.rows.length === 1, JSON.stringify(idle.rows))
}

// 2. "завис?"
{
  const LIM = 6 * H
  const row = (since, extra = {}) => panel(st("sH", "working", { since, longTurnMs: LIM, title: "", ...extra })).rows[0]
  const over = row(now - LIM - 1)
  cell("111 AC-2 past the threshold the row says 'завис? 6ч' in the accent tone", over.what === "завис? 6ч" && over.tone === "accent" && over.who === "worker", JSON.stringify(over))
  const at = row(now - LIM)
  cell("111 AC-2 exactly at the threshold the turn is still working", at.what === `работает ${Math.round(LIM / 60_000)} мин` && at.tone === "base", JSON.stringify(at))
  const fresh = row(now - 5 * 60_000)
  cell("111 AC-2 a fresh turn is not 'завис?'", fresh.what === "работает 5 мин", JSON.stringify(fresh))
  const old = row(now - 42 * H)
  cell("111 AC-2 42 hours without an update: 'завис? 42ч'", old.what === "завис? 42ч", JSON.stringify(old))
  const off = panel(st("sO", "working", { since: now - 42 * H, longTurnMs: 0, title: "" })).rows[0]
  cell("111 AC-2 the value 0 switches it off", off.what === `работает ${42 * 60} мин`, JSON.stringify(off))
  const none = panel(st("sN", "working", { since: now - 42 * H, title: "" })).rows[0]
  cell("111 AC-2 a status without the threshold (an older file) shows 'работает' as before", none.what === `работает ${42 * 60} мин`, JSON.stringify(none))
  const waiting = panel(st("sQ", "owner", { since: now - 42 * H, longTurnMs: LIM, title: "" })).rows.find((r) => r.who === "worker")
  cell("111 AC-2 only a working session can be 'завис?'", waiting && waiting.what.startsWith("ждёт вас"), JSON.stringify(waiting))
  const tv = panel(st("sTK", "working", { since: now - 42 * H, longTurnMs: LIM, title: "x", task: { n: 94, status: "running", as: "executor", title: "t" } }))
  cell("111 AC-2 a session with a task is 'завис?' too, the title of the card is not added", tv.rows.some((r) => r.who === "094 исп" && r.what === "завис? 42ч" && r.tone === "accent"), JSON.stringify(tv.rows))
  const named = panel(st("sNM", "working", { since: now - 42 * H, longTurnMs: LIM, title: "Выпустить Windows seed Carina 0.2.1" }))
  cell("111 AC-1+2 the name and 'завис?' together: the owner's question about task 94 is answered on the panel", printed(named).some((l) => l.startsWith("Выпустить Windows")) && named.rows.some((r) => r.what === "завис? 42ч"), JSON.stringify(named.rows))

  // negative control: a going turn of a task that is not cancelled is 'working' while its last update is fresher than the threshold
  const live = panel(st("sG", "working", { since: now - 10 * 60_000, longTurnMs: LIM, title: "x", task: { n: 95, status: "running", as: "executor", title: "t" } }))
  cell("111 AC-2 negative control: a going turn of an open task, fresher than the threshold, is 'работает', not 'завис?'", live.rows.some((r) => r.who === "095 исп" && r.what === "работает 10 мин" && r.tone === "muted") && !printed(live).some((l) => l.includes("завис")), JSON.stringify(live.rows))
  const liveCard = { session: "sesLIVE1", role: "worker", auto: false, title: "t", directory: proj, repo: "r", project: "proj", busy: true, busySince: now - 10 * 60_000, pid: process.pid, updated: now }
  const sl = statusOf({ card: liveCard, busy: true, busySince: liveCard.busySince, asked: [], now, longTurnMs: LIM })
  cell("111 AC-2 negative control: statusOf of a fresh going turn is 'working' and the panel row says 'работает 10 мин'", sl.state === "working" && panel({ ...st("sesLIVE1", "working"), ...sl, project: "nova", role: "worker", title: "" }).rows[0].what === "работает 10 мин", JSON.stringify(sl))

  // statusOf passes the threshold into the status; a card of a stuck flag
  const card = { session: "sesHUNG1", role: "worker", auto: false, title: "Выпустить Windows seed", directory: proj, repo: "r", project: "proj", busy: true, busySince: now - 42 * H, pid: process.pid, updated: now }
  const s1 = statusOf({ card, busy: true, busySince: card.busySince, asked: [], now, longTurnMs: LIM })
  cell("111 AC-2 statusOf keeps the state 'working' and carries the threshold", s1.state === "working" && s1.longTurnMs === LIM && s1.since === card.busySince, JSON.stringify(s1))
  const s0 = statusOf({ card, busy: true, busySince: card.busySince, asked: [], now })
  cell("111 AC-2 without the threshold the status has no field", s0.state === "working" && !("longTurnMs" in s0), JSON.stringify(s0))
  cell("111 AC-2 isFree does not change: a flag older than 30 min frees the window, a fresh one does not", core.isFree({ ...card, busySince: now - 7 * H }, now) === true && core.isFree({ ...card, busySince: now - 10 * 60_000 }, now) === false, "isFree")

  // the setting
  const k = schema.SCHEMA.find((x) => x.key === "long_turn_minutes")
  cell("111 AC-2 the schema has long_turn_minutes: int, default 360, group Подталкивание", k?.kind?.type === "int" && k.default === 360 && k.group === "Подталкивание", JSON.stringify(k))
  cell("111 AC-2 the setting is read: default 360, 0 kept, a number kept", core.loadConfig(proj).longTurnMin === 360, String(core.loadConfig(proj).longTurnMin))
  writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ spawn_limits: { worker: 8 }, inflight_limit: 8, spawn_models: { light: "kimi/k3" }, long_turn_minutes: 0 }))
  cell("111 AC-2 long_turn_minutes 0 is read as 0 (off)", core.loadConfig(proj).longTurnMin === 0, String(core.loadConfig(proj).longTurnMin))
  writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ spawn_limits: { worker: 8 }, inflight_limit: 8, spawn_models: { light: "kimi/k3" } }))
}

// 3. the busy flag of a closed task
const mod = await import("../index.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
let nextId = 1
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => ({ id: req.id ?? `sesTASK0${nextId++}` }),
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const WPID = 515151
const tabs = [{ sessionID: "sesINTEG1", active: true, busy: false }]
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run("sesINTEG1", proj, "sesINTEG1")
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesINTEG1" } })
await call("crew_role", "sesINTEG1", { role: "integrator" })

const spawn = async (goal) => {
  const r = await call("crew_spawn", "sesINTEG1", { goal, criteria: "c", tier: "light" })
  const id = r.match(/сессия (ses_[A-Za-z0-9]+)/)?.[1]
  if (!id) throw new Error(`spawn failed: ${r}`)
  db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(id, proj, id)
  return id
}
const cardOf = (id) => core.allCards().find((c) => c.session === id)
// a turn that was lost: the flag is set by the request hook, the end of the turn was never seen; the flag is old by `age` ms
const stick = async (id, age, extra = {}) => {
  await hooks.context({ sessionID: id, system: [], model: { id: "x", providerID: "y" } })
  const c = cardOf(id)
  core.saveCard({ ...c, busy: true, busySince: Date.now() - age, turnStart: Date.now() - age, ...extra })
}
const a = await spawn("первая задача")
const b = await spawn("вторая задача")
const c3 = await spawn("третья задача")
const d = await spawn("четвёртая задача")
const e = await spawn("пятая задача")
const f = await spawn("шестая задача")
await stick(a, 3 * H)
await stick(b, 3 * H)
await stick(c3, 3 * H, { pid: 2_000_000_000 }) // the process of the service that set the flag is gone
await stick(d, 10_000) // the request was just made: the turn is not in the database yet
await stick(e, 3 * H)
await stick(f, 3 * H)
// the turn of b is going: its row in the database was updated a moment ago
msg(b, "user", { text: "работай" }, Date.now() - 20_000)
msg(b, "assistant", { text: "идёт ход" }, Date.now() - 2_000)
const nOf = (id) => core.allCards().find((x) => x.session === id)?.task?.n
await call("crew_task", "sesINTEG1", { action: "cancel", n: nOf(a), text: "проверка снятия флага" })
await call("crew_task", "sesINTEG1", { action: "cancel", n: nOf(b), text: "проверка идущего хода" })
await call("crew_task", "sesINTEG1", { action: "cancel", n: nOf(c3), text: "процесс службы исчез" })
await call("crew_task", "sesINTEG1", { action: "cancel", n: nOf(d), text: "ход только начат" })
// f: the last row of the turn in the database is `idle` (an old turn that ended; only the flag stayed)
msg(f, "assistant", { text: "было" }, Date.now() - 3 * H)
msg(f, "idle", {}, Date.now() - 3 * H + 5_000)
await call("crew_task", "sesINTEG1", { action: "cancel", n: nOf(f), text: "ход давно кончился" })
await wait(1200)
const A = cardOf(a)
cell("111 AC-3 a cancelled task drops the busy flag of its session when no turn runs", !A.busy && A.busySince === undefined && A.turnStart === undefined, JSON.stringify(A))
cell("111 AC-3 the session of the cancelled task is closed (the flag no longer holds it)", A.spawned?.status === "closed", JSON.stringify(A.spawned))
const B = cardOf(b)
cell("111 AC-3 a going turn is not touched: the flag stays, the session is not closed", B.busy === true && B.spawned?.status !== "closed", JSON.stringify(B))
cell("111 AC-3 negative control: nothing was written into the session of the going turn (no final line of the closing)", !delivered.some((x) => x.sessionID === b && /Сессия закрыта|отменен/.test(x.text)), JSON.stringify(delivered.filter((x) => x.sessionID === b)))
cell("111 AC-3 the flag and the times of the going turn are the same as before (busySince, turnStart kept)", B.busySince > 0 && B.turnStart > 0, JSON.stringify(B))
cell("111 AC-3 the last row of the turn is `idle`: the flag is a stuck one, it is dropped", !cardOf(f).busy && cardOf(f).spawned?.status === "closed", JSON.stringify(cardOf(f)))
const C = cardOf(c3)
cell("111 AC-3 a flag of a service that is gone is dropped too", !C.busy && C.spawned?.status === "closed", JSON.stringify(C))
const D = cardOf(d)
cell("111 AC-3 a flag set a moment ago (the turn has not reached the database) is kept", D.busy === true, JSON.stringify(D))
cell("111 AC-3 a running task keeps the flag of its session", cardOf(e).busy === true, JSON.stringify(cardOf(e)))
// a session handed over to another one (the transfer) is closed at once, its stale flag goes too
{
  const t = tasksMod.listTasks("proj").find((x) => x.n === nOf(e))
  core.releaseExecutor(t, e) // what reassign does with the old executor
  await wait(1200)
  const E = cardOf(e)
  cell("111 AC-3 a transferred session drops the stale flag as well", E.spawned?.status === "closed" && !E.busy, JSON.stringify(E))
}

clearInterval(heart)
try {
  await stop?.()
} catch {}
try {
  db.close()
} catch {}
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-panel-busy.test: FAIL ${fail}` : "crew-panel-busy.test ok")
process.exit(fail ? 1 : 0)

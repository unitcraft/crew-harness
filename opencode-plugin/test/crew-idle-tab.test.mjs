// Self-test of task 063: an idle tab with an open task and no question to the owner is marked and woken (node >= 24):
//   node test/crew-idle-tab.test.mjs
// IT-1 the store of an episode (idle-tab.ts): hold, read, clear. IT-2 the rule over the tasks of the tab (idleBlockers): a task between
//      sessions stands; a running executor goes; a session that waits for the tab (stuck towards it, or a question) makes the tab idle
//      even when another task goes; submitted, accepted and approval go. IT-3 who waits for the tab (waitsOn). IT-4 the letter.
// IT-5 the status: the mark ◷, the text in /crew and the side panel; the tab is not counted in "Ждут вас". IT-6 the setting
//      idle_tab_minutes (default 20). IT-7 the plugin: the source (a tab with a task between sessions, no question, past the
//      threshold) gets ONE letter and the mark; each lawful wait (an executor works, crew_watch, a question to the owner, a turn
//      going, an own question with expect_reply, a gate of task 062, a closed tab) gets nothing; an empty turn keeps the episode;
//      a working turn, the owner's word and a launched session end it.
// Task 070 (the same rule by the status of the task): IT-8 the rule over the facts of the executor (idleBlockers, 4th argument): a task
//      running/rework/starting without an executor, without a live session, or with a silent one past the threshold stands even when
//      another task goes; an order that nobody took stands, named apart. IT-9 the plugin: the same sources get ONE letter and the mark;
//      a working executor, crew_watch and a taken order get nothing; a word of the executor ends the episode.
// Task 076 (an accepted task nobody cleans up): IT-10 the rule over the facts of the cleanup (idleBlockers, RunCtx.cleanup): an accepted
//      task whose reminders (ACCEPTED_REMINDERS_MAX) all went, whose reviewer does not lead the cleanup and which did not change for the
//      threshold since the last reminder stands, named apart; a reviewer at work, fewer reminders, a younger stand, a cleaned task do not.
//      IT-11 the plugin: the same sources (a silent reviewer, a reviewer under an old crew_watch) get ONE letter and the mark; a reviewer
//      at work, a fresh crew_watch, four letters, a young last letter and a cleaned task get nothing; the cleanup and the word of the
//      reviewer end the episode.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-idle-tab-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FORM_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
// threshold 3 s: the fixtures stand 2 minutes, the checks of "the mark is gone" run well inside 3 s
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ idle_tab_minutes: 0.05 }))

let fail = 0
const cell = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const tryImport = (p) => import(p).catch((e) => (console.log(`import ${p}: ${String(e).split("\n")[0]}`), null))

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const fw = await import("../form-wait.ts")
const status = await import("../status.ts")
const schema = await import("../config-schema.ts")
const watch = await import("../watch.ts")
const gs = await import("../gate-stop.ts")
const it = await tryImport("../idle-tab.ts")

const T0 = Date.now() - 120_000
const mkTask = (project, n, author, st, extra = {}) => ({
  project, n, title: `задача ${n}`, slug: `t${n}`, goal: "цель", priority: "P2", tier: "medium", role: "worker", author, author_role: "integrator",
  qid: `q${n}`, status: st, kind: "assign", executors: [], attempt: 1, directory: proj, history: [], created: T0 - 60_000, updated: T0 - 60_000, ...extra,
})

// ---- IT-1 the store
{
  const dir = path.join(tmp, "idle-unit")
  it?.holdIdle?.("sesU1", 1000, 5000, dir)
  const r = it?.idleOf?.("sesU1", dir, 6000)
  cell("IT-1a holdIdle writes the episode (start and letter time), idleOf reads it", r?.since === 1000 && r?.letter === 5000, JSON.stringify(r))
  it?.clearIdle?.("sesU1", dir)
  cell("IT-1b clearIdle removes it", it?.idleOf?.("sesU1", dir, 6000) === undefined && !!it?.clearIdle, "")
  cell("IT-1c the mark is ◷", it?.IDLE_MARK === "◷", String(it?.IDLE_MARK))
}

// ---- IT-2 the rule over the tasks
{
  const none = () => undefined
  const b = (list, w = none) => it?.idleBlockers?.("me", list, w)
  const idle = mkTask("p", 1, "me", "idle")
  const run = mkTask("p", 2, "me", "running", { executor: "sesE2" })
  const rev = mkTask("p", 3, "me", "reviewing", { executor: "sesE3", reviewer: "sesR3" })
  const r1 = b([idle])
  cell("IT-2a a task between sessions and nothing going: idle, the task is named, kind between", r1?.idle === true && r1.items?.length === 1 && r1.items[0].kind === "between" && r1.items[0].task?.n === 1, JSON.stringify(r1))
  cell("IT-2b an executor works: not idle", b([run])?.idle === false, JSON.stringify(b([run])))
  cell("IT-2c a task between sessions and another one running: not idle (the tab may wait for it)", b([idle, run])?.idle === false, JSON.stringify(b([idle, run])))
  const waits = (sid) => (sid === "sesR3" ? T0 : undefined)
  const r4 = b([run, rev], waits)
  cell("IT-2d the reviewer waits for the tab: idle even with a running task, kind waits, its time", r4?.idle === true && r4.items?.length === 1 && r4.items[0].kind === "waits" && r4.items[0].task?.n === 3 && r4.at >= T0, JSON.stringify(r4))
  for (const st of ["submitted", "accepted", "approval", "starting", "rework", "reviewing"]) cell(`IT-2e status ${st} goes: not idle`, b([mkTask("p", 4, "me", st, { executor: "sesE4", reviewer: "sesR4" })])?.idle === false, JSON.stringify(b([mkTask("p", 4, "me", st)])))
  cell("IT-2f no tasks: not idle", b([])?.idle === false, JSON.stringify(b([])))
  const r7 = b([{ ...idle, updated: T0 + 5000 }])
  cell("IT-2g the start of the stand is the change of the standing task", r7?.at === T0 + 5000, JSON.stringify(r7))
}

// ---- IT-8 the rule over the facts of the executor (task 070)
{
  const NOW = 50_000_000
  const MIN = 20 * 60_000
  const none = () => undefined
  const live = () => ({ live: true })
  const mk = (st, extra = {}) => mkTask("p", 81, "me", st, { kind: "spawn", executor: "sesE81", updated: NOW - 30 * 60_000, ...extra })
  const ctx = (o = {}) => ({ now: NOW, minMs: MIN, session: live, addressee: () => ({ window: false, working: false }), ...o })
  const run = (list, o) => it?.idleBlockers?.("me", list, none, ctx(o))
  const silent = (min) => ({ session: () => ({ live: true, silentSince: NOW - min * 60_000 }) })
  const r1 = run([mk("running", { executor: undefined })])
  cell("IT-8a running without an executor past the threshold: idle, kind nosession", r1?.idle === true && r1.items?.[0]?.kind === "nosession" && !r1.items[0].lost && r1.items[0].task?.n === 81, JSON.stringify(r1))
  const r2 = run([mk("running")], { session: () => ({ live: false }) })
  cell("IT-8b an executor without a live session: idle, kind nosession, lost", r2?.idle === true && r2.items?.[0]?.kind === "nosession" && r2.items[0].lost === true, JSON.stringify(r2))
  const r3 = run([mk("rework")], silent(25))
  cell("IT-8c a silent executor (rework) past the threshold: idle, kind silent, since its silence", r3?.idle === true && r3.items?.[0]?.kind === "silent" && r3.at === NOW - 25 * 60_000, JSON.stringify(r3))
  cell("IT-8d a silent executor, but the silence is shorter than the threshold: not idle", run([mk("rework")], silent(5))?.idle === false, JSON.stringify(run([mk("rework")], silent(5))))
  cell("IT-8e no executor, but the task changed 5 min ago: not idle (the start is on its way)", run([mk("starting", { executor: undefined, updated: NOW - 5 * 60_000 })])?.idle === false, "")
  cell("IT-8f an executor at work or lawfully waiting (live, no silence): not idle", run([mk("running")])?.idle === false, "")
  const r7 = run([mk("running", { executor: undefined }), mkTask("p", 82, "me", "running", { kind: "spawn", executor: "sesE82", updated: NOW - 30 * 60_000 })])
  cell("IT-8g a dead task stands even while another one goes", r7?.idle === true && r7.items?.length === 1 && r7.items[0].task?.n === 81, JSON.stringify(r7))
  const ord = (extra = {}) => mk("running", { kind: "order", order_to: "otherproj", executor: undefined, ...extra })
  const r8 = run([ord()])
  cell("IT-8h an order nobody took, the addressee is not in a window: idle, kind order, the addressee, window false", r8?.idle === true && r8.items?.[0]?.kind === "order" && r8.items[0].to === "otherproj" && r8.items[0].window === false, JSON.stringify(r8))
  cell("IT-8i an order that was taken (child): not idle", run([ord({ child: { project: "otherproj", n: 3 } })])?.idle === false, "")
  cell("IT-8j an order whose addressee works a turn now: not idle", run([ord()], { addressee: () => ({ window: true, working: true }) })?.idle === false, "")
  const r11 = run([ord()], { addressee: () => ({ window: true, working: false }) })
  cell("IT-8k an order, the addressee is in a window but did not take it: idle, window true", r11?.idle === true && r11.items?.[0]?.window === true, JSON.stringify(r11))
  cell("IT-8l a fresh order (5 min): not idle", run([ord({ updated: NOW - 5 * 60_000 })])?.idle === false, "")
  cell("IT-8m without the 4th argument the old rule: a task without an executor goes", it?.idleBlockers?.("me", [mk("running", { executor: undefined })], none)?.idle === false, "")
  const w = run([mk("rework")], silent(25))
  const what = (r) => it?.idleWhat?.(r?.items ?? []) ?? []
  const whats = [...what(r1), ...what(r2), ...what(w), ...what(r8), ...what(r11)]
  cell("IT-8n the text for the owner names the reason apart: no executor / no session / silent since HH:MM / order not taken", whats[0] === "#81 без исполнителя" && whats[1] === "#81 сессии исполнителя нет" && /^#81 исполнитель молчит с \d\d:\d\d$/.test(whats[2] ?? "") && whats[3] === "#81 заказ не взят: otherproj.integrator вне окна" && whats[4] === "#81 заказ не взят: otherproj.integrator в окне, но не взял", JSON.stringify(whats))
  const l = it?.idleLetter?.(25, [...(r1?.items ?? []), ...(w?.items ?? []), ...(r8?.items ?? [])]) ?? ""
  cell("IT-8o the letter names the three reasons and the steps (reassign, cancel, ask the owner)", /нет исполнителя/.test(l) && /исполнитель задачи #81.*молчит с \d\d:\d\d/.test(l) && /заказ #81.*никто не взял.*otherproj\.integrator вне окна/.test(l) && /crew_task reassign/.test(l) && /cancel/.test(l) && /инструментом question/.test(l), l)
}

// ---- IT-10 the rule over the facts of the cleanup (task 076)
{
  const NOW = 60_000_000
  const MIN = 20 * 60_000
  const none = () => undefined
  const ACC_AT = NOW - 3 * 3_600_000
  const acc = (extra = {}) => mkTask("p", 91, "me", "accepted", { kind: "spawn", executor: "sesE91", reviewer: "sesR91", updated: NOW - 60 * 60_000, history: [{ status: "accepted", at: ACC_AT }], ...extra })
  const fact = (o = {}) => ({ sent: tasks.ACCEPTED_REMINDERS_MAX, lastAt: NOW - 30 * 60_000, idleSince: NOW - 40 * 60_000, ...o })
  const ctx = (c, o = {}) => ({ now: NOW, minMs: MIN, session: () => ({ live: true }), addressee: () => ({ window: false, working: false }), ...(c ? { cleanup: () => c } : {}), ...o })
  const run = (list, c, o) => it?.idleBlockers?.("me", list, none, ctx(c, o))
  const r1 = run([acc()], fact())
  cell("IT-10a all reminders went, the reviewer does not lead the cleanup, the stand is past the threshold: idle, kind cleanup, since the last reminder", r1?.idle === true && r1.items?.length === 1 && r1.items[0].kind === "cleanup" && r1.items[0].task?.n === 91 && r1.at === NOW - 30 * 60_000, JSON.stringify(r1))
  cell("IT-10b the reviewer leads the cleanup (a turn goes, a question, a fresh watch: no idleSince): not idle", run([acc()], fact({ idleSince: undefined }))?.idle === false, "")
  cell("IT-10c the last reminder is younger than the threshold: not idle", run([acc()], fact({ lastAt: NOW - 5 * 60_000 }))?.idle === false, "")
  cell("IT-10d fewer reminders than the maximum: not idle", run([acc()], fact({ sent: tasks.ACCEPTED_REMINDERS_MAX - 1 }))?.idle === false, "")
  cell("IT-10e the task changed 5 min ago: not idle", run([acc({ updated: NOW - 5 * 60_000 })], fact())?.idle === false, "")
  cell("IT-10f the reviewer fell silent 5 min ago (the last reminder is older): not idle", run([acc()], fact({ idleSince: NOW - 5 * 60_000 }))?.idle === false, "")
  cell("IT-10g a cleaned task (done) is out of the rule", run([acc({ status: "done" })], fact())?.idle === false, "")
  cell("IT-10h without the cleanup facts the old rule: an accepted task goes", run([acc()], undefined)?.idle === false && it?.idleBlockers?.("me", [acc()], none)?.idle === false, "")
  const r9 = run([acc(), mkTask("p", 92, "me", "running", { kind: "spawn", executor: "sesE92", updated: NOW - 30 * 60_000 })], fact())
  cell("IT-10i the accepted task stands even while another one goes", r9?.idle === true && r9.items?.length === 1 && r9.items[0].task?.n === 91, JSON.stringify(r9))
  const r10 = run([acc({ reviewer: undefined })], fact({ idleSince: 0 }))
  cell("IT-10j no reviewer at all (idleSince 0): idle", r10?.idle === true && r10.items?.[0]?.kind === "cleanup", JSON.stringify(r10))
  const what = it?.idleWhat?.(r1?.items ?? []) ?? []
  const hhmm = new Date(ACC_AT).toTimeString().slice(0, 5)
  cell("IT-10k the text for the owner: accepted, the cleanup waits for the reviewer since the acceptance", what.join(";") === `#91 принята, уборка ждёт приёмщика с ${hhmm}`, JSON.stringify(what))
  const l = it?.idleLetter?.(35, r1?.items ?? []) ?? ""
  cell("IT-10l the letter: the task is accepted, all reminders went, the reviewer does not lead, the next steps", /^Ты простаиваешь 35 мин: /.test(l) && /задача #91 «задача 91» принята/.test(l) && /приёмщик/.test(l) && /crew_send/.test(l) && /crew_task \{action: "cleanup"/.test(l) && /инструментом question/.test(l), l)
}

// ---- IT-3 who waits for the tab
{
  core.addObligation("sesW1", { qid: "qw1", from_session: "me3", from_role: "integrator", at: T0, nudges: 0, stuck: true, stuckAt: T0 + 10 })
  core.addObligation("sesW2", { qid: "qw2", from_session: "other", from_role: "integrator", at: T0, nudges: 0, stuck: true, stuckAt: T0 + 10 })
  core.addObligation("sesW3", { qid: "qw3", from_session: "me3", from_role: "integrator", at: T0, nudges: 0 })
  const saved = new Map([["sesW4", { state: "question", since: T0 + 20 }], ["sesW5", { state: "working", since: T0 }]])
  const w = (sid) => it?.waitsOn?.(sid, "me3", saved)
  cell("IT-3a stuck towards the tab: waits, since the mark", w("sesW1") === T0 + 10, String(w("sesW1")))
  cell("IT-3b stuck towards another tab: does not wait for this one", w("sesW2") === undefined, String(w("sesW2")))
  cell("IT-3c an obligation that is not stuck: works, does not wait", w("sesW3") === undefined, String(w("sesW3")))
  cell("IT-3d a session in the state question: waits, since its question", w("sesW4") === T0 + 20, String(w("sesW4")))
  cell("IT-3e a working session does not wait", w("sesW5") === undefined, String(w("sesW5")))
}

// ---- IT-4 the letter
{
  const items = [{ kind: "between", task: mkTask("p", 61, "me", "idle", { folder: "doc/tasks/061-x", title: "Спека" }) }, { kind: "waits", task: mkTask("p", 22, "me", "submitted", { title: "Приёмка" }), who: "прм" }]
  const l = it?.idleLetter?.(25, items) ?? ""
  cell("IT-4a the letter: idle N min, the task without a going session, no question to the owner, the next step or the question tool", /^Ты простаиваешь 25 мин: /.test(l) && /061 «Спека» нет идущей сессии/.test(l) && /#22 прм.*ждёт твоих указаний/.test(l) && /нет вопроса владельцу/.test(l) && /Сделай следующий шаг цикла/.test(l) && /инструментом question/.test(l), l)
  const what = it?.idleWhat?.(items) ?? []
  cell("IT-4b the text for the owner: between sessions, waits for instructions", what.join("; ") === "061 между сессиями; #22 прм ждёт указаний", JSON.stringify(what))
}

// ---- IT-5 the status
{
  const NOW = 100_000_000
  const base = status.statusOf({ card: { project: "p63", role: "integrator", title: "x", session: "sesS5" }, busy: false, asked: [], now: NOW, watches: [] })
  const s = status.withIdle ? status.withIdle({ ...base, state: "tasks", detail: "ждёт своих задач: 061 между сессиями" }, { since: NOW - 35 * 60_000, what: ["061 между сессиями"] }, NOW) : undefined
  cell("IT-5a withIdle: the state stays tasks, the field idleTab, the text names the stand and the missing question", s?.state === "tasks" && s.idleTab?.since === NOW - 35 * 60_000 && /^простаивает с \d\d:\d\d \(35 мин\), вопроса владельцу нет: 061 между сессиями$/.test(s.detail), JSON.stringify(s))
  cell("IT-5b the mark is ◷", !!s && status.markOf(s) === "◷", String(s && status.markOf(s)))
  const list = s ? status.formatStatuses([s], NOW) : ""
  cell("IT-5c /crew: the row has ◷ and the word stalled; no «Waiting for you» (the tab does not wait for the owner)", /◷ integrator +stalled 35m/.test(list) && !/Waiting for you/.test(list), list)
  const side = s ? status.sidebarLines([s], NOW) : { rows: [] }
  cell("IT-5d the side panel: the row has ◷ and «простаивает 35м», the task under it", side.rows.some((r) => r.mark === "◷" && /простаивает 35м/.test(r.what) && r.tone === "accent") && side.rows.some((r) => /061 между сессиями/.test(r.what)), JSON.stringify(side.rows))
  cell("IT-5e without idleTab nothing changes: no mark", status.markOf({ ...base, state: "tasks" }) === undefined, String(status.markOf({ ...base, state: "tasks" })))
}

// ---- IT-6 the setting
{
  const k = schema.SCHEMA.find((x) => x.key === "idle_tab_minutes")
  cell("IT-6a the schema has idle_tab_minutes: int, default 20, group Подталкивание, 0 switches it off", k?.kind?.type === "int" && k.default === 20 && k.group === "Подталкивание" && /0 — не/.test(k.question), JSON.stringify(k))
  cell("IT-6b loadConfig reads it: default 20, the project value", core.loadConfig(path.join(tmp, "nowhere")).idleTabMin === 20 && core.loadConfig(proj).idleTabMin === 0.05, JSON.stringify([core.loadConfig(path.join(tmp, "nowhere")).idleTabMin, core.loadConfig(proj).idleTabMin]))
}

// ---- IT-7 the plugin
const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
// I1 the source; I2 an executor works; I3 crew_watch; I4 a question form; I5 its turn goes; I6 a reviewer waits for it (and another task
// runs); I7 its question with expect_reply waits; I8 a gate of task 062; I9 a closed tab. X* - the executors and reviewers.
// Task 070: J1..J6 - authors (J1 a task without an executor, J2 a silent executor Y2, J3 an order nobody took, J4 an executor Y4 at work, J5 an
// executor Y5 under crew_watch, J6 an order that was taken). An executor of a running task works (busy): X2, X6b, Y4.
// Task 076: K1..K7 - authors of accepted tasks #91..#97 with their reviewers Z1..Z7 (K1 a silent reviewer, K2 a reviewer under a crew_watch
// of long ago, K3 a reviewer at work (busy), K4 a reviewer under a fresh crew_watch, K5 four reminders only, K6 the fifth reminder is
// young, K7 a cleaned task). The letters of the reminders lie in the read letters of the author.
const TABS = ["sesI1", "sesI2", "sesI3", "sesI4", "sesI5", "sesI6", "sesI7", "sesI8", "sesX2", "sesX6", "sesX6b", "sesX7", "sesJ1", "sesJ2", "sesJ3", "sesJ4", "sesJ5", "sesJ6", "sesY2", "sesY4", "sesY5", "sesK1", "sesK2", "sesK3", "sesK4", "sesK5", "sesK6", "sesK7", "sesZ1", "sesZ2", "sesZ3", "sesZ4", "sesZ5", "sesZ6", "sesZ7"]
const BUSY = new Set(["sesI5", "sesX2", "sesX6b", "sesY4", "sesZ3"])
const ALL = [...TABS, "sesI9"]
for (const s of ALL) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, proj, s)

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
const WPID = 636363
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: TABS.map((sessionID) => ({ sessionID, active: true, busy: BUSY.has(sessionID) })) }))
beat()
const heart = setInterval(beat, 300)

for (const s of ALL) {
  msg(s, "user", { text: "поручение" }, T0)
  msg(s, "assistant", { content: [{ type: "text", text: "Сводка выше." }] }, T0 + 1)
  msg(s, "idle", { outcome: "completed" }, T0 + 2)
}
const stop = await mod.default.setup(ctx)
for (const s of ALL) await hooks.context({ sessionID: s, system: [], model: { id: "opus", providerID: "claude-code" } })
// the request of the context hook marks a card busy; the turns of the fixtures ended two minutes ago
for (const s of ALL) core.saveCard({ ...core.readJson(core.cardFile(s)), busy: false })
const P = core.readJson(core.cardFile("sesI1"))?.project
const putTask = (t) => {
  mkdirSync(path.dirname(tasks.taskFile(P, t.n)), { recursive: true })
  writeFileSync(tasks.taskFile(P, t.n), JSON.stringify(t, null, 1))
}
putTask(mkTask(P, 61, "sesI1", "idle", { title: "Спека" }))
putTask(mkTask(P, 62, "sesI2", "running", { executor: "sesX2" }))
putTask(mkTask(P, 63, "sesI3", "idle"))
putTask(mkTask(P, 64, "sesI4", "idle"))
putTask(mkTask(P, 65, "sesI5", "idle"))
putTask(mkTask(P, 66, "sesI6", "running", { executor: "sesX6b" }))
putTask(mkTask(P, 22, "sesI6", "reviewing", { executor: "sesX2", reviewer: "sesX6", review_qid: "qr22", review_letter: `review-${P}-22-1`, reviewers: [], title: "Приёмка" }))
putTask(mkTask(P, 67, "sesI7", "idle"))
putTask(mkTask(P, 68, "sesI8", "idle"))
putTask(mkTask(P, 69, "sesI9", "idle"))
// stuck after the last word of the owner in sesX6 (an earlier word would clear the mark, task 052)
core.addObligation("sesX6", { qid: "qr22", from_session: "sesI6", from_role: "integrator", at: T0, nudges: 0, task: "приёмка #22", stuck: true, stuckAt: T0 + 5, stuckWhat: "приёмка #22 — 3 хода подряд" })
core.addObligation("sesX7", { qid: "q7ask", from_session: "sesI7", from_role: "integrator", at: Date.now(), nudges: 0 })
mkdirSync(watch.WATCHES, { recursive: true })
writeFileSync(path.join(watch.WATCHES, "w63.json"), JSON.stringify({ id: "w63", session: "sesI3", command: "x", cwd: proj, note: "CI", minutes: 120, created: Date.now(), status: "running", pid: process.pid, started: Date.now() }))
fw.handleFormEvent({ type: "form.created", data: { form: { id: "frm_i4", sessionID: "sesI4", title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Запускать следующую сессию?", options: [{ label: "Да (Recommended)" }, { label: "Нет" }] }] } } })
for (const b of BUSY) core.saveCard({ ...core.readJson(core.cardFile(b)), busy: true, busySince: Date.now() })
gs.noteGate("sesI8", "ворота", T0 + 1)

// task 070
putTask(mkTask(P, 71, "sesJ1", "running", { kind: "spawn" }))
putTask(mkTask(P, 72, "sesJ2", "rework", { kind: "spawn", executor: "sesY2" }))
putTask(mkTask(P, 73, "sesJ3", "running", { kind: "order", order_to: "otherproj" }))
putTask(mkTask(P, 74, "sesJ4", "running", { kind: "spawn", executor: "sesY4" }))
putTask(mkTask(P, 75, "sesJ5", "running", { kind: "spawn", executor: "sesY5" }))
putTask(mkTask(P, 76, "sesJ6", "running", { kind: "order", order_to: "otherproj", child: { project: "otherproj", n: 9 } }))
core.saveCard({ ...core.readJson(core.cardFile("sesY2")), task: { project: P, n: 72 } })
writeFileSync(path.join(watch.WATCHES, "w70.json"), JSON.stringify({ id: "w70", session: "sesY5", command: "x", cwd: proj, note: "CI", minutes: 120, created: Date.now(), status: "running", pid: process.pid, started: Date.now() }))

// task 076: an accepted task, `sent` reminders in the read letters of the author; a letter with a time in the future is a young one
const FAR = 3 * 3_600_000
const putAccepted = (n, author, reviewer, sent, times, extra = {}) => {
  const at = Date.now() - FAR
  const t = mkTask(P, n, author, "accepted", { kind: "spawn", executor: `sesE${n}`, reviewer, history: [{ status: "accepted", at }], updated: at, ...extra })
  putTask(t)
  const dir = path.join(core.READ, core.safeKey(author))
  mkdirSync(dir, { recursive: true })
  for (let k = 1; k <= sent; k++) writeFileSync(path.join(dir, `${tasks.acceptedReminderId(t, at, k)}.json`), JSON.stringify({ id: tasks.acceptedReminderId(t, at, k), time: times[k - 1] ?? times[times.length - 1] }))
  core.saveCard({ ...core.readJson(core.cardFile(reviewer)), task: { project: P, n } })
}
const OLD = [Date.now() - 150 * 60_000, Date.now() - 120 * 60_000, Date.now() - 90 * 60_000, Date.now() - 60 * 60_000, Date.now() - 30 * 60_000]
putAccepted(91, "sesK1", "sesZ1", 5, OLD)
putAccepted(92, "sesK2", "sesZ2", 5, OLD)
putAccepted(93, "sesK3", "sesZ3", 5, OLD)
putAccepted(94, "sesK4", "sesZ4", 5, OLD)
putAccepted(95, "sesK5", "sesZ5", 4, [...OLD.slice(0, 3), Date.now() + 3_600_000]) // the fourth is young: the plugin sends no fifth
putAccepted(96, "sesK6", "sesZ6", 5, [...OLD.slice(0, 4), Date.now() + 3_600_000])
putAccepted(97, "sesK7", "sesZ7", 5, OLD, { status: "done" })
writeFileSync(path.join(watch.WATCHES, "w76a.json"), JSON.stringify({ id: "w76a", session: "sesZ2", command: "x", cwd: proj, note: "ждать отдельный cleanup plan", minutes: 720, created: T0 - 3_600_000, status: "running", pid: process.pid, started: T0 - 3_600_000 }))
writeFileSync(path.join(watch.WATCHES, "w76b.json"), JSON.stringify({ id: "w76b", session: "sesZ4", command: "x", cwd: proj, note: "gate", minutes: 120, created: Date.now() + 600_000, status: "running", pid: process.pid, started: Date.now() + 600_000 }))

const letters = (s) => prompts.filter((p) => p.sessionID === s && /Ты простаиваешь/.test(p.text))
const stOf = (s) => core.readJson(path.join(status.STATUS, `${s}.json`))
const endTurn = (s, content, owner) => {
  const at = Date.now()
  if (owner) msg(s, "user", { text: owner }, at - 2)
  msg(s, "assistant", { content }, at - 1)
  msg(s, "idle", { outcome: "completed" }, at)
  core.saveCard({ ...core.readJson(core.cardFile(s)), busy: false })
}

await wait(2500)
const l1 = letters("sesI1")
cell("IT-7a the source: a task between sessions, no question, past the threshold - ONE letter naming the task", l1.length === 1 && /задачи #61 «Спека» нет идущей сессии/.test(l1[0].text) && /инструментом question/.test(l1[0].text), JSON.stringify(prompts.map((p) => [p.sessionID, p.text.slice(0, 90)])))
const s1 = stOf("sesI1")
cell("IT-7b its status: tasks, idleTab, «простаивает … вопроса владельцу нет: #61 между сессиями»", s1?.state === "tasks" && !!s1.idleTab && /^простаивает с .*вопроса владельцу нет: #61 между сессиями$/.test(s1.detail), JSON.stringify(s1))
cell("IT-7c an executor works: no letter, no mark", letters("sesI2").length === 0 && !stOf("sesI2")?.idleTab, JSON.stringify(stOf("sesI2")))
cell("IT-7d crew_watch is open: no letter, the state watch", letters("sesI3").length === 0 && stOf("sesI3")?.state === "watch" && !stOf("sesI3")?.idleTab, JSON.stringify(stOf("sesI3")))
cell("IT-7e a question to the owner is open: no letter, the state owner", letters("sesI4").length === 0 && stOf("sesI4")?.state === "owner" && !stOf("sesI4")?.idleTab, JSON.stringify(stOf("sesI4")))
cell("IT-7f its turn goes: no letter, the state working", letters("sesI5").length === 0 && stOf("sesI5")?.state === "working" && !stOf("sesI5")?.idleTab, JSON.stringify(stOf("sesI5")))
const l6 = letters("sesI6")
cell("IT-7g a reviewer waits for the tab (another task runs): ONE letter naming the waiting session", l6.length === 1 && /#22 прм.*ждёт твоих указаний/.test(l6[0].text) && !!stOf("sesI6")?.idleTab, JSON.stringify([l6.map((p) => p.text), stOf("sesI6")]))
cell("IT-7h its own question with expect_reply waits: no letter, the state reply", letters("sesI7").length === 0 && stOf("sesI7")?.state === "reply", JSON.stringify(stOf("sesI7")))
cell("IT-7i a gate without a question (task 062): its own letter and mark, no idle letter", letters("sesI8").length === 0 && prompts.some((p) => p.sessionID === "sesI8" && /без вопроса владельцу/.test(p.text)) && stOf("sesI8")?.gate === true, JSON.stringify(stOf("sesI8")))
cell("IT-7j a closed tab: no letter, no mark", letters("sesI9").length === 0 && !stOf("sesI9")?.idleTab, JSON.stringify(stOf("sesI9")))
await wait(1500)
cell("IT-7k no second letter in the same episode", letters("sesI1").length === 1 && letters("sesI6").length === 1, JSON.stringify([letters("sesI1").length, letters("sesI6").length]))

// an empty turn (the answer to the letter, no tools): the episode goes on, the mark comes back, no letter
endTurn("sesI1", [{ type: "text", text: "Понял, жду." }])
await wait(1500)
cell("IT-7l an empty turn keeps the episode: the mark, still one letter", letters("sesI1").length === 1 && !!stOf("sesI1")?.idleTab, JSON.stringify([letters("sesI1").length, stOf("sesI1")]))

// the owner's word in sesI6 ends its episode
endTurn("sesI6", [{ type: "text", text: "Принято." }], "посмотри приёмку")
await wait(800)
cell("IT-7m the owner's word ends the episode: the mark is gone", !stOf("sesI6")?.idleTab, JSON.stringify(stOf("sesI6")))

// a working turn of sesI1 ends the episode; a new stand past the threshold is a new episode with its own letter
endTurn("sesI1", [{ type: "tool", name: "read", state: { status: "completed" } }, { type: "text", text: "Прочитал журнал." }])
await wait(800)
cell("IT-7n a working turn ends the episode: the mark is gone", !stOf("sesI1")?.idleTab && letters("sesI1").length === 1, JSON.stringify([letters("sesI1").length, stOf("sesI1")]))
await wait(3500)
cell("IT-7o a new stand past the threshold: a new episode, the second letter", letters("sesI1").length === 2 && !!stOf("sesI1")?.idleTab, JSON.stringify([letters("sesI1").length, stOf("sesI1")]))

// the next session is launched: the task runs, the mark is gone, no letter
putTask({ ...mkTask(P, 61, "sesI1", "running", { executor: "sesX2", title: "Спека" }), updated: Date.now() })
await wait(1000)
cell("IT-7p a launched session ends the episode: the mark is gone", !stOf("sesI1")?.idleTab && !it?.idleOf?.("sesI1"), JSON.stringify(stOf("sesI1")))
await wait(3500)
cell("IT-7q and no new letter while the session goes", letters("sesI1").length === 2, String(letters("sesI1").length))

// ---- IT-9 task 070: the same rule by the status of the task
{
  const j1 = letters("sesJ1")
  cell("IT-9a a running task without an executor: ONE letter «нет исполнителя», the mark", j1.length === 1 && /задачи #71 «задача 71» нет исполнителя/.test(j1[0].text) && !!stOf("sesJ1")?.idleTab && /#71 без исполнителя/.test(stOf("sesJ1")?.detail ?? ""), JSON.stringify([j1.map((p) => p.text), stOf("sesJ1")]))
  const j2 = letters("sesJ2")
  cell("IT-9b a task on rework, the executor is silent: ONE letter «молчит с», the mark", j2.length === 1 && /исполнитель задачи #72 «задача 72» молчит с \d\d:\d\d/.test(j2[0].text) && !!stOf("sesJ2")?.idleTab && /#72 исполнитель молчит с/.test(stOf("sesJ2")?.detail ?? ""), JSON.stringify([j2.map((p) => p.text), stOf("sesJ2")]))
  const j3 = letters("sesJ3")
  cell("IT-9c an order nobody took, the addressee is not in a window: ONE letter naming the addressee, the mark", j3.length === 1 && /заказ #73 «задача 73» никто не взял: интегратор otherproj\.integrator вне окна/.test(j3[0].text) && !!stOf("sesJ3")?.idleTab && /#73 заказ не взят/.test(stOf("sesJ3")?.detail ?? ""), JSON.stringify([j3.map((p) => p.text), stOf("sesJ3")]))
  cell("IT-9d an executor at work: no letter, no mark", letters("sesJ4").length === 0 && !stOf("sesJ4")?.idleTab, JSON.stringify(stOf("sesJ4")))
  cell("IT-9e an executor under crew_watch: no letter, no mark", letters("sesJ5").length === 0 && !stOf("sesJ5")?.idleTab, JSON.stringify(stOf("sesJ5")))
  cell("IT-9f an order that was taken: no letter, no mark", letters("sesJ6").length === 0 && !stOf("sesJ6")?.idleTab, JSON.stringify(stOf("sesJ6")))
  await wait(1500)
  cell("IT-9g no second letter in the same episode", letters("sesJ1").length === 1 && letters("sesJ2").length === 1 && letters("sesJ3").length === 1, JSON.stringify(["sesJ1", "sesJ2", "sesJ3"].map((s) => letters(s).length)))
  // the executor speaks (a turn ends now): its silence starts anew, the mark of its author is gone
  endTurn("sesY2", [{ type: "tool", name: "read", state: { status: "completed" } }, { type: "text", text: "Доработал." }])
  await wait(1000)
  cell("IT-9h the executor speaks: the mark of its author is gone, no second letter", !stOf("sesJ2")?.idleTab && letters("sesJ2").length === 1, JSON.stringify([letters("sesJ2").length, stOf("sesJ2")]))
  // the task is cancelled: nothing stands
  putTask({ ...mkTask(P, 71, "sesJ1", "cancelled", { kind: "spawn" }), updated: Date.now() })
  await wait(1000)
  cell("IT-9i a cancelled task stands no more: the mark is gone", !stOf("sesJ1")?.idleTab, JSON.stringify(stOf("sesJ1")))
}

// ---- IT-11 task 076: an accepted task nobody cleans up
{
  const k1 = letters("sesK1")
  cell("IT-11a the reviewer is silent after the fifth reminder: ONE letter naming the accepted task, the mark, the text for the owner", k1.length === 1 && /задача #91 «задача 91» принята/.test(k1[0].text) && !!stOf("sesK1")?.idleTab && /#91 принята, уборка ждёт приёмщика с \d\d:\d\d/.test(stOf("sesK1")?.detail ?? ""), JSON.stringify([k1.map((p) => p.text), stOf("sesK1")]))
  const k2 = letters("sesK2")
  cell("IT-11b the reviewer waits under a crew_watch of long ago (the case of Nova #91): ONE letter and the mark", k2.length === 1 && !!stOf("sesK2")?.idleTab && stOf("sesZ2")?.state === "watch", JSON.stringify([k2.map((p) => p.text), stOf("sesK2"), stOf("sesZ2")?.state]))
  cell("IT-11c the reviewer works a turn: no letter, no mark", letters("sesK3").length === 0 && !stOf("sesK3")?.idleTab && stOf("sesZ3")?.state === "working", JSON.stringify([stOf("sesK3"), stOf("sesZ3")?.state]))
  cell("IT-11d the reviewer is under a fresh crew_watch: no letter, no mark", letters("sesK4").length === 0 && !stOf("sesK4")?.idleTab && stOf("sesZ4")?.state === "watch", JSON.stringify([stOf("sesK4"), stOf("sesZ4")?.state]))
  cell("IT-11e only four reminders went: no letter, no mark", letters("sesK5").length === 0 && !stOf("sesK5")?.idleTab, JSON.stringify(stOf("sesK5")))
  cell("IT-11f the fifth reminder is younger than the threshold: no letter, no mark", letters("sesK6").length === 0 && !stOf("sesK6")?.idleTab, JSON.stringify(stOf("sesK6")))
  cell("IT-11g a cleaned task: no letter, no mark", letters("sesK7").length === 0 && !stOf("sesK7")?.idleTab, JSON.stringify(stOf("sesK7")))
  await wait(1500)
  cell("IT-11h no second letter in the same episode", letters("sesK1").length === 1 && letters("sesK2").length === 1, JSON.stringify([letters("sesK1").length, letters("sesK2").length]))
  // the reviewer of #92 works (a turn with a tool): its silence starts anew, the mark of the author is gone, no second letter
  endTurn("sesZ2", [{ type: "tool", name: "read", state: { status: "completed" } }, { type: "text", text: "Проверил." }])
  await wait(1000)
  cell("IT-11i the reviewer speaks: the mark of the author is gone, no second letter", !stOf("sesK2")?.idleTab && letters("sesK2").length === 1, JSON.stringify([letters("sesK2").length, stOf("sesK2")]))
  // the task is cleaned up: nothing stands
  putTask({ ...core.readJson(tasks.taskFile(P, 91)), status: "done", updated: Date.now() })
  await wait(1000)
  cell("IT-11j a cleaned task stands no more: the mark is gone", !stOf("sesK1")?.idleTab && !it?.idleOf?.("sesK1"), JSON.stringify(stOf("sesK1")))
}

clearInterval(heart)
stop?.()
db.close()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-idle-tab.test: FAIL ${fail}` : "crew-idle-tab.test ok")
process.exit(fail ? 1 : 0)

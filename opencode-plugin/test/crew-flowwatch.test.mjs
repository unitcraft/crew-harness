// Self-test of the flow watchdog (plan 002.4; node >= 24):  node test/crew-flowwatch.test.mjs
// A task session whose turn ends with a question is not told "continue": the question goes to whoever set the task.
// A merge lock held longer than stall_minutes and a submitted task waiting for a reviewer longer than that are raised
// to the task's author once. A turn OpenCode itself continued (no delivery, no busy mark) counts as working.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-flowwatch-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FLOW_MS = "200"
process.env.CREW_HARNESS_LEFT_MS = "200"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
// stall after 0.01 min (0.6 s); no review sessions, so a submitted task waits for a reviewer
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ stall_minutes: 0.01, accepted_reminder_min: 0.01, inflight_limit: 3, accepted_slot: "hold", heavy_commands: ["scripts/gate.sh"], spawn_limits: { reviewer: 0 }, branch_name: "t{n}-{slug}", cleanup: "local" }))
// the project is a git repository: task #3 was accepted, but its branch and a diagnostic branch stayed
const { execFileSync } = await import("node:child_process")
const g = (...a) => execFileSync("git", ["-C", proj, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
g("init", "-q", "-b", "main")
writeFileSync(path.join(proj, "a.txt"), "a")
g("add", "-A")
g("commit", "-q", "-m", "init")
g("branch", "t3-feat")
g("branch", "t3-diag")
g("branch", "t30-other") // another task's number: not a leftover of #3

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
for (const s of ["sesINTEG1", "sesREV01", "sesRUN01"]) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, proj, s)

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const review = await import("../review.ts")
const card = (session, extra = {}) => core.saveCard({ session, role: "worker", auto: false, title: session, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now(), ...extra })
card("sesINTEG1", { role: "integrator" })
const base = (n, extra) => {
  const t = tasks.createTask({ project: "proj", title: `t${n}`, goal: `goal ${n}`, criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: `q${n}`, status: "running", kind: "spawn", directory: proj })
  Object.assign(t, extra)
  tasks.saveTask(t)
  return t
}
// #1: on review, its review session holds the merge lock since 10 min ago and has an open review obligation
base(1, { status: "reviewing", executor: "sesEX1", reviewer: "sesREV01", review_kind: "spawn", review_qid: "rq1" })
card("sesREV01", { spawned: { by: "sesINTEG1", task: "приёмка #1", tier: "light", status: "running", at: Date.now(), qid: "rq1" }, review: { project: "proj", n: 1 } })
core.addObligation("sesREV01", { qid: "rq1", from_session: "sesINTEG1", from_role: "proj.integrator", at: Date.now(), nudges: 0, task: "приёмка #1" })
review.takeMergeLock("proj", "sesREV01", 1)
const lockFile = path.join(core.ROLES, "proj_merge.json")
writeFileSync(lockFile, JSON.stringify({ ...JSON.parse(readFileSync(lockFile, "utf8")), at: Date.now() - 600_000 }))
// #2: submitted 10 min ago, no reviewer (no places)
const t2 = base(2, { status: "submitted", executor: "sesEX2", report: "сделал 2" })
t2.history.push({ at: Date.now() - 600_000, by: "sesEX2", status: "submitted", note: "отчёт" })
tasks.saveTask(t2)
base(3, { status: "cleaned", slug: "feat", executor: "sesEX3", branch: "t3-feat" })
// #4: accepted an hour ago and never cleaned (#9 nova: 11.5 h, holding a place in inflight_limit)
const t4 = base(4, { status: "accepted", executor: "sesEX4", reviewer: "sesREV04", review_kind: "spawn" })
t4.history.push({ at: Date.now() - 3_600_000, by: "sesREV04", status: "accepted", note: "принята" })
tasks.saveTask(t4)
// sesRUN01: a task session whose turn OpenCode continued itself — messages after the last idle, updated now, no busy
card("sesRUN01", { spawned: { by: "sesINTEG1", task: "x", tier: "light", status: "running", at: Date.now(), qid: "q9" }, task: { project: "proj", n: 9 } })
msg("sesRUN01", "idle", { outcome: "succeeded" }, Date.now() - 60_000)
msg("sesRUN01", "assistant", { content: [{ type: "tool", name: "bash" }] })

// #5: accepted, its worktree still there; a watch stands in it (#26 nova, 2026-10-07: the watch waiting for the tree to go
// held the folder, and "git worktree remove" failed with Permission denied)
const wt5 = path.join(tmp, "wt5")
mkdirSync(wt5, { recursive: true })
base(5, { status: "accepted", executor: "sesEX5", reviewer: "sesREV05", review_kind: "spawn", worktree: wt5 })
const watchMod = await import("../watch.ts")
const w5 = watchMod.requestWatch({ session: "sesREV05", command: "sleep 30", cwd: wt5, note: "жду уборки" })
const mod = await import("../index.ts")
const tools = {}
const hooks = {}
const events = {}
const delivered = []
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
    synthetic: async ({ sessionID, text }) => delivered.push({ sessionID, text, synthetic: true }),
    update: async () => {},
    create: async (req) => ({ id: req.id }),
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 8_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
}
const letters = (to) => ["inbox", "read"].flatMap((d) => {
  try {
    const dir = path.join(core.BASE, d, to)
    return readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
  } catch {
    return []
  }
})
const WPID = 616161
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [{ sessionID: "sesINTEG1", active: true, busy: false }] }))
beat()
const heart = setInterval(beat, 300)
const stop = await mod.default.setup(ctx)

// 1. the reviewer's turn ends with a question: it goes to the integrator, the reviewer is not told "continue"
await hooks.context({ sessionID: "sesREV01", system: [], model: { id: "x", providerID: "y" } })
msg("sesREV01", "user", { text: "[opencode-peers] ПРИЁМКА задачи #1" })
msg("sesREV01", "assistant", { content: [{ type: "tool", name: "bash" }, { type: "text", text: "Проверки зелёные. Влить в main мне запрещено правилами.\n\nВливать?\n\nСТОП: неавторизовано слияние" }] })
msg("sesREV01", "idle", { outcome: "succeeded" })
await events["session.idle"]({ properties: { sessionID: "sesREV01" } })
await until(() => letters("sesINTEG1").some((l) => /остановилась с вопросом/.test(l.text)))
const ask = letters("sesINTEG1").filter((l) => /остановилась с вопросом/.test(l.text))
cell("the question goes to the integrator, once", ask.length === 1 && /«Вливать\?»/.test(ask[0].text) && ask[0].text.includes('crew_send {to: "sesREV01"'), JSON.stringify(ask.map((l) => l.text.slice(0, 200))))
cell("the reviewer is not told 'continue'", letters("sesREV01").every((l) => !/Не завершено/.test(l.text)), JSON.stringify(letters("sesREV01").map((l) => l.text.slice(0, 80))))

// 2. the merge lock held 10 min > stall_minutes: one letter to the task's author
await until(() => letters("sesINTEG1").some((l) => /Замок слияния/.test(l.text)))
await wait(600)
const lock = letters("sesINTEG1").filter((l) => /Замок слияния/.test(l.text))
cell("a long-held merge lock is raised to the integrator, once", lock.length === 1 && /приёмка #1/.test(lock[0].text), JSON.stringify(lock.map((l) => l.text.slice(0, 160))))
cell("the lock letter names the holder, the task, the time and the way out (accept after LANDED or unlock; the service releases a landed lock)", lock.length === 1 && /сессия sesREV\d+/.test(lock[0].text) && /«[^»]+»/.test(lock[0].text) && /с \d\d:\d\d/.test(lock[0].text) && /accept 1 после LANDED или unlock 1, если слияние прервано/.test(lock[0].text) && /плагин сам отпускает замок, когда проверенный кандидат уже на вершине origin/.test(lock[0].text), JSON.stringify(lock.map((l) => l.text)))

// 3. a submitted task waiting for a reviewer
const wait2 = letters("sesINTEG1").filter((l) => /ждёт приёмщика/.test(l.text))
cell("a submitted task waiting for a reviewer is raised, once", wait2.length === 1 && /#2/.test(wait2[0].text), JSON.stringify(wait2.map((l) => l.text.slice(0, 160))))

// 4. a turn continued by OpenCode itself counts as working
await until(() => {
  try {
    return JSON.parse(readFileSync(path.join(tmp, "opencode", "crew-harness", "status", "sesRUN01.json"), "utf8")).state === "working"
  } catch {
    return false
  }
})
const run = JSON.parse(readFileSync(path.join(tmp, "opencode", "crew-harness", "status", "sesRUN01.json"), "utf8"))
cell("an open, fresh turn in the database is 'working'", run.state === "working", run.state)

// 5. leftovers of an accepted task: one letter to the author listing them (not another task's branch)
await until(() => letters("sesINTEG1").some((l) => /остались хвосты/.test(l.text)))
await wait(600)
const left = letters("sesINTEG1").filter((l) => /остались хвосты/.test(l.text))
cell("leftovers of an accepted task are raised to its author, once", left.length === 1 && /t3-feat/.test(left[0].text) && /t3-diag/.test(left[0].text) && !/t30-other/.test(left[0].text), JSON.stringify(left.map((l) => l.text)))

// 6. accepted but not cleaned past accepted_reminder_min (plan 002.6, defect 2): the reviewer is woken to repeat cleaned,
// the author is told; a spawn refused by the full inflight_limit names the task
await until(() => letters("sesREV04").some((l) => /не очищена/.test(l.text)))
await wait(600)
const stale = letters("sesREV04").filter((l) => /не очищена/.test(l.text))
cell("the reviewer of a stale accepted task is woken to repeat cleaned, once", stale.length === 1 && /#4/.test(stale[0].text) && /cleaned/.test(stale[0].text) && stale[0].wake !== false, JSON.stringify(stale.map((l) => l.text.slice(0, 200))))
const staleA = letters("sesINTEG1").filter((l) => /#4 .*не очищена/.test(l.text))
cell("the author is told too, once", staleA.length === 1, JSON.stringify(staleA.map((l) => l.text.slice(0, 200))))
await tools.crew_role.execute({ role: "integrator" }, { sessionID: "sesINTEG1" })
const refused = (await tools.crew_spawn.execute({ title: "срочная", goal: "g", criteria: "c", priority: "P1" }, { sessionID: "sesINTEG1" })).content
cell("a spawn refused by inflight_limit names the accepted, not cleaned task", /Лимит задач проекта/.test(refused) && /#4 принята 60 мин назад, не очищена/.test(refused), refused)

// 7. crew_watch {action: "cancel", id} through the tool (plan 002.6, defect 5)
const put = (await tools.crew_watch.execute({ command: "sleep 60", machine: true, note: "плохая команда" }, { sessionID: "sesINTEG1" })).content
const wid = /id: "([^"]+)"/.exec(put)?.[1]
const cancelled = wid ? (await tools.crew_watch.execute({ action: "cancel", id: wid }, { sessionID: "sesINTEG1" })).content : ""
cell("crew_watch names the id and cancels its own watch", !!wid && /отменено/.test(cancelled), JSON.stringify({ put, cancelled }))

// 8. a command from heavy_commands goes to the machine queue by itself (plan 004)
const heavy = (await tools.crew_watch.execute({ command: "bash scripts/gate.sh --tier push", note: "гейт" }, { sessionID: "sesINTEG1" })).content
const hid = /id: "([^"]+)"/.exec(heavy)?.[1]
const wfile = (ext) => path.join(core.BASE, "watches", `${hid}${ext}`)
const hreq = hid ? JSON.parse(readFileSync([".req.json", ".json"].map(wfile).find((f) => { try { readFileSync(f); return true } catch { return false } }) ?? wfile(".json"), "utf8")) : {}
cell("a heavy command is queued for the machine without machine: true", hreq.machine === true && /heavy_commands/.test(heavy), JSON.stringify({ heavy, hreq }))
if (hid) await tools.crew_watch.execute({ action: "cancel", id: hid }, { sessionID: "sesINTEG1" })

// 5. the watch standing in an accepted task's tree moves to the main copy, with a letter
await until(() => watchMod.watchesOf("sesREV05").some((w) => w.cwd === proj))
const moved = watchMod.watchesOf("sesREV05")
cell("a watch in an accepted task's tree moves to the main copy", moved.length === 1 && moved[0].cwd === proj && moved[0].command === "sleep 30" && moved[0].id !== w5.id, JSON.stringify(moved))
cell("its tab is told the new id", letters("sesREV05").some((l) => l.text.includes(w5.id) && l.text.includes(moved[0]?.id ?? "?") && /основную копию/.test(l.text)), JSON.stringify(letters("sesREV05").map((l) => l.text.slice(0, 160))))
for (const w of moved) watchMod.dropWatch(w)
clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-flowwatch.test: FAIL ${fail}` : "crew-flowwatch.test ok")
process.exit(fail ? 1 : 0)

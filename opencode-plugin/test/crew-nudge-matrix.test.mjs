// Matrix test "task status x conditions -> whom and how the plugin wakes" (task 042; node >= 24):  node test/crew-nudge-matrix.test.mjs
// The rows follow doc/tasks/042-nudge-matrix/analysis.md (row ids M01...). Every row runs on the real plugin: tasks are written to the
// journal, the loop passes (reconcile, resumeTasks, assignReviewers, flow watchdog, reminders) and the turn ends of the sessions
// (the end-of-turn nudge) are simulated through OpenCode's database exactly as crew-push does. Times are shortened by the settings
// of the test projects and the CREW_HARNESS_* variables.
// A row without an implementation is a KNOWN HOLE: it states the behavior that is wanted and passes only while the plugin does NOT do
// it ("HOLE" in the output). When a hole gets closed the row fails with "hole closed": turn it into a normal row.
// Task 043 closed T3 (L1), L3, T7b, M18a, T11/M04a and the text of the "review stuck" letter: those rows are normal now.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-nudge-matrix-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "200"
process.env.CREW_HARNESS_FLOW_MS = "200"
process.env.CREW_HARNESS_LEFT_MS = "3600000"
process.env.CREW_HARNESS_START_RETRY_MS = "1000"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE

// one directory per project: its own settings (reviewer, accepted_slot, plan_approver)
const BASE_CFG = { push_empty_turns: 2, push_max: 3, stall_minutes: 0.01, accepted_reminder_min: 0.01, owner_reminder_min: 0.01, inflight_limit: 30, spawn_limits: { worker: 9, reviewer: 1, acceptor: 1 } }
const dirs = {}
const projectsOpt = {}
const mkProject = (name, extra = {}) => {
  const dir = path.join(tmp, name)
  mkdirSync(path.join(dir, ".opencode"), { recursive: true })
  writeFileSync(path.join(dir, ".opencode", "crew-harness.json"), JSON.stringify({ ...BASE_CFG, ...extra }))
  dirs[name] = dir
  projectsOpt[name] = dir
}
mkProject("pw") // executors, obligations, turns; reviewer: worker
mkProject("pt") // reviewer: worker, free worker tabs
mkProject("ps") // reviewer: worker, no tabs, one review session
mkProject("pz", { spawn_limits: { worker: 9, reviewer: 0 } }) // places of reviewers are all taken
mkProject("pi", { reviewer: "integrator" })
mkProject("pa", { reviewer: "acceptor" })
mkProject("pq") // plan task, a second round
mkProject("pf", { accepted_slot: "free" })
mkProject("ph", { accepted_slot: "hold" })
mkProject("pc") // the integrator's tab is closed
mkProject("pn", { plan_approver: "integrator" })
mkProject("po", { plan_approver: "owner" })
mkProject("pr") // the review session cannot be created

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
const known = new Set()
const ses = (s, dir = tmp) => {
  if (!known.has(s)) (known.add(s), db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, dir, s))
  return s
}

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const review = await import("../review.ts")
const status = await import("../status.ts")
const DEAD = 999999
const card = (session, project, extra = {}) => {
  ses(session, dirs[project])
  core.saveCard({ session, role: "worker", auto: false, title: session, directory: dirs[project], repo: project, project, pid: process.pid, updated: Date.now(), ...extra })
}
const AUTH = { pw: "sesAW", pt: "sesAT", ps: "sesAS", pz: "sesAZ", pi: "sesAI", pa: "sesAA", pq: "sesAQ", pf: "sesAF", ph: "sesAH", pc: "sesAC", pn: "sesAN", po: "sesAO", pr: "sesAR" }
for (const [p, s] of Object.entries(AUTH)) card(s, p, { role: "integrator" })
let qn = 0
const mk = (project, extra = {}) => {
  const t = tasks.createTask({ project, title: extra.title ?? "task", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: AUTH[project], author_role: `${project}.integrator`, qid: `q${++qn}x`, status: "running", kind: "spawn", directory: dirs[project] })
  Object.assign(t, extra)
  tasks.saveTask(t)
  return t
}
const when = (t, status, ago) => {
  t.history.push({ at: Date.now() - ago, by: "x", status, note: status })
  tasks.saveTask(t)
}
const spawnedCard = (session, t, extra = {}) => card(session, t.project, { spawned: { by: t.author, task: "x", tier: "light", status: "running", at: Date.now(), qid: t.qid }, task: { project: t.project, n: t.n }, ...extra })
const reviewerCard = (session, t, extra = {}) => card(session, t.project, { review: { project: t.project, n: t.n }, ...extra })
const oblig = (session, qid) => core.obligationsOf(session).find((o) => o.qid === qid)

// ---------- fixtures: rows decided by the passes of the loop ----------
const T = {}
// M01 starting: the loop starts the session
T.m01 = mk("pw", { status: "starting", executor: "ses_m01plan" })
// M02 starting, the session cannot be created
T.m02 = mk("pw", { status: "starting", executor: "ses_m02fail" })
// M03 running, the executor's obligation was lost
T.m03 = mk("pw", { executor: "sesEX03" })
spawnedCard("sesEX03", T.m03)
// M04 running, no executor card at all (the session is gone)
T.m04 = mk("pw", { executor: "sesEX04" })
// M05 rework (the remarks), M06 rework after a sync request
T.m05 = mk("pw", { status: "rework", executor: "sesEX05", reviewer: "sesRV05", review_kind: "tab", review_qid: "rq5x", rework: 1, rework_note: "исправь пустой ввод", reviewer_role: "pw.worker" })
spawnedCard("sesEX05", T.m05)
reviewerCard("sesRV05", T.m05)
T.m06 = mk("pw", { status: "rework", executor: "sesEX06", reviewer: "sesRV06", review_kind: "tab", review_qid: "rq6x", syncs: 1, rework_sync: true, rework_note: "влей свежий main", reviewer_role: "pw.worker" })
spawnedCard("sesEX06", T.m06)
reviewerCard("sesRV06", T.m06)
// M07 a task taken by the owner's tab (kind assign), the tab is closed
T.m07 = mk("pw", { kind: "assign", executor: "sesOWN7" })
card("sesOWN7", "pw", { task: { project: "pw", n: T.m07.n } })
// M08 submitted, a free worker tab exists; M09 two plan tasks...
T.m08 = mk("pt", { status: "submitted", executor: "sesEX08", report: "сделал" })
when(T.m08, "submitted", 1000)
card("sesFT", "pt")
// M09 submitted, no tabs, one review session allowed
T.m09 = mk("ps", { status: "submitted", executor: "sesEX09", report: "сделал" })
when(T.m09, "submitted", 1000)
// M09a submitted, the review session cannot be created
T.m09a = mk("pr", { status: "submitted", executor: "sesEX09a", report: "сделал" })
when(T.m09a, "submitted", 1000)
// M10 submitted, reviewers places are all taken (limit 0): the author is told after stall_minutes
T.m10 = mk("pz", { status: "submitted", executor: "sesEX10", report: "сделал" })
when(T.m10, "submitted", 600_000)
// M11 reviewer: integrator
T.m11 = mk("pi", { status: "submitted", executor: "sesEX11", report: "сделал" })
when(T.m11, "submitted", 1000)
// M12 reviewer: acceptor, an acceptor tab and a plain worker tab exist; M13 the second task has no acceptor tab left
T.m12 = mk("pa", { status: "submitted", executor: "sesEX12", report: "сделал" })
when(T.m12, "submitted", 3000)
T.m13 = mk("pa", { status: "submitted", executor: "sesEX13", report: "сделал" })
when(T.m13, "submitted", 1000)
card("sesFAA", "pa", { role: "acceptor" })
card("sesFAW", "pa")
// M14 plan task submitted again: the tab that checked before is not taken
T.m14 = mk("pq", { status: "submitted", executor: "sesEX14", report: "план", reviewers: ["sesFQ1"], rework: 1, plan: { n: "1", file: "docs/plans/p.md", source: "s", rounds: [], clean: 0 } })
when(T.m14, "submitted", 1000)
card("sesFQ1", "pq")
card("sesFQ2", "pq")
// M15 submitted after rework: the reviewer is known, its obligation is gone
T.m15 = mk("pw", { status: "submitted", executor: "sesEX15", report: "поправил", reviewer: "sesRV15", review_kind: "tab", review_qid: "rq15x", review_letter: "review-pw-15-1", rework: 1, reviewer_role: "pw.worker" })
spawnedCard("sesEX15", T.m15)
reviewerCard("sesRV15", T.m15)
core.postLetter("sesRV15", { id: "review-pw-15-1", from_role: "pw.integrator", from_session: AUTH.pw, to: "sesRV15", time: Date.now() - 60_000, wake: false, text: "ПРИЁМКА (старое письмо)" })
// M16 on review, the reviewer's tab is closed
T.m16 = mk("pt", { status: "reviewing", executor: "sesEX16", reviewer: "sesRV16", review_kind: "tab", review_qid: "rq16x" })
reviewerCard("sesRV16", T.m16)
// M17 on review, the reviewer has held the merge lock longer than stall_minutes
T.m17 = mk("pw", { status: "reviewing", executor: "sesEX17", reviewer: "sesRV17", review_kind: "tab", review_qid: "rq17x" })
reviewerCard("sesRV17", T.m17)
review.takeMergeLock("pw", "sesRV17", T.m17.n)
const ageLock = (project) => {
  const lockFile = path.join(core.ROLES, `${project}_merge.json`)
  writeFileSync(lockFile, JSON.stringify({ ...JSON.parse(readFileSync(lockFile, "utf8")), at: Date.now() - 600_000 }))
}
ageLock("pw")
// T7c on review in the project whose author's tab is closed: the reviewer has held the merge lock too long
T.t7c = mk("pc", { status: "reviewing", executor: "sesEX7c", reviewer: "sesRV7c", review_kind: "tab", review_qid: "rq7cx" })
reviewerCard("sesRV7c", T.t7c)
review.takeMergeLock("pc", "sesRV7c", T.t7c.n)
ageLock("pc")
// M18/M19 accepted, not cleaned up an hour: accepted_slot free / hold
T.m18 = mk("pf", { status: "accepted", executor: "sesEX18", reviewer: "sesRV18", review_kind: "tab", review_qid: "rq18x" })
when(T.m18, "accepted", 3_600_000)
reviewerCard("sesRV18", T.m18)
T.m19 = mk("ph", { status: "accepted", executor: "sesEX19", reviewer: "sesRV19", review_kind: "tab", review_qid: "rq19x" })
when(T.m19, "accepted", 3_600_000)
reviewerCard("sesRV19", T.m19)
// M20 plan waiting for the approval of the owner / of the integrator
const planOf = (n) => ({ n, file: `docs/plans/${n}.md`, source: "s", rounds: [], clean: 0 })
T.m20 = mk("po", { status: "approval", executor: "sesEX20", title: "план 20: x", plan: planOf("20") })
T.m21 = mk("pn", { status: "approval", executor: "sesEX21", title: "план 21: x", plan: planOf("21") })
// M22 done / cancelled: the executor session is closed
T.m22 = mk("pw", { status: "done", executor: "sesEX22", reviewer: "sesRV22", review_kind: "tab", checks: { t: "ok" } })
spawnedCard("sesEX22", T.m22)
T.m23 = mk("pw", { status: "cancelled", executor: "sesEX23" })
spawnedCard("sesEX23", T.m23)

// T11 running, the executor's session was deleted in OpenCode: every delivery fails
T.t11 = mk("pw", { executor: "sesEX41" })
spawnedCard("sesEX41", T.t11)
core.postLetter("sesEX41", { id: "t11-letter", from_role: "pw.integrator", from_session: AUTH.pw, to: "sesEX41", time: Date.now(), text: "письмо исполнителю удалённой сессии" })

// ---------- fixtures: rows decided by the end of a turn ----------
T.t1 = mk("pw", { executor: "sesEX31" }) // empty turns of an executor
spawnedCard("sesEX31", T.t1)
T.t2 = mk("pt", { status: "reviewing", executor: "sesEX32", reviewer: "sesRV32", review_kind: "tab", review_qid: "rq32x" }) // empty turns of a reviewer
reviewerCard("sesRV32", T.t2)
core.addObligation("sesRV32", { qid: "rq32x", from_session: AUTH.pt, from_role: "pt.integrator", at: Date.now(), nudges: 0, task: `приёмка #${T.t2.n}` })
T.t3 = mk("pw", { executor: "sesEX33" }) // working turns of an executor: push_max
spawnedCard("sesEX33", T.t3)
T.t4 = mk("ph", { status: "accepted", executor: "sesEX34", reviewer: "sesRV34", review_kind: "tab", review_qid: "rq34x" }) // accepted: the reviewer is still nudged
when(T.t4, "accepted", 1000)
reviewerCard("sesRV34", T.t4)
core.addObligation("sesRV34", { qid: "rq34x", from_session: AUTH.ph, from_role: "ph.integrator", at: Date.now(), nudges: 0, task: `приёмка #${T.t4.n}` })
T.t5 = mk("pw", { status: "rework", executor: "sesEX35", rework: 1, rework_note: "поправь", reviewer_role: "pw.worker", reviewer: "sesRV35", review_kind: "tab", review_qid: "rq35x" }) // rework: the executor is nudged
spawnedCard("sesEX35", T.t5)
core.addObligation("sesEX35", { qid: T.t5.qid, from_session: AUTH.pw, from_role: "pw.integrator", at: Date.now(), nudges: 0, task: T.t5.title })
T.t6 = mk("pi", { status: "reviewing", executor: "sesEX36", reviewer: AUTH.pi, review_kind: "integrator", review_qid: "rq36x" }) // reviewer: integrator, stuck
core.saveCard({ ...core.readJson(core.cardFile(AUTH.pi)), review: { project: "pi", n: T.t6.n } })
core.addObligation(AUTH.pi, { qid: "rq36x", from_session: AUTH.pi, from_role: "pi.integrator", at: Date.now(), nudges: 0, task: `приёмка #${T.t6.n}` })
T.t7 = mk("pc", { executor: "sesEX37" }) // the author's tab is closed, the executor is stuck
spawnedCard("sesEX37", T.t7)
T.t8 = mk("pw", { kind: "assign", executor: "sesOWN8" }) // the owner's closed tab as the executor: the nudge reaches it
card("sesOWN8", "pw", { task: { project: "pw", n: T.t8.n } })
core.addObligation("sesOWN8", { qid: T.t8.qid, from_session: AUTH.pw, from_role: "pw.integrator", at: Date.now(), nudges: 0, task: T.t8.title })
T.t9 = mk("pw", { executor: "sesEX39" }) // a turn that ended while nobody watched (service down): nobody nudges
spawnedCard("sesEX39", T.t9, { pid: DEAD })
core.addObligation("sesEX39", { qid: T.t9.qid, from_session: AUTH.pw, from_role: "pw.integrator", at: Date.now() - 3_600_000, nudges: 0, task: T.t9.title })
msg("sesEX39", "user", { text: "[opencode-peers] ЗАДАЧА" }, Date.now() - 3_600_000)
msg("sesEX39", "assistant", { content: [{ type: "text", text: "статус: работаю" }] }, Date.now() - 3_600_000)
msg("sesEX39", "idle", { outcome: "succeeded" }, Date.now() - 3_600_000)
T.t10 = mk("pt", { status: "reviewing", executor: "sesEX40", reviewer: "sesRV40", review_kind: "tab", review_qid: "rq40x" }) // crew_task push on a task under review
reviewerCard("sesRV40", T.t10)
spawnedCard("sesEX40", T.t10)

// ---------- the plugin ----------
const mod = await import("../index.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const creates = []
let failCreates = 0
let reviewFails = 0
let promptFails = 0
const ctx = {
  location: { directory: dirs.pw },
  options: { projects: projectsOpt },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: tmp }, time: {} }),
    prompt: async ({ sessionID, text }) => {
      if (sessionID === "sesEX41") {
        promptFails++
        throw new Error("Session.NotFoundError")
      }
      delivered.push({ sessionID, text })
    },
    synthetic: async ({ sessionID, text }) => void delivered.push({ sessionID, text, synthetic: true }),
    create: async (req) => {
      creates.push(req)
      if (req.metadata?.crewReview?.project === "pr") {
        reviewFails++
        throw new Error("review model unavailable")
      }
      if (req.id === "ses_m02fail") {
        failCreates++
        throw new Error("model service unavailable")
      }
      return { id: req.id }
    },
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
let fail = 0
let rows = 0
const holes = []
const cell = (id, name, ok, detail) => {
  rows++
  console.log(`${ok ? "ok  " : "FAIL"} ${id} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
// a known hole: `wanted` is what the row wants to be true; the row passes while it is not
const hole = (id, name, wanted, detail) => {
  rows++
  if (wanted) {
    console.log(`FAIL ${id} HOLE CLOSED, turn it into a normal row: ${name}`)
    fail++
  } else {
    holes.push(id)
    console.log(`HOLE ${id} ${name} :: ${detail}`)
  }
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 8_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
}
const letters = (to) =>
  ["inbox", "read"].flatMap((d) => {
    try {
      const dir = path.join(core.BASE, d, to)
      return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ box: d, ...JSON.parse(readFileSync(path.join(dir, f), "utf8")) }))
    } catch {
      return []
    }
  })
const lettersRe = (to, re) => letters(to).filter((l) => re.test(l.text))
const sent = (s, re) => delivered.filter((d) => d.sessionID === s && re.test(d.text))
const WPID = 626262
mkdirSync(core.WINDOWS, { recursive: true })
const tabNames = [...Object.values(AUTH).filter((s) => s !== AUTH.pc), "sesFT", "sesFAA", "sesFAW", "sesFQ1", "sesFQ2"]
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: tabNames.map((sessionID, i) => ({ sessionID, active: i === 0, busy: false })) }))
beat()
const heart = setInterval(beat, 300)
const seenNotices = []
const seenFiles = new Set()
const collect = setInterval(() => {
  try {
    for (const f of readdirSync(path.join(core.NOTICES, String(WPID)))) if (!seenFiles.has(f)) (seenFiles.add(f), seenNotices.push(JSON.parse(readFileSync(path.join(core.NOTICES, String(WPID), f), "utf8"))))
  } catch {}
}, 50)
const noticesFor = (session) => seenNotices.filter((n) => n.sessionID === session)

const stop = await mod.default.setup(ctx)
// a turn of a session as OpenCode records it (request -> messages -> idle row -> idle event), like crew-push
async function turn(session, { tools: withTool = false } = {}) {
  await hooks.context({ sessionID: session, system: [], model: { id: "x", providerID: "y" } })
  msg(session, "user", { text: "[opencode-peers] Письмо соседней вкладки" })
  msg(session, "assistant", { content: withTool ? [{ type: "tool", name: "bash" }, { type: "text", text: "сделал шаг" }] : [{ type: "text", text: "статус: работаю" }] })
  msg(session, "idle", { outcome: "succeeded" })
  await events["session.idle"]({ properties: { sessionID: session } })
  await wait(450)
}
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content

// ===== rows decided by the passes of the loop =====
await until(() => tasks.loadTask("pw", T.m01.n)?.status === "running" && letters(AUTH.pz).some((l) => /ждёт приёмщика/.test(l.text)) && T.m09 && tasks.loadTask("ps", T.m09.n)?.reviewer && tasks.loadTask("pi", T.m11.n)?.reviewer && tasks.loadTask("pa", T.m13.n)?.reviewer && tasks.loadTask("pq", T.m14.n)?.reviewer && letters(AUTH.pf).some((l) => /не очищена/.test(l.text)) && letters(AUTH.ph).some((l) => /не очищена/.test(l.text)))
await wait(1500)

// M01 starting
{
  const t = tasks.loadTask("pw", T.m01.n)
  cell("M01", "starting: resumeTasks creates the session once, the task runs, the executor has its obligation and the task letter", creates.filter((r) => r.id === "ses_m01plan").length === 1 && t.status === "running" && !!oblig("ses_m01plan", T.m01.qid) && sent("ses_m01plan", /ЗАДАЧА/).length === 1, JSON.stringify({ creates: creates.length, st: t.status, ob: core.obligationsOf("ses_m01plan") }))
}
// M02 starting, create fails
{
  const t = tasks.loadTask("pw", T.m02.n)
  cell("M02", "starting, the session cannot be created: retried on the next passes, the task stays starting", failCreates >= 2 && t.status === "starting", JSON.stringify({ failCreates, st: t.status }))
  const told = lettersRe(AUTH.pw, new RegExp(`#${T.m02.n} .*не запущена`))
  cell("M02a", "starting, the session cannot be created: the author gets one letter with the reason (not only the server log)", told.length === 1 && /model service unavailable/.test(told[0].text), JSON.stringify(told.map((l) => l.text.slice(0, 200))))
}
// M03 running, obligation lost
cell("M03", "running: reconcile restores the executor's obligation (qid of the task, from the author)", oblig("sesEX03", T.m03.qid)?.from_session === AUTH.pw, JSON.stringify(core.obligationsOf("sesEX03")))
// M04 running, the executor has no card
{
  const ob = oblig("sesEX04", T.m04.qid)
  cell("M04", "running, no card of the executor: reconcile still records the obligation", !!ob, "no obligation")
  const m04re = new RegExp(`#${T.m04.n}\\b.*пропала`)
  await until(() => lettersRe(AUTH.pw, m04re).length > 0)
  const told = lettersRe(AUTH.pw, m04re)
  const hist = tasks.loadTask("pw", T.m04.n).history.filter((h) => /пропала/.test(h.note ?? ""))
  cell("M04a", "running, the executor's session is gone (no card): after 3 passes ONE letter to the author (reassign) and an entry in the task history", told.length === 1 && /crew_task \{action: "reassign", n: \d+\}/.test(told[0].text) && hist.length === 1, JSON.stringify({ told: told.map((x) => x.text.slice(0, 160)), hist: hist.length }))
}
// M05/M06 rework
cell("M05", "rework (remarks): the executor gets the rework letter with the remarks and has the obligation", sent("sesEX05", /исправь пустой ввод/).length === 1 && !!oblig("sesEX05", T.m05.qid), JSON.stringify({ d: delivered.filter((d) => d.sessionID === "sesEX05").map((d) => d.text.slice(0, 60)), ob: core.obligationsOf("sesEX05") }))
cell("M06", "rework after a sync request (rework_sync): same letter and obligation, the reviewer is not woken", sent("sesEX06", /влей свежий main/).length === 1 && !!oblig("sesEX06", T.m06.qid) && sent("sesRV06", /./).length === 0, JSON.stringify({ d: delivered.filter((d) => d.sessionID === "sesEX06" || d.sessionID === "sesRV06").map((d) => `${d.sessionID}: ${d.text.slice(0, 60)}`) }))
// M07 assign, closed tab
cell("M07", "running, kind assign, the owner's tab is closed: reconcile records the obligation; the nudge below reaches the closed tab", !!oblig("sesOWN7", T.m07.qid), JSON.stringify(core.obligationsOf("sesOWN7")))
// M08 submitted, tab reviewer
{
  const t = tasks.loadTask("pt", T.m08.n)
  cell("M08", "submitted, reviewer worker, a free worker tab: it becomes the reviewer, gets the review letter and the obligation", t.reviewer === "sesFT" && t.review_kind === "tab" && sent("sesFT", /ПРИЁМКА/).length === 1 && !!oblig("sesFT", t.review_qid), JSON.stringify({ r: t.reviewer, k: t.review_kind, d: delivered.filter((d) => d.sessionID === "sesFT").length }))
}
// M09 submitted, spawn reviewer
{
  const t = tasks.loadTask("ps", T.m09.n)
  cell("M09", "submitted, reviewer worker, no tab: a review session is created once, with the letter and the obligation", t.review_kind === "spawn" && creates.filter((r) => r.id === t.reviewer).length === 1 && sent(t.reviewer, /ПРИЁМКА/).length === 1 && !!oblig(t.reviewer, t.review_qid), JSON.stringify({ r: t.reviewer, k: t.review_kind, c: creates.length }))
}
// M09a the review session cannot be created
{
  const told = lettersRe(AUTH.pr, /сессию приёмки создать не удалось/)
  cell("M09a", "submitted, the review session cannot be created: retried on the passes; the author gets one letter with the reason", reviewFails >= 2 && told.length === 1 && /review model unavailable/.test(told[0].text), JSON.stringify({ reviewFails, told: told.map((l) => l.text.slice(0, 160)) }))
}
// M10 stall: no places
{
  const t = tasks.loadTask("pz", T.m10.n)
  const l = lettersRe(AUTH.pz, /ждёт приёмщика/)
  cell("M10", "submitted, places of reviewers taken (spawn_limits.reviewer 0): no reviewer, after stall_minutes ONE letter to the author", !t.reviewer && l.length === 1 && /#\d+/.test(l[0].text), JSON.stringify({ r: t.reviewer, l: l.map((x) => x.text.slice(0, 100)) }))
}
// M11 integrator reviews
{
  const t = tasks.loadTask("pi", T.m11.n)
  cell("M11", "submitted, reviewer integrator: the author itself is the reviewer, obligation to itself (asker = itself), review letter delivered", t.reviewer === AUTH.pi && t.review_kind === "integrator" && oblig(AUTH.pi, t.review_qid)?.from_session === AUTH.pi && sent(AUTH.pi, /ПРИЁМКА/).length >= 1, JSON.stringify({ r: t.reviewer, ob: core.obligationsOf(AUTH.pi), d: delivered.filter((d) => d.sessionID === AUTH.pi).length }))
}
// M12/M13 acceptor
{
  const a = tasks.loadTask("pa", T.m12.n)
  const b = tasks.loadTask("pa", T.m13.n)
  cell("M12", "submitted, reviewer acceptor, tabs of acceptor and worker: the acceptor tab is taken, the worker tab is not", a.reviewer === "sesFAA" && a.review_kind === "tab" && sent("sesFAW", /ПРИЁМКА/).length === 0, JSON.stringify({ a: a.reviewer, b: b.reviewer }))
  const bc = b.reviewer ? core.readJson(core.cardFile(b.reviewer)) : undefined
  cell("M13", "submitted, reviewer acceptor, the acceptor tab is busy: a new session with the role acceptor (the worker tab is still not taken)", b.review_kind === "spawn" && bc?.role === "acceptor" && !!oblig(b.reviewer, b.review_qid), JSON.stringify({ b: b.reviewer, k: b.review_kind, role: bc?.role }))
}
// M14 plan task, second round
{
  const t = tasks.loadTask("pq", T.m14.n)
  cell("M14", "plan task submitted again: the tab that checked the previous round is not taken, the other free tab is", t.reviewer === "sesFQ2", JSON.stringify({ r: t.reviewer }))
}
// M15 submitted after rework, the obligation of the reviewer is gone
{
  const letter = lettersRe("sesRV15", /Доработка задачи/)
  cell("M15", "submitted after rework: reconcile posts the 'checked again' letter to the known reviewer", letter.length === 1, JSON.stringify(letters("sesRV15").map((l) => l.text.slice(0, 60))))
  hole("M15a", "submitted after rework: the reviewer's obligation lost with a cut-off is not restored (wanted: restored, so the reviewer is nudged)", !!oblig("sesRV15", T.m15.review_qid), JSON.stringify(core.obligationsOf("sesRV15")))
}
// M16 reviewer tab closed
{
  const t = tasks.loadTask("pt", T.m16.n)
  cell("M16", "reviewing, the reviewer tab is closed: reconcile posts the review letter, records the obligation, and the closed tab still gets the letter (holds an open task)", !!oblig("sesRV16", T.m16.review_qid) && sent("sesRV16", /ПРИЁМКА/).length === 1, JSON.stringify({ d: delivered.filter((d) => d.sessionID === "sesRV16").length, ob: core.obligationsOf("sesRV16"), l: t.review_letter }))
}
// M17 merge lock
{
  const l = lettersRe(AUTH.pw, /Замок слияния проекта pw/)
  cell("M17", "reviewing, the reviewer holds the merge lock longer than stall_minutes: ONE letter to the author", l.length === 1 && new RegExp(`приёмка #${T.m17.n}`).test(l[0].text), JSON.stringify(l.map((x) => x.text.slice(0, 120))))
}
// M18/M19 accepted not cleaned
{
  const rf = lettersRe("sesRV18", /не очищена/)
  const af = lettersRe(AUTH.pf, new RegExp(`#${T.m18.n} .*не очищена`))
  cell("M18", "accepted, accepted_slot free, over accepted_reminder_min: the reviewer is woken to repeat cleanup (place not held), the author is told", rf.length >= 1 && rf.every((l) => /место в inflight_limit не занимает/.test(l.text) && l.wake !== false) && af.length >= 1, JSON.stringify({ rf: rf.map((l) => l.text.slice(0, 100)), af: af.length }))
  const rh = lettersRe("sesRV19", /не очищена/)
  cell("M19", "accepted, accepted_slot hold: same letters, the text says the place is held", rh.length >= 1 && /держит место в лимите/.test(rh[0].text), JSON.stringify(rh.map((l) => l.text.slice(0, 100))))
}
// M20/M21 approval
{
  const n = noticesFor(undefined).filter((x) => /ждёт согласования/.test(x.title))
  cell("M20", "approval, plan_approver owner: a notice with attention in the live windows (the repeat period is max(1, owner_reminder_min) minutes, not shortened here)", n.length >= 1 && n[0].attention === true, JSON.stringify(seenNotices.map((x) => x.title)))
  const l = lettersRe(AUTH.pn, /ждёт твоего согласования/)
  cell("M21", "approval, plan_approver integrator: a letter to the author (plan_decide); no notice to the owner", l.length >= 1 && n.length === 1, JSON.stringify({ l: l.length, n: n.length }))
}
// M22/M23 done / cancelled
{
  const c22 = core.readJson(core.cardFile("sesEX22"))
  const c23 = core.readJson(core.cardFile("sesEX23"))
  cell("M22", "done: the executor session is closed, no letters but the quiet summary", c22?.spawned?.status === "closed" && sent("sesEX22", /Не завершено/).length === 0, JSON.stringify(c22?.spawned))
  cell("M23", "cancelled: the executor session is closed, no nudges", c23?.spawned?.status === "closed" && sent("sesEX23", /Не завершено/).length === 0, JSON.stringify(c23?.spawned))
}
// T11 the deleted session
{
  const t11re = new RegExp(`#${T.t11.n}\\b.*пропала`)
  await until(() => lettersRe(AUTH.pw, t11re).length > 0)
  await until(() => promptFails >= 5)
  const told = lettersRe(AUTH.pw, t11re)
  const hist = tasks.loadTask("pw", T.t11.n).history.filter((h) => /пропала/.test(h.note ?? ""))
  cell("T11", "running, the executor's session was deleted in OpenCode: after 3 failed deliveries in a row ONE letter to the author (reassign) and ONE entry in the task history, not repeated", promptFails >= 5 && told.length === 1 && /NotFound/.test(told[0].text) && /crew_task \{action: "reassign", n: \d+\}/.test(told[0].text) && hist.length === 1, JSON.stringify({ promptFails, told: told.map((l) => l.text.slice(0, 200)), hist: hist.length }))
}
// M18a the reminder repeats every accepted_reminder_min (0.6 s here), at most 5 times per acceptance; then a line in /crew
{
  await until(() => lettersRe("sesRV18", /не очищена/).length >= 5)
  await wait(2000)
  const rf = lettersRe("sesRV18", /не очищена/)
  const af = lettersRe(AUTH.pf, new RegExp(`#${T.m18.n} .*не очищена`))
  const view = status.formatStatuses(status.readStatuses(), Date.now(), "pf")
  const line = new RegExp(`uncleaned [^\\n]*#${T.m18.n} \\d+[mhd]`)
  cell("M18a", "accepted and still not cleaned up: the reminder repeats every accepted_reminder_min, 5 times per acceptance (reviewer and author), then silence and the counter 'uncleaned #N Ч' in /crew", rf.length === 5 && af.length === 5 && line.test(view), JSON.stringify({ rf: rf.length, af: af.length, view: view.split("\n").filter((l) => /uncleaned|pf/.test(l)) }))
}

// ===== rows decided by the end of a turn =====
// T1: executor, empty turns -> reminder, then stuck: the author is called, the history says so, no more reminders
await turn("sesEX31")
cell("T1a", "running: the end of an empty turn -> a reminder to the executor", sent("sesEX31", /Не завершено: задача/).length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesEX31").map((d) => d.text.slice(0, 60))))
await turn("sesEX31")
await until(() => lettersRe(AUTH.pw, /застряла/).some((l) => new RegExp(`#${T.t1.n} `).test(l.text)))
{
  const call1 = lettersRe(AUTH.pw, /застряла/).filter((l) => new RegExp(`#${T.t1.n} `).test(l.text))
  cell("T1b", "running: push_empty_turns empty turns in a row -> stuck: ONE letter to the author, a notice in his window, an entry in the task history", call1.length === 1 && noticesFor("sesEX31").some((n) => /застряла/.test(n.title)) && tasks.loadTask("pw", T.t1.n).history.some((h) => /застряла/.test(h.note ?? "")), JSON.stringify({ l: call1.length, n: noticesFor("sesEX31").length }))
  const before = sent("sesEX31", /Не завершено/).length
  await turn("sesEX31")
  cell("T1c", "stuck: no more reminders after that", sent("sesEX31", /Не завершено/).length === before, `${sent("sesEX31", /Не завершено/).length} vs ${before}`)
  // L3: "stuck since HH:MM: what" stays in /crew and in the sidebar until the mark is cleared
  const view = () => status.formatStatuses(status.readStatuses(), Date.now(), "pw")
  // the block of a task in /crew: its heading and the rows under it (a quiet task - the heading alone, the tabs on it)
  const taskBlock = (n) => {
    const ls = view().split("\n")
    const i = ls.findIndex((l) => new RegExp(`^  (\\S+ )?#${n} `).test(l))
    if (i < 0) return ""
    let j = i + 1
    while (j < ls.length && /^ {4}/.test(ls[j])) j++
    return ls.slice(i, j).join("\n")
  }
  const stuckRe = { test: () => /⚠ stuck/.test(taskBlock(T.t1.n)) }
  const side = () => status.sidebarLines(status.readStatuses(), Date.now(), "pw").rows.map((r) => status.sideText(r))
  await until(() => stuckRe.test(view()), 4000)
  const row = taskBlock(T.t1.n)
  cell("T1d", "stuck: '⚠ stuck <age>' is shown in /crew on the tab of the task and 'застряла с ЧЧ:ММ' in the sidebar", /⚠ stuck/.test(row) && side().some((l) => /застряла с \d\d:\d\d/.test(l)), JSON.stringify({ row, side: side() }))
  await call("crew_role", AUTH.pw, { role: "integrator" })
  await call("crew_task", AUTH.pw, { action: "push", n: T.t1.n, text: "доделай" })
  const t1Line = () => /⚠ stuck/.test(taskBlock(T.t1.n))
  await until(() => !t1Line(), 8000) // the status pass may take more than 4 s on a loaded machine (task 048 measure: 2.0-3.8 s)
  cell("T1e", "crew_task push clears the mark: the line is gone from /crew", !t1Line(), view())
}
// T2: reviewer, empty turns
await turn("sesRV32")
cell("T2a", "reviewing: the end of an empty turn -> a reminder 'continue the review' to the reviewer", sent("sesRV32", /Не завершено: приёмка задачи/).length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesRV32").map((d) => d.text.slice(0, 80))))
await turn("sesRV32")
await until(() => lettersRe(AUTH.pt, /застряла/).length > 0)
{
  const c = lettersRe(AUTH.pt, /застряла/)
  cell("T2b", "reviewing: a stuck reviewer -> a letter to the author and a notice", c.length === 1 && noticesFor("sesRV32").some((n) => /застряла/.test(n.title)), JSON.stringify({ l: c.length, n: noticesFor("sesRV32").map((n) => n.title) }))
  cell("T2c", "reviewing: a stuck reviewer is recorded in the task history (like a stuck executor)", tasks.loadTask("pt", T.t2.n).history.some((h) => /застряла/.test(h.note ?? "")), JSON.stringify(tasks.loadTask("pt", T.t2.n).history.map((h) => h.note)))
  cell("T2d", "reviewing: the 'review stuck' letter tells to push the REVIEWER (crew_task push with to: reviewer)", c.length === 1 && new RegExp(`crew_task \\{action: "push", n: ${T.t2.n}, to: "reviewer"`).test(c[0].text), JSON.stringify(c.map((l) => l.text)))
  // a stuck tab that comes back to work by itself: a working turn clears the mark (owner, 2026-10-15: «по рекомендации»)
  await turn("sesRV32", { tools: true })
  await until(() => !oblig("sesRV32", T.t2.review_qid)?.stuck, 3000)
  const back = oblig("sesRV32", T.t2.review_qid)
  cell("T2e", "reviewing: a working turn of a stuck reviewer clears the mark and its time, the counters start over", !!back && !back.stuck && !back.stuckAt && !back.empty && !back.nudges, JSON.stringify(back))
}
// T3 (L1): a working turn (with tools) resets the reminder counter of the obligation: working turns never reach push_max (3)
for (let i = 0; i < 5; i++) await turn("sesEX33", { tools: true })
cell("T3a", "running: working turns (with tools) are reminded after each one, past push_max (3)", sent("sesEX33", /Не завершено: задача/).length === 5, String(sent("sesEX33", /Не завершено/).length))
await wait(600)
{
  const ob = oblig("sesEX33", T.t3.qid)
  const calls = lettersRe(AUTH.pw, /застряла/).filter((l) => new RegExp(`задача #${T.t3.n} `).test(l.text))
  cell("T3b", "running: the working turns do not make the task stuck: no call to the author, the reminder counter is 1 (reset by each working turn)", calls.length === 0 && ob?.nudges === 1 && !ob?.stuck, JSON.stringify({ ob, calls: calls.map((l) => l.text.slice(0, 120)) }))
}
// T4: accepted, reviewer nudged until cleanup
await turn("sesRV34")
cell("T4", "accepted: the reviewer is nudged at the end of an empty turn until cleanup (the text names the status 'принята')", sent("sesRV34", /Не завершено: приёмка задачи #\d+ «[^»]*» \(принята\)/).length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesRV34").map((d) => d.text.slice(0, 120))))
// T5: rework, the executor nudged
await turn("sesEX35")
cell("T5", "rework: the end of an empty turn -> a reminder to the executor", sent("sesEX35", /Не завершено: задача/).length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesEX35").map((d) => d.text.slice(0, 80))))
// T6: reviewer integrator stuck: the letter goes to the stuck tab itself
await turn(AUTH.pi)
await turn(AUTH.pi)
const t6re = new RegExp(`задачи #${T.t6.n} `)
await until(() => lettersRe(AUTH.pi, t6re).some((l) => /застряла/.test(l.text)))
cell("T6", "reviewing, reviewer integrator, stuck: the call letter is addressed to the stuck tab itself (asker = reviewer); the window notice is the only outside sign", lettersRe(AUTH.pi, /застряла/).filter((l) => t6re.test(l.text)).length === 1 && noticesFor(AUTH.pi).some((n) => /застряла/.test(n.title)), JSON.stringify({ l: lettersRe(AUTH.pi, /застряла/).map((l) => l.text.slice(0, 120)), n: noticesFor(AUTH.pi).map((n) => n.title) }))
{
  const other = lettersRe(AUTH.pi, /застряла/).filter((l) => !t6re.test(l.text))
  hole("M11b", "reviewer integrator with two tasks under review: the stuck call for the task that the card does not point to names no task ('вопрос rq...', wanted: the task number and title)", other.length > 0 && !/вопрос rq/.test(other[0].text), JSON.stringify(other.map((l) => l.text.slice(0, 90))))
}
// T7: the author's tab is closed
await turn("sesEX37")
await turn("sesEX37")
await until(() => letters(AUTH.pc).some((l) => /застряла/.test(l.text)))
await wait(600)
{
  const l = letters(AUTH.pc).filter((l) => /застряла/.test(l.text))
  cell("T7a", "stuck, the author's tab is closed: the call letter is posted and waits in his inbox (not delivered until he opens the tab)", l.length === 1 && l[0].box === "inbox" && sent(AUTH.pc, /застряла/).length === 0, JSON.stringify(l.map((x) => x.box)))
  cell("T7b", "stuck, the author's tab is closed: the notice goes to the live windows (no window of the project here: all live windows)", seenNotices.some((n) => /застряла/.test(n.title) && n.sessionID === "sesEX37"), JSON.stringify(seenNotices.map((n) => n.title)))
  const lockL = lettersRe(AUTH.pc, /Замок слияния проекта pc/)
  const lockN = seenNotices.filter((n) => /замок/i.test(n.title) && new RegExp(`#${T.t7c.n}\\b`).test(`${n.title} ${n.message}`))
  cell("T7c", "merge lock held too long, the author's tab is closed: ONE letter waits in his inbox, and ONE notice goes to the live windows", lockL.length === 1 && lockN.length === 1, JSON.stringify({ l: lockL.length, n: seenNotices.map((n) => n.title) }))
}
// T8: the owner's closed tab as an executor gets the nudge
await turn("sesOWN8")
cell("T8", "running, kind assign, the owner's tab is closed: the end of a turn -> the reminder still reaches the tab", sent("sesOWN8", /Не завершено: задача/).length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesOWN8").map((d) => d.text.slice(0, 60))))
// T9: the lost nudge
await wait(1500)
hole("T9", "a turn ended while the service was down (card of a dead process, obligation open, no interrupted mark): nobody reminds (wanted: a reminder after the start)", sent("sesEX39", /./).length > 0, JSON.stringify(delivered.filter((d) => d.sessionID === "sesEX39")))
// T10: crew_task push on a task under review
{
  await call("crew_role", AUTH.pt, { role: "integrator" })
  const out = await call("crew_task", AUTH.pt, { action: "push", n: T.t10.n, text: "поторопись с приёмкой" })
  for (let i = 0; i < 20 && !sent("sesEX40", /Подталкивание по задаче/).length; i++) await wait(250)
  cell("T10a", "crew_task push on a task under review: the executor gets the letter", sent("sesEX40", /Подталкивание по задаче/).length === 1, out)
  const outRev = await call("crew_task", AUTH.pt, { action: "push", n: T.t10.n, to: "reviewer", text: "поторопись с приёмкой" })
  for (let i = 0; i < 20 && !sent("sesRV40", /Подталкивание по задаче/).length; i++) await wait(250)
  cell("T10b", "crew_task push with to: reviewer on a task under review: the reviewer gets the letter (owner, 2026-10-15: the target is chosen by `to`, the default stays the executor)", sent("sesRV40", /Подталкивание по задаче/).length === 1, outRev)
}

clearInterval(heart)
clearInterval(collect)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-nudge-matrix.test: FAIL ${fail} (rows ${rows}, known holes ${holes.length})` : `crew-nudge-matrix.test ok (rows ${rows}, known holes ${holes.length}: ${holes.join(", ")})`)
process.exit(fail ? 1 : 0)

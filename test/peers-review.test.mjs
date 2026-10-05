// Self-test of submission, the review queue and acceptance (plan 002, Ph.3; node >= 24):  node test/peers-review.test.mjs
// On a real git repository: the executor's report submits the task without waking the integrator; a reviewer is
// assigned by priority (a free open worker tab — never the author or the executor — or a new review session); the
// reviewer starts (review), takes the project's merge lock (merge), returns for rework or accepts: the plugin
// requires a report per required acceptance step and checks that the branch (or a squash commit) is in the target
// branch; then the cleanup steps, checked by the plugin (cleaned) -> sessions closed, a quiet summary to the
// integrator. rework_max exceeded -> a call to the integrator.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-review-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_POLL_MS = "100"
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db")
delete process.env.NOVA_PEERS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const settings = (reviewers) =>
  writeFileSync(
    path.join(proj, ".opencode", "opencode-peers.json"),
    JSON.stringify({
      worktrees: "wt",
      branch_name: "p{n}-{slug}",
      cleanup: "local",
      rework_max: 1,
      spawn_limits: { worker: 5, reviewer: reviewers },
      acceptance: [
        { id: "tests", text: "тесты зелёные", required: true },
        { id: "guards", text: "стражи зелёные", required: true },
        { id: "notes", text: "заметки", required: false },
      ],
    }),
  )
settings(1)
git(proj, "init", "-q", "-b", "main")
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const review = await import("../review.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const sessions = new Map()
const updates = []
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => {
      if (!sessions.has(req.id)) sessions.set(req.id, req)
      return { id: req.id }
    },
    update: async (req) => updates.push(req),
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
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const turnEnds = async (sid) => {
  await hooks.context({ sessionID: sid, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: sid } })
}
const FIELDS = { criteria: "тест зелёный" }
const task = (n) => tasks.loadTask("proj", n)

const WPID = 818181
const tabs = ["sesINTEG1", "sesREVIEW1"].map((sessionID, i) => ({ sessionID, active: i === 0, busy: false }))
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
for (const t of tabs) await turnEnds(t.sessionID)
await call("peer_role", "sesINTEG1", { role: "integrator" })

// 1. task #1: the executor works in its worktree and reports
const sp1 = await call("peer_spawn", "sesINTEG1", { title: "фича", goal: "сделать фичу", ...FIELDS })
const ex1 = task(1).executor
cell("task #1 started with worktree and branch from the settings", /wt.proj-1-ficha/.test(task(1).worktree ?? "") && task(1).branch === "p1-ficha", JSON.stringify({ wt: task(1).worktree, b: task(1).branch, sp1 }))
git(proj, "worktree", "add", "-q", "-b", "p1-ficha", task(1).worktree)
writeFileSync(path.join(task(1).worktree, "f.txt"), "feature\n")
git(task(1).worktree, "add", "-A")
git(task(1).worktree, "commit", "-q", "-m", "feature")
await wait()
const integBefore = delivered.filter((d) => d.sessionID === "sesINTEG1").length
await call("peer_send", ex1, { to: "sesINTEG1", text: "фича готова, тесты зелёные", reply_to: task(1).qid })
await wait(800)
const toInteg = delivered.filter((d) => d.sessionID === "sesINTEG1").slice(integBefore)
cell("the report does not wake the integrator", toInteg.every((d) => d.synthetic), JSON.stringify(toInteg.map((d) => d.text.slice(0, 80))))
cell("the free open worker tab becomes the reviewer", task(1).reviewer === "sesREVIEW1" && task(1).review_kind === "tab", JSON.stringify({ r: task(1).reviewer, k: task(1).review_kind }))
const rl = got("sesREVIEW1", "ПРИЁМКА задачи #1")
cell("the reviewer gets the review letter with the steps and the report", rl.length === 1 && rl[0].text.includes("tests (обязательно)") && rl[0].text.includes("фича готова"), rl[0]?.text.slice(0, 300))
cell("the executor session stays open", core.allCards().find((c) => c.session === ex1)?.spawned?.status === "running", "closed")

// 2. the reviewer's steps, each guarded
const early = await call("peer_task", "sesREVIEW1", { action: "accept", n: 1, checks: { tests: "ok", guards: "ok" } })
cell("accept before review is refused", /на приёмке/.test(early), early)
const notMine = await call("peer_task", "sesINTEG1", { action: "review", n: 1 })
cell("only the reviewer reviews (not the integrator)", /только его/.test(notMine), notMine)
await call("peer_task", "sesREVIEW1", { action: "review", n: 1 })
await wait()
cell("review starts; the executor learns it quietly", task(1).status === "reviewing" && got(ex1, "на приёмке у").some((d) => d.synthetic), JSON.stringify(got(ex1, "приёмке")))
const noLock = await call("peer_task", "sesREVIEW1", { action: "accept", n: 1, checks: { tests: "ok", guards: "ok" } })
cell("accept without the merge lock is refused", /Сначала замок вливания/.test(noLock), noLock)
const lock = await call("peer_task", "sesREVIEW1", { action: "merge", n: 1 })
cell("the reviewer takes the merge lock", /твой/.test(lock) && review.holdsMergeLock("proj", "sesREVIEW1"), lock)
const noChecks = await call("peer_task", "sesREVIEW1", { action: "accept", n: 1, checks: { tests: "зелёные: 12/12" } })
cell("accept without a required step is refused, naming it", /guards/.test(noChecks) && !/notes \(/.test(noChecks), noChecks)
const notMerged = await call("peer_task", "sesREVIEW1", { action: "accept", n: 1, checks: { tests: "12/12", guards: "ok" } })
cell("accept of an unmerged branch is refused", /не влита/.test(notMerged) && task(1).status === "reviewing", notMerged)
git(proj, "merge", "-q", "--no-edit", "p1-ficha")
const acc = await call("peer_task", "sesREVIEW1", { action: "accept", n: 1, checks: { tests: "12/12", guards: "ok" } })
cell("accept after the merge: accepted, cleanup steps given", task(1).status === "accepted" && /git worktree remove/.test(acc) && /git branch -D p1-ficha/.test(acc) && !/push origin --delete/.test(acc), acc)
cell("accept releases the merge lock", !review.mergeHolder("proj"), JSON.stringify(review.mergeHolder("proj")))
const early2 = await call("peer_task", "sesREVIEW1", { action: "cleaned", n: 1 })
cell("cleaned before the cleanup is refused, naming what is left", /worktree .* ещё есть/.test(early2) && /p1-ficha ещё есть/.test(early2), early2)
// the executor also made a worktree of its own (Claude Code's EnterWorktree: another path, another branch)
const stray = path.join(tmp, "stray-wt")
git(proj, "branch", "worktree-task-ficha", "p1-ficha")
git(proj, "worktree", "add", "-q", stray, "worktree-task-ficha")
git(proj, "worktree", "remove", task(1).worktree)
git(proj, "branch", "-D", "p1-ficha")
const strayLeft = await call("peer_task", "sesREVIEW1", { action: "cleaned", n: 1 })
cell("cleaned is refused while a worktree or branch of the merged commit is left", /worktree-task-ficha/.test(strayLeft) && /stray-wt/.test(strayLeft) && task(1).status === "accepted", strayLeft)
git(proj, "worktree", "remove", stray)
git(proj, "branch", "-D", "worktree-task-ficha")
const cl = await call("peer_task", "sesREVIEW1", { action: "cleaned", n: 1 })
await wait(800)
cell("cleaned: the task is cleaned", task(1).status === "cleaned", cl)
cell("the integrator gets a quiet summary", got("sesINTEG1", "принята и влита").some((d) => d.synthetic), JSON.stringify(got("sesINTEG1", "принята")))
cell("the executor session is closed with a final line", core.allCards().find((c) => c.session === ex1)?.spawned?.status === "closed" && got(ex1, "✓✓ Задача #1 принята").length === 1, JSON.stringify(got(ex1, "✓✓")))
cell("the executor session is titled #1 ✓✓", updates.some((u) => u.sessionID === ex1 && u.title === "#1 ✓✓ фича"), JSON.stringify(updates.filter((u) => u.sessionID === ex1)))

// 3. queue by priority: both tasks wait (the tab is busy, no review sessions allowed); the tab frees up -> the P1
// task gets it although the P3 one was submitted first; review sessions allowed again -> the P3 task gets one
await call("peer_spawn", "sesINTEG1", { title: "обычная", goal: "g2", ...FIELDS, priority: "P3" })
await call("peer_spawn", "sesINTEG1", { title: "срочная", goal: "g3", ...FIELDS, priority: "P1" })
const ex2 = task(2).executor
const ex3 = task(3).executor
settings(0)
tabs[1].busy = true
beat()
await wait(300)
await call("peer_send", ex2, { to: "sesINTEG1", text: "готово 2", reply_to: task(2).qid })
await wait(400)
await call("peer_send", ex3, { to: "sesINTEG1", text: "готово 3", reply_to: task(3).qid })
await wait(600)
cell("while nobody can review, both wait", !task(2).reviewer && !task(3).reviewer, JSON.stringify({ t2: task(2).reviewer, t3: task(3).reviewer }))
tabs[1].busy = false
beat()
await wait(800)
cell("the freed tab goes to P1, not to the earlier P3", task(3).reviewer === "sesREVIEW1" && !task(2).reviewer, JSON.stringify({ t2: task(2).reviewer, t3: task(3).reviewer }))
settings(1)
await wait(800)
const rv2 = task(2).reviewer
cell("the other task gets a new review session", task(2).review_kind === "spawn" && sessions.has(rv2) && sessions.get(rv2).title === "#2 приёмка обычная", JSON.stringify({ rv2, s: sessions.get(rv2) }))
cell("no reviewer is the author or the executor", [1, 2, 3].every((n) => task(n).reviewer !== task(n).author && task(n).reviewer !== task(n).executor), "same")
await wait()
cell("the review session gets the review letter", got(rv2, "ПРИЁМКА задачи #2").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === rv2).map((d) => d.text.slice(0, 60))))

// 4. rework, resubmission, rework_max
await call("peer_task", "sesREVIEW1", { action: "review", n: 3 })
await call("peer_task", "sesREVIEW1", { action: "rework", n: 3, text: "нет теста на пустой ввод" })
await wait()
cell("rework: the executor is woken with the remarks", task(3).status === "rework" && got(ex3, "нет теста на пустой ввод").some((d) => !d.synthetic), JSON.stringify(got(ex3, "ДОРАБОТКА")))
await turnEnds(ex3)
await call("peer_send", ex3, { to: "sesINTEG1", text: "добавил тест", reply_to: task(3).qid })
await wait()
await wait(800)
cell("resubmission wakes the same reviewer", task(3).status === "submitted" && task(3).reviewer === "sesREVIEW1" && got("sesREVIEW1", "Доработка задачи #3 «срочная» сдана").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesREVIEW1").map((d) => d.text.slice(0, 160))))
await call("peer_task", "sesREVIEW1", { action: "review", n: 3 })
await call("peer_task", "sesREVIEW1", { action: "rework", n: 3, text: "и ещё одно" })
await wait()
cell("over rework_max the integrator gets a call", got("sesINTEG1", "уходит на доработку 2-й раз").some((d) => !d.synthetic), JSON.stringify(got("sesINTEG1", "доработку")))

// 5. the merge lock is one per project
await call("peer_send", ex3, { to: "sesINTEG1", text: "исправил всё", reply_to: task(3).qid })
await call("peer_task", "sesREVIEW1", { action: "review", n: 3 })
await call("peer_task", "sesREVIEW1", { action: "merge", n: 3 })
await call("peer_task", rv2, { action: "review", n: 2 })
const busyLock = await call("peer_task", rv2, { action: "merge", n: 2 })
cell("a second reviewer cannot take the merge lock", /у приёмщика задачи #3/.test(busyLock), busyLock)

// 6. squash merge: accept with the commit in the target branch
writeFileSync(path.join(proj, "squash.txt"), "x\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "squash of #3")
const sha = git(proj, "rev-parse", "HEAD")
const sq = await call("peer_task", "sesREVIEW1", { action: "accept", n: 3, checks: { tests: "ok", guards: "ok" }, commit: sha })
cell("a squash commit in the target branch is accepted", task(3).status === "accepted" && task(3).commit === sha, sq)
const bad = await call("peer_task", rv2, { action: "merge", n: 2 })
const wrong = await call("peer_task", rv2, { action: "accept", n: 2, checks: { tests: "ok", guards: "ok" }, commit: "0000000000000000000000000000000000000000" })
cell("after the release the lock is free; a commit not in the target is refused", /твой/.test(bad) && /нет в main|не влита|коммита/.test(wrong), `${bad} | ${wrong}`)

// 7. a task given to an owner's worker tab: that tab never reviews its own task
tabs.push({ sessionID: "sesOWNTAB", active: false, busy: false })
beat()
await turnEnds("sesOWNTAB")
await call("peer_task", "sesINTEG1", { action: "assign", session: "sesOWNTAB", title: "своя", goal: "g4", ...FIELDS })
tabs[1].busy = true // the only other worker tab is busy; review sessions are at the limit (task #2's)
beat()
await wait(300)
await call("peer_send", "sesOWNTAB", { to: "sesINTEG1", text: "готово 4", reply_to: task(4).qid })
await wait(800)
cell("the executor's own tab does not become its reviewer", task(4).reviewer !== "sesOWNTAB", JSON.stringify({ r: task(4).reviewer }))
cell("the review sessions are at the limit: #4 waits for a reviewer", !task(4).reviewer, JSON.stringify({ r: task(4).reviewer }))

// 8. rework does not hold the reviewer's place (the methodology: waiting for someone else's step blocks nothing)
await call("peer_task", rv2, { action: "rework", n: 2, text: "добавь проверку" })
await wait(800)
cell("#2 on rework frees the place: #4 gets a review session", task(2).status === "rework" && task(4).review_kind === "spawn" && !!task(4).reviewer && task(4).reviewer !== rv2, JSON.stringify({ s2: task(2).status, r4: task(4).reviewer, k4: task(4).review_kind }))
await call("peer_send", ex2, { to: "sesINTEG1", text: "доработал 2", reply_to: task(2).qid })
await wait(800)
cell("the resubmission goes back to the same reviewer at once", task(2).reviewer === rv2 && task(2).status === "submitted" && got(rv2, "доработал 2").length >= 1, JSON.stringify({ r2: task(2).reviewer, s2: task(2).status, n: got(rv2, "доработал 2").length }))

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-review.test: FAIL ${fail}` : "peers-review.test ok")
process.exit(fail ? 1 : 0)

// Self-test of crew_task {action: "push", to} (task 041 follow-up; node >= 24):  node test/crew-push-reviewer.test.mjs
// push wakes the executor by default and the reviewer with to: "reviewer"; the reminder counters of the woken tab start over;
// a wrong `to` and a reviewer that does not exist yet are refused.
//
//
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-push-reviewer-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
mkdirSync(path.join(proj, "docs", "plans"), { recursive: true })
writeFileSync(path.join(proj, "docs", "plans", "7-old.md"), "# План 7 — старый\n")
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
writeFileSync(
  path.join(proj, ".opencode", "crew-harness.json"),
  JSON.stringify({ allow_default_models: true, worktrees: "wt", branch_name: "p{n}-{slug}", cleanup: "local", merge_precheck: "off", accepted_slot: "hold", rework_max: 5, spawn_limits: { worker: 5, reviewer: 1 } }),
)
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "init", "-q", "-b", "main")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const sessions = new Map()
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
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const turnEnds = async (sid) => {
  await hooks.context({ sessionID: sid, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: sid } })
}
const task = (n) => tasks.loadTask("proj", n)

const WPID = 828282
const tabs = ["sesINTEG1", "sesREVIEW1"].map((sessionID, i) => ({ sessionID, active: i === 0, busy: false }))
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
for (const t of tabs) await turnEnds(t.sessionID)
await call("crew_role", "sesINTEG1", { role: "integrator" })

// 1. a task that is running: push to the executor (the default) and to a reviewer that is not assigned yet
await call("crew_spawn", "sesINTEG1", { title: "фича", goal: "сделать фичу", criteria: "тест зелёный" })
await wait(300)
const ex1 = task(1).executor
const pushDefault = await call("crew_task", "sesINTEG1", { action: "push", n: 1, text: "доделай" })
await wait(300)
cell("push without to wakes the executor", /исполнитель/.test(pushDefault) && got(ex1, "Подталкивание по задаче #1").length === 1, pushDefault)
const noReviewer = await call("crew_task", "sesINTEG1", { action: "push", n: 1, to: "reviewer" })
cell("push to the reviewer of a task without a reviewer is refused", /нет приёмщика/.test(noReviewer), noReviewer)
const wrongTo = await call("crew_task", "sesINTEG1", { action: "push", n: 1, to: "author" })
cell("a wrong `to` is refused and names the allowed values", /executor/.test(wrongTo) && /reviewer/.test(wrongTo), wrongTo)

// 2. submitted: the reviewer is assigned; push to the reviewer wakes it and restarts its counters
await call("crew_task", ex1, { action: "submit", n: 1, text: "готово" })
await wait(800)
const rev = task(1).reviewer
cell("the reviewer is assigned", rev === "sesREVIEW1", String(rev))
const ob = core.obligationsOf(rev)
for (const o of ob) {
  o.nudges = 5
  o.empty = 2
  o.stuck = true
}
core.saveObligations(rev, ob)
const pushRev = await call("crew_task", "sesINTEG1", { action: "push", n: 1, to: "reviewer", text: "проверь" })
await wait(400)
cell("push to the reviewer says so", /приёмщик/.test(pushRev) && pushRev.includes(rev), pushRev)
const letters = got(rev, "Подталкивание по задаче #1")
cell("the reviewer gets one letter with the review commands and not with submit", letters.length === 1 && /crew_task \{action: "review"/.test(letters[0].text) && !/submit/.test(letters[0].text), JSON.stringify(letters.map((d) => d.text)))
const after = core.obligationsOf(rev).find((o) => o.task === "приёмка #1")
cell("the reviewer's counters start over and `stuck` is cleared", !!after && after.nudges === 0 && !after.empty && !after.stuck, JSON.stringify(after))
cell("the task history records the nudge of the reviewer", (task(1).history ?? []).some((h) => /подталкивание приёмщика/.test(h.note ?? "")), JSON.stringify(task(1).history?.slice(-3)))
cell("the executor is not woken by the push to the reviewer", got(ex1, "Подталкивание по задаче #1").length === 1, JSON.stringify(got(ex1, "Подталкивание по задаче #1").length))

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-push-reviewer.test: FAIL ${fail}` : "crew-push-reviewer.test ok")
process.exit(fail ? 1 : 0)

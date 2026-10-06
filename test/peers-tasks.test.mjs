// Self-test of the task journal (plan 002, Ph.1; node >= 24):  node test/peers-tasks.test.mjs
// - numbers #N are unique when two processes create tasks at once (atomic file creation);
// - the session id is written to the journal before session.create, so a start cut off after create is retried
//   with the same id: no second session, no second task letter;
// - a task without the project's required fields is not started;
// - peer_task: push wakes the executor and resets its reminders, reassign keeps the number and hands over a
//   summary, assign gives a task to an owner's tab (woken while the task is open, even when closed), cancel,
//   priority, list by priority, show; only the integrator manages;
// - session titles come from the journal: #N title, #N ↷ for a replaced session, #N ✗ for a cancelled one.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-tasks-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_POLL_MS = "100"
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db")
delete process.env.NOVA_PEERS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "opencode-peers.json"), JSON.stringify({ task_fields: ["goal", "criteria", "boundaries"], spawn_limits: { worker: 5 }, worktrees: "wt", branch_name: "p{n}-{slug}" }))
// a git repository: the plugin creates the task's worktree in it (a session is never opened in the main copy, plan 011)
const g = (...args) => execFileSync("git", ["-C", proj, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { stdio: "ignore" })
g("init", "-q", "-b", "main")
g("add", "-A")
g("commit", "-q", "-m", "init")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const sessions = new Map() // like OpenCode: create with an existing id returns that session
const updates = []
let crashAfterCreate = false
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => {
      if (!sessions.has(req.id)) sessions.set(req.id, req)
      if (crashAfterCreate) {
        crashAfterCreate = false
        throw new Error("process died right after create")
      }
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
const sidOf = (text) => text.match(/сесси[яи] (ses_[A-Za-z0-9]+)/)?.[1]
const turnEnds = async (sid) => {
  await hooks.context({ sessionID: sid, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: sid } })
}
const FIELDS = { criteria: "тест зелёный", boundaries: "ничего лишнего" }

// one live window: the integrator and the owner's tab
const WPID = 616161
const tabs = ["sesINTEG1", "sesOWNER1", "sesWORKR2"].map((sessionID, i) => ({ sessionID, active: i === 0, busy: false }))
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
for (const t of tabs) await turnEnds(t.sessionID)
await call("peer_role", "sesINTEG1", { role: "integrator" })

// 1. numbers from two processes at once
const childSrc = `const t = await import(${JSON.stringify(new URL("../tasks.ts", import.meta.url).href)}); for (let i = 0; i < 15; i++) t.createTask({ project: "race", title: "r" + i, goal: "g", priority: "P2", tier: "light", role: "worker", author: "x", author_role: "race.integrator", qid: "q", status: "closed", kind: "spawn", directory: "." })`
const runChild = () => new Promise((resolve) => { const p = require_spawn(process.execPath, ["--input-type=module", "-e", childSrc], { env: { ...process.env } }); p.on("exit", resolve) })
import { spawn as require_spawn } from "node:child_process"
await Promise.all([runChild(), runChild()])
const nums = readdirSync(path.join(tasks.TASKS, "race")).map((f) => Number(f.replace(".json", ""))).sort((a, b) => a - b)
cell("two processes at once: 30 tasks, numbers 1..30 without gaps or repeats", nums.length === 30 && nums.every((n, i) => n === i + 1), JSON.stringify(nums))

// 2. required fields of the project
const missing = await call("peer_spawn", "sesINTEG1", { goal: "g", criteria: "c" })
cell("a task without the project's required field is not started", /нет полей границы \(boundaries\)/.test(missing) && sessions.size === 0, missing)

// 3. a start cut off right after session.create is retried with the same id
crashAfterCreate = true
const cut = await call("peer_spawn", "sesINTEG1", { title: "первая", goal: "сделать раз", ...FIELDS, tier: "light", priority: "P3" })
cell("the cut-off start says the task is recorded and will be retried", /записана, но сессия не запущена/.test(cut), cut)
const t1 = tasks.loadTask("proj", 1)
cell("the journal keeps the planned session id", t1?.status === "starting" && t1.executor?.startsWith("ses_") && sessions.has(t1.executor), JSON.stringify(t1))
await wait(800)
const t1b = tasks.loadTask("proj", 1)
cell("the next pass finishes the start", t1b?.status === "running", t1b?.status)
cell("still one session", sessions.size === 1, JSON.stringify([...sessions.keys()]))
cell("one task letter", got(t1.executor, "ЗАДАЧА #1").length === 1, JSON.stringify(delivered.map((d) => d.sessionID)))
cell("the letter names the worktree and the branch from the settings", got(t1.executor, `wt`)[0]?.text.includes("p1-pervaya"), got(t1.executor, "ЗАДАЧА #1")[0]?.text)
// cut off again after the letter: status back to starting -> no second letter, no second session
const again = tasks.loadTask("proj", 1)
again.status = "starting"
tasks.saveTask(again)
await wait(800)
cell("a repeated start after the letter: still one session, one letter", sessions.size === 1 && got(t1.executor, "ЗАДАЧА #1").length === 1 && tasks.loadTask("proj", 1).status === "running", `${sessions.size} ${got(t1.executor, "ЗАДАЧА #1").length}`)
cell("the session title is #N title", updates.some((u) => u.sessionID === t1.executor && u.title === "#1 первая") || sessions.get(t1.executor)?.title === "#1 первая", JSON.stringify(updates))

// 4. a second task with priority P1; list goes by priority
const sp2 = await call("peer_spawn", "sesINTEG1", { title: "вторая", goal: "сделать два", ...FIELDS, priority: "P1" })
const s2 = sidOf(sp2)
const list = await call("peer_task", "sesINTEG1", { action: "list" })
cell("list: P1 before P3", list.indexOf("#2 P1") >= 0 && list.indexOf("#2 P1") < list.indexOf("#1 P3"), list)
await call("peer_task", "sesINTEG1", { action: "priority", n: 1, priority: "P0" })
const list2 = await call("peer_task", "sesINTEG1", { action: "list" })
cell("priority changes the order", list2.indexOf("#1 P0") >= 0 && list2.indexOf("#1 P0") < list2.indexOf("#2 P1"), list2)
const show = await call("peer_task", "sesOWNER1", { action: "show", n: 2 })
cell("show: goal, criteria, boundaries, history (anyone may look)", /цель: сделать два/.test(show) && /критерии: тест зелёный/.test(show) && /границы: ничего лишнего/.test(show) && /поставлена/.test(show), show)

// 5. push: wakes the executor, resets its reminders; only the integrator
const obl = core.obligationsOf(s2)
for (const o of obl) o.nudges = 2
core.saveObligations(s2, obl)
const denied = await call("peer_task", "sesOWNER1", { action: "push", n: 2 })
cell("a worker may not push", /только интегратор/.test(denied), denied)
await turnEnds(s2)
await call("peer_task", "sesINTEG1", { action: "push", n: 2, text: "доделай тесты" })
await wait()
cell("push wakes the executor", got(s2, "Подталкивание по задаче #2").length === 1 && got(s2, "доделай тесты").length === 1, JSON.stringify(got(s2, "Подталк")))
cell("push resets the reminders", core.obligationsOf(s2).every((o) => o.nudges === 0), JSON.stringify(core.obligationsOf(s2)))

// 6. reassign: same number, new session, summary of what was done
await call("peer_send", s2, { to: "sesINTEG1", text: "сделал половину: парсер готов" })
const re = await call("peer_task", "sesINTEG1", { action: "reassign", n: 2 })
const s2b = sidOf(re)
const t2 = tasks.loadTask("proj", 2)
cell("reassign keeps the number with a new session", s2b && s2b !== s2 && t2.executor === s2b && t2.executors.includes(s2) && t2.status === "running", JSON.stringify({ re, s2, s2b, ex: t2.executor, exs: t2.executors, st: t2.status }))
await wait()
const handed = got(s2b, "ЗАДАЧА #2")
cell("the new session gets the summary of the old one", handed.length === 1 && handed[0].text.includes("СДЕЛАНО ПРЕЖНИМ") && handed[0].text.includes("парсер готов"), handed[0]?.text)
cell("the old session is closed and titled #N ↷", core.allCards().find((c) => c.session === s2)?.spawned?.status === "closed" && updates.some((u) => u.sessionID === s2 && u.title === "#2 ↷ передана вторая"), JSON.stringify(updates.filter((u) => u.sessionID === s2)))
const oldReport = await call("peer_send", s2, { to: "sesINTEG1", text: "отчёт старого", reply_to: t2.qid })
await wait()
cell("the old session's report does not close the task", tasks.loadTask("proj", 2).status === "running", tasks.loadTask("proj", 2).status + " " + oldReport)

// 7. assign: an owner's tab takes a task; woken while the task is open, even when closed
const as = await call("peer_task", "sesINTEG1", { action: "assign", session: "sesOWNER1", title: "вкладке владельца", goal: "посмотреть", ...FIELDS })
await wait()
cell("assign: the tab gets the task letter", /Задача #3/.test(as) && got("sesOWNER1", "ЗАДАЧА #3").length === 1, as)
const pl = await call("peer_list", "sesINTEG1")
cell("peer_list shows the tab's task", /задача #3 \(в работе\)[^\n]*sesOWNER1/.test(pl), pl)
tabs.splice(tabs.findIndex((t) => t.sessionID === "sesOWNER1"), 1)
beat()
await wait()
await call("peer_task", "sesINTEG1", { action: "push", n: 3, text: "ты закрыта, но задача открыта" })
await wait()
cell("a closed tab with an open task is woken (decision 9)", got("sesOWNER1", "ты закрыта, но задача открыта").length === 1, JSON.stringify(got("sesOWNER1", "Подталк")))

// 8. cancel
await call("peer_task", "sesINTEG1", { action: "cancel", n: 3, text: "не нужно" })
await wait()
const c3 = tasks.loadTask("proj", 3)
cell("cancel: the task is cancelled", c3.status === "cancelled", c3.status)
cell("cancel: the executor gets a quiet letter", got("sesOWNER1", "отменена: не нужно").some((d) => d.synthetic && d.resume === false), JSON.stringify(got("sesOWNER1", "отменена")))
const after = await call("peer_task", "sesINTEG1", { action: "push", n: 3 })
cell("a cancelled task cannot be pushed", /уже отменена/.test(after), after)
await call("peer_send", "sesINTEG1", { to: "sesOWNER1", text: "после отмены" })
await wait()
cell("after cancel the closed tab is not woken any more", got("sesOWNER1", "после отмены").length === 0, "woken")
await call("peer_task", "sesINTEG1", { action: "cancel", n: 1 })
await wait()
cell("a cancelled task session is titled #N ✗", updates.some((u) => u.sessionID === t1.executor && u.title === "#1 ✗ отменена первая"), JSON.stringify(updates.filter((u) => u.sessionID === t1.executor)))

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-tasks.test: FAIL ${fail}` : "peers-tasks.test ok")
process.exit(fail ? 1 : 0)

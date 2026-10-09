// Self-test of the acceptor role (plan 002.7; node >= 24):  node test/crew-acceptor.test.mjs
// reviewer: "acceptor": a submitted task gets a free open tab of role acceptor (never a worker tab) or a new review
// session born with role acceptor; review sessions are bounded by spawn_limits.acceptor (not .reviewer) and take no
// worker place; merge / accept / cleaned belong to the task's reviewer AND the acceptor role -- the executor and a
// stranger are refused, a reviewer who changed role loses them. crew_watch hands the command who started it
// (CREW_* in its environment, fixed when the watch is put, not when it starts) and refuses a command matching the
// project's permissions.deny.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-acceptor-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
mkdirSync(path.join(proj, ".claude"), { recursive: true })
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
// the deny list of the nova project (copied, not read from nova)
const NOVA_DENY = ["Read(./**/.env*)", "Read(./**/*.pem)", "Read(./**/*.key)", "Read(./**/*.p12)", "Read(./**/*.pfx)", "Read(./**/id_rsa*)", "Read(./**/id_ed25519*)", "Bash(git reset --hard:*)", "Bash(git clean -fd:*)", "PowerShell(git reset --hard:*)", "PowerShell(git clean -fd:*)"]
writeFileSync(path.join(proj, ".claude", "settings.json"), JSON.stringify({ permissions: { deny: NOVA_DENY } }))
writeFileSync(
  path.join(proj, ".opencode", "crew-harness.json"),
  JSON.stringify({
    reviewer: "acceptor",
    worktrees: "wt",
    branch_name: "p{n}-{slug}",
    cleanup: "local",
    merge_precheck: "off", // the old order of the merge lock (the default is required since 2026-10-09)
    accepted_slot: "hold",
    machine_slots: 1,
    spawn_limits: { worker: 1, reviewer: 5, acceptor: 1 },
    acceptance: [{ id: "tests", text: "тесты зелёные", required: true }],
  }),
)
git(proj, "init", "-q", "-b", "main")
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const review = await import("../review.ts")
const watch = await import("../watch.ts")
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
const until = async (cond, ms = 15_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(200)
  return cond()
}
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const turnEnds = async (sid) => {
  await hooks.context({ sessionID: sid, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: sid } })
}
const task = (n) => tasks.loadTask("proj", n)
const card = (s) => core.allCards().find((c) => c.session === s)
const ENV_ECHO = 'echo "WHO S=$CREW_SESSION_ID R=$CREW_ROLE P=$CREW_PROJECT RV=$CREW_REVIEW_N T=$CREW_TASK_N"'

const WPID = 828282
const tabs = [
  { sessionID: "sesINTEG1", active: true, busy: false },
  { sessionID: "sesWORKER1", active: false, busy: false },
  { sessionID: "sesACC1", active: false, busy: true },
]
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
for (const t of tabs) await turnEnds(t.sessionID)
await call("crew_role", "sesINTEG1", { role: "integrator" })
const accRole = await call("crew_role", "sesACC1", { role: "acceptor" })
const acc2 = await call("crew_role", "sesWORKER1", { role: "acceptor" })
cell("acceptor is a shared role: a second tab joins it", /теперь «acceptor»/.test(acc2) && !/занята/.test(acc2), `${accRole} | ${acc2}`)
await call("crew_role", "sesWORKER1", { role: "worker" })
cell("the default reviewer stays worker without the key", core.loadConfig(path.join(tmp)).reviewer === "worker" && core.loadConfig(proj).reviewer === "acceptor", JSON.stringify(core.loadConfig(proj).reviewer))

// 1. #1 submitted while the acceptor tab is busy: a free WORKER tab is not taken -- a new session with role acceptor
await call("crew_spawn", "sesINTEG1", { title: "фича", goal: "сделать фичу", criteria: "тест зелёный" })
const ex1 = task(1).executor
await wait(300)
writeFileSync(path.join(task(1).worktree, "f.txt"), "feature\n")
git(task(1).worktree, "add", "-A")
git(task(1).worktree, "commit", "-q", "-m", "feature")
await call("crew_send", ex1, { to: "sesINTEG1", text: "фича готова", reply_to: task(1).qid })
await until(() => !!task(1).reviewer)
const rv1 = task(1).reviewer
cell("a free worker tab does not become the acceptor", rv1 !== "sesWORKER1", JSON.stringify({ rv1, kind: task(1).review_kind }))
cell("the review session is born with role acceptor", task(1).review_kind === "spawn" && sessions.has(rv1) && card(rv1)?.role === "acceptor", JSON.stringify({ kind: task(1).review_kind, role: card(rv1)?.role }))

// 3. the review session takes no worker place: spawn_limits.worker 1 and #2 still starts
const sp2 = await call("crew_spawn", "sesINTEG1", { title: "вторая", goal: "g2", criteria: "c2" })
cell("a review session does not hold a worker place (worker limit 1)", /запущена/.test(sp2) && !!task(2)?.executor, sp2)
const ex2 = task(2).executor
await wait(300)

// 5. CREW_* in the command's environment: the executor of #2
await turnEnds(ex2)
const exPut = await call("crew_watch", ex2, { command: ENV_ECHO, note: "env-ex" })
cell("an ordinary command passes the deny check (in the task's worktree)", /поставлено/.test(exPut), exPut)
const exGot = await until(() => got(ex2, "WHO S=").length > 0)
const exLine = got(ex2, "WHO S=")[0]?.text ?? ""
cell("the executor's watch sees CREW_TASK_N and its role", exGot && exLine.includes(`S=${ex2} R=worker P=proj RV= T=2`), exLine.slice(0, 400))

// 6. crew_watch refuses what the project denies -- in the task's worktree too (the settings are committed)
const denied = await call("crew_watch", ex2, { command: "git -C . reset --hard HEAD~1" })
cell("crew_watch refuses a denied command, naming the rule", /не поставлено/.test(denied) && /Bash\(git reset --hard:\*\)/.test(denied), denied)
const deniedRead = await call("crew_watch", rv1, { command: "cd secrets && bash -c 'cat server.pem'" })
cell("crew_watch refuses a command reading a denied file", /не поставлено/.test(deniedRead) && /Read\(\.\/\*\*\/\*\.pem\)/.test(deniedRead), deniedRead)
cell("a refused command is not queued", !watch.watchesOf(ex2).length && !watch.watchesOf(rv1).length, JSON.stringify([...watch.watchesOf(ex2), ...watch.watchesOf(rv1)]))

// 3. #2 submitted: the acceptor tab busy, one review session already open = spawn_limits.acceptor -> #2 waits
writeFileSync(path.join(task(2).worktree, "g.txt"), "g\n")
git(task(2).worktree, "add", "-A")
git(task(2).worktree, "commit", "-q", "-m", "g")
await call("crew_send", ex2, { to: "sesINTEG1", text: "готово 2", reply_to: task(2).qid })
await wait(1200)
cell("spawn_limits.acceptor (1) bounds review sessions, not .reviewer (5): #2 waits", task(2).status === "submitted" && !task(2).reviewer, JSON.stringify({ r: task(2).reviewer, k: task(2).review_kind }))
tabs[2].busy = false
beat()
await until(() => !!task(2).reviewer)
cell("the freed acceptor tab takes #2", task(2).reviewer === "sesACC1" && task(2).review_kind === "tab", JSON.stringify({ r: task(2).reviewer, k: task(2).review_kind }))

// 4. rights: the executor and a stranger are refused; the reviewer reviews and merges
const byExecutor = await call("crew_task", ex1, { action: "merge", n: 1 })
cell("the executor cannot merge its own task", /Ты исполнитель задачи #1/.test(byExecutor) && /только его/.test(byExecutor) && !review.mergeHolder("proj"), byExecutor)
const byExecutorAcc = await call("crew_task", ex1, { action: "accept", n: 1, checks: { tests: "ok" } })
cell("the executor cannot accept its own task", /Ты исполнитель задачи #1/.test(byExecutorAcc) && task(1).status !== "accepted", byExecutorAcc)
const byStranger = await call("crew_task", "sesWORKER1", { action: "merge", n: 1 })
cell("a stranger worker cannot merge", /только его/.test(byStranger) && !review.mergeHolder("proj"), byStranger)
await call("crew_task", rv1, { action: "review", n: 1 })

// 5. env fixed when the watch is put: queued behind a machine slot, the reviewer changes role before it starts
const hog = await call("crew_watch", "sesINTEG1", { command: "sleep 60", machine: true, note: "hog" })
const hogId = /id: "([^"]+)"/.exec(hog)?.[1]
await wait(400)
await turnEnds(rv1)
const queued = await call("crew_watch", rv1, { command: ENV_ECHO, machine: true, note: "env-rv" })
cell("the reviewer's watch waits in the machine queue", /в очереди машины/.test(queued), queued)
const rec = watch.watchesOf(rv1)[0]
cell("the watch record on disk carries the env", rec?.env?.CREW_ROLE === "acceptor" && rec?.env?.CREW_REVIEW_N === "1" && rec?.env?.CREW_SESSION_ID === rv1 && rec?.env?.CREW_PROJECT === "proj" && !("CREW_TASK_N" in (rec?.env ?? {})), JSON.stringify(rec?.env))
await call("crew_role", rv1, { role: "worker" })
// 4. a reviewer without the acceptor role loses merge
const asWorker = await call("crew_task", rv1, { action: "merge", n: 1 })
cell("merge needs the acceptor role (reviewer: acceptor)", /право роли acceptor/.test(asWorker) && !review.mergeHolder("proj"), asWorker)
await call("crew_watch", "sesINTEG1", { action: "cancel", id: hogId })
const rvGot = await until(() => got(rv1, "WHO S=").length > 0)
const rvLine = got(rv1, "WHO S=")[0]?.text ?? ""
cell("the queued watch runs with the env of the moment it was put", rvGot && rvLine.includes(`S=${rv1} R=acceptor P=proj RV=1 T=`), rvLine.slice(0, 400))
await call("crew_role", rv1, { role: "acceptor" })
const lock = await call("crew_task", rv1, { action: "merge", n: 1 })
cell("with the acceptor role the reviewer takes the merge lock", /твой/.test(lock) && review.holdsMergeLock("proj", rv1), lock)
git(proj, "merge", "-q", "--no-edit", "p1-ficha")
await call("crew_role", rv1, { role: "worker" })
const accWorker = await call("crew_task", rv1, { action: "accept", n: 1, checks: { tests: "ok" } })
cell("accept needs the acceptor role", /право роли acceptor/.test(accWorker) && task(1).status === "reviewing", accWorker)
await call("crew_role", rv1, { role: "acceptor" })
const acc = await call("crew_task", rv1, { action: "accept", n: 1, checks: { tests: "ok" } })
cell("the acceptor accepts", task(1).status === "accepted", acc)
git(proj, "worktree", "remove", "--force", task(1).worktree)
git(proj, "branch", "-D", "p1-ficha")
await call("crew_role", rv1, { role: "worker" })
const clWorker = await call("crew_task", rv1, { action: "cleaned", n: 1 })
cell("cleaned needs the acceptor role", /право роли acceptor/.test(clWorker) && task(1).status === "accepted", clWorker)
await call("crew_role", rv1, { role: "acceptor" })
const cl = await call("crew_task", rv1, { action: "cleaned", n: 1 })
cell("the acceptor cleans", task(1).status === "cleaned", cl)

// help names the role and the rule
const help = await call("crew_help", "sesINTEG1")
cell("crew_help names the acceptor role and the deny check", /reviewer: acceptor/.test(help) && /permissions\.deny/.test(help) && /CREW_REVIEW_N/.test(help), help.slice(0, 200))

clearInterval(heart)
stop?.()
await wait(300)
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-acceptor.test: FAIL ${fail}` : "crew-acceptor.test ok")
process.exit(fail ? 1 : 0)

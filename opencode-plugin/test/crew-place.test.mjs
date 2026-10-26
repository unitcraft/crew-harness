// Self-test of a task's place (plan 002.6, defect 3; node >= 24):  node test/crew-place.test.mjs
// The worktree and branch are written with the task itself (not by a second save a server pass could miss), the
// path in the crew_spawn answer is the path created, and a task session is never opened in the main copy: a task
// whose record lost its place gets it from the settings; a worktree outside the project's worktrees folder or one
// that cannot be created is not started, the author is told. The rule of the trees folder (the owner, 2026-10-26):
// a place escaping it through the settings template is refused before the record is made (crew_spawn), and a tree
// made by hand outside the folder on the task branch is not adopted. The short (8.3) and the long form of one folder
// compare equal (insideDir): the TEMP of the service process may come short — the full run of 2026-10-26 caught it.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-place-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ root: "..", worktrees: "worktrees", worktree_name: "{repo}-{n}-{slug}", branch_name: "t{n}-{slug}", cleanup: "local", allow_default_models: true, spawn_limits: { worker: 5, reviewer: 0 } }))
git(proj, "init", "-q", "-b", "main")
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")
const wtRoot = path.join(tmp, "worktrees") // root ".." from the settings folder + "worktrees"
const real = (p) => realpathSync.native(p).toLowerCase()

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const tools = {}
const hooks = {}
const events = {}
const sessions = new Map()
const delivered = []
const ctx = {
  location: { directory: proj },
  options: { projects: [proj] },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
    synthetic: async ({ sessionID, text }) => delivered.push({ sessionID, text, synthetic: true }),
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
// the server runs from another directory (a service): the place still comes from the settings folder
const cwd0 = process.cwd()
mkdirSync(path.join(tmp, "elsewhere"), { recursive: true })
process.chdir(path.join(tmp, "elsewhere"))
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 8_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
}
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const task = (n) => tasks.loadTask("proj", n)
const lettersTo = (to) => ["inbox", "read"].flatMap((d) => {
  try {
    const dir = path.join(core.BASE, d, to)
    return readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
  } catch {
    return []
  }
})
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesINTEG1" } })
await call("crew_role", "sesINTEG1", { role: "integrator" })

// 1. crew_spawn: the answer's path == the record's == the created one, inside <root>/<worktrees>
const sp = await call("crew_spawn", "sesINTEG1", { title: "Карина №1752 К1: длина фрагмента", goal: "g", criteria: "c" })
await wait(300)
const t1 = task(1)
cell("the place is in the record", !!t1.worktree && t1.branch === `t1-${t1.slug}`, JSON.stringify({ wt: t1.worktree, b: t1.branch }))
cell("the answer names exactly the recorded worktree and branch", sp.includes(`worktree ${t1.worktree}, ветка ${t1.branch}`), sp)
cell("the worktree is created there, inside <root>/<worktrees> (server cwd elsewhere)", existsSync(t1.worktree) && real(path.dirname(t1.worktree)) === real(wtRoot), JSON.stringify({ wt: t1.worktree, wtRoot }))
cell("the session is opened in it", sessions.get(t1.executor)?.location?.directory === t1.worktree, JSON.stringify(sessions.get(t1.executor)?.location))

// 2. a task written without its place (the old two-save path; the server pass took it in between)
tasks.createTask({ project: "proj", title: "без места", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: "q2", status: "starting", kind: "spawn", executor: tasks.plannedSessionId(), directory: proj })
await until(() => task(2)?.status === "running")
const t2 = task(2)
cell("a task without a place gets it from the settings before it starts", !!t2.worktree && existsSync(t2.worktree) && real(path.dirname(t2.worktree)) === real(wtRoot) && t2.branch === `t2-${t2.slug}`, JSON.stringify({ wt: t2.worktree, b: t2.branch, st: t2.status }))
cell("and its session runs in the worktree, not the main copy", sessions.get(t2.executor)?.location?.directory === t2.worktree, JSON.stringify(sessions.get(t2.executor)?.location))

// 3. a worktree outside <root>/<worktrees>: not started, the author is told
const outside = path.join(tmp, "elsewhere", "proj-3-x")
tasks.createTask({ project: "proj", title: "снаружи", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: "q3", status: "starting", kind: "spawn", executor: tasks.plannedSessionId(), directory: proj }, () => ({ worktree: outside, branch: "t3-x" }))
await until(() => lettersTo("sesINTEG1").some((l) => /003 .*не запущена/.test(l.text)))
const t3 = task(3)
cell("a worktree outside the project's folder is not started", t3.status === "starting" && !sessions.has(t3.executor) && !existsSync(outside), JSON.stringify({ st: t3.status, s: sessions.has(t3.executor) }))
cell("the author is told why, once", lettersTo("sesINTEG1").filter((l) => /003 .*не запущена: worktree .* вне папки деревьев/.test(l.text)).length === 1, JSON.stringify(lettersTo("sesINTEG1").map((l) => l.text.slice(0, 160))))

// 4. the rule of the trees folder (the owner, 2026-10-26: trees are made only there)
// 4a. a settings template whose name escapes the folder: crew_spawn refuses before the record is made
// (the plugin reads the settings folder COMMITTED, with a background refresh — commit the flip and wait for it)
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ root: "..", worktrees: "worktrees", worktree_name: "../escape-{n}-{slug}", branch_name: "t{n}-{slug}", cleanup: "local", allow_default_models: true, spawn_limits: { worker: 5, reviewer: 0 } }))
git(proj, "add", ".opencode/crew-harness.json")
git(proj, "commit", "-q", "-m", "escape template")
await until(() => core.loadConfig(proj).worktreeName === "../escape-{n}-{slug}")
const bad = await call("crew_spawn", "sesINTEG1", { title: "Побег из папки", goal: "g", criteria: "c" })
cell("crew_spawn refuses a place outside the trees folder and names the rule", /Задача не поставлена: каталог дерева .* вне папки деревьев проекта .*владелец, 2026-10-26/.test(bad), bad)
cell("no record is made", !task(4), JSON.stringify(task(4)))
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ root: "..", worktrees: "worktrees", worktree_name: "{repo}-{n}-{slug}", branch_name: "t{n}-{slug}", cleanup: "local", allow_default_models: true, spawn_limits: { worker: 5, reviewer: 0 } }))
git(proj, "add", ".opencode/crew-harness.json")
git(proj, "commit", "-q", "-m", "restore template")
await until(() => core.loadConfig(proj).worktreeName === "{repo}-{n}-{slug}")

// 4b. a tree made by hand outside the folder on the task branch: not adopted, not started, the author is told how to fix
const adopted = path.join(tmp, "elsewhere", "proj-4-outside")
git(proj, "worktree", "add", adopted, "-b", "t4-outside")
tasks.createTask({ project: "proj", title: "усыновление снаружи", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: "q4", status: "starting", kind: "spawn", executor: tasks.plannedSessionId(), directory: proj }, () => ({ worktree: path.join(wtRoot, "proj-4-outside"), branch: "t4-outside" }))
await until(() => lettersTo("sesINTEG1").some((l) => /004 .*не запущена: на ветке t4-outside/.test(l.text)))
const t4 = task(4)
cell("a hand-made tree outside the folder is not adopted, the record keeps its own place", t4.status === "starting" && t4.worktree === path.join(wtRoot, "proj-4-outside") && !sessions.has(t4.executor), JSON.stringify({ st: t4.status, wt: t4.worktree, s: sessions.has(t4.executor) }))
cell("the letter says why and how to fix, once", lettersTo("sesINTEG1").filter((l) => /004 .*не запущена: на ветке t4-outside уже стоит дерево .* вне папки деревьев проекта .*git worktree move/.test(l.text)).length === 1, JSON.stringify(lettersTo("sesINTEG1").map((l) => l.text.slice(0, 200))))

// ---- the short (8.3) form and the long form of one folder compare equal (the TEMP of the service process may come
// in the short form; the full run of 2026-10-26 caught a false refusal «вне папки деревьев» on this machine) ----
const shortOf = (p) => { try { return execFileSync("powershell", ["-NoProfile", "-Command", `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${p.replace(/'/g, "''")}').ShortPath`], { encoding: "utf8" }).trim() } catch { return p } }
const tmpShort = shortOf(tmp)
cell("insideDir: the short 8.3 form and the long form of one folder match", core.insideDir(path.join(tmpShort, "worktrees", "proj-9-x"), path.join(tmp, "worktrees")) && core.insideDir(path.join(tmp, "worktrees", "proj-9-x"), path.join(tmpShort, "worktrees")), `${tmpShort} <-> ${tmp}`)

stop?.()
process.chdir(cwd0)
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-place.test: FAIL ${fail}` : "crew-place.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the tree of a task session (task 079, node >= 24):  node test/crew-session-tree.test.mjs
// The scenario of task 061: the task branch has a tree made by hand, the integrator recorded it with crew_task track, then a session
// of the task is started (crew_spawn {task, session, place: task}). The plugin takes the tree that already stands on the branch (the
// record of the task and the session agree on its path) and never runs a second `git worktree add` on a busy branch. Borders: a tree
// made by the plugin as before; a branch held by the main copy or by the tree of another task is a refusal naming that path; a
// recorded path whose folder is gone is made again; a session of its own (place own) takes a tree made by hand for its branch.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-session-tree-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_START_RETRY_MS = "60000"
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1" // the settings are read from the committed file: a change is committed and read at once
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const settings = path.join(proj, ".opencode", "crew-harness.json")
const base = { root: "..", worktree_name: "{repo}-{n}-{slug}", branch_name: "task/{n}-{slug}", cleanup: "local", allow_default_models: true, inflight_limit: 20, spawn_limits: { worker: 20, reviewer: 0 } }
// before the settings name the folder of trees, the plugin makes no tree (task 061 started so: the tabs were moved by hand)
const putSettings = (raw) => {
  writeFileSync(settings, JSON.stringify(raw))
  if (!existsSync(path.join(proj, ".git"))) return
  git(proj, "add", "--", ".opencode/crew-harness.json")
  git(proj, "commit", "-q", "-m", "settings", "--allow-empty")
}
// the plugin refreshes the committed settings in the background: wait until it has seen the change
const settled = async (want) => {
  for (const end = Date.now() + 8_000; !!core.loadConfig(proj).worktrees !== want && Date.now() < end; ) await wait(100)
}
const settingsNoTrees = async () => {
  putSettings(base)
  await settled(false)
}
const settingsTrees = async () => {
  putSettings({ ...base, worktrees: "worktrees" })
  await settled(true)
}
putSettings(base)
mkdirSync(path.join(proj, "doc", "tasks", "000-seed"), { recursive: true })
writeFileSync(path.join(proj, "doc", "tasks", "000-seed", "log.md"), "2026-10-01 10:00 документ: задание заведено\n")
git(proj, "init", "-q", "-b", "main")
git(proj, "config", "user.name", "Owner Test")
git(proj, "config", "user.email", "owner@test")
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")
const wtRoot = path.join(tmp, "worktrees")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const tools = {}
const hooks = {}
const events = {}
const sessions = new Map()
const ctx = {
  location: { directory: proj },
  options: { projects: [proj] },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
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
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const task = (n) => tasks.loadTask("proj", n)
const read = (p) => {
  try {
    return readFileSync(p, "utf8")
  } catch {
    return ""
  }
}
// the temporary folder may be named in its short form (8.3) on Windows: compare the real paths
const realOf = (p) => {
  const abs = path.resolve(String(p))
  try {
    return realpathSync.native(abs)
  } catch {
    return path.join(realOf(path.dirname(abs)), path.basename(abs))
  }
}
const norm = (p) => (p ? realOf(p).split(path.sep).join("/").toLowerCase() : "")
// the text names the path (git prints the long form, slashes forward)
const names = (text, p) => String(text).split("\\").join("/").toLowerCase().includes(norm(p))
const same = (a, b) => !!a && !!b && norm(a) === norm(b)
const trees = () => git(proj, "worktree", "list", "--porcelain").split(/\r?\n\r?\n/).filter(Boolean).map((b) => ({ path: b.match(/^worktree (.+)$/m)?.[1], branch: b.match(/^branch refs\/heads\/(.+)$/m)?.[1] }))
const treesOn = (branch) => trees().filter((t) => t.branch === branch)
const lettersTo = (to) => ["inbox", "read"].flatMap((d) => {
  try {
    const dir = path.join(core.BASE, d, to)
    return readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
  } catch {
    return []
  }
})
const newTask = (title) => call("crew_spawn", "sesINTEG1", { title, goal: "g", criteria: "c", owner_words: "- «заводи» (владелец, 2026-10-17, чат)", result: "нет: результат — код: проверка" })
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesINTEG1" } })
await call("crew_role", "sesINTEG1", { role: "integrator" })

// ---- 1. the scenario of task 061: a tree made by hand + track + a session of the task ----
await newTask("Сценарий шестьдесят первой")
await wait()
const t1 = task(1)
cell("setup: the task 001 has a folder and a branch, and no tree of its own (the settings named no folder of trees)", !!t1?.folder && /^task\/001-/.test(t1.branch ?? "") && !t1.worktree, JSON.stringify({ f: t1?.folder, b: t1?.branch, w: t1?.worktree }))
await settingsTrees()
const hand1 = path.join(wtRoot, "task-001-by-hand")
mkdirSync(wtRoot, { recursive: true })
git(proj, "worktree", "add", hand1, t1.branch)
const tr = await call("crew_task", "sesINTEG1", { action: "track", n: 1, branch: t1.branch, worktree: hand1 })
cell("setup: track recorded the branch and the tree of the task for the cleanup", /Записано в задачу/.test(tr) && (task(1)?.side ?? []).some((i) => same(i.worktree, hand1)), tr)
const a1 = await call("crew_spawn", "sesINTEG1", { task: 1, session: "С3п", goal: "правка плана", place: "task" })
await wait()
const u1 = task(1)
const ses1 = u1?.sessions?.find((s) => s.code === "С3п")
cell("061: the session is started (the answer says it, the record is running), `git worktree add` is not tried", /запущена/.test(a1) && !/не запущена/.test(a1) && !/worktree add/.test(a1) && u1?.status === "running", JSON.stringify({ a1: a1.slice(0, 300), st: u1?.status }))
cell("061: no second tree — the branch stands in exactly one tree, the one made by hand", treesOn(u1.branch).length === 1 && same(treesOn(u1.branch)[0].path, hand1) && trees().length === 2, JSON.stringify(trees()))
cell("061: the folder of the tree the plugin would have made is not there", !existsSync(path.join(wtRoot, `proj-001-${u1.slug}`)), readdirSync(wtRoot).join(","))
cell("061: the record of the task names the tree of the branch", same(u1?.worktree, hand1), String(u1?.worktree))
cell("061: the session runs in that tree", same(sessions.get(ses1?.session)?.location?.directory, hand1), JSON.stringify(sessions.get(ses1?.session)?.location))
cell("061: the launch lines are written in that tree (progress.log and log.md)", / 0\/0 \[[^\]]+\] запуск №2$/m.test(read(path.join(hand1, u1.folder, "progress.log"))) && /пуск: запуск №2 С3п/.test(read(path.join(hand1, u1.folder, "log.md"))), read(path.join(hand1, u1.folder, "progress.log")))
cell("061: the author gets no refusal letter", !lettersTo("sesINTEG1").some((l) => /не запущена/.test(l.text)), JSON.stringify(lettersTo("sesINTEG1").map((l) => l.text.slice(0, 120))))
// the next session of the task finds the same tree in the record (no search needed)
await call("crew_spawn", "sesINTEG1", { task: 1, session: "С3п", goal: "ещё правка", place: "task" })
await wait()
cell("061: the next session of the task works in the same tree", trees().length === 2 && same(sessions.get(task(1)?.sessions?.at(-1)?.session)?.location?.directory, hand1), JSON.stringify(trees()))

// ---- 2. the plugin makes the tree, as before ----
await newTask("Дерево делает плагин")
await wait(500)
const t2 = task(2)
cell("plugin: the tree is made by the plugin in the folder of trees on the task branch, the session runs in it", !!t2?.worktree && same(path.dirname(t2.worktree), wtRoot) && existsSync(t2.worktree) && treesOn(t2.branch).length === 1 && same(treesOn(t2.branch)[0].path, t2.worktree) && same(sessions.get(t2.executor)?.location?.directory, t2.worktree) && t2.worktree_ready === true, JSON.stringify({ w: t2?.worktree, trees: trees() }))

// ---- 3. the recorded path stands, its folder is gone: the plugin makes the tree again at the same path ----
rmSync(t2.worktree, { recursive: true, force: true })
cell("gone: git still registers the missing folder (the case of a deleted tree)", treesOn(t2.branch).length === 1 && !existsSync(t2.worktree), JSON.stringify(trees()))
const a3 = await call("crew_spawn", "sesINTEG1", { task: 2, session: "С3п", goal: "после удаления дерева", place: "task" })
await wait(500)
const u2 = task(2)
cell("gone: the tree is made again at the recorded path and the session runs in it", /запущена/.test(a3) && !/не запущена/.test(a3) && existsSync(u2.worktree) && same(u2.worktree, t2.worktree) && git(u2.worktree, "rev-parse", "--abbrev-ref", "HEAD") === t2.branch && same(sessions.get(u2.executor)?.location?.directory, t2.worktree), JSON.stringify({ a3: a3.slice(0, 300), trees: trees() }))
rmSync(u2.worktree, { recursive: true, force: true })
git(proj, "worktree", "prune")
const a3b = await call("crew_spawn", "sesINTEG1", { task: 2, session: "С3п", goal: "после удаления и prune", place: "task" })
await wait(500)
cell("gone: the registration cleaned (prune) — the same, the tree is made again", /запущена/.test(a3b) && existsSync(task(2).worktree) && treesOn(t2.branch).length === 1, JSON.stringify({ a3b: a3b.slice(0, 300), trees: trees() }))

// ---- 4. the branch is held by the tree of ANOTHER task: a refusal naming the path, no `git worktree add` ----
await settingsNoTrees()
await newTask("Ветку держит чужое дерево")
await newTask("Хозяин чужого дерева")
await settingsTrees()
await wait()
const t3 = task(3)
const t4 = task(4)
const foreign = path.join(wtRoot, "tree-of-task-004")
git(proj, "worktree", "add", foreign, t3.branch)
tasks.saveTask({ ...t4, worktree: foreign })
const a4 = await call("crew_spawn", "sesINTEG1", { task: 3, session: "С3п", goal: "g", place: "task" })
await wait()
const letter4 = lettersTo("sesINTEG1").find((l) => /Задача 003 .*не запущена/.test(l.text))?.text ?? ""
cell("foreign: the session is not started, the answer names the tree that holds the branch", /не запущена/.test(a4) && names(a4, foreign), a4)
cell("foreign: the author is told with the path of that tree", letter4.includes("003") && names(letter4, foreign), letter4)
cell("foreign: no new tree, the tree of the other task is not touched", trees().filter((t) => t.branch === t3.branch).length === 1 && same(trees().find((t) => t.branch === t3.branch).path, foreign) && !existsSync(path.join(wtRoot, `proj-003-${t3.slug}`)), JSON.stringify(trees()))
cell("foreign: the record of the task 003 does not take the foreign tree", !same(task(3)?.worktree, foreign), String(task(3)?.worktree))

// ---- 5. the branch is held by the main copy: a refusal naming the main copy ----
await settingsNoTrees()
await newTask("Ветку держит основная копия")
await settingsTrees()
await wait()
const t5 = task(5)
git(proj, "checkout", "-q", t5.branch)
const a5 = await call("crew_spawn", "sesINTEG1", { task: 5, session: "С3п", goal: "g", place: "task" })
await wait()
git(proj, "checkout", "-q", "main")
cell("main copy: the session is not started and the refusal says the main copy holds the branch, with its path", /не запущена/.test(a5) && /выбрана в основной копии проекта/.test(a5) && names(a5, proj) && !existsSync(path.join(wtRoot, `proj-005-${t5.slug}`)), a5)

// ---- 6. a session of its own (place own): the tree for its branch made by hand is taken ----
const own1 = path.join(wtRoot, "hand-s4-1")
git(proj, "worktree", "add", "-b", "task/001-s4-1", own1, task(1).branch)
const a6 = await call("crew_spawn", "sesINTEG1", { task: 1, session: "С4", goal: "проверка", place: "own" })
await wait()
const s4 = task(1)?.sessions?.find((s) => s.code === "С4")
cell("own: the session takes the tree of its branch made by hand, the record of the session names it", /запущена/.test(a6) && !/не запущена/.test(a6) && s4?.branch === "task/001-s4-1" && same(s4?.worktree, own1) && same(sessions.get(s4?.session)?.location?.directory, own1) && treesOn("task/001-s4-1").length === 1, JSON.stringify({ a6: a6.slice(0, 300), s4, trees: trees() }))

stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-session-tree.test: FAIL ${fail}` : "crew-session-tree.test ok")
process.exit(fail ? 1 : 0)

// Self-test: the project and its settings folder are found by the PROJECT of the tab, not by the folder the tab stands in
// (task 067; node >= 24):  node test/crew-project-tree.test.mjs
// A tab of the integrator moves into the working tree of a task (session_move); the tree lies outside the project root.
// /crew-sets use|show, the table, /crew-config, crew_config show|set and the profile state must still find the project and
// work with the settings folder of the MAIN folder (the tree's own committed copy of the file does not stand in for it).
// A tab outside every project is refused with its own text. Real git repositories and real worktrees.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-project-tree-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "600000"
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_NO_WORKER = "1"

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex")
const prof = (model, context, output) => ({ model, context, output })
const c = (family, tier) => ({ family, tier })
const TABLE = {
  claude: { heavy: prof("claude-code/opus", 720000, 64000), medium: prof("claude-code/sonnet", 720000, 64000), light: prof("claude-code/haiku", 220000, 32000) },
  kimi: { heavy: prof("kimi/k3", 220000, 131072), medium: prof("kimi/k3", 220000, 131072), light: prof("kimi/k3", 220000, 131072) },
}
const SETS = { default: { develop: c("claude", "task"), accept: c("claude", "task") }, kimi: { develop: c("kimi", "heavy"), accept: c("kimi", "heavy") } }
const SF = ".opencode/crew-harness.json"
const write = (dir, obj) => {
  mkdirSync(path.join(dir, ".opencode"), { recursive: true })
  writeFileSync(path.join(dir, SF), JSON.stringify(obj, null, 2))
}
const repo = (dir) => {
  mkdirSync(dir, { recursive: true })
  git(dir, "init", "-q", "-b", "main")
}
const commitAll = (dir, msg) => {
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", msg)
}
const tree = (main, where, branch) => {
  git(main, "worktree", "add", "-q", "-b", branch, where)
  return where
}

// 1. "alpha": the settings repository is the project repository itself (root "."), like this very repository.
const alpha = path.join(tmp, "work", "alphaRepo")
repo(alpha)
write(alpha, { project: "alpha", root: ".", model_profiles: TABLE, profile_sets: SETS })
writeFileSync(path.join(alpha, "README.md"), "x")
commitAll(alpha, "settings")
const alphaTree = tree(alpha, path.join(tmp, "trees", "alpha-task"), "task-alpha")
// the tree's own committed copy of the file says something else: it must not stand in for the main folder
write(alphaTree, { project: "alpha", root: ".", model_profiles: TABLE, profile_sets: SETS, profile_set: "default" })
commitAll(alphaTree, "branch copy")

// 2. "virt": a virtual project — the root is a plain folder, the repository of code is inside, the settings repository too.
const virtRoot = path.join(tmp, "work", "virtRoot")
const virtApp = path.join(virtRoot, "app")
const virtSettings = path.join(virtRoot, "virt-settings")
repo(virtApp)
writeFileSync(path.join(virtApp, "a.txt"), "x")
commitAll(virtApp, "app")
repo(virtSettings)
write(virtSettings, { project: "virt", root: "..", model_profiles: TABLE, profile_sets: SETS })
commitAll(virtSettings, "settings")
const virtTree = tree(virtApp, path.join(tmp, "trees", "virt-task"), "task-virt")

// 3. "oldp": the old form of the options (name -> root), the file is read up from the folder.
const oldRoot = path.join(tmp, "work", "oldRepo")
repo(oldRoot)
write(oldRoot, { model_profiles: TABLE, profile_sets: SETS })
commitAll(oldRoot, "settings")
const oldTree = tree(oldRoot, path.join(tmp, "trees", "old-task"), "task-old")
write(oldTree, { model_profiles: TABLE, profile_sets: SETS, profile_set: "default" })
commitAll(oldTree, "branch copy")

// 4. a repository that belongs to no project, and its tree
const foreign = path.join(tmp, "work", "foreignRepo")
repo(foreign)
writeFileSync(path.join(foreign, "f.txt"), "x")
commitAll(foreign, "f")
const foreignTree = tree(foreign, path.join(tmp, "trees", "foreign-task"), "task-foreign")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const L = await import("../profile-layer.ts")
const Cmd = await import("../profile-cmd.ts")
const { normPath } = await import("../settings.ts")
const hooks = {}
const tools = {}
const dirOf = {}
const ctx = {
  location: { directory: alpha },
  options: { projects: [alpha, virtSettings] },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf[sessionID] ?? alpha }, time: {} }),
    prompt: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + String(detail).slice(0, 600)}`)
  if (!ok) fail++
}
const same = (a, b) => !!a && !!b && normPath(a) === normPath(b)
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"))
const call = async (sid, input) => (await tools.crew_config.execute(input, { sessionID: sid })).content
const sess = {
  sesAlphaMain: alpha, sesAlphaTree: alphaTree, sesVirtTree: virtTree, sesForeignTree: foreignTree, sesForeignMain: foreign,
}
Object.assign(dirOf, sess)
for (const s of Object.keys(sess)) await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })
for (const s of ["sesAlphaTree", "sesVirtTree", "sesForeignTree"]) await tools.crew_role.execute({ role: "integrator" }, { sessionID: s })
await tools.crew_role.execute({ role: "integrator" }, { sessionID: "sesAlphaMain" }).catch(() => {})
// the old form is a second configuration of the process: set by hand where the test needs it
const oldProjects = core.parseProjects({ projects: { oldp: oldRoot } })
const newProjects = core.settingsContext().projects
const local = core.settingsContext().local

// ---- the project is found from the tree ----
const mainFile = path.join(alpha, SF)
const treeFile = path.join(alphaTree, SF)
const stMain = L.profileState(alpha)
const stTree = L.profileState(alphaTree)
cell("the main folder: project and settings folder as before", stMain.project === "alpha" && same(stMain.folder, alpha), JSON.stringify({ p: stMain.project, f: stMain.folder }))
cell("a tab in a working tree of the project: the project is found", stTree.project === "alpha", stTree.project)
cell("a tab in a working tree: the settings folder is the MAIN folder, not the tree", same(stTree.folder, alpha), stTree.folder)
cell("a tab in a working tree: the branch copy of the file does not set the profile_set", stTree.name === undefined, stTree.name)
cell("a virtual project: a tree of the code repository finds the project and its settings folder", L.profileState(virtTree).project === "virt" && same(L.profileState(virtTree).folder, virtSettings), JSON.stringify(L.profileState(virtTree)))
cell("the name of the tab card finds the project of a folder outside any tree and root", L.profileState(path.join(tmp, "nowhere"), "alpha").project === "alpha" && same(L.profileState(path.join(tmp, "nowhere"), "alpha").folder, alpha), JSON.stringify(L.profileState(path.join(tmp, "nowhere"), "alpha")))
cell("the card name wins over the folder: a tree of another repository filed under the project", L.profileState(foreignTree, "alpha").project === "alpha", L.profileState(foreignTree, "alpha").project)
cell("a card name that is no project of the plugin is ignored", L.profileState(alphaTree, "nosuch").project === "alpha", L.profileState(alphaTree, "nosuch").project)
cell("projectOf finds the project from the tree too (the card name of the tab)", core.projectOf(alphaTree, newProjects) === "alpha" && core.projectOf(virtTree, newProjects) === "virt", core.projectOf(alphaTree, newProjects))

// ---- /crew-sets from the tab in the tree ----
const table = await Cmd.runSetsCommand(alphaTree, "")
cell("/crew-sets (the table) from a tree shows the sets of the project", /kimi/.test(table) && /default/.test(table), table)
const show = await Cmd.runSetsCommand(alphaTree, "show kimi")
cell("/crew-sets show kimi from a tree", /kimi/.test(show) && !/нет/.test(show.split("\n")[0]), show)
const treeBefore = sha(treeFile)
const use = await Cmd.runSetsCommand(alphaTree, "use kimi")
cell("/crew-sets use kimi from a tree: enabled", /^Набор «kimi» включён/.test(use), use)
cell("/crew-sets use writes the MAIN folder file", readJson(mainFile).profile_set === "kimi", JSON.stringify(readJson(mainFile).profile_set))
cell("/crew-sets use leaves the file of the tree untouched", sha(treeFile) === treeBefore, "changed")
const off = await Cmd.runSetsCommand(alphaTree, "off")
cell("/crew-sets off from a tree clears the main file", readJson(mainFile).profile_set === undefined, off)
// the execOp way of the window: the card name and the folder of the tab
const ops = await import("../cmd-ops.ts")
const viaOp = await ops.execOp({ kind: "sets", dir: alphaTree, project: "alpha", text: "use kimi" })
cell("execOp (the window command) from a tree", /^Набор «kimi» включён/.test(viaOp) && readJson(mainFile).profile_set === "kimi", viaOp)
await Cmd.runSetsCommand(alpha, "off")
const viaOpName = await ops.execOp({ kind: "sets", dir: path.join(tmp, "nowhere"), project: "alpha", text: "use kimi" })
cell("execOp: the folder of the tab is nowhere, the card names the project", /^Набор «kimi» включён/.test(viaOpName) && readJson(mainFile).profile_set === "kimi", viaOpName)
await Cmd.runSetsCommand(alpha, "off")
const virtUse = await Cmd.runSetsCommand(virtTree, "use kimi")
cell("virtual project: use from a tree of the code repository writes the settings folder", /^Набор «kimi» включён/.test(virtUse) && readJson(path.join(virtSettings, SF)).profile_set === "kimi", virtUse)

// ---- crew_config from the tab in the tree ----
const shown = await call("sesAlphaTree", { action: "show" })
cell("crew_config show from a tree: the project and the main folder file", /^.*Проект alpha: настройки /m.test(shown) && shown.includes("alphaRepo") && !/прежняя форма/.test(shown), shown.slice(0, 500))
const setRes = await call("sesAlphaTree", { action: "set", values: { inflight_limit: 3 } })
cell("crew_config set from a tree writes the main folder file", /Записано/.test(setRes) && readJson(mainFile).inflight_limit === 3, setRes)
cell("crew_config set leaves the file of the tree untouched", sha(treeFile) === treeBefore, "changed")
const shownAfter = await call("sesAlphaTree", { action: "show" })
cell("crew_config show from a tree lists the uncommitted key of the main folder", /Незакоммичено.*inflight_limit/.test(shownAfter), shownAfter.slice(0, 400))
const tmpl = await call("sesVirtTree", { action: "apply_template" })
cell("crew_config apply_template from a tree of a virtual project writes the settings folder", /Стандартный шаблон записан в /.test(tmpl) && tmpl.includes("virt-settings"), tmpl)

// ---- outside any project ----
const fst = L.profileState(foreignTree)
const fw = L.writeDraft(fst, L.draftOf(fst))
cell("a tab outside every project: the write is refused with its own text", fw.ok === false && /папка вкладки .* не относится к проекту/.test(fw.error ?? "") && !/прежней формой/.test(fw.error ?? ""), JSON.stringify(fw))
const fuse = await ops.execOp({ kind: "sets", dir: foreignTree, project: "foreignrepo", text: "use kimi" })
cell("a tab outside every project: /crew-sets use says so (the window command)", /не относится к проекту/.test(fuse) && !/прежней формой/.test(fuse) && !/набора/.test(fuse), fuse)
const fset = await call("sesForeignTree", { action: "set", values: { inflight_limit: 3 } })
cell("a tab outside every project: crew_config set says so", /не относится к проекту/.test(fset) && !/прежней формой/.test(fset), fset)
await tools.crew_role.execute({ role: "integrator", force: true }, { sessionID: "sesForeignMain" })
const ftmpl = await call("sesForeignMain", { action: "apply_template" })
cell("a tab outside every project, in the main folder of its repository: the same text", /не относится к проекту/.test(ftmpl) && !/прежней формой/.test(ftmpl), ftmpl)

const fshow = await call("sesForeignTree", { action: "show" })
cell("a tab outside every project: crew_config show says the folder is not a project folder", /Папка вкладки .* не относится к проекту плагина/.test(fshow) && !/прежняя форма/.test(fshow), fshow.slice(0, 300))
const { mainTreeOf } = await import("../settings.ts")
cell("mainTreeOf: a tree gives its main folder, a plain folder gives nothing", same(mainTreeOf(alphaTree), alpha) && same(mainTreeOf(alpha), alpha) && mainTreeOf(path.join(tmp, "nowhere")) === undefined, JSON.stringify([mainTreeOf(alphaTree), mainTreeOf(path.join(tmp, "nowhere"))]))

// ---- the old form of the options ----
core.setProjects(oldProjects, {})
const ot = L.profileState(oldTree)
cell("old form: a tree of the project finds the project", ot.project === "oldp", ot.project)
cell("old form: the settings are the MAIN folder file, not the file of the tree", ot.name === undefined && same(ot.folder, oldRoot), JSON.stringify({ n: ot.name, f: ot.folder }))
const od = L.writeDraft(ot, { ...L.draftOf(ot), name: "kimi" })
cell("old form: the write goes to the main folder", od.ok === true && readJson(path.join(oldRoot, SF)).profile_set === "kimi" && readJson(path.join(oldTree, SF)).profile_set === "default", JSON.stringify(od))
core.setProjects(newProjects, local)

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-project-tree.test: FAIL ${fail}` : "crew-project-tree.test ok")
process.exit(fail ? 1 : 0)

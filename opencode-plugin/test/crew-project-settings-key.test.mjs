// Self-test of the option key of the settings folders (task 089; node >= 24):  node test/crew-project-settings-key.test.mjs
// The key is `project_settings` (a list of settings folders, not of projects); the old name `projects` stays a synonym:
// read when project_settings is absent. Both set -> project_settings acts, crew_doctor says one line about the
// difference. Only `projects` as a list -> works, crew_doctor says one low-importance line (not a problem, the green
// verdict stays). The old form name -> root stays under `projects`. Reading the committed file, `crew_config set` and
// `/crew-sets use` work in a project given by project_settings.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-pskey-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.XDG_CONFIG_HOME = path.join(tmp, "xdgcfg")
process.env.TEMP = tmp
process.env.TMP = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_PROFILES_MS = "100000"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
process.env.CREW_HARNESS_PRESENCE = "all"
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const mkRepo = (dir, settings) => {
  mkdirSync(path.join(dir, ".opencode"), { recursive: true })
  git(dir, "init", "-q", "-b", "main")
  writeFileSync(path.join(dir, ".opencode", "crew-harness.json"), JSON.stringify(settings, null, 2))
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", "settings")
}
const c = (family, tier) => ({ family, tier })
const prof = (model) => ({ model, context: 220000, output: 64000 })
const TABLE = { claude: { heavy: prof("claude-code/opus"), medium: prof("claude-code/sonnet"), light: prof("claude-code/haiku") } }
const SETS = { default: { develop: c("claude", "task"), plan: c("claude", "task"), accept: c("claude", "task"), plan_accept: c("claude", "task") } }

const root = path.join(tmp, "proj")
const cfgA = path.join(root, "alpha-settings") // the settings folder of the project alpha; its root is the parent
const cfgB = path.join(root, "beta-settings")
const work = path.join(root, "repo")
mkdirSync(work, { recursive: true })
mkRepo(cfgA, { project: "alpha", root: "..", allow_default_models: true, project_rules: "ALPHA-LINE", model_profiles: TABLE, profile_sets: SETS })
mkRepo(cfgB, { project: "beta", root: "..", allow_default_models: true })

const settings = await import("../settings.ts")
const core = await import("../core.ts")
const mod = await import("../index.ts")
const Cmd = await import("../profile-cmd.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const names = (ps) => ps.map((p) => p.name).sort().join()
const roots = (ps) => ps.map((p) => p.root).sort().join()

// ---- the same set of projects under both names ----
const byMain = settings.parseProjects({ project_settings: [cfgA, cfgB] })
const bySyn = settings.parseProjects({ projects: [cfgA, cfgB] })
cell("project_settings gives the projects named in the files", names(byMain) === "alpha,beta" && byMain.every((p) => p.dir), JSON.stringify(byMain))
cell("projects (a list) gives the same set as project_settings", names(bySyn) === names(byMain) && roots(bySyn) === roots(byMain), JSON.stringify(bySyn))
cell("null or empty values: no projects, no error", settings.parseProjects({ project_settings: null, projects: [] }).length === 0 && settings.parseProjects({}).length === 0, "")

// ---- both keys: project_settings acts, projects is ignored, one line says which entries differ ----
const both = settings.parseProjects({ project_settings: [cfgA], projects: [cfgA, cfgB] })
cell("both keys: project_settings acts, projects is ignored", names(both) === "alpha", names(both))
const problems = settings.settingsProblems(both)
const bothLines = problems.filter((p) => /project_settings/.test(p) && /projects/.test(p))
cell("both keys, different entries: ONE line names the keys, who acts and the differing entry", bothLines.length === 1 && /игнорируется/.test(bothLines[0]) && bothLines[0].includes("beta-settings") && !bothLines[0].includes("alpha-settings"), JSON.stringify(problems))
cell("both keys, different entries: no other line", problems.length === 1, JSON.stringify(problems))
const same = settings.parseProjects({ project_settings: [cfgA], projects: [cfgA] })
cell("both keys, the same entries: not a problem, one note", settings.settingsProblems(same).length === 0 && settings.settingsNotes().length === 1 && /оба ключа/.test(settings.settingsNotes()[0]), JSON.stringify({ p: settings.settingsProblems(same), n: settings.settingsNotes() }))

// ---- only the old name with a list: works, one note of low importance, no problem ----
const syn = settings.parseProjects({ projects: [cfgA, cfgB] })
cell("only projects (a list): the doctor has no problem", settings.settingsProblems(syn).length === 0, JSON.stringify(settings.settingsProblems(syn)))
cell("only projects (a list): one low-importance note, the rename", JSON.stringify(settings.settingsNotes()) === JSON.stringify(["ключ projects переименован в project_settings; прежнее имя работает"]), JSON.stringify(settings.settingsNotes()))
const fresh = settings.parseProjects({ project_settings: [cfgA, cfgB] })
cell("only project_settings: nothing to say", settings.settingsProblems(fresh).length === 0 && settings.settingsNotes().length === 0, JSON.stringify({ p: settings.settingsProblems(fresh), n: settings.settingsNotes() }))

// ---- the old form name -> root stays under projects, with the old advice naming project_settings ----
const oldRoot = path.join(tmp, "oldp")
mkdirSync(oldRoot, { recursive: true })
const old = settings.parseProjects({ projects: { oldp: oldRoot } })
const oldProblems = settings.settingsProblems(old)
cell("the old form under projects works as before", old.length === 1 && old[0].name === "oldp" && !old[0].dir, JSON.stringify(old))
cell("the old form: the old advice, the new form is called project_settings", oldProblems.some((p) => /заданы прежней формой опций/.test(p) && p.includes('"project_settings": ["<папка с .opencode/crew-harness.json>"]') && !p.includes('"projects"')), JSON.stringify(oldProblems))
cell("the old form: no note about the rename (it is not a list)", settings.settingsNotes().length === 0, JSON.stringify(settings.settingsNotes()))
const oldMain = settings.parseProjects({ project_settings: { oldp: oldRoot } })
cell("the old form under project_settings still gives the project, the doctor says where the old form belongs", oldMain.length === 1 && settings.settingsProblems(oldMain).some((p) => /project_settings — список папок/.test(p) && /только под прежним именем projects/.test(p)), JSON.stringify(settings.settingsProblems(oldMain)))

// ---- the mailbox copy for the MCP server keeps the key ----
core.saveProjects({ project_settings: [cfgA], local: { alpha: { spawn_models: { light: "kimi/k3" } } } })
const boxFile = path.join(process.env.XDG_DATA_HOME, "opencode", "crew-harness", "projects.json")
const box = JSON.parse(readFileSync(boxFile, "utf8"))
cell("the mailbox file carries project_settings", JSON.stringify(box.project_settings) === JSON.stringify([cfgA]) && box.projects === undefined, JSON.stringify(box))
const fromBox = core.loadProjects()
cell("MCP gets the same projects and the local option from project_settings", names(fromBox) === "alpha" && core.loadConfig(work).spawnModels.light === "kimi/k3", JSON.stringify(fromBox))
core.saveProjects({ projects: [cfgB] })
cell("MCP reads the old key from the mailbox too", names(core.loadProjects()) === "beta", "")
process.env.OPENCODE_CREW_PROJECTS = JSON.stringify([cfgA])
cell("OPENCODE_CREW_PROJECTS overrides the list (the value of project_settings)", names(core.loadProjects()) === "alpha", "")
delete process.env.OPENCODE_CREW_PROJECTS

// ---- a project given by project_settings: the plugin, crew_config set, crew_doctor, /crew-sets use ----
const boot = async (options) => {
  const hooks = {}
  const tools = {}
  const ctx = {
    location: { directory: work },
    options,
    session: {
      get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: work }, time: {} }),
      prompt: async () => {},
      hook: async (name, cb) => (hooks[name] = cb),
    },
    tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  }
  const stop = await mod.default.setup(ctx)
  await hooks.context({ sessionID: "sesINT", system: [], model: { id: "x", providerID: "y" } })
  await tools.crew_role.execute({ role: "integrator" }, { sessionID: "sesINT" })
  return { tools, stop }
}
let { tools, stop } = await boot({ project_settings: [cfgA] })
const call = async (name, input) => (await tools[name].execute(input, { sessionID: "sesINT" })).content
const fileA = path.join(cfgA, ".opencode", "crew-harness.json")
cell("the plugin options with project_settings: the committed file is read", core.loadConfig(work).projectRules.includes("ALPHA-LINE"), core.loadConfig(work).projectRules.slice(-100))
const doc = await call("crew_doctor", {})
// the mock host of this test has its own doctor lines (no session.create, no window): only the lines about the settings count
const mine = (t) => t.split("\n").filter((l) => /project_settings|projects|настроен|настройки/.test(l))
cell("crew_doctor with project_settings: nothing about the keys, no note", mine(doc).length === 0 && !/К сведению/.test(doc), doc)
const set = await call("crew_config", { action: "set", values: { inflight_limit: 3 } })
cell("crew_config set writes the settings folder of a project given by project_settings", /Записано/.test(set) && JSON.parse(readFileSync(fileA, "utf8")).inflight_limit === 3, set)
const shown = await call("crew_config", { action: "show" })
cell("crew_config show works there", /project_rules/.test(shown) && /файл, ветка main/.test(shown), shown)
const used = await Cmd.runSetsCommand(work, "use default", { version: "2.0.23-test", catalog: async () => [{ providerID: "claude-code", modelID: "opus" }, { providerID: "claude-code", modelID: "sonnet" }, { providerID: "claude-code", modelID: "haiku" }] })
cell("/crew-sets use works in a project given by project_settings", /^Набор «default» включён$/m.test(used) && JSON.parse(readFileSync(fileA, "utf8")).profile_set === "default", used)
stop?.()

;({ tools, stop } = await boot({ projects: [cfgA] }))
const doc2 = await call("crew_doctor", {})
const [head2, tail2] = doc2.split("К сведению:\n")
cell("crew_doctor with the old key: the rename note is below the problems, not among them, and is the only line about the keys", mine(head2).length === 0 && tail2 === "- ключ projects переименован в project_settings; прежнее имя работает", doc2)
cell("the old key: crew_config set works as before", /Записано/.test(await call("crew_config", { action: "set", values: { inflight_limit: 4 } })), "")
stop?.()

;({ tools, stop } = await boot({ project_settings: [cfgA], projects: [cfgB] }))
const doc3 = await call("crew_doctor", {})
cell("crew_doctor with both keys: a problem, one line, the differing entry", /есть проблемы/.test(doc3) && doc3.split("\n").filter((l) => /project_settings/.test(l) && /projects/.test(l)).length === 1 && doc3.includes("beta-settings"), doc3)
stop?.()

;({ tools, stop } = await boot({ projects: { oldp: oldRoot } }))
const doc4 = await call("crew_doctor", {})
cell("crew_doctor with the old form: the old advice with the new key name", /есть проблемы/.test(doc4) && doc4.includes('"project_settings": ["<папка с .opencode/crew-harness.json>"]'), doc4)
stop?.()

// the window text of /crew-doctor shows the notes below the verdict
const { doctorText } = await import("../status.ts")
const win = doctorText({ at: Date.now(), problems: [], notes: ["ключ projects переименован в project_settings; прежнее имя работает"] })
cell("/crew-doctor window: the green verdict and the note", /^Всё в порядке/.test(win) && /К сведению:\n- ключ projects переименован/.test(win), win)

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-project-settings-key.test: FAIL ${fail}` : "crew-project-settings-key.test ok")
process.exit(fail ? 1 : 0)

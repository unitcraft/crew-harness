// Self-test of project settings in a settings repository (node >= 24):  node test/peers-settings.test.mjs
// Plan 002, decision 12: the plugin options list settings folders; the file `.opencode/opencode-peers.json` in a
// folder names the project and its root (relative to the folder) and is read COMMITTED from the default branch
// (another branch: its "branch" field), never from the working copy. The old options form (name -> root) still
// works; machine-specific values come from the `local` option.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-settings-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.NOVA_PEERS_SETTINGS_TTL_MS = "1" // no cache between steps
const core = await import(process.env.PEERS_CORE ?? "../core.ts")
const { canon } = await import("../settings.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
const write = (file, obj) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, typeof obj === "string" ? obj : JSON.stringify(obj))
}

// a virtual project: tmp/nv with repositories inside; settings live in tmp/nv/nova-project (its own repository)
const nv = path.join(tmp, "nv")
const cfgRepo = path.join(nv, "nova-project")
const tab = path.join(nv, "nova-carina", "src")
mkdirSync(tab, { recursive: true })
mkdirSync(cfgRepo, { recursive: true })
git(cfgRepo, "init", "-q", "-b", "main")
const file = path.join(cfgRepo, ".opencode", "opencode-peers.json")
write(file, { project: "nova", root: "..", help_extra: "COMMITTED-LINE", spawn_limits: { worker: 2 }, task_fields: ["goal", "criteria", "boundaries"], worktrees: "worktrees", default_priority: "P1" })
git(cfgRepo, "add", "-A")
git(cfgRepo, "commit", "-q", "-m", "settings")
write(file, { project: "nova", root: "..", help_extra: "UNCOMMITTED-LINE" }) // a working-copy edit

const projects = core.parseProjects({ projects: [cfgRepo] })
core.setProjects(projects, {})
cell("the folder gives the project named in the file", projects.length === 1 && projects[0].name === "nova", JSON.stringify(projects))
cell("root is relative to the settings folder", projects[0].root === canon(nv).replace(/\\/g, "/").toLowerCase(), projects[0].root)
cell("a tab in a sibling repository belongs to the project", core.projectOf(tab, projects) === "nova", core.projectOf(tab, projects))
const help = core.helpFor(tab)
cell("the committed file is read", help.includes("COMMITTED-LINE"), help.slice(-200))
cell("the working copy is not read", !help.includes("UNCOMMITTED-LINE"), "uncommitted edit applied")
const cfg = core.loadConfig(tab)
cell("settings come through: spawn_limits, task_fields, priority", cfg.spawnLimits.worker === 2 && cfg.taskFields.join() === "goal,criteria,boundaries" && cfg.defaultPriority === "P1", JSON.stringify({ l: cfg.spawnLimits, f: cfg.taskFields, p: cfg.defaultPriority }))
cell("worktrees is resolved from the project root", cfg.worktrees === path.join(canon(nv), "worktrees"), cfg.worktrees)
cell("defaults where the file is silent", cfg.targetBranch === "main" && cfg.cleanup === "local+remote" && cfg.reviewer === "worker" && cfg.pushEmptyTurns === 3, JSON.stringify(cfg))

// after a commit the new value applies
git(cfgRepo, "add", "-A")
git(cfgRepo, "commit", "-q", "-m", "edit")
cell("a committed edit applies", core.helpFor(tab).includes("UNCOMMITTED-LINE"), "not applied")

// "branch": read from that branch instead
write(file, { project: "nova", root: "..", branch: "settings", help_extra: "MAIN-LINE" })
git(cfgRepo, "add", "-A")
git(cfgRepo, "commit", "-q", "-m", "point at a branch")
git(cfgRepo, "checkout", "-q", "-b", "settings")
write(file, { project: "nova", root: "..", branch: "settings", help_extra: "BRANCH-LINE" })
git(cfgRepo, "add", "-A")
git(cfgRepo, "commit", "-q", "-m", "branch value")
git(cfgRepo, "checkout", "-q", "main")
cell("the branch named in the file is read", core.helpFor(tab).includes("BRANCH-LINE"), core.helpFor(tab).slice(-120))

// local (machine-specific) override on top of the file
core.setProjects(projects, { nova: { spawn_models: { light: "kimi/k3" } } })
cell("the local option overrides the file", core.loadConfig(tab).spawnModels.light === "kimi/k3", JSON.stringify(core.loadConfig(tab).spawnModels))

// problems for peer_doctor
const plain = path.join(tmp, "not-a-repo")
mkdirSync(plain, { recursive: true })
const empty = path.join(tmp, "empty-repo")
mkdirSync(empty, { recursive: true })
git(empty, "init", "-q", "-b", "main")
write(path.join(empty, "x.txt"), "x")
git(empty, "add", "-A")
git(empty, "commit", "-q", "-m", "x")
const dup = path.join(tmp, "dup-repo")
mkdirSync(dup, { recursive: true })
git(dup, "init", "-q", "-b", "main")
write(path.join(dup, ".opencode", "opencode-peers.json"), { project: "nova" })
git(dup, "add", "-A")
git(dup, "commit", "-q", "-m", "dup")
const bad = core.parseProjects({ projects: [cfgRepo, plain, empty, dup] })
const problems = core.settingsProblems(bad)
cell("doctor: a folder outside git", problems.some((p) => p.includes("не внутри git")), JSON.stringify(problems))
cell("doctor: no settings file in the default branch", problems.some((p) => p.includes("нет .opencode/opencode-peers.json")), JSON.stringify(problems))
cell("doctor: two projects with one name", problems.some((p) => p.includes("два проекта с именем «nova»")), JSON.stringify(problems))

// the old options form still works (name -> root, settings walked up from the tab, working copy)
const old = core.parseProjects({ projects: { legacy: path.join(tmp, "old") } })
core.setProjects(old, {})
write(path.join(tmp, "old", ".opencode", "opencode-peers.json"), { help_extra: "OLD-FORM-LINE" })
mkdirSync(path.join(tmp, "old", "a"), { recursive: true })
cell("the old options form: project by root", core.projectOf(path.join(tmp, "old", "a"), old) === "legacy", core.projectOf(path.join(tmp, "old", "a"), old))
cell("the old options form: settings from the tab's tree", core.helpFor(path.join(tmp, "old", "a")).includes("OLD-FORM-LINE"), "missing")

// MCP reads the same options from the mailbox
core.saveProjects({ projects: [cfgRepo], local: { nova: { spawn_models: { heavy: "x/y" } } } })
const fromBox = core.loadProjects()
cell("MCP gets the same projects from the mailbox", fromBox.length === 1 && fromBox[0].name === "nova", JSON.stringify(fromBox))
cell("MCP gets the local option too", core.loadConfig(tab).spawnModels.heavy === "x/y", JSON.stringify(core.loadConfig(tab).spawnModels))

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-settings.test: FAIL ${fail}` : "peers-settings.test ok")
process.exit(fail ? 1 : 0)

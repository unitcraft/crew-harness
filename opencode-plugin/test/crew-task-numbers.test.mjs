// Self-test of one task number (task 058, node >= 24):  node test/crew-task-numbers.test.mjs
// In a project with task folders (tasks_dir, default doc/tasks) the number of a new task is 1 + the largest of the task
// records of the project and of the folder numbers NNN in every working tree of the repository and in every local and origin
// branch (AC-01); the number is taken by the atomic creation of the record file, so two processes taking a number at the same
// time get different numbers and both folders are made (AC-02, the script scripts/task-number.mjs of an agent outside
// OpenCode). A project without task folders counts its records from 1 as before (AC-09).
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.resolve(here, "..", "..", "scripts", "task-number.mjs")
const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-task-numbers-"))
process.env.XDG_DATA_HOME = tmp
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const tasks = await import("../tasks.ts")
let tn
try {
  tn = await import("../task-numbers.ts")
} catch (e) {
  tn = undefined
  cell("the module task-numbers.ts loads", false, String(e).slice(0, 200))
}

// a repository: folders 001…056 and 058 in main, 057 only in the branch "other"
const proj = path.join(tmp, "proj")
mkdirSync(proj, { recursive: true })
git(proj, "init", "-q", "-b", "main")
for (let i = 1; i <= 58; i++) {
  if (i === 57) continue
  const d = path.join(proj, "doc", "tasks", `${String(i).padStart(3, "0")}-t${i}`)
  mkdirSync(d, { recursive: true })
  writeFileSync(path.join(d, "log.md"), "x\n")
}
mkdirSync(path.join(proj, "doc", "tasks", "notes"), { recursive: true })
writeFileSync(path.join(proj, "doc", "tasks", "notes", "a.md"), "x\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")
git(proj, "branch", "other")
const other = path.join(tmp, "wt-other")
git(proj, "worktree", "add", "-q", other, "other")
mkdirSync(path.join(other, "doc", "tasks", "057-elsewhere"), { recursive: true })
writeFileSync(path.join(other, "doc", "tasks", "057-elsewhere", "log.md"), "x\n")
git(other, "add", "-A")
git(other, "commit", "-q", "-m", "057")
git(proj, "worktree", "remove", "--force", other) // 057 now lives only in the branch "other"

const mk = (project, directory, used) =>
  tasks.createTask({ project, title: "t", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: "sesI", author_role: `${project}.integrator`, qid: `q${Math.random()}`, status: "running", kind: "spawn", directory }, undefined, used ? { used } : undefined)

if (tn) {
  const used = tn.usedNumbers(proj)
  cell("folder numbers come from main and from the other branch (057), names without a number are skipped", used.includes(57) && used.includes(58) && used.includes(1) && used.every((n) => Number.isInteger(n)), JSON.stringify(used.slice(-5)))
  cell("the tasks folder is on in a repository whose target branch has doc/tasks", tn.tasksDirOn(proj, "doc/tasks", "main") === true, "")
  const a = mk("withdocs", proj, used)
  cell("AC-01: a new task after folders 001…056, 058 and 057 only in another branch gets 059", a.n === 59, String(a.n))
  // a folder only in a working tree (not committed) counts too
  const wt = path.join(tmp, "wt-60")
  git(proj, "worktree", "add", "-q", "-b", "w60", wt, "main")
  mkdirSync(path.join(wt, "doc", "tasks", "060-draft"), { recursive: true })
  cell("a folder written in a working tree and not committed counts (060)", tn.usedNumbers(proj).includes(60), JSON.stringify(tn.usedNumbers(proj).slice(-3)))
  // a folder only in a branch of origin counts too
  const origin = path.join(tmp, "origin.git")
  execFileSync("git", ["init", "-q", "--bare", origin])
  git(proj, "remote", "add", "origin", origin)
  git(proj, "push", "-q", "origin", "main:main")
  const oc = path.join(tmp, "oc")
  git(tmp, "clone", "-q", origin, oc)
  git(oc, "checkout", "-q", "-b", "far")
  mkdirSync(path.join(oc, "doc", "tasks", "061-remote"), { recursive: true })
  writeFileSync(path.join(oc, "doc", "tasks", "061-remote", "log.md"), "x\n")
  git(oc, "add", "-A")
  git(oc, "commit", "-q", "-m", "061")
  git(oc, "push", "-q", "origin", "far")
  git(proj, "fetch", "-q", "origin")
  cell("a folder only in a branch of origin counts (061)", tn.usedNumbers(proj).includes(61), JSON.stringify(tn.usedNumbers(proj).slice(-3)))
  // the setting tasks_dir: an empty string turns the folders off, a folder absent in the target branch too
  cell("tasks_dir \"\" turns the folders off", tn.tasksDirOn(proj, "", "main") === false, "")
  cell("a tasks folder absent in the target branch is off", tn.tasksDirOn(proj, "docs/work", "main") === false, "")
}
// a project without task folders counts from 1 as before (no folder numbers)
const plain = path.join(tmp, "plain")
mkdirSync(plain, { recursive: true })
const p1 = mk("plain", plain)
const p2 = mk("plain", plain)
cell("a project without task folders counts from 1 as before", p1.n === 1 && p2.n === 2, `${p1.n} ${p2.n}`)
cell("the temporary count of task 044 (docTaskNumbers) is gone", tasks.docTaskNumbers === undefined, typeof tasks.docTaskNumbers)

// AC-02: two processes take a number at once — different numbers, both folders made (the script of an agent outside OpenCode)
const tree2 = path.join(tmp, "wt-race")
git(proj, "worktree", "add", "-q", "-b", "race", tree2, "main")
const run = (title) =>
  new Promise((res) => {
    const p = spawn(process.execPath, [script, "--dir", tree2, "--project", "race", "--title", title], { env: { ...process.env, XDG_DATA_HOME: tmp }, windowsHide: true })
    let out = ""
    let err = ""
    p.stdout.on("data", (d) => (out += d))
    p.stderr.on("data", (d) => (err += d))
    p.on("close", (code) => res({ code, out, err }))
    p.on("error", (e) => res({ code: -1, out, err: String(e) }))
  })
const [r1, r2] = await Promise.all([run("Первая гонка"), run("Вторая гонка")])
const j = (r) => {
  try {
    return JSON.parse(r.out.trim().split(/\r?\n/).at(-1))
  } catch {
    return undefined
  }
}
const a1 = j(r1)
const a2 = j(r2)
cell("AC-02: both processes answer with a number and a folder", !!a1?.n && !!a2?.n && r1.code === 0 && r2.code === 0, JSON.stringify({ r1: r1.out + r1.err, r2: r2.out + r2.err }).slice(0, 400))
cell("AC-02: the numbers differ", !!a1 && !!a2 && a1.n !== a2.n, JSON.stringify([a1?.n, a2?.n]))
cell("AC-02: both folders are made in the named tree with task/message.md and log.md", !!a1 && !!a2 && [a1, a2].every((a) => existsSync(path.join(tree2, a.folder, "task", "message.md")) && existsSync(path.join(tree2, a.folder, "log.md"))), JSON.stringify([a1?.folder, a2?.folder]))
cell("AC-02: the numbers are taken by records of the plugin's store", !!a1 && !!a2 && !!tasks.loadTask("race", a1.n) && !!tasks.loadTask("race", a2.n), "")
cell("AC-02: the number goes after the folders of the repository (062 and up)", !!a1 && !!a2 && Math.min(a1.n, a2.n) >= 62, JSON.stringify([a1?.n, a2?.n]))
if (a1) {
  const log = readFileSync(path.join(tree2, a1.folder, "log.md"), "utf8")
  cell("the first line of log.md is a dated document entry", /^\d{4}-\d\d-\d\d \d\d:\d\d документ: задание заведено/.test(log) && log.trim().split("\n").length === 1, log)
}

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-task-numbers.test: FAIL ${fail}` : "crew-task-numbers.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the task numbers next to the doc/tasks folders (node >= 24):  node test/crew-task-numbers.test.mjs
// Temporary (owner, 2026-10-15): a new Crew task number does not repeat a number of a folder doc/tasks/NNN-<slug>/ of the
// project: the count goes after the largest of both. A project without doc/tasks counts as before.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-task-numbers-"))
process.env.XDG_DATA_HOME = tmp
const tasks = await import("../tasks.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const withDocs = path.join(tmp, "withdocs")
for (const f of ["001-first", "022-worktree-base-origin", "031-runner-regulation", "042-nudge-matrix", "notes"]) mkdirSync(path.join(withDocs, "doc", "tasks", f), { recursive: true })
const plain = path.join(tmp, "plain")
mkdirSync(plain, { recursive: true })
const mk = (project, directory) =>
  tasks.createTask({ project, title: "t", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: "sesI", author_role: `${project}.integrator`, qid: `q${Math.random()}`, status: "running", kind: "spawn", directory })

cell("docTaskNumbers reads the three-digit folders and skips other names", JSON.stringify(tasks.docTaskNumbers(withDocs).sort((a, b) => a - b)) === "[1,22,31,42]", JSON.stringify(tasks.docTaskNumbers(withDocs)))
cell("docTaskNumbers of a project without doc/tasks is empty", tasks.docTaskNumbers(plain).length === 0 && tasks.docTaskNumbers(undefined).length === 0, "")
const a = mk("withdocs", withDocs)
cell("the first task of a project with doc/tasks goes after the largest folder number", a.n === 43, String(a.n))
const b = mk("withdocs", withDocs)
cell("the next task goes after it", b.n === 44, String(b.n))
mkdirSync(path.join(withDocs, "doc", "tasks", "050-later"), { recursive: true })
const c = mk("withdocs", withDocs)
cell("a later folder with a larger number moves the count past it", c.n === 51, String(c.n))
const p1 = mk("plain", plain)
const p2 = mk("plain", plain)
cell("a project without doc/tasks counts from 1 as before", p1.n === 1 && p2.n === 2, `${p1.n} ${p2.n}`)

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-task-numbers.test: FAIL ${fail}` : "crew-task-numbers.test ok")
process.exit(fail ? 1 : 0)

// Self-test: the window closes the tabs of closed tasks (node >= 24):  node test/crew-autoclose.test.mjs
// A task or review session whose task was accepted (cleaned) or cancelled more than AUTOCLOSE_MS ago is closed, unless
// its tab is on screen; the owner's own tabs (no spawned session) and tasks still open are never closed.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-autoclose-"))
process.env.XDG_DATA_HOME = tmp
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const old = Date.now() - 10 * 60_000
const mk = async (n, status, updated) => {
  const t = tasks.createTask({ project: "proj", title: `t${n}`, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "m", author: "sesI", author_role: "proj.integrator", qid: `q${n}`, status, kind: "spawn", directory: tmp })
  t.status = status
  tasks.saveTask(t)
  const f = path.join(tasks.TASKS, "proj", `${n}.json`)
  const j = JSON.parse((await import("node:fs")).readFileSync(f, "utf8"))
  j.updated = updated
  ;(await import("node:fs")).writeFileSync(f, JSON.stringify(j))
}
await mk(1, "cleaned", old)
await mk(2, "cleaned", old)
await mk(3, "running", old)
await mk(4, "cleaned", Date.now())
await mk(5, "cancelled", old)
const card = (session, extra) => core.saveCard({ session, role: "worker", auto: false, title: session, directory: tmp, repo: "r", project: "proj", pid: 1, updated: Date.now(), ...extra })
const spawned = { by: "sesI", task: "x", tier: "light", status: "closed", at: old, qid: "q" }
card("sesDONE", { spawned, task: { project: "proj", n: 1 } })
card("sesSHOWN", { spawned, task: { project: "proj", n: 2 } })
card("sesRUN", { spawned: { ...spawned, status: "running" }, task: { project: "proj", n: 3 } })
card("sesFRESH", { spawned, task: { project: "proj", n: 4 } })
card("sesREV", { spawned, review: { project: "proj", n: 5 } })
card("sesOWNER", { task: { project: "proj", n: 1 } }) // the owner's tab took task #1 by assign: never closed

const tabs = ["sesDONE", "sesSHOWN", "sesRUN", "sesFRESH", "sesREV", "sesOWNER"].map((sessionID) => ({ sessionID, active: sessionID === "sesSHOWN" }))
const closed = []
const api = {
  ui: {
    router: { current: () => ({ type: "session", sessionID: "sesSHOWN" }) },
    tabs: { list: () => tabs, close: (id) => (closed.push(id), true) },
    toast: { show: () => {} },
    dialog: { alert: () => {} },
    slot: () => {},
  },
  keymap: { layer: () => {} },
}
const mod = await import("../tui.ts")
const stop = mod.default.setup(api)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
cell("an accepted task's tab not on screen is closed", closed.includes("sesDONE"), JSON.stringify(closed))
cell("a cancelled task's review tab is closed", closed.includes("sesREV"), JSON.stringify(closed))
cell("the tab on screen is not closed", !closed.includes("sesSHOWN"), JSON.stringify(closed))
cell("a running task's tab is not closed", !closed.includes("sesRUN"), JSON.stringify(closed))
cell("a task closed a moment ago is not closed yet", !closed.includes("sesFRESH"), JSON.stringify(closed))
cell("the owner's tab is never closed", !closed.includes("sesOWNER"), JSON.stringify(closed))
stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-autoclose.test: FAIL ${fail}` : "crew-autoclose.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the sidebar lines (plan 010; node >= 24):  node test/peers-sidebar.test.mjs
// The window's "Peers" block: the project of the tab on screen, the ones waiting for the owner first and marked,
// task sessions named by role, at most 9 rows and a foot with the rest. The drawing itself (sidebar.tsx) needs
// OpenCode's runtime; here: the lines, and that the window plugin still loads when the block cannot be drawn.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-sidebar-"))
process.env.XDG_DATA_HOME = tmp
const { sidebarLines } = await import("../status.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const now = Date.now()
const st = (session, state, extra = {}) => ({ session, project: "nova", role: "worker", title: session, state, detail: "", watches: [], asked: [], tasks: [], updated: now, ...extra })
const list = [
  st("w1", "working", { since: now - 12 * 60_000, task: { n: 2, status: "running", as: "executor", title: "x" } }),
  st("i1", "owner", { role: "integrator", since: new Date(2026, 9, 6, 1, 42).getTime() }),
  st("r1", "watch", { task: { n: 2, status: "reviewing", as: "reviewer", title: "x" }, watches: [{ id: "a", note: "CI кандидата #2", minutes: 60 }] }),
  st("r3", "task", { task: { n: 3, status: "rework", as: "reviewer", title: "x" } }),
  st("o1", "working", { project: "other" }),
  ...Array.from({ length: 10 }, (_, i) => st(`idle${i}`, "idle")),
]
const v = sidebarLines(list, now, "nova")
cell("the title names the project and how many wait for the owner", v.title === "Peers · nova — ждут вас: 1", v.title)
cell("the one waiting for the owner is first and marked", v.rows[0].who === "интегратор" && v.rows[0].mark === "▶" && v.rows[0].what === "ждёт вас 01:42" && v.rows[0].tone === "accent", JSON.stringify(v.rows[0]))
cell("a task session is named by its role", v.rows.some((r) => r.who === "#2 исполнитель" && r.what === "работает 12 мин") && v.rows.some((r) => r.who === "#2 приёмщик" && r.what === "ждёт: CI кандидата #2"), JSON.stringify(v.rows))
cell("a task state is shown with its mark and word", v.rows.some((r) => r.who === "#3 приёмщик" && r.what === "↻ доработка"), JSON.stringify(v.rows))
cell("another project's sessions are not shown", !v.rows.some((r) => r.who === "worker" && r.what.startsWith("работает")), JSON.stringify(v.rows))
cell("at most 9 rows, the rest in the foot", v.rows.length === 9 && /и ещё 5 · \/peers/.test(v.foot) && /работают 1/.test(v.foot), JSON.stringify({ n: v.rows.length, foot: v.foot }))

// the window plugin loads under Node, where sidebar.tsx cannot be compiled: the import fails quietly
const mod = await import("../tui.ts")
let slots = 0
const stop = mod.default.setup({ ui: { router: { current: () => ({}) }, tabs: { list: () => [] }, toast: { show: () => {} }, dialog: { alert: () => {} }, slot: () => slots++ }, keymap: { layer: () => {} } })
await new Promise((r) => setTimeout(r, 300))
cell("the window plugin works when the sidebar cannot be drawn", typeof stop === "function", typeof stop)
stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `peers-sidebar.test: FAIL ${fail}` : "peers-sidebar.test ok")
process.exit(fail ? 1 : 0)

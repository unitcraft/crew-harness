// Self-test of the sidebar lines (plan 003.2; node >= 24):  node test/crew-sidebar.test.mjs
// The window's "Crew" block: the project of the tab on screen, the ones waiting for the owner first and marked,
// task sessions named by role, at most 9 rows and a foot with the rest. The drawing itself (sidebar.tsx) needs
// OpenCode's runtime; here: the lines, and that the window plugin still loads when the block cannot be drawn.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-sidebar-"))
process.env.XDG_DATA_HOME = tmp
const { sidebarLines, formatStatuses, sideText, doctorText } = await import("../status.ts")
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
cell("the title names the project and how many wait for the owner", v.title === "Crew · nova — ждут вас: 1", v.title)
cell("the one waiting for the owner is first and marked", v.rows[0].who === "интегр." && v.rows[0].mark === "▶" && v.rows[0].what === "ждёт вас 01:42" && v.rows[0].tone === "accent", JSON.stringify(v.rows[0]))
cell("a task session is named by its role", v.rows.some((r) => r.who === "#2 исп" && r.what === "работает 12 мин") && v.rows.some((r) => r.who === "#2 прм" && r.what.startsWith("⧗ очередь: CI")), JSON.stringify(v.rows))
cell("a task state is shown with its mark and word", v.rows.some((r) => r.who === "#3 прм" && r.what === "↻ доработка"), JSON.stringify(v.rows))
cell("rows fit the narrow panel (32 columns) without wrapping", v.rows.every((r) => 2 + 9 + 1 + r.what.length <= 32), JSON.stringify(v.rows.map((r) => r.what)))
{
  // acceptance in progress: "проверка 2/3: guards" on the reviewer's row, the step's text under it
  const steps = [{ id: "tests", text: "тесты", result: "12/12" }, { id: "guards", text: "стражи зелёные: `NOVA_GATE_TIER=loop bash scripts/gate.sh` на всех платформах" }, { id: "notes", text: "заметки" }]
  const r = { session: "sR", project: "proj", role: "worker", title: "#5", state: "working", since: Date.now() - 60_000, detail: "", watches: [], asked: [], tasks: [], updated: Date.now(), task: { n: 5, status: "reviewing", as: "reviewer", title: "t", steps, checking: "guards" } }
  const sv = sidebarLines([r], Date.now(), "proj")
  cell("printed rows, the step's sub-row included, fit the panel without wrapping", sv.rows.every((x) => sideText(x).length <= 32 && !sideText(x).endsWith(" ")) && sideText(sv.rows[1]).startsWith("    ↳ "), JSON.stringify(sv.rows.map(sideText)))
  cell("the reviewer's row shows the step in progress", sv.rows[0].what === "проверка 2/3: guards" && sv.rows[1]?.what.startsWith("↳ стражи"), JSON.stringify(sv.rows))
  const text = formatStatuses([r], Date.now(), "proj")
  cell("/crew shows the steps on one line and the step in progress", /шаги 1\/3 ✓▶·/.test(text) && /▶ guards: стражи/.test(text) && !/notes/.test(text), text)
  cell("/crew lines fit the dialog without wrapping", text.split("\n").every((l) => l.length <= 72), text)
}
cell("another project's sessions are not shown", !v.rows.some((r) => r.who === "worker" && r.what.startsWith("работает")), JSON.stringify(v.rows))
cell("at most 9 rows, the rest in the foot", v.rows.length === 9 && /\+5 · \/crew/.test(v.foot) && /ход 1 · ждут 1 \(очередь 1\)/.test(v.foot),JSON.stringify({ n: v.rows.length, foot: v.foot }))

// the window plugin loads under Node, where sidebar.tsx cannot be compiled: the import fails quietly
const mod = await import("../tui.ts")
let slots = 0
const stop = mod.default.setup({ ui: { router: { current: () => ({}) }, tabs: { list: () => [] }, toast: { show: () => {} }, dialog: { alert: () => {} }, slot: () => slots++ }, keymap: { layer: () => {} } })
await new Promise((r) => setTimeout(r, 300))
cell("the window plugin works when the sidebar cannot be drawn", typeof stop === "function", typeof stop)
stop?.()

// /crew-doctor: the window shows the service's last self-check (the window cannot call crew_doctor)
let cmds = []
let shown
const stop2 = mod.default.setup({ ui: { router: { current: () => ({}) }, tabs: { list: () => [] }, toast: { show: () => {} }, dialog: { alert: (a) => (shown = a) }, slot: (s) => s.render?.() }, keymap: { layer: (f) => (cmds = f().commands) } })
cell("the window has /crew, /crew-config, /plans, /crew-doctor", JSON.stringify(cmds.map((c) => c.slash?.name)) === JSON.stringify(["crew", "crew-config", "plans", "crew-doctor"]), JSON.stringify(cmds.map((c) => c.slash?.name)))
cmds.find((c) => c.slash?.name === "crew-doctor")?.run()
cell("/crew-doctor opens a dialog", /самопроверка/.test(shown?.title ?? ""), JSON.stringify(shown))
stop2?.()
const t0 = Date.parse("2026-10-07T03:00:00")
cell("doctor: none yet", /ещё не было/.test(doctorText(undefined)), doctorText(undefined))
cell("doctor: ok with its time", /Всё в порядке/.test(doctorText({ at: t0, problems: [] }, t0 + 5 * 60_000)) && /5 мин назад/.test(doctorText({ at: t0, problems: [] }, t0 + 5 * 60_000)), doctorText({ at: t0, problems: [] }, t0 + 5 * 60_000))
cell("doctor: problems listed", /Есть проблемы:\n- ящик не пишется/.test(doctorText({ at: t0, problems: ["ящик не пишется"] }, t0)), doctorText({ at: t0, problems: ["ящик не пишется"] }, t0))
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-sidebar.test: FAIL ${fail}` : "crew-sidebar.test ok")
process.exit(fail ? 1 : 0)

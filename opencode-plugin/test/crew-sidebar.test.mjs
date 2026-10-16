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
cell("the title names the project", v.title === "Crew · nova", v.title)
// task 040: the summary "Ждут вас: N · с ЧЧ:ММ" (all projects) opens the rows; task 055: the tab that waits longest on its own
// line (project and tab, never cut), its question under it; a wait without a question text has no third line
cell("the summary line is first", v.rows[0].what === "Ждут вас: 1 · с 01:42" && v.rows[0].tone === "accent" && !v.rows[0].who, JSON.stringify(v.rows[0]))
cell("who waits: the project and the tab on the second line", sideText(v.rows[1]) === "? nova интегр." && v.rows[1].tone === "accent", JSON.stringify(v.rows[1]))
cell("the one waiting for the owner is next and marked", v.rows[2].who === "интегр." && v.rows[2].mark === "?" && v.rows[2].what === "ждёт вас 01:42" && v.rows[2].tone === "accent", JSON.stringify(v.rows[2]))
cell("a task session is named by its role", v.rows.some((r) => r.who === "#2 исп" && r.what === "работает 12 мин") && v.rows.some((r) => r.who === "#2 прм" && r.what.startsWith("⧗ очередь: CI")), JSON.stringify(v.rows))
cell("a task state is shown with its mark and word (a reviewer waits for the rework, task 064)", v.rows.some((r) => r.who === "#3 прм" && r.what === "↻ ждёт доработки"), JSON.stringify(v.rows))
cell("rows fit the narrow panel (32 columns) without wrapping", v.rows.every((r) => sideText(r).length <= 32), JSON.stringify(v.rows.map((r) => r.what)))
{
  // acceptance in progress: "проверка 2/3: guards" on the reviewer's row, the step's text under it
  const steps = [{ id: "tests", text: "тесты", result: "12/12" }, { id: "guards", text: "стражи зелёные: `NOVA_GATE_TIER=loop bash scripts/gate.sh` на всех платформах" }, { id: "notes", text: "заметки" }]
  const r = { session: "sR", project: "proj", role: "worker", title: "#5", state: "working", since: Date.now() - 60_000, detail: "", watches: [], asked: [], tasks: [], updated: Date.now(), task: { n: 5, status: "reviewing", as: "reviewer", title: "t", steps, checking: "guards" } }
  const sv = sidebarLines([r], Date.now(), "proj")
  // task 064: the title first, the step with its short name wrapped under the role
  const k = sv.rows.findIndex((x) => x.who === "#5 прм")
  cell("printed rows, the step's second row included, fit the panel without wrapping", k > 0 && sv.rows.every((x) => sideText(x).length <= 32 && !sideText(x).endsWith(" ") && !sideText(x).startsWith(" ")) && sideText(sv.rows[k + 1]) === "↳ стражи зелёные", JSON.stringify(sv.rows.map(sideText)))
  cell("the reviewer's row shows the step in progress", sv.rows[k]?.what.startsWith("проверка 2/3: guards") && sideText(sv.rows[k + 1]) === "↳ стражи зелёные", JSON.stringify(sv.rows))
  const text = formatStatuses([r], Date.now(), "proj")
  cell("/crew shows the steps on one line and the step in progress", /шаги 1\/3 ✓▶·/.test(text) && /▶ guards: стражи/.test(text) && !/notes/.test(text), text)
  cell("/crew lines fit the dialog without wrapping", text.split("\n").every((l) => l.length <= 72), text)
}
{
  // a reviewer waiting on a watch does not hide the wait behind its steps: the wait first with its minutes, the steps under it
  const steps = Array.from({ length: 12 }, (_, i) => ({ id: "s" + i, text: "шаг " + i, ...(i < 10 ? { result: "ok" } : {}) }))
  const w = { session: "sW", project: "proj", role: "worker", title: "#22", state: "watch", since: Date.now() - 40 * 60_000, detail: "", watches: [{ id: "w", note: "когда сдвинется main", started: Date.now() - 40 * 60_000, minutes: 90 }], asked: [], tasks: [], updated: Date.now(), task: { n: 22, status: "reviewing", as: "reviewer", title: "t", steps } }
  const sv = sidebarLines([w], Date.now(), "proj")
  const k = sv.rows.findIndex((x) => x.who === "#22 прм")
  cell("a waiting reviewer shows the wait with minutes, not the steps", sv.rows[k]?.what.startsWith("⧗ ") && /40м$/.test(sv.rows[k].what) && sideText(sv.rows[k]).length <= 32, JSON.stringify(sv.rows))
  cell("the steps go on a muted row under the wait", sv.rows[k + 1]?.what === "↳ шаги 10/12" && sv.rows[k + 1].tone === "muted", JSON.stringify(sv.rows))
  cell("the printed rows of a waiting reviewer fit the panel", sv.rows.every((x) => sideText(x).length <= 32), JSON.stringify(sv.rows.map(sideText)))
  const idle = { ...w, state: "task", watches: [], since: undefined }
  const iv = sidebarLines([idle], Date.now(), "proj")
  cell("a reviewer that waits for nothing still shows its steps", iv.rows.length === 2 && sideText(iv.rows[0]) === "#22 t" && iv.rows[1].what === "шаги 10/12", JSON.stringify(iv.rows))
}
{
  // task 055: the owner saw "Ждут вас: 1 · с 18:55 · clau" - the project and the tab were cut off by the panel width
  const since = new Date(2026, 9, 15, 18, 55).getTime()
  const q = "Продолжать #31 или переключиться на #33? Рекомендую переключиться: #33 срочнее, #31 подождёт до вечера."
  const w = st("sQ", "owner", { project: "claude-limits", title: "#33 исп ⧗ лимиты", since, question: q, task: { n: 33, status: "running", as: "executor", title: "лимиты" } })
  const sv = sidebarLines([w, st("x1", "working", { project: "claude-limits" })], since + 60_000, "claude-limits")
  const printed = sv.rows.map((r) => sideText(r))
  cell("055: three lines - how many and since when", printed[0] === "Ждут вас: 1 · с 18:55", JSON.stringify(printed))
  cell("055: the second line names the project, the task and the role in full", printed[1] === "? claude-limits #33 исп", JSON.stringify(printed))
  cell("055: the third line is the start of the question, cut to the panel", printed[2].startsWith("↳ Продолжать #31") && printed[2].endsWith("…") && printed[2].length === 32 && sv.rows[2].tone === "muted", JSON.stringify(printed))
  cell("055: every printed line fits the panel", printed.every((l) => l.length <= 32), JSON.stringify(printed))
  // a narrower panel: the project and the tab stay whole, only the question is cut
  const nv = sidebarLines([w], since + 60_000, "claude-limits", 24)
  const np = nv.rows.map((r) => sideText(r, 24))
  cell("055: a narrower panel keeps the project and the tab", np[1] === "? claude-limits #33 исп" && np[2].startsWith("↳ Продолжать") && np[2].endsWith("…") && np.every((l) => l.length <= 24), JSON.stringify(np))
  // a wait with no question text: no third line
  const nq = sidebarLines([{ ...w, question: undefined }], since + 60_000, "claude-limits")
  cell("055: no question text - no question line", sideText(nq.rows[1]) === "? claude-limits #33 исп" && sideText(nq.rows[2]) === "? #33 лимиты" && nq.rows[3].who === "#33 исп", JSON.stringify(nq.rows.map((r) => sideText(r))))
  // the oldest wait is named, from another project too
  const older = st("sO", "owner", { project: "nova", role: "integrator", since: since - 30 * 60_000, question: "Вливать?" })
  const ov = sidebarLines([w, older], since + 60_000, "claude-limits").rows.map((r) => sideText(r))
  cell("055: the oldest wait of all projects is named", ov[0] === "Ждут вас: 2 · с 18:25" && ov[1] === "? nova интегр." && ov[2] === "↳ Вливать?", JSON.stringify(ov))
}
{
  // task 055, the owner (2026-10-15): "? — ждёт вас; ▶ — задал вопрос текстом, ждёт ответа интегратора (или вашего)"
  const t = Date.now()
  const marks = [st("mO", "owner", { since: t, question: "Вливать?", detail: "ждёт вас с 10:00: Вливать?" }), st("mQ", "question", { since: t, title: "#7 исп x", task: { n: 7, status: "running", as: "executor", title: "x" }, detail: "ждёт ответа (интегратора или вас) с 10:00: Базу опустить?" }), st("mW", "working", { since: t })]
  const mv = sidebarLines(marks, t, "nova")
  const rowOf = (who) => mv.rows.find((r) => r.who === who)
  cell("055: marks - ? waits for you, ▶ asked in text, • works", rowOf("worker")?.mark === "?" && rowOf("#7 исп")?.mark === "▶" && mv.rows.some((r) => r.mark === "•"), JSON.stringify(mv.rows))
  cell("055: the summary's second line is marked ?", sideText(mv.rows[1]).startsWith("? nova "), JSON.stringify(mv.rows.map((r) => sideText(r))))
  const ct = formatStatuses(marks, t, "nova").split("\n")
  cell("055: /crew marks the same way", ct.some((l) => l.startsWith("  ? worker")) && ct.some((l) => l === "  ▶ #7 x"), ct.join("\n"))
}
{
  // task 056: a turn that ended with a waiting phrase - "ждёт указаний" and the phrase under it, a mark not like a question;
  // a turn that ended with "?" - "вопрос — ждёт ответа" and the question under it
  const t = Date.now()
  const phrase = "Сообщил интегратору, что жду дальнейших указаний."
  const wq = st("w22", "question", { since: t, wait: true, question: phrase, title: "#22 прм x", task: { n: 22, status: "reviewing", as: "reviewer", title: "x" }, detail: `ждёт указаний интегратора с 10:00: ${phrase}` })
  const qq = st("q7", "question", { since: t, question: "Базу опустить?", title: "#7 исп x", task: { n: 7, status: "running", as: "executor", title: "x" }, detail: "ждёт ответа (интегратора или вас) с 10:00: Базу опустить?" })
  const sv = sidebarLines([wq, qq], t, "nova")
  const at = (who) => sv.rows.findIndex((r) => r.who === who)
  const w = sv.rows[at("#22 прм")]
  cell("056: a waiting tab says 'ждёт указаний', no question", w?.what === "ждёт указаний" && !sv.rows.some((r) => r.who === "#22 прм" && /вопрос/.test(r.what)), JSON.stringify(sv.rows))
  cell("056: its mark is neither ? nor ▶", !!w && w.mark !== "?" && w.mark !== "▶" && w.mark.trim().length === 1, JSON.stringify(w))
  cell("056: the phrase is under the waiting tab", sv.rows[at("#22 прм") + 1]?.what.startsWith("↳ Сообщил интегратору") && sv.rows[at("#22 прм") + 1].tone === "muted", JSON.stringify(sv.rows))
  cell("056: a question keeps its label and mark, the question under it", sv.rows[at("#7 исп")]?.what === "вопрос — ждёт ответа" && sv.rows[at("#7 исп")].mark === "▶" && sv.rows[at("#7 исп") + 1]?.what === "↳ Базу опустить?", JSON.stringify(sv.rows))
  cell("056: the rows fit the panel", sv.rows.every((r) => sideText(r).length <= 32), JSON.stringify(sv.rows.map((r) => sideText(r))))
  const ct = formatStatuses([wq, qq], t, "nova").split("\n")
  const c22 = ct.indexOf(`  ${w?.mark} #22 x`)
  cell("056: /crew marks the waiting tab like the panel, without 'вопрос'", c22 > 0 && /^      прм — ждёт указаний/.test(ct[c22 + 1]) && !/вопрос/.test(ct[c22 + 1]), ct.join("\n"))
  // a tab of the owner (not spawned) waiting with a phrase: waits for you, the summary marks it as a wait, the phrase under it
  const ow = st("o56", "owner", { project: "nova", role: "integrator", since: t, wait: true, question: "Жду вашего решения по плану.", detail: "ждёт вас с 10:00: Жду вашего решения по плану." })
  const ov = sidebarLines([ow], t, "nova")
  cell("056: the summary of an owner's waiting tab is not marked ?", sideText(ov.rows[1]) === `${w?.mark} nova интегр.` && sideText(ov.rows[2]).startsWith("↳ Жду вашего"), JSON.stringify(ov.rows.map((r) => sideText(r))))
  cell("056: its row is marked as a wait", ov.rows.find((r) => r.who === "интегр.")?.mark === w?.mark, JSON.stringify(ov.rows))
}
cell("a task row has its title on the row above it, so the number says what the task is (task 064)", v.rows.some((x, i) => x.who === "#2 исп" && sideText(v.rows[i - 1]) === "• #2 x"), JSON.stringify(v.rows))
cell("another project's sessions are not shown", !v.rows.some((r) => r.who === "worker" && r.what.startsWith("работает")), JSON.stringify(v.rows))
cell("at most 9 rows, the rest in the foot", v.rows.filter((x) => x.who).length === 9 && /\+5 · \/crew/.test(v.foot) && /ход 1 · ждут 1 \(очередь 1\)/.test(v.foot),JSON.stringify({ n: v.rows.length, foot: v.foot }))

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
cell("the window has /crew, /crew-config, /plans, /crew-doctor, /crew-progress, /crew-help, /crew-sets, /crew-profiles", JSON.stringify(cmds.map((c) => c.slash?.name)) === JSON.stringify(["crew", "ask", "crew-config", "plans", "crew-doctor", "crew-progress", "crew-help", "crew-sets", "crew-profiles"]), JSON.stringify(cmds.map((c) => c.slash?.name)))
cmds.find((c) => c.slash?.name === "crew-doctor")?.run()
cell("/crew-doctor opens a dialog", /самопроверка/.test(shown?.title ?? ""), JSON.stringify(shown))
cmds.find((c) => c.slash?.name === "ask")?.run()
cell("/ask opens a dialog with the open questions (task 040)", /ждущие вас/.test(shown?.title ?? "") && /Открытых вопросов к вам нет|Ждут вас/.test(shown?.message ?? ""), JSON.stringify(shown))
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

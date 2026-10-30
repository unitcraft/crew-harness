// Self-test of the task grouping and the visible status in the sidebar (task 262; node >= 24):  node test/crew-sidebar-groups.test.mjs
// The owner (2026-10-30): "ДА, супер быстро" on the recommendation "начать с группировки и явного статуса у названия". The "Crew"
// panel groups the tasks of the project: "В работе · N" (a tab of the task is working), "На приёмке · N" (submitted/reviewing),
// "Пауза · N" (the rest), and "HOLD/STOP · N" (the hold mark of the step watcher, idle-watch.ts) — one compact row per task, its
// tabs hidden. The heading of a task carries an explicit status, a mark and a word ("• 077 в работе · …", "✓ 091 на приёмке · …",
// "▶ 033 нужен ответ · …", "‖ 022 пауза · …"), never the colour alone. A HOLD task is never shown as working, even if a stale
// status card still says working; a task without a running turn is not called "в работе". The order is deterministic: inside a
// section the tasks that need an answer come first, then by the task number; the counters count the groups actually shown.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-sidebar-groups-"))
process.env.XDG_DATA_HOME = tmp
const { sidebarLines, sideText, SIDE_WIDTH } = await import("../status.ts")
const { WATCH_DIR } = await import("../idle-watch.ts")
const { TASKS } = await import("../tasks.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const now = new Date(2026, 9, 30, 12, 0).getTime()
const st = (session, state, extra = {}) => ({ session, project: "nova", role: "worker", title: session, state, detail: "", watches: [], asked: [], tasks: [], updated: now, ...extra })
// fixture files: the tasks and the hold marks of the step watcher (the real layout of the mailbox)
const putTask = (n, status, title) => {
  const dir = path.join(TASKS, "nova")
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${n}.json`), JSON.stringify({ project: "nova", n, title, status, slug: "t", goal: "", priority: "P2", tier: "medium", role: "worker", author: "a", author_role: "integrator", qid: "q", kind: "spawn", executors: [], attempt: 1, directory: ".", history: [], created: now, updated: now }))
}
const putHold = (n, kind) => {
  const dir = path.join(WATCH_DIR, "nova")
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${n}.json`), JSON.stringify({ project: "nova", n, hold: { kind, who: "владелец, 2026-10-29", at: now - 60_000 } }))
}
putTask(146, "running", "Старое дерево")
putTask(147, "rework", "Перенос архива")
putTask(148, "done", "Закрытая")
putHold(146, "HOLD")
putHold(147, "STOP")
putHold(148, "HOLD") // the task is closed: the mark is not shown

const list = [
  st("e77", "working", { since: now - 12 * 60_000, task: { n: 77, status: "running", as: "executor", title: "Починить сборку" } }),
  st("q33", "question", { since: now - 10 * 60_000, question: "Базу опустить?", task: { n: 33, status: "running", as: "executor", title: "Выпустить seed" } }),
  st("r91", "task", { task: { n: 91, status: "reviewing", as: "reviewer", title: "Проверить контракты" } }),
  st("p22", "task", { task: { n: 22, status: "running", as: "executor", title: "Отчёт по воротам" } }),
  st("w55", "watch", { since: now - 60_000, watches: [{ id: "w", note: "гейт", started: now - 60_000, minutes: 60 }], task: { n: 55, status: "running", as: "executor", title: "Ждать гейта" } }),
  // a stale card: the tab says "working", but the task is under HOLD by the owner's word — never "в работе"
  st("s146", "working", { since: now - 3 * 60_000, task: { n: 146, status: "running", as: "executor", title: "Старое дерево" } }),
]
const v = sidebarLines(list, now, "nova")
const printed = v.rows.map((r) => sideText(r))
const tone = (text) => v.rows.find((r) => sideText(r) === text)?.tone
if (process.env.SHOW) console.log(v.rows.map((r) => `${r.tone[0]} ${sideText(r)}`).join("\n"))

cell("the sections and their order: working, acceptance, pause, HOLD/STOP", JSON.stringify(printed) === JSON.stringify([
  "В работе · 1",
  "• 077 в работе · Починить сборку",
  "↳ исп  работает 12 мин",
  "На приёмке · 1",
  "✓ 091 на приёмке · Проверить",
  "· контракты",
  "↳ прм  ✓◐ приёмка",
  "Пауза · 3",
  "▶ 033 нужен ответ · Выпустить",
  "· seed",
  "↳ исп  вопрос — ждёт ответа",
  "↳ Базу опустить?",
  "‖ 022 пауза · Отчёт по воротам",
  "↳ исп  стоит",
  "‖ 055 пауза · Ждать гейта",
  "↳ исп  ⧗ гейт 1м",
  "HOLD/STOP · 2",
  "■ 146 HOLD · Старое дерево",
  "■ 147 STOP · Перенос архива",
]), JSON.stringify(printed, null, 1))
cell("the section headers are base, the HOLD/STOP block is muted", tone("В работе · 1") === "base" && tone("На приёмке · 1") === "base" && tone("Пауза · 3") === "base" && tone("HOLD/STOP · 2") === "muted", JSON.stringify([tone("В работе · 1"), tone("HOLD/STOP · 2")]))
cell("the heading of a task that needs an answer is accent, the quiet ones are base", tone("▶ 033 нужен ответ · Выпустить") === "accent" && tone("• 077 в работе · Починить сборку") === "base" && tone("✓ 091 на приёмке · Проверить") === "base" && tone("‖ 022 пауза · Отчёт по воротам") === "base", "")
cell("inside «Пауза»: the task that needs an answer first, then by number", printed.indexOf("▶ 033 нужен ответ · Выпустить") < printed.indexOf("‖ 022 пауза · Отчёт по воротам") && printed.indexOf("‖ 022 пауза · Отчёт по воротам") < printed.indexOf("‖ 055 пауза · Ждать гейта"), JSON.stringify(printed))
cell("a HOLD task is not shown as working: no heading, no tab row of 146 in «В работе»", !printed.some((l) => /146.*в работе/.test(l)) && !printed.some((l) => l.includes("работает 3 мин")), JSON.stringify(printed))
cell("a STOP task without any tab is shown by its task file", printed.includes("■ 147 STOP · Перенос архива"), JSON.stringify(printed))
cell("a hold mark of a closed task is not shown", !printed.some((l) => l.includes("148")), JSON.stringify(printed))
cell("the foot is as before (it counts tabs, not tasks)", v.foot === "ход 2 · ждут 0 · ⧗ 1 · /crew", v.foot)
cell("every printed row fits the panel", printed.every((l) => l.length <= SIDE_WIDTH && !/^\s/.test(l)), JSON.stringify(printed.filter((l) => l.length > SIDE_WIDTH || /^\s/.test(l))))

// the order does not depend on the order of the input list
const shuffled = [list[5], list[2], list[0], list[4], list[1], list[3]]
cell("the order is deterministic under a shuffled input", JSON.stringify(sidebarLines(shuffled, now, "nova").rows) === JSON.stringify(v.rows), "")

// a narrow panel keeps the number and the status word of every task
const np = sidebarLines(list, now, "nova", 24).rows.map((r) => sideText(r, 24))
cell("a narrow panel keeps the number and the status word", np.includes("• 077 в работе ·") && np.some((l) => l.startsWith("✓ 091 на приёмке")) && np.includes("▶ 033 нужен ответ ·") && np.includes("HOLD/STOP · 2"), JSON.stringify(np))
cell("a narrow panel: every row fits", np.every((l) => l.length <= 24), JSON.stringify(np.filter((l) => l.length > 24)))

// the counters count the groups actually shown: 12 working groups, the budget of 9 tabs
const many = Array.from({ length: 12 }, (_, i) => st(`m${i}`, "working", { since: now - 60_000, task: { n: i + 1, status: "running", as: "executor", title: `T${i + 1}` } }))
const mv = sidebarLines(many, now, "nova")
const mp = mv.rows.map((r) => sideText(r))
cell("the counter of a section counts the groups actually shown", mp[0] === "В работе · 9", JSON.stringify(mp.slice(0, 3)))
cell("the groups over the budget go to the foot", /\+3/.test(mv.foot) && !mp.some((l) => l.includes("в работе · T10")), JSON.stringify({ foot: mv.foot }))
cell("nine tab rows at most, as before", mv.rows.filter((r) => r.who).length === 9, String(mv.rows.filter((r) => r.who).length))

// a task with a folder: the heading carries the status word too, without a mark (the marks are at the sessions)
const g45 = (status, label, extra = {}) => ({ n: 45, status, as: "executor", title: "Канон", ref: "045", group: true, label, ...extra })
const grp = [
  st("s45", "task", { task: g45("running", "С4-3", { kind: "проверка плана" }) }),
  st("d45", "task", { task: g45("submitted", "С1-1", { ended: now - 60_000 }) }),
]
const gp = sidebarLines(grp, now, "nova").rows.map((r) => sideText(r))
cell("a task with a folder: the status word at the heading, the folded sessions under it", gp[0] === "Пауза · 1" && gp[1] === "045 пауза · Канон" && gp.includes("↳ ✓ сдано 1 сессия"), JSON.stringify(gp))

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-sidebar-groups.test: FAIL ${fail}` : "crew-sidebar-groups.test ok")
process.exit(fail ? 1 : 0)

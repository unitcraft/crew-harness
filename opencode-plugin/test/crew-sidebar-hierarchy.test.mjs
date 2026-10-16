// Self-test of the hierarchy of the side panel (task 068; node >= 24):  node test/crew-sidebar-hierarchy.test.mjs
// The owner (2026-10-17): "сейчас показывается каша" - the heading of a task, the continuation of its title, the role and the steps
// stood in one column. "по рекомендации, заводи 068, название задачи белым цветом, под элементы серым": the hierarchy is a sign and
// a colour, never an indent (the panel is a run of rows, a row owes nothing to the spaces before it). So: the title of a task is
// white (tone base), its continuation too and starts with «·»; everything under the task is grey (tone muted) and starts with «↳»;
// a tab that waits for the owner and a «⚠» row stay accent; no row of the panel starts with a space.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-sidebar-hierarchy-"))
process.env.XDG_DATA_HOME = tmp
const { sidebarLines, sideText, waitText, SIDE_WIDTH } = await import("../status.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const at = (h, m) => new Date(2026, 9, 17, h, m).getTime()
const now = at(0, 30)
const st = (session, state, extra = {}) => ({ session, project: "nova", role: "worker", title: session, state, detail: "", watches: [], asked: [], tasks: [], updated: now, ...extra })
const steps = Array.from({ length: 12 }, (_, i) => ({ id: i === 2 ? "sabotage" : "s" + i, text: i === 2 ? "подсунь негодное: проверка падает" : "шаг " + i, ...(i < 2 ? { result: "ok" } : {}) }))
const t98 = "Разобрать provenance receipt Carina 0.2.0"
const g = (status, label, extra = {}) => ({ n: 45, status, as: "executor", title: "Канон и актуальная методика", ref: "045", group: true, label, ...extra })
const list = [
  st("i1", "owner", { role: "integrator", since: at(0, 10), question: "Утвердить план уборки?" }),
  st("g33", "owner", { gate: true, since: at(0, 5), task: { n: 33, status: "running", as: "executor", title: "Выпустить Windows seed" } }),
  st("s25", "owner", { since: at(0, 12), question: "вливать?", task: g("running", "С2-5", { kind: "проверка разбора" }) }),
  st("d1", "task", { task: g("submitted", "С1-1", { kind: "разбор", ended: at(0, 1) }) }),
  st("d2", "task", { task: g("submitted", "С1п-2", { kind: "правка разбора", ended: at(0, 2) }) }),
  st("k77", "working", { since: now - 5 * 60_000, stuck: [{ what: "приёмка #77", at: at(0, 0) }], task: { n: 77, status: "running", as: "executor", title: "Починить сборку" } }),
  st("e98", "working", { since: now - 12 * 60_000, task: { n: 98, status: "running", as: "executor", title: t98 } }),
  st("r98", "working", { since: now - 60_000, task: { n: 98, status: "reviewing", as: "reviewer", title: t98, steps, checking: "sabotage" } }),
  st("r91", "watch", { since: now - 597 * 60_000, watches: [{ id: "w", note: "ждать отдельный cleanup plan #91", started: now - 597 * 60_000, minutes: 999 }], task: { n: 91, status: "reviewing", as: "reviewer", title: "Проверить контракты Oracle release" } }),
  st("e91", "task", { task: { n: 91, status: "submitted", as: "executor", title: "Проверить контракты Oracle release" } }),
  st("t1", "tasks", { idleTab: { since: now - 15 * 60_000, what: ["061 между сессиями"] } }),
]
const rows = sidebarLines(list, now, "nova").rows
const shot = rows.map((r) => `${r.tone[0]} ${sideText(r)}`)
if (process.env.SHOW) console.log(shot.join("\n"))
const printed = rows.map((r) => sideText(r))

// the snapshot: every row of the panel, its tone (a - accent, b - base, m - muted) and its text
cell("the snapshot of the panel", JSON.stringify(shot) === JSON.stringify([
  "a Ждут вас: 3 · с 00:05",
  "a ⚠ nova #33 исп",
  "a ⚠ #33 Выпустить Windows seed",
  "a ↳ исп  ворота, вопроса нет",
  "b 045 Канон и актуальная",
  "b · методика",
  "a ↳ ? С2-5 проверка разбора",
  "a ↳ ждёт вас 00:12",
  "m ↳ ✓ сдано 2 сессии",
  "a ? интегр.   ждёт вас 00:10",
  "b • #77 Починить сборку",
  "m ↳ исп  работает 5 мин",
  "a ⚠ застряла с 00:00",
  "b • #98 Разобрать provenance",
  "b · receipt Carina 0.2.0",
  "m ↳ исп  работает 12 мин",
  "m ↳ прм  проверка 3/12: sabotage —",
  "m ↳ подсунь негодное",
  "b #91 Проверить контракты Oracle",
  "b · release",
  "m ↳ прм  ⧗ ждать отдельный cleanup",
  "m ↳ plan #91 597м",
  "m ↳ исп  ✓ сдана",
  "a ◷ worker    простаивает 15м",
  "m ↳ 061 между сессиями",
]), JSON.stringify(shot, null, 1))
// the rules, apart from the snapshot
cell("no row of the panel starts with a space", printed.every((l) => l.length > 0 && !/^\s/.test(l)), JSON.stringify(printed.filter((l) => /^\s/.test(l))))
cell("every row fits the panel", printed.every((l) => l.length <= SIDE_WIDTH), JSON.stringify(printed.filter((l) => l.length > SIDE_WIDTH)))
cell("a row under a task starts with «↳» and is muted, or accent when the tab waits for the owner", rows.filter((r, i) => printed[i].startsWith("↳")).every((r) => r.tone === "muted" || r.tone === "accent") && rows.filter((r, i) => printed[i].startsWith("↳") && r.tone === "accent").length >= 2, JSON.stringify(shot))
cell("the continuation of a title starts with «·» and has the tone of its heading", printed.some((l) => l.startsWith("· ")) && rows.every((r, i) => !printed[i].startsWith("·") || r.tone === rows[i - 1].tone), JSON.stringify(shot))
cell("the title of a task is white: a heading row of a quiet task is base", rows.some((r, i) => /^#91 /.test(printed[i]) && r.tone === "base") && rows.some((r, i) => /^• #98 /.test(printed[i]) && r.tone === "base"), JSON.stringify(shot))
cell("nine tab rows at most (SIDE_MAX), as before", rows.filter((r) => r.who).length <= 9, String(rows.filter((r) => r.who).length))

// the lines of the panel that belong to no task (a lock wait, settings off the branch, the auto-answers) are rows of the same kind
cell("a bare row (no tab, no flush) is printed as it is, with no indent", sideText({ mark: " ", who: "", what: "⚠ не на ветке: x", tone: "accent" }) === "⚠ не на ветке: x" && sideText({ mark: " ", who: "", what: "авто 24ч: 3 · вмеш. 1", tone: "muted" }) === "авто 24ч: 3 · вмеш. 1", sideText({ mark: " ", who: "", what: "⚠ не на ветке: x", tone: "accent" }))

// the wait: the essence first, the time at the end; too long - the essence is cut, the time stays
cell("waitText: a short essence and the time", JSON.stringify(waitText("⧗ CI t34", now - 40 * 60_000, now, 25)) === JSON.stringify(["⧗ CI t34 40м"]), JSON.stringify(waitText("⧗ CI t34", now - 40 * 60_000, now, 25)))
const wt = waitText("⧗ ждать отдельный cleanup plan #91", now - 597 * 60_000, now, 25)
cell("waitText: a long essence wraps onto a second row, the time at the end of it", wt.length === 2 && wt[0] === "⧗ ждать отдельный cleanup" && wt[1] === "plan #91 597м", JSON.stringify(wt))
const wc = waitText("⧗ очередь: сборка всех платформ целиком и ещё много слов подряд подряд подряд", now - 597 * 60_000, now, 25)
cell("waitText: a very long essence is cut, the time stays", wc.length === 2 && wc[1].endsWith("… 597м") && wc.every((l) => l.length <= 25), JSON.stringify(wc))
cell("waitText: no wait time - the essence as it is", JSON.stringify(waitText("⧗ CI", undefined, now, 25)) === JSON.stringify(["⧗ CI"]), "")

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-sidebar-hierarchy.test: FAIL ${fail}` : "crew-sidebar-hierarchy.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the task title on the first row of a task tab (task 064, item 6; node >= 24):  node test/crew-task-title-row.test.mjs
// The owner (2026-10-17): "непонятно что за задачи, я по памяти не помню, показывай название задачи". The "Crew" panel shows a
// task tab as the mark, the number and the title first («‖ 085 Accept Oracle evaluation»), the title wrapped by words onto two
// rows at most, then «…»; the role and the state on the row under it («↳ прм  ждёт указаний»); the question or the waiting phrase
// and the steps under that, as before. The heading of a task with a folder takes the same shape. /crew shows the title in full.
// Task 068 changed the drawing, not the content: no row starts with a space, the continuation of a title starts with «· », every row
// under the task with «↳ » (the colours are in crew-sidebar-hierarchy). Task 262 added the status word to the heading
// («▶ 085 нужен ответ · Accept…», «• 002 в работе · Short title») and the sections (the exact groups are in crew-sidebar-groups).
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-task-title-row-"))
process.env.XDG_DATA_HOME = tmp
const { sidebarLines, formatStatuses, sideText, WAIT_MARK } = await import("../status.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const at = (h, m) => new Date(2026, 9, 17, h, m).getTime()
const now = at(0, 30)
const st = (session, state, extra = {}) => ({ session, project: "nova", role: "worker", title: session, state, detail: "", watches: [], asked: [], tasks: [], updated: now, ...extra })
const long = "Accept Oracle evaluation repair after the second review round of the ledger"
const phrase = "Сообщил интегратору, что жду дальнейших указаний."
const list = [
  st("w85", "question", { since: at(0, 10), wait: true, question: phrase, title: `085 прм ${long}`, task: { n: 85, status: "reviewing", as: "reviewer", title: long }, detail: `ждёт указаний интегратора с 00:10: ${phrase}` }),
  st("w2", "working", { since: now - 12 * 60_000, title: "002 исп x", task: { n: 2, status: "running", as: "executor", title: "Short *title*" }, detail: "работает (12 мин)" }),
]

// the panel: a task without a folder
const printed = sidebarLines(list, now, "nova").rows.map((r) => sideText(r))
const i85 = printed.indexOf(`${WAIT_MARK} 085 нужен ответ · Accept`)
cell("the first row of a task tab: the mark, the number, the status word and the title", i85 >= 0, JSON.stringify(printed))
cell("the title wraps by words onto a second row and ends with «…»", printed[i85 + 1] === "· Oracle evaluation repair…", JSON.stringify(printed.slice(i85, i85 + 4)))
cell("the role and the state on the row under the title", printed[i85 + 2] === "↳ прм  ждёт указаний", JSON.stringify(printed.slice(i85, i85 + 4)))
cell("the waiting phrase under the state, as before", printed[i85 + 3]?.startsWith("↳ Сообщил интегратору"), JSON.stringify(printed.slice(i85, i85 + 4)))
const i2 = printed.indexOf("• 002 в работе · Short title")
cell("a short title takes one row, marks of markdown dropped", i2 >= 0 && printed[i2 + 1] === "↳ исп  работает 12 мин", JSON.stringify(printed))
cell("no title sub-row at the end any more", !printed.some((l) => /↳ (Short|Accept)/.test(l)), JSON.stringify(printed))
cell("every printed row fits the panel (32 columns)", printed.every((l) => l.length <= 32), JSON.stringify(printed.filter((l) => l.length > 32)))
const rows = sidebarLines(list, now, "nova").rows
cell("the state row still names the tab (who) and keeps its mark for the logic", rows.some((r) => r.who === "085 прм" && r.mark === WAIT_MARK && r.what === "ждёт указаний"), JSON.stringify(rows))
cell("a title of one row needs no «…»", sidebarLines([list[1]], now, "nova").rows.map((r) => sideText(r)).filter((l) => l.includes("…")).length === 0, "")

// the panel: the heading of a task with a folder
const title = "Реестры контрактов и полный JSONC-регламент"
const g = (as, status, label) => ({ n: 45, status, as, title, ref: "045", group: true, ...(label ? { label } : {}) })
const grp = [
  st("sR", "owner", { project: "crew-harness", since: at(0, 10), title: `045 прм ${title}`, detail: "ждёт вас с 00:10: вливать?", question: "вливать?", task: g("reviewer", "reviewing") }),
  st("sA", "task", { project: "crew-harness", title: `045 С4-3 исп ${title}`, detail: "на доработке — стоит", task: g("executor", "rework", "С4-3") }),
]
const gp = sidebarLines(grp, now, "crew-harness").rows.map((r) => sideText(r))
const h = gp.indexOf("045 нужен ответ · Реестры")
cell("the heading of a task with a folder: the number, the status word and the title, wrapped the same way", h >= 0 && gp[h + 1] === "· контрактов и полный…", JSON.stringify(gp))
cell("its sessions under the heading, as before", gp[h + 2] === "↳ ? прм  ждёт вас 00:10" && gp[h + 3] === "↳ С4-3  ↻ доработка", JSON.stringify(gp))
cell("the heading rows fit the panel", gp.every((l) => l.length <= 32), JSON.stringify(gp))

// /crew: the title in full
const text = formatStatuses(list, now, "nova")
const lines = text.split("\n")
const c85 = lines.indexOf(`  ${WAIT_MARK} 085 ${long}`)
cell("/crew: the mark, the number and the whole title on the first line", c85 > 0, text)
cell("/crew: the role and the state word on the line under it", lines[c85 + 1] === `    ${WAIT_MARK} rev  paused 20m`, JSON.stringify(lines.slice(c85, c85 + 2)))
cell("/crew: an unmarked task tab - the number, the title and its tab on one line", lines.includes("  002 Short title — exec working 12m"), text)
const longer = `${title}: реестр полей, регламент JSONC и проверка всех файлов настроек проекта`
const gt = formatStatuses(grp.map((s) => ({ ...s, task: { ...s.task, title: longer } })), now, "crew-harness").split("\n")
cell("/crew: the heading of a task with a folder - the whole title, no «»", gt.includes(`  045 ${longer}`), gt.join("\n"))

// item 7 (the owner, 2026-10-17: «название шагов и сессий надо показывать»): a session of a task with a folder shows its code and
// the name of its kind by the methodology, from one list in the code; a step of the acceptance - its id and a short name from its text
const st7 = await import("../status.ts")
const { sessionName } = await import("../progress.ts")
const kind = st7.sessionKind
cell("7: the kinds of the methodology by code", typeof kind === "function" && kind("С2") === "проверка спецификации" && kind("С1п") === "правка спецификации" && kind("С5п") === "правка реализации" && kind("С9") === "разбор обратной связи" && kind("С6") === "проверка реализации", typeof kind)
cell("7: one list - the panel of the progress names the same kind", typeof kind === "function" && sessionName("С4") === `С4 ${kind("С4")}`, "")
cell("7: a code outside the list takes its name from its record in the task (the goal), else none", typeof kind === "function" && kind("С2м", "мини-проверка разбора: только REQ и AC") === "мини-проверка разбора" && kind("С2м") === undefined && kind("исп") === undefined, typeof kind === "function" ? String(kind("С2м", "мини-проверка разбора: только REQ и AC")) : "")
const g7 = (as, status, label, extra = {}) => ({ n: 45, status, as, title: "Канон", ref: "045", group: true, ...(label ? { label } : {}), ...extra })
const ses = [
  st("s25", "owner", { project: "crew-harness", since: at(0, 10), title: "045 С2-5", detail: "ждёт вас с 00:10: вливать?", question: "вливать?", task: g7("executor", "running", "С2-5", { kind: "проверка спецификации" }) }),
  st("s51", "task", { project: "crew-harness", title: "045 С5п-1", detail: "на доработке — стоит", task: g7("executor", "rework", "С5п-1", { kind: "правка реализации" }) }),
]
const sp = sidebarLines(ses, now, "crew-harness").rows.map((r) => sideText(r))
const k25 = sp.indexOf("↳ ? С2-5 проверка спецификации")
cell("7: the panel - the session's code and the name of its kind, its mark first", k25 >= 0, JSON.stringify(sp))
cell("7: the state of the session on the row under its name", sp[k25 + 1] === "↳ ждёт вас 00:10", JSON.stringify(sp.slice(k25, k25 + 2)))
cell("7: another live session the same way (a finished one is folded, item 8)", sp.includes("↳ С5п-1 правка реализации") && sp[sp.indexOf("↳ С5п-1 правка реализации") + 1] === "↳ ↻ доработка", JSON.stringify(sp))
cell("7: the rows fit the panel", sp.every((l) => l.length <= 32), JSON.stringify(sp.filter((l) => l.length > 32)))
const steps = Array.from({ length: 12 }, (_, i) => ({ id: i === 2 ? "sabotage" : "s" + i, text: i === 2 ? "подсунь негодное: проверка падает на испорченном входе `bad.json`" : "шаг " + i, ...(i < 2 ? { result: "ok" } : {}) }))
const rv = st("r85", "working", { since: now - 60_000, title: "085 прм", task: { n: 85, status: "reviewing", as: "reviewer", title: "Oracle", steps, checking: "sabotage" } })
cell("7: the step in progress - its id and a short name from its text", st7.stepProgress(rv.task) === "проверка 3/12: sabotage — подсунь негодное", String(st7.stepProgress(rv.task)))
const rp = sidebarLines([rv], now, "nova").rows.map((r) => sideText(r))
const r1 = rp.indexOf("↳ прм  проверка 3/12: sabotage —")
cell("7: the panel wraps the step by words under the role", r1 >= 0 && rp[r1 + 1] === "↳ подсунь негодное", JSON.stringify(rp))
cell("7: the step's text is not repeated on a row under it (the wrapped rest is the only other row)", rp.filter((l) => l.includes("подсунь")).length === 1, JSON.stringify(rp))
cell("7: the reviewer's rows fit the panel", rp.every((l) => l.length <= 32), JSON.stringify(rp.filter((l) => l.length > 32)))

// item 8 (the owner, 2026-10-17, «по рекомендации»): (a) a task without a folder - the number and the title once, as a heading, its
// tabs under it («исп  ↻ доработка», «прм  ↻ ждёт доработки»), the mark on the left is the most important tab's; (b) a task with a
// folder - its finished sessions on one row «✓ сдано N сессий» under the live ones, the whole list in /crew; the rows freed go to live tabs
const ex = st("e85", "question", { since: at(0, 5), question: "Базу опустить?", title: "085 исп", task: { n: 85, status: "rework", as: "executor", title: long }, detail: "ждёт ответа (интегратора или вас) с 00:05: Базу опустить?" })
const rw = st("p85", "task", { title: "085 прм", task: { n: 85, status: "rework", as: "reviewer", title: long }, detail: "приёмка: ждёт доработки" })
const ap = sidebarLines([rw, ex, list[1]], now, "nova").rows.map((r) => sideText(r))
cell("8a: the task's number and title once", ap.filter((l) => l.includes("085")).length === 1 && ap.filter((l) => l.includes("Accept")).length === 1, JSON.stringify(ap))
const a85 = ap.indexOf("▶ 085 нужен ответ · Accept")
cell("8a: the heading has the mark of the most important tab", a85 >= 0 && ap[a85 + 1] === "· Oracle evaluation repair…", JSON.stringify(ap))
cell("8a: its tabs under it - the executor with its question, then the reviewer", ap[a85 + 2] === "↳ исп  вопрос — ждёт ответа" && ap[a85 + 3] === "↳ Базу опустить?" && ap[a85 + 4] === "↳ прм  ↻ ждёт доработки", JSON.stringify(ap.slice(a85, a85 + 5)))
cell("8a: another task keeps its own heading", ap.includes("• 002 в работе · Short title"), JSON.stringify(ap))
const g8 = (status, label, extra = {}) => ({ n: 45, status, as: "executor", title: "Канон", ref: "045", group: true, label, ...extra })
const live = st("sR8", "owner", { project: "crew-harness", since: at(0, 10), title: "045 прм", question: "вливать?", detail: "ждёт вас с 00:10: вливать?", task: { n: 45, status: "reviewing", as: "reviewer", title: "Канон", ref: "045", group: true } })
const done = [
  st("d1", "task", { project: "crew-harness", title: "045 С1-1", detail: "сдана 23:00", task: g8("submitted", "С1-1", { ended: at(0, 1) }) }),
  st("d2", "task", { project: "crew-harness", title: "045 С2-1", detail: "сдана 23:10", task: g8("submitted", "С2-1", { ended: at(0, 2) }) }),
  st("d3", "task", { project: "crew-harness", title: "045 С3п-2", detail: "передана другой сессии", task: g8("handed", "С3п-2", { ended: at(0, 3) }) }),
]
const others = Array.from({ length: 8 }, (_, i) => st(`i8${i}`, "idle", { project: "crew-harness" }))
const bv = sidebarLines([live, ...done, ...others], now, "crew-harness")
const bp = bv.rows.map((r) => sideText(r))
const b45 = bp.indexOf("045 нужен ответ · Канон")
cell("8b: the live session under the heading, the finished ones on one row", b45 >= 0 && bp[b45 + 1] === "↳ ? прм  ждёт вас 00:10" && bp[b45 + 2] === "↳ ✓ сдано 3 сессии", JSON.stringify(bp))
cell("8b: no row of a finished session", !bp.some((l) => /С1-1|С2-1|С3п-2/.test(l)), JSON.stringify(bp))
cell("8b: the rows freed go to live tabs - nine live tabs, no «+N»", !/\+\d/.test(bv.foot) && bv.rows.filter((r) => r.who).length === 9, JSON.stringify({ foot: bv.foot, n: bv.rows.filter((r) => r.who).length }))
const bc = formatStatuses([live, ...done], now, "crew-harness")
cell("8b: /crew folds the finished sessions into a count (their list is the journal of the task)", / · 3 done/.test(bc) && !/С1-1|С2-1|С3п-2/.test(bc), bc)

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-task-title-row.test: FAIL ${fail}` : "crew-task-title-row.test ok")
process.exit(fail ? 1 : 0)

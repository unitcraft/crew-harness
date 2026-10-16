// Self-test of the show of one task number (task 058, AC-08; node >= 24):  node test/crew-task-show.test.mjs
// A task with a folder is named by its folder number (045, no «#») and its sessions by code and ordinal (045 С4-3): the "Crew"
// panel puts the task line «045 <title>» over its sessions «↳ прм», «↳ С4-3» (rows no longer than 32 columns), /crew lists the
// sessions under «045 <title>» (task 064: the title whole, the panel wraps it onto two rows at most), the line "Ждут вас" names
// «045 прм», taskRef gives «045 «…»». A task without a folder (Nova): «#88 <title>», the role and the state under it (task 064).
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-task-show-"))
process.env.XDG_DATA_HOME = tmp
const { sidebarLines, formatStatuses, sideText, waitingLine } = await import("../status.ts")
const { taskRef, taskNo, sessionRef } = await import("../tasks.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const at = (h, m) => new Date(2026, 9, 15, h, m).getTime()
const now = at(22, 30)
const st = (session, state, extra = {}) => ({ session, project: "crew-harness", role: "worker", title: session, state, detail: "", watches: [], asked: [], tasks: [], updated: now, ...extra })
const title = "Реестры контрактов и полный JSONC-регламент"
const g = (as, status, label, extra = {}) => ({ n: 45, status, as, title, ref: "045", group: true, ...(label ? { label } : {}), ...extra })
const list = [
  st("sR", "owner", { since: at(22, 10), title: `045 прм ${title}`, detail: "ждёт вас с 22:10: вливать?", question: "вливать?", task: g("reviewer", "reviewing") }),
  st("sA", "task", { title: `045 С4-3 исп ↻ доработка ${title}`, model: "openai/gpt-6.1-sol", detail: "на доработке — стоит", task: g("executor", "rework", "С4-3") }),
  st("sB", "task", { title: `045 С3п-2 исп ✓ сдана ${title}`, detail: "сдана 21:39", task: g("executor", "submitted", "С3п-2", { ended: at(21, 39) }) }),
  st("sN", "working", { project: "nova", since: now - 12 * 60_000, title: "#88 исп план", task: { n: 88, status: "running", as: "executor", title: "план" } }),
]

// the panel
const v = sidebarLines(list, now, "crew-harness")
const printed = v.rows.map((r) => sideText(r))
// task 064: the heading wraps by words onto two rows at most
const head = printed.findIndex((l) => l.startsWith("045 "))
cell("the panel: one task line «045 <title>» over its sessions", head >= 0 && printed.filter((l) => l.startsWith("045 ")).length === 1 && printed[head] === "045 Реестры контрактов и" && printed[head + 1] === "· полный JSONC-регламент", JSON.stringify(printed))
cell("the panel: the sessions under it — «↳ прм», «↳ С4-3» with marks, the finished «С3п-2» folded (task 064)", printed[head + 2] === "↳ ? прм  ждёт вас 22:10" && printed[head + 3] === "↳ С4-3  ↻ доработка" && printed[head + 4] === "↳ ✓ сдано 1 сессия", JSON.stringify(printed.slice(head, head + 5)))
cell("the panel: no «#45» and no title sub-row under the sessions", !printed.some((l) => l.includes("#45")) && printed.filter((l) => l.includes("Реестры")).length === 1, JSON.stringify(printed))
cell("the panel: every row fits 32 columns", printed.every((l) => l.length <= 32), JSON.stringify(printed.filter((l) => l.length > 32)))
const nova = sidebarLines(list, now, "nova").rows.map((r) => sideText(r))
cell("the panel of a project without folders: «• #88 план», then «исп  работает 12 мин» (task 064)", nova.indexOf("• #88 план") >= 0 && nova[nova.indexOf("• #88 план") + 1] === "↳ исп  работает 12 мин" && !nova.some((l) => l.includes("088")), JSON.stringify(nova))

// the line "Ждут вас"
cell("«Ждут вас» names the project and «045 прм»", waitingLine(list, now) === "Ждут вас: 1 · с 22:10 · crew-harness 045 прм", waitingLine(list, now))
cell("the panel's second line names the tab to open: «045 прм»", printed[1] === "? crew-harness 045 прм", JSON.stringify(printed.slice(0, 3)))

// /crew
const text = formatStatuses(list, now, "crew-harness")
const lines = text.split("\n")
const h = lines.indexOf("  045 Реестры контрактов и полный JSONC-регламент")
cell("/crew: the task line «045 «<title>»»", h > 0, text)
cell("/crew: the sessions under it without the task number", lines[h + 1] === "    ? прм — ждёт вас с 22:10: вливать?" && lines[h + 2] === "    С4-3 исп [gpt-6.1-sol] — на доработке — стоит" && lines[h + 3] === "    С3п-2 исп — сдана 21:39", JSON.stringify(lines.slice(h, h + 4)))
cell("/crew: the waiting summary first", lines[0] === "Ждут вас: 1 · с 22:10 · crew-harness 045 прм", lines[0])
cell("/crew: a project without folders - «#88 план», then «исп — …» (task 064)", lines.indexOf("  #88 план") > 0 && lines[lines.indexOf("  #88 план") + 1].startsWith("      исп — "), text)
cell("/crew lines fit the dialog (the question line aside)", lines.filter((l) => !l.includes("? прм")).every((l) => l.length <= 72), text)

// the number in the texts
cell("taskRef: «045 «…»» with a folder, «#88 «…»» without", taskRef({ n: 45, title, folder: "doc/tasks/045-x" }).startsWith("045 «Реестры") && taskRef({ n: 88, title: "план" }) === "#88 «план»", taskRef({ n: 45, title, folder: "doc/tasks/045-x" }))
cell("taskNo and sessionRef: 045, 045 С4-3, 060 исп", taskNo({ n: 45, folder: "x" }) === "045" && sessionRef({ n: 45, folder: "x" }, { code: "С4", k: 3 }) === "045 С4-3" && sessionRef({ n: 60, folder: "x" }, { code: "исп", k: 1 }) === "060 исп" && taskNo({ n: 88 }) === "#88", "")

// REQ-01: the journals of the "Ход работ" block are read from the project's tasks_dir
{
  const { mkdirSync, writeFileSync } = await import("node:fs")
  const { execFileSync } = await import("node:child_process")
  const { createScanner } = await import("../progress-scan.ts")
  const repo = path.join(tmp, "repo")
  mkdirSync(path.join(repo, "work", "tasks", "001-a"), { recursive: true })
  writeFileSync(path.join(repo, "work", "tasks", "001-a", "progress.log"), "С1 0/3 [2026-10-15 22:00] старт\n")
  execFileSync("git", ["init", "-q", repo])
  const sc = createScanner()
  cell("REQ-01: the scanner reads the folders of tasks_dir (work/tasks)", sc.scanAll(repo, now, "work/tasks").tasks.length === 1, JSON.stringify(sc.scanAll(repo, now, "work/tasks").tasks.map((x) => x.folder)))
  cell("REQ-01: the default doc/tasks finds nothing there, tasks_dir \"\" turns the block off", sc.scanAll(repo, now).tasks.length === 0 && sc.scanAll(repo, now, "").tasks.length === 0, "")
}

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-task-show.test: FAIL ${fail}` : "crew-task-show.test ok")
process.exit(fail ? 1 : 0)

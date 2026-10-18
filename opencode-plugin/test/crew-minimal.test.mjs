// Self-test of the minimal /crew screen (task 077; node >= 24):  node test/crew-minimal.test.mjs
// The owner (2026-10-17): "в /crew нужно уменьшить количество текста до минимума, оставшийся сделай на анг., общается crew должен
// на моем языке". /crew (formatStatuses) shows, per project: the name, the tabs that wait for the owner (the question as is, on its own
// line), the tasks with their tabs - the mark, the number and the title as they are, the role and the state in ONE short English word,
// the age of the wait, for a session of a task with a folder its code and kind ("С2-5 spec review") - and everything else
// (plans, uncleaned tasks, reports, auto-answers, stale asks, the lock, the settings) as counters on the line of the project. The labels are English and
// come from one list next to the words of the panel (progress.ts: CREW_STATE_WORDS, TASK_WORDS, SESSION_KIND, ROLE_WORDS); the content
// that tabs and the owner write (titles, questions, goals) is shown as it is. The panel keeps its Russian words.
//
// The snapshot below is a live-like set: a tab waiting for the owner, a task without a folder with a question (rows), a task without a
// folder that asks nothing (one line), a task with a folder (live and finished sessions), a watch, a reply, a stalled tab, an
// approval plan, a running plan, an accepted-and-uncleaned task, a report, a stale ask, a project with only an idle tab.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-minimal-"))
process.env.XDG_DATA_HOME = tmp
const status = await import("../status.ts")
const progress = await import("../progress.ts")
const tasks = await import("../tasks.ts")
const core = await import("../core.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

const NOW = Date.now()
const MIN = 60_000
const hm = (t) => new Date(t).toTimeString().slice(0, 5)
const st = (session, state, extra = {}) => ({ session, project: "proj", role: "worker", title: session, state, detail: "ЖДЁТ-РУССКИЙ-ТЕКСТ-ПЛАГИНА", watches: [], asked: [], tasks: [], updated: NOW, ...extra })

// content that tabs and the owner write: it may stay Russian
const Q_LONG = `${"Вливать ли ветку задачи в main после приёмки и очистки, если нужен перезапуск службы? ".repeat(3)}Рекомендую да.`
const TITLE94 = "Выпустить Windows seed"
const TITLE22 = "Проверить контракты Oracle"
const TITLE61 = "Канон и актуальная методика"
const CONTENT = [Q_LONG, "Разрешить ли сборку?", TITLE94, TITLE22, TITLE61, "длина фрагмента", "Интегратор проекта", "Уточнение задания"]

// tasks of the project: a plan on approval, a running plan, an accepted task not cleaned after all reminders, a merged one with a report
const mk = (title, status, extra = {}) => tasks.createTask({ project: "proj", title, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "m", author: "sesAUTH", author_role: "proj.integrator", qid: `q-${title}`, status, kind: "spawn", directory: tmp, ...extra })
const plan = (n) => ({ n, file: `docs/plans/${n}-x.md`, source: "s", rounds: [], clean: 2 })
const pApproval = mk("план 8: длина фрагмента", "approval", { plan: plan("8") })
const pRunning = mk("план 9: второй", "running", { plan: plan("9") })
const unclean = mk("Проверить контракты", "accepted", { steps: [{ id: "s1", text: "t" }], checks: { s1: "ok" } })
const acceptedAt = NOW - 28 * 60 * MIN
unclean.history = [{ at: acceptedAt, by: "x", status: "accepted" }]
tasks.saveTask(unclean)
for (let k = 1; k <= tasks.ACCEPTED_REMINDERS_MAX; k++) {
  const dir = path.join(core.INBOX, core.safeKey("sesAUTH"))
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${tasks.acceptedReminderId(unclean, acceptedAt, k)}.json`), JSON.stringify({ time: NOW }))
}
const merged = mk("Разобрать receipt", "done", { steps: [{ id: "s1", text: "t" }], checks: { s1: "ok" } })

const steps3 = [{ id: "s1", text: "первый шаг", result: "ok" }, { id: "s2", text: "второй шаг" }, { id: "s3", text: "третий шаг" }]
const steps3done = steps3.map((a) => ({ ...a, result: "ok" }))
const list = [
  st("sInt", "owner", { role: "integrator", title: "Интегратор проекта", since: NOW - 35 * MIN, question: Q_LONG }),
  st("sE94", "owner", { title: "094 исп", since: NOW - 20 * MIN, question: "Разрешить ли сборку?", task: { n: 94, status: "running", as: "executor", title: TITLE94 } }),
  st("sR94", "working", { title: "094 прм", since: NOW - 5 * MIN, task: { n: 94, status: "reviewing", as: "reviewer", title: TITLE94, steps: steps3, checking: "s2" } }),
  st("sE22", "task", { title: "022 исп", task: { n: 22, status: "submitted", as: "executor", title: TITLE22 } }),
  st("sR22", "task", { title: "022 прм", task: { n: 22, status: "reviewing", as: "reviewer", title: TITLE22, steps: steps3done }, stuck: [{ at: NOW - 9 * 60 * MIN, what: "приёмка задачи 022" }] }),
  st("sQ61", "question", { title: "061 С2-5", wait: true, since: NOW - 590 * MIN, question: "Жду указаний.", task: { n: 61, status: "running", as: "executor", title: TITLE61, ref: "061", group: true, label: "С2-5", kind: "проверка спецификации" } }),
  st("sX61", "working", { title: "061 исп", since: NOW - 3 * MIN, task: { n: 61, status: "running", as: "executor", title: TITLE61, ref: "061", group: true } }),
  st("sD1", "task", { title: "061 С1-1", task: { n: 61, status: "submitted", as: "executor", title: TITLE61, ref: "061", group: true, label: "С1-1", kind: "спецификация", ended: NOW - 900 * MIN } }),
  st("sD2", "task", { title: "061 С1п-1", task: { n: 61, status: "handed", as: "executor", title: TITLE61, ref: "061", group: true, label: "С1п-1", kind: "правка спецификации" } }),
  st("sW", "watch", { role: "worker", title: "wk", since: NOW - 12 * MIN, watches: [{ id: "w1", note: "gate nova", started: NOW - 12 * MIN, minutes: 30 }], askedStale: [{ qid: "qOLD", to: "proj.integrator", at: NOW - 180 * MIN }] }),
  st("sRep", "reply", { role: "scribe", title: "sc", since: NOW - 50 * MIN, asked: [{ qid: "qA", to: "proj.integrator", at: NOW - 50 * MIN }] }),
  st("sIdle", "tasks", { role: "architect", title: "ar", idleTab: { since: NOW - 45 * MIN, what: ["061 между сессиями"] }, tasks: [{ n: 3, status: "idle", priority: "P2", title: "x" }] }),
  st("sOther", "idle", { project: "other", role: "integrator", title: "other integrator" }),
]
const text = status.formatStatuses(list, NOW, "proj")
const lines = text.split("\n")
console.log(text)

// 1. the labels are English: no Russian word is left outside the content of the tabs and the owner and the codes of the sessions
let rest = text
for (const c of CONTENT) rest = rest.split(c).join("")
rest = rest.replace(/С\d[а-яё]?-\d+/g, "")
const cyr = rest.match(/[А-Яа-яЁё]+/g) ?? []
cell("1: no Russian word outside the content of the tabs (titles, questions) and the session codes", cyr.length === 0, JSON.stringify(cyr))
cell("1b: no text of the plugin's own sentence (detail) is printed", !text.includes("ЖДЁТ-РУССКИЙ-ТЕКСТ-ПЛАГИНА"), text)
cell("1c: no model in brackets, no footer with the time", !/\[[^\]]+\]/.test(text) && !/обновляется|updated every/i.test(text), text)

// 2. the words come from one list next to the words of the panel
const W = progress.CREW_STATE_WORDS ?? {}
cell("2a: CREW_STATE_WORDS: waiting you / question / working / watch / reply / idle", W.owner === "waiting you" && W.question === "question" && W.working === "working" && W.watch === "watch" && W.reply === "reply" && W.idle === "idle", JSON.stringify(W))
const K = progress.SESSION_KIND ?? {}
cell("2b: SESSION_KIND: the kinds of the methodology in English", K["С1"] === "spec" && K["С1п"] === "spec fix" && K["С2"] === "spec review" && K["С3"] === "plan" && K["С3п"] === "plan fix" && K["С4"] === "plan review" && K["С5"] === "work" && K["С5п"] === "work fix" && K["С6"] === "work review" && K["С7"] === "delivery" && K["С8"] === "delivery review", JSON.stringify(K))
cell("2c: the words of the panel stay Russian (SESSION_WORDS)", progress.SESSION_WORDS["С2"] === "проверка спецификации" && progress.SESSION_WORDS["С5"] === "реализация", JSON.stringify(progress.SESSION_WORDS))

// 3. the head: the summary of the wait over all projects, the project is a name only
const oldest = hm(NOW - 35 * MIN)
cell("3a: the first line - who waits, since when, the oldest wait", lines[0] === `Waiting for you: 2 · since ${oldest} · proj integrator`, lines[0])
cell("3b: the project line is the name and the counters (no count of waiting tabs: the first line has it)", lines[1].split(" · ")[0] === "proj" && !/waiting|ВАС/.test(lines[1]), lines[1])
cell("3c: a project with only an idle tab and no counters - a name on the last line «idle: …», no rows", lines.at(-1) === "idle: other" && !lines.some((l) => /^ +integrator +idle/.test(l)) && !lines.includes("other"), text)

// 4. the tabs that wait for the owner: the row and the question on its own line, as it is
const iInt = lines.indexOf("  ? integrator  waiting you 35m")
cell("4a: a tab of the owner - mark, role, state word, age", iInt > 0, text)
cell("4b: the question is on the next line, whole", lines[iInt + 1] === `      ↳ ${Q_LONG}`, lines[iInt + 1])
const i94 = lines.indexOf(`  ? 094 ${TITLE94}`)
cell("4c: a task with a question: the heading with the mark and the whole title, a row per tab", i94 > 0 && lines[i94 + 1] === "    ? exec  waiting you 20m" && lines[i94 + 2] === "        ↳ Разрешить ли сборку?" && lines[i94 + 3] === "    rev  working 5m 2/3", lines.slice(i94, i94 + 4).join("|"))

// 5. a task that asks the owner nothing: one line, tabs folded into the heading
cell("5a: tabs of a quiet task without a folder are on the heading line", lines.includes(`  022 ${TITLE22} — exec submitted · rev in review 3/3 ⚠ stuck 9h`), text)
cell("5b: no row of its own for them", !lines.some((l) => /^ +(exec|rev) +submitted/.test(l)), text)

// 6. a task with a folder: live sessions by code and kind, the finished ones by count
const i61 = lines.indexOf(`  061 ${TITLE61} · 2 done`)
cell("6a: the heading of a task with a folder: the number, the whole title, the count of finished sessions", i61 > 0, text)
cell("6b: a live session - mark, code, kind in English, state, age", lines[i61 + 1] === "    ‖ С2-5 spec review  paused 10h", lines[i61 + 1])
cell("6c: the executor session of the task - role word and state", lines[i61 + 2] === "    exec  working 3m", lines[i61 + 2])
cell("6d: finished sessions get no rows", !lines.some((l) => /С1-1|С1п-1/.test(l)), text)

// 7. the rest of the tabs
cell("7a: watch - the note of the tab and the age", lines.includes("  worker  watch gate nova 12m"), text)
cell("7b: reply - from whom and the age", lines.includes("  scribe  reply from proj.integrator 50m"), text)
cell("7c: a stalled tab (◷) - the word and the age", lines.includes("  ◷ architect  stalled 45m"), text)

// 8. everything else is one counter line, nothing is lost: the numbers say where to look
const plansRow = lines.find((l) => /plan 8/.test(l))
cell("8a: the plan that waits for the owner - its own row with /plans", plansRow === "  ◇ plan 8 длина фрагмента — approval · /plans" || /^ +◇ plan 8 .*approval.*\/plans$/.test(plansRow ?? ""), String(plansRow))
const counter = lines[1]
cell("8b: the counters are on the line of the project, one line, no line of their own", counter.startsWith("proj · ") && !lines.some((l) => /^ +\+ /.test(l)), text)
cell("8c: plans counted, uncleaned with the number and the hours, reports with numbers, stale asks counted", /plans 1/.test(counter) && new RegExp(`uncleaned ${String(unclean.n).padStart(3, "0")} 28h`).test(counter) && new RegExp(`reports (${String(unclean.n).padStart(3, "0")} ${String(merged.n).padStart(3, "0")}|${String(merged.n).padStart(3, "0")} ${String(unclean.n).padStart(3, "0")})`).test(counter) && /stale asks 1/.test(counter), counter)
cell("8d: the old blocks are gone (plans:, report of the acceptance, unclean line, stale-question line)", !/планы:|отчёт приёмки|не убрана|вопрос устарел|автоответы/.test(text), text)

// 9. the size: not more than one row per tab (the question of the owner has its own line) and the total is short
const tabs = list.filter((s) => s.project === "proj").length
const questions = lines.filter((l) => /^ +↳ /.test(l)).length
cell("9a: the owner's questions have their own lines: two", questions === 2, String(questions))
cell("9b: the screen is short: lines <= tabs + tasks + questions + projects + 3", lines.length <= tabs + 3 + questions + 2 + 3, `${lines.length} lines for ${tabs} tabs`)
cell("9c: a tab row is short: no row of a tab is longer than 72 columns (a question line and a task heading carry content and may be)", lines.filter((l) => /^ {2,4}\S/.test(l) && !l.includes("↳") && !/^ +(#|\d{3} )/.test(l) && !l.includes(" — ")).every((l) => l.length <= 72), JSON.stringify(lines.filter((l) => l.length > 72)))

// 10. the panel is untouched (it keeps its Russian words and marks)
const side = status.sidebarLines(list, NOW, "proj")
const sideText = side.rows.map((r) => status.sideText(r)).join("\n")
cell("10: the panel keeps its Russian words (ждёт вас, ход ...)", /ждёт вас/.test(sideText) && /ход \d+ · ждут \d+/.test(side.foot), sideText + "\n" + side.foot)

// 12. the plugin's own states are words, not Russian sentences; a stuck tab is never folded away
{
  const l = [
    st("h", "owner", { project: "p2", role: "integrator", since: NOW - 3 * MIN, sys: "hung", question: "ход завис с 10:00 (3 мин): нажмите Esc в окне" }),
    st("lo", "owner", { project: "p2", role: "worker", since: NOW - 4 * MIN, sys: "lost", question: "окно считает ход идущим, а сервер свободен" }),
    st("g", "owner", { project: "p2", role: "scribe", since: NOW - 5 * MIN, gate: true, question: "ворота записаны, вопрос владельцу не задан" }),
    st("gw", "owner", { project: "p2", role: "tester", since: NOW - 6 * MIN, gate: true, gateWait: true, question: "вопроса нет: Остановлено до вашего решения." }),
    st("q", "question", { project: "p2", role: "analyst", since: NOW - 7 * MIN, question: "Базу опустить?" }),
    st("wq", "watch", { project: "p2", role: "builder", since: NOW - 8 * MIN, watches: [{ id: "w", note: "очередь машины", minutes: 30 }] }),
    st("stk", "idle", { project: "p2", role: "keeper", stuck: [{ at: NOW - 130 * MIN, what: "причина" }] }),
  ]
  const t = status.formatStatuses(l, NOW, "p2")
  const ls = t.split(String.fromCharCode(10))
  console.log(t)
  cell("12a: a hung turn and a lost message are words (hung · Esc, no turn · Esc) with no sentence under them", ls.includes("  ? integrator  hung · Esc 3m") && ls.includes("  ? worker  no turn · Esc 4m") && !t.includes("нажмите") && !t.includes("сервер свободен"), t)
  cell("12b: a gate without a phrase is the word gate; with a phrase of the tab - the phrase as it is under it", ls.includes("  ⚠ scribe  gate 5m") && ls.includes("  ⚠ tester  gate 6m") && ls.includes("      ↳ Остановлено до вашего решения.") && !t.includes("ворота записаны"), t)
  cell("12c: a question to the integrator is a word; a watch in the queue is queued with its note", ls.includes("  ▶ analyst  question 7m") && ls.includes("  builder  queued очередь машины 8m"), t)
  cell("12d: a stuck tab keeps its row (not folded into the header): ⚠ stuck with the age", ls.includes("  keeper  idle ⚠ stuck 2h") && !/p2 · .*idle/.test(ls[1]), t)
  let r2 = t
  for (const c of ["Остановлено до вашего решения.", "очередь машины", "Базу опустить?"]) r2 = r2.split(c).join("")
  cell("12e: no Russian word outside the content in these states either", (r2.match(/[А-Яа-яЁё]+/g) ?? []).length === 0, JSON.stringify(r2.match(/[А-Яа-яЁё]+/g)))
}

// 11. nothing at all: the empty screen is English too
const empty = status.formatStatuses([], NOW)
cell("11: the empty screen is a short English line", !/[А-Яа-яЁё]/.test(empty) && empty.split("\n").length === 1, empty)

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-minimal.test: FAIL ${fail}` : "crew-minimal.test ok")
process.exit(fail ? 1 : 0)

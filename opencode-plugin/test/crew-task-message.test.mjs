// Self-test of the one template of task/message.md (task 065, node >= 24):  node test/crew-task-message.test.mjs
// The Canon gives one template of the task text (doc/canon/process.md, «Задание task/message.md»): a title «# Задание: …», a
// header, then the sections «Чего хочет владелец», «Что нужно», «Критерии приёмки», «Результат и куда он попадает», «Связи»,
// «Границы» in this order; an empty section is written «нет: <почему>». The plugin builds a new task's text from the crew_spawn
// fields by that template: the goal as numbered points, not one paragraph; owner_words (with a date) and result are required —
// without them a refusal names the field and gives an example; links and boundaries absent — «нет: …» with a mark; a message
// without the sections is refused too. Old calls stay valid where the template is not involved: a project without task
// folders and a session of an existing task need no new fields. The guard of the same rules is check-task-docs.py
// (message-title, message-section, message-owner).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-task-message-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const settings = { root: "..", worktrees: "worktrees", worktree_name: "{repo}-{n}-{slug}", branch_name: "task/{n}-{slug}", cleanup: "local", allow_default_models: true, inflight_limit: 20, spawn_limits: { worker: 9, reviewer: 0 } }
// proj — a project with task folders (doc/tasks in main); flat — a project without them (the old way, #N)
const proj = path.join(tmp, "proj")
const flat = path.join(tmp, "flat")
for (const [dir, folders] of [[proj, true], [flat, false]]) {
  mkdirSync(path.join(dir, ".opencode"), { recursive: true })
  writeFileSync(path.join(dir, ".opencode", "crew-harness.json"), JSON.stringify(settings))
  if (folders) {
    mkdirSync(path.join(dir, "doc", "tasks", "045-registry", "task"), { recursive: true })
    writeFileSync(path.join(dir, "doc", "tasks", "045-registry", "task", "message.md"), "# Задание: Реестры контрактов\n\nтекст\n")
    writeFileSync(path.join(dir, "doc", "tasks", "045-registry", "log.md"), "2026-10-15 10:00 документ: задание заведено\n")
  }
  git(dir, "init", "-q", "-b", "main")
  git(dir, "config", "user.name", "Owner Test")
  git(dir, "config", "user.email", "owner@test")
  writeFileSync(path.join(dir, "a.txt"), "a\n")
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", "init")
}

const mod = await import("../index.ts")
const tasks = await import("../tasks.ts")
const folders0 = await import("../task-folders.ts")
// the red probe runs before the code: a missing function is a red cell, not a crash
const folders = { templateMessage: folders0.templateMessage, messageFaults: folders0.messageFaults ?? (() => ["нет функции messageFaults"]) }
const tools = {}
const hooks = {}
const events = {}
const ctx = {
  location: { directory: tmp },
  options: { projects: { proj, flat } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: sessionID.startsWith("sesFLAT") ? flat : proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    create: async (req) => ({ id: req.id }),
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const store = (p) => path.join(tmp, "opencode", "crew-harness", "tasks", p)
const records = (p) => (existsSync(store(p)) ? readdirSync(store(p)).filter((f) => /^\d+\.json$/.test(f)).length : 0)
const branches = () => git(proj, "branch", "--list", "task/*").split("\n").filter(Boolean).length
for (const sid of ["sesINTEG1", "sesFLATINT"]) {
  await hooks.context({ sessionID: sid, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: sid } })
  await call("crew_role", sid, { role: "integrator" })
}
const SECTIONS = ["Чего хочет владелец", "Что нужно", "Критерии приёмки", "Результат и куда он попадает", "Связи", "Границы"]
const heads = (text) => text.split("\n").filter((l) => /^## /.test(l)).map((l) => l.slice(3).replace(/[ \t]*\(.*\)[ \t]*$/, "").trim())
const sectionBody = (text, name) => {
  const lines = text.split("\n")
  const i = lines.findIndex((l) => l.startsWith(`## ${name}`))
  if (i < 0) return ""
  const j = lines.findIndex((l, k) => k > i && /^## /.test(l))
  return lines.slice(i + 1, j < 0 ? undefined : j).join("\n").trim()
}

// ---- the template from the fields: sections in order, the goal as points, absent links and boundaries as «нет: …» ----
const words = "- «сделай единый образец» (владелец, 2026-10-17, чат оркестратора)"
const goal = "Образец задания в Каноне.\n\nПлагин собирает задание по образцу.\n\nСтраж проверяет разделы новых задач."
const full = { title: "Единый образец", goal, criteria: "красная проба до кода; полный npm test", owner_words: words, result: "нет: результат — код: opencode-plugin/" }
const a1 = await call("crew_spawn", "sesINTEG1", full)
await wait()
const t1 = tasks.listTasks("proj").find((t) => t.title === "Единый образец")
let msg1 = ""
try {
  msg1 = t1?.folder ? git(proj, "show", `${t1.branch}:${t1.folder}/task/message.md`) : ""
} catch {}
cell("T65-1: crew_spawn with the fields makes the task with its folder", !!t1?.folder, a1)
cell("T65-1: the text starts with «# Задание: <title>» and a header (Заказчик, Репозиторий, Дата задания, Источник)", msg1.startsWith("# Задание: Единый образец\n") && /^Заказчик: /m.test(msg1) && /^Репозиторий: /m.test(msg1) && /Дата задания: \d{4}-\d\d-\d\d/.test(msg1) && /^Источник: /m.test(msg1), msg1)
cell("T65-1: the sections are the template's, in its order", JSON.stringify(heads(msg1)) === JSON.stringify(SECTIONS), JSON.stringify(heads(msg1)))
cell("T65-1: «Чего хочет владелец» carries the owner's words word for word", sectionBody(msg1, "Чего хочет владелец") === words, sectionBody(msg1, "Чего хочет владелец"))
cell("T65-1: «Что нужно» — numbered points, one per paragraph of the goal, not one paragraph", sectionBody(msg1, "Что нужно") === "1. Образец задания в Каноне.\n2. Плагин собирает задание по образцу.\n3. Страж проверяет разделы новых задач.", sectionBody(msg1, "Что нужно"))
cell("T65-1: criteria and result are in their sections", sectionBody(msg1, "Критерии приёмки") === full.criteria && sectionBody(msg1, "Результат и куда он попадает") === full.result, msg1)
cell("T65-1: no links and no boundaries — «нет: …» naming the field, the section is not dropped", /^нет: .*links/.test(sectionBody(msg1, "Связи")) && /^нет: .*boundaries/.test(sectionBody(msg1, "Границы")), msg1)
cell("T65-1: the plugin's own check finds no fault in its text", folders.messageFaults(msg1).length === 0, JSON.stringify(folders.messageFaults(msg1)))

// already numbered goal stays as it is; links and boundaries given go word for word; open questions — after «Границы»
const t2text = folders.templateMessage({ title: "Т", goal: "1. раз\n2. два", criteria: "к", owner_words: words, result: "р", links: "Пересекается (файлы): README.md", boundaries: "- не трогать 064", open_questions: "В-01 кому?", author_role: "proj.integrator", project: "proj" }, new Date(2026, 9, 17, 10, 0))
cell("T65-2: a goal already in numbered points is kept", sectionBody(t2text, "Что нужно") === "1. раз\n2. два", t2text)
cell("T65-2: links and boundaries go word for word, open questions come after «Границы»", sectionBody(t2text, "Связи") === "Пересекается (файлы): README.md" && sectionBody(t2text, "Границы") === "- не трогать 064" && JSON.stringify(heads(t2text)) === JSON.stringify([...SECTIONS, "Открытые вопросы"]), t2text)
const oneLine = folders.templateMessage({ title: "Т", goal: "одна строка цели", criteria: "к", owner_words: words, result: "р", author_role: "a", project: "proj" })
cell("T65-2: a one-line goal is the point 1", sectionBody(oneLine, "Что нужно") === "1. одна строка цели", oneLine)
const bullets = folders.templateMessage({ title: "Т", goal: "Сделать:\n- раз\n- два", criteria: "к", owner_words: words, result: "р", author_role: "a", project: "proj" })
cell("T65-2: a list of «- …» lines becomes points, the line before it — a point too", sectionBody(bullets, "Что нужно") === "1. Сделать:\n2. раз\n3. два", sectionBody(bullets, "Что нужно"))

// ---- refusals: no owner_words, owner_words without a date, no result — a hint what to add; no record, no branch ----
const recs = records("proj")
const brs = branches()
const r1 = await call("crew_spawn", "sesINTEG1", { ...full, title: "Без слов", owner_words: undefined })
cell("T65-3: no owner_words — refused, the answer names owner_words and gives an example with a date", /не поставлена/.test(r1) && /owner_words/.test(r1) && /\(владелец, \d{4}-\d\d-\d\d, /.test(r1), r1)
const r2 = await call("crew_spawn", "sesINTEG1", { ...full, title: "Без даты", owner_words: "«сделай» (владелец, чат)" })
cell("T65-3: owner_words without a date ГГГГ-ММ-ДД — refused, the answer says the date is missing", /не поставлена/.test(r2) && /owner_words/.test(r2) && /дат/.test(r2), r2)
const r3 = await call("crew_spawn", "sesINTEG1", { ...full, title: "Без результата", result: undefined })
cell("T65-3: no result — refused, the answer names result and the form «нет: результат — код: …»", /не поставлена/.test(r3) && /result/.test(r3) && /нет: результат — код/.test(r3), r3)
const r4 = await call("crew_spawn", "sesINTEG1", { ...full, title: "Чужой текст", message: "# Задание: Чужой текст\n\nСлова владельца (владелец, 2026-10-17): «заводи».\n" })
cell("T65-3: a message without the template's sections — refused, the answer lists the missing sections", /не поставлена/.test(r4) && /Что нужно/.test(r4) && /Связи/.test(r4) && /Границы/.test(r4), r4)
cell("T65-3: refusals make no record and no task branch", records("proj") === recs && branches() === brs, `${records("proj")} vs ${recs}; ${branches()} vs ${brs}`)
const good = "# Задание: Свой текст\n\nЗаказчик: владелец.\nРепозиторий: proj, ветка main. Дата задания: 2026-10-17.\nИсточник: чат.\n\n" +
  "## Чего хочет владелец (его слова, 2026-10-17, чат оркестратора)\n\n- «заводи»\n\n## Что нужно\n\n1. сделать\n\n## Критерии приёмки\n\n- тест зелёный\n\n" +
  "## Результат и куда он попадает\n\nнет: результат — код: proj/\n\n## Связи\n\nнет: задача одна\n\n## Границы\n\n- чужое не трогать\n"
const r5 = await call("crew_spawn", "sesINTEG1", { title: "Свой текст", goal: "сделать", criteria: "тест зелёный", message: good })
await wait()
const t5 = tasks.listTasks("proj").find((t) => t.title === "Свой текст")
let msg5 = ""
try {
  msg5 = t5?.folder ? git(proj, "show", `${t5.branch}:${t5.folder}/task/message.md`) : ""
} catch {}
cell("T65-4: a message by the template (date in the heading of the owner's section) is taken word for word, no new fields needed", msg5 === good, JSON.stringify({ r5: r5.slice(0, 300), msg5 }))

// ---- the plugin's check on its own: the same rules as the guard ----
const faults = (t) => folders.messageFaults(t).join(" | ")
cell("T65-5: the template text has no faults", folders.messageFaults(good).length === 0, faults(good))
cell("T65-5: a missing section is a fault naming it", /Связи/.test(faults(good.replace("## Связи\n\nнет: задача одна\n\n", ""))), faults(good.replace("## Связи\n\nнет: задача одна\n\n", "")))
cell("T65-5: sections out of order are a fault", folders.messageFaults(good.replace("## Связи\n\nнет: задача одна\n\n## Границы\n\n- чужое не трогать\n", "## Границы\n\n- чужое не трогать\n\n## Связи\n\nнет: задача одна\n")).length > 0, "no fault")
cell("T65-5: an empty section is a fault («нет: <почему>»)", /нет: <почему>/.test(faults(good.replace("- тест зелёный\n\n", ""))), faults(good.replace("- тест зелёный\n\n", "")))
cell("T65-5: «нет:» without a reason is a fault", folders.messageFaults(good.replace("нет: задача одна", "нет:")).length > 0, "no fault")
cell("T65-5: the owner's section without a date is a fault", /дат/.test(faults(good.replace(" (его слова, 2026-10-17, чат оркестратора)", ""))), faults(good.replace(" (его слова, 2026-10-17, чат оркестратора)", "")))
cell("T65-5: no title «# Задание: …» is a fault", /# Задание/.test(faults(good.replace("# Задание: Свой текст\n\n", ""))), faults(good.replace("# Задание: Свой текст\n\n", "")))
cell("T65-5: a sub-task's first line «Часть задачи NNN «…».» before the title is no fault", folders.messageFaults("Часть задачи 045 «Реестры».\n\n" + good).length === 0, faults("Часть задачи 045 «Реестры».\n\n" + good))
cell("T65-5: a heading inside fenced code does not count", /Связи/.test(faults(good.replace("## Связи\n\nнет: задача одна\n", "```\n## Связи\n\nнет: задача одна\n```\n"))), faults(good.replace("## Связи\n\nнет: задача одна\n", "```\n## Связи\n\nнет: задача одна\n```\n")))

// ---- compatibility: old calls where the template is not involved ----
const s1 = await call("crew_spawn", "sesINTEG1", { task: 45, session: "С4", goal: "проверка плана" })
await wait()
cell("T65-6: a session of an existing task needs no new fields", tasks.loadTask("proj", 45)?.sessions?.[0]?.code === "С4", s1)
const f1 = await call("crew_spawn", "sesFLATINT", { title: "старый вызов", goal: "сделать", criteria: "готово" })
await wait()
cell("T65-6: a project without task folders: the old call goal + criteria still starts the task", tasks.listTasks("flat").some((t) => t.title === "старый вызов") && /запущена/.test(f1), f1)
cell("T65-6: the tool description names owner_words, result and links", /owner_words/.test(tools.crew_spawn.description) && /result/.test(tools.crew_spawn.description) && /links/.test(tools.crew_spawn.description) && !!tools.crew_spawn.input.properties.owner_words && !!tools.crew_spawn.input.properties.result && !!tools.crew_spawn.input.properties.links, tools.crew_spawn.description.slice(0, 400))

// ---- assign in a project with folders writes the same template: the same required fields ----
await hooks.context({ sessionID: "sesTAB2", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesTAB2" } })
const recs7 = records("proj")
const as1 = await call("crew_task", "sesINTEG1", { action: "assign", session: "sesTAB2", title: "Ручная", goal: "сделать руками", criteria: "готово" })
cell("T65-7: assign without owner_words and result in a project with folders — refused naming them, no record", /не поставлена/.test(as1) && /owner_words/.test(as1) && /result/.test(as1) && records("proj") === recs7, as1)
const as2 = await call("crew_task", "sesINTEG1", { action: "assign", session: "sesTAB2", title: "Ручная", goal: "сделать руками", criteria: "готово", owner_words: words, result: "нет: результат — код: proj/" })
const ta = tasks.listTasks("proj").find((t) => t.kind === "assign")
let msgA = ""
try {
  msgA = ta?.folder ? git(proj, "show", `${ta.branch}:${ta.folder}/task/message.md`) : ""
} catch {}
cell("T65-7: assign with the fields writes the template", JSON.stringify(heads(msgA)) === JSON.stringify(SECTIONS), JSON.stringify({ as2: as2.slice(0, 200), h: heads(msgA) }))

stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-task-message.test: FAIL ${fail}` : "crew-task-message.test ok")
process.exit(fail ? 1 : 0)

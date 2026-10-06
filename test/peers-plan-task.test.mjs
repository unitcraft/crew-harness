// Self-test of a plan task (plan 012; node >= 24):  node test/peers-plan-task.test.mjs
// peer_spawn {kind: "plan"} -> the executor writes the plan file; a report with a bad form is refused; the plan is
// rechecked in rounds, each by a new session; blocking/significant remarks return it to the author; two clean rounds
// in a row send it to the owner for approval.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-plantask-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_POLL_MS = "100"
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db")
process.env.NOVA_PEERS_PRESENCE = "all"
process.env.NOVA_PEERS_PLANSTEPS_MS = "200"
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
mkdirSync(path.join(proj, "docs", "plans"), { recursive: true })
writeFileSync(path.join(proj, "docs", "plans", "7-old.md"), "# План 7 — старый\n")
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
writeFileSync(path.join(proj, ".opencode", "opencode-peers.json"), JSON.stringify({ worktrees: "wt", branch_name: "t{n}-{slug}", cleanup: "local", spawn_limits: { worker: 5, reviewer: 1 }, plan_clean_rounds: 2, plan_rounds_max: 4 }))
git(proj, "init", "-q", "-b", "main")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")

const mod = await import("../index.ts")
const tasks = await import("../tasks.ts")
const core = await import("../core.ts")
const approvals = await import("../approvals.ts")
const tools = {}
const hooks = {}
const events = {}
const sessions = new Map()
const delivered = []
const ctx = {
  location: { directory: proj },
  options: { projects: [proj] },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
    synthetic: async ({ sessionID, text }) => delivered.push({ sessionID, text, synthetic: true }),
    create: async (req) => {
      if (!sessions.has(req.id)) sessions.set(req.id, req)
      return { id: req.id }
    },
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const WPID = 515151
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [] }))
beat()
const heart = setInterval(beat, 300)
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 8_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
}
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const task = () => tasks.loadTask("proj", 1)
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesINTEG1" } })
await call("peer_role", "sesINTEG1", { role: "integrator" })

// 1. a plan task: number after the plans folder, file, worktree, the letter with the source, template and criteria
const sp = await call("peer_spawn", "sesINTEG1", { kind: "plan", title: "длина фрагмента", goal: "Фрагмент интерполяции получает длину 0 — длина должна браться из склеенного текста" })
await wait(300)
const t1 = task()
cell("a plan task gets the next plan number and its file", t1.plan?.n === "8" && t1.plan.file === "docs/plans/8-dlina-fragmenta.md" && /план 8/.test(t1.title), JSON.stringify({ plan: t1.plan, title: t1.title, sp }))
const ex = t1.executor
cell("the letter: plan task, original task, template, plan criteria, rounds", ["ЗАДАЧА-ПЛАН", "ИСХОДНАЯ ЗАДАЧА", "#### Ф.1.1", "a2-coverage", "косметическое"].every((w) => got(ex, w).length === 1), JSON.stringify(got(ex, "ЗАДАЧА").map((d) => d.text.slice(0, 300))))

// 2. the report: no file -> refused; a bad form -> refused with the problems; a good one -> submitted
const report = (text = "план 8 готов") => call("peer_send", ex, { to: "sesINTEG1", text, reply_to: t1.qid })
const noFile = await report()
cell("a report without the plan file is refused", /Не сдано: файла плана/.test(noFile) && task().status === "running", noFile)
const file = path.join(t1.worktree, t1.plan.file)
mkdirSync(path.dirname(file), { recursive: true })
writeFileSync(file, "# План 8 — длина\n\n**Статус:** 🔴 ОТКРЫТ\n")
const badForm = await report()
cell("a plan with a bad form is refused, naming the problems", /форма плана 8 не в порядке/.test(badForm) && /Источник/.test(badForm) && /Зачем/.test(badForm), badForm)
const good = readFileSync(new URL("../plans.ts", import.meta.url), "utf8") && [
  "# План 8 — длина фрагмента", "", "**Статус:** 🔴 ОТКРЫТ", "**Источник:** задача #1", "**Зависимости:** —", "",
  "## Зачем", "0 на 3 фикстурах из 12", "## Что уже есть", "одна функция", "## Режим выполнения", "Без упрощений: ❔ — вопрос владельцу",
  "## Фазы", "### Ф.1 — длина [P1]", "#### Ф.1.1 — лексер [где: lex.nv]", "Что: длина из склеенного текста", "**Приёмка:**", "- ⬜ nova test lex → 12/12; краснота: старая длина → 3 FAIL",
  "#### Ф.1.2 — парсер [где: lex.nv]", "Что: парсер берёт длину у лексера", "**Приёмка:**", "- ⬜ nova test parse → 40/40",
  "### Ф.2 — проверка [P2] [после: Ф.1]", "#### Ф.2.1 — батарея фикстур [подплан]", "Что: батарея фикстур на длину", "**Приёмка:**", "- ⬜ батарея зелёная",
  "## Не делаем", "оракул", "## Открытые вопросы", "Открытых вопросов нет, проверено 2026-10-06", "## Решения владельца",
].join("\n")
writeFileSync(file, good)
git(t1.worktree, "add", "-A")
git(t1.worktree, "commit", "-q", "-m", "plan 8")
await report()
await until(() => task().reviewer && sessions.has(task().reviewer))
cell("a good plan is submitted and a recheck session is started", task().status === "submitted" && !!task().reviewer, JSON.stringify({ st: task().status, r: task().reviewer }))

// 3. round 1: the reviewer checks every step, a significant remark -> back to the author; this reviewer leaves
const r1 = task().reviewer
await until(() => got(r1, "ПЕРЕПРОВЕРКА ПЛАНА 8").length > 0)
cell("the reviewer's letter: recheck, round 1, original task, criteria, gradations", got(r1, "ПЕРЕПРОВЕРКА ПЛАНА 8").length === 1 && got(r1, "раунд 1").length === 1 && got(r1, "существенное").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === r1).map((d) => d.text.slice(0, 200))))
await call("peer_task", r1, { action: "review", n: 1 })
const early = await call("peer_task", r1, { action: "round", n: 1, blocking: 0, significant: 0, cosmetic: 0 })
cell("a verdict before every step is checked is refused", /Сначала все шаги перепроверки/.test(early), early)
const steps = task().steps.map((s) => s.id)
for (const step of steps) await call("peer_task", r1, { action: "check", n: 1, step, result: "проверено" })
const badNum = await call("peer_task", r1, { action: "round", n: 1, blocking: "много", significant: 0, cosmetic: 0 })
cell("a verdict without numbers per gradation is refused", /числа замечаний/.test(badNum), badNum)
const v1 = await call("peer_task", r1, { action: "round", n: 1, blocking: 0, significant: 1, cosmetic: 0, text: "[существенное] у Ф.1.1 нет пробы на пустой ввод → добавить критерий" })
await wait(600)
cell("a significant remark returns the plan to the author", task().status === "rework" && /вернулся автору/.test(v1) && got(ex, "ЗАМЕЧАНИЯ ПЕРЕПРОВЕРКИ ПЛАНА 8").length === 1, JSON.stringify({ st: task().status, v1 }))
cell("the round is recorded; the reviewer leaves", task().plan.rounds.length === 1 && task().plan.clean === 0 && !task().reviewer && task().reviewers.includes(r1), JSON.stringify(task().plan))

// 4. resubmitted: round 2 by a new session, clean (cosmetic only) -> another round; round 3 clean -> to the owner
await report("добавил пробу")
await until(() => task().reviewer && task().reviewer !== r1 && sessions.has(task().reviewer))
const r2 = task().reviewer
cell("the next round is a new session", !!r2 && r2 !== r1, JSON.stringify({ r1, r2 }))
const roundBy = async (r, verdict) => {
  await until(() => got(r, "ПЕРЕПРОВЕРКА ПЛАНА 8").length > 0)
  await call("peer_task", r, { action: "review", n: 1 })
  for (const step of task().steps.map((s) => s.id)) await call("peer_task", r, { action: "check", n: 1, step, result: "ok" })
  return call("peer_task", r, { action: "round", n: 1, ...verdict })
}
const v2 = await roundBy(r2, { blocking: 0, significant: 0, cosmetic: 1, text: "[косметическое] опечатка в Зачем" })
cell("a cosmetic-only round is clean; another round follows", task().status === "submitted" && task().plan.clean === 1 && /Чистых подряд 1 из 2/.test(v2), JSON.stringify({ st: task().status, v2 }))
await until(() => task().reviewer && ![r1, r2].includes(task().reviewer) && sessions.has(task().reviewer))
const r3 = task().reviewer
cell("round 3 is again a new session", !!r3 && ![r1, r2].includes(r3), JSON.stringify({ r1, r2, r3 }))
const v3 = await roundBy(r3, { blocking: 0, significant: 0, cosmetic: 0 })
cell("two clean rounds in a row: the plan goes to the owner", task().status === "approval" && /согласование владельцу/.test(v3), JSON.stringify({ st: task().status, v3 }))
cell("the history records every round", task().history.filter((h) => /перепроверка: раунд/.test(h.note ?? "")).length === 3, JSON.stringify(task().history.map((h) => h.note)))

// 5. the owner is notified; /plans writes the decision; "return" -> the author gets the owner's remarks
const notices = () => {
  try {
    return readdirSync(path.join(core.NOTICES, String(WPID))).map((f) => JSON.parse(readFileSync(path.join(core.NOTICES, String(WPID), f), "utf8")))
  } catch {
    return []
  }
}
await until(() => notices().some((n) => /План 8 ждёт согласования/.test(n.title)), 60_000)
cell("the owner gets a notice: the plan waits for approval", notices().some((n) => /План 8 ждёт согласования/.test(n.title) && n.attention), JSON.stringify(notices()))
approvals.writeApproval({ project: "proj", n: 1, decision: "no", text: "добавь фазу замера до правки" })
await until(() => task().status === "rework")
await wait(600)
await until(() => got(ex, "ЗАМЕЧАНИЯ ВЛАДЕЛЬЦА к плану 8").length > 0)
cell("'return with remarks': the plan goes back with the owner's words, rounds start over", task().status === "rework" && task().plan.clean === 0 && got(ex, "ЗАМЕЧАНИЯ ВЛАДЕЛЬЦА к плану 8").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === ex).map((d) => d.text.slice(0, 120))))
await report("добавил фазу замера")
for (let i = 0; i < 2; i++) {
  await until(() => task().reviewer && !task().reviewers.includes(task().reviewer) && sessions.has(task().reviewer))
  await roundBy(task().reviewer, { blocking: 0, significant: 0, cosmetic: 0 })
}
cell("two clean rounds again: back to the owner", task().status === "approval", task().status)

// 6. "approve without shortcuts": a merge reviewer writes the decision into the plan and merges; accept checks main
approvals.writeApproval({ project: "proj", n: 1, decision: "ok" })
await until(() => task().status === "submitted" && task().reviewer && sessions.has(task().reviewer))
const rm = task().reviewer
await until(() => got(rm, "ВЛИТЬ СОГЛАСОВАННЫЙ ПЛАН 8").length > 0)
cell("the merge reviewer gets the approved plan to write the decision in and merge", got(rm, "ВЛИТЬ СОГЛАСОВАННЫЙ ПЛАН 8").length === 1 && got(rm, "Без упрощений: ДА").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === rm).map((d) => d.text.slice(0, 200))))
await call("peer_task", rm, { action: "review", n: 1 })
const roundAfter = await call("peer_task", rm, { action: "round", n: 1, blocking: 0, significant: 0, cosmetic: 0 })
cell("no more rounds after approval", /уже согласован/.test(roundAfter), roundAfter)
for (const step of task().steps.map((s) => s.id)) await call("peer_task", rm, { action: "check", n: 1, step, result: "ok" })
await call("peer_task", rm, { action: "merge", n: 1 })
git(proj, "merge", "-q", "--no-edit", t1.branch)
const noAnswer = await call("peer_task", rm, { action: "accept", n: 1 })
cell("accept is refused while the plan in main lacks the owner's answer", /Без упрощений: ДА/.test(noAnswer) && task().status === "reviewing", noAnswer)
writeFileSync(file, readFileSync(file, "utf8").replace("Без упрощений: ❔ — вопрос владельцу", "Без упрощений: ДА — владелец, 2026-10-06"))
git(t1.worktree, "commit", "-q", "-am", "plan 8: the owner's answer")
git(proj, "merge", "-q", "--no-edit", t1.branch)
const acc = await call("peer_task", rm, { action: "accept", n: 1 })
cell("with the answer in main the plan is accepted", task().status === "accepted", acc)

// 7. cleaned: the steps become tasks -- Ф.1.1 first; Ф.1.2 shares «где: lex.nv» and waits; Ф.2 waits for Ф.1
git(proj, "worktree", "remove", "--force", t1.worktree)
git(proj, "branch", "-D", t1.branch)
const cl = await call("peer_task", rm, { action: "cleaned", n: 1 })
cell("the plan task is cleaned", task().status === "cleaned", cl)
const byStep = (id) => tasks.listTasks("proj").find((x) => x.plan_step?.step === id)
await until(() => !!byStep("Ф.1.1"))
await wait(800)
const s11 = byStep("Ф.1.1")
cell("step Ф.1.1 becomes a task: goal, criteria, boundaries, priority of its phase", !!s11 && s11.goal === "длина из склеенного текста" && /12\/12/.test(s11.criteria) && /оракул/.test(s11.boundaries) && /без упрощений/.test(s11.boundaries) && s11.priority === "P1" && s11.title === "8 Ф.1.1 лексер", JSON.stringify(s11))
cell("Ф.1.2 waits: the same «где» as a running step; Ф.2.1 waits for phase Ф.1", !byStep("Ф.1.2") && !byStep("Ф.2.1"), JSON.stringify(tasks.listTasks("proj").map((x) => [x.n, x.plan_step?.step])))
cell("the step task's letter asks for the done mark", got(s11.executor, "ШАГ ПЛАНА 8, Ф.1.1").length === 1, JSON.stringify(got(s11.executor, "ЗАДАЧА").map((d) => d.text.slice(0, 200))))

// 8. the step's acceptance requires «✅ СДЕЛАНО» of the step in the plan in main
const sw = byStep("Ф.1.1").worktree
writeFileSync(path.join(sw, "lex.nv"), "len\n")
git(sw, "add", "-A")
git(sw, "commit", "-q", "-m", "lexer")
await call("peer_send", s11.executor, { to: "sesINTEG1", text: "лексер готов", reply_to: s11.qid })
await until(() => byStep("Ф.1.1").reviewer && sessions.has(byStep("Ф.1.1").reviewer))
const sr = byStep("Ф.1.1").reviewer
await call("peer_task", sr, { action: "review", n: s11.n })
await call("peer_task", sr, { action: "merge", n: s11.n })
git(proj, "merge", "-q", "--no-edit", s11.branch)
const noMark = await call("peer_task", sr, { action: "accept", n: s11.n })
cell("accept of a step without «✅ СДЕЛАНО» in the plan is refused", /нет отметки «✅ СДЕЛАНО/.test(noMark) && byStep("Ф.1.1").status === "reviewing", noMark)
const mainPlan = path.join(proj, t1.plan.file)
writeFileSync(mainPlan, readFileSync(mainPlan, "utf8").replace("#### Ф.1.1 — лексер [где: lex.nv]", "#### Ф.1.1 — лексер ✅ СДЕЛАНО 2026-10-06, коммит \`abc\` [где: lex.nv]"))
git(proj, "commit", "-q", "-am", "plan 8: Ф.1.1 done")
const okMark = await call("peer_task", sr, { action: "accept", n: s11.n })
cell("with the mark the step is accepted", byStep("Ф.1.1").status === "accepted", okMark)

// 9. Ф.1.1 closed -> Ф.1.2 starts; Ф.1 closed -> the sub-plan step Ф.2.1 becomes a plan task 8.1; all closed -> letter
const close = (id) => {
  const x = byStep(id)
  x.status = "cleaned"
  tasks.saveTask(x)
}
close("Ф.1.1")
await until(() => !!byStep("Ф.1.2"))
cell("Ф.1.1 closed: Ф.1.2 starts", !!byStep("Ф.1.2") && !byStep("Ф.2.1"), JSON.stringify(tasks.listTasks("proj").map((x) => [x.n, x.plan_step?.step])))
close("Ф.1.2")
await until(() => !!byStep("Ф.2.1"))
const sub = byStep("Ф.2.1")
cell("phase Ф.1 closed: the sub-plan step becomes plan task 8.1", !!sub && sub.plan?.n === "8.1" && sub.plan.parent === "8" && /батарея фикстур/.test(sub.plan.source), JSON.stringify(sub && { plan: sub.plan, title: sub.title }))
close("Ф.2.1")
await until(() => got("sesINTEG1", "все шаги закрыты").length > 0)
cell("all steps closed: the author is asked to close the plan", got("sesINTEG1", "План 8").some((d) => /все шаги закрыты \(3\)/.test(d.text)), JSON.stringify(got("sesINTEG1", "План 8").map((d) => d.text.slice(0, 160))))

clearInterval(heart)
stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `peers-plan-task.test: FAIL ${fail}` : "peers-plan-task.test ok")
process.exit(fail ? 1 : 0)

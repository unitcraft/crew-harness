// Self-test of plan settings (plan 012, "everything configurable"; node >= 24):  node test/crew-plan-config.test.mjs
// A project's own plan form (prefix, labels, marks, no mode question), its own grades in a recheck round, the
// integrator approving plans (plan_approver: integrator) and steps listed instead of spawned (plan_steps: manual).
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-plancfg-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_PLANSTEPS_MS = "200"
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
mkdirSync(path.join(proj, "plans"), { recursive: true })
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const SETTINGS = {
  plans_dir: "plans",
  plan_prefix: "Ш",
  plan_labels: { what: "Цель", criteria: "Проверка" },
  plan_marks: { step_done: "✔ ГОТОВО" },
  plan_mode_question: "off",
  plan_sections: { why: "Причина", out: "Вне плана" },
  plan_grades: [
    { id: "major", name: "важное", text: "меняет смысл", clean: false },
    { id: "minor", name: "мелкое", text: "только текст", clean: true },
  ],
  plan_approver: "integrator",
  plan_steps: "manual",
}
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify(SETTINGS))
const PLAN = [
  "# План 1 — своя форма", "", "**Статус:** 🔴 ОТКРЫТ", "**Источник:** задача", "**Зависимости:** —", "",
  "## Причина", "замер", "## Что уже есть", "ничего", "## Фазы",
  "### Ш.1 — первая", "#### Ш.1.1 — шаг один [где: a.txt]", "Цель: сделать раз", "**Проверка:**", "- ⬜ тест 1/1",
  "#### Ш.1.2 — шаг два ✔ ГОТОВО 2026-10-06 [после: Ш.1.1]", "Цель: сделать два", "**Проверка:**", "- ⬜ тест 2/2",
  "## Вне плана", "ничего лишнего", "## Открытые вопросы", "Открытых вопросов нет, проверено 2026-10-06",
].join("\n")
writeFileSync(path.join(proj, "plans", "1-svoya.md"), PLAN)
git(proj, "init", "-q", "-b", "main")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")

const plans = await import("../plans.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

// 1. the project's form: settings -> PlanForm -> parse and check
const form = core.planFormOf(SETTINGS)
const p = plans.parsePlan(PLAN, form)
const steps = plans.allSteps(p)
cell("the form comes from the settings, the rest from the defaults", form.prefix === "Ш" && form.whatLabel === "Цель" && form.marks.step_done === "✔ ГОТОВО" && form.marks.step_work === "⏳ В РАБОТЕ" && form.sections.why === "Причина" && form.sections.existing === "Что уже есть" && !form.modeQuestion && form.grades.length === 2, JSON.stringify(form))
cell("a plan in the project's form is parsed: prefix, labels, done mark", steps.length === 2 && steps[0].id === "Ш.1.1" && steps[0].what === "сделать раз" && steps[0].criteria[0] === "тест 1/1" && steps[1].done && !steps[0].done, JSON.stringify(steps))
cell("its form is in order (no mode section when the question is off)", plans.planProblems(PLAN, form).length === 0, JSON.stringify(plans.planProblems(PLAN, form)))
cell("the default form finds the same file wrong", plans.planProblems(PLAN).length > 0, "no problems")
const tpl = plans.planTemplate(5, "x", "y", form)
cell("the template follows the form", tpl.includes("### Ш.1") && tpl.includes("Цель:") && tpl.includes("**Проверка:**") && tpl.includes("## Вне плана") && !tpl.includes("Без упрощений"), tpl)
cell("the round rules name the project's grades", /важное \(major\)/.test(plans.roundRules(form.grades)) && /нет замечаний градаций: важное/.test(plans.roundRules(form.grades)), plans.roundRules(form.grades))
cell("bad settings fall back to the defaults", core.planFormOf({ plan_grades: [{ id: "x", name: "x", text: "", clean: true }], plan_prefix: " " }).grades.length === 3 && core.planFormOf({ plan_prefix: " " }).prefix === "Ф", "no fallback")

// 2. the plugin with these settings
const mod = await import("../index.ts")
const tools = {}
const hooks = {}
const events = {}
const delivered = []
const sessions = new Map()
const ctx = {
  location: { directory: proj },
  options: { projects: [proj] },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
    synthetic: async ({ sessionID, text }) => delivered.push({ sessionID, text, synthetic: true }),
    create: async (req) => (sessions.set(req.id, req), { id: req.id }),
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 10_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
}
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const letters = (to) => ["inbox", "read"].flatMap((d) => {
  try {
    const dir = path.join(core.BASE, d, to)
    return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
  } catch {
    return []
  }
})
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "x", providerID: "y" } })
await call("crew_role", "sesINTEG1", { role: "integrator" })
const mk = (n, extra) => {
  const t = tasks.createTask({ project: "proj", title: `план 1: своя форма`, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: `q${n}`, status: "running", kind: "spawn", directory: proj, plan: { n: "1", file: "plans/1-svoya.md", source: "задача", rounds: [], clean: 0 } })
  Object.assign(t, extra)
  tasks.saveTask(t)
  return t
}

// 3. a round with the project's grades: "minor" only is clean, "major" returns the plan
const t1 = mk(1, { status: "reviewing", reviewer: "sesREV1", review_kind: "tab", checks: Object.fromEntries(core.loadConfig(proj).planAcceptance.map((a) => [a.id, "ok"])) })
await hooks.context({ sessionID: "sesREV1", system: [], model: { id: "x", providerID: "y" } })
const bad = await call("crew_task", "sesREV1", { action: "round", n: t1.n, blocking: 0, significant: 0, cosmetic: 0 })
cell("a round must name the project's grades", /major \(важное\), minor \(мелкое\)/.test(bad), bad)
const v = await call("crew_task", "sesREV1", { action: "round", n: t1.n, grades: { major: 0, minor: 2 }, text: "[мелкое] опечатки" })
cell("only the clean grade: a clean round", tasks.loadTask("proj", t1.n).plan.clean === 1 && /важное 0, мелкое 2/.test(v), v)

// 4. plan_decide by the integrator (plan_approver: integrator); others are refused
const t2 = mk(2, { status: "approval" })
await until(() => letters("sesINTEG1").some((l) => /ждёт твоего согласования/.test(l.text)))
cell("the integrator, not the owner, is asked to approve", letters("sesINTEG1").some((l) => /План 1 .*ждёт твоего согласования: crew_task \{action: "plan_decide"/.test(l.text)), JSON.stringify(letters("sesINTEG1").map((l) => l.text.slice(0, 120))))
const notAuthor = await call("crew_task", "sesREV1", { action: "plan_decide", n: t2.n, decision: "ok" })
cell("only the author decides", /согласует автор задачи/.test(notAuthor), notAuthor)
const ok = await call("crew_task", "sesINTEG1", { action: "plan_decide", n: t2.n, decision: "ok" })
await until(() => tasks.loadTask("proj", t2.n).status === "submitted")
cell("the integrator's decision is applied like the owner's", tasks.loadTask("proj", t2.n).status === "submitted" && tasks.loadTask("proj", t2.n).plan.approval?.decision === "ok" && /записано/.test(ok), JSON.stringify({ ok, st: tasks.loadTask("proj", t2.n).status }))

// 5. plan_steps: manual -- a merged plan's steps are listed to the author, no tasks are made
mk(3, { status: "cleaned", plan: { n: "1", file: "plans/1-svoya.md", source: "задача", rounds: [], clean: 2, approval: { decision: "ok", at: Date.now() } } })
await until(() => letters("sesINTEG1").some((l) => /plan_steps: manual/.test(l.text)))
const listed = letters("sesINTEG1").find((l) => /plan_steps: manual/.test(l.text))
cell("manual steps: one letter lists them, no step tasks", !!listed && /Ш\.1\.1 шаг один: сделать раз/.test(listed.text) && /приёмка: тест 1\/1/.test(listed.text) && !tasks.listTasks("proj").some((x) => x.plan_step), JSON.stringify(listed?.text))

stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-plan-config.test: FAIL ${fail}` : "crew-plan-config.test ok")
process.exit(fail ? 1 : 0)

// ПЛАНЫ (план 012, 2026-10-06). Документ плана в репозитории проекта: шапка, разделы, фазы → шаги, у шага — приёмка.
// Здесь — шаблон, разбор файла и машинные критерии приёмки плана (planProblems). Чистые функции: текст на входе,
// структура или список замечаний на выходе; файлы читает и пишет вызывающий. Модуль без зависимостей плагина.
// ФОРМА ПЛАНА НАСТРАИВАЕТСЯ (владелец 2026-10-06: «всё должно быть настраиваемо»): имена разделов и полей шапки,
// префикс фаз, метки «Что» и «Приёмка», отметки, вопрос о режиме, градации замечаний — PlanForm из настроек проекта
// (core.ts planFormOf); умолчания — форма nova (DEFAULT_FORM).

export type Priority = "P0" | "P1" | "P2" | "P3"
export type PlanStep = {
  /** «Ф.1.2» */
  id: string
  phase: string
  title: string
  priority?: Priority
  /** «после:» — id фаз и шагов, которые должны быть закрыты до старта */
  after: string[]
  /** «где:» — модули и файлы шага (два шага с пересечением не идут одновременно) */
  where: string[]
  what: string
  criteria: string[]
  gate: boolean
  subplan: boolean
  done: boolean
}
export type PlanPhase = { id: string; title: string; priority?: Priority; after: string[]; gate: boolean; done: boolean; steps: PlanStep[] }
export type PlanQuestion = { text: string; open: boolean }
export type Plan = {
  title: string
  header: Record<string, string>
  sections: string[]
  phases: PlanPhase[]
  questions: PlanQuestion[]
  /** ответ владельца на вопрос о режиме («Без упрощений: ДА/НЕТ»); undefined — ещё не ответил */
  noShortcuts?: boolean
  noQuestionsLine: boolean
  /** текст разделов «## …» (без подразделов фаз) — например, «Не делаем» для границ задач-шагов */
  bodies: Record<string, string>
}

export type AcceptanceStep = { id: string; text: string; required: boolean }
/** Градация замечаний перепроверки: clean — замечания этой градации не мешают «чистому» раунду. */
export type Grade = { id: string; name: string; text: string; clean: boolean }
/** Разделы по ролям (имена — настройка). */
export type SectionRoles = { why: string; existing: string; mode: string; phases: string; out: string; questions: string; decisions: string }
export type PlanMarks = {
  plan_open: string
  plan_work: string
  plan_closed: string
  plan_cancelled: string
  step_work: string
  step_done: string
  criterion_open: string
  criterion_done: string
  question_open: string
  question_answered: string
}
export type PlanForm = {
  sections: SectionRoles
  /** обязательные поля шапки «**Поле:**» */
  header: string[]
  /** префикс фаз и шагов: «Ф» → «### Ф.1 — …», «#### Ф.1.2 — …» */
  prefix: string
  whatLabel: string
  criteriaLabel: string
  marks: PlanMarks
  /** вопрос владельцу о режиме выполнения — включён ли; его метка («Без упрощений») */
  modeQuestion: boolean
  modeLabel: string
  grades: Grade[]
}

export const DEFAULT_SECTIONS: SectionRoles = { why: "Зачем", existing: "Что уже есть", mode: "Режим выполнения", phases: "Фазы", out: "Не делаем", questions: "Открытые вопросы", decisions: "Решения владельца" }
export const DEFAULT_MARKS: PlanMarks = {
  plan_open: "🔴 ОТКРЫТ",
  plan_work: "🟡 В РАБОТЕ",
  plan_closed: "✅ ЗАКРЫТ",
  plan_cancelled: "❌ ОТМЕНЁН",
  step_work: "⏳ В РАБОТЕ",
  step_done: "✅ СДЕЛАНО",
  criterion_open: "⬜",
  criterion_done: "✅ ВЫПОЛНЕНО",
  question_open: "❔",
  question_answered: "✅",
}
export const DEFAULT_GRADES: Grade[] = [
  { id: "blocking", name: "блокирующее", text: "план не решает задачу или ведёт к неверному результату (требование без шага; неверное допущение; критерий, который не может покраснеть; невыполнимый шаг; выход за границы)", clean: false },
  { id: "significant", name: "существенное", text: "исправление меняет содержание плана: шаг, критерий, порядок, зависимость, границы, вопрос (неполный критерий; пропущен крайний случай; неявная зависимость; шаг больше одной задачи; нет пробы красноты)", clean: false },
  { id: "cosmetic", name: "косметическое", text: "только текст, смысл плана не меняется (формулировка, опечатка, оформление)", clean: true },
]
export const DEFAULT_FORM: PlanForm = {
  sections: DEFAULT_SECTIONS,
  header: ["Статус", "Источник", "Зависимости"],
  prefix: "Ф",
  whatLabel: "Что",
  criteriaLabel: "Приёмка",
  marks: DEFAULT_MARKS,
  modeQuestion: true,
  modeLabel: "Без упрощений",
  grades: DEFAULT_GRADES,
}
/** Обязательные разделы формы (решения владельца — по желанию; режим — если вопрос включён). */
export const requiredSections = (f: PlanForm) => [f.sections.why, f.sections.existing, ...(f.modeQuestion ? [f.sections.mode] : []), f.sections.phases, f.sections.out, f.sections.questions]
// прежние имена (модули и тесты, написанные до настроек)
export const PLAN_SECTIONS = requiredSections(DEFAULT_FORM)
export const PLAN_HEADER = DEFAULT_FORM.header

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Шаблон нового плана — в письме исполнителю задачи-плана. */
export function planTemplate(n: number | string, title: string, source: string, f: PlanForm = DEFAULT_FORM): string {
  const s = f.sections
  const m = f.marks
  const p = f.prefix
  const header = f.header.map((h) => `**${h}:** ${h === "Статус" ? m.plan_open : h === "Источник" ? source : `<${h.toLowerCase()}>`}`)
  return [
    `# План ${n} — ${title}`,
    "",
    ...header,
    "**Перепроверка:** <раунды пишет перепроверка>",
    "",
    `## ${s.why}`,
    "<что не так сейчас — с замером; что опровергло бы этот замер>",
    `## ${s.existing}`,
    "<проверено командой: что в дереве уже сделано и делать не надо>",
    ...(f.modeQuestion ? [`## ${s.mode}`, `${f.modeLabel}: ${m.question_open} — вопрос владельцу (ДА: ни заглушек, ни TODO, ни «временно»; НЕТ: какие упрощения допустимы и где)`] : []),
    `## ${s.phases}`,
    `### ${p}.1 — <название фазы> [P1] [после: —]`,
    `#### ${p}.1.1 — <шаг: одна задача, один ответ на «когда готово»> [P1] [после: —] [где: <модули, файлы>]`,
    `${f.whatLabel}: <что сделать>`,
    `**${f.criteriaLabel}:**`,
    `- ${m.criterion_open} <что запустить> → <что должно быть зелёным>; доказательство: <строка вывода>; краснота: <как сломать → красное>`,
    `## ${s.out}`,
    "<границы: что в этот план не входит>",
    `## ${s.questions}`,
    `- ${m.question_open} <вопрос> · адресат: <кто> · умолчание: <что делаем, если молчат> · срок: <до когда> · **Блокирует:** <${p}.N / всё / —>`,
    `## ${s.decisions}`,
    "| № | решение | дата |",
    "|---|---------|------|",
  ].join("\n")
}

const PRIO = /\[(P[0-3])\]/
const listTag = (s: string, tag: string) => {
  const m = new RegExp(`\\[${tag}:\\s*([^\\]]*)\\]`, "i").exec(s)
  return m ? m[1].split(/[,;]/).map((x) => x.trim()).filter((x) => x && x !== "—" && x !== "-") : []
}

/** Разбор файла плана по форме. */
export function parsePlan(text: string, f: PlanForm = DEFAULT_FORM): Plan {
  const s = f.sections
  const m = f.marks
  const p = esc(f.prefix)
  const done = new RegExp(esc(m.step_done))
  const cleanTitle = (x: string) =>
    x
      .replace(/\[[^\]]*\]/g, "")
      .replace(new RegExp(`${esc(m.step_done)}.*$`), "")
      .replace(new RegExp(`${esc(m.step_work)}.*$`), "")
      .replace(/—\s*GATE\b/, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[—-]\s*$/, "")
      .trim()
  const phaseRe = new RegExp(`^###\\s+(?!#)${p}\\.(\\d+)\\s*[—-]\\s*(.+)$`)
  const stepRe = new RegExp(`^####\\s+${p}\\.(\\d+)\\.(\\d+)\\s*[—-]\\s*(.+)$`)
  const whatRe = new RegExp(`^${esc(f.whatLabel)}:\\s*(.+)$`)
  const critRe = new RegExp(`^\\*\\*${esc(f.criteriaLabel)}[^*]*\\*\\*`)
  const qRe = new RegExp(`^\\s*[-*]\\s*(${esc(m.question_open)}|${esc(m.question_answered)})\\s*(.+)$`)
  const modeRe = new RegExp(`${esc(f.modeLabel)}:\\s*(ДА|НЕТ)(?![А-Яа-яЁё])`, "i")
  const critItem = new RegExp(`^\\s*[-*]\\s*(?:${esc(m.criterion_open)}|${esc(m.criterion_done)}|✅)?\\s*(.+)$`)
  const lines = text.replace(/\r/g, "").split("\n")
  const plan: Plan = { title: "", header: {}, sections: [], phases: [], questions: [], noQuestionsLine: false, bodies: {} }
  let section = ""
  let step: PlanStep | undefined
  let inCriteria = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    let r: RegExpExecArray | null
    if ((r = /^#\s+(.+)$/.exec(line)) && !plan.title) {
      plan.title = r[1].trim()
      continue
    }
    if ((r = /^\*\*([^*:]+):\*\*\s*(.*)$/.exec(line)) && !plan.sections.length) {
      plan.header[r[1].trim()] = r[2].trim()
      continue
    }
    if ((r = /^##\s+(?!#)(.+)$/.exec(line))) {
      section = r[1].trim()
      plan.sections.push(section)
      plan.bodies[section] = ""
      step = undefined
      inCriteria = false
      continue
    }
    if ((r = phaseRe.exec(line))) {
      const rest = r[2]
      plan.phases.push({ id: `${f.prefix}.${r[1]}`, title: cleanTitle(rest), priority: PRIO.exec(rest)?.[1] as Priority | undefined, after: listTag(rest, "после"), gate: /\bGATE\b/.test(rest), done: done.test(rest), steps: [] })
      step = undefined
      inCriteria = false
      continue
    }
    if ((r = stepRe.exec(line))) {
      const rest = r[3]
      const phaseId = `${f.prefix}.${r[1]}`
      const phase = plan.phases.find((x) => x.id === phaseId)
      step = { id: `${phaseId}.${r[2]}`, phase: phaseId, title: cleanTitle(rest), priority: PRIO.exec(rest)?.[1] as Priority | undefined, after: listTag(rest, "после"), where: listTag(rest, "где"), what: "", criteria: [], gate: /\bGATE\b/.test(rest), subplan: /\[подплан\]/i.test(rest), done: done.test(rest) }
      if (phase) phase.steps.push(step)
      else plan.phases.push({ id: phaseId, title: "", after: [], gate: false, done: false, steps: [step] })
      inCriteria = false
      continue
    }
    if (section && section !== s.phases && !/^#{3,}/.test(line)) plan.bodies[section] = `${plan.bodies[section]}${line}\n`
    if (section.startsWith(s.questions)) {
      if ((r = qRe.exec(line))) plan.questions.push({ text: r[2].trim(), open: r[1] === m.question_open })
      if (/Открытых вопросов нет/i.test(line)) plan.noQuestionsLine = true
      continue
    }
    if (section.startsWith(s.mode) && (r = modeRe.exec(line))) {
      plan.noShortcuts = r[1].toUpperCase() === "ДА"
      continue
    }
    if (!step) continue
    if ((r = whatRe.exec(line.trim()))) {
      step.what = r[1].trim()
      inCriteria = false
      continue
    }
    if (critRe.test(line.trim())) {
      inCriteria = true
      continue
    }
    if (inCriteria && (r = critItem.exec(line))) step.criteria.push(r[1].trim())
  }
  return plan
}

export const allSteps = (p: Plan) => p.phases.flatMap((f) => f.steps)

/** Машинные критерии приёмки плана (1–5 плана 012): пусто — форма в порядке. */
export function planProblems(text: string, f: PlanForm = DEFAULT_FORM): string[] {
  const p = parsePlan(text, f)
  const out: string[] = []
  if (!p.title) out.push("нет заголовка «# План N — название»")
  for (const h of f.header) if (!p.header[h]) out.push(`в шапке нет «**${h}:**»`)
  for (const s of requiredSections(f)) if (!p.sections.some((x) => x.startsWith(s))) out.push(`нет раздела «## ${s}»`)
  const steps = allSteps(p)
  if (!p.phases.length || !steps.length) out.push(`нет ни одной фазы «### ${f.prefix}.N — …» с шагом «#### ${f.prefix}.N.M — …»`)
  for (const s of steps) {
    if (!s.what) out.push(`${s.id}: нет строки «${f.whatLabel}: …»`)
    if (!s.criteria.length) out.push(`${s.id}: нет блока «**${f.criteriaLabel}:**» с критериями`)
  }
  for (const q of p.questions.filter((q) => q.open))
    for (const [k, name] of [
      [/адресат:/i, "адресат"],
      [/умолчание:/i, "умолчание"],
      [/срок:/i, "срок"],
      [/Блокирует/i, "«Блокирует»"],
    ] as const)
      if (!k.test(q.text)) out.push(`открытый вопрос «${q.text.slice(0, 60)}» — нет: ${name}`)
  if (!p.questions.length && !p.noQuestionsLine) out.push(`«${f.sections.questions}» пусты: напиши вопросы четвёркой или «Открытых вопросов нет, проверено <дата>»`)
  const ids = new Set([...p.phases.map((x) => x.id), ...steps.map((s) => s.id)])
  for (const x of [...p.phases, ...steps]) for (const a of x.after) if (!ids.has(a)) out.push(`${x.id}: «после: ${a}» — такой фазы или шага нет`)
  const cyc = afterCycle(p)
  if (cyc) out.push(`зависимости по кругу: ${cyc}`)
  return out
}

/** Шаг ждёт: его «после», «после» его фазы. Фаза ждёт все шаги фаз из своего «после». */
export function stepDeps(p: Plan, s: PlanStep): string[] {
  const phase = p.phases.find((x) => x.id === s.phase)
  const phaseIds = new Set(p.phases.map((x) => x.id))
  const expand = (id: string) => (phaseIds.has(id) ? (p.phases.find((x) => x.id === id)?.steps.map((x) => x.id) ?? []) : [id])
  return [...new Set([...s.after, ...(phase?.after ?? [])].flatMap(expand).filter((x) => x !== s.id))]
}

function afterCycle(p: Plan): string | undefined {
  const steps = allSteps(p)
  const deps = new Map(steps.map((s) => [s.id, stepDeps(p, s)]))
  const state = new Map<string, number>()
  const path: string[] = []
  const visit = (id: string): string | undefined => {
    if (state.get(id) === 2) return undefined
    if (state.get(id) === 1) return [...path.slice(path.indexOf(id)), id].join(" → ")
    state.set(id, 1)
    path.push(id)
    for (const d of deps.get(id) ?? []) {
      const c = visit(d)
      if (c) return c
    }
    path.pop()
    state.set(id, 2)
    return undefined
  }
  for (const s of steps) {
    const c = visit(s.id)
    if (c) return c
  }
  return undefined
}

/** Шаги приёмки задачи-плана (план 012): А — против исходной задачи, Б — правильность составления. */
export const PLAN_ACCEPTANCE: AcceptanceStep[] = [
  { id: "a1-goal", text: "цель плана своими словами совпадает с исходной задачей (Источник); расхождение — замечание", required: true },
  { id: "a2-coverage", text: "покрытие: таблица «требование задачи → шаг → критерий» без пустых клеток", required: true },
  { id: "a3-assumptions", text: "допущения проверены командой или помечены «найдено чтением»; очевидная альтернатива названа и отвергнута с причиной", required: true },
  { id: "a4-scope", text: "лишнего нет: всё вне задачи — в «Не делаем» или отдельным планом", required: true },
  { id: "a5-existing", text: "«Что уже есть» проверено командой: план не делает сделанное", required: true },
  { id: "a6-mode", text: "«Режим выполнения» есть: без упрощений — вопрос владельцу (ответ даёт владелец при согласовании)", required: true },
  { id: "b1-criteria", text: "приёмка каждого шага машинная: что запустить, что зелёное, строка-доказательство, проба красноты — или «приёмка глазами, потому что …»", required: true },
  { id: "b2-tools", text: "инструмент каждого критерия проверен на «до» и «после»: критерий может покраснеть", required: true },
  { id: "b3-one-task", text: "шаг — одна задача: один ответ на «когда готово», помещается в одну сессию", required: true },
  { id: "b4-deps", text: "зависимости явные («после:»), шаги, которые держат остальные, помечены GATE; «где:» назван у шагов, что правят код", required: true },
  { id: "b5-paths", text: "пути, файлы, стражи и скрипты, названные в плане, существуют", required: true },
  { id: "b6-form", text: "нет оценок сроков и повторов абзацев; отметки — значком и словом по форме плана", required: true },
]

/** Шаги приёмки согласованного плана: записать решение владельца и влить (план 012, шаг 3). */
export const PLAN_MERGE_ACCEPTANCE: AcceptanceStep[] = [
  { id: "approval-written", text: "в плане записано решение владельца: в «Режиме выполнения» — «Без упрощений: ДА/НЕТ — владелец, дата», строка в «Решения владельца», Статус — 🟡 В РАБОТЕ", required: true },
  { id: "form", text: "форма плана в порядке: плагин проверит файл в целевой ветке при accept", required: true },
]

/** Номер нового плана: следующий после занятых файлами папки планов и открытыми задачами-планами; подплан — «родитель.k». */
export function nextPlanNumber(fileNames: string[], reserved: string[], parent?: string): string {
  const tokens = [...fileNames.map((f) => /^(\d+(?:\.\d+)*)[-_.]/.exec(f)?.[1]).filter(Boolean), ...reserved] as string[]
  if (parent) {
    const subs = tokens.filter((x) => x.startsWith(`${parent}.`) && !x.slice(parent.length + 1).includes(".")).map((x) => Number(x.slice(parent.length + 1)))
    return `${parent}.${(subs.length ? Math.max(...subs) : 0) + 1}`
  }
  const tops = tokens.map((x) => Number(x.split(".")[0])).filter((x) => Number.isFinite(x))
  return String((tops.length ? Math.max(...tops) : 0) + 1)
}

/** Градации замечаний перепроверки — текстом для писем. */
export function roundRules(grades: Grade[] = DEFAULT_GRADES): string {
  const strict = grades.filter((g) => !g.clean).map((g) => g.name)
  return [
    "ГРАДАЦИИ ЗАМЕЧАНИЙ — по тому, что придётся менять при исправлении:",
    ...grades.map((g) => `  ${g.name} (${g.id}) — ${g.text};`),
    `  Сомнение — старшая градация. Раунд чистый, когда нет замечаний градаций: ${strict.join(", ")}.`,
  ].join("\n")
}
export const ROUND_RULES = roundRules()

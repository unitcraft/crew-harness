// ПЛАНЫ (план 012, 2026-10-06). Документ плана в репозитории проекта: шапка, разделы, фазы → шаги, у шага — приёмка.
// Здесь — шаблон, разбор файла и машинные критерии приёмки плана (planProblems). Чистые функции: текст на входе,
// структура или список замечаний на выходе; файлы читает и пишет вызывающий. Модуль без зависимостей плагина.

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
  /** «Без упрощений: ДА/НЕТ» — ответ владельца; undefined — ещё не ответил */
  noShortcuts?: boolean
  noQuestionsLine: boolean
}

export const PLAN_SECTIONS = ["Зачем", "Что уже есть", "Режим выполнения", "Фазы", "Не делаем", "Открытые вопросы"] as const
export const PLAN_HEADER = ["Статус", "Источник", "Зависимости"] as const

/** Шаблон нового плана — в письме исполнителю задачи-плана. */
export function planTemplate(n: number | string, title: string, source: string): string {
  return [
    `# План ${n} — ${title}`,
    "",
    "**Статус:** 🔴 ОТКРЫТ",
    `**Источник:** ${source}`,
    "**Зависимости:** <что должно быть сделано до; для подплана — родитель>",
    "**Перепроверка:** <раунды пишет перепроверка>",
    "",
    "## Зачем",
    "<что не так сейчас — с замером; что опровергло бы этот замер>",
    "## Что уже есть",
    "<проверено командой: что в дереве уже сделано и делать не надо>",
    "## Режим выполнения",
    "Без упрощений: ❔ — вопрос владельцу (ДА: ни заглушек, ни TODO, ни «временно»; НЕТ: какие упрощения допустимы и где)",
    "## Фазы",
    "### Ф.1 — <название фазы> [P1] [после: —]",
    "#### Ф.1.1 — <шаг: одна задача, один ответ на «когда готово»> [P1] [после: —] [где: <модули, файлы>]",
    "Что: <что сделать>",
    "**Приёмка:**",
    "- ⬜ <что запустить> → <что должно быть зелёным>; доказательство: <строка вывода>; краснота: <как сломать → красное>",
    "## Не делаем",
    "<границы: что в этот план не входит>",
    "## Открытые вопросы",
    "- ❔ <вопрос> · адресат: <кто> · умолчание: <что делаем, если молчат> · срок: <до когда> · **Блокирует:** <Ф.N / всё / —>",
    "## Решения владельца",
    "| № | решение | дата |",
    "|---|---------|------|",
  ].join("\n")
}

const PRIO = /\[(P[0-3])\]/
const listTag = (s: string, tag: string) => {
  const m = new RegExp(`\\[${tag}:\\s*([^\\]]*)\\]`, "i").exec(s)
  return m ? m[1].split(/[,;]/).map((x) => x.trim()).filter((x) => x && x !== "—" && x !== "-") : []
}
const cleanTitle = (s: string) =>
  s
    .replace(/\[[^\]]*\]/g, "")
    .replace(/✅\s*СДЕЛАНО.*$/, "")
    .replace(/⏳\s*В РАБОТЕ.*$/, "")
    .replace(/—\s*GATE\b/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[—-]\s*$/, "")
    .trim()

/** Разбор файла плана по форме шаблона. */
export function parsePlan(text: string): Plan {
  const lines = text.replace(/\r/g, "").split("\n")
  const plan: Plan = { title: "", header: {}, sections: [], phases: [], questions: [], noQuestionsLine: false }
  let section = ""
  let step: PlanStep | undefined
  let inCriteria = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    let m: RegExpExecArray | null
    if ((m = /^#\s+(.+)$/.exec(line)) && !plan.title) {
      plan.title = m[1].trim()
      continue
    }
    if ((m = /^\*\*([^*:]+):\*\*\s*(.*)$/.exec(line)) && !plan.sections.length) {
      plan.header[m[1].trim()] = m[2].trim()
      continue
    }
    if ((m = /^##\s+(?!#)(.+)$/.exec(line))) {
      section = m[1].trim()
      plan.sections.push(section)
      step = undefined
      inCriteria = false
      continue
    }
    if ((m = /^###\s+(?!#)Ф\.(\d+)\s*[—-]\s*(.+)$/.exec(line))) {
      const rest = m[2]
      plan.phases.push({ id: `Ф.${m[1]}`, title: cleanTitle(rest), priority: PRIO.exec(rest)?.[1] as Priority | undefined, after: listTag(rest, "после"), gate: /\bGATE\b/.test(rest), done: /✅\s*СДЕЛАНО/.test(rest), steps: [] })
      step = undefined
      inCriteria = false
      continue
    }
    if ((m = /^####\s+Ф\.(\d+)\.(\d+)\s*[—-]\s*(.+)$/.exec(line))) {
      const rest = m[3]
      const phase = plan.phases.find((p) => p.id === `Ф.${m![1]}`)
      step = { id: `Ф.${m[1]}.${m[2]}`, phase: `Ф.${m[1]}`, title: cleanTitle(rest), priority: PRIO.exec(rest)?.[1] as Priority | undefined, after: listTag(rest, "после"), where: listTag(rest, "где"), what: "", criteria: [], gate: /\bGATE\b/.test(rest), subplan: /\[подплан\]/i.test(rest), done: /✅\s*СДЕЛАНО/.test(rest) }
      if (phase) phase.steps.push(step)
      else plan.phases.push({ id: step.phase, title: "", after: [], gate: false, done: false, steps: [step] })
      inCriteria = false
      continue
    }
    if (section === "Открытые вопросы") {
      if ((m = /^\s*[-*]\s*(❔|✅)\s*(.+)$/.exec(line))) plan.questions.push({ text: m[2].trim(), open: m[1] === "❔" })
      if (/Открытых вопросов нет/i.test(line)) plan.noQuestionsLine = true
      continue
    }
    if (section === "Режим выполнения" && (m = /Без упрощений:\s*(ДА|НЕТ)(?![А-Яа-яЁё])/i.exec(line))) {
      plan.noShortcuts = m[1].toUpperCase() === "ДА"
      continue
    }
    if (!step) continue
    if ((m = /^Что:\s*(.+)$/.exec(line.trim()))) {
      step.what = m[1].trim()
      inCriteria = false
      continue
    }
    if (/^\*\*Приёмка[^*]*\*\*/.test(line.trim())) {
      inCriteria = true
      continue
    }
    if (inCriteria && (m = /^\s*[-*]\s*(?:⬜|✅)?\s*(.+)$/.exec(line))) step.criteria.push(m[1].trim())
  }
  return plan
}

export const allSteps = (p: Plan) => p.phases.flatMap((f) => f.steps)

/** Машинные критерии приёмки плана (1–5 плана 012): пусто — форма в порядке. */
export function planProblems(text: string): string[] {
  const p = parsePlan(text)
  const out: string[] = []
  if (!p.title) out.push("нет заголовка «# План N — название»")
  for (const h of PLAN_HEADER) if (!p.header[h]) out.push(`в шапке нет «**${h}:**»`)
  for (const s of PLAN_SECTIONS) if (!p.sections.some((x) => x.startsWith(s))) out.push(`нет раздела «## ${s}»`)
  const steps = allSteps(p)
  if (!p.phases.length || !steps.length) out.push("нет ни одной фазы «### Ф.N — …» с шагом «#### Ф.N.M — …»")
  for (const s of steps) {
    if (!s.what) out.push(`${s.id}: нет строки «Что: …»`)
    if (!s.criteria.length) out.push(`${s.id}: нет блока «**Приёмка:**» с критериями`)
  }
  for (const q of p.questions.filter((q) => q.open))
    for (const [k, name] of [
      [/адресат:/i, "адресат"],
      [/умолчание:/i, "умолчание"],
      [/срок:/i, "срок"],
      [/Блокирует/i, "«Блокирует»"],
    ] as const)
      if (!k.test(q.text)) out.push(`открытый вопрос «${q.text.slice(0, 60)}» — нет: ${name}`)
  if (!p.questions.length && !p.noQuestionsLine) out.push("«Открытые вопросы» пусты: напиши вопросы четвёркой или «Открытых вопросов нет, проверено <дата>»")
  const ids = new Set([...p.phases.map((f) => f.id), ...steps.map((s) => s.id)])
  for (const x of [...p.phases, ...steps]) for (const a of x.after) if (!ids.has(a)) out.push(`${x.id}: «после: ${a}» — такой фазы или шага нет`)
  const cyc = afterCycle(p)
  if (cyc) out.push(`зависимости по кругу: ${cyc}`)
  return out
}

/** Шаг ждёт: его «после», «после» его фазы. Фаза ждёт все шаги фаз из своего «после». */
export function stepDeps(p: Plan, s: PlanStep): string[] {
  const phase = p.phases.find((f) => f.id === s.phase)
  const expand = (id: string) => (/^Ф\.\d+$/.test(id) ? (p.phases.find((f) => f.id === id)?.steps.map((x) => x.id) ?? []) : [id])
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
export const PLAN_ACCEPTANCE: { id: string; text: string; required: boolean }[] = [
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
export const PLAN_MERGE_ACCEPTANCE: { id: string; text: string; required: boolean }[] = [
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
export const ROUND_RULES = [
  "ГРАДАЦИИ ЗАМЕЧАНИЙ — по тому, что придётся менять при исправлении:",
  "  блокирующее — план не решает задачу или ведёт к неверному результату (требование без шага; неверное допущение; критерий, который не может покраснеть; невыполнимый шаг; выход за границы);",
  "  существенное — исправление меняет содержание плана: шаг, критерий, порядок, зависимость, границы, вопрос (неполный критерий; пропущен крайний случай; неявная зависимость; шаг больше одной задачи; нет пробы красноты);",
  "  косметическое — только текст, смысл плана не меняется (формулировка, опечатка, оформление).",
  "  Сомнение — старшая градация. Всё, что меняет хоть один шаг, критерий, порядок или границу, — не ниже существенного.",
].join("\n")

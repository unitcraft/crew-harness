// МАРШРУТ ЗАДАЧИ (задача 092). Методика (task-runner-states.md «Маршруты», «Инварианты маршрута», «Проверки реализации»; task-runner.md
// «Параметры маршрута»; task-sessions.md «Маршрут задачи») делает маршрут — «полный» или «быстрый» — ДАННЫМИ задачи: числа цикла (потолок
// заходов, чистых заходов подряд, проб в чистом заходе), основание и источник выбора, слово владельца «заводи <номер>». Плагин делает то, что
// не требует раннера: данные в записи задачи, проверку постановки быстрого пути, правило решения 51 как данные (правка постановки после слова
// завода помечает запись) и показ. Ворота В14, копия постановки и возврат на полный путь — движок продукта, здесь их нет.
//
// Модуль без ввода-вывода и без зависимостей от ядра (core.ts и tasks.ts импортируют его, обратный импорт образовал бы цикл): чистые функции,
// которые проверяет самотест. Имена полей — английские; таблица соответствия терминам методики — в README плагина, «Маршрут задачи».
import { createHash } from "node:crypto"

export type Route = "full" | "fast"
export type RouteSource = "rule" | "helper" | "human"
export type Risk = "low" | "medium" | "high"
export const ROUTES: Route[] = ["full", "fast"]
export const ROUTE_SOURCES: RouteSource[] = ["rule", "helper", "human"]
export const ROUTE_RU: Record<Route, string> = { full: "полный", fast: "быстрый" }
export const SOURCE_RU: Record<RouteSource, string> = { rule: "правило", helper: "помощник", human: "человек" }

/** Минимумы методики (task-sessions.md: «у малой задачи без риска достаточно одного чистого захода с тремя пробами»): проект может поднять, не опустить. */
export const MIN_CLEAN_RUNS = 1
export const MIN_PROBES = 3
/** Основание записи без поля маршрута (решение 40 методики): задача начата до введения маршрутов. */
export const LEGACY_BASIS = "задача начата до введения маршрутов"
/** Предупреждение решения 51: постановка изменена после слова завода. */
export const STALE_WARNING = "постановка изменена после слова завода: нужно новое слово владельца"

export type RouteNumbers = { ceiling: number; clean_runs: number; probes: number; delivery_compressed: boolean }
export type RouteSide = RouteNumbers & { weakenings: string[] }
export type Thresholds = { max_sources: number; max_parts: number; max_risk: Risk }
export type RouteSettings = { full: RouteSide; fast: RouteSide; thresholds: Thresholds }

/** Значения методики (task-runner.md, «Параметры маршрута»). */
export const METHOD_NUMBERS: Record<Route, RouteNumbers> = {
  full: { ceiling: 4, clean_runs: 2, probes: 3, delivery_compressed: false },
  fast: { ceiling: 2, clean_runs: 1, probes: 3, delivery_compressed: false },
}
export const DEFAULT_THRESHOLDS: Thresholds = { max_sources: 3, max_parts: 2, max_risk: "low" }
const RISK_RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 }

const isObj = (v: any) => !!v && typeof v === "object" && !Array.isArray(v)

/** Настройки проекта route_defaults поверх значений методики: каждый ключ отдельно, отсутствие — значение методики. Значение не той формы остаётся как есть:
 *  его отвергает проверка чисел при выборе маршрута (numberFaults), а не молчаливая замена. */
export function routeSettingsOf(raw: any): RouteSettings {
  const side = (route: Route): RouteSide => {
    const r = isObj(raw?.[route]) ? raw[route] : {}
    const m = METHOD_NUMBERS[route]
    return {
      ceiling: r.ceiling !== undefined ? r.ceiling : m.ceiling,
      clean_runs: r.clean_runs !== undefined ? r.clean_runs : m.clean_runs,
      probes: r.probes !== undefined ? r.probes : m.probes,
      delivery_compressed: r.delivery_compressed !== undefined ? r.delivery_compressed : m.delivery_compressed,
      weakenings: Array.isArray(r.weakenings) ? r.weakenings.map(String) : [],
    }
  }
  const t = isObj(raw?.thresholds) ? raw.thresholds : {}
  const int = (v: any, d: number) => (Number.isInteger(v) && v >= 0 ? v : d)
  return {
    full: side("full"),
    fast: side("fast"),
    thresholds: { max_sources: int(t.max_sources, DEFAULT_THRESHOLDS.max_sources), max_parts: int(t.max_parts, DEFAULT_THRESHOLDS.max_parts), max_risk: t.max_risk in RISK_RANK ? t.max_risk : DEFAULT_THRESHOLDS.max_risk },
  }
}

/** Числа маршрута: настройки проекта (если даны) или значения методики. */
export function numbersFor(route: Route, settings?: RouteSettings): RouteNumbers {
  const s = settings?.[route] ?? METHOD_NUMBERS[route]
  return { ceiling: s.ceiling, clean_runs: s.clean_runs, probes: s.probes, delivery_compressed: s.delivery_compressed }
}

/** Причины, по которым числа маршрута недопустимы (проверки 3 и 4 методики): чистых заходов подряд меньше минимума, проб меньше минимума, непустой
 *  перечень ослаблений, значение не той формы. Потолок заходов минимума не имеет, но это целое число не меньше 1. Пусто — допустимо. */
export function numberFaults(n: { ceiling?: unknown; clean_runs?: unknown; probes?: unknown; delivery_compressed?: unknown; weakenings?: unknown }): string[] {
  const out: string[] = []
  const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v)
  if (n.clean_runs !== undefined) {
    if (!int(n.clean_runs)) out.push("clean_runs — целое число")
    else if (n.clean_runs < MIN_CLEAN_RUNS) out.push(`clean_runs ${n.clean_runs} ниже минимума методики (${MIN_CLEAN_RUNS})`)
  }
  if (n.probes !== undefined) {
    if (!int(n.probes)) out.push("probes — целое число")
    else if (n.probes < MIN_PROBES) out.push(`probes ${n.probes} ниже минимума методики (${MIN_PROBES}): чистый заход без трёх проб не засчитывается`)
  }
  if (n.ceiling !== undefined && !(int(n.ceiling) && n.ceiling >= 1)) out.push("ceiling — целое число не меньше 1")
  if (n.delivery_compressed !== undefined && typeof n.delivery_compressed !== "boolean") out.push("delivery_compressed — true или false")
  if (n.weakenings !== undefined) {
    if (!Array.isArray(n.weakenings)) out.push("weakenings — список")
    else if (n.weakenings.length) out.push(`ослабления инвариантов маршрута не допускаются: ${n.weakenings.join(", ")}`)
  }
  return out
}

/** Поля маршрута записи задачи (задача 092). Все необязательны: запись без них читается как полный путь (routeView). */
export type RouteFields = {
  route?: Route
  /** основание выбора и кто выбрал */
  route_basis?: string
  route_source?: RouteSource
  /** что предложили правило или помощник (человек у ворот подтверждает или меняет) */
  route_proposal?: Route
  /** слово владельца «заводи N» дословно с датой и источником; дата слова отдельно */
  route_word?: string
  route_word_date?: string
  /** числа цикла: потолок заходов, чистых заходов подряд (требуется), проб в чистом заходе, сжатие сдачи */
  ceiling?: number
  clean_runs?: number
  probes?: number
  delivery_compressed?: boolean
  /** набранная серия чистых заходов; обнуляется правкой постановки после слова завода и сменой маршрута (число clean_runs — требование, обнулять его нельзя) */
  clean_series?: number
  /** перечень источников из постановки */
  sources_list?: string[]
  /** хеш постановки на момент слова завода и отметка решения 51 */
  route_message_hash?: string
  route_word_stale?: boolean
  route_stale_at?: number
}

export type RouteView = { route: Route; basis: string; source: RouteSource; legacy: boolean; proposal?: Route; word?: string; word_date?: string; stale: boolean } & RouteNumbers & { clean_series: number }

/** Маршрут записи как данные: запись без поля route — полный путь, источник «правило», основание «задача начата до введения маршрутов» (проверка 14);
 *  числа — из записи, а без них — значения полного пути. Запись при чтении не меняется. */
export function routeView(t: RouteFields): RouteView {
  const legacy = t.route !== "full" && t.route !== "fast"
  const route: Route = legacy ? "full" : (t.route as Route)
  const m = METHOD_NUMBERS[route]
  return {
    route,
    legacy,
    basis: legacy ? LEGACY_BASIS : t.route_basis ?? "",
    source: legacy ? "rule" : t.route_source && ROUTE_SOURCES.includes(t.route_source) ? t.route_source : "rule",
    proposal: t.route_proposal,
    word: t.route_word,
    word_date: t.route_word_date,
    stale: t.route_word_stale === true,
    ceiling: t.ceiling ?? m.ceiling,
    clean_runs: t.clean_runs ?? m.clean_runs,
    probes: t.probes ?? m.probes,
    delivery_compressed: t.delivery_compressed ?? m.delivery_compressed,
    clean_series: t.clean_series ?? 0,
  }
}

/** Запрос проверки цикла по записи (проверка 19): числа записи ниже минимума — отказ, цикл не запускается. */
export function cycleInput(t: RouteFields): ({ ok: true; route: Route } & RouteNumbers) | { ok: false; reason: string } {
  const v = routeView(t)
  const faults = numberFaults({ ceiling: v.ceiling, clean_runs: v.clean_runs, probes: v.probes, delivery_compressed: v.delivery_compressed })
  if (faults.length) return { ok: false, reason: `запрос проверки цикла отклонён: ${faults.join("; ")}` }
  return { ok: true, route: v.route, ceiling: v.ceiling, clean_runs: v.clean_runs, probes: v.probes, delivery_compressed: v.delivery_compressed }
}

// ---- признаки маршрута и правило выбора (task-runner.md, «Признаки и правило выбора»; КЛАССИФИКАЦИЯ_МАРШРУТА) ----

export type Features = {
  goal?: string
  sources?: number
  parts?: number
  risk?: Risk
  irreversible?: boolean
  cause_known?: boolean
  norm?: boolean
  helper?: Route
  sources_list?: string[]
}

const sectionBody = (text: string, name: string): string[] | undefined => {
  const lines = text.replace(/^﻿/, "").split("\n").map((l) => l.replace(/\r$/, ""))
  let fence = false
  const plain = lines.map((l) => {
    if (/^[ \t]*(```|~~~)/.test(l)) {
      fence = !fence
      return ""
    }
    return fence ? "" : l
  })
  const i = plain.findIndex((l) => {
    const m = /^##[ \t]+(.+?)[ \t]*$/.exec(l)
    return !!m && m[1].replace(/[ \t]*\(.*\)$/, "").trim() === name
  })
  if (i < 0) return undefined
  const end = plain.findIndex((l, k) => k > i && /^#{1,2}[ \t]/.test(l))
  return lines.slice(i + 1, end < 0 ? undefined : end)
}

const YES_NO = (v: string): boolean | undefined => (/^да(?![а-яё])/i.test(v) ? true : /^нет(?![а-яё])/i.test(v) ? false : undefined)
const RISK_WORDS: [RegExp, Risk][] = [[/^низк/i, "low"], [/^средн/i, "medium"], [/^высок/i, "high"]]

/** Признаки из раздела «Признаки маршрута» постановки; раздела нет — undefined. Нет строки или другое слово — признак не записан («не оценено»). */
export function parseFeatures(message: string | undefined): Features | undefined {
  const body = message ? sectionBody(message, "Признаки маршрута") : undefined
  if (!body) return undefined
  const f: Features = {}
  for (const raw of body) {
    const m = /^[ \t]*(?:[-*][ \t]+)?([^:]{1,60}?)[ \t]*:[ \t]*(.*?)[ \t]*$/.exec(raw)
    if (!m) continue
    const key = m[1].toLowerCase().replace(/\s+/g, " ")
    const val = m[2]
    const num = /^\d+/.exec(val)
    if (key === "цель") {
      if (val) f.goal = val
    } else if (key === "источников") {
      if (num) f.sources = Number(num[0])
    } else if (key === "частей системы") {
      if (num) f.parts = Number(num[0])
    } else if (key === "риск") {
      const r = RISK_WORDS.find(([re]) => re.test(val))
      if (r) f.risk = r[1]
    } else if (key === "необратимо") f.irreversible = YES_NO(val)
    else if (key === "причина известна") f.cause_known = YES_NO(val)
    else if (key === "касается нормы или формата") f.norm = YES_NO(val)
    else if (key === "предложение помощника") f.helper = /^полн/i.test(val) ? "full" : /^быстр/i.test(val) ? "fast" : undefined
    else if (key === "перечень источников") {
      const list = val.split(/[,;]/).map((x) => x.trim()).filter(Boolean)
      if (list.length) f.sources_list = list
    }
  }
  return f
}

export type Classification = { proposal: Route; basis: string; source: RouteSource }

/** Правило выбора маршрута (КЛАССИФИКАЦИЯ_МАРШРУТА): любое сомнение даёт «полный»; помощник может только ужесточить. Строки взаимоисключающие, порядок: признаков
 *  нет → признаки неполны → помощник предложил полный → признак за порогом → быстрый. Предложение подтверждает или меняет человек (его слово старше правила). */
export function classify(f: Features | undefined, th: Thresholds = DEFAULT_THRESHOLDS): Classification {
  if (!f) return { proposal: "full", basis: "признаки не записаны", source: "rule" }
  const lacking: string[] = []
  if (!f.goal) lacking.push("цель")
  if (f.sources === undefined) lacking.push("число_источников")
  if (f.parts === undefined) lacking.push("число_частей")
  if (f.risk === undefined) lacking.push("риск")
  if (f.irreversible === undefined) lacking.push("необратимо")
  if (f.cause_known === undefined) lacking.push("причина_известна")
  if (f.norm === undefined) lacking.push("касается_нормы")
  if (lacking.length) return { proposal: "full", basis: `признаки неполны: ${lacking.join(", ")}`, source: "rule" }
  if (f.helper === "full") return { proposal: "full", basis: "помощник предложил полный маршрут", source: "helper" }
  const over: string[] = []
  if (f.sources! > th.max_sources) over.push("число_источников")
  if (f.parts! > th.max_parts) over.push("число_частей")
  if (RISK_RANK[f.risk!] > RISK_RANK[th.max_risk]) over.push("риск")
  if (f.irreversible) over.push("необратимо")
  if (f.cause_known === false) over.push("причина_известна")
  if (f.norm) over.push("касается_нормы")
  if (over.length) return { proposal: "full", basis: `признак выходит за порог: ${over.join(", ")}`, source: "rule" }
  return { proposal: "fast", basis: "все признаки в пределах порогов", source: "rule" }
}

// ---- проверка постановки быстрого пути (ПРОВЕРКА_ПОСТАНОВКИ, СЛОВО_ЗАВОДА; проверка 22) ----

const DATE_RE = /(?<![0-9])[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])(?![0-9])/
const ISO_RE = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/
/** Дата слова: поле, а нет его — дата ГГГГ-ММ-ДД из самой цитаты (слово записано человеком вместе с датой). */
export const wordDateOf = (word: string | undefined, date: string | undefined): string => (String(date ?? "").trim() || DATE_RE.exec(String(word ?? ""))?.[0] || "")

/** Слово владельца «заводи <номер>»: не пустое, содержит «заводи», дата ГГГГ-ММ-ДД. Форму цитаты машина проверить не может (решение 50). */
export function wordFaults(word: string | undefined, date: string | undefined): string[] {
  const out: string[] = []
  const w = String(word ?? "").trim()
  if (!w) out.push("слово владельца «заводи <номер>» не названо (route_word: дословная цитата с датой и источником)")
  else if (!/заводи/i.test(w)) out.push("в слове владельца нет «заводи» (route_word: дословная цитата «заводи <номер>»)")
  if (!ISO_RE.test(String(date ?? "").trim())) out.push("дата слова не названа или не в форме ГГГГ-ММ-ДД (route_word_date)")
  return out
}

const POINT_RE = /^[ \t]*(?:[0-9]+[.)]|[-*•])[ \t]+\S|\bAC-[0-9]+/
/** Постановка быстрого пути полна: файл есть, в разделе «Критерии приёмки» хотя бы один пункт (нумерованный, маркированный или AC-N), есть строка с веткой.
 *  Формат постановки проекта — «Репозиторий: …, ветка …» — принимается так же, как строка «Ветка: <имя>» методики. */
export function briefFaults(message: string | undefined): string[] {
  if (!message || !message.trim()) return ["постановки task/message.md нет"]
  const out: string[] = []
  const crit = sectionBody(message, "Критерии приёмки")
  if (!crit) out.push("в постановке нет раздела «Критерии приёмки» (критериев приёмки нет)")
  else if (!crit.some((l) => POINT_RE.test(l))) out.push("в разделе «Критерии приёмки» нет ни одного пункта (нумерованный список или AC-N): без критериев нечем писать красный тест и считать проверку")
  const branch = /^[ \t]*(?:[-*][ \t]+)?\**(?:Ветка|Branch)\**[ \t]*:[ \t]*\S/im.test(message) || /^[^\n]*Репозиторий:[^\n]*[,;][ \t]*ветк[аи][ \t]+\S/im.test(message)
  if (!branch) out.push("в постановке нет строки с веткой («Ветка: <имя>» или «Репозиторий: …, ветка …»)")
  return out
}

/** Strict recognizer for the historical formatTaskLetter task letter. It is deliberately
 * migrate-only: modern briefs continue to use briefFaults unchanged. */
export function legacyTaskLetterFaults(message: string | undefined, expected: { project: string; n: number; title: string; branch: string; source_session?: string }): string[] {
  const text = String(message ?? "")
  const head = /^ЗАДАЧА\s+#(\d+)\s+«([^»]+)»\s+от\s+([a-z0-9_-]+)\.integrator\s+\(сессия\s+(ses[^\s)]+)\),\s+приоритет\s+P[0-3]\.$/i.exec(text.split(/\r?\n/, 1)[0] ?? "")
  if (!head || Number(head[1]) !== expected.n || head[2] !== expected.title || head[3] !== expected.project) return ["заголовок старого письма не совпадает с project/task/title существующей записи"]
  const criteria = /^КРИТЕРИИ ПРИЁМКИ:\s*(.+)$/im.exec(text)?.[1]?.trim() ?? ""
  const goal = /^ЦЕЛЬ:\s*(\S[\s\S]*?)(?=\r?\n[A-ZА-ЯЁ][^\r\n]*:|$)/im.exec(text)?.[1]?.trim() ?? ""
  const worktree = /^WORKTREE ГОТОВ:[^\r\n]*ветка\s+([^\s.)]+)[^\r\n]*$/im.exec(text)?.[1]
  const history = /^СДЕЛАНО ПРЕЖНИМ ИСПОЛНИТЕЛЕМ \(задача передана тебе\):\s*\r?\n[\s\S]+$/im.test(text)
  const faults: string[] = []
  if (!goal) faults.push("в старом письме нет непустой цели")
  if (!criteria) faults.push("в старом письме нет непустых критериев приёмки")
  if (!expected.branch || worktree !== expected.branch) faults.push("ветка в WORKTREE ГОТОВ не совпадает с веткой существующей записи")
  if (expected.source_session && head[4] !== expected.source_session) faults.push("from_session архива не совпадает с сессией автора письма")
  if (!history) faults.push("неполная форма старого письма: нет блока передачи прежнего исполнителя")
  return faults
}

// ---- правило решения 51 как данные ----

/** Хеш постановки: переводы строк Windows и хвостовые пробелы не считаются правкой. */
export const messageHash = (text: string): string => createHash("sha256").update(String(text).replace(/\r\n?/g, "\n").replace(/\s+$/, "")).digest("hex")
/** Exact UTF-8 digest for the source archive; unlike messageHash, no normalization is allowed. */
export const exactMessageHash = (text: string): string => createHash("sha256").update(String(text), "utf8").digest("hex")

/** Решение 51: постановка изменена после слова завода — запись быстрого пути помечается route_word_stale (возврат на ворота В5 нужен), серия чистых
 *  заходов обнуляется; числа, слово, трасса и история остаются. `text` — нынешний текст постановки (undefined — прочесть не удалось, ничего не известно).
 *  Возвращает true, если запись изменена (сохраняет вызывающий). */
export function markStale(t: RouteFields & { history?: { at: number; by: string; note?: string }[] }, text: string | undefined, now: number = Date.now()): boolean {
  if (t.route !== "fast" || !t.route_message_hash || t.route_word_stale || text === undefined) return false
  if (messageHash(text) === t.route_message_hash) return false
  t.route_word_stale = true
  t.route_stale_at = now
  t.clean_series = 0
  ;(t.history ??= []).push({ at: now, by: "crew-harness", note: `${STALE_WARNING}; серия чистых заходов обнулена` })
  return true
}

/** Строка журнала задачи о маршруте: «маршрут: быстрый, основание: …, источник: человек, слово завода: «…» (2026-10-18)». */
export function routeLogText(t: RouteFields): string {
  const v = routeView(t)
  const word = v.route === "fast" && v.word ? `, слово завода: ${v.word.replace(/\s+/g, " ").trim()}${v.word_date ? ` (${v.word_date})` : ""}` : ""
  return `маршрут: ${ROUTE_RU[v.route]}, основание: ${v.basis.replace(/\s+/g, " ").trim() || "не записано"}, источник: ${SOURCE_RU[v.source]}${word}`
}

// ---- выбор маршрута при постановке задачи (crew_spawn) ----

export type RouteInput = {
  route?: unknown
  route_basis?: unknown
  route_source?: unknown
  route_proposal?: unknown
  route_word?: unknown
  route_word_date?: unknown
  clean_runs?: unknown
  ceiling?: unknown
  probes?: unknown
  delivery_compressed?: unknown
  sources_list?: unknown
}
export const ROUTE_INPUT_KEYS = ["route", "route_basis", "route_source", "route_proposal", "route_word", "route_word_date", "clean_runs", "ceiling", "probes", "delivery_compressed", "sources_list"] as const
export const hasRouteInput = (input: RouteInput): boolean => ROUTE_INPUT_KEYS.some((k) => (input as any)?.[k] !== undefined && (input as any)?.[k] !== null && (input as any)?.[k] !== "")

/** Выбрать маршрут новой задачи и собрать поля записи. `brief` — текст постановки (task/message.md), как будет записан; undefined — постановки нет.
 *  Быстрый путь без условий — отказ «быстрый путь требует: …» (маршрут остаётся полным, задача без явного решения не создаётся). Числа ниже минимума
 *  методики отвергаются на любом маршруте; настройки проекта route_defaults — так же (быстрого — отказ быстрого пути, полного — отказ задачи:
 *  запасного маршрута безопаснее полного нет). */
export function planRoute(input: RouteInput, brief: string | undefined, settings: RouteSettings): { ok: true; fields: Required<Pick<RouteFields, "route" | "route_basis" | "route_source" | "ceiling" | "clean_runs" | "probes" | "delivery_compressed" | "clean_series">> & RouteFields } | { ok: false; refusal: string } {
  const raw = input?.route
  if (raw !== undefined && raw !== null && raw !== "" && !ROUTES.includes(raw as Route)) return { ok: false, refusal: `Задача не поставлена: route — full или fast (получено «${String(raw)}»). Без route задача идёт полным путём.` }
  const route: Route = raw === "fast" ? "fast" : "full"
  const own = settings[route]
  const sFaults = numberFaults(own)
  if (sFaults.length) {
    if (route === "fast") return { ok: false, refusal: `Задача не поставлена: быстрый путь требует: настройки route_defaults.fast допустимы — ${sFaults.join("; ")}. Исправь настройки проекта или поставь задачу полным путём (без route).` }
    return { ok: false, refusal: `Задача не поставлена: настройки route_defaults.full нарушают инварианты методики: ${sFaults.join("; ")}. Полный путь — запасной, безопаснее него нет: исправь настройки проекта.` }
  }
  // числа из входа: поверх настроек проекта, не ниже минимума методики
  const over: Record<string, unknown> = {}
  for (const k of ["ceiling", "clean_runs", "probes", "delivery_compressed"] as const) if (input[k] !== undefined && input[k] !== null) over[k] = input[k]
  const iFaults = numberFaults(over)
  if (iFaults.length) return { ok: false, refusal: `Задача не поставлена${route === "fast" ? ": быстрый путь требует" : ""}: числа маршрута — ${iFaults.join("; ")}. Минимумы методики не ослабляются; поднять число можно.` }
  const nums: RouteNumbers = { ...numbersFor(route, settings), ...(over as Partial<RouteNumbers>) }
  const source: RouteSource = input.route_source === undefined || input.route_source === null || input.route_source === "" ? (route === "fast" ? "human" : "rule") : (input.route_source as RouteSource)
  if (!ROUTE_SOURCES.includes(source)) return { ok: false, refusal: `Задача не поставлена: route_source — rule, helper или human (получено «${String(input.route_source)}»).` }
  const cls = classify(parseFeatures(brief), settings.thresholds)
  const proposal: Route | undefined = input.route_proposal === "full" || input.route_proposal === "fast" ? input.route_proposal : brief ? cls.proposal : undefined
  if (input.route_proposal !== undefined && input.route_proposal !== null && input.route_proposal !== "" && proposal !== input.route_proposal) return { ok: false, refusal: `Задача не поставлена: route_proposal — full или fast (получено «${String(input.route_proposal)}»).` }
  const list = Array.isArray(input.sources_list) ? input.sources_list.map((x) => String(x).trim()).filter(Boolean) : parseFeatures(brief)?.sources_list
  const common = { ...nums, clean_series: 0, ...(proposal ? { route_proposal: proposal } : {}), ...(list?.length ? { sources_list: list } : {}) }
  if (route === "full") {
    const basis = String(input.route_basis ?? "").trim() || "полный путь по умолчанию"
    return { ok: true, fields: { route, route_basis: basis, route_source: source, ...common } }
  }
  // быстрый путь: слово владельца, источник «человек», полная постановка
  const word = String(input.route_word ?? "").trim()
  const date = wordDateOf(word, input.route_word_date as string | undefined)
  const faults = [...wordFaults(word, date)]
  if (source !== "human") faults.push("быстрый путь выбирает слово человека: route_source — human (правило и помощник только предлагают)")
  faults.push(...briefFaults(brief))
  if (faults.length) return { ok: false, refusal: `Задача не поставлена: быстрый путь требует: ${faults.join("; ")}. Маршрут остаётся полным — поставь задачу без route или выполни условия.` }
  const basis = String(input.route_basis ?? "").trim() || `слово владельца ${date}; предложение правила: ${ROUTE_RU[cls.proposal]} (${cls.basis})`
  return { ok: true, fields: { route, route_basis: basis, route_source: source, route_word: word, route_word_date: date, route_message_hash: messageHash(brief!), ...common } }
}

/** Смена маршрута записью (crew_task route): быстрый → полный — только записью route и пустого route_word с причиной; серия чистых заходов обнуляется,
 *  трасса и номера заходов остаются. Полный → быстрый и новое слово завода — те же условия, что при постановке. Меняет запись на месте. */
export function applyRouteChange(t: RouteFields & { history?: { at: number; by: string; note?: string }[] }, input: RouteInput & { text?: unknown }, brief: string | undefined, settings: RouteSettings, by: string, now: number = Date.now()): { ok: true; line: string } | { ok: false; refusal: string } {
  const to: Route | undefined = input.route === "full" || input.route === "fast" ? input.route : undefined
  if (!to) return { ok: false, refusal: "route — full или fast." }
  const reason = String(input.text ?? input.route_basis ?? "").trim()
  if (to === "full") {
    if (!reason) return { ok: false, refusal: "Смена маршрута на полный записывается с причиной: text — почему (она станет основанием маршрута в журнале)." }
    const p = planRoute({ route: "full", route_basis: reason, route_source: "human" }, brief, settings)
    if (!p.ok) return p
    const was = routeView(t)
    for (const k of ["route_word", "route_word_date", "route_message_hash", "route_word_stale", "route_stale_at"] as const) delete t[k]
    Object.assign(t, p.fields, { route_word: "", clean_series: 0 })
    ;(t.history ??= []).push({ at: now, by, note: `маршрут: ${ROUTE_RU[was.route]} → полный; основание: ${reason}; слово завода снято, серия чистых заходов обнулена` })
    return { ok: true, line: routeLogText(t) }
  }
  const p = planRoute({ ...input, route: "fast", route_source: input.route_source ?? "human" }, brief, settings)
  if (!p.ok) return p
  const was = routeView(t)
  for (const k of ["route_word_stale", "route_stale_at"] as const) delete t[k]
  Object.assign(t, p.fields, { clean_series: 0 })
  ;(t.history ??= []).push({ at: now, by, note: was.route === "fast" ? `слово завода обновлено: ${p.fields.route_word} (${p.fields.route_word_date}); серия чистых заходов обнулена` : `маршрут: ${ROUTE_RU[was.route]} → быстрый по слову владельца ${p.fields.route_word_date}; серия чистых заходов обнулена` })
  return { ok: true, line: routeLogText(t) }
}

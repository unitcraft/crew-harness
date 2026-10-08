// ПРОФИЛИ МОДЕЛЕЙ И НАБОРЫ (задача 003). Чистые данные без файлов и без обращений к ядру: этапы, словари, проверка
// значений трёх ключей настроек проекта (model_profiles, profile_sets, profile_set), семья модели вкладки.
// Файл настроек читается любым JSON-читателем (в том числе сервисом задачи 001), поэтому формат — обычный JSON:
//   model_profiles: { "<семья>": { "heavy"|"medium"|"light": { "model": "провайдер/модель", "context": N, "output": N[, "input": N] } } }
//   profile_sets:   { "<имя набора>": { "develop"|"accept"|"plan"|"plan_accept": { "family": "<семья>", "tier": "heavy"|"medium"|"light"|"task" } } }
//   profile_set:    "<имя набора по умолчанию>" (ставит человек)
// Пустая запись («заполнить») — { "model": "" }. Окно — свойство профиля (модели), а не этапа.

export const STAGES = ["develop", "accept", "plan", "plan_accept"] as const
export type Stage = (typeof STAGES)[number]
export const isStage = (s: any): s is Stage => STAGES.includes(s)
/** Названия этапов в командах: латиница и русский (в файле и слое — только латиница). */
export const STAGE_WORDS: Record<string, Stage> = {
  develop: "develop",
  accept: "accept",
  plan: "plan",
  plan_accept: "plan_accept",
  разработка: "develop",
  приёмка: "accept",
  приемка: "accept",
  планирование: "plan",
  "приёмка-плана": "plan_accept",
  "приемка-плана": "plan_accept",
}
export const STAGE_RU: Record<Stage, string> = { develop: "разработка", accept: "приёмка", plan: "планирование", plan_accept: "приёмка плана" }
export const stageOfWord = (w: string): Stage | undefined => STAGE_WORDS[String(w).toLowerCase()]

export const PROFILE_TIERS = ["heavy", "medium", "light"] as const
export type PTier = (typeof PROFILE_TIERS)[number]
export const isPTier = (t: any): t is PTier => PROFILE_TIERS.includes(t)
export const CELL_TIERS = ["heavy", "medium", "light", "task"] as const
export type CellTier = (typeof CELL_TIERS)[number]
export const isCellTier = (t: any): t is CellTier => CELL_TIERS.includes(t)

export const RESERVED_WORDS = ["use", "reset", "all", "list", "show", "set", "unset", "new", "rename", "delete", "check", "save", "from"]
export const SET_NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
export const FAMILY_RE = /^[a-z0-9-]+$/
export const FAMILY_BAD = ["all", "context", "output", "input"]
export const MODEL_RE = /^[^/\s]+\/\S+$/
const PROFILE_FIELDS = ["model", "context", "output", "input"]

export type Profile = { model: string; context?: number; output?: number; input?: number }
export type Cell = { family: string; tier: CellTier }
export type Families = Record<string, Partial<Record<PTier, Profile>>>
export type Sets = Record<string, Partial<Record<Stage, Cell>>>
/** Данные профилей: справочник, наборы (то, что есть в файле со слоем поверх). */
export type Data = { profiles?: Families; sets?: Sets }

const isObj = (v: any): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)
const isPosInt = (v: any) => Number.isInteger(v) && v > 0
const isNonNegInt = (v: any) => Number.isInteger(v) && v >= 0

/** Пустая запись справочника («заполнить»): нет модели и нет окна. */
export const isEmptyProfile = (p: any): boolean => !isObj(p) || (String(p.model ?? "") === "" && !(Number(p.context) > 0))

/** Текст клетки: «семья/ступень». */
export const cellText = (c: Cell): string => `${c.family}/${c.tier}`
/** «семья/ступень» → клетка или текст ошибки. */
export function parseCell(text: string): Cell | string {
  const m = /^([^/\s]+)\/([^/\s]+)$/.exec(String(text).trim())
  if (!m) return `клетка — «семья/ступень», например claude/heavy или kimi/task; получено «${text}»`
  if (!FAMILY_RE.test(m[1]) || FAMILY_BAD.includes(m[1])) return `имя семьи «${m[1]}» не годится: строчные латинские буквы, цифры, дефис, не ${FAMILY_BAD.join("/")}`
  if (!isCellTier(m[2])) return `ступень «${m[2]}» не годится: ${CELL_TIERS.join(", ")}`
  return { family: m[1], tier: m[2] }
}

/** Ошибка имени набора или undefined. */
export function invalidSetName(name: string): string | undefined {
  if (RESERVED_WORDS.includes(name)) return `имя набора «${name}» занято словом команд (${RESERVED_WORDS.join(", ")})`
  if (!SET_NAME_RE.test(name)) return `имя набора «${name}» не годится: строчные латинские буквы, цифры, дефис, с буквы или цифры, до 40 знаков`
  return undefined
}
/** Ошибка имени семьи или undefined. */
export function invalidFamilyName(name: string): string | undefined {
  if (!FAMILY_RE.test(name)) return `имя семьи «${name}» не годится: строчные латинские буквы, цифры, дефис`
  if (FAMILY_BAD.includes(name)) return `имя семьи «${name}» занято словом команд (${FAMILY_BAD.join(", ")})`
  return undefined
}

/** Форма одного профиля (место — путь для сообщения). */
export function invalidProfile(p: any, where: string): string | undefined {
  if (!isObj(p)) return `${where}: запись {"model": "провайдер/модель", "context": число, "output": число[, "input": число]}`
  for (const k of Object.keys(p)) if (!PROFILE_FIELDS.includes(k)) return `${where}.${k}: неизвестное поле; поля — ${PROFILE_FIELDS.join(", ")}`
  if (typeof p.model !== "string") return `${where}.model: строка «провайдер/модель» (пустая строка — запись «заполнить»)`
  if (p.model === "") {
    for (const k of ["context", "output", "input"]) if (p[k] !== undefined && !isNonNegInt(p[k])) return `${where}.${k}: целое число (в пустой записи можно не задавать)`
    return undefined
  }
  if (!MODEL_RE.test(p.model)) return `${where}.model: «${p.model}» — нужно «провайдер/модель»`
  if (!isPosInt(p.context)) return `${where}.context: целое положительное число (окно, токены)`
  if (!isPosInt(p.output)) return `${where}.output: целое положительное число (предел вывода; без него OpenCode отбросит запись окна целиком)`
  if (p.input !== undefined && !isPosInt(p.input)) return `${where}.input: целое положительное число`
  if (p.input !== undefined && p.input > p.context) return `${where}.input (${p.input}) больше context (${p.context})`
  return undefined
}

/** Форма клетки набора. */
export function invalidCell(c: any, where: string): string | undefined {
  if (!isObj(c)) return `${where}: клетка {"family": "семья", "tier": "heavy"|"medium"|"light"|"task"}`
  for (const k of Object.keys(c)) if (k !== "family" && k !== "tier") return `${where}.${k}: неизвестный ключ клетки (только family и tier)`
  if (typeof c.family !== "string" || invalidFamilyName(c.family)) return `${where}.family: ${typeof c.family === "string" ? invalidFamilyName(c.family) : "имя семьи — строка"}`
  if (!isCellTier(c.tier)) return `${where}.tier: одно из ${CELL_TIERS.join(" / ")}`
  return undefined
}

/**
 * Значение ключа профилей: текст ошибки или undefined. lenientStages — незнакомый ключ-этап читатель игнорирует (файл
 * из будущей версии), а не отвергает; команды и crew_config set проверяют строго.
 */
export function invalidProfileKey(key: string, v: any, opts: { lenientStages?: boolean } = {}): string | undefined {
  if (key === "model_profiles") {
    if (!isObj(v)) return `${key}: {"семья": {"heavy"|"medium"|"light": {"model": "провайдер/модель", "context": число, "output": число}}}`
    for (const [fam, tiers] of Object.entries(v)) {
      const bad = invalidFamilyName(fam)
      if (bad) return `${key}: ${bad}`
      if (!isObj(tiers)) return `${key}.${fam}: {"heavy"|"medium"|"light": запись}`
      for (const [t, p] of Object.entries(tiers)) {
        if (!isPTier(t)) return `${key}.${fam}.${t}: ступень — одно из ${PROFILE_TIERS.join(", ")}`
        const e = invalidProfile(p, `${key}.${fam}.${t}`)
        if (e) return e
      }
    }
    return undefined
  }
  if (key === "profile_sets") {
    if (!isObj(v)) return `${key}: {"имя набора": {"develop"|"accept"|"plan"|"plan_accept": {"family": "семья", "tier": "heavy"|"medium"|"light"|"task"}}}`
    for (const [name, stages] of Object.entries(v)) {
      const bad = invalidSetName(name)
      if (bad) return `${key}: ${bad}`
      if (!isObj(stages)) return `${key}.${name}: {этап: клетка}`
      for (const [st, cell] of Object.entries(stages)) {
        if (!isStage(st)) {
          if (opts.lenientStages) continue
          return `${key}.${name}.${st}: неизвестный этап; этапы — ${STAGES.join(", ")}`
        }
        const e = invalidCell(cell, `${key}.${name}.${st}`)
        if (e) return e
      }
    }
    return undefined
  }
  if (key === "profile_set") {
    if (typeof v !== "string") return `${key}: имя набора — строка`
    return invalidSetName(v)
  }
  return `неизвестный ключ профилей «${key}»`
}
export const PROFILE_KEYS = ["model_profiles", "profile_sets", "profile_set"]

/** Модель в виде «провайдер/id» без варианта после «#», в нижнем регистре. */
export const normModel = (m: any): string => String(m ?? "").split("#")[0].trim().toLowerCase()

/**
 * Семья вкладки по справочнику: строка модели приводится к «провайдер/id» и сравнивается целиком с моделью профилей на
 * любой ступени; gpt-5.5 и gpt-5.5-fast — разные модели. Вне справочника — undefined.
 */
export function familyOfModel(model: any, profiles: Families | undefined): string | undefined {
  const m = normModel(model)
  if (!m || !isObj(profiles)) return undefined
  for (const fam of Object.keys(profiles).sort()) {
    const tiers = profiles[fam]
    if (!isObj(tiers)) continue
    for (const p of Object.values(tiers)) if (isObj(p) && p.model && normModel(p.model) === m) return fam
  }
  return undefined
}

/** Этап сессии по виду запуска: задача-план — планирование и приёмка плана, остальное — разработка и приёмка. */
export function stageOfLaunch(t: { plan?: unknown }, role: "executor" | "reviewer"): Stage {
  if (role === "executor") return t.plan ? "plan" : "develop"
  return t.plan ? "plan_accept" : "accept"
}

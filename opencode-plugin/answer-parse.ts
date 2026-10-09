// РЕЖИМЫ ОТВЕТА НА ВОПРОСЫ СЕССИЙ (задача 007, ADR-0010): чистая логика без чтения файлов и без импорта core.ts —
// её импортируют схема настроек (config-schema.ts) и проверка настроек (settings.ts), а core.ts импортирует их. Здесь
// пока настройки: карта «тип вопроса → режим» (answer_mode) и предел ответов подряд (answer_max). Разбор ответа сессии
// и словарь слов ворот добавляют следующие шаги плана.

export const ANSWER_TYPES = ["requirements", "plan", "implementation", "default"] as const
export const ANSWER_MODES = ["owner", "recommendations"] as const
export type AnswerType = (typeof ANSWER_TYPES)[number]
export type AnswerMode = (typeof ANSWER_MODES)[number]
/** Карта типов с принятыми записями: что не принято, в карте отсутствует (читается как «не задано»). */
export type AnswerMap = Partial<Record<AnswerType, AnswerMode>>

/** Предел ответов подряд одной сессии по умолчанию. */
export const ANSWER_MAX_DEFAULT = 3

/**
 * Карта режимов из значения ключа answer_mode. Принимаются типы requirements / plan / implementation / default и режимы
 * owner / recommendations; всё иное — замечание и «запись отсутствует»: тип берёт default, а нет default — owner.
 * Тип gate в карте не принимается, режим agent не поддерживается. Нет значения — пустая карта без замечаний.
 */
export function normalizeAnswerMode(raw: unknown): { map: AnswerMap; notes: string[] } {
  const map: AnswerMap = {}
  const notes: string[] = []
  if (raw === undefined || raw === null) return { map, notes }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    notes.push(`answer_mode: нужен объект {"тип": "режим"}, значение не принято (все вопросы идут владельцу)`)
    return { map, notes }
  }
  for (const [type, mode] of Object.entries(raw as Record<string, unknown>)) {
    if (type === "gate") {
      notes.push(`answer_mode: тип gate в карте не принимается (ворота всегда за владельцем), запись игнорируется`)
      continue
    }
    if (!(ANSWER_TYPES as readonly string[]).includes(type)) {
      notes.push(`answer_mode: неизвестный тип «${type}» (${ANSWER_TYPES.join(", ")}), запись игнорируется`)
      continue
    }
    if (mode === "agent") {
      notes.push(`answer_mode: режим agent для типа ${type} не поддерживается в этой версии, запись игнорируется`)
      continue
    }
    if (!(ANSWER_MODES as readonly string[]).includes(mode as string)) {
      notes.push(`answer_mode: у типа ${type} режим должен быть ${ANSWER_MODES.join(" или ")}, запись игнорируется`)
      continue
    }
    map[type as AnswerType] = mode as AnswerMode
  }
  return { map, notes }
}

/** Режим типа вопроса: запись типа, затем default, затем owner. */
export function modeFor(map: AnswerMap, type: string): AnswerMode {
  const own = (ANSWER_TYPES as readonly string[]).includes(type) ? map[type as AnswerType] : undefined
  if (own) return own
  if (map.default) return map.default
  // GATE:default — запасное значение «владелец»: без записи режим выключен
  return /* GATE:default< */ "owner" /* GATE:default> */
}

/** Включён ли хоть один тип из трёх (с учётом default): единственное место решения «режимы включены». */
export const answerModesOn = (map: AnswerMap): boolean => (["requirements", "plan", "implementation"] as const).some((t) => modeFor(map, t) !== "owner")

/** Предел ответов подряд: целое ≥ 1, иначе 3. */
export const normalizeAnswerMax = (raw: unknown): number => (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : ANSWER_MAX_DEFAULT)

/** Замечания по обоим ключам для показа и врача: что в файле не принято и почему. */
export function answerNotes(rawMode: unknown, rawMax: unknown): string[] {
  const notes = normalizeAnswerMode(rawMode).notes
  if (rawMax !== undefined && rawMax !== null && normalizeAnswerMax(rawMax) === ANSWER_MAX_DEFAULT && rawMax !== ANSWER_MAX_DEFAULT) notes.push(`answer_max: нужно целое число ≥ 1, значение не принято (действует ${ANSWER_MAX_DEFAULT})`)
  return notes
}

/** Ошибка значения answer_mode для crew_config / invalid: текст или undefined. */
export function answerModeError(v: unknown): string | undefined {
  const { notes } = normalizeAnswerMode(v)
  return notes.length ? notes.join("; ") : undefined
}

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

// РАЗБОР ОТВЕТА СЕССИИ (REQ-04, REQ-05, REQ-07, REQ-11, REQ-12). Три слоя, каждый проверяется отдельно (crew-answer-parse):
// деление на блоки по строкам «В-<число>», поля по девяти именам, блок-вопрос («?» в конце строки по трём правилам места).
// Закрыто по умолчанию: всё, что разбор не понял, остаётся владельцу.

export const FIELD_NAMES = ["тип", "автоответ", "рекомендация", "варианты", "умолчание", "затрагивает", "адресат", "срок", "влияет"] as const
export type FieldName = (typeof FIELD_NAMES)[number]
/** Типы, которые вопрос вправе объявить для автоответа; gate — ворота, всегда владельцу. */
export const QUESTION_TYPES = ["requirements", "plan", "implementation"] as const

export type Field = { name: FieldName; value: string; sign?: string }
export type Block = {
  /** номер из «В-<число>»; 0 — блок без идентификатора */
  qn: number
  /** начало вопроса для письма и показа (до 100 знаков) */
  head: string
  fields: Field[]
  hasFields: boolean
  /** тип вопроса: requirements / plan / implementation / gate; «?» — неизвестный или спорный; undefined — не объявлен */
  type?: string
  recommendation: string
  recommended: boolean
  /** строка «Автоответ: допустим» есть, без спорных повторов */
  auto: boolean
  /** «?» завершает строку вне значений полей */
  qmark: boolean
  /** блок-вопрос (REQ-04) */
  question: boolean
  /** текст для слов ворот: значения полей, кроме узких форм, и строки без имени поля */
  checkText: string
  /** весь ответ владельцу (REQ-04 «отказы»): причина разбора */
  forceOwner?: string
  /** спорные повторы Рекомендации */
  recConflict?: boolean
}
export type Turn = { blocks: Block[]; ids: boolean; ownerAll?: string; failed?: string }

const QEND = /\?[)»"*_`.\s]*$/
const ID_RE = /^\s*(?:[-*]\s+)?[*_`]*[ВB]-(\d+)/
const FIELD_RE = new RegExp("^\\s*(?:[-*]\\s+)?[*_`]*\\s*(" + FIELD_NAMES.join("|") + ")\\s*(\\([^)]*\\))?\\s*[*_`]*\\s*:[*_`]*\\s*(.*)$", "i")
const strip = (s: string) => s.replace(/^[\s*_`.]+|[\s*_`.]+$/g, "")
const squash = (s: string) => s.replace(/\s+/g, " ").trim()

/** Узкие формы значений, которые не проверяются словами ворот (REQ-13). */
export const NARROW = {
  type: (v: string) => ([...QUESTION_TYPES, "gate"] as string[]).includes(strip(v).toLowerCase()),
  auto: (v: string) => strip(v).toLowerCase() === "допустим",
  deadline: (v: string) => /^(?:\d{4}-\d{2}-\d{2}|до \d{4}-\d{2}-\d{2}|\d+ (?:мин|ч|сут))$/.test(strip(v)),
  addressee: (v: string) => {
    const t = strip(v)
    return t.length <= 40 && (t === "владелец" || /^[a-z0-9-]{1,20}\.[a-z0-9-]{1,20}$/.test(t))
  },
  sign: (v: string) => /^\(\s*Сессия\s+[СC]\d+п?(?:\s*,\s*заход\s+\d+)?\s*\)$/.test(v.trim()),
}

type Line = { text: string; field?: Field; inValue?: boolean }

function lineOf(text: string): Line {
  const m = FIELD_RE.exec(text)
  if (!m) return { text }
  return { text, field: { name: m[1].toLowerCase() as FieldName, value: m[3], ...(m[2] ? { sign: m[2] } : {}) } }
}

/** Разобрать строки блока: поля, продолжение Рекомендации, «?» вне значений, текст для слов ворот. */
function buildBlock(qn: number, rawLines: string[], ids: boolean, place: "tail3" | "beforeField" | "any"): Block {
  const lines = rawLines.map(lineOf)
  // продолжение значения Рекомендации: до пустой строки, следующего поля или идентификатора
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].field?.name !== "рекомендация") continue
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]
      if (!l.text.trim() || l.field || ID_RE.test(l.text)) break
      lines[i].field!.value += "\n" + l.text.trim()
      l.inValue = true
    }
  }
  const fields = lines.filter((l) => l.field).map((l) => l.field!)
  const vals = (n: FieldName) => fields.filter((f) => f.name === n).map((f) => squash(strip(f.value)).toLowerCase())
  const types = [...new Set(vals("тип"))]
  let type: string | undefined
  if (types.length === 1) type = ([...QUESTION_TYPES, "gate"] as string[]).includes(types[0]) ? types[0] : "?"
  else if (types.length > 1) type = types.includes("gate") ? "gate" : "?"
  const autos = [...new Set(vals("автоответ"))]
  const recs = [...new Set(fields.filter((f) => f.name === "рекомендация").map((f) => squash(strip(f.value))))]
  const recommendation = recs.length === 1 ? recs[0] : recs.join(" / ")
  const noRec = (r: string) => r === "" || r === "—" || r === "-" || r === "–"
  // «?» в конце строки вне значений полей; Срок и Адресат не узкой формы — обычный текст (их «?» считается)
  const plainField = (f: Field) => (f.name === "срок" && !NARROW.deadline(f.value)) || (f.name === "адресат" && !NARROW.addressee(f.value))
  const qEnds = (l: Line) => (!l.field && !l.inValue && QEND.test(l.text)) || (!!l.field && plainField(l.field) && QEND.test(l.text))
  let qmark: boolean
  if (place === "tail3") qmark = lines.filter((l) => l.text.trim()).slice(-3).some(qEnds)
  else if (place === "beforeField") {
    const first = lines.findIndex((l) => l.field)
    qmark = lines.slice(0, first < 0 ? lines.length : first).some(qEnds)
  } else qmark = lines.some(qEnds)
  const hasQFields = fields.some((f) => f.name === "тип" || f.name === "рекомендация" || f.name === "автоответ")
  const question = ids && qn > 0 ? qmark || hasQFields : qmark
  const checkParts: string[] = []
  for (const l of lines) {
    if (!l.field) {
      if (!l.inValue) checkParts.push(l.text)
      continue
    }
    const f = l.field
    if (f.sign && !NARROW.sign(f.sign)) checkParts.push(f.sign)
    const narrow = (f.name === "тип" && NARROW.type(f.value)) || (f.name === "автоответ" && NARROW.auto(f.value)) || (f.name === "срок" && NARROW.deadline(f.value)) || (f.name === "адресат" && NARROW.addressee(f.value))
    if (!narrow) checkParts.push(f.value)
  }
  const q = lines.find((l) => qEnds(l)) ?? lines.find((l) => l.text.trim())
  const head = (q?.text ?? "").replace(ID_RE, "").replace(/^[\s:.—-]+/, "").trim().slice(0, 100)
  return {
    qn,
    head,
    fields,
    hasFields: fields.length > 0,
    ...(type !== undefined ? { type } : {}),
    recommendation,
    recommended: recs.length === 1 && !noRec(recs[0]),
    auto: autos.length === 1 && autos[0] === "допустим",
    qmark,
    question,
    checkText: checkParts.join("\n"),
    ...(recs.length > 1 ? { recConflict: true } : {}),
  }
}

/** Разбор последнего ответа хода. Не бросает: при сбое — failed (вопрос владельцу, REQ-11). */
export function parseTurn(text: string): Turn {
  try {
    const lines = String(text ?? "").replace(/\r/g, "").split("\n")
    const idAt: number[] = []
    lines.forEach((l, i) => ID_RE.test(l) && idAt.push(i))
    if (!idAt.length) {
      const b = buildBlock(0, lines, false, lines.some((l) => FIELD_RE.test(l)) ? "beforeField" : "tail3")
      const counts = (["тип", "рекомендация", "автоответ"] as const).map((n) => b.fields.filter((f) => f.name === n).length)
      if (Math.max(...counts) > 1) {
        b.forceOwner = "несколько пар полей в ответе без идентификаторов"
        return { blocks: [b], ids: false, ownerAll: b.forceOwner }
      }
      return { blocks: [b], ids: false }
    }
    const blocks: Block[] = []
    let ownerAll: string | undefined
    if (idAt[0] > 0) {
      const pre = lines.slice(0, idAt[0])
      if (pre.some((l) => FIELD_RE.test(l))) ownerAll = "поле до первого идентификатора"
      if (pre.some((l) => l.trim())) blocks.push(buildBlock(0, pre, true, "any"))
    }
    idAt.forEach((at, k) => {
      const end = k + 1 < idAt.length ? idAt[k + 1] : lines.length
      blocks.push(buildBlock(Number(ID_RE.exec(lines[at])![1]), lines.slice(at, end), true, "any"))
    })
    if (ownerAll) for (const b of blocks) b.forceOwner = ownerAll
    return { blocks, ids: true, ...(ownerAll ? { ownerAll } : {}) }
  } catch (e) {
    return { blocks: [], ids: false, failed: String(e) }
  }
}

/** Причины остатка — закрытый перечень (REQ-07). */
export const REST_REASONS = [
  "нет рекомендации",
  "нет типа/признака/неизвестный тип",
  "блок без полей",
  "ворота (тип gate)",
  "ворота (слова)",
  "сессия приёмки",
  "режим owner для типа",
  "предел автоответов",
  "нет «?» в конце строки",
] as const
export type RestReason = (typeof REST_REASONS)[number]
/** Сбой разбора или записи (REQ-11): вопрос владельцу, причина вне перечня — ошибка идёт в журнал службы. */
export const FAILURE_REASON = "сбой разбора"

export type ClassifyCtx = {
  map: AnswerMap
  /** карточка сессии содержит review (сессия приёмки) */
  review: boolean
  /** ответов подряд, уже данных до этого блока */
  count: number
  max: number
}
export type Verdict = { closed: true } | { closed: false; reason: RestReason | typeof FAILURE_REASON }

/**
 * Словарь слов ворот (REQ-13) — вторая сетка к разрешающему признаку. Сеть, а не гарантия: открытый, ложные срабатывания
 * допустимы (вопрос уходит владельцу). Записи: «основа» — подстрока в любом месте; «^основа» — с начала слова; «|слово|» —
 * слово целиком (для шумных основ). Порядок — как в спецификации; список только растёт (убрать или сузить основу можно лишь
 * по замеру на блоках «Пакета вопросов», таблицы Т-7, Т-8, Т-9 проходят целиком).
 */
export const GATE_STEMS: string[] = [
  "push", "пуш", "отправ", "github", "remote", "upstream", "мерж", "слия", "слит", "слив", "слей", "слил", "влив", "влит",
  "влей", "влил", "залит", "залей", "залив", "залил", "заль", "rebase", "squash", "master", "delete", "remove", "drop", "wipe",
  "erase", "purge", "unlink", "удал", "стир", "убра", "убир", "убер", "выкин", "выкид", "выбрас", "выброс", "снест", "снес",
  "очищ", "clean", "restart", "reboot", "рестарт", "перезапус", "перезапущ", "перезагруз", "переключ", "switch", "останов",
  "служб", "сервис", "сервер", "service", "утвержд", "утверд", "подтвержд", "подтверд", "одобр", "approv", "согласов",
  "согласу", "принима", "прими", "приемк", "spec.md", "plan.md", "опубликов", "публик", "publish", "release", "релиз",
  "deploy", "выкат", "оплат", "заплат", "купи", "деньг", "usd", "подписк", "reset", "сброс", "отмен", "cancel", "откат",
  "revert", "rollback", "потолок", "заход", "раунд", "сдач", "ограничени", "limitation", "verified", "fail", "отказ",
  "контракт", "environment", "rework", "лимит", "ворот", "принят", "принять", "приняли", "мердж", "деплой", "деплои", "ребейз",
  "дроп", "ресет", "прибит", "прибей", "миграци", "перезапис", "затер", "раскат", "выложи", "токен", "выпуск", "грохн",
  "продакш", "^предел", "|прод|", "|rm|", "очист", "^среда", "^среде", "^среду", "^средах", "^средой", "^среды", "^плати",
  "платеж", "^стер", "^сотри", "^снос", "^чист", "^почист", "|kill|", "^kill", "^force", "^merge", "|tag|", "|tags|", "|prod|",
  "^production", "^проду", "|origin|", "|gate|", "|accept|", "^accepted", "^main", "^сда", "выклад", "катим", "катит", "толкн",
  "объедин", "выпил", "убить", "передерн", "зафиксир", "фиксир", "^затрем", "^затри", "^подписыв", "^подпиш", "^подписа",
  "^затрут", "^затрет", "^rmdir", "выпуст", "сбрас", "разверн", "разверт", "обнул", "отозв", "отзов", "отзыв", "|доступ|",
  "|доступа|", "разворач", "выключ", "отключ", "архив", "уничтож", "^тег",
]

/**
 * Приведение текста к виду для сопоставления: NFKC; удаление знаков Cf (невидимые, мягкий перенос) и Mn (комбинируемые);
 * нижний регистр; «ё» → «е»; всякий знак кроме букв, цифр, точки и подчёркивания — пробел; подчёркивание на краю слова и
 * серия точек в конце слова — пробел; текст обрамляется пробелами.
 */
export function normalizeGateText(text: string): string {
  const t = String(text ?? "")
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Mn}]/gu, "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}._]/gu, " ")
    .replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, " ")
    .replace(/\.+(?=\s|$)/g, " ")
  return ` ${t.replace(/\s+/g, " ").trim()} `
}

type StemRule = { stem: string; needle: string }
const STEM_RULES: StemRule[] = GATE_STEMS.map((stem) => {
  const whole = stem.length > 2 && stem.startsWith("|") && stem.endsWith("|")
  const needle = whole ? ` ${stem.slice(1, -1)} ` : stem.startsWith("^") ? ` ${stem.slice(1)}` : stem
  return { stem, needle }
})

/**
 * Слова ворот в тексте блока (значения полей, кроме узких форм, и строки без имени поля — это собирает parseTurn в checkText).
 * Возвращает первую найденную основу или undefined.
 */
export function gateWord(text: string): string | undefined {
  const t = normalizeGateText(text)
  for (const r of STEM_RULES) if (t.includes(r.needle)) return r.stem
  return undefined
}

const rest = (reason: RestReason): Verdict => ({ closed: false, reason })

/**
 * Блок-вопрос закрывается рекомендацией только при всех условиях сразу (REQ-05). Порядок — от самого строгого: блок без полей;
 * тип gate и неизвестный тип; сессия приёмки; слова ворот; режим типа; рекомендация; разрешающий признак; предел;
 * «?» в конце строки. Сбой — остаток.
 */
export function classify(block: Block, ctx: ClassifyCtx): Verdict {
  try {
    if (!block.hasFields) return rest("блок без полей")
    if (block.forceOwner) return rest(block.type === "gate" ? "ворота (тип gate)" : "нет типа/признака/неизвестный тип")
    if (!(/* GATE:type< */ (QUESTION_TYPES as readonly string[]).includes(block.type ?? "") /* GATE:type> */)) return rest(block.type === "gate" ? "ворота (тип gate)" : "нет типа/признака/неизвестный тип")
    if (/* GATE:review< */ ctx.review /* GATE:review> */) return rest("сессия приёмки")
    if (/* GATE:words< */ gateWord(block.checkText) /* GATE:words> */) return rest("ворота (слова)")
    if (/* GATE:mode< */ modeFor(ctx.map, block.type!) /* GATE:mode> */ === "owner") return rest("режим owner для типа")
    if (!(/* GATE:rec< */ block.recommended /* GATE:rec> */)) return rest("нет рекомендации")
    if (!(/* GATE:flag< */ block.auto /* GATE:flag> */)) return rest("нет типа/признака/неизвестный тип")
    if (/* GATE:limit< */ ctx.count >= ctx.max /* GATE:limit> */) return rest("предел автоответов")
    if (!block.qmark) return rest("нет «?» в конце строки")
    return { closed: true }
  } catch {
    return { closed: false, reason: FAILURE_REASON }
  }
}

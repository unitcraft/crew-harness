// Слипшиеся слова: часть моделей (openai gpt-6.1-sol, gpt-6-astra) теряет пробелы. Признак двух видов.
//
// 1. Смесь алфавитов (задача 021): кириллица + латиница без пробела длиной от MIN_RUN знаков — потеря пробелов в длинных
//    строковых литералах. Порог: две склейки или одна в длинном тексте с редкими пробелами.
// 2. Слово и число (задача 127): русское слово из 3+ букв и цифры («потолок092», «передано16:27», «Нова110»), цифры и русское
//    слово из 4+ букв («15:21принять», «2000строк»), латинское слово и время («question15:24»), слово-«номер» (task, hold,
//    round…) и цифры («HOLD110»). Одна такая склейка — отказ, какой бы длинный ни был текст.
//
// Не склейка: метки из 1–2 букв и цифры («С6», «Э0», «В14», «С7п»), единицы («10мс», «5с»), слова с точкой или дефисом
// («Ш.2», «Я-30», «2-я»), CamelCase-идентификаторы («ВходВ14»), метка, определённая в том же тексте в обратных кавычках,
// латинские идентификаторы с цифрами вне списка слов-«номеров» (Gate14, win32, base64), ссылки, пути, хеши, блоки кода и
// инлайн-код. Измерение на корпусе репозитория — doc/tasks/127-glued-words/analysis.md.
const MIN_RUN = 20
const MIXED = /(?:[A-Za-z]+[А-Яа-яЁё]+|[А-Яа-яЁё]+[A-Za-z]+)[A-Za-zА-Яа-яЁё]*/g

/** слова, после которых по смыслу стоит номер: «task 031», «HOLD 110», «round 5», «pin 061» */
const NUMBERED = /^(?:task|hold|round|step|phase|stage|wave|pin|approved|review|session|owner|spec|plan|issue|item)[0-9]+$/i
const CYR_DIGIT = /[А-Яа-яЁё]{3,}[0-9]/
const DIGIT_CYR = /[0-9][А-Яа-яЁё]{4,}/
const CAMEL = /[a-zа-яё][A-ZА-ЯЁ]/
const TIME_CYR = /(?<![0-9])(?:[01]?[0-9]|2[0-3]):[0-5][0-9][А-Яа-яЁё]{4,}/g
const LAT_TIME = /[A-Za-z]{3,}(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?![0-9])/g
// слово (буквы, цифры, подчёркивание, дефис между частями), необязательная дробная часть и время сразу за ним
const WORD = /[A-Za-zА-Яа-яЁё0-9_]+(?:-[A-Za-zА-Яа-яЁё0-9_]+)*(?:[.,][0-9]+)?(?::[0-5][0-9](?![0-9]))?/g

export type Glued = { runs: string[]; marks: string[]; reject: boolean }

function strip(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
    .replace(/\S*[\\/]\S*/g, (m) => (/[А-Яа-яЁё]/.test(m) ? m : " "))
    .replace(/\b[0-9a-f]{7,64}\b/gi, " ")
}

/** Для склейки слова и числа: ещё и любой токен со слэшем (пути с кириллицей тоже), ссылки Markdown, тильдовые блоки. */
function stripForMarks(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
    .replace(/\]\([^)\n]*\)/g, "] ")
    .replace(/\S*[\\/]\S*/g, " ")
    .replace(/\b[0-9a-f]{7,64}\b/gi, " ")
}

export function gluedRuns(text: string): string[] {
  return (strip(text).match(MIXED) ?? []).filter((r) => r.length >= MIN_RUN)
}

/** Метки, определённые в тексте в обратных кавычках: потом они стоят без кавычек («`дер002`» … «дер002»). */
function labelsOf(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/`([^`\n]{1,60})`/g)) out.add(m[1].trim())
  return out
}

/** Слова, в которых слиплись слово и число. Каждое слово называется один раз, в порядке появления. */
export function gluedMarks(text: string): string[] {
  const t = stripForMarks(text)
  const labels = labelsOf(text)
  const found: string[] = []
  const seen = new Set<string>()
  const add = (w: string) => {
    if (seen.has(w)) return
    seen.add(w)
    found.push(w)
  }
  for (const m of t.matchAll(WORD)) {
    const token = m[0]
    const bare = token.replace(/:[0-5][0-9]$/, "").replace(/[.,][0-9]+$/, "")
    if (labels.has(token) || labels.has(bare)) continue
    let hit = false
    for (const p of bare.split(/[-_]/)) {
      if (CAMEL.test(p) || labels.has(p)) continue
      if (CYR_DIGIT.test(p) || DIGIT_CYR.test(p)) hit = true
    }
    if (!hit && !/[-_]/.test(bare) && NUMBERED.test(bare)) hit = true
    if (hit) add(token)
  }
  for (const m of t.matchAll(LAT_TIME)) add(m[0])
  for (const m of t.matchAll(TIME_CYR)) add(m[0])
  return found
}

export function gluedText(text: string): Glued {
  const runs = gluedRuns(text)
  const marks = gluedMarks(text)
  const spaces = (text.match(/\s/g) ?? []).length
  const mixed = runs.length >= 2 || (runs.length >= 1 && text.length > 150 && spaces / text.length < 0.06)
  return { runs, marks, reject: mixed || marks.length > 0 }
}

/** «потолок092» → «потолок 092», «15:21принять» → «15:21 принять»: куда вернуть пробел. */
export function gluedFix(mark: string): string {
  const letter = "A-Za-zА-Яа-яЁё"
  if (new RegExp(`[${letter}][0-9]`).test(mark)) return mark.replace(new RegExp(`([${letter}])([0-9])`), "$1 $2")
  return mark.replace(/([0-9])([А-Яа-яЁё])/, "$1 $2")
}

export type GluedWhere = "letter" | "question" | "file"

const head = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** Текст отказа: называет первые склейки и просит переписать с пробелами. */
export function gluedRefusal(g: Glued, where: GluedWhere = "letter", file?: string): string {
  const items =
    g.marks.length > 0
      ? g.marks.slice(0, 3).map((m) => `«${head(m, 40)}» → «${head(gluedFix(m), 44)}»`).join(", ")
      : `«${(g.runs[0] ?? "").slice(0, 40)}…»`
  const more = g.marks.length > 3 ? ` и ещё ${g.marks.length - 3}` : ""
  const lost = `слиплись слова (${items}${more})`
  if (where === "question")
    return `Вопрос не показан: в тексте ${lost}: модель потеряла пробелы. Перепиши вопрос и варианты с пробелами между словом и числом или временем и задай его снова.`
  if (where === "file")
    return `Файл${file ? ` ${file}` : ""} не записан: в тексте ${lost}: модель потеряла пробелы. Перепиши текст с пробелами между словом и числом или временем и запиши снова (в коде — .ts, .json, .nv — правило не действует).`
  if (g.marks.length === 0) return `Не отправлено: в тексте слиплись слова («${(g.runs[0] ?? "").slice(0, 40)}…»): модель потеряла пробелы. Перепиши письмо с пробелами; длинное — коротко, а подробности файлом и ссылкой на него.`
  return `Не отправлено: в тексте ${lost}: модель потеряла пробелы. Перепиши письмо с пробелами между словом и числом или временем; длинное — коротко, а подробности файлом и ссылкой на него.`
}

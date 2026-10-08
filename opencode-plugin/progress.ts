// ХОД РАБОТ ФОНОВЫХ СЕССИЙ — ЧИСТЫЙ РАЗБОР (задача 004). Строки журнала `progress.log`, время, ключевые слова, сессии,
// состояния панели. Модуль без файлов и без окна: ни `node:fs`, ни OpenCode, ни `status.ts` (REQ-18, AC-21) — его можно
// взять в сервис задачи 001. Файлы и обход деревьев — `progress-scan.ts`; тексты панели и диалога — `progress-view.ts`.
//
// Формат строки (Д-11, одинаков в Python-страже `scripts/guards/check-task-docs.py`):
//   <код> <k>/<N> [ЧЧ:ММ] <что сделано>
// Файл читается байтами (UTF-8, недопустимое заменяется), делится только по LF, в конце строки снимается один CR.

/** Строка журнала: только ASCII-цифры, остаток — любые знаки кроме LF (в JavaScript и в Python одинаково, Р-15). */
export const LINE_RE = /^([^ \t]+) ([0-9]+)\/([0-9]+) ([^\n]+)$/
/** Необязательное поле времени в начале подписи: `[ЧЧ:ММ]` и пробел, местное время машины (REQ-04, Р-13). */
export const TIME_RE = /^\[(?:[01][0-9]|2[0-3]):[0-5][0-9]\] /

/** Вид остановки в строке `стоп: <вид> — …` (REQ-13). */
export const STOP_KINDS = ["вопрос", "план", "ревизия", "требования", "ворота"]
const BOUNDARY = " .,:;!—–-"
const GRACE_MS = 5 * 60_000

export type Line = {
  code: string
  k: number
  n: number
  /** подпись как записана, вместе с полем времени */
  sig: string
  /** минуты от полуночи из поля `[ЧЧ:ММ]`, если оно есть и верно */
  time?: number
  /** подпись после снятия поля времени */
  text: string
}

export type Keyword = "готово" | "стоп" | "запуск" | "старт"

/** Байты журнала → строки: делятся только по LF, один CR в конце снимается, последний пустой кусок после LF — не строка. */
export function splitJournal(bytes: Uint8Array): string[] {
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)
  const parts = text.split("\n")
  if (parts.length && parts[parts.length - 1] === "") parts.pop()
  return parts.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
}

/** Одна строка → разобранная строка журнала; не по форме — undefined. */
export function parseLine(s: string): Line | undefined {
  const m = LINE_RE.exec(s)
  if (!m) return undefined
  const sig = m[4]
  const t = TIME_RE.exec(sig)
  const line: Line = { code: m[1], k: Number(m[2]), n: Number(m[3]), sig, text: sig }
  if (t) {
    line.time = Number(sig.slice(1, 3)) * 60 + Number(sig.slice(4, 6))
    line.text = sig.slice(t[0].length)
  }
  return line
}

/** Весь журнал: только строки по форме, в порядке файла. */
export function parseJournal(bytes: Uint8Array): Line[] {
  const out: Line[] = []
  for (const s of splitJournal(bytes)) {
    const l = parseLine(s)
    if (l) out.push(l)
  }
  return out
}

const startsWord = (text: string, word: string) => text.startsWith(word) && (text.length === word.length || BOUNDARY.includes(text[word.length]))

/** Ключевое слово в начале подписи (после снятого времени): слово целиком, строчными; `стоп` — только с двоеточием. */
export function keywordOf(text: string): Keyword | undefined {
  for (const w of ["готово", "запуск", "старт"] as const) if (startsWord(text, w)) return w
  if (text.startsWith("стоп:")) return "стоп"
  return undefined
}

/** Вид остановки: первое слово после `стоп:` (пробелы необязательны), если оно из списка; иначе undefined — «вид не назван». */
export function stopKind(text: string): string | undefined {
  if (!text.startsWith("стоп:")) return undefined
  const word = /^[^ \t.,:;!—–-]+/.exec(text.slice(5).replace(/^[ \t]+/, ""))?.[0]
  return word && STOP_KINDS.includes(word) ? word : undefined
}

export type Moment = { at: number; byFile: boolean }

/**
 * Момент вести: время из поля `[ЧЧ:ММ]` на день файла копии; позже файла больше чем на 5 минут — вчерашний день; позже `now`
 * больше чем на 5 минут (или поля нет) — время изменения файла и пометка «по файлу» (REQ-04). Часы — местные, через `Date`.
 */
export function momentOf(line: Line | undefined, fileMtime: number, now: number): Moment {
  if (!line || line.time === undefined) return { at: fileMtime, byFile: true }
  const f = new Date(fileMtime)
  const h = Math.floor(line.time / 60)
  const m = line.time % 60
  let at = new Date(f.getFullYear(), f.getMonth(), f.getDate(), h, m).getTime()
  if (at > fileMtime + GRACE_MS) at = new Date(f.getFullYear(), f.getMonth(), f.getDate() - 1, h, m).getTime()
  if (at > now + GRACE_MS) return { at: fileMtime, byFile: true }
  return { at, byFile: false }
}

/** Строка запуска: `<код> 0/0 [ЧЧ:ММ] запуск` (REQ-14). */
export const isLaunch = (l: Line) => l.k === 0 && l.n === 0 && keywordOf(l.text) === "запуск"

export type Session = {
  code: string
  /** порядковый номер сессии этого кода от начала журнала копии (запись «запуск без старта» тоже получает номер) */
  ordinal: number
  /** ключ сессии: код и номер; по нему сессию опознают в разных копиях (REQ-03) */
  key: string
  /** строки сессии, кроме строк запуска */
  rows: Line[]
  /** строка запуска, прикреплённая к сессии, или единственная строка записи «запуск без старта» */
  launch?: Line
}

/**
 * Журнал → сессии (Д-03). Сессию начинает строка `k = 0`, смена кода или падение k; строка запуска прикрепляется к сессии
 * того же кода, строка которой идёт следом (`старт` или, если «старт» пропущен, строка с k > 0); иначе это запись
 * «запуск без старта». Новый запуск после запуска или сессии того же кода открывает следующую сессию.
 */
export function sessionsOf(lines: Line[]): Session[] {
  const out: Session[] = []
  const count = new Map<string, number>()
  let cur: Session | undefined
  let lastK = -1
  const open = (code: string, launch?: Line) => {
    const ordinal = (count.get(code) ?? 0) + 1
    count.set(code, ordinal)
    cur = { code, ordinal, key: `${code}#${ordinal}`, rows: [], ...(launch ? { launch } : {}) }
    out.push(cur)
    lastK = -1
  }
  for (const l of lines) {
    if (isLaunch(l)) {
      open(l.code, l)
      continue
    }
    if (!cur || (cur.rows.length === 0 && cur.launch && cur.code === l.code)) {
      if (!cur) open(l.code)
    } else if (l.code !== cur.code || l.k === 0 || l.k < lastK) open(l.code)
    cur!.rows.push(l)
    lastK = l.k
  }
  return out
}

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

// ---- Пороги, состояния, видимость, названия сессий --------------------------------------------------------------------

export type Thresholds = { staleMs: number; doneMs: number; abandonMs: number }
export const DEFAULT_THRESHOLDS: Thresholds = { staleMs: 10 * 60_000, doneMs: 15 * 60_000, abandonMs: 24 * 3_600_000 }

/**
 * Пороги: 10 минут «давно нет вестей», 15 минут показа «готово» и «без единиц», 24 часа до пропадания молчащей. Переопределяются
 * переменными окружения процесса окна, значение в миллисекундах; не число, нуль и отрицательное — умолчание (REQ-10, РП-04).
 */
export function thresholdsFromEnv(env: Record<string, string | undefined> = {}): Thresholds {
  const pick = (name: string, fallback: number) => {
    const v = Number(env[name])
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  return {
    staleMs: pick("CREW_HARNESS_PROGRESS_STALE_MS", DEFAULT_THRESHOLDS.staleMs),
    doneMs: pick("CREW_HARNESS_PROGRESS_DONE_MS", DEFAULT_THRESHOLDS.doneMs),
    abandonMs: pick("CREW_HARNESS_PROGRESS_ABANDON_MS", DEFAULT_THRESHOLDS.abandonMs),
  }
}

/** Состояния таблицы REQ-04: 1 остановилась, 2 готово, 3 запущена (шагов нет), 4 без единиц, 5 идёт, 6 тишина, 7 итога нет. */
export type State = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const STATE_WORDS: Record<State, string> = {
  1: "остановилась",
  2: "готово",
  3: "запущена, шагов нет",
  4: "без единиц",
  5: "идёт",
  6: "давно нет вестей",
  7: "все шаги сделаны, итога нет",
}

/** Последняя строка сессии: её последняя строка, а у записи «запуск без старта» — строка запуска. */
export const lastOf = (s: Session): Line => (s.rows.length ? s.rows[s.rows.length - 1] : (s.launch as Line))

/** Состояние последней строки по таблице REQ-04 (первая подходящая строка таблицы). */
export function stateOf(last: Line, moment: Moment, now: number, th: Thresholds): { state: State; kind?: string } {
  const kw = keywordOf(last.text)
  if (kw === "стоп") return { state: 1, kind: stopKind(last.text) }
  if (kw === "готово" && last.n > 0) return { state: 2 }
  if (last.n === 0) return { state: kw === "запуск" ? 3 : 4 }
  if (last.k >= last.n) return { state: 7 }
  return { state: now - moment.at > th.staleMs ? 6 : 5 }
}

/** Видна ли запись в панели: «готово» и «без единиц» — 15 минут, остановившаяся, запущенная, молчащая и «итога нет» — 24 часа (REQ-05). */
export function isShown(state: State, at: number, now: number, th: Thresholds): boolean {
  const age = now - at
  if (state === 2 || state === 4) return age < th.doneMs
  if (state === 1 || state === 3 || state === 6 || state === 7) return age < th.abandonMs
  return true
}

/** Молчит дольше 24 часов (в команде такая запись «давно брошена»). */
export const isAbandoned = (state: State, at: number, now: number, th: Thresholds) => (state === 1 || state === 3 || state === 6 || state === 7) && now - at >= th.abandonMs

/** Запись о сессии для показа: последняя строка, момент вести, состояние, видимость. */
export type Entry = {
  session: Session
  last: Line
  at: number
  byFile: boolean
  state: State
  kind?: string
  /** тишина дольше порога «давно нет вестей» у состояний 3 и 6 */
  stale: boolean
  shown: boolean
  abandoned: boolean
}

export function entryOf(session: Session, fileMtime: number, now: number, th: Thresholds): Entry {
  const last = lastOf(session)
  const m = momentOf(last, fileMtime, now)
  const st = stateOf(last, m, now, th)
  return {
    session,
    last,
    at: m.at,
    byFile: m.byFile,
    state: st.state,
    ...(st.kind !== undefined ? { kind: st.kind } : {}),
    stale: (st.state === 3 || st.state === 6) && now - m.at > th.staleMs,
    shown: isShown(st.state, m.at, now, th),
    abandoned: isAbandoned(st.state, m.at, now, th),
  }
}

const SESSION_WORDS: Record<string, string> = {
  "С1": "разбор",
  "С1п": "правка разбора",
  "С2": "проверка разбора",
  "С3": "план",
  "С3п": "правка плана",
  "С4": "проверка плана",
  "С5": "реализация",
  "С5д": "продолжение реализации",
  "С5п": "правка реализации",
  "С6": "проверка реализации",
  "С7": "сдача",
  "С7п": "правка сдачи",
  "С8": "проверка сдачи",
  "С9": "разбор обратной связи",
}

/** Сессия словами: «С5 реализация»; КОММИТ, ПУШ и неизвестный код — как есть (REQ-08). */
export const sessionName = (code: string) => (SESSION_WORDS[code] ? `${code} ${SESSION_WORDS[code]}` : code)

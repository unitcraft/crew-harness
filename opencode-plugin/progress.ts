// ХОД РАБОТ ФОНОВЫХ СЕССИЙ — ЧИСТЫЙ РАЗБОР (задача 004). Строки журнала `progress.log`, время, ключевые слова, сессии,
// состояния панели. Модуль без файлов и без окна: ни `node:fs`, ни OpenCode, ни `status.ts` (REQ-18, AC-21) — его можно
// взять в сервис задачи 001. Файлы и обход деревьев — `progress-scan.ts`; тексты панели и диалога — `progress-view.ts`.
//
// Формат строки (Д-11, одинаков в Python-страже `scripts/guards/check-task-docs.py`):
//   <код> <k>/<N> [ЧЧ:ММ] <что сделано>             (прежний вид поля времени)
//   <код> <k>/<N> [ГГГГ-ММ-ДД ЧЧ:ММ] <что сделано>  (вид новых строк; расширен по слову владельца 2026-10-09)
// Файл читается байтами (UTF-8, недопустимое заменяется), делится только по LF, в конце строки снимается один CR.

/** Строка журнала: только ASCII-цифры, остаток — любые знаки кроме LF (в JavaScript и в Python одинаково, Р-15). */
export const LINE_RE = /^([^ \t]+) ([0-9]+)\/([0-9]+) ([^\n]+)$/
/**
 * Необязательное поле времени в начале подписи: `[ЧЧ:ММ]` или `[ГГГГ-ММ-ДД ЧЧ:ММ]` и пробел, местное время машины (REQ-04, Р-13;
 * вид с датой — по слову владельца 2026-10-09).
 */
export const TIME_RE = /^\[(?:[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01]) )?(?:[01][0-9]|2[0-3]):[0-5][0-9]\] /

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
  /** минуты от полуночи из поля времени, если оно есть и верно */
  time?: number
  /** дата из поля `[ГГГГ-ММ-ДД ЧЧ:ММ]`, если она есть */
  date?: { y: number; mo: number; d: number }
  /** подпись после снятия поля времени */
  text: string
}

export type Keyword = "готово" | "стоп" | "запуск" | "старт" | "поправка"

/** Байты журнала → строки: делятся только по LF, один CR в конце снимается, последний пустой кусок после LF — не строка. */
const DECODER = new TextDecoder("utf-8", { ignoreBOM: true })
export function splitJournal(bytes: Uint8Array): string[] {
  const text = DECODER.decode(bytes)
  const parts = text.split("\n")
  if (parts.length && parts[parts.length - 1] === "") parts.pop()
  return parts.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
}

/**
 * Одна строка → разобранная строка журнала; не по форме — undefined. Разбор рукой, без регулярного выражения: тот же язык, что
 * у LINE_RE (код без пробела и табуляции, пробел, цифры, косая черта, цифры, пробел, непустой остаток без LF), но быстрее;
 * тест сверяет оба разбора на общем наборе строк.
 */
export function parseLine(s: string): Line | undefined {
  return s.indexOf("\n") === -1 ? parseAt(s, 0, s.length, "") : undefined
}

// разбор строки text[from, to), в которой нет LF; `prev` — код предыдущей строки: коды в журнале идут блоками, повтор не копируется
function parseAt(text: string, from: number, to: number, prev: string): Line | undefined {
  let sp = from
  while (sp < to) {
    const c = text.charCodeAt(sp)
    if (c === 32) break
    if (c === 9) return undefined // табуляция в коде
    sp++
  }
  if (sp === from || sp >= to) return undefined
  let i = sp + 1
  let k = 0
  let c = 0
  const a = i
  while (i < to && (c = text.charCodeAt(i)) >= 48 && c <= 57) {
    k = k * 10 + (c - 48)
    i++
  }
  if (i === a || text.charCodeAt(i) !== 47) return undefined
  const b = ++i
  let n = 0
  while (i < to && (c = text.charCodeAt(i)) >= 48 && c <= 57) {
    n = n * 10 + (c - 48)
    i++
  }
  if (i === b || text.charCodeAt(i) !== 32 || i + 1 >= to) return undefined
  const sig = text.slice(i + 1, to)
  const code = prev.length === sp - from && text.startsWith(prev, from) ? prev : text.slice(from, sp)
  const line: Line = { code, k, n, sig, text: sig }
  if (sig.charCodeAt(0) === 91) {
    const m = TIME_RE.exec(sig)
    if (m) {
      const close = sig.indexOf("]")
      line.time = Number(sig.slice(close - 5, close - 3)) * 60 + Number(sig.slice(close - 2, close))
      if (close > 6) line.date = { y: Number(sig.slice(1, 5)), mo: Number(sig.slice(6, 8)), d: Number(sig.slice(9, 11)) }
      line.text = sig.slice(m[0].length)
    }
  }
  return line
}

/** Весь журнал: только строки по форме, в порядке файла. */
export function parseJournal(bytes: Uint8Array): Line[] {
  const text = DECODER.decode(bytes)
  const out: Line[] = []
  let prev = ""
  let from = 0
  while (from < text.length) {
    let nl = text.indexOf("\n", from)
    if (nl === -1) nl = text.length
    const to = nl > from && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl
    const l = parseAt(text, from, to, prev)
    if (l) {
      out.push(l)
      prev = l.code
    }
    from = nl + 1
  }
  return out
}

const startsWord = (text: string, word: string) => text.startsWith(word) && (text.length === word.length || BOUNDARY.includes(text[word.length]))

/**
 * Ключевое слово в начале подписи (после снятого времени): слово целиком, строчными, знак после него допустим; `стоп` и `поправка` —
 * только с двоеточием (методика 09e86c1, task-runner.md, «Строки progress.log»).
 */
export function keywordOf(text: string): Keyword | undefined {
  for (const w of ["готово", "запуск", "старт"] as const) if (startsWord(text, w)) return w
  if (text.startsWith("стоп:")) return "стоп"
  if (text.startsWith("поправка:")) return "поправка"
  return undefined
}

/**
 * Строка-поправка (задача 050; методика 09e86c1): `<код> <текущий k>/<N> [время] поправка: к строке «<начало>» — <что не так>`. Не единица и
 * не признак хода: k не меняет, сессию не открывает, «без прогресса» не снимает, показ `k/N` её не учитывает.
 */
export const isCorrection = (l: Line) => keywordOf(l.text) === "поправка"

/**
 * Итоговая строка, в том числе с ошибкой в ключевом слове («Готово», «стоп» без двоеточия): после неё строки той же сессии — только её
 * повтор с тем же k и ключевым словом и `стоп:` после `готово` с тем же k (методика d5f1e80, task-runner.md, «Строки progress.log»).
 */
const FINAL_LIKE_RE = /^(готово|стоп)(?:$|[ 	.,:;!—–-])/i
export const finalOf = (text: string): "done" | "stop" | undefined => {
  const m = FINAL_LIKE_RE.exec(text)
  return m ? (m[1].toLowerCase() === "готово" ? "done" : "stop") : undefined
}

/**
 * `готово — N завышено: <причина>` (методика ab2a4ef): работа сделана, а N в строке `старт` было завышено; итоговая строка и завершение и при
 * k меньше N из строки старт — сразу и после прежнего `готово` с тем же k.
 */
export const isOverstated = (text: string) => /^готово[ \t.,:;!—–-]+N завышено:/.test(text)

/** Вид остановки: первое слово после `стоп:` (пробелы необязательны), если оно из списка; иначе undefined — «вид не назван». */
export function stopKind(text: string): string | undefined {
  if (!text.startsWith("стоп:")) return undefined
  const word = /^[^ \t.,:;!—–-]+/.exec(text.slice(5).replace(/^[ \t]+/, ""))?.[0]
  return word && STOP_KINDS.includes(word) ? word : undefined
}

export type Moment = { at: number; byFile: boolean }

/**
 * Момент вести: время из поля `[ЧЧ:ММ]` на день файла копии (с датой `[ГГГГ-ММ-ДД ЧЧ:ММ]` — на названный день); позже файла больше чем на 5 минут — вчерашний день; позже `now`
 * больше чем на 5 минут (или поля нет) — время изменения файла и пометка «по файлу» (REQ-04). Часы — местные, через `Date`.
 */
export function momentOf(line: Line | undefined, fileMtime: number, now: number): Moment {
  if (!line || line.time === undefined) return { at: fileMtime, byFile: true }
  const f = new Date(fileMtime)
  const h = Math.floor(line.time / 60)
  const m = line.time % 60
  if (line.date) {
    // дата названа: она и есть день записи; несуществующий день (30 февраля) или момент позже now больше чем на 5 минут — как без даты / по файлу
    const dt = new Date(line.date.y, line.date.mo - 1, line.date.d, h, m)
    if (dt.getFullYear() === line.date.y && dt.getMonth() === line.date.mo - 1 && dt.getDate() === line.date.d) {
      return dt.getTime() > now + GRACE_MS ? { at: fileMtime, byFile: true } : { at: dt.getTime(), byFile: false }
    }
  }
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
  /**
   * сессию открыла строка `старт`, а прежняя сессия того же кода не закончилась итоговой строкой и строки запуска между ними нет: по
   * методике это вторая строка `старт` той же сессии, и её `готово` завершением не читается (задача 053, методика d5f1e80)
   */
  restart?: boolean
}

/**
 * Журнал → сессии (Д-03). Сессию начинает строка `k = 0`, смена кода или падение k; строка запуска прикрепляется к сессии
 * того же кода, строка которой идёт следом (`старт` или, если «старт» пропущен, строка с k > 0); иначе это запись
 * «запуск без старта». Новый запуск после запуска или сессии того же кода открывает следующую сессию.
 * Задача 053 (методика d5f1e80): после итоговой строки (`готово`, `стоп:`, и с ошибкой в ключевом слове) сессию продолжают только её повтор
 * с тем же k и ключевым словом и `стоп:` после `готово` с тем же k; любая другая строка того же кода открывает новую сессию.
 */
const SESSIONS = new WeakMap<Line[], Session[]>()
export function sessionsOf(lines: Line[]): Session[] {
  const hit = SESSIONS.get(lines)
  if (hit) return hit
  const out: Session[] = []
  const count = new Map<string, number>()
  let cur: Session | undefined
  let lastK = -1
  const lastByCode = new Map<string, Session>()
  const open = (code: string, launch?: Line, restart?: boolean) => {
    const ordinal = (count.get(code) ?? 0) + 1
    count.set(code, ordinal)
    cur = { code, ordinal, key: `${code}#${ordinal}`, rows: [], ...(launch ? { launch } : {}), ...(restart ? { restart } : {}) }
    out.push(cur)
    lastByCode.set(code, cur)
    lastK = -1
  }
  // строка того же кода после итоговой строки сессии, кроме её повтора и «стоп:» после «готово» с тем же k; «готово» при k меньше N из
  // строки старт итоговой строкой не является (методика ab2a4ef): за ним идут поправка и единицы, `стоп:` или `готово — N завышено`
  const afterFinal = (s: Session, l: Line) => {
    if (!s.rows.length) return false
    const last = lastOf(s)
    const f = finalOf(last.text)
    if (f === "done" && lowDone(s, last)) return false
    if (!f || l.k !== last.k) return !!f
    const g = finalOf(l.text)
    return !(g === f || (f === "done" && keywordOf(l.text) === "стоп"))
  }
  // строка старт, а прежняя сессия кода со строкой старт не закончена: вторая строка старт той же сессии по методике; у сессии без
  // строки старт это старт, дописанный не первой строкой (методика ab2a4ef: «если строки старт ещё нет, допиши её сейчас»)
  const restartOf = (l: Line) => {
    if (keywordOf(l.text) !== "старт") return false
    const prev = lastByCode.get(l.code)
    if (!prev || !prev.rows.some((r) => keywordOf(r.text) === "старт")) return false
    const last = lastOf(prev)
    return !finalOf(last.text) || lowDone(prev, last)
  }
  for (const l of lines) {
    if (isLaunch(l)) {
      open(l.code, l)
      continue
    }
    if (!cur || (cur.rows.length === 0 && cur.launch && cur.code === l.code)) {
      if (!cur) open(l.code)
    } else if (isCorrection(l) && l.code === cur.code) {
      // поправка той же сессии: не открывает сессию и не меняет k (задача 050)
      cur!.rows.push(l)
      continue
    } else if (l.code !== cur.code || l.k === 0 || l.k < lastK || afterFinal(cur, l)) open(l.code, undefined, restartOf(l))
    cur!.rows.push(l)
    lastK = l.k
  }
  SESSIONS.set(lines, out)
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

/**
 * Последняя строка сессии без строк-поправок (задача 050: поправка не единица; повтор итоговой строки в верной форме читается вместо
 * прежней — он и есть последняя строка); у записи «запуск без старта» и у сессии из одних поправок — строка запуска, иначе последняя строка.
 */
export const lastOf = (s: Session): Line => {
  for (let i = s.rows.length - 1; i >= 0; i--) if (!isCorrection(s.rows[i])) return s.rows[i]
  return s.launch ?? s.rows[s.rows.length - 1]
}

/**
 * Строка, с которой k последний раз вырос: первая из подряд идущих в конце сессии строк (кроме поправок) с тем же k, что у последней.
 * От неё считается «без прогресса» (методика 09e86c1, «Протокол прогресса», п. 3: «если k не растёт дольше порога»).
 */
export function growthOf(s: Session): Line {
  const rows = s.rows.filter((l) => !isCorrection(l))
  if (!rows.length) return lastOf(s)
  let i = rows.length - 1
  while (i > 0 && rows[i - 1].k === rows[i].k) i--
  return rows[i]
}

/**
 * Завершение `готово` (задача 053, методика d5f1e80): в сессии одна строка `старт`, и k не меньше N из неё (`9/8 готово` после `0/8 старт` —
 * завершение, `7/7 готово` после `0/10 старт` — нет, `7/10 готово — N завышено: …` — да, методика ab2a4ef); `готово` без строки старт или
 * после второй строки старт завершением не читается.
 */
export function finishes(s: Session, last: Line = lastOf(s)): boolean {
  if (keywordOf(last.text) !== "готово" || s.restart) return false
  const starts = s.rows.filter((l) => keywordOf(l.text) === "старт")
  return starts.length === 1 && (last.k >= starts[0].n || isOverstated(last.text))
}

/** `готово` при k меньше N из единственной строки старт и без «N завышено»: не итоговая строка и не завершение (методика ab2a4ef). */
export function lowDone(s: Session, last: Line = lastOf(s)): boolean {
  if (keywordOf(last.text) !== "готово" || s.restart || isOverstated(last.text)) return false
  const starts = s.rows.filter((l) => keywordOf(l.text) === "старт")
  return starts.length === 1 && last.k < starts[0].n
}

/**
 * Состояние последней строки по таблице REQ-04 (первая подходящая строка таблицы); `finished` — `готово` читается как завершение
 * (см. {@link finishes}); иначе строка читается по k и N, как строка без ключевого слова.
 */
export function stateOf(last: Line, moment: Moment, now: number, th: Thresholds, finished = true): { state: State; kind?: string } {
  const kw = keywordOf(last.text)
  if (kw === "стоп") return { state: 1, kind: stopKind(last.text) }
  if (kw === "готово" && last.n > 0 && finished) return { state: 2 }
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

/** Остановилась, запущена или молчит (1, 3, 6) и без вестей дольше 24 часов: в команде «давно брошена». «Итога нет» (7) не брошена: пропадает без пометки. */
export const isAbandoned = (state: State, at: number, now: number, th: Thresholds) => (state === 1 || state === 3 || state === 6) && now - at >= th.abandonMs

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
  // «идёт» или «давно нет вестей» — по росту k: строка с тем же k и поправка тишину не прерывают (задача 050)
  const st = stateOf(last, momentOf(growthOf(session), fileMtime, now), now, th, finishes(session, last))
  return {
    session,
    last,
    at: m.at,
    byFile: m.byFile,
    state: st.state,
    ...(st.kind !== undefined ? { kind: st.kind } : {}),
    stale: st.state === 6 || (st.state === 3 && now - m.at > th.staleMs),
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

// ---- Выбор копии журнала по каждой сессии (REQ-03) ---------------------------------------------------------------------

/** Одна копия журнала задачи: в основной копии репозитория или в связанном дереве. */
export type JournalCopy = {
  kind: "main" | "tree"
  /** имя дерева (папка записи `.git/worktrees`), у основной копии пусто */
  tree?: string
  lines: Line[]
  /** время изменения файла копии */
  mtimeMs: number
  /** время последнего движения ветки этой копии (`logs/HEAD`), если известно (REQ-17) */
  branchMs?: number
}

type Inst = { ci: number; si: number; session: Session; copy: JournalCopy }

type Pick = {
  key: string
  ci: number
  si: number
  copy: JournalCopy
  session: Session
  /** разные строки одной сессии в копиях: ни одна не начало другой (`≠`) */
  divergent: boolean
  /** сессия есть минимум в двух копиях, строки одинаковы: общее начало журналов */
  common: boolean
  /** время файла, по которому считается момент вести без поля времени (у равных копий — более раннее) */
  mtime: number
}

export type Choice = Pick & {
  /** состояние и момент вести: считаются только у кандидатов, у вытесненных сессий записи нет */
  entry: Entry
}

const sameLine = (a: Line, b: Line) => a.code === b.code && a.k === b.k && a.n === b.n && a.sig === b.sig
const sameRows = (a: Line[], b: Line[]) => a.length === b.length && a.every((l, i) => sameLine(l, b[i]))
const startsWithRows = (longer: Line[], shorter: Line[]) => shorter.length <= longer.length && shorter.every((l, i) => sameLine(l, longer[i]))

export type Chosen = {
  /** кандидаты: не вытесненные */
  candidates: Choice[]
  /** показываемая запись: кандидат с самой свежей вестью (сначала хвосты, потом общее начало) */
  shown?: Choice
  /** «+N»: другие кандидаты, не скрытые по REQ-05, без остановившихся/законченных/«итога нет», что старше показываемой записи */
  others: number
  /** число вытесненных сессий */
  displaced: number
}

/**
 * Для набора копий журнала одной задачи: сессии всех копий сводятся по ключу (код, номер); для каждой сессии выбирается копия,
 * где у неё больше строк (при равенстве — основная; расходятся — позже по времени, иначе дерево, с пометкой `≠`); вытесненные
 * сессии убираются; из кандидатов выбирается показываемая запись и считается «+N» (REQ-03). Состояние считается только у кандидатов.
 */
export function chooseSessions(copiesIn: JournalCopy[], now: number, th: Thresholds): Chosen {
  const copies = [...copiesIn].sort((a, b) => (a.kind === "main" ? 0 : 1) - (b.kind === "main" ? 0 : 1))
  if (!copies.length) return { candidates: [], others: 0, displaced: 0 }
  // выбор копий не зависит от часов, если не пришлось сравнивать моменты вести; тогда он держится по сигнатуре копий (время и размер
  // каждой — здесь это массив разобранных строк и время файла), а состояния и тексты считаются заново при каждом показе
  const sig = copies.map((c) => `${c.kind}:${idOf(c.lines)}:${c.mtimeMs}`).join("|")
  const hit = PICKS.get(copies[0].lines)
  let live: Pick[]
  let total: number
  if (hit && hit.sig === sig) {
    live = hit.live.map((p) => ({ ...p, copy: copies[p.ci] }))
    total = hit.total
  } else {
    const r = pickSessions(copies, now)
    live = r.live
    total = r.total
    if (!r.usedNow) PICKS.set(copies[0].lines, { sig, live, total })
  }
  return finishChoice(live, total, now, th)
}

const PICKS = new WeakMap<Line[], { sig: string; live: Pick[]; total: number }>()
const IDS = new WeakMap<Line[], number>()
let nextId = 1
const idOf = (lines: Line[]) => {
  let id = IDS.get(lines)
  if (!id) IDS.set(lines, (id = nextId++))
  return id
}

function pickSessions(copies: JournalCopy[], now: number): { live: Pick[]; total: number; usedNow: boolean } {
  const lists = copies.map((c) => sessionsOf(c.lines))
  let usedNow = false
  const byKey = new Map<string, Inst[]>()
  lists.forEach((ss, ci) =>
    ss.forEach((session, si) => {
      const inst = { ci, si, session, copy: copies[ci] }
      const list = byKey.get(session.key)
      if (list) list.push(inst)
      else byKey.set(session.key, [inst])
    }),
  )
  const lastMoment = (i: Inst) => {
    usedNow = true
    return momentOf(lastOf(i.session), i.copy.mtimeMs, now)
  }
  let total = 0
  const live: Pick[] = []
  for (const [key, insts] of byKey) {
    total++
    let best = insts[0]
    let divergent = false
    for (const x of insts.slice(1)) {
      const a = best.session.rows
      const b = x.session.rows
      if (!a.length && !b.length) {
        // два запуска без старта: более поздняя строка запуска, без времени — копия с более поздним файлом
        if (lastMoment(x).at >= lastMoment(best).at) best = x
      } else if (sameRows(a, b)) continue
      else if (startsWithRows(b, a)) best = x
      else if (startsWithRows(a, b)) continue
      else {
        divergent = true
        const ma = lastMoment(best)
        const mb = lastMoment(x)
        if (!ma.byFile && !mb.byFile && ma.at !== mb.at) best = mb.at > ma.at ? x : best
        else best = x.ci > best.ci ? x : best
      }
    }
    if (best.si < lists[best.ci].length - 1) continue // после неё в выбранной копии началась другая сессия: вытеснена
    // время файла для вести без поля времени: у равных по содержимому копий — более раннее (слияние освежает файл)
    const equal = insts.length === 1 ? insts : insts.filter((i) => sameRows(i.session.rows, best.session.rows))
    const mtime = best.session.rows.length ? Math.min(...equal.map((i) => i.copy.mtimeMs)) : best.copy.mtimeMs
    live.push({ key, ci: best.ci, si: best.si, copy: best.copy, session: best.session, divergent, common: insts.length >= 2 && equal.length === insts.length, mtime })
  }
  return { live, total, usedNow }
}

function finishChoice(live: Pick[], total: number, now: number, th: Thresholds): Chosen {
  let cands: Choice[] = live.map((p) => ({ ...p, entry: entryOf(p.session, p.mtime, now, th) }))
  // кандидат без времени, который не самый свежий, вытеснен: его «давно нет вестей» и скрытие от времени файла были бы ложными
  const ahead = (a: Choice, b: Choice) => a.entry.at - b.entry.at || a.ci - b.ci || a.si - b.si
  if (cands.length) {
    const freshest = cands.reduce((a, b) => (ahead(b, a) > 0 ? b : a))
    cands = cands.filter((c) => c === freshest || !c.entry.byFile)
  }
  const tails = cands.filter((c) => !c.common)
  const pool = tails.length ? tails : cands
  const shown = pool.length ? pool.reduce((a, b) => (ahead(b, a) > 0 ? b : a)) : undefined
  let others = 0
  if (shown)
    for (const c of cands) {
      if (c === shown || !c.entry.shown) continue
      const quiet = c.entry.state === 1 || c.entry.state === 2 || c.entry.state === 4 || c.entry.state === 7
      if (quiet && c.entry.at <= shown.entry.at) continue
      others++
    }
  return { candidates: cands, ...(shown ? { shown } : {}), others, displaced: total - cands.length }
}

// ---- Сводка по задачам: открытый контракт состояния (REQ-18, REQ-20) -----------------------------------------------------

/** Что известно о сессии-кандидате для показа. */
export type ProgressSession = {
  session: string
  sessionName: string
  k: number
  n: number
  signature: string
  /** момент вести (мс) и признак «по файлу» */
  at: number
  byFile: boolean
  /** состояние 1…7 таблицы REQ-04 и его слово */
  state: State
  stateWord: string
  /** вид остановки при состоянии 1; пусто — «вид не назван» */
  kind?: string
  /** тишина дольше порога «давно нет вестей» (состояния 3 и 6) */
  stale: boolean
  /** копии расходятся (`≠`) */
  divergent: boolean
  /** копия, из которой взята сессия */
  source: "main" | "tree"
  /** время последнего движения ветки этой копии, мс */
  branchAt?: number
  /** виден в панели по REQ-05 */
  visible: boolean
  /** состояния 1, 3, 6 без вестей дольше 24 часов (в команде «давно брошена»); «итога нет» не брошена */
  abandoned: boolean
  /** до трёх последних строк сессии (`k/N подпись`) */
  tail: string[]
}

export type ProgressTask = ProgressSession & {
  /** номер задачи методики («002») и имя её папки */
  number: string
  folder: string
  title: string
  /** сколько других кандидатов (в панели «+N») */
  others: number
  /** сколько прошлых сессий вытеснено */
  displaced: number
  /** все кандидаты задачи, показываемый — первым */
  candidates: ProgressSession[]
}

const sessionInfo = (c: Choice): ProgressSession => {
  const e = c.entry
  const rows = c.session.rows.length ? c.session.rows : c.session.launch ? [c.session.launch] : []
  return {
    session: c.session.code,
    sessionName: sessionName(c.session.code),
    k: e.last.k,
    n: e.last.n,
    signature: e.last.text,
    at: e.at,
    byFile: e.byFile,
    state: e.state,
    stateWord: STATE_WORDS[e.state],
    ...(e.kind !== undefined ? { kind: e.kind } : {}),
    stale: e.stale,
    divergent: c.divergent,
    source: c.copy.kind,
    ...(c.copy.branchMs !== undefined ? { branchAt: c.copy.branchMs } : {}),
    visible: e.shown,
    abandoned: e.abandoned,
    tail: rows.slice(-3).map((l) => `${l.k}/${l.n} ${l.sig}`),
  }
}

export type ScanTask = { folder: string; title: string; copies: JournalCopy[] }

/**
 * Сводка: по каждой задаче с показываемой записью — {@link ProgressTask}. Состояния, тишина и видимость считаются от `now` при
 * каждом вызове (REQ-10); задачи без журнала или с пустым журналом в сводку не входят (REQ-01).
 */
export function summarizeTasks(scan: { tasks: ScanTask[] }, now: number, th: Thresholds = DEFAULT_THRESHOLDS): ProgressTask[] {
  const out: ProgressTask[] = []
  for (const t of scan.tasks) {
    const chosen = chooseSessions(t.copies, now, th)
    if (!chosen.shown) continue
    const first = sessionInfo(chosen.shown)
    const rest = chosen.candidates
      .filter((c) => c !== chosen.shown)
      .sort((a, b) => b.entry.at - a.entry.at)
      .map(sessionInfo)
    const task = {
      ...first,
      number: /^[0-9]+/.exec(t.folder)?.[0] ?? t.folder,
      folder: t.folder,
      others: chosen.others,
      displaced: chosen.displaced,
      candidates: [first, ...rest],
    }
    // название читается, когда понадобилось (у сканера оно ленивое)
    Object.defineProperty(task, "title", { get: () => t.title, enumerable: true })
    out.push(task as ProgressTask)
  }
  return out
}

// ЖУРНАЛЫ ЗАДАЧИ: операции записи для агента (2026-10-09). Журналы задачи — территория CrewHarness (Канон, «Три журнала сессии»).
//   progress_line — одна строка `<код> k/N [ГГГГ-ММ-ДД ЧЧ:ММ] <подпись>` с настоящими датой и временем машины в файл progress.log;
//                   строку собирает инструмент по виду (старт, шаг, готово, стоп, поправка; запуск агент не пишет) и сверяет с прежними
//                   строками сессии (задачи 049, 050 и 053);
//   log_line      — одна запись `ГГГГ-ММ-ДД ЧЧ:ММ <вид>: <текст>` в log.md задачи, вид — из закрытого списка Канона (задача 049);
//   usage_line    — одна строка JSON (поле версии `v`) с учётом сессии в файл usage.log рядом с progress.log.
// Все операции узкие: никакой оболочки, только дозапись, имя файла фиксировано, путь не выходит из папки проекта окна, отказ
// файловой системы возвращается отказом, прежние строки не переписываются. Чистые функции здесь; регистрация — registerJournalTools.
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { finalOf, isOverstated, keywordOf, parseJournal, stopKind, STOP_KINDS, type Line } from "./progress.ts"

const pad2 = (n: number) => String(n).padStart(2, "0")
export const hhmm = (d: Date = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
// Дата и время местные, как в Каноне: `ГГГГ-ММ-ДД ЧЧ:ММ` (поле строки progress.log) и ISO с местным поясом `2026-10-09T04:12:00+03:00` (usage.log).
export const ymdhm = (d: Date = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hhmm(d)}`
export function isoLocal(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off < 0 ? "-" : "+"
  const a = Math.abs(off)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`
}

export type Refused = { ok: false; reason: string }

const CODE_RE = /^[A-Za-zА-Яа-яЁё0-9]{1,8}$/
const CONTROL_RE = /[\r\n\u0000-\u001f\u007f]/

// Файл внутри папки проекта окна и с нужным именем; иначе отказ.
function insideBase(fileArg: string, base: string, name: string): { ok: true; abs: string } | Refused {
  const file = String(fileArg ?? "").trim()
  if (!file) return { ok: false, reason: `не назван файл ${name}` }
  const abs = path.resolve(base, file)
  if (path.basename(abs).toLowerCase() !== name) return { ok: false, reason: `писать можно только в файл с именем ${name}` }
  const rel = path.relative(path.resolve(base), abs)
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, reason: "файл вне папки проекта окна" }
  return { ok: true, abs }
}

function appendOnly(abs: string, line: string): Refused | undefined {
  try {
    appendFileSync(abs, line + "\n", "utf8")
  } catch (e: any) {
    return { ok: false, reason: `файловая система отказала: ${e?.code ?? e}` }
  }
  return undefined
}

// ---- progress_line ----
// Задача 049 (2026-10-15): строку журнала хода собирает инструмент, а не агент. Агент называет вид строки (старт, шаг, готово, стоп,
// запуск) и числа; инструмент сам ставит ключевое слово, номер захода, вид остановки, дату и время машины и сверяет строку с
// предыдущими строками той же сессии в файле: старт перед шагами, по строке на единицу без пропусков, k не уменьшается, после
// «готово» строк той же сессии нет, подпись не длиннее 80 знаков (правила — методика, task-runner.md, «Строки progress.log»).
// Отказ называет правило, ожидаемую форму и пример вызова. Прежние строки не переписываются.
// Задача 050 (методика 09e86c1): ошибка формы прежней строки исправляется строкой-поправкой той же сессии с текущим k —
// `поправка: к строке «<начало, до 30 знаков>» — <что не так>`; она не единица и k не меняет; после итоговой строки (готово, стоп:) не
// пишется — итоговую строку исправляют её повтором с тем же k и ключевым словом, и такой повтор инструмент принимает. Пропуск единицы и
// старт не первой строкой поправкой не исправить: сессия без строки старт продолжает работу следующей единицей, новую попытку не начинает.
// Задача 053 (методика d5f1e80, task-runner.md, «Строки progress.log»): сессия — строки кода от строки запуск (или первой строки агента) до
// итоговой; строка старт в сессии одна; «готово» сравнивается с N из строки старт (k больше N допустимо), «готово» при k меньше N, без
// старта или после второго старта не пишется; после итоговой строки — только её повтор с тем же k и ключевым словом (вид остановки меняется,
// только если прежний не из списка) и «стоп:» с тем же k после «готово» при k меньше N; после «стоп:» продолжение — новой сессией со строки
// старт; строку запуск агент не пишет (границу сессии ставит раннер или оркестратор); начало в поправке — начало подписи после времени,
// от 10 до 30 знаков, а если подпись короче — вся.
// Методика ab2a4ef: журнал — сигнал, а не доказательство; «готово» при k меньше N из строки старт итоговой строкой не является и
// исправляется по делу: работа идёт — поправкой и дальше единицами; остановка — «стоп:» с тем же k; работа сделана, а N завышено —
// «готово — N завышено: <причина>» с тем же k (итоговая строка и завершение); старт, которого нет, дописывается сейчас и работа идёт
// дальше; запись о запуске агент не пишет ни в progress.log, ни в log.md.

export type ProgressKind = "start" | "step" | "done" | "stop" | "launch" | "correction"
export type ProgressInput = {
  file: string
  code: string
  kind?: string
  k?: number | string
  n?: number | string
  pass?: number | string
  stop?: string
  text?: string
  /** поправка: начало ошибочной строки той же сессии (вся строка или подпись), до 30 знаков */
  to?: string
  /** прежняя форма «k/N» для шага; вместо неё — k и n */
  unit?: string
  /** запуск (только запускающий): номер запуска; без него — 1 + наибольший номер в progress.log и log.md */
  launch?: number | string
}
/** Кто зовёт инструмент: запускающий (интегратор проекта) пишет строку запуска; агент сессии — нет (методика ab2a4ef). */
export type JournalEnv = { launcher?: boolean; launches?: number[] }

/**
 * Запускающий в ручном цикле (задача 053, методика ab2a4ef: «запуск — то, что знает запускающий»): вкладка, которая держит
 * исключительную роль integrator своего проекта и сама не исполняет и не принимает задачу (в визитке нет task и review). Это машина
 * проверяет по визитке и замку роли; агент сессии (исполнитель, приёмщик, рабочая вкладка) запускающим не бывает.
 */
export function isLauncherCard(card: { role?: string; task?: unknown; review?: unknown } | undefined, holdsIntegrator: boolean): boolean {
  return !!card && card.role === "integrator" && holdsIntegrator && !card.task && !card.review
}
const LAUNCH_NO_RE = /запуск №([1-9][0-9]*)/g
const launchNumbers = (text: string): number[] => [...text.matchAll(LAUNCH_NO_RE)].map((m) => Number(m[1]))

/** Предел подписи без поля времени (методика: «подпись без времени — не длиннее 80 знаков»). */
export const SIGNATURE_MAX = 80
const KIND_ALIASES: Record<string, ProgressKind> = {
  start: "start",
  старт: "start",
  step: "step",
  шаг: "step",
  done: "done",
  готово: "done",
  stop: "stop",
  стоп: "stop",
  launch: "launch",
  запуск: "launch",
  correction: "correction",
  поправка: "correction",
}
/** Начало подписи ошибочной строки в поправке (методика d5f1e80): от 10 до 30 знаков, а если подпись короче — вся. */
export const CORRECTION_QUOTE_MAX = 30
export const CORRECTION_QUOTE_MIN = 10
// Коды проверяющих сессий (С2, С4, С6 и их варианты: С2д, С2в9): у них номер захода в строке старта обязателен.
const REVIEW_CODE_RE = /^[СC][246]/
const KEYWORD_START_RE = /^(?:старт|готово|стоп|запуск|поправка)(?:$|[ \t.,:;!—–-])/i
const SEP = " — "

const asInt = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v
  if (typeof v === "string" && /^\d{1,4}$/.test(v.trim())) return Number(v.trim())
  return undefined
}
const given = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== ""

/**
 * Что известно о последней сессии кода в журнале (задача 053, методика d5f1e80): начата ли строкой старт, сколько в ней строк старт и N
 * первой из них, последний k и N, итоговая ли последняя строка кроме поправок («Готово» и «стоп» без двоеточия — тоже итоговые) и вид прежней
 * остановки, был ли пропуск единиц, строки сессии (для поправки). Сессия — строки кода от строки запуск (или первой строки) до итоговой; после
 * итоговой строки сессию продолжают только её повтор с тем же k и ключевым словом и «стоп:» после «готово» с тем же k, другая строка открывает
 * новую сессию (так читает и панель). Поправка k не меняет; вторая строка старт k не сбрасывает.
 */
export type SessionState = {
  started: boolean
  starts: number
  startN?: number
  k: number
  n?: number
  final?: "done" | "stop"
  stopKind?: string
  /** последняя строка — «готово» при k меньше N из строки старт без «N завышено»: не итоговая (методика ab2a4ef) */
  low?: boolean
  skipped: boolean
  rows: Line[]
}
const fresh = (): SessionState => ({ started: false, starts: 0, k: -1, skipped: false, rows: [] })
const finalFields = (text: string) => {
  const final = finalOf(text)
  return { final, stopKind: final === "stop" ? stopKind(text) : undefined }
}
export function sessionState(lines: Line[], code: string): SessionState {
  let st = fresh()
  for (const l of lines) {
    if (l.code !== code) continue
    const kw = keywordOf(l.text)
    if (kw === "поправка") {
      if (st.k >= 0) st.rows.push(l)
      continue
    }
    if (kw === "запуск" && l.k === 0 && l.n === 0) {
      st = fresh()
      continue
    }
    const final = finalOf(l.text)
    if (st.final) {
      if (l.k === st.k && (final === st.final || (st.final === "done" && kw === "стоп"))) {
        st = { ...st, n: l.n, ...finalFields(l.text), rows: [...st.rows, l] } // повтор итоговой строки или «стоп:» после «готово»
        continue
      }
      st = fresh() // строка после итоговой открывает новую сессию
    }
    if (kw === "старт" && st.k < 0) st = { ...fresh(), started: true, starts: 1, startN: l.n, k: l.k, n: l.n, rows: [l] }
    // старт, дописанный не первой строкой (методика ab2a4ef: «если строки старт ещё нет, допиши её сейчас»): k не сбрасывается
    else if (kw === "старт" && st.starts === 0) st = { ...st, started: true, starts: 1, startN: l.n, n: l.n, low: false, rows: [...st.rows, l] }
    else if (kw === "старт") st = { ...st, starts: st.starts + 1, n: l.n, low: false, rows: [...st.rows, l] }
    // упавший k — новая сессия без строки старт (так её разбирает и панель)
    else if (st.k >= 0 && l.k < st.k) st = { ...fresh(), k: l.k, n: l.n, ...finalFields(l.text), rows: [l] }
    else st = { ...st, k: l.k, n: l.n, ...finalFields(l.text), low: false, skipped: st.skipped || (st.k >= 0 && l.k > st.k + 1), rows: [...st.rows, l] }
    // «готово» при k меньше N из единственной строки старт и без «N завышено» итоговой строкой не является
    if (kw === "готово" && st.started && st.starts === 1 && st.startN !== undefined && l.k < st.startN && !isOverstated(l.text))
      st = { ...st, final: undefined, low: true }
  }
  return st
}
/** «готово» сессии — завершение: одна строка старт и k не меньше N из неё (методика d5f1e80). */
const finishes = (st: SessionState) => st.started && st.starts === 1 && st.startN !== undefined && st.k >= st.startN

// Пропуск единицы и старт не первой строкой поправкой не исправить (методика 09e86c1): ответ велит продолжать, а не начинать заново.
const defectNote = (st: SessionState): string => {
  if (!st.started) return "; у сессии старт не первой строкой — это поправкой не исправить: если строки старт ещё нет, допиши её сейчас (kind start) и продолжай работу, новую попытку сессии не начинай"
  const what = st.starts > 1 ? "вторая строка старт" : st.skipped ? "пропуск единицы" : ""
  return what ? `; у сессии ${what} — это поправкой не исправить: продолжай работу, новую попытку сессии не начинай` : ""
}

const example = (file: string, code: string, rest: string) => `progress_line {file: "${file}", code: "${code}", ${rest}}`
const range = (a: number, b: number) => (b > a ? `${a}–${b}` : `${a}`)

/**
 * Собрать строку журнала хода по виду и проверить её против прежних строк сессии. Чистая функция: файл не читает и не пишет;
 * `prior` — разобранные строки файла (пусто, если файла нет).
 */
export function buildProgress(input: ProgressInput, prior: Line[], now: Date = new Date(), env: JournalEnv = {}): { ok: true; line: string; kind: ProgressKind; hint: string; launch?: number } | Refused {
  const file = String(input?.file ?? "").trim() || "doc/tasks/NNN-x/progress.log"
  const code = String(input?.code ?? "").trim()
  if (!CODE_RE.test(code)) return { ok: false, reason: "код сессии: 1–8 букв или цифр без пробелов, дословно из строки «Сессия:» (например С2 или С5д)" }
  const rawKind = String(input?.kind ?? "").trim().toLowerCase()
  const unit = String(input?.unit ?? "").trim()
  let kind: ProgressKind | undefined = rawKind ? KIND_ALIASES[rawKind] : undefined
  if (rawKind && !kind) return { ok: false, reason: `вид строки «${rawKind}» неизвестен; kind — одно из: start (старт), step (шаг), done (готово), stop (стоп), correction (поправка); строку запуск агент не пишет` }
  let k = asInt(input?.k)
  let n = asInt(input?.n)
  if (given(input?.k) && k === undefined) return { ok: false, reason: "k — целое число от 0" }
  if (given(input?.n) && n === undefined) return { ok: false, reason: "n — целое число от 0" }
  if (unit) {
    const m = /^(\d{1,4})\/(\d{1,4})$/.exec(unit)
    if (!m) return { ok: false, reason: `счёт «${unit}» не k/N числами; лучше k и n отдельно: ${example(file, code, 'kind: "step", k: 4, n: 13, text: "что сделано"')}` }
    k ??= Number(m[1])
    n ??= Number(m[2])
  }
  kind ??= "step"
  const text = String(input?.text ?? "").trim()
  if (CONTROL_RE.test(text)) return { ok: false, reason: "текст в одну строку, без переводов строки и управляющих символов" }
  const st = sessionState(prior, code)
  const review = REVIEW_CODE_RE.test(code)
  let sig: string
  let hint: string

  const startCall = example(file, code, `kind: "start", n: <число единиц>${review ? ", pass: <номер захода>" : ""}`)
  // после итоговой строки: «готово» — закончена, «стоп:» — остановлена; новая работа — новой сессией со строки старт
  const closed = (): string =>
    st.final === "stop"
      ? `сессия ${code} остановлена строкой стоп: (${st.k}/${st.n}); после неё строки той же сессии не пишутся, кроме её повтора с тем же k в верной форме (методика: «после строки готово или стоп: строки той же сессии не пишутся, дальнейшее — новой сессией»); продолжение после ответа — новой сессией, её первая строка — старт: ${startCall}`
      : `сессия ${code} уже закончена строкой готово ${st.k}/${st.n}; после неё пишется только её повтор с тем же k для исправления формы, новая работа — новой сессией: ${startCall}`

  let launch: number | undefined
  if (kind === "launch") {
    if (!env.launcher)
      return { ok: false, reason: `строку запуск агент сессии не пишет: её пишет запускающий — интегратор проекта (вкладка, которая держит роль integrator и сама не исполняет и не принимает задачу) или раннер (методика: «агент строку запуск не пишет и в log.md не пишет»); первая строка сессии агента — старт: ${startCall}` }
    const used = new Set([...(env.launches ?? []), ...prior.flatMap((l) => launchNumbers(l.text))])
    const want = asInt(input?.launch)
    if (given(input?.launch) && (want === undefined || want < 1)) return { ok: false, reason: "launch — номер запуска, целое число от 1" }
    if (want !== undefined && used.has(want))
      return { ok: false, reason: `номер запуска №${want} уже был в progress.log или log.md этой папки: одной записи запуска — одна строка, повтор номера — существенная находка; без launch номер берётся сам (1 + наибольший)` }
    launch = want ?? Math.max(0, ...used) + 1
    k = 0
    n = 0
    sig = `запуск №${launch}`
    hint = `запуск №${launch} записан в progress.log и log.md; первая строка сессии агента — старт: ${startCall}`
  } else if (kind === "start") {
    if (n === undefined)
      return { ok: false, reason: `у строки старт нужен n — число единиц, видимое сессии (методика: «первая строка сессии — <код> 0/<N> [время] старт»); пример: ${example(file, code, 'kind: "start", n: 34, pass: 1, text: "опись 34 источника"')}` }
    const pass = asInt(input?.pass)
    if (given(input?.pass) && (pass === undefined || pass < 1)) return { ok: false, reason: "pass — номер захода, целое число от 1" }
    if (pass === undefined && review)
      return { ok: false, reason: `у проверяющей сессии ${code} нужен pass — номер захода (методика: «номер захода — в подписи первой строки ("старт заход 7")»), как в имени файла проверки (spec-review-N.md и др.); пример: ${example(file, code, `kind: "start", n: ${n}, pass: 9`)}` }
    if (text && KEYWORD_START_RE.test(text)) return { ok: false, reason: "в text не пиши ключевое слово: «старт» и номер захода ставит инструмент; в text — что предстоит (например «опись 34 источника»)" }
    const late = st.k >= 0 && !st.final && st.starts === 0
    if (st.k >= 0 && !st.final && !late)
      return { ok: false, reason: `строка старт в сессии одна (методика: «строка старт в сессии одна»): у сессии ${code} уже есть строка старт (последняя строка — ${st.k}/${st.n}); продолжай работу следующей единицей (k: ${st.k + 1}), новую попытку сессии не начинай` }
    k = 0
    sig = "старт" + (pass !== undefined ? ` заход ${pass}` : "") + (text ? SEP + text : "")
    hint = late
      ? `строка старт дописана не первой строкой (методика: «если строки старт ещё нет, допиши её сейчас») — это находка формы, не повод начинать заново; продолжай работу: ${example(file, code, `kind: "step", k: ${st.k + 1}, n: ${n}, text: "что сделано"`)}`
      : n > 0 ? `дальше — строка сразу после каждой завершённой единицы: ${example(file, code, `kind: "step", k: 1, n: ${n}, text: "что сделано"`)}` : 'единиц нет: конец — kind "done"'
  } else if (kind === "step") {
    if (k === undefined || n === undefined) return { ok: false, reason: `у шага нужны k и n — номер завершённой единицы и число единиц; пример: ${example(file, code, 'kind: "step", k: 4, n: 13, text: "spec.md прочитан целиком"')}` }
    if (!text) return { ok: false, reason: "у шага нужен text — что сделано, начиная с предмета (до 80 знаков вместе со всем, кроме времени)" }
    const kw = KEYWORD_START_RE.exec(text)
    if (kw) return { ok: false, reason: `text шага начинается с ключевого слова «${kw[0].trim()}»: старт, готово, стоп и поправку ставит инструмент по виду строки — kind start, done, stop, correction (строку запуск агент не пишет); в шаге первое слово — предмет (что сделано)` }
    if (st.final) return { ok: false, reason: closed() }
    // первая строка сессии — старт; у сессии, уже начатой без него (строки руками), старт поправкой не исправить: она продолжает работу
    if (st.k < 0)
      return { ok: false, reason: `у сессии ${code} в этом файле нет строки старт: первая строка сессии — старт, её пишут до чтения и работы (методика: «первая строка самого агента в сессии — <код> 0/<N> [время] старт»). Сначала: ${example(file, code, `kind: "start", n: ${n}${review ? ", pass: <номер захода>" : ""}`)}` }
    if (k < 1) return { ok: false, reason: "k шага — номер завершённой единицы, от 1 (0 — только у старта)" }
    if (k > n) return { ok: false, reason: `k=${k} больше n=${n}; если единиц оказалось больше, назови новое n` }
    if (k <= st.k) return { ok: false, reason: `единица ${k} уже записана (последняя строка сессии ${code} — ${st.k}/${st.n}); k не повторяется и не уменьшается — следующая единица ${st.k + 1}` }
    if (k > st.k + 1)
      return { ok: false, reason: `пропущены единицы ${range(st.k + 1, k - 1)}: строка пишется на каждую завершённую единицу, сразу после неё, по одной (методика: «одна строка на каждую завершённую единицу»). Запиши сначала: ${example(file, code, `kind: "step", k: ${st.k + 1}, n: ${n}, text: "что сделано"`)}` }
    sig = text
    hint = (k < n ? `следующая — k: ${k + 1}` : `все единицы записаны; конец — ${example(file, code, 'kind: "done", text: "итог"')}, остановка на воротах — kind "stop"`) + defectNote(st)
  } else if (kind === "done") {
    if (st.k < 0) return { ok: false, reason: `у сессии ${code} в этом файле нет строки старт — готово пишет начатая сессия; начало: ${example(file, code, 'kind: "start", n: <число единиц>')}` }
    if (text && KEYWORD_START_RE.test(text)) return { ok: false, reason: "в text не пиши «готово»: ключевое слово ставит инструмент; в text — итог" }
    const stopInstead = `останови сессию строкой стоп с тем же k (${st.k}): ${example(file, code, 'kind: "stop", stop: "ворота", text: "причина"')}`
    const repeat = st.final === "done"
    const overstated = /^N завышено:/.test(text)
    if (st.final === "stop") return { ok: false, reason: closed() }
    if (repeat) {
      // повтор итоговой строки с тем же k — исправление её формы (методика); читается последняя
      if (!finishes(st)) return { ok: false, reason: `строка готово этой сессии завершением не считается (нет строки старт или их две) — её повтор не пишется; ${stopInstead}` }
      if (given(input?.n) && n !== st.n) return { ok: false, reason: `сессия ${code} уже закончена строкой готово ${st.k}/${st.n}; после неё пишется только её повтор с тем же k (${st.k}) и n (${st.n}) для исправления формы, новая работа — новой сессией (kind "start")` }
      k = st.k
      n = st.n ?? 0
    } else {
      if (!st.started) return { ok: false, reason: `у сессии ${code} без строки старт готово не пишется: такое готово завершением не считается (методика: «готово в сессии без строки старт» — существенная находка); строки старт ещё нет — допиши её сейчас: ${startCall}, затем готово; или ${stopInstead}` }
      if (st.starts > 1) return { ok: false, reason: `у сессии ${code} со второй строкой старт готово не пишется: такое готово завершением не считается (методика: «строка старт в сессии одна»); ${stopInstead}` }
      if (overstated) {
        // работа сделана, а N в строке старт завышено: итоговая строка с тем же k (методика ab2a4ef), причину сверяют по артефакту
        k = st.k
        n = n ?? st.n ?? 0
      } else {
        n ??= st.n
        if (n === undefined) return { ok: false, reason: "не известно n сессии: назови n" }
        if (st.k < n - 1)
          return { ok: false, reason: `до готово не записаны единицы ${range(st.k + 1, n - 1)} из ${n}: готово — строка последней единицы N/N; сессия, вставшая раньше, пишет kind "stop" с видом остановки` }
        k = Math.max(st.k, n)
        if (st.startN !== undefined && k < st.startN)
          return { ok: false, reason: `готово при k=${k} меньше N из строки старт (${st.startN}) завершением не считается (методика: «k сравнивается с N из строки старт, а не с N самой строки»); исправь по делу: работа сделана, а N завышено — ${example(file, code, 'kind: "done", text: "N завышено: <причина>"')}; работа идёт — следующая единица k: ${st.k + 1}; остановился — ${stopInstead}` }
      }
    }
    sig = "готово" + (text ? SEP + text : "")
    hint = (repeat ? "повтор итоговой строки записан, читается последняя; " : "") + `сессия закончена; дальнейшее — новой сессией: ${startCall}`
  } else if (kind === "correction") {
    const to = String(input?.to ?? "").trim()
    if (st.k < 0)
      return { ok: false, reason: `у сессии ${code} в этом файле нет строк — нечего поправлять; поправка пишется к строке той же сессии` }
    if (st.final) {
      const again = st.final === "done" ? 'kind: "done", text: "итог"' : 'kind: "stop", stop: "<вид из списка>", text: "причина"'
      return { ok: false, reason: `после итоговой строки (готово или стоп:) поправка не пишется: итоговую строку исправляют её повтором с тем же k (${st.k}) и ключевым словом в верной форме (методика: «ошибку формы в самой последней строке исправляют, дописав её заново»): ${example(file, code, again)}` }
    }
    if (!to)
      return { ok: false, reason: `у поправки нужен to — начало ошибочной строки той же сессии (вся строка или подпись, до ${CORRECTION_QUOTE_MAX} знаков); пример: ${example(file, code, 'kind: "correction", to: "опись source inventory", text: "подпись 93 знака, предел 80"')}` }
    if (CONTROL_RE.test(to) || /[«»]/.test(to)) return { ok: false, reason: "to — начало строки в одну строку, без кавычек « » и управляющих символов" }
    if (!text) return { ok: false, reason: "у поправки нужен text — что не так в строке" }
    // начало подписи после времени (методика d5f1e80); начало всей строки или подписи с полем времени — не то начало
    const hit = [...st.rows].reverse().find((l) => l.text.startsWith(to))
    if (!hit) {
      if (st.rows.some((l) => `${l.code} ${l.k}/${l.n} ${l.sig}`.startsWith(to) || l.sig.startsWith(to)))
        return { ok: false, reason: `to — начало подписи после времени, без кода, k/N и поля времени (методика: «начало её подписи после времени, от 10 до 30 знаков»); пример: ${example(file, code, 'kind: "correction", to: "опись source inventory", text: "подпись 93 знака, предел 80"')}` }
      return { ok: false, reason: `строка сессии ${code}, подпись которой начинается с «${to}», в этом файле не нашлась: to — начало подписи после времени строки этой сессии; поправка исправляет только форму записанной строки. Пропуск единицы и старт не первой строкой поправкой не исправить: продолжай работу, новую попытку сессии не начинай` }
    }
    // от 10 до 30 знаков подписи, а если подпись короче — вся
    const chars = [...hit.text]
    const min = Math.min(CORRECTION_QUOTE_MIN, chars.length)
    let quote = chars.slice(0, Math.min(CORRECTION_QUOTE_MAX, Math.max([...to].length, min))).join("")
    if ([...quote.trimEnd()].length >= min) quote = quote.trimEnd()
    k = st.k
    n = st.n ?? 0
    sig = `поправка: к строке «${quote}»${SEP}${text}`
    hint = `поправка записана, k не меняется (не единица); следующая единица — k: ${st.k + 1}` + defectNote(st)
  } else {
    const word = String(input?.stop ?? "").trim().toLowerCase()
    if (!STOP_KINDS.includes(word))
      return { ok: false, reason: `вид остановки ${word ? `«${word}» не из списка` : "не назван"}: stop — одно из слов ${STOP_KINDS.join(", ")} (методика: «стоп: <вид> — <причина>»); пример: ${example(file, code, 'kind: "stop", stop: "вопрос", text: "нужен ответ интегратора о составе описи"')}` }
    if (!text) return { ok: false, reason: "у остановки нужен text — причина" }
    // «готово» при k меньше N итоговой строкой не является (st.low), после него «стоп:» с тем же k законен; после завершения — нет
    if (st.final === "done") return { ok: false, reason: `сессия ${code} уже закончена строкой готово ${st.k}/${st.n}; остановка пишется до неё (после готово строка стоп: — только исправление готово при k меньше N из строки старт)` }
    if (st.final === "stop" && st.stopKind && st.stopKind !== word)
      return { ok: false, reason: `сессия ${code} уже остановлена строкой стоп: ${st.stopKind}; её повтор пишется с тем же k, а вид остановки меняется, только если прежний не из списка (методика) — повтори stop: "${st.stopKind}"` }
    k = st.k >= 0 ? st.k : 0
    n = st.n ?? n ?? 0
    sig = `стоп: ${word}${SEP}${text}`
    hint = `сессия остановлена; после строки стоп: единицы этой сессии не пишутся — продолжение после ответа идёт новой сессией, её первая строка — старт: ${startCall}`
  }
  const len = [...sig].length
  if (len > SIGNATURE_MAX)
    return { ok: false, reason: `подпись «${sig}» — ${len} знаков, предел ${SIGNATURE_MAX} без поля времени (методика: «подпись без времени — не длиннее 80 знаков»); сократи text на ${len - SIGNATURE_MAX}, подробности — в отчёт или log.md` }
  return { ok: true, line: `${code} ${k}/${n} [${ymdhm(now)}] ${sig}`, kind, hint, ...(launch !== undefined ? { launch } : {}) }
}

export function progressLine(input: ProgressInput, base: string, now: Date = new Date(), env: JournalEnv = {}): { ok: true; line: string; file: string; hint: string } | Refused {
  const where = insideBase(input?.file, base, "progress.log")
  if (!where.ok) return where
  let prior: Line[] = []
  let exists = false
  try {
    const st = statSync(where.abs)
    if (!st.isFile()) return { ok: false, reason: "это не файл" }
    exists = true
    prior = parseJournal(readFileSync(where.abs))
  } catch (e: any) {
    if (e?.code !== "ENOENT") return { ok: false, reason: `файловая система отказала: ${e?.code ?? e}` }
  }
  // запускающий: номера запусков из log.md той же папки, чтобы номер не повторился (методика ab2a4ef)
  const logAbs = path.join(path.dirname(where.abs), "log.md")
  let logText = ""
  if (env.launcher) {
    try {
      logText = readFileSync(logAbs, "utf8")
    } catch (e: any) {
      if (e?.code !== "ENOENT") return { ok: false, reason: `файловая система отказала: ${e?.code ?? e}` }
    }
  }
  const built = buildProgress(input, prior, now, { ...env, launches: launchNumbers(logText) })
  if (!built.ok) return built
  if (!exists) {
    if (built.kind !== "start" && built.kind !== "launch") return { ok: false, reason: 'файла нет: журнал создаёт строка старт (kind "start") или запуск запускающего (kind "launch")' }
    if (!existsSync(path.dirname(where.abs))) return { ok: false, reason: "папки журнала нет: инструмент создаёт только файл progress.log в существующей папке" }
  }
  if (built.launch !== undefined) {
    // сначала запись в перечне запусков log.md, потом строка в progress.log: строка без записи была бы существенной находкой
    const stamp = ymdhm(now)
    const lead = logText && !logText.endsWith("\n") ? "\n" : ""
    const badLog = appendOnly(logAbs, `${lead}${stamp} пуск: запуск №${built.launch} ${String(input.code).trim()} [${stamp}]`)
    if (badLog) return badLog
  }
  const bad = appendOnly(where.abs, built.line)
  if (bad) return bad
  return { ok: true, line: built.line, file: where.abs, hint: built.hint }
}

// ---- log_line ----
// Задача 049: запись log.md задачи «ГГГГ-ММ-ДД ЧЧ:ММ <вид>: <текст>» с датой и временем машины и видом из закрытого списка Канона
// (doc/canon/process.md, «Дата в каждой записи журналов»; страж check-task-docs.py, правило log-line). Одна строка, только дозапись.
export const LOG_KINDS = ["решение владельца", "заседание", "ворота", "документ", "пуск", "слияние", "находка"]
export type LogInput = { file: string; kind: string; text: string }

export function logLine(input: LogInput, base: string, now: Date = new Date(), env: JournalEnv = {}): { ok: true; line: string; file: string } | Refused {
  const kind = String(input?.kind ?? "").trim().toLowerCase()
  const text = String(input?.text ?? "").trim()
  if (!LOG_KINDS.includes(kind))
    return { ok: false, reason: `вид записи ${kind ? `«${kind}» не из списка` : "не назван"}: kind — одно из: ${LOG_KINDS.join(", ")} (Канон, process.md); пример: log_line {file: "doc/tasks/007-x/log.md", kind: "документ", text: "spec.md передан на С2"}` }
  if (!text) return { ok: false, reason: "текст пустой" }
  if (CONTROL_RE.test(text)) return { ok: false, reason: "одна запись — одна строка: без переводов строки и управляющих символов (две записи — два вызова)" }
  if (/^запуск\s*№/.test(text) && !env.launcher)
    return { ok: false, reason: "запись о запуске («запуск №<n> <код> [время]») агент сессии не пишет: её пишет запускающий — интегратор проекта или раннер, лучше вместе со строкой запуск: progress_line kind launch (методика: «агент строку запуск не пишет и в log.md не пишет»)" }
  if ([...text].length > 2000) return { ok: false, reason: "текст длиннее 2000 знаков; подробности — в отчёт, в журнал — итог и ссылка" }
  const where = insideBase(input?.file, base, "log.md")
  if (!where.ok) return where
  let lead = ""
  try {
    const st = statSync(where.abs)
    if (!st.isFile()) return { ok: false, reason: "это не файл" }
    const data = readFileSync(where.abs)
    if (data.length && data[data.length - 1] !== 10) lead = "\n"
  } catch (e: any) {
    if (e?.code !== "ENOENT") return { ok: false, reason: `файловая система отказала: ${e?.code ?? e}` }
    if (!existsSync(path.dirname(where.abs))) return { ok: false, reason: "папки задачи нет: log.md создаётся только в существующей папке" }
  }
  const line = `${ymdhm(now)} ${kind}: ${text}`
  const bad = appendOnly(where.abs, lead + line)
  if (bad) return bad
  return { ok: true, line, file: where.abs }
}

// ---- задержка цикла службы ----
// Таймер замера в index.ts отдаёт сюда каждое опоздание. Хранится наибольшее за каждую минуту (не больше суток), чтобы usage_line
// мог назвать наибольшую задержку с момента создания сессии (или с запуска плагина, если он стартовал позже).
const LAG_KEEP_MIN = 24 * 60
const lagByMinute = new Map<number, number>()
const pluginStartedAt = Date.now()
export function noteLoopLag(lagMs: number, at: number = Date.now()): void {
  const m = Math.floor(at / 60_000)
  const lag = Math.max(0, Math.round(lagMs))
  if (lag > (lagByMinute.get(m) ?? -1)) lagByMinute.set(m, lag)
  if (lagByMinute.size > LAG_KEEP_MIN) for (const k of lagByMinute.keys()) if (k < m - LAG_KEEP_MIN) lagByMinute.delete(k)
}
export function maxLoopLagSince(sinceMs: number): number | null {
  const from = Math.floor(Math.max(sinceMs, pluginStartedAt) / 60_000)
  let max: number | null = null
  for (const [m, v] of lagByMinute) if (m >= from && (max === null || v > max)) max = v
  return max
}
export function resetLoopLagForTest(): void {
  lagByMinute.clear()
}

// ---- usage_line ----

export type UsageInput = { file: string; code: string; result: string }
export type SessionCard = {
  model?: { id?: string; providerID?: string; variant?: string }
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
  cost?: number
  time?: { created?: number; updated?: number }
}
export type UsageEnv = {
  session: string
  card?: SessionCard // карточка ctx.session.get; нет — поля из неё null
  now?: Date
  maxLag?: (sinceMs: number) => number | null
  commit?: (dir: string) => string
}

const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function gitHead(dir: string): string {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return ""
  }
}

export function usageLine(input: UsageInput, base: string, env: UsageEnv): { ok: true; line: string; file: string } | Refused {
  const code = String(input?.code ?? "").trim()
  const result = String(input?.result ?? "").trim()
  if (!CODE_RE.test(code)) return { ok: false, reason: "код сессии: 1–8 букв или цифр без пробелов (например С5д)" }
  if (!result) return { ok: false, reason: "итог пустой" }
  if (CONTROL_RE.test(result)) return { ok: false, reason: "итог в одну строку, без управляющих символов" }
  if ([...result].length > 200) return { ok: false, reason: "итог длиннее 200 знаков; сократи" }
  const where = insideBase(input?.file, base, "usage.log")
  if (!where.ok) return where
  const dir = path.dirname(where.abs)
  if (!existsSync(path.join(dir, "progress.log"))) return { ok: false, reason: "рядом нет progress.log: usage.log заводится только в папке задачи" }
  if (existsSync(where.abs) && !statSync(where.abs).isFile()) return { ok: false, reason: "это не файл" }

  const now = env.now ?? new Date()
  const c = env.card
  const m = c?.model
  const created = num(c?.time?.created)
  const t = c?.tokens
  const tokens = t
    ? { input: num(t.input), output: num(t.output), reasoning: num(t.reasoning), cache_read: num(t.cache?.read), cache_write: num(t.cache?.write) }
    : null
  const row = {
    v: 1,
    code,
    at: isoLocal(now),
    session: env.session || null,
    model: m?.id ? `${m.providerID ? m.providerID + "/" : ""}${m.id}` : null,
    variant: m?.variant ? String(m.variant) : null,
    tokens,
    cost: num(c?.cost),
    started: created === null ? null : isoLocal(new Date(created)),
    seconds: created === null ? null : Math.max(0, Math.round((now.getTime() - created) / 1000)),
    max_loop_lag_ms: created === null ? null : (env.maxLag ?? maxLoopLagSince)(created),
    limits: null,
    tool_calls: null,
    test_runs: null,
    commit: (env.commit ?? gitHead)(dir),
    result,
  }
  const line = JSON.stringify(row)
  const bad = appendOnly(where.abs, line)
  if (bad) return bad
  return { ok: true, line, file: where.abs }
}

// ---- регистрация инструментов ----
// Отдельным вызовом ctx.tool.transform; сбой регистрации не ломает плагин.
export async function registerJournalTools(ctx: any, log: (s: string) => void, opts: { launcher?: (sessionID: string) => boolean } = {}): Promise<void> {
  const base = () => String(ctx?.location?.directory ?? process.cwd())
  // запускающий ли вызывающая вкладка (index.ts: визитка и замок роли integrator); сбой проверки — не запускающий
  const launcherOf = (context: any): boolean => {
    try {
      const sid = String(context?.sessionID ?? "")
      return !!sid && !!opts.launcher?.(sid)
    } catch (e) {
      log(`journal tools: launcher check failed: ${e}`)
      return false
    }
  }
  const cardOf = async (sessionID: string): Promise<SessionCard | undefined> => {
    try {
      if (!sessionID || typeof ctx?.session?.get !== "function") return undefined
      const r = await ctx.session.get({ sessionID })
      const d = r?.data ?? r
      return d && typeof d === "object" ? d : undefined
    } catch (e) {
      log(`usage_line: session card unavailable: ${e}`)
      return undefined
    }
  }
  try {
    await ctx.tool.transform((editor: any) => {
      editor.add({
        name: "progress_line",
        description:
          "The way to write the task progress journal (progress.log): name the KIND of the line and the numbers, the tool builds the line itself - keyword, pass number, stop kind, machine date and time - and checks it against the earlier lines of the same session in the file (never write these lines by hand or ask the clock with date/Get-Date). " +
          "Kinds: start {n, pass for a review session С2/С4/С6, text optional} -> '<code> 0/N [time] старт заход P — text', written BEFORE reading or work, creates the file if missing; one start per session: never a second one, after a crash go on with the next unit; a session without a start writes it now and goes on; " +
          "step {k, n, text} -> '<code> k/N [time] text', one line right after EACH finished unit, k = previous + 1; " +
          "done {text optional} -> '<code> N/N [time] готово — text', the last line of a finished session; k must be at least N of the start line (k above N is fine); not written without a start or after a second start; with k below N of the start fix it by what happened: the work goes on - next units, it stopped - stop, it is done and N was too high - done {text: 'N завышено: <reason>'} (a final line); " +
          "stop {stop: вопрос|план|ревизия|требования|ворота, text = reason} -> '<code> k/N [time] стоп: вид — reason'; after it the session writes no units: the work after the answer goes on in a new session that begins with start; " +
          "launch {launch optional} -> '<code> 0/0 [time] запуск №n' plus the record '<time> пуск: запуск №n <code> [time]' in log.md of the folder: only for the launcher - the tab holding the integrator role of the project without a task or review of its own; the agent of a session never writes a launch, neither in progress.log nor in log.md; " +
          "correction {to = the start of the signature (after the time) of the wrong line of the same session, text = what is wrong} -> '<code> k/N [time] поправка: к строке «10 to 30 chars of it, or the whole shorter signature» — text', keeps the current k, is not a unit; never rewrite a line, correct it. Not after the final line: a wrong 'готово'/'стоп:' line is fixed by repeating done/stop with the same k (a stop kind of the list is kept). The journal is a signal, not a proof: the finish is judged by the artifact. A skipped unit or a missing start cannot be corrected: go on with the work, do not begin a new attempt. A form mistake of the journal is a finding (находка in log.md), not a reason to redo the session. " +
          "The whole signature (all but the time) is at most 80 characters. A refusal names the rule, the expected form and an example call; nothing is written. " +
          "Example: {file: 'doc/tasks/007-x/progress.log', code: 'С2', kind: 'start', n: 34, pass: 1, text: 'опись 34 источника'}, then {file: same, code: 'С2', kind: 'step', k: 1, n: 34, text: 'spec.md прочитан целиком'}.",
        input: {
          type: "object",
          properties: {
            file: { type: "string", description: "path to progress.log, relative to the project folder or absolute inside it" },
            code: { type: "string", description: "session code exactly from the 'Сессия:' line, e.g. С2 or С5д" },
            kind: { type: "string", enum: ["start", "step", "done", "stop", "correction", "launch"], description: "kind of the line; step when omitted; launch - the launcher only" },
            k: { type: "number", description: "step: number of the finished unit, previous + 1" },
            n: { type: "number", description: "start and step: number of units the session sees" },
            pass: { type: "number", description: "start: number of the review pass (заход), as in spec-review-N.md; required for С2, С4, С6" },
            stop: { type: "string", enum: STOP_KINDS, description: "stop: kind of the stop" },
            text: { type: "string", description: "step: what is done, starting with the subject; start: what is ahead; done: the result; stop: the reason; correction: what is wrong. One line, no keyword" },
            to: { type: "string", description: "correction: the start of the signature after the time of the wrong line of the same session (no code, k/N or time); 10 to 30 characters are kept, the whole signature if it is shorter" },
            unit: { type: "string", description: "old form of k and n for a step: 'k/N', e.g. 4/13" },
            launch: { type: "number", description: "launch (the launcher only): the launch number; by default 1 + the largest one in progress.log and log.md" },
          },
          required: ["file", "code"],
        },
        execute: async (input: any, context: any) => {
          const r = progressLine(input, base(), new Date(), { launcher: launcherOf(context) })
          if (!r.ok) {
            log(`progress_line refused: ${r.reason}`)
            return { content: `Не записано: ${r.reason}` }
          }
          return { content: `Записано: ${r.line}\n${r.hint}` }
        },
      })
      editor.add({
        name: "log_line",
        description:
          "The way to write an entry of the task log (log.md): appends ONE line 'YYYY-MM-DD HH:MM <kind>: <text>' with the machine date and time (never type the time by hand or ask the clock). " +
          "kind is one of: решение владельца, заседание, ворота, документ, пуск, слияние, находка. One entry - one call, one line (no line breaks), up to 2000 characters. The launch record 'запуск №<n> <code> [time]' is written by the launcher (the integrator tab, better via progress_line kind launch), never by the agent of a session. " +
          "File named log.md inside the project folder; created only in an existing folder. Example: {file: 'doc/tasks/007-x/log.md', kind: 'решение владельца', text: 'владелец, 2026-10-15, чат: «по рекомендации»'}.",
        input: {
          type: "object",
          properties: {
            file: { type: "string", description: "path to log.md, relative to the project folder or absolute inside it" },
            kind: { type: "string", enum: LOG_KINDS, description: "kind of the entry" },
            text: { type: "string", description: "the entry, one line" },
          },
          required: ["file", "kind", "text"],
        },
        execute: async (input: any, context: any) => {
          const r = logLine(input, base(), new Date(), { launcher: launcherOf(context) })
          if (!r.ok) {
            log(`log_line refused: ${r.reason}`)
            return { content: `Не записано: ${r.reason}` }
          }
          return { content: `Записано в log.md: ${r.line}` }
        },
      })
      editor.add({
        name: "usage_line",
        description:
          "Append ONE JSON line with the accounting of this session to a usage.log of the current project (format version v:1). Call it once, when the session is finished. The tool fills everything itself (time, session, model, variant, tokens, cost, duration, longest service loop lag, last commit of the folder); you pass only the session code and the result. File named usage.log inside the project folder, only appending; it may be created only next to an existing progress.log of the same task folder. Example: file 'doc/tasks/007-x/usage.log', code 'С5д', result 'готово: 13 из 13 шагов, тесты зелёные'.",
        input: {
          type: "object",
          properties: {
            file: { type: "string", description: "path to usage.log (next to the task's progress.log), relative to the project folder or absolute inside it" },
            code: { type: "string", description: "session code, e.g. С5д" },
            result: { type: "string", description: "outcome of the session, one line, up to 200 characters" },
          },
          required: ["file", "code", "result"],
        },
        execute: async (input: any, context: any) => {
          const session = String(context?.sessionID ?? "")
          const r = usageLine(input, base(), { session, card: await cardOf(session) })
          if (!r.ok) {
            log(`usage_line refused: ${r.reason}`)
            return { content: `Не записано: ${r.reason}` }
          }
          return { content: `Записано в usage.log: ${r.line}` }
        },
      })
    })
  } catch (e) {
    log(`journal tools not registered: ${e}`)
  }
}

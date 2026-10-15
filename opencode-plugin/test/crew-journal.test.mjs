// Self-test of the task journal tools (node >= 24):  node test/crew-journal.test.mjs
// progress_line appends ONE line '<code> k/N [YYYY-MM-DD HH:MM] <signature>' with the machine date and time to a file named progress.log inside the
// project folder; since task 049 it builds the line by kind (start, step, done, stop, launch) and checks it against the session: the red probes
// are the lines agents stumbled on in tasks 031 and 045; log_line appends ONE entry 'YYYY-MM-DD HH:MM <kind>: <text>' to log.md; usage_line appends ONE JSON line (format version v:1) with the accounting of the session to usage.log next to
// a progress.log of the same task folder. Both: no shell, append only, fixed file names, path inside the project folder, the
// refusal of the file system is returned as a refusal, history is never rewritten. Exit 1 on any failed cell.
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync, existsSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-journal-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.CREW_HARNESS_PRESENCE ??= "all"
const plugin = (await import("../index.ts")).default
const { progressLine, logLine, usageLine, noteLoopLag, maxLoopLagSince, resetLoopLagForTest, isLauncherCard } = await import("../journal.ts")
const { parseLine, keywordOf, stopKind, sessionsOf, entryOf, DEFAULT_THRESHOLDS } = await import("../progress.ts")

let fail = 0
function cell(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const read = (f) => readFileSync(f, "utf8")
const exists = (f) => existsSync(f)

const base = path.join(tmp, "proj")
const dir = path.join(base, "doc", "tasks", "007-x")
mkdirSync(dir, { recursive: true })
const log = path.join(dir, "progress.log")
const ulog = path.join(dir, "usage.log")
const HISTORY = "С5д 0/13 [02:00] старт\nС5д 3/13 [02:04] историческая строка\n"
writeFileSync(log, HISTORY)
const rel = "doc/tasks/007-x/progress.log"
const urel = "doc/tasks/007-x/usage.log"
const at = (h, m) => new Date(2026, 9, 9, h, m, 0)
// independent expectation of the local ISO form: fields from the Date, offset from the minutes difference to UTC
const p2 = (n) => String(n).padStart(2, "0")
const isoLocalOf = (d) => {
  const off = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - Math.floor(d.getTime() / 1000) * 1000) / 60000)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${off < 0 ? "-" : "+"}${p2(Math.floor(Math.abs(off) / 60))}:${p2(Math.abs(off) % 60)}`
}

// ---- progress_line ----
{
  const r = progressLine({ file: rel, code: "С5д", unit: "4/13", text: "ворота merge: замок только на проверенную вершину" }, base, at(3, 7))
  cell("progress: appends one line with the given date and time (old form unit k/N is a step)", r.ok && r.line === "С5д 4/13 [2026-10-09 03:07] ворота merge: замок только на проверенную вершину", JSON.stringify(r))
  const txt = read(log)
  cell("progress: history is kept, one new line only", txt.startsWith(HISTORY) && txt.split("\n").length === 4 && txt.endsWith("\n"), JSON.stringify(txt))

  const before = new Date()
  const r2 = progressLine({ file: log, code: "С5д", kind: "step", k: 5, n: 13, text: "реальное время" }, base)
  const after = new Date()
  const stamp = /\[(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)\]/.exec(r2.line ?? "")
  const got = stamp ? new Date(Number(stamp[1]), Number(stamp[2]) - 1, Number(stamp[3]), Number(stamp[4]), Number(stamp[5])).getTime() : -1
  const floor = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime()
  cell("progress: real machine date and time (absolute path inside the project)", r2.ok && got >= floor(before) && got <= floor(after), JSON.stringify([r2, got]))

  const bad = (name, input, why) => {
    const snapshot = read(log)
    const x = progressLine(input, base, at(3, 8))
    cell(`progress refused: ${name}`, x.ok === false && read(log) === snapshot && (!why || why.test(x.reason)), JSON.stringify(x))
  }
  bad("other file name", { file: "doc/tasks/007-x/result.md", code: "С5д", unit: "6/13", text: "x" })
  bad("file outside the project folder", { file: "../outside/progress.log", code: "С5д", unit: "6/13", text: "x" })
  bad("absolute path outside", { file: path.join(tmp, "other", "progress.log"), code: "С5д", unit: "6/13", text: "x" })
  bad("multi-line text", { file: rel, code: "С5д", unit: "6/13", text: "раз\nдва" })
  bad("control characters", { file: rel, code: "С5д", unit: "6/13", text: "раз\u0007два" })
  bad("signature over 80 characters", { file: rel, code: "С5д", unit: "6/13", text: "я".repeat(81) }, /81 знак.*предел 80.*сократи text на 1/)
  bad("empty text of a step", { file: rel, code: "С5д", unit: "6/13", text: "  " })
  bad("code with spaces", { file: rel, code: "С5 д", unit: "6/13", text: "x" })
  bad("unit not k/N", { file: rel, code: "С5д", unit: "пять", text: "x" })
  bad("unit ?/? is no longer written (the guard and the panel do not read it)", { file: rel, code: "С5д", unit: "?/?", text: "x" })
  bad("unknown kind", { file: rel, code: "С5д", kind: "итог", text: "x" }, /start.*step.*done.*stop.*correction/)
  bad("a step of a missing file is not written and the file is not created", { file: "doc/tasks/008-y/progress.log", code: "С5д", unit: "1/2", text: "x" }, /старт/)
  cell("progress: missing file not created on disk", !exists(path.join(base, "doc/tasks/008-y/progress.log")), "created")

  const ro = path.join(dir, "ro", "progress.log")
  mkdirSync(path.dirname(ro), { recursive: true })
  writeFileSync(ro, "С1 0/2 [01:00] старт\n")
  chmodSync(ro, 0o444)
  const snap = read(ro)
  const denied = progressLine({ file: ro, code: "С1", unit: "1/2", text: "x" }, base, at(3, 9))
  cell("progress: file access denial is respected", denied.ok === false && /отказал|EPERM|EACCES/.test(denied.reason) && read(ro) === snap, JSON.stringify(denied))
  chmodSync(ro, 0o644)
}

// ---- progress_line by kind: the tool builds the line and checks it against the session (task 049) ----
{
  const tdir = path.join(base, "doc", "tasks", "045-k")
  mkdirSync(tdir, { recursive: true })
  const f = "doc/tasks/045-k/progress.log"
  const abs = path.join(tdir, "progress.log")
  const put = (input, h = 15, m = 2) => progressLine({ file: f, ...input }, base, at(h, m))
  const no = (name, input, why) => {
    const snapshot = exists(abs) ? read(abs) : null
    const x = put(input)
    cell(`kind refused: ${name}`, x.ok === false && (exists(abs) ? read(abs) : null) === snapshot && why.test(x.reason), JSON.stringify(x))
  }

  // case 045 С2 attempt 1 and the live s2-2 journal: the first line was a step, there was no start line
  no("a step before the start line (case 045 С2, attempt 1)", { code: "С2д", kind: "step", k: 1, n: 6, text: "входной снимок четырёх файлов совпал" }, /нет строки старт.*kind: "start", n: 6, pass: <номер захода>/)
  cell("kind: a step before the start does not create the file", !exists(abs), "created")
  // case 031 С2-9 finding 2: the start line of a review session without the pass number
  no("a review start without pass (case 031 С2-9)", { code: "С2в9", kind: "start", n: 39, text: "опись 39, fingerprints сняты" }, /pass — номер захода.*pass: 9/)
  // case 031 С2-9 finding 1 and case 045 С2 retry 1: the agent wrote the keyword itself as «старт:»
  no("the keyword in text of a start (case 045 С2 retry 1)", { code: "С2д2", kind: "start", n: 34, pass: 1, text: "старт: С2-1 повтор" }, /не пиши ключевое слово/)
  no("a step whose text begins with «старт:» (case 045 С1)", { code: "С1", unit: "0/31", text: "старт: опись задачи 042 и чтение источников" }, /ключевого слова «старт:».*kind start/)

  const s = put({ code: "С2в9", kind: "start", n: 39, pass: 9, text: "опись 39, fingerprints сняты" }, 3, 15)
  cell("kind: start creates the file and writes the exact form «старт заход 9 — …»", s.ok && s.line === "С2в9 0/39 [2026-10-09 03:15] старт заход 9 — опись 39, fingerprints сняты" && read(abs) === s.line + "\n", JSON.stringify(s))
  cell("kind: the panel reads the start line as «старт»", keywordOf(parseLine(s.line).text) === "старт", s.line)
  cell("kind: the answer says what comes next", /kind: "step", k: 1, n: 39/.test(s.hint), s.hint)
  const s1 = put({ code: "С2в9", kind: "step", k: 1, n: 39, text: "045 spec.md прочитан целиком" }, 3, 16)
  cell("kind: step after start", s1.ok && s1.line === "С2в9 1/39 [2026-10-09 03:16] 045 spec.md прочитан целиком", JSON.stringify(s1))
  // case 045 С1 (1/31 then 31/32) and С2 retry 4 (0/34 then 19/34): a jump over units
  no("a jump over units (case 045 С2 retry 4: 0/34 then 19/34)", { code: "С2в9", kind: "step", k: 19, n: 39, text: "031 review-9 fully read" }, /пропущены единицы 2–18.*k: 2, n: 39/)
  no("the same unit twice", { code: "С2в9", kind: "step", k: 1, n: 39, text: "ещё раз" }, /единица 1 уже записана/)
  no("k above n", { code: "С2в9", kind: "step", k: 2, n: 1, text: "x" }, /больше n/)
  // case 045 С2 retry 2: seven signatures of 82-88 characters (the tool allowed 120)
  no("a signature of 87 characters (case 045 С2 retry 2, unit 6)", { code: "С2в9", kind: "step", k: 2, n: 39, text: "031 spec.md fully reread: closed format, REQ/AC/DNC, examples, owner questions, history" }, /87 знаков, предел 80.*сократи text на 7/)
  // case 031 С2-9 finding 3: a stop with a kind outside the list
  no("a stop kind outside the list (case 031 С2-9: «ресурсный»)", { code: "С2в9", kind: "stop", stop: "ресурсный", text: "прочитано 5/40" }, /«ресурсный» не из списка.*вопрос, план, ревизия, требования, ворота/)
  no("a stop without a kind", { code: "С2в9", kind: "stop", text: "блокер" }, /не назван/)
  no("a step text that begins with «готово»", { code: "С2в9", kind: "step", k: 2, n: 39, text: "готово всё" }, /kind start, done, stop/)
  no("done before the last unit", { code: "С2в9", kind: "done", text: "итог" }, /не записаны единицы 2–38 из 39/)

  const st = put({ code: "С2в9", kind: "stop", stop: "вопрос", text: "нужен ответ о составе описи" }, 3, 21)
  cell("kind: stop takes k and n of the session and writes «стоп: вид — причина»", st.ok && st.line === "С2в9 1/39 [2026-10-09 03:21] стоп: вопрос — нужен ответ о составе описи", JSON.stringify(st))
  cell("kind: the panel reads the stop kind", stopKind(parseLine(st.line).text) === "вопрос", st.line)
  // task 053 (methodology d5f1e80): after «стоп:» the same session writes no units, the work goes on in a new session (kind start)
  no("a unit of the same session after a stop", { code: "С2в9", kind: "step", k: 2, n: 40, text: "README плагина прочитан; опись 40 по ответу" }, /остановлена строкой стоп:.*новой сессией.*kind: "start"/)
  const c2 = put({ code: "С2в9", kind: "start", n: 40, pass: 9, text: "продолжение после ответа" }, 5, 13)
  cell("kind: after a stop the work goes on in a new session that begins with a start", c2.ok && c2.line.startsWith("С2в9 0/40 "), JSON.stringify(c2))

  // a short session to the end
  put({ code: "С3", kind: "start", n: 2 }, 6, 0)
  put({ code: "С3", kind: "step", k: 1, n: 2, text: "раздел 1 плана" }, 6, 1)
  const d = put({ code: "С3", kind: "done", text: "план готов к С4" }, 6, 2)
  cell("kind: done is the line of the last unit N/N with the exact keyword", d.ok && d.line === "С3 2/2 [2026-10-09 06:02] готово — план готов к С4" && keywordOf(parseLine(d.line).text) === "готово", JSON.stringify(d))
  no("a line of the same session after done", { code: "С3", kind: "step", k: 3, n: 3, text: "ещё" }, /нет строки старт после её «готово»|закончена строкой готово/)
  // task 050: a repeat of «готово» with the same k is the fix of its form (methodology 09e86c1); with another k it is refused
  no("a second done with another k", { code: "С3", kind: "done", n: 3 }, /только её повтор с тем же k/)
  const s3 = put({ code: "С3", kind: "start", n: 1, text: "правка плана" }, 7, 0)
  cell("kind: a new start of the same code opens a new session", s3.ok && s3.line === "С3 0/1 [2026-10-09 07:00] старт — правка плана", JSON.stringify(s3))
  // task 053: the launch line is not written by the agent (the boundary of a session is the mark of the runner or the orchestrator)
  no("a launch line from the agent", { code: "С5", kind: "launch" }, /запуск.*не пишет/)
  const nonReview = put({ code: "С5", kind: "start", n: 3, text: "план из 3 пунктов" }, 7, 2)
  cell("kind: a start of a non-review session needs no pass", nonReview.ok && nonReview.line === "С5 0/3 [2026-10-09 07:02] старт — план из 3 пунктов", JSON.stringify(nonReview))
  const ru = put({ code: "С5", kind: "шаг", k: 1, n: 3, text: "пункт 1 сделан" }, 7, 3)
  cell("kind: Russian names of the kinds are accepted", ru.ok && ru.line.startsWith("С5 1/3 "), JSON.stringify(ru))
  // every line the tool wrote is a line of the journal form for the guard and the panel
  const all = read(abs).split("\n").filter(Boolean)
  cell("kind: every written line has the journal form and a signature of at most 80 characters", all.every((x) => { const p = parseLine(x); return p && [...p.text].length <= 80 }), JSON.stringify(all))
}

// ---- the correction line (task 050, methodology 09e86c1, task-runner.md «Строки progress.log»): a line of the same session with the
// current k and the signature «поправка: к строке «<start, up to 30 characters>» — <what is wrong>»; not a unit, k does not change;
// not after the final line (the final line is fixed by its repeat with the same k and keyword); a skipped unit and a start that is not
// the first line cannot be corrected: the answer says to go on with the work and not to begin a new attempt ----
{
  const tdir = path.join(base, "doc", "tasks", "050-c")
  mkdirSync(tdir, { recursive: true })
  const f = "doc/tasks/050-c/progress.log"
  const abs = path.join(tdir, "progress.log")
  const put = (input, h = 9, m = 0) => progressLine({ file: f, ...input }, base, at(h, m))
  const hand = (line) => writeFileSync(abs, (exists(abs) ? read(abs) : "") + line + "\n")
  const no = (name, input, why) => {
    const snapshot = exists(abs) ? read(abs) : null
    const x = put(input)
    cell(`correction refused: ${name}`, x.ok === false && (exists(abs) ? read(abs) : null) === snapshot && why.test(x.reason), JSON.stringify(x))
  }

  no("a correction before any line of the session", { code: "С2", kind: "correction", to: "С2 1/5", text: "x" }, /нечего поправлять|нет строк/)
  put({ code: "С2", kind: "start", n: 5, pass: 1 }, 9, 0)
  put({ code: "С2", kind: "step", k: 1, n: 5, text: "spec.md прочитан" }, 9, 1)
  // a line written by hand, 93 characters (case 045 С1)
  hand("С2 2/5 [2026-10-09 09:02] опись source inventory пересчитана: 31 файл и бриф; 013 расхождение закреплений зафиксировано")
  const c = put({ code: "С2", kind: "correction", to: "опись source inventory", text: "подпись 93 знака, предел 80" }, 9, 3)
  cell("correction: the tool builds «поправка: к строке «…» — …» with the current k", c.ok && c.line === "С2 2/5 [2026-10-09 09:03] поправка: к строке «опись source inventory» — подпись 93 знака, предел 80", JSON.stringify(c))
  cell("correction: the panel reads «поправка» as the keyword", keywordOf(parseLine(c.line ?? "x 0/0 x")?.text ?? "") === "поправка", JSON.stringify(c))
  cell("correction: «поправка» without a colon is no keyword", keywordOf("поправка без двоеточия") === undefined, String(keywordOf("поправка без двоеточия")))
  // task 053 (methodology d5f1e80): the quote is the start of the signature after the time, 10 to 30 characters, or the whole short signature
  no("a correction quoting the whole line with the code and the time", { code: "С2", kind: "correction", to: "С2 2/5 [2026-10-09 09:02] опись source inventory", text: "x" }, /начало подписи после времени/)
  const ru = put({ code: "С2", kind: "поправка", to: "опись source inventory пересчитана: 31 файл", text: "ещё раз" }, 9, 4)
  cell("correction: the Russian kind name; the start of the signature is cut to 30 characters", ru.ok && ru.line === "С2 2/5 [2026-10-09 09:04] поправка: к строке «опись source inventory пересчи» — ещё раз", JSON.stringify(ru))
  no("a correction quoting no line of the session", { code: "С2", kind: "correction", to: "такой строки нет", text: "x" }, /не нашлась.*продолжай работу.*новую попытку/)
  no("a correction without text", { code: "С2", kind: "correction", to: "опись source" }, /что не так/)
  no("a correction without the start of the line", { code: "С2", kind: "correction", text: "x" }, /нужен to/)
  no("a step whose text begins with «поправка:»", { code: "С2", kind: "step", k: 3, n: 5, text: "поправка: к строке «x» — y" }, /ключевого слова «поправка:»/)
  // a correction is not a unit: the next unit is still k+1, the same k is a repeat
  no("the unit of the correction line is not taken as written twice by the tool", { code: "С2", kind: "step", k: 2, n: 5, text: "x" }, /единица 2 уже записана/)
  const s3 = put({ code: "С2", kind: "step", k: 3, n: 5, text: "README прочитан" }, 9, 5)
  cell("correction: the next unit after a correction is k+1", s3.ok && s3.line.startsWith("С2 3/5 "), JSON.stringify(s3))
  const c0 = put({ code: "С4", kind: "start", n: 2, pass: 3 }, 9, 6)
  hand("С4 0/2 [2026-10-09 09:06] старт — лишнее")
  const c0c = put({ code: "С4", kind: "correction", to: "старт — лишнее", text: "вторая строка старт" }, 9, 7)
  const c0s = put({ code: "С4", kind: "step", k: 1, n: 2, text: "план прочитан" }, 9, 8)
  cell("correction: a correction with k=0 after the start does not open a new session", c0.ok && c0c.ok && c0c.line.startsWith("С4 0/2 ") && c0s.ok && c0s.line.startsWith("С4 1/2 "), JSON.stringify([c0, c0c, c0s]))

  // the final line: no correction after it; its repeat with the same k and keyword is the fix
  put({ code: "С2", kind: "step", k: 4, n: 5, text: "x4" }, 9, 9)
  put({ code: "С2", kind: "step", k: 5, n: 5, text: "x5" }, 9, 10)
  const d = put({ code: "С2", kind: "done", text: "итог" }, 9, 11)
  no("a correction after «готово»", { code: "С2", kind: "correction", to: "готово", text: "x" }, /после итоговой строки.*повтор.*kind: "done"/)
  const dd = put({ code: "С2", kind: "done", text: "итог в верной форме" }, 9, 12)
  cell("correction: the final «готово» is repeated with the same k", d.ok && dd.ok && dd.line === "С2 5/5 [2026-10-09 09:12] готово — итог в верной форме", JSON.stringify([d, dd]))
  no("a step after a repeated «готово»", { code: "С2", kind: "step", k: 6, n: 6, text: "x" }, /нет строки старт после её «готово»|закончена строкой готово/)
  put({ code: "С6", kind: "start", n: 3, pass: 2 }, 10, 0)
  put({ code: "С6", kind: "step", k: 1, n: 3, text: "AC-01 проверен" }, 10, 1)
  hand("С6 1/3 [2026-10-09 10:02] стоп: ресурсный — блокер")
  no("a correction after «стоп:»", { code: "С6", kind: "correction", to: "стоп: ресурсный", text: "вид не из списка" }, /после итоговой строки.*повтор.*kind: "stop"/)
  const sr = put({ code: "С6", kind: "stop", stop: "вопрос", text: "блокер" }, 10, 3)
  cell("correction: a stop with a wrong kind is repeated with the same k", sr.ok && sr.line === "С6 1/3 [2026-10-09 10:03] стоп: вопрос — блокер", JSON.stringify(sr))
  put({ code: "С3", kind: "start", n: 2 }, 11, 0)
  put({ code: "С3", kind: "step", k: 1, n: 2, text: "раздел 1" }, 11, 1)
  hand("С3 2/2 [2026-10-09 11:02] Готово")
  no("a correction after a final line with a keyword error («Готово»)", { code: "С3", kind: "correction", to: "Готово", text: "заглавная" }, /после итоговой строки.*повтор.*kind: "done"/)
  const g = put({ code: "С3", kind: "done" }, 11, 3)
  cell("correction: «Готово» is fixed by «готово» with the same k", g.ok && g.line === "С3 2/2 [2026-10-09 11:03] готово", JSON.stringify(g))

  // a session that began without a start line (written by hand): the start cannot be corrected - go on, no new attempt
  hand("С1 1/4 [2026-10-09 12:00] опись прочитана")
  const go = put({ code: "С1", kind: "step", k: 2, n: 4, text: "источник 2 прочитан" }, 12, 1)
  cell("correction: a session without a start goes on with the next unit, the answer says not to begin a new attempt", go.ok && go.line.startsWith("С1 2/4 ") && /продолжай работу.*новую попытку/.test(go.hint), JSON.stringify(go))
  const gc = put({ code: "С1", kind: "correction", to: "опись прочитана", text: "нет строки старт" }, 12, 2)
  cell("correction: the answer to a correction of a session without a start says to go on, not to begin a new attempt", gc.ok && /старт не первой строкой.*поправкой не исправить.*продолжай работу.*новую попытку/.test(gc.hint), JSON.stringify(gc))
  hand("С5 0/9 [2026-10-09 13:00] старт")
  hand("С5 1/9 [2026-10-09 13:01] пункт 1")
  hand("С5 4/9 [2026-10-09 13:02] пункт 4")
  const sk = put({ code: "С5", kind: "correction", to: "пункт 4", text: "пропущены 2–3" }, 13, 3)
  cell("correction: the answer to a correction of a session with a skipped unit says to go on, not to begin a new attempt", sk.ok && /пропуск единицы.*поправкой не исправить.*продолжай работу.*новую попытку/.test(sk.hint), JSON.stringify(sk))
  const all = read(abs).split("\n").filter(Boolean)
  cell("correction: every line of the tool has a signature of at most 80 characters", [c, ru, c0c, dd, sr, g, go, gc, sk].every((x) => x.ok && [...parseLine(x.line).text].length <= 80), JSON.stringify(all))
}

// ---- the panel reads the journal by the growth of k: a correction is not a unit and does not lift «без прогресса» (task 050) ----
{
  const parse = (...ls) => ls.map((l) => parseLine(l))
  const t = (h, m) => new Date(2026, 9, 9, h, m).getTime()
  const th = { ...DEFAULT_THRESHOLDS }
  const entry = (lines, now) => {
    const ss = sessionsOf(parse(...lines))
    return { n: ss.length, e: entryOf(ss[ss.length - 1], t(23, 0), now, th) }
  }
  const one = sessionsOf(parse("С2 0/3 [10:00] старт заход 1", "С2 0/3 [10:01] поправка: к строке «С2 0/3» — x", "С2 1/3 [10:02] а"))
  cell("panel: a correction with k=0 after the start does not open a new session", one.length === 1 && one[0].rows.length === 3, JSON.stringify(one.map((s) => s.rows.length)))
  const a = entry(["С5 0/3 [10:00] старт", "С5 1/3 [10:01] пункт 1", "С5 1/3 [10:30] поправка: к строке «пункт 1» — x"], t(10, 31))
  cell("panel: a correction does not lift «без прогресса» (k did not grow for 30 minutes)", a.n === 1 && a.e.state === 6 && a.e.stale === true, JSON.stringify(a.e))
  cell("panel: the shown k/N and signature are of the last unit, not of the correction", a.e.last.k === 1 && a.e.last.text === "пункт 1", JSON.stringify(a.e.last))
  const b = entry(["С5 0/3 [10:00] старт", "С5 1/3 [10:01] пункт 1", "С5 1/3 [10:30] пункт 1 ещё раз"], t(10, 31))
  cell("panel: «без прогресса» is counted by the growth of k, a line with the same k does not lift it", b.e.state === 6, JSON.stringify(b.e))
  const c = entry(["С5 0/3 [10:00] старт", "С5 1/3 [10:01] пункт 1", "С5 2/3 [10:29] пункт 2"], t(10, 31))
  cell("panel: k grew 2 minutes ago - the session goes", c.e.state === 5 && c.e.stale === false, JSON.stringify(c.e))
  const d = entry(["С3 0/2 [10:00] старт", "С3 2/2 [10:01] Готово", "С3 2/2 [10:02] готово — итог"], t(10, 3))
  cell("panel: the repeat of the final line in the right form is read instead of the former", d.e.state === 2, JSON.stringify(d.e))
  const e = entry(["С5 0/0 [10:00] запуск", "С5 0/0 [10:01] поправка: к строке «С5 0/0» — x"], t(10, 2))
  cell("panel: a correction alone after a launch keeps the launch state", e.e.state === 3, JSON.stringify(e.e))
}

// ---- task 053 (methodology d5f1e80, task-runner.md «Строки progress.log», «Что проверить в программе»): «готово» against N of the start
// line, one start per session, nothing after the final line but its repeat and «стоп:» after «готово» with k below N, no launch from the
// agent, the quote of a correction is the start of the signature after the time (10 to 30 characters or the whole short signature) ----
{
  const tdir = path.join(base, "doc", "tasks", "053-m")
  mkdirSync(tdir, { recursive: true })
  const f = "doc/tasks/053-m/progress.log"
  const abs = path.join(tdir, "progress.log")
  const put = (input, h = 14, m = 0) => progressLine({ file: f, ...input }, base, at(h, m))
  const hand = (line) => writeFileSync(abs, (exists(abs) ? read(abs) : "") + line + "\n")
  const no = (name, input, why) => {
    const snapshot = exists(abs) ? read(abs) : null
    const x = put(input)
    cell(`053 refused: ${name}`, x.ok === false && (exists(abs) ? read(abs) : null) === snapshot && why.test(x.reason), JSON.stringify(x))
  }
  // 6: the launch line is not the agent's
  no("launch from the agent, even as the first line of the file", { code: "С5", kind: "launch" }, /запуск.*не пишет/)
  cell("053: a refused launch does not create the file", !exists(abs), "created")
  no("launch by its Russian name", { code: "С5", kind: "запуск" }, /не пишет/)

  // 2: «готово» is compared with N of the start line; more units than expected give k above N
  put({ code: "С5", kind: "start", n: 8, text: "план из 8 пунктов" }, 14, 0)
  for (let i = 1; i <= 8; i++) put({ code: "С5", kind: "step", k: i, n: 8, text: `пункт ${i}` }, 14, i)
  const s9 = put({ code: "С5", kind: "step", k: 9, n: 9, text: "пункт 9 по находке" }, 14, 9)
  const d9 = put({ code: "С5", kind: "done", n: 8, text: "девять пунктов" }, 14, 10)
  cell("053: «9/8 готово» after «0/8 старт» is a finish; k does not fall below the last unit", s9.ok && d9.ok && d9.line === "С5 9/8 [2026-10-09 14:10] готово — девять пунктов", JSON.stringify([s9, d9]))

  // 3 (methodology ab2a4ef): «готово» with k below N of the start is no final line; it is fixed by what happened: the work goes on -
  // a correction and further units; the session stopped - «стоп:» with the same k; the work is done and N was too high -
  // «готово — N завышено: <причина>» with the same k, a final line and a finish, at once or after the former «готово»
  put({ code: "С6", kind: "start", n: 10, pass: 1 }, 15, 0)
  for (let i = 1; i <= 7; i++) put({ code: "С6", kind: "step", k: i, n: 7, text: `AC-0${i} проверен` }, 15, i)
  no("«7/7 готово» after «0/10 старт» (k below N of the start)", { code: "С6", kind: "done", text: "итог" }, /N из строки старт.*10.*N завышено.*kind: "stop"/)
  hand("С6 7/7 [2026-10-09 15:08] готово — семь из десяти")
  const fixC = put({ code: "С6", kind: "correction", to: "готово — семь из десяти", text: "N завышено" }, 15, 9)
  cell("053: a correction after «готово» with k below N is accepted (it is no final line)", fixC.ok && fixC.line.startsWith("С6 7/7 "), JSON.stringify(fixC))
  no("a plain repeat of «готово» with k below N of the start", { code: "С6", kind: "done", text: "итог" }, /N из строки старт/)
  const over = put({ code: "С6", kind: "done", text: "N завышено: AC семь, а не десять" }, 15, 10)
  cell("053: «готово — N завышено: …» with the same k is the final line", over.ok && over.line === "С6 7/7 [2026-10-09 15:10] готово — N завышено: AC семь, а не десять", JSON.stringify(over))
  no("a unit after «готово — N завышено»", { code: "С6", kind: "step", k: 8, n: 10, text: "AC-08" }, /закончена строкой готово/)
  put({ code: "С7", kind: "start", n: 3 }, 15, 20)
  put({ code: "С7", kind: "step", k: 1, n: 1, text: "пункт 1" }, 15, 21)
  hand("С7 1/1 [2026-10-09 15:22] готово")
  const goOn = put({ code: "С7", kind: "step", k: 2, n: 3, text: "пункт 2" }, 15, 23)
  cell("053: after «готово» with k below N the work goes on with the next unit", goOn.ok && goOn.line.startsWith("С7 2/3 "), JSON.stringify(goOn))
  put({ code: "С7", kind: "step", k: 3, n: 3, text: "пункт 3" }, 15, 24)
  const d7 = put({ code: "С7", kind: "done" }, 15, 25)
  cell("053: then «готово» at N of the start is a finish", d7.ok && d7.line === "С7 3/3 [2026-10-09 15:25] готово", JSON.stringify(d7))
  put({ code: "С8", kind: "start", n: 5 }, 15, 30)
  put({ code: "С8", kind: "step", k: 1, n: 1, text: "сценарий 1" }, 15, 31)
  hand("С8 1/1 [2026-10-09 15:32] готово")
  const st8 = put({ code: "С8", kind: "stop", stop: "вопрос", text: "нужен ответ о сценариях" }, 15, 33)
  cell("053: after «готово» with k below N the stop takes the same k", st8.ok && st8.line === "С8 1/1 [2026-10-09 15:33] стоп: вопрос — нужен ответ о сценариях", JSON.stringify(st8))
  no("a unit after that stop", { code: "С8", kind: "step", k: 2, n: 5, text: "x" }, /остановлена строкой стоп:/)
  put({ code: "С9", kind: "start", n: 3 }, 15, 40)
  put({ code: "С9", kind: "step", k: 1, n: 3, text: "замечание 1" }, 15, 41)
  const d9n = put({ code: "С9", kind: "done", text: "N завышено: два замечания слиты" }, 15, 42)
  cell("053: «готово — N завышено» at once, without a former «готово», keeps k and N", d9n.ok && d9n.line === "С9 1/3 [2026-10-09 15:42] готово — N завышено: два замечания слиты", JSON.stringify(d9n))

  // 4: one start per session; «готово» without a start or after a second start is not written
  put({ code: "С3", kind: "start", n: 2 }, 16, 0)
  put({ code: "С3", kind: "step", k: 1, n: 2, text: "раздел 1" }, 16, 1)
  no("a second start inside an open session", { code: "С3", kind: "start", n: 2 }, /строка старт в сессии одна/)
  hand("С3 0/2 [2026-10-09 16:02] старт")
  const after2 = put({ code: "С3", kind: "step", k: 2, n: 2, text: "раздел 2" }, 16, 3)
  cell("053: after a hand-written second start the session goes on (it cannot be corrected)", after2.ok && /продолжай работу/.test(after2.hint), JSON.stringify(after2))
  no("«готово» after a second start", { code: "С3", kind: "done", text: "итог" }, /второй строкой старт.*kind: "stop"/)
  hand("С4 1/3 [2026-10-09 16:05] план прочитан")
  put({ code: "С4", kind: "step", k: 2, n: 3, text: "раздел 2" }, 16, 6)
  put({ code: "С4", kind: "step", k: 3, n: 3, text: "раздел 3" }, 16, 7)
  no("«готово» in a session without a start", { code: "С4", kind: "done", text: "итог" }, /без строки старт.*kind: "start"/)
  const st4 = put({ code: "С4", kind: "stop", stop: "ворота", text: "сессия без строки старт" }, 16, 8)
  cell("053: a session without a start ends with a stop", st4.ok && st4.line.startsWith("С4 3/3 "), JSON.stringify(st4))

  // 5: after the final line only its repeat in the right form; a stop repeat keeps a kind of the list
  no("a stop repeat that changes a kind of the list", { code: "С4", kind: "stop", stop: "вопрос", text: "x" }, /вид остановки.*только если прежний не из списка/)
  const rep4 = put({ code: "С4", kind: "stop", stop: "ворота", text: "сессия без старта" }, 16, 9)
  cell("053: a stop repeat with the same k and kind is accepted", rep4.ok && rep4.line.startsWith("С4 3/3 "), JSON.stringify(rep4))
  no("«готово» after «стоп:»", { code: "С4", kind: "done", text: "итог" }, /остановлена строкой стоп:/)

  // ab2a4ef: a start that is missing is written now and the work goes on; a meeting code (Ф) is a session code
  hand("Ф 1/2 [2026-10-09 16:30] факты по вопросу 1")
  const late = put({ code: "Ф", kind: "start", n: 2 }, 16, 31)
  cell("053: a missing start line is written now (0/N старт) and the session goes on", late.ok && late.line === "Ф 0/2 [2026-10-09 16:31] старт", JSON.stringify(late))
  const lateStep = put({ code: "Ф", kind: "step", k: 2, n: 2, text: "факты по вопросу 2" }, 16, 32)
  no("a second start after the late one", { code: "Ф", kind: "start", n: 2 }, /строка старт в сессии одна/)
  const lateDone = put({ code: "Ф", kind: "done" }, 16, 33)
  cell("053: after the late start the next unit and «готово» are written", lateStep.ok && lateStep.line.startsWith("Ф 2/2 ") && lateDone.ok && lateDone.line.startsWith("Ф 2/2 "), JSON.stringify([lateStep, lateDone]))

  // ab2a4ef: the agent does not write the launch record into log.md either
  {
    const ldir = path.join(base, "doc", "tasks", "053-l")
    mkdirSync(ldir, { recursive: true })
    const lf = path.join(ldir, "log.md")
    writeFileSync(lf, "2026-10-09 10:00 документ: задание\n")
    const snap = read(lf)
    const x = logLine({ file: "doc/tasks/053-l/log.md", kind: "пуск", text: "запуск №3 С5 [2026-10-09 10:01]" }, base, at(10, 1))
    cell("053 refused: a launch record in log.md from the agent", x.ok === false && read(lf) === snap && /запуск.*не пишет/.test(x.reason), JSON.stringify(x))
    const y = logLine({ file: "doc/tasks/053-l/log.md", kind: "пуск", text: "С5 запущен оркестратором, запуск №3" }, base, at(10, 2))
    cell("053: an entry that only mentions a launch is written", y.ok, JSON.stringify(y))
  }

  // 1: the quote of a correction
  put({ code: "С1", kind: "start", n: 3 }, 17, 0)
  hand("С1 1/3 [2026-10-09 17:01] опись source inventory пересчитана: 31 файл и бриф; 013 расхождение закреплений зафиксировано")
  hand("С1 2/3 [2026-10-09 17:02] Бриф")
  const q1 = put({ code: "С1", kind: "correction", to: "опись", text: "подпись 93 знака" }, 17, 3)
  cell("053: a quote shorter than 10 characters is taken from the signature up to 10", q1.ok && q1.line.endsWith("поправка: к строке «опись sour» — подпись 93 знака"), JSON.stringify(q1))
  const q2 = put({ code: "С1", kind: "correction", to: "Бриф", text: "заглавная" }, 17, 4)
  cell("053: a signature shorter than 10 characters is quoted whole", q2.ok && q2.line.endsWith("поправка: к строке «Бриф» — заглавная"), JSON.stringify(q2))
  no("a quote that begins with the time field", { code: "С1", kind: "correction", to: "[2026-10-09 17:01] опись", text: "x" }, /начало подписи после времени/)

  // the panel reads the same (task-runner.md, «Что проверить в программе»)
  const T = (h, m) => new Date(2026, 9, 9, h, m).getTime()
  const th = { ...DEFAULT_THRESHOLDS }
  const last = (...ls) => {
    const ss = sessionsOf(ls.map((l) => parseLine(l)))
    return entryOf(ss[ss.length - 1], T(23, 0), T(10, 5), th)
  }
  cell("053 panel: «9/8 готово» after «0/8 старт» is a finish", last("С5 0/8 [10:00] старт", "С5 9/9 [10:01] п9", "С5 9/8 [10:02] готово").state === 2, "")
  cell("053 panel: «7/7 готово» after «0/10 старт» is not a finish", last("С6 0/10 [10:00] старт", "С6 7/7 [10:01] п7", "С6 7/7 [10:02] готово").state !== 2, "")
  const stopAfter = last("С6 0/10 [10:00] старт", "С6 7/7 [10:01] готово", "С6 7/7 [10:02] стоп: ворота — N завышено")
  cell("053 panel: «стоп:» after «готово» with k below N of the start is a stop", stopAfter.state === 1 && stopAfter.kind === "ворота", JSON.stringify(stopAfter))
  cell("053 panel: «готово» without a start line is not a finish", last("С4 1/3 [10:00] а", "С4 3/3 [10:01] готово").state !== 2, "")
  cell("053 panel: «готово» after a second start line is not a finish", last("С3 0/2 [10:00] старт", "С3 1/2 [10:01] а", "С3 0/2 [10:02] старт", "С3 2/2 [10:03] готово").state !== 2, "")
  cell("053 panel: a launch line opens a new session, its start and «готово» are a finish", last("С3 0/2 [10:00] старт", "С3 1/2 [10:01] а", "С3 0/0 [10:02] запуск", "С3 0/2 [10:03] старт", "С3 2/2 [10:04] готово").state === 2, "")
  cell("053 panel: «7/10 готово — N завышено: …» is a finish at once", last("С6 0/10 [10:00] старт", "С6 7/10 [10:01] п7", "С6 7/10 [10:02] готово — N завышено: семь").state === 2, "")
  cell("053 panel: «7/10 готово — N завышено: …» is a finish after «7/10 готово»", last("С6 0/10 [10:00] старт", "С6 7/10 [10:01] готово", "С6 7/10 [10:02] готово — N завышено: семь").state === 2, "")
  const goes = (() => { const ss = sessionsOf(["С6 0/10 [10:00] старт", "С6 7/7 [10:01] готово", "С6 8/10 [10:02] п8"].map((l) => parseLine(l))); return { n: ss.length, e: entryOf(ss[ss.length - 1], T(23, 0), T(10, 5), th) } })()
  cell("053 panel: units after «готово» with k below N stay in the session, it goes", goes.n === 1 && goes.e.state === 5, JSON.stringify(goes))
  cell("053 panel: a late start line keeps the session; its «готово» is a finish", last("Ф 1/2 [10:00] а", "Ф 0/2 [10:01] старт", "Ф 2/2 [10:02] б", "Ф 2/2 [10:03] готово").state === 2, "")
  cell("053 panel: a numbered launch line «запуск №3» is a launch", last("С3 0/0 [10:00] запуск №3").state === 3, "")
  cell("053 panel: units after «стоп:» are a new session without a start, their «готово» is not a finish", last("С2 0/3 [10:00] старт", "С2 1/3 [10:01] а", "С2 1/3 [10:02] стоп: вопрос — x", "С2 2/3 [10:03] б", "С2 3/3 [10:04] готово").state !== 2, "")
  const all = read(abs).split("\n").filter(Boolean)
  cell("053: every line has the journal form", all.every((x) => parseLine(x)), JSON.stringify(all))
}

// ---- task 053, the launcher (methodology ab2a4ef: the launch is written by the one who launches): in the manual cycle the integrator tab
// launches the sessions; progress_line kind launch from the launcher writes «<code> 0/0 [time] запуск №<n>» (n = 1 + the largest launch
// number in progress.log and log.md) and the record «<time> пуск: запуск №<n> <code> [time]» into log.md of the same folder; the agent of a
// session is refused; log_line takes the launch record from the launcher only ----
{
  const tdir = path.join(base, "doc", "tasks", "053-r")
  mkdirSync(tdir, { recursive: true })
  const f = "doc/tasks/053-r/progress.log"
  const abs = path.join(tdir, "progress.log")
  const lmd = path.join(tdir, "log.md")
  const L = { launcher: true }
  const rd = (x) => (exists(x) ? read(x) : "")
  const l1 = progressLine({ file: f, code: "С5", kind: "launch" }, base, at(18, 0), L)
  cell("launcher: the first launch creates progress.log with «запуск №1»", l1.ok && l1.line === "С5 0/0 [2026-10-09 18:00] запуск №1" && rd(abs) === l1.line + "\n", JSON.stringify(l1))
  cell("launcher: the record «запуск №1 С5 [time]» is written into log.md of the folder", exists(lmd) && rd(lmd) === "2026-10-09 18:00 пуск: запуск №1 С5 [2026-10-09 18:00]\n", exists(lmd) ? rd(lmd) : "no log.md")
  const st = progressLine({ file: f, code: "С5", kind: "start", n: 2 }, base, at(18, 1))
  cell("launcher: the agent of the session then writes its start", st.ok && st.line.startsWith("С5 0/2 "), JSON.stringify(st))
  writeFileSync(lmd, rd(lmd) + "2026-10-09 18:02 пуск: запуск №5 С6 [2026-10-09 18:02]\n")
  const l6 = progressLine({ file: f, code: "С6", kind: "launch" }, base, at(18, 3), L)
  cell("launcher: the number is 1 + the largest launch number in progress.log and log.md", l6.ok && l6.line === "С6 0/0 [2026-10-09 18:03] запуск №6" && rd(lmd).endsWith("2026-10-09 18:03 пуск: запуск №6 С6 [2026-10-09 18:03]\n"), JSON.stringify([l6, rd(lmd)]))
  const snapP = rd(abs)
  const snapL = rd(lmd)
  const dup = progressLine({ file: f, code: "С6", kind: "launch", launch: 5 }, base, at(18, 4), L)
  cell("launcher refused: a launch number that was already used (№5 in log.md)", dup.ok === false && /№5.*уже/.test(dup.reason) && rd(abs) === snapP && rd(lmd) === snapL, JSON.stringify(dup))
  const l7 = progressLine({ file: f, code: "С6", kind: "launch", launch: 7 }, base, at(18, 5), L)
  cell("launcher: a free number given by the launcher is taken", l7.ok && l7.line === "С6 0/0 [2026-10-09 18:05] запуск №7", JSON.stringify(l7))
  const ag = progressLine({ file: f, code: "С6", kind: "launch" }, base, at(18, 6))
  cell("launcher refused: the agent of a session gets no launch line and no record", ag.ok === false && /запуск.*не пишет/.test(ag.reason) && rd(lmd).split("\n").filter(Boolean).length === 4, JSON.stringify(ag))
  const rec = logLine({ file: "doc/tasks/053-r/log.md", kind: "пуск", text: "запуск №8 С7 [2026-10-09 18:07]" }, base, at(18, 7), L)
  cell("launcher: log_line takes the launch record from the launcher", rec.ok && rec.line === "2026-10-09 18:07 пуск: запуск №8 С7 [2026-10-09 18:07]", JSON.stringify(rec))
  // the rule the machine checks: the calling tab holds the integrator role of its project and has no task or review of its own
  cell("launcher: an integrator tab holding the role, without a task, is the launcher", isLauncherCard({ role: "integrator", session: "s" }, true) === true, "")
  cell("launcher: a tab of role integrator that does not hold the role is no launcher", isLauncherCard({ role: "integrator", session: "s" }, false) === false, "")
  cell("launcher: an executor (worker with a task) is no launcher", isLauncherCard({ role: "worker", session: "s", task: { project: "p", n: 1 } }, false) === false, "")
  cell("launcher: an acceptor (a tab with a review) is no launcher even as integrator", isLauncherCard({ role: "integrator", session: "s", review: { project: "p", n: 1 } }, true) === false, "")
  cell("launcher: no card - no launcher", isLauncherCard(undefined, true) === false, "")
}

// ---- log_line ----
{
  const ldir = path.join(base, "doc", "tasks", "049-l")
  mkdirSync(ldir, { recursive: true })
  const lf = path.join(ldir, "log.md")
  writeFileSync(lf, "Методика: x @ abc") // no newline at the end
  const r = logLine({ file: "doc/tasks/049-l/log.md", kind: "решение владельца", text: "владелец, 2026-10-15, чат: «по рекомендации»" }, base, at(16, 1))
  cell("log: one entry with the machine date and time, the missing newline of the file is added first", r.ok && read(lf) === "Методика: x @ abc\n2026-10-09 16:01 решение владельца: владелец, 2026-10-15, чат: «по рекомендации»\n", JSON.stringify([r, read(lf)]))
  const LOG_ENTRY = /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} (решение владельца|заседание|ворота|документ|пуск|слияние|находка): /
  cell("log: the entry has the form of the guard rule log-line", LOG_ENTRY.test(r.line), r.line)
  const snap = read(lf)
  const lno = (name, input, why) => {
    const x = logLine({ file: "doc/tasks/049-l/log.md", ...input }, base, at(16, 2))
    cell(`log refused: ${name}`, x.ok === false && read(lf) === snap && (!why || why.test(x.reason)), JSON.stringify(x))
  }
  // case 031 review 7: the kind of an entry was the session code instead of a kind of the list, two entries glued
  lno("a kind outside the list (case 031: «С1п5»)", { kind: "С1п5", text: "x" }, /«с1п5» не из списка.*решение владельца, заседание/)
  lno("no kind", { text: "x" }, /не назван/)
  lno("two entries in one call", { kind: "документ", text: "раз\n2026-10-09 16:02 документ: два" }, /одна запись — одна строка/)
  lno("empty text", { kind: "документ", text: " " })
  lno("other file name", { file: "doc/tasks/049-l/progress.log", kind: "документ", text: "x" })
  lno("outside the project", { file: "../x/log.md", kind: "документ", text: "x" })
  const fresh = logLine({ file: "doc/tasks/049-l/sub/log.md", kind: "документ", text: "x" }, base, at(16, 3))
  cell("log: no folder - not created", fresh.ok === false && !exists(path.join(ldir, "sub")), JSON.stringify(fresh))
}

// ---- usage_line ----
const repo = path.join(base, "repo")
mkdirSync(path.join(repo, "t"), { recursive: true })
writeFileSync(path.join(repo, "t", "progress.log"), "С5д 0/0 [01:00] запуск\n")
let head = ""
try {
  const git = (...a) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  git("init", "-q")
  git("add", "--", "t/progress.log")
  git("commit", "-q", "-m", "init", "--no-gpg-sign")
  head = git("rev-parse", "HEAD").trim()
} catch (e) {
  console.log("git unavailable for the commit cell: " + e)
}

const card = {
  model: { providerID: "anthropic", id: "claude-sonnet-5-5", variant: "high" },
  tokens: { input: 1000, output: 200, reasoning: 30, cache: { read: 5000, write: 400 } },
  cost: 0.42,
  time: { created: Date.UTC(2026, 9, 9, 10, 0, 0), updated: Date.UTC(2026, 9, 9, 11, 0, 0) },
}
const now = new Date(Date.UTC(2026, 9, 9, 10, 30, 0))
{
  const lagOf = (since) => (since === card.time.created ? 1234 : null)
  const r = usageLine({ file: urel, code: "С5д", result: "готово: 13 из 13" }, base, { session: "ses_abc", card, now, maxLag: lagOf, commit: () => "" })
  cell("usage: ok, file created next to progress.log", r.ok && exists(ulog), JSON.stringify(r))
  const lines = read(ulog).split("\n")
  cell("usage: exactly one line, newline-terminated", lines.length === 2 && lines[1] === "", JSON.stringify(lines))
  let row
  try { row = JSON.parse(lines[0]) } catch (e) { row = undefined }
  cell("usage: the line is valid JSON with v:1", row?.v === 1, lines[0])
  const want = {
    v: 1, code: "С5д", at: isoLocalOf(now), session: "ses_abc", model: "anthropic/claude-sonnet-5-5", variant: "high",
    tokens: { input: 1000, output: 200, reasoning: 30, cache_read: 5000, cache_write: 400 }, cost: 0.42,
    started: isoLocalOf(new Date(card.time.created)), seconds: 1800, max_loop_lag_ms: 1234, limits: null, tool_calls: null, test_runs: null, commit: "", result: "готово: 13 из 13",
  }
  cell("usage: all fields with the given values", JSON.stringify(row) === JSON.stringify(want), JSON.stringify(row))
  cell("usage: at and started are ISO with the local offset, the same moment", /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(row?.at) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(row?.started) && Date.parse(row.at) === now.getTime() && Date.parse(row.started) === card.time.created, lines[0])
  cell("usage: limits, tool_calls, test_runs are null (nothing invented)", row?.limits === null && row?.tool_calls === null && row?.test_runs === null, lines[0])

  // no card: everything from the card is null, nothing invented
  const r2 = usageLine({ file: urel, code: "С5д", result: "без карточки" }, base, { session: "ses_zzz", card: undefined, now, commit: () => "" })
  const row2 = JSON.parse(read(ulog).split("\n")[1])
  cell("usage: no session card gives null, not invented values", r2.ok && row2.model === null && row2.variant === null && row2.tokens === null && row2.cost === null && row2.started === null && row2.seconds === null && row2.max_loop_lag_ms === null, JSON.stringify(row2))
  const r3 = usageLine({ file: urel, code: "С5д", result: "частичная" }, base, { session: "ses_p", card: { model: { id: "m" }, tokens: { input: 5 } }, now, commit: () => "" })
  const row3 = JSON.parse(read(ulog).split("\n")[2])
  cell("usage: a partial card gives null for the missing parts", r3.ok && row3.model === "m" && row3.variant === null && row3.tokens.input === 5 && row3.tokens.output === null && row3.cost === null, JSON.stringify(row3))
  const kept = read(ulog)
  cell("usage: history is kept, appended only", kept.split("\n").length === 4 && kept.startsWith(lines[0] + "\n"), kept)

  const snapshot = read(ulog)
  const bad = (name, input, env = {}) => {
    const x = usageLine(input, base, { session: "s", card, now, commit: () => "", ...env })
    cell(`usage refused: ${name}`, x.ok === false && read(ulog) === snapshot, JSON.stringify(x))
  }
  bad("other file name", { file: "doc/tasks/007-x/result.log", code: "С5д", result: "x" })
  bad("progress.log is not writable by usage_line", { file: rel, code: "С5д", result: "x" })
  bad("file outside the project folder", { file: "../outside/usage.log", code: "С5д", result: "x" })
  bad("absolute path outside", { file: path.join(tmp, "other", "usage.log"), code: "С5д", result: "x" })
  bad("multi-line result", { file: urel, code: "С5д", result: "раз\nдва" })
  bad("control characters", { file: urel, code: "С5д", result: "раз\u0007два" })
  bad("long result", { file: urel, code: "С5д", result: "я".repeat(201) })
  bad("empty result", { file: urel, code: "С5д", result: " " })
  bad("code with spaces", { file: urel, code: "С5 д", result: "x" })

  // creation only next to progress.log
  const lone = path.join(base, "doc", "tasks", "009-z")
  mkdirSync(lone, { recursive: true })
  const x = usageLine({ file: "doc/tasks/009-z/usage.log", code: "С5д", result: "x" }, base, { session: "s", card, now, commit: () => "" })
  cell("usage: no creation without progress.log next to it", x.ok === false && !exists(path.join(lone, "usage.log")), JSON.stringify(x))

  // read-only file: the OS refuses
  const rodir = path.join(dir, "rou")
  mkdirSync(rodir, { recursive: true })
  writeFileSync(path.join(rodir, "progress.log"), "С1 0/0 [01:00] запуск\n")
  const rou = path.join(rodir, "usage.log")
  writeFileSync(rou, '{"v":1}\n')
  chmodSync(rou, 0o444)
  const denied = usageLine({ file: rou, code: "С1", result: "x" }, base, { session: "s", card, now, commit: () => "" })
  cell("usage: file access denial is respected", denied.ok === false && /отказал|EPERM|EACCES/.test(denied.reason) && read(rou) === '{"v":1}\n', JSON.stringify(denied))
  chmodSync(rou, 0o644)

  // commit of the folder: real git
  if (head) {
    const y = usageLine({ file: "repo/t/usage.log", code: "С5д", result: "в репозитории" }, base, { session: "s", card, now })
    const yr = y.ok ? JSON.parse(read(path.join(repo, "t", "usage.log"))) : null
    cell("usage: commit is git rev-parse HEAD of the file folder", yr?.commit === head, JSON.stringify([y, head]))
  }
  const z = usageLine({ file: urel, code: "С5д", result: "не репозиторий" }, base, { session: "s", card, now })
  const zr = JSON.parse(read(ulog).trim().split("\n").pop())
  cell("usage: commit empty outside a repository", z.ok && zr.commit === "", JSON.stringify(zr))
}

// ---- loop lag counter ----
{
  resetLoopLagForTest()
  const t0 = Date.now()
  cell("lag: nothing recorded gives null", maxLoopLagSince(t0 - 1000) === null, String(maxLoopLagSince(t0 - 1000)))
  noteLoopLag(40, t0)
  noteLoopLag(2500, t0)
  noteLoopLag(300, t0)
  cell("lag: the largest delay of the window", maxLoopLagSince(t0 - 1000) === 2500, String(maxLoopLagSince(t0 - 1000)))
  cell("lag: nothing before the given start", maxLoopLagSince(t0 + 10 * 60_000) === null, String(maxLoopLagSince(t0 + 10 * 60_000)))
}

// ---- registration by setup ----
{
  const tools = {}
  const names = []
  const calls = { get: [] }
  const ctx = {
    location: { directory: base },
    session: {
      get: async ({ sessionID }) => (calls.get.push(sessionID), { data: { id: sessionID, title: sessionID, location: { directory: base }, ...card } }),
      prompt: async () => {},
      synthetic: async () => {},
      hook: async () => {},
    },
    tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t, names.push(t.name)) }) },
    command: { list: async () => [], transform: async () => {} },
  }
  const stop = await plugin.setup(ctx)
  cell("setup registers progress_line, log_line and usage_line", !!tools.progress_line && !!tools.log_line && !!tools.usage_line, JSON.stringify(names))
  const out = await tools.progress_line.execute({ file: rel, code: "С5д", kind: "step", k: 6, n: 13, text: "через инструмент" }, { sessionID: "ses_t" })
  cell("progress tool writes and answers with the next step", /Записано: С5д 6\/13 \[\d{4}-\d\d-\d\d \d\d:\d\d\] через инструмент\nследующая — k: 7/.test(out.content) && read(log).includes("] через инструмент"), JSON.stringify(out))
  const lo = await tools.log_line.execute({ file: "doc/tasks/007-x/log.md", kind: "находка", text: "через инструмент" }, {})
  cell("log tool writes and answers", /^Записано в log.md: \d{4}-\d\d-\d\d \d\d:\d\d находка: через инструмент$/.test(lo.content), JSON.stringify(lo))
  const lno = await tools.log_line.execute({ file: "doc/tasks/007-x/log.md", kind: "отчёт", text: "x" }, {})
  cell("log tool refuses a kind outside the list", /^Не записано: вид записи «отчёт» не из списка/.test(lno.content), JSON.stringify(lno))
  const no = await tools.progress_line.execute({ file: "doc/tasks/007-x/result.md", code: "С5д", unit: "6/13", text: "x" }, {})
  cell("progress tool refuses a wrong file", /^Не записано/.test(no.content), JSON.stringify(no))
  const u = await tools.usage_line.execute({ file: urel, code: "С5д", result: "через инструмент" }, { sessionID: "ses_t" })
  const last = JSON.parse(read(ulog).trim().split("\n").pop())
  cell("usage tool reads the session card of the calling session", /^Записано/.test(u.content) && calls.get.includes("ses_t") && last.session === "ses_t" && last.model === "anthropic/claude-sonnet-5-5" && last.tokens.cache_write === 400, JSON.stringify([u, last]))
  const un = await tools.usage_line.execute({ file: "doc/tasks/007-x/progress.log", code: "С5д", result: "x" }, { sessionID: "ses_t" })
  cell("usage tool refuses a wrong file", /^Не записано/.test(un.content), JSON.stringify(un))
  // task 053: the plugin asks who calls - a tab that is not the integrator gets no launch line
  const la = await tools.progress_line.execute({ file: rel, code: "С9", kind: "launch" }, { sessionID: "ses_t" })
  cell("progress tool refuses a launch from a tab that is not the integrator", /^Не записано: строку запуск/.test(la.content) && !read(log).includes("С9 0/0"), JSON.stringify(la))
  // the integrator tab (it holds the role and has no task) is the launcher: the launch line and the log.md record are written
  const role = await tools.crew_role.execute({ role: "integrator" }, { sessionID: "ses_int" })
  const li = await tools.progress_line.execute({ file: rel, code: "С9", kind: "launch" }, { sessionID: "ses_int" })
  cell("progress tool writes a launch from the integrator tab and the record in log.md", /^Записано: С9 0\/0 \[[^\]]+\] запуск №\d+/.test(li.content) && /пуск: запуск №\d+ С9 \[/.test(read(path.join(dir, "log.md"))), JSON.stringify([role, li]))
  stop?.()
}

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-journal.test: FAIL ${fail}` : "crew-journal.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the progress panel (task 004; node >= 24):  node test/crew-progress.test.mjs
// The journal `progress.log` of the background sessions: line and time forms, keywords, sessions, states, the choice of a copy per
// session, the scan of working trees, the cache and its budget, the texts of the panel and of /crew-progress. All data are
// made up and created here in a temp folder with real git trees; nothing of the owner's settings, mailbox or service is touched.
// Cells are named from the acceptance scenario (AC-07 ...), so the plan's DoD finds them by number.
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-progress-"))
process.env.XDG_DATA_HOME = path.join(tmp, "xdg-data")
process.env.XDG_CONFIG_HOME = path.join(tmp, "xdg-config")
process.env.XDG_STATE_HOME = path.join(tmp, "xdg-state")
const P = await import("../progress.ts")
const vectors = JSON.parse(readFileSync(new URL("./progress-vectors.json", import.meta.url), "utf8"))
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const show = (x) => JSON.stringify(x)
// the moment in the test year (local clock, so the cells do not depend on the time zone)
const at = (h, m = 0, day = 8) => new Date(2026, 9, day, h, m).getTime()
const bytes = (...lines) => Buffer.from(lines.join("\n") + "\n", "utf8")
const parse = (...lines) => P.parseJournal(bytes(...lines))

// ---- AC-14: journal forms ------------------------------------------------------------------------------------------------
{
  const crlf = P.parseJournal(Buffer.from("С5 0/3 старт\r\nС5 1/3 сделано\r\n", "utf8"))
  cell("AC-14 CRLF: both lines parse, the CR is not part of the signature", crlf.length === 2 && crlf[1].sig === "сделано" && crlf[0].text === "старт", show(crlf))
  const junk = parse("мусор без формы", "С5", "С5 3/", "", "   ", "С5 1/3 первая", "С5 x/3 нет", "С5 2/3 вторая")
  cell("AC-14 junk lines are skipped, only the lines of the form count", junk.length === 2 && junk[1].k === 2, show(junk))
  const cut = P.parseJournal(Buffer.from("С5 1/3 а\nС5 12/", "utf8"))
  cell("AC-14 a truncated last line gives no false k", cut.length === 1 && cut[0].k === 1, show(cut))
  const over = parse("С5 0/14 старт", "С5 15/14 пересборка")
  cell("AC-14 k greater than N is kept as written", over[1].k === 15 && over[1].n === 14, show(over))
  const zero = parse("С1 0/0 запуск", "КОММИТ 0/0 старт")
  cell("AC-14 N = 0 lines (launch and start) parse", zero.length === 2 && zero[0].n === 0 && P.isLaunch(zero[0]) && !P.isLaunch(zero[1]), show(zero))
  const t1 = P.parseLine("С5 3/4 [10:05] готово")
  cell("AC-14 a valid time field is taken off before the keyword", t1.time === 10 * 60 + 5 && t1.text === "готово" && P.keywordOf(t1.text) === "готово", show(t1))
  for (const bad of ["[25:00] готово", "[9:05] готово", "[10:05:00] готово", "[10.05] готово", "[10:05]готово", "10:05 готово"]) {
    const l = P.parseLine("С5 3/4 " + bad)
    cell(`AC-14 a wrong time field stays in the signature: ${bad.split(" ")[0]}`, l.time === undefined && l.text === bad && P.keywordOf(l.text) === undefined, show(l))
  }
  const sess = P.sessionsOf(parse("С1 0/2 старт", "С1 1/2 а", "С1 0/26 старт", "С1 5/26 б"))
  cell("AC-14 N changed inside the story: the last line of the session gives k and N", sess.length === 2 && sess[1].rows.at(-1).n === 26 && sess[1].rows.at(-1).k === 5, show(sess))
  const sameCode = P.sessionsOf(parse("С2 0/3 старт заход 1", "С2 3/3 готово", "С2 0/3 старт заход 2", "С2 1/3 а"))
  cell("AC-14 the same code twice makes two sessions by the start line", sameCode.length === 2 && sameCode[0].key === "С2#1" && sameCode[1].key === "С2#2", show(sameCode.map((s) => s.key)))
  const drop = P.sessionsOf(parse("С2 1/3 а", "С2 2/3 б", "С2 1/3 снова"))
  cell("AC-14 a fall of k starts a new session even without the start line", drop.length === 2, show(drop.map((s) => s.key)))
  // the moment of the news
  const f = at(10, 0)
  const m1 = P.momentOf(P.parseLine("С5 3/4 [10:05] x"), f, at(10, 3))
  cell("AC-14 the time field takes the day of the file", m1.at === at(10, 5) && !m1.byFile, show(m1))
  const m2 = P.momentOf(P.parseLine("С5 3/4 [10:06] x"), at(10, 4), at(10, 0))
  cell("AC-14 a time later than now by 6 minutes falls back to the file time", m2.byFile && m2.at === at(10, 4), show(m2))
  const m3 = P.momentOf(P.parseLine("С5 3/4 [23:50] x"), at(0, 10, 9), at(0, 20, 9))
  cell("AC-14 [23:50] with a file at 00:10 of the next day is yesterday", m3.at === at(23, 50, 8) && !m3.byFile, show(m3))
  const m4 = P.momentOf(P.parseLine("С5 3/4 без времени"), f, at(10, 3))
  cell("AC-14 no time field: the file time, marked by file", m4.byFile && m4.at === f, show(m4))
  const m5 = P.momentOf(P.parseLine("С5 3/4 [10:04] x"), at(10, 0), at(10, 3))
  cell("AC-14 a time within 5 minutes after the file is kept (same day)", !m5.byFile && m5.at === at(10, 4), show(m5))
}

// ---- AC-26: shared vectors (the guard reads the same file) --------------------------------------------------------------
{
  const form = vectors.lineForms.inputs.map((s) => (P.LINE_RE.test(s) ? "1" : "0")).join("")
  cell("AC-26 the six strings give 100110", form === vectors.lineForms.expect && form === "100110", form)
  for (const v of vectors.timeForms) {
    const l = P.parseLine("С5 3/4 " + v.sig)
    const got = l?.time === undefined ? null : `${String(Math.floor(l.time / 60)).padStart(2, "0")}:${String(l.time % 60).padStart(2, "0")}`
    cell(`AC-26 time form ${v.sig.split(" ")[0]} is ${v.time ?? "not a time"}`, got === v.time, show({ sig: v.sig, got }))
  }
  const good = new RegExp(P.TIME_RE.source)
  const broken = new RegExp(vectors.brokenTimePattern)
  cell("AC-26 the working time pattern matches, the broken [[]..[]] one does not (the test tells them apart)", good.test("[10:05] готово") && !broken.test("[10:05] готово"), show({ good: good.test("[10:05] готово"), broken: broken.test("[10:05] готово") }))
  for (const v of vectors.keywordForms) cell(`AC-26 keyword of «${v.text}» is ${v.keyword ?? "none"}`, (P.keywordOf(v.text) ?? null) === v.keyword, show(P.keywordOf(v.text)))
  for (const v of vectors.stopKinds) cell(`AC-26 stop kind of «${v.text}» is ${v.kind ?? "not named"}`, (P.stopKind(v.text) ?? null) === v.kind, show(P.stopKind(v.text)))
  const split = P.splitJournal(Buffer.from(vectors.splitFile.hex, "hex"))
  const vec = split.map((s) => (P.LINE_RE.test(s) ? "1" : "0")).join("")
  cell("AC-26 the file with a lone CR and U+2028 splits by LF only: 2 lines, vector 11", split.length === vectors.splitFile.lines && vec === vectors.splitFile.expect, show({ split, vec }))
  const inv = P.splitJournal(Buffer.from(vectors.invalidBytes.hex, "hex"))
  cell("AC-26 an invalid UTF-8 byte is replaced and the line still parses", inv.length === 1 && P.LINE_RE.test(inv[0]) === vectors.invalidBytes.isLine && inv[0].includes(String.fromCharCode(0xfffd)), show(inv))
  const NBSP = String.fromCharCode(0xa0)
  const nb = P.LINE_RE.exec(`С5${NBSP}x 3/4 y`)
  cell("AC-26 a no-break space inside the code is part of the code", !!nb && nb[1] === `С5${NBSP}x`, show(nb))
  const lw = P.parseLine("С5 14/14 [10:05] готово — всё")
  cell("AC-26 the keyword is read after the time and the news time is 10:05", P.keywordOf(lw.text) === "готово" && P.momentOf(lw, at(10, 5), at(10, 6)).at === at(10, 5), show(lw))
  cell("AC-26 «готово» not at the start of the signature is no keyword", P.keywordOf(P.parseLine("С5 14/14 сделано, не готово").text) === undefined, "")
}

// ---- states, thresholds, visibility (step 3) ------------------------------------------------------------------------------
const TH = P.thresholdsFromEnv({})
const MIN = 60_000
// one session from journal lines; the file time is `mtime`; the entry is computed at `now`
const entryAt = (lines, mtime, now, th = TH) => {
  const ss = P.sessionsOf(parse(...lines))
  return P.entryOf(ss[ss.length - 1], mtime, now, th)
}
// the same with a time field written in the last line: `[HH:MM]` of the moment `t`
const hhmm = (t) => {
  const d = new Date(t)
  return `[${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}]`
}
const now0 = at(12, 0)

{
  // AC-02: the silence threshold
  const mk = (ago) => entryAt(["С5 0/14 старт", `С5 13/14 ${hhmm(now0 - ago * MIN)} шаг`], now0 - ago * MIN, now0)
  cell("AC-02 11 minutes of silence with k < N: state 6 (давно нет вестей)", mk(11).state === 6 && mk(11).stale, show(mk(11)))
  cell("AC-02 9 minutes: state 5 (идёт), no silence mark", mk(9).state === 5 && !mk(9).stale, show(mk(9)))
  const th20 = P.thresholdsFromEnv({ CREW_HARNESS_PROGRESS_STALE_MS: String(20 * MIN) })
  const e20 = entryAt(["С5 0/14 старт", `С5 13/14 ${hhmm(now0 - 11 * MIN)} шаг`], now0 - 11 * MIN, now0, th20)
  cell("AC-02 the threshold of 20 minutes from the environment moves the border", e20.state === 5, show(e20))
  const fileTime = now0 - 8 * MIN // the file is not touched while the clock goes on
  const lines = ["С5 0/14 старт", `С5 13/14 ${hhmm(fileTime)} шаг`]
  const early = entryAt(lines, fileTime, fileTime + 9 * MIN)
  const late = entryAt(lines, fileTime, fileTime + 12 * MIN)
  cell("AC-02 the file is unchanged, the clock goes 2 minutes past the threshold: the mark appears", early.state === 5 && late.state === 6, show({ early: early.state, late: late.state }))
}
{
  // AC-03: done, disappearance
  const doneWith = entryAt(["С5 0/14 старт", `С5 14/14 ${hhmm(now0 - 5 * MIN)} готово — итог`], now0 - 5 * MIN, now0)
  const doneNo = entryAt(["С5 0/14 старт", "С5 14/14 готово — итог"], now0 - 5 * MIN, now0)
  cell("AC-03 «готово» with and without the time field is state 2 and shown", doneWith.state === 2 && doneNo.state === 2 && doneWith.shown && doneNo.shown && doneNo.byFile && !doneWith.byFile, show({ doneWith, doneNo }))
  const old15 = entryAt(["С5 0/14 старт", "С5 14/14 готово"], now0 - 15 * MIN, now0)
  const old16 = entryAt(["С5 0/14 старт", "С5 14/14 готово"], now0 - 16 * MIN, now0)
  cell("AC-03 «готово» vanishes at 15 minutes and stays gone at 16 without the file changing", !old15.shown && !old16.shown, show({ old15: old15.shown, old16: old16.shown }))
  const quiet = entryAt(["С5 0/14 старт", "С5 5/14 шаг"], now0 - 25 * 3_600_000, now0)
  cell("AC-03 an unfinished session silent for 25 hours vanishes from the panel and is abandoned in the command", !quiet.shown && quiet.abandoned && quiet.state === 6, show(quiet))
  const quiet23 = entryAt(["С5 0/14 старт", "С5 5/14 шаг"], now0 - 23 * 3_600_000, now0)
  cell("AC-03 at 23 hours it is still shown", quiet23.shown && !quiet23.abandoned, show(quiet23))
}
{
  // AC-07: launch and start lines
  const l1 = entryAt([`С1 0/0 ${hhmm(now0 - 3 * MIN)} запуск`], now0 - 3 * MIN, now0)
  cell("AC-07 a launch line alone: state 3, no silence mark yet", l1.state === 3 && !l1.stale && l1.shown, show(l1))
  const l1late = entryAt([`С1 0/0 ${hhmm(now0 - 11 * MIN)} запуск`], now0 - 11 * MIN, now0)
  cell("AC-07 a launch line after the threshold: still state 3, with the silence mark, never «готово»", l1late.state === 3 && l1late.stale, show(l1late))
  const k = entryAt(["КОММИТ 0/0 старт"], now0 - 2 * MIN, now0)
  cell("AC-07 «КОММИТ 0/0 старт»: state 4 (без единиц), no silence mark", k.state === 4 && !k.stale && k.shown, show(k))
  const k16 = entryAt(["КОММИТ 0/0 старт"], now0 - 16 * MIN, now0)
  cell("AC-07 «без единиц» vanishes after 15 minutes", !k16.shown, show(k16))
  const a = entryAt(["С1 0/0 запуск", "С1 0/26 старт"], now0 - MIN, now0)
  cell("AC-07 launch then «0/26 старт»: one session, N = 26", P.sessionsOf(parse("С1 0/0 запуск", "С1 0/26 старт")).length === 1 && a.last.n === 26 && a.state === 5, show(a))
  const b = entryAt(["С1 0/0 запуск", "С1 1/26 шаг"], now0 - MIN, now0)
  cell("AC-07 launch then «1/26» without the start line: one session, N = 26", P.sessionsOf(parse("С1 0/0 запуск", "С1 1/26 шаг")).length === 1 && b.last.n === 26 && b.state === 5, show(b))
  const s = P.sessionsOf(parse("С1 0/0 запуск", "С1 0/26 старт"))[0]
  cell("AC-07 the launch line is attached to the session and does not count as its row", s.launch?.k === 0 && s.rows.length === 1, show(s))
}
{
  // AC-08: stop lines
  for (const [k, n] of [[13, 14], [14, 14], [15, 14]]) {
    for (const withTime of [false, true]) {
      const line = `С5 ${k}/${n} ${withTime ? hhmm(now0 - 30 * MIN) + " " : ""}стоп: ворота — ждёт слова владельца`
      const e = entryAt(["С5 0/14 старт", line], now0 - 30 * MIN, now0)
      cell(`AC-08 stop at ${k}/${n}${withTime ? " with time" : ""}: state 1, kind ворота, no silence mark`, e.state === 1 && e.kind === "ворота" && !e.stale && e.shown, show(e))
    }
  }
  const joined = entryAt(["С5 0/14 старт", "С5 13/14 [10:05] стоп:ворота — x"], at(10, 6), at(10, 8))
  const spaced = entryAt(["С5 0/14 старт", "С5 13/14 [10:05] стоп: ворота — x"], at(10, 6), at(10, 8))
  cell("AC-08 «стоп:ворота» and «стоп: ворота» both give kind ворота", joined.kind === "ворота" && spaced.kind === "ворота", show({ joined: joined.kind, spaced: spaced.kind }))
  const odd = entryAt(["С5 0/14 старт", "С5 13/14 стоп: что-то — x"], now0, now0)
  const none = entryAt(["С5 0/14 старт", "С5 13/14 стоп: — x"], now0, now0)
  cell("AC-08 a kind outside the list or no kind: state 1 with no kind named", odd.state === 1 && odd.kind === undefined && none.state === 1 && none.kind === undefined, show({ odd, none }))
  const gone = entryAt(["С5 0/14 старт", "С5 13/14 стоп: ворота — x"], now0 - 25 * 3_600_000, now0)
  cell("AC-08 a stopped session is abandoned after 24 hours", !gone.shown && gone.abandoned, show(gone))
}
{
  // AC-23: k = N and k > N without «готово»
  for (const line of ["С5 14/14 пересборка: ветка на main", "С5 15/14 пересборка: ветка на main"]) {
    const e = entryAt(["С5 0/14 старт", line], now0 - 16 * MIN, now0)
    cell(`AC-23 «${line.slice(0, 7)}» with no «готово»: state 7, still shown after 16 minutes`, e.state === 7 && e.shown && !e.stale, show(e))
    const e25 = entryAt(["С5 0/14 старт", line], now0 - 25 * 3_600_000, now0)
    cell(`AC-23 «${line.slice(0, 7)}»: gone after 24 hours`, !e25.shown && e25.abandoned, show(e25))
  }
  for (const line of ["С5 14/14 готово", "С5 15/14 готово", "С5 12/14 готово", "С5 14/14 [10:05] готово — итог"]) {
    const e = entryAt(["С5 0/14 старт", "С5 11/14 шаг", line], at(10, 6), at(10, 8))
    cell(`AC-23 «${line}»: state 2 (the word outranks the count)`, e.state === 2, show(e))
  }
  for (const line of ["С5 14/14 стоп: ворота — x", "С5 15/14 стоп: ворота — x"]) {
    const e = entryAt(["С5 0/14 старт", line], now0, now0)
    cell(`AC-23 «${line.slice(0, 7)} стоп»: state 1`, e.state === 1 && e.kind === "ворота", show(e))
  }
  const after = entryAt(["С5 0/14 старт", "С5 14/14 готово", "С5 14/14 уборка: ветка"], now0 - 20 * MIN, now0)
  cell("AC-23 a line after «готово» in the same session brings back «итога нет» (an accepted border)", after.state === 7, show(after))
}
{
  // the whole table: every combination has exactly one first matching row and it is the table's row (REQ-04, the table written apart)
  const rows = [
    [1, (w) => w === "стоп"],
    [2, (w, k, n) => w === "готово" && n > 0],
    [3, (w, k, n) => n === 0 && w === "запуск"],
    [4, (w, k, n) => n === 0],
    [5, (w, k, n, stale) => k < n && !stale],
    [6, (w, k, n, stale) => k < n && stale],
    [7, (w, k, n) => k >= n],
  ]
  let combos = 0
  let bad = []
  for (const word of ["", "готово", "стоп: ворота", "запуск", "старт"])
    for (const n of [0, 3])
      for (const k of [0, 2, 3, 4])
        for (const stale of [false, true]) {
          combos++
          const sig = `${word || "шаг"} x`
          const line = P.parseLine(`С5 ${k}/${n} ${sig}`)
          const mt = now0 - (stale ? 11 : 2) * MIN
          const got = P.stateOf(line, P.momentOf(line, mt, now0), now0, TH).state
          const kw = P.keywordOf(line.text)
          const hit = rows.filter(([, f]) => f(kw, k, n, stale))
          const first = hit[0]?.[0]
          if (!hit.length || got !== first) bad.push(show({ word, n, k, stale, got, first }))
        }
  cell(`AC-02 the state table: ${combos} combinations, each has a first matching row and the code agrees`, bad.length === 0 && combos === 80, bad.slice(0, 3).join(" | "))
}
{
  // AC-15: session names
  const names = {
    "С1": "С1 разбор", "С1п": "С1п правка разбора", "С2": "С2 проверка разбора", "С3": "С3 план", "С3п": "С3п правка плана", "С4": "С4 проверка плана",
    "С5": "С5 реализация", "С5д": "С5д продолжение реализации", "С5п": "С5п правка реализации", "С6": "С6 проверка реализации", "С7": "С7 сдача",
    "С7п": "С7п правка сдачи", "С8": "С8 проверка сдачи", "С9": "С9 разбор обратной связи", "КОММИТ": "КОММИТ", "ПУШ": "ПУШ", "Х1": "Х1",
  }
  const wrong = Object.entries(names).filter(([c, n]) => P.sessionName(c) !== n)
  cell("AC-15 session names by the REQ-08 list, КОММИТ/ПУШ and unknown codes as written", wrong.length === 0, show(wrong))
}
{
  // AC-25 (thresholds): defaults and the environment
  const d = P.thresholdsFromEnv({})
  cell("AC-25 thresholds by default: 10 minutes, 15 minutes, 24 hours", d.staleMs === 10 * MIN && d.doneMs === 15 * MIN && d.abandonMs === 24 * 3_600_000, show(d))
  const o = P.thresholdsFromEnv({ CREW_HARNESS_PROGRESS_STALE_MS: "1200000", CREW_HARNESS_PROGRESS_DONE_MS: "60000", CREW_HARNESS_PROGRESS_ABANDON_MS: "7200000" })
  cell("AC-25 the three environment variables override the thresholds", o.staleMs === 1_200_000 && o.doneMs === 60_000 && o.abandonMs === 7_200_000, show(o))
  const b = P.thresholdsFromEnv({ CREW_HARNESS_PROGRESS_STALE_MS: "abc", CREW_HARNESS_PROGRESS_DONE_MS: "-5", CREW_HARNESS_PROGRESS_ABANDON_MS: "0" })
  cell("AC-25 a non-number, a negative and a zero value fall back to the default", show(b) === show(d), show(b))
}

// ==== END OF CELLS ====
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-progress.test: FAIL ${fail}` : "crew-progress.test ok")
process.exit(fail ? 1 : 0)

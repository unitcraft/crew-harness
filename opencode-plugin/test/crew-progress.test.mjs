// Self-test of the progress panel (task 004; node >= 24):  node test/crew-progress.test.mjs
// The journal `progress.log` of the background sessions: line and time forms, keywords, sessions, states, the choice of a copy per
// session, the scan of working trees, the cache and its budget, the texts of the panel and of /crew-progress. All data are
// made up and created here in a temp folder with real git trees; nothing of the owner's settings, mailbox or service is touched.
// Cells are named from the acceptance scenario (AC-07 ...), so the plan's DoD finds them by number.
import cp from "node:child_process"
import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync, writeSync } from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import os from "node:os"
import path from "node:path"

// every way of starting a process is counted before any module under test is imported (AC-11 д): the fixtures start git through
// the counted functions too, the counter is reset after they are built
const procs = { n: 0 }
for (const name of ["execFile", "execFileSync", "spawn", "spawnSync", "exec", "execSync"]) {
  const orig = cp[name]
  cp[name] = (...args) => (procs.n++, orig.apply(cp, args))
}
syncBuiltinESMExports()

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

// ---- the choice of a copy per session, on arrays of lines (step 4; the same on real trees in step 5) ----------------------
const Cp = (kind, lines, mtime, extra = {}) => ({ kind, ...(kind === "tree" ? { tree: "t1" } : {}), lines: parse(...lines), mtimeMs: mtime, ...extra })
const sum = (copies, now, th = TH, folder = "002-demo") => P.summarizeTasks({ tasks: [{ folder, title: "Demo", copies }] }, now, th)
const one = (copies, now, th) => sum(copies, now, th)[0]
const common = ["С1 0/2 старт", "С1 1/2 а", "С1 2/2 готово"]

{
  // AC-04 (model): the main copy is the beginning, the tree is longer
  const head = ["С5 0/14 старт", "С5 1/14 а", "С5 2/14 б", "С5 3/14 в"]
  const tail = [...head, "С5 4/14 г", "С5 5/14 д", "С5 6/14 е"]
  const n = at(12, 0)
  const a = one([Cp("main", head, at(11, 30)), Cp("tree", tail, at(11, 55))], n)
  const b = one([Cp("tree", tail, at(11, 55)), Cp("main", head, at(11, 30))], n)
  cell("AC-04 the main copy is the beginning, the tree is longer: k and signature come from the tree", a.k === 6 && a.signature === "е" && a.source === "tree" && !a.divergent && a.others === 0, show(a))
  cell("AC-04 the same when the copies are passed in the other order", show(a) === show(b), show(b))
  // after a fast-forward merge both copies are equal; the main file is a few seconds younger
  const timed = [...head, "С5 4/14 [11:40] г"]
  const m1 = one([Cp("main", timed, at(11, 55, 8) + 3_000), Cp("tree", timed, at(11, 55))], n)
  cell("AC-04 after the merge: the equal copies show the time from the line", m1.at === at(11, 40) && !m1.byFile && m1.source === "main", show(m1))
  const plain = [...head, "С5 4/14 г"]
  const m2 = one([Cp("main", plain, at(11, 55) + 3_000), Cp("tree", plain, at(11, 55))], n)
  cell("AC-04 after the merge, no time field: the earlier file time, marked by file", m2.byFile && m2.at === at(11, 55) && m2.source === "main", show(m2))
}
{
  // AC-05: the same session, different lines
  const mk = (tm, tt) => [Cp("main", ["С5 0/3 старт", `С5 1/3 ${tm}в основной`], at(11, 50)), Cp("tree", ["С5 0/3 старт", `С5 1/3 ${tt}в дереве`], at(11, 40))]
  const n = at(12, 0)
  const later = one(mk("[11:30] ", "[11:10] "), n)
  cell("AC-05 the copy with the later time of the last line wins (main here), marked ≠", later.source === "main" && later.divergent && later.signature === "в основной", show(later))
  const laterTree = one(mk("[11:10] ", "[11:30] "), n)
  cell("AC-05 the tree wins when its time is later", laterTree.source === "tree" && laterTree.divergent, show(laterTree))
  const equal = one(mk("[11:30] ", "[11:30] "), n)
  cell("AC-05 equal time: the tree", equal.source === "tree" && equal.divergent, show(equal))
  const noTime = one(mk("", ""), n)
  cell("AC-05 no time in the lines: the tree", noTime.source === "tree" && noTime.divergent, show(noTime))
  const oneTime = one(mk("[11:30] ", ""), n)
  cell("AC-05 time in one copy only: the tree", oneTime.source === "tree" && oneTime.divergent, show(oneTime))
  // different tails of different sessions are not a divergence
  const main = [...common, "С7 0/3 [11:30] старт", "С7 1/3 [11:40] а"]
  const tree = [...common, "С5 0/3 [11:00] старт", "С5 3/3 [11:10] готово", "С6 0/2 [11:20] старт", "С6 1/2 [11:50] б"]
  const t = one([Cp("main", main, at(11, 41)), Cp("tree", tree, at(11, 51))], n)
  cell("AC-05 different tails of different sessions (С7 in main, С5 and С6 in the tree): no ≠, the freshest is shown", !t.divergent && t.session === "С6" && t.k === 1, show(t))
  cell("AC-05 the other tail candidate is counted: С7 is running (+1)", t.others === 1 && t.candidates.length === 2, show({ others: t.others, c: t.candidates.map((c) => c.session) }))
}
{
  const n = at(12, 0)
  // S0: the launch is in the main copy before the tree, the work is in the tree
  const tree = [...common, "С5 0/2 старт", "С5 1/2 шаг"]
  const s0a = one([Cp("main", [...common, "С5 0/0 запуск"], at(11, 30)), Cp("tree", tree, at(11, 55))], n)
  cell("AC-24 S0a a running session: one session С5 from the tree, no +N, no ≠", s0a.session === "С5" && s0a.k === 1 && s0a.source === "tree" && s0a.others === 0 && !s0a.divergent && s0a.state === 5, show(s0a))
  const s0b = one([Cp("main", [...common, "С5 0/0 запуск"], at(11, 30)), Cp("tree", [...common, "С5 0/2 старт", "С5 1/2 а", "С5 2/2 готово"], at(11, 55))], n)
  cell("AC-24 S0b a finished session: «готово», no ghost «запущена, шагов нет», no +N", s0b.state === 2 && s0b.others === 0 && s0b.candidates.length === 1, show(s0b))
  const s0c = one([Cp("main", [...common, "С5 0/0 [10:00] запуск"], at(10, 0)), Cp("tree", [...common, "С5 0/2 [10:05] старт", "С5 2/2 [10:30] готово"], at(10, 30))], at(10, 40))
  cell("AC-24 S0c the same with time: «готово» 10:30", s0c.state === 2 && s0c.at === at(10, 30) && s0c.others === 0 && s0c.visible, show(s0c))
}
{
  // S1: without time the file time of the main copy is later; С7 runs in the main copy, С5 and С6 are in the tree
  const n = at(12, 0)
  const main = [...common, "С7 0/0 запуск", "С7 0/3 старт", "С7 1/3 а"]
  const tree = [...common, "С5 0/2 старт", "С5 2/2 готово", "С6 0/4 старт", "С6 4/4 готово"]
  const s1 = one([Cp("main", main, at(11, 58)), Cp("tree", tree, at(11, 55))], n)
  cell("AC-24 S1 the file of the main copy is later: С7 1/3 is shown, running, no +N", s1.session === "С7" && s1.k === 1 && s1.n === 3 && s1.state === 5 && s1.others === 0, show(s1))
  const s1r = one([Cp("main", main, at(11, 50)), Cp("tree", tree, at(11, 59))], n)
  cell("AC-24 S1 reversed (the tree file is later): С6 «готово» is shown (a border of the method)", s1r.session === "С6" && s1r.state === 2 && s1r.others === 0, show(s1r))
  const mainT = [...common, "С7 0/0 [11:50] запуск", "С7 0/3 [11:51] старт", "С7 1/3 [11:55] а"]
  const treeT = [...common, "С5 0/2 [11:00] старт", "С5 2/2 [11:10] готово", "С6 0/4 [11:20] старт", "С6 4/4 [11:30] готово"]
  const t1 = one([Cp("main", mainT, at(11, 58)), Cp("tree", treeT, at(11, 59))], n)
  const t2 = one([Cp("main", mainT, at(11, 59)), Cp("tree", treeT, at(11, 40))], n)
  cell("AC-24 S1 with time fields the result does not depend on the file times", t1.session === "С7" && t2.session === "С7" && t1.state === 5 && t1.others === 0 && t2.others === 0, show({ t1: t1.session, t2: t2.session }))
}
{
  const n = at(12, 40)
  // S2: an abandoned launch (with time) beside a running session of another code
  const s2 = one([Cp("main", [...common, "С7 0/0 [10:00] запуск"], at(10, 0)), Cp("tree", [...common, "С5п 0/3 [12:20] старт", "С5п 1/3 [12:30] шаг"], at(12, 30))], n)
  cell("AC-24 S2 С5п runs, the abandoned launch of С7 is +1", s2.session === "С5п" && s2.state === 5 && s2.others === 1, show(s2))
  const cand = s2.candidates.find((c) => c.session === "С7")
  cell("AC-24 S2 the launch of С7 is a candidate «запущена», silent past the threshold", cand?.state === 3 && cand.stale && cand.k === 0 && cand.n === 0 && cand.tail.length === 1, show(cand))
  // S3: equal copies
  const eq = [...common, "С5 0/3 старт", "С5 1/3 а"]
  const s3 = one([Cp("main", eq, at(12, 30)), Cp("tree", eq, at(12, 31))], n)
  const s3r = one([Cp("tree", eq, at(12, 31)), Cp("main", eq, at(12, 30))], n)
  cell("AC-24 S3 equal copies: the main copy is chosen, the result is defined and the same in any order", s3.source === "main" && show(s3) === show(s3r) && s3.at === at(12, 30) && s3.byFile, show(s3))
  // S4: a repeated launch of the same code in the copy where the previous session was
  const s4 = one([Cp("main", ["С5 0/2 старт", "С5 2/2 готово", "С5 0/0 запуск"], at(12, 38))], n)
  cell("AC-24 S4 a repeated launch in the same copy is a new session: «запущена, шагов нет»", s4.state === 3 && s4.k === 0 && s4.candidates.length === 1 && s4.displaced === 1, show(s4))
  const s4b = one([Cp("main", [...common, "С5 0/0 запуск"], at(12, 38)), Cp("tree", [...common, "С5 0/2 старт", "С5 2/2 готово"], at(12, 38))], n)
  cell("AC-24 S4 a launch in one copy while the other copy has the finished session: no new session", s4b.state === 2 && s4b.others === 0, show(s4b))
  // S5: the launch, then k > 0 with no «старт»
  const s5 = one([Cp("main", ["С3 0/0 запуск", "С3 1/34 а"], at(12, 38))], n)
  cell("AC-24 S5 a launch, then «1/34» with no start line: one session, N = 34", s5.n === 34 && s5.k === 1 && s5.candidates.length === 1 && s5.state === 5, show(s5))
  // two launch lines of one key in two copies: the later one
  const two = one([Cp("main", [...common, "С7 0/0 [10:00] запуск"], at(12, 0)), Cp("tree", [...common, "С7 0/0 [12:30] запуск"], at(12, 31))], n)
  cell("AC-24 two launch lines of one key in two copies: one record with the later line", two.candidates.length === 1 && two.at === at(12, 30) && two.state === 3 && !two.stale, show(two))
  // a stale tree: the main copy has С3 running, the tree is a snapshot before it
  const mainS = ["С2 0/2 старт", "С2 2/2 [12:00] готово", "С3 0/5 [12:10] старт", "С3 1/5 [12:35] а"]
  const stale = one([Cp("main", mainS, at(12, 35)), Cp("tree", mainS.slice(0, 2), at(12, 5))], n)
  cell("AC-24 a stale tree: С3 is shown, the stale С2 is displaced, no +N", stale.session === "С3" && stale.others === 0 && stale.candidates.length === 1 && stale.displaced === 1, show(stale))
  // common start: the main copy ends with С4 «готово» (or С6 «стоп»), the tree goes on with С5
  const base = [...common, "С4 0/2 [11:00] старт", "С4 2/2 [11:10] готово"]
  const cs = one([Cp("main", base, at(11, 10)), Cp("tree", [...base, "С5 0/3 [12:30] старт", "С5 1/3 [12:35] а"], at(12, 35))], n)
  cell("AC-24 common start: С4 «готово» in the main copy, С5 in the tree: С5 shown, +N 0", cs.session === "С5" && cs.others === 0, show(cs))
  const base6 = [...common, "С6 0/2 [11:00] старт", "С6 1/2 [11:10] стоп: ворота — x"]
  const cs6 = one([Cp("main", base6, at(11, 10)), Cp("tree", [...base6, "С5 0/3 [12:30] старт", "С5 1/3 [12:35] а"], at(12, 35))], n)
  cell("AC-24 common start: С6 «стоп» in the main copy, С5 in the tree: +N 0", cs6.session === "С5" && cs6.others === 0, show(cs6))
  // S6: the border of the method: an interrupted session of the common start, with time fields, stays +1
  const base7 = [...common, "С4 0/8 [10:00] старт", "С4 3/8 [10:20] шаг"]
  const s6 = one([Cp("main", base7, at(10, 20)), Cp("tree", [...base7, "С5 0/3 [12:30] старт", "С5 1/3 [12:35] а"], at(12, 35))], n)
  cell("AC-24 S6 an interrupted session of the common start (with time fields): the task is right, +1 stays", s6.session === "С5" && s6.state === 5 && s6.others === 1, show(s6))
  const base8 = [...common, "С4 0/8 старт", "С4 3/8 шаг"]
  const s6n = one([Cp("main", base8, at(10, 20)), Cp("tree", [...base8, "С5 0/3 старт", "С5 1/3 а"], at(12, 35))], n)
  cell("AC-24 S6 the same without time fields: the old candidate has no time and is displaced, +N 0", s6n.session === "С5" && s6n.others === 0, show(s6n))
}
{
  // AC-27: many sessions with repeats (made after the journal of task 002 and of task 003)
  const n = at(12, 0)
  const codes = ["С1", "С1п", "С2", "С3", "С4", "С5"]
  const sessions002 = []
  for (let i = 0; i < 69; i++) sessions002.push(`${codes[i % 6]} 0/3 старт заход ${i}`, `${codes[i % 6]} 1/3 а`, `${codes[i % 6]} 3/3 готово`)
  const live = ["С5 0/14 старт"]
  for (let k = 1; k <= 13; k++) live.push(`С5 ${k}/14 шаг ${k}`)
  const main002 = [...sessions002, ...live]
  const tree002 = [...main002, "С5 14/14 пересборка: ветка на main"]
  const r = one([Cp("main", main002, at(11, 0)), Cp("tree", tree002, at(11, 58))], n)
  cell("AC-27 task-002 style (70 sessions): +N is 0, 69 displaced, С5 14/14 «итога нет»", r.others === 0 && r.displaced === 69 && r.k === 14 && r.state === 7 && r.candidates.length === 1, show({ o: r.others, d: r.displaced, k: r.k, s: r.state }))
  cell("AC-27 the last three lines are only at the candidates", r.candidates.every((c) => c.tail.length <= 3) && r.tail.length === 3 && r.tail[2] === "14/14 пересборка: ветка на main", show(r.tail))
  // 003 style: main has 19 sessions, the tree 15; interrupted «С3 0/34 старт» twice and «С4 3/8», the last session С2 7/9
  const c14 = []
  const mk = (code, n2, done) => {
    const out = [`${code} 0/${n2} старт`]
    for (let k = 1; k <= done; k++) out.push(`${code} ${k}/${n2} шаг ${k}`)
    return out
  }
  c14.push(...mk("С1", 3, 3), ...mk("С2", 9, 9), ...mk("С3", 34, 0), ...mk("С3", 34, 0), ...mk("С3", 34, 34), ...mk("С2", 9, 9), ...mk("С5", 6, 6), ...mk("С6", 5, 5), ...mk("С2", 9, 9), ...mk("С3", 4, 4), ...mk("С2", 9, 9), ...mk("С1", 3, 3), ...mk("С3п", 5, 5), ...mk("С2", 9, 9))
  const sessionsOfC = P.sessionsOf(parse(...c14)).length
  const mainLines = [...c14, ...mk("С4", 8, 3), ...mk("С1", 3, 3), ...mk("С2", 9, 9), ...mk("С5", 4, 4), ...mk("С2", 9, 7)]
  const treeLines = [...c14, ...mk("С4", 8, 7), "С4 8/8 готово"]
  const r3 = one([Cp("main", mainLines, at(11, 58)), Cp("tree", treeLines, at(11, 40))], n)
  cell("AC-27 task-003 style: main 19 sessions, tree 15 (the fixture)", sessionsOfC === 14 && P.sessionsOf(parse(...mainLines)).length === 19 && P.sessionsOf(parse(...treeLines)).length === 15, show({ c: sessionsOfC }))
  cell("AC-27 task-003 style: +N is at most 1, the interrupted displaced ones are not running", r3.others <= 1 && r3.candidates.every((c) => !(c.session === "С3" && c.k === 0)) && r3.session === "С2" && r3.k === 7, show({ o: r3.others, s: r3.session, k: r3.k, c: r3.candidates.map((c) => c.session + c.k) }))
  const r3b = one([Cp("main", mainLines, at(11, 20)), Cp("tree", treeLines, at(11, 58))], n)
  cell("AC-27 task-003 style, the tree file is later: С4 8/8 «готово» is shown, +N at most 1", r3b.others <= 1 && r3b.session === "С4" && r3b.state === 2, show({ o: r3b.others, s: r3b.session, st: r3b.state }))
}

// ---- real repositories with working trees: scan, cache, budget (step 5) --------------------------------------------------
const S = await import("../progress-scan.ts")
const SCAN_SRC = readFileSync(new URL("../progress-scan.ts", import.meta.url), "utf8")
const PROG_SRC = readFileSync(new URL("../progress.ts", import.meta.url), "utf8")
const gitConfig = path.join(tmp, "gitconfig")
writeFileSync(gitConfig, "[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n")
const genv = { ...process.env, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" }
const git = (cwd, ...a) => cp.execFileSync("git", a, { cwd, env: genv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
const jfile = (root, folder) => path.join(root, "doc", "tasks", folder, "progress.log")
const jwrite = (root, folder, lines, mtimeMs) => {
  const f = jfile(root, folder)
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, lines.length ? lines.join("\n") + "\n" : "")
  if (mtimeMs) utimesSync(f, mtimeMs / 1000, mtimeMs / 1000)
  return f
}
const mwrite = (root, folder, title) => {
  const f = path.join(root, "doc", "tasks", folder, "task", "message.md")
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, `# Задание: ${title}\n\nТекст задания.\n`)
}
let repoNo = 0
// a throwaway repository with one commit; trees are added by the test
const makeRepo = (tasks = {}) => {
  const base = path.join(tmp, `r${++repoNo}`)
  const main = path.join(base, "main")
  mkdirSync(main, { recursive: true })
  git(main, "init", "-q")
  for (const [folder, t] of Object.entries(tasks)) {
    mwrite(main, folder, t.title)
    jwrite(main, folder, t.lines ?? ["С1 0/1 старт", "С1 1/1 готово"])
  }
  if (!Object.keys(tasks).length) writeFileSync(path.join(main, "README.md"), "demo\n")
  git(main, "add", "--", ".")
  git(main, "commit", "-q", "-m", "init")
  return { base, main }
}
const addTree = (repo, name, where) => {
  const dir = where ?? path.join(repo.base, "trees", name)
  git(repo.main, "worktree", "add", "-q", "-b", name, dir)
  return dir
}
// the `.git` file of a tree is hidden on Windows: it is opened for reading and writing, not created anew
const overwrite = (file, text) => {
  const fd = openSync(file, "r+")
  ftruncateSync(fd, 0)
  writeSync(fd, text, 0)
  closeSync(fd)
}
const real = (p) => (p ? realpathSync.native(p).toLowerCase() : p)
const NOW = at(12, 0)
const sec = (h, m) => at(h, m) // seconds-exact times, so the order of files is clear

{
  // AC-06: trees are found by the registry of git, wherever they lie; the tab may sit in a tree or in a subfolder
  const repo = makeRepo({ "002-guards": { title: "Guards of the repository tests", lines: ["С5 0/14 старт", "С5 1/14 а", "С5 2/14 б"] } })
  const tree = addTree(repo, "task-x")
  jwrite(repo.main, "002-guards", ["С5 0/14 старт", "С5 1/14 а", "С5 2/14 б"], sec(11, 0))
  jwrite(tree, "002-guards", ["С5 0/14 старт", "С5 1/14 а", "С5 2/14 б", "С5 3/14 в", "С5 4/14 г"], sec(11, 50))
  const sc = S.createScanner()
  const r = sc.scanAll(repo.main, NOW)
  cell("AC-06 a tree outside the project root is found without any setting", r.trees.length === 2 && r.trees[1].kind === "tree" && r.trees[1].name === "task-x" && r.journals === 2, show({ trees: r.trees.map((t) => t.name), j: r.journals }))
  const sum0 = P.summarizeTasks(r, NOW)[0]
  cell("AC-06 the journal of the tree is chosen (longer): k = 4 from the tree", sum0?.k === 4 && sum0.source === "tree" && sum0.signature === "г", show(sum0))
  const inTree = S.createScanner().scanAll(tree, NOW)
  cell("AC-06 a tab opened in the tree itself finds the same repository and trees", real(inTree.repo) === real(r.repo) && inTree.trees.length === 2 && inTree.tasks.length === 1 && inTree.tasks[0].copies.length === 2, show({ repo: inTree.repo, t: inTree.trees.length }))
  const subMain = S.createScanner().scanAll(path.join(repo.main, "doc", "tasks"), NOW)
  const subTree = S.createScanner().scanAll(path.join(tree, "doc"), NOW)
  cell("AC-06 a tab in a subfolder of the repository or of a tree finds it too", real(subMain.repo) === real(r.repo) && real(subTree.repo) === real(r.repo) && subTree.trees.length === 2, show({ a: subMain.repo, b: subTree.repo }))
  // relative paths in the .git file of the tree, in `gitdir` of the registry and in `commondir`
  const treeGit = path.join(tree, ".git")
  const entry = path.join(repo.main, ".git", "worktrees", "task-x")
  overwrite(treeGit, `gitdir: ${path.relative(tree, entry).split(path.sep).join("/")}\n`)
  writeFileSync(path.join(entry, "gitdir"), `${path.relative(entry, treeGit).split(path.sep).join("/")}\n`)
  writeFileSync(path.join(entry, "commondir"), "../..\n")
  const rel = S.createScanner().scanAll(tree, NOW)
  const relMain = S.createScanner().scanAll(repo.main, NOW)
  cell("AC-06 relative gitdir and commondir are resolved from the folder of the file", real(rel.repo) === real(r.repo) && rel.trees.length === 2 && relMain.trees.length === 2 && real(S.findRepoRoot(tree)?.commonGit) === real(S.findRepoRoot(repo.main)?.commonGit), show({ repo: rel.repo, t: rel.trees.length, tm: relMain.trees.length }))
  cell("AC-15 the title comes from the first line of task/message.md, latin letters stay", r.tasks[0].title === "Guards of the repository tests", show(r.tasks[0].title))
  const noMsg = makeRepo({})
  jwrite(noMsg.main, "003-no-title", ["С1 0/1 старт"], sec(11, 0))
  const rt = S.createScanner().scanAll(noMsg.main, NOW)
  cell("AC-15 no message.md: the folder name without the number", rt.tasks[0].title === "no-title", show(rt.tasks))
}
{
  // AC-04 (real trees): the tree is longer, then a fast-forward merge makes the copies equal
  const repo = makeRepo({ "002-guards": { title: "Guards", lines: ["С5 0/14 старт", "С5 1/14 [10:00] а"] } })
  const tree = addTree(repo, "task-x")
  const longer = ["С5 0/14 старт", "С5 1/14 [10:00] а", "С5 2/14 [10:20] б", "С5 3/14 [10:40] в"]
  jwrite(tree, "002-guards", longer)
  git(tree, "add", "--", "doc")
  git(tree, "commit", "-q", "-m", "journal")
  jwrite(repo.main, "002-guards", ["С5 0/14 старт", "С5 1/14 [10:00] а"], sec(10, 1))
  utimesSync(jfile(tree, "002-guards"), sec(10, 41) / 1000, sec(10, 41) / 1000)
  const a = P.summarizeTasks(S.createScanner().scanAll(repo.main, sec(10, 45)), sec(10, 45))[0]
  cell("AC-04 real trees: the main copy is the beginning, the tree is longer: shown from the tree", a.k === 3 && a.source === "tree" && !a.divergent && a.others === 0, show(a))
  git(repo.main, "checkout", "-q", "--", ".") // the main copy is clean again (the file is the committed beginning)
  git(repo.main, "merge", "--ff-only", "-q", "task-x")
  utimesSync(jfile(repo.main, "002-guards"), sec(10, 42) / 1000 + 3, sec(10, 42) / 1000 + 3)
  const b = P.summarizeTasks(S.createScanner().scanAll(repo.main, sec(10, 45)), sec(10, 45))[0]
  cell("AC-04 after merge --ff-only the copies are equal and the time of the line is shown", b.k === 3 && b.at === sec(10, 40) && !b.byFile && b.source === "main", show(b))
  // without a time field: the earlier file time, marked by file
  const plain = ["С5 0/14 старт", "С5 1/14 а", "С5 2/14 б"]
  jwrite(repo.main, "002-guards", plain, sec(10, 43) + 3_000)
  jwrite(tree, "002-guards", plain, sec(10, 43))
  const c = P.summarizeTasks(S.createScanner().scanAll(repo.main, sec(10, 45)), sec(10, 45))[0]
  cell("AC-04 after the merge, no time field: the earlier file time, marked by file", c.byFile && c.at === sec(10, 43), show(c))
}
{
  // AC-24 on real trees: S0 (launch in the main copy, work in the tree), S1 (with and without the later file), S2, the common start
  const repo = makeRepo({ "002-demo": { title: "Demo", lines: common } })
  const tree = addTree(repo, "task-x")
  const run = (mainLines, treeLines, mm, tm, now = NOW) => {
    jwrite(repo.main, "002-demo", mainLines, mm)
    jwrite(tree, "002-demo", treeLines, tm)
    return P.summarizeTasks(S.createScanner().scanAll(repo.main, now), now)[0]
  }
  const s0 = run([...common, "С5 0/0 запуск"], [...common, "С5 0/2 старт", "С5 1/2 шаг"], sec(11, 30), sec(11, 55))
  cell("AC-24 real S0a: one session С5 from the tree, no +N, no ≠", s0.session === "С5" && s0.k === 1 && s0.source === "tree" && s0.others === 0 && !s0.divergent, show(s0))
  const s0b = run([...common, "С5 0/0 запуск"], [...common, "С5 0/2 старт", "С5 2/2 готово"], sec(11, 30), sec(11, 55))
  cell("AC-24 real S0b: «готово», no ghost launch", s0b.state === 2 && s0b.others === 0, show(s0b))
  const mainS1 = [...common, "С7 0/0 запуск", "С7 0/3 старт", "С7 1/3 а"]
  const treeS1 = [...common, "С5 0/2 старт", "С5 2/2 готово", "С6 0/4 старт", "С6 4/4 готово"]
  const s1 = run(mainS1, treeS1, sec(11, 58), sec(11, 55))
  const s1r = run(mainS1, treeS1, sec(11, 50), sec(11, 59))
  cell("AC-24 real S1: the main file is later: С7 is shown, no +N; reversed: С6 «готово»", s1.session === "С7" && s1.others === 0 && s1r.session === "С6" && s1r.state === 2, show({ s1: s1.session, s1r: s1r.session }))
  const s2 = run([...common, "С7 0/0 [10:00] запуск"], [...common, "С5п 0/3 [11:30] старт", "С5п 1/3 [11:40] шаг"], sec(10, 0), sec(11, 40), at(11, 50))
  cell("AC-24 real S2: С5п runs, the abandoned launch of С7 is +1", s2.session === "С5п" && s2.others === 1, show(s2))
  const base = [...common, "С4 0/2 [11:00] старт", "С4 2/2 [11:10] готово"]
  const cs = run(base, [...base, "С5 0/3 [11:30] старт", "С5 1/3 [11:40] а"], sec(11, 10), sec(11, 40), at(11, 50))
  cell("AC-24 real common start: С4 «готово» in the main copy, С5 in the tree: +N 0", cs.session === "С5" && cs.others === 0, show(cs))
  const div = run(["С5 0/3 старт", "С5 1/3 [11:30] в основной"], ["С5 0/3 старт", "С5 1/3 [11:10] в дереве"], sec(11, 31), sec(11, 12))
  cell("AC-24 real divergence: the later time wins, ≠", div.divergent && div.source === "main", show(div))
}
{
  // AC-09 and AC-16: no journal, an empty one, no repository, a removed tree, an unreadable journal
  const repo = makeRepo({ "002-demo": { title: "Demo", lines: ["С1 0/1 старт"] } })
  mkdirSync(path.join(repo.main, "doc", "tasks", "003-no-log"), { recursive: true })
  jwrite(repo.main, "004-empty", [])
  const r = S.createScanner().scanAll(repo.main, NOW)
  const sm = P.summarizeTasks(r, NOW)
  cell("AC-09 a task with no progress.log or with an empty one is not shown and nothing throws", sm.length === 1 && sm[0].number === "002" && r.journals === 2, show({ n: sm.length, j: r.journals }))
  const none = path.join(tmp, "norepo", "sub")
  mkdirSync(none, { recursive: true })
  const rn = S.createScanner().scan(none, NOW)
  cell("AC-16 a tab outside any repository: no repository, no trees, no tasks", rn.repo === undefined && rn.trees.length === 0 && rn.tasks.length === 0, show(rn))
  const bare = makeRepo({})
  const rb = S.createScanner().scanAll(bare.main, NOW)
  cell("AC-16 a repository with no doc/tasks: no tasks, the repository and one tree are known", real(rb.repo) === real(S.findRepoRoot(bare.main)?.root) && rb.trees.length === 1 && rb.tasks.length === 0, show(rb))
  const rep2 = makeRepo({ "002-demo": { title: "Demo", lines: ["С1 0/2 старт", "С1 1/2 а"] } })
  const tr = addTree(rep2, "task-gone")
  jwrite(tr, "002-demo", ["С1 0/2 старт", "С1 1/2 а", "С1 2/2 готово"])
  rmSync(tr, { recursive: true, force: true })
  const rg = S.createScanner().scanAll(rep2.main, NOW)
  cell("AC-16 a removed tree is skipped, the rest is read", rg.trees.length === 1 && rg.tasks.length === 1 && rg.tasks[0].copies.length === 1, show({ t: rg.trees.length }))
  const rep3 = makeRepo({ "002-demo": { title: "Demo", lines: ["С1 0/2 старт"] } })
  const logFile = jfile(rep3.main, "002-demo")
  rmSync(logFile)
  mkdirSync(logFile) // the journal "cannot be read": a folder in its place
  const ru = S.createScanner().scanAll(rep3.main, NOW)
  cell("AC-16 an unreadable journal is skipped without an exception", ru.tasks.length === 0, show(ru))
}
{
  // AC-19 (data): the movement of the branch is read from logs/HEAD, with no process
  const repo = makeRepo({ "002-demo": { title: "Demo", lines: ["С5 0/3 старт"] } })
  const tree = addTree(repo, "task-x")
  const mainHead = path.join(repo.main, ".git", "logs", "HEAD")
  const treeHead = path.join(repo.main, ".git", "worktrees", "task-x", "logs", "HEAD")
  cell("AC-19 both reflog files exist in the fixture", statSync(mainHead).isFile() && statSync(treeHead).isFile(), "")
  jwrite(repo.main, "002-demo", ["С5 0/3 [11:00] старт"], sec(11, 0))
  jwrite(tree, "002-demo", ["С5 0/3 [11:00] старт", "С5 1/3 [11:05] а"], sec(11, 5))
  utimesSync(mainHead, sec(11, 40) / 1000, sec(11, 40) / 1000)
  utimesSync(treeHead, sec(11, 49) / 1000, sec(11, 49) / 1000)
  const t = P.summarizeTasks(S.createScanner().scanAll(repo.main, NOW), NOW)[0]
  cell("AC-19 the chosen copy is the tree: the branch time is the one of .git/worktrees/<name>/logs/HEAD", t.source === "tree" && t.branchAt === sec(11, 49), show(t))
  jwrite(tree, "002-demo", ["С5 0/3 [11:00] старт"], sec(11, 5))
  const t2 = P.summarizeTasks(S.createScanner().scanAll(repo.main, NOW), NOW)[0]
  cell("AC-19 equal copies: the main copy is chosen and its branch time is .git/logs/HEAD", t2.source === "main" && t2.branchAt === sec(11, 40), show(t2))
}
{
  // AC-11 (г): the walk, the cache and the budget of parsing
  const tasks = {}
  for (let i = 1; i <= 8; i++) tasks[`00${i}-job`] = { title: `Job ${i}`, lines: ["С5 0/3 старт", "С5 1/3 а"] }
  const repo = makeRepo(tasks)
  for (let i = 1; i <= 8; i++) utimesSync(jfile(repo.main, `00${i}-job`), sec(10, i) / 1000, sec(10, i) / 1000)
  const sc = S.createScanner()
  const t0 = NOW
  const w1 = sc.scan(repo.main, t0)
  cell("AC-11 г a cold walk parses at most 5 files (PARSE_BUDGET), the freshest first", sc.stats.parses === 5 && S.PARSE_BUDGET === 5 && sc.stats.lastParsed.every((f, i, a) => i === 0 || statSync(f).mtimeMs <= statSync(a[i - 1]).mtimeMs) && path.basename(path.dirname(sc.stats.lastParsed[0])) === "008-job", show({ p: sc.stats.parses, first: sc.stats.lastParsed[0] }))
  cell("AC-11 г a task appears when all its copies are parsed: 5 tasks, the walk is not complete", w1.tasks.length === 5 && !w1.complete && w1.journals === 8, show({ t: w1.tasks.length, c: w1.complete }))
  const w1b = sc.scan(repo.main, t0 + 2_000)
  cell("AC-11 г between walks (2 s) nothing is touched: the same result, no new walk", w1b === w1 && sc.stats.walks === 1, show({ same: w1b === w1, w: sc.stats.walks }))
  const w2 = sc.scan(repo.main, t0 + S.WALK_MS)
  cell("AC-11 г the next walk takes the rest: 3 more files, all 8 tasks, complete", sc.stats.parses === 8 && w2.tasks.length === 8 && w2.complete, show({ p: sc.stats.parses, t: w2.tasks.length }))
  const w3 = sc.scan(repo.main, t0 + 2 * S.WALK_MS)
  cell("AC-11 a walk with nothing changed parses nothing", sc.stats.parses === 8 && sc.stats.lastParsed.length === 0 && w3.tasks.length === 8, show({ p: sc.stats.parses }))
  const f4 = jfile(repo.main, "004-job")
  writeFileSync(f4, "С5 0/3 старт\nС5 1/3 а\nС5 2/3 б\n")
  utimesSync(f4, sec(11, 0) / 1000, sec(11, 0) / 1000)
  const w4 = sc.scan(repo.main, t0 + 3 * S.WALK_MS)
  cell("AC-11 one changed journal is parsed again (pair time + size), the others are not", sc.stats.parses === 9 && w4.tasks.find((t) => t.folder === "004-job").copies[0].lines.length === 3, show({ p: sc.stats.parses }))
  writeFileSync(f4, "С5 0/3 старт\nС5 1/3 а\nС5 2/3 б\nС5 3/3 в\n")
  utimesSync(f4, sec(11, 0) / 1000, sec(11, 0) / 1000) // same time, another size
  const w5 = sc.scan(repo.main, t0 + 4 * S.WALK_MS)
  cell("AC-11 the size alone makes a file change visible (time unchanged)", w5.tasks.find((t) => t.folder === "004-job").copies[0].lines.length === 4, show({ p: sc.stats.parses }))
  rmSync(jfile(repo.main, "008-job"))
  const w6 = sc.scan(repo.main, t0 + 5 * S.WALK_MS)
  cell("AC-11 a journal that disappeared leaves the result (the cache entry is dropped)", w6.tasks.length === 7 && w6.journals === 7, show({ t: w6.tasks.length }))
  const cold = S.createScanner()
  const wa = cold.scanAll(repo.main, t0)
  cell("AC-11 г scanAll on a cold cache parses every file in one call and does not know the budget", cold.stats.parses === 7 && wa.complete && wa.tasks.length === 7, show({ p: cold.stats.parses }))
  const again = cold.scanAll(repo.main, t0 + 100)
  cell("AC-11 scanAll fills the same cache: a second call parses nothing", cold.stats.parses === 7 && again.tasks.length === 7, show({ p: cold.stats.parses }))
}
{
  // AC-21: the imports of the modules
  const importsOf = (src) => src.split("\n").filter((l) => /^import /.test(l))
  cell("AC-21 progress.ts has no import at all (no node:fs, no window, no OpenCode, no status.ts)", importsOf(PROG_SRC).length === 0, show(importsOf(PROG_SRC)))
  const scanImports = importsOf(SCAN_SRC).map((l) => /from "([^"]+)"/.exec(l)?.[1]).sort()
  cell("AC-21 progress-scan.ts imports only node:fs, node:path and ./progress.ts", show(scanImports) === show(["./progress.ts", "node:fs", "node:path"]), show(scanImports))
  const WRITE = /writeFile|appendFile|createWriteStream|copyFile|rename|mkdir|rmSync|unlink|fs[.]promises/
  cell("DNC-02 neither module writes anything (no write call in progress.ts or progress-scan.ts)", !WRITE.test(PROG_SRC) && !WRITE.test(SCAN_SRC), "")
}

// ---- texts of the panel and of the command dialog (step 6) ---------------------------------------------------------------
const V = await import("../progress-view.ts")
const St = await import("../status.ts")
const task = (lines, mtime, now, { title = "Стражи репозитория", folder = "002-guards", branchMs } = {}) =>
  P.summarizeTasks({ tasks: [{ folder, title, copies: [Cp("main", lines, mtime, branchMs !== undefined ? { branchMs } : {})] }] }, now)
const panel = (tasks, now) => V.panelLines(tasks, now).map((r) => r.text)
const dialog = (tasks, now, scan) => V.dialogText(tasks, now, scan)
const T0 = at(12, 0)

cell("AC-12 the width constants equal those of status.ts (SIDE_WIDTH, DIALOG_WIDTH)", V.PANEL_WIDTH === St.SIDE_WIDTH && V.DIALOG_WIDTH === St.DIALOG_WIDTH, show({ p: V.PANEL_WIDTH, s: St.SIDE_WIDTH, d: V.DIALOG_WIDTH, sd: St.DIALOG_WIDTH }))
cell("AC-10 the walk (5 s) and the show (2 s) periods give news within 10 seconds", S.WALK_MS + V.SHOW_MS < 10_000 && V.SHOW_MS === 2_000 && S.WALK_MS === 5_000, show({ w: S.WALK_MS, s: V.SHOW_MS }))
{
  // AC-01
  const t = task(["С5 0/14 старт", "С5 13/14 [11:57] шаг: сводка"], at(11, 57), T0)
  const rows = panel(t, T0)
  cell("AC-01 the panel: title and four rows of the task", show(rows) === show(["Ход работ", "• 002 Стражи репозитория", "    С5 реализация 13/14", "    ↳ шаг: сводка", "    идёт 11:57 · 3м назад"]), show(rows))
  cell("AC-01 no «нет вестей» in the panel and the command says «идёт: последняя весть 11:57, 3 мин назад»", !rows.join("\n").includes("нет вестей") && dialog(t, T0).includes("идёт: последняя весть 11:57, 3 мин назад"), dialog(t, T0))
}
{
  // AC-02 (texts)
  const mk = (ago) => task(["С5 0/14 старт", `С5 13/14 ${hhmm(T0 - ago * MIN)} шаг`], T0 - ago * MIN, T0)
  cell("AC-02 11 minutes: «⚠ нет вестей 11м» in the panel, «давно нет вестей 11 мин» in the command", panel(mk(11), T0)[4] === "    ⚠ нет вестей 11м" && dialog(mk(11), T0).includes("давно нет вестей 11 мин"), show(panel(mk(11), T0)))
  cell("AC-02 9 minutes: «идёт 11:51 · 9м назад»", panel(mk(9), T0)[4] === "    идёт 11:51 · 9м назад", show(panel(mk(9), T0)))
}
{
  // AC-03 (texts)
  const done = task(["С5 0/14 старт", "С5 14/14 [11:55] готово — итог"], at(11, 55), T0)
  const rows = panel(done, T0)
  cell("AC-03 «готово 11:55» in the panel (mark ✓), «готово, 11:55» in the command", rows[1].startsWith("✓ ") && rows[4] === "    готово 11:55" && dialog(done, T0).includes("готово, 11:55"), show(rows))
  const noTime = task(["С5 0/14 старт", "С5 14/14 готово"], at(11, 55), T0)
  cell("AC-03 without a time field the time is marked by file: «готово ≈11:55»", panel(noTime, T0)[4] === "    готово ≈11:55", show(panel(noTime, T0)))
  const doneLater = task(["С5 0/14 старт", "С5 14/14 [11:55] готово — итог"], at(11, 55), T0 + 16 * MIN)
  cell("AC-03 after 16 minutes the task is gone from the panel and from the command", panel(doneLater, T0 + 16 * MIN).length === 0 && dialog(doneLater, T0 + 16 * MIN).startsWith("Идущих задач нет"), dialog(doneLater, T0 + 16 * MIN))
  const quiet = task(["С5 0/14 старт", "С5 5/14 шаг"], T0 - 25 * 3_600_000, T0)
  cell("AC-03 silent for 25 hours: not in the panel, «давно брошена» in the command", panel(quiet, T0).length === 0 && dialog(quiet, T0).includes("давно брошена"), dialog(quiet, T0))
}
{
  // AC-07 (texts) and AC-19 (texts)
  const l = task(["С1 0/0 [11:57] запуск"], at(11, 57), T0)
  const rows = panel(l, T0)
  cell("AC-07 a launch: «шагов нет» in row 2, «запущена 11:57» in row 4; the command «запущена 11:57, шагов нет»", rows[2] === "    С1 разбор шагов нет" && rows[4] === "    запущена 11:57" && rows[1].startsWith("• ") && dialog(l, T0).includes("запущена 11:57, шагов нет"), show(rows))
  const late = task(["С1 0/0 [11:49] запуск"], at(11, 49), T0)
  cell("AC-07 after the threshold: «⚠ нет вестей 11м» (mark !), never «готово»", panel(late, T0)[4] === "    ⚠ нет вестей 11м" && panel(late, T0)[1].startsWith("! ") && dialog(late, T0).includes("запущена 11:49, шагов нет, давно нет вестей 11 мин") && !panel(late, T0).join().includes("готово"), show(panel(late, T0)))
  const k = task(["КОММИТ 0/0 старт"], at(11, 58), T0)
  cell("AC-07 «КОММИТ 0/0 старт»: «без единиц ≈11:58», gone after 15 minutes", panel(k, T0)[4] === "    без единиц ≈11:58" && panel(task(["КОММИТ 0/0 старт"], at(11, 58), T0 + 15 * MIN), T0 + 15 * MIN).length === 0, show(panel(k, T0)))
  // AC-19
  const b = task(["С5 0/14 старт", "С5 5/14 [11:49] шаг"], at(11, 49), T0, { branchMs: T0 - 3 * MIN })
  cell("AC-19 «⚠ нет вестей 11м · ветка 3м»; the command says «давно нет вестей 11 мин, ветка двигалась 3 мин назад»", panel(b, T0)[4] === "    ⚠ нет вестей 11м · ветка 3м" && dialog(b, T0).includes("давно нет вестей 11 мин, ветка двигалась 3 мин назад"), show(panel(b, T0)))
  const h = task(["С5 0/14 старт", "С5 5/14 [09:30] шаг"], at(9, 30), T0, { branchMs: T0 - 45 * MIN })
  cell("AC-19 150 minutes of silence and 45 of the branch: «⚠ нет вестей 2ч · ветка 45м»", panel(h, T0)[4] === "    ⚠ нет вестей 2ч · ветка 45м", show(panel(h, T0)))
  const w = task(["С5 0/14 старт", "С5 5/14 шаг"], T0 - (99 * 60 + 59) * 1000, T0, { branchMs: T0 - (99 * 60 + 10) * 1000 })
  const w4 = panel(w, T0)[4]
  cell("AC-19 99 and 99 minutes: the row is exactly 32 characters", w4 === "    ⚠ нет вестей 99м · ветка 99м" && w4.length === 32, show(w4))
  const nb = task(["С5 0/14 старт", "С5 5/14 [11:49] шаг"], at(11, 49), T0, { branchMs: at(11, 40) })
  cell("AC-19 the branch did not move after the news: no «ветка»", panel(nb, T0)[4] === "    ⚠ нет вестей 11м" && !dialog(nb, T0).includes("ветка"), show(panel(nb, T0)))
  const st3 = task(["С1 0/0 [11:49] запуск"], at(11, 49), T0, { branchMs: T0 - 3 * MIN })
  cell("AC-19 state 3 after the threshold shows the branch too", panel(st3, T0)[4] === "    ⚠ нет вестей 11м · ветка 3м", show(panel(st3, T0)))
}
{
  // AC-08 (texts)
  for (const line of ["С5 13/14 [11:50] стоп: ворота — ждёт слова владельца", "С5 14/14 стоп: ворота — ждёт", "С5 15/14 стоп:ворота"]) {
    const t = task(["С5 0/14 старт", line], at(11, 50), T0)
    cell(`AC-08 «${line.slice(0, 16)}»: «остановилась: ворота», no «нет вестей» and no «готово»`, panel(t, T0)[4] === "    остановилась: ворота" && !panel(t, T0).join().includes("нет вестей") && !panel(t, T0).join().includes("готово") && panel(t, T0)[1].startsWith("! "), show(panel(t, T0)))
  }
  const named = task(["С5 0/14 старт", "С5 13/14 [11:50] стоп: ворота — ждёт слова владельца"], at(11, 50), T0)
  cell("AC-08 the command: «остановилась: ворота — ждёт слова владельца, 11:50»", dialog(named, T0).includes("остановилась: ворота — ждёт слова владельца, 11:50"), dialog(named, T0))
  const un = task(["С5 0/14 старт", "С5 13/14 [11:50] стоп: что-то — x"], at(11, 50), T0)
  cell("AC-08 a kind outside the list: «остановилась: вид не назван» (27 characters, fits 28)", panel(un, T0)[4] === "    остановилась: вид не назван" && "остановилась: вид не назван".length === 27 && dialog(un, T0).includes("остановилась: вид не назван — что-то — x, 11:50"), show(panel(un, T0)) + dialog(un, T0))
}
{
  // AC-23 (texts)
  const t = task(["С5 0/14 старт", "С5 14/14 пересборка: ветка на main"], at(11, 30), T0)
  cell("AC-23 «все шаги сделаны, итога нет» in the panel (mark !) and the command", panel(t, T0)[4] === "    все шаги сделаны, итога нет" && panel(t, T0)[1].startsWith("! ") && dialog(t, T0).includes("все шаги сделаны, итога нет"), show(panel(t, T0)))
}
{
  // AC-12: widths, the number of tasks, the order
  const base = (n, title, lines, mtime) => ({ folder: `00${n}-t`, title, copies: [Cp("main", lines, mtime)] })
  const run = (age) => ["С5 0/14 старт", `С5 3/14 ${hhmm(T0 - age * MIN)} шаг сводки панели и ещё немного слов`]
  const four = [
    base(1, "Первая задача с очень длинным названием, которое не поместится", run(1), T0 - 1 * MIN),
    base(2, "Вторая задача", run(9), T0 - 9 * MIN),
    base(3, "Guards of the repository tests with a long latin title", run(11), T0 - 11 * MIN),
    base(4, "Четвёртая", run(5), T0 - 5 * MIN),
  ]
  const tasks = P.summarizeTasks({ tasks: four }, T0)
  const rows = V.panelLines(tasks, T0)
  const texts = rows.map((r) => r.text)
  cell("AC-12 panel rows are at most 32 characters and do not end with a space", texts.every((x) => x.length <= 32 && !x.endsWith(" ")), show(texts.filter((x) => x.length > 32 || x.endsWith(" "))))
  cell("AC-12 at most 3 tasks and the line «+1 · /crew-progress», at most 14 rows", texts.length <= 14 && texts.at(-1) === "+1 · /crew-progress" && texts.filter((x) => /^[•!✓] /.test(x)).length === 3, show(texts))
  cell("AC-12 the silent task is first and the least fresh of the others is hidden", texts[1].startsWith("! 003 Guards of the") && texts[5].startsWith("• 001") && texts[9].startsWith("• 004") && !texts.some((x) => x.includes("002")), show(texts.filter((x) => /^[•!✓] /.test(x))))
  cell("AC-12 row 4 of every task holds the state", [4, 8, 12].every((i) => /идёт|нет вестей/.test(texts[i])), show(texts))
  cell("AC-15 the latin title stays as written (the letter s is not replaced), the number has no #", texts[1].startsWith("! 003 Guards of the repos") && !texts.join("").includes("#"), texts[1])
  const d = dialog(tasks, T0)
  cell("AC-12 dialog lines are at most 72 characters and do not end with a space", d.split("\n").every((x) => x.length <= 72 && !x.endsWith(" ")), show(d.split("\n").filter((x) => x.length > 72 || x.endsWith(" "))))
  cell("AC-15 the command prints the full titles", d.includes("003 Guards of the repository tests with a long latin title") || d.includes("003 Guards of the repository tests with a long latin"), d)
  // four silent tasks: the three oldest are shown
  const silent = [1, 2, 3, 4].map((i) => base(i, `Тихая ${i}`, run(10 + i * 3), T0 - (10 + i * 3) * MIN))
  const st = V.panelLines(P.summarizeTasks({ tasks: silent }, T0), T0).map((r) => r.text)
  cell("AC-12 four silent tasks: the three oldest are shown, the fourth is «+1»", st.filter((x) => /^! /.test(x)).length === 3 && st.some((x) => x.includes("Тихая 4")) && !st.some((x) => x.includes("Тихая 1")) && st.at(-1) === "+1 · /crew-progress", show(st))
  // the second row with ≠ and +1: the name is cut with «…», «13/14 ≠ +1» whole
  const proto = tasks[0]
  for (const [code, full] of [["С5д", "С5д продолжение реализации"], ["С9", "С9 разбор обратной связи"]]) {
    const t = { ...proto, session: code, sessionName: P.sessionName(code), k: 13, n: 14, divergent: true, others: 1, state: 5, stale: false }
    const r2 = V.taskRows(t, T0)[1].text
    cell(`AC-12 row 2 for ${code}: at most 32 characters, «13/14 ≠ +1» whole, the name cut with «…»`, r2.length <= 32 && r2.endsWith(" 13/14 ≠ +1") && r2.includes("…") && P.sessionName(code) === full, show(r2))
  }
  const fit = P.sessionName("С5") + " 13/14 ≠ +1"
  const rr = V.taskRows({ ...proto, session: "С5", sessionName: P.sessionName("С5"), k: 13, n: 14, divergent: true, others: 1, state: 5 }, T0)[1].text
  cell("AC-12 a name that fits is not cut", rr === `    ${fit}`, rr)
}
{
  // AC-13: the dialog
  const t = task(["С5 0/14 старт", "С5 11/14 [11:40] а", "С5 12/14 [11:45] б", "С5 13/14 [11:50] в"], at(11, 50), T0)
  const d = dialog(t, T0)
  cell("AC-13 the dialog shows the task, the session, the state and the three last lines of the journal", d.includes("002 Стражи репозитория") && d.includes("С5 реализация 13/14") && d.includes("↳ 13/14 [11:50] в") && d.includes("↳ 12/14 [11:45] б") && d.includes("↳ 11/14 [11:40] а") && !d.includes("0/14 старт"), d)
  const none = dialog([], T0, { trees: 2, journals: 5 })
  cell("AC-13 no running tasks: «Идущих задач нет» with the trees and journals looked at", none === "Идущих задач нет. Осмотрено деревьев: 2, журналов: 5.", none)
  const sessions = [task(["С5д 0/3 старт", "С5д 1/3 [11:50] а"], at(11, 50), T0), task(["С9 0/3 старт", "С9 1/3 [11:50] б"], at(11, 50), T0)].flat()
  const dd = dialog(sessions, T0)
  cell("AC-15 the command names the sessions in full: «С5д продолжение реализации», «С9 разбор обратной связи»", dd.includes("С5д продолжение реализации 1/3") && dd.includes("С9 разбор обратной связи 1/3"), dd)
}
{
  // AC-16 (entries): outside a repository, no tab
  const outside = path.join(tmp, "norepo2")
  mkdirSync(outside, { recursive: true })
  cell("AC-16 /crew-progress with no tab or outside a repository: the one sentence", V.progressDialog(undefined, T0) === V.OUTSIDE_TEXT && V.progressDialog(outside, T0) === V.OUTSIDE_TEXT && V.OUTSIDE_TEXT === "Вкладка открыта вне репозитория: ход работ показывать нечем (осмотрено деревьев: 0)", V.progressDialog(outside, T0))
  cell("AC-16 the block of a tab outside a repository is empty and does not throw", V.progressPanel(outside, T0).length === 0 && V.progressPanel(undefined, T0).length === 0, "")
  const bare = makeRepo({})
  const empty = V.progressDialog(bare.main, T0)
  cell("AC-13 a repository with no journals: «Идущих задач нет. Осмотрено деревьев: 1, журналов: 0.»", empty === "Идущих задач нет. Осмотрено деревьев: 1, журналов: 0.", empty)
}
{
  // the entries on a real repository with a tree
  const repo = makeRepo({ "002-guards": { title: "Стражи репозитория", lines: [...common] } })
  const tree = addTree(repo, "task-x")
  jwrite(repo.main, "002-guards", [...common, "С5 0/0 [11:00] запуск"], sec(11, 0))
  jwrite(tree, "002-guards", [...common, "С5 0/14 [11:01] старт", "С5 13/14 [11:57] шаг: сводка"], sec(11, 57))
  const rows = V.progressPanel(tree, T0).map((r) => r.text)
  cell("AC-01 the entry progressPanel on a real tree: the tab sits in the tree, the journal of the tree is shown", rows[1] === "• 002 Стражи репозитория" && rows[2] === "    С5 реализация 13/14" && rows[4] === "    идёт 11:57 · 3м назад", show(rows))
  const dlg = V.progressDialog(repo.main, T0)
  cell("AC-13 the entry progressDialog on the main copy of the same repository", dlg.includes("идёт: последняя весть 11:57, 3 мин назад") && dlg.includes("↳ 13/14 [11:57] шаг: сводка"), dlg)
}
{
  // AC-27 (numbers in the panel and in the command)
  const codes = ["С1", "С1п", "С2", "С3", "С4", "С5"]
  const lines = []
  for (let i = 0; i < 69; i++) lines.push(`${codes[i % 6]} 0/3 старт заход ${i}`, `${codes[i % 6]} 1/3 а`, `${codes[i % 6]} 3/3 готово`)
  lines.push("С5 0/14 старт", ...Array.from({ length: 13 }, (_, k) => `С5 ${k + 1}/14 шаг ${k + 1}`))
  const t = P.summarizeTasks({ tasks: [{ folder: "002-guards", title: "Стражи", copies: [Cp("main", lines, at(11, 0)), Cp("tree", [...lines, "С5 14/14 пересборка: ветка на main"], at(11, 58))] }] }, T0)
  const rows = panel(t, T0)
  const d = dialog(t, T0)
  cell("AC-27 task-002 style in the panel and the command: no «+N», «вытеснено 69», «итога нет»", !rows.some((x) => /\+\d/.test(x)) && d.includes("вытеснено 69") && d.includes("все шаги сделаны, итога нет") && d.includes("↳ 14/14 пересборка: ветка на main"), show(rows) + d)
}

// ---- budgets and load (step 7): the fixture of AC-11 is 10 journals of 600 lines in each of 2 trees and 20 message.md --------
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return { med: s[Math.floor(s.length / 2)], p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))], min: s[0], max: s[s.length - 1] }
}
const timeOf = (f) => {
  const t = performance.now()
  f()
  return performance.now() - t
}
const bigJournal = (seed, tail = 0) => {
  const out = []
  const codes = ["С1", "С1п", "С2", "С3", "С4", "С5"]
  for (let i = 0; out.length < 600 - 14; i++) {
    const c = codes[(i + seed) % 6]
    out.push(`${c} 0/12 [10:00] старт заход ${i}`)
    for (let k = 1; k <= 11; k++) out.push(`${c} ${k}/12 [10:${String(k).padStart(2, "0")}] шаг ${k}: проверен модуль ${seed}-${i}-${k}`)
    out.push(`${c} 12/12 [10:30] готово — всё сделано и проверено`)
  }
  out.push("С5 0/14 [11:00] старт заход последний")
  for (let k = 1; k <= 13 + tail; k++) out.push(`С5 ${k}/14 [11:${String(k).padStart(2, "0")}] шаг ${k}`)
  return out
}
const heavyTasks = {}
for (let i = 1; i <= 10; i++) heavyTasks[`0${String(i).padStart(2, "0")}-job`] = { title: `Работа номер ${i}`, lines: ["С1 0/1 старт"] }
const heavy = makeRepo(heavyTasks)
const heavyTree = addTree(heavy, "task-heavy")
const heavyFiles = []
for (let i = 1; i <= 10; i++) {
  const folder = `0${String(i).padStart(2, "0")}-job`
  heavyFiles.push(jwrite(heavy.main, folder, bigJournal(i), sec(11, 20)), jwrite(heavyTree, folder, bigJournal(i, 1), sec(11, 40)))
}
const HNOW = sec(11, 59)
procs.n = 0 // the fixtures are built, from here every started process is counted

{
  const sc = S.createScanner()
  sc.scanAll(heavy.main, HNOW)
  const walk = []
  const stat = []
  for (let i = 0; i < 50; i++) {
    walk.push(timeOf(() => sc.scan(heavy.main, HNOW + (i + 1) * S.WALK_MS)))
    stat.push(timeOf(() => heavyFiles.forEach((f) => statSync(f))))
  }
  const w = stats(walk)
  const st = stats(stat)
  console.log(`     warm walk: median ${w.med.toFixed(2)} ms, bare stat of the 20 journals: median ${st.med.toFixed(2)} ms, ratio ${(w.med / st.med).toFixed(2)}`)
  cell("AC-11 а the warm walk: median of 50 is at most 4 x the bare stat of the same journals (the absolute 15 ms is lifted by the owner's decision)", w.med <= 4 * st.med, show({ walk: w.med, stat: st.med }))
  cell("AC-11 а a warm walk parses nothing", sc.stats.lastParsed.length === 0, show(sc.stats))
}
{
  const read = []
  const cold = []
  for (let i = 0; i < 20; i++) {
    cold.push(timeOf(() => S.createScanner().scanAll(heavy.main, HNOW)))
    read.push(timeOf(() => heavyFiles.forEach((f) => readFileSync(f))))
  }
  const c = stats(cold)
  const r = stats(read)
  console.log(`     cold parse: median ${c.med.toFixed(2)} ms, p90 ${c.p90.toFixed(2)} ms, plain read of the 20 files: median ${r.med.toFixed(2)} ms, ratios ${(c.med / r.med).toFixed(2)} / ${(c.p90 / r.med).toFixed(2)}`)
  cell("AC-11 б the cold full parse: median of 20 is at most 4 x the plain read, the 90th percentile at most 6 x", c.med <= 4 * r.med && c.p90 <= 6 * r.med, show({ cold: c, read: r }))
}
{
  // (в) the show between walks: from the cache, no files
  const sc = V.progressPanel
  V.progressDialog(heavy.main, HNOW) // fills the cache of the window's scanner (scanAll)
  const first = V.progressPanel(heavy.main, HNOW)
  const shows = []
  for (let i = 0; i < 200; i++) shows.push(timeOf(() => V.progressPanel(heavy.main, HNOW + 100 + i)))
  const s = stats(shows)
  console.log(`     show between walks: median ${s.med.toFixed(3)} ms, p90 ${s.p90.toFixed(3)} ms, max ${s.max.toFixed(3)} ms`)
  cell("AC-11 в the show without a walk: median at most 1 ms", s.med <= 1 && first.length > 0 && typeof sc === "function", show(s))
}
{
  // (г) the event loop: 5 runs of 120 shows with a walk every 5 seconds (simulated clock), one journal grows before each run
  const { monitorEventLoopDelay } = await import("node:perf_hooks")
  const tops = []
  let seen = 0
  for (let run = 0; run < 5; run++) {
    const f = heavyFiles[run]
    writeFileSync(f, readFileSync(f, "utf8") + `С5 14/14 [11:5${run}] пересборка ${run}\n`)
    utimesSync(f, (HNOW + 1000 * run) / 1000, (HNOW + 1000 * run) / 1000)
    const h = monitorEventLoopDelay({ resolution: 10 })
    h.enable()
    for (let i = 0; i < 120; i++) {
      const rows = V.progressPanel(heavy.main, HNOW + 60_000 * run + i * 2_000)
      if (rows.length) seen++
      await new Promise((r) => setImmediate(r))
    }
    h.disable()
    tops.push(h.max / 1e6)
  }
  console.log(`     event loop block, max per run (ms): ${tops.map((x) => x.toFixed(1)).join(", ")}`)
  cell("AC-11 г AC-25 each of the 5 runs of 120 shows blocks the event loop for at most 100 ms", tops.length === 5 && tops.every((x) => x <= 100) && seen === 600, show({ tops, seen }))
}
{
  // (д) no process is started by the shows, the command or the scan
  const before = procs.n
  V.progressPanel(heavy.main, HNOW + 600_000)
  V.progressDialog(heavy.main, HNOW + 600_000)
  S.createScanner().scanAll(heavy.main, HNOW + 600_000)
  cell("AC-11 д a show, the command and a full scan start no process (the counter stays 0)", procs.n === 0 && before === 0, show({ n: procs.n, before }))
  // (е) a positive control: reading the project settings starts git and the counter grows
  const { readSettingsFolder } = await import("../settings.ts")
  const mark = procs.n
  readSettingsFolder(heavy.main, Date.now() + 10_000_000)
  cell("AC-11 е control: readSettingsFolder on a throwaway repository starts a process and the counter grows", procs.n > mark, show({ mark, now: procs.n }))
  procs.n = 0
}
{
  // AC-10: the news within 10 seconds, on a substituted clock
  const repo = makeRepo({ "002-live": { title: "Живая", lines: ["С5 0/3 старт", "С5 1/3 [11:00] а"] } })
  const f = jfile(repo.main, "002-live")
  utimesSync(f, sec(11, 1) / 1000, sec(11, 1) / 1000)
  const t0 = sec(11, 2)
  const kRow = (rows) => rows.find((x) => x.text.includes("С5 реализация"))?.text
  const seenAt = []
  V.progressPanel(repo.main, t0)
  writeFileSync(f, "С5 0/3 старт\nС5 1/3 [11:00] а\nС5 2/3 [11:02] б\n")
  utimesSync(f, (t0 + 500) / 1000, (t0 + 500) / 1000)
  for (const dt of [2_000, 4_000, 6_000, 8_000, 10_000]) seenAt.push([dt, kRow(V.progressPanel(repo.main, t0 + dt)) ?? ""])
  const first = seenAt.find(([, text]) => text.includes("2/3"))
  cell("AC-10 a line appended to the journal is on the panel within 10 seconds of the clock (a walk every 5 s, a show every 2 s)", !!first && first[0] <= 10_000 && S.WALK_MS + V.SHOW_MS < 10_000, show(seenAt))
}
{
  // AC-25: thresholds through the environment in the window's entry, settings never read
  const repo = makeRepo({ "002-live": { title: "Живая", lines: ["С5 0/3 старт", "С5 1/3 [11:49] а"] } })
  utimesSync(jfile(repo.main, "002-live"), sec(11, 49) / 1000, sec(11, 49) / 1000)
  utimesSync(path.join(repo.main, ".git", "logs", "HEAD"), sec(9, 0) / 1000, sec(9, 0) / 1000) // the branch was last moved long before the news
  procs.n = 0 // the throwaway repository is built
  const row4 = (now) => V.progressPanel(repo.main, now).map((r) => r.text)[4]
  const base = row4(sec(12, 0))
  process.env.CREW_HARNESS_PROGRESS_STALE_MS = String(20 * 60_000)
  const lifted = row4(sec(12, 5))
  process.env.CREW_HARNESS_PROGRESS_STALE_MS = "abc"
  const bad = row4(sec(12, 10))
  delete process.env.CREW_HARNESS_PROGRESS_STALE_MS
  cell("AC-25 the window's entry takes the thresholds from the environment (11 min is silence by default, not with 20 min; a non-number is the default)", base === "    ⚠ нет вестей 11м" && lifted === "    идёт 11:49 · 16м назад" && bad === "    ⚠ нет вестей 21м", show({ base, lifted, bad }))
  cell("AC-25 the processes started by all the window's entries in this test stay 0", procs.n === 0, show(procs))
}
{
  // DNC-02: reading changes nothing: the journals, message.md and .git/worktrees have the same contents and times afterwards
  const { createHash } = await import("node:crypto")
  const { readdirSync } = await import("node:fs")
  const digest = (root) => {
    const h = createHash("sha256")
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else {
          const st = statSync(p)
          h.update(`${p}|${st.size}|${st.mtimeMs}|`)
          h.update(readFileSync(p))
        }
      }
    }
    walk(path.join(root, "doc"))
    try {
      walk(path.join(root, ".git", "worktrees"))
    } catch {}
    return h.digest("hex")
  }
  const a = digest(heavy.main) + digest(heavyTree)
  V.progressPanel(heavy.main, HNOW + 900_000)
  V.progressDialog(heavy.main, HNOW + 900_000)
  S.createScanner().scanAll(heavyTree, HNOW + 900_000)
  const b = digest(heavy.main) + digest(heavyTree)
  cell("DNC-02 the content and times of the journals, message.md and .git/worktrees are the same before and after a show, the command and a scan", a === b, "")
}

{
  // the hand-written line parser is the same language as the regular expression of the format (Д-11), checked on random strings
  let seed = 12345
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const alphabet = [" ", " ", "\t", "/", "/", "0", "1", "9", "a", "С", "[", "]", ":", "\r", "-", ".", "٣"]
  let bad = ""
  let formCount = 0
  for (let n = 0; n < 40000 && !bad; n++) {
    let s = ""
    const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
    if (n % 2) s = pick(["С5", "a", "С 5", "", "x\ty", "С5" + String.fromCharCode(0x301)]) + pick([" ", " ", "\t", "  ", ""]) + pick(["3", "12", "", String.fromCharCode(0x663), "03"]) + pick(["/", "/", "//", ""]) + pick(["4", "14", "", String.fromCharCode(0x664)]) + pick([" ", " ", "", "  ", "\t"]) + pick(["x", "[10:05] y", "y\r", " ", "", "стоп: ворота"])
    else {
      const len = Math.floor(rnd() * 12)
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)]
    }
    const m = P.LINE_RE.exec(s)
    const l = P.parseLine(s)
    if (!!m !== !!l) bad = `form differs on ${JSON.stringify(s)}`
    else if (m) {
      formCount++
      if (l.code !== m[1] || l.k !== Number(m[2]) || l.n !== Number(m[3]) || l.sig !== m[4]) bad = `fields differ on ${JSON.stringify(s)}`
    }
  }
  cell("AC-26 the parser of lines gives the same lines and fields as the regular expression on 40000 random strings", !bad && formCount > 200, bad || `forms: ${formCount}`)
  // the whole journal: the same lines as split by LF and parse one by one, with CRLF, a lone CR, a missing last LF
  const raw = Buffer.from("С5 0/3 старт\r\nмусор\n\nС5 1/3 [10:05] а\rб\nС5 2/3 в\n  \r\nС5 3/3 готово", "utf8")
  const viaSplit = P.splitJournal(raw).map(P.parseLine).filter(Boolean)
  const direct = P.parseJournal(raw)
  cell("AC-26 parseJournal equals splitting by LF and parsing each line (CRLF, a lone CR, junk, no last LF)", show(viaSplit) === show(direct) && direct.length === 4, show(direct))
}

// ---- the window: the fifth command and the block under «Crew» (step 8) ---------------------------------------------------
{
  const { copyFileSync, readdirSync } = await import("node:fs")
  const { fileURLToPath, pathToFileURL } = await import("node:url")
  const Core = await import("../core.ts")
  const Tui = await import("../tui.ts")
  const pluginDir = path.dirname(fileURLToPath(new URL("../tui.ts", import.meta.url)))
  // a window API as OpenCode gives it, cut down: the tab on screen is a session with a card (the directory of the tab)
  const mkApi = (route, out) => {
    const api = {
      ui: { router: { current: () => (route ? { type: "session", sessionID: route } : {}) }, tabs: { list: () => [] }, toast: { show: () => {} }, dialog: { alert: (a) => (out.shown = a) }, slot: (s) => s.render?.() },
      keymap: { layer: (f) => (out.cmds = f().commands) },
    }
    return api
  }
  const repo = makeRepo({ "002-guards": { title: "Стражи репозитория", lines: [...common] } })
  jwrite(repo.main, "002-guards", [...common, "С5 0/14 [11:50] старт", "С5 13/14 [11:57] шаг: сводка"], sec(11, 57))
  utimesSync(path.join(repo.main, ".git", "logs", "HEAD"), sec(9, 0) / 1000, sec(9, 0) / 1000)
  const session = "ses_progress_demo"
  mkdirSync(path.dirname(Core.cardFile(session)), { recursive: true })
  writeFileSync(Core.cardFile(session), JSON.stringify({ session, directory: repo.main }))
  procs.n = 0
  const out = {}
  const stop = Tui.default.setup(mkApi(session, out))
  const names = out.cmds.map((c) => c.slash?.name)
  const before = ["crew", "crew-config", "plans", "crew-doctor"]
  cell("AC-13 the commands of the window include crew-progress and the earlier ones keep their order", names.includes("crew-progress") && show(names.filter((n) => before.includes(n))) === show(before), show(names))
  const cmd = out.cmds.find((c) => c.slash?.name === "crew-progress")
  cell("AC-13 /crew-progress is in the palette with the title «Crew: что сейчас идёт»", cmd?.title === "Crew: что сейчас идёт" && cmd.palette === true, show(cmd))
  await cmd.run()
  cell("AC-13 the command opens a dialog with the running tasks and the last lines of the journal, with no model turn", /что сейчас идёт/.test(out.shown?.title ?? "") && out.shown.message.includes("002 Стражи репозитория") && out.shown.message.includes("↳ 13/14 [11:57] шаг: сводка"), show(out.shown))
  cell("AC-11 д the command /crew-progress starts no process", procs.n === 0, show(procs))
  stop?.()
  // no tab on screen (the start screen): the folder of the window process is used, like /crew-config does
  const cwd0 = process.cwd()
  const away = path.join(tmp, "away-from-any-repo")
  mkdirSync(away, { recursive: true })
  process.chdir(away)
  const out2 = {}
  const stop2 = Tui.default.setup(mkApi(undefined, out2))
  await out2.cmds.find((c) => c.slash?.name === "crew-progress").run()
  cell("AC-16 /crew-progress with no tab on screen and the process outside a repository: «Вкладка открыта вне репозитория…»", out2.shown?.message === V.OUTSIDE_TEXT, show(out2.shown))
  process.chdir(repo.main)
  out2.shown = undefined
  await out2.cmds.find((c) => c.slash?.name === "crew-progress").run()
  cell("AC-16 /crew-progress on the start screen takes the folder of the process: the running task of that repository is shown", /002 Стражи репозитория/.test(out2.shown?.message ?? "") && /↳ 13\/14 \[11:57\] шаг: сводка/.test(out2.shown?.message ?? ""), show(out2.shown))
  process.chdir(cwd0)
  stop2?.()
  // the module of the texts cannot be loaded: the window and the other commands work, the command says so
  const copy = path.join(tmp, "plugin-copy")
  mkdirSync(copy, { recursive: true })
  for (const f of readdirSync(pluginDir)) if (f.endsWith(".ts") || f === "package.json") copyFileSync(path.join(pluginDir, f), path.join(copy, f))
  writeFileSync(path.join(copy, "progress-view.ts"), "export const broken = ;\n")
  const Bad = await import(pathToFileURL(path.join(copy, "tui.ts")).href)
  const out3 = {}
  const stop3 = Bad.default.setup(mkApi(session, out3))
  await new Promise((r) => setTimeout(r, 200))
  await out3.cmds.find((c) => c.slash?.name === "crew-progress").run()
  cell("AC-16 the module of the texts cannot load: the window works and /crew-progress says «Не прочитать ход работ»", typeof stop3 === "function" && /^Не прочитать ход работ/.test(out3.shown?.message ?? ""), show(out3.shown))
  out3.shown = undefined
  out3.cmds.find((c) => c.slash?.name === "crew-doctor").run()
  cell("AC-16 the other commands still work (/crew-doctor opens its dialog)", /самопроверка/.test(out3.shown?.title ?? ""), show(out3.shown))
  stop3?.()
  // the sources: the imports of the block and the isolation of the two chains
  const sidebarSrc = readFileSync(new URL("../sidebar.tsx", import.meta.url), "utf8")
  const progressSrc = readFileSync(new URL("../progress-sidebar.tsx", import.meta.url), "utf8")
  const tuiSrc = readFileSync(new URL("../tui.ts", import.meta.url), "utf8")
  const imp = (s) => s.split("\n").filter((l) => /^import /.test(l))
  cell("AC-16 progress-sidebar.tsx: the same first line (jsxImportSource) and the same solid-js import as sidebar.tsx; progress-view is not imported statically", progressSrc.split("\n")[0] === sidebarSrc.split("\n")[0] && imp(progressSrc)[0] === imp(sidebarSrc)[0] && imp(progressSrc).length === 3 && imp(progressSrc)[1].includes("./core.ts") && imp(progressSrc)[2].includes("./dialog-size.ts") && !imp(progressSrc).some((l) => l.includes("progress-view")), show(imp(progressSrc)))
  cell("AC-16 tui.ts imports none of the new modules statically (a syntax error in them does not stop the window)", !imp(tuiSrc).some((l) => /progress/.test(l)), show(imp(tuiSrc)))
  cell("AC-13 the registration is in tui.ts", /crew-progress/.test(tuiSrc) && /crewSidebar\?\.finally\(/.test(tuiSrc), "")
}

{
  // AC-11 ж, DNC-02: the modules write nothing (a control: status.ts does write); DNC-03: the lines are of the form of the runner
  const WRITE = /writeFile|appendFile|createWriteStream|copyFile|rename|mkdir|rmSync|unlink|fs[.]promises/
  const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8")
  const mine = ["progress.ts", "progress-scan.ts", "progress-view.ts", "progress-sidebar.tsx"]
  cell("AC-11 ж the four modules of the panel contain no write call (the same pattern finds the writes of status.ts)", mine.every((f) => !WRITE.test(src(f))) && WRITE.test(src("status.ts")), show(mine.filter((f) => WRITE.test(src(f)))))
  const runForm = /^(\S+) (\d+)\/(\d+) (.*)$/ // the form "<code> <k>/<N> <signature>" of the runner (task-runner.md, machine formats)
  const samples = ["КОММИТ 0/0 старт", "С1 0/0 [10:05] запуск", "С5 13/14 [10:05] стоп: ворота — ждёт слова владельца", "С5 14/14 готово — итог"]
  const same = samples.every((s) => {
    const a = runForm.exec(s)
    const b = P.parseLine(s)
    return !!a && !!b && a[1] === b.code && Number(a[2]) === b.k && Number(a[3]) === b.n && a[4] === b.sig
  })
  cell("DNC-03 the launch, start, stop and done lines are read by the runner's form <code> <k>/<N> <signature> as by the panel", same, "")
}

// ==== END OF CELLS ====
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-progress.test: FAIL ${fail}` : "crew-progress.test ok")
process.exit(fail ? 1 : 0)

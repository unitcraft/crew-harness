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

// ==== END OF CELLS ====
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-progress.test: FAIL ${fail}` : "crew-progress.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the task journal tools (node >= 24):  node test/crew-journal.test.mjs
// progress_line appends ONE line '<code> k/N [YYYY-MM-DD HH:MM] <text>' with the machine date and time to a file named progress.log inside the
// project folder; usage_line appends ONE JSON line (format version v:1) with the accounting of the session to usage.log next to
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
const { progressLine, usageLine, noteLoopLag, maxLoopLagSince, resetLoopLagForTest } = await import("../journal.ts")

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
const HISTORY = "С5д 3/13 [02:04] историческая строка\n"
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
  cell("progress: appends one line with the given date and time", r.ok && r.line === "С5д 4/13 [2026-10-09 03:07] ворота merge: замок только на проверенную вершину", JSON.stringify(r))
  const txt = read(log)
  cell("progress: history is kept, one new line only", txt.startsWith(HISTORY) && txt.split("\n").length === 3 && txt.endsWith("\n"), JSON.stringify(txt))

  const before = new Date()
  const r2 = progressLine({ file: log, code: "С5д", unit: "?/?", text: "реальное время" }, base)
  const after = new Date()
  const stamp = /\[(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)\]/.exec(r2.line ?? "")
  const got = stamp ? new Date(Number(stamp[1]), Number(stamp[2]) - 1, Number(stamp[3]), Number(stamp[4]), Number(stamp[5])).getTime() : -1
  const floor = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime()
  cell("progress: real machine date and time (absolute path inside the project)", r2.ok && got >= floor(before) && got <= floor(after), JSON.stringify([r2, got]))

  const bad = (name, input) => {
    const snapshot = read(log)
    const x = progressLine(input, base, at(3, 8))
    cell(`progress refused: ${name}`, x.ok === false && read(log) === snapshot, JSON.stringify(x))
  }
  bad("other file name", { file: "doc/tasks/007-x/result.md", code: "С5д", unit: "5/13", text: "x" })
  bad("file outside the project folder", { file: "../outside/progress.log", code: "С5д", unit: "5/13", text: "x" })
  bad("absolute path outside", { file: path.join(tmp, "other", "progress.log"), code: "С5д", unit: "5/13", text: "x" })
  bad("multi-line text", { file: rel, code: "С5д", unit: "5/13", text: "раз\nдва" })
  bad("control characters", { file: rel, code: "С5д", unit: "5/13", text: "раз\u0007два" })
  bad("long text", { file: rel, code: "С5д", unit: "5/13", text: "я".repeat(121) })
  bad("empty text", { file: rel, code: "С5д", unit: "5/13", text: "  " })
  bad("code with spaces", { file: rel, code: "С5 д", unit: "5/13", text: "x" })
  bad("unit not k/N", { file: rel, code: "С5д", unit: "пять", text: "x" })
  bad("missing file is not created", { file: "doc/tasks/008-y/progress.log", code: "С5д", unit: "1/2", text: "x" })
  cell("progress: missing file not created on disk", !exists(path.join(base, "doc/tasks/008-y/progress.log")), "created")

  const ro = path.join(dir, "ro", "progress.log")
  mkdirSync(path.dirname(ro), { recursive: true })
  writeFileSync(ro, "С1 0/0 [01:00] запуск\n")
  chmodSync(ro, 0o444)
  const snap = read(ro)
  const denied = progressLine({ file: ro, code: "С1", unit: "1/2", text: "x" }, base, at(3, 9))
  cell("progress: file access denial is respected", denied.ok === false && /отказал|EPERM|EACCES/.test(denied.reason) && read(ro) === snap, JSON.stringify(denied))
  chmodSync(ro, 0o644)
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
  cell("setup registers progress_line and usage_line", !!tools.progress_line && !!tools.usage_line, JSON.stringify(names))
  const out = await tools.progress_line.execute({ file: rel, code: "С5д", unit: "6/13", text: "через инструмент" }, { sessionID: "ses_t" })
  cell("progress tool writes and answers", /Записано: С5д 6\/13 \[\d{4}-\d\d-\d\d \d\d:\d\d\] через инструмент/.test(out.content) && read(log).includes("] через инструмент"), JSON.stringify(out))
  const no = await tools.progress_line.execute({ file: "doc/tasks/007-x/result.md", code: "С5д", unit: "6/13", text: "x" }, {})
  cell("progress tool refuses a wrong file", /^Не записано/.test(no.content), JSON.stringify(no))
  const u = await tools.usage_line.execute({ file: urel, code: "С5д", result: "через инструмент" }, { sessionID: "ses_t" })
  const last = JSON.parse(read(ulog).trim().split("\n").pop())
  cell("usage tool reads the session card of the calling session", /^Записано/.test(u.content) && calls.get.includes("ses_t") && last.session === "ses_t" && last.model === "anthropic/claude-sonnet-5-5" && last.tokens.cache_write === 400, JSON.stringify([u, last]))
  const un = await tools.usage_line.execute({ file: "doc/tasks/007-x/progress.log", code: "С5д", result: "x" }, { sessionID: "ses_t" })
  cell("usage tool refuses a wrong file", /^Не записано/.test(un.content), JSON.stringify(un))
  stop?.()
}

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-journal.test: FAIL ${fail}` : "crew-journal.test ok")
process.exit(fail ? 1 : 0)

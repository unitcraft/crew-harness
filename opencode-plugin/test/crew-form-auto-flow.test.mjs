// Flow test of the automatic answer to the forms of the built-in questionnaire, task 096 (node >= 24):  node test/crew-form-auto-flow.test.mjs
// The real plugin against a fake OpenCode host (as crew-owner-answer): the project has `answer_mode: {default: recommendations}` and
// `answer_delay_sec: 2` in the `local` block of the options. A form with one "(Recommended)" first option is closed by the plugin itself
// after the delay (interrupt of the turn, a service letter "not the owner's word", a file in answers/ with the source plugin, an event of the
// task, a log line); the owner's reply before the deadline wins; forms of the closed list, without a mark, and of a project without the key
// are left to the owner as before; the settings file is never written by the plugin; /crew and the doctor show the counters and reasons.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-form-auto-flow-"))
process.env.XDG_DATA_HOME = tmp
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FORM_MS = "100"
process.env.CREW_HARNESS_FORM_GONE_MS = "300"
process.env.CREW_HARNESS_FORM_REPEAT_GAP_MS = "300"
process.env.CREW_HARNESS_FORM_RESTART_GRACE_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
const plain = path.join(tmp, "plain")
for (const d of [proj, plain]) {
  mkdirSync(path.join(d, ".opencode"), { recursive: true })
  writeFileSync(path.join(d, ".opencode", "crew-harness.json"), JSON.stringify({}))
}
const settingsFile = path.join(proj, ".opencode", "crew-harness.json")
const settingsBefore = readFileSync(settingsFile, "utf8")
const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
const A = "sesAUTO_A", C = "sesAUTO_C", R = "sesAUTO_R", W = "sesAUTO_W", P = "sesPLAIN_P", L = "sesAUTO_L"
const dirOf = { [P]: plain }
for (const id of [A, C, R, W, P, L]) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(id, dirOf[id] ?? proj, id)

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const fw = await import("../form-wait.ts")
const status = await import("../status.ts")
const oa = await import("../owner-answer.ts")
const ans = await import("../answer.ts")
let fa
try {
  fa = await import("../form-auto.ts")
} catch (e) {
  console.log(`FAIL form-auto.ts is missing :: ${e}`)
  process.exit(1)
}
for (const id of [A, C, R, W, L]) core.saveCard({ session: id, role: "worker", auto: false, title: id, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
core.saveCard({ session: P, role: "worker", auto: false, title: P, directory: plain, repo: "plain", project: "plain", pid: process.pid, updated: Date.now() })
const task = tasks.createTask({ project: "proj", title: "auto work", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: "sesAUTHOR", author_role: "proj.integrator", qid: "q-auto", status: "running", kind: "assign", directory: proj, executor: A })
core.saveCard({ ...core.readJson(core.cardFile(A)), task: { project: "proj", n: task.n } })
const form = (id, s, question, options) => ({ type: "form.created", data: { form: { id, sessionID: s, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: question, options: options.map((label) => ({ label })) }] } } })
mkdirSync(core.WINDOWS, { recursive: true })
const WPID = 585858
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [A, C, R, W, P, L].map((sessionID) => ({ sessionID, active: true, busy: true })) }))
beat()
const heart = setInterval(beat, 300)

const calls = []
const ctx = {
  location: { directory: proj },
  options: {
    projects: { proj, plain },
    local: { proj: { answer_mode: { default: "recommendations" }, answer_delay_sec: 2, answer_max: 3 } },
  },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: sessionID === P ? plain : proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    hook: async () => {},
    interrupt: async (input) => {
      calls.push(input)
      return { interrupted: true }
    },
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
}
const logPath = path.join(os.tmpdir(), "opencode-plugins.log")
const logText = () => {
  try {
    return readFileSync(logPath, "utf8")
  } catch {
    return ""
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 15_000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await cond()) return true
    await wait(100)
  }
  return !!(await cond())
}
const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map((n) => path.join(dir, String(n))).filter((f) => f.endsWith(".json")) : [])
const lettersTo = (id) => [...filesIn(path.join(core.INBOX, core.safeKey(id))), ...filesIn(path.join(core.READ, core.safeKey(id)))].map((f) => readFileSync(f, "utf8"))
const autoFile = (id) => core.readJson(path.join(oa.ANSWERS, `auto-${core.safeKey(id)}.json`))
const tools = {}

const mod = await import("../index.ts")
const stop = await mod.default.setup(ctx)
const t0 = Date.now()
fw.handleFormEvent(form("frm_A", A, "Какой формат отчёта?", ["Короткий (Recommended)", "Длинный"]))
fw.handleFormEvent(form("frm_W", W, "Какой формат отчёта?", ["Короткий (Recommended)", "Длинный"]))
fw.handleFormEvent(form("frm_C", C, "Вливать в main?", ["Да (Recommended)", "Нет"]))
fw.handleFormEvent(form("frm_R", R, "Какой формат отчёта?", ["Короткий", "Длинный"]))
fw.handleFormEvent(form("frm_P", P, "Какой формат отчёта?", ["Короткий (Recommended)", "Длинный"]))
await wait(900)
cell("delay: nothing is answered before answer_delay_sec", calls.length === 0 && !autoFile("frm_A") && Date.now() - t0 < 1_900, JSON.stringify([calls, autoFile("frm_A")]))
// the owner replies in the window to W before the deadline
fw.handleFormEvent({ type: "form.replied", data: { id: "frm_W", sessionID: W } })
const got = await until(() => autoFile("frm_A")?.status === "applied")
cell("answered: the form with one first (Recommended) is closed after the delay", got && Date.now() - t0 >= 1_900, JSON.stringify(autoFile("frm_A")))
const af = autoFile("frm_A")
cell("answered: the file in answers/ names the source, the mode, the option and the answer", af?.source === "plugin" && af.mode === "recommendations" && af.type === "default" && af.answer === "Короткий (Recommended)" && af.option === "1" && af.project === "proj", JSON.stringify(af))
cell("answered: the turn was interrupted once with resume", calls.filter((c) => c.sessionID === A).length === 1 && calls.find((c) => c.sessionID === A)?.resume === true, JSON.stringify(calls))
cell("answered: the record of the form is gone (answered, not lost)", fw.pendingForms(A).length === 0, JSON.stringify(fw.pendingForms(A)))
const la = lettersTo(A).filter((t) => /answer_mode/.test(t))
cell("answered: the tab got ONE service letter 'not the owner's word' with the question and the option", la.length === 1 && /не слово владельца/.test(la[0]) && /Какой формат отчёта\?/.test(la[0]) && /Короткий/.test(la[0]) && !/по слову владельца/.test(la[0]), lettersTo(A).join(" | ").slice(0, 500))
const hist = tasks.loadTask("proj", task.n)?.history ?? []
cell("answered: the task history has the event with the source and the answer id", hist.some((h) => /answer_mode/.test(h.note ?? "") && /Короткий/.test(h.note ?? "") && /\[answer auto-frm_A\]/.test(h.note ?? "")), JSON.stringify(hist.map((h) => h.note)))
cell("answered: the log line", /owner answer auto-frm_A applied: form frm_A of sesAUTO_A/.test(logText()), logText().split("\n").filter((l) => /auto-frm_A/.test(l)).join(" | "))
cell("answered: no repeat of task 040 (no 'не получил ответа' wake)", !lettersTo(A).some((t) => /не получил ответа/.test(t)), "")

// the owner was first
await wait(1500)
cell("owner first: a form the owner replied to before the deadline gets nothing", !autoFile("frm_W") && calls.every((c) => c.sessionID !== W) && !lettersTo(W).some((t) => /answer_mode/.test(t)), JSON.stringify([autoFile("frm_W"), calls]))
// the closed list, no mark, another project
cell("closed list: «Вливать в main?» stays with the owner (the form is open, no interrupt, no letter)", !autoFile("frm_C") && fw.pendingForms(C).length === 1 && calls.every((c) => c.sessionID !== C) && !lettersTo(C).some((t) => /answer_mode/.test(t)), JSON.stringify([autoFile("frm_C"), calls]))
cell("no mark: stays with the owner", !autoFile("frm_R") && fw.pendingForms(R).length === 1 && calls.every((c) => c.sessionID !== R), "")
cell("a project without the key: as before (no answer, no marker)", !autoFile("frm_P") && fw.pendingForms(P).length === 1 && calls.every((c) => c.sessionID !== P) && !existsSync(path.join(fw.FORMS, "auto", "frm_P.json")), JSON.stringify(calls))

// the counters
const now = Date.now()
const stats = fa.autoStats("proj", now)
cell("stats: one answered, the owner got the closed list and the form without a mark", stats.answered === 1 && stats.held.closed === 1 && stats.held.norec === 1 && stats.heldTotal === 2 && stats.last > 0, JSON.stringify(stats))
const card = core.readJson(core.cardFile(A))
const stA = status.statusOf({ card, busy: false, end: undefined, asked: [], now, watches: [] })
const crew = status.formatStatuses([stA], now, "proj")
cell("/crew: the counters of the form answers and of the forms left to the owner, with the reasons", /form answers 1/.test(crew) && /form to you 2/.test(crew) && /closed 1/.test(crew) && /no rec 1/.test(crew), crew)
cell("/crew: the side panel row counts the form answers and the forms left to the owner", /авто 24ч: 1/.test(ans.answerSideRow("proj", now)?.what ?? "") && /вам: 2/.test(ans.answerSideRow("proj", now)?.what ?? ""), JSON.stringify(ans.answerSideRow("proj", now)))
const notes = fa.autoNotes(now)
cell("doctor: a note with the 24 h count, the last closing and the reasons", notes.some((l) => /автоответ/i.test(l) && /1/.test(l)) && notes.some((l) => /закрыт/.test(l) && /нет рекомендации/.test(l)), JSON.stringify(notes))
const doctor = await tools.crew_doctor.execute({}, { sessionID: A }).then((r) => r.content ?? r).catch((e) => String(e))
cell("crew_doctor: the note of the form answers is in the tail", /автоответ/i.test(String(doctor)) && /нет рекомендации/.test(String(doctor)), String(doctor).slice(-600))
cell("the settings file was not written by the plugin", readFileSync(settingsFile, "utf8") === settingsBefore, readFileSync(settingsFile, "utf8"))

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-form-auto-flow.test: FAIL ${fail}` : "crew-form-auto-flow.test ok")
process.exit(fail ? 1 : 0)

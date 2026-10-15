// Self-test of the owner answer to a question form from outside the window, task 059 (node >= 24):  node test/crew-owner-answer.test.mjs
// OpenCode gives the plugin no form.reply, so the answer file (scripts/crew-answer.mjs) is applied by an interrupt of the turn
// (ctx.session.interrupt) and a letter with the answer. Checked: the answer is applied (interrupt, record gone as answered, letter,
// task history, log, status in the file); a wrong form is refused with the reason; a repeat is not applied twice; a failed
// interrupt keeps the question open; the pure resolveAnswer.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-owner-answer-"))
process.env.XDG_DATA_HOME = tmp
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
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))
const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
const A = "sesASK_A", N = "sesNOSTOP_N"
for (const id of [A, N]) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(id, proj, id)

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const fw = await import("../form-wait.ts")
let oa
try {
  oa = await import("../owner-answer.ts")
} catch (e) {
  console.log(`FAIL owner-answer.ts is missing :: ${e}`)
  process.exit(1)
}
for (const id of [A, N]) core.saveCard({ session: id, role: "worker", auto: false, title: id, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
const task = tasks.createTask({ project: "proj", title: "ask work", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: "sesAUTHOR", author_role: "proj.integrator", qid: "q-ask", status: "running", kind: "assign", directory: proj, executor: A })
core.saveCard({ ...core.readJson(core.cardFile(A)), task: { project: "proj", n: task.n } })
const form = (id, s) => ({ type: "form.created", data: { form: { id, sessionID: s, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Вливать в main?", options: [{ label: "Да (Recommended)" }, { label: "Нет" }] }] } } })
fw.handleFormEvent(form("frm_A", A))
fw.handleFormEvent(form("frm_N", N))
mkdirSync(core.WINDOWS, { recursive: true })
const WPID = 595959
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [A, N].map((sessionID) => ({ sessionID, active: true, busy: true })) }))
beat()
const heart = setInterval(beat, 300)

const calls = []
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    hook: async () => {},
    interrupt: async (input) => {
      calls.push(input)
      // the interrupt cancels the form, as the window would
      fw.handleFormEvent({ type: "form.cancelled", data: { id: input.sessionID === A ? "frm_A" : "frm_N", sessionID: input.sessionID } })
      return { interrupted: input.sessionID === A }
    },
  },
  tool: { transform: async () => {} },
}
const logPath = path.join(os.tmpdir(), "opencode-plugins.log")
const logText = () => {
  try {
    return readFileSync(logPath, "utf8")
  } catch {
    return ""
  }
}
const mark = logText().length
const fresh = () => logText().slice(mark)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map((n) => path.join(dir, String(n))).filter((f) => f.endsWith(".json")) : [])
const lettersTo = (id) => [...filesIn(path.join(core.INBOX, core.safeKey(id))), ...filesIn(path.join(core.READ, core.safeKey(id)))].map((f) => readFileSync(f, "utf8"))
const put = (name, a) => (mkdirSync(oa.ANSWERS, { recursive: true }), writeFileSync(path.join(oa.ANSWERS, `${name}.json`), JSON.stringify({ id: name, at: Date.now(), ...a })))
const got = (name) => core.readJson(path.join(oa.ANSWERS, `${name}.json`))

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

// pure: the choice of the form and the answer
const forms = [{ session: A, form: { id: "f1", at: 1, question: "q", options: ["Да (Recommended)", "Нет"] } }]
cell("resolve: option by number", oa.resolveAnswer({ id: "x", at: 1, form: "f1", option: "2", quote: "нет" }, forms, []).answer === "Нет", "")
cell("resolve: option by label, (Recommended) ignored", oa.resolveAnswer({ id: "x", at: 1, session: A, option: "да", quote: "да" }, forms, []).answer === "Да (Recommended)", "")
cell("resolve: no quote is refused", /quote/.test(oa.resolveAnswer({ id: "x", at: 1, form: "f1", option: "1", quote: "" }, forms, []).why ?? ""), "")
cell("resolve: unknown option is refused with the options", /no option "3".*1\. Да/.test(oa.resolveAnswer({ id: "x", at: 1, form: "f1", option: "3", quote: "q" }, forms, []).why ?? ""), "")

const mod = await import("../index.ts")
const stop = await mod.default.setup(ctx)
put("a1", { form: "frm_A", session: A, option: "1", quote: "да, вливай" })
put("bad", { form: "frm_NOPE", option: "1", quote: "да" })
await wait(2500)
const a1 = got("a1")
cell("applied: the file says applied with the answer", a1?.status === "applied" && a1.answer === "Да (Recommended)", JSON.stringify(a1))
cell("applied: the turn was interrupted with resume", calls.filter((c) => c.sessionID === A).length === 1 && calls[0].resume === true, JSON.stringify(calls))
cell("applied: the record of the form is gone (answered, not lost)", fw.pendingForms(A).length === 0, JSON.stringify(fw.pendingForms(A)))
const la = lettersTo(A).filter((t) => /Ответ владельца на ваш вопрос/.test(t))
cell("applied: the tab got the letter with the answer and the quote", la.length === 1 && /Вливать в main\?/.test(la[0]) && /Да \(Recommended\)/.test(la[0]) && /да, вливай/.test(la[0]), lettersTo(A).join(" | ").slice(0, 400))
cell("applied: no repeat of task 040 (no 'не получил ответа' wake)", !lettersTo(A).some((t) => /не получил ответа/.test(t)), lettersTo(A).join(" | ").slice(0, 400))
const hist = tasks.loadTask("proj", task.n)?.history ?? []
cell("applied: the task history has the event", hist.some((h) => /ответ владельца через оркестратора.*Да \(Recommended\).*да, вливай/.test(h.note ?? "")), JSON.stringify(hist))
cell("applied: the log line", /owner answer a1 applied: form frm_A of sesASK_A/.test(fresh()), fresh().split("\n").filter((l) => /owner answer/.test(l)).join(" | "))
const bad = got("bad")
cell("wrong form: refused with the reason in the file and the log", bad?.status === "refused" && /no open question form/.test(bad.why) && /owner answer bad not applied: no open question form/.test(fresh()), JSON.stringify(bad))

// a repeat of the same answer: not applied twice
put("a2", { form: "frm_A", session: A, option: "1", quote: "да, вливай" })
// a failed interrupt: the question stays open
put("n1", { form: "frm_N", session: N, option: "Нет", quote: "нет" })
await wait(1500)
const a2 = got("a2")
cell("repeat: refused as already answered, no second interrupt", a2?.status === "refused" && /already answered \(answer a1\)/.test(a2.why) && calls.filter((c) => c.sessionID === A).length === 1, JSON.stringify(a2))
const n1 = got("n1")
cell("failed interrupt: refused, the question stays open, no letter", n1?.status === "refused" && /not interrupted: interrupted=false/.test(n1.why) && fw.pendingForms(N).length === 1 && !lettersTo(N).some((t) => /Ответ владельца/.test(t)), JSON.stringify(n1))

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-owner-answer.test: FAIL ${fail}` : "crew-owner-answer.test ok")
process.exit(fail ? 1 : 0)

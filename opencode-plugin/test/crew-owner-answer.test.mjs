// Self-test of the owner answer to a question form from outside the window, tasks 059 and 263 (node >= 24):  node test/crew-owner-answer.test.mjs
// Task 263: the answer file (scripts/crew-answer.mjs) settles the waiting `question` call by the service reply
// (POST /api/session/{sid}/form/{fid}/reply, form-reply.ts) - no interrupt, no detour letter, the model gets the answer
// as the tool result. The service guarantees one answer (a repeat is 409), so finishing after a restart is the same call.
// Checked: applied by the reply (record gone, no interrupt, no letter, task history, log); a wrong form is refused;
// a repeat is not applied twice; a failed reply keeps the question open; 409 refuses the proposed answer and cleans up;
// an "applying" record is finished after a restart by the same reply; a multi-question form is refused to the window;
// the pure resolveAnswer.
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-owner-answer-"))
process.env.XDG_DATA_HOME = tmp
process.env.XDG_STATE_HOME = tmp // service.json of the fake OpenCode service lives here (form-reply.ts)
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp // the plugin log lives in os.tmpdir(): a log of its own per run, not the one other parallel runs write (task 085)
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
const A = "sesASK_A", N = "sesNOSTOP_N", R = "sesSETTLED_R", S = "sesRESTART_S", M = "sesMULTI_M"
for (const id of [A, N, R, S, M]) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(id, proj, id)

// the fake OpenCode service: the reply endpoint of form-reply.ts. frm_N fails (HTTP 500), frm_R is already settled (409).
const replies = []
const srv = createServer((req, res) => {
  let body = ""
  req.on("data", (c) => (body += c))
  req.on("end", () => {
    const m = /^\/api\/session\/([^/]+)\/form\/([^/]+)\/reply$/.exec(req.url ?? "")
    if (!m) {
      res.writeHead(404)
      res.end()
      return
    }
    const [, sid, fid] = m
    replies.push({ sid, fid, body: JSON.parse(body || "{}") })
    if (fid === "frm_N") {
      res.writeHead(500)
      res.end("boom")
      return
    }
    if (fid === "frm_R") {
      res.writeHead(409)
      res.end("FormAlreadySettledError")
      return
    }
    res.writeHead(204)
    res.end()
  })
})
await new Promise((r) => srv.listen(0, "127.0.0.1", r))
mkdirSync(path.join(tmp, "opencode"), { recursive: true })
writeFileSync(path.join(tmp, "opencode", "service.json"), JSON.stringify({ url: `http://127.0.0.1:${srv.address().port}`, password: "pw" }))

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
for (const id of [A, N, R, S, M]) core.saveCard({ session: id, role: "worker", auto: false, title: id, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
const task = tasks.createTask({ project: "proj", title: "ask work", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: "sesAUTHOR", author_role: "proj.integrator", qid: "q-ask", status: "running", kind: "assign", directory: proj, executor: A })
core.saveCard({ ...core.readJson(core.cardFile(A)), task: { project: "proj", n: task.n } })
const form = (id, s, extraFields = []) => ({ type: "form.created", data: { form: { id, sessionID: s, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Вливать в main?", options: [{ label: "Да (Recommended)" }, { label: "Нет" }] }, ...extraFields] } } })
fw.handleFormEvent(form("frm_A", A))
fw.handleFormEvent(form("frm_N", N))
fw.handleFormEvent(form("frm_R", R))
fw.handleFormEvent(form("frm_M", M, [{ key: "q1", description: "Комментарий?", options: [{ label: "x" }] }]))
mkdirSync(core.WINDOWS, { recursive: true })
const WPID = 595959
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [A, N, R, S, M].map((sessionID) => ({ sessionID, active: true, busy: true })) }))
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
// a multi-question form is refused to the window (the reply path answers one field)
put("m1", { form: "frm_M", session: M, option: "1", quote: "да" })
// a record taken before a restart is finished by the same reply (the service guarantees one answer)
put("r2", { status: "applying", form: "frm_S", session: S, answer: "Нет", snap: { id: "frm_S", at: Date.now(), question: "Вливать в main?", options: ["Да (Recommended)", "Нет"], session: S }, quote: "нет" })
await wait(2500)
const a1 = got("a1")
cell("applied: the file says applied with the answer", a1?.status === "applied" && a1.answer === "Да (Recommended)", JSON.stringify(a1))
const ra = replies.filter((r) => r.sid === A)
cell("applied: the service got the reply for the waiting form (q0), no interrupt of the turn", ra.length === 1 && ra[0].fid === "frm_A" && ra[0].body?.answer?.q0 === "Да (Recommended)" && calls.filter((c) => c.sessionID === A).length === 0, JSON.stringify([replies, calls]))
cell("applied: the record of the form is gone (answered, not lost)", fw.pendingForms(A).length === 0, JSON.stringify(fw.pendingForms(A)))
cell("applied: no detour letter (the model gets the answer as the tool result)", !lettersTo(A).some((t) => /Ответ владельца на ваш вопрос/.test(t)), lettersTo(A).join(" | ").slice(0, 400))
cell("applied: no repeat of task 040 (no 'не получил ответа' wake)", !lettersTo(A).some((t) => /не получил ответа/.test(t)), lettersTo(A).join(" | ").slice(0, 400))
const hist = tasks.loadTask("proj", task.n)?.history ?? []
cell("applied: the task history has the event", hist.some((h) => /ответ владельца через оркестратора.*Да \(Recommended\).*да, вливай/.test(h.note ?? "")), JSON.stringify(hist))
cell("applied: the log line", /owner answer a1 applied: form frm_A of sesASK_A settled by the service reply/.test(fresh()), fresh().split("\n").filter((l) => /owner answer/.test(l)).join(" | "))
const bad = got("bad")
cell("wrong form: refused with the reason in the file and the log", bad?.status === "refused" && /no open question form/.test(bad.why) && /owner answer bad not applied: no open question form/.test(fresh()), JSON.stringify(bad))
const m1 = got("m1")
cell("multi-question: refused to the window, the form stays open, no reply", m1?.status === "refused" && /форма с 2 вопросами/.test(m1.why) && fw.pendingForms(M).length === 1 && !replies.some((r) => r.fid === "frm_M"), JSON.stringify(m1))
const r2 = got("r2")
cell("restart: the taken record is finished by the same reply", r2?.status === "applied" && replies.filter((r) => r.fid === "frm_S").length === 1 && replies.find((r) => r.fid === "frm_S")?.body?.answer?.q0 === "Нет", JSON.stringify([r2, replies]))

// a repeat of the same answer: not applied twice
put("a2", { form: "frm_A", session: A, option: "1", quote: "да, вливай" })
// a form already settled: 409 cannot prove which answer won, so refuse the proposal and clean up
put("r1", { form: "frm_R", session: R, option: "1", quote: "да" })
// a failed reply: the question stays open
put("n1", { form: "frm_N", session: N, option: "Нет", quote: "нет" })
await wait(1500)
const a2 = got("a2")
cell("repeat: refused as already answered, no second reply", a2?.status === "refused" && /already answered \(answer a1\)/.test(a2.why) && replies.filter((r) => r.sid === A).length === 1, JSON.stringify(a2))
const r1 = got("r1")
cell("settled (409): refused, no invented applied decision, the record is gone", r1?.status === "refused" && /already answered/.test(r1.why ?? "") && fw.pendingForms(R).length === 0, JSON.stringify(r1))
cell("settled (409): no history claims the proposed answer was applied", !(tasks.loadTask("proj", task.n)?.history ?? []).some((h) => /answer r1|owner-answer-r1/.test(h.note ?? "")), JSON.stringify(tasks.loadTask("proj", task.n)?.history))
const n1 = got("n1")
cell("failed reply: unknown outcome, the question stays open, no letter", n1?.status === "unknown" && /HTTP 500/.test(n1.why) && fw.pendingForms(N).length === 1 && !lettersTo(N).some((t) => /Ответ владельца/.test(t)), JSON.stringify(n1))
const attempts = replies.filter((r) => r.sid === N).length
await wait(500)
cell("unknown outcome: no automatic retry or new command", replies.filter((r) => r.sid === N).length === attempts && !calls.some((c) => c.sessionID === N), JSON.stringify(replies))

clearInterval(heart)
srv.close()
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-owner-answer.test: FAIL ${fail}` : "crew-owner-answer.test ok")
process.exit(fail ? 1 : 0)

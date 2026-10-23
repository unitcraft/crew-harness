// Self-test of task 161 in the plugin: the watch of idle tasks at work (node >= 24):  node test/crew-idle-watch-flow.test.mjs
// F-1 the case of task 092 through the plugin: a task that «goes» (running), the window of the author busy with other work, the step
// did not change for two hours -> a letter that asks for an answer by crew_step_note, then (no answer) the question to the owner, and the
// task is marked in /crew, the side panel and crew_doctor. F-2 the exceptions in the plugin (a window at work on its task, an open
// watch with a ceiling, an open question to the owner, a HOLD by the word of the owner). F-3 the answer by the tool extends the term once
// and is recorded; the second letter; the question. F-4 a restart of the plugin repeats nothing. F-5 the decision of the owner closes the
// question and no new one is asked inside the new term. F-6 the tool is registered and named in crew_help.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-idle-watch-flow-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FORM_MS = "100"
process.env.CREW_HARNESS_STEP_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
// term 3 s, an answer is awaited 3 s, an answer extends by 6 s
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ project: "proj", allow_default_models: true, step_term_minutes: 0.05, step_answer_minutes: 0.05, step_extend_minutes: 0.1, idle_tab_minutes: 0 }))

let fail = 0
const cell = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const J = (v) => JSON.stringify(v)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 20_000) => {
  for (const end = Date.now() + ms; !(await cond()) && Date.now() < end; ) await wait(100)
}
const tryImport = (p) => import(p).catch((e) => (console.log(`import ${p}: ${String(e).split("\n")[0]}`), null))

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const status = await import("../status.ts")
const fw = await import("../form-wait.ts")
const watch = await import("../watch.ts")
const iw = await tryImport("../idle-watch.ts")
const mod = await import("../index.ts")

const HOUR = 3_600_000
const T0 = Date.now() - 2 * HOUR
const hooks = {}
const tools = {}
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    create: async (r) => ({ id: r.id }),
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (f) => f({ add: (t) => (tools[t.name] = t) }) },
  command: { list: async () => [], transform: async (f) => f({ add: () => {} }) },
  events: { on: async () => {} },
}
let stop = await mod.default.setup(ctx)
const SES = { sesAUTH: "integrator", sesEXEC: "worker", sesEXEC2: "worker", sesEXEC3: "worker", sesEXEC4: "worker", sesEXEC5: "worker" }
for (const [s, role] of Object.entries(SES)) await tools.crew_role.execute({ role }, { sessionID: s })
const P = core.readJson(core.cardFile("sesAUTH"))?.project ?? "proj"
const mkTask = (n, st, extra = {}) => ({
  project: P, n, title: `задача ${n}`, slug: `t${n}`, goal: "цель", priority: "P2", tier: "medium", role: "worker", author: "sesAUTH", author_role: "integrator",
  qid: `q${n}`, status: st, kind: "assign", executors: [], attempt: 1, directory: proj, history: [{ at: T0, by: "sesAUTH", status: st, note: "поставлена" }], created: T0, updated: Date.now(), ...extra,
})
const putTask = (t) => {
  mkdirSync(path.dirname(tasks.taskFile(P, t.n)), { recursive: true })
  writeFileSync(tasks.taskFile(P, t.n), JSON.stringify(t, null, 1))
}
const lettersOf = (s) => {
  const out = []
  for (const base of [core.INBOX, core.READ]) {
    const d = path.join(base, core.safeKey(s))
    try {
      for (const f of readdirSync(d)) if (f.endsWith(".json")) out.push(core.readJson(path.join(d, f)))
    } catch {}
  }
  return out.filter((l) => l && /^idle-step-/.test(l.id))
}
const rec = (n) => iw?.readRecord?.(P, n)

// the window of the author works on other tasks (busy); an executor works on its own task (busy)
for (const s of ["sesAUTH", "sesEXEC"]) core.saveCard({ ...core.readJson(core.cardFile(s)), busy: true, busySince: Date.now() })
// 92: goes, no executor (the author holds the step), the step did not change for two hours, `updated` is fresh (the noise of the plugin)
putTask(mkTask(92, "running", { title: "Carina target_os cross-emit", history: [{ at: T0, by: "sesAUTH", status: "running", note: "поставлена" }, { at: Date.now() - 60_000, by: core.PLUGIN_SENDER, note: "приёмка застряла: 3 хода подряд остановилась без работы и без ответа" }] }))
// 93: an executor at work on it (a turn goes); 94: an open watch with a ceiling; 95: HOLD (set below); 96: an open question to the owner
putTask(mkTask(93, "running", { executor: "sesEXEC" }))
putTask(mkTask(94, "running", { executor: "sesEXEC2" }))
putTask(mkTask(95, "running", { executor: "sesEXEC3" }))
putTask(mkTask(96, "running", { executor: "sesEXEC4" }))
// 98: the control - an executor that is not at work (its card is not busy): the letter goes to the EXECUTOR
putTask(mkTask(98, "running", { executor: "sesEXEC5" }))
mkdirSync(watch.WATCHES, { recursive: true })
writeFileSync(path.join(watch.WATCHES, "w161.json"), JSON.stringify({ id: "w161", session: "sesEXEC2", command: "x", cwd: proj, note: "CI", minutes: 120, created: Date.now(), status: "running", pid: process.pid, started: Date.now() }))
fw.handleFormEvent({ type: "form.created", data: { form: { id: "frm_161", sessionID: "sesEXEC4", title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Как быть?", options: [{ label: "Да (Recommended)" }, { label: "Нет" }] }] } } })
const hold = await tools.crew_step_note?.execute({ n: 95, hold: "HOLD", who: "владелец, 2026-10-24, «пока не трогать»" }, { sessionID: "sesAUTH" })

// ---- F-1 the case of 092
await until(() => lettersOf("sesAUTH").some((l) => /^Шаг стоит/.test(l.text) && /092/.test(l.text) && !/вопрос владельцу по/i.test(l.text)))
const l1 = lettersOf("sesAUTH").filter((l) => /092/.test(l.text) && /^Шаг стоит/.test(l.text) && /crew_step_note/.test(l.text) && !/decide/.test(l.text))
cell("F-1a 092 (running, the window of the author busy elsewhere, the step stands two hours): a letter that asks for an answer by crew_step_note", l1.length >= 1 && /reason/.test(l1[0].text), J(lettersOf("sesAUTH").map((l) => l.text.slice(0, 80))))
await until(() => !!rec(92)?.ep?.question)
const r92 = rec(92)
cell("F-1b no answer: the question to the owner is open, with the four options and a recommendation", !!r92?.ep?.question && r92.ep.question.options?.length === 4 && !!r92.ep.question.recommend, J(r92?.ep?.question))
const lq = lettersOf("sesAUTH").filter((l) => /092/.test(l.text) && /question/.test(l.text) && /decide/.test(l.text))
cell("F-1c the author (the orchestrator) gets the text of the question with the way to write the decision down", lq.length === 1 && /Ждать ещё/.test(lq[0].text), J(lq.map((l) => l.text)))
cell("F-1d not more than two letters that ask, one letter with the question", lettersOf("sesAUTH").filter((l) => /092/.test(l.text) && !/decide/.test(l.text)).length <= 2, J(lettersOf("sesAUTH").map((l) => l.id)))
await wait(1500)
// the status of the plugin is the same data the panels read
const list = status.readStatuses()
const crewText = status.formatStatuses(list, Date.now(), P)
cell("F-1e /crew: the task is marked «срок вышел, вопрос открыт»", /092/.test(crewText) && /срок вышел, вопрос открыт/.test(crewText), crewText)
const side = status.sidebarLines(list, Date.now(), P)
cell("F-1f the side panel: a short row of the task with the expired term", side.rows.some((r) => /092/.test(r.what) && /срок/.test(r.what)), J(side.rows.map((r) => r.what)))
const doc = (await tools.crew_doctor.execute({}, { sessionID: "sesAUTH" })).content
cell("F-1g crew_doctor names the task, «срок вышел, вопрос открыт» and what to do", /092/.test(doc) && /срок вышел, вопрос открыт/.test(doc) && /crew_step_note/.test(doc), doc)

// ---- F-2 the exceptions in the plugin
cell("F-2a HOLD is recorded by the tool with the word of the owner", /HOLD/.test(hold?.content ?? "") && rec(95)?.hold?.kind === "HOLD", J([hold, rec(95)]))
cell("F-2b an executor at work on its task (busy), an open watch with a ceiling, an open question to the owner, a HOLD: no letter and no question for 93..96", [93, 94, 95, 96].every((n) => !rec(n)?.ep && !lettersOf("sesEXEC").concat(lettersOf("sesEXEC2"), lettersOf("sesEXEC3"), lettersOf("sesEXEC4"), lettersOf("sesAUTH").filter((l) => new RegExp(`09${n - 90}`).test(l.text))).length), J([[93, 94, 95, 96].map((n) => rec(n)?.ep), ["sesEXEC", "sesEXEC2", "sesEXEC3", "sesEXEC4"].map((s) => lettersOf(s).length)]))

await until(() => lettersOf("sesEXEC5").length >= 1)
cell("F-2c control: the same task with an executor that is NOT at work gets its letter to the executor (the exceptions above are not a silence of the watch)", lettersOf("sesEXEC5").length >= 1 && /crew_step_note/.test(lettersOf("sesEXEC5")[0].text) && /098/.test(lettersOf("sesEXEC5")[0].text), J(lettersOf("sesEXEC5").map((l) => l.text.slice(0, 80))))

// ---- F-3 an answer by the tool extends the term once and is recorded
putTask(mkTask(97, "running", { title: "Шаг без исполнителя" }))
await until(() => lettersOf("sesAUTH").some((l) => /097/.test(l.text) && /^Шаг стоит/.test(l.text)))
const a97 = await tools.crew_step_note?.execute({ n: 97, reason: "жду ответа соседнего проекта", minutes: 30 }, { sessionID: "sesAUTH" })
const e97 = rec(97)?.ep
cell("F-3a the answer by the tool is recorded and extends the term by the setting (6 s), not by the asked minutes", /прод/i.test(a97?.content ?? "") && e97?.answers?.length === 1 && e97.due - e97.answers[0].at === 6000, J([a97, e97]))
await wait(2000)
cell("F-3b inside the extension there is no question", !rec(97)?.ep?.question, J(rec(97)?.ep))
await until(() => (rec(97)?.ep?.letters?.length ?? 0) >= 2)
cell("F-3c the extension is over: the second letter", (rec(97)?.ep?.letters?.length ?? 0) === 2, J(rec(97)?.ep))
await until(() => !!rec(97)?.ep?.question)
cell("F-3d no answer to the second letter: the question to the owner; the letters are not more than two", !!rec(97)?.ep?.question && lettersOf("sesAUTH").filter((l) => /097/.test(l.text) && !/decide/.test(l.text)).length === 2, J([rec(97)?.ep?.question?.why, lettersOf("sesAUTH").map((l) => l.id)]))

// ---- F-4 a restart of the plugin repeats nothing
const idsBefore = lettersOf("sesAUTH").map((l) => l.id).sort()
const dueBefore = rec(92)?.ep?.due
stop?.()
stop = await mod.default.setup(ctx)
for (const [s, role] of Object.entries(SES)) await tools.crew_role.execute({ role }, { sessionID: s })
await wait(2500)
cell("F-4a after a restart of the plugin no letter is repeated, the term and the open question are those of the files", J(lettersOf("sesAUTH").map((l) => l.id).sort()) === J(idsBefore) && rec(92)?.ep?.due === dueBefore && !!rec(92)?.ep?.question, J([idsBefore.length, lettersOf("sesAUTH").length, dueBefore, rec(92)?.ep?.due]))

// ---- F-5 the decision of the owner
const bad = await tools.crew_step_note?.execute({ n: 92, decide: "wait", who: "владелец, 2026-10-24" }, { sessionID: "sesEXEC" })
const dec = await tools.crew_step_note?.execute({ n: 92, decide: "wait", minutes: 60, who: "владелец, 2026-10-24, «ждать ещё час»" }, { sessionID: "sesAUTH" })
cell("F-5a the decision: only the author writes it; «wait» closes the question and gives a new term", /только автор|author/i.test(bad?.content ?? "") && !rec(92)?.ep?.question && (rec(92)?.decisions?.length ?? 0) === 1 && /ждать ещё/.test(J(rec(92)?.decisions ?? "")), J([bad, dec, rec(92)]))
const nBefore = lettersOf("sesAUTH").filter((l) => /092/.test(l.text)).length
await wait(2500)
const rowsAfter = status.formatStatuses(status.readStatuses(), Date.now(), P)
cell("F-5b after the answer of the owner: no new letter, no new question inside the new term, no mark in /crew", lettersOf("sesAUTH").filter((l) => /092/.test(l.text)).length === nBefore && !rec(92)?.ep?.question && !/092.*срок вышел/.test(rowsAfter), J([nBefore, rowsAfter]))

// ---- F-6 the tool in the help
const help = (await tools.crew_help.execute({}, { sessionID: "sesAUTH" })).content
cell("F-6a the tool crew_step_note is registered and crew_help names it", typeof tools.crew_step_note?.execute === "function" && /crew_step_note/.test(help), help.slice(0, 200))
const nothing = await tools.crew_step_note?.execute({}, { sessionID: "sesEXEC3" })
cell("F-6b a call with nothing to answer says so", /нет|нечего|не найден/i.test(nothing?.content ?? ""), J(nothing))

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `\n${fail} FAILED` : "\nall ok")
process.exit(fail ? 1 : 0)

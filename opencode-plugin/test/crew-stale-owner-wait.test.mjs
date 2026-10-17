// Self-test of task 084 (node >= 24):  node test/crew-stale-owner-wait.test.mjs
// Source (owner, 2026-10-17, screenshot of the panel): "Ждут вас: 2 · с 15:22" with two tabs of one task, and at the foot "ждут 0"; under a
// submitted task the mark "⚠ застряла с 10:48". The forms of those two tabs had used up their repeats ("без ответа, нужен владелец") at
// 19:26, the owner never answered, and the tabs went on working and asking new questions - but an exhausted form is in the repeat state,
// so nothing ever closed it, and it kept the state "owner" (status.ts takes the first of pendingForms) for hours. The mark "stuck" lives in
// obligations/ until a working turn or the owner's word clears it; for a task already submitted/accepted nothing clears it.
// The rules (owner, "по рекомендации"): an exhausted form is spent - not a wait for the owner, not in "Ждут вас", /ask, reminders - once the
// tab worked after it (a turn runs or one ended) or made a newer form; the record stays (history, crew-answer sees it). A form with repeats
// left, and the loop of task 078, wait as before. "Застряла" is not shown when the task is already past the stuck party. One number for
// "Ждут вас" and the foot.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { load } from "./answer-harness.mjs"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-stale-owner-"))
process.env.XDG_DATA_HOME = tmp
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))
const fw = await load("form-wait.ts")
const core = await load("core.ts")
const status = await load("status.ts")
const tasks = await load("tasks.ts")
const oa = await load("owner-answer.ts")

let fail = 0
const cell = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const safe = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    cell(name, false, String(e.stack ?? e))
  }
}
const MIN = 60_000
const NOW = Date.now()
const T0 = NOW - 6 * 60 * MIN // the forms are 6 hours old (the ttl of a form is 12 hours)
const Q = "Разрешить ли Phase 1?"
const OPTS = ["Разрешить (Recommended)", "Оставить HOLD"]
const created = (id, session, question = Q, options = OPTS) => ({ type: "form.created", data: { form: { id, sessionID: session, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: question, type: "string", options: options.map((label) => ({ label })) }] } } })
const file = (s) => core.readJson(path.join(fw.FORMS, `${core.safeKey(s)}.json`)) ?? []
const rec = (s, id) => file(s).find((f) => f.id === id)
const card = (session, extra = {}) => ({ session, role: "integrator", auto: false, title: session, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: NOW, ...extra })
const st = (session, extra = {}, cardExtra = {}) => status.statusOf({ card: card(session, cardExtra), busy: false, asked: [], now: NOW, watches: [], ...extra })
/** a form that used up its repeats, as the live ones: cancelled, woken 3 times, exhausted at `ex` */
const exhaust = (session, id, ex = T0 + 120 * MIN) => fw.updateForm(session, id, (f) => Object.assign(f, { cancelled: ex - 5000, repeats: 3, wokeAt: ex - 3 * MIN, exhausted: ex, notifiedAt: ex }))
/** one look of the service: `idleAt` is the end of the last turn of the tab (the database), `busy` - a turn runs now */
const tick = (idleAt, busy = false) => fw.formTick({ processStart: T0 - 60 * MIN, tab: async () => ({ open: true, busy }), idle: async (s, since) => (idleAt && idleAt > since ? { at: idleAt, outcome: "succeeded" } : undefined), ownerWrote: async () => false, wake: () => {}, say: () => {} }, NOW)
const waitNum = (list) => Number(/Ждут вас: (\d+)/.exec(status.waitingRows(list).map((r) => r.what).join("\n"))?.[1] ?? 0)
const footNum = (list) => Number(/ждут (\d+)/.exec(status.sidebarLines(list, NOW, "proj").foot)?.[1] ?? -1)

// (a) the source: an exhausted form, and a turn ended after it
await safe("a", async () => {
  fw.handleFormEvent(created("frm_a1", "sesA"), T0)
  exhaust("sesA", "frm_a1")
  cell("a0: before the tab goes on, the exhausted form is a wait for the owner", st("sesA").state === "owner" && /без ответа, нужен владелец/.test(st("sesA").detail), JSON.stringify(st("sesA")))
  await tick(T0 + 200 * MIN)
  const s = st("sesA")
  cell("a1: a turn ended after the exhausted form - the tab is not in the state owner", s.state !== "owner" && !s.formId, JSON.stringify(s))
  cell("a2: the count of 'Ждут вас' is 0 and the foot says 0", waitNum([s]) === 0 && footNum([s]) === 0, `${waitNum([s])} / ${footNum([s])}`)
  cell("a3: /ask does not name the tab", !/Сессия sesA:/.test(fw.askText(NOW)), fw.askText(NOW))
  const told = []
  fw.formReminders(NOW + 31 * MIN, (session) => void told.push(session))
  cell("a4: the owner is not reminded of it any more", !told.includes("sesA"), told.join())
  cell("a5: the record stays in forms/ as history", file("sesA").length === 1 && rec("sesA", "frm_a1")?.exhausted > 0, JSON.stringify(file("sesA")))
  cell("a6: crew-answer still sees it (allForms)", fw.allForms(NOW).some((x) => x.form.id === "frm_a1"), "not in allForms")
  const r = oa.resolveAnswer({ id: "x1", at: 1, form: "frm_a1", option: "1", quote: "q" }, fw.allForms(NOW), [], fw.replacedForms(NOW))
  cell("a7: an answer of the owner to it is still accepted", r.ok === true, JSON.stringify(r))
  await tick(T0 + 200 * MIN)
  cell("a8: a second look changes nothing", file("sesA").length === 1 && st("sesA").state !== "owner", JSON.stringify(file("sesA")))
})

// (b) the border: an exhausted form and no work after it - the owner is still waited for
await safe("b", async () => {
  fw.handleFormEvent(created("frm_b1", "sesB"), T0)
  exhaust("sesB", "frm_b1")
  await tick(T0 + 60 * MIN) // the last turn ended BEFORE the form was exhausted
  const s = st("sesB")
  cell("b1: no turn after the exhausted form - still the state owner", s.state === "owner" && s.formId === "frm_b1", JSON.stringify(s))
  cell("b2: counted in 'Ждут вас' and in the foot, once", waitNum([s]) === 1 && footNum([s]) === 1, `${waitNum([s])} / ${footNum([s])}`)
  const told = []
  fw.formReminders(NOW + 31 * MIN, (session) => void told.push(session))
  cell("b3: /ask names it and the owner is reminded", /Сессия sesB:/.test(fw.askText(NOW)) && told.includes("sesB"), fw.askText(NOW))
})

// (c) a turn runs now
await safe("c", async () => {
  fw.handleFormEvent(created("frm_c1", "sesC"), T0)
  exhaust("sesC", "frm_c1")
  await tick(undefined, true)
  cell("c1: the tab works now - the exhausted form is spent", st("sesC", { busy: true }).state === "working" && !st("sesC", { busy: true }).formId, JSON.stringify(st("sesC", { busy: true })))
  cell("c2: it stays spent when the turn ends", st("sesC").state !== "owner", JSON.stringify(st("sesC")))
})

// (d) a form with repeats left is a live wait whatever the tab did
await safe("d", async () => {
  fw.handleFormEvent(created("frm_d1", "sesD"), T0)
  fw.updateForm("sesD", "frm_d1", (f) => Object.assign(f, { cancelled: NOW - MIN, repeats: 1, wokeAt: NOW - 30_000 }))
  await tick(NOW - 10_000)
  const s = st("sesD")
  cell("d1: not exhausted - the state owner stays", s.state === "owner" && s.formId === "frm_d1" && /повтор 1 из 3/.test(s.detail), JSON.stringify(s))
  fw.handleFormEvent(created("frm_d2", "sesD2"), NOW - 5 * MIN) // an open form, not yet lost
  cell("d2: a plain open form - the state owner", st("sesD2").state === "owner" && st("sesD2").formId === "frm_d2", JSON.stringify(st("sesD2")))
})

// (e) the tab made a newer form: the old exhausted one is not a second wait
await safe("e", async () => {
  fw.handleFormEvent(created("frm_e1", "sesE", "Первый вопрос", ["Да", "Нет"]), T0)
  exhaust("sesE", "frm_e1")
  fw.handleFormEvent(created("frm_e2", "sesE", "Совсем другой вопрос", ["Пять", "Шесть", "Семь"]), NOW - 20 * MIN)
  const s = st("sesE")
  cell("e1: the newer form is the wait, not the old exhausted one", s.state === "owner" && s.formId === "frm_e2", JSON.stringify(s))
  cell("e2: one wait in the count and in /ask", waitNum([s]) === 1 && (fw.askText(NOW).match(/Сессия sesE:/g) ?? []).length === 1 && !/Первый вопрос/.test(fw.askText(NOW)), `${waitNum([s])}\n${fw.askText(NOW)}`)
  cell("e3: the old record stays, not replaced", rec("sesE", "frm_e1")?.exhausted > 0 && !rec("sesE", "frm_e1")?.replacedBy, JSON.stringify(file("sesE")))
})

// (f) the same question again replaces the old form (task 071/073) - one form, as before
await safe("f", async () => {
  fw.handleFormEvent(created("frm_f1", "sesF"), T0)
  exhaust("sesF", "frm_f1")
  fw.handleFormEvent(created("frm_f2", "sesF"), NOW - 20 * MIN)
  cell("f1: the same question asked again - one open form", fw.pendingForms("sesF", NOW).map((f) => f.id).join() === "frm_f2" && st("sesF").formId === "frm_f2", JSON.stringify(fw.pendingForms("sesF", NOW)))
})

// (g) the loop of task 078 is a wait as before, whatever the old form did
await safe("g", async () => {
  fw.handleFormEvent(created("frm_g1", "sesG"), T0)
  exhaust("sesG", "frm_g1")
  await tick(T0 + 200 * MIN)
  const dir = path.join(fw.FORMS, "loops")
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${core.safeKey("sesG")}.json`), JSON.stringify({ session: "sesG", asks: [], loop: { since: NOW - 30 * MIN, n: 3, question: Q, forms: ["frm_g1"] } }))
  const s = st("sesG")
  cell("g1: a tab in a loop is the state owner with the mark of the loop", s.state === "owner" && !!s.loop, JSON.stringify(s))
})

// (h) the mark "stuck" of the obligation: shown only while the task still waits for that tab
const putTask = (n, status, extra = {}) => {
  mkdirSync(path.dirname(tasks.taskFile("proj", n)), { recursive: true })
  writeFileSync(tasks.taskFile("proj", n), JSON.stringify({ n, project: "proj", title: `задача ${n}`, slug: `t${n}`, goal: "g", author: "sesAUTH", author_role: "proj.integrator", qid: `qx${n}`, review_qid: `rq${n}`, status, kind: "spawn", priority: "P2", tier: "light", role: "worker", executors: [], attempt: 1, directory: proj, history: [], created: NOW - 3_600_000, updated: NOW - 3_600_000, executor: `sesEX${n}`, reviewer: `sesRV${n}`, ...extra }))
}
const stuckOb = (session, qid, task) => core.saveObligations(session, [{ qid, from_session: "sesAUTH", from_role: "proj.integrator", at: NOW - 3 * 3_600_000, nudges: 3, empty: 3, stuck: true, stuckAt: NOW - 2 * 3_600_000, stuckWhat: "застряла", task }])
const stuckOf = (session, n, as) => st(session, {}, { role: "worker", ...(as === "rv" ? { review: { project: "proj", n } } : { task: { project: "proj", n } }) }).stuck
await safe("h", async () => {
  // the reviewer
  putTask(11, "submitted")
  stuckOb("sesRV11", "rq11", "приёмка #11")
  cell("h1: the review waits for the reviewer (submitted) - the mark is shown", stuckOf("sesRV11", 11, "rv")?.length === 1, JSON.stringify(stuckOf("sesRV11", 11, "rv")))
  putTask(12, "accepted")
  stuckOb("sesRV12", "rq12", "приёмка #12")
  cell("h2: the task is accepted - no mark (live: the review of #91)", !stuckOf("sesRV12", 12, "rv"), JSON.stringify(stuckOf("sesRV12", 12, "rv")))
  putTask(13, "done")
  stuckOb("sesRV13", "rq13", "приёмка #13")
  cell("h3: the task is done - no mark", !stuckOf("sesRV13", 13, "rv"), "shown")
  putTask(14, "rework")
  stuckOb("sesRV14", "rq14", "приёмка #14")
  cell("h4: the task went back to the executor - the reviewer has nothing to do, no mark", !stuckOf("sesRV14", 14, "rv"), "shown")
  putTask(15, "submitted", { reviewer: "sesOTHER" })
  stuckOb("sesRV15", "rq15", "приёмка #15")
  cell("h5: the task has another reviewer now - no mark", !stuckOf("sesRV15", 15, "rv"), "shown")
  // the executor
  putTask(21, "running")
  stuckOb("sesEX21", "qx21", "задача 21")
  cell("h6: the executor of a running task - the mark is shown", stuckOf("sesEX21", 21, "ex")?.length === 1, "no mark")
  putTask(22, "submitted")
  stuckOb("sesEX22", "qx22", "задача 22")
  cell("h7: the executor already submitted the task - no mark", !stuckOf("sesEX22", 22, "ex"), "shown")
  putTask(23, "rework")
  stuckOb("sesEX23", "qx23", "задача 23")
  cell("h8: the task is on rework - the executor is waited for, the mark is shown", stuckOf("sesEX23", 23, "ex")?.length === 1, "no mark")
  // a question without a task, and a task whose record is gone
  core.saveObligations("sesQ", [{ qid: "qq1", from_session: "sesAUTH", from_role: "proj.integrator", at: NOW - 3_600_000, nudges: 3, empty: 3, stuck: true, stuckAt: NOW - 3_000_000, stuckWhat: "вопрос" }])
  cell("h9: a stuck question (no task) is shown as before", st("sesQ").stuck?.length === 1, JSON.stringify(st("sesQ").stuck))
  stuckOb("sesGONE", "rq99", "приёмка #99")
  cell("h10: the task record is gone - no mark", !st("sesGONE", {}, { role: "worker", review: { project: "proj", n: 99 } }).stuck, "shown")
  cell("h11: the obligation itself is not rewritten", core.obligationsOf("sesRV12")[0]?.stuck === true, JSON.stringify(core.obligationsOf("sesRV12")))
  // an old task without review_qid: the obligation of the reviewer carries the qid of the task and the words «приёмка N» - it is a review, not the executor's work
  putTask(31, "submitted", { review_qid: undefined })
  stuckOb("sesRV31", "qx31", "приёмка #31")
  cell("h14: a review of an old task (no review_qid) of a submitted task - the mark is shown", stuckOf("sesRV31", 31, "rv")?.length === 1, "no mark")
  putTask(32, "accepted", { review_qid: undefined })
  stuckOb("sesRV32", "qx32", "приёмка #32")
  cell("h15: the same, the task is accepted - no mark", !stuckOf("sesRV32", 32, "rv"), "shown")
  // the rows of the panel
  const sd = status.sidebarLines([st("sesRV12", {}, { role: "worker", review: { project: "proj", n: 12 } })], NOW, "proj")
  cell("h12: no 'застряла' row in the panel for an accepted task", !sd.rows.some((r) => /застряла/.test(status.sideText(r))), JSON.stringify(sd.rows))
  const sl = status.sidebarLines([st("sesRV11", {}, { role: "worker", review: { project: "proj", n: 11 } })], NOW, "proj")
  cell("h13: the row stays for the review that waits", sl.rows.some((r) => /застряла/.test(status.sideText(r))), JSON.stringify(sl.rows))
})

// (i) one number: "Ждут вас" counts all projects, and the foot says the same; the watches have their own mark
await safe("i", async () => {
  const w1 = st("sesW1", { staleSince: NOW - 10 * MIN }) // two tabs of the owner, one in another project
  const w2 = { ...st("sesW2", { hungSince: NOW - 20 * MIN }), project: "other" }
  const idle = st("sesW3")
  const list = [w1, w2, idle]
  cell("i1: two wait; the panel and the foot say 2", waitNum(list) === 2 && footNum(list) === 2, `${waitNum(list)} / ${footNum(list)}`)
  cell("i2: the first line of /crew says the same", /Waiting for you: 2/.test(status.waitingLine(list) ?? ""), String(status.waitingLine(list)))
  cell("i3: nobody waits - no 'Ждут вас', the foot says 0", waitNum([idle]) === 0 && footNum([idle]) === 0, `${waitNum([idle])} / ${footNum([idle])}`)
  const watch = { ...idle, session: "sesW4", state: "watch", watches: [{ id: "w", note: "gate", started: NOW - MIN, minutes: 30 }] }
  const f = status.sidebarLines([idle, watch], NOW, "proj").foot
  cell("i4: a watch is not 'ждут' (that is the owner), it has the mark ⧗", /ждут 0/.test(f) && /⧗ 1/.test(f), f)
})

console.log(fail ? `\n${fail} FAILED` : "\nall ok")
process.exit(fail ? 1 : 0)

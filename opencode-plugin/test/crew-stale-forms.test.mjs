// Self-test of the stale form (task 071; node >= 24):  node test/crew-stale-forms.test.mjs
// A tab that asks the same question again (same text AND same options) makes the old form of this tab "replaced": the record
// stays in forms/ as history, but it is not an open question any more (not in the lists, /ask, the status, the reminders,
// the wakes), and an answer to it is refused with the id of the new form. Another text, other options, another tab, a form
// without a text, a form of a tab whose turn is long over and that was not repeated - all stay open. Old duplicates are closed
// by the same rule at the first pass (settleDuplicates, formTick, answerTick).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-stale-forms-"))
process.env.XDG_DATA_HOME = tmp
const fw = await import("../form-wait.ts")
const core = await import("../core.ts")
const oa = await import("../owner-answer.ts")
const { statusOf } = await import("../status.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const safe = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    cell(name, false, String(e.message ?? e))
  }
}
const MIN = 60_000
const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)
const Q = "Какой цвет?"
const OPTS = ["Синий (Recommended)", "Красный"]
const created = (id, session, question = Q, options = OPTS) => ({ type: "form.created", data: { form: { id, sessionID: session, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: question, type: "string", options: options.map((label) => ({ label })) }] } } })
const open = (s, now = T0 + 60 * MIN) => fw.pendingForms(s, now).map((f) => f.id)
const file = (s) => core.readJson(path.join(fw.FORMS, `${core.safeKey(s)}.json`)) ?? []
const rec = (s, id) => file(s).find((f) => f.id === id)
const status = (s, now = T0 + 60 * MIN) => statusOf({ card: { session: s, project: "p", role: "integrator", title: s }, busy: false, asked: [], now, watches: [] })

// (a) the same question again: the old form is replaced, the record stays as history
await safe("a", async () => {
  fw.handleFormEvent(created("frm_a1", "sesA"), T0)
  fw.handleFormEvent(created("frm_a2", "sesA"), T0 + 10 * MIN)
  cell("a: one open form of the question, the new one", open("sesA").join() === "frm_a2", open("sesA").join())
  cell("a: allForms lists one", fw.allForms(T0 + 60 * MIN).filter((x) => x.session === "sesA").length === 1, JSON.stringify(fw.allForms(T0 + 60 * MIN)))
  cell("a: the old record stays in forms/ as history, marked replaced by the new id", file("sesA").length === 2 && rec("sesA", "frm_a1")?.replacedBy === "frm_a2" && typeof rec("sesA", "frm_a1")?.replacedAt === "number", JSON.stringify(file("sesA")))
  cell("a: /ask names the question once", (fw.askText(T0 + 60 * MIN).match(/Какой цвет\?/g) ?? []).length >= 1 && fw.askText(T0 + 60 * MIN).split("\n").filter((l) => l.includes("Какой цвет?") && !l.includes("Ждут")).length === 1 && !fw.askText(T0 + 60 * MIN).includes("frm_a1"), fw.askText(T0 + 60 * MIN))
  cell("a: the status points at the new form", status("sesA").state === "owner" && status("sesA").formId === "frm_a2", JSON.stringify(status("sesA")))
  const sent = []
  fw.formReminders(T0 + 61 * MIN, (s, f) => (sent.push(f.id), true))
  cell("a: the owner is reminded of the new form only", sent.filter((x) => x.startsWith("frm_a")).join() === "frm_a2", JSON.stringify(sent))
  // copies of events change nothing: the old one does not come back, the new one is not replaced by its own old copy
  fw.handleFormEvent(created("frm_a1", "sesA"), T0 + 11 * MIN)
  fw.handleFormEvent(created("frm_a2", "sesA"), T0 + 11 * MIN)
  cell("a: copies of both events change nothing", open("sesA").join() === "frm_a2" && file("sesA").length === 2, JSON.stringify(file("sesA")))
  // the answer to the new form: the old one does not come back
  fw.handleFormEvent({ type: "form.replied", data: { id: "frm_a2", sessionID: "sesA" } })
  cell("a: after the reply to the new form nothing is open", open("sesA").length === 0, open("sesA").join())
})

// (b) the same wording and options, but case and spaces differ: still the same question
await safe("b", async () => {
  fw.handleFormEvent(created("frm_b1", "sesB", "Какой  цвет?\n", ["синий (recommended)", "Красный "]), T0)
  fw.handleFormEvent(created("frm_b2", "sesB"), T0 + MIN)
  cell("b: spaces and case do not make a new question", open("sesB").join() === "frm_b2", open("sesB").join())
})

// (c) not the same question: both act
await safe("c", async () => {
  fw.handleFormEvent(created("frm_c1", "sesC"), T0)
  fw.handleFormEvent(created("frm_c2", "sesC", "Совсем другой вопрос?"), T0 + MIN)
  cell("c: another text - both open", open("sesC").join() === "frm_c1,frm_c2", open("sesC").join())
  fw.handleFormEvent(created("frm_c3", "sesC", Q, ["Синий (Recommended)", "Зелёный"]), T0 + 2 * MIN)
  cell("c: the same text, other options - three open (no guessing by closeness)", open("sesC").join() === "frm_c1,frm_c2,frm_c3", open("sesC").join())
  fw.handleFormEvent(created("frm_c4", "sesC", Q, [...OPTS].reverse()), T0 + 3 * MIN)
  cell("c: the same options in another order - still another question", open("sesC").length === 4, open("sesC").join())
  fw.handleFormEvent(created("frm_c5", "sesC2"), T0)
  fw.handleFormEvent(created("frm_c6", "sesC3"), T0 + MIN)
  cell("c: the same question in two tabs - both open", open("sesC2").join() === "frm_c5" && open("sesC3").join() === "frm_c6", open("sesC2").join() + "|" + open("sesC3").join())
  const bare = (id, s) => ({ type: "form.created", data: { form: { id, sessionID: s, title: "Questions", metadata: { kind: "question" } } } })
  fw.handleFormEvent(bare("frm_c7", "sesC4"), T0)
  fw.handleFormEvent(bare("frm_c8", "sesC4"), T0 + MIN)
  cell("c: forms without a text are never taken for one question", open("sesC4").join() === "frm_c7,frm_c8", open("sesC4").join())
})

// (d) the form that was not repeated stays, however old (the tab's turn is long over, the owner is still needed)
await safe("d", async () => {
  fw.handleFormEvent(created("frm_d1", "sesD"), T0)
  fw.updateForm("sesD", "frm_d1", (f) => Object.assign(f, { cancelled: T0 + MIN, repeats: 3, exhausted: T0 + 20 * MIN }))
  const woken = []
  const deps = { processStart: T0 - 60 * MIN, tab: async () => ({ open: true, busy: false }), idle: async () => undefined, ownerWrote: async () => false, wake: (s, t, id) => woken.push(id), say: () => {} }
  for (let i = 1; i <= 5; i++) await fw.formTick(deps, T0 + (30 + i * 4) * MIN)
  cell("d: an exhausted form of a quiet tab, not repeated, stays open", open("sesD", T0 + 11 * MIN).join() === "frm_d1" && !rec("sesD", "frm_d1")?.replacedBy, JSON.stringify(file("sesD")))
  // a repeat with another text (the live case of ses_ee37: the tab re-asked with its own words) does not close it either
  fw.handleFormEvent(created("frm_d2", "sesD", "Иначе сформулированный тот же вопрос?"), T0 + 12 * MIN)
  cell("d: a reworded question is another question (strict rule), both open", open("sesD", T0 + 13 * MIN).join() === "frm_d1,frm_d2", open("sesD", T0 + 13 * MIN).join())
})

// (e) the old repeat path is kept: a form in the repeat state is taken over with the same text, the count goes on
await safe("e", async () => {
  fw.handleFormEvent(created("frm_e1", "sesE"), T0)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_e1", sessionID: "sesE" } }, T0 + 1000)
  fw.updateForm("sesE", "frm_e1", (f) => Object.assign(f, { repeats: 1, wokeAt: T0 + 2 * MIN }))
  fw.handleFormEvent(created("frm_e2", "sesE"), T0 + 4 * MIN)
  const again = fw.pendingForms("sesE", T0 + 5 * MIN)
  cell("e: the repeated form keeps the count and the first time", again.length === 1 && again[0].id === "frm_e2" && again[0].repeats === 1 && again[0].at === T0 && !again[0].cancelled, JSON.stringify(again))
  cell("e: the taken-over record is history, marked replaced", rec("sesE", "frm_e1")?.replacedBy === "frm_e2", JSON.stringify(file("sesE")))
})

// (f) duplicates that piled up before this rule: closed at the first pass, by the records
await safe("f", async () => {
  mkdirSync(fw.FORMS, { recursive: true })
  const mk = (id, at, question = Q, options = OPTS, extra = {}) => ({ id, at, title: "Questions", question, options, kind: "question", session: "sesF", ...extra })
  writeFileSync(path.join(fw.FORMS, "sesF.json"), JSON.stringify([mk("frm_f1", T0, Q, OPTS, { cancelled: T0 + MIN, repeats: 3, exhausted: T0 + 20 * MIN }), mk("frm_f2", T0 + 5 * MIN, "Другой вопрос?", ["Да", "Нет"]), mk("frm_f3", T0 + 30 * MIN), mk("frm_f4", T0 + 40 * MIN)]))
  cell("f: before the pass the duplicates are visible (the old state)", open("sesF").length >= 2, open("sesF").join())
  const closed = fw.settleDuplicates(fw.FORMS, T0 + 50 * MIN)
  cell("f: the pass closes the older forms of the question, keeps the newest and the other question", open("sesF").join() === "frm_f2,frm_f4", open("sesF").join())
  cell("f: it names what it closed", closed.length === 2 && closed.every((x) => x.session === "sesF") && closed.map((x) => x.id).sort().join() === "frm_f1,frm_f3", JSON.stringify(closed))
  cell("f: the records stay, marked with the newest form", file("sesF").length === 4 && rec("sesF", "frm_f1")?.replacedBy === "frm_f4" && rec("sesF", "frm_f3")?.replacedBy === "frm_f4" && !rec("sesF", "frm_f2")?.replacedBy && !rec("sesF", "frm_f4")?.replacedBy, JSON.stringify(file("sesF")))
  cell("f: the second pass changes nothing", fw.settleDuplicates(fw.FORMS, T0 + 51 * MIN).length === 0 && open("sesF").join() === "frm_f2,frm_f4", open("sesF").join())
  // the tick does the same pass for the first look after an update
  writeFileSync(path.join(fw.FORMS, "sesG.json"), JSON.stringify([{ ...mk("frm_g1", T0), session: "sesG" }, { ...mk("frm_g2", T0 + 5 * MIN), session: "sesG" }]))
  const woken = []
  await fw.formTick({ processStart: T0 - 60 * MIN, tab: async () => ({ open: true, busy: true }), idle: async () => undefined, ownerWrote: async () => false, wake: (s, t, id) => woken.push(id), say: () => {} }, T0 + 6 * MIN)
  cell("f: formTick closes the old duplicate even when the tab is busy", open("sesG", T0 + 6 * MIN).join() === "frm_g2" && rec("sesG", "frm_g1")?.replacedBy === "frm_g2", JSON.stringify(file("sesG")))
})

// (g) the answer to a replaced form is refused with the new id; the answer to the new one goes
await safe("g", async () => {
  fw.handleFormEvent(created("frm_h1", "sesH"), T0)
  fw.handleFormEvent(created("frm_h2", "sesH"), T0 + 10 * MIN)
  const forms = fw.allForms(T0 + 60 * MIN)
  const replaced = fw.replacedForms(T0 + 60 * MIN)
  cell("g: replacedForms lists the history records", replaced.some((x) => x.form.id === "frm_h1") && replaced.every((x) => x.form.replacedBy), JSON.stringify(replaced.map((x) => x.form.id)))
  const r = oa.resolveAnswer({ id: "x1", at: 1, form: "frm_h1", option: "1", quote: "по рекомендации" }, forms, [], replaced)
  cell("g: resolveAnswer refuses a replaced form and names the new one", r.ok === false && /заново формой frm_h2/.test(r.why) && /ответьте на неё/.test(r.why), JSON.stringify(r))
  const r2 = oa.resolveAnswer({ id: "x2", at: 1, form: "frm_h1", option: "1", quote: "q" }, forms, [], [])
  cell("g: without the history it is the old plain refusal", r2.ok === false && /no open question form/.test(r2.why), JSON.stringify(r2))

  const r3 = oa.resolveAnswer({ id: "x3", at: 1, form: "frm_a1", option: "1", quote: "q" }, forms, [], replaced)
  cell("g: if the new form is already closed the refusal says so", r3.ok === false && /frm_a2/.test(r3.why) && /закрыта/.test(r3.why), JSON.stringify(r3))

  // end to end through the pass over the answer files
  const dir = path.join(tmp, "answers-071")
  mkdirSync(dir, { recursive: true })
  const put = (name, a) => writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ id: name, at: 1, quote: "по рекомендации", option: "1", ...a }))
  put("a-old", { form: "frm_h1", session: "sesH" })
  const letters = []
  const interrupted = []
  const answerDeps = { interrupt: async (s) => (interrupted.push(s), { ok: true }), letter: (s, t, id) => letters.push(id), history: () => {}, say: () => {} }
  await oa.answerTick(answerDeps, T0 + 20 * MIN, dir)
  put("a-new", { form: "frm_h2", session: "sesH" })
  await oa.answerTick(answerDeps, T0 + 20 * MIN, dir)
  const old = core.readJson(path.join(dir, "a-old.json"))
  const neu = core.readJson(path.join(dir, "a-new.json"))
  cell("g: the answer to the replaced form is refused with the hint, no interrupt", old?.status === "refused" && /заново формой frm_h2, ответьте на неё/.test(old.why), JSON.stringify(old))
  cell("g: the answer to the new form is applied", neu?.status === "applied" && neu.form === "frm_h2" && interrupted.length === 1 && letters.join() === "owner-answer-a-new", JSON.stringify([neu, interrupted, letters]))

  // old duplicates met by the answer pass are settled first: the answer to the older one gets the hint at once
  writeFileSync(path.join(fw.FORMS, "sesI.json"), JSON.stringify([{ id: "frm_i1", at: T0, question: Q, options: OPTS, kind: "question", session: "sesI" }, { id: "frm_i2", at: T0 + MIN, question: Q, options: OPTS, kind: "question", session: "sesI" }]))
  put("a-i", { form: "frm_i1", session: "sesI" })
  await oa.answerTick({ interrupt: async () => ({ ok: true }), letter: () => {}, history: () => {}, say: () => {} }, T0 + 20 * MIN, dir)
  const i = core.readJson(path.join(dir, "a-i.json"))
  cell("g: an old duplicate is settled before the answer is read", i?.status === "refused" && /frm_i2/.test(i.why ?? ""), JSON.stringify(i))
})

process.exit(fail ? 1 : 0)

// Self-test of the extended replacement (task 073; node >= 24):  node test/crew-stale-forms-repeat.test.mjs
// Task 071 closes the old form only for the same text AND the same options. Here the one more safe case: the old form of a tab is in
// the repeat state (the plugin itself asked the tab to ask again: woken at least once, or exhausted), and the tab then made a new
// form with the SAME OPTIONS (same labels, same order, case and spacing ignored) but other words. The old form becomes "replaced"
// (history, reason «повтор тем же набором вариантов»). Not covered, by design: a form that is not in the repeat state, a cancelled
// form that was not yet woken, other options, a form that has no options, another tab, a new form made before the first wake.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-stale-repeat-"))
process.env.XDG_DATA_HOME = tmp
const fw = await import("../form-wait.ts")
const core = await import("../core.ts")
const oa = await import("../owner-answer.ts")

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
const REASON = "повтор тем же набором вариантов"
const Q = "Сдача сохранена, но проверка не завершена. Что делать?"
const Q2 = "Проверка завершилась неполной. Как поступим?"
const OPTS = ["Правка и Sol (Recommended)", "Правка и Luna", "Приостановить"]
const created = (id, session, question = Q, options = OPTS) => ({ type: "form.created", data: { form: { id, sessionID: session, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: question, type: "string", options: options.map((label) => ({ label })) }] } } })
const open = (s, now = T0 + 600 * MIN) => fw.pendingForms(s, now).map((f) => f.id)
const file = (s) => core.readJson(path.join(fw.FORMS, `${core.safeKey(s)}.json`)) ?? []
const rec = (s, id) => file(s).find((f) => f.id === id)
// the old form goes to the repeat state as the plugin does it: Esc, then the first wake 5 s later
const lost = (s, id, cancelAt, repeats = 1, wokeAt = cancelAt + 5000, extra = {}) => fw.updateForm(s, id, (f) => Object.assign(f, { cancelled: cancelAt, repeats, wokeAt }, extra))

// (a) the source of the task: old form in the repeat, the tab asks again in other words with the same options
await safe("a", async () => {
  fw.handleFormEvent(created("frm_a1", "sesA"), T0)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_a1", sessionID: "sesA" } }, T0 + MIN)
  lost("sesA", "frm_a1", T0 + MIN)
  fw.handleFormEvent(created("frm_a2", "sesA", Q2), T0 + MIN + 35_000)
  cell("a: only the new form is open", open("sesA").join() === "frm_a2", open("sesA").join())
  cell("a: the old record stays as history with the new id and the reason", file("sesA").length === 2 && rec("sesA", "frm_a1")?.replacedBy === "frm_a2" && rec("sesA", "frm_a1")?.replacedReason === REASON && typeof rec("sesA", "frm_a1")?.replacedAt === "number", JSON.stringify(file("sesA")))
  cell("a: the new form is not marked", !rec("sesA", "frm_a2")?.replacedBy && !rec("sesA", "frm_a2")?.replacedReason, JSON.stringify(rec("sesA", "frm_a2")))
  const forms = fw.allForms(T0 + 60 * MIN)
  const replaced = fw.replacedForms(T0 + 60 * MIN)
  const r = oa.resolveAnswer({ id: "x1", at: 1, form: "frm_a1", option: "1", quote: "q" }, forms, [], replaced)
  cell("a: the answer to the old form is refused as in 071", r.ok === false && /заново формой frm_a2/.test(r.why) && /ответьте на неё/.test(r.why), JSON.stringify(r))
  const sent = []
  const deps = { processStart: T0 - 60 * MIN, tab: async () => ({ open: true, busy: false }), idle: async () => undefined, ownerWrote: async () => false, wake: (s, t, id) => sent.push(id), say: () => {} }
  await fw.formTick(deps, T0 + 5 * MIN)
  await fw.formTick(deps, T0 + 6 * MIN)
  cell("a: the old form is never woken again", !sent.some((id) => id.includes("frm_a1")), JSON.stringify(sent))
})

// (b) the live case: exhausted form, the tab asks a new one hours later
await safe("b", async () => {
  fw.handleFormEvent(created("frm_b1", "sesB"), T0)
  lost("sesB", "frm_b1", T0 + 60 * MIN, 3, T0 + 180 * MIN, { exhausted: T0 + 240 * MIN })
  fw.handleFormEvent(created("frm_b2", "sesB", Q2), T0 + 360 * MIN)
  cell("b: an exhausted form is replaced by the new one with the same options", open("sesB", T0 + 361 * MIN).join() === "frm_b2" && rec("sesB", "frm_b1")?.replacedBy === "frm_b2", JSON.stringify(file("sesB")))
})

// (c) the border: not in the repeat state - both stay
await safe("c", async () => {
  fw.handleFormEvent(created("frm_c1", "sesC"), T0)
  fw.handleFormEvent(created("frm_c2", "sesC", Q2), T0 + 10 * MIN)
  cell("c: an old form that is not in the repeat is not touched by other words", open("sesC").join() === "frm_c1,frm_c2", open("sesC").join())
  // cancelled but not yet woken: the plugin has not asked the tab yet
  fw.handleFormEvent(created("frm_c3", "sesC3"), T0)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_c3", sessionID: "sesC3" } }, T0 + MIN)
  fw.handleFormEvent(created("frm_c4", "sesC3", Q2), T0 + MIN + 1000)
  cell("c: cancelled and not yet woken - both stay (the plugin has not prompted the tab)", open("sesC3").join() === "frm_c3,frm_c4", open("sesC3").join())
})

// (d) other options (also a subset, a superset, another order) - both stay
await safe("d", async () => {
  fw.handleFormEvent(created("frm_d1", "sesD"), T0)
  lost("sesD", "frm_d1", T0 + MIN)
  fw.handleFormEvent(created("frm_d2", "sesD", Q2, ["Правка и Sol (Recommended)", "Правка и Luna"]), T0 + 5 * MIN)
  fw.handleFormEvent(created("frm_d3", "sesD", Q2, [...OPTS, "Иное"]), T0 + 6 * MIN)
  fw.handleFormEvent(created("frm_d4", "sesD", Q2, [...OPTS].reverse()), T0 + 7 * MIN)
  cell("d: other options, a subset, a superset, another order - all open", open("sesD").join() === "frm_d1,frm_d2,frm_d3,frm_d4", open("sesD").join())
  // case and spacing of the labels do not count
  fw.handleFormEvent(created("frm_d5", "sesD", Q2, OPTS.map((o) => `  ${o.toUpperCase()} `)), T0 + 8 * MIN)
  cell("d: the same labels with other case and spacing replace the old form", rec("sesD", "frm_d1")?.replacedBy === "frm_d5" && open("sesD").join() === "frm_d2,frm_d3,frm_d4,frm_d5", open("sesD").join() + JSON.stringify(file("sesD")))
})

// (e) the old form in the repeat and no new form: it stays
await safe("e", async () => {
  fw.handleFormEvent(created("frm_e1", "sesE"), T0)
  lost("sesE", "frm_e1", T0 + MIN, 3, T0 + 120 * MIN, { exhausted: T0 + 180 * MIN })
  const closed = fw.settleDuplicates(fw.FORMS, T0 + 300 * MIN)
  cell("e: a repeated form with no new form stays open", open("sesE", T0 + 300 * MIN).join() === "frm_e1" && !closed.some((x) => x.id === "frm_e1"), JSON.stringify(closed))
  // another tab with the same options does not close it
  fw.handleFormEvent(created("frm_e2", "sesE2", Q2), T0 + 200 * MIN)
  cell("e: the same options in another tab - both open", open("sesE", T0 + 300 * MIN).join() === "frm_e1" && open("sesE2", T0 + 300 * MIN).join() === "frm_e2", open("sesE").join())
})

// (f) general option sets: the extension works only in the repeat state
await safe("f", async () => {
  fw.handleFormEvent(created("frm_f1", "sesF", "Продолжать?", ["Да", "Нет"]), T0)
  fw.handleFormEvent(created("frm_f2", "sesF", "Удалить ветку?", ["Да", "Нет"]), T0 + MIN)
  cell("f: Да/Нет of a form that is not in the repeat - two questions", open("sesF").join() === "frm_f1,frm_f2", open("sesF").join())
  lost("sesF", "frm_f1", T0 + 2 * MIN)
  fw.handleFormEvent(created("frm_f3", "sesF", "Закрыть задачу?", ["Да", "Нет"]), T0 + 3 * MIN)
  cell("f: Да/Нет: only the form in the repeat is replaced, the quiet one stays", open("sesF").join() === "frm_f2,frm_f3" && rec("sesF", "frm_f1")?.replacedBy === "frm_f3", JSON.stringify(file("sesF")))
})

// (g) two forms in the repeat with the same options: the newest form stays, every older one is history
await safe("g", async () => {
  fw.handleFormEvent(created("frm_g1", "sesG"), T0)
  lost("sesG", "frm_g1", T0 + MIN)
  fw.handleFormEvent(created("frm_g2", "sesG", "Второй вариант слов?"), T0 + 30 * MIN)
  fw.handleFormEvent(created("frm_g3", "sesG", "Третий вариант слов?"), T0 + 40 * MIN)
  lost("sesG", "frm_g3", T0 + 41 * MIN)
  fw.handleFormEvent(created("frm_g4", "sesG", "Четвёртый вариант слов?"), T0 + 50 * MIN)
  cell("g: every form in the repeat is replaced by the form that came after it; a quiet form (g2) stays", open("sesG").join() === "frm_g2,frm_g4" && rec("sesG", "frm_g1")?.replacedBy === "frm_g2" && rec("sesG", "frm_g3")?.replacedBy === "frm_g4", open("sesG").join() + JSON.stringify(file("sesG")))
})

// (h) forms that piled up before the rule: the pass closes them by the records
await safe("h", async () => {
  mkdirSync(fw.FORMS, { recursive: true })
  const mk = (id, at, question, options = OPTS, extra = {}) => ({ id, at, title: "Questions", question, options, kind: "question", session: "sesH", ...extra })
  // the live shape: the old form with three repeats (no first-wake time stored), the tab asked again in other words, later still once
  writeFileSync(path.join(fw.FORMS, "sesH.json"), JSON.stringify([
    mk("frm_h1", T0, Q, OPTS, { cancelled: T0 + 60 * MIN, repeats: 3, wokeAt: T0 + 180 * MIN, exhausted: T0 + 240 * MIN }),
    mk("frm_h2", T0 + 62 * MIN, Q2),
    mk("frm_h3", T0 + 400 * MIN, "Ещё иначе?"),
  ]))
  const closed = fw.settleDuplicates(fw.FORMS, T0 + 500 * MIN)
  cell("h: the pass closes the repeated form only (by the newest form with its options); the quiet forms stay", open("sesH", T0 + 500 * MIN).join() === "frm_h2,frm_h3" && closed.length === 1 && closed[0].id === "frm_h1", JSON.stringify([closed, file("sesH")]))
  cell("h: the reason is written, the records stay", file("sesH").length === 3 && rec("sesH", "frm_h1")?.replacedBy === "frm_h3" && rec("sesH", "frm_h1")?.replacedReason === REASON, JSON.stringify(file("sesH")))
  cell("h: the second pass changes nothing", fw.settleDuplicates(fw.FORMS, T0 + 501 * MIN).length === 0, "")

  // a form made BEFORE the first wake is not a reaction to the wake: both stay
  writeFileSync(path.join(fw.FORMS, "sesI.json"), JSON.stringify([
    { ...mk("frm_i1", T0, Q, OPTS, { cancelled: T0 + 60 * MIN, repeats: 1, wokeAt: T0 + 60 * MIN + 5000 }), session: "sesI" },
    { ...mk("frm_i2", T0 + 30 * MIN, Q2), session: "sesI" },
  ]))
  fw.settleDuplicates(fw.FORMS, T0 + 500 * MIN)
  cell("h: a new form made before the first wake does not replace the old one", open("sesI", T0 + 500 * MIN).join() === "frm_i1,frm_i2", open("sesI", T0 + 500 * MIN).join())

  // no options at all (a free-text question): never matched
  writeFileSync(path.join(fw.FORMS, "sesJ.json"), JSON.stringify([
    { id: "frm_j1", at: T0, title: "Questions", question: Q, kind: "question", session: "sesJ", cancelled: T0 + MIN, repeats: 1, wokeAt: T0 + MIN + 5000 },
    { id: "frm_j2", at: T0 + 10 * MIN, title: "Questions", question: Q2, kind: "question", session: "sesJ" },
  ]))
  fw.settleDuplicates(fw.FORMS, T0 + 500 * MIN)
  cell("h: forms without options are not matched by the extension", open("sesJ", T0 + 500 * MIN).join() === "frm_j1,frm_j2", open("sesJ", T0 + 500 * MIN).join())
})

// (i) the strict rule of 071 is as before: same text and options, the old form not in the repeat
await safe("i", async () => {
  fw.handleFormEvent(created("frm_k1", "sesK"), T0)
  fw.handleFormEvent(created("frm_k2", "sesK"), T0 + MIN)
  cell("i: the strict rule still closes the same question and gives no reason", open("sesK").join() === "frm_k2" && rec("sesK", "frm_k1")?.replacedBy === "frm_k2" && !rec("sesK", "frm_k1")?.replacedReason, JSON.stringify(file("sesK")))
})

process.exit(fail ? 1 : 0)

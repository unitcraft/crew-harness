// Self-test of waiting by the built-in questionnaire (task 026, step 1; node >= 24):  node test/crew-form-wait.test.mjs
import { mkdtempSync, readdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-form-"))
process.env.XDG_DATA_HOME = tmp
const fw = await import("../form-wait.ts")
const { statusOf } = await import("../status.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const card = (session, spawned) => ({ session, project: "p", role: "integrator", title: session, ...(spawned ? { spawned: true } : {}) })
const stOf = (session, now = Date.now(), c = card(session)) => statusOf({ card: c, busy: true, busySince: now, asked: [], now, watches: [] })
const created = (id, session, kind = "question") => ({ type: "form.created", data: { form: { id, sessionID: session, title: "Questions", metadata: { kind }, fields: [{ name: "q0", question: "Какой цвет?", options: ["Синий"] }] } } })

fw.handleFormEvent(created("frm_1", "sesA"))
let s = stOf("sesA")
cell("form.created: owner with the question text", s.state === "owner" && s.question === "Какой цвет?" && s.detail.includes("ждёт вас") && s.detail.includes("Какой цвет?"), JSON.stringify(s))
cell("task session: owner too, not question", stOf("sesA", Date.now(), card("sesA", true)).state === "owner", "spawned")

for (let i = 0; i < 4; i++) fw.handleFormEvent(created("frm_1", "sesA"))
cell("four copies: one record", fw.pendingForms("sesA").length === 1, JSON.stringify(fw.pendingForms("sesA")))

fw.handleFormEvent({ type: "form.replied", data: { id: "frm_1", sessionID: "sesA", answer: { q0: "Синий" } } })
fw.handleFormEvent({ type: "form.replied", data: { id: "frm_1", sessionID: "sesA" } })
cell("form.replied: not owner, file gone", stOf("sesA").state === "working" && fw.pendingForms("sesA").length === 0, JSON.stringify(stOf("sesA")))

fw.handleFormEvent(created("frm_2", "sesB"))
fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_2" } })
cell("form.cancelled (id only): not owner", stOf("sesB").state === "working", JSON.stringify(stOf("sesB")))

fw.handleFormEvent(created("frm_3", "sesC", "other"))
cell("foreign kind ignored", stOf("sesC").state === "working", JSON.stringify(stOf("sesC")))

const old = Date.now() - 13 * 3_600_000
fw.handleFormEvent(created("frm_4", "sesD"), old)
cell("stale form (13 h) does not count", fw.pendingForms("sesD").length === 0 && stOf("sesD").state === "working", "stale")
fw.cleanupForms()
cell("cleanup drops the stale file", !readdirSync(fw.FORMS).includes("sesD.json"), readdirSync(fw.FORMS).join(","))

let threw = false
try {
  for (const bad of [undefined, null, 5, {}, { type: "form.created" }, { type: "form.created", data: { form: { metadata: { kind: "question" } } } }, { type: "form.replied", data: null }]) fw.handleFormEvent(bad)
} catch {
  threw = true
}
cell("garbage does not throw", !threw, "threw")

// subscription: the event.subscribe callback feeds the handler
let cb
await fw.startFormWait({ event: { subscribe: (f) => { cb = f } } }, () => {})
cb({ type: "form.created", data: { form: { id: "frm_5", sessionID: "sesE", metadata: { kind: "question" } } } })
cell("startFormWait subscribes", stOf("sesE").state === "owner", JSON.stringify(stOf("sesE")))

process.exit(fail ? 1 : 0)

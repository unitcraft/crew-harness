// Flow test of the lost owner question through the plugin (task 040; node >= 24):  node test/crew-lost-question-flow.test.mjs
// A record in forms/ with a tab that has no turn (the window or the service was restarted): the tab gets the wake as a prompt, at
// most three times; then "без ответа, нужен владелец" and no more wakes; the window gets the notice; nothing answers for the owner.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-lostq-flow-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FORM_MS = "100"
process.env.CREW_HARNESS_FORM_GONE_MS = "300"
process.env.CREW_HARNESS_FORM_REPEAT_GAP_MS = "700"
process.env.CREW_HARNESS_FORM_RESTART_GRACE_MS = "300"
process.env.CREW_HARNESS_FORM_REMIND_MS = "2500"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
const SES = "sesLOST01"
db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(SES, proj, SES)

const core = await import("../core.ts")
const fw = await import("../form-wait.ts")
const status = await import("../status.ts")
const mod = await import("../index.ts")
const hooks = {}
const prompts = []
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async (p) => void prompts.push(p),
    synthetic: async () => {},
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async () => {} },
  events: { on: async () => {} },
}
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const WPID = 616161
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [{ sessionID: SES, active: true, busy: false }] }))
beat()
const heart = setInterval(beat, 300)
const notices = () => {
  try {
    return readdirSync(path.join(core.NOTICES, String(WPID))).map((f) => JSON.parse(readFileSync(path.join(core.NOTICES, String(WPID), f), "utf8")))
  } catch {
    return []
  }
}
const seen = []
const seenFiles = new Set()
const collect = setInterval(() => {
  try {
    for (const f of readdirSync(path.join(core.NOTICES, String(WPID)))) if (!seenFiles.has(f)) (seenFiles.add(f), seen.push(JSON.parse(readFileSync(path.join(core.NOTICES, String(WPID), f), "utf8"))))
  } catch {}
}, 50)

const stop = await mod.default.setup(ctx)
await hooks.context({ sessionID: SES, system: [], model: { id: "opus", providerID: "claude-code" } })
const OLD = Date.now() - 2 * 3_600_000 // the turn before the question (the question is an hour old)
msg(SES, "user", { text: "сделай" }, OLD)
msg(SES, "assistant", { content: [{ type: "text", text: "спрашиваю" }] }, OLD)
msg(SES, "idle", { outcome: "interrupted" }, OLD)
const card = core.readJson(core.cardFile(SES))
core.saveCard({ ...card, busy: false })

// the question was asked before the "restart": the record is open, nothing is on the screen
fw.handleFormEvent({ type: "form.created", data: { form: { id: "frm_flow", sessionID: SES, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Вливать в main?", options: [{ label: "Да (Recommended)" }, { label: "Нет" }] }] } } }, Date.now() - 3_600_000)
await wait(6000)

const wakes = prompts.filter((p) => /не получил ответа/.test(p.text))
cell("the tab got the wake as a prompt with the question and the options", wakes.length >= 1 && wakes[0].sessionID === SES && /Вливать в main\?/.test(wakes[0].text) && /Да \(Recommended\)/.test(wakes[0].text) && /question/.test(wakes[0].text), JSON.stringify(prompts).slice(0, 400))
cell("exactly three wakes, then no more", wakes.length === 3, String(wakes.length))
const rec = fw.pendingForms(SES)[0]
cell("the record says: no answer, repeats used up", rec?.repeats === 3 && !!rec.exhausted, JSON.stringify(rec))
const st = core.readJson(path.join(status.STATUS, `${SES}.json`))
cell("the status says the owner is needed, not a false working", st?.state === "owner" && /без ответа, нужен владелец/.test(st.detail), JSON.stringify(st))
const mine = seen.filter((n) => n.sessionID === SES)
cell("the window got a notice with attention", mine.length >= 1 && mine[0].attention === true && /ждёт вас$/.test(mine[0].title), JSON.stringify(seen))
cell("a notice says there is no answer; the others are spaced by the period (<= 5 in 8.5 s of 2.5 s)", mine.length <= 5 && mine.some((n) => /без ответа, нужен владелец/.test(n.message)), JSON.stringify(mine.map((n) => n.message)))
const before = prompts.length
await wait(2500)
cell("no new wakes after the limit", prompts.length === before, `${prompts.length} vs ${before}`)
cell("nothing answered for the owner", prompts.every((p) => !/form\.reply/.test(p.text)) && fw.pendingForms(SES).length === 1, JSON.stringify(fw.pendingForms(SES)))

// the owner answered in the window: the record goes away, the false waiting too
fw.handleFormEvent({ type: "form.replied", data: { id: rec.id, sessionID: SES } })
await wait(600)
const st2 = core.readJson(path.join(status.STATUS, `${SES}.json`))
cell("form.replied: the record and the waiting are gone", fw.pendingForms(SES).length === 0 && st2?.state !== "owner", JSON.stringify(st2))

clearInterval(heart)
clearInterval(collect)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-lost-question-flow.test: FAIL ${fail}` : "crew-lost-question-flow.test ok")
process.exit(fail ? 1 : 0)

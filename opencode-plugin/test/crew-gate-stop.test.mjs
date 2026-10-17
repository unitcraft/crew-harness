// Self-test of task 062: a stop at a gate ends with a question to the owner (node >= 24):  node test/crew-gate-stop.test.mjs
// GS-1 the gate store (gate-stop.ts): note, read, clear, the letter is marked once. GS-2 log_line kind "ворота": the entry is written
//      in any case, the answer of the tool says "no question to the owner" when the tab has none open, and the plugin notes the stop.
// GS-3 the status of a tab with a gate and no question: state owner, the mark ⚠, the text "ждёт вашего решения, вопроса нет".
// GS-4 the plugin: after the turn of such a tab ends it gets ONE letter and the mark; an open question (forms/ record or a question
//      mark at the end of the turn) or the owner's word clears it, no letter then. The live phrase of the source (2026-10-16).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-gate-stop-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FORM_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
mkdirSync(path.join(proj, "doc", "tasks", "007-x"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))
const LOG = path.join(proj, "doc", "tasks", "007-x", "log.md")

let fail = 0
const cell = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const tryImport = (p) => import(p).catch((e) => (console.log(`import ${p}: ${String(e).split("\n")[0]}`), null))

const core = await import("../core.ts")
const fw = await import("../form-wait.ts")
const status = await import("../status.ts")
const gs = await tryImport("../gate-stop.ts")

// ---- GS-1 the gate store
{
  const dir = path.join(tmp, "gates-unit")
  const B = Date.now() - 10_000
  const g = gs?.noteGate?.("sesG1", "остановка", B, dir)
  cell("GS-1a noteGate writes the stop with the time and gateOf reads it", g?.at === B && gs?.gateOf("sesG1", dir)?.at === B, JSON.stringify(gs?.gateOf?.("sesG1", dir)))
  const again = gs?.noteGate?.("sesG1", "ещё раз", B + 1000, dir)
  cell("GS-1b a second note of an open stop keeps the first one (one stop - one letter)", again?.at === B && gs?.gateOf("sesG1", dir)?.at === B, JSON.stringify(again))
  gs?.markGateLetter?.("sesG1", B + 2000, dir)
  cell("GS-1c the letter time is kept in the record", gs?.gateOf("sesG1", dir)?.letter === B + 2000, JSON.stringify(gs?.gateOf?.("sesG1", dir)))
  gs?.noteGate?.("sesG1", "после письма", B + 3000, dir)
  cell("GS-1d a note after the letter does not erase the letter mark", gs?.gateOf("sesG1", dir)?.letter === B + 2000, JSON.stringify(gs?.gateOf?.("sesG1", dir)))
  gs?.clearGate?.("sesG1", dir)
  cell("GS-1e clearGate removes the record; a new stop after that is a new record", gs?.gateOf("sesG1", dir) === undefined && gs?.noteGate?.("sesG1", "новая", B + 4000, dir)?.at === B + 4000, "")
  cell("GS-1f the mark is ⚠ and the answer of the tool is the wording of the task", gs?.GATE_MARK === "⚠" && /^Ворота записаны, но вопроса владельцу нет: задай его сейчас инструментом question — вопрос, рекомендация, довод/.test(gs?.GATE_ANSWER ?? ""), String(gs?.GATE_ANSWER))
}

// ---- GS-3 the status (pure)
{
  const st = (extra) => status.statusOf({ card: { project: "p62", role: "integrator", title: "x", session: "sesG3", ...extra.card }, busy: false, end: extra.end, asked: [], now: 100_000_000, watches: [], ...(extra.gate ? { gate: extra.gate } : {}) })
  const idle = { at: 90_000_000, text: "Сводка выше.", ownerAfter: false }
  const s = st({ end: idle, gate: { at: 80_000_000 } })
  cell("GS-3a a gate without a question: state owner, gate flag, no wait flag", s.state === "owner" && s.gate === true && !s.wait, JSON.stringify(s))
  cell("GS-3b the text names the decision and the missing question", /ждёт вашего решения, вопроса нет/.test(s.detail), s.detail)
  cell("GS-3c the mark is ⚠", status.markOf(s) === "⚠", String(status.markOf(s)))
  const list = status.formatStatuses([s], 100_000_000)
  cell("GS-3d /crew shows the mark and the word gate; the summary counts the tab", /⚠ integrator +gate/.test(list) && /Waiting for you: 1/.test(list), list)
  const side = status.sidebarLines([s], 100_000_000)
  cell("GS-3e the side panel row has the mark ⚠", side.rows.some((r) => r.mark === "⚠"), JSON.stringify(side.rows))
  const q = st({ end: { at: 90_000_000, text: "Итог.\nВливать в main?", ownerAfter: false }, gate: { at: 80_000_000 } })
  cell("GS-3f a question at the end of the turn wins: ordinary owner state, no gate mark", q.state === "owner" && !q.gate && status.markOf(q) === "?", JSON.stringify(q))
  const w = st({ end: { at: 90_000_000, text: "Остановлено до вашего решения; спецификация ещё не утверждена.", ownerAfter: false }, gate: { at: 80_000_000 } })
  cell("GS-3g a waiting phrase with a gate shows the gate mark, not the pause mark", w.gate === true && status.markOf(w) === "⚠", JSON.stringify(w))
  const busy = status.statusOf({ card: { project: "p62", role: "integrator", title: "x", session: "sesG3" }, busy: true, asked: [], now: 100_000_000, watches: [], gate: { at: 80_000_000 } })
  cell("GS-3h a tab that works now is working, the gate is not shown", busy.state === "working" && !busy.gate, JSON.stringify(busy))
  const none = st({ end: idle })
  cell("GS-3i no gate - no mark: the old behavior of an ordinary stop", !none.gate && none.state !== "owner", JSON.stringify(none))
}

// ---- the plugin
const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
const SESS = ["sesGATE1", "sesGATE2", "sesGATE3", "sesGATE4", "sesGATE5"]
for (const s of SESS) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, proj, s)

const mod = await import("../index.ts")
const hooks = {}
const tools = {}
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
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  command: { list: async () => [], transform: async () => {} },
  events: { on: async () => {} },
}
const WPID = 626262
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: SESS.map((sessionID) => ({ sessionID, active: true, busy: false })) }))
beat()
const heart = setInterval(beat, 300)

const stop = await mod.default.setup(ctx)
for (const s of SESS) await hooks.context({ sessionID: s, system: [], model: { id: "opus", providerID: "claude-code" } })
const logLine = (s, text = "остановка на воротах") => tools.log_line.execute({ file: "doc/tasks/007-x/log.md", kind: "ворота", text }, { sessionID: s })
const idleTab = (s) => core.saveCard({ ...core.readJson(core.cardFile(s)), busy: false })
const endTurn = async (s, text, at = Date.now()) => {
  msg(s, "assistant", { content: [{ type: "text", text }] }, at)
  msg(s, "idle", { outcome: "completed" }, at + 1)
  idleTab(s)
}
const letters = (s) => prompts.filter((p) => p.sessionID === s && /без вопроса владельцу/.test(p.text))
const stOf = (s) => core.readJson(path.join(status.STATUS, `${s}.json`))
const gateOf = (s) => (gs?.gateOf ? gs.gateOf(s) : undefined)
const T0 = Date.now() - 60_000
msg("sesGATE5", "idle", { outcome: "completed" }, T0 - 5000) // an earlier turn ended; the owner's word below starts the turn that writes the gate
for (const s of SESS) {
  msg(s, "user", { text: "поручение" }, T0)
  msg(s, "assistant", { content: [{ type: "text", text: "работаю" }] }, T0 + 1)
}

// ---- GS-2 log_line
const before = existsSync(LOG) ? readFileSync(LOG, "utf8") : ""
const a1 = await logLine("sesGATE1")
cell("GS-2a no open question: the entry is written and the answer says no question to the owner, with the tool and the three parts", /Записано в log.md: .* ворота: /.test(a1.content) && /Ворота записаны, но вопроса владельцу нет: задай его сейчас инструментом question — вопрос, рекомендация, довод/.test(a1.content), JSON.stringify(a1))
cell("GS-2b the entry is in log.md (not refused)", readFileSync(LOG, "utf8").length > before.length && / ворота: остановка на воротах/.test(readFileSync(LOG, "utf8")), "")
cell("GS-2c the plugin noted the stop of that tab", !!gateOf("sesGATE1"), JSON.stringify(gateOf("sesGATE1")))
const a1b = await tools.log_line.execute({ file: "doc/tasks/007-x/log.md", kind: "документ", text: "x" }, { sessionID: "sesGATE1" })
cell("GS-2d other kinds: the plain answer", /^Записано в log.md: /.test(a1b.content) && !/вопроса владельцу нет/.test(a1b.content), JSON.stringify(a1b))
fw.handleFormEvent({ type: "form.created", data: { form: { id: "frm_g2", sessionID: "sesGATE2", title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Принять серию?", options: [{ label: "Да (Recommended)" }, { label: "Нет" }] }] } } })
const a2 = await logLine("sesGATE2")
cell("GS-2e a question to the owner is open (forms/): the plain answer, no stop noted", /^Записано в log.md: /.test(a2.content) && !/вопроса владельцу нет/.test(a2.content) && !gateOf("sesGATE2"), JSON.stringify([a2, gateOf("sesGATE2")]))
const a0 = await tools.log_line.execute({ file: "doc/tasks/007-x/log.md", kind: "ворота", text: "без сессии" }, {})
cell("GS-2f no session in the call: written, plain answer", /^Записано в log.md: /.test(a0.content), JSON.stringify(a0))

// ---- GS-4 the plugin: letter, mark, clearing
await endTurn("sesGATE1", "Остановлено до вашего решения; спецификация ещё не утверждена, чистая серия не принята.", Date.now() + 200)
await wait(2500)
const l1 = letters("sesGATE1")
cell("GS-4a the turn ended with the gate and no question: ONE letter to the tab (question tool, recommendation, reason)", l1.length === 1 && /question/.test(l1[0].text) && /рекомендац/.test(l1[0].text) && /довод/.test(l1[0].text), JSON.stringify(prompts.map((p) => [p.sessionID, p.text.slice(0, 80)])))
const s1 = stOf("sesGATE1")
cell("GS-4b the status: ждёт вашего решения, вопроса нет, mark gate (instead of the waiting phrase)", s1?.state === "owner" && s1.gate === true && !s1.wait && /ждёт вашего решения, вопроса нет/.test(s1.detail), JSON.stringify(s1))
await wait(1500)
cell("GS-4c no second letter for the same stop", letters("sesGATE1").length === 1, String(letters("sesGATE1").length))
fw.handleFormEvent({ type: "form.created", data: { form: { id: "frm_g1", sessionID: "sesGATE1", title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Принять серию?", options: [{ label: "Да (Recommended)" }, { label: "Нет" }] }] } } })
await wait(800)
const s1b = stOf("sesGATE1")
cell("GS-4d an open question clears the mark and the stop", !gateOf("sesGATE1") && !s1b?.gate, JSON.stringify([gateOf("sesGATE1"), s1b]))

// the question was already open: no letter, no mark
await endTurn("sesGATE2", "Остановлено: вопрос задан инструментом.", Date.now() + 200)
await wait(1500)
cell("GS-4e a stop with an open question: no letter, no mark", letters("sesGATE2").length === 0 && !stOf("sesGATE2")?.gate, JSON.stringify([letters("sesGATE2").length, stOf("sesGATE2")]))

// the owner writes after the stop: the mark goes, no more letters
await logLine("sesGATE3")
await endTurn("sesGATE3", "Сводка выше, ворота записаны.", Date.now() + 200)
await wait(2000)
cell("GS-4f another tab gets its own letter and the mark", letters("sesGATE3").length === 1 && stOf("sesGATE3")?.gate === true, JSON.stringify([letters("sesGATE3").length, stOf("sesGATE3")]))
msg("sesGATE3", "user", { text: "ок, смотрю, продолжай" }, Date.now() + 100)
await wait(1500)
cell("GS-4g the owner's word clears the mark and the stop", !gateOf("sesGATE3") && !stOf("sesGATE3")?.gate, JSON.stringify([gateOf("sesGATE3"), stOf("sesGATE3")]))
cell("GS-4h still one letter", letters("sesGATE3").length === 1, String(letters("sesGATE3").length))

// the turn ends with a question mark (the text question): it is a question - no letter
await logLine("sesGATE4")
await endTurn("sesGATE4", "Итог по серии.\n\nПринять серию?", Date.now() + 200)
await wait(1800)
cell("GS-4i a question mark at the end of the turn counts as a question: no letter, ordinary owner state", letters("sesGATE4").length === 0 && stOf("sesGATE4")?.state === "owner" && !stOf("sesGATE4")?.gate, JSON.stringify([letters("sesGATE4").length, stOf("sesGATE4")]))
cell("GS-4j and the stop is cleared", !gateOf("sesGATE4"), JSON.stringify(gateOf("sesGATE4")))

// a tab that works now gets nothing: the letter waits for the end of the turn
await logLine("sesGATE5")
await wait(1200)
cell("GS-4k the turn is not over (no idle row after the stop): no letter, no mark yet, the stop is kept (the word that started the turn is not a word after the stop)", letters("sesGATE5").length === 0 && !stOf("sesGATE5")?.gate && !!gateOf("sesGATE5"), JSON.stringify([letters("sesGATE5").length, stOf("sesGATE5")]))

clearInterval(heart)
stop?.()
db.close()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-gate-stop.test: FAIL ${fail}` : "crew-gate-stop.test ok")
process.exit(fail ? 1 : 0)

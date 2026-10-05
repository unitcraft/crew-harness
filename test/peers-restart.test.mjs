// Self-test of picking up after a restart (plan 002, Ph.4; node >= 24):  node test/peers-restart.test.mjs
// The previous OpenCode process died between writing a task's status and the next step. On disk: a task whose
// session was never created, a submitted task whose tab reviewer got neither its mark nor its letter, a task sent to
// rework without the letter to the executor, a cleaned task without its summaries, a review session recorded but not
// created. A new plugin finishes each step exactly once; a second restart adds nothing.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-restart-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_POLL_MS = "100"
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db")
delete process.env.NOVA_PEERS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "opencode-peers.json"), JSON.stringify({ spawn_limits: { reviewer: 2 } }))

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const DEAD = 999999
const card = (session, extra = {}) => core.saveCard({ session, role: "worker", auto: false, title: session, directory: proj, repo: "proj", project: "proj", pid: DEAD, updated: Date.now(), ...extra })
card("sesINTEG1", { role: "integrator" })
card("sesREVTAB")
const base = (n, extra) => {
  const t = tasks.createTask({ project: "proj", title: `t${n}`, goal: `goal ${n}`, criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: `q${n}`, status: "running", kind: "spawn", directory: proj })
  Object.assign(t, extra)
  tasks.saveTask(t)
  return t
}
// #1: recorded, the session never created
base(1, { status: "starting", executor: "ses_restart1planned" })
// #2: submitted, the tab reviewer recorded, nothing else
card("sesEXEC2", { spawned: { by: "sesINTEG1", task: "t2", tier: "light", status: "running", at: Date.now(), qid: "q2" }, task: { project: "proj", n: 2 } })
base(2, { status: "submitted", executor: "sesEXEC2", report: "сделал 2", reviewer: "sesREVTAB", review_kind: "tab", review_qid: "rq2" })
// #3: sent to rework, the letter to the executor lost
card("sesEXEC3", { spawned: { by: "sesINTEG1", task: "t3", tier: "light", status: "running", at: Date.now(), qid: "q3" }, task: { project: "proj", n: 3 } })
card("sesREV3", { review: { project: "proj", n: 3 } })
base(3, { status: "rework", executor: "sesEXEC3", reviewer: "sesREV3", review_kind: "tab", review_qid: "rq3", rework: 1, rework_note: "исправь пустой ввод", reviewer_role: "proj.worker", review_letter: "review-proj-3-1" })
core.postLetter("sesREV3", { id: "review-proj-3-1", from_role: "proj.integrator", from_session: "sesINTEG1", to: "sesREV3", time: Date.now(), text: "старое письмо с приёмкой" })
// #4: cleaned, the summaries lost, the executor session still open
card("sesEXEC4", { spawned: { by: "sesINTEG1", task: "t4", tier: "light", status: "running", at: Date.now(), qid: "q4" }, task: { project: "proj", n: 4 } })
base(4, { status: "cleaned", executor: "sesEXEC4", reviewer: "sesREVTAB", review_kind: "tab", reviewer_role: "proj.worker", branch: "t4-x", checks: { tests: "ok" } })
// #5: submitted, a review session recorded but not created
card("sesEXEC5", { spawned: { by: "sesINTEG1", task: "t5", tier: "light", status: "running", at: Date.now(), qid: "q5" }, task: { project: "proj", n: 5 } })
base(5, { status: "submitted", executor: "sesEXEC5", report: "сделал 5", reviewer: "ses_restart5review", review_kind: "spawn", review_qid: "rq5" })

// #6: running, its executor stuck with reminders counted — the reconcile must not reset them
card("sesEXEC6", { spawned: { by: "sesINTEG1", task: "t6", tier: "light", status: "running", at: Date.now(), qid: "q6" }, task: { project: "proj", n: 6 } })
base(6, { status: "running", executor: "sesEXEC6" })
core.addObligation("sesEXEC6", { qid: "q6", from_session: "sesINTEG1", from_role: "proj.integrator", at: Date.now(), nudges: 2, empty: 3, stuck: true })

// one live window with the tabs of the owner
const WPID = 919191
mkdirSync(core.WINDOWS, { recursive: true })
const tabs = ["sesINTEG1", "sesREVTAB", "sesREV3"].map((sessionID) => ({ sessionID, active: false, busy: false }))
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)

const mod = await import("../index.ts")
const delivered = []
const sessions = new Map()
const creates = []
const mkctx = () => ({
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => {
      creates.push(req.id)
      if (!sessions.has(req.id)) sessions.set(req.id, req)
      return { id: req.id }
    },
    update: async () => {},
    hook: async () => {},
  },
  tool: { transform: async () => {} },
})
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))

let stop = await mod.default.setup(mkctx())
await wait(3500)
cell("#1: the session is created once and the task runs", sessions.has("ses_restart1planned") && tasks.loadTask("proj", 1).status === "running" && got("ses_restart1planned", "ЗАДАЧА #1").length === 1, JSON.stringify({ s: [...sessions.keys()], st: tasks.loadTask("proj", 1).status }))
const rv = core.allCards().find((c) => c.session === "sesREVTAB")
cell("#2: the tab reviewer gets its mark and the review letter", rv?.review?.n === 2 && got("sesREVTAB", "ПРИЁМКА задачи #2").length === 1, JSON.stringify({ mark: rv?.review, n: got("sesREVTAB", "ПРИЁМКА").length }))
cell("#2: the reviewer's obligation is there", core.obligationsOf("sesREVTAB").some((o) => o.qid === "rq2"), JSON.stringify(core.obligationsOf("sesREVTAB")))
cell("#3: the executor gets the rework letter with the remarks", got("sesEXEC3", "исправь пустой ввод").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesEXEC3").map((d) => d.text.slice(0, 80))))
cell("#3: the executor's obligation is there", core.obligationsOf("sesEXEC3").some((o) => o.qid === "q3"), JSON.stringify(core.obligationsOf("sesEXEC3")))
cell("#3: the reviewer does not get the review letter again", got("sesREV3", "старое письмо").length + got("sesREV3", "ПРИЁМКА").length <= 1, JSON.stringify(got("sesREV3", "")))
cell("#4: the integrator gets the summary quietly", got("sesINTEG1", "принята и влита").filter((d) => d.synthetic).length === 1, JSON.stringify(got("sesINTEG1", "принята")))
cell("#4: the executor session is closed", core.allCards().find((c) => c.session === "sesEXEC4")?.spawned?.status === "closed", "open")
cell("#5: the review session is created once with its letter", sessions.has("ses_restart5review") && got("ses_restart5review", "ПРИЁМКА задачи #5").length === 1, JSON.stringify([...sessions.keys()]))

const o6 = core.obligationsOf("sesEXEC6").find((o) => o.qid === "q6")
cell("#6: an existing obligation keeps its counters", o6?.nudges === 2 && o6?.stuck === true, JSON.stringify(o6))

// a second restart: nothing new
const before = { letters: delivered.length, creates: sessions.size }
stop?.()
stop = await mod.default.setup(mkctx())
await wait(3500)
const extra = delivered.slice(before.letters)
cell("a second restart adds no letters", extra.length === 0, JSON.stringify(extra.map((d) => `${d.sessionID}: ${d.text.slice(0, 60)}`)))
cell("a second restart creates no sessions", sessions.size === before.creates, JSON.stringify([...sessions.keys()]))

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-restart.test: FAIL ${fail}` : "peers-restart.test ok")
process.exit(fail ? 1 : 0)

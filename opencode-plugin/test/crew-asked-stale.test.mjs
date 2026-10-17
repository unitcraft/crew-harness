// Self-test of stale asked questions (task 032, node >= 24):  node test/crew-asked-stale.test.mjs
// A question (crew_send expect_reply) is an obligation of the addressee; it used to close only by reply_to. Now it also
// closes by any letter of the addressee to the author, by a closed addressee session, and one older than ASKED_STALE_MIN
// stops holding the "reply" state (it is shown as a separate "stale" line of /crew).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-asked-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
// authors A1..A5 and addressees D1..D5 (one pair per case); DX is another addressee
const A = ["sesA1", "sesA2", "sesA3", "sesA4", "sesA5"]
const D = ["sesD1", "sesD2", "sesD3", "sesD4", "sesD5", "sesDX"]
const S = [...A, ...D]
for (const s of S) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, proj, s)

const core = await import("../core.ts")
const status = await import("../status.ts")
const mod = await import("../index.ts")
const hooks = {}
const events = {}
const tools = {}
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  command: { list: async () => [], transform: async (fn) => fn({ add: () => {} }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const st = (s) => JSON.parse(readFileSync(path.join(status.STATUS, `${s}.json`), "utf8"))

const WPID = 525252
// the addressee D3 has no tab: its session is closed (a spawned card marked closed, below)
const tabs = S.filter((s) => s !== "sesD3").map((sessionID, i) => ({ sessionID, active: i === 0, busy: false }))
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)

const stop = await mod.default.setup(ctx)
for (const s of S) {
  await hooks.context({ sessionID: s, system: [], model: { id: "opus", providerID: "claude-code" } })
  db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`u${s}`, s, "user", 1, Date.now(), Date.now(), JSON.stringify({ text: "go" }))
  db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`a${s}`, s, "assistant", 2, Date.now(), Date.now(), JSON.stringify({ content: [{ type: "text", text: "Done." }] }))
  db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`i${s}`, s, "idle", 3, Date.now(), Date.now(), JSON.stringify({ outcome: "succeeded" }))
  await events["session.idle"]({ properties: { sessionID: s } })
}
// D3: a closed spawned session
const c3 = core.readJson(core.cardFile("sesD3"))
core.saveCard({ ...c3, spawned: { by: "sesA3", task: "x", tier: "light", status: "closed", at: Date.now(), qid: "qspawn" } })

const ask = (n, to, ageMs, qid) => core.addObligation(to, { qid, from_session: A[n - 1], from_role: "worker", at: Date.now() - ageMs, nudges: 0 })
ask(1, "sesD1", 60_000, "qLETTER")
ask(2, "sesD2", 60_000, "qOTHER")
ask(3, "sesD3", 60_000, "qCLOSED")
ask(4, "sesD4", 3 * 3_600_000, "qOLD")
ask(5, "sesD5", 60_000, "qFRESH")
await wait(1200)
cell("setup: a fresh question holds the reply state", st("sesA5").state === "reply" && st("sesA5").asked.length === 1, JSON.stringify(st("sesA5")))
cell("setup: a question of 60 s is open for A1 too", st("sesA1").state === "reply", st("sesA1").state)

// 1. the addressee writes the author a plain letter (no reply_to) -> the question is closed
await tools.crew_send.execute({ to: "sesA1", text: "Here is the status of the thing you asked about." }, { sessionID: "sesD1" })
// 2. a letter of ANOTHER addressee (DX) to A2 does not close the question to D2
await tools.crew_send.execute({ to: "sesA2", text: "A letter from somebody else entirely." }, { sessionID: "sesDX" })
await wait(1200)
cell("a plain letter of the addressee closes the question (no reply_to)", st("sesA1").state !== "reply" && !st("sesA1").asked.length, JSON.stringify(st("sesA1")))
cell("a letter from ANOTHER addressee does not close it", st("sesA2").state === "reply" && st("sesA2").asked[0]?.qid === "qOTHER", JSON.stringify(st("sesA2")))
cell("a closed addressee session closes the question", st("sesA3").state !== "reply" && !st("sesA3").asked.length && core.obligationsOf("sesD3").length === 0, JSON.stringify(st("sesA3")))
cell("a question older than ASKED_STALE_MIN does not hold the reply state", st("sesA4").state !== "reply" && !st("sesA4").asked.length && st("sesA4").askedStale?.[0]?.qid === "qOLD", JSON.stringify(st("sesA4")))
cell("a fresh unanswered question still gives reply", st("sesA5").state === "reply" && st("sesA5").asked[0].qid === "qFRESH", JSON.stringify(st("sesA5")))
const text = status.formatStatuses(status.readStatuses(), Date.now(), "proj")
cell("/crew counts the stale question (stale asks), the session stays out of the reply state", /stale asks 1\b/.test(text) && !/вопрос устарел/.test(text) && st("sesA4").state !== "reply", text)
cell("the stale constant is 120 minutes", core.ASKED_STALE_MIN === 120, String(core.ASKED_STALE_MIN))

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-asked-stale.test: FAIL ${fail}` : "crew-asked-stale.test ok")
process.exit(fail ? 1 : 0)

// Self-test of session status (plan 004; node >= 24):  node test/peers-status.test.mjs
// The plugin writes status/<session>.json: working (a turn runs), waiting for the owner (the last answer ends with a
// question and the owner has not written since), waiting for a watch, idle. A new question to the owner posts a
// notice with attention to every live window; unanswered, it is repeated after owner_reminder_min. The /peers text
// puts the waiting ones first.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-status-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_POLL_MS = "100"
process.env.NOVA_PEERS_STATUS_MS = "100"
const dbPath = path.join(tmp, "opencode.db")
process.env.NOVA_PEERS_DB = dbPath
delete process.env.NOVA_PEERS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
// a reminder every 0.03 min (1.8 s) to see the repeat in a test
writeFileSync(path.join(proj, ".opencode", "opencode-peers.json"), JSON.stringify({ owner_reminder_min: 0.03 }))

const db = new DatabaseSync(dbPath)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
let seq = 0
const msg = (session, type, data, at = Date.now()) => db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run(`m${++seq}`, session, type, seq, at, at, JSON.stringify(data))
const S = ["sesINTEG1", "sesWORK01", "sesWATCH1", "sesIDLE01"]
for (const s of S) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(s, proj, s)

const core = await import("../core.ts")
const status = await import("../status.ts")
const watch = await import("../watch.ts")
const mod = await import("../index.ts")
const hooks = {}
const events = {}
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async () => {} },
  events: { on: async (name, cb) => (events[name] = cb) },
}
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const st = (s) => JSON.parse(readFileSync(path.join(status.STATUS, `${s}.json`), "utf8"))

const WPID = 515151
const tabs = S.map((sessionID, i) => ({ sessionID, active: i === 0, busy: sessionID === "sesWORK01" }))
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
const notices = () => {
  try {
    return readdirSync(path.join(core.NOTICES, String(WPID))).map((f) => JSON.parse(readFileSync(path.join(core.NOTICES, String(WPID), f), "utf8")))
  } catch {
    return []
  }
}

const stop = await mod.default.setup(ctx)
// each tab had a turn: the request (card), its messages, the idle row
for (const s of S) {
  await hooks.context({ sessionID: s, system: [], model: { id: "opus", providerID: "claude-code" } })
  msg(s, "user", { text: "сделай" })
  const text = {
    sesINTEG1: "Сделал слияние.\n\nПушить main на три зеркала при этом расхождении?\n\nСТОП: вопрос",
    sesWORK01: "работаю",
    sesWATCH1: "Поставил наблюдение, жду.",
    sesIDLE01: "Готово. Вопросов нет — в тексте «как?» не в конце.",
  }[s]
  msg(s, "assistant", { content: [{ type: "text", text }] })
  if (s !== "sesWORK01") {
    msg(s, "idle", { outcome: "succeeded" })
    await events["session.idle"]({ properties: { sessionID: s } })
  }
}
watch.requestWatch({ session: "sesWATCH1", command: "sleep 8", cwd: os.tmpdir(), note: "CI" })
await wait(1200)

cell("endsWithQuestion: a question line before a signature line", status.endsWithQuestion("Итог.\n\nПушить main?\n\nСТОП: вопрос") === "Пушить main?", status.endsWithQuestion("Итог.\n\nПушить main?\n\nСТОП: вопрос"))
cell("endsWithQuestion: no question at the end", status.endsWithQuestion("Готово. Как? — так.\nВсё.") === undefined, "found one")
cell("the integrator waits for the owner, with the question", st("sesINTEG1").state === "owner" && st("sesINTEG1").question === "Пушить main на три зеркала при этом расхождении?", JSON.stringify(st("sesINTEG1")))
cell("a busy tab is working", st("sesWORK01").state === "working", st("sesWORK01").state)
cell("a tab with a watch waits for it", st("sesWATCH1").state === "watch" && /«CI»/.test(st("sesWATCH1").detail), st("sesWATCH1").detail)
cell("a tab with nothing open is idle", st("sesIDLE01").state === "idle", st("sesIDLE01").state)
const n1 = notices().filter((n) => n.sessionID === "sesINTEG1")
cell("the owner gets a notice with attention", n1.length === 1 && n1[0].attention === true && /ждёт вашего ответа/.test(n1[0].title), JSON.stringify(notices()))
cell("no notice for the others", notices().every((n) => n.sessionID === "sesINTEG1"), JSON.stringify(notices()))

// the repeat: wait for it (a loaded machine stretches the pass), then check it came no sooner than the limit
const mine = () =>
  readdirSync(path.join(core.NOTICES, String(WPID)))
    .filter((f) => JSON.parse(readFileSync(path.join(core.NOTICES, String(WPID), f), "utf8")).sessionID === "sesINTEG1")
    .map((f) => Number(f.split("-")[0]))
    .sort()
for (let i = 0; i < 80 && mine().length < 2; i++) await wait(100)
const at = mine()
cell("unanswered: the notice is repeated after owner_reminder_min, not sooner", at.length >= 2 && at[1] - at[0] >= 1_700, JSON.stringify(at))

// the owner answers: a user message after the idle row
msg("sesINTEG1", "user", { text: "да, пушь" })
await wait(600)
cell("after the owner's answer it no longer waits for the owner", st("sesINTEG1").state !== "owner", st("sesINTEG1").state)

const spawned = status.statusOf({ card: { session: "ses_task01", role: "worker", auto: false, title: "#9 x", directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now(), spawned: { by: "sesINTEG1", task: "x", tier: "light", status: "running", at: Date.now(), qid: "q9" } }, busy: false, end: { at: Date.now(), text: "Сдал. Базу опустит интегратор или мне?", ownerAfter: false }, asked: [], now: Date.now() })
cell("a task session's closing question: 'question' (integrator or owner), no notice", spawned.state === "question" && /интегратора или вас/.test(spawned.detail), JSON.stringify(spawned))
const text = status.formatStatuses(status.readStatuses().concat([{ ...st("sesIDLE01"), session: "sesQ", state: "owner", detail: "ждёт вас с 10:00: Можно?", question: "Можно?" }]), Date.now(), "proj")
cell("/peers text: the waiting first, the count in the project line", /ВАС ЖДУТ: 1/.test(text) && text.split("\n")[1].includes("▶"), text)

clearInterval(heart)
stop?.()
db.close()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {} // the detached watch may still hold a file
console.log(fail ? `peers-status.test: FAIL ${fail}` : "peers-status.test ok")
process.exit(fail ? 1 : 0)

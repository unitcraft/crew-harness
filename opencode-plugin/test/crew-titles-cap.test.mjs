// Self-test of the renaming of task sessions (node >= 24):  node test/crew-titles-cap.test.mjs
// Every session.update writes into the OpenCode database inside the service process; renaming hundreds of old sessions at once
// froze the service for seconds. Closed tasks older than a day are not renamed at all; the rest is renamed a few per pass.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-titlescap-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_TITLES_PER_PASS = "2"
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ allow_default_models: true }))

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const card = (session, extra = {}) =>
  core.saveCard({ session, role: "worker", auto: false, title: session, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now(), ...extra })
const base = (n, extra) => {
  const t = tasks.createTask({ project: "proj", title: `t${n}`, goal: `goal ${n}`, criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: `q${n}`, status: "running", kind: "assign", executor: `sesEX${n}`, directory: proj })
  Object.assign(t, extra)
  tasks.saveTask(t)
  return t
}
card("sesINTEG1", { role: "integrator" })
// 6 open tasks, 6 closed ones that were last touched three days ago
for (let n = 1; n <= 6; n++) {
  card(`sesEX${n}`, { spawned: { by: "sesINTEG1", task: `t${n}`, tier: "light", status: "running", at: Date.now(), qid: `q${n}` }, task: { project: "proj", n } })
  base(n, { status: "running", executor: `sesEX${n}` })
}
const OLD = Date.now() - 3 * 86_400_000
for (let n = 7; n <= 12; n++) {
  card(`sesEX${n}`, { spawned: { by: "sesINTEG1", task: `t${n}`, tier: "light", status: "closed", at: OLD, qid: `q${n}` }, task: { project: "proj", n } })
  const t = base(n, { status: "done", executor: `sesEX${n}`, reviewer: "sesREVX", review_kind: "tab", reviewer_role: "proj.worker", branch: `t${n}-x` })
  const f = path.join(tmp, "opencode", "crew-harness", "tasks", "proj", `${n}.json`)
  const j = JSON.parse(readFileSync(f, "utf8"))
  j.updated = OLD
  writeFileSync(f, JSON.stringify(j))
}

const mod = await import("../index.ts")
const updates = []
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    update: async ({ sessionID, title }) => updates.push({ sessionID, title, at: Date.now() }),
    hook: async () => {},
  },
  tool: { transform: async () => {} },
}

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const stop = await mod.default.setup(ctx)
const openRenamed = () => new Set(updates.filter((u) => /^sesEX[1-6]$/.test(u.sessionID)).map((u) => u.sessionID)).size
for (const end = Date.now() + 20_000; Date.now() < end && openRenamed() < 6; ) await wait(200)
await wait(1500)
cell("every open task session is renamed in the end", openRenamed() === 6, JSON.stringify(updates.map((u) => u.sessionID)))
cell("old closed task sessions are not renamed", !updates.some((u) => /^sesEX(7|8|9|10|11|12)$/.test(u.sessionID)), JSON.stringify(updates.filter((u) => /^sesEX(7|8|9|10|11|12)$/.test(u.sessionID))))
// the cap: with 2 per pass the 6 renames are spread over several passes (not all in one go)
const times = updates.filter((u) => /^sesEX[1-6]$/.test(u.sessionID)).map((u) => u.at)
cell("the renames are spread over several passes", new Set(times.map((t) => Math.floor(t / 80))).size >= 2, JSON.stringify(times.map((t) => t - times[0])))

stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-titles-cap.test: FAIL ${fail}` : "crew-titles-cap.test ok")
process.exit(fail ? 1 : 0)

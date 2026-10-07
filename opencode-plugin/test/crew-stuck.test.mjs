// Self-test: a hung OpenCode call does not stop the plugin (node >= 24):  node test/crew-stuck.test.mjs
// Live 2026-10-05: one call inside the plugin's pass never returned, the pass stayed "busy" and every next pass
// returned at once -- no delivery, no reminders, no watchdog for 47 minutes, silently. Here session.create never
// returns (a task waits to start): letters to an open tab must still go out, and the hung step is logged.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-stuck-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STEP_MS = "300"
process.env.CREW_HARNESS_PASS_STUCK_MS = "800"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), "{}")

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
// a task waiting to start: the plugin's pass calls session.create for it -- which never returns
tasks.createTask({ project: "proj", title: "t1", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: "q1", status: "starting", kind: "spawn", directory: proj })

const mod = await import("../index.ts")
const hooks = {}
const events = {}
const delivered = []
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
    synthetic: async ({ sessionID, text }) => delivered.push({ sessionID, text, synthetic: true }),
    update: async () => {},
    create: () => new Promise(() => {}), // hangs forever
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
const WPID = 727272
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [{ sessionID: "sesTAB01", active: true, busy: false }] }))
beat()
const heart = setInterval(beat, 300)
const stop = await mod.default.setup(ctx)
await hooks.context({ sessionID: "sesTAB01", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]?.({ properties: { sessionID: "sesTAB01" } })
await wait(1500) // the pass has hit the hung create by now

core.postLetter("sesTAB01", { id: "l1", from_role: "proj.worker", from_session: "sesOTHER", to: "sesTAB01", time: Date.now(), text: "after-hang" })
for (let i = 0; i < 60 && !delivered.some((d) => d.text.includes("after-hang")); i++) {
  beat()
  await wait(100)
}
cell("a hung session.create does not stop delivery", delivered.some((d) => d.text.includes("after-hang")), JSON.stringify(delivered.map((d) => d.text.slice(0, 40))))
const logText = readFileSync(path.join(os.tmpdir(), "crew-harness.log"), "utf8").split("\n").filter((l) => l.includes(`pid=`) || l.includes("pass step")).slice(-50).join("\n")
cell("the hung step is in the log", /pass step resumeTasks failed: Error: step resumeTasks took over 300 ms/.test(logText), "no log line")

// the main thread held for 1.5 s: the lag monitor writes how long and what the plugin was doing (2026-10-06)
const lagMark = Date.now()
for (const end = Date.now() + 1_500; Date.now() < end; ) {}
await new Promise((r) => setTimeout(r, 800))
const lagLines = readFileSync(path.join(os.tmpdir(), "crew-harness.log"), "utf8").split("\n").filter((l) => /loop lag \d+ ms/.test(l) && Date.parse(l.slice(0, 24)) >= lagMark - 50)
cell("a held main thread is logged with its length and the plugin's step", lagLines.some((l) => { const ms = Number(/loop lag (\d+) ms/.exec(l)[1]); return ms >= 1_000 && /шаг прохода|плагин свободен/.test(l) && /память \d+ МБ/.test(l) }), JSON.stringify(lagLines))

clearInterval(heart)
stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-stuck.test: FAIL ${fail}` : "crew-stuck.test ok")
process.exit(fail ? 1 : 0)

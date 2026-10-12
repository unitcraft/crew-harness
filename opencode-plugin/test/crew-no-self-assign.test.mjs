// Self-test of task 035 (node >= 24):  node test/crew-no-self-assign.test.mjs
// - crew_task assign to the author's own session is refused and creates no task; to another tab it goes;
// - project setting allow_self_assign: true allows it; reassign never gives the task to the author's session.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-noself-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
delete process.env.CREW_HARNESS_PRESENCE
const dirA = path.join(tmp, "alpha")
mkdirSync(path.join(dirA, ".opencode"), { recursive: true })
const settings = (v) => writeFileSync(path.join(dirA, ".opencode", "crew-harness.json"), JSON.stringify(v))
settings({})

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const updates = []
const dirOf = { sesAINT: dirA, sesAOWN: dirA }
const ctx = {
  location: { directory: tmp },
  options: { projects: { alpha: dirA } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf[sessionID] ?? dirA }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => ({ id: req.id }),
    update: async (req) => updates.push(req),
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const WPID = 727272
const tabs = Object.keys(dirOf).map((sessionID) => ({ sessionID, active: false, busy: false }))
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
for (const s of Object.keys(dirOf)) {
  await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: s } })
}
await call("crew_role", "sesAINT", { role: "integrator" })


const GOAL = { goal: "сделать X", criteria: "тест зелёный" }
const own = await call("crew_task", "sesAINT", { action: "assign", session: "sesAINT", ...GOAL })
cell("assign to the own session is refused with the reason", /не назначается на собственную сессию/.test(own) && /crew_spawn/.test(own) && /allow_self_assign/.test(own), own)
cell("... and no task is created", tasks.listTasks("alpha").length === 0, JSON.stringify(tasks.listTasks("alpha")))
const other = await call("crew_task", "sesAINT", { action: "assign", session: "sesAOWN", ...GOAL })
cell("assign to another tab (the owner's) goes", /отдана вкладке sesAOWN/.test(other), other)
cell("... the executor is that tab, the author is the integrator", tasks.listTasks("alpha")[0]?.executor === "sesAOWN" && tasks.listTasks("alpha")[0]?.author === "sesAINT", JSON.stringify(tasks.listTasks("alpha")))
const n1 = tasks.listTasks("alpha")[0].n
const re = await call("crew_task", "sesAINT", { action: "reassign", n: n1 })
const t1 = tasks.loadTask("alpha", n1)
cell("reassign gives a new session, never the author's", t1.executor !== "sesAINT" && t1.executor !== "sesAOWN", re + JSON.stringify(t1))
await call("crew_task", "sesAINT", { action: "cancel", n: n1 })
settings({ allow_self_assign: true })
await wait(50)
const allowed = await call("crew_task", "sesAINT", { action: "assign", session: "sesAINT", ...GOAL })
cell("allow_self_assign: true allows assign to the own session", /отдана вкладке sesAINT/.test(allowed), allowed)
await call("crew_task", "sesAINT", { action: "cancel", n: tasks.listTasks("alpha").at(-1).n })
settings({ allow_self_assign: false })
await wait(50)
const off = await call("crew_task", "sesAINT", { action: "assign", session: "sesAINT", ...GOAL })
cell("allow_self_assign: false refuses", /не назначается на собственную сессию/.test(off), off)

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? "crew-no-self-assign.test: FAIL " + fail : "crew-no-self-assign.test ok")
process.exit(fail ? 1 : 0)

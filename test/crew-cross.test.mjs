// Self-test of work across projects (plan 002, Ph.5; node >= 24):  node test/crew-cross.test.mjs
// - inbound of the receiving project: integrator (default: from another project only to its integrator), any, none;
//   a refused letter names the address to use;
// - an order: alpha's integrator orders work from beta's integrator (crew_task order); beta takes it with its own
//   task (crew_spawn {parent: "alpha#N"}); the order follows that task: cleaned -> the order is done (a quiet summary
//   to alpha's integrator), cancelled -> a call; no session and no title marks for the order.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-cross-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
delete process.env.CREW_HARNESS_PRESENCE
const dirA = path.join(tmp, "alpha")
const dirB = path.join(tmp, "beta")
for (const d of [dirA, dirB]) mkdirSync(path.join(d, ".opencode"), { recursive: true })
const inbound = (v) => writeFileSync(path.join(dirB, ".opencode", "crew-harness.json"), JSON.stringify(v ? { inbound: v } : {}))
inbound(undefined)

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const updates = []
const dirOf = { sesAINT: dirA, sesAWRK: dirA, sesBINT: dirB, sesBWRK: dirB }
const ctx = {
  location: { directory: tmp },
  options: { projects: { alpha: dirA, beta: dirB } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf[sessionID] ?? dirB }, time: {} }),
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
await call("crew_role", "sesBINT", { role: "integrator" })

// 1. inbound: integrator (default)
const toWorker = await call("crew_send", "sesAINT", { to: "beta.worker", text: "сделай X" })
cell("inbound integrator: a letter to another project's worker is refused, naming the integrator", /только интегратору/.test(toWorker) && /beta\.integrator/.test(toWorker), toWorker)
const toSession = await call("crew_send", "sesAINT", { to: "sesBWRK", text: "сделай X" })
cell("... by session id too", /только интегратору/.test(toSession), toSession)
const toAll = await call("crew_send", "sesAINT", { to: "beta.all", text: "всем" })
cell("... and to beta.all", /только интегратору/.test(toAll), toAll)
const toInt = await call("crew_send", "sesAINT", { to: "beta.integrator", text: "вопрос интегратору" })
await wait()
cell("a letter to beta's integrator goes", /Отправлено/.test(toInt) && got("sesBINT", "вопрос интегратору").length === 1, toInt)
const own = await call("crew_send", "sesAWRK", { to: "sesAINT", text: "своему" })
cell("the own project is not limited", /Отправлено/.test(own), own)
inbound("any")
const anyOk = await call("crew_send", "sesAINT", { to: "beta.worker", text: "можно всем" })
cell("inbound any: a worker of beta may be written to", /Отправлено/.test(anyOk), anyOk)
inbound("none")
const none = await call("crew_send", "sesAINT", { to: "beta.integrator", text: "нельзя" })
cell("inbound none: even the integrator is refused", /inbound: none/.test(none), none)
inbound(undefined)

// 2. an order
const ord = await call("crew_task", "sesAINT", { action: "order", to: "beta.integrator", title: "библиотека", goal: "добавить функцию в beta", criteria: "тест зелёный" })
const order = tasks.loadTask("alpha", 1)
await wait()
cell("the order is recorded in alpha's journal (no session)", order?.kind === "order" && order.order_to === "beta" && !order.executor && /Заказ #1/.test(ord), JSON.stringify(order))
const letter = got("sesBINT", "ЗАКАЗ проекта alpha #1")
cell("beta's integrator gets the order with the parent to use", letter.length === 1 && letter[0].text.includes('parent: "alpha#1"'), letter[0]?.text)
const notMine = await call("crew_task", "sesAWRK", { action: "order", to: "beta.integrator", goal: "g", criteria: "c" })
cell("only the integrator orders", /только интегратор/.test(notMine), notMine)
const sp = await call("crew_spawn", "sesBINT", { title: "функция", goal: "сделать функцию", criteria: "тест", parent: "alpha#1" })
const child = tasks.loadTask("beta", 1)
cell("beta's task carries the parent; the order knows its child", child?.parent?.project === "alpha" && tasks.loadTask("alpha", 1).child?.n === 1 && tasks.loadTask("alpha", 1).history.some((h) => /принят в работу в beta: #1/.test(h.note ?? "")), sp)
const wrongParent = await call("crew_spawn", "sesBINT", { title: "x", goal: "g", criteria: "c", parent: "alpha#99" })
cell("an unknown parent is refused", /Заказа alpha#99/.test(wrongParent), wrongParent)

// 3. beta's task is cleaned (as the reviewer would) -> the order is done; alpha's integrator gets a quiet summary
tasks.taskEvent(tasks.loadTask("beta", 1), "test", "cleaned", "принята")
await wait(2600) // the reconcile pass (every 2 s)
cell("the order is done when beta's task is cleaned", tasks.loadTask("alpha", 1).status === "cleaned", JSON.stringify(tasks.loadTask("alpha", 1).history))
cell("alpha's integrator gets a quiet summary", got("sesAINT", "Заказ #1 «библиотека» выполнен проектом beta").some((d) => d.synthetic), JSON.stringify(got("sesAINT", "Заказ")))
cell("no titles of integrators were touched", !updates.some((u) => u.sessionID === "sesAINT" || u.sessionID === "sesBINT"), JSON.stringify(updates))

// 4. a cancelled child -> a call to the orderer
await call("crew_task", "sesAINT", { action: "order", to: "beta.integrator", title: "второй", goal: "g2", criteria: "c2" })
await call("crew_spawn", "sesBINT", { title: "второй", goal: "g2", criteria: "c2", parent: "alpha#2" })
await call("crew_task", "sesBINT", { action: "cancel", n: 3, text: "не будем" })
await wait()
cell("a cancelled child wakes the orderer with a call", got("sesAINT", "Заказ #2 «второй»: задачу beta #3 отменили").some((d) => !d.synthetic), JSON.stringify(got("sesAINT", "Заказ #2")))

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-cross.test: FAIL ${fail}` : "crew-cross.test ok")
process.exit(fail ? 1 : 0)

// Self-test of opencode-harness-crew task tiers (node >= 24):  node test/crew-tier.test.mjs
// crew_send {tier}: a FREE holder of the role whose model is of that tier or stronger gets the letter, weaker
// never; none -> the letter queues and goes to the first suitable window that frees up. busy is set by the
// window's request and cleared by the session.idle event. Red probe: CREW_MODULE=<copy that ignores busy>.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-tier-"))
process.env.XDG_DATA_HOME = tmp
process.env.HARNESS_CREW_PRESENCE ??= "all" // every tab taken as open (presence has its own test)
process.env.HARNESS_CREW_DB = path.join(tmp, "absent.db")
process.env.HARNESS_CREW_POLL_MS = "60"
const mod = await import(process.env.CREW_MODULE ?? "../index.ts")

const hooks = {}
const tools = {}
const events = {}
const delivered = []
const ctx = {
  location: { directory: tmp },
  session: {
    get: async ({ sessionID }) => {
      if (sessionID.startsWith("sesGONE")) throw new Error("session not found") // closed: the session no longer exists
      if (sessionID.startsWith("sesARCH")) return { id: sessionID, title: sessionID, location: { directory: tmp }, time: { archived: Date.now() - 1000 } }
      return { id: sessionID, title: sessionID, location: { directory: tmp } }
    },
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
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
const OPUS = { id: "claude-opus-5-5", providerID: "anthropic-sdk", variant: "medium" }
const SONNET = { id: "claude-sonnet-5-5", providerID: "anthropic-sdk", variant: "low" }
const HAIKU = { id: "claude-haiku-4-5", providerID: "anthropic-sdk" }
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms))
const call = (name, sid, input = {}) => tools[name].execute(input, { sessionID: sid })
// A window that is idle: its model is known from its request, it is not busy.
const idleWin = async (sid, model, role) => {
  await hooks["model.request"]({ sessionID: sid, kind: "primary", model })
  await call("crew_role", sid, { role })
}
const busyWin = async (sid, model, role) => {
  await idleWin(sid, model, role)
  await hooks.context({ sessionID: sid, system: [], model })
}
const got = (text) => delivered.filter((d) => d.text.includes(text)).map((d) => d.sessionID)
const sender = "sesSENDER"
await idleWin(sender, SONNET, "boss")

// 1. heavy with a free Opus and a free Haiku -> Opus
await idleWin("sesOPUS01", OPUS, "w1")
await idleWin("sesHAIKU1", HAIKU, "w1")
delivered.length = 0
const r1 = await call("crew_send", sender, { to: "w1", text: "hard-1", tier: "heavy" })
await wait()
cell("heavy goes to the free Opus, not to Haiku", JSON.stringify(got("hard-1")) === '["sesOPUS01"]', JSON.stringify(got("hard-1")))
cell("the answer names session, model and tier", /sesOPUS01/.test(r1.content) && /opus/.test(r1.content) && /heavy/.test(r1.content), r1.content)

// 2. light with a busy Haiku and a free Sonnet -> Sonnet
await busyWin("sesHAIKU2", HAIKU, "w2")
await idleWin("sesSONNE2", SONNET, "w2")
delivered.length = 0
await call("crew_send", sender, { to: "w2", text: "easy-1", tier: "light" })
await wait()
cell("light skips the busy Haiku and takes the free Sonnet", JSON.stringify(got("easy-1")) === '["sesSONNE2"]', JSON.stringify(got("easy-1")))

// 3. heavy with Haiku only -> queued; an Opus joins and is free -> delivered to it
await idleWin("sesHAIKU3", HAIKU, "w3")
delivered.length = 0
const q = await call("crew_send", sender, { to: "w3", text: "hard-q", tier: "heavy" })
await wait()
cell("heavy with only Haiku is queued, not delivered and not refused", /В очереди/.test(q.content) && got("hard-q").length === 0, q.content + JSON.stringify(got("hard-q")))
cell("the queue answer lists the candidates", /sesHAIKU3/.test(q.content), q.content)
await idleWin("sesOPUS03", OPUS, "w3")
await wait(250)
cell("when an Opus frees up the queued letter goes to it", JSON.stringify(got("hard-q")) === '["sesOPUS03"]', JSON.stringify(got("hard-q")))

// 4. busy / idle by events
await idleWin("sesSONNE4", SONNET, "w4")
await hooks.context({ sessionID: "sesSONNE4", system: [], model: SONNET })
delivered.length = 0
const busyRes = await call("crew_send", sender, { to: "w4", text: "mid-busy", tier: "medium" })
await wait()
cell("a window busy with its request is not chosen (queued)", /В очереди/.test(busyRes.content) && got("mid-busy").length === 0, busyRes.content)
cell("the plugin subscribed to session.idle", typeof events["session.idle"] === "function", JSON.stringify(Object.keys(events)))
await events["session.idle"]({ properties: { sessionID: "sesSONNE4" } })
await wait(250)
cell("the idle event frees the window and the queued letter goes to it", JSON.stringify(got("mid-busy")) === '["sesSONNE4"]', JSON.stringify(got("mid-busy")))

// 5. light may NOT use a weaker... heavy never goes DOWN: a free Sonnet is not taken by heavy
await idleWin("sesSONNE5", SONNET, "w5")
delivered.length = 0
const down = await call("crew_send", sender, { to: "w5", text: "hard-down", tier: "heavy" })
await wait()
cell("a heavy task never goes down to a Sonnet", /В очереди/.test(down.content) && got("hard-down").length === 0, down.content)
// but medium may go UP to a free Opus
await idleWin("sesOPUS06", OPUS, "w6")
delivered.length = 0
await call("crew_send", sender, { to: "w6", text: "mid-up", tier: "medium" })
await wait()
cell("a medium task may take a free Opus when no Sonnet is free", JSON.stringify(got("mid-up")) === '["sesOPUS06"]', JSON.stringify(got("mid-up")))

// 6. without tier: the previous behaviour (two live holders -> refused with the list)
await idleWin("sesNOTIER1", SONNET, "w7")
await idleWin("sesNOTIER2", HAIKU, "w7")
delivered.length = 0
const plain = await call("crew_send", sender, { to: "w7", text: "plain" })
await wait()
cell("without tier a shared role with two holders is still refused with the list", /держат 2/.test(plain.content) && got("plain").length === 0, plain.content)

// 6b. liveness by last activity is NOT a criterion, presence is: a tab silent for 2 hours but open in a live window
// gets the heavy task; a tab open in no window (closed, its window closed or frozen) does not, whatever its pid.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs"
const cardsDir = path.join(tmp, "opencode", "harness-crew", "cards")
const oldCard = (sid, model, role, pid = process.pid) =>
  writeFileSync(path.join(cardsDir, `${sid}.json`), JSON.stringify({ session: sid, role, auto: false, title: "", directory: tmp, repo: "t", model, modelAt: Date.now() - 7200_000, modelFrom: "request", pid, updated: Date.now() - 7200_000 }))
const OPUS_ID = "anthropic-sdk/claude-opus-5-5#medium"
oldCard("sesQUIET1", OPUS_ID, "w8")
oldCard("sesCLOSE1", OPUS_ID, "w9")
oldCard("sesFROZE1", OPUS_ID, "w10")
// real presence from here: one live window with every tab but the closed one, one frozen window with sesFROZE1
delete process.env.HARNESS_CREW_PRESENCE
const windowsDir = path.join(tmp, "opencode", "harness-crew", "windows")
mkdirSync(windowsDir, { recursive: true })
const openTabs = () => readdirSync(cardsDir).map((f) => f.replace(/\.json$/, "")).filter((s) => s !== "sesCLOSE1" && s !== "sesFROZE1").map((sessionID) => ({ sessionID, active: false, busy: false }))
const beat = () => writeFileSync(path.join(windowsDir, "777001.json"), JSON.stringify({ pid: 777001, beat: Date.now(), tabs: openTabs() }))
beat()
const heart = setInterval(beat, 300)
writeFileSync(path.join(windowsDir, "777002.json"), JSON.stringify({ pid: 777002, beat: Date.now() - 10_000, tabs: [{ sessionID: "sesFROZE1", active: true }] }))

delivered.length = 0
const quiet = await call("crew_send", sender, { to: "w8", text: "quiet-heavy", tier: "heavy" })
await wait()
cell("a tab silent for 2 hours but open in a live window gets the heavy task", JSON.stringify(got("quiet-heavy")) === '["sesQUIET1"]', quiet.content + JSON.stringify(got("quiet-heavy")))

delivered.length = 0
const closed = await call("crew_send", sender, { to: "w9", text: "closed-heavy", tier: "heavy" })
await wait(300)
cell("a tab open in no window is not a candidate", got("closed-heavy").length === 0 && /В очереди/.test(closed.content), closed.content)

delivered.length = 0
const froze = await call("crew_send", sender, { to: "w10", text: "froze-heavy", tier: "heavy" })
await wait(300)
cell("a tab of a frozen window is not a candidate", got("froze-heavy").length === 0, froze.content)

// all: reaches the quiet tab, skips the closed and the frozen
delivered.length = 0
await call("crew_send", sender, { to: "all", text: "to-everyone" })
await wait(600)
const everyone = got("to-everyone")
cell("all reaches the quiet tab", everyone.includes("sesQUIET1"), JSON.stringify(everyone))
cell("all skips the closed and the frozen", !everyone.includes("sesCLOSE1") && !everyone.includes("sesFROZE1"), JSON.stringify(everyone))
clearInterval(heart)

// 7. a bad tier is refused; tier with all is refused
const bad = await call("crew_send", sender, { to: "w7", text: "x", tier: "huge" })
cell("an unknown tier is refused", /не годится/.test(bad.content), bad.content)

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-tier.test: FAIL ${fail}` : "crew-tier.test ok")
process.exit(fail ? 1 : 0)

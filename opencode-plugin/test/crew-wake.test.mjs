// Self-test: a letter wakes only a tab open in a live window (node >= 24):  node test/crew-wake.test.mjs
// Presence comes from the window plugin (tui.ts): windows/<pid>.json with a heartbeat and the open tabs (core.ts
// "ПРИСУТСТВИЕ"). A closed tab or a window whose heartbeat froze (closed with X, crashed) is not woken: the letter
// waits and goes out once the tab is open again. A letter to a background tab leaves a notice for that window.
// wake: false letters are queued with resume: false (no turn of their own).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-wake-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(proj, { recursive: true })

const mod = await import(process.env.CREW_MODULE ?? "../index.ts")
const core = await import(process.env.CREW_CORE ?? "../core.ts")
const sessions = ["sesFRONT1", "sesBACK01", "sesCLOSED", "sesSENDER"]
const hooks = {}
const tools = {}
const delivered = []
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const events = {}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
// a positive check waits for its event (up to 10 s), beating the window: a fixed pause lost on a loaded machine
const until = async (cond, ms = 10_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) {
    beat()
    await wait(100)
  }
}
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
// the window beats before every send: synchronous plugin calls hold the timer, and on a loaded machine the last beat
// got older than WINDOW_STALE_MS -- the window looked closed (failed under the gates' load, 2026-10-05)
const send = async (to, text, extra = {}) => {
  beat()
  return (await tools.crew_send.execute({ to, text, ...extra }, { sessionID: "sesSENDER" })).content
}

// one live window: sesFRONT1 on screen, sesBACK01 in the background, sesSENDER in the background too
const WPID = 424242
const tabs = [
  { sessionID: "sesFRONT1", active: true, busy: false },
  { sessionID: "sesBACK01", active: false, busy: false },
  { sessionID: "sesSENDER", active: false, busy: false },
]
mkdirSync(core.WINDOWS, { recursive: true })
let frozen = false
const beat = () => !frozen && writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), route: "sesFRONT1", tabs }))
beat()
const heart = setInterval(beat, 300)

for (const s of sessions) await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })
for (const s of sessions) await events["session.idle"]?.({ properties: { sessionID: s } }) // their turns ended

beat()
cell("liveWindows sees the window", core.liveWindows().some((w) => w.pid === WPID), JSON.stringify(core.liveWindows()))
cell("tabOf finds a background tab", core.tabOf("sesBACK01")?.tab.active === false, "no")
cell("tabOf: a tab in no window is closed", core.tabOf("sesCLOSED") === undefined, "found")

// the tab on screen is woken at once
const r1 = await send("sesFRONT1", "to-front")
await until(() => got("sesFRONT1", "to-front").length === 1)
cell("a letter to the tab on screen is delivered", got("sesFRONT1", "to-front").length === 1, JSON.stringify(delivered))
cell("crew_send says it is being delivered", /доставляется сейчас/.test(r1), r1)

// a background tab is woken too, and its window gets a notice with Open
await send("sesBACK01", "to-back")
await until(() => got("sesBACK01", "to-back").length === 1)
cell("a letter to a background tab is delivered", got("sesBACK01", "to-back").length === 1, JSON.stringify(delivered))
const noticeDir = path.join(core.NOTICES, String(WPID))
const notices = existsSync(noticeDir) ? readdirSync(noticeDir).filter((f) => f.endsWith(".json")) : []
cell("the window gets a notice for its background tab", notices.length >= 1, JSON.stringify(notices))

// a closed tab: the letter waits, then goes out once the tab is opened
const r2 = await send("sesCLOSED", "to-closed")
await wait()
cell("a letter to a closed tab waits", got("sesCLOSED", "to-closed").length === 0, JSON.stringify(delivered))
cell("crew_send says the tab is closed", /вкладка закрыта/.test(r2), r2)
tabs.push({ sessionID: "sesCLOSED", active: false, busy: false })
await until(() => got("sesCLOSED", "to-closed").length === 1)
cell("the tab is opened -> the letter goes out", got("sesCLOSED", "to-closed").length === 1, JSON.stringify(delivered))

// a tab open in the window that never made a request (no card yet) still gets a letter by its id
tabs.push({ sessionID: "ses_FRESH1", active: false, busy: false })
await send("ses_FRESH1", "to-fresh")
await until(() => got("ses_FRESH1", "to-fresh").length === 1)
cell("a fresh open tab without a card gets its letter", got("ses_FRESH1", "to-fresh").length === 1, JSON.stringify(delivered))

// wake: false -> no turn of its own: written with synthetic (resume: false); OpenCode puts it before the tab's next
// message in the same step
const r3 = await send("sesFRONT1", "fyi-letter", { wake: false })
await until(() => got("sesFRONT1", "fyi-letter").length === 1)
const fyi = got("sesFRONT1", "fyi-letter")
cell("a wake:false letter goes in with synthetic, resume:false", fyi.length === 1 && fyi[0].synthetic && fyi[0].resume === false, JSON.stringify(fyi))
cell("crew_send says no wake", /без пробуждения/.test(r3), r3)
cell("a waking letter is a prompt, not synthetic", got("sesFRONT1", "to-front").every((d) => !d.synthetic), JSON.stringify(got("sesFRONT1", "to-front")))
// a closed tab gets a quiet letter too (it wakes nobody); a waking one waits
await send("ses_GONE01", "quiet-to-closed", { wake: false })
await wait()
cell("a quiet letter waits for a tab with no card", got("ses_GONE01", "quiet-to-closed").length === 0, "delivered")

// letters to a busy tab wait for the end of its turn (anything sent now would become an extra step), then go in one prompt
tabs[0].busy = true // the window shows the turn running
beat()
const r4 = await send("sesFRONT1", "while-busy")
await wait()
cell("a busy tab is not prompted", got("sesFRONT1", "while-busy").length === 0, JSON.stringify(got("sesFRONT1", "while-busy")))
cell("crew_send says the tab is busy", /занята/.test(r4), r4)
await send("sesFRONT1", "after-last-step")
await wait()
cell("still busy: not prompted", got("sesFRONT1", "after-last-step").length === 0 && got("sesFRONT1", "while-busy").length === 0, "prompted")
tabs[0].busy = false
beat()
await events["session.idle"]({ properties: { sessionID: "sesFRONT1" } })
await until(() => got("sesFRONT1", "after-last-step").length === 1)
const woke = got("sesFRONT1", "after-last-step")
cell("the turn ended -> one prompt with both letters", woke.length === 1 && !woke[0].synthetic && woke[0].text.includes("while-busy"), JSON.stringify(woke))

// the window froze (closed with X / crashed): after 3 s its tabs count as closed
frozen = true
await wait(core.WINDOW_STALE_MS + 600)
cell("a frozen window has no live tabs", core.tabOf("sesFRONT1") === undefined, "still open")
await send("sesFRONT1", "after-freeze")
await wait()
cell("a tab of a frozen window is not woken", got("sesFRONT1", "after-freeze").length === 0, JSON.stringify(delivered))
frozen = false
await until(() => got("sesFRONT1", "after-freeze").length === 1)
cell("the window comes back -> the letter goes out", got("sesFRONT1", "after-freeze").length === 1, JSON.stringify(delivered))

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-wake.test: FAIL ${fail}` : "crew-wake.test ok")
process.exit(fail ? 1 : 0)

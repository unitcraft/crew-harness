// Self-test: delivery in two steps, at-least-once (node >= 24):  node test/crew-delivery.test.mjs
// A letter is claimed into delivering/, moved to read/ only after session.prompt succeeds, released back to
// the inbox when prompt fails, and a claim left behind by a crashed process comes back after CLAIM_MAX_MS.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-delivery-"))
process.env.XDG_DATA_HOME = tmp
process.env.HARNESS_CREW_POLL_MS = "100"
process.env.HARNESS_CREW_DB = path.join(tmp, "absent.db")
process.env.HARNESS_CREW_PRESENCE = "all"
const proj = path.join(tmp, "proj")
mkdirSync(proj, { recursive: true })

const mod = await import(process.env.CREW_MODULE ?? "../index.ts")
const core = await import(process.env.CREW_CORE ?? "../core.ts")
const base = path.join(tmp, "opencode", "harness-crew")
const hooks = {}
const tools = {}
const delivered = []
let failPrompt = false
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj } }),
    prompt: async ({ sessionID, text }) => {
      if (failPrompt) throw new Error("prompt failed (test)")
      delivered.push({ sessionID, text })
    },
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const files = (...p) => {
  const d = path.join(base, ...p)
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")) : []
}
const claims = () => (existsSync(path.join(base, "delivering")) ? readdirSync(path.join(base, "delivering")) : [])

await hooks.context({ sessionID: "sesRECEIVER", system: [], model: { id: "x", providerID: "y" } })
await hooks.context({ sessionID: "sesSENDER", system: [], model: { id: "x", providerID: "y" } })
const send = (text) => tools.crew_send.execute({ to: "sesRECEIVER", text }, { sessionID: "sesSENDER" })

// 1. normal delivery: in read/, nothing left in delivering/
await send("ok-letter")
await wait()
cell("a letter is delivered", delivered.some((d) => d.text.includes("ok-letter")), JSON.stringify(delivered))
cell("it is in read/ after the prompt", files("read", "sesRECEIVER").length === 1, files("read", "sesRECEIVER").join(","))
cell("no claim is left behind", claims().length === 0, claims().join(","))

// 2. prompt fails: the letter goes back to the inbox (and is not in read/)
failPrompt = true
await send("fail-letter")
await wait()
cell("a failed prompt leaves the letter in the inbox", files("inbox", "sesRECEIVER").length === 1 && files("read", "sesRECEIVER").length === 1, `inbox ${files("inbox", "sesRECEIVER")} read ${files("read", "sesRECEIVER")}`)
cell("and no claim is left behind", claims().length === 0, claims().join(","))
failPrompt = false
await wait()
cell("the next tick delivers it", delivered.some((d) => d.text.includes("fail-letter")), JSON.stringify(delivered))

// 3. a crashed process left a claim: young claims stay, old ones come back and are delivered
const letter = (id, text) => JSON.stringify({ id, from_role: "x.sender", from_session: "sesSENDER", to: "sesRECEIVER", text, time: Date.now() })
const young = path.join(base, "delivering", `999999-${Date.now()}`, "sesRECEIVER")
mkdirSync(young, { recursive: true })
writeFileSync(path.join(young, "1-young.json"), letter("1-young", "young-claim"))
const old = path.join(base, "delivering", `999998-${Date.now() - core.CLAIM_MAX_MS - 1000}`, "sesRECEIVER")
mkdirSync(old, { recursive: true })
writeFileSync(path.join(old, "2-old.json"), letter("2-old", "crashed-claim"))
await wait()
cell("a stale claim of a crashed process comes back and is delivered", delivered.some((d) => d.text.includes("crashed-claim")), JSON.stringify(delivered.map((d) => d.text.slice(-40))))
cell("a young claim (another process mid-delivery) is left alone", !delivered.some((d) => d.text.includes("young-claim")) && existsSync(path.join(young, "1-young.json")), "touched")
cell("recoverClaims returns the young one too once it is old", core.recoverClaims(0) === 1 && files("inbox", "sesRECEIVER").length === 1, files("inbox", "sesRECEIVER").join(","))

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-delivery.test: FAIL ${fail}` : "crew-delivery.test ok")
process.exit(fail ? 1 : 0)

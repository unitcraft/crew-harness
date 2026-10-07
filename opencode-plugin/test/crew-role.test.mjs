// Self-test of crew-harness role handover (node >= 24):  node test/crew-role.test.mjs
// Two sessions in one process: A holds `integrator`, B takes it with force. After A's next
// turn A must NOT hold `integrator` again, and a letter to `integrator` must reach B only.
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-test-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_PRESENCE ??= "all" // every tab taken as open (presence has its own test)
import { mkdirSync, writeFileSync } from "node:fs"
// Project config: integrator is exclusive here (the plugin itself names no role).
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ exclusive_roles: ["integrator"] }))
const mod = await import("../index.ts")

const hooks = {}
const tools = {}
const delivered = []
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj } }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
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
const turn = (sid) => hooks.context({ sessionID: sid, system: [] })
const call = (name, sid, input = {}) => tools[name].execute(input, { sessionID: sid })

await turn("sesAAAAAA")
await turn("sesBBBBBB")
await call("crew_role", "sesAAAAAA", { role: "integrator" })
const take = await call("crew_role", "sesBBBBBB", { role: "integrator", force: true })
cell("B takes the role with force", /integrator/.test(take.content), take.content)

await turn("sesAAAAAA") // A's next turn must not write the old role back
const list = (await call("crew_list", "sesBBBBBB")).content
const holders = list.split("\n").filter((l) => /^\*?\s*[a-z0-9-]+\.integrator\b/.test(l.trim().replace(/^\*\s*/, "")))
cell("exactly one window holds integrator", holders.length === 1, list)
cell("the holder is B", holders.length === 1 && /sesBBBBBB/.test(holders[0]), list)

delivered.length = 0
await call("crew_send", "sesCCCCCC", { to: "integrator", text: "probe" })
await new Promise((r) => setTimeout(r, 50))
const to = delivered.filter((d) => /probe/.test(d.text)).map((d) => d.sessionID)
cell("letter to integrator reaches B only", to.length === 1 && to[0] === "sesBBBBBB", JSON.stringify(to))

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-role.test: FAIL ${fail}` : "crew-role.test ok")
process.exit(fail ? 1 : 0)

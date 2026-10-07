// Self-test of crew-harness project config (node >= 24):  node test/crew-config.test.mjs
// Base roles of the plugin: `integrator` exclusive, everything else shared. The project config ADDS exclusive
// roles (exclusive_roles), appends help_extra and may override the tier lists (tiers).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-config-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_PRESENCE ??= "all" // every tab taken as open (presence has its own test)
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
const bare = path.join(tmp, "bare")
const proj = path.join(tmp, "proj")
mkdirSync(bare, { recursive: true })
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ exclusive_roles: ["lead"], help_extra: "EXTRA-LINE-OF-THE-PROJECT" }))

const dirOf = (sid) => (sid.startsWith("sesP") ? proj : bare)
const mod = await import(process.env.CREW_MODULE ?? "../index.ts")
const hooks = {}
const tools = {}
const ctx = {
  location: { directory: bare },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf(sessionID) } }),
    prompt: async () => {},
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

// WITHOUT a config: `lead` is shared (both windows hold it); `integrator` is the plugin's one base exclusive role
await turn("sesB1")
await turn("sesB2")
await call("crew_role", "sesB1", { role: "lead" })
const joined = await call("crew_role", "sesB2", { role: "lead" })
cell("without a config a project role is shared: the second window joins", /теперь «lead»/.test(joined.content) && !/занята/.test(joined.content), joined.content)
await call("crew_role", "sesB1", { role: "integrator" })
const baseRefused = await call("crew_role", "sesB2", { role: "integrator" })
cell("without a config integrator is exclusive (base role)", /занята/.test(baseRefused.content), baseRefused.content)

// WITH a config: `lead` becomes exclusive
await turn("sesP1")
await turn("sesP2")
await call("crew_role", "sesP1", { role: "lead" })
const refused = await call("crew_role", "sesP2", { role: "lead" })
cell("with a config the listed role is exclusive: refused without force", /занята/.test(refused.content), refused.content)
const forced = await call("crew_role", "sesP2", { role: "lead", force: true })
cell("with a config force takes the exclusive role", /теперь «lead»/.test(forced.content), forced.content)

const helpProj = (await call("crew_help", "sesP1")).content
const helpBare = (await call("crew_help", "sesB1")).content
cell("help_extra is appended for the project", helpProj.includes("EXTRA-LINE-OF-THE-PROJECT"), helpProj.slice(-120))
cell("help_extra is absent without a config", !helpBare.includes("EXTRA-LINE-OF-THE-PROJECT"), "present")
cell("default help names neutral roles", /integrator/.test(helpBare) && /worker/.test(helpBare), "missing")

// The config is named after the package (crew-harness.json); the old name nova-peers.json is no longer read
// (plan 002, decision 16: nv-lang moved to a settings repository 2026-10-05).
const legacy = path.join(tmp, "legacy")
const both = path.join(tmp, "both")
mkdirSync(path.join(legacy, ".opencode"), { recursive: true })
mkdirSync(path.join(both, ".opencode"), { recursive: true })
writeFileSync(path.join(legacy, ".opencode", "nova-peers.json"), JSON.stringify({ help_extra: "OLD-NAME-LINE" }))
writeFileSync(path.join(both, ".opencode", "nova-peers.json"), JSON.stringify({ help_extra: "OLD-NAME-LINE" }))
writeFileSync(path.join(both, ".opencode", "crew-harness.json"), JSON.stringify({ help_extra: "NEW-NAME-LINE" }))
cell("the old name nova-peers.json is not read", !mod.helpFor(legacy).includes("OLD-NAME-LINE"), "read")
cell("crew-harness.json wins over the old name", mod.helpFor(both).includes("NEW-NAME-LINE") && !mod.helpFor(both).includes("OLD-NAME-LINE"), "wrong file")

// A project config saved with a BOM (Notepad, PowerShell 5.1 "utf8") is read like any other.
const bom = path.join(tmp, "bom")
mkdirSync(path.join(bom, ".opencode"), { recursive: true })
writeFileSync(path.join(bom, ".opencode", "crew-harness.json"), "\uFEFF" + JSON.stringify({ help_extra: "BOM-LINE" }))
cell("a config saved with a BOM is read", mod.helpFor(bom).includes("BOM-LINE"), "BOM file ignored")
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-config.test: FAIL ${fail}` : "crew-config.test ok")
process.exit(fail ? 1 : 0)

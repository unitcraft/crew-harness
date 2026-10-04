// Self-test of nova-peers project config (node >= 24):  node test/peers-config.test.mjs
// Base roles of the plugin: `integrator` exclusive, everything else shared. The project config ADDS exclusive
// roles (exclusive_roles), appends help_extra and may override the tier lists (tiers).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-config-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db")
const bare = path.join(tmp, "bare")
const proj = path.join(tmp, "proj")
mkdirSync(bare, { recursive: true })
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "opencode-peers.json"), JSON.stringify({ exclusive_roles: ["lead"], help_extra: "EXTRA-LINE-OF-THE-PROJECT" }))

const dirOf = (sid) => (sid.startsWith("sesP") ? proj : bare)
const mod = await import(process.env.PEERS_MODULE ?? "../index.ts")
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
await call("peer_role", "sesB1", { role: "lead" })
const joined = await call("peer_role", "sesB2", { role: "lead" })
cell("without a config a project role is shared: the second window joins", /теперь «lead»/.test(joined.content) && !/занята/.test(joined.content), joined.content)
await call("peer_role", "sesB1", { role: "integrator" })
const baseRefused = await call("peer_role", "sesB2", { role: "integrator" })
cell("without a config integrator is exclusive (base role)", /занята/.test(baseRefused.content), baseRefused.content)

// WITH a config: `lead` becomes exclusive
await turn("sesP1")
await turn("sesP2")
await call("peer_role", "sesP1", { role: "lead" })
const refused = await call("peer_role", "sesP2", { role: "lead" })
cell("with a config the listed role is exclusive: refused without force", /занята/.test(refused.content), refused.content)
const forced = await call("peer_role", "sesP2", { role: "lead", force: true })
cell("with a config force takes the exclusive role", /теперь «lead»/.test(forced.content), forced.content)

const helpProj = (await call("peer_help", "sesP1")).content
const helpBare = (await call("peer_help", "sesB1")).content
cell("help_extra is appended for the project", helpProj.includes("EXTRA-LINE-OF-THE-PROJECT"), helpProj.slice(-120))
cell("help_extra is absent without a config", !helpBare.includes("EXTRA-LINE-OF-THE-PROJECT"), "present")
cell("default help names neutral roles", /lead/.test(helpBare) && /worker/.test(helpBare), "missing")

// The config is named after the package (opencode-peers.json); the old name nova-peers.json is still read when
// the new one is absent, and the new one wins when both exist.
const legacy = path.join(tmp, "legacy")
const both = path.join(tmp, "both")
mkdirSync(path.join(legacy, ".opencode"), { recursive: true })
mkdirSync(path.join(both, ".opencode"), { recursive: true })
writeFileSync(path.join(legacy, ".opencode", "nova-peers.json"), JSON.stringify({ help_extra: "OLD-NAME-LINE" }))
writeFileSync(path.join(both, ".opencode", "nova-peers.json"), JSON.stringify({ help_extra: "OLD-NAME-LINE" }))
writeFileSync(path.join(both, ".opencode", "opencode-peers.json"), JSON.stringify({ help_extra: "NEW-NAME-LINE" }))
cell("the old name nova-peers.json is still read", mod.helpFor(legacy).includes("OLD-NAME-LINE"), "missing")
cell("opencode-peers.json wins over the old name", mod.helpFor(both).includes("NEW-NAME-LINE") && !mod.helpFor(both).includes("OLD-NAME-LINE"), "wrong file")

// A project config saved with a BOM (Notepad, PowerShell 5.1 "utf8") is read like any other.
const bom = path.join(tmp, "bom")
mkdirSync(path.join(bom, ".opencode"), { recursive: true })
writeFileSync(path.join(bom, ".opencode", "opencode-peers.json"), "\uFEFF" + JSON.stringify({ help_extra: "BOM-LINE" }))
cell("a config saved with a BOM is read", mod.helpFor(bom).includes("BOM-LINE"), "BOM file ignored")
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-config.test: FAIL ${fail}` : "peers-config.test ok")
process.exit(fail ? 1 : 0)

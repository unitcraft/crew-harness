// Self-test of opencode-peers shared roles and window models (node >= 24):  node test/peers-shared.test.mjs
// Red probe: NOVA_PEERS_NO_AMBIGUITY_GUARD=1 -- not supported by the plugin; the probe in the report removes the
// guard line from a copy (see the commit message). This file asserts the behaviour.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-shared-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_PRESENCE ??= "all" // every tab taken as open (presence has its own test)
import { mkdirSync, writeFileSync } from "node:fs"
// Project config: integrator is exclusive here (the plugin itself names no role).
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "opencode-peers.json"), JSON.stringify({ exclusive_roles: ["integrator"] }))
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db") // no database: models come from the event
const mod = await import(process.env.PEERS_MODULE ?? "../index.ts")

const hooks = {}
const tools = {}
const delivered = []
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: `win-${sessionID}`, location: { directory: proj } }),
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
const turn = (sid, model) => hooks.context({ sessionID: sid, system: [], model })
const call = (name, sid, input = {}) => tools[name].execute(input, { sessionID: sid })
const wait = () => new Promise((r) => setTimeout(r, 50))

await turn("sesAAAAAA", { id: "claude-sonnet-5-5", providerID: "anthropic-sdk", variant: "low" })
await turn("sesBBBBBB", { id: "k3", providerID: "kimi", variant: "" })
await turn("sesCCCCCC", { id: "claude-opus-4", providerID: "anthropic-sdk" })

// 1. model visible in peer_list
const list = (await call("peer_list", "sesAAAAAA")).content
cell("peer_list shows the Sonnet window's model", /sesAAAAAA.*anthropic-sdk\/claude-sonnet-5-5#low/.test(list), list)
cell("peer_list shows the Kimi window's model", /sesBBBBBB.*kimi\/k3/.test(list), list)

// 2. a second window joins a shared role without force
const r1 = await call("peer_role", "sesAAAAAA", { role: "tester" })
const r2 = await call("peer_role", "sesBBBBBB", { role: "tester" })
cell("first window takes tester", /tester/.test(r1.content) && !/занята/.test(r1.content), r1.content)
cell("second window joins tester without force", /теперь «tester»/.test(r2.content) && !/занята/.test(r2.content), r2.content)
const l2 = (await call("peer_list", "sesCCCCCC")).content
cell("both windows hold tester", l2.split("\n").filter((l) => /^\s*[a-z0-9-]+\.tester\b/.test(l)).length === 2, l2)

// 3. a letter to a shared role with two live holders is refused with the list; by id it reaches exactly one
delivered.length = 0
const refused = await call("peer_send", "sesCCCCCC", { to: "tester", text: "who-takes-this" })
await wait()
cell("letter to tester with two holders is refused", /держат 2/.test(refused.content), refused.content)
cell("the refusal lists both sessions and models", /sesAAAAAA/.test(refused.content) && /sesBBBBBB/.test(refused.content) && /kimi\/k3/.test(refused.content), refused.content)
cell("nothing was delivered to anybody", delivered.filter((d) => /who-takes-this/.test(d.text)).length === 0, JSON.stringify(delivered))
await call("peer_send", "sesCCCCCC", { to: "sesBBBBBB", text: "by-id" })
await wait()
const got = delivered.filter((d) => /by-id/.test(d.text)).map((d) => d.sessionID)
cell("letter by session id reaches exactly that one", got.length === 1 && got[0] === "sesBBBBBB", JSON.stringify(got))

// 4. integrator stays exclusive
await call("peer_role", "sesAAAAAA", { role: "integrator" })
const take = await call("peer_role", "sesBBBBBB", { role: "integrator" })
cell("integrator is still exclusive: refused without force", /занята/.test(take.content), take.content)
const forced = await call("peer_role", "sesBBBBBB", { role: "integrator", force: true })
cell("integrator moves with force", /теперь «integrator»/.test(forced.content), forced.content)

// 5. all reaches every live neighbour
delivered.length = 0
await call("peer_role", "sesAAAAAA", { role: "tester" })
await call("peer_role", "sesCCCCCC", { role: "tester" })
await call("peer_send", "sesBBBBBB", { to: "all", text: "to-all" })
await wait()
const all = delivered.filter((d) => /to-all/.test(d.text)).map((d) => d.sessionID).sort()
cell("all reaches both tester windows", all.length === 2 && all[0] === "sesAAAAAA" && all[1] === "sesCCCCCC", JSON.stringify(all))

// 5b. the context hint is CACHE-STABLE: it sits before the whole history, so anything that changes
// between requests (neighbours, their last-turn time) re-bills the entire history. Neighbours with
// models come from peer_list instead.
const hev = { sessionID: "sesCCCCCC", system: [], model: { id: "claude-opus-4", providerID: "anthropic-sdk" } }
await hooks.context(hev)
const hint = hev.system.map((s) => s.text).join("\n")
cell("context hint names no neighbours", !/sesAAAAAA|sesBBBBBB/.test(hint), hint)
await call("peer_send", "sesAAAAAA", { to: "tester", text: "neighbour turn" }) // a neighbour acts
const hev2 = { sessionID: "sesCCCCCC", system: [], model: hev.model }
await hooks.context(hev2)
cell("context hint is identical across requests", hev2.system.map((s) => s.text).join("\n") === hint, hev2.system.map((s) => s.text).join("\n"))
const listed = (await call("peer_list", "sesCCCCCC")).content
cell("peer_list still shows neighbours with their models", /sesBBBBBB[^\n]*kimi\/k3/.test(listed) && /sesAAAAAA[^\n]*claude-sonnet-5-5#low/.test(listed), listed)

// 6. help
const help = (await call("peer_help", "sesAAAAAA")).content
cell("help tells about shared roles and the model", /разделяемая/.test(help) && /модель/.test(help), "missing")

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-shared.test: FAIL ${fail}` : "peers-shared.test ok")
process.exit(fail ? 1 : 0)

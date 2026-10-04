// Self-test of nova-peers window model (node >= 24):  node test/peers-model.test.mjs
// The model is the one of the REQUEST the window makes now (hook model.request); the database is only a
// fallback and is printed with the time of the last turn. Red probe: PEERS_MODULE=<copy of the plugin that
// ignores the request model> -- the cell "request model wins" goes red.
import { mkdtempSync, rmSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-model-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_DB = path.join(tmp, "opencode.db")

// A database whose last assistant turn of window Y ran on Kimi (the tab was switched afterwards).
const turnAt = Date.parse("2026-10-04T02:24:37")
const db = new DatabaseSync(process.env.NOVA_PEERS_DB)
db.exec("create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
db.prepare("insert into session_message values (?,?,?,?,?,?,?)").run(
  "m1", "sesYYYYYY", "assistant", 1, turnAt, turnAt,
  JSON.stringify({ model: { id: "k3-256k", providerID: "kimi" } }),
)
db.close()

const mod = await import(process.env.PEERS_MODULE ?? "../index.ts")
const hooks = {}
const tools = {}
const ctx = {
  location: { directory: tmp },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: tmp } }),
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
const listOf = async (sid) => (await tools.peer_list.execute({}, { sessionID: sid })).content
const lineOf = (list, sid) => list.split("\n").find((l) => l.includes(sid)) ?? ""

// 1. a window with no request yet: the model comes from the database, WITH the time of that turn
const first = lineOf(await listOf("sesYYYYYY"), "sesYYYYYY")
cell("database fallback shows the model", /kimi\/k3-256k/.test(first), first)
cell("database fallback carries «последний ход HH:MM»", /последний ход 02:24/.test(first), first)

// 2. the window now makes a request on another model: the request wins, no label
await hooks["model.request"]({ sessionID: "sesYYYYYY", agent: "build", kind: "primary", model: { id: "claude-haiku-4-5", providerID: "anthropic-sdk" } })
const second = lineOf(await listOf("sesYYYYYY"), "sesYYYYYY")
cell("request model wins over the database", /anthropic-sdk\/claude-haiku-4-5/.test(second) && !/kimi/.test(second), second)
cell("a fresh request model has no «последний ход» label", !/последний ход/.test(second), second)

// 3. a later context turn without a model does not put the old database turn back
await hooks.context({ sessionID: "sesYYYYYY", system: [] })
const third = lineOf(await listOf("sesYYYYYY"), "sesYYYYYY")
cell("the database does not overwrite the request model", /claude-haiku-4-5/.test(third) && !/kimi/.test(third), third)

// 4. a visit card carrying model Y, a request with model X -> peer_list shows X
await hooks["model.request"]({ sessionID: "sesYYYYYY", kind: "primary", model: { id: "claude-opus-5-5", providerID: "anthropic-sdk", variant: "medium" } })
const fourth = lineOf(await listOf("sesYYYYYY"), "sesYYYYYY")
cell("a newer request model replaces the card's model", /claude-opus-5-5#medium/.test(fourth) && !/haiku/.test(fourth), fourth)

// 5. a subagent request does not touch the card
await hooks["model.request"]({ sessionID: "sesYYYYYY", kind: "title", model: { id: "claude-haiku-4-5", providerID: "anthropic-sdk" } })
const fifth = lineOf(await listOf("sesYYYYYY"), "sesYYYYYY")
cell("a non-primary request does not change the model", /claude-opus-5-5#medium/.test(fifth), fifth)

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-model.test: FAIL ${fail}` : "peers-model.test ok")
process.exit(fail ? 1 : 0)

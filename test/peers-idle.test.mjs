// Self-test of nova-peers delivery to an idle window (node >= 24):  node test/peers-idle.test.mjs
// A window's card exists on disk (written by an earlier plugin instance), but the window
// makes no request after the plugin (re)loads. A letter to its role must still be
// delivered within one poll tick; a card of a live FOREIGN process must be left alone.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-idle-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_PRESENCE ??= "all" // every tab taken as open (presence has its own test)
process.env.NOVA_PEERS_POLL_MS = "100"
const cards = path.join(tmp, "opencode", "nova-peers", "cards")
mkdirSync(cards, { recursive: true })
const card = (session, role, pid) =>
  writeFileSync(path.join(cards, `${session}.json`), JSON.stringify({ session, role, auto: false, title: "", directory: process.cwd(), repo: "nova", pid, updated: Date.now() }))
card("sesIDLE01", "carina", process.pid) // this process, plugin reloaded since
card("sesDEAD01", "tester", 999999) // a process that no longer exists (server restart)
card("sesFORGN1", "foreign", process.ppid) // a live foreign process: not ours to deliver

const mod = await import("../index.ts")
const hooks = {}
const tools = {}
const delivered = []
const ctx = {
  location: { directory: process.cwd() },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, location: { directory: process.cwd() } }),
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

for (const to of ["carina", "tester", "foreign"]) {
  await tools.peer_send.execute({ to, text: `probe-${to}` }, { sessionID: "sesSENDER" })
}
await new Promise((r) => setTimeout(r, 400))
const got = (s, t) => delivered.some((d) => d.sessionID === s && d.text.includes(t))
cell("idle window of this process gets its letter", got("sesIDLE01", "probe-carina"), JSON.stringify(delivered.map((d) => d.sessionID)))
cell("window of a dead process gets its letter", got("sesDEAD01", "probe-tester"), JSON.stringify(delivered.map((d) => d.sessionID)))
cell("window of a live foreign process is left alone", !delivered.some((d) => d.sessionID === "sesFORGN1"), JSON.stringify(delivered.map((d) => d.sessionID)))
cell("each letter delivered once", delivered.filter((d) => d.text.includes("probe-carina")).length === 1, String(delivered.length))

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-idle.test: FAIL ${fail}` : "peers-idle.test ok")
process.exit(fail ? 1 : 0)

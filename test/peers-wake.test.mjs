// Self-test: a letter does not wake a session nobody watches (node >= 24):  node test/peers-wake.test.mjs
// Two signs (core.ts "КОМУ БУДИТЬ"): an OpenCode window is open at all (NOVA_PEERS_VIEWERS forces it here), and
// the end of the session's last turn was seen (time.viewed >= time.idle). Otherwise the letter waits in the inbox
// and goes out once the window is open / the session is seen; peer_send says so.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-wake-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_POLL_MS = "100"
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db")
process.env.NOVA_PEERS_VIEWERS = "open"
const proj = path.join(tmp, "proj")
mkdirSync(proj, { recursive: true })

const mod = await import(process.env.PEERS_MODULE ?? "../index.ts")
const core = await import(process.env.PEERS_CORE ?? "../core.ts")
const times = { sesWATCHED: { idle: 1000, viewed: 1000 }, sesUNSEEN: { idle: 2000, viewed: 1500 }, sesSENDER: {} }
const hooks = {}
const tools = {}
const delivered = []
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: times[sessionID] ?? {} }),
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
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t)).length
const send = async (to, text) => (await tools.peer_send.execute({ to, text }, { sessionID: "sesSENDER" })).content

for (const s of Object.keys(times)) await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })

// which processes are windows
const q = String.fromCharCode(34)
cell("the OpenCode window process counts as a window", core.isWindowCommandLine(`${q}C:/x/opencode.exe${q}`), "no")
cell("the service is not a window", !core.isWindowCommandLine("C:/x/opencode.exe serve --service"), "is")
cell("opencode run is not a window", !core.isWindowCommandLine(`${q}C:/x/opencode.exe${q} run --server http://x hi`), "is")

// a watched session is woken at once
const r1 = await send("sesWATCHED", "to-watched")
await wait()
cell("a letter to a watched session is delivered", got("sesWATCHED", "to-watched") === 1, JSON.stringify(delivered))
cell("peer_send says the window is alive", /жив/.test(r1), r1)

// a session whose last answer nobody saw: the letter waits, peer_send says why
const r2 = await send("sesUNSEEN", "to-unseen")
await wait()
cell("a letter to an unseen session waits", got("sesUNSEEN", "to-unseen") === 0, JSON.stringify(delivered))
cell("peer_send says nobody saw its last answer", /никто не видел/.test(r2), r2)
times.sesUNSEEN.viewed = 2500 // the owner opens it
await wait()
cell("once the session is seen, the letter goes out", got("sesUNSEEN", "to-unseen") === 1, JSON.stringify(delivered))

// no OpenCode window at all: nothing is woken, then the letter goes out when a window opens
process.env.NOVA_PEERS_VIEWERS = "none"
const r3 = await send("sesWATCHED", "no-window-letter")
await wait()
cell("with no window open nothing is woken", got("sesWATCHED", "no-window-letter") === 0, JSON.stringify(delivered))
cell("peer_send says no window is open", /ни одно окно OpenCode не открыто/.test(r3), r3)
process.env.NOVA_PEERS_VIEWERS = "open"
await wait()
cell("a window opens -> the letter goes out", got("sesWATCHED", "no-window-letter") === 1, JSON.stringify(delivered))

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-wake.test: FAIL ${fail}` : "peers-wake.test ok")
process.exit(fail ? 1 : 0)

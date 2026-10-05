// Self-test of the MCP server for claude-code windows (node >= 24):  node test/peers-mcp.test.mjs
// The plugin runs in this process (as OpenCode would), the MCP server (mcp.ts) is a real child process on stdio
// acting for one session (OPENCODE_PEERS_SESSION). Same mailbox, same tools, same project.role addresses;
// letters sent through MCP are delivered by the plugin's timer, letters to the MCP window reach it too.
// PEERS_MODULE / PEERS_MCP point at mutated copies for the red probes.
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"

const here = path.dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-mcp-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_PRESENCE ??= "all" // every tab taken as open (presence has its own test)
process.env.NOVA_PEERS_POLL_MS = "100"
delete process.env.NOVA_PEERS_DB
delete process.env.OPENCODE_PEERS_PROJECTS
const root = path.join(tmp, "src")
const dirs = { A: path.join(root, "nova", "repo-a"), B: path.join(root, "nova", "limits"), C: path.join(root, "nova", "repo-c"), D: path.join(root, "nova", "limits", "sub") }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const dirOf = { sesAAAAAA: dirs.A, sesBBBBBB: dirs.B, sesCCCCCC: dirs.C }

// opencode.db: the MCP server checks sessions there (read-only), as the plugin does through ctx.session.get.
mkdirSync(path.join(tmp, "opencode"), { recursive: true })
const db = new DatabaseSync(path.join(tmp, "opencode", "opencode.db"))
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer)")
for (const [id, dir] of Object.entries({ ...dirOf, sesDDDDDD: dirs.D })) db.prepare("insert into session_v2 values (?, ?, ?, null, null)").run(id, dir, id)
db.close()

const mod = await import(process.env.PEERS_MODULE ?? "../index.ts")
const hooks = {}
const tools = {}
const delivered = []
const created = []
const ctx = {
  location: { directory: root },
  options: { projects: { nova: path.join(root, "nova"), limits: dirs.B } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf[sessionID] } }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
    create: async (req) => (created.push(req), { id: req.id }),
    update: async () => {},
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
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))

// Windows A (nova), B (limits) on the plugin's tools; C is a claude-code window: the plugin's request hook still
// fires for it (the card), its tools come from MCP.
for (const s of Object.keys(dirOf)) await hooks.context({ sessionID: s, system: [], model: { id: "haiku", providerID: "claude-code" } })
await tools.peer_role.execute({ role: "integrator" }, { sessionID: "sesAAAAAA" })
await tools.peer_role.execute({ role: "integrator" }, { sessionID: "sesBBBBBB" })

// MCP client over stdio
function startMcp(session) {
  const env = { ...process.env, OPENCODE_PEERS_SESSION: session ?? "" }
  const child = spawn(process.execPath, [process.env.PEERS_MCP ?? path.join(here, "..", "mcp.ts")], { env, cwd: dirs.C, stdio: ["pipe", "pipe", "pipe"] })
  let buf = ""
  const waiting = new Map()
  child.stdout.on("data", (d) => {
    buf += d
    let i
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      if (!line.trim()) continue
      const m = JSON.parse(line)
      waiting.get(m.id)?.(m)
      waiting.delete(m.id)
    }
  })
  let next = 1
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const id = next++
      const t = setTimeout(() => reject(new Error(`timeout ${method}`)), 10_000)
      waiting.set(id, (m) => (clearTimeout(t), resolve(m)))
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n")
    })
  const notify = (method) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n")
  const call = async (name, args = {}) => {
    const r = await rpc("tools/call", { name, arguments: args })
    return { text: r.result?.content?.map((c) => c.text).join("\n") ?? JSON.stringify(r), isError: !!r.result?.isError }
  }
  return { child, rpc, notify, call }
}

const mcp = startMcp("sesCCCCCC")
try {
  const init = await mcp.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } })
  mcp.notify("notifications/initialized")
  cell("initialize answers with tools capability", !!init.result?.capabilities?.tools, JSON.stringify(init))
  cell("instructions name the window's session", /sesCCCCCC/.test(init.result?.instructions ?? ""), init.result?.instructions)
  const listed = (await mcp.rpc("tools/list", {})).result?.tools?.map((t) => t.name).sort() ?? []
  cell("eleven peer tools", JSON.stringify(listed) === JSON.stringify(["peer_config", "peer_doctor", "peer_help", "peer_inbox", "peer_list", "peer_role", "peer_send", "peer_spawn", "peer_task", "peer_wait", "peer_watch"]), JSON.stringify(listed))
  const schema = (await mcp.rpc("tools/list", {})).result.tools.find((t) => t.name === "peer_send").inputSchema
  cell("peer_send schema requires to and text", JSON.stringify(schema.required) === JSON.stringify(["to", "text"]), JSON.stringify(schema))

  // peer_list: the same addresses as the plugin (projects come from the plugin's option list, longest root wins)
  const pl = (await mcp.call("peer_list")).text
  cell("MCP peer_list marks the caller with its project.role address", /^\* nova\.worker/m.test(pl), pl)
  cell("MCP peer_list shows the nova integrator, not the nested limits one", /nova\.integrator/.test(pl) && !/limits\.integrator/.test(pl) && /ещё 1 вкладок/.test(pl), pl)
  const plAll = (await mcp.call("peer_list", { all: true })).text
  cell("MCP peer_list all shows limits.integrator", /limits\.integrator/.test(plAll), plAll)
  const viaPlugin = (await tools.peer_list.execute({ all: true }, { sessionID: "sesCCCCCC" })).content
  cell("MCP and plugin peer_list agree on addresses", plAll.split("\n").map((l) => l.split(" — ")[0]).join() === viaPlugin.split("\n").map((l) => l.split(" — ")[0]).join(), `${plAll}\n---\n${viaPlugin}`)

  // peer_send from MCP: written to the shared mailbox, delivered by the plugin's timer, signed project.role
  const s1 = (await mcp.call("peer_send", { to: "integrator", text: "from-mcp-own" })).text
  const s2 = (await mcp.call("peer_send", { to: "limits.integrator", text: "from-mcp-cross" })).text
  cell("peer_send answers 'sent'", /Отправлено/.test(s1) && /Отправлено/.test(s2), `${s1} | ${s2}`)
  await wait()
  const own = got("sesAAAAAA", "from-mcp-own")
  cell("'integrator' from the MCP window reaches nova's integrator only", own.length === 1 && got("sesBBBBBB", "from-mcp-own").length === 0, JSON.stringify(delivered))
  cell("the letter is signed with the MCP window's address", /от nova\.worker \(сессия sesCCCCCC\)/.test(own[0]?.text ?? ""), own[0]?.text)
  cell("limits.integrator from MCP crosses projects", got("sesBBBBBB", "from-mcp-cross").length === 1, JSON.stringify(delivered))

  // peer_role from MCP; the card keeps the plugin's pid, so letters to the MCP window are still delivered
  const r = (await mcp.call("peer_role", { role: "worker" })).text
  cell("MCP peer_role sets the role", /теперь «worker», адрес nova\.worker/.test(r), r)
  const card = JSON.parse(readFileSync(path.join(tmp, "opencode", "nova-peers", "cards", "sesCCCCCC.json"), "utf8"))
  cell("the card keeps the OpenCode process pid", card.pid === process.pid && card.role === "worker", JSON.stringify(card))
  const rx = (await mcp.call("peer_role", { role: "integrator" })).text
  cell("exclusive role held by a live window is refused through MCP too", /занята/.test(rx), rx)
  await tools.peer_send.execute({ to: "worker", text: "to-the-mcp-window" }, { sessionID: "sesAAAAAA" })
  await wait()
  cell("a letter to the MCP window's role is delivered into its OpenCode session", got("sesCCCCCC", "to-the-mcp-window").length === 1, JSON.stringify(delivered))
  const inbox = (await mcp.call("peer_inbox")).text
  cell("MCP peer_inbox shows the delivered letter", /Адрес nova\.worker/.test(inbox) && /от nova\.integrator → nova\.worker: to-the-mcp-window/.test(inbox), inbox)

  // shared role with two live holders: refused through MCP exactly as in the plugin
  await tools.peer_role.execute({ role: "worker" }, { sessionID: "sesAAAAAA" }) // A joins worker: two live holders
  const amb = (await mcp.call("peer_send", { to: "worker", text: "who-takes-this" })).text
  cell("letter to a shared role with two live holders is refused through MCP", /держат 2/.test(amb) && /sesAAAAAA/.test(amb) && /sesCCCCCC/.test(amb), amb)
  await tools.peer_role.execute({ role: "integrator" }, { sessionID: "sesAAAAAA" })
  const help = (await mcp.call("peer_help")).text
  cell("MCP peer_help is the plugin's help", help === (await tools.peer_help.execute({}, { sessionID: "sesCCCCCC" })).content, help.slice(0, 80))
  const bad = (await mcp.call("peer_send", { to: "No Such.x", text: "bad" })).text
  cell("invalid address is refused", /не годится/.test(bad), bad)
  const inboxDirs = readdirSync(path.join(tmp, "opencode", "nova-peers", "inbox"))
  cell("nothing stuck in the inbox", inboxDirs.every((d) => readdirSync(path.join(tmp, "opencode", "nova-peers", "inbox", d)).filter((f) => f.endsWith(".json")).length === 0), inboxDirs.join(","))
} catch (e) {
  cell("mcp session", false, String(e?.stack ?? e))
} finally {
  mcp.child.kill()
}

// A claude-code window the plugin has not seen yet: MCP makes its card from opencode.db with the project from the
// plugin's option list (projects.json in the mailbox) -- nested limits, not the repository name -- and pid 0, so the
// plugin's timer (any live instance) delivers its letters.
const fresh = startMcp("sesDDDDDD")
try {
  await fresh.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {} })
  const pl = (await fresh.call("peer_list")).text
  cell("a window without a card gets project.role from the plugin's project list", /^\* limits\.worker/m.test(pl) && /limits\.integrator/.test(pl), pl)
  const card = JSON.parse(readFileSync(path.join(tmp, "opencode", "nova-peers", "cards", "sesDDDDDD.json"), "utf8"))
  cell("its card has pid 0 (delivered by the plugin's timer)", card.pid === 0 && card.project === "limits", JSON.stringify(card))
  await tools.peer_send.execute({ to: "sesDDDDDD", text: "to-a-fresh-window" }, { sessionID: "sesBBBBBB" })
  await wait()
  cell("a letter to it is delivered", got("sesDDDDDD", "to-a-fresh-window").length === 1, JSON.stringify(delivered))
} catch (e) {
  cell("fresh mcp session", false, String(e))
} finally {
  fresh.child.kill()
}

// Without OPENCODE_PEERS_SESSION the tools refuse instead of acting for an unknown window.
const anon = startMcp("")
try {
  await anon.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {} })
  const r = await anon.call("peer_list")
  cell("no session -> isError", r.isError && /OPENCODE_PEERS_SESSION/.test(r.text), JSON.stringify(r))
} catch (e) {
  cell("anonymous mcp session", false, String(e))
} finally {
  anon.child.kill()
}

// Tasks through MCP: the integrator's claude-code window starts a task; the plugin (in this process) picks it up
// from the journal; peer_task through MCP shows the same journal.
const integ = startMcp("sesAAAAAA")
try {
  await integ.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {} })
  const refused = (await integ.call("peer_spawn", { goal: "без критериев" })).text
  cell("MCP peer_spawn refuses a task without criteria", /нет полей критерии/.test(refused), refused)
  const sp = (await integ.call("peer_spawn", { title: "через mcp", goal: "проверить", criteria: "зелёное", tier: "light" })).text
  cell("MCP peer_spawn: the plugin starts the task", /Задача #1 запущена/.test(sp) && created.length === 1 && created[0].title === "#1 через mcp", sp + JSON.stringify(created))
  const list = (await integ.call("peer_task", { action: "list" })).text
  cell("MCP peer_task list shows the same journal", /#1 P2 в работе «через mcp»/.test(list), list)
  const bad = (await integ.call("peer_task", { action: "push", n: 99 })).text
  cell("MCP peer_task: an unknown number is refused", /Задачи #99/.test(bad), bad)
} catch (e) {
  cell("mcp tasks", false, String(e))
} finally {
  integ.child.kill()
}

stop?.()
await wait(100)
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-mcp.test: FAIL ${fail}` : "peers-mcp.test ok")
process.exit(fail ? 1 : 0)

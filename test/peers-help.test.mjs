// Self-test of nova-peers help (node >= 24):  node test/peers-help.test.mjs
// The help is served by the peer_help tool and by the /peer_help command, names all four tools,
// and the context hook points at it. Red probe: NOVA_PEERS_HELP_DROP=<tool> strips one name from the
// served text -- the cell naming that tool must go red.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-help-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_PRESENCE ??= "all" // every tab taken as open (presence has its own test)
const mod = await import("../index.ts")

const hooks = {}
const tools = {}
const commands = {}
const prompts = []
const ctx = {
  location: { directory: process.cwd() },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: process.cwd() } }),
    prompt: async (p) => prompts.push(p),
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  command: { list: async () => [], transform: async (fn) => fn({ add: (c) => (commands[c.name] = c) }) },
}
const stop = await mod.default.setup(ctx)

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

let help = (await tools.peer_help.execute({}, { sessionID: "sesHELP01" })).content
const drop = process.env.NOVA_PEERS_HELP_DROP
if (drop) help = help.split(drop).join("")
for (const t of ["peer_list", "peer_role", "peer_send", "peer_inbox", "peer_wait", "peer_spawn", "peer_task", "peer_doctor"]) {
  cell(`help names ${t}`, help.includes(t), "missing")
}
for (const w of ["force", "all", "worker", "assistant — то же, что worker", "opencode-peers.json", "wake: false", "expect_reply", "reply_to", "через 3 с", "Open", "напоминанием", "spawn_limits", "#N", "P0", "assign", "reassign", "task_fields", "ДАННЫЕ ОТ СОСЕДА", "КОНТРОЛЬНЫЙ ВОПРОС", "кто тут integrator проекта X", "я integrator проекта X"]) {
  cell(`help mentions «${w}»`, help.includes(w), "missing")
}

cell("/peer_help is registered", typeof commands.peer_help?.execute === "function", JSON.stringify(Object.keys(commands)))
await commands.peer_help.execute({ sessionID: "sesHELP01", prompt: {}, delivery: "queue" })
cell("/peer_help sends the help to the session", prompts.length === 1 && prompts[0].text.includes("peer_inbox"), JSON.stringify(prompts).slice(0, 120))

const ev = { sessionID: "sesHELP01", system: [] }
await hooks.context(ev)
cell("the context hint points at peer_help", /peer_help/.test(ev.system.map((s) => s.text).join("\n")), JSON.stringify(ev.system))

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-help.test: FAIL ${fail}` : "peers-help.test ok")
process.exit(fail ? 1 : 0)

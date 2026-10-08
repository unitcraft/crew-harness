// Self-test of the window commands /crew-help, /crew-sets and /crew-profiles (task 003, defect "commands at once"; node >= 24):
//   node test/crew-instant-commands.test.mjs
// The three are commands of the window (tui.ts), as /crew-progress: the answer is a dialog at once, no service message and no
// model turn (the window of OpenCode 2.0.23 does not show a service message). The changing verbs run through the same
// functions as before; the catalog of the window comes from the provider list of the window, or is declared unavailable.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-instant-commands-"))
process.env.TEMP = tmp // the plugin log lives in os.tmpdir(): this keeps the lines of this test apart from the live service
process.env.TMP = tmp
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.XDG_CONFIG_HOME = path.join(tmp, "xdgcfg")
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_PROFILES_MS = "100000"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "600000"
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_NO_SIDEBAR = "1" // the window test draws no panels

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex")
const prof = (model, context, output, input) => ({ model, context, output, ...(input ? { input } : {}) })
const c = (family, tier) => ({ family, tier })
const KIMI = "kimi-code-plan-global/k3-256k"
const TABLE = {
  claude: { heavy: prof("claude-code/opus", 720000, 64000), medium: prof("claude-code/sonnet", 720000, 64000), light: prof("claude-code/haiku", 220000, 32000) },
  kimi: { heavy: prof(KIMI, 220000, 131072), medium: prof(KIMI, 220000, 131072), light: prof(KIMI, 220000, 131072) },
  codex: { heavy: prof("openai/gpt-5.5", 525000, 128000, 461000), medium: prof("openai/gpt-5.6-terra", 525000, 128000, 461000), light: prof("openai/gpt-6-luna", 525000, 128000, 461000) },
}
const SETS = {
  default: { develop: c("claude", "task"), plan: c("claude", "task"), accept: c("claude", "task"), plan_accept: c("claude", "task") },
  "cross-kimi": { develop: c("claude", "task"), plan: c("claude", "task"), accept: c("kimi", "heavy"), plan_accept: c("kimi", "heavy") },
  "kimi-only": { develop: c("kimi", "heavy"), plan: c("kimi", "heavy"), accept: c("kimi", "heavy"), plan_accept: c("kimi", "heavy") },
}
const root = path.join(tmp, "proj")
const cfgDir = path.join(root, "proj-settings")
mkdirSync(path.join(cfgDir, ".opencode"), { recursive: true })
const file = path.join(cfgDir, ".opencode", "crew-harness.json")
git(cfgDir, "init", "-q", "-b", "main")
writeFileSync(file, JSON.stringify({ project: "cmdproj", root: "..", model_profiles: TABLE, profile_sets: SETS }, null, 2))
git(cfgDir, "add", "-A")
git(cfgDir, "commit", "-q", "-m", "settings")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const Tui = await import("../tui.ts")
const L = await import("../profile-layer.ts")
const commands = {}
const serverCalls = []
const ctx = {
  location: { directory: root },
  app: { name: "opencode", version: "2.0.23-test" },
  options: { projects: [cfgDir] },
  command: { list: async () => ({ data: [] }), transform: async (fn) => fn({ add: (cmd) => (commands[cmd.name] = cmd) }) },
  model: { list: async () => ({ data: [] }) },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: root }, time: {} }),
    prompt: async (p) => serverCalls.push(p),
    synthetic: async (p) => serverCalls.push(p),
    hook: async () => {},
  },
  tool: { transform: async (fn) => fn({ add: () => {} }) },
}
const stopServer = await mod.default.setup(ctx) // the server plugin saves the projects to the box, the window reads them
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const session = "ses_instant_demo"
mkdirSync(path.dirname(core.cardFile(session)), { recursive: true })
writeFileSync(core.cardFile(session), JSON.stringify({ session, directory: root }))

// a window API as OpenCode gives it, cut down: select / prompt answer from a script; every shown text is kept
const mkApi = (script, provider) => {
  const out = { shown: [], asked: [] }
  const api = {
    ui: {
      router: { current: () => ({ type: "session", sessionID: session }) },
      tabs: { list: () => [] },
      toast: { show: () => {} },
      dialog: {
        alert: (a) => out.shown.push(a),
        select: async (o) => (out.asked.push(o), script.shift()),
        prompt: async (o) => (out.asked.push(o), script.shift()),
      },
    },
    keymap: { layer: (f) => (out.cmds = f().commands) },
    ...(provider ? { state: { provider } } : {}),
  }
  return { api, out }
}
const last = (out) => out.shown.at(-1)
const msg = (out) => last(out)?.message ?? ""
const slashOf = (out, n) => out.cmds.find((x) => x.slash?.name === n)

{
  const { api, out } = mkApi([])
  const stop = Tui.default.setup(api)
  const names = out.cmds.map((x) => x.slash?.name)
  cell("the window registers /crew-help, /crew-sets and /crew-profiles in the palette, next to the earlier commands", ["crew", "crew-config", "plans", "crew-doctor", "crew-progress", "crew-help", "crew-sets", "crew-profiles"].every((n) => names.includes(n)) && ["crew-help", "crew-sets", "crew-profiles"].every((n) => slashOf(out, n).palette === true), names.join())
  cell("no command name is registered twice in the window", new Set(names).size === names.length, names.join())
  cell("the server registers none of the three names (one command per name)", !commands["crew-help"] && !commands["crew-sets"] && !commands["crew-profiles"], Object.keys(commands).join())

  await slashOf(out, "crew-help").run()
  cell("/crew-help shows the help at once in the window dialog; no server call, no model turn", /crew_inbox/.test(msg(out)) && serverCalls.length === 0, JSON.stringify(last(out))?.slice(0, 120))

  api.ui.dialog.select = async (o) => (out.asked.push(o), "table")
  await slashOf(out, "crew-sets").run()
  cell("/crew-sets: the first dialog offers the table, check, save and typing; the table is shown at once", out.asked[0]?.options?.map((o) => o.value).join() === "table,check,save,type" && /cross-kimi/.test(msg(out)) && /kimi-only/.test(msg(out)), JSON.stringify(last(out))?.slice(0, 200))
  await slashOf(out, "crew-profiles").run()
  cell("/crew-profiles table: family, tier -> model, window", /claude\s+heavy\s+claude-code\/opus/.test(msg(out)), JSON.stringify(last(out))?.slice(0, 200))

  // the verbs that change: typed after "type", the same files and checks as before
  const fileHash = sha(file)
  let script = ["type", "use no-such-set"]
  api.ui.dialog.select = async () => script.shift()
  api.ui.dialog.prompt = async () => script.shift()
  await slashOf(out, "crew-sets").run()
  cell("a typed verb runs the same command: use with an unknown name is refused with the list of names, nothing changed", /Не сделано/.test(msg(out)) && /cross-kimi/.test(msg(out)) && Object.keys(L.profileState(root).layer).length === 0 && sha(file) === fileHash, JSON.stringify(last(out))?.slice(0, 200))
  script = ["type", "use cross-kimi"]
  await slashOf(out, "crew-sets").run()
  cell("use <set> from the window changes the local layer only, not the project file", /cross-kimi/.test(msg(out)) && L.profileState(root).name === "cross-kimi" && L.profileState(root).nameSource === "layer" && sha(file) === fileHash, JSON.stringify([last(out), L.profileState(root).name])?.slice(0, 300))
  script = ["check"]
  await slashOf(out, "crew-sets").run()
  cell("check without a catalog in the window process says the catalog is unavailable instead of failing", /каталог недоступен/.test(msg(out)), msg(out).slice(0, 300))
  const n = out.shown.length
  script = [undefined]
  await slashOf(out, "crew-sets").run()
  cell("Esc on the first dialog does nothing (no text, no change)", out.shown.length === n, String(out.shown.length))
  script = ["type", "  "]
  await slashOf(out, "crew-sets").run()
  cell("an empty typed command does nothing", out.shown.length === n, String(out.shown.length))
  stop?.()
}

{
  // the catalog of the window: api.state.provider (the form Provider.models with limit) is read for check
  const prov = [
    { id: "claude-code", models: { opus: { id: "opus" }, sonnet: { id: "sonnet" }, haiku: { id: "haiku" } } },
    { id: "kimi-code-plan-global", models: { "k3-256k": { id: "k3-256k" } } },
    { id: "openai", models: { "gpt-5.5": { id: "gpt-5.5", limit: { context: 1050000, input: 922000, output: 128000 } }, "gpt-5.6-terra": { id: "gpt-5.6-terra" }, "gpt-6-luna": { id: "gpt-6-luna" } } },
  ]
  const { api, out } = mkApi(["check"], prov)
  const stop = Tui.default.setup(api)
  await slashOf(out, "crew-sets").run()
  cell("with the provider list in the window the models are compared with the catalog: no «каталог недоступен»", !/каталог недоступен/.test(msg(out)) && /Проверка профилей/.test(msg(out)), msg(out).slice(0, 400))
  stop?.()
  const { api: api2, out: out2 } = mkApi(["check"], [{ id: "claude-code", models: { opus: { id: "opus" } } }])
  const stop2 = Tui.default.setup(api2)
  await slashOf(out2, "crew-sets").run()
  cell("a model of the sets missing from the window catalog is named", /нет в каталоге OpenCode/.test(msg(out2)), msg(out2).slice(0, 400))
  stop2?.()
}

stopServer?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-instant-commands.test: FAIL ${fail}` : "crew-instant-commands.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the window commands /crew-help, /crew-sets and /crew-profiles (task 003, defect "commands at once"; node >= 24):
//   node test/crew-instant-commands.test.mjs
// The three are commands of the window (tui.ts), as /crew-progress: the answer is a dialog at once, no service message and no
// model turn (the window of OpenCode 2.0.23 does not show a service message). The changing verbs run through the same
// functions as before; the catalog of the window comes from the provider list of the window, or is declared unavailable.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
const Core = core
const Tui = await import("../tui.ts")
const Cat = await import("../model-catalog.ts")
const Size = await import("../dialog-size.ts")
const L = await import("../profile-layer.ts")
const commands = {}
const serverCalls = []
const ctx = {
  location: { directory: root },
  app: { name: "opencode", version: "2.0.23-test" },
  options: { projects: [cfgDir] },
  command: { list: async () => ({ data: [] }), transform: async (fn) => fn({ add: (cmd) => (commands[cmd.name] = cmd) }) },
  model: { list: async () => ({ data: [{ providerID: "claude-code", modelID: "opus", limit: { context: 1000000, output: 64000 } }, { providerID: "claude-code", modelID: "sonnet" }, { providerID: "claude-code", modelID: "haiku" }, { providerID: "kimi-code-plan-global", modelID: "k3-256k" }] }) },
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
writeFileSync(core.cardFile(session), JSON.stringify({ session, directory: root, role: "worker", project: "cmdproj", repo: "r", pid: process.pid, updated: Date.now() }))

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

// the server plugin writes the snapshot of the model catalog 3 s after the start (and every 10 minutes)
await new Promise((r) => setTimeout(r, 3600))
{
  const snap = Cat.readCatalog()
  cell("the plugin of the server writes the snapshot of the catalog (provider, model, limit) with the time", existsSync(Cat.CATALOG_FILE) && snap.models?.length === 4 && snap.models.find((m) => m.modelID === "opus")?.limit?.context === 1000000 && /назад/.test(snap.note ?? ""), JSON.stringify(snap))
  const file0 = Cat.CATALOG_FILE
  cell("an empty reply is not a snapshot; an old snapshot is refused with the reason; no file -> the reason", !Cat.writeCatalog([]) && /старый/.test(Cat.readCatalog(Date.now() + 2 * 3600_000).why ?? "") && /ещё не записал/.test(Cat.readCatalog(Date.now(), file0 + ".none").why ?? ""), JSON.stringify([Cat.readCatalog(Date.now() + 2 * 3600_000), Cat.readCatalog(Date.now(), file0 + ".none")]))
}

{
  const { api, out } = mkApi([])
  const stop = Tui.default.setup(api)
  const names = out.cmds.map((x) => x.slash?.name)
  cell("the window registers /crew-help, /crew-sets and /crew-profiles in the palette, next to the earlier commands", ["crew", "crew-config", "plans", "crew-doctor", "crew-progress", "crew-help", "crew-sets", "crew-profiles"].every((n) => names.includes(n)) && ["crew-help", "crew-sets", "crew-profiles"].every((n) => slashOf(out, n).palette === true), names.join())
  cell("no command name is registered twice in the window", new Set(names).size === names.length, names.join())
  cell("the server registers none of the three names (one command per name)", !commands["crew-help"] && !commands["crew-sets"] && !commands["crew-profiles"], Object.keys(commands).join())

  await slashOf(out, "crew-help").run()
  cell("/crew-help shows the help at once in the window dialog; no server call, no model turn", /crew_inbox/.test(msg(out)) && serverCalls.length === 0, JSON.stringify(last(out))?.slice(0, 120))
  cell("the help lists the verbs of /crew-sets and /crew-profiles from the one table (the same texts as the menu)", Core.SETS_VERB_HELP.every((v) => msg(out).includes(v.verb)) && Core.PROFILES_VERB_HELP.filter((v) => !v.bare && v.verb !== "reset").every((v) => msg(out).includes(v.what)), "")

  // the menu: the table and every verb with «what it does and with which arguments»
  api.ui.dialog.select = async (o) => (out.asked.push(o), "__table")
  await slashOf(out, "crew-sets").run()
  const menu = out.asked.at(-1)
  cell("/crew-sets: the menu has the table and every verb of runSetsCommand, each with its arguments and what it does", menu.options[0].value === "__table" && Core.SETS_VERB_HELP.every((v) => menu.options.some((o) => o.value === v.verb && o.description.includes(v.what) && o.description.startsWith(v.verb + (v.usage ? " " + v.usage : "")))), JSON.stringify(menu.options.map((o) => o.value)))
  cell("the verbs of the menu are exactly the verbs the command accepts (no verb is missing, none is invented)", JSON.stringify(Core.SETS_VERB_HELP.map((v) => v.verb)) === JSON.stringify((await import("../profile-cmd.ts")).SETS_VERBS) && JSON.stringify(Core.PROFILES_VERB_HELP.map((v) => v.verb).sort()) === JSON.stringify([...(await import("../profile-cmd.ts")).PROFILES_VERBS].sort()), "")
  const shown = out.shown.map((x) => x.message)
  cell("the dialog «Загрузка…» is shown first, then the table of the sets (the heavy part runs after)", shown.at(-2) === "Загрузка…" && /cross-kimi/.test(shown.at(-1)) && /kimi-only/.test(shown.at(-1)), JSON.stringify(shown.map((m) => m.slice(0, 30))))
  cell("in the window the texts name the menu items, the slash form stays in brackets as a note", /пункт «show» меню \/crew-sets \(\/crew-sets show \[имя\]\)/.test(msg(out)) && /пункт «use» меню \/crew-sets \(\/crew-sets use <имя>\)/.test(msg(out)), msg(out).slice(-300))
  await slashOf(out, "crew-profiles").run()
  cell("/crew-profiles table: family, tier -> model, window", /claude\s+heavy\s+claude-code\/opus/.test(msg(out)), JSON.stringify(last(out))?.slice(0, 200))

  // a verb with arguments opens the input with the format of this verb; the changing verbs run through the same functions
  const fileHash = sha(file)
  let script = ["use", "use no-such-set"]
  api.ui.dialog.select = async (o) => (out.asked.push(o), script.shift())
  api.ui.dialog.prompt = async (o) => (out.asked.push(o), script.shift())
  await slashOf(out, "crew-sets").run()
  const ask = out.asked.at(-1)
  cell("the input of «use» has the title, the format and an example of this verb, the verb already typed", ask.title.startsWith("/crew-sets use") && Core.SETS_VERB_HELP.every((v) => ask.title.includes(v.verb)) && Object.values(ask).every((x) => typeof x === "string") && ask.placeholder.includes("use <имя> — например: use cross-kimi") && ask.value === "use ", JSON.stringify(ask))
  cell("a typed verb runs the same command: use with an unknown name is refused with the list of names, nothing changed", /Не сделано/.test(msg(out)) && /cross-kimi/.test(msg(out)) && Object.keys(L.profileState(root).layer).length === 0 && sha(file) === fileHash, JSON.stringify(last(out))?.slice(0, 200))
  script = ["use", "use cross-kimi"]
  await slashOf(out, "crew-sets").run()
  cell("use <set> from the window changes the local layer only, not the project file", /cross-kimi/.test(msg(out)) && L.profileState(root).name === "cross-kimi" && L.profileState(root).nameSource === "layer" && sha(file) === fileHash, JSON.stringify([last(out), L.profileState(root).name])?.slice(0, 300))
  script = ["use", "cross-codex-not"] // typed without the verb: the verb is added
  await slashOf(out, "crew-sets").run()
  cell("a line typed without the verb gets the verb of the item", /Не сделано/.test(msg(out)) && /cross-codex-not/.test(msg(out)), msg(out).slice(0, 200))
  script = ["check"]
  await slashOf(out, "crew-sets").run()
  cell("check shows the catalog from the snapshot of the server plugin with its age, and compares the models", /Каталог моделей OpenCode: снимок плагина сервиса, .* назад/.test(msg(out)) && !/каталог недоступен/.test(msg(out)), msg(out).slice(0, 400))
  const n = out.shown.length
  script = [undefined]
  await slashOf(out, "crew-sets").run()
  cell("Esc on the menu does nothing (no text, no change)", out.shown.length === n, String(out.shown.length))
  script = ["use", "  "]
  await slashOf(out, "crew-sets").run()
  cell("a verb with required arguments and an empty input does nothing", out.shown.length === n, String(out.shown.length))
  script = ["save"]
  await slashOf(out, "crew-profiles").run()
  cell("a verb without required arguments (save) runs at once from the menu", /Загрузка/.test(out.shown.at(-2).message) && out.shown.length === n + 2, JSON.stringify(out.shown.slice(-2)).slice(0, 200))
  // the snapshot is old / absent: the reason is named
  const keep = readFileSync(Cat.CATALOG_FILE, "utf8")
  rmSync(Cat.CATALOG_FILE)
  script = ["check"]
  await slashOf(out, "crew-sets").run()
  cell("no snapshot: check says the catalog is unavailable and names the reason", /каталог недоступен: плагин сервиса ещё не записал снимок/.test(msg(out)), msg(out).slice(0, 300))
  writeFileSync(Cat.CATALOG_FILE, JSON.stringify({ at: Date.now() - 3 * 3600_000, models: JSON.parse(keep).models }))
  script = ["check"]
  await slashOf(out, "crew-sets").run()
  cell("an old snapshot is not used, the reason names its age", /каталог недоступен: снимок каталога старый \(3 ч назад\)/.test(msg(out)), msg(out).slice(0, 300))
  writeFileSync(Cat.CATALOG_FILE, keep)
  stop?.()
}

{
  // the same without the worker thread: the process of the window does the work after «Загрузка…»
  process.env.CREW_HARNESS_NO_WORKER = "1"
  const { api, out } = mkApi(["__table"])
  const stop = Tui.default.setup(api)
  await slashOf(out, "crew-profiles").run()
  cell("without the worker the same answer arrives (the fallback in the process of the window)", out.shown.at(-2)?.message === "Загрузка…" && /claude\s+heavy/.test(msg(out)), JSON.stringify(out.shown.map((x) => x.message.slice(0, 20))))
  delete process.env.CREW_HARNESS_NO_WORKER
  stop?.()
}

{
  // the catalog of the window itself (api.state.provider) wins over the snapshot
  const prov = [
    { id: "claude-code", models: { opus: { id: "opus" }, sonnet: { id: "sonnet" }, haiku: { id: "haiku" } } },
    { id: "kimi-code-plan-global", models: { "k3-256k": { id: "k3-256k" } } },
  ]
  const { api, out } = mkApi(["check"], prov)
  const stop = Tui.default.setup(api)
  await slashOf(out, "crew-sets").run()
  cell("with the provider list in the window the models are compared with it (the note names the source)", /Каталог моделей OpenCode: список окна OpenCode/.test(msg(out)), msg(out).slice(0, 400))
  stop?.()
  const { api: api2, out: out2 } = mkApi(["check"], [{ id: "claude-code", models: { opus: { id: "opus" } } }])
  const stop2 = Tui.default.setup(api2)
  await slashOf(out2, "crew-sets").run()
  cell("a model of the sets missing from the window catalog is named", /нет в каталоге OpenCode/.test(msg(out2)), msg(out2).slice(0, 400))
  stop2?.()
}

{
  // /crew-config goes through the same path: «Загрузка…», then the settings
  const { api, out } = mkApi([])
  const stop = Tui.default.setup(api)
  await slashOf(out, "crew-config").run()
  cell("/crew-config shows «Загрузка…» first and then the settings of the project of the tab", out.shown.at(-2)?.message === "Загрузка…" && msg(out).length > 20 && !/Не прочитать/.test(msg(out)), JSON.stringify(out.shown.map((x) => x.message.slice(0, 30))))
  stop?.()
}

{
  // the size of the dialog by the content (dialog-size.ts)
  const two = "Наборов нет в файле проекта.\nСоздать: пункт «new» меню /crew-sets."
  cell("a two-line answer is a medium window and its body is two rows", Size.pickSize(two, 20).size === "medium" && Size.pickSize(two, 20).bodyRows === 2 && !Size.pickSize(two, 20).scrolls, JSON.stringify(Size.pickSize(two, 20)))
  const wide = ["имя" + " ".repeat(30) + "разработка".padEnd(40, "x"), "b"].join("\n")
  const wide90 = "x".repeat(90) + "\n" + wide
  cell("lines wider than the medium window make it large; wider than the large one - the widest", Size.pickSize(wide, 20).size === "large" && Size.pickSize(wide90, 20).size === "xlarge", JSON.stringify([Size.pickSize(wide, 20), Size.pickSize(wide90, 20)]))
  const longSmall = Array.from({ length: 16 }, (_, i) => "строка " + i).join("\n")
  cell("sixteen short lines are the large window, not the widest", Size.pickSize(longSmall, 30).size === "large", JSON.stringify(Size.pickSize(longSmall, 30)))
  const huge = Array.from({ length: 80 }, (_, i) => "строка " + i).join("\n")
  const pk = Size.pickSize(huge, 20)
  cell("a text longer than the screen is the widest window and scrolls", pk.size === "xlarge" && pk.scrolls && pk.bodyRows === 20, JSON.stringify(pk))
  cell("the width of a wide character counts twice", Size.cellWidth("漢字") === 4 && Size.cellWidth("ab") === 2, "")
  const src = readFileSync(new URL("../dialog-text.tsx", import.meta.url), "utf8")
  cell("dialog-text.tsx sets the size from the content, not a fixed xlarge, and puts the hint right under the text", /size: fit\.size/.test(src) && !/size: "xlarge"/.test(src) && /height=\{fit\.bodyRows\}/.test(src), "")
}

{
  // THE CRASH OF 2026-10-08 (TextNodeRenderable only accepts strings): nothing but strings goes to the window - static check of the
  // sources and a cell with answers that are not strings
  const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8")
  const tuiSrc = read("tui.ts").split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join(" ") // without the comments
  cell("tui.ts passes no function or element as description / children to the dialogs of the window (description: () => ..., JSX, noteLine)", !/description\s*:\s*(\(|async|function)/.test(tuiSrc) && !/noteLine/.test(tuiSrc) && !/<text|<box|<span/.test(tuiSrc) && !/noteLine/.test(read("dialog-text.tsx")), "")
  const bad = []
  for (const f of ["dialog-text.tsx", "sidebar.tsx", "progress-sidebar.tsx"]) {
    for (const m of read(f).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
      const inner = m[1].trim()
      if (inner.includes("{") && !inner.startsWith("{str(")) bad.push(f + ": " + inner.slice(0, 60))
    }
  }
  cell("every expression inside <text> of the three window files goes through str(...) (a non-string would crash the window)", bad.length === 0, bad.join(" | "))
  cell("str() makes a string of anything; pickSize takes a non-string without a throw", [undefined, null, 5, { a: 1 }, ["x"], "ok"].every((v) => typeof Size.str(v) === "string") && Size.str(undefined) === "" && Size.str(5) === "5" && typeof Size.pickSize(undefined, 20).size === "string" && typeof Size.pickSize(12345, 20).bodyRows === "number", "")
  // a command whose answer is not a string: the dialog gets strings only
  const { api, out } = mkApi([])
  const stop = Tui.default.setup(api)
  core.writeDoctorForTest?.()
  writeFileSync(core.DOCTOR_FILE, JSON.stringify({ at: Date.now(), problems: [7, { a: 1 }, null, "text"] }))
  await slashOf(out, "crew-doctor").run()
  cell("a self-check with problems that are numbers and objects reaches the dialog as strings", out.shown.length > 0 && out.shown.every((x) => typeof x.title === "string" && typeof x.message === "string"), JSON.stringify(out.shown))
  stop?.()
}

stopServer?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-instant-commands.test: FAIL ${fail}` : "crew-instant-commands.test ok")
process.exit(fail ? 1 : 0)

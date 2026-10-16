// Self-test of the list and the pick of /crew-sets and /crew-profiles (task 066, items 8 and 9; node >= 24):
//   node test/crew-sets-pick.test.mjs
// `ls` (also `list` and the command without words) is a list with the enabled set marked and the models in the cells; in the window it
// is a pick (dialog.select): arrows, Enter enables the set and shows the short result. The verbs of the menu that take a name of a
// set (a family) open the same list first; text is typed only for a new name or a cell. `view` is gone: a refusal that says `show`.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-sets-pick-"))
process.env.TEMP = tmp
process.env.TMP = tmp
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.XDG_CONFIG_HOME = path.join(tmp, "xdgcfg")
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_PROFILES_MS = "100000"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "600000"
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_NO_SIDEBAR = "1"
process.env.CREW_HARNESS_NO_WORKER = "1"

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
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
const Core = await import("../core.ts")
const Cmd = await import("../profile-cmd.ts")
const Tui = await import("../tui.ts")
const L = await import("../profile-layer.ts")
const ctx = {
  location: { directory: root },
  app: { name: "opencode", version: "2.0.23-test" },
  options: { projects: [cfgDir] },
  command: { list: async () => ({ data: [] }), transform: async (fn) => fn({ add: () => {} }) },
  model: { list: async () => ({ data: [] }) },
  session: { get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: root }, time: {} }), prompt: async () => {}, synthetic: async () => {}, hook: async () => {} },
  tool: { transform: async (fn) => fn({ add: () => {} }) },
}
const stopServer = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sets = (t) => Cmd.runSetsCommand(root, t)
const profs = (t) => Cmd.runProfilesCommand(root, t)

// ---- item 8: the text list ----
const LEGEND = [
  "  opus — claude-code/opus · контекст 720K · вывод до 64K",
  "  sonnet — claude-code/sonnet · контекст 720K · вывод до 64K",
  "  haiku — claude-code/haiku · контекст 220K · вывод до 32K",
  "  k3-256k — kimi-code-plan-global/k3-256k",
  "      контекст 220K · вывод до 131072",
]
const ROWS = (mark) => [
  `${mark === "cross-kimi" ? "● " : "  "}cross-kimi  opus/sonnet/haiku: разработка, планирование`,
  "              k3-256k: приёмка, приёмка плана",
  `${mark === "default" ? "● " : "  "}default     opus/sonnet/haiku`,
  `${mark === "kimi-only" ? "● " : "  "}kimi-only   k3-256k`,
]
const FOOT = "● — включённый. По этапам: show <имя>; включить: use <имя>."
let r = await sets("ls")
cell("ls: no set enabled - the rows with models (groups of stages with one model), the legend of the short names, the footer (snapshot)", same(r.split("\n"), ["Наборы проекта cmdproj. Включён: нет (модели — по spawn_models).", ...ROWS(), ...LEGEND, FOOT]), r)
cell("the command without words and `list` give the same text as `ls`", (await sets("")) === r && (await sets("list")) === r, "")
await sets("use kimi-only")
r = await sets("ls")
cell("ls: the enabled set is marked with ● in the row, the first line names it (snapshot)", same(r.split("\n"), ["Наборы проекта cmdproj. Включён: «kimi-only».", ...ROWS("kimi-only"), ...LEGEND, FOOT]), r)
cell("ls carries no `семья/режим` cells and no line wider than the window /crew", !/claude\/task|kimi\/heavy/.test(r) && r.split("\n").every((l) => [...l].length <= 72), r)
cell("/crew-profiles ls and list = the table of the families (as the command without words)", (await profs("ls")) === (await profs("")) && (await profs("list")) === (await profs("")) && /claude\s+heavy\s+claude-code\/opus/.test(await profs("ls")), await profs("ls"))
cell("ls is a verb of both menus, list is not a separate verb", Core.SETS_VERB_HELP[0].verb === "ls" && Core.PROFILES_VERB_HELP[0].verb === "ls" && Cmd.SETS_VERBS.includes("ls") && !Cmd.SETS_VERBS.includes("list"), JSON.stringify(Core.SETS_VERB_HELP.map((v) => v.verb)))

// ---- item 7: view is gone ----
for (const kind of ["sets", "profiles"]) {
  const t = await (kind === "sets" ? sets : profs)("view")
  cell(`/crew-${kind} view: a clear refusal that says show; the data is untouched`, /Команды view больше нет, используй show/.test(t) && !/Неизвестный глагол/.test(t), t)
}

// ---- item 9: the pick in the window ----
const session = "ses_pick_demo"
mkdirSync(path.dirname(Core.cardFile(session)), { recursive: true })
writeFileSync(Core.cardFile(session), JSON.stringify({ session, directory: root, role: "worker", project: "cmdproj", repo: "r", pid: process.pid, updated: Date.now() }))
const mkApi = (script) => {
  const out = { shown: [], asked: [] }
  const api = {
    ui: {
      router: { current: () => ({ type: "session", sessionID: session }) },
      tabs: { list: () => [] },
      toast: { show: () => {} },
      dialog: {
        alert: (a) => out.shown.push(a),
        select: async (o) => (out.asked.push({ kind: "select", ...o }), script.shift()),
        prompt: async (o) => (out.asked.push({ kind: "prompt", ...o }), script.shift()),
      },
    },
    keymap: { layer: (f) => (out.cmds = f().commands) },
  }
  return { api, out }
}
const msg = (out) => out.shown.at(-1)?.message ?? ""
const slashOf = (out, n) => out.cmds.find((x) => x.slash?.name === n)
const strings = (o) => typeof o.title === "string" && (o.options ?? []).every((x) => typeof x.title === "string" && typeof x.description === "string" && typeof x.value === "string" && (x.footer === undefined || typeof x.footer === "string") && (x.category === undefined || typeof x.category === "string"))
const run = async (script, args, name = "crew-sets") => {
  const { api, out } = mkApi(script)
  const stop = Tui.default.setup(api)
  await slashOf(out, name).run(args)
  stop?.()
  return out
}
{
  let out = await run(["__esc"], undefined)
  const pick = out.asked[0]
  cell("/crew-sets opens a pick (dialog.select): a row per set, ● at the enabled one, the models in the description, `current` = the enabled set", pick.kind === "select" && same(pick.options.slice(0, 3).map((o) => o.value), ["cross-kimi", "default", "kimi-only"]) && pick.options[2].title.startsWith("● ") && !pick.options[0].title.startsWith("●") && pick.current === "kimi-only" && pick.options[2].description === "k3-256k" && pick.options[0].description === "opus/sonnet/haiku: разработка, планирование · k3-256k: приёмка, приёмка плана", JSON.stringify(pick))
  cell("the last row of the pick opens the verbs (`other actions`), every field is a string", pick.options.at(-1).value === "__verbs" && strings(pick), JSON.stringify(pick.options.at(-1)))
  out = await run([undefined], undefined)
  cell("Esc on the pick shows nothing and changes nothing", out.shown.length === 0 && L.profileState(root).name === "kimi-only", String(out.shown.length))
  out = await run(["default"], undefined)
  cell("Enter on a set enables it and shows the short result (the first line), no restart; «Загрузка…» first", out.shown[0]?.message === "Загрузка…" && /^Набор «default» включён \(был «kimi-only»\); новые сессии пойдут на нём, перезапуск не нужен\./.test(msg(out)) && L.profileState(root).name === "default" && out.asked.length === 1, JSON.stringify([out.shown.map((x) => x.message.slice(0, 40)), L.profileState(root).name]))
  for (const word of ["ls", "list", "  ls  "]) {
    out = await run(["__esc"], word)
    cell(`typed «${word.trim()}» opens the same pick`, out.asked.length === 1 && out.asked[0].options.some((o) => o.value === "kimi-only"), JSON.stringify(out.asked))
  }
  // the verbs: a verb with a name of a set opens the list of sets first
  out = await run(["__verbs", "show", "cross-kimi"], undefined)
  const menu = out.asked[1]
  cell("«other actions» opens the menu of the verbs: every verb of the command, ls first", same(menu.options.map((o) => o.value), Core.SETS_VERB_HELP.map((v) => v.verb)) && menu.options[0].value === "ls", JSON.stringify(menu.options.map((o) => o.value)))
  cell("show from the menu: the list of the real sets first (its title names the verb), then the short view of the chosen one; no text input", out.asked[2].kind === "select" && /show/.test(out.asked[2].title) && out.asked[2].options[0].value === "cross-kimi" && out.asked.every((a) => a.kind === "select") && /^Набор «cross-kimi» — выключен/.test(msg(out)), JSON.stringify(out.asked.map((a) => a.kind + ":" + a.title)) + msg(out).slice(0, 80))
  out = await run(["__verbs", "use", "kimi-only"], undefined)
  cell("use from the menu: the list, then the set is on (no text input)", out.asked.every((a) => a.kind === "select") && /^Набор «kimi-only» включён/.test(msg(out)) && L.profileState(root).name === "kimi-only", msg(out).slice(0, 100))
  await run([], "new tmp")
  out = await run(["__verbs", "rename", "tmp", "tmp2"], undefined)
  const pr = out.asked.find((a) => a.kind === "prompt")
  cell("rename from the menu: the list of the sets, then a text only for the second name (the old name in the title)", out.asked.map((a) => a.kind).join() === "select,select,select,prompt" && pr && /tmp/.test(pr.title) && /^Готово: набор «tmp» переименован в «tmp2»/.test(msg(out)), JSON.stringify(out.asked.map((a) => a.kind)) + msg(out))
  out = await run(["__verbs", "set", "tmp2", "develop kimi/heavy"], undefined)
  cell("set from the menu: the list, then a text for the stage and the cell", out.asked.at(-1).kind === "prompt" && /этап/.test(out.asked.at(-1).title + out.asked.at(-1).placeholder) && /^Готово: набор «tmp2»: этап «разработка» — kimi\/heavy/.test(msg(out)), msg(out))
  out = await run(["__verbs", "unset", "tmp2", "develop"], undefined)
  cell("unset from the menu: the list of the sets, then a pick among the stages of the set, no text", out.asked.every((a) => a.kind === "select") && same(out.asked.at(-1).options.map((o) => o.value), ["develop"]) && /^Готово: набор «tmp2»: этап «разработка» убран/.test(msg(out)), JSON.stringify(out.asked.at(-1)) + msg(out))
  out = await run(["__verbs", "delete", "tmp2"], undefined)
  cell("delete from the menu: the list, then the set is deleted", out.asked.every((a) => a.kind === "select") && /^Готово: набор «tmp2» удалён/.test(msg(out)) && !L.profileState(root).data.sets.tmp2, msg(out))
  out = await run(["__verbs", "new", "tmp3"], undefined)
  cell("new from the menu: only a text for the new name, no list of sets", same(out.asked.map((a) => a.kind), ["select", "select", "prompt"]) && /^Готово: создан пустой набор «tmp3»/.test(msg(out)), JSON.stringify(out.asked.map((a) => a.kind)) + msg(out))
  await run([], "delete tmp3")
  out = await run(["__verbs", "check"], undefined)
  cell("check from the menu runs at once (no list, no text)", out.asked.length === 2 && /^Проверка профилей:/.test(msg(out)), JSON.stringify(out.asked.map((a) => a.kind)))
  out = await run(["__verbs", "ls"], undefined)
  cell("ls from the menu is the pick again, not a text", out.asked.length === 3 && out.asked[2].options.some((o) => o.value === "kimi-only"), JSON.stringify(out.asked.map((a) => a.kind)))
}
{
  // /crew-profiles: the list of the families
  let out = await run(["codex"], undefined, "crew-profiles")
  const pick = out.asked[0]
  cell("/crew-profiles opens a pick of the families with the models of the tiers in the description", same(pick.options.slice(0, 3).map((o) => o.value), ["claude", "codex", "kimi"]) && pick.options[0].description === "heavy opus · medium sonnet · light haiku" && pick.options[2].description === "k3-256k" && pick.options.at(-1).value === "__verbs" && strings(pick), JSON.stringify(pick))
  cell("Enter on a family shows the family", /^Семья «codex» проекта cmdproj:/.test(msg(out)), msg(out))
  await run([], "new fam from kimi", "crew-profiles")
  out = await run(["__verbs", "delete", "fam", "__all"], undefined, "crew-profiles")
  cell("delete from the menu: the list of the families, then a pick of a tier or the whole family, no text", out.asked.every((a) => a.kind === "select") && same(out.asked.at(-1).options.map((o) => o.value), ["__all", "heavy", "medium", "light"]) && /^Готово: семья «fam» удалена/.test(msg(out)), JSON.stringify(out.asked.at(-1)) + msg(out))
  out = await run(["__verbs", "rename", "claude", "claude2"], undefined, "crew-profiles")
  cell("rename from the menu: the list of the families, then a text for the new name", same(out.asked.map((a) => a.kind), ["select", "select", "select", "prompt"]) && /^Готово: семья «claude» переименована в «claude2»/.test(msg(out)), JSON.stringify(out.asked.map((a) => a.kind)) + msg(out))
  await run([], "rename claude2 claude", "crew-profiles")
}

stopServer?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-sets-pick.test: FAIL ${fail}` : "crew-sets-pick.test ok")
process.exit(fail ? 1 : 0)

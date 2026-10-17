// Self-test of the readable answers of /crew-sets (task 066; node >= 24):
//   node test/crew-sets-readable.test.mjs
// `show` is a short view (a table stage x tier with short model names, a legend, one-line warnings, a hint) and a detailed view
// per stage (`show <stage>`, `show all` = the former full text); `use`, `check` and the edit verbs answer with one summary line
// first and then only what changed. Snapshots of the answers on a set whose stages are all alike and on a set with different
// models and inheritance; the rule of short names; the one-line warnings (the same family, a model out of the catalog, a hole).
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-sets-readable-"))
process.env.TEMP = tmp
process.env.TMP = tmp
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.XDG_CONFIG_HOME = path.join(tmp, "xdgcfg")
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_PROFILES_MS = "100000"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "600000"
process.env.CREW_HARNESS_PRESENCE = "all"

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const prof = (model, context, output, input) => ({ model, context, output, ...(input ? { input } : {}) })
const c = (family, tier) => ({ family, tier })
const KIMI = "kimi-code-plan-global/k3-256k"
const TABLE = {
  claude: { heavy: prof("claude-code/opus", 720000, 64000), medium: prof("claude-code/sonnet", 720000, 64000), light: prof("claude-code/haiku", 220000, 32000) },
  kimi: { heavy: prof(KIMI, 220000, 131072), medium: prof(KIMI, 220000, 131072), light: prof(KIMI, 220000, 131072) },
  codex: { heavy: prof("openai/gpt-5.5", 525000, 128000, 461000), medium: prof("openai/gpt-5.6-terra", 525000, 128000, 461000), light: prof("openai/gpt-6-luna", 525000, 128000, 461000) },
  ghost: { heavy: prof("openai/gpt-9-ghost", 100000, 8000), medium: prof("openai/gpt-9-ghost", 100000, 8000), light: prof("openai/gpt-9-ghost", 100000, 8000) },
  partial: { heavy: prof("openai/gpt-7-part", 100000, 8000) },
}
const kimiAll = { develop: c("kimi", "heavy"), plan: c("kimi", "heavy"), develop_accept: c("kimi", "heavy"), plan_accept: c("kimi", "heavy") }
const SETS = {
  "kimi-only": kimiAll,
  "kimi-twin": kimiAll,
  mixed: { develop: c("claude", "task"), plan: c("claude", "heavy"), develop_accept: c("codex", "heavy"), plan_accept: c("codex", "heavy") },
  same: { develop: c("claude", "heavy"), develop_accept: c("claude", "heavy"), plan: c("claude", "heavy"), plan_accept: c("codex", "heavy") },
  ghost: { develop: c("ghost", "heavy") },
  hole: { develop: c("partial", "task") },
}
const root = path.join(tmp, "proj")
const cfgDir = path.join(root, "proj-settings")
mkdirSync(path.join(cfgDir, ".opencode"), { recursive: true })
const file = path.join(cfgDir, ".opencode", "crew-harness.json")
git(cfgDir, "init", "-q", "-b", "main")
writeFileSync(file, JSON.stringify({ project: "readproj", root: "..", model_profiles: TABLE, profile_sets: SETS }, null, 2))
git(cfgDir, "add", "-A")
git(cfgDir, "commit", "-q", "-m", "settings")
mkdirSync(path.join(process.env.XDG_CONFIG_HOME, "opencode"), { recursive: true })
writeFileSync(path.join(process.env.XDG_CONFIG_HOME, "opencode", "opencode.jsonc"), `{ "compaction": { "reserved": 20000 }, "provider": { "kimi-code-plan-global": { "models": { "k3-256k": { "limit": { "context": 262144, "output": 131072 } } } } } }\n`)

const mod = await import("../index.ts")
const Cmd = await import("../profile-cmd.ts")
const St = await import("../status.ts")
const { writeSettings } = await import("../settings.ts")
const ctx = {
  location: { directory: root },
  app: { name: "opencode", version: "2.0.23-test" },
  options: { projects: [cfgDir] },
  command: { list: async () => ({ data: [] }), transform: async (fn) => fn({ add: () => {} }) },
  model: { list: async () => ({ data: [] }) },
  session: { get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: root }, time: {} }), prompt: async () => {}, synthetic: async () => {}, hook: async () => {} },
  tool: { transform: async (fn) => fn({ add: () => {} }) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const catalog = [
  { providerID: "claude-code", modelID: "opus" }, { providerID: "claude-code", modelID: "sonnet" }, { providerID: "claude-code", modelID: "haiku" },
  { providerID: "kimi-code-plan-global", modelID: "k3-256k" },
  { providerID: "openai", modelID: "gpt-5.5" }, { providerID: "openai", modelID: "gpt-5.6-terra" }, { providerID: "openai", modelID: "gpt-6-luna" },
  { providerID: "openai", modelID: "gpt-7-part" },
]
const deps = { version: "2.0.23-test", catalog: async () => catalog }
const sets = (t) => Cmd.runSetsCommand(root, t, deps)
const lines = (t) => t.split("\n")
const W = St.DIALOG_WIDTH
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---- the rule of short names ----
{
  const m = Cmd.shortModelNames(["claude-code/claude-opus-5-5", "claude-code/claude-sonnet-5-5", "claude-code/haiku", "openai/gpt-6-astra", "openai/gpt-6.1-sol", "openai/gpt-6-luna"])
  cell("short names: the word of the model without brand, version and provider", same([...m.values()], ["opus", "sonnet", "haiku", "astra", "sol", "luna"]), JSON.stringify([...m]))
  const f = Cmd.shortModelNames(["openai/gpt-5.5", "openai/gpt-5.5-fast"])
  cell("short names: a bare version and a modifier word keep the id (gpt-5.5, gpt-5.5-fast)", same([...f.values()], ["gpt-5.5", "gpt-5.5-fast"]), JSON.stringify([...f]))
  const d = Cmd.shortModelNames(["a/claude-opus-4-1", "a/claude-opus-5-5"])
  cell("short names: two different models never share a name (the same word -> the id without provider)", same([...d.values()], ["claude-opus-4-1", "claude-opus-5-5"]), JSON.stringify([...d]))
  const p = Cmd.shortModelNames(["p1/claude-opus-5", "p2/claude-opus-5"])
  cell("short names: the same id of two providers -> the full name", same([...p.values()], ["p1/claude-opus-5", "p2/claude-opus-5"]), JSON.stringify([...p]))
  const v = Cmd.shortModelNames(["openai/gpt-6-luna#high", "openai/gpt-6-luna#low", "openai/gpt-6-luna"])
  cell("short names: variants stay apart (luna·high, luna·low, luna)", same([...v.values()], ["luna·high", "luna·low", "luna"]), JSON.stringify([...v]))
  const x = Cmd.shortModelNames(["p/opus-4", "p/claude-opus-5", "p/claude-opus-6", "q/luna"])
  cell("short names: all names of a mixed list are distinct", new Set(x.values()).size === 4, JSON.stringify([...x]))
}

// ---- the short view: a set whose stages are all alike ----
let r = await sets("show kimi-only")
cell("short view, all stages alike: one line, the legend split to the width, one family warning, the hint (snapshot)", same(lines(r), [
  "Набор «kimi-only» — выключен",
  "все этапы: heavy/medium/light → k3-256k",
  "  k3-256k — kimi-code-plan-global/k3-256k",
  "      контекст 220K · вывод до 131072",
  "⚠ все приёмки на той же семье kimi, что авторы; есть claude",
  "Подробно: /crew-sets show <этап> или show all",
]), r)

// ---- the short view: different models and inheritance ----
r = await sets("show mixed")
cell("short view, different models and inheritance: table, `как «…»`, legend, no warning, the hint (snapshot)", same(lines(r), [
  "Набор «mixed» — выключен",
  "этап             heavy    medium   light",
  "разработка       opus     sonnet   haiku",
  "приёмка          gpt-5.5  gpt-5.5  gpt-5.5",
  "планирование     opus     opus     opus",
  "приёмка плана    gpt-5.5  gpt-5.5  gpt-5.5",
  "разбор           как «планирование»",
  "приёмка разбора  как «приёмка плана»",
  "сдача            sonnet   haiku    haiku",
  "приёмка сдачи    terra    terra    terra",
  "  opus — claude-code/opus · контекст 720K · вывод до 64K",
  "  sonnet — claude-code/sonnet · контекст 720K · вывод до 64K",
  "  haiku — claude-code/haiku · контекст 220K · вывод до 32K",
  "  gpt-5.5 — openai/gpt-5.5 · контекст 525K · ввод 461K · вывод до 128K",
  "  terra — openai/gpt-5.6-terra",
  "      контекст 525K · ввод 461K · вывод до 128K",
  "Подробно: /crew-sets show <этап> или show all",
]), r)
cell("the short view carries no path of a settings file and no tier slice or inheritance remarks", !/\.jsonc?\b|срез границами|унаследован|по ступени задачи/.test(r), r)

// ---- the one-line warnings ----
r = await sets("show same")
{
  const w = lines(r).filter((l) => l.startsWith("⚠"))
  cell("warning: the check on the same family as its author is one line naming the stages and the other family", w.length === 1 && /^⚠ приёмка, приёмка сдачи на той же семье claude, что авторы; есть codex$/.test(w[0]), r)
}
r = await sets("show ghost")
cell("warning: a model out of the catalog of OpenCode is one line", lines(r).some((l) => l === "⚠ модели openai/gpt-9-ghost нет в каталоге OpenCode"), r)
r = await sets("show hole")
cell("warning: a family without the tier the set needs is a ⚠ line (cut to the width) and the cell says `нет профиля`", lines(r).some((l) => l.startsWith("⚠") && /partial/.test(l)) && /нет профиля/.test(r), r)
for (const n of ["kimi-only", "kimi-twin", "mixed", "same", "ghost", "hole"]) {
  const t = await sets(`show ${n}`)
  cell(`the short view of «${n}» is not wider than the window /crew (${W}) in any line`, lines(t).every((l) => [...l].length <= W), lines(t).filter((l) => [...l].length > W).join(" | "))
}
cell("the width constant of the short view equals DIALOG_WIDTH of status.ts", Cmd.SETS_VIEW_WIDTH === W, String(Cmd.SETS_VIEW_WIDTH))

// ---- the detailed view: one stage, all ----
r = await sets("show mixed приёмка")
cell("detail of a stage by the Russian word: only that stage, with the note that the profile window is not applied", /приёмка: codex\/heavy → openai\/gpt-5\.5/.test(r) && /контекст профиля здесь не применяется/.test(r) && !/разработка:/.test(r) && !/планирование:/.test(r), r)
r = await sets("show mixed delivery")
cell("detail of an inherited stage: the source, one tier lower, the tiers of the task", /сдача: claude\/task \(унаследован от «разработка», ступенью ниже\) — по ступени задачи: heavy → claude-code\/sonnet, medium → claude-code\/haiku, light → claude-code\/haiku/.test(r), r)
r = await sets("show mixed приёмка плана")
cell("detail by a stage name of two words", /приёмка плана: codex\/heavy → openai\/gpt-5\.5/.test(r) && !/разбор:/.test(r), r)
r = await sets("show mixed develop")
cell("detail of a front stage: the window of the profile in the worktree of the task", /разработка: claude\/task — по ступени задачи:/.test(r) && /контекст профиля в рабочем дереве задачи \(heavy\): контекст 720K · вывод до 64K/.test(r), r)
r = await sets("show same develop_accept")
cell("detail of a check stage carries the full note about the family", /заметка: «приёмка» идёт на той же семье claude, что «разработка»; в справочнике есть другая \(codex\)/.test(r), r)
r = await sets("show mixed all")
cell("show <set> all: the former full text, all eight stages", ["разработка:", "приёмка:", "планирование:", "приёмка плана:", "разбор:", "приёмка разбора:", "сдача:", "приёмка сдачи:"].every((s) => r.includes(`  ${s} `)) && /^Набор «mixed» — не включён:/.test(r), r)
r = await sets("show nonsense")
cell("show with an unknown word names the sets and the stages", /nonsense/.test(r) && /kimi-only/.test(r) && /develop_accept/.test(r), r)
r = await sets("show")
cell("show without a set enabled still says so", /Набор не включён/.test(r), r)

// ---- use: the summary line first, then only what changed ----
await sets("use kimi-twin")
r = await sets("use kimi-only")
{
  // the warnings that do not belong to the stages (a hole in another set, a hand-written window of the main folder) are separate lines
  const l = lines(r).filter((x) => !/^⚠ (набор «hole»|в основной папке проекта)/.test(x))
  cell("use, nothing changed (task 075): the summary, `без изменений`, the window, the warning, `не закоммичено`, the hint (snapshot)",
    same(l, [
      "Набор «kimi-only» включён (был «kimi-twin»)",
      "Работа:   k3-256k  (без изменений)",
      "Приёмка:  k3-256k  (без изменений)",
      "Новые сессии пойдут на k3-256k, перезапуск не нужен.",
      "Контекст модели: 220K, вывод до 131072.",
      "⚠ Приёмка на той же семье, что и работа: проверяет та же модель, что пишет. Другая семья есть: claude.",
      "Не закоммичено — это локальная настройка проекта.",
      "Подробно: /crew-sets show <этап> или show all",
    ]), r)
}
r = await sets("use mixed")
cell("use, windows changed (task 075): the stages by words with `было`, the groups of windows, no table, no old paragraph", /^Набор «mixed» включён \(был «kimi-only»\)$/m.test(r) && /^Разработка:\s+haiku \/ sonnet \/ opus по размеру задачи\s+\(было k3-256k\)$/m.test(r) && /^Контекст: haiku — 220K, вывод до 32K; sonnet, opus — 720K, вывод до 64K; gpt-5\.5 — 525K, ввод 461K, вывод до 128K \(у «kimi-only» было 220K, вывод до 131072\)\.$/m.test(r) && !/^этап /m.test(r) && !/Контекст сессий в рабочих деревьях|Этапы:|Файлы окон: записано|Приёмка и приёмка плана: контекст профиля здесь|^окно /m.test(r), r)
r = await sets("use kimi-only")
cell("use: a smaller window gives one warning line with the old and new threshold", /^⚠ Контекст уменьшен: k3-256k \(порог сжатия 242144 → 200K\); вкладки выше порога сожмутся на следующем ходе\.$/m.test(r), r)
await sets("use mixed")

// ---- the edit verbs: the first line is the result ----
r = await sets("set mixed develop claude/heavy")
cell("set: the first line is the result with `was`, no long phrase about the file", lines(r)[0] === "Готово: набор «mixed»: этап «разработка» — claude/heavy (было claude/task). Без коммита." && !/записано в файл проекта/.test(r), r)
r = await sets("unset mixed разработка")
cell("unset: one result line", /^Готово: набор «mixed»: этап «разработка» убран/.test(r) && lines(r)[0].length > 10, r)
r = await sets("new fresh from mixed")
cell("new: one result line", /^Готово: создан набор «fresh» как копия «mixed»\. Без коммита\./.test(r), r)
r = await sets("rename fresh fresh2")
cell("rename: one result line", /^Готово: набор «fresh» переименован в «fresh2»/.test(r), r)
r = await sets("delete fresh2")
cell("delete: one result line", /^Готово: набор «fresh2» удалён\. Без коммита\./.test(r), r)

// ---- check: the summary first, warnings, then the facts about the environment ----
r = await sets("check")
{
  const l = lines(r)
  cell("check: the first line is the summary; no line starts with `!`; warnings are ⚠ lines", /^Проверка профилей: замечаний (нет|\d+)/.test(l[0]) && !l.some((x) => x.startsWith("!")) && l.some((x) => /^Включён: /.test(x) || /Включён: /.test(x)), r)
}
await sets("use kimi-twin")
r = await sets("off")
cell("off: one summary line first", /^Набор «kimi-twin» выключен; новые сессии пойдут по spawn_models, перезапуск не нужен\./.test(r), r)

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-sets-readable.test: FAIL ${fail}` : "crew-sets-readable.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the two screens that open after a choice (task 075; node >= 24):
//   node test/crew-set-screens.test.mjs
// The screen after `use` (also the answer of Enter on a set): the stages by human words (work / review), a model per stage instead of
// the tiers, `was -> now` collapsed where alike, the running sessions that stay on the old models (from the statuses of the plugin),
// the window of the model, the warning about the same family, the one closing line; the service words (files of windows, hand-written
// settings) are only in the detailed view. The screen of a family (`show <family>`): the tiers, the sets that use the family by stage
// words, whether the enabled set uses it now. Snapshots on: codex -> kimi, no change, different models, split stages, no set
// enabled, a project with a tier bound, a family nobody uses.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-set-screens-"))
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
  codex: { heavy: prof("openai/gpt-6-astra", 525000, 128000, 461000), medium: prof("openai/gpt-6.1-sol", 525000, 128000, 461000), light: prof("openai/gpt-6-luna", 525000, 128000, 461000) },
  kimi: { heavy: prof(KIMI, 220000, 131072), medium: prof(KIMI, 220000, 131072), light: prof(KIMI, 220000, 131072) },
  lone: { heavy: prof("openai/gpt-7-lone", 100000, 8000), medium: prof("openai/gpt-7-lone", 100000, 8000), light: prof("openai/gpt-7-lone", 100000, 8000) },
}
const four = (work, check) => ({ develop: c(work, "task"), plan: c(work, "task"), develop_accept: c(check, "task"), plan_accept: c(check, "task") })
const SETS = {
  codexset: four("codex", "codex"),
  kimiset: four("kimi", "kimi"),
  crossset: four("codex", "claude"),
  splitset: { develop: c("codex", "task"), plan: c("claude", "task"), develop_accept: c("kimi", "task"), plan_accept: c("kimi", "task") },
  twoset: four("codex", "kimi"),
  extraset: { ...four("codex", "codex"), spec: c("claude", "heavy") },
}
const root = path.join(tmp, "proj")
const cfgDir = path.join(root, "proj-settings")
mkdirSync(path.join(cfgDir, ".opencode"), { recursive: true })
const file = path.join(cfgDir, ".opencode", "crew-harness.json")
const base = { project: "readproj", root: ".." }
git(cfgDir, "init", "-q", "-b", "main")
writeFileSync(file, JSON.stringify({ ...base, model_profiles: TABLE, profile_sets: SETS }, null, 2))
git(cfgDir, "add", "-A")
git(cfgDir, "commit", "-q", "-m", "settings")
mkdirSync(path.join(process.env.XDG_CONFIG_HOME, "opencode"), { recursive: true })
writeFileSync(path.join(process.env.XDG_CONFIG_HOME, "opencode", "opencode.jsonc"), "{}\n")
// the statuses of the plugin (status/<session>.json): what the screen counts as the running sessions
const statusDir = path.join(process.env.XDG_DATA_HOME, "opencode", "crew-harness", "status")
mkdirSync(statusDir, { recursive: true })
const st = (id, project, model, task, extra = {}) =>
  writeFileSync(path.join(statusDir, `${id}.json`), JSON.stringify({ session: id, project, role: task ? "worker" : "integrator", title: "", model, state: "working", detail: "x", watches: [], asked: [], tasks: [], updated: Date.now(), ...(task ? { task } : {}), ...extra }))
st("s1", "readproj", "openai/gpt-6-luna#default", { n: 94, status: "running", as: "executor", title: "Выпустить Windows seed" })
st("s2", "readproj", "openai/gpt-6.1-sol#default", { n: 98, status: "submitted", as: "reviewer", title: "Проверить контракты" })
st("s3", "readproj", `${KIMI}#low`, { n: 99, status: "running", as: "executor", title: "Одна строка, которая заметно длиннее сорока знаков" })
st("s4", "otherproj", "openai/gpt-6-luna#default", { n: 7, status: "running", as: "executor", title: "Чужой проект" })
st("s5", "readproj", "openai/gpt-6-luna#default", { n: 61, ref: "061", status: "submitted", as: "executor", title: "Сдана", group: true, label: "С1-1" })
st("s6", "readproj", "openai/gpt-6-luna#default", undefined)
st("s7", "readproj", "openai/gpt-6-luna#default", { n: 91, status: "accepted", as: "executor", title: "Принята" })
st("s8", "readproj", "openai/gpt-6-luna#default", { n: 33, status: "rework", as: "reviewer", title: "Приёмщик отдал на доработку" })

const mod = await import("../index.ts")
const Cmd = await import("../profile-cmd.ts")
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
const catalog = ["claude-code/opus", "claude-code/sonnet", "claude-code/haiku", KIMI, "openai/gpt-6-astra", "openai/gpt-6.1-sol", "openai/gpt-6-luna", "openai/gpt-7-lone"].map((m) => ({ providerID: m.split("/")[0], modelID: m.split("/")[1] }))
const deps = { version: "2.0.23-test", catalog: async () => catalog }
const sets = (t) => Cmd.runSetsCommand(root, t, deps)
const profs = (t) => Cmd.runProfilesCommand(root, t, deps)
const lines = (t) => t.split("\n")
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const HINT = "Подробно: /crew-sets show <этап> или show all"
const SAME_FAMILY = "⚠ Приёмка на той же семье, что и работа: проверяет та же модель, что пишет. Другая семья есть: claude."
const LOCAL = "Не закоммичено — это локальная настройка проекта."
const bump = () => writeSettings(cfgDir, {}) // drops the settings cache of the folder

// ---- the screen after use: codex -> kimi (the case of the owner), with running sessions ----
await sets("use codexset")
let r = await sets("use kimiset")
cell("use codex -> kimi: the human screen (snapshot): stages by words, was -> now, the running sessions, the window, the warning, the closing line", same(lines(r), [
  "Набор «kimiset» включён (был «codexset»)",
  "Работа:   k3-256k  (было luna / sol / astra по размеру задачи)",
  "Приёмка:  k3-256k  (было те же)",
  "Идущие сессии остаются на прежних моделях (сейчас 2: #94, #98); новые пойдут на k3-256k, перезапуск не нужен.",
  "  #94 «Выпустить Windows seed» — luna",
  "  #98 «Проверить контракты» — sol",
  "Контекст модели: 220K, вывод до 131072 (у «codexset» было 525K, ввод 461K, вывод до 128K).",
  SAME_FAMILY,
  LOCAL,
  HINT,
]), r)
cell("the screen carries no tier word, no table, no legend of full names, no service words", !/\b(heavy|medium|light)\b/.test(r) && !/окна прежние|окно k3|файлы окон|рукописным настройкам|все этапы|контекст профиля/.test(r) && !/kimi-code-plan-global/.test(r), r)

// ---- the same set again: nothing changed ----
r = await sets("use kimiset")
cell("use of the enabled set: `уже включён`, `без изменений`, no sessions line (nothing to stay on)", same(lines(r), [
  "Набор «kimiset» уже включён",
  "Работа:   k3-256k  (без изменений)",
  "Приёмка:  k3-256k  (без изменений)",
  "Контекст модели: 220K, вывод до 131072.",
  SAME_FAMILY,
  LOCAL,
  HINT,
]), r)

// ---- different models: work on codex, check on claude ----
r = await sets("use crossset")
cell("use kimi -> a set with different models (snapshot): a name per tier by size, groups of windows, one session left on the old model", same(lines(r), [
  "Набор «crossset» включён (был «kimiset»)",
  "Работа:   luna / sol / astra по размеру задачи     (было k3-256k)",
  "Приёмка:  haiku / sonnet / opus по размеру задачи  (было те же)",
  "Идущие сессии остаются на прежних моделях (сейчас 1: #99); новые пойдут на модели набора, перезапуск не нужен.",
  "  #99 «Одна строка, которая заметно длиннее со…» — k3-256k",
  "Контекст: luna, sol, astra — 525K, ввод 461K, вывод до 128K; haiku — 220K, вывод до 32K; sonnet, opus — 720K, вывод до 64K (у «kimiset» было 220K, вывод до 131072).",
  LOCAL,
  HINT,
]), r)

// ---- split stages: work and planning differ, the checks alike ----
r = await sets("use splitset")
{
  const one = (t) => lines(t).map((l) => l.replace(/ {2,}/g, " ")) // the columns are aligned: compare the words
  cell("use with different models of work and planning: the stages are named one by one, the checks stay together", same(one(r).slice(0, 5), [
    "Набор «splitset» включён (был «crossset»)",
    "Разработка: luna / sol / astra по размеру задачи (без изменений)",
    "Планирование: haiku / sonnet / opus по размеру задачи (было luna / sol / astra по размеру задачи)",
    "Приёмка: k3-256k (было haiku / sonnet / opus по размеру задачи)",
    "Идущие сессии остаются на прежних моделях (сейчас 1: #99); новые пойдут на модели набора, перезапуск не нужен.",
  ]), r)
  cell("split stages: `Приёмка` stands once for both checks and `Приёмка плана` is not repeated", (r.match(/^Приёмка/gm) ?? []).length === 1 && !/Приёмка плана/.test(r), r)
}

// ---- a stage described apart (spec) is named, nothing else about the extras ----
r = await sets("use extraset")
cell("use of a set with a stage described apart: one line names it and points to the detailed view", lines(r).includes("Отдельно описаны ещё: разбор (подробности — show all)."), r)

// ---- no set enabled before ----
await sets("off")
r = await sets("use codexset")
cell("use when no set was enabled: no `(был …)`, the old side is `по spawn_models`", lines(r)[0] === "Набор «codexset» включён" && lines(r)[1] === "Работа:   luna / sol / astra по размеру задачи  (было по spawn_models)" && lines(r)[2] === "Приёмка:  luna / sol / astra по размеру задачи  (было те же)" && !/\(у «/.test(r), r)

// ---- a tier bound of the project is named: it explains why the tiers collapsed ----
{
  const raw = JSON.parse(readFileSync(file, "utf8"))
  raw.tier_max = "light"
  writeFileSync(file, JSON.stringify(raw, null, 2))
  bump()
  await sets("use kimiset")
  r = await sets("use codexset")
  cell("use with tier_max light: one name per stage (the bound cut the tiers) and a line naming the bound", lines(r)[1] === "Работа:   luna  (было k3-256k)" && lines(r)[2] === "Приёмка:  luna  (было те же)" && lines(r).includes("Ступени ограничены проектом: не выше light (tier_max).") && /Контекст модели: 525K, ввод 461K, вывод до 128K \(у «kimiset» было 220K, вывод до 131072\)\./.test(r), r)
  delete raw.tier_max
  writeFileSync(file, JSON.stringify(raw, null, 2))
  bump()
}

// ---- the screen after a family is chosen ----
await sets("use kimiset")
r = await profs("show codex")
cell("a family not used by the enabled set (snapshot): the tiers with `то же`, the sets by stage words, the closing line says it is not used now", same(lines(r), [
  "Семья «codex» (проект readproj)",
  "  heavy   gpt-6-astra  контекст 525K, ввод 461K, вывод 128K",
  "  medium  gpt-6.1-sol  то же",
  "  light   gpt-6-luna   то же",
  "Используют наборы: codexset (разработка, приёмка, планирование, приёмка плана); crossset (разработка, планирование); extraset (разработка, приёмка, планирование, приёмка плана); splitset (разработка); twoset (разработка, планирование).",
  "Включён набор «kimiset» — эта семья сейчас не используется.",
]), r)
cell("the family screen has no `Ссылаются`, no `(этап «…», codex/task)` cells", !/Ссылаются|этап «|codex\/task/.test(r), r)
await sets("use codexset")
r = await profs("show codex")
cell("a family used by the enabled set: the closing line names the stages", lines(r).at(-1) === "Включён набор «codexset» — эта семья используется: разработка, приёмка, планирование, приёмка плана.", r)
r = await profs("show kimi")
cell("a family that the enabled set does not use says so", /^Включён набор «codexset» — эта семья сейчас не используется\.$/m.test(r), r)
r = await profs("show lone")
cell("a family nobody uses: one line, no `включён набор`", lines(r).at(-1) === "Ни один набор эту семью не использует." && !/Включён набор/.test(r), r)
await sets("off")
r = await profs("show codex")
cell("no set enabled: the closing line says the models come from spawn_models", lines(r).at(-1) === "Набор не включён — модели по spawn_models.", r)
r = await profs("show nosuch")
cell("an unknown family names the existing ones", /nosuch/.test(r) && /claude, codex, kimi, lone/.test(r), r)
r = await profs("delete codex")
cell("the refusal to delete a family in use still lists the sets by their cells (the old text is kept for the refusal)", /ссылаются наборы: «codexset» \(этап «разработка», codex\/task\)/.test(r), r)

// ---- the service line about the files of windows: only when something was written or went wrong ----
{
  cell("files line: nothing written -> no line", Cmd.filesNote({ written: [], removed: [], foreign: [], errors: [] }, 3) === undefined, "")
  cell("files line: written and removed -> the counts and the trees", Cmd.filesNote({ written: ["a", "b"], removed: ["c"], foreign: [], errors: [] }, 3) === "Файлы окон в рабочих деревьях задач: записано 2, снято 1 (деревьев задач: 3).", String(Cmd.filesNote({ written: ["a", "b"], removed: ["c"], foreign: [], errors: [] }, 3)))
  const bad = Cmd.filesNote({ written: [], removed: [], foreign: ["x"], errors: ["y: EPERM"] }, 1)
  cell("files line: an error or a foreign file is a warning that names it", /^⚠ Окна задач не записаны/.test(bad) && /y: EPERM/.test(bad) && /чужой файл окон/.test(bad), String(bad))
}

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-set-screens.test: FAIL ${fail}` : "crew-set-screens.test ok")
process.exit(fail ? 1 : 0)

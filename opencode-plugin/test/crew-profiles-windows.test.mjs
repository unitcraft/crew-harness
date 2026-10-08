// Self-test of the window file in the task worktree (task 003; node >= 24):  node test/crew-profiles-windows.test.mjs
// The windows of the models of the enabled set are written as .opencode/opencode.json (with the mark of the plugin) into the
// worktree of each task before the first turn, updated when the set or the data change, removed when the set is gone or
// the task is accepted / cancelled / its folder vanished; hand-written files are never touched; the root and the main
// folders get nothing; git ignores the file through info/exclude. A real git repository with real worktrees.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-profiles-windows-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.XDG_CONFIG_HOME = path.join(tmp, "xdgcfg")
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_PROFILES_MS = "150"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
process.env.CREW_HARNESS_PRESENCE = "all"

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex")
const prof = (model, context, output, input) => ({ model, context, output, ...(input ? { input } : {}) })
const c = (family, tier) => ({ family, tier })
const TABLE = {
  claude: { heavy: prof("claude-code/opus", 720000, 64000), medium: prof("claude-code/sonnet", 720000, 64000), light: prof("claude-code/haiku", 220000, 32000) },
  kimi: { heavy: prof("kimi-code-plan-global/k3-256k", 220000, 131072), medium: prof("kimi-code-plan-global/k3-256k", 220000, 131072), light: prof("kimi-code-plan-global/k3-256k", 220000, 131072) },
  codex: { heavy: prof("openai/gpt-5.5", 525000, 128000, 461000), medium: prof("openai/gpt-5.6-terra", 525000, 128000, 461000), light: prof("openai/gpt-6-luna", 525000, 128000, 461000) },
}
const SETS = {
  default: { develop: c("claude", "task"), plan: c("claude", "task"), accept: c("claude", "task"), plan_accept: c("claude", "task") },
  "cross-codex": { develop: c("claude", "medium"), plan: c("claude", "heavy"), accept: c("codex", "heavy"), plan_accept: c("codex", "heavy") },
  "kimi-only": { develop: c("kimi", "heavy"), plan: c("kimi", "heavy"), accept: c("kimi", "heavy"), plan_accept: c("kimi", "heavy") },
}
const base = { spawn_limits: { worker: 50, "*": 50, reviewer: 50 }, inflight_limit: 50, worktrees: "wt", cleanup: "none", branch_name: "p{n}-{slug}" }
const settingsOf = (dir) => path.join(dir, ".opencode", "crew-harness.json")
const writeSettings = (dir, obj) => writeFileSync(settingsOf(dir), JSON.stringify({ ...base, ...obj }))
const readSettings = (dir) => JSON.parse(readFileSync(settingsOf(dir), "utf8"))
const mkRepo = (name, obj) => {
  const dir = path.join(tmp, name)
  mkdirSync(path.join(dir, ".opencode"), { recursive: true })
  writeSettings(dir, obj)
  git(dir, "init", "-q", "-b", "main")
  writeFileSync(path.join(dir, "a.txt"), "a\n")
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", "init")
  return dir
}
const proj = mkRepo("proj", { model_profiles: TABLE, profile_sets: SETS })
const other = mkRepo("other", {}) // a project without profiles, its own repository
// hand-written files that must never change
mkdirSync(path.join(process.env.XDG_CONFIG_HOME, "opencode"), { recursive: true })
const globalCfg = path.join(process.env.XDG_CONFIG_HOME, "opencode", "opencode.jsonc")
writeFileSync(globalCfg, '{ // hand-written\n  "compaction": { "reserved": 20000 }, "provider": { "openai": { "models": { "gpt-5.5": { "limit": { "context": 1050000, "output": 128000 } } } } } }\n')
const rootJsonc = path.join(proj, ".opencode", "opencode.jsonc")
writeFileSync(rootJsonc, '{ "provider": { "claude-code": { "models": { "opus": { "limit": { "context": 520000, "output": 64000 } } } } } }\n')
const handHashes = () => [sha(globalCfg), sha(rootJsonc)].join()
const hand0 = handHashes()

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const L = await import("../profile-layer.ts")
const W = await import("../profile-windows.ts")
const hooks = {}
const tools = {}
const events = {}
const atCreate = new Map()
const dirOf = new Map()
const ctx = {
  location: { directory: proj },
  options: { projects: { proj, other } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf.get(sessionID) ?? proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    create: async (req) => {
      const f = path.join(req.location.directory, ".opencode", "opencode.json")
      atCreate.set(req.id, { dir: req.location.directory, file: existsSync(f) ? readFileSync(f, "utf8") : null })
      return { id: req.id }
    },
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 20_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
  return cond()
}
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const task = (project, n) => tasks.loadTask(project, n)
const use = (name, dir = proj) => {
  const s = L.profileState(dir)
  L.writeLayer(s.project, name ? L.layerSetName(s.layer, s.raw, name) : {})
}
const tab = async (sid, role, dir = proj) => {
  dirOf.set(sid, dir)
  await hooks.context({ sessionID: sid, system: [], model: { id: "x", providerID: "y" } })
  await call("crew_role", sid, { role })
}
const spawn = async (sid, input = {}) => call("crew_spawn", sid, { title: "t", goal: "g", criteria: "c", ...input })
const fileOf = (wt) => (existsSync(W.windowPath(wt)) ? readFileSync(W.windowPath(wt), "utf8") : null)
const models = (text) => {
  const j = JSON.parse(text)
  const out = {}
  for (const [p, v] of Object.entries(j.provider ?? {})) for (const [id, m] of Object.entries(v.models)) out[`${p}/${id}`] = m.limit
  return out
}
await tab("sesINTEG", "integrator")
await tab("sesOTHER", "integrator", other)

// ---- REQ-22 / AC-02 / AC-08: the file in the worktree before the first turn ----
use("cross-codex")
const sp1 = await spawn("sesINTEG", {})
const t1 = task("proj", 1)
const created1 = atCreate.get(t1.executor)
cell("REQ-22 the file is in the worktree of the task BEFORE session.create (before the first turn)", !!t1.worktree && created1?.dir === t1.worktree && !!created1.file, sp1 + JSON.stringify(created1?.dir))
const m1 = created1?.file ? models(created1.file) : {}
cell("AC-08 the file holds all three tiers of every family of the set (claude and codex): six models, context and output together", Object.keys(m1).length === 6 && Object.values(m1).every((l) => l.context > 0 && l.output > 0), JSON.stringify(m1))
cell("AC-34 a model with input has the three fields, a model without input has two", JSON.stringify(m1["openai/gpt-5.5"]) === JSON.stringify({ context: 525000, input: 461000, output: 128000 }) && JSON.stringify(m1["claude-code/opus"]) === JSON.stringify({ context: 720000, output: 64000 }), JSON.stringify([m1["openai/gpt-5.5"], m1["claude-code/opus"]]))
cell("DNC-02 the file has the mark and no compaction key at all", JSON.parse(created1.file)._crew_harness && !/compaction/.test(created1.file), created1.file.slice(0, 200))
cell("AC-11 git sees nothing: the file is excluded through info/exclude of the common git dir, the line is there once", git(t1.worktree, "status", "--porcelain") === "" && readFileSync(path.join(proj, ".git", "info", "exclude"), "utf8").split(/\r?\n/).filter((l) => l === "/.opencode/opencode.json").length === 1, git(t1.worktree, "status", "--porcelain"))
cell("AC-08(в)/AC-11 the root and the main folder get no file; the hand-written files are byte for byte the same", !existsSync(path.join(proj, ".opencode", "opencode.json")) && handHashes() === hand0, handHashes())
cell("AC-02 the registry names the worktree", Object.keys(W.readRegistry("proj")).includes(path.resolve(t1.worktree)), JSON.stringify(W.readRegistry("proj")))

// ---- REQ-09: a change of the set / of the data updates the file ----
use("default")
await until(() => Object.keys(models(fileOf(t1.worktree) ?? "{}")).length === 3)
const m2 = models(fileOf(t1.worktree))
cell("REQ-09 the set changed (cross-codex -> default): the file follows within a pass (claude only)", Object.keys(m2).join() === "claude-code/haiku,claude-code/opus,claude-code/sonnet", JSON.stringify(m2))
const s0 = readSettings(proj)
s0.model_profiles.claude.heavy.context = 650000
writeSettings(proj, s0)
await until(() => models(fileOf(t1.worktree) ?? "{}")["claude-code/opus"]?.context === 650000)
cell("REQ-09 the data changed (the window of a profile edited in the file): the file follows", models(fileOf(t1.worktree))["claude-code/opus"].context === 650000, fileOf(t1.worktree))
s0.model_profiles.claude.heavy.context = 720000
writeSettings(proj, s0)
await until(() => models(fileOf(t1.worktree) ?? "{}")["claude-code/opus"]?.context === 720000)

// ---- AC-34: a profile without input -> no input in the file ----
{
  const s = readSettings(proj)
  delete s.model_profiles.codex.medium.input
  writeSettings(proj, s)
  use("cross-codex")
  await until(() => models(fileOf(t1.worktree) ?? "{}")["openai/gpt-5.6-terra"] !== undefined)
  const m = models(fileOf(t1.worktree))
  cell("AC-34 a profile without input: the file has no input for that model, the other Codex models keep theirs", m["openai/gpt-5.6-terra"].input === undefined && m["openai/gpt-5.5"].input === 461000, JSON.stringify(m))
  s.model_profiles.codex.medium.input = 461000
  writeSettings(proj, s)
  use("default")
  await until(() => Object.keys(models(fileOf(t1.worktree) ?? "{}")).length === 3)
}

// ---- AC-11: a file without the mark is not touched; it is named ----
const foreignWt = (() => {
  return undefined
})()
void foreignWt
await spawn("sesINTEG", {})
const t2 = task("proj", 2)
const foreignText = JSON.stringify({ provider: { x: { models: { y: { limit: { context: 9, output: 1 } } } } } })
writeFileSync(W.windowPath(t2.worktree), foreignText)
use("cross-codex")
await wait(1200)
cell("AC-11 a .opencode/opencode.json without the mark in a worktree is not overwritten", fileOf(t2.worktree) === foreignText, fileOf(t2.worktree))
const doc = await call("crew_doctor", "sesINTEG")
cell("AC-11/REQ-16 crew_doctor names the unmarked file and the task", /задача #2/.test(doc) && /без пометки плагина/.test(doc), doc.slice(0, 400))
cell("AC-11 and the other worktree keeps being updated", Object.keys(models(fileOf(t1.worktree))).length === 6, "not updated")
rmSync(W.windowPath(t2.worktree), { force: true })
use("default")
await until(() => !!fileOf(t2.worktree))
cell("AC-11 once the foreign file is gone the plugin writes its own", JSON.parse(fileOf(t2.worktree))._crew_harness !== undefined, String(fileOf(t2.worktree)))

// ---- AC-10: lifecycle ----
use(undefined)
await until(() => !fileOf(t1.worktree) && !fileOf(t2.worktree))
cell("AC-10 the name is removed (reset): the files are gone from every worktree, the registry is empty, the hand-written files are as they were", !fileOf(t1.worktree) && !fileOf(t2.worktree) && Object.keys(W.readRegistry("proj")).length === 0 && handHashes() === hand0 && !existsSync(path.join(t1.worktree, ".opencode", "opencode.json")), JSON.stringify(W.readRegistry("proj")))
use("default")
await until(() => !!fileOf(t1.worktree) && !!fileOf(t2.worktree))
cell("AC-10 the name is back: the files are back", !!fileOf(t1.worktree) && !!fileOf(t2.worktree), "no files")

// a cancelled task loses its file
const canc = await call("crew_task", "sesINTEG", { action: "cancel", n: 2, text: "test" })
cell("AC-10 a cancelled task: its file is gone at once and the registry entry too; the other task keeps its file", !fileOf(t2.worktree) && !Object.keys(W.readRegistry("proj")).includes(path.resolve(t2.worktree)) && !!fileOf(t1.worktree), canc)

// git worktree remove is not stopped by the ignored file
const rm1 = (() => {
  try {
    execFileSync("git", ["-C", proj, "worktree", "remove", t2.worktree], { stdio: ["ignore", "pipe", "pipe"] })
    return 0
  } catch (e) {
    return e.status ?? 1
  }
})()
cell("AC-10 git worktree remove of a tree that had the file: exit code 0 (the file is ignored by git)", rm1 === 0 && !existsSync(t2.worktree), String(rm1))
// a worktree with the file still in it (the file ignored): remove works too
await spawn("sesINTEG", {})
const t3 = task("proj", 3)
const hadFile3 = !!fileOf(t3.worktree)
const rm3 = (() => {
  try {
    execFileSync("git", ["-C", proj, "worktree", "remove", t3.worktree], { stdio: ["ignore", "pipe", "pipe"] })
    return 0
  } catch (e) {
    return e.status ?? 1
  }
})()
cell("AC-10 git worktree remove while the file is in the tree: exit code 0", hadFile3 && rm3 === 0 && !existsSync(t3.worktree), JSON.stringify([hadFile3, rm3]))
await until(() => !Object.keys(W.readRegistry("proj")).includes(path.resolve(t3.worktree)))
cell("AC-10 the folder vanished: the pass drops the registry entry", !Object.keys(W.readRegistry("proj")).includes(path.resolve(t3.worktree)), JSON.stringify(W.readRegistry("proj")))

// an accepted task loses its file (the real flow: report -> reviewer -> merge -> accept)
await spawn("sesINTEG", {})
const t4 = task("proj", 4)
writeFileSync(path.join(t4.worktree, "f.txt"), "feature\n")
git(t4.worktree, "add", "-A")
git(t4.worktree, "commit", "-q", "-m", "feature")
const fileBeforeAccept = !!fileOf(t4.worktree)
await call("crew_send", t4.executor, { to: "sesINTEG", text: "done", reply_to: t4.qid })
await until(() => !!task("proj", 4).reviewer)
const rv = task("proj", 4).reviewer
await tab(rv, "worker")
await call("crew_task", rv, { action: "review", n: 4 })
await call("crew_task", rv, { action: "merge", n: 4 })
git(proj, "merge", "-q", "--ff-only", t4.branch)
const acc = await call("crew_task", rv, { action: "accept", n: 4 })
cell("AC-10 an accepted task: the file is gone from its tree and the registry entry too", fileBeforeAccept && task("proj", 4).status !== "reviewing" && !fileOf(t4.worktree) && !Object.keys(W.readRegistry("proj")).includes(path.resolve(t4.worktree)), acc.slice(0, 300) + JSON.stringify(W.readRegistry("proj")))

// ---- the rows of the table for the files (REQ-33) ----
await spawn("sesINTEG", {})
const t5 = task("proj", 5)
use("kimi-only")
await until(() => Object.keys(models(fileOf(t5.worktree) ?? "{}")).join() === "kimi-code-plan-global/k3-256k")
await until(() => existsSync(L.snapshotFile("proj")))
const hash5 = sha(W.windowPath(t5.worktree))
// row 5: the set is removed from the data while the name stays -> existing files unchanged, a new worktree gets the file by the snapshot
{
  const s = readSettings(proj)
  delete s.profile_sets["kimi-only"]
  writeSettings(proj, s)
  await until(() => L.profileState(proj).state.row === 5)
  await wait(500)
  cell("AC-37(б) row 5: the set is gone, the snapshot is there: the existing file is not changed or removed", L.profileState(proj).state.row === 5 && sha(W.windowPath(t5.worktree)) === hash5, String(L.profileState(proj).state.row))
  await spawn("sesINTEG", {})
  const t6 = task("proj", 6)
  cell("REQ-09 row 5: a NEW worktree gets the file by the snapshot", !!atCreate.get(t6.executor)?.file && Object.keys(models(atCreate.get(t6.executor).file)).join() === "kimi-code-plan-global/k3-256k", String(atCreate.get(t6.executor)?.file));
  // row 6: no snapshot -> nothing is written, the existing file is not touched
  L.dropSnapshot("proj")
  const doctor = await call("crew_doctor", "sesINTEG")
  await wait(500)
  cell("AC-37(г) row 6: no snapshot -> files are not changed; crew_doctor names the set", sha(W.windowPath(t5.worktree)) === hash5 && L.profileState(proj).state.row === 6 && /kimi-only/.test(doctor), doctor.slice(0, 300))
  const ref = await spawn("sesINTEG", {})
  cell("AC-37(г) row 6: crew_spawn refuses naming the set, no new worktree appears", /Задача не поставлена/.test(ref) && /kimi-only/.test(ref) && !task("proj", 7), ref)
  s.profile_sets["kimi-only"] = SETS["kimi-only"]
  writeSettings(proj, s)
}
// row 4: invalid data without a snapshot: the profile is found (conflict of windows) -> a session on the found model WITHOUT the window file
{
  use(undefined)
  L.dropSnapshot("proj")
  const s = readSettings(proj)
  s.model_profiles.kimi.heavy.context = 150000 // kimi-only now ends in a conflict: one model, two windows
  writeSettings(proj, s)
  use("kimi-only")
  await until(() => L.profileState(proj).state.row === 4)
  L.dropSnapshot("proj")
  const r4 = await spawn("sesINTEG", {})
  const t7 = task("proj", 7)
  cell("AC-37 row 4 / REQ-15: the profile is found, the windows conflict -> the session starts on the found model without a window file; the stamp says general", /запущена/.test(r4) && !!t7 && modelOk(t7) && atCreate.get(t7.executor)?.file === null && t7.profiles?.[0]?.window === "general", r4 + JSON.stringify(t7?.profiles))
  s.model_profiles.kimi.heavy.context = 220000
  writeSettings(proj, s)
}
function modelOk(t) {
  return t.model === "kimi-code-plan-global/k3-256k"
}

// ---- row 7: no keys at all -> the files are removed ----
use("default")
await until(() => L.profileState(proj).state.row === 2)
{
  const s = readSettings(proj)
  const before = s.profile_sets
  void before
  delete s.model_profiles
  delete s.profile_sets
  writeSettings(proj, s)
  use("default")
  await until(() => L.profileState(proj).state.row === 7)
  await until(() => Object.keys(W.readRegistry("proj")).length === 0, 8000)
  cell("AC-10/AC-24 row 7: neither table nor sets, the name stays: the files are removed, the registry is empty", Object.keys(W.readRegistry("proj")).length === 0 && !fileOf(t5.worktree), JSON.stringify(W.readRegistry("proj")))
}

// ---- AC-24: another project (no profiles) gets no file while a set is on in proj ----
{
  const s = readSettings(proj)
  s.model_profiles = TABLE
  s.profile_sets = SETS
  writeSettings(proj, s)
  use("cross-codex")
  await spawn("sesOTHER", {})
  const o1 = task("other", 1)
  cell("AC-24 a project without profiles: its worktree gets no file, its session starts as before", !!o1.worktree && atCreate.get(o1.executor)?.file === null && !fileOf(o1.worktree) && !o1.profiles, JSON.stringify(atCreate.get(o1.executor)))
}

// ---- step 9: reading the chain of the OpenCode settings: hand-written windows, the explicit threshold of Claude Code ----
{
  const cmd = await import("../profile-cmd.ts")
  // the hand-written .opencode/opencode.jsonc of the root is committed: every NEW worktree carries it (it is stronger than the file of the plugin there)
  git(proj, "add", "--", ".opencode/opencode.jsonc")
  git(proj, "commit", "-q", "-m", "hand-written windows of the repository")
  use("default")
  await spawn("sesINTEG", {})
  const tt = lastTaskOf("proj")
  await until(() => !!fileOf(tt.worktree))
  const chain = W.configChain(tt.worktree)
  cell("AC-25 the chain of the settings for a worktree: the global file first, then from the disk root down, the hand-written jsonc of the worktree last (deepest and `.opencode/opencode.jsonc` strongest)", chain[0] === globalCfg && chain.at(-1).replace(/\\/g, "/").endsWith(".opencode/opencode.jsonc") && chain.some((f) => f.replace(/\\/g, "/").endsWith(".opencode/opencode.json")), JSON.stringify(chain.map((f) => path.basename(f))))
  const win = W.chainWindow(tt.worktree, "claude-code/opus", { skipOurs: true })
  cell("AC-40 the window of the model by the chain, without the file of the plugin: the value and the file of every field", win.context?.value === 520000 && win.output?.value === 64000 && /opencode\.jsonc$/.test(win.context.file), JSON.stringify(win))
  const overAll = W.handWrittenOverrides(tt.worktree, "claude-code/opus", { context: 720000, output: 64000 })
  const over = overAll.filter((o) => o.stronger)
  cell("AC-40 (а) the tracked hand-written file inside the worktree is stronger than the file of the plugin there: found with the value; the file of the repository root above is weaker and is listed apart", over.length === 1 && over[0].field === "context" && over[0].value === 520000 && /wt[\\/].*opencode\.jsonc$/.test(over[0].file) && overAll.length === 2, JSON.stringify(overAll))
  const predicted = W.predictWindow(tt.worktree, "claude-code/opus", fileOf(tt.worktree))
  cell("AC-40 the forecast of the window after the plugin file is written: the hand-written value wins in that folder", predicted.context?.value === 520000, JSON.stringify(predicted))
  const doc2 = await call("crew_doctor", "sesINTEG")
  cell("AC-40 (а) crew_doctor names the file and the value inside the worktree", new RegExp(`в рабочем дереве задачи #${tt.n} окно модели claude-code/opus \\(context\\) задано рукописно: 520000`).test(doc2) && /opencode\.jsonc/.test(doc2), doc2.slice(0, 500))
  cell("AC-40 (б) crew_doctor names the hand-written window of the main folder, which the owner's tabs and the reviewers take", /в основной папке проекта у модели claude-code\/opus context 520000/.test(doc2), doc2.slice(0, 500))
  const chk = await cmd.runSetsCommand(proj, "check", { version: "2.0.23-test" })
  cell("AC-40 check names both places with the files and the values; it says the version of OpenCode", /в рабочем дереве задачи #\d+ окно модели claude-code\/opus \(context\) задано рукописно: 520000/.test(chk) && /в основной папке проекта у модели claude-code\/opus context 520000/.test(chk) && /OpenCode 2\.0\.23-test/.test(chk), chk.slice(0, 600))
  const useR = await cmd.runSetsCommand(proj, "use cross-codex", {})
  cell("AC-40 use names them too", /окно модели claude-code\/opus \(context\) задано рукописно: 520000/.test(useR) && /в основной папке проекта у модели claude-code\/opus context 520000/.test(useR), useR.slice(0, 800))
  // the explicit threshold of Claude Code (the provider project file): named, not touched, not cancelled
  const explicit = path.join(proj, ".opencode", "opencode-claude-code-provider.json")
  writeFileSync(explicit, JSON.stringify({ autoCompactWindow: { opus: 500000 } }))
  const explicitHash = sha(explicit)
  const chk2 = await cmd.runSetsCommand(proj, "check", {})
  const use2 = await cmd.runSetsCommand(proj, "use default", {})
  const ex = W.explicitCompact(tt.worktree, "opus")
  cell("AC-25 the explicit autoCompactWindow of the project file of the provider is found for the model of the family (opus)", ex?.value === 500000 && /opencode-claude-code-provider\.json$/.test(ex.where), JSON.stringify(ex))
  cell("AC-25 use and check name the model, the explicit value and the window of OpenCode; the threshold stays explicit", /порог Claude Code для модели claude-code\/opus задан явно \(500000/.test(use2) && /порог Claude Code для модели claude-code\/opus задан явно \(500000/.test(chk2) && /от набора не меняется; окно OpenCode станет 720000/.test(use2), use2.slice(0, 600))
  const docs3 = await call("crew_doctor", "sesINTEG")
  cell("AC-25 crew_doctor says it too", /порог Claude Code для модели claude-code\/opus задан явно \(500000/.test(docs3), docs3.slice(0, 400))
  cell("DNC-10 the explicit file is byte for byte the same and the plugin wrote no autoCompactWindow anywhere", sha(explicit) === explicitHash && !/autoCompactWindow/.test(fileOf(tt.worktree) ?? "") && handHashes() === hand0, "changed")
  const sw = W.explicitCompact(tt.worktree, "sonnet")
  cell("AC-25 the explicit value for the family `opus` does not apply to sonnet", sw === undefined, JSON.stringify(sw))
  rmSync(explicit)
  // JSONC: comments and trailing commas
  cell("AC-25 the JSONC reader: comments outside strings and trailing commas", JSON.stringify(W.parseJsonc('{ // c\n "a": "x//y", /* b */ "n": [1,2,], }')) === JSON.stringify({ a: "x//y", n: [1, 2] }), "bad parse")
  cell("AC-40 reserved from the chain is read (only read), the model without a record says `not set`", W.reservedOf(tt.worktree)?.value === 20000 && Object.keys(W.chainWindow(tt.worktree, "nothing/here", { skipOurs: true })).length === 0, JSON.stringify(W.reservedOf(tt.worktree)))
}
function lastTaskOf(project) {
  return tasks.listTasks(project).at(-1)
}

// ---- DNC-03: the plugin wrote only what it may ----
cell("DNC-03 the hand-written files are the same at the end; nothing is written in the main folder", handHashes() === hand0 && !existsSync(path.join(proj, ".opencode", "opencode.json")) && !existsSync(path.join(other, ".opencode", "opencode.json")), handHashes())
cell("DNC-03 the only lines added to info/exclude are the plugin's (comment and path)", readFileSync(path.join(proj, ".git", "info", "exclude"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l !== "/.opencode/opencode.json").length === 0, readFileSync(path.join(proj, ".git", "info", "exclude"), "utf8"))
cell("DNC-10 the plugin did not touch OpenCode / provider files in the config dir", sha(globalCfg) === hand0.split(",")[0], "changed")

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-profiles-windows.test: FAIL ${fail}` : "crew-profiles-windows.test ok")
process.exit(fail ? 1 : 0)

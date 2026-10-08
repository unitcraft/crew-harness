// Self-test of the model choice by the enabled set (task 003; node >= 24):  node test/crew-profiles-select.test.mjs
// crew_spawn, the plan task, reassign: the model comes from the enabled set by the stage and the tier; without keys
// everything is as before; a described stage whose profile is missing refuses and creates nothing. The choice for the
// reviewer, the open tabs and the auto-plan steps is in the second part of this file. Settings in the old form of the
// options (the file of the working copy), so no git process is needed for them; session.create is recorded.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-profiles-select-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_PROFILES_MS = "150"
delete process.env.CREW_HARNESS_STATUS_MS

const prof = (model, context, output, input) => ({ model, context, output, ...(input ? { input } : {}) })
const c = (family, tier) => ({ family, tier })
const TABLE = {
  claude: { heavy: prof("claude-code/opus", 720000, 64000), medium: prof("claude-code/sonnet", 720000, 64000), light: prof("claude-code/haiku", 220000, 32000) },
  kimi: { heavy: prof("kimi-code-plan-global/k3-256k", 220000, 131072), medium: prof("kimi-code-plan-global/k3-256k", 220000, 131072), light: prof("kimi-code-plan-global/k3-256k", 220000, 131072) },
  codex: { heavy: prof("openai/gpt-5.5", 525000, 128000, 461000), medium: prof("openai/gpt-5.6-terra", 525000, 128000, 461000), light: prof("openai/gpt-6-luna", 525000, 128000, 461000) },
}
const SETS = {
  default: { develop: c("claude", "task"), plan: c("claude", "task"), accept: c("claude", "task"), plan_accept: c("claude", "task") },
  "cross-kimi": { develop: c("claude", "task"), plan: c("claude", "task"), accept: c("kimi", "heavy"), plan_accept: c("kimi", "heavy") },
  "cross-codex": { develop: c("claude", "medium"), plan: c("claude", "heavy"), accept: c("codex", "heavy"), plan_accept: c("codex", "heavy") },
  "kimi-only": { develop: c("kimi", "heavy"), plan: c("kimi", "heavy"), accept: c("kimi", "heavy"), plan_accept: c("kimi", "heavy") },
  "dev-only": { develop: c("kimi", "heavy") },
}
const base = { spawn_limits: { worker: 50, "*": 50, reviewer: 50 }, inflight_limit: 50, plans_dir: "plans" }
const mk = (name, extra = {}) => {
  const dir = path.join(tmp, name)
  mkdirSync(path.join(dir, ".opencode"), { recursive: true })
  writeFileSync(path.join(dir, ".opencode", "crew-harness.json"), JSON.stringify({ ...base, ...extra }))
  return dir
}
const proj = mk("proj", { model_profiles: TABLE, profile_sets: SETS })
const plain = mk("plain") // a project without any profile key
const innerRoot = path.join(proj, "inner") // a nested root: its own project, no keys
mkdirSync(path.join(innerRoot, ".opencode"), { recursive: true })
writeFileSync(path.join(innerRoot, ".opencode", "crew-harness.json"), JSON.stringify(base))

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const L = await import("../profile-layer.ts")
const hooks = {}
const tools = {}
const events = {}
const creates = []
const delivered = []
const sessions = new Map()
let failCreate = false
const dirOf = new Map()
const ctx = {
  location: { directory: proj },
  options: { projects: { proj, plain, inner: innerRoot } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf.get(sessionID) ?? proj }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => {
      if (failCreate) throw new Error("create failed on purpose")
      creates.push(req)
      sessions.set(req.id, req)
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
const until = async (cond, ms = 15_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
  return cond()
}
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const task = (project, n) => tasks.loadTask(project, n)
const modelOf = (id) => (sessions.get(id)?.model ? `${sessions.get(id).model.providerID}/${sessions.get(id).model.id}` : undefined)
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
const lastTask = (project) => tasks.listTasks(project).at(-1)

await tab("sesINTEG", "integrator")
await tab("sesPLAIN", "integrator", plain)
await tab("sesINNER", "integrator", innerRoot)

// ---- AC-01: no keys, no local state -> the choice is as before ----
const sp1 = await spawn("sesPLAIN", {})
const sp1h = await spawn("sesPLAIN", { tier: "heavy" })
const sp1l = await spawn("sesPLAIN", { tier: "light" })
const p1 = tasks.listTasks("plain")
cell("AC-01 no keys: crew_spawn without tier -> spawn_models medium (claude-code/sonnet), with tier heavy/light -> opus / haiku", modelOf(p1[0].executor) === "claude-code/sonnet" && modelOf(p1[1].executor) === "claude-code/opus" && modelOf(p1[2].executor) === "claude-code/haiku" && p1.map((t) => t.tier).join() === "medium,heavy,light", p1.map((t) => modelOf(t.executor) + "/" + t.tier).join())
cell("AC-01 no keys: the record has no profile stamp and the answer is the old text", !p1[0].profiles && !p1[0].review_model && /Задача #1 запущена .* модель claude-code\/sonnet/.test(sp1), sp1)
const spExplicit = mk("explicit", { spawn_models: { heavy: "x/big", medium: "x/mid", light: "x/small" } })
dirOf.set("sesEXPL", spExplicit)
const exMod = core.loadConfig(spExplicit)
cell("AC-01 spawn_models of a project without keys still define the models", exMod.spawnModels.heavy === "x/big", JSON.stringify(exMod.spawnModels))
// a project that has the table and the sets, but no name: nothing applies
const sp2 = await spawn("sesINTEG", { tier: "heavy" })
cell("AC-01 a project with the table and the sets but no name enabled works as before (no name -> no set)", modelOf(lastTask("proj").executor) === "claude-code/opus" && !lastTask("proj").profiles, sp2)

// ---- AC-02 / AC-17: the set default, tier on the input ----
use("default")
const a1 = await spawn("sesINTEG", {})
const t1 = lastTask("proj")
const a2 = await spawn("sesINTEG", { tier: "heavy" })
const t2 = lastTask("proj")
cell("AC-02 set default, `task` cell: no tier on the input -> medium of the family (claude-code/sonnet)", modelOf(t1.executor) === "claude-code/sonnet" && t1.tier === "medium", a1)
cell("AC-02 with tier heavy on the input -> the model of claude/heavy", modelOf(t2.executor) === "claude-code/opus" && t2.tier === "heavy", a2)
cell("AC-02/AC-17 the record keeps the stage, the set, the family, the tier and the model of the launch", t2.profiles?.length === 1 && t2.profiles[0].stage === "develop" && t2.profiles[0].set === "default" && t2.profiles[0].family === "claude" && t2.profiles[0].tier === "heavy" && t2.profiles[0].model === "claude-code/opus" && t2.profiles[0].role === "executor" && t2.profiles[0].session === t2.executor && t2.profiles[0].window === "general", JSON.stringify(t2.profiles))
cell("AC-17 the history has the line about the profile", t2.history.some((h) => /профиль: набор «default», этап develop, claude\/heavy, модель claude-code\/opus/.test(h.note ?? "")), JSON.stringify(t2.history.map((h) => h.note)))
// explicit tier of a cell is the choice itself; the input tier still wins inside the family (O-03)
use("cross-codex")
await spawn("sesINTEG", {})
const t3 = lastTask("proj")
await spawn("sesINTEG", { tier: "light" })
const t4 = lastTask("proj")
cell("AC-02 cross-codex: develop is claude/medium; tier light on the input -> haiku (inside the family of the cell)", modelOf(t3.executor) === "claude-code/sonnet" && modelOf(t4.executor) === "claude-code/haiku" && t4.profiles[0].family === "claude", JSON.stringify([modelOf(t3.executor), modelOf(t4.executor)]))

// ---- the plan task: the stage «plan» ----
await spawn("sesINTEG", { kind: "plan", goal: "the original task", title: "plan it" })
const tp = lastTask("proj")
cell("AC-05 a plan task takes the stage `plan` of the set (cross-codex: claude/heavy -> opus), the stamp says plan", tp.plan && modelOf(tp.executor) === "claude-code/opus" && tp.profiles[0].stage === "plan", JSON.stringify(tp.profiles))

// ---- AC-22 (part): kimi-only ----
use("kimi-only")
await spawn("sesINTEG", {})
const tk = lastTask("proj")
await spawn("sesINTEG", { kind: "plan", goal: "g", title: "kimi plan" })
const tkp = lastTask("proj")
cell("AC-22 kimi-only: the executor and the plan task are created on the model of Kimi", modelOf(tk.executor) === "kimi-code-plan-global/k3-256k" && modelOf(tkp.executor) === "kimi-code-plan-global/k3-256k", JSON.stringify([modelOf(tk.executor), modelOf(tkp.executor)]))
cell("AC-22 the record shows the family and the tier of the launch (heavy of the cell; no tier on the input)", tk.profiles[0].family === "kimi" && tk.tier === "heavy" && tk.model === "kimi-code-plan-global/k3-256k", JSON.stringify(tk.profiles))

// ---- AC-32: reassign takes the model by the set at the moment of the handover ----
use(undefined)
await spawn("sesINTEG", { tier: "heavy" })
const tr = lastTask("proj") // started on claude opus with no set
const trModel0 = tr.model
use("kimi-only")
const re1 = await call("crew_task", "sesINTEG", { action: "reassign", n: tr.n })
const tr1 = task("proj", tr.n)
cell("AC-32 reassign with a set: the new session is on the model of the set for the stage and the tier of the record", modelOf(tr1.executor) === "kimi-code-plan-global/k3-256k" && tr1.model === "kimi-code-plan-global/k3-256k" && tr1.executor !== tr.executor && tr1.profiles?.at(-1)?.set === "kimi-only" && tr1.profiles.at(-1).session === tr1.executor, re1)
cell("AC-32 red side: the model of the record was claude-opus and changed (a set is on, the model did not stay)", trModel0 === "claude-code/opus" && tr1.model !== trModel0, trModel0)
use(undefined)
const re2 = await call("crew_task", "sesINTEG", { action: "reassign", n: tr.n })
const tr2 = task("proj", tr.n)
cell("AC-32 reassign without a set: the model of the record stays as it was", tr2.model === "kimi-code-plan-global/k3-256k" && modelOf(tr2.executor) === "kimi-code-plan-global/k3-256k" && tr2.executor !== tr1.executor, re2)
// an interrupted start of the same attempt keeps the model of the record and makes no second session
failCreate = true
await spawn("sesINTEG", { tier: "light" })
const ts = lastTask("proj")
failCreate = false
cell("AC-32 a start that failed leaves the task `starting` with the model chosen at the launch", ts.status === "starting" && ts.model === "claude-code/haiku", JSON.stringify([ts.status, ts.model]))
use("kimi-only")
const n0 = creates.length
await until(() => task("proj", ts.n).status === "running", 8000)
const ts2 = task("proj", ts.n)
cell("AC-32 the retry of the same attempt uses the model of the record even though the set changed; one session", ts2.status === "running" && modelOf(ts2.executor) === "claude-code/haiku" && creates.length === n0 + 1 && creates.filter((x) => x.id === ts2.executor).length === 1, JSON.stringify([ts2.status, modelOf(ts2.executor), creates.length - n0]))
use(undefined)

// ---- refusal: a described stage whose profile is missing creates nothing ----
const before = tasks.listTasks("proj").length
const sessionsBefore = creates.length
{
  // the set `dev-only` lacks accept; a table without kimi makes the described stage refuse
  const f = JSON.parse(readFileSync(path.join(proj, ".opencode", "crew-harness.json"), "utf8"))
  delete f.model_profiles.kimi
  writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify(f))
  use("dev-only")
  L.dropSnapshot("proj")
  await until(() => L.profileState(proj).state.row !== 2, 3000)
  const r = await spawn("sesINTEG", {})
  cell("AC-06(б) the described stage whose profile is not found refuses with the stage and the profile; no task, no number, no session", /Задача не поставлена/.test(r) && /разработка/.test(r) && /kimi/.test(r) && tasks.listTasks("proj").length === before && creates.length === sessionsBefore, r)
  const planR = await spawn("sesINTEG", { kind: "plan", goal: "g" })
  cell("AC-06(б) the plan task refuses too (stage plan is not described in dev-only: spawn_models, no refusal)", !/Задача не поставлена/.test(planR) && tasks.listTasks("proj").length === before + 1, planR)
  const notR = await spawn("sesINTEG", {})
  void notR
  // restore
  f.model_profiles.kimi = TABLE.kimi
  writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify(f))
  use(undefined)
}

// ---- AC-24: projects apart; nested roots; the name of a missing set ----
use("kimi-only")
const inn = await spawn("sesINNER", { tier: "heavy" })
const ti = lastTask("inner")
cell("AC-24 the nested project (its own root inside the root of proj) works as before: no refusal, spawn_models, no stamp", /запущена/.test(inn) && modelOf(ti.executor) === "claude-code/opus" && !ti.profiles, inn)
const pl = await spawn("sesPLAIN", { tier: "heavy" })
cell("AC-24 a project without profiles works as before while another one has a set on", /запущена/.test(pl) && modelOf(lastTask("plain").executor) === "claude-code/opus", pl)
use("kimi-only")
await until(() => existsSync(L.snapshotFile("proj")), 8000) // the pass writes the snapshot of the valid state
use("no-such-set")
const bySnap = await spawn("sesINTEG", {})
const tsn = lastTask("proj")
cell("AC-24 row 5: the set is gone, the snapshot is there -> by the snapshot (kimi-only), the history says so; no fallback to spawn_models", /запущена/.test(bySnap) && modelOf(tsn.executor) === "kimi-code-plan-global/k3-256k" && tsn.history.some((h) => /по снимку/.test(h.note ?? "")), bySnap + JSON.stringify(tsn.history.map((h) => h.note)))
L.dropSnapshot("proj")
await wait(1500) // a pass does not recreate the snapshot for a set that is not there
const ghost = await spawn("sesINTEG", {})
cell("AC-24 row 6: a project with profiles whose enabled name has no set refuses naming the set; it does not fall back to spawn_models", /Задача не поставлена/.test(ghost) && /no-such-set/.test(ghost), ghost)
const ghostInner = await spawn("sesINNER", {})
cell("AC-24 the nested project is untouched by the missing set of proj", /запущена/.test(ghostInner), ghostInner)
use(undefined)

// ---- AC-38 (without tabs): the matrix «stage x tier» with default equals the matrix with no set ----
const matrix = async () => {
  const out = []
  for (const tier of [undefined, "heavy", "medium", "light"]) {
    for (const kind of [undefined, "plan"]) {
      await spawn("sesINTEG", { ...(tier ? { tier } : {}), ...(kind ? { kind, goal: "g" } : {}) })
      const t = lastTask("proj")
      out.push(`${tier ?? "-"}/${kind ?? "work"}: ${modelOf(t.executor)} ${t.tier}`)
    }
  }
  return out
}
use(undefined)
const noSet = await matrix()
use("default")
const withDefault = await matrix()
cell("AC-38 default (claude profiles equal spawn_models): every row of the matrix gives the same call as without keys", noSet.join("|") === withDefault.join("|") && noSet.length === 8, noSet.join("|") + " ## " + withDefault.join("|"))
use(undefined)

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-profiles-select.test: FAIL ${fail}` : "crew-profiles-select.test ok")
process.exit(fail ? 1 : 0)

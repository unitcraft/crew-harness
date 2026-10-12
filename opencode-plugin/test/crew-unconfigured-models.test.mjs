// Task 033: a project without model settings refuses a worker and tells what to do; nothing is recorded.
//   node test/crew-unconfigured-models.test.mjs
// - crew_spawn without profile_set / spawn_models / model / allow_default_models: refusal with the options and the model of the
//   calling session, no task in the journal, no session;
// - an explicit model passes (and is the model of the task); allow_default_models: true passes as before;
// - crew_config apply_template writes the standard template, existing keys of the project win, a repeat does not overwrite;
// - crew_doctor warns "project X is not configured: models" until they are defined.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-unconf-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
const file = path.join(proj, ".opencode", "crew-harness.json")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
const writeCfg = (o) => writeFileSync(file, JSON.stringify(o))
const g = (...args) => execFileSync("git", ["-C", proj, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { stdio: "ignore" })
const commit = (msg) => {
  g("add", "-A")
  g("commit", "-q", "-m", msg)
}
writeCfg({ task_fields: ["goal", "criteria"], worktrees: "wt", branch_name: "p{n}-{slug}", spawn_limits: { worker: 10 } })
g("init", "-q", "-b", "main")
commit("init")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const settings = await import("../settings.ts")
const status = await import("../status.ts")
const hooks = {}
const tools = {}
const events = {}
const sessions = new Map()
const ctx = {
  location: { directory: proj },
  options: { projects: [proj] },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    create: async (req) => {
      if (!sessions.has(req.id)) sessions.set(req.id, req)
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
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const WPID = 626262
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [{ sessionID: "sesINTEG1", active: true, busy: false }] }))
beat()
const heart = setInterval(beat, 300)
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "claude-test-7", providerID: "anthropic" } })
await events["session.idle"]({ properties: { sessionID: "sesINTEG1" } })
await call("crew_role", "sesINTEG1", { role: "integrator" })
const IN = { title: "t", goal: "do it", criteria: "green" }
const count = () => { try { return tasks.listTasks("proj").length } catch { return 0 } }

// 1. no model settings: refusal
const r1 = await call("crew_spawn", "sesINTEG1", IN)
cell("refusal names the project and what is missing", /проект proj не настроен: не заданы модели для воркеров/.test(r1), r1)
cell("refusal offers the three variants and the template action", /question/.test(r1) && /apply_template/.test(r1) && /codex/.test(r1) && /crew_config/.test(r1) && /guide/.test(r1), r1)
cell("refusal names the model of the calling session", /anthropic\/claude-test-7/.test(r1), r1)
cell("no task recorded, no session created", count() === 0 && sessions.size === 0, `${count()} ${sessions.size}`)

// 2. explicit model passes
const r2 = await call("crew_spawn", "sesINTEG1", { ...IN, model: "anthropic/claude-test-7" })
const t1 = tasks.loadTask("proj", 1)
cell("explicit model: task started with that model", t1?.model === "anthropic/claude-test-7" && /сесси/.test(r2), r2 + JSON.stringify(t1))

// 3. doctor warns
const d1 = await call("crew_doctor", "sesINTEG1")
cell("doctor: project is not configured: models", /проект proj не настроен: модели/.test(d1), d1)

const row = { session: "s1", role: "integrator", title: "int", state: "idle", detail: "idle", project: "proj", watches: [] }
cell("/crew summary: the same line for the project", /проект proj не настроен: модели/.test(status.formatStatuses([row])), status.formatStatuses([row]))

// 4. allow_default_models: true passes as before
writeCfg({ task_fields: ["goal", "criteria"], worktrees: "wt", branch_name: "p{n}-{slug}", spawn_limits: { worker: 10 }, allow_default_models: true })
commit("allow")
await wait(50)
const r4 = await call("crew_spawn", "sesINTEG1", { ...IN, title: "u", tier: "light" })
const t2 = tasks.loadTask("proj", 2)
cell("allow_default_models: default model as before", t2?.model === "claude-code/haiku", r4 + JSON.stringify(t2))
await call("crew_doctor", "sesINTEG1")
cell("/crew summary: no line with allow_default_models", !/не настроен: модели/.test(status.formatStatuses([row])), status.formatStatuses([row]))
cell("doctor: no warning with allow_default_models", !/не настроен: модели/.test(await call("crew_doctor", "sesINTEG1")), "warned")

// 5. apply_template
writeCfg({ task_fields: ["goal", "criteria"], worktrees: "wt", branch_name: "mine/{n}", spawn_limits: { worker: 10 } })
commit("plain")
await wait(50)
const a1 = await call("crew_config", "sesINTEG1", { action: "apply_template" })
const f1 = JSON.parse(readFileSync(file, "utf8"))
cell("apply_template: profiles, sets, codex and light written", f1.profile_set === "codex" && f1.tier_max === "light" && f1.model_profiles?.claude?.heavy && f1.profile_sets?.codex?.develop, JSON.stringify(f1).slice(0, 300))
cell("apply_template: existing keys of the project win", f1.branch_name === "mine/{n}" && f1.worktrees === "wt" && f1.task_fields?.length === 2, JSON.stringify(f1).slice(0, 300))
cell("apply_template: no merge_precheck or answer_mode, and the commit reminder", f1.merge_precheck === undefined && f1.answer_mode === undefined && /закоммит/.test(a1), a1)
f1.tier_max = "heavy"
writeFileSync(file, JSON.stringify(f1))
await call("crew_config", "sesINTEG1", { action: "apply_template" })
const f2 = JSON.parse(readFileSync(file, "utf8"))
cell("a repeat does not overwrite", f2.tier_max === "heavy", JSON.stringify(f2).slice(0, 200))
commit("template")
await wait(50)
const r5 = await call("crew_spawn", "sesINTEG1", { ...IN, title: "v" })
cell("after the template committed the spawn passes by the set", !/не настроен/.test(r5) && tasks.loadTask("proj", 3)?.model?.startsWith("openai/"), r5)
cell("doctor: no warning after the template", !/не настроен: модели/.test(await call("crew_doctor", "sesINTEG1")), "warned")

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-unconfigured-models.test: FAIL ${fail}` : "crew-unconfigured-models.test ok")
process.exit(fail ? 1 : 0)

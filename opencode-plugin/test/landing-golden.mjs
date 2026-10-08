// Golden texts of the base for the faster-landing task (005; node >= 24).
//   node test/landing-golden.mjs --write            record the snapshot test/landing-golden.json (once, BEFORE the core is changed)
//   node test/landing-golden.mjs --check            collect the texts again and compare with the snapshot: "golden ok" / "golden differs"
//   node test/landing-golden.mjs --check --defaults the same, with the new keys of the project set to their default values
// The texts: the refusal of crew_spawn by the limit with an accepted task, the reminders about an accepted, not cleaned task,
// formatTaskLetter, planTaskLetter, reviewLetter, planMergeLetter, crew_task show and list for tasks in running, reviewing and
// accepted. The temp folder and the clock are replaced by markers. LANDING_GOLDEN_FILE points to another snapshot file
// (the control: a snapshot with one line spoiled must differ).
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = process.env.LANDING_GOLDEN_FILE || path.join(HERE, "landing-golden.json")
const PLUGIN = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(HERE, "..")
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : ""
const withDefaults = process.argv.includes("--defaults")
if (!mode) {
  console.log("usage: node test/landing-golden.mjs --write | --check [--defaults]")
  process.exit(2)
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-golden-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FLOW_MS = "200"
process.env.CREW_HARNESS_LEFT_MS = "3600000"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
delete process.env.CREW_HARNESS_PRESENCE

const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
const settings = {
  inflight_limit: 3,
  stall_minutes: 600,
  accepted_reminder_min: 0.01,
  worktrees: "wt",
  branch_name: "t{n}-{slug}",
  cleanup: "local",
  acceptance: [
    { id: "tests", text: "тесты зелёные", required: true },
    { id: "notes", text: "заметки", required: false },
  ],
  // explicit values of the keys of the faster-landing task: they must not change a single text
  ...(withDefaults ? { accepted_slot: "hold", cleanup_limit: 10, merge_precheck: "off", task_extra_fields: [] } : {}),
}
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify(settings))
const git = (...a) => execFileSync("git", ["-C", proj, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
git("init", "-q", "-b", "main")
writeFileSync(path.join(proj, "a.txt"), "a")
git("add", "-A")
git("commit", "-q", "-m", "init")

const url = (f) => pathToFileURL(path.join(PLUGIN, f)).href
const mod = await import(url("index.ts"))
const core = await import(url("core.ts"))
const tasks = await import(url("tasks.ts"))
const review = await import(url("review.ts"))
const tools = {}
const hooks = {}
const events = {}
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    update: async () => {},
    create: async (req) => ({ id: req.id }),
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const WPID = 717171
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [{ sessionID: "sesINTEG1", active: true, busy: false }] }))
beat()
const heart = setInterval(beat, 300)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

core.saveCard({ session: "sesINTEG1", role: "integrator", auto: false, title: "sesINTEG1", directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
const now = Date.now()
const fixedAt = Date.UTC(2026, 9, 8, 12, 0, 0)
const make = (extra) => {
  const t = tasks.createTask({ project: "proj", title: "заголовок", goal: "цель", criteria: "критерий", priority: "P2", tier: "medium", role: "worker", model: "claude-code/sonnet", author: "sesINTEG1", author_role: "proj.integrator", qid: "q0", status: "running", kind: "spawn", directory: proj })
  Object.assign(t, extra)
  tasks.saveTask(t)
  return t
}
const wt = (n, slug) => path.join(proj, "wt", `proj-${n}-${slug}`)
make({ title: "запуск", slug: "start", goal: "сделать запуск", boundaries: "не трогать журнал", open_questions: "формат — на усмотрение", qid: "q1", executor: "sesEX1", worktree: wt(1, "start"), worktree_ready: true, branch: "t1-start", handoff: "прежний исполнитель правил модуль" })
make({ title: "приёмка", slug: "review", qid: "q2", status: "reviewing", executor: "sesEX2", reviewer: "sesREV02", review_kind: "tab", report: "готово, тесты зелёные", worktree: wt(2, "review"), worktree_ready: true, branch: "t2-review", steps: [{ id: "tests", text: "тесты зелёные", required: true }], checks: { tests: "12/12" } })
const t3 = make({ title: "принятая", slug: "done", qid: "q3", status: "accepted", executor: "sesEX3", reviewer: "sesREV03", review_kind: "spawn", branch: "t3-done", checks: { tests: "ok" } })
t3.history.push({ at: now - 3_600_000, by: "sesREV03", status: "accepted", note: "принята" })
tasks.saveTask(t3)
make({ title: "план", slug: "plan", goal: "составить план", qid: "q4", executor: "sesEX4", worktree: wt(4, "plan"), worktree_ready: true, branch: "t4-plan", plan: { n: "7", file: "docs/plans/7-plan.md", source: "исходная задача плана", rounds: [], clean: 0 } })
make({ title: "согласованный план", slug: "plan-ok", goal: "влить план", qid: "q5", status: "reviewing", executor: "sesEX5", reviewer: "sesREV05", review_kind: "tab", worktree: wt(5, "plan-ok"), worktree_ready: true, branch: "t5-plan-ok", plan: { n: "8", file: "docs/plans/8-plan.md", source: "исходная задача", rounds: [], clean: 2, approval: { decision: "ok", at: fixedAt } } })

const stop = await mod.default.setup(ctx)
const call = async (name, input) => (await tools[name].execute(input, { sessionID: "sesINTEG1" })).content
await call("crew_role", { role: "integrator" })

const out = {}
const cfg = core.loadConfig(proj)
const load = (n) => tasks.loadTask("proj", n)
out["spawn: refusal by inflight_limit"] = await call("crew_spawn", { title: "ещё", goal: "g", criteria: "c" })
out["spawn: refusal, priority P1"] = await call("crew_spawn", { title: "ещё", goal: "g", criteria: "c", priority: "P1" })
out["list"] = await call("crew_task", { action: "list" })
out["list all"] = await call("crew_task", { action: "list", all: true })
for (const n of [1, 2, 3, 4, 5]) out[`show #${n}`] = await call("crew_task", { action: "show", n })
for (const n of [1, 2, 4]) out[`letter formatTaskLetter #${n}`] = core.formatTaskLetter(load(n))
out["letter planTaskLetter #4"] = core.planTaskLetter(load(4))
out["letter reviewLetter #2"] = review.reviewLetter(load(2), cfg)
out["letter reviewLetter #5 (plan merge)"] = review.reviewLetter(load(5), cfg)
out["letter planMergeLetter #5"] = review.planMergeLetter(load(5), cfg)

// the reminders about an accepted, not cleaned task: to its reviewer and to its author (the flow watch posts them)
const letters = (to) =>
  ["inbox", "read"].flatMap((d) => {
    try {
      const dir = path.join(core.BASE, d, to)
      return readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
    } catch {
      return []
    }
  })
const stale = (to, re) => letters(to).filter((l) => re.test(l.text))
for (const end = Date.now() + 15_000; Date.now() < end && !(stale("sesREV03", /не очищена/).length && stale("sesINTEG1", /#3 .*не очищена/).length); ) await wait(100)
await wait(500)
out["reminder to the reviewer"] = stale("sesREV03", /не очищена/)[0]?.text ?? "(no letter)"
out["reminder to the author"] = stale("sesINTEG1", /#3 .*не очищена/)[0]?.text ?? "(no letter)"

clearInterval(heart)
stop?.()

// markers: the temp folder (any spelling), the clock, the minutes since the acceptance
const spellings = new Set()
for (const p of [tmp, realpathSync.native(tmp)]) for (const s of [p, p.replaceAll("\\", "/")]) spellings.add(s)
const mask = (s) => {
  let r = String(s).replaceAll("\\", "/")
  for (const p of [...spellings].map((x) => x.replaceAll("\\", "/")).sort((a, b) => b.length - a.length)) r = r.split(p).join("<TMP>")
  return r.replace(/\b\d\d:\d\d\b/g, "HH:MM").replace(/\b(6[0-3]) мин назад/g, "60 мин назад")
}
const result = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, mask(v)]))
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}

if (mode === "write") {
  writeFileSync(SNAPSHOT, JSON.stringify(result, null, 1) + "\n")
  console.log(`golden written: ${Object.keys(result).length} texts -> ${path.basename(SNAPSHOT)}`)
  process.exit(0)
}
const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"))
const bad = [...new Set([...Object.keys(snap), ...Object.keys(result)])].filter((k) => snap[k] !== result[k])
if (!bad.length) {
  console.log(`golden ok (${Object.keys(result).length} texts${withDefaults ? ", default values of the new keys set" : ""})`)
  process.exit(0)
}
console.log(`golden differs: ${bad.join("; ")}`)
const k = bad[0]
console.log(`--- snapshot [${k}]\n${snap[k] ?? "(absent)"}\n--- now\n${result[k] ?? "(absent)"}`)
process.exit(1)

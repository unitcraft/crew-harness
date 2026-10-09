// Self-test: the four keys of the faster-landing task in the settings (task 005, AC-25; node >= 24):  node test/crew-landing-config.test.mjs
// accepted_slot, cleanup_limit, merge_precheck and task_extra_fields are in the schema with a question, the reason and a
// recommendation; crew_config set refuses a value of a wrong shape and leaves the file untouched; right values are written,
// and once committed loadConfig reads them with the same defaults; the questionnaire (guide) names the four keys; the
// reserved ids of the extra fields cover the input fields of crew_spawn.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-landing-config-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
process.env.CREW_HARNESS_PRESENCE = "all"
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
const root = path.join(tmp, "proj")
const cfgDir = path.join(root, "proj-settings")
const work = path.join(root, "repo")
mkdirSync(path.join(cfgDir, ".opencode"), { recursive: true })
mkdirSync(work, { recursive: true })
const file = path.join(cfgDir, ".opencode", "crew-harness.json")
git(cfgDir, "init", "-q", "-b", "main")
writeFileSync(file, JSON.stringify({ project: "proj", root: "..", cleanup: "local" }, null, 2))
git(cfgDir, "add", "-A")
git(cfgDir, "commit", "-q", "-m", "settings")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const schema = await import("../config-schema.ts")
const hooks = {}
const tools = {}
const ctx = {
  location: { directory: work },
  options: { projects: [cfgDir] },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: work }, time: {} }),
    prompt: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const call = async (sid, input) => (await tools.crew_config.execute(input, { sessionID: sid })).content
for (const s of ["sesINT", "sesWRK"]) await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })
await tools.crew_role.execute({ role: "integrator" }, { sessionID: "sesINT" })
const NEW = ["accepted_slot", "cleanup_limit", "merge_precheck", "task_extra_fields"]

// ---- AC-25 отказы: a value of a wrong shape is refused, the file is untouched
const before = readFileSync(file, "utf8")
const bads = {
  "accepted_slot: maybe": [{ accepted_slot: "maybe" }, /accepted_slot: одно из hold \/ free/],
  "cleanup_limit: -1": [{ cleanup_limit: -1 }, /cleanup_limit: целое число ≥ 0/],
  "cleanup_limit: 2.5": [{ cleanup_limit: 2.5 }, /cleanup_limit: целое число ≥ 0/],
  "merge_precheck: x": [{ merge_precheck: "x" }, /merge_precheck: одно из off \/ required/],
  "extra fields: a repeated id": [{ task_extra_fields: [{ id: "range", label: "A" }, { id: "range", label: "B" }] }, /task_extra_fields: список до 8 полей/],
  "extra fields: a built-in id": [{ task_extra_fields: [{ id: "goal", label: "Цель" }] }, /task_extra_fields: список до 8 полей/],
  "extra fields: nine elements": [{ task_extra_fields: Array.from({ length: 9 }, (_, i) => ({ id: `f${i}`, label: `F${i}` })) }, /task_extra_fields: список до 8 полей/],
  "extra fields: an id with capitals": [{ task_extra_fields: [{ id: "Range", label: "A" }] }, /task_extra_fields: список до 8 полей/],
  "extra fields: an id of 32 characters": [{ task_extra_fields: [{ id: "a".repeat(32), label: "A" }] }, /task_extra_fields: список до 8 полей/],
  "extra fields: an empty label": [{ task_extra_fields: [{ id: "range", label: "  " }] }, /task_extra_fields: список до 8 полей/],
  "extra fields: a hint that is not a string": [{ task_extra_fields: [{ id: "range", label: "A", hint: 5 }] }, /task_extra_fields: список до 8 полей/],
  "extra fields: not a list": [{ task_extra_fields: "range" }, /task_extra_fields: список до 8 полей/],
}
const refusals = {}
for (const [name, [values]] of Object.entries(bads)) refusals[name] = await call("sesINT", { action: "set", values })
const wrong = Object.entries(bads).filter(([name, [, re]]) => !(/Не записано \(файл не тронут\)/.test(refusals[name]) && re.test(refusals[name])))
cell("AC-25 отказы: every wrong value is refused with its reason", wrong.length === 0, JSON.stringify(wrong.map(([n]) => [n, refusals[n]])))
cell("AC-25 отказы: the file is untouched after the refusals", readFileSync(file, "utf8") === before, "changed")
cell("AC-25 отказы: the refusal of a built-in id names the reserved ids", /goal/.test(refusals["extra fields: a built-in id"]) && /extra/.test(refusals["extra fields: a built-in id"]), refusals["extra fields: a built-in id"])
const worker = await call("sesWRK", { action: "set", values: { accepted_slot: "free" } })
cell("AC-25 отказы: a worker cannot set the new keys either", /только интегратор/.test(worker) && readFileSync(file, "utf8") === before, worker)

// ---- AC-25 записи читаются: right values are written, applied after the commit, defaults are the same
const d = core.loadConfig(work)
cell("AC-25 записи читаются: the defaults without the keys", d.acceptedSlot === "hold" && d.cleanupLimit === 10 && d.mergePrecheck === "off" && Array.isArray(d.extraFields) && d.extraFields.length === 0, JSON.stringify([d.acceptedSlot, d.cleanupLimit, d.mergePrecheck, d.extraFields]))
const fields = [{ id: "ids", label: "Диапазон номеров реестра", hint: "например 40-45" }, { id: "wave", label: "Волна" }]
const ok = await call("sesINT", { action: "set", values: { accepted_slot: "free", cleanup_limit: 0, merge_precheck: "required", task_extra_fields: fields } })
cell("AC-25 записи читаются: right values are written to the working copy", /Записано/.test(ok) && NEW.every((k) => k in JSON.parse(readFileSync(file, "utf8"))), ok)
cell("AC-25 записи читаются: until the commit the defaults apply", core.loadConfig(work).acceptedSlot === "hold" && core.loadConfig(work).mergePrecheck === "off", JSON.stringify(core.loadConfig(work)))
git(cfgDir, "add", "-A")
git(cfgDir, "commit", "-q", "-m", "set")
const after = core.loadConfig(work)
cell("AC-25 записи читаются: after the commit loadConfig reads the four keys", after.acceptedSlot === "free" && after.cleanupLimit === 0 && after.mergePrecheck === "required" && JSON.stringify(after.extraFields) === JSON.stringify(fields), JSON.stringify([after.acceptedSlot, after.cleanupLimit, after.mergePrecheck, after.extraFields]))
const show = await call("sesWRK", { action: "show" })
cell("AC-25 записи читаются: show names the four keys with their sources", NEW.every((k) => new RegExp(`${k} = .* — файл, ветка main`).test(show)), show)
// a tolerant reading: bad elements are dropped, the rest stays (a file written by hand)
writeFileSync(file, JSON.stringify({ project: "proj", root: "..", cleanup: "local", accepted_slot: "maybe", cleanup_limit: -3, merge_precheck: 7, task_extra_fields: [{ id: "ok1", label: "Один" }, { id: "BAD", label: "x" }, { id: "title", label: "x" }, { id: "ok1", label: "повтор" }, { id: "no_label" }, 5, null, { id: "ok2", label: " Два ", hint: " подсказка " }] }, null, 2))
git(cfgDir, "add", "-A")
git(cfgDir, "commit", "-q", "-m", "hand-written")
const tol = core.loadConfig(work)
cell("AC-25 записи читаются: a hand-written file is read tolerantly", tol.acceptedSlot === "hold" && tol.cleanupLimit === 10 && tol.mergePrecheck === "off" && JSON.stringify(tol.extraFields) === JSON.stringify([{ id: "ok1", label: "Один" }, { id: "ok2", label: "Два", hint: "подсказка" }]), JSON.stringify(tol))

// ---- AC-25 guide: the four keys with a question, a recommendation and the reason
const guide = await call("sesWRK", { action: "guide" })
const line = (k) => guide.split("\n").find((l) => l.startsWith(`- ${k}:`)) ?? ""
cell("AC-25 guide: the four keys are in the questionnaire with a recommendation and a reason", NEW.every((k) => /Рекомендация: .+\. Зачем: .+/.test(line(k))), NEW.map((k) => line(k).slice(0, 120)).join(" | "))
cell("AC-25 guide: every key of the schema is covered (the old rule of crew-cfgtool)", schema.SCHEMA_KEYS.every((k) => guide.includes(`- ${k}:`)), "missing")
cell("AC-25 guide: the options of the two enums are numbered", /- accepted_slot: .*1\) hold  2\) free/.test(guide) && /- merge_precheck: .*1\) off  2\) required/.test(guide), line("accepted_slot") + line("merge_precheck"))

// ---- the reserved ids cover the input fields of crew_spawn (the list lives in config-schema.ts: core.ts imports it)
const spawnFields = Object.keys(tools.crew_spawn.input.properties)
const missing = spawnFields.filter((f) => !schema.RESERVED_FIELD_IDS.includes(f))
cell("AC-25 reserved ids: every input field of crew_spawn is reserved", missing.length === 0, JSON.stringify(missing))
const taskFields = Object.keys(tools.crew_task.input.properties)
cell("AC-25 reserved ids: action, n and session of crew_task are reserved", ["action", "n", "session"].every((f) => taskFields.includes(f) && schema.RESERVED_FIELD_IDS.includes(f)), JSON.stringify(taskFields))

cell("AC-25 reserved ids: service names of an object (constructor, __proto__, prototype) are reserved", ["constructor", "__proto__", "prototype"].every((f) => schema.RESERVED_FIELD_IDS.includes(f) && schema.invalid("task_extra_fields", [{ id: f, label: "X" }]) !== undefined), JSON.stringify(["constructor", "__proto__", "prototype"].map((f) => schema.invalid("task_extra_fields", [{ id: f, label: "X" }]))))
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-landing-config.test: FAIL ${fail}` : "crew-landing-config.test ok")
process.exit(fail ? 1 : 0)

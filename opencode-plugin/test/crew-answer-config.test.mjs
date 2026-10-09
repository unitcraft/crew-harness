// Self-test of the settings of the question-answering modes (task 007; node >= 24):  node test/crew-answer-config.test.mjs
// The keys answer_mode (a map "type -> mode") and answer_max (the limit of answers in a row) belong to the person: crew_config set
// refuses them and leaves the file alone; the questionnaire names them; a value of a wrong form is read as absent and named by
// invalid / show / the doctor. The settings live in a real git repository, as in crew-cfgtool.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-answer-config-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
process.env.CREW_HARNESS_PRESENCE = "all"
const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
const load = (f) => import(pathToFileURL(path.join(plugin, f)).href)
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
const root = path.join(tmp, "proj")
const cfgDir = path.join(root, "proj-settings")
const work = path.join(root, "repo")
mkdirSync(path.join(cfgDir, ".opencode"), { recursive: true })
mkdirSync(work, { recursive: true })
const file = path.join(cfgDir, ".opencode", "crew-harness.json")
const commit = (obj) => {
  writeFileSync(file, JSON.stringify({ project: "proj", root: "..", ...obj }, null, 2))
  git(cfgDir, "add", "-A")
  git(cfgDir, "commit", "-q", "--allow-empty", "-m", "settings")
}
git(cfgDir, "init", "-q", "-b", "main")
commit({})

const mod = await load("index.ts")
const core = await load("core.ts")
const schema = await load("config-schema.ts")
const settings = await load("settings.ts")
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

const modeOf = () => JSON.stringify(core.loadConfig(work).answerMode ?? null)
const maxOf = () => core.loadConfig(work).answerMax

// AC-08: set refuses both keys; the file stays; the questionnaire has both, without the window commands of the profile sets
const before = readFileSync(file, "utf8")
const s1 = await call("sesINT", { action: "set", values: { answer_mode: { implementation: "recommendations" } } })
cell("AC-08 set answer_mode", /Не записано/.test(s1) && /answer_mode/.test(s1) && /человек/.test(s1) && readFileSync(file, "utf8") === before, s1)
const s2 = await call("sesINT", { action: "set", values: { answer_max: 5 } })
cell("AC-08 set answer_max", /Не записано/.test(s2) && /answer_max/.test(s2) && /человек/.test(s2) && readFileSync(file, "utf8") === before, s2)
const guide = await call("sesWRK", { action: "guide" })
const lines = (k) => guide.split("\n").filter((l) => l.startsWith(`- ${k}:`))
const ok8 = ["answer_mode", "answer_max"].every((k) => {
  const l = lines(k)[0] ?? ""
  return l && /Сейчас:/.test(l) && /Рекомендация: \S/.test(l) && /Зачем: \S/.test(l) && /Ставит человек/.test(l) && !/crew-sets/.test(l)
})
const am = lines("answer_mode")[0] ?? ""
cell("AC-08 guide", ok8 && /\{"implementation": "recommendations"\}/.test(am) && /owner/.test(am) && /recommendations/.test(am), lines("answer_mode").concat(lines("answer_max")).join("\n"))
const prof = await call("sesINT", { action: "set", values: { profile_set: "x" } })
cell("AC-08 profile_set refusal text is unchanged", prof === "Не записано (файл не тронут):\n- profile_set: имя набора меняет человек (команда окна /crew-sets use либо правка файла); вызовом set его не записывают", prof)

// AC-07: the key gate is not accepted
const s3 = await call("sesINT", { action: "set", values: { answer_mode: { gate: "recommendations" } } })
cell("AC-07 set", /Не записано/.test(s3) && readFileSync(file, "utf8") === before, s3)
commit({ answer_mode: { gate: "recommendations", plan: "recommendations" } })
cell("AC-07 игнорируется", modeOf() === JSON.stringify({ plan: "recommendations" }), modeOf())
const show = await call("sesWRK", { action: "show" })
cell("AC-07 show", /answer_mode/.test(show) && show.split("\n").some((l) => /gate/.test(l) && /не принимается/.test(l)), show)
const problems = settings.settingsProblems(settings.parseProjects({ projects: [cfgDir] }))
cell("AC-07 doctor", problems.some((p) => /answer_mode/.test(p) && /gate/.test(p)), JSON.stringify(problems))
commit({})
const clean = settings.settingsProblems(settings.parseProjects({ projects: [cfgDir] }))
cell("AC-07 doctor control: no key, no problem", !clean.some((p) => /answer_/.test(p)), JSON.stringify(clean))

// AC-09: values of a wrong form are read as absent; invalid names the error
const err = (k, v) => schema.invalid(k, v) ?? ""
commit({ answer_mode: { plan: "auto" } })
cell("AC-09 a", modeOf() === "{}" && /answer_mode/.test(err("answer_mode", { plan: "auto" })), modeOf() + " | " + err("answer_mode", { plan: "auto" }))
commit({ answer_mode: { plan: "agent" } })
cell("AC-09 b", modeOf() === "{}" && /не поддерживается в этой версии/.test(err("answer_mode", { plan: "agent" })) && /не поддерживается в этой версии/.test(await call("sesWRK", { action: "show" })), modeOf() + " | " + err("answer_mode", { plan: "agent" }))
commit({ answer_max: -1 })
cell("AC-09 c", maxOf() === 3 && /answer_max/.test(err("answer_max", -1)), maxOf() + " | " + err("answer_max", -1))
commit({ answer_max: 0 })
cell("AC-09 d", maxOf() === 3 && /answer_max/.test(err("answer_max", 0)) && err("answer_max", 1) === "" && err("answer_max", 7) === "", maxOf() + " | " + err("answer_max", 0))
commit({ answer_mode: { requirements: "recommendations", plan: "agent" } })
const e1 = modeOf()
commit({ answer_mode: { requirements: "recommendations", plan: "agent", default: "recommendations" } })
const cfg = core.loadConfig(work)
cell("AC-09 e", e1 === JSON.stringify({ requirements: "recommendations" }) && cfg.answerMode.requirements === "recommendations" && !("plan" in cfg.answerMode) && cfg.answerMode.default === "recommendations", e1 + " | " + modeOf())

// REQ-01: the mode of a type: the type, then default, then owner
const parse = await load("answer-parse.ts")
const m = (obj) => parse.normalizeAnswerMode(obj).map
cell("REQ-01 modeFor", parse.modeFor(m({ plan: "recommendations" }), "plan") === "recommendations" && parse.modeFor(m({}), "plan") === "owner" && parse.modeFor(m({ default: "recommendations" }), "implementation") === "recommendations" && parse.modeFor(m({ default: "recommendations", plan: "owner" }), "plan") === "owner", "modeFor")
cell("REQ-01 answerModesOn", !parse.answerModesOn(m({})) && !parse.answerModesOn(m({ plan: "owner", default: "owner" })) && parse.answerModesOn(m({ implementation: "recommendations" })) && parse.answerModesOn(m({ default: "recommendations" })), "answerModesOn")
cell("REQ-02 answer_max default", parse.normalizeAnswerMax(undefined) === 3 && parse.normalizeAnswerMax(2) === 2 && parse.normalizeAnswerMax(0) === 3 && parse.normalizeAnswerMax(2.5) === 3 && parse.normalizeAnswerMax("4") === 3, "normalizeAnswerMax")
cell("REQ-01 a string is read as absent, with a note", parse.normalizeAnswerMode("owner").notes.length === 1 && JSON.stringify(m("owner")) === "{}" && parse.normalizeAnswerMode(undefined).notes.length === 0, "string")

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-answer-config.test: FAIL ${fail}` : "crew-answer-config.test ok")
process.exit(fail ? 1 : 0)

// Self-test: the slot at acceptance (task 005, AC-02..AC-06; node >= 24):  node test/crew-landing-slot.test.mjs
// accepted_slot "free": an accepted, not cleaned task does not count in inflight_limit (crew_spawn and the steps of an auto
// plan), it is counted by cleanup_limit instead ("waits for cleanup"), P0 passes both; the texts do not say that the accepted
// tasks hold a place; the tab of the accepted task is still woken and reminded; "free" is the default since 2026-10-09, the explicit "hold" is as before.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-landing-slot-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FLOW_MS = "200"
process.env.CREW_HARNESS_LEFT_MS = "3600000"
process.env.CREW_HARNESS_PLANSTEPS_MS = "200"
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
mkdirSync(path.join(proj, "docs", "plans"), { recursive: true })
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const settings = (extra) => writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ spawn_limits: { worker: 20, reviewer: 0 }, stall_minutes: 600, accepted_reminder_min: 0.01, ...extra }))
settings({})
const PLAN = [
  "# План 9 — демо", "", "**Статус:** 🟡 В РАБОТЕ", "**Источник:** задача #1", "**Зависимости:** —", "",
  "## Зачем", "демо слота", "## Что уже есть", "ничего", "## Режим выполнения", "Без упрощений: ДА — владелец, 2026-10-08",
  "## Фазы",
  "### Ф.1 — первая [P1]", "#### Ф.1.1 — шаг один [где: a.nv]", "Что: сделать один", "**Приёмка:**", "- ⬜ проверка один → зелёная",
  "### Ф.2 — вторая [P1]", "#### Ф.2.1 — шаг два [где: b.nv]", "Что: сделать два", "**Приёмка:**", "- ⬜ проверка два → зелёная",
  "### Ф.3 — третья [P1]", "#### Ф.3.1 — шаг три [где: c.nv]", "Что: сделать три", "**Приёмка:**", "- ⬜ проверка три → зелёная",
  "## Не делаем", "лишнее", "## Открытые вопросы", "Открытых вопросов нет, проверено 2026-10-08", "## Решения владельца",
].join("\n")
writeFileSync(path.join(proj, "docs", "plans", "9-demo.md"), PLAN)
git(proj, "init", "-q", "-b", "main")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const tools = {}
const hooks = {}
const events = {}
const delivered = []
const sessions = new Map()
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
    synthetic: async ({ sessionID, text }) => delivered.push({ sessionID, text, synthetic: true }),
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
const WPID = 919191
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: [{ sessionID: "sesINTEG1", active: true, busy: false }] }))
beat()
const heart = setInterval(beat, 300)
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 8_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
}
const call = async (name, input) => (await tools[name].execute(input, { sessionID: "sesINTEG1" })).content
const letters = (to) =>
  ["inbox", "read"].flatMap((d) => {
    try {
      const dir = path.join(core.BASE, d, to)
      return readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
    } catch {
      return []
    }
  })
core.saveCard({ session: "sesINTEG1", role: "integrator", auto: false, title: "sesINTEG1", directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesINTEG1" } })
await call("crew_role", { role: "integrator" })

const mk = (status, extra = {}) => {
  const t = tasks.createTask({ project: "proj", title: `задача ${status}`, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: `q${Math.random().toString(36).slice(2, 8)}`, status, kind: "spawn", directory: proj })
  Object.assign(t, extra)
  tasks.saveTask(t)
  return t
}
/** accepted an `ageMin` ago, not cleaned */
const accepted = (ageMin, reviewer) => {
  const t = mk("accepted", { executor: `sesEX${reviewer}`, reviewer, review_kind: "spawn" })
  t.history.push({ at: Date.now() - ageMin * 60_000, by: reviewer, status: "accepted", note: "принята" })
  tasks.saveTask(t)
  return t
}
const reset = () => rmSync(path.join(tasks.TASKS, "proj"), { recursive: true, force: true })
const all = () => tasks.listTasks("proj")
const spawn = (extra = {}) => call("crew_spawn", { title: "новая", goal: "g", criteria: "c", ...extra })
const started = (s) => /запущена/.test(s)
/** four open tasks (three working, one on review) and one accepted */
const fiveBase = () => {
  reset()
  for (let i = 0; i < 3; i++) mk("running", { executor: `sesRUN${i}` })
  mk("reviewing", { executor: "sesEXR", reviewer: "sesREVR", review_kind: "tab" })
  return accepted(60, "sesREVA")
}

// ---- AC-02 default: no accepted_slot key behaves as free (owner's decision, 2026-10-09)
settings({ inflight_limit: 5 })
fiveBase()
const sDef = await spawn()
cell("AC-02 умолчание: with no accepted_slot key the sixth task is put (the default is free)", started(sDef) && all().length === 6 && core.loadConfig(proj).acceptedSlot === "free", sDef)
reset()
// ---- AC-02: the same data (4 open + 1 accepted, inflight_limit 5): free puts the sixth, hold refuses
settings({ inflight_limit: 5, accepted_slot: "free" })
fiveBase()
const sFree = await spawn()
cell("AC-02 free: the sixth task is put (4 counted < 5)", started(sFree) && all().length === 6, sFree)
const sFree2 = await spawn()
cell("AC-02 free граница: the next one is refused at 5 counted, the accepted one is not named as holding a place", /Лимит задач проекта/.test(sFree2) && !started(sFree2) && all().length === 6, sFree2)
settings({ inflight_limit: 5, accepted_slot: "hold" })
fiveBase()
const sHold = await spawn()
cell("AC-02 hold: the same data refuse the sixth task, as before", /Лимит задач проекта/.test(sHold) && /#5 принята 60 мин назад, не очищена/.test(sHold) && all().length === 5, sHold)

// ---- AC-03 c1..c5: cleanup_limit 2 and two accepted tasks (the counted open ones are few)
settings({ inflight_limit: 10, accepted_slot: "free", cleanup_limit: 2 })
reset()
accepted(60, "sesREVA")
accepted(80, "sesREVB")
mk("running", { executor: "sesRUN0" })
const c1 = await spawn()
cell("AC-03 c1: refused, both waiting tasks named with age and reviewer", /cleanup_limit/.test(c1) && !started(c1) && /#1 принята 60 мин назад, не очищена \(приёмщик sesREVA\)/.test(c1) && /#2 принята 80 мин назад, не очищена \(приёмщик sesREVB\)/.test(c1) && /cleaned/.test(c1) && all().length === 3, c1)
const c2 = await spawn({ priority: "P0" })
cell("AC-03 c2: P0 passes both limits", started(c2) && all().length === 4, c2)
settings({ inflight_limit: 10, accepted_slot: "free", cleanup_limit: 0 })
const c3 = await spawn()
cell("AC-03 c3: cleanup_limit 0 means no limit", started(c3) && all().length === 5, c3)
settings({ inflight_limit: 10, accepted_slot: "free", cleanup_limit: 2 })
const c3b = await spawn()
cell("AC-03 c3 control: with the limit back at 2 the refusal returns", /cleanup_limit/.test(c3b) && all().length === 5, c3b)
const one = tasks.loadTask("proj", 1)
tasks.taskEvent(one, "sesREVA", "cleaned", "очищена")
const c4 = await spawn()
cell("AC-03 c4: after one task is cleaned (1 waiting < 2) the next one is put", started(c4) && all().length === 6, c4)
settings({ inflight_limit: 10, accepted_slot: "hold", cleanup_limit: 1 })
const c5 = await spawn()
cell("AC-03 c5: with accepted_slot hold cleanup_limit does not act", started(c5) && all().length === 7, c5)

// ---- AC-04: the steps of an auto plan (a cleaned, approved plan task; its file is in the target branch)
const planTask = () =>
  mk("cleaned", { title: "план 9", executor: "sesEXP", reviewer: "sesREVP", plan: { n: "9", file: "docs/plans/9-demo.md", source: "демо", rounds: [], clean: 2, approval: { decision: "ok", at: Date.now() } } })
const spawnedOf = () => Object.keys(tasks.loadTask("proj", planNo)?.plan?.spawned ?? {}).length
let planNo = 0
const scenario = async (label, cfg, prep) => {
  settings(cfg)
  reset()
  prep?.()
  planNo = planTask().n
  await wait(1_400)
  const n1 = spawnedOf()
  return n1
}
let n = await scenario("hold", { inflight_limit: 2, accepted_slot: "hold" }, () => {
  accepted(60, "sesREVA")
  accepted(60, "sesREVB")
})
cell("AC-04 hold: two accepted tasks fill inflight_limit 2, no step is put", n === 0, `spawned ${n}`)
n = await scenario("free", { inflight_limit: 2, accepted_slot: "free", cleanup_limit: 5 }, () => {
  accepted(60, "sesREVA")
  accepted(60, "sesREVB")
})
cell("AC-04 free: the accepted tasks are not counted, two steps are put and the third waits for the limit", n === 2, `spawned ${n}`)
n = await scenario("cleanup_limit", { inflight_limit: 5, accepted_slot: "free", cleanup_limit: 2 }, () => {
  accepted(60, "sesREVA")
  accepted(60, "sesREVB")
})
cell("AC-04 cleanup_limit: two waiting for cleanup stop the auto plan", n === 0, `spawned ${n}`)
const waitingOne = all().find((t) => t.status === "accepted")
tasks.taskEvent(waitingOne, "sesREVA", "cleaned", "очищена")
await until(() => spawnedOf() > 0, 4_000)
cell("AC-04 после cleaned: one cleaned (1 waiting < 2) and the steps are put", spawnedOf() >= 1, `spawned ${spawnedOf()}`)
settings({})

// ---- AC-05: the tab of an accepted task is still woken, reminded and marked
reset()
settings({ inflight_limit: 5, accepted_slot: "free", cleanup_limit: 4 })
const a5 = accepted(60, "sesREV05")
core.saveCard({ session: "sesREV05", role: "worker", auto: false, title: "sesREV05", directory: proj, repo: "proj", project: "proj", pid: process.pid + 1_000_000, updated: Date.now(), review: { project: "proj", n: a5.n } })
const card5 = core.allCards().find((c) => c.session === "sesREV05")
cell("AC-05: holdsOpenTask is true for the reviewer of an accepted task, a closed tab may be woken", core.holdsOpenTask(card5) === true && core.mayWakeCard(card5, []) === true, JSON.stringify(card5))
await until(() => letters("sesREV05").some((l) => /не очищена/.test(l.text)))
const rem5 = letters("sesREV05").filter((l) => /не очищена/.test(l.text))
cell("AC-05: the reminder comes through accepted_reminder_min, once, and says that the place is not held (N of M)", rem5.length === 1 && /ждёт уборки, место в inflight_limit не занимает \(ждёт уборки 1 из 4\)/.test(rem5[0].text) && rem5[0].wake !== false, JSON.stringify(rem5.map((l) => l.text)))
const auth5 = letters("sesINTEG1").filter((l) => new RegExp(`#${a5.n} .*приёмщик sesREV05`).test(l.text))
cell("AC-05: the author is told too, in the same words", auth5.length === 1 && /ждёт уборки, место не занимает; ждёт уборки 1 из 4/.test(auth5[0].text), JSON.stringify(auth5.map((l) => l.text)))
const list5 = await call("crew_task", { action: "list" })
cell("AC-05: crew_task list marks the accepted task as waiting for cleanup", new RegExp(`#${a5.n} P2 принята «[^»]+» — исполнитель sesEXsesREV05, приёмщик sesREV05 — ждёт уборки`).test(list5), list5)
const show5 = await call("crew_task", { action: "show", n: a5.n })
cell("AC-05: crew_task show marks it too", /^#\d+ .* — ждёт уборки$/m.test(show5.split("\n")[0]), show5.split("\n")[0])
settings({ inflight_limit: 5, accepted_slot: "hold" })
const listHold = await call("crew_task", { action: "list" })
cell("AC-05 hold: no mark at hold", !/ждёт уборки/.test(listHold), listHold)

// ---- AC-05 предела нет: cleanup_limit 0 in the reminder
const a5b = accepted(60, "sesREV06")
settings({ inflight_limit: 5, accepted_slot: "free", cleanup_limit: 0 })
await until(() => letters("sesREV06").some((l) => /не очищена/.test(l.text)))
const rem6 = letters("sesREV06").filter((l) => /не очищена/.test(l.text))
cell("AC-05 предела нет: with cleanup_limit 0 the reminder says 'N, предела нет'", rem6.length === 1 && /ждёт уборки 2, предела нет/.test(rem6[0].text), JSON.stringify(rem6.map((l) => l.text)))

// ---- AC-06: the words about holding a place: none under free, present under hold (refusal and reminders)
const FORBIDDEN = [/держит место/, /держат/, /держащими/, /Место держат принятые/]
const free = { refusal: "", reviewer: "", author: "" }
reset()
settings({ inflight_limit: 3, accepted_slot: "free", cleanup_limit: 2 })
for (let i = 0; i < 3; i++) mk("running", { executor: `sesRUN${i}` })
const accFree = accepted(60, "sesREV07")
free.refusal = await spawn()
await until(() => letters("sesREV07").some((l) => /не очищена/.test(l.text)))
free.reviewer = letters("sesREV07").find((l) => /не очищена/.test(l.text))?.text ?? ""
free.author = letters("sesINTEG1").find((l) => new RegExp(`#${accFree.n} .*приёмщик sesREV07`).test(l.text))?.text ?? ""
cell("AC-06 free: the refusal by inflight_limit is a real refusal without the words about holding a place", /Лимит задач проекта/.test(free.refusal) && FORBIDDEN.every((re) => !re.test(free.refusal)), free.refusal)
cell("AC-06 free: the reminders to the reviewer and the author have none of the words", free.reviewer.length > 0 && free.author.length > 0 && [free.reviewer, free.author].every((t) => FORBIDDEN.every((re) => !re.test(t))), JSON.stringify(free))
reset()
settings({ inflight_limit: 3, accepted_slot: "hold" })
for (let i = 0; i < 2; i++) mk("running", { executor: `sesRUN${i}` })
const accHold = accepted(60, "sesREV08")
const hold = { refusal: await spawn() }
await until(() => letters("sesREV08").some((l) => /не очищена/.test(l.text)))
hold.reviewer = letters("sesREV08").find((l) => /не очищена/.test(l.text))?.text ?? ""
hold.author = letters("sesINTEG1").find((l) => new RegExp(`#${accHold.n} .*приёмщик sesREV08`).test(l.text))?.text ?? ""
cell("AC-06 hold: the refusal and the reminders say that the accepted tasks hold a place, as before", /Место держат принятые/.test(hold.refusal) && /держит место в лимите задач/.test(hold.reviewer) && /держит место в inflight_limit/.test(hold.author), JSON.stringify(hold))
cell("AC-06 control: the search finds the words in the hold texts", FORBIDDEN.some((re) => re.test(hold.refusal)) && FORBIDDEN.some((re) => re.test(hold.reviewer)), "not found")

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-landing-slot.test: FAIL ${fail}` : "crew-landing-slot.test ok")
process.exit(fail ? 1 : 0)

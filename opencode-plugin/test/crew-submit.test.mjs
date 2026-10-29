// Self-test of crew_task {action: "submit"} (task 041; node >= 24):  node test/crew-submit.test.mjs
// The executor submits the work without knowing the qid: the same as a report with reply_to (first submission,
// after rework, after a sync, a plan task with the form check); only the executor; the second submit is refused;
// no text is refused; an ordinary letter of the executor to the author gets a hint; the refusal of review in
// rework names `crew_task submit`; the letters to the executor name submit as the main way.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-submit-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
mkdirSync(path.join(proj, "docs", "plans"), { recursive: true })
writeFileSync(path.join(proj, "docs", "plans", "7-old.md"), "# План 7 — старый\n")
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
writeFileSync(
  path.join(proj, ".opencode", "crew-harness.json"),
  JSON.stringify({ allow_default_models: true, worktrees: "wt", branch_name: "p{n}-{slug}", cleanup: "local", merge_precheck: "off", accepted_slot: "hold", rework_max: 5, spawn_limits: { worker: 5, reviewer: 1 } }),
)
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "init", "-q", "-b", "main")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const sessions = new Map()
const ctx = {
  location: { directory: proj },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
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
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
// Task 088: a pause before a check that something HAPPENED is a condition awaited up to 60 s; a short settle stays where the check also
// counts "exactly one" (nothing more came).
const until = async (cond, ms = 60_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
}
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const turnEnds = async (sid) => {
  await hooks.context({ sessionID: sid, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: sid } })
}
const task = (n) => tasks.loadTask("proj", n)

const WPID = 828282
const tabs = ["sesINTEG1", "sesREVIEW1"].map((sessionID, i) => ({ sessionID, active: i === 0, busy: false }))
mkdirSync(core.WINDOWS, { recursive: true })
// dated 30 s ahead: a window of 3 s freshness would look closed when this process is slow on a loaded machine (task 088)
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now() + 30_000, tabs }))
beat()
const heart = setInterval(beat, 300)
for (const t of tabs) await turnEnds(t.sessionID)
await call("crew_role", "sesINTEG1", { role: "integrator" })
core.saveCard({ ...core.readJson(core.cardFile("sesREVIEW1")), spawned: { by: "sesINTEG1", task: "review pool", tier: "medium", status: "running", at: Date.now(), qid: "pool-review" } })

// 1. first submission
await call("crew_spawn", "sesINTEG1", { title: "фича", goal: "сделать фичу", criteria: "тест зелёный" })
await until(() => !!task(1)?.executor && got(task(1).executor, 'crew_task {action: "submit", n: 1').length >= 1)
const ex1 = task(1).executor
cell("the task letter names submit as the only way and does not name reply_to", got(ex1, 'crew_task {action: "submit", n: 1').length === 1 && got(ex1, "reply_to").length === 0, JSON.stringify(got(ex1, "ЗАДАЧА").map((d) => d.text.slice(-400))))
const notEx = await call("crew_task", "sesINTEG1", { action: "submit", n: 1, text: "готово" })
cell("submit by a non-executor is refused", /исполнител/.test(notEx) && task(1).status === "running", notEx)
const noText = await call("crew_task", ex1, { action: "submit", n: 1 })
cell("submit without text is refused", /text/.test(noText) && task(1).status === "running", noText)
const blank = await call("crew_task", ex1, { action: "submit", n: 1, text: "   " })
cell("submit with a blank text is refused", /text/.test(blank) && task(1).status === "running", blank)
const integBefore = delivered.filter((d) => d.sessionID === "sesINTEG1").length
const ok1 = await call("crew_task", ex1, { action: "submit", n: 1, text: "фича готова, тесты зелёные" })
await until(() => task(1).reviewer === "sesREVIEW1" && got("sesREVIEW1", "ПРИЁМКА задачи 001").length >= 1 && delivered.filter((d) => d.sessionID === "sesINTEG1").slice(integBefore).some((d) => d.text.includes("фича готова")))
await wait(300) // exactly one review letter, nothing but quiet letters to the author
cell("submit from running submits the task", task(1).status === "submitted" && task(1).report === "фича готова, тесты зелёные", JSON.stringify({ st: task(1).status, ok1 }))
const toInteg = delivered.filter((d) => d.sessionID === "sesINTEG1").slice(integBefore)
cell("the report reaches the author quietly, like the reply_to one", toInteg.some((d) => d.text.includes("фича готова")) && toInteg.every((d) => d.synthetic), JSON.stringify(toInteg.map((d) => d.text.slice(0, 80))))
cell("the reviewer is assigned and gets the review letter", task(1).reviewer === "sesREVIEW1" && got("sesREVIEW1", "ПРИЁМКА задачи 001").length === 1, JSON.stringify({ r: task(1).reviewer }))
cell("the executor's obligation is settled", !core.obligationsOf(ex1).some((o) => o.qid === task(1).qid), JSON.stringify(core.obligationsOf(ex1)))
const again = await call("crew_task", ex1, { action: "submit", n: 1, text: "ещё раз" })
cell("the second submit is refused: already sent", /уже отправлен/.test(again), again)

// 2. rework and the resubmission by submit
await call("crew_task", "sesREVIEW1", { action: "review", n: 1 })
await call("crew_task", "sesREVIEW1", { action: "rework", n: 1, text: "добавь проверку" })
await until(() => task(1).status === "rework" && got(ex1, "ДОРАБОТКА задачи 001").some((d) => d.text.includes('crew_task {action: "submit", n: 1')))
cell("the rework letter names submit as the main way", task(1).status === "rework" && got(ex1, "ДОРАБОТКА задачи 001").some((d) => d.text.includes('crew_task {action: "submit", n: 1')), JSON.stringify(got(ex1, "ДОРАБОТКА").map((d) => d.text.slice(-300))))
const early = await call("crew_task", "sesREVIEW1", { action: "review", n: 1 })
cell("review in rework names the executor's command and not reply_to", /crew_task \{action: "submit", n: 1,/.test(early) && !/reply_to/.test(early), early)
const sendNoReply = await call("crew_send", ex1, { to: "sesINTEG1", text: "поправил" })
cell("an ordinary letter in rework gets the hint", /Отправлено/.test(sendNoReply) && /crew_task \{action: "submit", n: 1/.test(sendNoReply) && task(1).status === "rework", sendNoReply)
const rw = await call("crew_task", ex1, { action: "submit", n: 1, text: "добавил проверку" })
await until(() => task(1).status === "submitted" && got("sesREVIEW1", "Доработка задачи 001 «фича» сдана").length >= 1 && core.obligationsOf("sesREVIEW1").some((o) => o.task === "приёмка 001"))
await wait(300) // exactly one letter
cell("submit from rework: the rework is submitted", task(1).status === "submitted" && /доработка сдана/.test(task(1).history.at(-1)?.note ?? ""), JSON.stringify({ st: task(1).status, h: task(1).history.at(-1), rw }))
cell("the reviewer is woken with the rework report", got("sesREVIEW1", "Доработка задачи 001 «фича» сдана").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesREVIEW1").map((d) => d.text.slice(0, 100))))
cell("the reviewer's obligation is back", core.obligationsOf("sesREVIEW1").some((o) => o.task === "приёмка 001"), JSON.stringify(core.obligationsOf("sesREVIEW1")))
cell("the executor's obligation is settled again", !core.obligationsOf(ex1).some((o) => o.qid === task(1).qid), JSON.stringify(core.obligationsOf(ex1)))

// 3. sync
await call("crew_task", "sesREVIEW1", { action: "review", n: 1 })
await call("crew_task", "sesREVIEW1", { action: "rework", n: 1, sync: true })
await until(() => task(1).status === "rework")
await call("crew_task", ex1, { action: "submit", n: 1, text: "влил main" })
await until(() => task(1).status === "submitted" && /после синхронизации/.test(task(1).history.at(-1)?.note ?? ""))
cell("submit after a sync is recorded as a sync", task(1).status === "submitted" && /после синхронизации/.test(task(1).history.at(-1)?.note ?? ""), JSON.stringify(task(1).history.at(-1)))

// 4. a hint for an ordinary letter while running; the letter is not a report
await call("crew_spawn", "sesINTEG1", { title: "вторая", goal: "g2", criteria: "c" })
await until(() => !!task(2)?.executor)
const ex2 = task(2).executor
const plain = await call("crew_send", ex2, { to: "sesINTEG1", text: "вопрос по границам, но не вопрос-ответ" })
cell("an ordinary letter to the author passes with a hint; the task is not submitted", /Отправлено/.test(plain) && /Задача 002 ещё не сдана/.test(plain) && /crew_task \{action: "submit", n: 2/.test(plain) && task(2).status === "running", plain)
const other = await call("crew_send", ex2, { to: "sesREVIEW1", text: "заметка соседу" })
cell("a letter to someone unrelated gets no hint", /Отправлено/.test(other) && !/ещё не сдана/.test(other), other)
const viaReply = await call("crew_send", ex2, { to: "sesINTEG1", text: "отчёт по старому", reply_to: task(2).qid })
cell("the old reply_to path still submits", task(2).status === "submitted" && !/ещё не сдана/.test(viaReply), viaReply)

// 5. a plan task: the form check as with reply_to
await call("crew_spawn", "sesINTEG1", { kind: "plan", title: "план про длину", goal: "Длина фрагмента должна браться из склеенного текста" })
await until(() => !!task(3)?.executor && got(task(3).executor, "ЗАДАЧА-ПЛАН").length >= 1)
const ex3 = task(3).executor
const noFile = await call("crew_task", ex3, { action: "submit", n: 3, text: "план готов" })
cell("a plan task without the plan file: not submitted", /Не сдано: файла плана/.test(noFile) && task(3).status === "running", noFile)
const planLetter = got(ex3, "ЗАДАЧА-ПЛАН")[0]?.text ?? ""
cell("the plan task letter names submit as the only way", planLetter.includes('crew_task {action: "submit", n: 3') && !planLetter.includes("reply_to"), planLetter.slice(-300))

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-submit.test: FAIL ${fail}` : "crew-submit.test ok")
process.exit(fail ? 1 : 0)

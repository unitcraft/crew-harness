// Self-test: extra task fields (task 005, REQ-16..18, REQ-24; AC-23, AC-24; node >= 24):  node test/crew-landing-extra.test.mjs
// The project declares task_extra_fields; crew_spawn and crew_task assign take extra {id: line up to 300 characters}; every refusal
// leaves no task (the number does not grow); the values reach the executor letter, the reviewer letter (with the path of the task
// record), the plan task letter and crew_task show, after reassign too; without values the texts are byte for byte the old ones.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-landing-extra-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FLOW_MS = "200"
process.env.CREW_HARNESS_LEFT_MS = "3600000"
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const settings = (extra) => writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ spawn_limits: { worker: 20, reviewer: 0 }, inflight_limit: 50, stall_minutes: 600, ...extra }))
settings({})
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


const FIELDS = [
  { id: "ticket", label: "Номер тикета", hint: "ключ в трекере" },
  { id: "area", label: "Область" },
]
settings({ task_extra_fields: FIELDS })
const reset = () => rmSync(path.join(tasks.TASKS, "proj"), { recursive: true, force: true })
const all = () => tasks.listTasks("proj")
const started = (s) => /запущена/.test(s)
const spawn = (extra, more = {}) => call("crew_spawn", { title: "новая", goal: "цель", criteria: "критерий", ...(extra === undefined ? {} : { extra }), ...more })
let tabNo = 0
const assign = (extra, more = {}) => {
  const sid = `sesTAB${++tabNo}`
  core.saveCard({ session: sid, role: "worker", auto: false, title: sid, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
  return call("crew_task", { action: "assign", session: sid, title: "вкладке", goal: "цель", criteria: "критерий", ...(extra === undefined ? {} : { extra }), ...more }).then((content) => ({ content, sid }))
}
const maxN = () => Math.max(0, ...all().map((t) => t.n))
const lines = (s) => s.split("\n")
/** the task letter text for the executor session of task t */
const execLetter = async (t) => {
  const mine = () => delivered.filter((d) => d.sessionID === t.executor && /ЗАДАЧА(-ПЛАН)? #/.test(d.text))
  await until(() => mine().length > 0, 4_000)
  return mine()[0]?.text ?? ""
}
const review = await import("../review.ts")

// ---- AC-23 c1..c5, for crew_spawn and for assign: the number does not grow on a refusal
reset()
const ok1 = await spawn({ ticket: "  NV-17  ", area: "" })
const t1 = all()[0]
cell("AC-23 c1 spawn: a declared id is accepted, the value is trimmed, the empty value is dropped", started(ok1) && all().length === 1 && JSON.stringify(t1.extra) === JSON.stringify({ ticket: "NV-17" }), ok1 + JSON.stringify(t1?.extra))
const ok1a = await assign({ area: "панель" })
const ta = tasks.loadTask("proj", maxN())
cell("AC-23 assign c1: the same for a tab of the owner", /отдана вкладке/.test(ok1a.content) && JSON.stringify(ta.extra) === JSON.stringify({ area: "панель" }), ok1a.content + JSON.stringify(ta?.extra))
const noExtra = await spawn(undefined)
const tn = tasks.loadTask("proj", maxN())
cell("AC-23 без extra: a task without extra has no extra in the record", started(noExtra) && tn.extra === undefined, JSON.stringify(tn))
const bad = [
  ["c2 неизвестный id", { color: "red" }, /дополнительного поля «color» нет/],
  ["c3 поле при пустом объявлении", { ticket: "NV-1" }, /проект не объявил дополнительных полей/],
  ["c4 301 знак", { ticket: "x".repeat(301) }, /длиннее 300/],
  ["c5 перевод строки", { ticket: "a\nb" }, /без переводов строки/],
]
for (const [name, extra, re] of bad) {
  if (name.startsWith("c3")) settings({})
  else settings({ task_extra_fields: FIELDS })
  const before = all().length
  const n0 = maxN()
  const r = await spawn(extra)
  const a = await assign(extra)
  const listed = name.startsWith("c3") ? true : /объявлены поля: ticket, area/.test(r) && /объявлены поля: ticket, area/.test(a.content)
  cell(`AC-23 ${name}: spawn and assign refuse, the declared ids are named, no task is created, the number does not grow`, re.test(r) && re.test(a.content) && listed && /не поставлена/.test(r) && all().length === before && maxN() === n0, r + " | " + a.content)
}
settings({ task_extra_fields: FIELDS })
const edge = await spawn({ ticket: "y".repeat(300) })
cell("AC-23 граница: 300 characters pass", started(edge) && tasks.loadTask("proj", maxN()).extra.ticket.length === 300, edge)
const notStr = await spawn({ ticket: 17 })
cell("AC-23 not a string: a number is refused", /строка/.test(notStr) && !started(notStr), notStr)
const notObj = await spawn("NV-1")
cell("AC-23 not an object: a string instead of the object is refused", /объект/.test(notObj) && !started(notObj), notObj)
const onlyEmpty = await spawn({ ticket: "   " })
cell("AC-23 empty only: a task with only empty values is put without extra", started(onlyEmpty) && tasks.loadTask("proj", maxN()).extra === undefined, onlyEmpty)
const n1 = maxN()
const ord = await call("crew_task", { action: "order", to: "other.integrator", goal: "цель", criteria: "критерий", extra: { ticket: "NV-9" } })
cell("AC-23 order: extra is refused for an order, no task is created", /extra для заказа не поддерживается/.test(ord) && maxN() === n1, ord)

// ---- AC-24: the texts
reset()
settings({ task_extra_fields: FIELDS })
await spawn({ ticket: "NV-17", area: "панель" })
const tx = all()[0]
const letter = await execLetter(tx)
const EXTRA_BLOCK = "ДОПОЛНИТЕЛЬНО (поля проекта):\n  Номер тикета: NV-17\n  Область: панель"
cell("AC-24 исполнитель: the executor letter has the block with labels, once", letter.includes(EXTRA_BLOCK) && letter.split("ДОПОЛНИТЕЛЬНО").length === 2, letter)
const cfg = core.loadConfig(proj)
const rletter = review.reviewLetter(tx, cfg)
const pathLine = lines(rletter).find((l) => l.startsWith("ЗАПИСЬ ЗАДАЧИ:")) ?? ""
cell("AC-24 приёмщик: the reviewer letter has the block and the line with the path of the task record", rletter.includes(EXTRA_BLOCK) && /поле extra/.test(pathLine), rletter)
const recPath = /^ЗАПИСЬ ЗАДАЧИ: (.+?), поле extra/.exec(pathLine)?.[1]
let fromFile
try {
  fromFile = JSON.parse(readFileSync(recPath, "utf8")).extra
} catch (e) {
  fromFile = String(e)
}
cell("AC-24 путь файла: a probe reads the extra values from the file at the path of the letter", JSON.stringify(fromFile) === JSON.stringify({ ticket: "NV-17", area: "панель" }), recPath + " :: " + JSON.stringify(fromFile))
const show = await call("crew_task", { action: "show", n: tx.n })
cell("AC-24 show: crew_task show prints the block", show.includes(EXTRA_BLOCK), show)
const order = ["КРИТЕРИИ ПРИЁМКИ", "ДОПОЛНИТЕЛЬНО"].map((w) => letter.indexOf(w))
cell("REQ-18 порядок: the block stands after the criteria of the executor letter", order[0] >= 0 && order[1] > order[0], letter)

// reassign: the new executor gets the same block in the letter of the new attempt
const re = await call("crew_task", { action: "reassign", n: tx.n })
const tr = tasks.loadTask("proj", tx.n)
const letter2 = await execLetter(tr)
cell("AC-24 reassign: the new executor letter (the new attempt) has the block", /передана новой сессии/.test(re) && tr.attempt === tx.attempt + 1 && tr.executor !== tx.executor && letter2.includes(EXTRA_BLOCK), `${re} ${tr.attempt} ${tr.executor} ${tx.executor} ${letter2.includes(EXTRA_BLOCK)}`)

// a label from the declaration at the moment of the letter; a field that is no longer declared stands as its id
settings({ task_extra_fields: [{ id: "ticket", label: "Тикет" }] })
const rl = review.reviewLetter(tasks.loadTask("proj", tx.n), core.loadConfig(proj))
cell("REQ-18 подпись: the label is taken from the declaration at the moment of the letter, an undeclared id stands as itself", rl.includes("  Тикет: NV-17") && rl.includes("  area: панель") && rl !== rletter, rl)
settings({ task_extra_fields: FIELDS })

// without values the texts are byte for byte the old ones: the letter of a task with extra, minus its block, equals the letter of the same task without extra
const withX = tasks.loadTask("proj", tx.n)
const plain = { ...withX }
delete plain.extra
const emptyX = { ...withX, extra: {} }
const fmt = core.formatTaskLetter
const strip = (s) => s.replace(`${EXTRA_BLOCK}\n`, "").replace(/ЗАПИСЬ ЗАДАЧИ: .*\n/, "")
cell(
  "AC-24 без extra: letters of a task without values (absent or empty extra) equal the letters with the block cut out and have no new line",
  fmt(plain) === fmt(emptyX) && fmt(plain) === strip(fmt(withX)) && review.reviewLetter(plain, cfg) === review.reviewLetter(emptyX, cfg) && review.reviewLetter(plain, cfg) === strip(review.reviewLetter(withX, cfg)) && !/ДОПОЛНИТЕЛЬНО|ЗАПИСЬ ЗАДАЧИ/.test(fmt(plain) + review.reviewLetter(plain, cfg)),
  "",
)

// the plan task (РП-11): the block is in planTaskLetter
reset()
const rp = await call("crew_spawn", { title: "план", goal: "исходная задача плана", kind: "plan", extra: { ticket: "NV-30" } })
const pt = all()[0]
const pl = await execLetter(pt)
cell("AC-24 план: the letter of a plan task has the block (РП-11), and crew_spawn of a plan took the value", started(rp) && !!pt?.plan && pl.includes("ДОПОЛНИТЕЛЬНО (поля проекта):\n  Номер тикета: NV-30") && /ЗАДАЧА-ПЛАН/.test(pl), rp + pl)

// REQ-24: an old record (no extra, no precheck) is read and shown as before
reset()
const old = tasks.createTask({ project: "proj", title: "старая", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "proj.integrator", qid: "qold", status: "running", kind: "spawn", directory: proj })
const raw = JSON.parse(readFileSync(tasks.taskFile("proj", old.n), "utf8"))
const noKeys = !("extra" in raw) && !("precheck" in raw)
const showOld = await call("crew_task", { action: "show", n: old.n })
const listOld = await call("crew_task", { action: "list" })
cell("REQ-24 old record: a record without extra is read, shown and listed as before, with no extra lines", noKeys && /^#\d+ P2 в работе/.test(showOld) && !/ДОПОЛНИТЕЛЬНО/.test(showOld + listOld) && fmt(tasks.loadTask("proj", old.n)) === strip(fmt(tasks.loadTask("proj", old.n))), showOld)

// ---- review-1, finding 2: a declared service name is not read from the prototype of the values object
reset()
settings({ task_extra_fields: [{ id: "constructor", label: "Ctor" }, { id: "__proto__", label: "Proto" }, { id: "a", label: "A" }] })
const protoCfg = core.loadConfig(proj)
const protoBlock = core.extraBlock({ directory: proj, extra: { a: "1" } })
cell("REQ-18 служебные имена: constructor and __proto__ are dropped from the declaration, the block prints only the own value", protoCfg.extraFields.map((f) => f.id).join() === "a" && protoBlock === "ДОПОЛНИТЕЛЬНО (поля проекта):\n  A: 1" &&!/Object|native code/.test(protoBlock), protoBlock + JSON.stringify(protoCfg.extraFields))
clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-landing-extra.test: FAIL ${fail}` : "crew-landing-extra.test ok")
process.exit(fail ? 1 : 0)

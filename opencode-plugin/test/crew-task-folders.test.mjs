// Self-test of task folders, task sessions and sub-tasks (task 058, node >= 24):  node test/crew-task-folders.test.mjs
// A project with task folders (tasks_dir, doc/tasks in the target branch): crew_spawn makes the folder NNN-<slug>/ on the task
// branch (task/message.md word for word, log.md with one dated line), committed by the plugin with a sign-off, the main copy
// untouched (AC-03); a task whose folder exists gets a record with its number and no folder commit, a number without a folder
// is refused (AC-04); sessions of a task are entries of its record: code, ordinal of the code, launch number, the launch lines
// in progress.log and log.md (AC-05); a session submits to the integrator, the plugin's review starts only after deliver
// (AC-06); a sub-task is a task of its own with the first line «Часть задачи NNN «…».» and a line in the parent's log.md
// (AC-07); a closed old record with the number of a folder moves unchanged to legacy/, an open one refuses (AC-10).
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-task-folders-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ root: "..", worktrees: "worktrees", worktree_name: "{repo}-{n}-{slug}", branch_name: "task/{n}-{slug}", cleanup: "local", allow_default_models: true, inflight_limit: 20, spawn_limits: { worker: 9, reviewer: 0 } }))
const folder = (name, files) => {
  for (const [f, text] of Object.entries(files)) {
    const p = path.join(proj, "doc", "tasks", name, f)
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, text)
  }
}
folder("013-old-runner", { "log.md": "2026-10-01 10:00 документ: задание заведено\n" })
folder("014-live-old", { "log.md": "2026-10-01 10:00 документ: задание заведено\n" })
folder("045-registry", { "task/message.md": "# Задание: Реестры контрактов\n\nтекст\n", "log.md": "2026-10-15 10:00 документ: задание заведено\n" })
folder("058-existing", { "task/message.md": "# Задание: Уже заведённая\n", "log.md": "2026-10-15 10:00 документ: задание заведено\n" })
git(proj, "init", "-q", "-b", "main")
git(proj, "config", "user.name", "Owner Test")
git(proj, "config", "user.email", "owner@test")
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")
const mainTip = git(proj, "rev-parse", "main")
const wtRoot = path.join(tmp, "worktrees")

// old records (before task 058): #13 closed, #14 open — numbers that now belong to folders 013 and 014
const store = path.join(tmp, "opencode", "crew-harness", "tasks", "proj")
mkdirSync(store, { recursive: true })
const oldRec = (n, status, title) => JSON.stringify({ project: "proj", n, title, slug: "old", goal: "g", priority: "P2", tier: "light", role: "worker", author: "sesOLD", author_role: "proj.integrator", qid: "qOld", status, kind: "spawn", executors: [], attempt: 1, directory: proj, history: [], created: 1, updated: 1 }, null, 1)
writeFileSync(path.join(store, "13.json"), oldRec(13, "done", "старая закрытая"))
writeFileSync(path.join(store, "14.json"), oldRec(14, "running", "живая старая"))
const hash = (f) => createHash("sha256").update(readFileSync(f)).digest("hex")
const hash13 = hash(path.join(store, "13.json"))
const hash14 = hash(path.join(store, "14.json"))

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const tools = {}
const hooks = {}
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
const task = (n) => tasks.loadTask("proj", n)
const read = (p) => {
  try {
    return readFileSync(p, "utf8")
  } catch {
    return ""
  }
}
const lettersTo = (to) => ["inbox", "read"].flatMap((d) => {
  try {
    const dir = path.join(core.BASE, d, to)
    return readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
  } catch {
    return []
  }
})
const records = () => readdirSync(store).filter((f) => /^\d+\.json$/.test(f)).length
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesINTEG1" } })
await call("crew_role", "sesINTEG1", { role: "integrator" })

// ---- AC-03: a new task — the folder on the task branch, the main copy untouched ----
const message = "# Задание: Страж повтора номера\n\nСлова владельца (владелец, 2026-10-15): «заводи».\n"
const a3 = await call("crew_spawn", "sesINTEG1", { title: "Страж повтора номера", goal: "страж ловит повтор номера папки", criteria: "красное правило", message })
await wait()
const t59 = task(59)
cell("AC-03: the new task takes 059 — after the largest folder (058)", !!t59 && /^doc\/tasks\/059-/.test(t59.folder ?? ""), JSON.stringify({ a3: a3.slice(0, 300), folder: t59?.folder }))
const br = t59?.branch ?? ""
cell("AC-03: the task branch is named with three digits (task/059-…)", /^task\/059-/.test(br), br)
const show = (p) => {
  try {
    return execFileSync("git", ["-C", proj, "show", `${br}:${p}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return undefined
  }
}
cell("AC-03: task/message.md on the task branch is the message word for word", !!t59 && show(`${t59.folder}/task/message.md`) === message, JSON.stringify(t59 && show(`${t59.folder}/task/message.md`)))
const log59 = (t59 && show(`${t59.folder}/log.md`)) ?? ""
cell("AC-03: log.md on the task branch has one dated document line", /^\d{4}-\d\d-\d\d \d\d:\d\d документ: задание заведено/.test(log59) && log59.trim().split("\n").length === 1, log59)
let msg59 = ""
try {
  msg59 = git(proj, "log", "-1", "--format=%B", br)
} catch {}
cell("AC-03: the plugin committed the folder with a sign-off and the message «Add task 059: <slug>»", /^Add task 059: \S+/.test(msg59) && /Signed-off-by: Owner Test <owner@test>/.test(msg59), msg59)
cell("AC-03: the main copy is not changed (status clean, main where it was)", git(proj, "status", "--porcelain") === "" && git(proj, "rev-parse", "main") === mainTip, git(proj, "status", "--porcelain"))
cell("AC-03: the answer names the task 059, its folder and its branch", /Задача 059 «Страж повтора номера» заведена: папка doc\/tasks\/059-/.test(a3) && a3.includes(br), a3)

// ---- AC-04: a folder that exists — a record with its number, no folder commit; a number without a folder — refused ----
const a4 = await call("crew_spawn", "sesINTEG1", { task: 58, goal: "сделать по task/message.md", criteria: "по заданию" })
await wait()
const t58 = task(58)
cell("AC-04: crew_spawn {task: 58} makes the record 58 of the folder 058-existing", !!t58 && t58.folder === "doc/tasks/058-existing", JSON.stringify({ a4: a4.slice(0, 300), folder: t58?.folder }))
let log58 = ""
try {
  log58 = git(proj, "log", "--all", "--format=%s")
} catch {}
cell("AC-04: no folder commit for 058", !/Add task 058/.test(log58), log58)
const before99 = records()
const a99 = await call("crew_spawn", "sesINTEG1", { task: 99, goal: "g", criteria: "c" })
cell("AC-04: crew_spawn {task: 99} without a folder is refused and makes no record", /99/.test(a99) && !task(99) && records() === before99, a99)

// ---- AC-05: sessions С4, С3п, С4 of the task 045 ----
const recs0 = records()
const s1 = await call("crew_spawn", "sesINTEG1", { task: 45, session: "С4", goal: "проверка плана, заход 1" })
await wait()
const s2 = await call("crew_spawn", "sesINTEG1", { task: 45, session: "С3п", goal: "правка плана по находкам С4-1" })
await wait()
const s3 = await call("crew_spawn", "sesINTEG1", { task: 45, session: "С4", goal: "проверка исправленного плана" })
await wait()
const t45 = task(45)
const ids = (t45?.sessions ?? []).map((s) => `${s.code}-${s.k} №${s.launch}`)
cell("AC-05: the sessions are С4-1 №1, С3п-1 №2, С4-2 №3 in the record of 045", JSON.stringify(ids) === JSON.stringify(["С4-1 №1", "С3п-1 №2", "С4-2 №3"]), JSON.stringify({ ids, s1: s1.slice(0, 200) }))
cell("AC-05: the answers name the sessions 045 С4-1, 045 С3п-1, 045 С4-2 with the launch number", s1.includes("045 С4-1") && s1.includes("запуск №1") && s2.includes("045 С3п-1") && s2.includes("запуск №2") && s3.includes("045 С4-2") && s3.includes("запуск №3"), JSON.stringify([s1, s2, s3].map((x) => x.slice(0, 160))))
cell("AC-05: one record for the task — no new records for the sessions", records() === recs0 + 1, `${records()} vs ${recs0 + 1}`)
// the launch lines: progress.log of the copies where the sessions work, log.md of the task
const copies = existsSync(wtRoot) ? readdirSync(wtRoot).map((d) => path.join(wtRoot, d, "doc", "tasks", "045-registry")) : []
const launches = copies.flatMap((d) => read(path.join(d, "progress.log")).split("\n").filter((l) => / 0\/0 \[\d{4}-\d\d-\d\d \d\d:\d\d\] запуск №\d+$/.test(l)))
cell("AC-05: three lines «<код> 0/0 [время] запуск №1…№3» in progress.log of the copies", JSON.stringify(launches.map((l) => l.replace(/ \[.*\] /, " ")).sort()) === JSON.stringify(["С3п 0/0 запуск №2", "С4 0/0 запуск №1", "С4 0/0 запуск №3"]), JSON.stringify(launches))
const taskTree = t45?.worktree ?? ""
const log45 = read(path.join(taskTree, "doc", "tasks", "045-registry", "log.md"))
const pusk = log45.split("\n").filter((l) => /^\d{4}-\d\d-\d\d \d\d:\d\d пуск: запуск №\d+ /.test(l))
cell("AC-05: three «пуск» lines in log.md of the task, each with the session ident", pusk.length === 3 && pusk[2].includes("045 С4-2"), log45)
cell("AC-05: the main copy is still clean", git(proj, "status", "--porcelain") === "", git(proj, "status", "--porcelain"))
// AC-08: the session title and the session letter name the task by its folder number and the session by code and ordinal
const sesC4 = t45?.sessions?.[2]
cell("AC-08: the session title is «045 С4-2 исп <task title>»", sessions.get(sesC4?.session)?.title === "045 С4-2 исп Реестры контрактов", sessions.get(sesC4?.session)?.title)
cell("AC-08: the executor session of a new task is titled «059 исп <title>»", sessions.get(task(59)?.sessions?.[0]?.session)?.title === "059 исп Страж повтора номера", sessions.get(task(59)?.sessions?.[0]?.session)?.title)
const letter = lettersTo(sesC4?.session ?? "-").find((l) => l.text.startsWith("ЗАДАЧА"))?.text ?? ""
cell("AC-08: the session letter: «ЗАДАЧА 045 «…», СЕССИЯ С4-2 (запуск №3)», the folder, the session goal, submit to the integrator", letter.startsWith("ЗАДАЧА 045 «Реестры контрактов», СЕССИЯ С4-2 (запуск №3) от proj.integrator, приоритет P2.") && letter.includes("ПАПКА ЗАДАЧИ: doc/tasks/045-registry/ — задание task/message.md, журнал log.md.") && letter.includes("ЦЕЛЬ СЕССИИ: проверка исправленного плана") && letter.includes('crew_task {action: "submit", n: 45'), letter)
cell("AC-05: a review session (С4) works in its own tree task/045-s4-2 from the task branch, an author session (С3п) in the task tree", sesC4?.place === "own" && sesC4?.branch === "task/045-s4-2" && t45?.sessions?.[1]?.place === "task" && sessions.get(sesC4?.session)?.location?.directory === sesC4?.worktree && sessions.get(t45?.sessions?.[1]?.session)?.location?.directory === t45?.worktree, JSON.stringify(t45?.sessions?.map((s) => [s.place, s.branch])))

// ---- AC-06: the session С4-2 submits to the integrator, deliver starts the review of the task ----
const cur = t45?.sessions?.[2]
const before = lettersTo("sesINTEG1").length
const sub = cur ? await call("crew_task", cur.session, { action: "submit", n: 45, text: "отчёт С4-2: замечаний 2" }) : "no session"
await wait()
const u45 = task(45)
cell("AC-06: the session is submitted, the task stays open and waits for the next session", u45?.sessions?.[2]?.status === "submitted" && u45?.status === "idle", JSON.stringify({ sub, s: u45?.sessions?.[2]?.status, st: u45?.status }))
cell("AC-06: no reviewer is appointed", !u45?.reviewer, String(u45?.reviewer))
cell("AC-06: log.md has «документ: С4-2 сдала: …»", /^\d{4}-\d\d-\d\d \d\d:\d\d документ: С4-2 сдала: отчёт С4-2/m.test(read(path.join(taskTree, "doc", "tasks", "045-registry", "log.md"))), read(path.join(taskTree, "doc", "tasks", "045-registry", "log.md")))
cell("AC-06: the integrator gets a letter with the report", lettersTo("sesINTEG1").length > before && lettersTo("sesINTEG1").some((l) => l.text.includes("отчёт С4-2")), JSON.stringify(lettersTo("sesINTEG1").map((l) => l.text.slice(0, 80))))
const dl = await call("crew_task", "sesINTEG1", { action: "deliver", n: 45, text: "задача готова к вливанию" })
await wait()
const d45 = task(45)
cell("AC-06: after deliver the task goes to the plugin's review as before", ["submitted", "reviewing"].includes(d45?.status) && d45?.report === "задача готова к вливанию", JSON.stringify({ dl, st: d45?.status }))

// ---- AC-07: a sub-task ----
const sp = await call("crew_spawn", "sesINTEG1", { part_of: 45, title: "Срочный страж", goal: "починить страж", criteria: "зелёный" })
await wait()
const t60 = task(60)
let msg60 = ""
try {
  msg60 = t60?.folder ? execFileSync("git", ["-C", proj, "show", `${t60.branch}:${t60.folder}/task/message.md`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) : ""
} catch {}
cell("AC-07: the sub-task is a task of its own: 060 with its folder", !!t60?.folder && /^doc\/tasks\/060-/.test(t60.folder) && t60.part_of === 45, JSON.stringify({ sp: sp.slice(0, 200), f: t60?.folder, p: t60?.part_of }))
cell("AC-07: the first line of its task/message.md is «Часть задачи 045 «…».»", msg60.split("\n")[0] === "Часть задачи 045 «Реестры контрактов».", msg60.split("\n")[0])
cell("AC-07: the parent lists it in parts and its log.md has a line about it", (task(45)?.parts ?? []).includes(60) && /документ: заведена подзадача 060 «Срочный страж»/.test(read(path.join(taskTree, "doc", "tasks", "045-registry", "log.md"))), JSON.stringify(task(45)?.parts))

// ---- AC-10: an old closed record #13 moves to legacy/ unchanged; an open one refuses ----
const a10 = await call("crew_spawn", "sesINTEG1", { task: 13, session: "С1", goal: "продолжение разбора" })
await wait()
const legacy = path.join(store, "legacy", "13.json")
cell("AC-10: the closed old record lies in legacy/13.json unchanged (hash)", existsSync(legacy) && hash(legacy) === hash13, JSON.stringify({ a10: a10.slice(0, 200), ex: existsSync(legacy) }))
cell("AC-10: the new record 13 has the folder and the session С1", task(13)?.folder === "doc/tasks/013-old-runner" && task(13)?.sessions?.[0]?.code === "С1", JSON.stringify(task(13)?.sessions))
const all = await call("crew_task", "sesINTEG1", { action: "list", all: true })
cell("AC-10: crew_task list all shows the old record", all.includes("старая закрытая"), all)
const a14 = await call("crew_spawn", "sesINTEG1", { task: 14, session: "С1", goal: "g" })
cell("AC-10: an open old record with the number refuses with its title", a14.includes("живая старая") && hash(path.join(store, "14.json")) === hash14 && !existsSync(path.join(store, "legacy", "14.json")), a14)

// REQ-10: reassign of a task with sessions — the same code with the next ordinal and a new launch number, the old one handed
const old13 = task(13)?.sessions?.[0]?.session
const ra = await call("crew_task", "sesINTEG1", { action: "reassign", n: 13, text: "уточнение: только разбор" })
await wait()
const r13 = task(13)
cell("REQ-10: reassign gives С1-2 with launch №2, С1-1 is handed", JSON.stringify((r13?.sessions ?? []).map((s) => `${s.code}-${s.k} №${s.launch} ${s.status}`)) === JSON.stringify(["С1-1 №1 handed", "С1-2 №2 running"]) && r13?.executor !== old13, JSON.stringify({ ra, s: r13?.sessions }))
const l13 = lettersTo(r13?.executor ?? "-").find((l) => l.text.startsWith("ЗАДАЧА"))?.text ?? ""
cell("REQ-10: the new session's letter carries the refinement (task 057) and its session ident", l13.includes("СЕССИЯ С1-2 (запуск №2)") && l13.includes("УТОЧНЕНИЕ ПРИ ПЕРЕДАЧЕ") && l13.includes("только разбор"), l13)

stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-task-folders.test: FAIL ${fail}` : "crew-task-folders.test ok")
process.exit(fail ? 1 : 0)

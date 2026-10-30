// Демонстрация задачи 264 «Корректное продолжение приёмки после смены full на small» (node >= 24):
//   node doc/tasks/264-korrektnoe-prodolzhenie-priemki-posle-sm/demo.mjs > doc/tasks/264-korrektnoe-prodolzhenie-priemki-posle-sm/demo.txt
// Изолированный контур: свой временный каталог данных (XDG_DATA_HOME) и свой временный git-репозиторий;
// живая система, настройки и настоящие задачи не затрагиваются. Печатает сценарий по шагам для чтения владельцем.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-264-demo-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
mkdirSync(path.join(proj, "doc", "tasks", "000-seed", "task"), { recursive: true })
writeFileSync(path.join(proj, "doc", "tasks", "000-seed", "task", "message.md"), "# Задание: Затравка\n\nтекст\n")
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ root: "..", worktrees: "worktrees", worktree_name: "{repo}-{n}-{slug}", branch_name: "task/{n}-{slug}", cleanup: "local", allow_default_models: true, inflight_limit: 30, spawn_limits: { worker: 20, reviewer: 0 } }))
git(proj, "init", "-q", "-b", "main")
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")

const PLUGIN = "../../../opencode-plugin"
const mod = await import(`${PLUGIN}/index.ts`)
const tasks = await import(`${PLUGIN}/tasks.ts`)
const core = await import(`${PLUGIN}/core.ts`)
const reviewMod = await import(`${PLUGIN}/review.ts`)
const tools = {}
const hooks = {}
const events = {}
const ctx = {
  location: { directory: tmp },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    create: async (req) => ({ id: req.id }),
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const store = () => path.join(tmp, "opencode", "crew-harness", "tasks", "proj")
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesINTEG1" } })
await call("crew_role", "sesINTEG1", { role: "integrator" })

const SWORD = "«сделай X мгновенно» (владелец, 2026-10-25, чат Методики)"
const out = (s = "") => console.log(s)
const status = (label, n) => {
  const t = tasks.loadTask("proj", n)
  out(`   → статус записи: ${t.status} · маршрут: ${t.route} · приёмщик: ${t.reviewer ?? "(нет)"}`)
  return t
}

out("Задача 264 «Корректное продолжение приёмки после смены full на small» — демонстрация на изолированном контуре.")
out("Сценарий: задача на полном маршруте ушла на приёмку (reviewing), владелец решает принять её по малому маршруту.")
out("До исправления в этом месте была блокировка: малый маршрут отклонял действия приёмки, а статус reviewing малому")
out("принятию не подходил — задача зависала. Ниже — поведение после исправления, шаг за шагом.")
out("")

out("ШАГ 1. Интегратор ставит задачу на полном маршруте, исполнитель сдаёт работу.")
await call("crew_spawn", "sesINTEG1", { title: "Демо смены маршрута", goal: "показать съём приёмки", criteria: "статусы меняются", owner_words: "- «покажи» (владелец, 2026-10-30, чат)", result: "нет: результат — код: proj/" })
const t1 = tasks.listTasks("proj").find((t) => t.title === "Демо смены маршрута")
await call("crew_task", t1.executor, { action: "submit", n: t1.n, text: "работа сдана: всё сделано" })
status("сдана", t1.n)
out("")

out("ШАГ 2. Приёмщик начинает приёмку — задача на приёмке (reviewing), полномочия у приёмщика.")
await hooks.context({ sessionID: "sesREV", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesREV" } })
const rec = tasks.loadTask("proj", t1.n)
rec.reviewer = "sesREV"
rec.review_kind = "tab"
rec.review_qid = `r${rec.qid}`
tasks.saveTask(rec)
const card = core.readJson(core.cardFile("sesREV")) ?? { session: "sesREV", role: "worker", auto: false, title: "прм", directory: proj, repo: "proj", project: "proj", pid: 1, updated: Date.now() }
card.review = { project: "proj", n: t1.n }
core.saveCard(card)
out(`   ${(await call("crew_task", "sesREV", { action: "review", n: t1.n })).split("\n")[0]}`)
status("на приёмке", t1.n)
out("")

out("ШАГ 3. Владелец решил принять по малому маршруту. Интегратор: crew_task route small с фразой владельца.")
out("   Цикл приёмки снимается штатно: полномочия приёмщика и замки сняты, задача снова читается сданной;")
out("   отчёт исполнителя, история и запись предпроверки сохранены. Смена маршрута — не принятие.")
out(`   ${(await call("crew_task", "sesINTEG1", { action: "route", n: t1.n, route: "small", route_word: SWORD, route_word_date: "2026-10-25" })).split("\n").join("\n   ")}`)
const a1 = status("после смены маршрута", t1.n)
out(`   приёмщик освобождён и записан в reviewers: ${JSON.stringify(a1.reviewers)}; отметка приёмки на визитке снята: ${!core.readJson(core.cardFile("sesREV"))?.review}`)
out("")

out("ШАГ 4. Попытка принять БЕЗ слова владельца — отказ (смена маршрута не принимает задачу):")
out(`   ${(await call("crew_task", "sesINTEG1", { action: "accept", n: t1.n, text: "" })).split("\n")[0]}`)
out("")

out("ШАГ 5. Принятие со словом владельца, но БЕЗ вливания ветки — отказ:")
out(`   ${(await call("crew_task", "sesINTEG1", { action: "accept", n: t1.n, text: "«проверил на контуре, принимаю» (владелец, 2026-10-30, чат)" })).split("\n")[0]}`)
out("")

out("ШАГ 6. Ветка влита, интегратор принимает по слову владельца — принято:")
git(proj, "merge", "--ff", a1.branch)
out(`   ${(await call("crew_task", "sesINTEG1", { action: "accept", n: t1.n, text: "«проверил на контуре, принимаю» (владелец, 2026-10-30, чат)" })).split("\n")[0]}`)
status("принята", t1.n)
out("")

out("ШАГ 7. Старая запись, переключённая на малый ДО исправления (small + reviewing, приёмщик, замок вливания,")
out("   активная сессия приёмки с контуром). Восстановление — штатный вызов интегратора БЕЗ новой фразы:")
out("   записанные фраза, дата, основа и время слова переиспользуются (норма контура не перевыпускается).")
const stuck = {
  project: "proj", n: 882, title: "Уже переключённая", slug: "uzhe-perekluchennaya", goal: "g", criteria: "c", priority: "P1", tier: "light", role: "worker",
  author: "sesINTEG1", author_role: "proj.integrator", qid: "q882", status: "reviewing", kind: "spawn", executor: "sesEX882", executors: [], attempt: 1, directory: proj,
  branch: "task/882-stuck", route: "small", route_basis: "фраза владельца 2026-10-25", route_source: "human", route_word: SWORD, route_word_date: "2026-10-25",
  route_word_ts: 1_700_000_000_000, route_word_ts_kind: "word", ceiling: 1, clean_runs: 1, probes: 3, delivery_compressed: false, clean_series: 0,
  reviewer: "sesREV882", review_kind: "spawn", review_letter: "review-proj-882-1", review_qid: "rq882", report: "отчёт исполнителя 882",
  history: [{ at: 1, by: "sesEX882", status: "submitted", note: "отчёт" }, { at: 2, by: "sesREV882", status: "reviewing", note: "приёмка начата" }], created: 1, updated: 1,
}
writeFileSync(path.join(store(), "882.json"), JSON.stringify(stuck, null, 1))
core.saveCard({ session: "sesREV882", role: "worker", auto: false, title: "прм 882", directory: proj, repo: "proj", project: "proj", review: { project: "proj", n: 882 }, spawned: { by: "sesINTEG1", task: "приёмка 882", tier: "light", status: "running", at: Date.now(), qid: "rq882" }, pid: 1, updated: Date.now() })
reviewMod.takeMergeLock("proj", "sesREV882", 882, false)
reviewMod.takePubLock("http://foreign.example/repo#main", "proj", "sesOTHER9", 999)
out(`   до: status=reviewing, reviewer=sesREV882, замок вливания у sesREV882, сессия приёмки running, чужой замок публикации у sesOTHER9`)
out(`   ${(await call("crew_task", "sesINTEG1", { action: "route", n: 882, route: "small" })).split("\n").join("\n   ")}`)
const s882 = status("после восстановления", 882)
out(`   фраза и время слова сохранены: route_word_ts=${s882.route_word_ts} (не перевыпущено), основа «${s882.route_basis}»`)
out(`   замок вливания задачи снят: ${reviewMod.mergeHolder("proj") === undefined}; чужой замок публикации цел: ${reviewMod.pubHolder("http://foreign.example/repo#main")?.session === "sesOTHER9"}`)
out(`   активная сессия приёмки НЕ прервана (контур жив): spawned=${core.readJson(core.cardFile("sesREV882"))?.spawned?.status}; не cancel и не accept: status=${s882.status}`)
reviewMod.releasePubLock("http://foreign.example/repo#main", "proj", "sesOTHER9", 999)
out("")

out("ШАГ 8. Запись малого маршрута БЕЗ слова владельца: повтор без новой фразы её не восполняет — отказ, запись не тронута:")
const noWord = { ...stuck, n: 883, branch: "task/883-noword", reviewer: undefined, review_kind: undefined, review_letter: undefined, review_qid: undefined }
delete noWord.route_word
delete noWord.route_word_date
delete noWord.route_word_ts
delete noWord.route_word_ts_kind
writeFileSync(path.join(store(), "883.json"), JSON.stringify(noWord, null, 1))
out(`   ${(await call("crew_task", "sesINTEG1", { action: "route", n: 883, route: "small" })).split("\n")[0]}`)
const s883 = tasks.loadTask("proj", 883)
out(`   запись не изменилась: status=${s883.status}, слова по-прежнему нет, история не тронута (${s883.history.length} строки)`)
out("")

out("ИТОГ: блокировка снята — смена полного маршрута на малый на приёмке продолжается штатно до принятия по слову")
out("владельца; старые застрявшие записи восстанавливаются явным вызовом интегратора без новой фразы; без слова")
out("владельца и без вливания принятие по-прежнему невозможно; чужие замки и активные сессии приёмки не затрагиваются.")

stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
process.exit(0)

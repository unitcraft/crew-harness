// Self-test of the route of a task (task 092, node >= 24):  node test/crew-task-route.test.mjs
// The methodology (task-runner-states.md «Маршруты», «Инварианты маршрута», «Проверки реализации»; task-runner.md «Параметры маршрута») makes the
// route of a task DATA: «full» or «fast», with the numbers of the cycle (ceiling, clean runs in a row, probes in a clean run). The plugin does the
// part that needs no runner: the data in the task record, the check of the brief of the fast path, the rule of decision 51 as data (an edit of the
// brief after the word of the owner marks the record), the display and the line of the journal. The gate В14, the copy of the brief and the return to
// the full path are the engine of the product, not the plugin.
// Tests of the methodology that this file covers (the data side only): 3 (first part), 4, 9, 10, 14, 15, 19, 21 and 23 (the data part), 22.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-task-route-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const BASE = { root: "..", worktrees: "worktrees", worktree_name: "{repo}-{n}-{slug}", branch_name: "task/{n}-{slug}", cleanup: "local", allow_default_models: true, inflight_limit: 30, spawn_limits: { worker: 20, reviewer: 0 } }
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
mkdirSync(path.join(proj, "doc", "tasks", "045-registry", "task"), { recursive: true })
writeFileSync(path.join(proj, "doc", "tasks", "045-registry", "task", "message.md"), "# Задание: Реестры контрактов\n\nтекст\n")
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify(BASE))
git(proj, "init", "-q", "-b", "main")
git(proj, "config", "user.name", "Owner Test")
git(proj, "config", "user.email", "owner@test")
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")
const settings = (extra = {}) => writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ ...BASE, ...extra }))

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
// the red probe runs before the code: a missing module is red cells, not a crash
const route = await import("../route.ts").catch(() => ({}))
const need = (name) => route[name] ?? (() => { throw new Error(`route.ts has no ${name}`) })
const safe = (fn, dflt) => { try { return fn() } catch (e) { return dflt ?? `THROW ${e?.message ?? e}` } }

// ---- the numbers: methodology defaults and minimums (tests 4, 3) ----
const numFull = safe(() => need("numbersFor")("full"))
const numFast = safe(() => need("numbersFor")("fast"))
cell("T92-1 defaults of the full path: ceiling 4, clean runs 2, probes 3, delivery not compressed", numFull?.ceiling === 4 && numFull?.clean_runs === 2 && numFull?.probes === 3 && numFull?.delivery_compressed === false, JSON.stringify(numFull))
cell("T92-1 defaults of the fast path: ceiling 2, clean runs 1, probes 3, delivery not compressed", numFast?.ceiling === 2 && numFast?.clean_runs === 1 && numFast?.probes === 3 && numFast?.delivery_compressed === false, JSON.stringify(numFast))
const nf = (o) => safe(() => need("numberFaults")(o), ["THROW"])
cell("T92-2 (test 4) the edges of the minimum: clean_runs 1 and probes 3 pass", Array.isArray(nf({ clean_runs: 1, probes: 3 })) && nf({ clean_runs: 1, probes: 3 }).length === 0, JSON.stringify(nf({ clean_runs: 1, probes: 3 })))
cell("T92-2 (test 4) clean_runs 0 is refused, the reason names clean_runs", nf({ clean_runs: 0 }).length === 1 && /clean_runs/.test(nf({ clean_runs: 0 })[0]), JSON.stringify(nf({ clean_runs: 0 })))
cell("T92-2 (test 4) probes 2 is refused, the reason names probes", nf({ probes: 2 }).length === 1 && /probes/.test(nf({ probes: 2 })[0]), JSON.stringify(nf({ probes: 2 })))
cell("T92-2 (test 4) a ceiling of any positive value passes", nf({ ceiling: 1 }).length === 0 && nf({ ceiling: 50 }).length === 0, JSON.stringify([nf({ ceiling: 1 }), nf({ ceiling: 50 })]))
cell("T92-2 (test 3) a non-empty list of weakenings is refused with its names", nf({ weakenings: ["probes"] }).length === 1 && /probes/.test(nf({ weakenings: ["probes"] })[0]) && nf({ weakenings: [] }).length === 0, JSON.stringify(nf({ weakenings: ["probes"] })))
cell("T92-2 a number that is not an integer is refused", /clean_runs/.test(nf({ clean_runs: 1.5 })[0] ?? "") && /probes/.test(nf({ probes: "3" })[0] ?? ""), JSON.stringify([nf({ clean_runs: 1.5 }), nf({ probes: "3" })]))

// ---- the old record: no fields -> the full path (test 14) ----
const old = { project: "proj", n: 1, title: "старая", status: "running", history: [] }
const rv = safe(() => need("routeView")(old))
cell("T92-3 (test 14) a record without route reads as full, source rule, the basis «задача начата до введения маршрутов»", rv?.route === "full" && rv?.source === "rule" && rv?.basis === "задача начата до введения маршрутов" && rv?.legacy === true, JSON.stringify(rv))
cell("T92-3 (test 14) its numbers are the full path's: 4, 2, 3", rv?.ceiling === 4 && rv?.clean_runs === 2 && rv?.probes === 3, JSON.stringify(rv))
cell("T92-3 reading does not write into the record", !("route" in old), JSON.stringify(old))
const rv2 = safe(() => need("routeView")({ ...old, route: "fast", route_source: "human", route_basis: "b", ceiling: 2, clean_runs: 1, probes: 3 }))
cell("T92-3 a record with the fast route reads as fast with its own numbers and is not legacy", rv2?.route === "fast" && rv2?.legacy === false && rv2?.source === "human" && rv2?.clean_runs === 1, JSON.stringify(rv2))

// ---- the request of the cycle check refuses numbers under the minimum (test 19) ----
const ci = (t) => safe(() => need("cycleInput")(t), { ok: "THROW" })
cell("T92-4 (test 19) the cycle input of a fast record carries the numbers of the record", ci({ ...old, route: "fast", ceiling: 2, clean_runs: 1, probes: 3 }).ok === true && ci({ ...old, route: "fast", ceiling: 2, clean_runs: 1, probes: 3 }).clean_runs === 1, JSON.stringify(ci({ ...old, route: "fast", ceiling: 2, clean_runs: 1, probes: 3 })))
cell("T92-4 (test 19) clean_runs 0 in a record: the request is refused, the cycle does not start", ci({ ...old, route: "fast", ceiling: 2, clean_runs: 0, probes: 3 }).ok === false && /clean_runs/.test(ci({ ...old, route: "fast", ceiling: 2, clean_runs: 0, probes: 3 }).reason ?? ""), JSON.stringify(ci({ ...old, route: "fast", clean_runs: 0 })))
cell("T92-4 (test 19) probes 2 in a record: refused", ci({ ...old, route: "full", ceiling: 4, clean_runs: 2, probes: 2 }).ok === false, JSON.stringify(ci({ ...old, probes: 2 })))
cell("T92-4 (test 14) the cycle input of an old record is the full path's numbers", ci(old).ok === true && ci(old).ceiling === 4 && ci(old).clean_runs === 2, JSON.stringify(ci(old)))

// ---- the features and the rule of the choice (tests 9, 10) ----
const FEAT = (over = {}) => {
  const f = { "Цель": "поправить текст", "Источников": "1", "Частей системы": "1", "Риск": "низкий", "Необратимо": "нет", "Причина известна": "да", "Касается нормы или формата": "нет", ...over }
  return "## Признаки маршрута\n\n" + Object.entries(f).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n"
}
const MSG0 = "# Задание: Т\n\n## Чего хочет владелец\n\n- «x» (владелец, 2026-10-18)\n\n"
const classify = (msg, th) => safe(() => need("classify")(need("parseFeatures")(msg), th ?? need("DEFAULT_THRESHOLDS")), { proposal: "THROW" })
const c0 = classify(MSG0)
cell("T92-5 (test 9) no section of features: full, «признаки не записаны», source rule", c0.proposal === "full" && c0.basis === "признаки не записаны" && c0.source === "rule", JSON.stringify(c0))
for (const [what, over, name] of [["goal", { "Цель": null }, "цель"], ["sources", { "Источников": null }, "источников"], ["parts", { "Частей системы": null }, "частей"], ["risk not estimated", { "Риск": "не оценён" }, "риск"], ["irreversibility", { "Необратимо": null }, "необратимо"], ["cause known", { "Причина известна": "может быть" }, "причина"], ["norm", { "Касается нормы или формата": null }, "норм"]]) {
  const c = classify(MSG0 + FEAT(over))
  cell(`T92-5 (test 9) feature missing (${what}): full, the basis says «признаки неполны» and names it`, c.proposal === "full" && c.source === "rule" && /признаки неполны/.test(c.basis ?? "") && new RegExp(name).test(c.basis ?? ""), JSON.stringify(c))
}
const cin = classify(MSG0 + FEAT())
cell("T92-6 (test 10) all features within the thresholds: fast, source rule", cin.proposal === "fast" && cin.source === "rule" && /в пределах/.test(cin.basis ?? ""), JSON.stringify(cin))
const cEq = classify(MSG0 + FEAT({ "Источников": "3", "Частей системы": "2" }))
cell("T92-6 (test 10) sources equal to the threshold (3) and parts equal (2): still fast", cEq.proposal === "fast", JSON.stringify(cEq))
const cS = classify(MSG0 + FEAT({ "Источников": "4" }))
cell("T92-6 (test 10) sources threshold + 1: full, «признак выходит за порог: число_источников»", cS.proposal === "full" && cS.basis === "признак выходит за порог: число_источников", JSON.stringify(cS))
const cP = classify(MSG0 + FEAT({ "Частей системы": "3" }))
cell("T92-6 (test 10) parts threshold + 1: full, names число_частей", cP.proposal === "full" && /число_частей/.test(cP.basis ?? ""), JSON.stringify(cP))
cell("T92-6 (test 10) risk above the permitted (medium): full, names риск", classify(MSG0 + FEAT({ "Риск": "средний" })).proposal === "full" && /риск/.test(classify(MSG0 + FEAT({ "Риск": "средний" })).basis ?? ""), "")
cell("T92-6 (test 10) irreversible «да»: full", classify(MSG0 + FEAT({ "Необратимо": "да" })).proposal === "full", "")
cell("T92-6 (test 10) cause known «нет»: full", classify(MSG0 + FEAT({ "Причина известна": "нет" })).proposal === "full", "")
cell("T92-6 (test 10) touches the norm «да»: full", classify(MSG0 + FEAT({ "Касается нормы или формата": "да" })).proposal === "full", "")
const cMany = classify(MSG0 + FEAT({ "Источников": "9", "Необратимо": "да" }))
cell("T92-6 (test 10) several features over: the basis names all of them", /число_источников/.test(cMany.basis ?? "") && /необратимо/.test(cMany.basis ?? ""), JSON.stringify(cMany))
const cH1 = classify(MSG0 + FEAT({ "Источников": "4", "Предложение помощника": "быстрый" }))
cell("T92-7 (test 10) the helper proposes fast with a feature over the threshold: full by the rule", cH1.proposal === "full" && cH1.source === "rule", JSON.stringify(cH1))
const cH2 = classify(MSG0 + FEAT({ "Предложение помощника": "полный" }))
cell("T92-7 (test 10) the helper proposes full with the features within: full, source helper", cH2.proposal === "full" && cH2.source === "helper", JSON.stringify(cH2))
const cH3 = classify(MSG0 + FEAT({ "Предложение помощника": "быстрый" }))
cell("T92-7 (test 10) the helper proposes fast with the features within: fast, the rule rechecks", cH3.proposal === "fast" && cH3.source === "rule", JSON.stringify(cH3))
const cT = classify(MSG0 + FEAT({ "Источников": "4" }), { max_sources: 5, max_parts: 2, max_risk: "low" })
cell("T92-7 the thresholds are the project's: sources 4 under max_sources 5 is fast", cT.proposal === "fast", JSON.stringify(cT))
const cR = classify(MSG0 + FEAT({ "Риск": "средний" }), { max_sources: 3, max_parts: 2, max_risk: "medium" })
cell("T92-7 the permitted risk is the project's: medium under max_risk medium is fast", cR.proposal === "fast", JSON.stringify(cR))
const feat = safe(() => need("parseFeatures")(MSG0 + FEAT({ "Перечень источников": "README.md, core.ts; tasks.ts" })))
cell("T92-7 the list of sources of the features is read as a list of strings", JSON.stringify(feat?.sources_list) === JSON.stringify(["README.md", "core.ts", "tasks.ts"]), JSON.stringify(feat))

// ---- the check of the brief and of the word (test 22) ----
const GOOD = "# Задание: Г\n\nЗаказчик: владелец.\nРепозиторий: proj, ветка main. Дата задания: 2026-10-18.\n\n## Критерии приёмки\n\n1. тест зелёный\n\n## Связи\n\nнет: одна\n"
const bf = (t) => safe(() => need("briefFaults")(t), ["THROW"])
cell("T92-8 (test 22) a complete brief has no fault (the project's form «Репозиторий: …, ветка …»)", bf(GOOD).length === 0, JSON.stringify(bf(GOOD)))
cell("T92-8 (test 22) the line «Ветка: x» of the methodology is accepted too", bf(GOOD.replace("Репозиторий: proj, ветка main.", "Ветка: task/093-x")).length === 0, JSON.stringify(bf(GOOD.replace("Репозиторий: proj, ветка main.", "Ветка: task/093-x"))))
cell("T92-8 (test 22) a bullet or AC-N item counts as a point of the criteria", bf(GOOD.replace("1. тест зелёный", "- тест зелёный")).length === 0 && bf(GOOD.replace("1. тест зелёный", "AC-1 тест зелёный")).length === 0, "")
cell("T92-8 (test 22) no point in «Критерии приёмки»: a fault naming the criteria", bf(GOOD.replace("1. тест зелёный", "нет: критериев пока нет")).some((f) => /критери/.test(f)), JSON.stringify(bf(GOOD.replace("1. тест зелёный", "нет: критериев пока нет"))))
cell("T92-8 (test 22) no section of the criteria: a fault", bf(GOOD.replace("## Критерии приёмки\n\n1. тест зелёный\n\n", "")).some((f) => /критери/.test(f)), "")
cell("T92-8 (test 22) no branch line: a fault naming the branch", bf(GOOD.replace("Репозиторий: proj, ветка main.", "Репозиторий: proj.")).some((f) => /ветк/.test(f)), JSON.stringify(bf(GOOD.replace("Репозиторий: proj, ветка main.", "Репозиторий: proj."))))
cell("T92-8 (test 22) no brief at all: a fault", bf(undefined).length > 0 && bf("").length > 0 && !bf("").includes("THROW"), JSON.stringify(bf(undefined)))
const wf = (w, d) => safe(() => need("wordFaults")(w, d), ["THROW"])
cell("T92-9 (test 22) a word with «заводи» and a date: no fault", wf("«заводи 093» (владелец, 2026-10-18, чат)", "2026-10-18").length === 0, JSON.stringify(wf("«заводи 093» (владелец, 2026-10-18, чат)", "2026-10-18")))
cell("T92-9 (test 22) the word «Заводи» in any case passes", wf("«Заводи 093» (владелец, 2026-10-18, чат)", "2026-10-18").length === 0, "")
cell("T92-9 (test 22) an empty word is a fault", wf("", "2026-10-18").length > 0 && wf("   ", "2026-10-18").length > 0 && !wf("", "2026-10-18").includes("THROW"), "")
cell("T92-9 (test 22) a word without «заводи» is a fault", wf("«делай» (владелец, 2026-10-18, чат)", "2026-10-18").some((f) => /заводи/.test(f)), JSON.stringify(wf("«делай» (владелец, 2026-10-18, чат)", "2026-10-18")))
cell("T92-9 (test 22) an empty date is a fault; so is a date that is not ГГГГ-ММ-ДД", wf("«заводи 093» (владелец, чат)", "").some((f) => /дат/.test(f)) && wf("«заводи 093» (владелец, чат)", "18 октября").some((f) => /дат/.test(f)), "")

// ---- the hash and the rule of decision 51 as data (tests 21, 23) ----
const hash = (t) => safe(() => need("messageHash")(t), "THROW")
cell("T92-10 (tests 21, 23) the hash of the brief ignores the line ends of Windows and differs with the text", hash("a\nb\n") === hash("a\r\nb\r\n") && hash("a\nb\n") !== hash("a\nc\n") && /^[0-9a-f]{16,}$/.test(hash("a")), `${hash("a\nb\n")} ${hash("a")}`)
const fastRec = () => ({ project: "proj", n: 2, title: "t", status: "running", route: "fast", route_word: "«заводи 2»", route_message_hash: hash(GOOD), clean_series: 1, clean_runs: 1, ceiling: 2, probes: 3, history: [{ at: 1, by: "x", note: "поставлена" }] })
const ms = (t, text, now = 5) => safe(() => need("markStale")(t, text, now), "THROW")
const r1 = fastRec()
cell("T92-10 the brief unchanged: no mark", ms(r1, GOOD) === false && !r1.route_word_stale, JSON.stringify(r1))
cell("T92-10 the brief that cannot be read: no mark (nothing is known)", ms(r1, undefined) === false && !r1.route_word_stale, JSON.stringify(r1))
cell("T92-10 (tests 21, 23) the brief edited after the word: the record is marked route_word_stale, the series of clean runs is zeroed", ms(r1, GOOD + "\n- ещё\n") === true && r1.route_word_stale === true && r1.clean_series === 0, JSON.stringify(r1))
cell("T92-10 (test 23) the required number clean_runs, the ceiling and the trace stay; the event is in the history", r1.clean_runs === 1 && r1.ceiling === 2 && r1.history.length === 2 && /слова завода/.test(r1.history[1].note ?? ""), JSON.stringify(r1))
cell("T92-10 a second check does not mark twice", ms(r1, GOOD + "\n- ещё\n") === false && r1.history.length === 2, JSON.stringify(r1))
const r2 = { ...fastRec(), route: "full" }
cell("T92-10 a record of the full route is never marked", ms(r2, GOOD + "x") === false && !r2.route_word_stale, "")
cell("T92-10 an old record without route is never marked", ms({ ...old, route_message_hash: hash(GOOD) }, "x") === false, "")

// ---- the settings: route_defaults ----
const rs = (raw) => safe(() => need("routeSettingsOf")(raw), { full: {}, fast: {}, thresholds: {} })
const dflt = rs(undefined)
cell("T92-11 no route_defaults: the values of the methodology (full 4/2/3, fast 2/1/3, thresholds 3, 2, low)", dflt.full?.ceiling === 4 && dflt.full?.clean_runs === 2 && dflt.fast?.ceiling === 2 && dflt.fast?.clean_runs === 1 && dflt.fast?.probes === 3 && dflt.thresholds?.max_sources === 3 && dflt.thresholds?.max_parts === 2 && dflt.thresholds?.max_risk === "low", JSON.stringify(dflt))
const own = rs({ fast: { ceiling: 3, clean_runs: 2 }, thresholds: { max_sources: 5 } })
cell("T92-11 the project's values override the methodology's one by one, the rest stays", own.fast?.ceiling === 3 && own.fast?.clean_runs === 2 && own.fast?.probes === 3 && own.thresholds?.max_sources === 5 && own.thresholds?.max_parts === 2 && own.full?.ceiling === 4, JSON.stringify(own))
const schema = await import("../config-schema.ts")
const k = schema.SCHEMA.find((s) => s.key === "route_defaults")
cell("T92-11 route_defaults is in the schema with a question and a reason", !!k && !!k.question && !!k.why, JSON.stringify(k))
cell("T92-11 the schema accepts the shape and refuses a wrong one", schema.invalid("route_defaults", { full: { ceiling: 5 }, fast: { clean_runs: 1, delivery_compressed: true, weakenings: [] }, thresholds: { max_sources: 4, max_parts: 2, max_risk: "medium" } }) === undefined && !!schema.invalid("route_defaults", { fast: { clean_runs: "x" } }) && !!schema.invalid("route_defaults", { speedy: {} }) && !!schema.invalid("route_defaults", { thresholds: { max_risk: "huge" } }) && !!schema.invalid("route_defaults", []), JSON.stringify(schema.invalid("route_defaults", { fast: { clean_runs: "x" } })))
cell("T92-11 the schema lets a value under the minimum be written (it is refused at the choice of the route, test 3)", schema.invalid("route_defaults", { fast: { clean_runs: 0, probes: 2 } }) === undefined, String(schema.invalid("route_defaults", { fast: { clean_runs: 0, probes: 2 } })))
cell("T92-11 the field names of the input are reserved against the extra fields of a project", ["route", "route_basis", "route_source", "route_proposal", "route_word", "route_word_date", "clean_runs", "ceiling", "probes", "delivery_compressed", "sources_list"].every((f) => schema.RESERVED_FIELD_IDS.includes(f)), JSON.stringify(schema.RESERVED_FIELD_IDS))

// ---- the tools ----
const mod = await import("../index.ts")
const tasks = await import("../tasks.ts")
const core = await import("../core.ts")
const { briefFaults, exactMessageHash, legacyTaskLetterFaults } = await import("../route.ts")
const legacyFixture = JSON.parse(readFileSync(new URL("./legacy-task-letter-092.fixture.json", import.meta.url), "utf8"))
cell("T133 format-derived Nova 092 legacy letter is recognized only against its target identity", legacyTaskLetterFaults(legacyFixture.text, legacyFixture.expected).length === 0, legacyFixture.provenance)
cell("T133 the format-derived counterexample remains RED under modern brief validation", briefFaults(legacyFixture.text).length === 2, JSON.stringify(briefFaults(legacyFixture.text)))
cell("T133 the same legacy letter rejects another number", legacyTaskLetterFaults(legacyFixture.text, { ...legacyFixture.expected, n: 93 }).length > 0, "")
cell("T133 missing acceptance criteria are rejected", legacyTaskLetterFaults(legacyFixture.text.replace(/^КРИТЕРИИ ПРИЁМКИ:.*\n/m, ""), legacyFixture.expected).some((x) => /критериев/.test(x)), "")
const status = await import("../status.ts")
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
const wait = (ms = 50) => new Promise((r) => setTimeout(r, ms))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const store = () => path.join(tmp, "opencode", "crew-harness", "tasks", "proj")
await hooks.context({ sessionID: "sesINTEG1", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesINTEG1" } })
await call("crew_role", "sesINTEG1", { role: "integrator" })
const recs = () => tasks.listTasks("proj").length
const branches = () => git(proj, "branch", "--list", "task/*").split("\n").filter(Boolean).length
const show = (t) => (t.branch ? (f) => git(proj, "show", `${t.branch}:${t.folder}/${f}`) : () => "")
// the journal as it is now: the plugin appends to log.md in the worktree of the task (not committed), the first lines are on the branch
const logNow = (t) => {
  const f = t.worktree ? path.join(t.worktree, ...t.folder.split("/"), "log.md") : ""
  return f && existsSync(f) ? readFileSync(f, "utf8") : show(t)("log.md")
}

const WORD = "«заводи 093» (владелец, 2026-10-18, чат оркестратора)"
const DATE = "2026-10-18"
const owner = "- «поправь текст» (владелец, 2026-10-18, чат оркестратора)"
const section = (name, body) => `## ${name}\n\n${body}\n`
const fastMessage = (title, over = {}) => [
  `# Задание: ${title}`, "", "Заказчик: владелец.", over.repo ?? "Репозиторий: proj, ветка main. Дата задания: 2026-10-18.", "Источник: чат.", "",
  section("Чего хочет владелец", owner), section("Что нужно", "1. поправить текст"), section("Критерии приёмки", over.criteria ?? "1. тест зелёный\n2. текст поправлен"),
  section("Результат и куда он попадает", "нет: результат — код: proj/"), section("Связи", "нет: одна задача"), section("Границы", "- чужое не трогать"),
  over.features === null ? "" : (over.features ?? FEAT({ "Перечень источников": "README.md, core.ts" })),
].join("\n")
const base = { goal: "поправить текст", criteria: "тест зелёный", owner_words: owner, result: "нет: результат — код: proj/" }
const spawn = (title, extra = {}) => call("crew_spawn", "sesINTEG1", { ...base, title, ...extra })

// ---- the default: the full path ----
const a0 = await spawn("Обычная задача")
const t0 = tasks.listTasks("proj").find((t) => t.title === "Обычная задача")
cell("T92-12 a task without route is made on the full path with the numbers of the methodology", !!t0 && t0.route === "full" && t0.ceiling === 4 && t0.clean_runs === 2 && t0.probes === 3 && t0.delivery_compressed === false && t0.route_source === "rule", JSON.stringify({ a0: a0.slice(0, 200), t0: t0 && { r: t0.route, c: t0.ceiling, cr: t0.clean_runs, p: t0.probes, s: t0.route_source } }))
cell("T92-12 the full path has no word of the owner and is not marked", !t0?.route_word && !t0?.route_word_stale, JSON.stringify(t0))
const log0 = t0 ? show(t0)("log.md") : ""
cell("T92-12 the journal of a full task has no fast-route line", !/маршрут: быстрый/.test(log0), log0)

// ---- the refusals of the fast path (test 22): no record, no branch, the text says what is needed ----
const n0 = recs(), b0 = branches()
const fast = (title, extra = {}) => spawn(title, { route: "fast", message: fastMessage(title), route_word: WORD, route_word_date: DATE, ...extra })
const rNoWord = await fast("Без слова", { route_word: undefined })
cell("T92-13 (test 22) fast without the word of the owner: «быстрый путь требует» and the word", /быстрый путь требует/.test(rNoWord) && /слов/.test(rNoWord) && /заводи/.test(rNoWord), rNoWord)
const rWrongWord = await fast("Не то слово", { route_word: "«делай» (владелец, 2026-10-18, чат)" })
cell("T92-13 (test 22) a word without «заводи»: refused with the reason", /быстрый путь требует/.test(rWrongWord) && /заводи/.test(rWrongWord), rWrongWord)
const rNoDate = await fast("Без даты слова", { route_word: "«заводи 093» (владелец, чат)", route_word_date: undefined })
cell("T92-13 (test 22) no date of the word: refused naming the date", /быстрый путь требует/.test(rNoDate) && /дат/.test(rNoDate), rNoDate)
const rNoCrit = await fast("Без критериев", { message: fastMessage("Без критериев", { criteria: "нет: критериев пока нет" }) })
cell("T92-13 (test 22) no point in the criteria of the brief: refused naming the criteria", /быстрый путь требует/.test(rNoCrit) && /критери/.test(rNoCrit), rNoCrit)
const rNoBranch = await fast("Без ветки", { message: fastMessage("Без ветки", { repo: "Репозиторий: proj. Дата задания: 2026-10-18." }) })
cell("T92-13 (test 22) no branch line in the brief: refused naming the branch", /быстрый путь требует/.test(rNoBranch) && /ветк/.test(rNoBranch), rNoBranch)
const rSrc = await fast("Чужой источник", { route_source: "rule" })
cell("T92-13 the fast path is chosen by the word of a human: another source is refused", /быстрый путь требует/.test(rSrc) && /human|человек/.test(rSrc), rSrc)
cell("T92-13 the refusals make no record and no task branch; the route stays full (nothing is started)", recs() === n0 && branches() === b0, `${recs()} vs ${n0}; ${branches()} vs ${b0}`)
const rBadRoute = await spawn("Не тот маршрут", { route: "turbo" })
cell("T92-13 a route other than full or fast is refused", /route/.test(rBadRoute) && recs() === n0, rBadRoute)

// ---- numbers under the minimum are refused on both routes ----
const rCR = await fast("Чистых ноль", { clean_runs: 0 })
cell("T92-14 (tests 3, 4) fast with clean_runs 0: refused, the reason names clean_runs and the minimum", /clean_runs/.test(rCR) && /минимум/.test(rCR) && recs() === n0, rCR)
const rPr = await fast("Проб две", { probes: 2 })
cell("T92-14 (tests 3, 4) fast with probes 2: refused", /probes/.test(rPr) && /минимум/.test(rPr) && recs() === n0, rPr)
const rFullPr = await spawn("Полный, проб две", { probes: 2 })
cell("T92-14 (tests 3, 4) full with probes 2: refused too (the minimum is of the methodology, not of a route)", /probes/.test(rFullPr) && recs() === n0, rFullPr)
const rBadType = await fast("Строка вместо числа", { clean_runs: "1" })
cell("T92-14 a value that is not a number is refused", /clean_runs/.test(rBadType) && recs() === n0, rBadType)

// ---- the fast path made (data, line of the journal) ----
const rOk = await fast("Быстрая правка")
const tf = tasks.listTasks("proj").find((t) => t.title === "Быстрая правка")
cell("T92-15 fast with the conditions: the task is made", !!tf?.folder && tf?.route === "fast" && /заведена/.test(rOk), rOk)
cell("T92-15 the record: route fast, source human, the basis, the word word for word with the date", tf?.route === "fast" && tf?.route_source === "human" && !!tf?.route_basis && tf?.route_word === WORD && tf?.route_word_date === DATE, JSON.stringify(tf && { r: tf.route, s: tf.route_source, b: tf.route_basis, w: tf.route_word, d: tf.route_word_date }))
cell("T92-15 the record: the numbers of the fast path (ceiling 2, clean runs 1, probes 3), delivery not compressed, series 0", tf?.ceiling === 2 && tf?.clean_runs === 1 && tf?.probes === 3 && tf?.delivery_compressed === false && (tf?.clean_series ?? 0) === 0, JSON.stringify(tf && { c: tf.ceiling, cr: tf.clean_runs, p: tf.probes, d: tf.delivery_compressed, s: tf.clean_series }))
cell("T92-15 the record: the proposal of the rule (features within the thresholds: fast) and the list of sources", tf?.route_proposal === "fast" && JSON.stringify(tf?.sources_list) === JSON.stringify(["README.md", "core.ts"]), JSON.stringify(tf && { p: tf.route_proposal, s: tf.sources_list }))
cell("T92-15 the record keeps the hash of the brief as it was committed", typeof tf?.route_message_hash === "string" && tf.route_message_hash === hash(tf ? show(tf)("task/message.md") : ""), JSON.stringify(tf?.route_message_hash))
const logF = tf ? show(tf)("log.md") : ""
cell("T92-15 (test 15) the journal of the task: a line «маршрут: быстрый» with the basis, the source and the word", /\d{4}-\d\d-\d\d \d\d:\d\d документ: маршрут: быстрый/.test(logF) && /основание: /.test(logF) && /источник: человек/.test(logF) && logF.includes(WORD), logF)
cell("T92-15 (test 15) the route is not in the envelope: the history of the record has no route field, the note is a line", (tf?.history ?? []).every((h) => !("route" in h)), JSON.stringify(tf?.history))
// the proposal of the rule is full but the human chose fast: allowed, the proposal stays what the rule said
const rHuman = await fast("Человек вопреки правилу", { message: fastMessage("Человек вопреки правилу", { features: FEAT({ "Источников": "9" }) }) })
const th = tasks.listTasks("proj").find((t) => t.title === "Человек вопреки правилу")
cell("T92-15 (test 10) the human chooses fast against the proposal «full»: route fast, source human, proposal full", th?.route === "fast" && th?.route_source === "human" && th?.route_proposal === "full", JSON.stringify(th && { r: th.route, s: th.route_source, p: th.route_proposal }) + rHuman.slice(0, 200))
const rNoFeat = await fast("Без признаков", { message: fastMessage("Без признаков", { features: null }) })
const tn = tasks.listTasks("proj").find((t) => t.title === "Без признаков")
cell("T92-15 (test 9) no section of features: the task is made (the word decides), the proposal recorded is full", tn?.route === "fast" && tn?.route_proposal === "full", JSON.stringify(tn && { r: tn.route, p: tn.route_proposal }) + rNoFeat.slice(0, 200))
// raising a number above the method's value is allowed
const rUp = await fast("Больше чистых", { clean_runs: 3, ceiling: 5, delivery_compressed: true, message: fastMessage("Больше чистых") })
const tu = tasks.listTasks("proj").find((t) => t.title === "Больше чистых")
cell("T92-15 the numbers of the input may be raised: clean_runs 3, ceiling 5, delivery_compressed true", tu?.clean_runs === 3 && tu?.ceiling === 5 && tu?.delivery_compressed === true, JSON.stringify(tu && { c: tu.clean_runs, ce: tu.ceiling, d: tu.delivery_compressed }) + rUp.slice(0, 200))
// the fast path with the brief built from the fields: the template carries the project's form «Репозиторий: …, ветка …»
const rTpl = await spawn("Из полей", { route: "fast", route_word: WORD, route_word_date: DATE })
const tt = tasks.listTasks("proj").find((t) => t.title === "Из полей")
cell("T92-15 the fast path with the brief built from the fields (the criteria field is a line, the template has the branch)", tt?.route === "fast" && tt?.route_word === WORD, rTpl.slice(0, 300))

// ---- the settings of the project (test 3, first part): fast refused, full goes on; full refused too ----
settings({ route_defaults: { fast: { clean_runs: 0 } } })
await wait(50)
const nA = recs()
const rSetFast = await fast("Настройка быстрого")
cell("T92-16 (test 3) the fast numbers of the project under the minimum: fast refused with the reason, nothing is made", /быстрый путь требует/.test(rSetFast) && /route_defaults/.test(rSetFast) && /clean_runs/.test(rSetFast) && recs() === nA, rSetFast)
const rSetFull = await spawn("Полный при плохом быстром")
cell("T92-16 the same settings do not touch the full path", !!tasks.listTasks("proj").find((t) => t.title === "Полный при плохом быстром")?.folder, rSetFull)
settings({ route_defaults: { fast: { weakenings: ["probes"] } } })
await wait(50)
const rWeak = await fast("Ослабление")
cell("T92-16 (test 3) a non-empty list of weakenings: fast refused naming the weakening", /быстрый путь требует/.test(rWeak) && /probes/.test(rWeak), rWeak)
settings({ route_defaults: { full: { probes: 2 } } })
await wait(50)
const nB = recs()
const rSetFull2 = await spawn("Плохой полный")
cell("T92-16 (test 3) the full numbers of the project under the minimum: the task is not made (no safer route), the text says why", /route_defaults/.test(rSetFull2) && /probes/.test(rSetFull2) && recs() === nB, rSetFull2)
settings({ route_defaults: { fast: { ceiling: 3, clean_runs: 2 }, full: { ceiling: 6 }, thresholds: { max_sources: 5 } } })
await wait(50)
const cfg = core.loadConfig(proj)
cell("T92-16 loadConfig reads route_defaults over the methodology's values", cfg.routeDefaults?.fast?.ceiling === 3 && cfg.routeDefaults?.fast?.clean_runs === 2 && cfg.routeDefaults?.full?.ceiling === 6 && cfg.routeDefaults?.thresholds?.max_sources === 5, JSON.stringify(cfg.routeDefaults))
const rSet = await fast("Свои числа", { message: fastMessage("Свои числа") })
const ts = tasks.listTasks("proj").find((t) => t.title === "Свои числа")
cell("T92-16 a task made under the project's values takes them", ts?.ceiling === 3 && ts?.clean_runs === 2 && ts?.probes === 3, JSON.stringify(ts && { c: ts.ceiling, cr: ts.clean_runs }) + rSet.slice(0, 200))
const tsFull = await spawn("Полный со своими числами")
cell("T92-16 the full task takes the project's full ceiling", tasks.listTasks("proj").find((t) => t.title === "Полный со своими числами")?.ceiling === 6, tsFull.slice(0, 200))
settings({})
await wait(50)

// ---- an old record read as is (test 14) ----
const oldRec = { project: "proj", n: 880, title: "Старая запись", slug: "staraya", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: "sesINTEG1", author_role: "proj.integrator", qid: "qold", status: "running", kind: "spawn", executor: "sesOLD", executors: [], attempt: 1, directory: proj, history: [{ at: 1, by: "x", note: "поставлена" }], created: 1, updated: 1 }
writeFileSync(path.join(store(), "880.json"), JSON.stringify(oldRec, null, 1))
const showOld = await call("crew_task", "sesINTEG1", { action: "show", n: 880 })
const loaded = tasks.loadTask("proj", 880)
cell("T92-17 (test 14) an old record is read without change: no route field appears, show works and does not call it fast", loaded && !("route" in loaded) && /Старая запись/.test(showOld) && !/быстр/.test(showOld), showOld)
cell("T92-17 (test 14) the file of an old record is not rewritten by reading it", !("route" in JSON.parse(readFileSync(path.join(store(), "880.json"), "utf8"))), "")

// ---- explicit, in-place migration of a folderless legacy record ----
const migrationBrief = `ЗАДАЧА #881 «Старая задача» от proj.integrator (сессия sesINTEG1), приоритет P1.\nЦЕЛЬ: Сохранить задачу\nКРИТЕРИИ ПРИЁМКИ: Проверить результат без реконструкции\nГРАНИЦЫ (не делаем): не создавать вторую запись\nWORKTREE ГОТОВ: эта сессия уже работает в <TMP>/legacy, ветка task/092-legacy (создал плагин от целевой ветки). Правь и коммить здесь; другой worktree не создавай.\nСДЕЛАНО ПРЕЖНИМ ИСПОЛНИТЕЛЕМ (задача передана тебе):\nпроверен старый формат письма.`
const legacyMigration = {
  project: "proj", n: 881, title: "Старая задача", slug: "staraya-zadacha", goal: "Сохранить задачу", criteria: "Проверить результат",
  priority: "P1", tier: "medium", role: "worker", author: "sesINTEG1", author_role: "proj.integrator", qid: "q881",
  status: "running", kind: "spawn", executor: "sesLEGACY881", executors: ["sesOLD"], attempt: 3, directory: proj,
  branch: "task/092-legacy", worktree: path.join(tmp, "legacy-worktree"), rework: 2, syncs: 1,
  sessions: [{ code: "С4", k: 2, launch: 4, session: "sesMETHOD881", status: "submitted", place: "task", started: 10, ended: 20 }],
  precheck: { state: "stale", base: "sha-base", at: 1, by: "sesREVIEW", round: 3, candidate: "sha-candidate", result: "FAIL", lock_on: { tip: "sha-lock-tip", at: 1 }, stale: { reason: "old result", at: 2 } },
  kept: [{ path: "evidence.txt", at: 4, by: "sesREVIEW" }], side: [{ branch: "evidence-branch", worktree: "evidence-tree", at: 5, by: "sesOLD" }],
  history: [{ at: 1, by: "sesOLD", status: "running", note: "legacy history" }], created: 1, updated: 1,
}
writeFileSync(path.join(store(), "881.json"), JSON.stringify(legacyMigration, null, 1))
const migrationWord = "«заводи 881 на fast» (владелец, 2026-10-20, чат)"
const migrate = (n, over = {}) => {
  const input = { action: "migrate", n, message: migrationBrief, source_id: "task-proj-881-3", source_session: "sesINTEG1", source_to: "sesLEGACY881", source_qid: "q881", route_word: migrationWord, route_word_date: "2026-10-20", ...over }
  input.source_sha256 ??= exactMessageHash(input.message)
  return call("crew_task", "sesINTEG1", input)
}
const beforeMigrateRecords = recs()
const noMigrationWord = await migrate(881, { route_word: undefined, route_word_date: undefined })
cell("T129 migration without the owner's word is refused and leaves the task untouched", /отдельное слово владельца должно прямо называть задачу 881/.test(noMigrationWord) && !tasks.loadTask("proj", 881).route && recs() === beforeMigrateRecords, noMigrationWord)
const badMigrationBrief = await migrate(881, { message: "# неполная постановка" })
cell("T133 an incomplete legacy letter is refused before writing", /письмо не распознано/.test(badMigrationBrief) && !tasks.loadTask("proj", 881).route, badMigrationBrief)
const wrongProject = await migrate(881, { message: migrationBrief.replace("proj.integrator", "nova.integrator") })
cell("T133 a legacy letter for another project is refused", /не совпадает с project\/task\/title/.test(wrongProject) && !tasks.loadTask("proj", 881).route, wrongProject)
const wrongBranch = await migrate(881, { message: migrationBrief.replace("task/092-legacy", "task/other") })
cell("T133 a different legacy branch is refused", /не совпадает с веткой/.test(wrongBranch) && !tasks.loadTask("proj", 881).route, wrongBranch)
const wrongSource = await migrate(881, { source_session: "sesOTHER" })
cell("T133 archived sender metadata must match the letter author", /from_session архива/.test(wrongSource) && !tasks.loadTask("proj", 881).route, wrongSource)
const wrongRecipient = await migrate(881, { source_to: "sesOTHER" })
cell("T133 archived recipient must match the existing executor", /to текущего исполнителя/.test(wrongRecipient) && !tasks.loadTask("proj", 881).route, wrongRecipient)
const wrongQid = await migrate(881, { source_qid: "qOTHER" })
cell("T133 archived qid must match the existing task", /qid задачи/.test(wrongQid) && !tasks.loadTask("proj", 881).route, wrongQid)
const wrongDigest = await migrate(881, { source_sha256: "0".repeat(64) })
cell("T133 a missing or mismatched archive digest refuses before writing", /SHA256 точного UTF-8 text/.test(wrongDigest) && !tasks.loadTask("proj", 881).route, wrongDigest)
const wrongMigrationNumber = await migrate(881, { route_word: "«заводи 092» (владелец, 2026-10-20, чат)" })
cell("T129 a word for a different task number is refused", /должно прямо называть задачу 881/.test(wrongMigrationNumber) && !tasks.loadTask("proj", 881).route, wrongMigrationNumber)
const migratedReply = await migrate(881)
const migrated = tasks.loadTask("proj", 881)
cell("T129 migration succeeds in place without allocating a second task number", /переведена на fast/.test(migratedReply) && migrated.route === "fast" && recs() === beforeMigrateRecords, migratedReply)
cell("T129 migration preserves identity, attempt, sessions, rounds, branch/worktree and prior history", migrated.qid === legacyMigration.qid && migrated.executor === legacyMigration.executor && migrated.attempt === legacyMigration.attempt && migrated.sessions?.[0]?.session === "sesMETHOD881" && migrated.rework === 2 && migrated.syncs === 1 && migrated.branch === legacyMigration.branch && migrated.worktree === legacyMigration.worktree && migrated.history[0].note === "legacy history", JSON.stringify(migrated))
cell("T133 migration hashes the exact original legacy letter, not its validation projection", migrated.route_message_hash === exactMessageHash(migrationBrief), migrated.route_message_hash)
cell("T129 migration preserves precheck FAIL/stale/lock and evidence rather than converting or releasing them", migrated.precheck?.result === "FAIL" && migrated.precheck?.state === "stale" && migrated.precheck?.lock_on?.tip === "sha-lock-tip" && migrated.kept?.[0]?.path === "evidence.txt" && migrated.side?.[0]?.branch === "evidence-branch", JSON.stringify({ precheck: migrated.precheck, kept: migrated.kept, side: migrated.side }))
const repeatMigration = await migrate(881)
cell("T129 a repeated migration safely refuses without changing history", /повторная миграция запрещена/.test(repeatMigration) && tasks.loadTask("proj", 881).history.length === migrated.history.length, repeatMigration)

// ---- the show: the word of the route (list, show) ----
const listed = await call("crew_task", "sesINTEG1", { action: "list" })
const fastRow = listed.split("\n").find((l) => l.includes("Быстрая правка")) ?? ""
const fullRow = listed.split("\n").find((l) => l.includes("Обычная задача")) ?? ""
cell("T92-18 crew_task list: the fast task has the word «быстрый», the full one has none", /быстрый/.test(fastRow) && !/быстр/.test(fullRow), listed)
const showF = await call("crew_task", "sesINTEG1", { action: "show", n: tf.n })
cell("T92-18 crew_task show: the route line with the source, the basis and the word of the owner", /маршрут: быстрый/.test(showF) && /человек/.test(showF) && showF.includes(WORD), showF)
cell("T92-18 crew_task show: no warning while the brief is unchanged", !/постановка изменена/.test(showF), showF)

// ---- decision 51: the brief edited after the word (tests 21, 23) ----
const editBrief = (t, fn) => {
  const tree = t.worktree && existsSync(path.join(t.worktree, ...t.folder.split("/"), "task", "message.md")) ? t.worktree : undefined
  if (tree) {
    const f = path.join(tree, ...t.folder.split("/"), "task", "message.md")
    writeFileSync(f, fn(readFileSync(f, "utf8")))
    return "tree"
  }
  const tmpTree = path.join(tmp, `edit-${t.n}`)
  git(proj, "worktree", "add", "-q", tmpTree, t.branch)
  const f = path.join(tmpTree, ...t.folder.split("/"), "task", "message.md")
  writeFileSync(f, fn(readFileSync(f, "utf8")))
  git(tmpTree, "commit", "-q", "-a", "-m", "edit the brief")
  git(proj, "worktree", "remove", "--force", tmpTree)
  return "branch"
}
const rec1 = tasks.loadTask("proj", tf.n)
rec1.clean_series = 1
tasks.saveTask(rec1)
const hist0 = rec1.history.length
const where = editBrief(tasks.loadTask("proj", tf.n), (s) => s.replace("1. поправить текст", "1. поправить текст\n2. и ещё один пункт"))
const showStale = await call("crew_task", "sesINTEG1", { action: "show", n: tf.n })
const tfs = tasks.loadTask("proj", tf.n)
cell("T92-19 (tests 21, 23) the brief edited after the word: show prints the warning in the owner's words", /постановка изменена после слова завода: нужно новое слово владельца/.test(showStale), `${where}: ${showStale}`)
cell("T92-19 (tests 21, 23) the record is marked route_word_stale and the series of clean runs is zeroed", tfs.route_word_stale === true && tfs.clean_series === 0, JSON.stringify({ s: tfs.route_word_stale, c: tfs.clean_series }))
cell("T92-19 (test 23) the numbers, the word and the trace stay: clean_runs 1, ceiling 2, the word, all earlier history", tfs.clean_runs === 1 && tfs.ceiling === 2 && tfs.route_word === WORD && tfs.history.length === hist0 + 1 && /слова завода/.test(tfs.history.at(-1).note ?? ""), JSON.stringify({ c: tfs.clean_runs, h: tfs.history.length, h0: hist0 }))
cell("T92-19 the journal of the task has the line about the edit after the word", /документ: постановка изменена после слова завода/.test(logNow(tfs)), logNow(tfs))
const showStale2 = await call("crew_task", "sesINTEG1", { action: "show", n: tf.n })
cell("T92-19 the warning stays while the word is not renewed; the event is written once", /постановка изменена после слова завода/.test(showStale2) && tasks.loadTask("proj", tf.n).history.length === hist0 + 1, `${tasks.loadTask("proj", tf.n).history.length} vs ${hist0 + 1}`)
const listStale = await call("crew_task", "sesINTEG1", { action: "list" })
cell("T92-19 crew_task list also warns about the task", /постановка изменена после слова завода/.test(listStale), listStale)
const stepStale = await call("crew_task", "sesINTEG1", { action: "priority", n: tf.n, priority: "P1" })
cell("T92-19 a next step of crew_task (priority) carries the warning too", /постановка изменена после слова завода/.test(stepStale), stepStale)
const fullRec = tasks.loadTask("proj", t0.n)
editBrief(fullRec, (s) => s + "\nправка\n")
const showFull = await call("crew_task", "sesINTEG1", { action: "show", n: t0.n })
cell("T92-19 the same edit of a full-route task gives no warning and no mark", !/постановка изменена/.test(showFull) && !tasks.loadTask("proj", t0.n).route_word_stale, showFull)

// ---- the display in /crew and in the panel ----
const cardOf = (t) => ({ session: `sesW${t.n}`, role: "worker", auto: false, task: { project: "proj", n: t.n }, title: `${String(t.n).padStart(3, "0")} исп ${t.title}`, directory: proj, repo: "proj", project: "proj", pid: 1, updated: Date.now() })
const stOf = (t) => status.statusOf({ card: cardOf(t), busy: true, busySince: Date.now() - 60_000, asked: [], now: Date.now(), watches: [] })
const sF = stOf(tasks.loadTask("proj", tf.n))
const sFull = stOf(tasks.loadTask("proj", t0.n))
const fresh = tasks.loadTask("proj", th.n)
const sFresh = stOf(fresh)
const now = Date.now()
const crew = status.formatStatuses([sF, sFull, sFresh], now, "proj")
const crewLines = crew.split("\n")
const fastTitle = crewLines.find((l) => l.includes("Быстрая правка")) ?? ""
cell("T92-20 /crew: the stale fast task shows the word «быстрый» on the line of its title", /быстрый/.test(fastTitle), crew)
cell("T92-20 /crew: and the warning line under it", crewLines.some((l) => /⚠ постановка изменена после слова завода: нужно новое слово владельца/.test(l)), crew)
cell("T92-20 /crew: the full task has no route word and no warning", !/быстр/.test(crewLines.find((l) => l.includes("Обычная задача")) ?? ""), crew)
const freshTitle = crewLines.find((l) => l.includes("Человек вопреки правилу")) ?? ""
cell("T92-20 /crew: a fast task with an unchanged brief shows the word but no warning", /быстрый/.test(freshTitle) && crewLines.filter((l) => /постановка изменена/.test(l)).length === 1, crew)
const side = status.sidebarLines([sF, sFull, sFresh], now, "proj").rows.map((r) => status.sideText(r))
cell("T92-20 the panel: the fast task has the mark of the route, the full one has none", side.some((l) => /быстр/.test(l)) && !side.some((l) => /Обычная.*быстр/.test(l)), JSON.stringify(side))
cell("T92-20 the panel: the warning row", side.some((l) => /⚠.*слова завода/.test(l)), JSON.stringify(side))
cell("T92-20 the panel: every row fits 32 columns", side.every((l) => l.length <= 32), JSON.stringify(side.filter((l) => l.length > 32)))

// ---- renew the word, return to the full path (only by a record) ----
const rRoute0 = await call("crew_task", "sesINTEG1", { action: "route", n: tf.n, route: "full" })
cell("T92-21 the change to the full path needs a reason in text", /причин|text/.test(rRoute0) && tasks.loadTask("proj", tf.n).route === "fast", rRoute0)
const rRenew0 = await call("crew_task", "sesINTEG1", { action: "route", n: tf.n, route: "fast", route_word: "«делай» (владелец, 2026-10-18, чат)", route_word_date: DATE })
cell("T92-21 a new word without «заводи» does not renew the word", /быстрый путь требует/.test(rRenew0) && tasks.loadTask("proj", tf.n).route_word_stale === true, rRenew0)
const word2 = "«заводи 093 заново» (владелец, 2026-10-19, чат оркестратора)"
const rRenew = await call("crew_task", "sesINTEG1", { action: "route", n: tf.n, route: "fast", route_word: word2, route_word_date: "2026-10-19" })
const tfr = tasks.loadTask("proj", tf.n)
cell("T92-21 (test 23) the new word of the owner renews the record: no mark, the new word and date, the new hash of the edited brief", tfr.route_word === word2 && tfr.route_word_date === "2026-10-19" && !tfr.route_word_stale && tfr.route_message_hash !== tf.route_message_hash, rRenew + JSON.stringify(tfr.route_word_stale))
cell("T92-21 after the renewal the warning is gone (the history still tells the earlier edit) and the series start from zero", !/⚠.*постановка изменена/.test(await call("crew_task", "sesINTEG1", { action: "show", n: tf.n })) && (tfr.clean_series ?? 0) === 0, "")
cell("T92-21 the renewal is a line of the journal of the task and an event in the history", /заводи 093 заново/.test(logNow(tfr)) && /слово/.test(tfr.history.at(-1).note ?? ""), logNow(tfr))
const rFull = await call("crew_task", "sesINTEG1", { action: "route", n: tf.n, route: "full", text: "задача оказалась шире, чем казалось" })
const tfull = tasks.loadTask("proj", tf.n)
cell("T92-21 the change to the full path by a record with a reason: route full, the word emptied, series zeroed", tfull.route === "full" && !tfull.route_word && !tfull.route_word_stale && (tfull.clean_series ?? 0) === 0 && tfull.clean_runs === 2 && tfull.ceiling === 4, rFull + JSON.stringify({ r: tfull.route, w: tfull.route_word, cr: tfull.clean_runs, c: tfull.ceiling }))
cell("T92-21 the reason, the source human and the trace are kept (history grows, nothing is cut)", /шире/.test(tfull.route_basis ?? "") && tfull.route_source === "human" && tfull.history.length > tfr.history.length, JSON.stringify({ b: tfull.route_basis, s: tfull.route_source }))
cell("T92-21 the journal of the task has the line of the change", /документ: маршрут: полный/.test(logNow(tfull)) && /шире/.test(logNow(tfull)), logNow(tfull))
const rNoInt = await call("crew_task", "sesINTEG1", { action: "route", n: t0.n, route: "fast", route_word: WORD, route_word_date: DATE })
cell("T92-21 a full task becomes fast only with the conditions of the fast path (its brief has criteria without a list: refused with the reason)", /быстрый путь требует|маршрут/.test(rNoInt), rNoInt)

// ---- other doors: assign takes no route; the texts name the route; the README has the section ----
await hooks.context({ sessionID: "sesTAB2", system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: "sesTAB2" } })
const nAs = recs()
const rAssign = await call("crew_task", "sesINTEG1", { action: "assign", session: "sesTAB2", title: "Ручная", goal: "сделать", criteria: "готово", owner_words: owner, result: "нет: результат — код: proj/", route: "fast" })
cell("T92-22 assign takes no route: refused with the way (crew_spawn), no record", /не поставлена/.test(rAssign) && /crew_spawn/.test(rAssign) && recs() === nAs, rAssign)
const rOpen = await call("crew_spawn", "sesINTEG1", { task: String(tf.n), session: "С4", goal: "проверка", route: "fast" })
cell("T92-22 a session of an open task takes no route: refused, the way is crew_task route", /не запущена/.test(rOpen) && /crew_task/.test(rOpen) && /route/.test(rOpen), rOpen)
const rPlan = await call("crew_spawn", "sesINTEG1", { kind: "plan", goal: "что-то спланировать", route: "fast" })
cell("T92-22 a plan task takes no route", /не поставлена/.test(rPlan) && /план/.test(rPlan), rPlan)
const help = await call("crew_help", "sesINTEG1")
cell("T92-22 the help and the tool texts name the route, the word and the minimums", /route: "fast"/.test(help) && /route_word_stale/.test(help) && /route_word/.test(tools.crew_spawn.description) && /route/.test(tools.crew_task.description) && !!tools.crew_spawn.input.properties.route && !!tools.crew_task.input.properties.route && tools.crew_task.input.properties.action.enum.includes("route"), "")
cell("T133 the tool exposes legacy migration and archive identity/digest inputs", /migrate/.test(tools.crew_task.description) && tools.crew_task.input.properties.action.enum.includes("migrate") && !!tools.crew_task.input.properties.message && !!tools.crew_task.input.properties.source_id && !!tools.crew_task.input.properties.source_session && !!tools.crew_task.input.properties.source_to && !!tools.crew_task.input.properties.source_qid && !!tools.crew_task.input.properties.source_sha256 && !!tools.crew_task.input.properties.route_word && !!tools.crew_task.input.properties.route_word_date, "")
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8")
cell("T92-22 the README has the section «Маршрут задачи» with the table of the terms and route_defaults", /Маршрут задачи/.test(readme) && /\| слово_завода \| `route_word` \|/.test(readme) && /route_defaults/.test(readme) && /clean_series/.test(readme), "")
cell("T129 the README gives Nova the exact migration command and warns not to invent the owner's word", /Folderless legacy → fast/.test(readme) && /action: "migrate"/.test(readme) && /infer a missing owner word/i.test(readme), "")

stop?.()
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-task-route.test: FAIL ${fail}` : "crew-task-route.test ok")
process.exit(fail ? 1 : 0)

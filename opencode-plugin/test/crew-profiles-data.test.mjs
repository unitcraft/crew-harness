// Self-test of the profile data module (task 003; node >= 24):  node test/crew-profiles-data.test.mjs
// Pure data, no files: stages and words, the value checks of the three settings keys (model_profiles, profile_sets,
// profile_set), the family of a tab model by the table, the schema keys.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-profiles-data-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"

const P = await import("../profiles.ts")
const schema = await import("../config-schema.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const bad = (key, v, opts) => P.invalidProfileKey(key, v, opts)
const GOOD_PROFILES = {
  claude: { heavy: { model: "claude-code/opus", context: 720000, output: 64000 }, medium: { model: "claude-code/sonnet", context: 720000, output: 64000 }, light: { model: "claude-code/haiku", context: 220000, output: 32000 } },
  kimi: { heavy: { model: "kimi-code-plan-global/k3-256k", context: 220000, output: 131072 } },
  codex: { heavy: { model: "openai/gpt-5.5", context: 525000, input: 461000, output: 128000 } },
}
const GOOD_SETS = { default: { develop: { family: "claude", tier: "task" } }, "cross-kimi": { accept: { family: "kimi", tier: "heavy" } } }

// AC-12: every rule has a red side and a green side
cell("AC-12 green: a correct table passes", bad("model_profiles", GOOD_PROFILES) === undefined, String(bad("model_profiles", GOOD_PROFILES)))
cell("AC-12 green: correct sets pass", bad("profile_sets", GOOD_SETS) === undefined, String(bad("profile_sets", GOOD_SETS)))
cell("AC-12 green: a correct set name passes", bad("profile_set", "cross-kimi") === undefined, String(bad("profile_set", "cross-kimi")))
const withProfile = (p, fam = "claude", tier = "heavy") => ({ [fam]: { [tier]: p } })
const ok = { model: "claude-code/opus", context: 100, output: 10 }
for (const [label, p] of [
  ["model without a slash", { ...ok, model: "opus" }],
  ["model with a space", { ...ok, model: "claude-code/o pus" }],
  ["context zero", { ...ok, context: 0 }],
  ["context fractional", { ...ok, context: 1.5 }],
  ["context a string", { ...ok, context: "100" }],
  ["output zero", { ...ok, output: 0 }],
  ["output missing (OpenCode drops the whole record without it)", { model: "claude-code/opus", context: 100 }],
  ["input larger than context", { ...ok, input: 200 }],
  ["unknown field", { ...ok, extra: 1 }],
]) cell(`AC-12 red: ${label}`, !!bad("model_profiles", withProfile(p)), "accepted")
for (const [label, v] of [
  ["family with a capital", withProfile(ok, "Claude")],
  ["family with a space", withProfile(ok, "my family")],
  ["family all", withProfile(ok, "all")],
  ["family context", withProfile(ok, "context")],
  ["family output", withProfile(ok, "output")],
  ["family input", withProfile(ok, "input")],
  ["unknown tier", withProfile(ok, "claude", "ultra")],
]) cell(`AC-12 red: ${label}`, !!bad("model_profiles", v), "accepted")
cell("AC-12 green: the placeholder record {model: ''} passes", bad("model_profiles", withProfile({ model: "" })) === undefined, String(bad("model_profiles", withProfile({ model: "" }))))
cell("AC-12 green: a record with input and a placeholder without fields", bad("model_profiles", { codex: { heavy: { model: "openai/x", context: 10, input: 8, output: 3 } } }) === undefined, "rejected")
for (const name of ["Cross", "cross kimi", "кросс", "-cross", "x".repeat(41), ...P.RESERVED_WORDS])
  cell(`AC-12 red: set name «${name.length > 20 ? name.slice(0, 8) + "…" : name}»`, !!bad("profile_sets", { [name]: {} }) && !!bad("profile_set", name), "accepted")
cell("AC-12 green: a 40-character name and digits pass", bad("profile_sets", { ["a".repeat(40)]: {}, "7-up": {} }) === undefined, String(bad("profile_sets", { ["a".repeat(40)]: {} })))
cell("AC-12 red: unknown stage in a set", !!bad("profile_sets", { a: { coordination: { family: "claude", tier: "heavy" } } }), "accepted")
cell("DNC-09 green: the reader may ignore an unknown stage (lenient)", bad("profile_sets", { a: { coordination: { family: "claude", tier: "heavy" } } }, { lenientStages: true }) === undefined, "rejected")
cell("AC-12 red: cell tier not in heavy/medium/light/task", !!bad("profile_sets", { a: { develop: { family: "claude", tier: "huge" } } }), "accepted")
cell("AC-12 red: unknown key inside a cell is always a refusal", !!bad("profile_sets", { a: { develop: { family: "claude", tier: "heavy", x: 1 } } }, { lenientStages: true }), "accepted")
cell("AC-12 red: a cell as a string", !!bad("profile_sets", { a: { develop: "claude/heavy" } }), "accepted")
cell("AC-12 red: profile_set not a string", !!bad("profile_set", 5), "accepted")
cell("AC-12 red: model_profiles an array", !!bad("model_profiles", []), "accepted")

// AC-34: output is required, input is optional and only valid when it is not above context
cell("AC-34 a record with three fields is accepted", bad("model_profiles", { codex: { heavy: { model: "openai/gpt-5.5", context: 525000, input: 461000, output: 128000 } } }) === undefined, "rejected")
cell("AC-34 a record without output is refused with the reason", /output/.test(String(bad("model_profiles", withProfile({ model: "a/b", context: 10 })))), String(bad("model_profiles", withProfile({ model: "a/b", context: 10 }))))

// words of stages: Russian only in commands
cell("stage words: Russian names map to the file stages", P.stageOfWord("разработка") === "develop" && P.stageOfWord("приёмка") === "accept" && P.stageOfWord("приемка") === "accept" && P.stageOfWord("планирование") === "plan" && P.stageOfWord("приёмка-плана") === "plan_accept" && P.stageOfWord("приемка-плана") === "plan_accept", "mapping")
cell("stage words: an unknown word is not a stage", P.stageOfWord("coordination") === undefined, "mapped")
cell("stage of launch: executor/reviewer, plain/plan task", P.stageOfLaunch({}, "executor") === "develop" && P.stageOfLaunch({ plan: {} }, "executor") === "plan" && P.stageOfLaunch({}, "reviewer") === "accept" && P.stageOfLaunch({ plan: {} }, "reviewer") === "plan_accept", "mapping")

// empty record and the cell text
cell("empty record: {model: ''} is empty, a full one is not, no context counts as empty", P.isEmptyProfile({ model: "" }) && !P.isEmptyProfile(ok) && P.isEmptyProfile({ model: "", context: 0 }), "wrong")
cell("cell text round trip and refusals", JSON.stringify(P.parseCell("kimi/task")) === JSON.stringify({ family: "kimi", tier: "task" }) && typeof P.parseCell("kimi") === "string" && typeof P.parseCell("kimi/ultra") === "string" && typeof P.parseCell("all/heavy") === "string", JSON.stringify([P.parseCell("kimi"), P.parseCell("all/heavy")]))

// REQ-14: family of a tab model, whole «provider/id», variant dropped, case ignored
const profiles = { ...GOOD_PROFILES, codex: { heavy: { model: "openai/gpt-5.5", context: 1, output: 1 }, medium: { model: "openai/gpt-5.6-terra", context: 1, output: 1 }, light: { model: "openai/gpt-6-luna", context: 1, output: 1 } } }
cell("family of a tab: exact model", P.familyOfModel("openai/gpt-5.5", profiles) === "codex" && P.familyOfModel("claude-code/sonnet", profiles) === "claude", "wrong")
cell("family of a tab: variant after # is dropped, case ignored", P.familyOfModel("OpenAI/GPT-5.5#high", profiles) === "codex", String(P.familyOfModel("OpenAI/GPT-5.5#high", profiles)))
cell("family of a tab: gpt-5.5-fast is another model (no substring match)", P.familyOfModel("openai/gpt-5.5-fast", profiles) === undefined, String(P.familyOfModel("openai/gpt-5.5-fast", profiles)))
cell("family of a tab: another tier of the same family belongs to it", P.familyOfModel("openai/gpt-6-luna", profiles) === "codex", "wrong")
cell("family of a tab: unknown and empty models are outside the profiles", P.familyOfModel("some/model", profiles) === undefined && P.familyOfModel("", profiles) === undefined && P.familyOfModel(undefined, undefined) === undefined, "wrong")

// schema keys
const keys = schema.SCHEMA_KEYS
cell("schema: the three keys exist, profile_set is human only", ["model_profiles", "profile_sets", "profile_set"].every((k) => keys.includes(k)) && schema.SCHEMA.find((s) => s.key === "profile_set").humanOnly === true && !schema.SCHEMA.find((s) => s.key === "model_profiles").humanOnly, JSON.stringify(keys.slice(-5)))
cell("AC-12 schema invalid() delegates: a bad value is refused with the key name", /model_profiles/.test(String(schema.invalid("model_profiles", { Claude: {} }))) && schema.invalid("model_profiles", GOOD_PROFILES) === undefined && schema.invalid("profile_set", "Default") !== undefined, "wrong")
const guide = schema.guideText({}, () => "по умолчанию")
cell("schema: guide shows the three keys and says profile_set is set by a person", /model_profiles:/.test(guide) && /profile_sets:/.test(guide) && /profile_set: .*Ставит человек/.test(guide), guide.split("\n").filter((l) => /profile_set:/.test(l)).join("|").slice(0, 300))

// ---- step 3: links, windows of a set, check, state table, profile choice ----
const prof = (model, context = 1000, output = 100, input) => ({ model, context, output, ...(input ? { input } : {}) })
const FAM = {
  claude: { heavy: prof("claude-code/opus", 720000, 64000), medium: prof("claude-code/sonnet", 720000, 64000), light: prof("claude-code/haiku", 220000, 32000) },
  kimi: { heavy: prof("kimi/k3", 220000, 131072), medium: prof("kimi/k3", 220000, 131072), light: prof("kimi/k3", 220000, 131072) },
  codex: { heavy: prof("openai/gpt-5.5", 525000, 128000, 461000), medium: prof("openai/gpt-5.6-terra", 525000, 128000, 461000), light: prof("openai/gpt-6-luna", 525000, 128000, 461000) },
}
const c = (family, tier) => ({ family, tier })
const SETS = {
  default: { develop: c("claude", "task"), accept: c("claude", "task"), plan: c("claude", "task"), plan_accept: c("claude", "task") },
  "cross-kimi": { develop: c("claude", "task"), plan: c("claude", "task"), accept: c("kimi", "heavy"), plan_accept: c("kimi", "heavy") },
  "cross-codex": { develop: c("claude", "medium"), plan: c("claude", "heavy"), accept: c("codex", "heavy"), plan_accept: c("codex", "heavy") },
  "kimi-only": { develop: c("kimi", "heavy"), plan: c("kimi", "heavy"), accept: c("kimi", "heavy"), plan_accept: c("kimi", "heavy") },
}
const DATA = { profiles: FAM, sets: SETS }
const clone = (x) => JSON.parse(JSON.stringify(x))

cell("links: the starting content has no dangling links, no form errors", P.linkProblems(DATA).length === 0 && P.checkData(DATA, "cross-kimi").errors.length === 0, JSON.stringify(P.checkData(DATA, "cross-kimi")))
const dangling = clone(DATA)
delete dangling.profiles.kimi
cell("AC-39 links: a set pointing at a missing family is named (all sets, with the place)", P.linkProblems(dangling).filter((p) => p.set === "kimi-only").length === 4 && /кими|kimi/.test(P.linkProblems(dangling)[0].text), JSON.stringify(P.linkProblems(dangling).slice(0, 2)))
const noTier = clone(DATA)
delete noTier.profiles.claude.light
cell("AC-39 links: a `task` cell references all three tiers, an explicit cell only its own", P.linkProblems(noTier, "default").length === 4 && P.linkProblems(noTier, "cross-codex").length === 0, `${P.linkProblems(noTier, "default").length}/${P.linkProblems(noTier, "cross-codex").length}`)
cell("REQ-30 referenced profiles: task is three, explicit is one", P.referencedProfiles(c("claude", "task")).length === 3 && P.referencedProfiles(c("claude", "heavy")).length === 1, "wrong")
cell("AC-39 check: a dangling link of the enabled set is an error, of another set a warning", P.checkData(dangling, "kimi-only").errors.length === 4 && P.checkData(dangling, "default").errors.length === 0 && P.checkData(dangling, "default").warnings.length === 6, JSON.stringify([P.checkData(dangling, "kimi-only").errors.length, P.checkData(dangling, "default").warnings.length]))
cell("AC-12 check: a form error makes the data invalid before any link check", P.checkData({ profiles: { Bad: {} }, sets: SETS }, "default").errors[0]?.kind === "form", JSON.stringify(P.checkData({ profiles: { Bad: {} }, sets: SETS }, "default")))
cell("DNC-09 check: an unknown stage in a set is ignored by the reader", P.checkData({ profiles: FAM, sets: { a: { develop: c("claude", "heavy"), coordination: c("claude", "heavy") } } }, "a").errors.length === 0 && P.cellsOf({ develop: c("claude", "heavy"), coordination: c("x", "heavy") }).length === 1, "failed")

// AC-26: one model through two profiles with different windows is a conflict, equal windows are fine
const w1 = P.windowsOfSet(DATA, "kimi-only")
cell("AC-26 equal windows: kimi-only gets one record for the one model on three tiers", w1.conflicts.length === 0 && w1.models.size === 1 && w1.models.get("kimi/k3").context === 220000, JSON.stringify([...w1.models]))
const conflict = clone(DATA)
conflict.profiles.kimi.heavy.context = 150000
const w2 = P.windowsOfSet(conflict, "kimi-only")
cell("AC-26 different windows: a conflict naming the model, the profiles and the windows", w2.conflicts.length === 1 && /kimi\/k3/.test(w2.conflicts[0].text) && /kimi\/heavy — context 150000/.test(w2.conflicts[0].text) && /kimi\/medium — context 220000/.test(w2.conflicts[0].text), JSON.stringify(w2.conflicts))
cell("AC-26 a conflict makes the enabled set invalid, but a not enabled one only when it is enabled", P.checkData(conflict, "kimi-only").errors.some((e) => e.kind === "conflict") && !P.checkData(conflict, "default").errors.some((e) => e.kind === "conflict"), "wrong")
const all = clone(DATA)
for (const t of ["heavy", "medium", "light"]) all.profiles.kimi[t].context = 150000
cell("AC-28 pure: changing all three tiers at once leaves no conflict", P.windowsOfSet(all, "kimi-only").conflicts.length === 0 && P.windowsOfSet(all, "kimi-only").models.get("kimi/k3").context === 150000, "wrong")
const cw = P.windowsOfSet(DATA, "cross-codex")
cell("REQ-08 windows of a set cover all three tiers of every family named in the stages", cw.families.join() === "claude,codex" && cw.models.size === 6 && cw.models.has("claude-code/haiku") && cw.models.has("openai/gpt-6-luna"), JSON.stringify(cw.families) + cw.models.size)
cell("AC-34 the window of a model with input has three fields, without input two", P.winText(cw.models.get("openai/gpt-5.5")) === "context 525000, input 461000, output 128000" && P.winText(cw.models.get("claude-code/opus")) === "context 720000, output 64000" && cw.models.get("claude-code/opus").input === undefined, JSON.stringify([...cw.models]))
const emptyP = clone(DATA)
emptyP.profiles.codex.heavy = { model: "" }
cell("REQ-30 a set referencing an empty record is invalid; an empty tier nobody references is fine", P.checkData(emptyP, "cross-codex").errors.some((e) => e.kind === "empty") && P.checkData(emptyP, "cross-kimi").errors.length === 0 && P.windowsOfSet(emptyP, "cross-codex").models.has("openai/gpt-5.5") === false, JSON.stringify(P.checkData(emptyP, "cross-codex").errors))
const emptyTask = clone(DATA)
emptyTask.profiles.claude.light = { model: "" }
cell("AC-28/AC-29 an empty tier of a family used by a `task` cell blocks the set (safe side)", P.checkData(emptyTask, "default").errors.some((e) => e.kind === "empty") && !P.checkData(emptyTask, "cross-codex").errors.some((e) => e.kind === "empty" && e.set === "cross-codex" && /claude\/heavy|claude\/medium/.test(e.text)), JSON.stringify(P.checkData(emptyTask, "default").errors))

// AC-37: the seven rows of the state table
const snap = P.snapshotOf(DATA, "cross-kimi")
const row = (name, eff, s) => P.stateRow(name, eff, s)
cell("AC-37 row 1: no name -> sessions by spawn_models, nothing to say", row(undefined, DATA).row === 1 && row("", DATA, snap).row === 1 && row(undefined, DATA).message === "" && P.resolveStageProfile(row(undefined, DATA), "develop") === undefined, "wrong")
cell("AC-37 row 7: a name in a project with neither table nor sets is ignored with a note", row("x", {}).row === 7 && /игнорируется/.test(row("x", {}).message) && row("x", { profiles: {}, sets: {} }, snap).row === 7 && P.resolveStageProfile(row("x", {}), "accept") === undefined, "wrong")
const s2 = row("cross-kimi", DATA)
cell("AC-37 row 2: a valid set is used as it is", s2.row === 2 && s2.usable.viaSnapshot === false && s2.message === "", JSON.stringify(s2).slice(0, 200))
const brokenFile = clone(DATA)
delete brokenFile.profiles.kimi
const s3 = row("cross-kimi", brokenFile, snap)
cell("AC-37 row 3: invalid data with a snapshot -> by the snapshot, with the place named", s3.row === 3 && s3.usable.viaSnapshot === true && /kimi/.test(s3.message) && P.resolveStageProfile(s3, "accept").model === "kimi/k3" && P.resolveStageProfile(s3, "accept").viaSnapshot === true, JSON.stringify(s3.message))
const s4 = row("cross-kimi", brokenFile)
cell("AC-37 row 4: invalid data without a snapshot -> an undescribed stage keeps spawn_models, a described stage with no profile refuses", s4.row === 4 && P.resolveStageProfile(s4, "develop") !== undefined && P.resolveStageProfile(s4, "develop").model === "claude-code/sonnet" && P.resolveStageProfile(s4, "develop").window === false && !!P.resolveStageProfile(s4, "accept").refuse, JSON.stringify([P.resolveStageProfile(s4, "develop"), P.resolveStageProfile(s4, "accept")]))
const s4b = row("cross-kimi", { profiles: FAM, sets: { "cross-kimi": { develop: c("claude", "task") } } }, undefined)
cell("AC-06(а) a set without the stage: spawn_models as before (undefined)", s4b.row === 2 && P.resolveStageProfile(s4b, "accept") === undefined, JSON.stringify(P.resolveStageProfile(s4b, "accept")))
const gone = clone(DATA)
delete gone.sets["cross-kimi"]
const s5 = row("cross-kimi", gone, snap)
cell("AC-37 row 5: the set removed with a snapshot -> by the snapshot with a warning", s5.row === 5 && /удалён|нет в данных/.test(s5.message) && P.resolveStageProfile(s5, "plan_accept").model === "kimi/k3", s5.message)
const s6 = row("cross-kimi", gone)
cell("AC-37 row 6 (red side): the set removed without a snapshot -> every stage refuses naming the set", s6.row === 6 && ["develop", "accept", "plan", "plan_accept"].every((st) => /cross-kimi/.test(P.resolveStageProfile(s6, st)?.refuse ?? "")), JSON.stringify(P.resolveStageProfile(s6, "develop")))

// AC-06 / REQ-06: choice of the profile by the stage and the tier
const res = (name, stage, opts) => P.resolveStageProfile(row(name, DATA), stage, opts)
cell("AC-06 develop `task` without tier -> medium of the family; tier on the input wins", res("default", "develop").model === "claude-code/sonnet" && res("default", "develop", { inputTier: "heavy" }).model === "claude-code/opus" && res("default", "develop", { inputTier: "bogus" }).model === "claude-code/sonnet", "wrong")
cell("AC-06 develop with an explicit tier: the input tier still wins inside the family", res("cross-codex", "develop", { inputTier: "light" }).model === "claude-code/haiku" && res("cross-codex", "develop").model === "claude-code/sonnet" && res("cross-codex", "plan").model === "claude-code/opus", "wrong")
cell("AC-06 auto-plan steps take the tier of the develop cell and ignore the input", res("cross-codex", "develop", { autoPlan: true, inputTier: "heavy" }).model === "claude-code/sonnet" && res("default", "develop", { autoPlan: true }).model === "claude-code/sonnet" && res("kimi-only", "develop", { autoPlan: true }).model === "kimi/k3", "wrong")
cell("AC-06 accept `task` takes the tier of the task record, an explicit cell its own", res("default", "accept", { taskTier: "light" }).model === "claude-code/haiku" && res("default", "accept", { taskTier: "heavy" }).model === "claude-code/opus" && res("default", "plan_accept").model === "claude-code/sonnet" && res("cross-codex", "accept", { taskTier: "light" }).model === "openai/gpt-5.5" && res("cross-codex", "accept", { taskTier: "light" }).family === "codex", "wrong")
cell("AC-06 window flag: develop and plan get the profile window, accept does not", res("cross-kimi", "develop").window === true && res("cross-kimi", "accept").window === false, "wrong")
const noKimi = clone(DATA)
noKimi.profiles.kimi.heavy = { model: "" }
cell("AC-06(б) a described stage whose profile is empty or missing refuses (no other family)", !!P.resolveStageProfile(row("kimi-only", noKimi), "develop")?.refuse || row("kimi-only", noKimi).row !== 2, "resolved")
const refusal = P.resolveStageProfile(row("kimi-only", { profiles: { kimi: { medium: FAM.kimi.medium } }, sets: { "kimi-only": { develop: c("kimi", "heavy") } } }), "develop", {})
cell("AC-06(б) a missing tier is a refusal naming the stage and the profile", /kimi\/heavy/.test(refusal?.refuse ?? "") && /разработка/.test(refusal?.refuse ?? ""), JSON.stringify(refusal))

// tabs by the cell (REQ-07 / AC-04)
cell("AC-04 tab fits: explicit tier needs the family of the cell, any tier of it", P.tabFitsCell(c("codex", "heavy"), "openai/gpt-5.5#high", FAM) && P.tabFitsCell(c("codex", "heavy"), "openai/gpt-6-luna", FAM) && !P.tabFitsCell(c("codex", "heavy"), "openai/gpt-5.5-fast", FAM) && !P.tabFitsCell(c("codex", "heavy"), "claude-code/sonnet", FAM) && !P.tabFitsCell(c("codex", "heavy"), undefined, FAM), "wrong")
cell("AC-38 tab fits: a `task` cell or no cell does not check the model", P.tabFitsCell(c("claude", "task"), "kimi/k3", FAM) && P.tabFitsCell(undefined, "anything", FAM) && P.tabFitsCell(c("claude", "task"), undefined, FAM), "wrong")

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-profiles-data.test: FAIL ${fail}` : "crew-profiles-data.test ok")
process.exit(fail ? 1 : 0)

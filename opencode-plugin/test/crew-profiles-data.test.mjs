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

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-profiles-data.test: FAIL ${fail}` : "crew-profiles-data.test ok")
process.exit(fail ? 1 : 0)

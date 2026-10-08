// Self-test of the documentation of the model profiles (task 003; node >= 24):  node test/crew-profiles-docs.test.mjs
// The example of the README is valid JSON of the two keys, passes the checks of the keys and of the links between them and
// holds the starting content of the table (nine records) and four sets; the README and the help describe the keys, the
// commands, the file of windows and what applies where; the names of the commands are only the two in the plural.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-profiles-docs-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_PRESENCE ??= "all"

const P = await import("../profiles.ts")
const schema = await import("../config-schema.ts")
const core = await import("../core.ts")
const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
const root = path.resolve(here, "..")
const readme = readFileSync(path.join(root, "README.md"), "utf8")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

// ---- AC-16 / AC-30: the example of the README ----
const section = readme.slice(readme.indexOf("## Model profiles"))
const block = /```json\n([\s\S]*?)\n```/.exec(section)
let example
try {
  example = JSON.parse(block?.[1] ?? "")
} catch (e) {
  example = undefined
}
cell("AC-16 the example of the README is read by JSON.parse", !!example, String(block?.[1]?.slice(0, 80)))
cell("AC-30 the example holds exactly the two keys; the name of the default set is not in it", example && Object.keys(example).sort().join() === "model_profiles,profile_sets" && !("profile_set" in example), JSON.stringify(Object.keys(example ?? {})))
cell("AC-16 every key passes the check of the key (the same as crew_config set)", example && schema.invalid("model_profiles", example.model_profiles) === undefined && schema.invalid("profile_sets", example.profile_sets) === undefined, String(schema.invalid("model_profiles", example?.model_profiles) ?? schema.invalid("profile_sets", example?.profile_sets)))
cell("AC-16 the links pass: no dangling reference of any set", example && P.linkProblems({ profiles: example.model_profiles, sets: example.profile_sets }).length === 0, JSON.stringify(P.linkProblems({ profiles: example?.model_profiles, sets: example?.profile_sets })))
cell("AC-16 every set of the example can be enabled: no error of the check, no conflict of windows", example && Object.keys(example.profile_sets).every((n) => P.checkData({ profiles: example.model_profiles, sets: example.profile_sets }, n).errors.length === 0), "errors")
const T = example?.model_profiles ?? {}
const rec = (f, t) => T[f]?.[t]
cell("AC-30 nine records: three families, three tiers, the starting numbers, output everywhere, nothing empty", Object.keys(T).sort().join() === "claude,codex,kimi" && ["claude", "kimi", "codex"].every((f) => P.PROFILE_TIERS.every((t) => rec(f, t) && !P.isEmptyProfile(rec(f, t)) && rec(f, t).output > 0)), JSON.stringify(Object.keys(T)))
cell("AC-30 the numbers of the starting content (claude 720000/64000, 720000/64000, 220000/32000; kimi 220000/131072; codex 525000, input 461000, output 128000)", rec("claude", "heavy")?.context === 720000 && rec("claude", "heavy")?.output === 64000 && rec("claude", "medium")?.context === 720000 && rec("claude", "light")?.context === 220000 && rec("claude", "light")?.output === 32000 && P.PROFILE_TIERS.every((t) => rec("kimi", t)?.context === 220000 && rec("kimi", t)?.output === 131072 && rec("kimi", t)?.model === "kimi-code-plan-global/k3-256k") && P.PROFILE_TIERS.every((t) => rec("codex", t)?.context === 525000 && rec("codex", t)?.input === 461000 && rec("codex", t)?.output === 128000) && rec("codex", "heavy")?.model === "openai/gpt-5.5" && rec("codex", "medium")?.model === "openai/gpt-5.6-terra" && rec("codex", "light")?.model === "openai/gpt-6-luna", "numbers")
const S = example?.profile_sets ?? {}
const cellIs = (set, stage, family, tier) => S[set]?.[stage]?.family === family && S[set]?.[stage]?.tier === tier
cell("AC-30 four sets: default, cross-kimi, cross-codex, kimi-only with the cells of the starting content", Object.keys(S).sort().join() === "cross-codex,cross-kimi,default,kimi-only" && P.STAGES.every((st) => cellIs("default", st, "claude", "task")) && cellIs("cross-kimi", "accept", "kimi", "heavy") && cellIs("cross-kimi", "plan_accept", "kimi", "heavy") && cellIs("cross-kimi", "develop", "claude", "task") && cellIs("cross-codex", "develop", "claude", "medium") && cellIs("cross-codex", "plan", "claude", "heavy") && cellIs("cross-codex", "accept", "codex", "heavy") && P.STAGES.every((st) => cellIs("kimi-only", st, "kimi", "heavy")), JSON.stringify(Object.keys(S)))

// ---- AC-19: what the README and the help say ----
const lower = readme.replace(/\s+/g, " ")
const need = [
  ["the three keys", ["model_profiles", "profile_sets", "profile_set"]],
  ["the stages", ["develop", "accept", "plan_accept"]],
  ["all verbs of both commands", ["/crew-sets show", "/crew-sets use", "/crew-sets set", "/crew-sets unset", "/crew-sets new", "rename", "delete", "/crew-sets reset", "/crew-profiles set", "/crew-profiles reset", "check", "save [force]", "from <other>"]],
  ["the file of windows, its mark and where it lives", ["`.opencode/opencode.json`", "_crew_harness", "worktree of each task", "info/exclude"]],
  ["the window is a property of the model in a folder", ["property of the model **in a folder**"]],
  ["the window of a profile applies only to the sessions in the worktree; the reviewers take the general window", ["applies only to sessions in the worktree of a task (development, planning)", "their window comes from the", "general hand-written settings"]],
  ["input drives the compaction of models with input", ["For a model with `input` the compaction is driven by `input`"]],
  ["a smaller window compacts the tabs", ["**smaller window compacts**"]],
  [".claude of the repository acts in part in a tab of another family", ["act in a tab of another family only in part"]],
  ["default and the equality with spawn_models", ["`default` keeps the choice", "equal `spawn_models`"]],
  ["the hand-written windows are named, not changed", ["hand-written `.opencode/opencode.jsonc`", "the plugin only names it"]],
]
for (const [label, words] of need) cell(`AC-19 the README says: ${label}`, words.every((w) => lower.includes(w)), words.filter((w) => !lower.includes(w)).join(" | "))
const help = core.HELP
cell("AC-19 the help names the two commands and what the set decides", help.includes("/crew-sets") && help.includes("/crew-profiles") && /наборы профилей моделей/.test(help), "missing")
cell("AC-19 the help says the tier model is the default while no set is enabled", /по умолчанию, пока набор не\s+включён/.test(help), help.split("\n").find((l) => /модель по ступени/.test(l)))
const coreSrc = readFileSync(path.join(root, "core.ts"), "utf8")
cell("AC-19 no description claims `heavy/medium/light = opus/sonnet/haiku`: the tools say «by default» and name the set", !/heavy\/medium\/light\s*=\s*opus/i.test(coreSrc) && /by default claude-code opus\|sonnet\|haiku, spawn_models of the project overrides; an enabled model-profile set/.test(coreSrc), "missing")

// ---- AC-31: the names of the commands: only /crew-sets and /crew-profiles ----
// the patterns are assembled from parts, so that this file does not hold them as text
const pats = [new RegExp("/crew-" + "set(?![A-Za-z0-9-])"), new RegExp("/crew-" + "profile(?![A-Za-z0-9-])"), new RegExp("(^|[\\s`(])/" + "use\\b"), new RegExp("(^|[\\s`(])/" + "сет\\b"), new RegExp("(^|[\\s`(])/" + "профиль\\b")]
const files = [
  ...readdirSync(root).filter((f) => f.endsWith(".ts")).map((f) => path.join(root, f)),
  path.join(root, "README.md"),
  ...readdirSync(path.join(root, "test")).map((f) => path.join(root, "test", f)),
]
const hits = []
for (const f of files) {
  const text = readFileSync(f, "utf8")
  for (const p of pats) if (p.test(text)) hits.push(`${path.basename(f)}: ${p}`)
}
cell("AC-31 no singular names of the commands and no command whose first word is the verb alone in the code, README and tests", hits.length === 0, hits.join("; "))
const sample = path.join(tmp, "sample.md")
writeFileSync(sample, "use /crew-" + "set add, /crew-" + "profile show and `/" + "use cross`\n")
cell("AC-31 positive control: the same patterns find the names in a file that holds them", pats.slice(0, 3).every((p) => p.test(readFileSync(sample, "utf8"))), "not found")
// ---- the link of the empty answers: the section of the README on GitHub, a separate token, the anchor of a real heading ----
{
  const Paths = await import("../paths.ts")
  const Cmd = await import("../profile-cmd.ts")
  const url = Paths.PROFILES_README_URL
  const heading = /^## (Model profiles.*)$/m.exec(readme)?.[1]?.trim() ?? ""
  const slug = heading.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-") // the anchor rule of GitHub
  cell("the link of the empty answers points to the README of the repository on GitHub with the anchor of the heading of the profiles section", url === `https://github.com/unitcraft/crew-harness/blob/main/opencode-plugin/README.md#${slug}` && slug.length > 10, JSON.stringify({ url, slug }))
  const empty = { project: "p", data: {}, raw: {}, layer: {}, state: { warnings: [] }, name: undefined }
  const t1 = Cmd.profilesTable(empty)
  const t2 = Cmd.setsTable(empty)
  cell("an empty /crew-profiles and an empty /crew-sets name the link as a separate token (a line of its own) and the hint about the example", [t1, t2].every((t) => t.split("\n").includes(url) && t.includes("Скопируйте пример") && !t.includes("см. README")), t1 + "\n--\n" + t2)
  const g = schema.SCHEMA?.find?.((x) => x.key === "model_profiles") ?? schema.SETTINGS?.find?.((x) => x.key === "model_profiles")
  cell("the guide of crew_config names the same link for the profiles keys", !!g && String(g.recommend).includes(url), String(g?.recommend))
}

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-profiles-docs.test: FAIL ${fail}` : "crew-profiles-docs.test ok")
process.exit(fail ? 1 : 0)

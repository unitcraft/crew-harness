// Self-test of the local layer of the profiles (task 003; node >= 24):  node test/crew-profiles-layer.test.mjs
// The layer over the committed settings file: effective data, "the file now differs", save / save force, the forms of
// reset, the snapshot of the last valid state, projects apart (nested roots). A real git repository of settings.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-profiles-layer-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "600000" // a state read costs ~6 git processes: the cache is dropped by hand after every change
process.env.CREW_HARNESS_PRESENCE = "all"

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
const prof = (model, context, output, input) => ({ model, context, output, ...(input ? { input } : {}) })
const FAM = {
  claude: { heavy: prof("claude-code/opus", 720000, 64000), medium: prof("claude-code/sonnet", 720000, 64000), light: prof("claude-code/haiku", 220000, 32000) },
  kimi: { heavy: prof("kimi/k3", 220000, 131072), medium: prof("kimi/k3", 220000, 131072), light: prof("kimi/k3", 220000, 131072) },
}
const c = (family, tier) => ({ family, tier })
const SETS = {
  default: { develop: c("claude", "task"), accept: c("claude", "task") },
  "cross-kimi": { develop: c("claude", "task"), accept: c("kimi", "heavy"), plan_accept: c("kimi", "heavy") },
}
// project "proj": root tmp/proj, settings repo tmp/proj-settings; nested project "inner": root tmp/proj/inner
const projRoot = path.join(tmp, "proj")
const innerRoot = path.join(projRoot, "inner")
const soloRoot = path.join(tmp, "solo")
for (const d of [projRoot, innerRoot, soloRoot]) mkdirSync(d, { recursive: true })
const mkSettings = (name, folder, obj) => {
  const dir = path.join(tmp, folder)
  mkdirSync(path.join(dir, ".opencode"), { recursive: true })
  git(dir, "init", "-q", "-b", "main")
  writeFileSync(path.join(dir, ".opencode", "crew-harness.json"), JSON.stringify(obj, null, 2))
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", "settings")
  return dir
}
const projSettings = mkSettings("proj", "proj-settings", { project: "proj", root: "../proj", model_profiles: FAM, profile_sets: SETS })
const innerSettings = mkSettings("inner", "inner-settings", { project: "inner", root: "../proj/inner" })
const soloSettings = mkSettings("solo", "solo-settings", { project: "solo", root: "../solo" })
const file = path.join(projSettings, ".opencode", "crew-harness.json")
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex")
const commit = (msg) => {
  git(projSettings, "add", "-A")
  git(projSettings, "commit", "-q", "-m", msg)
  bump()
}
const commits = () => Number(git(projSettings, "rev-list", "--count", "HEAD").trim())
const writeFileJson = (obj) => {
  writeFileSync(file, JSON.stringify(obj, null, 2))
  bump()
}
const readFileJson = () => JSON.parse(readFileSync(file, "utf8"))

const core = await import("../core.ts")
const L = await import("../profile-layer.ts")
const { writeSettings } = await import("../settings.ts")
const P = await import("../profiles.ts")
core.setProjects(core.parseProjects({ projects: [projSettings, innerSettings, soloSettings] }), {})

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const here = projRoot
// one state read costs several git processes: it is kept until something changes
let cached
const bump = () => {
  cached = undefined
  writeSettings(projSettings, {}) // drops the settings cache of the folder (rewrites the same working file)
}
const st = (dir = here) => (dir === here ? (cached ??= L.profileState(dir)) : L.profileState(dir))
const writeLayer = (p, l) => {
  L.writeLayer(p, l)
  bump()
}
const edit = (fn) => {
  const s = st()
  writeLayer(s.project, fn(s.layer, s.raw))
}

// the committed file is the base: no layer, no name -> row 1
cell("base: a project with the table and sets and no name is row 1 (nothing applied)", st().project === "proj" && st().state.row === 1 && st().name === undefined && st().data.profiles.claude.heavy.context === 720000, JSON.stringify(st().state.row))

// AC-21: use writes the project's local layer only; the committed file stays; reset returns the default of the file
bump() // normalises the file once; every later drop rewrites the same bytes
const h0 = sha(file)
edit((l, raw) => L.layerSetName(l, raw, "cross-kimi"))
let s = st()
cell("AC-21 the local name applies at once, with the source, and the state is row 2", s.name === "cross-kimi" && s.nameSource === "layer" && s.state.row === 2, JSON.stringify([s.name, s.nameSource, s.state.row]))
cell("AC-21 the committed file does not change by the local switch", sha(file) === h0 && existsSync(L.layerFile("proj")), "changed")
cell("AC-21 the choice follows the local name at once (develop -> claude, accept -> kimi)", P.resolveStageProfile(s.state, "accept").model === "kimi/k3" && P.resolveStageProfile(s.state, "develop").model === "claude-code/sonnet", JSON.stringify(P.resolveStageProfile(s.state, "accept")))
const rst = L.layerReset(s.layer, { kind: "name" })
writeLayer("proj", rst.layer)
cell("AC-21 reset of the name gives the default of the file (none here -> row 1), the layer file disappears", st().state.row === 1 && !existsSync(L.layerFile("proj")) && rst.removed.join() === "name", JSON.stringify([st().state.row, rst.removed]))
// a default name in the file
writeFileJson({ ...readFileJson(), profile_set: "default" })
commit("name default")
cell("REQ-04 the name of the file applies when there is no local one, with the source", st().name === "default" && st().nameSource === "file" && st().state.row === 2, JSON.stringify([st().name, st().nameSource]))
edit((l, raw) => L.layerSetName(l, raw, "cross-kimi"))
cell("REQ-04 the local name overrides the file", st().name === "cross-kimi" && st().nameSource === "layer", st().name)
writeLayer("proj", L.layerReset(st().layer, { kind: "name" }).layer)
cell("AC-21 reset of the name returns the set of the file", st().name === "default" && st().nameSource === "file", st().name)
// a layer entry equal to the file disappears by itself (pruned)
edit((l, raw) => L.layerSetName(l, raw, "default"))
cell("REQ-29 a layer entry equal to the file is not kept (pruned in the state)", Object.keys(st().layer).length === 0, JSON.stringify(st().layer))
writeLayer("proj", {})

// AC-24 (data): other projects do not know the layer of proj; nested roots
edit((l, raw) => L.layerSetName(l, raw, "cross-kimi"))
const innerState = L.profileState(innerRoot)
const soloState = L.profileState(soloRoot)
cell("AC-24 the nested project is another project: no table, no name, row 1", innerState.project === "inner" && innerState.state.row === 1 && innerState.name === undefined && innerState.data.profiles === undefined, JSON.stringify([innerState.project, innerState.state.row]))
cell("AC-24 a project without profiles is untouched by the layer of another one", soloState.project === "solo" && soloState.state.row === 1 && Object.keys(soloState.layer).length === 0, JSON.stringify(soloState.project))
cell("AC-24 the layer file is per project", existsSync(L.layerFile("proj")) && !existsSync(L.layerFile("inner")) && !existsSync(L.layerFile("solo")), "wrong")
writeLayer("proj", {})

// AC-33: edits, a deletion, then the file changes by a commit
edit((l, raw) => L.layerSetProfile(l, raw, "claude", "heavy", prof("claude-code/opus", 500000, 64000)))
edit((l, raw) => L.layerSetProfile(l, raw, "claude", "light", null))
edit((l, raw) => L.layerSetCell(l, raw, "cross-kimi", "plan_accept", null))
edit((l, raw) => L.layerNewSet(l, raw, "mine", { develop: c("kimi", "heavy") }))
s = st()
cell("AC-33 the effective data is the file with the layer over it (edit, deletion, unset, new set)", s.data.profiles.claude.heavy.context === 500000 && !s.data.profiles.claude.light && !s.data.sets["cross-kimi"].plan_accept && s.data.sets.mine.develop.family === "kimi" && s.data.profiles.claude.medium.context === 720000, JSON.stringify(s.data.profiles.claude))
// a commit changes the same record and adds another
const f1 = readFileJson()
f1.model_profiles.claude.heavy = prof("claude-code/opus", 600000, 64000)
f1.model_profiles.extra = { heavy: prof("x/y", 1000, 100) }
f1.profile_sets.fresh = { develop: c("claude", "heavy") }
writeFileJson(f1)
commit("file changed")
s = st()
cell("AC-33 the layer wins by key after the file changed; new file records appear", s.data.profiles.claude.heavy.context === 500000 && !!s.data.profiles.extra && !!s.data.sets.fresh, JSON.stringify([s.data.profiles.claude.heavy.context, Object.keys(s.data.profiles)]))
const diff = L.layerDiff(s.raw, s.layer)
cell("AC-33 show and check say «the file now differs» exactly for the changed record", diff.find((d) => d.key === "profile:claude/heavy")?.fileChanged === true && diff.find((d) => d.key === "profile:claude/light")?.fileChanged === false && L.problemsOf(s).some((p) => /claude\/heavy/.test(p) && /в файле теперь иначе/.test(p)), JSON.stringify(diff.map((d) => [d.key, d.fileChanged])))

// AC-35: save with three kinds of records
const log0 = commits()
const saveRes = L.saveLayer(here)
const w = readFileJson()
cell("AC-35 save writes the local and the deleted records into the working copy", saveRes.ok && !w.model_profiles.claude.light && !w.profile_sets["cross-kimi"].plan_accept && w.profile_sets.mine?.develop?.family === "kimi", JSON.stringify(saveRes))
cell("AC-35 the record added by a commit is not touched", !!w.model_profiles.extra && !!w.profile_sets.fresh, JSON.stringify(Object.keys(w.model_profiles)))
cell("AC-35 the record whose value changed in the file is skipped and listed", w.model_profiles.claude.heavy.context === 600000 && saveRes.skipped.length === 1 && saveRes.skipped[0].key === "profile:claude/heavy" && /профиль claude\/heavy/.test(saveRes.skipped[0].label), JSON.stringify(saveRes.skipped))
const forced = L.saveLayer(here, true)
cell("AC-35 save force rewrites exactly the listed record", forced.ok && readFileJson().model_profiles.claude.heavy.context === 500000, JSON.stringify(forced))
cell("AC-35 the plugin does not commit: git log did not grow, the file is modified", commits() === log0 && git(projSettings, "status", "--porcelain").includes("crew-harness.json"), String(commits()))
commit("saved")
cell("AC-35 after the commit the layer holds none of the saved records", Object.keys(st().layer).length === 0, JSON.stringify(st().layer))
cell("AC-35 and the state equals the file", st().data.profiles.claude.heavy.context === 500000 && !st().data.profiles.claude.light, "wrong")
// the name: save writes the name as the default of the file
edit((l, raw) => L.layerSetName(l, raw, "mine"))
L.saveLayer(here)
cell("AC-29 save puts the enabled name into the file as the default", readFileJson().profile_set === "mine", String(readFileJson().profile_set))
commit("name saved")
cell("AC-29 save of an old-form project is refused with the reason (nowhere to write)", (() => {
  core.setProjects(core.parseProjects({ projects: { oldform: path.join(tmp, "oldform") } }), {})
  mkdirSync(path.join(tmp, "oldform"), { recursive: true })
  const r = L.saveLayer(path.join(tmp, "oldform"))
  core.setProjects(core.parseProjects({ projects: [projSettings, innerSettings, soloSettings] }), {})
  return r.ok === false && /писать некуда/.test(r.error ?? "")
})(), "saved")
writeLayer("proj", {})

// AC-36: every form of reset takes exactly its piece
const base = { name: { value: "cross-kimi", base: null }, "profile:claude/heavy": { value: prof("a/b", 1, 1), base: null }, "profile:claude/light": { value: null, base: null }, "profile:kimi/heavy": { value: prof("a/c", 1, 1), base: null }, "set:mine": { mode: "new", base: null }, "cell:mine/develop": { value: c("kimi", "heavy"), base: null }, "cell:default/accept": { value: c("kimi", "heavy"), base: null }, "cell:default/develop": { value: c("kimi", "heavy"), base: null } }
const keysAfter = (form) => Object.keys(L.layerReset(base, form).layer).sort().join(" ")
cell("AC-36 reset name", keysAfter({ kind: "name" }) === Object.keys(base).filter((k) => k !== "name").sort().join(" "), keysAfter({ kind: "name" }))
cell("AC-36 reset set takes the set and its cells only", keysAfter({ kind: "set", name: "mine" }) === Object.keys(base).filter((k) => k !== "set:mine" && k !== "cell:mine/develop").sort().join(" "), keysAfter({ kind: "set", name: "mine" }))
cell("AC-36 reset cell takes the one cell", keysAfter({ kind: "cell", name: "default", stage: "accept" }) === Object.keys(base).filter((k) => k !== "cell:default/accept").sort().join(" "), keysAfter({ kind: "cell", name: "default", stage: "accept" }))
cell("AC-36 reset family takes all its records", keysAfter({ kind: "family", family: "claude" }) === Object.keys(base).filter((k) => !k.startsWith("profile:claude/")).sort().join(" "), keysAfter({ kind: "family", family: "claude" }))
cell("AC-36 reset record takes one profile", keysAfter({ kind: "profile", family: "claude", tier: "heavy" }) === Object.keys(base).filter((k) => k !== "profile:claude/heavy").sort().join(" "), keysAfter({ kind: "profile", family: "claude", tier: "heavy" }))
cell("AC-36 reset all empties the layer", keysAfter({ kind: "all" }) === "" && L.layerReset(base, { kind: "all" }).removed.length === Object.keys(base).length, keysAfter({ kind: "all" }))

// AC-37 (в, г): the snapshot of the last valid state
const f2 = readFileJson()
f2.model_profiles.claude.light = prof("claude-code/haiku", 220000, 32000)
f2.profile_set = "cross-kimi"
writeFileJson(f2)
commit("name cross-kimi")
let sync = L.syncSnapshot(here)
const snapFile = L.snapshotFile("proj")
cell("AC-37(в) the first valid pass with an enabled set creates the snapshot", sync.state.row === 2 && existsSync(snapFile) && JSON.parse(readFileSync(snapFile, "utf8")).name === "cross-kimi", JSON.stringify(sync.state.row))
// the file loses the profile of kimi (a commit): row 3 by the snapshot, the snapshot is kept
const f3 = readFileJson()
delete f3.model_profiles.kimi
writeFileJson(f3)
commit("kimi removed")
sync = L.syncSnapshot(here)
cell("AC-37(б) data became invalid not by a command: row 3, sessions by the snapshot, the snapshot is not overwritten", sync.state.row === 3 && P.resolveStageProfile(sync.state, "accept").model === "kimi/k3" && P.resolveStageProfile(sync.state, "accept").viaSnapshot === true && !!JSON.parse(readFileSync(snapFile, "utf8")).profiles.kimi, JSON.stringify([sync.state.row, sync.state.message.slice(0, 80)]))
cell("AC-37(б) the message names the place", /kimi/.test(sync.state.message) && L.problemsOf(sync).some((p) => /kimi/.test(p)), sync.state.message)
// the data is repaired -> the snapshot follows the new state
const f4 = readFileJson()
f4.model_profiles.kimi = { heavy: prof("kimi/k3", 200000, 131072), medium: prof("kimi/k3", 200000, 131072), light: prof("kimi/k3", 200000, 131072) }
writeFileJson(f4)
commit("kimi back")
sync = L.syncSnapshot(here)
cell("AC-37(в) after the repair the snapshot is refreshed", sync.state.row === 2 && JSON.parse(readFileSync(snapFile, "utf8")).profiles.kimi.heavy.context === 200000, JSON.stringify(sync.state.row))
// a removed name: row 1, the snapshot is dropped
const f5 = readFileJson()
delete f5.profile_set
writeFileJson(f5)
commit("name removed")
sync = L.syncSnapshot(here)
cell("AC-10/AC-37 the name removed: row 1, the snapshot is dropped", sync.state.row === 1 && !existsSync(snapFile), JSON.stringify(sync.state.row))
// (г) restart on invalid data: with a snapshot the behaviour holds (read from disk), without it rows 4 and 6
f5.profile_set = "cross-kimi"
writeFileJson(f5)
commit("name back")
L.syncSnapshot(here)
const f6 = readFileJson()
delete f6.model_profiles.kimi
writeFileJson(f6)
commit("kimi removed again")
cell("AC-37(г) a restart (a fresh read, no memory) on invalid data with a snapshot keeps the behaviour", L.profileState(here).state.row === 3, JSON.stringify(L.profileState(here).state.row))
L.dropSnapshot("proj")
cell("AC-37(г) red side: the same restart without a snapshot gives row 4 (the described stage with no profile refuses)", L.profileState(here).state.row === 4 && !!P.resolveStageProfile(L.profileState(here).state, "accept")?.refuse, JSON.stringify(L.profileState(here).state.row))
const f7 = readFileJson()
delete f7.profile_sets["cross-kimi"]
writeFileJson(f7)
commit("set removed")
cell("AC-37 row 6: the set is gone and there is no snapshot", L.profileState(here).state.row === 6 && /cross-kimi/.test(L.profileState(here).state.message), JSON.stringify(L.profileState(here).state.row))
const f8 = readFileJson()
delete f8.model_profiles
delete f8.profile_sets
writeFileJson(f8)
commit("all keys removed")
cell("AC-24/AC-37 row 7: neither table nor sets, the name is ignored with a note; the snapshot is dropped", L.syncSnapshot(here).state.row === 7 && !existsSync(snapFile) && /игнорируется/.test(L.profileState(here).state.message), JSON.stringify(L.profileState(here).state.row))

// the log line of an edit (one writer function)
L.logEdit("proj", "crew-sets set", "default/develop", "claude/task", "kimi/heavy")
const logText = readFileSync(path.join(os.tmpdir(), "opencode-plugins.log"), "utf8")
cell("AC-17 the edit line has the project, the command, what changed and old -> new", /profile edit: proj crew-sets set default\/develop \(claude\/task -> kimi\/heavy\)/.test(logText), "no line")

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-profiles-layer.test: FAIL ${fail}` : "crew-profiles-layer.test ok")
process.exit(fail ? 1 : 0)

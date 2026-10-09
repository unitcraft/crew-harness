// Self-test of the data in force of the profiles (task 003, ADR-0014: no local layer; node >= 24):  node test/crew-profiles-layer.test.mjs
// The three keys of the working copy of the settings file are the data in force; one atomic write of a draft; an old
// *.layer.json is ignored and named once; the snapshot of the last valid state; projects apart (nested roots).
// A real git repository of settings.
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

// the committed file is the base: no name -> row 1
cell("base: a project with the table and sets and no name is row 1 (nothing applied)", st().project === "proj" && st().state.row === 1 && st().name === undefined && st().data.profiles.claude.heavy.context === 720000, JSON.stringify(st().state.row))

// the data in force are the three keys of the WORKING COPY of the file: an uncommitted edit acts at once, no layer between
bump() // normalises the file once; every later drop rewrites the same bytes
const committedName = () => JSON.parse(git(projSettings, "show", "HEAD:.opencode/crew-harness.json")).profile_set
writeFileJson({ ...readFileJson(), profile_set: "cross-kimi" })
let s = st()
cell("the name written into the working copy (no commit) applies at once: row 2", s.name === "cross-kimi" && s.state.row === 2 && committedName() === undefined, JSON.stringify([s.name, s.state.row, committedName()]))
cell("the choice follows the name of the working copy at once (develop -> claude, accept -> kimi)", P.resolveStageProfile(s.state, "accept").model === "kimi/k3" && P.resolveStageProfile(s.state, "develop").model === "claude-code/sonnet", JSON.stringify(P.resolveStageProfile(s.state, "accept")))
cell("there is no layer in the state any more", !("layer" in s) && !("nameSource" in s), Object.keys(s).join())
// other keys of the file are read from the committed file as before (the working copy decides only the three profile keys)
writeFileJson({ ...readFileJson(), profile_set: "default" })
commit("name default")
cell("the committed name applies as before", st().name === "default" && st().state.row === 2, JSON.stringify(st().name))

// the old layer file is not read and not applied; it is named once
mkdirSync(path.dirname(L.layerFile("proj")), { recursive: true })
writeFileSync(L.layerFile("proj"), JSON.stringify({ name: { value: "cross-kimi", base: "default" }, "profile:claude/heavy": { value: prof("a/b", 1, 1), base: null } }))
bump()
cell("an old *.layer.json is ignored as data: the name and the profiles are those of the file", st().name === "default" && st().data.profiles.claude.heavy.context === 720000, JSON.stringify([st().name, st().data.profiles.claude.heavy.context]))
// the pass of the service reads the project by the folder of the settings (outside the root in this fixture: another name)
const passName = L.profileState(projSettings).project
if (passName !== "proj") writeFileSync(L.layerFile(passName), "{}")
L.resetLegacyNotes()
const p1 = L.profileProblems(true).filter((p) => /слой отключён/.test(p))
const p2 = L.profileProblems(true).filter((p) => /слой отключён/.test(p))
const pd = L.profileProblems().filter((p) => /слой отключён/.test(p))
cell("the pass of the service carries the note once (pass 1: one, pass 2: none); crew_doctor names it every time; the file is not deleted", p1.length === 1 && p2.length === 0 && (passName === "proj" ? pd.length === 1 : true) && existsSync(L.layerFile("proj")), JSON.stringify([p1.length, p2.length, pd.length]))
if (passName !== "proj") rmSync(L.layerFile(passName), { force: true })
L.resetLegacyNotes()
const note1 = L.legacyLayerNote("proj")
const note2 = L.legacyLayerNote("proj")
cell("the note says: disabled, not applied, can be deleted; a repeat is silent", /слой отключён/.test(note1 ?? "") && /не применяются/.test(note1 ?? "") && /можно удалить/.test(note1 ?? "") && note2 === undefined, JSON.stringify([note1, note2]))
cell("a state read does not touch the old layer file", existsSync(L.layerFile("proj")), "gone")
rmSync(L.layerFile("proj"), { force: true })
cell("no layer file, no note", L.legacyLayerText("proj") === null, String(L.legacyLayerText("proj")))

// other projects do not know the file of proj; nested roots
writeFileJson({ ...readFileJson(), profile_set: "cross-kimi" })
const innerState = L.profileState(innerRoot)
const soloState = L.profileState(soloRoot)
cell("AC-24 the nested project is another project: no table, no name, row 1", innerState.project === "inner" && innerState.state.row === 1 && innerState.name === undefined && innerState.data.profiles === undefined, JSON.stringify([innerState.project, innerState.state.row]))
cell("AC-24 a project without profiles is untouched by the file of another one", soloState.project === "solo" && soloState.state.row === 1, JSON.stringify(soloState.project))
writeFileJson({ ...readFileJson(), profile_set: "default" })

// writeDraft: one atomic write of the three keys, the other keys of the file are kept, no commit
const log0 = commits()
s = st()
const draft = L.draftOf(s)
L.dSetProfile(draft, "claude", "heavy", prof("claude-code/opus", 500000, 64000))
L.dSetProfile(draft, "claude", "light", null)
L.dSetCell(draft, "cross-kimi", "plan_accept", null)
L.dNewSet(draft, "mine", { develop: c("kimi", "heavy") })
draft.name = "mine"
const before = readFileJson()
const wr = L.writeDraft(s, draft)
bump()
const w = readFileJson()
cell("the draft lands in the working copy: edit, deletion, unset, new set, name", wr.ok && w.model_profiles.claude.heavy.context === 500000 && !w.model_profiles.claude.light && !w.profile_sets["cross-kimi"].plan_accept && w.profile_sets.mine.develop.family === "kimi" && w.profile_set === "mine", JSON.stringify(wr))
cell("the other keys of the file are kept as they were", w.project === before.project && w.root === before.root, JSON.stringify([w.project, w.root]))
cell("the plugin does not commit: git log did not grow, the file is modified", commits() === log0 && git(projSettings, "status", "--porcelain").includes("crew-harness.json"), String(commits()))
cell("no temporary file is left next to the file", !existsSync(`${file}.${process.pid}.tmp`), "tmp left")
cell("the state equals the file at once (no commit needed)", st().data.profiles.claude.heavy.context === 500000 && st().name === "mine", JSON.stringify(st().name))
// an emptied family goes away
const d2 = L.draftOf(st())
for (const t of ["heavy", "medium"]) L.dSetProfile(d2, "claude", t, null)
cell("the family with its last record removed goes away", !d2.profiles.claude, JSON.stringify(d2.profiles))
// a working copy that is not JSON is not overwritten
const keep = readFileSync(file, "utf8")
writeFileSync(file, "{ not json")
cached = undefined // not bump(): the settings cache is dropped by rewriting the file, and a rewrite would repair it
const bad = L.writeDraft(st(), L.draftOf(st()))
cell("a working file that is not JSON is refused, not overwritten", bad.ok === false && /не JSON/.test(bad.error ?? "") && readFileSync(file, "utf8") === "{ not json", JSON.stringify(bad))
writeFileSync(file, keep)
bump()
// a key set by the "local" option of the plugin is stronger than the file: the write is refused, not silently useless
core.setProjects(core.parseProjects({ projects: [projSettings, innerSettings, soloSettings] }), { proj: { profile_set: "default" } })
cached = undefined
const shadow = L.writeDraft(st(), L.draftOf(st()))
core.setProjects(core.parseProjects({ projects: [projSettings, innerSettings, soloSettings] }), {})
cached = undefined
cell("a key set by the local option of the plugin overrides the file: the write is refused with the reason", shadow.ok === false && /profile_set/.test(shadow.error ?? "") && /local/.test(shadow.error ?? ""), JSON.stringify(shadow))
cell("an old-form project: nowhere to write", (() => {
  core.setProjects(core.parseProjects({ projects: { oldform: path.join(tmp, "oldform") } }), {})
  mkdirSync(path.join(tmp, "oldform"), { recursive: true })
  const ps = L.profileState(path.join(tmp, "oldform"))
  const r = L.writeDraft(ps, L.draftOf(ps))
  core.setProjects(core.parseProjects({ projects: [projSettings, innerSettings, soloSettings] }), {})
  return r.ok === false && /писать некуда/.test(r.error ?? "")
})(), "saved")
writeFileJson({ ...readFileJson(), profile_set: undefined })
commit("back to no name")

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

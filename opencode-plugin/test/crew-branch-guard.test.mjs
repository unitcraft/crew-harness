// Self-test of the control of the folder and the branch of the windows (task 157, node >= 24):  node test/crew-branch-guard.test.mjs
// The integrator stands in the main copy of the project on its target branch; an executor stands in the tree of its task on its branch;
// a reviewer stands in the main copy or in any tree of the repository (a detached HEAD on a candidate is allowed); the orchestrator and
// the windows of the owner are not controlled. A check at every turn compares the folder from session.get and the HEAD of the folder
// with that pair; a command that changes the branch or the history in the main copy or in the tree of someone else's task is refused
// until the reason is recorded (crew_branch_note); a reason lets it pass and moves the expectation.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-branch-guard-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
let fail = 0
let n = 0
const cell = (name, ok, detail) => {
  n++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const J = (v) => JSON.stringify(v)
const bg = await import(pathToFileURL(path.join(plugin, "branch-guard.ts")).href).catch((e) => ({ missing: String(e?.message ?? e) }))
const fn = (name, dflt) => (typeof bg[name] === "function" ? bg[name] : () => dflt ?? { missing: name })
const expectedFor = fn("expectedFor")
const checkWindow = fn("checkWindow")
const turnWarning = fn("turnWarning")
const judgeBash = fn("judgeBash")
const judgeWrite = fn("judgeWrite")
const noteBranch = fn("noteBranch")
const readState = fn("readState")
const readJournal = fn("readJournal", [])

const fw = (p) => p.replace(/\\/g, "/")
// ---- a repository with trees, written by hand (no git processes)
const MAIN = path.join(tmp, "crew-harness")
const base = path.join(tmp, "box")
mkdirSync(base, { recursive: true })
const heads = new Map() // tree -> HEAD file
const mkMain = (dir, branch = "main") => {
  mkdirSync(path.join(dir, ".git"), { recursive: true })
  writeFileSync(path.join(dir, ".git", "HEAD"), `ref: refs/heads/${branch}\n`)
  heads.set(dir, path.join(dir, ".git", "HEAD"))
}
const mkTree = (dir, name, branch) => {
  const gd = path.join(MAIN, ".git", "worktrees", name)
  mkdirSync(gd, { recursive: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(gd, "HEAD"), branch.length === 40 && /^[0-9a-f]+$/.test(branch) ? `${branch}\n` : `ref: refs/heads/${branch}\n`)
  writeFileSync(path.join(gd, "commondir"), "../..\n")
  writeFileSync(path.join(dir, ".git"), `gitdir: ${fw(gd)}\n`)
  heads.set(dir, path.join(gd, "HEAD"))
}
const setBranch = (dir, branch) => writeFileSync(heads.get(dir), `ref: refs/heads/${branch}\n`)
mkMain(MAIN)
const T145 = path.join(tmp, "trees", "145")
const T157 = path.join(tmp, "trees", "157")
const HELPER = path.join(tmp, "trees", "integrator-helper")
const CAND = path.join(tmp, "trees", "cand")
const T157B = path.join(tmp, "trees", "157-s2")
mkTree(T145, "145", "task/145-orders")
mkTree(T157, "157", "task/157-branch-guard")
mkTree(HELPER, "helper", "update/main")
mkTree(CAND, "cand", "0123456789abcdef0123456789abcdef01234567")
mkTree(T157B, "157b", "task/157-s2-1")
const OTHER = path.join(tmp, "other-repo")
mkMain(OTHER)

// ---- tasks and fake dependencies
const tasks = new Map()
const put = (t) => (tasks.set(`${t.project}#${t.n}`, t), t)
put({ project: "crew-harness", n: 145, status: "running", executor: "ses_145", directory: MAIN, worktree: T145, branch: "task/145-orders", sessions: [], side: [] })
put({ project: "crew-harness", n: 157, status: "running", executor: "ses_157", reviewer: "ses_rev157", directory: MAIN, worktree: T157, branch: "task/157-branch-guard", sessions: [], side: [] })
put({ project: "crew-harness", n: 158, status: "reviewing", executor: "ses_158", reviewer: "ses_rev157", directory: MAIN, worktree: T157B, branch: "task/158", sessions: [], side: [{ worktree: CAND }] })
put({ project: "crew-harness", n: 160, status: "running", executor: "ses_160", directory: MAIN, sessions: [], side: [] }) // no tree: not controlled
put({ project: "crew-harness", n: 161, status: "done", executor: "ses_161", directory: MAIN, worktree: T145, branch: "task/161-x", sessions: [], side: [] })
const t157b = put({ project: "crew-harness", n: 170, status: "running", executor: "ses_170", directory: MAIN, worktree: T157, branch: "task/170", sessions: [{ session: "ses_170", place: "own", worktree: T157B, branch: "task/157-s2-1" }], side: [] })
const clock = { t: Date.parse("2026-10-23T12:00:00Z") }
const locks = new Set()
const logs = []
const taskNotes = []
const deps = {
  base,
  log: (l) => logs.push(l),
  now: () => clock.t,
  projectRoot: (p) => (p === "crew-harness" ? MAIN : p === "elsewhere" ? path.join(tmp, "no-repo-here") : undefined),
  targetBranch: () => "main",
  task: (p, nn) => tasks.get(`${p}#${nn}`),
  openTasks: () => [...tasks.values()].filter((t) => !["done", "cancelled"].includes(t.status)),
  holdsLock: (p, s, nn) => locks.has(`${p}#${nn}#${s}`),
  taskNote: (p, nn, text) => taskNotes.push([p, nn, text]),
}
const integrator = { session: "ses_int", role: "integrator", project: "crew-harness" }
const exec145 = { session: "ses_145", role: "worker", project: "crew-harness", task: { project: "crew-harness", n: 145 } }
const exec157 = { session: "ses_157", role: "worker", project: "crew-harness", task: { project: "crew-harness", n: 157 } }
const rev157 = { session: "ses_rev157", role: "worker", project: "crew-harness", review: { project: "crew-harness", n: 158 } }
const orchestrator = { session: "ses_orch", role: "orchestrator", project: "crew-harness" }
const ownerTab = { session: "ses_owner", role: "worker", project: "crew-harness" }
const exp = (card) => expectedFor(card, deps)
const real = (p) => { try { return realpathSync.native(String(p)).toLowerCase() } catch { return path.resolve(String(p)).toLowerCase() } }
const same = (a, b) => real(a) === real(b)

// ---- the expected pair by the role
const ei = exp(integrator)
cell("integrator: the main copy of the project and its target branch", ei?.role === "integrator" && same(ei?.dirs?.[0], MAIN) && ei?.branch === "main", J(ei));
cell("integrator whose project root is not in a repository is not controlled", exp({ ...integrator, project: "elsewhere" }) === undefined, J(exp({ ...integrator, project: "elsewhere" })))
const ee = exp(exec157)
cell("executor: the tree of its task and the branch of the task", ee?.role === "executor" && same(ee?.dirs?.[0], T157) && ee?.branch === "task/157-branch-guard", J(ee))
const e170 = exp({ session: "ses_170", role: "worker", project: "crew-harness", task: { project: "crew-harness", n: 170 } })
cell("executor of a session with its own tree: that tree and that branch", same(e170?.dirs?.[0], T157B) && e170?.branch === "task/157-s2-1", J(e170))
cell("executor of a task without a recorded tree is not controlled", exp({ session: "ses_160", role: "worker", project: "crew-harness", task: { project: "crew-harness", n: 160 } }) === undefined, "")
cell("a session of a finished task is not controlled", exp({ session: "ses_161", role: "worker", project: "crew-harness", task: { project: "crew-harness", n: 161 } }) === undefined, "")
cell("a card of the task, but the session is no longer its executor: not controlled", exp({ ...exec157, session: "ses_old" }) === undefined, "")
const er = exp(rev157)
cell("reviewer: the repository of the task, the main copy on the target branch", er?.role === "reviewer" && er?.detachedOk === true && er?.branch === undefined && same(er?.main, MAIN), J(er))
cell("orchestrator and a tab of the owner are not controlled", exp(orchestrator) === undefined && exp(ownerTab) === undefined, "")

// ---- the check at a turn
const at = (card, dir) => checkWindow(card, dir, deps)
const okState = at(integrator, MAIN)
cell("integrator in the main copy on main: ok, no warning", okState?.status === "ok" && turnWarning(okState) === undefined, J(okState))
cell("the state file is written for the panel (expected and actual)", readState(base, "ses_int")?.status === "ok" && readState(base, "ses_int")?.expected?.branch === "main", J(readState(base, "ses_int")))
const drift145 = at(integrator, T145)
const warn145 = turnWarning(drift145)
cell("the window of the integrator in the tree of task 145 (the case of 2026-10-23): drift", drift145?.status === "drift", J(drift145))
cell("the warning is one line: the window is not on its branch, expected and actual", typeof warn145 === "string" && !warn145.includes("\n") && warn145.includes("окно не на своей ветке") && warn145.includes("ожидалось") && warn145.includes("crew-harness") && warn145.includes("фактически") && warn145.includes("task/145-orders"), J(warn145))
cell("the warning names the way back (session_move or a note)", /session_move/.test(warn145 ?? "") && /crew_branch_note/.test(warn145 ?? ""), J(warn145))
const j1 = readJournal(base)
cell("the drift is written to the journal once, with the pair it went to", j1.filter((l) => l.kind === "drift" && l.session === "ses_int").length === 1 && J(j1).includes("task/145-orders"), J(j1))
at(integrator, T145)
cell("a repeated check of the same drift does not repeat the line", readJournal(base).filter((l) => l.kind === "drift" && l.session === "ses_int").length === 1, J(readJournal(base)))
cell("and the log of the plugin has one line, not one per turn", logs.filter((l) => l.includes("ses_int") && /not where it should be/.test(l)).length === 1, J(logs))
const back = at(integrator, MAIN)
cell("back to the main copy: ok, and the journal says restored", back?.status === "ok" && readJournal(base).some((l) => l.kind === "restored" && l.session === "ses_int"), J([back, readJournal(base)]))

setBranch(MAIN, "feature/x")
const moved = at(integrator, MAIN)
cell("the branch changed between turns (main -> feature/x): drift with the reason", moved?.status === "drift" && /ветк/.test(moved?.reason ?? "") && turnWarning(moved).includes("feature/x"), J(moved))
cell("the journal keeps was -> became", readJournal(base).some((l) => l.kind === "drift" && l.from?.includes("main") && l.to?.includes("feature/x")), J(readJournal(base)))
setBranch(MAIN, "main")
at(integrator, MAIN)

const wOnMain = at(exec157, MAIN)
cell("executor in the main copy: drift (the folder is not its tree)", wOnMain?.status === "drift" && /каталог/.test(wOnMain?.reason ?? ""), J(wOnMain))
cell("executor in its tree on its branch: ok", at(exec157, T157)?.status === "ok", J(at(exec157, T157)))
setBranch(T157, "main")
const wBranch = at(exec157, T157)
cell("executor in its tree but on main: drift with the branch", wBranch?.status === "drift" && /ветк/.test(wBranch?.reason ?? "") && turnWarning(wBranch).includes("task/157-branch-guard"), J(wBranch))
setBranch(T157, "task/157-branch-guard")
at(exec157, T157)
cell("reviewer in a candidate tree on a detached HEAD: allowed, ok", at(rev157, CAND)?.status === "ok", J(at(rev157, CAND)))
cell("reviewer in the main copy on main: ok", at(rev157, MAIN)?.status === "ok", J(at(rev157, MAIN)))
setBranch(MAIN, "wip/review")
cell("reviewer in the main copy on another branch: drift", at(rev157, MAIN)?.status === "drift", J(at(rev157, MAIN)))
setBranch(MAIN, "main")
cell("reviewer in another repository: drift", at(rev157, OTHER)?.status === "drift", J(at(rev157, OTHER)))
const lost = at(exec157, path.join(tmp, "gone", "dir"))
cell("a folder that cannot be read: status unknown, no warning (diagnosis only)", lost?.status === "unknown" && turnWarning(lost) === undefined, J(lost))
cell("the orchestrator is never checked: no state, no journal line", at(orchestrator, T145) === undefined && readState(base, "ses_orch") === undefined, "")

// ---- commands
const bash = (card, dir, command, extra = {}) => judgeBash(card, dir, { command, ...extra }, deps)
const denied = (v) => typeof v?.deny === "string" && v.deny.length > 0
const allowed = (v) => !!v && v.missing === undefined && typeof v.deny !== "string"
cell("integrator: git checkout in the main copy without a reason is refused, the answer asks for the reason", denied(bash(integrator, MAIN, "git checkout feature/x")) && /crew_branch_note/.test(bash(integrator, MAIN, "git checkout feature/x").deny) && /зачем/.test(bash(integrator, MAIN, "git checkout feature/x").deny), J(bash(integrator, MAIN, "git checkout feature/x")))
cell("integrator: cherry-pick, merge, rebase, reset, commit, switch in the main copy are refused", ["git cherry-pick abc123", "git merge --ff-only x", "git rebase main", "git reset --hard HEAD~1", "git commit -m x", "git switch -c y"].every((c) => denied(bash(integrator, MAIN, c))), J(["git cherry-pick abc123", "git merge x"].map((c) => bash(integrator, MAIN, c))))
cell("reading is never refused: status, log, diff, show, fetch", ["git status", "git log --oneline -5", "git diff", "git show HEAD", "git fetch", "git checkout -- a.txt", "git branch --show-current"].every((c) => allowed(bash(integrator, MAIN, c))), J(bash(integrator, MAIN, "git status")))
cell("a command without git is not judged", allowed(bash(integrator, MAIN, "npm test | tail -5")), "")
cell("integrator: git -C <own helper tree> commit passes (the tree is not the main copy and not someone's task)", allowed(bash(integrator, MAIN, `git -C ${fw(HELPER)} commit -m x`)), J(bash(integrator, MAIN, `git -C ${fw(HELPER)} commit -m x`)))
cell("integrator: cd <helper tree> && git merge passes", allowed(bash(integrator, MAIN, `cd ${fw(HELPER)} && git merge --ff-only x`)), "")
cell("integrator: git -C <tree of task 145> commit is refused (someone else's tree)", denied(bash(integrator, MAIN, `git -C ${fw(T145)} commit -m x`)) && /145/.test(bash(integrator, MAIN, `git -C ${fw(T145)} commit -m x`).deny), J(bash(integrator, MAIN, `git -C ${fw(T145)} commit -m x`)))
cell("integrator standing in the tree of task 145: a bare git commit is refused too", denied(bash(integrator, T145, "git commit -m x")), "")
cell("workdir of the command is the folder of the call, not the folder of the window", allowed(bash(integrator, MAIN, "git commit -m x", { workdir: HELPER })) && denied(bash(integrator, HELPER, "git commit -m x", { workdir: MAIN })), "")
cell("a repository that is not the project's is not controlled", allowed(bash(integrator, MAIN, `git -C ${fw(OTHER)} checkout x`)), "")
cell("an unexpanded variable is passed with a line in the journal, not guessed", allowed(bash(integrator, HELPER, 'git -C "$WT" commit -m x')) && logs.some((l) => /unresolved/.test(l)), J(logs.slice(-3)))
cell("executor: a commit in its own tree on its branch passes", allowed(bash(exec157, T157, "git add -- a.txt && git commit -s -m x")), J(bash(exec157, T157, "git commit -m x")))
cell("executor: git -C <main copy> merge is refused", denied(bash(exec157, T157, `git -C ${fw(MAIN)} merge x`)), "")
cell("executor: a commit in the tree of someone else's task is refused", denied(bash(exec157, T157, `git -C ${fw(T145)} commit -m x`)), "")
setBranch(T157, "main")
cell("executor on a wrong branch: a commit is refused with the branch it should be on", denied(bash(exec157, T157, "git commit -m x")) && bash(exec157, T157, "git commit -m x").deny.includes("task/157-branch-guard"), J(bash(exec157, T157, "git commit -m x")))
cell("and the switch back to its branch always passes (a way out must not need a reason)", allowed(bash(exec157, T157, "git switch task/157-branch-guard")) && allowed(bash(exec157, T157, "git checkout task/157-branch-guard")), "")
cell("but a switch to a third branch is refused", denied(bash(exec157, T157, "git switch other")), "")
setBranch(T157, "task/157-branch-guard")
cell("executor on its branch: leaving it in its own tree (switch, checkout -b, --detach) needs a reason too", ["git switch other", "git checkout -b side", "git switch -c side2", "git checkout --detach HEAD"].every((c) => denied(bash(exec157, T157, c))) && allowed(bash(exec157, T157, "git checkout task/157-branch-guard")) && allowed(bash(exec157, T157, "git rebase main")), J(bash(exec157, T157, "git switch other")))
cell("a command in a subshell and a pipeline is read like any other", denied(bash(exec157, T157, `(cd ${fw(MAIN)} && git commit -m x) | cat`)) && allowed(bash(exec157, T157, `(cd ${fw(MAIN)} && git status) && git commit -m x`)), J(bash(exec157, T157, `(cd ${fw(MAIN)} && git status) && git commit -m x`)))
cell("git commit --dry-run and git merge --abort are not changes", allowed(bash(integrator, MAIN, "git commit --dry-run")) && allowed(bash(integrator, MAIN, "git merge --abort")), "")
cell("reviewer: a merge in the main copy without the lock is refused", denied(bash(rev157, MAIN, "git merge --ff-only integrate/t157")), "")
locks.add("crew-harness#158#ses_rev157")
cell("reviewer holding the merge lock of its task: the same merge passes", allowed(bash(rev157, MAIN, "git merge --ff-only integrate/t157")), "")
locks.clear()
cell("reviewer: commands in a candidate tree pass", allowed(bash(rev157, MAIN, `git -C ${fw(CAND)} checkout --detach HEAD`)), "")
cell("orchestrator and a tab of the owner: nothing is refused", allowed(bash(orchestrator, MAIN, "git reset --hard")) && allowed(bash(ownerTab, MAIN, "git checkout x")), "")

// ---- the reason
const badNote = noteBranch(integrator, MAIN, { what: "git checkout feature/x", why: "", who: "" }, deps)
cell("a note without the reason is not accepted and writes nothing", badNote?.ok === false && !readJournal(base).some((l) => l.kind === "note"), J(badNote))
const note = noteBranch(integrator, MAIN, { what: "git merge --ff-only update/main", why: "update of the main copy by the word of the owner", who: "owner, 2026-10-23: обновляй" }, deps)
cell("a note with what, why and who is accepted", note?.ok === true && /30/.test(note?.text ?? ""), J(note))
const nj = readJournal(base).find((l) => l.kind === "note")
cell("the journal line has the time, the role, what, why and who", !!nj && typeof nj.at === "number" && nj.role === "integrator" && /merge/.test(nj.what) && /update of the main copy/.test(nj.why) && /обновляй/.test(nj.who), J(nj))
cell("with the reason the command passes in that folder", allowed(bash(integrator, MAIN, "git merge --ff-only update/main")), J(bash(integrator, MAIN, "git merge --ff-only update/main")))
cell("but not in another one (the reason names its folder)", denied(bash(integrator, MAIN, `git -C ${fw(T145)} merge x`)), "")
clock.t += 31 * 60_000
cell("the permission lasts 30 minutes, then the command is refused again", denied(bash(integrator, MAIN, "git merge --ff-only update/main")), "")
cell("the note of the integrator (not bound to a task) writes no line to the history of a task", note?.ok === true && taskNotes.length === 0, J(taskNotes))
const exNote = noteBranch(exec157, T157, { what: "git switch main", why: "the owner asked to look at main", who: "owner, 2026-10-23", branch: "main" }, deps)
cell("a note of an executor lands in the history of its task", exNote?.ok === true && taskNotes.some((t) => t[0] === "crew-harness" && t[1] === 157 && /look at main/.test(t[2])), J(taskNotes))
setBranch(T157, "main")
const noted = at(exec157, T157)
cell("with the reason the changed branch is the expectation: ok, and the change is the yellow one", noted?.status === "ok" && !!noted?.override && !!readState(base, "ses_157")?.lastNote, J(noted))
setBranch(T157, "task/157-branch-guard")
cell("after the reason the way back to the old branch is the drift of the new expectation? no: the old pair stays allowed", at(exec157, T157)?.status === "ok", J(at(exec157, T157)))
cell("the reason is tied to the task: for another task the old reason does not hold", exp({ ...exec157, session: "ses_145", task: { project: "crew-harness", n: 145 } }) !== undefined && at({ ...exec145 }, T157)?.status === "drift", "")

// ---- the writes of files
const w = (card, dir, tool, input) => judgeWrite(card, dir, tool, input, deps)
cell("executor: writing a file in the main copy is refused (the live system)", typeof w(exec157, T157, "write", { filePath: path.join(MAIN, "a.md"), content: "x" }) === "string", "")
cell("executor: writing a file in its own tree passes", w(exec157, T157, "edit", { filePath: path.join(T157, "a.md") }) === undefined, "")
cell("integrator: writing into the tree of someone else's task is refused", typeof w(integrator, MAIN, "write", { filePath: path.join(T145, "a.ts") }) === "string", "")
cell("integrator in the drifted window: writing into that folder is refused, into the helper tree passes", typeof w(integrator, T145, "edit", { filePath: path.join(T145, "x.ts") }) === "string" && w(integrator, T145, "edit", { filePath: path.join(HELPER, "x.ts") }) === undefined, "")
cell("the orchestrator may write anywhere", w(orchestrator, MAIN, "write", { filePath: path.join(T145, "a.ts") }) === undefined, "")


// ---- (acceptance 4.1) a stopped rebase in the tree of an executor is not a drift, and its way out is never refused
const gitdirOf = (dir) => path.dirname(heads.get(dir))
const sha40 = "89abcdef0123456789abcdef0123456789abcdef"
writeFileSync(heads.get(T157), `${sha40}\n`)
cell("without the rebase marker a bare hash in the own tree is a drift", at(exec157, T157)?.status === "drift", J(at(exec157, T157)))
mkdirSync(path.join(gitdirOf(T157), "rebase-merge"), { recursive: true })
writeFileSync(path.join(gitdirOf(T157), "rebase-merge", "head-name"), "refs/heads/task/157-branch-guard\n")
const rb = at(exec157, T157)
cell("a stopped rebase on the own branch (rebase-merge/head-name): ok, no warning", rb?.status === "ok" && turnWarning(rb) === undefined, J(rb))
cell("rebase --continue, --skip, --abort and the commit of the resolved conflict pass", ["git rebase --continue", "git rebase --skip", "git rebase --abort", "git add -A && git commit -m resolved"].every((c) => allowed(bash(exec157, T157, c))), J(bash(exec157, T157, "git rebase --continue")))
cell("but a stopped rebase of another branch is still a drift", (writeFileSync(path.join(gitdirOf(T157), "rebase-merge", "head-name"), "refs/heads/other\n"), at(exec157, T157)?.status === "drift"), "")
rmSync(path.join(gitdirOf(T157), "rebase-merge"), { recursive: true, force: true })
mkdirSync(path.join(gitdirOf(T157), "rebase-apply"), { recursive: true })
writeFileSync(path.join(gitdirOf(T157), "rebase-apply", "head-name"), "refs/heads/task/157-branch-guard\n")
cell("a stopped rebase (rebase-apply/head-name): ok, and --continue passes even when the window is off its branch", at(exec157, T157)?.status === "ok" && allowed(bash(exec157, T157, "git rebase --continue")), "")
rmSync(path.join(gitdirOf(T157), "rebase-apply"), { recursive: true, force: true })
setBranch(T157, "main")
cell("off its branch, --continue/--skip/--abort pass without a reason (they never block)", ["git rebase --continue", "git rebase --skip", "git rebase --abort", "git merge --abort", "git cherry-pick --continue"].every((c) => allowed(bash(exec157, T157, c))), J(bash(exec157, T157, "git rebase --continue")))
setBranch(T157, "task/157-branch-guard")
at(exec157, T157)

// ---- (acceptance 4.2) git checkout <file> without "--" is a restore of a file
mkdirSync(path.join(MAIN, "src"), { recursive: true })
writeFileSync(path.join(MAIN, "src", "foo.ts"), "x")
mkdirSync(path.join(MAIN, ".git", "refs", "heads"), { recursive: true })
writeFileSync(path.join(MAIN, ".git", "refs", "heads", "main"), "0123456789abcdef0123456789abcdef01234567\n")
cell("integrator: git checkout src/foo.ts (a file, not a branch) is not refused", allowed(bash(integrator, MAIN, "git checkout src/foo.ts")), J(bash(integrator, MAIN, "git checkout src/foo.ts")))
cell("integrator: git checkout of a branch in the main copy is still refused", denied(bash(integrator, MAIN, "git checkout feature/x")), "")

// ---- (acceptance 4.3) Windows paths with a backslash and no quotes are read (the tools powershell and pwsh)
if (process.platform === "win32") {
  cell("git -C D:\\tree commit without quotes in the tree of someone else's task is refused", denied(bash(integrator, MAIN, `git -C ${T145} commit -m x`)), J(bash(integrator, MAIN, `git -C ${T145} commit -m x`)))
  cell("cd D:\\tree && git merge without quotes is refused too", denied(bash(integrator, MAIN, `cd ${T145} && git merge x`)), "")
}
cell("PowerShell Set-Location <tree>; git commit is read like cd", denied(bash(integrator, MAIN, `Set-Location ${fw(T145)}; git commit -m x`)) && allowed(bash(integrator, MAIN, `Set-Location ${fw(HELPER)}; git commit -m x`)), "")

// ---- (acceptance 4.6) the permission is kept per folder: a second note does not wipe the first
clock.t += 40 * 60_000
const nA = noteBranch(integrator, MAIN, { what: "git merge --ff-only update/main in the main copy", why: "the update of the main copy by the word of the owner", who: "owner, 2026-10-23", directory: MAIN }, deps)
const nB = noteBranch(integrator, MAIN, { what: "git commit in the tree of 145", why: "a fix of the report asked by the owner", who: "owner, 2026-10-23", directory: T145 }, deps)
cell("two notes for two folders: both permissions hold", nA?.ok === true && nB?.ok === true && allowed(bash(integrator, MAIN, "git merge --ff-only update/main")) && allowed(bash(integrator, MAIN, `git -C ${fw(T145)} commit -m x`)), J([nA, nB]))
cell("a folder without a note is still refused", denied(bash(integrator, MAIN, `git -C ${fw(T157)} commit -m x`)), "")
clock.t += 31 * 60_000
cell("each permission ends 30 minutes after its own note", denied(bash(integrator, MAIN, "git merge --ff-only update/main")) && denied(bash(integrator, MAIN, `git -C ${fw(T145)} commit -m x`)), "")
const nC = noteBranch(integrator, MAIN, { what: "git merge in the main copy again", why: "the second update of the day", who: "owner, 2026-10-23", directory: MAIN }, deps)
clock.t += 20 * 60_000
const nD = noteBranch(integrator, MAIN, { what: "git merge in the main copy once more", why: "and one more time, renewed", who: "owner, 2026-10-23", directory: MAIN }, deps)
clock.t += 20 * 60_000
cell("a repeated note for the same folder renews its term", nC?.ok === true && nD?.ok === true && allowed(bash(integrator, MAIN, "git merge x")), J(readState(base, "ses_int")))
cell("the state keeps no more than one permission per folder", (readState(base, "ses_int")?.passes ?? []).length === 1, J(readState(base, "ses_int")?.passes))

// ---- (acceptance 5) a reviewer writes the files of its task in the main copy; nothing else
const folder158 = "doc/tasks/158-review-x"
tasks.get("crew-harness#158").folder = folder158
cell("reviewer without the lock: a write into doc/tasks/<its task>/ of the main copy passes (the log, the evidence)", w(rev157, MAIN, "write", { filePath: path.join(MAIN, folder158, "log.md") }) === undefined && w(rev157, MAIN, "edit", { filePath: path.join(MAIN, folder158, "task", "evidence.md") }) === undefined, J(w(rev157, MAIN, "write", { filePath: path.join(MAIN, folder158, "log.md") })))
cell("reviewer: a patch that writes only into its folder passes", w(rev157, MAIN, "patch", { patchText: `*** Begin Patch\n*** Update File: ${folder158}/progress.log\n+x\n*** End Patch` }) === undefined, "")
cell("reviewer: a write outside its task folder in the main copy is still refused (code, another task)", typeof w(rev157, MAIN, "write", { filePath: path.join(MAIN, "src", "a.ts") }) === "string" && typeof w(rev157, MAIN, "write", { filePath: path.join(MAIN, "doc/tasks/999-other/log.md") }) === "string", "")
cell("reviewer: a path that climbs out of its folder (..) is not its folder", typeof w(rev157, MAIN, "write", { filePath: path.join(MAIN, folder158, "..", "..", "..", "src", "a.ts") }) === "string", "")
cell("a task folder named only by the number (no folder in the record) is read from the number", (delete tasks.get("crew-harness#158").folder, w(rev157, MAIN, "write", { filePath: path.join(MAIN, "doc/tasks/158-anything/log.md") }) === undefined), "")
cell("an executor still may not write into the main copy, even into doc/tasks", typeof w(exec157, T157, "write", { filePath: path.join(MAIN, "doc/tasks/157-branch-guard/log.md") }) === "string", "")
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-branch-guard.test: FAIL ${fail} of ${n}${bg.missing ? " (module: " + bg.missing + ")" : ""}` : `crew-branch-guard.test ok (${n} checks)`)
process.exit(fail ? 1 : 0)

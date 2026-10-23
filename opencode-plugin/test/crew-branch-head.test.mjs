// Self-test of the cheap reading of the branch and of the parsing of shell commands (task 157, node >= 24):  node test/crew-branch-head.test.mjs
// readHead reads .git/HEAD without running git: a main copy (.git is a folder), a working tree (.git is a file "gitdir: ..." and
// commondir), a detached HEAD, a folder that is not a repository. gitCalls finds the git calls of a shell command with the folder
// each of them acts on (cd, git -C, --git-dir/--work-tree, bash -c) and mutationOf says which of them change the branch or the history.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-branch-head-"))
const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
let fail = 0
let n = 0
const cell = (name, ok, detail) => {
  n++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const J = (v) => JSON.stringify(v)
// the module does not exist on the old code: every check below is red then (the red probe), not a crash of the file
const bh = await import(pathToFileURL(path.join(plugin, "branch-head.ts")).href).catch((e) => ({ missing: String(e?.message ?? e) }))
const need = (name) => (typeof bh[name] === "function" ? bh[name] : () => ({ missing: name }))
const readHead = need("readHead")
const gitCallsRaw = need("gitCalls")
const gitCalls = (cmd, cwd) => {
  const r = gitCallsRaw(cmd, cwd)
  return Array.isArray(r) ? r : [{ sub: "MISSING", args: [], dir: undefined }]
}
const mutationOf = need("mutationOf")
const sameTree = need("sameTree")
const writeTargetsRaw = need("writeTargets")
const writeTargets = (t, i) => {
  const r = writeTargetsRaw(t, i)
  return Array.isArray(r) ? r : ["MISSING"]
}

const fw = (p) => p.replace(/\\/g, "/")
const main = path.join(tmp, "repo")
mkdirSync(path.join(main, ".git"), { recursive: true })
writeFileSync(path.join(main, ".git", "HEAD"), "ref: refs/heads/main\n")
const wt = path.join(tmp, "trees", "task-157")
const gd = path.join(main, ".git", "worktrees", "task-157")
mkdirSync(gd, { recursive: true })
mkdirSync(wt, { recursive: true })
writeFileSync(path.join(gd, "HEAD"), "ref: refs/heads/task/157-branch-guard\n")
writeFileSync(path.join(gd, "commondir"), "../..\n")
writeFileSync(path.join(wt, ".git"), `gitdir: ${fw(gd)}\n`)
const cand = path.join(tmp, "trees", "cand")
const gdc = path.join(main, ".git", "worktrees", "cand")
mkdirSync(gdc, { recursive: true })
mkdirSync(cand, { recursive: true })
writeFileSync(path.join(gdc, "HEAD"), "0123456789abcdef0123456789abcdef01234567\n")
writeFileSync(path.join(gdc, "commondir"), "../..\n")
writeFileSync(path.join(cand, ".git"), `gitdir: ${fw(gdc)}\n`)

// ---- readHead
const h1 = readHead(main)
cell("main copy: top, branch, main=true", h1?.branch === "main" && h1?.main === true && sameTree?.(h1.top, main), J(h1))
const h2 = readHead(wt)
cell("working tree: branch from the HEAD of its gitdir, main=false", h2?.branch === "task/157-branch-guard" && h2?.main === false, J(h2))
cell("working tree: the common dir is the .git of the main copy", sameTree?.(h2?.common, path.join(main, ".git")), J(h2))
cell("main copy and its tree share the common dir", !!h1 && !!h2 && sameTree?.(h1.common, h2.common) === true, J([h1, h2]))
const sub = path.join(wt, "src", "deep")
mkdirSync(sub, { recursive: true })
cell("a subfolder reads the repository above it", sameTree?.(readHead(sub)?.top, wt) === true && readHead(sub)?.branch === "task/157-branch-guard", J(readHead(sub)))
const h3 = readHead(cand)
cell("detached HEAD: no branch, the commit", h3?.branch === undefined && h3?.detached === "0123456789abcdef0123456789abcdef01234567", J(h3))
cell("a folder that is not a repository: undefined", readHead(tmp) === undefined && readHead(path.join(tmp, "nothing-here")) === undefined, J(readHead(tmp)))
writeFileSync(path.join(main, ".git", "HEAD"), "ref: refs/heads/feature/x\n")
cell("HEAD is read afresh each call (the branch changed)", readHead(main)?.branch === "feature/x", J(readHead(main)))
writeFileSync(path.join(main, ".git", "HEAD"), "ref: refs/heads/main\n")
cell("sameTree compares by the real path, not by the spelling", sameTree?.(wt, `${fw(wt)}/`) === true && sameTree?.(wt, main) === false && sameTree?.(undefined, main) === false, "")
// a real git: the format of a worktree that git itself writes
let real
try {
  const r = path.join(tmp, "real")
  const g = (...a) => execFileSync("git", ["-C", r, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "ignore" })
  mkdirSync(r, { recursive: true })
  g("init", "-q", "-b", "main")
  g("commit", "-q", "--allow-empty", "-m", "i")
  g("worktree", "add", "-q", "-b", "task/real", path.join(tmp, "real-wt"))
  real = { main: readHead(r), tree: readHead(path.join(tmp, "real-wt")) }
} catch (e) {
  real = { error: String(e) }
}
cell("a real git worktree: the branch and the common dir are read", real.tree?.branch === "task/real" && real.tree?.main === false && real.main?.branch === "main" && sameTree?.(real.tree?.common, real.main?.common) === true, J(real))

// ---- gitCalls
const R = (p) => fw(path.resolve(p))
const dirs = (cmd, cwd = main) => gitCalls(cmd, cwd).map((c) => `${c.sub}@${c.dir === undefined ? "?" : fw(c.dir)}`)
const at = (p) => R(p)
cell("a plain git call acts on the folder of the command", J(dirs("git status")) === J([`status@${at(main)}`]), J(dirs("git status")))
cell("git -C: the folder is the one named (relative to the folder of the command)", J(dirs("git -C trees/task-157 commit -m x", tmp)) === J([`commit@${at(wt)}`]), J(dirs("git -C trees/task-157 commit -m x", tmp)))
cell("git -C -C: the second is relative to the first", J(dirs("git -C trees -C task-157 log", tmp)) === J([`log@${at(wt)}`]), J(dirs("git -C trees -C task-157 log", tmp)))
cell("cd then git: the call acts on the folder after cd", J(dirs(`cd "${fw(wt)}" && git commit -m x`, main)) === J([`commit@${at(wt)}`]), J(dirs(`cd "${fw(wt)}" && git commit -m x`)))
cell("cd in a different segment does not reach back to the call before it", J(dirs(`git status; cd ${fw(wt)}; git log`, main)) === J([`status@${at(main)}`, `log@${at(wt)}`]), J(dirs(`git status; cd ${fw(wt)}; git log`)))
cell("global options before the subcommand are skipped (-c, --no-pager)", gitCalls("git -c core.x=1 --no-pager checkout main", main)[0]?.sub === "checkout", J(gitCalls("git -c core.x=1 --no-pager checkout main", main)))
cell("env assignments and wrappers before git are skipped", gitCalls("GIT_X=1 time git reset --hard", main)[0]?.sub === "reset", J(gitCalls("GIT_X=1 time git reset --hard", main)))
cell("pipes, && and || give separate calls", gitCalls("git fetch && git merge x || git merge --abort | cat", main).map((c) => c.sub).join(",") === "fetch,merge,merge", J(gitCalls("git fetch && git merge x || git merge --abort | cat", main)))
cell("a quoted path with spaces is one argument", J(dirs(`git -C "${fw(path.join(tmp, "a b"))}" commit`, main)) === J([`commit@${at(path.join(tmp, "a b"))}`]), J(dirs(`git -C "${fw(path.join(tmp, "a b"))}" commit`)))
cell("--git-dir with --work-tree: the work tree is the folder", J(dirs(`git --git-dir=${fw(gd)} --work-tree=${fw(wt)} checkout x`, main)) === J([`checkout@${at(wt)}`]), J(dirs(`git --git-dir=${fw(gd)} --work-tree=${fw(wt)} checkout x`)))
cell("bash -c is read inside", gitCalls(`bash -c "git -C ${fw(wt)} reset --hard"`, main).map((c) => `${c.sub}@${fw(c.dir ?? "?")}`).join() === `reset@${at(wt)}`, J(gitCalls(`bash -c "git -C ${fw(wt)} reset --hard"`, main)))
cell("an unexpanded variable in -C: the folder is unknown (undefined), the call is still listed", J(gitCalls('git -C "$WT" commit -m x', main).map((c) => [c.sub, c.dir])) === J([["commit", undefined]]), J(gitCalls('git -C "$WT" commit -m x', main)))
cell("a call in a string argument is not a call (echo 'git reset')", gitCalls("echo 'git reset --hard' > note.txt", main).length === 0, J(gitCalls("echo 'git reset --hard' > note.txt", main)))
cell("an empty or non-string command: no calls", gitCalls("", main).length === 0 && gitCalls(undefined, main).length === 0, "")
if (process.platform === "win32") cell("a Git Bash path /c/x is the folder C:/x", J(dirs("git -C /c/work/x commit", main)) === J(["commit@C:/work/x"]), J(dirs("git -C /c/work/x commit", main)))

// ---- mutationOf
const m = (sub, ...args) => mutationOf(sub, args)
cell("checkout of a branch changes the branch and names the target", m("checkout", "main")?.kind === "branch" && m("checkout", "main")?.to === "main", J(m("checkout", "main")))
cell("switch changes the branch", m("switch", "x")?.kind === "branch" && m("switch", "x")?.to === "x", J(m("switch", "x")))
cell("checkout -b: a new branch, no named target", m("checkout", "-b", "new")?.kind === "branch" && m("checkout", "-b", "new")?.to === undefined, J(m("checkout", "-b", "new")))
cell("checkout -- file and checkout of paths are not a change of the branch", m("checkout", "--", "a.txt") === undefined && m("checkout", "HEAD", "--", "a.txt") === undefined, J([m("checkout", "--", "a.txt"), m("checkout", "HEAD", "--", "a.txt")]))
cell("merge, cherry-pick, rebase, reset, commit, pull, revert, am are changes of the history", ["merge", "cherry-pick", "rebase", "reset", "commit", "pull", "revert", "am"].every((s) => m(s, "x")?.kind === "history"), "")
cell("status, log, diff, show, fetch, branch, restore are not", ["status", "log", "diff", "show", "fetch", "branch", "restore", "stash", "push", "add"].every((s) => m(s) === undefined), "")
cell("--abort is a way back, not a change", m("merge", "--abort") === undefined && m("rebase", "--abort") === undefined && m("cherry-pick", "--abort") === undefined, "")
cell("reset of paths (-- file) is not a change of the history", m("reset", "--", "a.txt") === undefined && m("reset", "--hard")?.kind === "history", J([m("reset", "--", "a.txt"), m("reset", "--hard")]))

// ---- the files a write tool touches
const wtT = (tool, input) => writeTargets(tool, input)
cell("write/edit: filePath, path or file_path", J(wtT("write", { filePath: "/x/a.md" })) === J(["/x/a.md"]) && J(wtT("edit", { path: "/x/b.ts" })) === J(["/x/b.ts"]) && J(wtT("multiedit", { file_path: "/x/c" })) === J(["/x/c"]), J([wtT("write", { filePath: "/x/a.md" }), wtT("edit", { path: "/x/b.ts" })]))
cell("patch: the files of the headers", J(wtT("patch", { patchText: "*** Begin Patch\n*** Update File: src/a.ts\n+x\n*** Add File: doc/b.md\n+y\n*** Delete File: old.txt\n*** End Patch" })) === J(["src/a.ts", "doc/b.md", "old.txt"]), J(wtT("patch", { patchText: "*** Update File: src/a.ts\n*** Add File: doc/b.md" })))
cell("other tools and no input: no files", wtT("read", { path: "/x" }).length === 0 && wtT("write", null).length === 0, "")


// ---- (acceptance 4.1) a stopped rebase: HEAD holds a bare hash, the branch is in rebase-merge/head-name or rebase-apply/head-name
const mkRebase = (name, kind) => {
  const dir = path.join(tmp, "trees", name)
  const g = path.join(main, ".git", "worktrees", name)
  mkdirSync(path.join(g, kind), { recursive: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(g, "HEAD"), "89abcdef0123456789abcdef0123456789abcdef\n")
  writeFileSync(path.join(g, "commondir"), "../..\n")
  writeFileSync(path.join(g, kind, "head-name"), "refs/heads/task/157-branch-guard\n")
  writeFileSync(path.join(dir, ".git"), `gitdir: ${fw(g)}\n`)
  return dir
}
const rbm = readHead(mkRebase("rbm", "rebase-merge"))
cell("a stopped rebase (rebase-merge/head-name): the branch is the one being rebased, rebasing=true", rbm?.branch === "task/157-branch-guard" && rbm?.rebasing === true, J(rbm))
const rba = readHead(mkRebase("rba", "rebase-apply"))
cell("a stopped rebase (rebase-apply/head-name): the same", rba?.branch === "task/157-branch-guard" && rba?.rebasing === true, J(rba))
cell("a detached HEAD without a rebase is still detached, not rebasing", h3?.branch === undefined && h3?.rebasing !== true && h3?.detached !== undefined, J(h3))
cell("rebase --continue, --skip, --abort, --quit are never a change", ["--continue", "--skip", "--abort", "--quit"].every((a) => m("rebase", a) === undefined) && m("cherry-pick", "--continue") === undefined && m("merge", "--continue") === undefined, J(m("rebase", "--continue")))

// ---- (acceptance 4.2) git checkout <file> without "--" restores a file, it does not change the branch
mkdirSync(path.join(main, "src"), { recursive: true })
writeFileSync(path.join(main, "src", "foo.ts"), "x")
mkdirSync(path.join(main, ".git", "refs", "heads"), { recursive: true })
writeFileSync(path.join(main, ".git", "refs", "heads", "main"), "0123456789abcdef0123456789abcdef01234567\n")
mkdirSync(path.join(main, "docs"), { recursive: true })
writeFileSync(path.join(main, ".git", "packed-refs"), "# pack-refs\n0123456789abcdef0123456789abcdef01234567 refs/heads/docs\n")
cell("checkout of an existing file that is not a branch is a restore of the file", mutationOf("checkout", ["src/foo.ts"], main) === undefined && mutationOf("checkout", ["src/foo.ts", "src/other.ts"], main) === undefined, J(mutationOf("checkout", ["src/foo.ts"], main)))
cell("checkout of a branch is still a change of the branch", mutationOf("checkout", ["main"], main)?.kind === "branch", J(mutationOf("checkout", ["main"], main)))
cell("a name that is a branch wins over a folder of the same name (packed-refs)", mutationOf("checkout", ["docs"], main)?.kind === "branch", J(mutationOf("checkout", ["docs"], main)))
cell("a name that is neither a file nor a branch is treated as a branch (git may fetch it)", mutationOf("checkout", ["feature/new"], main)?.kind === "branch", J(mutationOf("checkout", ["feature/new"], main)))
cell("without the folder of the call the old rule holds (a name is a branch)", mutationOf("checkout", ["src/foo.ts"])?.kind === "branch", J(mutationOf("checkout", ["src/foo.ts"])))

// ---- (acceptance 4.3) a backslash in a Windows path is not an escape
if (process.platform === "win32") {
  cell("git -C D:\\x commit without quotes", J(dirs(`git -C ${wt} commit -m x`, main)) === J([`commit@${at(wt)}`]), J(dirs(`git -C ${wt} commit -m x`, main)))
  cell("cd D:\\x && git merge without quotes", J(dirs(`cd ${wt} && git merge x`, main)) === J([`merge@${at(wt)}`]), J(dirs(`cd ${wt} && git merge x`, main)))
  cell("a backslash path with a following argument keeps the argument", gitCalls(`git -C ${wt} commit -m "a b"`, main)[0]?.args.join("|") === "-m|a b", J(gitCalls(`git -C ${wt} commit -m "a b"`, main)))
}
cell("PowerShell: Set-Location <dir>; git ... acts in that folder", J(dirs(`Set-Location "${fw(wt)}"; git commit -m x`, main)) === J([`commit@${at(wt)}`]) && J(dirs(`sl ${fw(wt)}; git commit`, main)) === J([`commit@${at(wt)}`]), J(dirs(`Set-Location "${fw(wt)}"; git commit -m x`, main)))
cell("an escaped space outside a drive path is still an escape", gitCalls("git commit -m a\\ b", main)[0]?.args.join("|") === "-m|a b", J(gitCalls("git commit -m a\\ b", main)))
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-branch-head.test: FAIL ${fail} of ${n}${bh.missing ? " (module: " + bh.missing + ")" : ""}` : `crew-branch-head.test ok (${n} checks)`)
process.exit(fail ? 1 : 0)

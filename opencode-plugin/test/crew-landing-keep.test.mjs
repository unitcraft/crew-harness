// Self-test: cleaned {n, keep: [paths]} keeps a worktree as evidence (task 005, REQ-29, the owner's decision of 2026-10-10; node >= 24):
//   node test/crew-landing-keep.test.mjs
// A kept tree is skipped by the cleanup check (as the task's own worktree and as a tree by the name template); it is written to the task
// record (`kept`) and the history; the answer says "Сохранено: <path> (не проверялось уборкой)". The branch of the task must still be deleted.
// Bad paths (missing, a branch, the repository root, a folder outside the worktree folder, more than 8, not an array) are refused with no record.
import { existsSync, mkdirSync, realpathSync } from "node:fs"
import path from "node:path"
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-keep.test")
const H = await harness("crew-landing-keep", { settings: { worktrees: "wt", cleanup: "local" } })
const { call, git, gitTry, proj, tmp, review, core } = H
const REV = "sesREV1"
const norm = (p) => (existsSync(p) ? realpathSync.native(p) : path.resolve(p)).replace(/\\/g, "/").toLowerCase()
const cleaned = (n, more = {}) => call("crew_task", REV, { action: "cleaned", n, ...more })
/** an accepted task with its branch t<n> and an evidence tree wt/proj-<n>-evidence (by the name template of the task) on its own branch */
const accepted = ({ ownTree = false, branch = true } = {}) => {
  const t = H.reviewing()
  const tree = path.join(proj, "wt", `proj-${t.n}-evidence`)
  git(proj, "worktree", "add", "-q", "-b", `ev${t.n}`, tree, "origin/main")
  const x = H.task(t.n)
  x.status = "accepted"
  if (ownTree) x.worktree = tree
  H.tasks.saveTask(x)
  if (!branch) git(proj, "branch", "-D", x.branch)
  return { n: t.n, tree, rel: `wt/proj-${t.n}-evidence`, branch: x.branch }
}
const rec = (n) => H.task(n)
const lines = (n) => H.history(n).filter((h) => /улики сохранены/.test(h))

// ---- without keep: the old refusal
{
  const a = accepted({ branch: false })
  const r = await cleaned(a.n)
  cell("KEEP-1 without keep: the old refusal 'worktree … ещё есть' names the evidence tree", /Очистка не закончена: .*worktree .*evidence ещё есть/.test(r) && rec(a.n).status === "accepted" && !rec(a.n).kept, r)
  const left = await review.leftoversOf(rec(a.n), core.loadConfig(proj), false)
  cell("KEEP-1b without keep: the leftovers reminder names the tree", left.some((l) => /evidence/.test(l)), JSON.stringify(left))

  // ---- keep of a tree by the template: passes, written to the record and the history
  const k = await cleaned(a.n, { keep: [a.rel] })
  const kept = rec(a.n).kept
  cell("KEEP-2 keep: the task is cleaned, the tree is still on disk", rec(a.n).status === "cleaned" && existsSync(a.tree), k)
  cell("KEEP-2b the record has kept [{path, at, by}] and the history has the line", kept?.length === 1 && norm(kept[0].path) === norm(a.tree) && typeof kept[0].at === "number" && kept[0].by === REV && lines(a.n).length === 1 && lines(a.n)[0].toLowerCase().includes(norm(a.tree)), JSON.stringify(kept) + JSON.stringify(H.history(a.n)))
  cell("KEEP-2c the answer: 'Сохранено: <путь> (не проверялось уборкой)'", k.toLowerCase().includes(`сохранено: ${norm(a.tree)} (не проверялось уборкой)`), k)
  const left2 = await review.leftoversOf(rec(a.n), core.loadConfig(proj), false)
  cell("KEEP-2d the leftovers reminder skips the kept tree", !left2.some((l) => /evidence/.test(l)), JSON.stringify(left2))
}

// ---- refusals: nothing is written
{
  const a = accepted({ branch: false })
  const plain = path.join(tmp, "outside")
  mkdirSync(plain, { recursive: true })
  const cases = {
    "a missing path": [`wt/nothing-${a.n}`],
    "a branch name": [`ev${a.n}`],
    "the repository root (absolute)": [proj],
    "the repository root (dot)": ["."],
    "a folder outside the worktree folder": [plain],
    "the worktree folder itself": ["wt"],
    "one good path and one missing": [a.rel, "wt/nope"],
    "nine paths": Array.from({ length: 9 }, (_, i) => (i ? `wt/x${i}` : a.rel)),
    "an empty string": [""],
    "an empty array": [],
    "a number in the array": [a.rel, 7],
    "not an array": a.rel,
  }
  for (const [what, keep] of Object.entries(cases)) {
    const r = await cleaned(a.n, { keep })
    cell(`KEEP-3 ${what}: refused with a reason, nothing is written`, /^Не сохранено: /.test(r) && /Ничего не записано/.test(r) && rec(a.n).status === "accepted" && !rec(a.n).kept && !lines(a.n).length, r)
  }
  const b = await cleaned(a.n, { keep: [`ev${a.n}`] })
  cell("KEEP-3b a branch: the reason says keep saves only the tree", /это ветка/.test(b), b)
  // the main tree through the list of worktrees: the project directory is the main tree
  const wl = git(proj, "worktree", "list", "--porcelain")
  cell("KEEP-3c control: the main tree is the first in git worktree list", norm(wl.split(/\r?\n/)[0].replace(/^worktree /, "")) === norm(proj), wl)
}

// ---- the branch of the task still has to go; the repeated cleaned without keep counts kept
{
  const a = accepted({ branch: true })
  const r = await cleaned(a.n, { keep: [a.tree] })
  cell("KEEP-4 the branch of the task is still required: refused naming only the branch, the tree is not named as a leftover", /локальная ветка t\d+ ещё есть/.test(r) && !/worktree .* ещё есть/.test(r) && rec(a.n).status === "accepted", r)
  cell("KEEP-4b the refusal still records kept (absolute path) and says 'Сохранено'", rec(a.n).kept?.length === 1 && /Сохранено: .*evidence \(не проверялось уборкой\)/.test(r) && lines(a.n).length === 1, r)
  const again = await cleaned(a.n, { keep: [a.rel] })
  cell("KEEP-4c the same tree again by another spelling: no second record, no second history line", rec(a.n).kept.length === 1 && lines(a.n).length === 1 && /локальная ветка/.test(again), JSON.stringify(rec(a.n).kept))
  git(proj, "branch", "-D", a.branch)
  const fin = await cleaned(a.n)
  cell("KEEP-5 the repeated cleaned without keep keeps the tree out of the check and cleans the task", rec(a.n).status === "cleaned" && /Сохранено: .*evidence/.test(fin) && existsSync(a.tree), fin)
}

// ---- the kept tree is gone: the record does not matter
{
  const a = accepted({ branch: false })
  const r = await cleaned(a.n, { keep: [a.rel] })
  cell("KEEP-6 setup: cleaned with keep passes", rec(a.n).status === "cleaned", r)
  const b = accepted({ branch: true })
  await cleaned(b.n, { keep: [b.rel] }) // refused by the branch, kept is recorded
  git(proj, "worktree", "remove", "--force", b.tree)
  git(proj, "branch", "-D", b.branch)
  const fin = await cleaned(b.n)
  cell("KEEP-6b the kept tree disappeared: it does not hinder, no 'Сохранено' line", rec(b.n).status === "cleaned" && !/Сохранено/.test(fin), fin)
}

// ---- the tree is the task's own worktree (t.worktree) and the other leftovers are still checked
{
  const a = accepted({ ownTree: true, branch: false })
  const no = await cleaned(a.n)
  cell("KEEP-7 setup: the own worktree (t.worktree) is a leftover without keep", /worktree .*evidence ещё есть/.test(no), no)
  git(proj, "branch", "t-sprout-" + a.n, "origin/main")
  git(proj, "branch", `t${a.n}-cand`, "origin/main")
  const r = await cleaned(a.n, { keep: [a.tree] })
  cell("KEEP-7b keep of t.worktree: the tree is skipped, the sprout branch t<n>-cand is still named", /t\d+-cand ещё есть/.test(r) && !/worktree .* ещё есть/.test(r) && rec(a.n).status === "accepted", r)
  git(proj, "branch", "-D", `t${a.n}-cand`)
  gitTry(proj, "branch", "-D", "t-sprout-" + a.n)
  const fin = await cleaned(a.n)
  cell("KEEP-7c after the sprouts are deleted the task is cleaned", rec(a.n).status === "cleaned", fin)
}

// ---- a plain folder inside the worktree folder is a valid keep
{
  const a = accepted({ branch: false })
  const notes = path.join(proj, "wt", `notes-${a.n}`)
  mkdirSync(notes, { recursive: true })
  const r = await cleaned(a.n, { keep: [notes, a.rel] })
  const paths = (rec(a.n).kept ?? []).map((k) => norm(k.path))
  cell("KEEP-8 a folder inside the worktree folder and a tree are both kept", rec(a.n).status === "cleaned" && paths.length === 2 && paths.includes(norm(notes)) && paths.includes(norm(a.tree)), r + JSON.stringify(paths))
}

// ---- the acceptor-only rule is the old one: another session cannot keep
{
  const a = accepted({ branch: false })
  const r = await call("crew_task", "sesREV2", { action: "cleaned", n: a.n, keep: [a.rel] })
  cell("KEEP-9 another session: refused, nothing is written", /только его/.test(r) && !rec(a.n).kept && rec(a.n).status === "accepted", r)
}

// ---- the task branch is checked out in the kept tree: the answer gives the hint, and after the detach the task is cleaned
{
  const a = accepted({ branch: false })
  git(proj, "branch", "t" + a.n, "origin/main")
  git(a.tree, "checkout", "-q", "t" + a.n)
  const r = await cleaned(a.n, { keep: [a.rel] })
  cell("KEEP-10 the branch is checked out in the kept tree: the answer says git checkout --detach, then delete", /локальная ветка t[0-9]+ ещё есть/.test(r) && /git checkout --detach/.test(r) && r.includes("t" + a.n) && rec(a.n).status === "accepted", r)
  git(a.tree, "checkout", "-q", "--detach")
  git(proj, "branch", "-D", "t" + a.n)
  const fin = await cleaned(a.n)
  cell("KEEP-10b after the detach and the branch delete the task is cleaned, the tree stays", rec(a.n).status === "cleaned" && existsSync(a.tree), fin)
}

done(H)

// Self-test: the gate of merge under merge_precheck: required (task 005, REQ-05, REQ-08, REQ-11, REQ-12; node >= 24):
//   node test/crew-landing-gate.test.mjs
// On real git repositories with a local origin: the merge lock is issued only on the tip of the target branch where the candidate
// was checked; the tip is read UNDER the lock; every refusal after the first take of the lock leaves it free; a repeat of the holder
// is told "already merged" when the task branch is in the target branch; the record and the lock are checked again after the read.
// The code comes from CREW_PLUGIN_DIR when the proof of red (test/landing-red.mjs) runs a copy with one stubbed check.
import net from "node:net"
import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-gate.test")
// LANDING_SECTIONS="AC-08,AC-09" runs only these sections (the proof of red, test/landing-red.mjs, needs a few of them, not all)
const only = process.env.LANDING_SECTIONS?.split(",").map((x) => x.trim())
const section = (name) => !only || only.includes(name)
const H = await harness("crew-landing-gate", { settings: { merge_precheck: "required" } })
const { call, git, proj, task: T, tasks, review, core, precheck } = H
const REV = "sesREV1"
const fetch = () => git(proj, "fetch", "-q", "origin")
const begin = (t, sid = REV) => call("crew_task", sid, { action: "precheck", n: t.n })
const finish = (t, input, sid = REV) => call("crew_task", sid, { action: "precheck", n: t.n, ...input })
const merge = (t, sid = REV) => call("crew_task", sid, { action: "merge", n: t.n })
const accept = (t, sid = REV, input = {}) => call("crew_task", sid, { action: "accept", n: t.n, ...input })
const clearLock = () => review.releaseMergeLock("proj", review.mergeHolder("proj")?.session ?? "")
const short = (h) => h.slice(0, 7)
/** a task on review with a green record on the current tip of the origin; the candidate has the task branch merged in */
const green = async (more = {}) => {
  const t = H.reviewing(more)
  const sid = more.reviewer ?? REV
  await begin(t, sid)
  fetch()
  H.candidate(`integrate/t${t.n}`, { merge: t.branch })
  await finish(t, { candidate: `integrate/t${t.n}`, result: "CI зелёный" }, sid)
  return t
}
const withSeam = async (seam, fn) => {
  Object.assign(precheck.seams, seam)
  try {
    return await fn()
  } finally {
    for (const k of Object.keys(seam)) delete precheck.seams[k]
  }
}
const snapRepo = () => {
  const g = path.join(proj, ".git")
  let size = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) walk(f)
      else size += statSync(f).size
    }
  }
  walk(path.join(g, "objects"))
  return JSON.stringify({ refs: git(proj, "for-each-ref"), size, fetchHead: existsSync(path.join(g, "FETCH_HEAD")) })
}
/** the landing done from the second clone: the task branch is pushed, merged into main there and pushed; the project fetches nothing */
const landFromOtherClone = (branch) => {
  git(proj, "push", "-q", "origin", branch)
  git(H.other, "pull", "-q", "--ff-only", "origin", "main")
  git(H.other, "fetch", "-q", "origin")
  git(H.other, "merge", "-q", "--no-edit", "--no-ff", `origin/${branch}`)
  git(H.other, "push", "-q", "origin", "main")
}

// ---- AC-07: the whole way
if (section("AC-07")) {
  const t = H.reviewing()
  const base = H.originTip()
  await begin(t)
  fetch()
  H.candidate(`integrate/t${t.n}`, { merge: t.branch })
  await finish(t, { candidate: `integrate/t${t.n}`, result: "CI зелёный" })
  const m = await merge(t)
  const lockOn = T(t.n).precheck.lock_on
  const landed = H.land(`integrate/t${t.n}`)
  const a = await accept(t)
  const hist = H.history(t.n)
  const idx = (re) => hist.findIndex((h) => re.test(h))
  const order = [/предпроверка начата на/, /предпроверка зелёная на/, /замок вливания взят на вершине/, /принята: /, /принята на /].map(idx)
  cell("AC-07: precheck, candidate, finish, merge, landing, accept: the lock is issued on the checked tip, the lines of the history stand in this order, the lock is free after accept", /выдан на вершину main/.test(m) && m.includes(base) && lockOn?.tip === base && order.every((x) => x >= 0) && order.every((x, i) => i === 0 || x > order[i - 1]) && !H.holder() && T(t.n).status === "accepted", m + a + JSON.stringify(hist))
  cell("AC-07 запись: after accept the record stays as history: green, with the tip it was accepted on", T(t.n).precheck.state === "green" && T(t.n).precheck.accepted_on === landed && T(t.n).precheck.lock_on?.tip === base, JSON.stringify(T(t.n).precheck))
}

// ---- AC-08: no record, running, stale; and the flag switched on while a lock is held
if (section("AC-08")) {
  const a = H.reviewing()
  const ra = await merge(a)
  cell("AC-08 a: no record — the lock is not issued, the first step is named, the lock file is empty", /нет зелёной предпроверки/.test(ra) && /crew_task \{action: "precheck"/.test(ra) && !H.holder() && !H.tasks.loadTask("proj", a.n).precheck, ra)
  const b = H.reviewing()
  await begin(b)
  const rb = await merge(b)
  cell("AC-08 b: a record 'running' — refused, the lock file is empty", /ещё идёт/.test(rb) && !H.holder(), rb)
  H.settings({ merge_precheck: "off" })
  const b2 = H.reviewing()
  const old = await merge(b2)
  H.settings({ merge_precheck: "required" })
  const rb2 = await merge(b2)
  cell("AC-08 b2: the flag switched on while a lock is held: the lock stays valid, a repeat of the holder needs a green record and names the first step", /твой/.test(old) && /нет зелёной предпроверки/.test(rb2) && H.holder()?.session === REV && H.holder()?.n === b2.n, old + " | " + rb2)
  clearLock()
  const c = await green()
  clearLock()
  const x = H.task(c.n)
  precheck.markPrecheckStale(x, "замок отпущен")
  tasks.saveTask(x)
  const rc = await merge(c)
  cell("AC-08 c: a stale record — refused with the reason, the lock file is empty", /устарела \(замок отпущен\)/.test(rc) && !H.holder(), rc)
}

// ---- AC-09: the origin moved after the green record
if (section("AC-09")) {
  const t = await green()
  const b1 = T(t.n).precheck.base
  const b2 = H.moveOrigin()
  const r = await merge(t)
  cell("AC-09: a moved origin — refused naming both tips, the lock is free", /сдвинулась/.test(r) && r.includes(short(b1)) && r.includes(short(b2)) && !H.holder() && /Замок не взят/.test(r), r)
  await begin(t)
  fetch()
  H.candidate(`integrate/t${t.n}`, { merge: t.branch })
  await finish(t, { candidate: `integrate/t${t.n}`, result: "CI зелёный на новой" })
  const ok = await merge(t)
  cell("AC-09 новый precheck: after a new precheck on the new tip merge passes", /выдан на вершину main/.test(ok) && ok.includes(b2) && H.holder()?.session === REV, ok)
  clearLock()
}
if (section("AC-09")) {
  const t = await green()
  const other = H.reviewing({ reviewer: "sesREV2" })
  H.take("sesREV2", other.n)
  const r1 = await merge(t)
  const keep = H.holder()
  H.moveOrigin()
  clearLock()
  const r2 = await merge(t)
  cell("AC-09 занят: a busy lock — the old refusal plus 'your precheck stays valid', the lock stays with its holder; after the holder left and the origin moved — refused as moved", /Замок вливания проекта proj у приёмщика задачи #\d+/.test(r1) && /остаётся действующей/.test(r1) && keep?.session === "sesREV2" && /сдвинулась/.test(r2) && !H.holder(), r1 + " | " + r2)
}

// ---- AC-12 merge off
if (section("AC-12")) {
  H.settings({ merge_precheck: "off" })
  const t = H.reviewing()
  const r = await merge(t)
  cell("AC-12 merge off: merge takes the lock without a precheck, with the old words and the old history line", /^Замок вливания проекта proj твой\. Влей ветку/.test(r) && !/выдан на вершину/.test(r) && H.holder()?.session === REV && H.history(t.n).includes("замок вливания взят") && !T(t.n).precheck, r)
  clearLock()
  H.settings({ merge_precheck: "required" })
}

// ---- AC-11 merge: no answer from the origin on the first take
const url0 = git(proj, "remote", "get-url", "origin")
const closedPort = await new Promise((resolve) => {
  const s = net.createServer()
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port
    s.close(() => resolve(p))
  })
})
if (section("AC-11")) {
  const t = await green()
  git(proj, "remote", "set-url", "origin", `http://127.0.0.1:${closedPort}/r.git`)
  const before = snapRepo()
  const r = await merge(t)
  cell("AC-11 merge закрытый порт: refused with the text of the failure, the lock is free, no git process with the port", /Замок не выдан/.test(r) && /ls-remote/.test(r) && !H.holder() && H.gitProcs(String(closedPort)).length === 0 && /Замок не взят/.test(r), r)
  cell("AC-20 сбой: a failed merge changes no reference, no objects, no FETCH_HEAD", snapRepo() === before, "")
  git(proj, "remote", "set-url", "origin", url0)
}
if (section("AC-11")) {
  const silent = await new Promise((resolve) => {
    const s = net.createServer((sock) => sock.on("error", () => {}))
    s.listen(0, "127.0.0.1", () => resolve(s))
  })
  const port = silent.address().port
  const t = await green()
  git(proj, "remote", "set-url", "origin", `http://127.0.0.1:${port}/r.git`)
  const t0 = Date.now()
  const r = await merge(t)
  await H.wait(1500)
  cell("AC-11 merge молчит: a silent server — refused with the text of the failure after the term, the lock is free, no git process with the port is left", /Замок не выдан/.test(r) && !H.holder() && H.gitProcs(String(port)).length === 0 && Date.now() - t0 < 30_000, r)
  console.log(`процессов git с этим адресом: ${H.gitProcs(String(port)).length} (AC-11 merge молчит, ${Math.round((Date.now() - t0) / 100) / 10} s)`)
  git(proj, "remote", "set-url", "origin", url0)
  silent.close()
}

// ---- AC-32 merge: no branch on origin; at a repeat of the holder the lock stays
if (section("AC-32")) {
  H.settings({ merge_precheck: "required", target_branch: "nosuch" })
  const t = H.reviewing()
  const x = H.task(t.n)
  x.precheck = { state: "green", base: H.originTip(), at: Date.now(), by: REV, round: precheck.roundOf(x), candidate: H.originTip(), result: "x", green_at: Date.now() }
  tasks.saveTask(x)
  const r = await merge(t)
  cell("AC-32 merge: 'ветки nosuch на origin нет' on the first take — refused, the lock file is empty", /ветки nosuch на origin нет/.test(r) && !H.holder(), r)
  review.takeMergeLock("proj", REV, t.n)
  const r2 = await merge(t)
  cell("AC-32 merge повтор: at a repeat of the holder the lock stays as it was and the refusal says so", /ветки nosuch на origin нет/.test(r2) && /остаётся у тебя/.test(r2) && H.holder()?.session === REV, r2)
  clearLock()
  H.settings({ merge_precheck: "required" })
}

// ---- AC-15: one reviewer, two tasks
if (section("AC-15")) {
  H.settings({ merge_precheck: "required", reviewer: "integrator" })
  const a = await green({ reviewer: "sesINTEG1" })
  const b = await green({ reviewer: "sesINTEG1" })
  const ra = await merge(a, "sesINTEG1")
  const rb = await merge(b, "sesINTEG1")
  cell("AC-15: the lock is held for A; merge for B is refused naming A, the lock stays for A", /выдан на вершину/.test(ra) && /замок у тебя уже для #\d+/.test(rb) && rb.includes(`#${a.n}`) && H.holder()?.n === a.n && H.holder()?.session === "sesINTEG1", ra + " | " + rb)
  clearLock()
  H.settings({ merge_precheck: "required" })
}

// ---- AC-17: the tip is read UNDER the lock
if (section("AC-17")) {
  const t = await green()
  let lockInside = false
  const r = await withSeam(
    {
      readTip: async (dir, target) => {
        lockInside = H.holder()?.session === REV && H.holder()?.n === t.n
        H.moveOrigin()
        return precheck.originTip(dir, target)
      },
    },
    () => merge(t),
  )
  cell("AC-17: the read of the tip happens with the lock file in place; the origin moved inside the read — refused, the lock is free", lockInside && /сдвинулась/.test(r) && !H.holder(), r)
}

// ---- AC-20: precheck, merge: no references, objects, FETCH_HEAD change
if (section("AC-20")) {
  const t = H.reviewing()
  const s0 = snapRepo()
  await begin(t)
  const s1 = snapRepo()
  fetch()
  H.candidate(`integrate/t${t.n}`, { merge: t.branch })
  const s2 = snapRepo()
  await finish(t, { candidate: `integrate/t${t.n}`, result: "ok" })
  const s3 = snapRepo()
  await merge(t)
  const s4 = snapRepo()
  cell("AC-20: precheck, finish and merge change no references, objects or FETCH_HEAD (the fetch before the candidate is the reviewer's, outside)", s0 === s1 && s2 === s3 && s3 === s4, JSON.stringify([s0 === s1, s2 === s3, s3 === s4]))
  clearLock()
}

// ---- AC-34: landing of an approved plan under required
if (section("AC-34")) {
  const plan = { n: "9", file: "docs/plans/9-demo.md", source: "демо", rounds: [], clean: 0, approval: { decision: "ok", at: Date.now() } }
  const t = H.reviewing({ plan })
  const r = await merge(t)
  cell("AC-34 влитие плана: merge of an approved plan without a precheck is refused as for an ordinary task", /нет зелёной предпроверки/.test(r) && !H.holder(), r)
  const letter = review.reviewLetter(T(t.n), core.loadConfig(proj))
  cell("AC-34 письмо: the letter of an approved plan is the landing letter (planMergeLetter)", /ВЛИТЬ СОГЛАСОВАННЫЙ ПЛАН 9/.test(letter), letter.slice(0, 120))
}

// ---- AC-35: a repeat of merge by the holder
if (section("AC-35")) {
  const t = await green()
  const m1 = await merge(t)
  const tip0 = H.originTip()
  const m3 = await merge(t)
  cell("AC-35 c3: a repeat without a shift — the lock stays, the answer is the same, the record is green", /выдан на вершину main/.test(m1) && m3.includes(tip0) && H.holder()?.session === REV && T(t.n).precheck.state === "green", m1 + " | " + m3)
  H.moveOrigin()
  const m = await merge(t)
  cell("AC-35 c1: a repeat after a shift — the lock is released, the record is stale 'главная сдвинулась'", /сдвинулась/.test(m) && !H.holder() && T(t.n).precheck.state === "stale" && T(t.n).precheck.stale.reason === "главная сдвинулась", m + JSON.stringify(T(t.n).precheck))
  clearLock()
}
if (section("AC-35")) {
  const t = await green()
  await merge(t)
  const holderBefore = JSON.stringify(H.holder())
  const r = await withSeam({ readTip: async () => ({ ok: false, kind: "fail", error: "git ls-remote origin: сеть недоступна (проба)" }) }, () => merge(t))
  cell("AC-35 c2: a read failure at a repeat — the lock stays, the refusal says unlock or repeat, the record is green", /сеть недоступна/.test(r) && /unlock/.test(r) && /остаётся у тебя/.test(r) && JSON.stringify(H.holder()) !== undefined && H.holder()?.session === REV && H.holder()?.n === t.n && T(t.n).precheck.state === "green" && holderBefore !== undefined, r)
  clearLock()
}
if (section("AC-35")) {
  const t = await green()
  await merge(t)
  const landed = H.land(`integrate/t${t.n}`)
  const m = await merge(t)
  const holderAfter = H.holder()
  const stateAfter = T(t.n).precheck.state
  const a = await accept(t)
  cell("AC-35 c4: the task branch is already in the target branch — the lock stays, the record is not stale, the answer 'влито, вызови accept', and accept passes", /Ветка уже влита/.test(m) && /accept/.test(m) && holderAfter?.session === REV && holderAfter?.n === t.n && stateAfter === "green" && H.history(t.n).includes("повтор merge: уже влито") && T(t.n).status === "accepted" && T(t.n).precheck.accepted_on === landed, m + " | " + a)
}
if (section("AC-35")) {
  const t = await green()
  await merge(t)
  H.land(`integrate/t${t.n}`)
  const m = await withSeam({ afterMerged: () => review.releaseMergeLock("proj", REV) }, () => merge(t))
  cell("AC-35 c4b: the lock is lost inside the 'already merged' branch — the honest answer: merged, but the lock is gone, accept would refuse", /Ветка уже влита/.test(m) && /замок вливания снят/.test(m) && !H.holder() && T(t.n).precheck.state === "green", m)
}
if (section("AC-35")) {
  const t = await green()
  const other = H.reviewing({ reviewer: "sesREV2" })
  H.take("sesREV2", other.n)
  const m = await merge(t)
  cell("AC-35 c5: a lock of another holder stays with him", /у приёмщика задачи #/.test(m) && H.holder()?.session === "sesREV2" && T(t.n).precheck.state === "green", m)
  clearLock()
}
if (section("AC-35")) {
  // c6a: the landing was done from another clone (before fetch): the local references do not show it — a shift, not 'merged'
  const t = await green()
  await merge(t)
  landFromOtherClone(t.branch)
  const m = await merge(t)
  cell("AC-35 c6a: landed from another clone before fetch — not 'already merged' but a shift: the lock is released, the record is stale", /сдвинулась/.test(m) && !/Ветка уже влита/.test(m) && !H.holder() && T(t.n).precheck.state === "stale", m)
  fetch()
}
if (section("AC-35")) {
  // c6b: squash — the task branch is not an ancestor of the target branch
  const t = await green()
  await merge(t)
  git(proj, "fetch", "-q", "origin")
  git(proj, "switch", "-q", "main")
  git(proj, "merge", "-q", "--ff-only", "origin/main")
  git(proj, "merge", "-q", "--squash", t.branch)
  git(proj, "commit", "-q", "-m", `squash ${t.branch}`)
  git(proj, "push", "-q", "origin", "main")
  const m = await merge(t)
  cell("AC-35 c6b: a squash landing — the task branch is not in the target branch: a shift, not 'merged'", /сдвинулась/.test(m) && !/Ветка уже влита/.test(m) && !H.holder() && T(t.n).precheck.state === "stale", m)
}
if (section("AC-35")) {
  // c7: the lock is lost after the landing: a repeat takes it again, sees the tip moved by the landing itself and refuses
  const t = await green()
  await merge(t)
  H.land(`integrate/t${t.n}`)
  review.releaseMergeLock("proj", REV)
  const m = await merge(t)
  cell("AC-35 c7: the lock was lost after the landing — a repeat takes it, sees the shifted tip and refuses; the record is not re-examined (no repeat of the holder)", /сдвинулась/.test(m) && !/Ветка уже влита/.test(m) && !H.holder() && T(t.n).precheck.state === "green", m + JSON.stringify(T(t.n).precheck))
}

// ---- AC-37: changes inside the read of the tip
if (section("AC-37")) {
  const t = await green()
  const r = await withSeam({ afterTip: () => review.releaseMergeLock("proj", REV) }, () => merge(t))
  cell("AC-37 c1: the lock was taken off inside the read — 'замок потерян', not issued, no lock file, no lock_on in the record", /Замок потерян/.test(r) && !H.holder() && !T(t.n).precheck.lock_on, r)
  const t2 = await green()
  const other = H.reviewing({ reviewer: "sesREV2" })
  const r2 = await withSeam(
    {
      afterTip: () => {
        review.releaseMergeLock("proj", REV)
        review.takeMergeLock("proj", "sesREV2", other.n)
      },
    },
    () => merge(t2),
  )
  cell("AC-37 c1 перехват: the lock was taken by another inside the read — 'замок потерян', the holder stays the other one", /Замок потерян/.test(r2) && H.holder()?.session === "sesREV2" && H.holder()?.n === other.n && !T(t2.n).precheck.lock_on, r2)
  clearLock()
  const t3 = await green()
  const r3 = await withSeam(
    {
      afterTip: () => {
        const x = T(t3.n)
        precheck.markPrecheckStale(x, "передана другой сессии")
        tasks.saveTask(x)
      },
    },
    () => merge(t3),
  )
  cell("AC-37 c2: the record became stale inside the read — refused, the lock is free, the green record does not come back in the file", /изменилась/.test(r3) && !H.holder() && T(t3.n).precheck.state === "stale" && !T(t3.n).precheck.lock_on, r3 + JSON.stringify(T(t3.n).precheck))
  const t4 = await green()
  let called = 0
  const r4 = await withSeam({ afterTip: () => void called++ }, () => merge(t4))
  cell("AC-37 c3: nothing changed — merge passes (the control that the seam does not break the way)", called === 1 && /выдан на вершину main/.test(r4) && H.holder()?.session === REV && !!T(t4.n).precheck.lock_on, r4)
  clearLock()
}

// ---- AC-14 merge: a record made stale by the ways of AC-14 does not open the lock
if (section("AC-14")) {
  const resubmit = async (t) => {
    const x = H.task(t.n)
    x.status = "submitted"
    tasks.saveTask(x)
    await call("crew_task", REV, { action: "review", n: t.n })
  }
  let t = await green()
  await call("crew_task", REV, { action: "rework", n: t.n, text: "доработать" })
  await resubmit(t)
  let r = await merge(t)
  cell("AC-14 merge a: after rework and a new review the stale record does not open the lock, the lock file is empty", /устарела \(возвращена исполнителю \(доработка\)\)/.test(r) && !H.holder(), r)
  t = await green()
  await call("crew_task", REV, { action: "rework", n: t.n, sync: true })
  await resubmit(t)
  r = await merge(t)
  cell("AC-14 merge b: rework sync — the same", /устарела \(возвращена исполнителю \(синхронизация\)\)/.test(r) && !H.holder(), r)
  t = await green()
  await call("crew_task", "sesINTEG1", { action: "reassign", n: t.n })
  await resubmit(t)
  r = await merge(t)
  cell("AC-14 merge c: reassign — the same", /устарела \(передана другой сессии\)/.test(r) && !H.holder(), r)
  t = await green()
  await call("crew_task", "sesINTEG1", { action: "cancel", n: t.n })
  r = await merge(t)
  cell("AC-14 merge d: cancel closes the status — merge is refused by the status, the lock file is empty", /Сначала crew_task \{action: "review"/.test(r) && /отменена/.test(r) && !H.holder(), r)
  t = H.reviewing({ fields: { status: "submitted", precheck: { state: "green", base: H.originTip(), at: Date.now(), by: REV, round: 0, candidate: H.originTip(), result: "x", green_at: Date.now() } } })
  await call("crew_task", REV, { action: "review", n: t.n })
  r = await merge(t)
  cell("AC-14 merge e: a new review after a re-submit makes a green record stale — merge refused", /устарела \(приёмка начата заново\)/.test(r) && !H.holder(), r)
}

done(H)

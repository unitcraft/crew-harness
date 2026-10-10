// Self-test: the accept warning and the neighbour hints (task 005, REQ-13, REQ-14; AC-21, AC-22; node >= 24):
//   node test/crew-landing-hints.test.mjs
// Under merge_precheck: required, accept warns (not refuses) when the candidate that was checked is not in the target branch where the
// task was accepted; the answers of precheck, show and the refusal of merge name the neighbour tasks of the project (read from the
// task journal only: nothing is stored or reserved).
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-hints.test")
const H = await harness("crew-landing-hints", { settings: { merge_precheck: "required" } })
const { call, git, proj, task: T, precheck, review } = H
const REV = "sesREV1"
const fetch = () => git(proj, "fetch", "-q", "origin")
const begin = (t, sid = REV) => call("crew_task", sid, { action: "precheck", n: t.n })
const finish = (t, input, sid = REV) => call("crew_task", sid, { action: "precheck", n: t.n, ...input })
const merge = (t, sid = REV) => call("crew_task", sid, { action: "merge", n: t.n })
const accept = (t, sid = REV) => call("crew_task", sid, { action: "accept", n: t.n })
/** a green record; the candidate has its own commit and does NOT contain the task branch when `own` is set */
const green = async (own = false) => {
  const t = H.reviewing()
  await begin(t)
  fetch()
  H.candidate(`integrate/t${t.n}`, own ? {} : { merge: t.branch })
  await finish(t, { candidate: `integrate/t${t.n}`, result: "CI зелёный" })
  return t
}
const warnings = (n) => H.history(n).filter((h) => /^предупреждение:/.test(h))

// ---- AC-21 без предупреждения: the candidate is in the accepted tip
{
  const t = await green()
  await merge(t)
  H.land(`integrate/t${t.n}`)
  const a = await accept(t)
  cell("AC-21 без предупреждения: the candidate is in the target branch — accept passes, no warning in the answer or in the history", T(t.n).status === "accepted" && !/Внимание/.test(a) && warnings(t.n).length === 0, a + JSON.stringify(H.history(t.n)))
}
// ---- AC-21: the candidate is not in the accepted tip
{
  const t = await green(true)
  await merge(t)
  H.land(t.branch) // the reviewer merged the task branch itself, not the candidate that was checked
  const a = await accept(t)
  cell("AC-21: the candidate is not in the target branch — accept passes with the warning in the answer and in the history", T(t.n).status === "accepted" && /Внимание: влито не то, что проверялось/.test(a) && warnings(t.n).length === 1 && /влито не то/.test(warnings(t.n)[0]), a + JSON.stringify(H.history(t.n)))
}
// the warning is for required only: with the flag off the same landing gives the old answer
{
  H.settings({ merge_precheck: "off" })
  const t = H.reviewing()
  await merge(t)
  H.land(t.branch)
  const a = await accept(t)
  cell("AC-21 off: with merge_precheck off accept is as before — no warning", T(t.n).status === "accepted" && !/Внимание/.test(a) && warnings(t.n).length === 0, a)
  H.settings({ merge_precheck: "required" })
}

// ---- AC-22 идут: other tasks with a record 'running' or 'green'
{
  const a = H.reviewing()
  const b = H.reviewing()
  const c = H.reviewing()
  await begin(a)
  const rb = await begin(b)
  const base = T(a.n).precheck.base
  cell("AC-22 идут: the answer of precheck names the other task that is running (number, tip, time)", rb.includes(`Параллельно идут: #${a.n} (идёт на ${base.slice(0, 7)} с `), rb)
  const sh = await call("crew_task", REV, { action: "show", n: b.n })
  cell("AC-22 show: show of a task with a record names the neighbour", sh.includes(`Параллельно идут: #${a.n}`), sh)
  fetch()
  H.candidate(`integrate/t${a.n}`, { merge: a.branch })
  await finish(a, { candidate: `integrate/t${a.n}`, result: "CI зелёный" })
  const rc = await begin(c)
  cell("AC-22 идут зелёная: a neighbour with a green record is named as green", rc.includes(`#${a.n} (зелёная на`) && rc.includes(`#${b.n} (идёт на`), rc)
  const lone = H.reviewing()
  await call("crew_task", "sesINTEG1", { action: "cancel", n: a.n })
  await call("crew_task", "sesINTEG1", { action: "cancel", n: b.n })
  await call("crew_task", "sesINTEG1", { action: "cancel", n: c.n })
  const rl = await begin(lone)
  cell("AC-22 никого: with no other open task with a record there is no hint", !/Параллельно/.test(rl), rl)
}
// ---- AC-22 после зелёной: tasks accepted after the green record are named in the refusal for a moved tip
{
  const t = await green()
  const u = await green()
  await merge(u)
  H.land(`integrate/t${u.n}`)
  await accept(u)
  const r = await merge(t)
  cell("AC-22 после зелёной: merge refused as moved names the task accepted after the green record", /сдвинулась/.test(r) && r.includes(`После зелёной приняты: #${u.n} (`) && !H.holder(), r)
  const w = await green() // a later green record: nobody was accepted after it
  H.moveOrigin()
  const r2 = await merge(w)
  cell("AC-22 после зелёной (нет): a task accepted before the green record is not named", /сдвинулась/.test(r2) && !/После зелёной приняты/.test(r2), r2)
}

// ---- REQ-28: hints about the merge lock in the answers of accept, rework, cancel and cleaned (owner's decision 2026-10-10)
const FREED_ACCEPT = "Замок слияния отпущен (его отпускает accept)."
const INTEG = "sesINTEG1"
{
  // accept: the session held the lock and accept released it — the line, with the way on (cleanup without the lock, then cleaned N)
  const t = await green()
  await merge(t)
  H.land(`integrate/t${t.n}`)
  const a = await accept(t)
  cell("REQ-28 accept: the lock was held and accept released it — the line names accept, cleanup without the lock and cleaned N", a.includes(FREED_ACCEPT) && a.includes(`Дальше уборка без замка, затем cleaned ${t.n}.`) && !H.holder(), a)
  // accept after the service released the lock: the session held none, so no line
  const u = await green()
  await merge(u)
  H.land(`integrate/t${u.n}`)
  await precheck.releaseLandedLock("proj", "main")
  const au = await accept(u)
  cell("REQ-28 accept без замка: the service released the lock before accept — accepted, no lock line", T(u.n).status === "accepted" && !/Замок слияния отпущен/.test(au), au)
  // cleanup: none — the task is finished at once; the line is still there, without the cleaned hint
  H.settings({ merge_precheck: "required", cleanup: "none" })
  const w = await green()
  await merge(w)
  H.land(`integrate/t${w.n}`)
  const aw = await accept(w)
  H.settings({ merge_precheck: "required" })
  cell("REQ-28 accept cleanup none: the line is shown, the hint 'затем cleaned' is not (the task is already cleaned)", aw.includes(FREED_ACCEPT) && !/затем cleaned/.test(aw) && T(w.n).status === "cleaned", aw)
}
{
  // rework: with the lock — the line; without it — none (both forms: a round and a sync)
  const t = await green()
  await merge(t)
  const r1 = await call("crew_task", REV, { action: "rework", n: t.n, text: "доработать" })
  cell("REQ-28 rework: the lock was held — the answer says it is released", /Замок слияния отпущен\.$/.test(r1) && !H.holder(), r1)
  const u = await green()
  await merge(u)
  const r2 = await call("crew_task", REV, { action: "rework", n: u.n, sync: true })
  cell("REQ-28 rework sync: the lock was held — the answer says it is released", /Замок слияния отпущен\.$/.test(r2) && !H.holder(), r2)
  const v = H.reviewing()
  const r3 = await call("crew_task", REV, { action: "rework", n: v.n, text: "доработать" })
  const r4 = await call("crew_task", REV, { action: "rework", n: H.reviewing().n, sync: true })
  cell("REQ-28 rework без замка: no lock was held — no line", !/Замок слияния/.test(r3 + r4), r3 + r4)
}
{
  // cancel: the reviewer holds the lock — the integrator's answer says it is released; no lock — no line
  const t = await green()
  await merge(t)
  const c1 = await call("crew_task", INTEG, { action: "cancel", n: t.n })
  cell("REQ-28 cancel: the reviewer held the lock — the answer says it is released", /Замок слияния отпущен\.$/.test(c1) && !H.holder(), c1)
  const c2 = await call("crew_task", INTEG, { action: "cancel", n: H.reviewing().n })
  cell("REQ-28 cancel без замка: no lock was held — no line", !/Замок слияния/.test(c2), c2)
}
{
  // cleaned: a lock still held by the session — the warning with unlock N; none — nothing added
  H.settings({ merge_precheck: "required", cleanup: "none" })
  const mkAccepted = () => {
    const x = H.reviewing()
    const y = H.task(x.n)
    y.status = "accepted"
    y.history.push({ at: Date.now(), by: REV, status: "accepted", note: "принята" })
    H.tasks.saveTask(y)
    return y
  }
  const a = mkAccepted()
  const b = mkAccepted()
  H.take(REV, b.n)
  const c1 = await call("crew_task", REV, { action: "cleaned", n: a.n })
  cell("REQ-28 cleaned: the lock is still held — the warning names that cleaned does not release it and unlock N", /замок слияния всё ещё у тебя: cleaned его не отпускает; отпусти unlock \{n: \d+\}/.test(c1) && c1.includes(`unlock {n: ${b.n}}`) && H.holder()?.session === REV, c1)
  review.releaseMergeLock("proj", REV)
  const c = mkAccepted()
  const c2 = await call("crew_task", REV, { action: "cleaned", n: c.n })
  cell("REQ-28 cleaned без замка: no lock — nothing added", T(c.n).status === "cleaned" && !/замок слияния/i.test(c2), c2)
  H.settings({ merge_precheck: "required" })
}

done(H)

// Self-test: the accept warning and the neighbour hints (task 005, REQ-13, REQ-14; AC-21, AC-22; node >= 24):
//   node test/crew-landing-hints.test.mjs
// Under merge_precheck: required, accept warns (not refuses) when the candidate that was checked is not in the target branch where the
// task was accepted; the answers of precheck, show and the refusal of merge name the neighbour tasks of the project (read from the
// task journal only: nothing is stored or reserved).
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-hints.test")
const H = await harness("crew-landing-hints", { settings: { merge_precheck: "required" } })
const { call, git, proj, task: T } = H
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

done(H)

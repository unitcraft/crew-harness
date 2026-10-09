// Self-test: the merge lock is released by the service once the checked candidate is already in the target tip (task 005, the owner's
// decision of 2026-10-09; node >= 24):  node test/crew-landing-release.test.mjs
// The lock is not released when: the tip cannot be read, the tip is not from origin, the candidate is not in the tip, the record is not
// green, the lock is held for another task or by another session. The reply of merge carries the line about the lock; after the release
// accept needs no lock; the service pass (flow watch) does the release by itself. The plugin merges and pushes nothing.
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-release.test")
const H = await harness("crew-landing-release", { settings: { merge_precheck: "required" } })
const { call, git, proj, task: T, review, core, precheck } = H
const REV = "sesREV1"
const holder = () => review.mergeHolder("proj")
const clearLock = () => review.releaseMergeLock("proj", holder()?.session ?? "")
/** a task on review with a green record and the merge lock held for it (the service pass is held off by a stubbed lock owner: see `quiet`) */
const greenLocked = async (more = {}) => {
  const t = H.reviewing(more)
  await call("crew_task", REV, { action: "precheck", n: t.n })
  git(proj, "fetch", "-q", "origin")
  H.candidate(`integrate/t${t.n}`, { merge: t.branch })
  await call("crew_task", REV, { action: "precheck", n: t.n, candidate: `integrate/t${t.n}`, result: "CI зелёный" })
  const m = await call("crew_task", REV, { action: "merge", n: t.n })
  return { t, m }
}
const release = () => precheck.releaseLandedLock("proj", "main")

// ---- the reply of merge
{
  const { t, m } = await greenLocked()
  cell("REL-1 merge: the reply of a granted lock carries the line 'замок держится до accept или unlock; под ним только слияние и пуш'", /Замок слияния держится до accept или unlock; под ним только слияние и пуш\./.test(m) && holder()?.n === t.n, m)

  // ---- not released
  cell("REL-2 not landed: the candidate is not in the origin tip — the lock stays", (await release()) === undefined && holder()?.n === t.n, JSON.stringify(holder()))
  // from here the tip read fails (the seam), so neither this test nor the service pass can release before the control
  precheck.seams.readTip = async () => ({ ok: false, kind: "fail", error: "stub" })
  H.land(`integrate/t${t.n}`) // the reviewer lands the checked candidate and pushes
  const seamFail = await release()
  cell("REL-3 read failure: the tip cannot be read even though the candidate is in main — the lock stays", seamFail === undefined && holder()?.n === t.n, String(seamFail))
  const x = H.task(t.n)
  const saved = x.precheck
  for (const state of ["running", "stale"]) {
    x.precheck = { ...saved, state }
    H.tasks.saveTask(x)
    cell(`REL-4 record ${state}: the record is not green — the lock stays`, (await release()) === undefined && holder()?.n === t.n, JSON.stringify(holder()))
  }
  x.precheck = saved
  H.tasks.saveTask(x)
  // another session holds the lock for this task's number / another task holds it
  const holderRec = holder()
  clearLock()
  const other = H.reviewing({ reviewer: "sesREV2" })
  H.take("sesREV2", other.n)
  cell("REL-5 another task: the lock is held for a task without a green record — the lock stays", (await release()) === undefined && holder()?.n === other.n, JSON.stringify(holder()))
  clearLock()
  H.take("sesREV3", t.n)
  cell("REL-5 another session: the holder is not the reviewer of the task — the lock stays", (await release()) === undefined && holder()?.session === "sesREV3", JSON.stringify(holder()))
  clearLock()
  H.take(REV, t.n)
  delete precheck.seams.readTip
  await H.until(() => !holder(), 15_000)
  cell("REL-5 control: the same task, its reviewer, the landed green candidate, the tip readable — the lock is released", holderRec.n === t.n && !holder(), JSON.stringify(holder()))
  const hist = H.history(t.n)
  const after = T(t.n)
  cell("REL-6 history: the note 'замок отпущен: слияние на вершине <hash>' and the record marks the landing", hist.some((h) => /замок отпущен: слияние на вершине [0-9a-f]{7}/.test(h)) && after.precheck.landed?.tip === H.originTip() && after.precheck.state === "green", hist.join(" | "))
  const a = await call("crew_task", REV, { action: "accept", n: t.n })
  cell("REL-7 accept after the release needs no lock and accepts", T(t.n).status === "accepted" && !/Сначала замок/.test(a), a)
}

// ---- a lock without a record of landing: accept still wants the lock
{
  const t = H.reviewing()
  const a = await call("crew_task", REV, { action: "accept", n: t.n })
  cell("REL-8 accept without the lock and without a landing is refused as before", /Сначала замок вливания/.test(a) && T(t.n).status === "reviewing", a)
}

// ---- a local tip (no origin) is not enough
{
  const { t } = await greenLocked()
  precheck.seams.readTip = async () => ({ ok: true, tip: H.originTip(), source: "local" })
  H.land(`integrate/t${t.n}`)
  const r = await release()
  delete precheck.seams.readTip
  cell("REL-9 tip not from origin: a local branch tip is not enough — the lock stays", r === undefined && holder()?.n === t.n, String(r))
  clearLock()
}

// ---- a candidate equal to the base has nothing of its own: it never counts as landed
{
  const t = H.reviewing()
  const tip = H.originTip()
  await call("crew_task", REV, { action: "precheck", n: t.n })
  git(proj, "fetch", "-q", "origin")
  await call("crew_task", REV, { action: "precheck", n: t.n, candidate: tip, result: "CI зелёный" })
  await call("crew_task", REV, { action: "merge", n: t.n })
  cell("REL-11 candidate equal to the base: it is an ancestor of the tip from the start, yet the lock stays", holder()?.n === t.n && (await release()) === undefined && holder()?.n === t.n, JSON.stringify(holder()))
  clearLock()
}

// ---- the service pass releases by itself
{
  const { t } = await greenLocked()
  H.land(`integrate/t${t.n}`)
  await H.until(() => !holder(), 15_000)
  cell("REL-10 service pass: the lock of a landed task is released by the flow watch without any call", !holder() && H.history(t.n).some((h) => /замок отпущен: слияние на вершине/.test(h)), JSON.stringify(holder()))
  const a = await call("crew_task", REV, { action: "accept", n: t.n })
  cell("REL-10 service pass: accept follows without the lock", T(t.n).status === "accepted", a)
}

done(H)

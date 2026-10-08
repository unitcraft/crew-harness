// Self-test: the precheck record and the unlock (task 005, REQ-06, REQ-07, REQ-10, REQ-11, REQ-24; node >= 24):
//   node test/crew-landing-precheck.test.mjs
// On real git repositories with a local origin: precheck {n} reads the tip and writes "running"; precheck {n, candidate, result}
// finishes it ("green") after the checks of REQ-07 (every refusal leaves the record as it was); unlock releases the lock the session
// holds for the task; the record becomes stale on rework, rework sync, reassign, cancel, unlock and a new review after a re-submit.
import { readFileSync } from "node:fs"
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-precheck.test")
const H = await harness("crew-landing-precheck", { settings: { merge_precheck: "required" } })
const { call, git, proj, task: T, tasks, review, core, precheck } = H
const REV = "sesREV1"
const fetch = () => git(proj, "fetch", "-q", "origin")
const begin = (t, sid = REV) => call("crew_task", sid, { action: "precheck", n: t.n })
const finish = (t, input, sid = REV) => call("crew_task", sid, { action: "precheck", n: t.n, ...input })
const snap = (t) => JSON.stringify({ p: T(t.n).precheck ?? null, h: T(t.n).history.length, s: T(t.n).status })
const lockFor = (sid, n) => H.take(sid, n)
const clearLock = () => review.releaseMergeLock("proj", review.mergeHolder("proj")?.session ?? "")
/** a task on review with a green record on the current tip of the origin (candidate = a branch with one commit) */
const greenTask = async (more = {}) => {
  const t = H.reviewing(more)
  await begin(t)
  fetch()
  const cand = H.candidate(`integrate/t${t.n}`)
  await finish(t, { candidate: `integrate/t${t.n}`, result: "CI зелёный" })
  return { t, cand }
}

// ---- REQ-06: begin, repeat, new tip
const a1 = H.reviewing()
const base1 = H.originTip()
const r1 = await begin(a1)
cell("REQ-06 begin: the record 'running' on the tip of origin, the answer names the tip and the next step", T(a1.n).precheck?.state === "running" && T(a1.n).precheck.base === base1 && T(a1.n).precheck.by === REV && r1.includes(base1) && /candidate/.test(r1) && /не берётся/.test(r1) && !H.holder(), r1)
const hist1 = T(a1.n).history.length
const at0 = T(a1.n).precheck.at
const r1b = await begin(a1)
cell("REQ-06 повтор: the same tip — the answer about the state, no reset, no new history line", /уже идёт/.test(r1b) && T(a1.n).history.length === hist1 && T(a1.n).precheck.at === at0, r1b)
const at1 = at0
H.moveOrigin()
const r1c = await begin(a1)
cell("REQ-06 новая вершина: another tip replaces the record with the new base, a line goes to the history", T(a1.n).precheck.base === H.originTip() && T(a1.n).precheck.base !== base1 && T(a1.n).precheck.at >= at1 && H.history(a1.n).some((h) => /начата заново/.test(h)), r1c + JSON.stringify(H.history(a1.n)))
fetch()

// ---- AC-10 a..f: six refusals, the record stays as it was
{
  const t = H.reviewing()
  H.moveOrigin()
  await begin(t) // base = the moved tip; the task branch (from the older tip) does not contain it
  fetch()
  const before = snap(t)
  const a = await finish(t, { candidate: t.branch, result: "ok" })
  cell("AC-10 a: a candidate that does not contain the base is refused, the record is as it was", /не содержит основу/.test(a) && snap(t) === before, a)
  const b = await finish(t, { candidate: "no-such-branch", result: "ok" })
  cell("AC-10 b: a candidate that does not exist is refused with the git fetch hint, the record is as it was", /нет в локальном репозитории/.test(b) && /git fetch/.test(b) && /origin\/<ветка>/.test(b) && snap(t) === before, b)
  const cand = H.candidate(`integrate/t${t.n}`)
  const c = await finish(t, { candidate: `integrate/t${t.n}`, result: "   " })
  cell("AC-10 c: no result is refused, the record is as it was", /нужен result/.test(c) && snap(t) === before, c)
  const e = await finish(t, { result: "CI зелёный" })
  cell("AC-10 e: a result without a candidate is refused, the record is as it was", /нужен candidate/.test(e) && snap(t) === before, e)
  const t2 = H.reviewing()
  const d = await finish(t2, { candidate: "main", result: "ok" })
  cell("AC-10 d: without a record ('running' or 'green' absent) it is refused and no record appears", /записи «идёт» или «зелёная» нет/.test(d) && !T(t2.n).precheck, d)
  const ok = await finish(t, { candidate: `integrate/t${t.n}`, result: "CI зелёный" })
  cell("AC-10 контроль: the same call with a good candidate and result is accepted (green on the base, full hash of the candidate)", T(t.n).precheck?.state === "green" && T(t.n).precheck.candidate === cand && /зелёная на/.test(ok), ok)
  clearLock()
  lockFor(REV, t.n)
  await call("crew_task", REV, { action: "unlock", n: t.n }) // the record becomes stale, the task stays on review
  const f = await finish(t, { candidate: `integrate/t${t.n}`, result: "ok" })
  cell("AC-10 f: a stale record is refused, it stays stale", /записи «идёт» или «зелёная» нет/.test(f) && /прежняя устарела/.test(f) && T(t.n).precheck.state === "stale", f)
}

// ---- AC-12: precheck off
{
  H.settings({ merge_precheck: "off" })
  const t = H.reviewing()
  const r = await begin(t)
  cell("AC-12 precheck off: the action is refused 'не включена', no record", /не включена/.test(r) && !T(t.n).precheck, r)
  clearLock()
  lockFor(REV, t.n)
  const u = await call("crew_task", REV, { action: "unlock", n: t.n })
  cell("AC-12 unlock: unlock works at merge_precheck off, the lock is free", /отпущен/.test(u) && !H.holder(), u)
  H.settings({ merge_precheck: "required" })
}

// ---- AC-13: unlock
{
  const { t } = await greenTask()
  clearLock()
  lockFor(REV, t.n)
  const u = await call("crew_task", REV, { action: "unlock", n: t.n })
  cell("AC-13 a: the holder unlocks: the lock is free, the record is stale 'замок отпущен', a line in the history", !H.holder() && T(t.n).precheck.state === "stale" && T(t.n).precheck.stale.reason === "замок отпущен" && H.history(t.n).some((h) => /unlock/.test(h)), u + JSON.stringify(T(t.n).precheck))
  const t2 = H.reviewing({ reviewer: "sesREV2" })
  const got = lockFor("sesREV2", t2.n)
  cell("AC-13 b: after the unlock another reviewer takes the lock for his task", got.ok && H.holder()?.session === "sesREV2", JSON.stringify(got))
  const c = await call("crew_task", REV, { action: "unlock", n: t.n })
  cell("AC-13 d: a lock of another session is not released by unlock, the holder stays", /не твой/.test(c) && H.holder()?.session === "sesREV2", c)
  clearLock()
  const c0 = await call("crew_task", REV, { action: "unlock", n: t.n })
  cell("AC-13 c: unlock without a lock is refused", /нет/.test(c0) && !H.holder(), c0)
  const ta = H.reviewing()
  const tb = H.reviewing()
  lockFor(REV, tb.n)
  const e = await call("crew_task", REV, { action: "unlock", n: ta.n })
  cell("AC-13 e: the lock of this session is for another task: refused naming it, the lock is left", /для задачи #\d+, а не #/.test(e) && e.includes(`#${tb.n}`) && H.holder()?.n === tb.n, e)
  clearLock()
  const tf = H.reviewing()
  lockFor(REV, tf.n)
  await call("crew_task", "sesINTEG1", { action: "reassign", n: tf.n })
  const holdKept = H.holder()?.session === REV && T(tf.n).status !== "reviewing"
  const f = await call("crew_task", REV, { action: "unlock", n: tf.n })
  cell("AC-13 f: after reassign the status is not reviewing and the lock stays with the reviewer; unlock passes", holdKept && /отпущен/.test(f) && !H.holder(), f)
  const tg = H.reviewing({ executor: "sesREV3" })
  const gs = [
    ["executor", "sesREV3", /Ты исполнитель/],
    ["author", "sesINTEG1", /только его/],
    ["another reviewer", "sesREV2", /только его/],
  ]
  const outs = []
  for (const [, sid, re] of gs) for (const action of ["unlock", "precheck"]) outs.push([action, sid, re.test(await call("crew_task", sid, { action, n: tg.n }))])
  H.settings({ merge_precheck: "required", reviewer: "acceptor" })
  const wrongRole = [await call("crew_task", REV, { action: "unlock", n: tg.n }), await call("crew_task", REV, { action: "precheck", n: tg.n })]
  H.settings({ merge_precheck: "required" })
  cell("AC-13 g: executor, author, another reviewer and a wrong role get a refusal by name for both actions, no record, no lock change", outs.every((x) => x[2]) && wrongRole.every((x) => /право роли acceptor/.test(x)) && !T(tg.n).precheck, JSON.stringify({ outs, wrongRole }))
  const plan = { n: "9", file: "docs/plans/9-demo.md", source: "демо", rounds: [], clean: 0 }
  const th = H.reviewing({ plan })
  const h = await begin(th)
  cell("AC-13 h: precheck in the plan recheck round is refused with an explanation (no landing yet), no record", /перепроверки плана 9/.test(h) && !T(th.n).precheck, h)
  cell("AC-34 раунд плана: the same refusal says that the precheck acts on the landing of the approved plan", /согласованного плана/.test(h) && !T(th.n).precheck, h)
  const approved = H.reviewing({ plan: { ...plan, approval: { decision: "ok", at: Date.now() } } })
  const h2 = await begin(approved)
  cell("AC-34 влитие плана: for an approved plan on landing the precheck starts as for an ordinary task", T(approved.n).precheck?.state === "running", h2)
}

// ---- AC-14 a..e: the record becomes stale
{
  const staleOf = (n) => T(n).precheck?.state === "stale" && T(n).precheck.stale.reason
  let { t } = await greenTask()
  await call("crew_task", REV, { action: "rework", n: t.n, text: "доработать" })
  cell("AC-14 a: rework makes the record stale", staleOf(t.n) === "возвращена исполнителю (доработка)", JSON.stringify(T(t.n).precheck))
  ;({ t } = await greenTask())
  await call("crew_task", REV, { action: "rework", n: t.n, sync: true })
  cell("AC-14 b: rework sync makes the record stale", staleOf(t.n) === "возвращена исполнителю (синхронизация)", JSON.stringify(T(t.n).precheck))
  ;({ t } = await greenTask())
  await call("crew_task", "sesINTEG1", { action: "reassign", n: t.n })
  cell("AC-14 c: reassign makes the record stale", staleOf(t.n) === "передана другой сессии", JSON.stringify(T(t.n).precheck))
  ;({ t } = await greenTask())
  await call("crew_task", "sesINTEG1", { action: "cancel", n: t.n })
  cell("AC-14 d: cancel makes the record stale", staleOf(t.n) === "задача отменена" && T(t.n).status === "cancelled", JSON.stringify(T(t.n).precheck))
  const s = H.reviewing({ fields: { status: "submitted", precheck: { state: "green", base: H.originTip(), at: Date.now(), by: REV, round: 0, candidate: H.originTip(), result: "x", green_at: Date.now() } } })
  await call("crew_task", REV, { action: "review", n: s.n })
  cell("AC-14 e: a new review after a re-submit makes a green record stale", T(s.n).status === "reviewing" && staleOf(s.n) === "приёмка начата заново", JSON.stringify(T(s.n)))
  // a stale record does not come to life by a second review and keeps its first reason
  await call("crew_task", REV, { action: "review", n: s.n })
  cell("AC-14 повтор review: a repeated review of a task already on review leaves the record as it is", staleOf(s.n) === "приёмка начата заново", JSON.stringify(T(s.n).precheck))
}

// ---- AC-33: the task branch and the candidate
{
  const t = H.reviewing()
  await begin(t)
  fetch()
  H.candidate(`integrate/t${t.n}`) // the origin tip plus one own commit: does not contain the task branch
  const w = await finish(t, { candidate: `integrate/t${t.n}`, result: "CI зелёный" })
  cell("AC-33 не предок: the task branch is not in the candidate — a green record and a warning, not a refusal", T(t.n).precheck?.state === "green" && /Внимание: ветка задачи/.test(w), w)
  const t2 = H.reviewing()
  await begin(t2)
  fetch()
  H.candidate(`integrate/t${t2.n}`, { merge: t2.branch })
  const w2 = await finish(t2, { candidate: `integrate/t${t2.n}`, result: "CI зелёный" })
  cell("AC-33 предок: the task branch is in the candidate — no warning", T(t2.n).precheck?.state === "green" && !/Внимание/.test(w2), w2)
}

// ---- AC-36: replace, lock, fetch hint, read failure
{
  const t = H.reviewing()
  await begin(t)
  fetch()
  const c1 = H.candidate(`integrate/a${t.n}`)
  await finish(t, { candidate: `integrate/a${t.n}`, result: "первый" })
  const c2 = H.candidate(`integrate/b${t.n}`)
  const r = await finish(t, { candidate: `integrate/b${t.n}`, result: "второй" })
  cell("AC-36 a: a green record on the same base is replaced by another candidate, a line about the replacement in the history", T(t.n).precheck.candidate === c2 && c1 !== c2 && T(t.n).precheck.result === "второй" && H.history(t.n).some((h) => /запись заменена/.test(h)), r + JSON.stringify(H.history(t.n)))
  clearLock()
  lockFor(REV, t.n)
  const before = snap(t)
  const b = await finish(t, { candidate: `integrate/a${t.n}`, result: "третий" })
  const afterOwn = snap(t)
  clearLock()
  lockFor("sesREV2", H.reviewing({ reviewer: "sesREV2" }).n)
  const b2 = await finish(t, { candidate: `integrate/a${t.n}`, result: "четвёртый" })
  cell("AC-36 b: with this session's lock for this task the finish is refused 'сначала unlock'; another session's lock does not stop it", /сначала crew_task \{action: "unlock"/.test(b) && afterOwn === before && T(t.n).precheck.result === "четвёртый" && /зелёная/.test(b2), b + " | " + b2)
  clearLock()
  const t3 = H.reviewing()
  await begin(t3)
  git(H.other, "pull", "-q", "--ff-only", "origin", "main")
  git(H.other, "switch", "-q", "-c", "remote-only")
  const tipNow = H.originTip()
  git(H.other, "commit", "-q", "--allow-empty", "-m", "remote only")
  git(H.other, "push", "-q", "origin", "remote-only")
  git(H.other, "switch", "-q", "main")
  const bef = snap(t3)
  const c = await finish(t3, { candidate: "remote-only", result: "ok" })
  const afterC = snap(t3)
  fetch()
  const c3 = await finish(t3, { candidate: "origin/remote-only", result: "ok" })
  cell("AC-36 c: a candidate that exists only on origin: refusal with the git fetch hint (record as it was); after fetch 'origin/<branch>' is accepted", /git fetch/.test(c) && /origin\/<ветка>/.test(c) && afterC === bef && T(t3.n).precheck.state === "green" && /зелёная/.test(c3) && tipNow === T(t3.n).precheck.base, c + " | " + c3)
  for (const state of ["running", "green"]) {
    const td = H.reviewing()
    await begin(td)
    fetch()
    H.candidate(`integrate/d${td.n}`)
    if (state === "green") await finish(td, { candidate: `integrate/d${td.n}`, result: "ok" })
    const before = snap(td)
    precheck.seams.readTip = async () => ({ ok: false, kind: "fail", error: "git ls-remote origin: сеть недоступна (проба)" })
    const d = await finish(td, { candidate: `integrate/d${td.n}`, result: "другой" })
    delete precheck.seams.readTip
    cell(`AC-36 d${state === "running" ? 1 : 2}: a read failure at the finish (${state}) is a refusal with the cause, the record is as it was`, /сеть недоступна/.test(d) && snap(td) === before && T(td.n).precheck.state === state, d)
  }
}

// ---- AC-32 precheck: no branch on origin
{
  H.settings({ merge_precheck: "required", target_branch: "nosuch" })
  const t = H.reviewing()
  const r = await begin(t)
  cell("AC-32 precheck: 'ветки nosuch на origin нет' is a refusal, no record is created", /ветки nosuch на origin нет/.test(r) && !T(t.n).precheck, r)
  H.settings({ merge_precheck: "required" })
}

// ---- REQ-24: an old record
{
  const t = H.reviewing()
  const raw = JSON.parse(readFileSync(tasks.taskFile("proj", t.n), "utf8"))
  const sh = await call("crew_task", REV, { action: "show", n: t.n })
  const ls = await call("crew_task", REV, { action: "list" })
  const letter = review.reviewLetter(T(t.n), core.loadConfig(proj))
  cell("REQ-24 old record: a record without precheck and extra is read, shown, listed and put into the review letter as before", !("precheck" in raw) && !("extra" in raw) && sh.includes(`#${t.n}`) && ls.includes(`#${t.n}`) && letter.includes(`#${t.n}`) && !/предпроверк/i.test(sh), sh)
  const r = await begin(t)
  cell("REQ-24 old record: the precheck starts on an old record and the rest of the record is kept (additive field)", /Предпроверка начата/.test(r) && T(t.n).goal === "g" && T(t.n).branch === t.branch, r)
}

done(H)

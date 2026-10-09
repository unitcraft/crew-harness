// Self-test: the texts shown to the reviewer (task 005, REQ-15, REQ-19; AC-19 letter, AC-26, AC-31; node >= 24):
//   node test/crew-landing-letters.test.mjs
// AC-19 письмо: after a restart of OpenCode the letter "work interrupted" to a reviewer who has a precheck record also gives the
// state of the precheck and of the lock ("precheck: green on ..., lock: yours").
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-letters.test")
// the keys of the task are absent in the base settings (the letters at the default values are checked); a section sets what it needs
const H = await harness("crew-landing-letters", { settings: { merge_precheck: undefined }, db: true })
const { call, git, proj, task: T, core, tasks, review } = H
const REV = "sesREV1"

// ---- AC-19 письмо
{
  H.settings({ merge_precheck: "required" })
  const t = H.reviewing()
  await call("crew_task", REV, { action: "precheck", n: t.n })
  git(proj, "fetch", "-q", "origin")
  H.candidate(`integrate/t${t.n}`, { merge: t.branch })
  await call("crew_task", REV, { action: "precheck", n: t.n, candidate: `integrate/t${t.n}`, result: "CI зелёный" })
  await call("crew_task", REV, { action: "merge", n: t.n })
  const card = core.allCards().find((c) => c.session === REV)
  card.review = { project: "proj", n: t.n }
  core.saveCard(card)
  core.addObligation(REV, { qid: "rqpre", from_session: "sesINTEG1", from_role: "proj.integrator", at: Date.now(), nudges: 0, task: "приёмка" })
  H.suspend(REV, 3_600_000)
  await H.until(() => H.letters(REV).some((l) => /Работа прервана перезапуском/.test(l.text)), 50_000)
  const letter = H.letters(REV).find((l) => /Работа прервана перезапуском/.test(l.text))?.text ?? ""
  const rec = T(t.n).precheck
  cell(
    "AC-19 письмо: the letter about the interrupted work gives the state of the precheck and the lock",
    letter.includes(`предпроверка: зелёная на ${rec.base.slice(0, 7)} (кандидат ${rec.candidate.slice(0, 7)}`) && letter.includes(`замок вливания: твой с `) && letter.includes(`на вершине ${rec.lock_on.tip.slice(0, 7)}`),
    letter,
  )
  // a task without a record: the letter is as before, no state lines
  const u = H.reviewing({ reviewer: "sesREV2" })
  const card2 = core.allCards().find((c) => c.session === "sesREV2")
  card2.review = { project: "proj", n: u.n }
  core.saveCard(card2)
  core.addObligation("sesREV2", { qid: "rqpre2", from_session: "sesINTEG1", from_role: "proj.integrator", at: Date.now(), nudges: 0, task: "приёмка" })
  H.suspend("sesREV2", 3_600_000)
  await H.until(() => H.letters("sesREV2").some((l) => /Работа прервана перезапуском/.test(l.text)), 50_000)
  const letter2 = H.letters("sesREV2").find((l) => /Работа прервана перезапуском/.test(l.text))?.text ?? ""
  cell("AC-19 письмо без записи: for a task without a precheck record the letter has no state lines (as before)", letter2.length > 0 && !/предпроверка:|замок вливания:|замок: нет/.test(letter2), letter2)
}

// ---- AC-31: reviewLetter and planMergeLetter for the four combinations of the flags
const cfgOf = (more) => {
  H.settings(more)
  return core.loadConfig(proj)
}
// since 2026-10-09 the defaults are free and required (owner's decision); the old behaviour is the explicit hold and off
const DEFAULTS = { accepted_slot: "free", cleanup_limit: 10, merge_precheck: "required", task_extra_fields: [] }
const LEGACY = { accepted_slot: "hold", cleanup_limit: 10, merge_precheck: "off", task_extra_fields: [] }
const plain = H.reviewing({ title: "обычная" })
const planT = H.reviewing({ title: "план", plan: { n: "9", file: "docs/plans/9-demo.md", source: "демо", rounds: [], clean: 0, approval: { decision: "ok", at: Date.now() } } })
const accepted = H.reviewing({ title: "принятая", reviewer: "sesREV2" })
{
  const x = H.task(accepted.n)
  x.status = "accepted"
  x.history.push({ at: Date.now() - 60_000, by: "sesREV2", status: "accepted", note: "принята" })
  tasks.saveTask(x)
}
const L = (more) => {
  const cfg = cfgOf(more)
  return { cfg, ord: review.reviewLetter(H.task(plain.n), cfg), plan: review.planMergeLetter(H.task(planT.n), cfg) }
}
const dflt = L({})
const expl = L(DEFAULTS)
cell("AC-31 по умолчанию: without the keys and with their default values (free, required) the two letters are byte for byte the same and have the precheck step and the wait for cleanup", dflt.ord === expl.ord && dflt.plan === expl.plan && /ПРЕДПРОВЕРКА/.test(dflt.ord) && /ПРЕДПРОВЕРКА/.test(dflt.plan) && /ждёт уборки/.test(dflt.ord), dflt.ord)
const leg = L(LEGACY)
cell("AC-31 hold/off явно: with the old behaviour set explicitly the two letters have no new words (the order as before the task)", !/precheck|предпроверк|уборки/i.test(leg.ord + leg.plan) && /merge", n: \d+\}/.test(leg.ord), leg.ord)
const req = L({ merge_precheck: "required" })
{
  const o = req.ord
  const at = (re) => o.search(re)
  const order = [at(/action: "review"/), at(/action: "precheck", n: \d+\}/), at(/candidate: "<ветка или хеш>"/), at(/action: "merge"/), at(/action: "accept"/), at(/action: "cleaned"/)]
  cell("AC-31 required: reviewLetter has the precheck step before merge in the order review, precheck, CI, precheck with a candidate, merge, accept, cleaned", order.every((x) => x >= 0) && order.every((x, i) => i === 0 || x > order[i - 1]) && /merge_precheck: required/.test(o), o)
  const pl = req.plan
  const po = [pl.search(/action: "review"/), pl.search(/action: "precheck"/), pl.search(/action: "merge"/), pl.search(/action: "accept"/)]
  cell("AC-31 required (план): planMergeLetter has the same precheck step before merge", po.every((x) => x >= 0) && po.every((x, i) => i === 0 || x > po[i - 1]) && /merge_precheck: required/.test(pl), pl)
  cell("AC-31 required (нумерация): the steps are numbered without a gap", /\n {2}1\) [^\n]*\n {2}2\) ПРЕДПРОВЕРКА[^\n]*\n {2}3\) нашёл ошибки[^\n]*\n {2}4\) всё зелёное[^\n]*\n[^\n]*\n {2}5\) плагин сам проверит/.test(o), o)
}
const fr = L({ accepted_slot: "free", cleanup_limit: 4, merge_precheck: "off" })
cell("AC-31 free: reviewLetter says that an accepted task waits for cleanup without a place and gives 'ждущих уборки N из M'", /принятая задача ждёт уборки и место в inflight_limit не занимает; ждущих уборки 1 из 4/.test(fr.ord) && !/precheck/.test(fr.ord), fr.ord)
const fr0 = L({ accepted_slot: "free", cleanup_limit: 0, merge_precheck: "off" })
cell("AC-31 free без предела: with cleanup_limit 0 the letter says 'N, предела нет'", /ждущих уборки 1, предела нет/.test(fr0.ord), fr0.ord)
const both = L({ accepted_slot: "free", merge_precheck: "required" })
cell("AC-31 оба: both flags — both additions are in the letter", /ПРЕДПРОВЕРКА/.test(both.ord) && /ждёт уборки/.test(both.ord) && /ПРЕДПРОВЕРКА/.test(both.plan), both.ord)

// show: the states of the record
H.settings({ merge_precheck: "required", accepted_slot: "free", cleanup_limit: 4 })
review.releaseMergeLock("proj", REV)
{
  const tip = H.originTip()
  const mk = (rec, more = {}) => {
    const t = H.reviewing({ title: "показ", ...more })
    const x = H.task(t.n)
    if (rec) x.precheck = { by: REV, round: 1, at: Date.now() - 600_000, base: tip, ...rec }
    tasks.saveTask(x)
    return x
  }
  const show = (t, sid = REV) => call("crew_task", sid, { action: "show", n: t.n })
  const hm = (at) => `${String(new Date(at).getHours()).padStart(2, "0")}:${String(new Date(at).getMinutes()).padStart(2, "0")}`
  const none = await show(mk(null))
  cell("AC-31 show без записи: no state lines", !/предпроверка:|замок вливания:|замок: нет/.test(none), none)
  const run = mk({ state: "running" })
  const sRun = await show(run)
  cell("AC-31 show идёт: 'предпроверка: идёт с <время> на <вершина, 7 знаков>' and 'замок: нет'", sRun.includes(`предпроверка: идёт с ${hm(run.precheck.at)} на ${tip.slice(0, 7)}`) && /замок: нет/.test(sRun), sRun)
  const grn = mk({ state: "green", candidate: tip, result: "ok", green_at: Date.now() - 300_000 })
  const sGrn = await show(grn)
  cell("AC-31 show зелёная: 'предпроверка: зелёная на <вершина> (кандидат <7 знаков>, <время>)'", sGrn.includes(`предпроверка: зелёная на ${tip.slice(0, 7)} (кандидат ${tip.slice(0, 7)}, ${hm(grn.precheck.green_at)})`) && /замок: нет/.test(sGrn), sGrn)
  const held = mk({ state: "green", candidate: tip, result: "ok", green_at: Date.now() - 300_000, lock_on: { tip, at: Date.now() - 120_000 } })
  H.take(REV, held.n)
  const sHeld = await show(held)
  const lock = H.holder()
  cell("AC-31 show замок взят: 'замок вливания: твой с <время>, на вершине <вершина>'", sHeld.includes(`замок вливания: твой с ${hm(lock.at)}, на вершине ${tip.slice(0, 7)}`), sHeld)
  review.releaseMergeLock("proj", REV)
  const stl = mk({ state: "stale", stale: { reason: "замок отпущен", at: Date.now() } })
  const sStl = await show(stl)
  cell("AC-31 show устарела: the reason is shown", /предпроверка: устарела \(замок отпущен\)/.test(sStl), sStl)
  const sAcc = (await show(H.task(accepted.n), "sesREV2")).split("\n")[0]
  cell("AC-31 show принятая: at accepted_slot free the first line ends with 'ждёт уборки'", /принята/.test(sAcc) && / — ждёт уборки$/.test(sAcc), sAcc)
  H.settings({ merge_precheck: "required", accepted_slot: "hold" })
  const sAccHold = (await show(H.task(accepted.n), "sesREV2")).split("\n")[0]
  cell("AC-31 show принятая при hold: no mark", !/ждёт уборки/.test(sAccHold), sAccHold)
}

// ---- AC-26: the description of the tool, crew_help
{
  const d = H.tools.crew_task.description
  const props = H.tools.crew_task.input.properties
  cell("AC-26 описание: the English description of crew_task names precheck, unlock, merge_precheck, extra; the input has candidate and extra", /precheck \{n\}/.test(d) && /unlock \{n\}/.test(d) && /merge_precheck: required/.test(d) && /extra/.test(d) && !!props.candidate && !!props.extra && props.action.enum.includes("precheck") && props.action.enum.includes("unlock"), d.slice(0, 200))
  const sd = H.tools.crew_spawn.description
  cell("AC-26 описание crew_spawn: the description of crew_spawn names extra and the flags", /extra \{id/.test(sd) && /accepted_slot: free/.test(sd) && !!H.tools.crew_spawn.input.properties.extra, sd.slice(0, 120))
  const help = core.HELP
  cell("AC-26 HELP: the section ПРИЁМКА names the precheck, unlock, the lock on the same tip, the three keys", ["ПРЕДПРОВЕРКА ВЛИВАНИЯ", "merge_precheck", "precheck {n}", "unlock {n}", "accepted_slot", "cleanup_limit", "task_extra_fields", "только на ту"].every((w) => help.includes(w)), help.slice(0, 80))
  cell(
    "AC-26 HELP по умолчанию: the help says that the precheck and the free slot are on by default, that merge without a precheck is refused, the order, and the keys that return the old order",
    ["по умолчанию required", "merge без предпроверки отклоняется", "review → check → precheck → merge → accept → cleaned", "merge_precheck: off", "accepted_slot: hold"].every((w) => help.includes(w)),
    help.slice(help.indexOf("ПРЕДПРОВЕРКА ВЛИВАНИЯ"), help.indexOf("ПРЕДПРОВЕРКА ВЛИВАНИЯ") + 300),
  )
  cell("AC-26 описание crew_task по умолчанию: the English description says merge without a green precheck is refused by default and the explicit off returns the old order", /merge without a green precheck is refused/.test(d) && /merge_precheck: off/.test(d), d.slice(0, 120))
}

done(H)

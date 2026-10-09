// Self-test: the texts shown to the reviewer (task 005, REQ-15, REQ-19; AC-19 letter, AC-26, AC-31; node >= 24):
//   node test/crew-landing-letters.test.mjs
// AC-19 письмо: after a restart of OpenCode the letter "work interrupted" to a reviewer who has a precheck record also gives the
// state of the precheck and of the lock ("precheck: green on ..., lock: yours").
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-letters.test")
const H = await harness("crew-landing-letters", { settings: { merge_precheck: "required" }, db: true })
const { call, git, proj, task: T, core } = H
const REV = "sesREV1"

// ---- AC-19 письмо
{
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

done(H)

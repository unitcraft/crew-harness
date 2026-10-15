// Self-test: the mark "stuck" goes on the owner's answer and on a working turn (task 052; node >= 24):  node test/crew-stuck-clear.test.mjs
// Live 2026-10-15 (the acceptor #85 of the project nova): the tab showed "⚠ застряла" for 40 minutes after the owner answered its
// question form and while it worked (letters, tool calls, a new form). The cells: every path that must clear the mark (a turn of many
// steps, the early exits of the nudge by the answer modes and by an open question, the owner's turn, the owner's word on the pass,
// the reply to the form), the record without stuckAt, the line of the log, the mark hidden while a form waits for the owner, and the
// rows that must NOT get weaker (empty turns still make a tab stuck, the asker is called).
import { readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { harness, load, reporter } from "./answer-harness.mjs"

const R = reporter("crew-stuck-clear.test")
const cell = R.cell
const NL = String.fromCharCode(10)
const ASK = "sesSCASK"
const S = (n) => `sesSC${String(n).padStart(2, "0")}`
const SIDS = [ASK, ...Array.from({ length: 12 }, (_, i) => S(i + 1)), "sesSCPEER"]
const BASE = { push_empty_turns: 2, push_max: 3, owner_reminder_min: 1 }
const H = await harness("crew-stuck-clear", { sessions: SIDS, settings: BASE })
const { core, msg, db, status } = H
const forms = await load("form-wait.ts")
const LETTER = "⚙ 10:00 · crew → x (служебное, не отвечай)" + NL + "письмо"
const logFile = path.join(os.tmpdir(), "opencode-plugins.log")
const logLines = (re) => readFileSync(logFile, "utf8").split("\n").filter((l) => re.test(l))

const t0 = Date.now()
core.saveCard({ session: ASK, role: "integrator", auto: false, title: ASK, directory: H.proj, repo: "proj", project: "proj", pid: process.pid, updated: t0 })
const plain = (sid) => core.saveCard({ session: sid, role: "worker", auto: false, title: sid, directory: H.proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
/** a stuck obligation as the live one: set before task 043, no stuckAt and no stuckWhat */
const stuckOld = (sid, qid = `q-${sid}`) => {
  plain(sid)
  core.addObligation(sid, { qid, from_session: ASK, from_role: "proj.integrator", at: t0 - 3_600_000, nudges: 2, empty: 3, stuck: true })
  return qid
}
const ob = (sid) => core.obligationsOf(sid)[0]
const cleared = (sid) => {
  const o = ob(sid)
  return !!o && !o.stuck && !o.stuckAt && !o.stuckWhat && !o.empty && !o.nudges
}
const waitCleared = (sid, ms = 5_000) => H.until(() => cleared(sid), ms)
const unstuckLine = (sid, why) => logLines(new RegExp(`unstuck ${sid} for q-${sid}: ${why}`)).length > 0
const idleRow = (sid, at = Date.now()) => {
  msg(sid, "idle", { outcome: "succeeded" }, at)
  db.prepare("update session_v2 set time_idle = ? where id = ?").run(at, sid)
}

// ---- 1. a working turn of several steps: the tool call is in an early step, the last step is text only (live: 10-11 s apart) ----
{
  const sid = S(1)
  stuckOld(sid)
  await H.open(sid) // step 1: the request that opens the turn
  msg(sid, "user", { text: LETTER }, Date.now() - 1)
  msg(sid, "assistant", { content: [{ type: "tool", name: "bash" }] })
  await H.wait(6_500) // the tool runs longer than the slack of the turn (5 s)
  await H.open(sid) // step 2: one more request of the same turn
  msg(sid, "assistant", { content: [{ type: "text", text: "проверил, иду дальше" }] })
  idleRow(sid)
  await H.events["session.idle"]({ properties: { sessionID: sid } })
  await waitCleared(sid)
  cell("1 a working turn of several steps (the tool in an early step) clears an old mark without stuckAt, the counters start over", cleared(sid), JSON.stringify(ob(sid)))
  cell("1a the clearing writes the line 'unstuck <session> for <qid>: a working turn' to the log", unstuckLine(sid, "a working turn"), "no line")
}

// ---- 2. the early exit by an open question of the tab (expect_reply waits): a working turn still clears ----
{
  const sid = S(2)
  stuckOld(sid)
  plain("sesSCPEER")
  core.addObligation("sesSCPEER", { qid: "qPeerAsk", from_session: sid, from_role: "proj.worker", at: Date.now(), nudges: 0 }) // the tab's own question
  cell("2- the tab has an open question (asksOpen): the nudge exits early", core.asksOpen(sid), "asksOpen false")
  await H.turn(sid, "работаю, жду ответа соседа", { user: LETTER, tool: true })
  await waitCleared(sid)
  cell("2 a working turn clears the mark although the nudge exits early by the open question", cleared(sid), JSON.stringify(ob(sid)))
}

// ---- 3. the owner's turn (the owner wrote in the tab, no tool call): clears ----
{
  const sid = S(3)
  stuckOld(sid)
  await H.turn(sid, "понял, продолжаю", { user: "посмотри ещё раз ветку задачи" })
  await waitCleared(sid)
  cell("3 a turn where the owner wrote clears the mark (without a tool call)", cleared(sid), JSON.stringify(ob(sid)))
  cell("3a the log names the reason: the owner wrote in the tab", unstuckLine(sid, "the owner wrote in the tab"), "no line")
}

// ---- 4. the owner's word while the turn still runs: cleared on the pass, not at the end of the turn ----
{
  const sid = S(4)
  stuckOld(sid)
  await H.open(sid) // the turn runs, no idle row
  H.ownerSays(sid, "продолжай приёмку")
  await waitCleared(sid, 6_000)
  cell("4 the owner's word in the tab clears the mark on the nearest pass, before the end of the turn", cleared(sid), JSON.stringify(ob(sid)))
}

// ---- 5. the owner answered the question form of the tab: cleared at once ----
{
  const sid = S(5)
  stuckOld(sid)
  forms.addForm(sid, { id: "frmSC05", at: Date.now(), question: "Вливать?", kind: "question", session: sid })
  await H.open(sid) // the turn is held by the form
  await H.hooks.event?.({ type: "form.replied", properties: { id: "frmSC05", sessionID: sid } })
  await waitCleared(sid, 3_000)
  cell("5 the owner's reply to the question form clears the mark at once (no end of the turn)", cleared(sid), JSON.stringify(ob(sid)))
  cell("5a the log names the reason: the owner answered the question form", unstuckLine(sid, "the owner answered the question form"), "no line")
  const sid2 = S(6)
  stuckOld(sid2)
  forms.addForm(sid2, { id: "frmSC06", at: Date.now(), question: "Продолжать?", kind: "question", session: sid2 })
  await H.open(sid2)
  await H.hooks.event?.({ type: "form.replied", properties: { id: "frmSC06" } }) // the event without the session: the record names it
  await waitCleared(sid2, 3_000)
  cell("5b a reply event without the session id clears the mark of the tab that holds the form", cleared(sid2), JSON.stringify(ob(sid2)))
}

// ---- 6. while the tab waits for the owner (a form is open) the mark is not shown; another stuck tab still shows it ----
{
  const sid = S(7)
  const ctl = S(8)
  stuckOld(sid)
  stuckOld(ctl)
  const at = Date.now()
  for (const s of [sid, ctl]) core.saveObligations(s, [{ ...ob(s), stuckAt: at, stuckWhat: "вопрос — 3 хода подряд остановилась без работы и без ответа" }])
  forms.addForm(sid, { id: "frmSC07", at, question: "Какой вариант?", kind: "question", session: sid })
  const st = (s) => {
    try {
      return JSON.parse(readFileSync(path.join(status.STATUS, `${s}.json`), "utf8"))
    } catch {
      return undefined
    }
  }
  await H.until(() => st(sid)?.state === "owner" && !!st(ctl), 5_000)
  await H.wait(400)
  const view = status.formatStatuses(status.readStatuses(), Date.now(), "proj")
  const side = status.sidebarLines(status.readStatuses(), Date.now(), "proj").rows.map((r) => status.sideText(r))
  cell("6 a tab with an open question form (waits for the owner): no stuck in its status", st(sid)?.state === "owner" && !st(sid)?.stuck, JSON.stringify(st(sid)))
  cell("6a the obligation itself keeps the mark (only the view hides it): nothing is cleared by a mere open form", !!ob(sid)?.stuck, JSON.stringify(ob(sid)))
  cell("6b a stuck tab without a form still shows 'застряла с ЧЧ:ММ' in /crew and in the sidebar", !!st(ctl)?.stuck?.length && /застряла с \d\d:\d\d/.test(view) && side.some((l) => /застряла/.test(l)), JSON.stringify({ ctl: st(ctl)?.stuck, side }))
  forms.removeForm(sid, "frmSC07")
}

// ---- 7. not weaker: empty turns still make a tab stuck, the asker is called, more empty turns keep the mark ----
{
  const sid = S(9)
  plain(sid)
  core.addObligation(sid, { qid: `q-${sid}`, from_session: ASK, from_role: "proj.integrator", at: Date.now(), nudges: 0 })
  await H.turn(sid, "статус: работаю", { user: LETTER })
  await H.wait(400)
  await H.turn(sid, "статус: работаю", { user: LETTER })
  await H.until(() => !!ob(sid)?.stuck, 4_000)
  const call = () => H.letters(ASK).filter((l) => /застряла/.test(l.text) && l.text.includes(sid))
  await H.until(() => call().length > 0, 4_000)
  cell("7 empty turns (push_empty_turns) still make the tab stuck with its time, and the asker gets the call", !!ob(sid)?.stuck && !!ob(sid)?.stuckAt && call().length === 1, JSON.stringify({ ob: ob(sid), call: call().length }))
  await H.wait(400)
  await H.turn(sid, "статус: работаю", { user: LETTER })
  await H.wait(800)
  cell("7a one more empty turn (a letter of the plugin, no tool call) keeps the mark", !!ob(sid)?.stuck, JSON.stringify(ob(sid)))
}

// ---- 8. the early exit by the answer modes (the turn is taken by an answer by recommendation): a working turn still clears ----
{
  const sid = S(10)
  stuckOld(sid)
  H.setSettings({ ...BASE, answer_mode: { default: "recommendations" } })
  await H.wait(50)
  const block = ["В-01 Выбор формата", "Тип: implementation", "Рекомендация: json", "Автоответ: допустим"].join(NL)
  await H.turn(sid, block, { user: LETTER, tool: true })
  await waitCleared(sid)
  cell("8 a working turn clears the mark although the answer modes take the turn (early exit of the nudge)", cleared(sid), JSON.stringify(ob(sid)))
  H.setSettings(BASE)
}

R.done(H)

// Self-test of the show of the automatic answers (task 007, REQ-17, REQ-18; node >= 24):  node test/crew-answer-view.test.mjs
// The section "Автоответы" of /crew (formatStatuses), the line of the side panel (sidebarLines, sideText), the event of the task in
// crew_task show, the files status/<session>.json that the answers must not change, and the word of the owner that turns a record
// into "владелец вмешался". The answers are made by answerTurn over a real database of turns; the plugin runs, so the status files
// are the real ones. The code comes from CREW_PLUGIN_DIR (a copy with stubs) or from the folder above.
import { readFileSync } from "node:fs"
import path from "node:path"
import { harness, load, reporter } from "./answer-harness.mjs"

const R = reporter("crew-answer-view.test")
const cell = R.cell
const NL = String.fromCharCode(10)
const SIDS = Array.from({ length: 14 }, (_, i) => `sesView${String(i + 1).padStart(2, "0")}`)
const H = await harness("crew-answer-view", { sessions: SIDS, settings: { owner_reminder_min: 1 } })
const A = await load("answer.ts")
const { core, status, tasks } = H
let n = 0
const nextSid = () => SIDS[n++]
const LETTER = "⚙ 10:00 · crew → x (служебное, не отвечай)" + NL + "ответ"
const modes = (max = 3) => H.setSettings({ owner_reminder_min: 1, answer_mode: { default: "recommendations" }, answer_max: max })
const block = (k, q, o = {}) => [`В-0${k} ${q}`, `Тип: ${o.type ?? "implementation"}`, ...(o.rec === null ? [] : [`Рекомендация: ${o.rec ?? "делаем по первому варианту"}`]), "Автоответ: допустим"].join(NL)
const deps = { ownerWordAfter: core.ownerWordAfter, lastUserAt: core.lastUserAt }
const st = (sid, extra = {}) => {
  const card = core.readJson(core.cardFile(sid))
  return status.statusOf({ card: { ...card, ...extra }, busy: false, end: undefined, asked: [], now: Date.now(), watches: [] })
}
/** an answer made directly: the end of the turn is read from the database */
const answer = async (sid, text, now = Date.now()) => {
  const at = Date.now() - 5_000
  await H.turn(sid, text, { user: LETTER, at, event: false })
  const card = core.readJson(core.cardFile(sid))
  const end = await core.turnEnd(sid)
  return A.answerTurn({ card, key: "proj.worker", end, cfg: H.cfg(), now, channel: "status", deps })
}
const saveCard = (sid, extra = {}) => core.saveCard({ session: sid, role: "worker", auto: false, title: sid, directory: H.proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now(), ...extra })
const crew = (now = Date.now()) => status.formatStatuses([st(SIDS[0])], now, "proj")

// ---- AC-19: the section of /crew --------------------------------------------------------------------------------------
{
  modes()
  const sid = nextSid()
  saveCard(sid)
  await answer(sid, block(1, "Как назвать функцию?", { rec: "parseBlock" }))
  const text = crew()
  const rec = A.readRecords(sid, "a")[0]
  const need = ["автоответы за 24 ч: 1", new Date(rec.answeredAt).toTimeString().slice(0, 5), "implementation", "recommendations", "дан", "рекомендация", "Как назвать функцию?", "parseBlock"]
  const missing = need.filter((x) => !text.includes(x))
  cell("AC-19 раздел", missing.length === 0 && /proj\.worker|sesView01|#\d+/.test(text), JSON.stringify([missing, text]))
}
{
  // the event in crew_task show
  modes()
  const sid = nextSid()
  const t = tasks.createTask({ project: "proj", title: "задача", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesOWNER1", author_role: "proj.integrator", qid: `q-${sid}`, status: "running", kind: "spawn", directory: H.proj, executor: sid })
  saveCard(sid, { task: { project: "proj", n: t.n }, spawned: { by: "sesOWNER1", task: "задача", tier: "light", status: "running", at: Date.now(), qid: `q-${sid}` } })
  await answer(sid, block(1, "Как назвать функцию?", { rec: "parseBlock" }))
  const shown = await H.call("crew_task", "sesOWNER1", { action: "show", n: t.n })
  cell("AC-19 show", /ответ по настройке проекта \(recommendations/.test(shown), shown.slice(-400))
}
{
  // the status files: the same turn with the answer and without it (modes off): the same file, but for the time fields
  const at = Date.now() - 20_000
  const text = [block(1, "Как назвать функцию?"), "Согласны с рекомендацией?"].join(NL)
  const mk = async (sid, on) => {
    on ? modes() : H.setSettings({ owner_reminder_min: 1 })
    await H.turn(sid, text, { user: "поехали", at })
    await H.wait(1500)
    const raw = JSON.parse(readFileSync(path.join(status.STATUS, `${sid}.json`), "utf8"))
    delete raw.updated
    delete raw.notified
    return JSON.stringify(raw).replaceAll(sid, "<S>")
  }
  const withAnswer = await mk(nextSid(), true)
  const without = await mk(nextSid(), false)
  cell("AC-19 статус автоответ", withAnswer === without && A.readRecords(undefined, "a").length >= 1, withAnswer + NL + without)
}

// ---- AC-20: the owner's word turns the record into "владелец вмешался" and /crew shows it ---------------------------------
{
  modes()
  const sid = nextSid()
  saveCard(sid)
  await answer(sid, block(1, "Как назвать функцию?", { rec: "parseBlock" }))
  H.ownerSays(sid, "стоп, назови иначе", Date.now())
  await H.wait(1200)
  const rec = A.readRecords(sid, "a")[0]
  cell("AC-20 вмешался", rec.state === "владелец вмешался" && /вмешался владелец: 1/.test(crew()) && /владелец вмешался/.test(crew()), JSON.stringify([rec.state, crew()]))
}

// ---- AC-30 б: the line of /crew for the rest ----------------------------------------------------------------------------------
{
  modes()
  const sid = nextSid()
  saveCard(sid)
  await answer(sid, [block(1, "Первый вопрос?"), "", block(2, "Второй вопрос?", { rec: null })].join(NL))
  const text = crew()
  cell("AC-30 б /crew", /ждёт слова владельца:/.test(text) && /В-02 Второй вопрос\?/.test(text) && /нет рекомендации/.test(text), text)
}

// ---- AC-32: the line of the side panel -----------------------------------------------------------------------------------------
{
  const rows = status.sidebarLines([st(SIDS[0])], Date.now(), "proj").rows
  const line = rows.find((r) => /^авто 24ч:/.test(r.what))
  cell("AC-32 строка", !!line && /^авто 24ч: \d+ · вмеш\. \d+$/.test(line.what) && !!status.sideText(line), JSON.stringify(rows))
  const long = A.answerSideRow("proj", Date.now())
  // the longest combination: four-digit counts; the panel prints 32 characters
  const wide = { mark: " ", who: "", what: "авто 24ч: 9999 · вмеш. 9999", tone: "muted" }
  cell("AC-32 ширина", status.sideText(wide).length <= 32 && status.sideText(wide) === `    ${wide.what}` && status.sideText(long ?? wide).length <= 32, status.sideText(wide))
  const none = status.sidebarLines([st(SIDS[0])], Date.now(), "no-such-project").rows
  const future = status.sidebarLines([st(SIDS[0])], Date.now() + 3 * 24 * 3_600_000, "proj").rows
  cell("AC-32 нет строки при N=0", !none.some((r) => /^авто 24ч:/.test(r.what)) && !future.some((r) => /^авто 24ч:/.test(r.what)) && A.answerSideRow("proj", Date.now() + 3 * 24 * 3_600_000) === undefined, JSON.stringify([none, future]))
}

R.done(H)

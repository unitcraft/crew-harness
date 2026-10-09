// Self-test of the journal and the decision of the question-answering modes (task 007; node >= 24):
//   node test/crew-answer-journal.test.mjs
// answerTurn closes the questions of the end of a turn that the settings allow to close: a record of the journal (answers/ in the
// box of the plugin), a letter to the session, a note in the history of its task, a mark of the rest. Here, over the real modules,
// a real sqlite database of turns and the real files: the limit of answers in a row and its reset by the owner's word (AC-14), one
// answer and one letter for a question whatever the repeats, the second instance, the second process and the breaks between the
// steps (AC-17), the text of the letter (AC-18), the rate of the check of the owner's word (AC-20), a broken journal and a failing
// read (AC-22). The code comes from CREW_PLUGIN_DIR (a copy with stubs) or from the folder above.
import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { pathToFileURL } from "node:url"
import { PLUGIN, harness, load, reporter } from "./answer-harness.mjs"

const run = promisify(execFile)
const R = reporter("crew-answer-journal.test")
const cell = R.cell
const NL = String.fromCharCode(10)
const H = await harness("crew-answer-journal", { plugin: false })
const { core, tasks } = H
const A = await load("answer.ts")
const A2 = await import(pathToFileURL(path.join(PLUGIN, "answer.ts")).href + "?instance=2")

let calls = 0
let failOwnerWord = false
const deps = {
  ownerWordAfter: async (s, at) => {
    calls++
    if (failOwnerWord) throw new Error("the read of the dialog failed")
    return core.ownerWordAfter(s, at)
  },
  lastUserAt: core.lastUserAt,
}
let clock = Date.now() - 3_600_000
const tick = () => (clock += 10_000)
const LETTER = "⚙ 10:00 · crew → x (служебное, не отвечай)" + NL + "ответ по настройке"
const modes = (max = 3, map = { default: "recommendations" }) => H.setSettings({ answer_mode: map, answer_max: max })
const saveCard = (sid, extra = {}) => {
  const c = { session: sid, role: "worker", auto: false, title: sid, directory: H.proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now(), ...extra }
  core.saveCard(c)
  return c
}
const blocks = (nums, o = {}) =>
  nums
    .map((n) => [`В-0${n} Вопрос номер ${n}?`, `Тип: ${o.types?.[n] ?? "implementation"}`, `Рекомендация: делаем по первому варианту ${n}`, "Автоответ: допустим"].join(NL))
    .join(NL + NL)
/** a turn that ends with `text`; the turn is started by a letter of the plugin (not by the owner) unless `user` says otherwise */
const turn = async (sid, text, user = LETTER) => {
  const at = tick()
  await H.turn(sid, text, { user, at, event: false })
  return at
}
const pass = async (sid, now = clock + 5_000, mod = A) => {
  const card = core.readJson(core.cardFile(sid))
  const end = await core.turnEnd(sid)
  return mod.answerTurn({ card, key: "proj.worker", end, cfg: H.cfg(), now, channel: "status", deps })
}
const recs = (sid, kind) => A.readRecords(sid).filter((r) => !kind || r.kind === kind).sort((a, b) => a.end - b.end || a.qn - b.qn)
const dirs = (sid) => {
  const key = core.safeKey(sid)
  const out = [path.join(core.INBOX, key), path.join(core.READ, key)]
  try {
    for (const d of readdirSync(core.DELIVERING)) out.push(path.join(core.DELIVERING, d, key))
  } catch {}
  return out
}
/** the files of the letters of answers to closed questions (not the letters of the rest) in the inbox, the delivering and the read */
const answerLetters = (sid, re = /^answer-(?!rest-)/) =>
  dirs(sid).flatMap((d) => {
    try {
      return readdirSync(d).filter((f) => re.test(f) && f.endsWith(".json")).map((f) => path.join(d, f))
    } catch {
      return []
    }
  })
const deliver = (sid) => {
  const claimed = core.claimLetters(sid, `${process.pid}-${Date.now()}`)
  core.confirmLetters(claimed)
  return claimed.length
}
const taskFor = (sid) => {
  const t = tasks.createTask({ project: "proj", title: "задача", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesOWNER1", author_role: "proj.integrator", qid: `q-${sid}`, status: "running", kind: "spawn", directory: H.proj })
  return t
}
const logTail = () => {
  try {
    return readFileSync(path.join(os.tmpdir(), "opencode-plugins.log"), "utf8").split(NL).slice(-200).join(NL)
  } catch {
    return ""
  }
}

// ---- AC-14: the limit of answers in a row ----------------------------------------------------------------------------
{
  const sid = "sesLimit01"
  modes(2)
  saveCard(sid)
  await turn(sid, blocks([1]))
  const r1 = await pass(sid)
  await turn(sid, blocks([1]))
  const r2 = await pass(sid)
  await turn(sid, blocks([1]))
  const r3 = await pass(sid)
  const rest3 = recs(sid, "r")[0]
  const limitOk = recs(sid, "a").length === 2 && r1.handled && r2.handled && r3.handled && rest3?.rest?.[0]?.reason === "предел автоответов"
  const limitDetail = JSON.stringify([recs(sid).map((r) => [r.kind, r.qn, r.state]), rest3?.rest])
  H.ownerSays(sid, "продолжай", tick())
  await turn(sid, blocks([1]))
  await pass(sid)
  const a = recs(sid, "a")
  // two answers, the third goes to the owner as the limit; the owner's word resets the count
  cell("AC-14 счёт", limitOk && a.length === 3 && a[0].state === "владелец вмешался" && a[1].state === "владелец вмешался" && a[2].state === "дан", limitDetail + JSON.stringify(a.map((r) => r.state)))
}
{
  const sid = "sesLimit02"
  modes(2)
  saveCard(sid)
  await turn(sid, blocks([1]))
  await pass(sid)
  await turn(sid, blocks([1]))
  await pass(sid)
  await turn(sid, blocks([1]))
  await pass(sid)
  await turn(sid, blocks([1]))
  const again = await pass(sid)
  const rests = recs(sid, "r")
  const rest4 = rests[rests.length - 1]
  // the next turn without the owner's word is the limit again; the mark of a rest does not reset the count
  const afterRest = recs(sid, "a").length === 2 && again.handled && rest4?.rest?.[0]?.reason === "предел автоответов" && rests.length === 2
  const afterRestDetail = JSON.stringify([recs(sid).map((r) => [r.kind, r.state]), rest4?.rest])
  H.ownerSays(sid, "да, дальше", tick())
  await turn(sid, blocks([1]))
  await pass(sid)
  cell("AC-14 после остатка", afterRest && recs(sid, "a").length === 3 && recs(sid, "a")[2].state === "дан", afterRestDetail + JSON.stringify(recs(sid, "a").map((r) => r.state)))
}
{
  const sid = "sesLimit03"
  modes(2)
  saveCard(sid)
  await turn(sid, blocks([1, 2, 3]))
  const r = await pass(sid)
  const rest = recs(sid, "r")[0]
  cell("AC-14 пачка из трёх", r.handled && recs(sid, "a").map((x) => x.qn).join() === "1,2" && rest?.rest?.length === 1 && rest.rest[0].n === 3 && rest.rest[0].reason === "предел автоответов", JSON.stringify([recs(sid).map((x) => [x.kind, x.qn]), rest?.rest]))
}
{
  const sid = "sesLimit04"
  modes(2)
  saveCard(sid)
  await turn(sid, blocks([1, 2]))
  await pass(sid)
  const before = JSON.stringify(recs(sid))
  const r2 = await pass(sid, clock + 99_000)
  cell("AC-14 повтор", r2.handled && JSON.stringify(recs(sid)) === before && recs(sid, "r").length === 0 && recs(sid, "a").length === 2 && !r2.notice, JSON.stringify([before, recs(sid)]))
}

// ---- AC-17: one answer and one letter for a question ----------------------------------------------------------------
{
  const sid = "sesOnce001"
  modes(3)
  saveCard(sid)
  await turn(sid, blocks([1]))
  await pass(sid)
  const rec = recs(sid, "a")[0]
  const claimed = core.claimLetters(sid, `${process.pid}-${Date.now()}`) // the letter is taken for delivery and not yet confirmed
  await pass(sid, clock + 20_000)
  // while the letter is in delivering/ there is no second one
  const inDelivery = claimed.length === 1 && answerLetters(sid).length === 1 && recs(sid, "a").length === 1 && recs(sid, "a")[0].answeredAt === rec.answeredAt
  core.confirmLetters(claimed)
  await pass(sid, clock + 40_000)
  cell("AC-17 письмо в доставке", inDelivery && answerLetters(sid).length === 1 && answerLetters(sid)[0].includes(path.sep + "read" + path.sep), JSON.stringify([inDelivery, answerLetters(sid)]))
}
{
  const sid = "sesOnce002"
  modes(3)
  saveCard(sid)
  await turn(sid, blocks([1]))
  await pass(sid)
  const rec = recs(sid, "a")[0]
  const file = path.join(A.ANSWERS, `${rec.id}.json`)
  const j = JSON.parse(readFileSync(file, "utf8"))
  delete j.letterPostedAt
  writeFileSync(file, JSON.stringify(j))
  const claimed = core.claimLetters(sid, `${process.pid}-${Date.now()}`)
  await pass(sid, clock + 20_000)
  cell("AC-17 без отметки", claimed.length === 1 && answerLetters(sid).length === 1 && !!recs(sid, "a")[0].letterPostedAt, JSON.stringify([claimed.length, answerLetters(sid)]))
}
{
  // the breaks between the steps: a pack of two, block 1 stays with the owner (type gate), block 2 is closed
  const make = async (sid) => {
    modes(3)
    const t = taskFor(sid)
    saveCard(sid, { task: { project: "proj", n: t.n }, spawned: { by: "sesOWNER1", task: "задача", tier: "light", status: "running", at: Date.now(), qid: `q-${sid}` } })
    core.addObligation(sid, { qid: `q-${sid}`, from_session: "sesOWNER1", from_role: "proj.integrator", at: Date.now(), nudges: 0 })
    await turn(sid, blocks([1, 2], { types: { 1: "gate" } }))
    await pass(sid)
    return t
  }
  const notes = (t) => tasks.loadTask("proj", t.n).history.filter((h) => /\[a-/.test(h.note ?? "")).length
  // (a) the break after the record of block 2 and before the letter and the event
  const sidA = "sesBreakA01"
  const tA = await make(sidA)
  const aRec = recs(sidA, "a")[0]
  const full = JSON.stringify({ a: recs(sidA, "a").length, r: recs(sidA, "r").length, letters: answerLetters(sidA).length, notes: notes(tA) })
  for (const f of answerLetters(sidA)) rmSync(f)
  const fa = path.join(A.ANSWERS, `${aRec.id}.json`)
  const ja = JSON.parse(readFileSync(fa, "utf8"))
  delete ja.letterPostedAt
  writeFileSync(fa, JSON.stringify(ja))
  const tt = tasks.loadTask("proj", tA.n)
  tt.history = tt.history.filter((h) => !/\[a-/.test(h.note ?? ""))
  tasks.saveTask(tt)
  rmSync(path.join(A.ANSWERS, recs(sidA, "r")[0].id + ".json"))
  await pass(sidA, clock + 30_000)
  const afterA = JSON.stringify({ a: recs(sidA, "a").length, r: recs(sidA, "r").length, letters: answerLetters(sidA).length, notes: notes(tA) })
  // (b) the break after the record, the letter and the event, before the mark of the rest
  const sidB = "sesBreakB01"
  const tB = await make(sidB)
  rmSync(path.join(A.ANSWERS, recs(sidB, "r")[0].id + ".json"))
  await pass(sidB, clock + 30_000)
  await pass(sidB, clock + 60_000)
  cell("AC-17 обрыв", full === afterA && JSON.parse(afterA).a === 1 && JSON.parse(afterA).r === 1 && JSON.parse(afterA).letters === 1 && JSON.parse(afterA).notes === 1 && recs(sidB, "r").length === 1 && recs(sidB, "a").length === 1 && answerLetters(sidB).length === 1 && notes(tB) === 1, JSON.stringify([full, afterA, recs(sidB).map((r) => r.kind), answerLetters(sidB).length, notes(tB)]))
}
{
  const sid = "sesOnce003"
  modes(2)
  saveCard(sid)
  await turn(sid, blocks([1, 2]))
  await pass(sid)
  const files = JSON.stringify(recs(sid).map((r) => [r.id, r.answeredAt, r.state]))
  const nLetters = answerLetters(sid).length
  const r2 = await pass(sid, clock + 77_000)
  cell("AC-17 повтор при пределе", r2.handled && files === JSON.stringify(recs(sid).map((r) => [r.id, r.answeredAt, r.state])) && recs(sid, "r").length === 0 && answerLetters(sid).length === nLetters && nLetters === 2 && !r2.notice, JSON.stringify([files, recs(sid).map((r) => r.kind), answerLetters(sid).length]))
}
{
  const sid = "sesOnce004"
  modes(3)
  saveCard(sid)
  await turn(sid, blocks([1]))
  await pass(sid)
  const first = recs(sid, "a")[0]
  deliver(sid)
  await pass(sid, clock + 50_000)
  const second = recs(sid, "a")[0]
  cell("AC-17 повтор прохода", recs(sid, "a").length === 1 && second.answeredAt === first.answeredAt && second.state === first.state && answerLetters(sid).length === 1, JSON.stringify([first, second, answerLetters(sid)]))
}
{
  const sid = "sesOnce005"
  modes(3)
  saveCard(sid)
  await turn(sid, blocks([1]))
  await pass(sid)
  const first = recs(sid, "a")[0]
  deliver(sid)
  const res = await pass(sid, clock + 50_000, A2)
  cell("AC-17 второй экземпляр", res.handled && recs(sid, "a").length === 1 && recs(sid, "a")[0].answeredAt === first.answeredAt && answerLetters(sid).length === 1, JSON.stringify([recs(sid, "a").length, answerLetters(sid)]))
}
{
  // another process: first one after the other (the first record decides), then two at once
  const child = path.join(import.meta.dirname, "answer-child.mjs")
  const spawnChild = (sid, now, startAt = 0) => run(process.execPath, [child, H.tmp, sid, String(now), String(startAt)], { env: { ...process.env }, timeout: 60_000 }).then((r) => JSON.parse(r.stdout.trim().split(NL).pop()))
  const sid = "sesProc0001"
  modes(3)
  saveCard(sid)
  await turn(sid, blocks([1]))
  await pass(sid)
  const first = recs(sid, "a")[0]
  deliver(sid)
  const res = await spawnChild(sid, clock + 200_000)
  const afterOne = recs(sid, "a")
  // a child process after the parent: the first record decides, no second letter
  const afterParent = res.handled === true && afterOne.length === 1 && afterOne[0].answeredAt === first.answeredAt && answerLetters(sid).length === 1
  const sid2 = "sesProc0002"
  saveCard(sid2)
  await turn(sid2, blocks([1]))
  const startAt = Date.now() + 1_500
  const both = await Promise.all([spawnChild(sid2, clock + 300_000, startAt), spawnChild(sid2, clock + 301_000, startAt)])
  const aa = recs(sid2, "a")
  // two children at once: one record, one letter
  cell("AC-17 второй процесс", afterParent && both.every((x) => x.handled === true) && aa.length === 1 && aa[0].letterPostedAt > 0 && answerLetters(sid2).length === 1, JSON.stringify([afterParent, res, afterOne.map((r) => r.answeredAt), first.answeredAt, both, aa.length, answerLetters(sid2)]))
}

// ---- AC-18: the text of the letter ----------------------------------------------------------------------------------
{
  const sid = "sesText0001"
  modes(3)
  const c = saveCard(sid)
  await turn(sid, blocks([1, 2], { types: { 2: "gate" } }))
  await pass(sid)
  const letter = JSON.parse(readFileSync(answerLetters(sid)[0], "utf8"))
  const shown = core.formatLetters([letter], c)
  const need = ["answer_mode: recommendations", "тип implementation", "не слово владельца", "только слово владельца", "вышел за рекомендацию — вопрос владельцу", "Вопросы, оставшиеся у владельца", "В-02"]
  const missing = need.filter((s) => !shown.includes(s))
  cell("AC-18 подстроки", shown.startsWith("⚙") && missing.length === 0 && letter.from_session === core.PLUGIN_SENDER && !/^from_session: *"(owner|владелец)/.test(JSON.stringify(letter)), JSON.stringify([missing, shown.slice(0, 200)]))
  deliver(sid)
  await pass(sid, clock + 90_000)
  cell("AC-18 повтор", answerLetters(sid).length === 1, JSON.stringify(answerLetters(sid)))
}

// ---- REQ-16: the event in the history of the task, nothing else of the task changes ----------------------------------
{
  const sid = "sesTask0001"
  modes(3)
  const t = taskFor(sid)
  saveCard(sid, { task: { project: "proj", n: t.n }, spawned: { by: "sesOWNER1", task: "задача", tier: "light", status: "running", at: Date.now(), qid: `q-${sid}` } })
  const snap = (x) => JSON.stringify({ ...x, history: undefined, updated: undefined })
  const before = snap(tasks.loadTask("proj", t.n))
  await turn(sid, blocks([1]))
  await pass(sid)
  const after = tasks.loadTask("proj", t.n)
  cell("REQ-16 событие задачи", snap(after) === before && after.history.filter((h) => /\[a-sesTask0001-/.test(h.note ?? "")).length === 1, JSON.stringify(after.history.slice(-2)))
}

// ---- AC-20: the rate of the check of the owner's word -----------------------------------------------------------------
{
  const sid = "sesRate0001"
  modes(3)
  saveCard(sid)
  await turn(sid, blocks([1]))
  await pass(sid)
  await turn(sid, "Работа идёт, вопросов нет.")
  const c0 = calls
  await pass(sid, clock + 1_000)
  const c1 = calls
  await pass(sid, clock + 2_000)
  const c2 = calls
  H.ownerSays(sid, "стоп, не так", tick())
  await pass(sid, clock + 3_000)
  const c3 = calls
  await pass(sid, clock + 4_000)
  const c4 = calls
  cell("AC-20 частота", c1 - c0 === 1 && c2 === c1 && c3 - c2 === 1 && c4 === c3 && recs(sid, "a")[0].state === "владелец вмешался", JSON.stringify([c0, c1, c2, c3, c4, recs(sid, "a").map((r) => r.state)]))
}

// ---- AC-22: a broken journal and a failing read ---------------------------------------------------------------------
{
  const sid = "sesBroken01"
  modes(3)
  saveCard(sid)
  mkdirSync(A.ANSWERS, { recursive: true })
  writeFileSync(path.join(A.ANSWERS, `a-${sid}-${clock - 60_000}-1.json`), "{ this is not json")
  await turn(sid, blocks([1]))
  const res = await pass(sid)
  const endAt = (await core.turnEnd(sid)).at
  cell("AC-22 журнал", res.handled === false && answerLetters(sid).length === 0 && !existsSync(path.join(A.ANSWERS, `a-${sid}-${endAt}-1.json`)) && /answer: sesBroken01/.test(logTail()), JSON.stringify([res, logTail().slice(-300)]))
  const sid2 = "sesBroken02"
  saveCard(sid2)
  await turn(sid2, blocks([1]))
  failOwnerWord = true
  // a record to check, so that the failing read is reached
  const fine = await pass(sid2)
  await turn(sid2, blocks([1]))
  const res2 = await pass(sid2)
  failOwnerWord = false
  cell("AC-22 исключение", fine.handled === true && res2.handled === false && recs(sid2, "a").length === 1 && answerLetters(sid2).length === 1 && /answer: sesBroken02/.test(logTail()), JSON.stringify([fine, res2, recs(sid2, "a").length, answerLetters(sid2).length]))
}

// ---- the size of the journal: a pass costs the same with a thousand files (review 1, finding 2) ---------------------------------
{
  const sid = "sesPerf0001"
  modes(3)
  saveCard(sid)
  mkdirSync(A.ANSWERS, { recursive: true })
  const DAY = 24 * 3_600_000
  const fake = (name, end) => writeFileSync(path.join(A.ANSWERS, name), JSON.stringify({ id: name.replace(/\.json$/, ""), kind: "a", session: "sesOther", project: "proj", qn: 1, end, type: "implementation", mode: "recommendations", who: "рекомендация", question: "q", answer: "a", state: "дан", askedAt: end, answeredAt: end + 5 }))
  for (let i = 0; i < 700; i++) fake(`a-sesOther${i % 20}-${clock - 40 * DAY + i}-1.json`, clock - 40 * DAY + i) // older than the term of the storage
  for (let i = 0; i < 300; i++) fake(`a-sesOther${i % 20}-${clock - 5 * DAY + i}-1.json`, clock - 5 * DAY + i) // within the term, older than a day
  await turn(sid, blocks([1]))
  const first = await pass(sid, clock + 900_000) // 15 minutes after the earlier passes of this test: the purge of the old records is due
  const times = []
  const sides = []
  for (let k = 0; k < 6; k++) {
    const t0 = performance.now()
    await pass(sid, clock + 10_000 + k)
    times.push(performance.now() - t0)
    const t1 = performance.now()
    A.answerSideRow("proj", clock + 10_000 + k)
    sides.push(performance.now() - t1)
  }
  const files = readdirSync(A.ANSWERS).filter((f) => f.endsWith(".json"))
  const stale = files.filter((f) => Number(/-(\d+)-\d+\.json$/.exec(f)?.[1]) < clock - 30 * DAY)
  cell("REQ-15 журнал 1000 файлов", first.handled && Math.min(...times) < 50 && Math.min(...sides) < 50 && stale.length === 0 && files.filter((f) => f.startsWith("a-sesOther")).length === 300 && recs(sid, "a").length === 1, JSON.stringify({ times: times.map(Math.round), sides: sides.map(Math.round), stale: stale.length, left: files.length }))
}

R.done(H)

// Self-test: endsWithQuestion also fires on phrases that wait for the owner's word without a question mark (task 024; node >= 24):
//   node test/crew-waiting-phrases.test.mjs
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-phrases-"))
process.env.XDG_DATA_HOME = tmp
const status = await import("../status.ts")
let fail = 0
const cell = (name, ok, extra = "") => { if (!ok) { fail++; console.log(`FAIL ${name} ${extra}`) } }

const yes = [
  "жду вашего отдельного разрешения на вливание",
  "Итог.\nПриёмщик ждёт слова владельца.",
  "Ожидаю вашего решения по ветке",
  "Мы ждём вашего подтверждения",
  "Ожидает согласия владельца на пуш.",
  "Awaiting your distinct landing GO",
  "Waiting for your approval to merge.",
  "I need your decision on this.",
  "Ready.\nAwaiting owner confirmation\nSignature",
  "Жду решения приёмки и вашего разрешения на пуш.",
  "Всё сделано.\nЖду вашего GO.\nСТОП: ожидание",
]
// task 062: the live phrase of the source (2026-10-16, the integrator stopped at a gate without a question) and its kin
yes.push(
  "Остановлено до вашего решения; спецификация ещё не утверждена, чистая серия не принята.",
  "Сводка выше.\nОстановлено до вашего решения.",
  "Работа остановлена до решения владельца.",
  "Остановлено, нужно решение владельца по воротам.",
  "Всё записано, до вашего слова ничего не вливаю.",
)
const no = [
  "не жду разрешения",
  "Не требуется ваше разрешение.",
  "разрешение получено",
  "ждал вашего слова, получил",
  "awaiting nothing",
  "no approval needed",
  "Готово. Ничего не жду, продолжаю.",
  "Не ожидаю вашего решения, делаю сам.",
  "not waiting for your approval",
  "Жду результата тестов.",
  "Awaiting CI results.",
  "Жду результата CI, посадку без вашего разрешения не делаю.",
  "Из 8 required workflows 7 зелёные, nova-gate ещё выполняется. Жду его вердикт; посадку без вашего разрешения не делаю.",
  "Awaiting CI, will not land without your approval.",
  "Не просит разрешения, делает сам.",
  "Старая строка: жду вашего слова\nА1\nА2\nА3",
  "Новых действий не делаю, жду решения приёмки.",
  "Жду вердикта приёмщика и слияния.",
  "Ожидаю ответа воркера.",
  "Жду решения CI.",
  // task 062: the new phrases do not fire on a decision that is already made, or a stop with no decision in it
  "Остановлено: решение принято, продолжаю.",
  "Остановлено по решению владельца, которое получено.",
  "Остановлено, ничего не требуется.",
  "Не останавливался, решения не жду.",
  "Сделано до вашего прихода.",
]
for (const t of yes) { const r = status.endsWithQuestion(t); cell(`yes: ${t}`, typeof r === "string" && r.length > 0, String(r)) }
for (const t of no) { const r = status.endsWithQuestion(t); cell(`no: ${t}`, r === undefined, String(r)) }
const long = "жду вашего слова " + "я".repeat(400)
cell("long text cut to 300", (status.endsWithQuestion(long) ?? "").length === 301, String(status.endsWithQuestion(long)?.length))
cell("question still wins as before", status.endsWithQuestion("Итог.\n\nПушить main?\n\nСТОП: вопрос") === "Пушить main?")

// task 037: an executor who handed the task in does not wait for the owner; a form or a non-executor still does
const tasks = await import("../tasks.ts")
const fw = await import("../form-wait.ts")
const mkTask = (status) => tasks.createTask({ project: "p37", title: "t", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "m", author: "sesINT37", author_role: "p37.integrator", qid: `q-${status}`, status, kind: "spawn", directory: tmp })
const st = (card, text, busy = false) => status.statusOf({ card: { project: "p37", role: "worker", title: "x", ...card }, busy, end: busy ? undefined : { at: Date.now(), text, ownerAfter: false }, asked: [], now: Date.now(), watches: [] })
const handed = mkTask("reviewing")
const running = mkTask("running")
const ex = (t) => ({ session: `sesEX${t.n}`, spawned: true, task: { project: "p37", n: t.n } })
const own = (r) => r.state === "owner" || r.state === "question"
cell("executor on review + 'жду решения приёмки': not question/owner", !own(st(ex(handed), "Новых действий не делаю, жду решения приёмки.")), JSON.stringify(st(ex(handed), "Новых действий не делаю, жду решения приёмки.")))
cell("executor on review + '?' at the end: not question/owner", !own(st(ex(handed), "Что дальше?")), "q")
cell("executor on review + form: owner", (fw.handleFormEvent({ type: "form.created", data: { form: { id: "f37", sessionID: ex(handed).session, metadata: { kind: "question" }, fields: [{ name: "q0", question: "Можно?" }] } } }), st(ex(handed), "жду решения приёмки").state === "owner"), "form")
cell("integrator + 'Жду вашего решения по плану.': owner", st({ session: "sesINT37", role: "integrator", spawned: undefined }, "Жду вашего решения по плану.").state === "owner", "int")
cell("running executor + 'жду решения приёмки': not question", st(ex(running), "жду решения приёмки").state !== "question", "run1")
cell("running executor + 'жду вашего решения': question", st(ex(running), "жду вашего решения").state === "question", "run2")

// task 056: a turn that ends with a waiting phrase waits for instructions, not for an answer to a question (the two phrases of
// the source, 2026-10-15); the turn still stops the nudge (endsWithQuestion finds it), the line with "?" stays a question
const SRC = ["Сообщил интегратору, что жду дальнейших указаний.", "Ожидаю дальнейшего решения по #23."]
for (const p of SRC) {
  cell(`056: '${p}' stops the nudge as before`, status.endsWithQuestion(`Проверка закончена.\n${p}`) === p, String(status.endsWithQuestion(p)))
  cell(`056: '${p}' is a wait, not a question`, status.endOfTurn?.(p)?.wait === true, JSON.stringify(status.endOfTurn?.(p)))
  const r = st(ex(running), `Проверка закончена.\n${p}`)
  cell(`056: a task session with '${p}' waits for instructions`, r.state === "question" && r.wait === true && r.question === p && /ждёт указаний/.test(r.detail) && !/вопрос|ответа/.test(r.detail), JSON.stringify(r))
}
cell("056: the integrator named in the phrase is who it waits for", /ждёт указаний интегратора/.test(st(ex(running), SRC[0]).detail), st(ex(running), SRC[0]).detail)
cell("056: a line with '?' is a question", status.endOfTurn?.("Базу опустить?")?.wait === false && st(ex(running), "Базу опустить?").wait === undefined && /ждёт ответа/.test(st(ex(running), "Базу опустить?").detail), JSON.stringify(st(ex(running), "Базу опустить?")))
const ownerWait = st({ session: "sesINT56", role: "integrator", spawned: undefined }, "Жду вашего решения по плану.")
cell("056: an owner's tab with a waiting phrase waits for the owner, no word 'вопрос'", ownerWait.state === "owner" && ownerWait.wait === true && !/вопрос/.test(ownerWait.detail), JSON.stringify(ownerWait))

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-waiting-phrases.test: FAIL ${fail}` : "crew-waiting-phrases.test ok")
process.exit(fail ? 1 : 0)

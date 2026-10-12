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

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-waiting-phrases.test: FAIL ${fail}` : "crew-waiting-phrases.test ok")
process.exit(fail ? 1 : 0)

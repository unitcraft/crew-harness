// Self-test of the glued-words sign "word + number" (task 127, node >= 24):  node test/crew-glued-words.test.mjs
// A model that loses spaces writes "потолок092 решён15:21" instead of "потолок 092 решён 15:21". The sign catches a Russian word of 3+
// letters glued to digits or a time, digits glued to a Russian word of 4+ letters, a Latin word glued to a time, and a "number word"
// (task, hold, round...) glued to digits. Allowed project forms (С6, Э0, В14, 10мс, ВходВ14...) are not caught.
import { gluedText, gluedMarks, gluedFix, gluedRefusal } from "../glued.ts"

let fail = 0
let n = 0
const cell = (name, ok, detail) => {
  n++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const rej = (t) => gluedText(t).reject
const detail = (t) => JSON.stringify(gluedText(t))

// the phrases of the owner (chat, 2026-10-20) and of the two screenshots: all rejected
const bad = [
  "потолок092 решён15:21",
  "interrupted question15:24",
  "Оркестратору передано16:27",
  "Разрешение110 round5",
  "запрос13:34",
  "готовность0.3",
  "задача081",
  "Нова110",
  "HOLD110",
  "15:21принять решение",
  "в файле 2000строк, не больше",
  "Закрыто, pin061 не меняем.",
  "Роли ждутворот4, дальше по плану.",
  "шаг5–9 выполнены",
  "ЗАДАЧА081 принята",
  "Step2 готов, Phase3 ждёт",
  "session4 закрыта владельцем",
  "Оркестратору передано16:27:05 по часам",
  "Нова110.",
  "(Нова110)",
  "«потолок092» — так не пишем",
  "- пункт один\n- задача081 принята\n- пункт три",
  "| колонка | значение |\n|---|---|\n| статус | потолок092 |",
  "Тесты зелёные, review уже входит в countedOpen, поэтому before merge остаётся 3 из 5. Остальное по плану, подробности в письме выше, ничего не потеряно. Задача081 принята и закрыта. Ещё немного текста, чтобы письмо стало длинным и обычным по виду, с пробелами везде кроме одного места, а в конце вывод: всё хорошо, дальше ждём ответа владельца.",
]
for (const [i, t] of bad.entries()) cell(`glued phrase ${i + 1} is rejected: ${t.slice(0, 28).replace(/\n/g, " ")}`, rej(t), detail(t))

// allowed forms: not caught
const good = [
  "С6",
  "Э0",
  "В14",
  "Ш.2",
  "Я-30",
  "10мс",
  "MSVC 0.3",
  "2-я",
  "0.3 не заявляем",
  "Сессия С7п принята, Э0 и В14 пройдены.",
  "Ждём 5с, потом ещё 100мкс и 21-го числа.",
  "AC-1 и REQ-05 из ADR-0012 выполнены 2026-10-20.",
  "ВходВ14 и ВходВ13Подготовка — имена входов.",
  "задача 081 принята, потолок 092 решён 15:21",
  "Оркестратору передано в 16:27, запрос в 13:34.",
  "Gate14 повторяются, win32-x64, base64, sha256, utf8 и IPv6.",
  "Версия v2.0.26, 30+ агентов, 100% тестов, 12:30 по часам.",
  "Ветка task-005-review2-fixes и ISO 8601.",
  "Вызови `потолок092` как есть, это код, и `передано16:27` тоже.",
  "Блок кода:\n```\nпотолок092 решён15:21\nHOLD110\n```\nи дальше обычный текст.",
  "Ссылка https://example.com/потолок092 и путь doc/задачи/потолок092.md в тексте.",
  "Хеш 5cdd2bc9a1f0e3 и коммит abcdef1234567 без слов.",
  "Метка определена: `дер002` — дерево задачи. Дальше: дер002 и список.",
  "Q5 принят, S21 прочитан, M1550 включён, T5 пройден.",
  "Обычное русское предложение без цифр, все слова разделены пробелами.",
  "Plain English: the gate is green, round 5 is open, HOLD 110 stays, task 081 done at 16:27.",
  "[ссылка на файл](doc/tasks/потолок092/plan.md) в тексте",
]
for (const [i, t] of good.entries()) cell(`allowed form ${i + 1} passes: ${t.slice(0, 28).replace(/\n/g, " ")}`, !rej(t), detail(t))

// what the marks name
cell("marks name the glued word", gluedMarks("потолок092 решён15:21").join("|") === "потолок092|решён15:21", JSON.stringify(gluedMarks("потолок092 решён15:21")))
cell("a Latin word with a time is named with the time", gluedMarks("interrupted question15:24").join("|") === "question15:24", JSON.stringify(gluedMarks("interrupted question15:24")))
cell("a word is named once", gluedMarks("задача081, задача081 и задача081").length === 1, JSON.stringify(gluedMarks("задача081, задача081")))
cell("the order of marks is the order in the text", gluedMarks("Нова110 и HOLD110").join("|") === "Нова110|HOLD110", JSON.stringify(gluedMarks("Нова110 и HOLD110")))
cell("the old mixed-alphabet runs are kept", gluedText("reviewУЖЕвходитвcountedOpen/inflight,поэтому beforemerge=3/5, готовоkeyfeatureзавершена").reject, "not rejected")
cell("the old rule is unchanged: one short mixed run is not enough", !rej("Привет, результатвlightnative есть."), detail("Привет, результатвlightnative есть."))

// where the space returns
cell("fix: word and digits", gluedFix("потолок092") === "потолок 092", gluedFix("потолок092"))
cell("fix: word and time", gluedFix("передано16:27") === "передано 16:27", gluedFix("передано16:27"))
cell("fix: digits and word", gluedFix("15:21принять") === "15:21 принять", gluedFix("15:21принять"))
cell("fix: Latin word and time", gluedFix("question15:24") === "question 15:24", gluedFix("question15:24"))

// the text of the refusal
const g = gluedText("потолок092 решён15:21, запрос13:34 и Нова110")
const r = gluedRefusal(g)
cell("refusal of a letter names the first three glued words", r.includes("«потолок092» → «потолок 092»") && r.includes("«решён15:21» → «решён 15:21»") && r.includes("«запрос13:34»"), r)
cell("refusal says how many more", r.includes("и ещё 1"), r)
cell("refusal of a letter asks to rewrite the letter", /Не отправлено/.test(r) && /Перепиши письмо/.test(r), r)
const rq = gluedRefusal(g, "question")
cell("refusal of a question says the question is not shown", /Вопрос не показан/.test(rq) && /Перепиши вопрос/.test(rq), rq)
const rf = gluedRefusal(g, "file", "doc/x.md")
cell("refusal of a file names the file and the code exception", /Файл doc\/x\.md не записан/.test(rf) && /в коде/.test(rf), rf)
cell("the old refusal of a mixed run is unchanged", gluedRefusal(gluedText("reviewУЖЕвходитвcountedOpen/inflight,поэтому beforemerge=3/5, готовоkeyfeatureзавершена")).includes("«reviewУЖЕвходитвcountedOpen…»"), gluedRefusal(gluedText("reviewУЖЕвходитвcountedOpen/inflight,поэтому beforemerge=3/5, готовоkeyfeatureзавершена")))

console.log(fail ? `crew-glued-words.test: FAIL ${fail} of ${n}` : `crew-glued-words.test ok (${n} checks)`)
process.exit(fail ? 1 : 0)

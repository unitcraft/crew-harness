// Self-test of the parse of a session's answer (task 007, REQ-04, REQ-05, REQ-07; node >= 24):  node test/crew-answer-parse.test.mjs
// parseTurn divides the last answer of a turn into blocks (lines "В-<number>"), reads the nine fields, and finds the blocks that
// are questions ("?" at the end of a line outside the values of the fields); classify closes a block only when all the conditions
// hold at once. Here: the table of cases AC-29 and the cases of AC-06 whose result does not depend on the gate words (the words
// have their own test, crew-answer-gate). The code comes from CREW_PLUGIN_DIR (a copy with stubs) or from the folder above.
import path from "node:path"
import { pathToFileURL } from "node:url"

const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
const P = await import(pathToFileURL(path.join(plugin, "answer-parse.ts")).href)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const j = (v) => JSON.stringify(v)
const ctx = (more = {}) => ({ map: P.normalizeAnswerMode({ default: "recommendations" }).map, review: false, count: 0, max: 3, ...more })
const types = (text) => P.parseTurn(text).blocks.map((b) => b.type)

// 1. the spellings of the field "Тип"
const spell = ["**Тип:** plan", "- Тип: plan", "`Тип:` plan.", "Тип: `plan`.", "ТИП: Plan", "  * Тип (Сессия С1): plan"]
cell("AC-29 1", spell.every((s) => j(types(`В-01 Вопрос?\n${s}\nРекомендация: так`)) === j(["plan"])), spell.map((s) => `${s} => ${j(types(`В-01 Вопрос?\n${s}`))}`).join("; "))

// 2. the recommendation to a blank line or the next field
const t2 = P.parseTurn("В-01 Вопрос?\nТип: plan\nРекомендация: первая строка\nвторая строка\n\nтретья, уже не рекомендация\nАвтоответ: допустим").blocks[0]
const t2b = P.parseTurn("В-01 Вопрос?\nРекомендация: раз\nдва\nСрок: 30 мин\nТип: plan").blocks[0]
cell("AC-29 2", t2.recommendation === "первая строка вторая строка" && t2b.recommendation === "раз два", j([t2.recommendation, t2b.recommendation]))

// 3. two types with different values: the block goes to the owner, the stricter wins
const t3a = P.parseTurn("В-01 Вопрос?\nТип: plan\nТип: gate\nРекомендация: так\nАвтоответ: допустим").blocks[0]
const t3b = P.parseTurn("В-01 Вопрос?\nТип: plan\nТип: implementation\nРекомендация: так\nАвтоответ: допустим").blocks[0]
const t3c = P.parseTurn("В-01 Вопрос?\nТип: plan\nТип: PLAN\nРекомендация: так\nАвтоответ: допустим").blocks[0]
cell("AC-29 3", t3a.type === "gate" && P.classify(t3a, ctx()).reason === "ворота (тип gate)" && t3b.type === "?" && P.classify(t3b, ctx()).closed === false && t3c.type === "plan", j([t3a.type, t3b.type, t3c.type]))

// 4. a field before the first identifier of a package: the whole answer to the owner
const t4 = P.parseTurn("Тип: plan\nИтог по шагу.\n\nВ-01 Вопрос?\nТип: plan\nРекомендация: так\nАвтоответ: допустим\n\nВ-02 Ещё вопрос?\nТип: plan\nРекомендация: так\nАвтоответ: допустим")
cell("AC-29 4", !!t4.ownerAll && t4.blocks.filter((b) => b.question).length === 2 && t4.blocks.every((b) => P.classify(b, ctx()).closed === false), j(t4.ownerAll))

// 5. two pairs of fields without identifiers: the whole answer to the owner
const t5 = P.parseTurn("Можно так?\nТип: plan\nРекомендация: так\nТип: implementation\nРекомендация: иначе")
cell("AC-29 5", !!t5.ownerAll && t5.blocks.every((b) => P.classify(b, ctx()).closed === false), j(t5))

// 6. "- В-01 ..." with a list marker and fields with an indent: the blocks divide, Адресат and Срок are not the recommendation
const t6 = P.parseTurn("- В-01 Первый вопрос?\n  Тип: plan\n  Рекомендация: делать так\n  Адресат: владелец\n  Срок: 30 мин\n  Автоответ: допустим\n- В-02 Второй вопрос?\n  Тип: implementation\n  Рекомендация: иначе")
cell("AC-29 6", t6.blocks.length === 2 && t6.blocks[0].qn === 1 && t6.blocks[1].qn === 2 && t6.blocks[0].recommendation === "делать так" && t6.blocks[1].recommendation === "иначе" && t6.blocks[0].fields.some((f) => f.name === "срок" && f.value === "30 мин"), j(t6.blocks.map((b) => [b.qn, b.recommendation])))

// 7. a report that quotes the lines "Тип:" and "Рекомендация:" without identifiers, with "?" in the middle and in a query: not a question
const t7 = P.parseTurn("Итог. Правило такое: что делаем? Решает человек.\nСсылка: https://example.test/a?b=1 и дальше.\n\nТип: plan\nРекомендация: так записано в Каноне\nАвтоответ: допустим")
cell("AC-29 7", t7.blocks.every((b) => !b.question) && !t7.ownerAll, j(t7.blocks.map((b) => [b.question, b.qmark])))

// 8. a block with "?" at the end and no fields is a question that goes to the rest; "?" after "Варианты:" with no Тип, Рекомендация,
//    Автоответ is a question too; "?" inside brackets and quotes counts
const t8a = P.parseTurn("Итог.\n\nВ-01 Что выбрать?\n\nВ-02 Ещё один вопрос")
const t8b = P.parseTurn("В-01 Выбор\nВарианты: а) один б) два\nКакой берём?")
const t8d = P.parseTurn("В-01 Выбор\nВарианты: а) один б) два?")
const t8c = P.parseTurn("В-01 Выбор (что берём?)\nВ-02 Выбор «берём это?»\nВ-03 Выбор: **берём?**")
cell("AC-29 8", t8a.blocks.find((b) => b.qn === 1).question && P.classify(t8a.blocks.find((b) => b.qn === 1), ctx()).reason === "блок без полей" && !t8a.blocks.find((b) => b.qn === 2).question && t8b.blocks[0].question && t8b.blocks[0].fields.length === 1 && !t8d.blocks[0].question && t8c.blocks.every((b) => b.question && b.qmark), j([t8a.blocks.map((b) => b.question), t8b.blocks[0], t8c.blocks.map((b) => b.qmark)]))

// 9. the recommendation: "нет, отдельной задачей" is one; a bare dash and an empty one are not; the bare "нет" is one
const rec = (v) => P.parseTurn(`В-01 Вопрос?\nТип: plan\nРекомендация:${v}\nАвтоответ: допустим`).blocks[0].recommended
const recClosed = (v) => P.classify(P.parseTurn(`В-01 Вопрос?\nТип: plan\nРекомендация:${v}\nАвтоответ: допустим`).blocks[0], ctx()).closed
cell("AC-29 9", rec(" нет, отдельной задачей") && !rec(" —") && !rec(" -") && !rec("") && !rec(" **—**.") && rec(" нет") && !P.parseTurn("В-01 Вопрос?\nТип: plan\nАвтоответ: допустим").blocks[0].recommended && recClosed(" нет, отдельной задачей") && recClosed(" нет") && !recClosed(" —") && !recClosed("") && !recClosed(" **—**."), "recommended")

// 10. no "Автоответ: допустим", or another word in it: to the owner
const flagClosed = (line) => P.classify(P.parseTurn(`В-01 Вопрос?\nТип: plan\nРекомендация: так${line ? "\n" + line : ""}`).blocks[0], ctx()).closed
const auto = (line) => P.parseTurn(`В-01 Вопрос?\nТип: plan\nРекомендация: так${line ? "\n" + line : ""}`).blocks[0].auto
cell("AC-29 10", auto("Автоответ: допустим") && auto("Автоответ: Допустим.") && auto("**Автоответ:** допустим") && !auto("") && !auto("Автоответ: нет") && !auto("Автоответ: допустим (после слияния)") && !auto("Автоответ: допустим\nАвтоответ: нет") && flagClosed("Автоответ: допустим") && flagClosed("Автоответ: Допустим.") && !flagClosed("") && !flagClosed("Автоответ: нет") && !flagClosed("Автоответ: допустим (после слияния)"), "auto")

// 11. a question in the text before the first "В-01"
const t11a = P.parseTurn("Сначала скажи, делаем ли мы это?\n\nВ-01 Вопрос?\nТип: plan\nРекомендация: так\nАвтоответ: допустим")
const t11b = P.parseTurn("Сначала скажу, что делаем это.\n\nВ-01 Вопрос?\nТип: plan\nРекомендация: так\nАвтоответ: допустим")
const pre = (t) => t.blocks.find((b) => b.qn === 0)
cell("AC-29 11", pre(t11a)?.question === true && P.classify(pre(t11a), ctx()).reason === "блок без полей" && !t11a.ownerAll && !pre(t11b)?.question, j([pre(t11a), pre(t11b)?.question]))

// AC-06: the cases whose result does not depend on the gate words: no type, empty, unknown, no permission -> to the owner
const closedBy = (text) => P.parseTurn(text).blocks.filter((b) => b.question).map((b) => P.classify(b, ctx()).closed)
const base = "В-01 Вопрос?\nРекомендация: так\nАвтоответ: допустим"
const noType = P.classify(P.parseTurn(base).blocks[0], ctx())
const emptyType = P.classify(P.parseTurn("В-01 Вопрос?\nТип:\nРекомендация: так\nАвтоответ: допустим").blocks[0], ctx())
const otherType = P.classify(P.parseTurn("В-01 Вопрос?\nТип: другое\nРекомендация: так\nАвтоответ: допустим").blocks[0], ctx())
cell("AC-06", noType.reason === "нет типа/признака/неизвестный тип" && emptyType.reason === "нет типа/признака/неизвестный тип" && otherType.reason === "нет типа/признака/неизвестный тип" && closedBy("В-01 Вопрос?\nТип: plan\nРекомендация: так").every((c) => !c) && closedBy("В-01 Вопрос?\nТип: plan\nРекомендация: так\nАвтоответ: допустим (после слияния)").every((c) => !c), j([noType, emptyType, otherType]))

// REQ-07: the reasons of the rest are a closed list of nine; a review session and the types of the owner mode
const rv = P.classify(P.parseTurn("В-01 Вопрос?\nТип: plan\nРекомендация: так\nАвтоответ: допустим").blocks[0], ctx({ review: true }))
cell("REQ-07 reasons", P.REST_REASONS.length === 9 && new Set(P.REST_REASONS).size === 9 && rv.reason === "сессия приёмки" && P.FAILURE_REASON === "сбой разбора", j([P.REST_REASONS.length, rv]))

// REQ-11: the parse does not throw on a hostile input; a failure is the owner's
cell("REQ-11 no throw", [undefined, null, 5, "", "\r\n\r\n", "В-", "В-99999999999999999999999 ?", "?".repeat(5000)].every((t) => { try { return Array.isArray(P.parseTurn(t).blocks) } catch { return false } }), "throw")

console.log(fail ? `crew-answer-parse.test: FAIL ${fail}` : "crew-answer-parse.test ok")
process.exit(fail ? 1 : 0)

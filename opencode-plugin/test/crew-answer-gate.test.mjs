// Self-test of the second net of the closed-by-default rule: the gate words (task 007, REQ-13, AC-05; node >= 24):
//   node test/crew-answer-gate.test.mjs
// A question block is closed by its recommendation only when no stem of the list of gate words is in its text. Here: one cell for
// each of the 190 stems (AC-05 а), the fixed tables of the specification (T-7, T-8, T-9: one cell for each phrase), and the
// cases of the rules of the text: the continuation of a recommendation, the stem inside a word, the letter "ё", the underscore,
// the end of a word with dots, the letters cut by invisible marks, the fields and what a field may carry (AC-05 в, е, ж, з, и, к).
// The code comes from CREW_PLUGIN_DIR (a copy with stubs) or from the folder above.
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as F from "./answer-fixtures.mjs"

const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
const P = await import(pathToFileURL(path.join(plugin, "answer-parse.ts")).href)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const NL = String.fromCharCode(10)
const ctx = { map: P.normalizeAnswerMode({ default: "recommendations" }).map, review: false, count: 0, max: 3 }
/** the verdict for the first question block of a text */
const verdict = (text) => {
  const b = P.parseTurn(text).blocks.find((x) => x.question)
  return b ? P.classify(b, ctx) : { closed: false, reason: "(no question block)" }
}
/** a block with the given question line and extra lines; rec: the recommendation */
const block = (question, { rec = "так", extra = [] } = {}) => ["В-01 " + question, "Тип: implementation", "Автоответ: допустим", "Рекомендация: " + rec, ...extra].join(NL)
const toOwnerByWords = (text) => {
  const v = verdict(text)
  return !v.closed && v.reason === "ворота (слова)"
}
const closed = (text) => verdict(text).closed === true

cell("AC-05 счёт таблиц", F.T7.length === 20 && F.T8.length === 30 && F.T9_FORMS.length === 76 && F.T9_GATE_QUESTIONS.length === 20 && F.T9_JARGON.length === 17 && F.T9_LIVE.length === 10 && F.T9_MATRIX.length === 36 && F.T9_UNDERSCORE.length === 6 && F.T9_CUT_WORDS.length === 3 && F.T9_HOLES.length === 8 && F.T9_REAL_FIELDS.length === 10 && P.GATE_STEMS.length === 190, JSON.stringify([F.T7.length, F.T8.length, F.T9_FORMS.length, P.GATE_STEMS.length]))

// AC-05 а: a case for each stem, in the values of the fields "Затрагивает" and "Влияет" alternately; the sample is bare, the control
// is the same block without it
const sampleOf = (stem) => (stem.startsWith("|") ? stem.slice(1, -1) : stem.startsWith("^") ? stem.slice(1) : stem)
P.GATE_STEMS.forEach((stem, i) => {
  const sample = sampleOf(stem)
  const field = i % 2 ? "Влияет" : "Затрагивает"
  const ok = toOwnerByWords(block("Как назвать функцию?", { extra: [`${field}: ${sample}`] })) && P.gateWord(sample) !== undefined
  cell(`AC-05 а stem:${stem}`, ok, JSON.stringify(verdict(block("Как назвать функцию?", { extra: [`${field}: ${sample}`] }))))
})
cell("AC-05 контроль: без слов блок закрывается", closed(block("Как назвать функцию?", { extra: ["Затрагивает: REQ-04"] })), JSON.stringify(verdict(block("Как назвать функцию?"))))

// AC-05 б: the fixed tables; every phrase goes to the owner by the words
F.T7.forEach((q, i) => cell(`AC-05 б Т-7 ${String(i + 1).padStart(2, "0")}`, toOwnerByWords(block(q)), q))
F.T8.forEach((q, i) => cell(`AC-05 б Т-8 ${String(i + 1).padStart(2, "0")}`, toOwnerByWords(block(q)), q))
const groups = [
  ["словоформа", F.T9_FORMS],
  ["вопрос ворот", F.T9_GATE_QUESTIONS],
  ["жаргон", F.T9_JARGON],
  ["живая", F.T9_LIVE],
  ["матрица", F.T9_MATRIX],
]
for (const [title, list] of groups) list.forEach((q, i) => cell(`AC-05 б Т-9 ${title} ${String(i + 1).padStart(2, "0")}`, toOwnerByWords(block(q)), q))
F.T9_UNDERSCORE.concat(F.T9_DOT).forEach((q, i) => cell(`AC-05 б Т-9 знаки ${String(i + 1).padStart(2, "0")}`, toOwnerByWords(block(q)), q))

// AC-05 в: a gate word only in the continuation of a long recommendation
cell("AC-05 в", toOwnerByWords(block("Как назвать функцию?", { rec: "parseBlock," + NL + "потому что так короче, а потом влить ветку в основную" })) && toOwnerByWords(["В-01 Как назвать функцию?", "Тип: implementation", "Автоответ: допустим", "Рекомендация: parseBlock", "и затем удалить старое", "Срок: 30 мин"].join(NL)), "continuation")

// AC-05 е: the stem "тег" does not fire in "интегратор"; "git tag" does
cell("AC-05 е", closed(block("Спросить интегратора про именование?")) && toOwnerByWords(block("Поставить git tag на коммит?")) && P.gateWord("интегратор") === undefined && P.gateWord("тег") !== undefined, JSON.stringify([verdict(block("Спросить интегратора про именование?")), P.gateWord("интегратор")]))

// AC-05 ж: "ё" is "е", also "е" with a combining diaeresis
const nfd = "М" + "е" + String.fromCharCode(0x308) + "ржим ветку?"
cell("AC-05 ж", toOwnerByWords(block(nfd)) && toOwnerByWords(block("Мёржим ветку?")) && toOwnerByWords(block("Смёржить ветку?")), nfd)

// AC-05 з: words before the colon, the marks of emphasis, the end of a word, cut words; and what must not open the gate
const z = [F.T9_BEFORE_COLON, "Выполнить `rm` для папки?", "Нужен ли rm.", "Нужно ли _стереть_ ветку?", "Можно _main_?", "Сделать _rm_ для папки?", "Сделать __kill__ процесса?", "Нужен ли rmdir?", ...F.T9_CUT_WORDS]
const zBad = z.filter((q) => !toOwnerByWords(block(q)))
const zControl = [...F.T9_CONTROL_WORDS.map((w) => block("Как назвать функцию? " + w)), ...Object.entries(F.T9_CONTROL_FIELDS).map(([k, v]) => block("Как назвать функцию?", { extra: [`${k}: ${v}`] }))]
const zOpen = zControl.filter((t) => P.parseTurn(t).blocks[0].checkText && P.gateWord(P.parseTurn(t).blocks[0].checkText) !== undefined)
cell("AC-05 з", zBad.length === 0 && zOpen.length === 0, JSON.stringify([zBad, zOpen.map((t) => P.gateWord(P.parseTurn(t).blocks[0].checkText))]))

// AC-05 и: the holes of the fields go to the owner; the real fields do not hinder; a stray "?" in a loose field changes nothing
const base = F.T9_BLOCK.split(NL)
const withLine = (line) => {
  const name = line.replace(/^\*+/, "").split(":")[0].replace(/\s*\(.*$/, "").toLowerCase()
  if (name === "автоответ" || name === "рекомендация") return [base[0], base[1], ...base.slice(2).filter((l) => !l.toLowerCase().startsWith(name)), line].join(NL)
  return [...base, line].join(NL)
}
const holeBad = F.T9_HOLES.filter((h) => closed(withLine(h)))
const realBad = F.T9_REAL_FIELDS.filter((r) => !closed(withLine(r)))
cell("AC-05 и", holeBad.length === 0 && realBad.length === 0 && closed(withLine("Срок: ждём ответа до пятницы?")), JSON.stringify([holeBad, realBad]))

// AC-05 к: "rm..." with an ellipsis and "общих средами"
cell("AC-05 к", toOwnerByWords(block("Выполнить rm… для папки?")) && toOwnerByWords(block("Нужно ли держать общих средами файлы?")), "ellipsis")

console.log(fail ? `crew-answer-gate.test: FAIL ${fail}` : "crew-answer-gate.test ok")
process.exit(fail ? 1 : 0)

// Self-test of the documentation of the question-answering modes (task 007, REQ-22, AC-20, AC-25; node >= 24):
//   node test/crew-answer-docs.test.mjs
// The help of the plugin (crew_help), the README of the plugin and the questionnaire (crew_config guide) name the letter of an
// automatic answer, the form of a question (Тип:, Рекомендация:, Автоответ: допустим, "?" at the end of a line, the rule of the type
// gate), the recommended value of answer_mode, and the rule that the owner's word is older than an answer. These cells are in a file
// of their own: the older self-test crew-help stays untouched (DNC-01). The code comes from CREW_PLUGIN_DIR or from the folder above.
import { readFileSync } from "node:fs"
import path from "node:path"
import { harness, PLUGIN, reporter } from "./answer-harness.mjs"

const R = reporter("crew-answer-docs.test")
const cell = R.cell
const H = await harness("crew-answer-docs", { sessions: ["sesDocs001"] })
const help = await H.call("crew_help", "sesDocs001")
const guide = await H.call("crew_config", "sesDocs001", { action: "guide" })
const readme = readFileSync(path.join(PLUGIN, "README.md"), "utf8")
const RECOMMENDED = '{"implementation": "recommendations"}'
const PHRASE = "для `requirements` и `plan` — `owner`"
const missing = (text, list) => list.filter((s) => !text.includes(s))

const FORM = ["Тип:", "Рекомендация:", "Автоответ: допустим", "«?» в конце строки", "ворота объявляй `gate`"]
const LETTER = ["Ответ по настройке проекта (answer_mode: recommendations, тип", "не слово владельца", "только слово владельца", "вышел за рекомендацию — вопрос владельцу"]

const mh = missing(help, [...FORM, ...LETTER])
cell("AC-25 справка", mh.length === 0, JSON.stringify(mh))
// the README is in English; the quotes of the form and of the letter are in Russian, word for word
const mr = missing(readme, [...FORM.slice(0, 4), "gate", ...LETTER.slice(0, 2), "answer_mode", "answers/"])
cell("AC-25 README", mr.length === 0 && /Answering session questions/.test(readme), JSON.stringify(mr))
const gl = guide.split("\n").find((l) => l.startsWith("- answer_mode:")) ?? ""
cell("AC-25 опросник", /Рекомендация:/.test(gl) && /Зачем:/.test(gl) && !/crew-sets/.test(gl), gl)
cell("AC-25 рекомендуемое значение", help.includes(RECOMMENDED) && help.includes(PHRASE) && readme.includes(RECOMMENDED) && readme.includes(PHRASE) && guide.includes(RECOMMENDED) && guide.includes(PHRASE), JSON.stringify([help.includes(RECOMMENDED), help.includes(PHRASE), readme.includes(RECOMMENDED), readme.includes(PHRASE), guide.includes(RECOMMENDED), guide.includes(PHRASE)]))
cell("AC-20 справка", /слово владельца старше автоответа/.test(help) && /слово владельца старше автоответа|older than/.test(readme), "rule")

// task 096: the forms of the questionnaire are answered by the same mode
const mh2 = missing(help, ["answer_delay_sec", "(Recommended)", "формы встроенного вопросника", "закрытый список"])
cell("096 справка: формы вопросника, задержка, закрытый список", mh2.length === 0, JSON.stringify(mh2))
const mr2 = missing(readme, ["answer_delay_sec", "(Recommended)", "closed list", "form-auto.ts", "forms/auto"])
cell("096 README: the forms, the delay, the closed list", mr2.length === 0, JSON.stringify(mr2))
const adr = readFileSync(path.join(PLUGIN, "..", "doc", "canon", "decisions", "ADR-0010-question-answering-modes.md"), "utf8")
cell("096 ADR-0010: the supplement of 2026-10-19 (forms, closed list, delay, the exception for acceptance lifted)", /Дополнение 2026-10-19/.test(adr) && /формы/.test(adr) && /закрытый список/i.test(adr) && /answer_delay_sec/.test(adr) && /приёмк/.test(adr), "")
// task 097: the closed list looks at the proposed action, the review sessions are no exception in the text path either
cell("097 README: the closed list by the action, no review-session exception", /proposes an action/.test(readme) && /description of the situation/.test(readme) && !/the session is not a review session/.test(readme) && /yes/.test(readme), "")
cell("097 ADR-0010: the supplement of the closed list by meaning (task 097) and the lifted exception in the text path", adr.includes("Дополнение 2026-10-19 (вторая часть)") && adr.includes("097") && adr.includes("действие, а не слово") && adr.includes("сессия приёмки") && adr.includes("74 %"), "")
cell("097 help: the closed list is told by the proposed action", /ПРЕДЛАГАЕТ действие/.test(help) && /таблицы действий/.test(help), "")
R.done(H)

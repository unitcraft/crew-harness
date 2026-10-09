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

R.done(H)

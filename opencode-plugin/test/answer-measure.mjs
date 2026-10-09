// The measure of the second net of the gate words on the blocks of the table T-10 (task 007, REQ-13, AC-05 л; node >= 24):
//   node test/answer-measure.mjs            prints the line "сетка слов: прошло X из Y пригодных (Z %)", the figure without the
//                                           explanation "потому что ...", the figures of each source, the check against the
//                                           figures of the specification (44 / 9 / 20 % / 16 for the blocks of the table)
//   node test/answer-measure.mjs --control  the same, plus the control: one gate stem put into a block that passed -- X drops by one
// A block is "suitable" (by meaning, set apart from the words, by the criterion recorded in test/answer-t10.json) and the net lets
// it pass when no stem of the list is in its text by the rules of REQ-13. ANSWER_T10_FILE points to another snapshot (fresh blocks
// are added there with the same label and the revision they were taken from). CREW_PLUGIN_DIR points to another copy of the code.
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const here = import.meta.dirname
const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(here, "..")
const P = await import(pathToFileURL(path.join(plugin, "answer-parse.ts")).href)
const file = process.env.ANSWER_T10_FILE || path.join(here, "answer-t10.json")
const data = JSON.parse(readFileSync(file, "utf8"))
const NL = String.fromCharCode(10)

/** the block as a question of the permitted form: the type and the permission are added, as the criterion says */
// In the old blocks the signature stands inside the line ("Рекомендация (Сессия С1п, заход 3): ..."): by REQ-13 the signature of the
// narrow form after the name of the field is not checked, so it is taken out as it would be in a line of the field.
const SIGN = /(Рекомендация)\s*\(\s*Сессия\s+[СC]\d+п?(?:\s*,\s*заход\s+\d+)?\s*\)/g
const asQuestion = (text) => `${text.replace(SIGN, "$1")}${NL}Тип: implementation${NL}Автоответ: допустим`

/** the text without "потому что ..." in the recommendation: to the end of the paragraph of the value (a blank line, the next field, the end) */
export function withoutBecause(text) {
  const lines = text.split(NL)
  const isField = (l) => /^\s*(?:[-*]\s+)?[*_`]*\s*(тип|автоответ|рекомендация|варианты|умолчание|затрагивает|адресат|срок|влияет)\s*(\([^)]*\))?\s*[*_`]*\s*:/i.test(l)
  const out = []
  let cut = false
  let seenRec = false
  for (const l of lines) {
    if (cut) {
      if (!l.trim() || isField(l)) cut = false
      else continue
    }
    if (!seenRec && /рекомендаци/i.test(l)) seenRec = true
    if (seenRec) {
      const at = l.search(/потому что/i)
      if (at >= 0) {
        out.push(l.slice(0, at).trimEnd())
        cut = true
        continue
      }
    }
    out.push(l)
  }
  return out.join(NL)
}

const passes = (text) => {
  const b = P.parseTurn(asQuestion(text)).blocks.find((x) => x.qn > 0) ?? P.parseTurn(asQuestion(text)).blocks[0]
  return P.gateWord(b.checkText) === undefined
}

function measure(blocks) {
  const suitable = blocks.filter((b) => b.label === "suitable")
  const passed = suitable.filter((b) => passes(b.text))
  const passedBare = suitable.filter((b) => passes(withoutBecause(b.text)))
  const bySource = {}
  for (const b of suitable) {
    const s = (bySource[b.source] ??= { total: 0, pass: [], expect: [], mismatch: [] })
    s.total++
    const ok = passes(b.text)
    if (ok) s.pass.push(b.id)
    if (b.expectPass) s.expect.push(b.id)
    if (ok !== !!b.expectPass) s.mismatch.push(b.id)
  }
  const pct = (a, n) => (n ? Math.round((100 * a) / n) : 0)
  return { suitable: suitable.length, passed: passed.length, passedBare: passedBare.length, pct: pct(passed.length, suitable.length), pctBare: pct(passedBare.length, suitable.length), bySource, passedList: passed }
}

const fresh = data.blocks.filter((b) => b.fresh)
const recorded = data.blocks.filter((b) => !b.fresh)
const r = measure(recorded)
const all = measure(data.blocks)
console.log(`по таблице Т-10 спецификации (${recorded.length} записанных блоков): прошло ${r.passed} из ${r.suitable} пригодных (${r.pct} %); без пояснения «потому что …» прошло бы ${r.passedBare} из ${r.suitable} (${r.pctBare} %)`)
for (const [s, v] of Object.entries(r.bySource)) console.log(`  ${s}: пригодных ${v.total}, прошли ${v.pass.join(", ") || "нет"}${v.mismatch.length ? `, расхождение с таблицей: ${v.mismatch.join(", ")}` : ""}`)
const mismatches = Object.values(r.bySource).flatMap((v) => v.mismatch)
if (recorded.length === 66) {
  const same = r.suitable === 44 && r.passed === 9 && r.pct === 20 && r.passedBare === 16 && mismatches.length === 0
  console.log(`сверка с таблицей Т-10 спецификации (44 / 9 / 20 % / 16): ${same ? "совпадает" : "РАСХОДИТСЯ"}`)
  if (!same) process.exitCode = 1
} else console.log(`записанных блоков ${recorded.length}: сверка с цифрами таблицы Т-10 не применяется`)
if (fresh.length) {
  const f = measure(fresh)
  console.log(`свежие блоки (${fresh.length}, ревизии ${[...new Set(fresh.map((b) => b.rev))].join(", ")}): пригодных ${f.suitable}, прошли ${f.passed} (${f.pct} %): ${fresh.filter((b) => b.label === "suitable" && passes(b.text)).map((b) => `${b.source} ${b.id}`).join(", ") || "нет"}`)
}
console.log(`основ в списке: ${P.GATE_STEMS.length}`)
console.log(`сетка слов: прошло ${all.passed} из ${all.suitable} пригодных (${all.pct} %)`)
console.log(`без пояснения «потому что …»: прошло бы ${all.passedBare} из ${all.suitable} (${all.pctBare} %)`)

if (process.argv.includes("--control")) {
  const pick = data.blocks.find((b) => b.label === "suitable" && passes(b.text))
  const spoiled = data.blocks.map((b) => (b === pick ? { ...b, text: `${b.text}${NL}Затрагивает: push` } : b))
  const c = measure(spoiled)
  const ok = c.passed === r.passed - 1
  console.log(`контроль: одна воротная основа в пригодном блоке (${pick.source} ${pick.id}): прошло ${c.passed} вместо ${r.passed} — ${ok ? "control ok" : "CONTROL FAILED"}`)
  if (!ok) process.exitCode = 1
}

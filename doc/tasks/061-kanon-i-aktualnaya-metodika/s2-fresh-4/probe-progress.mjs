import assert from 'node:assert/strict'
import { buildProgress, sessionState } from '../../../../opencode-plugin/journal.ts'
import { parseJournal, keywordOf } from '../../../../opencode-plugin/progress.ts'

const prior = parseJournal(Buffer.from('С1 0/2 старт\nС1 1/2 источник проверен\n'))
// Фиктивная константа теста, не чтение часов и не дата реального журнала.
const clock = new Date(2000, 0, 1, 0, 0)
const base = { file: 'progress.log', code: 'С1', kind: 'done', n: 2 }
const cases = [
  ['полная работа', parseJournal(Buffer.from('С1 0/2 старт\nС1 1/2 один\nС1 2/2 два\n')), { ...base, text: 'итог' }, true],
  ['до записи первой единицы', parseJournal(Buffer.from('С1 0/2 старт\n')), { ...base, text: 'итог' }, false],
  ['1/2 с N завышено', prior, { ...base, text: 'N завышено: один источник' }, true],
  ['подмена финального N на 1', prior, { ...base, n: 1, text: 'итог' }, false],
]
for (const [name, rows, input, expected] of cases) {
  const result = buildProgress(input, rows, clock)
  assert.equal(result.ok, expected)
  console.log(`${name}: ok=${result.ok}; ${result.ok ? result.line : result.reason}`)
}
assert.equal(keywordOf('готово: итог'), 'готово')
assert.equal(keywordOf('Готово'), undefined)
console.log('keyword: готово: принято; Готово отвергнуто')
assert.equal(sessionState(parseJournal(Buffer.from('С1 0/2 старт\nС1 1/2 готово\n')), 'С1').final, undefined)
assert.equal(sessionState(parseJournal(Buffer.from('С1 0/2 старт\nС1 1/2 готово — N завышено: один источник\n')), 'С1').final, 'done')
console.log('одинаковая финальная дробь 1/2: без причины не итог; с N завышено итог')
console.log('Проба 2: startN и ключевое слово; артефактная истинность причины не проверялась')

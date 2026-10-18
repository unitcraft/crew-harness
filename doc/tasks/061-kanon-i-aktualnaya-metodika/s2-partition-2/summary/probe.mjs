// Own one-off synthesis fixtures. Pure reader only; no SDK, writer or runner.
import assert from 'node:assert/strict'
import {parseJournal, sessionsOf, finishes} from '../../../../../opencode-plugin/progress.ts'
const cases = [
  ['общий', 'С1 0/2 старт\nС1 2/2 готово', true, true],
  ['двоеточие', 'С1 0/2 старт\nС1 2/2 готово:', true, true],
  ['правдивая причина', 'С1 0/2 старт\nС1 1/2 готово — N завышено: один источник', true, true],
  ['та же дробь без причины', 'С1 0/2 старт\nС1 1/2 готово', false, false],
  ['та же строка, ложный артефакт', 'С1 0/2 старт\nС1 1/2 готово — N завышено: один источник', true, false],
  ['снижен только finalN', 'С1 0/2 старт\nС1 1/1 готово', false, false],
  ['выше startN', 'С1 0/2 старт\nС1 3/2 готово', true, true],
  ['нет старта', 'С1 2/2 готово', false, false],
  ['два старта', 'С1 0/2 старт\nС1 0/2 старт\nС1 2/2 готово', false, false],
]
for (const [name, input, markerExpected, normative] of cases) {
  const marker = finishes(sessionsOf(parseJournal(new TextEncoder().encode(input))).at(-1))
  assert.equal(marker, markerExpected)
  console.log(`${name}: pure=${marker}; normative=${normative}`)
}
console.log('9 контролей: marker не проверяет артефакт; approved031 отдельно запрещает двоеточие')

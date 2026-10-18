import assert from 'node:assert/strict'
import { buildProgress, sessionState } from '../../../../opencode-plugin/journal.ts'
import { parseJournal } from '../../../../opencode-plugin/progress.ts'

const clock = new Date(2000, 0, 1, 0, 0) // синтетические данные теста
const launch = { file: 'progress.log', code: 'С2', kind: 'launch', launch: 3 }
for (const [name, env, expected] of [
  ['агент', {}, false],
  ['запускающий, свободный номер', { launcher: true, launches: [1, 2] }, true],
  ['запускающий, повтор номера', { launcher: true, launches: [1, 2, 3] }, false],
]) {
  const result = buildProgress(launch, [], clock, env)
  assert.equal(result.ok, expected)
  console.log(`${name}: ok=${result.ok}; ${result.ok ? result.line : result.reason}`)
}
const before = 'С2 0/2 старт заход 4\nС2 1/2 источник проверен\n'
const rows = parseJournal(Buffer.from(before))
const correction = { file: 'progress.log', code: 'С2', kind: 'correction', to: 'источник п', text: 'исправление формы' }
const legal = buildProgress(correction, rows, clock)
assert.equal(legal.ok, true)
const after = parseJournal(Buffer.from(before + legal.line + '\n'))
assert.equal(sessionState(after, 'С2').k, 1)
console.log('поправка: принята; k до=1, после=1')
const bad = buildProgress({ ...correction, to: 'нет строки' }, rows, clock)
assert.equal(bad.ok, false)
console.log(`несуществующая цитата: ok=${bad.ok}; ${bad.reason}`)
console.log('Проба 3: authority/duplicate и поправка; только чистые функции, без файловой записи')

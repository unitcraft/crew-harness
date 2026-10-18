// Only pure functions on in-memory fixture strings; no writer, SDK or runtime.
import assert from 'node:assert/strict'
import { parseJournal, sessionsOf, finishes, keywordOf, growthOf } from '../../../../../opencode-plugin/progress.ts'
import { buildProgress, sessionState } from '../../../../../opencode-plugin/journal.ts'

const lines = (s) => parseJournal(new TextEncoder().encode(s))
const complete = (s) => {
  const sessions = sessionsOf(lines(s))
  return finishes(sessions.at(-1))
}
const fixtures = [
  ['equal', 'С1 0/2 старт\nС1 2/2 готово', true],
  ['low-no-reason', 'С1 0/2 старт\nС1 1/2 готово', false],
  ['low-reason-marker', 'С1 0/2 старт\nС1 1/2 готово — N завышено: один источник', true],
  ['final-n-not-start-n', 'С1 0/2 старт\nС1 1/1 готово', false],
  ['greater', 'С1 0/2 старт\nС1 3/2 готово', true],
  ['no-start', 'С1 2/2 готово', false],
  ['two-starts', 'С1 0/2 старт\nС1 0/2 старт\nС1 2/2 готово', false],
  ['colon', 'С1 0/2 старт\nС1 2/2 готово:', true],
]
for (const [name, s, expected] of fixtures) {
  const actual = complete(s)
  assert.equal(actual, expected)
  console.log(`${name}=${actual}`)
}
assert.equal(keywordOf('готовоход'), undefined)
assert.equal(keywordOf('Готово'), undefined)
const prior = lines('С1 0/2 старт\nС1 1/2 опись источников проверена\nС1 1/2 поправка: к строке «опись исто» — форма')
const st = sessionState(prior, 'С1')
assert.equal(st.k, 1)
assert.equal(st.startN, 2)
const ses = sessionsOf(prior).at(-1)
assert.equal(growthOf(ses).text, 'опись источников проверена')
console.log('correction: k=1; startN=2; growth=previous-unit')
// A fixed test timestamp, not a request for the current clock.
const now = new Date('2026-01-01T00:00:00Z')
const input = { file: 'doc/tasks/NNN-x/progress.log', code: 'С1', kind: 'done' }
assert.equal(buildProgress({...input, n:1}, prior, now).ok, false)
assert.equal(buildProgress({...input, text:'N завышено: один источник'}, prior, now).ok, true)
assert.equal(buildProgress({...input, kind:'launch'}, prior, now).ok, false)
console.log('builder: low-unjustified=refused; low-reason=allowed; agent-launch=refused')
console.log('limits: marker truth/artifact not checked; no file writer/SDK/runner/031 validator')

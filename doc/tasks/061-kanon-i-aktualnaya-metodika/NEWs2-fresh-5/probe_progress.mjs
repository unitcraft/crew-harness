// Проба2: настоящий чистый parser plugin; не runtime031/013, не writer.
import assert from 'node:assert/strict';
import { parseJournal, sessionsOf, finishes, lastOf } from '../../../../opencode-plugin/progress.ts';
const cases = [
  ['точное готово', 'С2 0/2 старт заход 5\nС2 2/2 готово', true],
  ['знак после слова', 'С2 0/2 старт заход 5\nС2 2/2 готово: проверено', true],
  ['не целое слово', 'С2 0/2 старт заход 5\nС2 2/2 готовность', false],
  ['изолированное N исключение', 'С2 0/2 старт заход 5\nС2 1/2 готово — N завышено: входов один', true],
  ['та же дробь без исключения', 'С2 0/2 старт заход 5\nС2 1/2 готово', false],
  ['подмена знаменателя', 'С2 0/2 старт заход 5\nС2 1/1 готово', false],
  ['нет старта', 'С2 2/2 готово', false],
  ['второй старт', 'С2 0/2 старт заход 5\nС2 0/2 старт заход 5\nС2 2/2 готово', false],
  ['k выше N', 'С2 0/2 старт заход 5\nС2 3/2 готово', true],
  ['поправка не повышает k', 'С2 0/2 старт заход 5\nС2 1/2 часть\nС2 1/2 поправка: к строке «часть» — уточнение', false],
];
for (const [name,input,expected] of cases) {
  const sessions = sessionsOf(parseJournal(new TextEncoder().encode(input)));
  const session = sessions.at(-1);
  const actual = finishes(session);
  assert.equal(actual, expected, name);
  console.log(JSON.stringify({name,input,expected,actual,lastK:lastOf(session).k}));
}
console.log('Ограничение: parser принимает синтаксическую N-оговорку, правдивость артефакта не проверяет.');

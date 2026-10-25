// Проверки очереди «на потом» (задача 192b): Ctrl+Enter, FIFO, привязка к сессии, сброс, подсказка в поле.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQueue, isBusy, keyAction } from '../queue.js';
import { S, t } from '../strings.js';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = (extra = {}) => ({ key: 'Enter', ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, ...extra });
const session = (state, n = 2) => ({ state, messages: new Array(n).fill({}) });

test('Ctrl+Enter при работе агента — в очередь, при ожидании — обычная отправка', () => {
  assert.equal(keyAction(key({ ctrlKey: true }), true), 'queue');
  assert.equal(keyAction(key({ metaKey: true }), true), 'queue');
  assert.equal(keyAction(key({ ctrlKey: true }), false), 'send');
  assert.equal(keyAction(key({ metaKey: true }), false), 'send');
});

test('Enter ведёт себя как раньше (отправка, в том числе при работе), Shift+Enter — перенос строки', () => {
  assert.equal(keyAction(key(), true), 'send');
  assert.equal(keyAction(key(), false), 'send');
  assert.equal(keyAction(key({ shiftKey: true }), false), null);
  assert.equal(keyAction(key({ key: 'a', ctrlKey: true }), true), null);
  assert.equal(keyAction(key({ isComposing: true, ctrlKey: true }), true), null);
});

test('занят — это «отвечает» и «ждёт разрешения»', () => {
  assert.equal(isBusy('answering'), true);
  assert.equal(isBusy('permission'), true);
  for (const s of ['idle', 'cancelled', 'error', 'refused']) assert.equal(isBusy(s), false);
});

test('очередь выдаёт сообщения по одному, FIFO, и только когда ход закончился', () => {
  const q = createQueue();
  assert.equal(q.push('a', 'one'), 1);
  assert.equal(q.push('a', 'two'), 2);
  assert.equal(q.count('a'), 2);
  assert.equal(q.take('a', session('answering')), undefined);
  assert.equal(q.take('a', session('permission')), undefined);
  assert.equal(q.take('a', session('idle', 2)), 'one');
  // отправленное ещё не дошло до модели: второе не выдаётся
  assert.equal(q.take('a', session('idle', 2)), undefined);
  assert.equal(q.take('a', session('idle', 4)), 'two');
  assert.equal(q.count('a'), 0);
  assert.equal(q.take('a', session('idle', 6)), undefined);
});

test('очередь привязана к сессии', () => {
  const q = createQueue();
  q.push('a', 'for-a');
  q.push('b', 'for-b');
  assert.equal(q.take('b', session('idle')), 'for-b');
  assert.equal(q.count('a'), 1);
  assert.equal(q.count('b'), 0);
});

test('клик по счётчику убирает последнее, повторный — следующее с конца', () => {
  const q = createQueue();
  for (const x of ['1', '2', '3']) q.push('a', x);
  assert.equal(q.popLast('a'), '3');
  assert.equal(q.popLast('a'), '2');
  assert.equal(q.count('a'), 1);
  assert.equal(q.popLast('a'), '1');
  assert.equal(q.popLast('a'), undefined);
});

test('неудачная отправка возвращает сообщение в начало очереди', () => {
  const q = createQueue();
  q.push('a', 'one');
  q.push('a', 'two');
  const text = q.take('a', session('idle', 2));
  q.restore('a', text);
  assert.equal(q.take('a', session('idle', 2)), 'one');
});

test('при удалении сессии её очередь сбрасывается', () => {
  const q = createQueue();
  q.push('a', 'x');
  q.push('b', 'y');
  q.prune({ b: session('idle') });
  assert.equal(q.count('a'), 0);
  assert.equal(q.count('b'), 1);
  assert.deepEqual(q.traces(), ['b']);
});

test('подсказка в поле ввода берётся из strings.js и не упоминает Shift', () => {
  assert.equal(S['composer.placeholder'], 'Enter — отправить, Ctrl+Enter — в очередь на потом');
  assert.doesNotMatch(S['composer.placeholder'], /Shift/);
  assert.equal(t('composer.queued', { n: 3 }), 'В очереди: 3');
  const view = fs.readFileSync(path.join(web, 'view.js'), 'utf8');
  assert.match(view, /placeholder: t\('composer\.placeholder'\)/);
  assert.match(view, /'aria-label': t\('chat\.cancel'\)/);
});

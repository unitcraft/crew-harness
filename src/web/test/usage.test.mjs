// Расход токенов хода (задача 192): формат чисел, сводка, строка в ленте только если агент сообщил числа.
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupThousands, ruForm, usageSummary, timeline, initialModel, reduce } from '../state.js';

let counter = 0;
const ev = (kind, input = {}, { trace = 's1', step = 0 } = {}) => ({ id: `u${(counter += 1)}`, trace, step, kind, input, time: 1000 + step });
const run = (events) => events.reduce((m, e) => reduce(m, e), initialModel());

test('числа с узкими пробелами-разделителями тысяч', () => {
  assert.equal(groupThousands(173312), '173\u202f312');
  assert.equal(groupThousands(662), '662');
  assert.equal(groupThousands(1234567), '1\u202f234\u202f567');
  assert.equal(groupThousands(0), '0');
  assert.equal(groupThousands(Number.NaN), '');
});

test('форма слова «шаг»: 1 шаг, 2 шага, 5 шагов, 11 шагов, 21 шаг', () => {
  assert.deepEqual([1, 2, 5, 11, 12, 21, 24, 25].map(ruForm), ['one', 'few', 'many', 'many', 'many', 'one', 'few', 'many']);
});

test('сводка: итог без шагов — одна строка, без таблицы; «всего» = новые + из кэша', () => {
  const u = usageSummary({ new: 662, cached: 173312, output: 120, reason: 'end_turn' });
  assert.equal(u.steps, 1);
  assert.equal(u.expandable, false);
  assert.deepEqual([u.latest.new, u.latest.cached, u.latest.total, u.latest.label], [662, 173312, 173974, 'stop']);
});

test('сводка: шаги от агента дают таблицу; последний шаг — «последний»', () => {
  const u = usageSummary({ reason: 'end_turn', steps: [{ label: 'tool-call', new: 800, cached: 173056 }, { label: 'stop', new: 662, cached: 173312 }] });
  assert.equal(u.steps, 2);
  assert.equal(u.expandable, true);
  assert.deepEqual(u.rows.map((r) => [r.label, r.new, r.cached, r.total]), [['tool-call', 800, 173056, 173856], ['stop', 662, 173312, 173974]]);
  assert.equal(u.latest.total, 173974);
});

test('сводка: нет чисел или не объект — ничего не показывается', () => {
  assert.equal(usageSummary(undefined), null);
  assert.equal(usageSummary({}), null);
  assert.equal(usageSummary({ reason: 'end_turn' }), null);
  assert.equal(usageSummary('много'), null);
});

test('в ленте строка расхода есть под завершённым ходом с usage и нет без него', () => {
  const base = [
    ev('session_created', { name: 'A', agent: 'kimi' }, { step: 0 }),
    ev('user_message', { turn: 't1', text: 'привет' }, { step: 1 }),
    ev('agent_chunk', { turn: 't1', text: 'здравствуйте' }, { step: 2 }),
  ];
  const withUsage = run([...base, ev('turn_usage', { turn: 't1', new: 5, cached: 10, reason: 'end_turn' }, { step: 3 }), ev('agent_done', { turn: 't1' }, { step: 4 })]);
  const items = timeline(withUsage.sessions.s1);
  const usage = items.find((i) => i.type === 'usage');
  assert.ok(usage);
  assert.equal(usage.latest.total, 15);
  assert.ok(items.indexOf(usage) < items.findIndex((i) => i.type === 'actions'), 'под текстом ответа, над действиями');
  const without = run([...base, ev('agent_done', { turn: 't1' }, { step: 3 })]);
  assert.equal(timeline(without.sessions.s1).some((i) => i.type === 'usage'), false);
  const empty = run([...base, ev('turn_usage', { turn: 't1' }, { step: 3 }), ev('agent_done', { turn: 't1' }, { step: 4 })]);
  assert.equal(timeline(empty.sessions.s1).some((i) => i.type === 'usage'), false);
});

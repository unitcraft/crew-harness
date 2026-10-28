// Задача 192.9: метка [[crew_task_list]] {json} вырезается хабом из ответа; страница получает её отдельным событием crew_marker и ничего с ним не делает —
// ни в ленте, ни в тексте ответа метки нет.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModel, reduce, timeline } from '../state.js';

let n = 0;
function ev(kind, input, step) {
  n += 1;
  return { id: `m${n}`, trace: 's1', step, kind, input, time: 1000 + step };
}

test('crew_marker: событие метки не меняет модель, текст ответа без метки', () => {
  let model = initialModel();
  model = reduce(model, ev('session_created', { name: 'x', agent: 'opencode' }, 0));
  model = reduce(model, ev('user_message', { turn: 't1', text: 'Распознай' }, 1));
  model = reduce(model, ev('agent_chunk', { turn: 't1', text: 'Готово: 1 работа.' }, 2));
  const before = JSON.stringify(model);
  const after = reduce(model, ev('crew_marker', { turn: 't1', text: '[[crew_task_list]] {"tasks":[]}' }, 3));
  assert.equal(JSON.stringify(after).includes('[[crew'), false);
  assert.equal(JSON.stringify(after), before);
  const text = JSON.stringify(timeline(after.sessions.s1));
  assert.equal(text.includes('[[crew'), false);
  assert.equal(text.includes('Готово: 1 работа.'), true);
});

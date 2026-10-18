// Проверки заглушки: журналы и сервер-воспроизведение складываются в правильные виды.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_JOURNAL, AGENTS, createMockServer } from '../mock.js';
import { initialModel, reduce, isEvent, makeEvent, nextStep } from '../state.js';

function setup() {
  let t = 5_000_000;
  const server = createMockServer({ now: () => (t += 1) });
  let model = INITIAL_JOURNAL.reduce(reduce, initialModel());
  let n = 0;
  const newId = () => `c${(n += 1)}`;
  const send = (kind, trace, input) => {
    const e = makeEvent(kind, trace, nextStep(model, trace), input, { newId, now: () => (t += 1) });
    const entries = server.handle(e);
    for (const x of entries) model = reduce(model, x.event);
    return entries;
  };
  return { server, send, get: () => model };
}

test('журнал-заготовка: события валидны, id уникальны, две сессии в разных состояниях', () => {
  assert.ok(INITIAL_JOURNAL.every(isEvent));
  const ids = INITIAL_JOURNAL.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const m = INITIAL_JOURNAL.reduce(reduce, initialModel());
  const states = Object.values(m.sessions).map((s) => s.state).sort();
  assert.deepEqual(states, ['idle', 'refused']);
});

test('список агентов: OpenCode доступен, второй помечен на потом', () => {
  assert.equal(AGENTS[0].id, 'opencode');
  assert.equal(AGENTS[0].disabled, undefined);
  assert.ok(AGENTS.slice(1).every((a) => a.disabled === true));
});

test('обычный ответ: эхо, куски по возрастающим шагам, завершение', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  const entries = send('user_message', trace, { turn: 'tx', text: 'Объясни коротко' });
  const kinds = entries.map((x) => x.event.kind);
  assert.equal(kinds[0], 'user_message');
  assert.ok(kinds.filter((k) => k === 'agent_chunk').length >= 3);
  assert.equal(kinds.at(-1), 'agent_done');
  assert.ok(entries.every((x, i) => i === 0 || x.delay >= entries[i - 1].delay));
  assert.ok(entries.every((x) => isEvent(x.event)));
  const steps = entries.map((x) => x.event.step);
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b));
  assert.equal(new Set(steps).size, steps.length);
  const s = get().sessions[trace];
  assert.equal(s.state, 'idle');
  assert.ok(s.messages.find((x) => x.key === 'a:tx').text.length > 20);
});

test('сценарий с разрешением: запрос, отказ после «Отклонить»', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  const entries = send('user_message', trace, { turn: 'tp', text: 'Удали временный файл' });
  assert.equal(entries.at(-1).event.kind, 'permission_request');
  assert.equal(get().sessions[trace].state, 'permission');
  const request = get().sessions[trace].pending.request;
  const after = send('permission_decision', trace, { request, decision: 'deny' });
  assert.equal(after.at(-1).event.kind, 'agent_refused');
  assert.equal(get().sessions[trace].state, 'refused');
  assert.equal(get().sessions[trace].pending, null);
});

test('сценарий с разрешением: «Разрешить» ведёт к ответу и завершению', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  send('user_message', trace, { turn: 'tp', text: 'Запусти команду' });
  const request = get().sessions[trace].pending.request;
  const after = send('permission_decision', trace, { request, decision: 'allow' });
  assert.equal(after.at(-1).event.kind, 'agent_done');
  assert.equal(get().sessions[trace].state, 'idle');
});

test('новая сессия: сервер повторяет session_created и не выдумывает лишнего', () => {
  const { send, get } = setup();
  const before = Object.keys(get().sessions).length;
  const entries = send('session_created', 'новая', { name: 'Новая', agent: 'opencode' });
  assert.equal(entries.length, 1);
  assert.equal(Object.keys(get().sessions).length, before + 1);
});

test('отмена: сервер только повторяет событие, остальное снимает транспорт', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  send('user_message', trace, { turn: 'tc', text: 'Расскажи' });
  const entries = send('cancel', trace, { turn: 'tc' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event.kind, 'cancel');
});

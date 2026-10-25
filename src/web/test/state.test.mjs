// Проверки чистого редьюсера state.js: событие -> модель вида, без DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS, initialModel, reduce, isEvent, sessionList, nextStep, makeEvent, splitBlocks, timeline,
} from '../state.js';
import { INITIAL_JOURNAL } from '../mock.js';

let counter = 0;
function ev(kind, input = {}, { trace = 's1', step = 0, id, time = 1000 + step } = {}) {
  counter += 1;
  return { id: id ?? `e${counter}`, trace, step, kind, input, time };
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

function run(events, model = initialModel()) {
  return events.reduce((m, e) => reduce(m, e), model);
}

const created = () => ev('session_created', { name: 'Тест', agent: 'opencode' }, { step: 0 });

test('виды событий: девять видов скелета остались (новые проверяет work.test.mjs)', () => {
  const skeleton = [
    'agent_chunk', 'agent_done', 'agent_refused', 'cancel', 'error',
    'permission_decision', 'permission_request', 'session_created', 'user_message',
  ];
  for (const kind of skeleton) assert.ok(KINDS.includes(kind), kind);
});

test('редьюсер детерминирован: два прогона дают один вид, вход не меняется', () => {
  const journal = deepFreeze(INITIAL_JOURNAL.map((e) => ({ ...e })));
  const a = run(journal);
  const b = run(journal);
  assert.deepEqual(a, b);
  assert.ok(Object.keys(a.sessions).length >= 2);
  // модель не хранит ссылок на меняющееся: замораживаем и прогоняем ещё одно событие
  deepFreeze(a);
  const next = reduce(a, ev('user_message', { turn: 't9', text: 'ещё' }, { trace: Object.keys(a.sessions)[0], step: 99 }));
  assert.notEqual(next, a);
});

test('session_created заводит сессию, список: свежие сверху', () => {
  const m = run([
    ev('session_created', { name: 'Первая', agent: 'opencode' }, { trace: 'a', time: 100 }),
    ev('session_created', { name: 'Вторая', agent: 'opencode' }, { trace: 'b', time: 200 }),
  ]);
  assert.deepEqual(sessionList(m).map((s) => s.name), ['Вторая', 'Первая']);
  assert.equal(m.sessions.a.state, 'idle');
  assert.equal(m.sessions.a.agent, 'opencode');
});

test('модель сессии: сообщённая обновляется, неизвестная и запоздалое событие не подменяют её', () => {
  const m = run([
    ev('session_created', { name: 'A', agent: 'opencode' }, { trace: 'a', step: 0 }),
    ev('session_created', { name: 'B', agent: 'opencode' }, { trace: 'b', step: 0 }),
    ev('session_model', { model: 'Model Alpha' }, { trace: 'a', step: 3, id: 'a-model' }),
    ev('session_model', { model: 'Model Beta' }, { trace: 'a', step: 4, id: 'a-model-change' }),
    ev('session_model', { model: '' }, { trace: 'b', step: 1, id: 'b-unknown' }),
    ev('session_model', { model: 'Stale Model' }, { trace: 'a', step: 3, id: 'a-stale' }),
    ev('session_model', { model: 'Foreign Model' }, { trace: 'missing', step: 9, id: 'foreign' }),
  ]);
  assert.equal(m.sessions.a.model, 'Model Beta');
  assert.equal(m.sessions.b.model, '');
  assert.equal(m.sessions.missing, undefined);
});

test('выбор модели, усилия и режима: берётся из session_model то, что агент отдал, остальное пусто', () => {
  const m = run([
    ev('session_created', { name: 'A', agent: 'claude' }, { trace: 'a', step: 0 }),
    ev('session_model', {
      model: 'Sonnet', model_id: 's', models: [{ id: 'o', name: 'Opus' }, { id: 's', name: 'Sonnet' }, { name: 'без id' }],
      effort: 'high', effort_name: 'Effort', efforts: [{ id: 'high', name: 'High' }], mode: 'plan', modes: [{ id: 'plan', name: 'Plan', description: 'Сначала план' }],
    }, { trace: 'a', step: 1, id: 'a-opts' }),
    ev('session_model', { model: 'Plain' }, { trace: 'a', step: 2, id: 'a-plain' }),
  ].slice(0, 2));
  const o = m.sessions.a.options;
  assert.deepEqual(o.models.map((c) => c.id), ['o', 's']);
  assert.equal(o.modelId, 's');
  assert.equal(o.effort, 'high');
  assert.equal(o.modes[0].description, 'Сначала план');
  const plain = run([
    ev('session_created', { name: 'A', agent: 'opencode' }, { trace: 'a', step: 0 }),
    ev('session_model', { model: 'Plain' }, { trace: 'a', step: 1, id: 'a-plain' }),
  ]).sessions.a.options;
  assert.deepEqual([plain.models, plain.efforts, plain.modes], [[], [], []]);
});

test('смена семьи: агент сессии меняется, в ленте одна строка о переносе, повтор того же события ничего не добавляет', () => {
  const sw = ev('agent_switched', { from: 'opencode', to: 'claude', shown: 3, total: 9, cut: 1 }, { trace: 'a', step: 5, id: 'a-sw' });
  const m = run([ev('session_created', { name: 'A', agent: 'opencode' }, { trace: 'a', step: 0 }), sw, sw]);
  const s = m.sessions.a;
  assert.equal(s.agent, 'claude');
  const rows = s.messages.filter((x) => x.role === 'switch');
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].from, rows[0].to, rows[0].shown, rows[0].total, rows[0].cut], ['opencode', 'claude', 3, 9, true]);
  assert.equal(timeline(s).at(-1).type, 'switch');
});

test('потоковые куски склеиваются в порядке номеров шагов, а не прибытия', () => {
  const m = run([
    created(),
    ev('user_message', { turn: 't1', text: 'привет' }, { step: 1 }),
    ev('agent_chunk', { turn: 't1', text: 'вторая ' }, { step: 3 }),
    ev('agent_chunk', { turn: 't1', text: 'первая ' }, { step: 2 }),
    ev('agent_chunk', { turn: 't1', text: 'третья' }, { step: 4 }),
  ]);
  const agent = m.sessions.s1.messages.find((x) => x.role === 'agent');
  assert.equal(agent.text, 'первая вторая третья');
  assert.equal(agent.status, 'streaming');
  assert.equal(m.sessions.s1.state, 'answering');
});

test('дубль события (тот же id) не ломает вид и возвращает ту же модель', () => {
  const chunk = ev('agent_chunk', { turn: 't1', text: 'кусок' }, { step: 2, id: 'dup' });
  const m1 = run([created(), ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }), chunk]);
  const m2 = reduce(m1, { ...chunk });
  assert.equal(m2, m1);
  assert.equal(m2.sessions.s1.messages.find((x) => x.role === 'agent').text, 'кусок');
});

test('два разных события с одним шагом не склеиваются дважды', () => {
  const m = run([
    created(),
    ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }),
    ev('agent_chunk', { turn: 't1', text: 'A' }, { step: 2, id: 'x1' }),
    ev('agent_chunk', { turn: 't1', text: 'A' }, { step: 2, id: 'x2' }),
  ]);
  assert.equal(m.sessions.s1.messages.find((x) => x.role === 'agent').text, 'A');
});

test('agent_done закрывает ход: состояние «ожидает»', () => {
  const m = run([
    created(),
    ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }),
    ev('agent_chunk', { turn: 't1', text: 'ответ' }, { step: 2 }),
    ev('agent_done', { turn: 't1' }, { step: 3 }),
  ]);
  assert.equal(m.sessions.s1.state, 'idle');
  assert.equal(m.sessions.s1.messages.find((x) => x.role === 'agent').status, 'done');
});

test('отмена переводит состояние, а запоздавший кусок после отмены игнорируется', () => {
  const m = run([
    created(),
    ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }),
    ev('agent_chunk', { turn: 't1', text: 'начало' }, { step: 2 }),
    ev('cancel', { turn: 't1' }, { step: 3 }),
    ev('agent_chunk', { turn: 't1', text: ' опоздал' }, { step: 4 }),
    ev('agent_done', { turn: 't1' }, { step: 5 }),
  ]);
  const s = m.sessions.s1;
  assert.equal(s.state, 'cancelled');
  const agent = s.messages.find((x) => x.role === 'agent');
  assert.equal(agent.status, 'cancelled');
  assert.equal(agent.text, 'начало');
});

test('отмена вне хода ничего не меняет', () => {
  const m0 = run([created()]);
  const m1 = reduce(m0, ev('cancel', {}, { step: 1 }));
  assert.equal(m1.sessions.s1.state, 'idle');
});

test('отказ агента переводит состояние в «отказ» и хранит причину', () => {
  const m = run([
    created(),
    ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }),
    ev('agent_refused', { turn: 't1', reason: 'нельзя' }, { step: 2 }),
  ]);
  const s = m.sessions.s1;
  assert.equal(s.state, 'refused');
  const agent = s.messages.find((x) => x.role === 'agent');
  assert.equal(agent.status, 'refused');
  assert.equal(agent.reason, 'нельзя');
});

test('ошибка переводит состояние в «ошибка»', () => {
  const m = run([
    created(),
    ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }),
    ev('error', { turn: 't1', message: 'обрыв' }, { step: 2 }),
  ]);
  const s = m.sessions.s1;
  assert.equal(s.state, 'error');
  const agent = s.messages.find((x) => x.role === 'agent');
  assert.equal(agent.status, 'error');
  assert.equal(agent.reason, 'обрыв');
});

test('новое сообщение владельца после отказа снова переводит в «отвечает»', () => {
  const m = run([
    created(),
    ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }),
    ev('agent_refused', { turn: 't1', reason: 'нет' }, { step: 2 }),
    ev('user_message', { turn: 't2', text: 'ещё раз' }, { step: 3 }),
  ]);
  assert.equal(m.sessions.s1.state, 'answering');
});

test('диалог разрешения открывается запросом и закрывается решением', () => {
  const base = run([
    created(),
    ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }),
    ev('permission_request', { turn: 't1', request: 'p1', action: 'Записать файл', detail: 'a.txt' }, { step: 2 }),
  ]);
  const s = base.sessions.s1;
  assert.equal(s.state, 'permission');
  assert.deepEqual(s.pending, { request: 'p1', turn: 't1', action: 'Записать файл', detail: 'a.txt' });

  const allowed = reduce(base, ev('permission_decision', { request: 'p1', decision: 'allow' }, { step: 3 }));
  assert.equal(allowed.sessions.s1.pending, null);
  assert.equal(allowed.sessions.s1.state, 'answering');
  assert.equal(allowed.sessions.s1.messages.find((x) => x.role === 'permission').decision, 'allow');

  const denied = reduce(base, ev('permission_decision', { request: 'p1', decision: 'deny' }, { step: 3 }));
  assert.equal(denied.sessions.s1.pending, null);
  assert.equal(denied.sessions.s1.messages.find((x) => x.role === 'permission').decision, 'deny');
});

test('решение по чужому запросу или с мусорным значением диалог не закрывает', () => {
  const base = run([
    created(),
    ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }),
    ev('permission_request', { turn: 't1', request: 'p1', action: 'x', detail: '' }, { step: 2 }),
  ]);
  const other = reduce(base, ev('permission_decision', { request: 'другой', decision: 'allow' }, { step: 3 }));
  assert.equal(other.sessions.s1.state, 'permission');
  const junk = reduce(base, ev('permission_decision', { request: 'p1', decision: 'может быть' }, { step: 3 }));
  assert.equal(junk.sessions.s1.state, 'permission');
});

test('отмена во время запроса закрывает диалог', () => {
  const m = run([
    created(),
    ev('user_message', { turn: 't1', text: 'q' }, { step: 1 }),
    ev('permission_request', { turn: 't1', request: 'p1', action: 'x', detail: '' }, { step: 2 }),
    ev('cancel', { turn: 't1' }, { step: 3 }),
  ]);
  assert.equal(m.sessions.s1.pending, null);
  assert.equal(m.sessions.s1.state, 'cancelled');
});

test('чужая трасса без session_created и неизвестный вид игнорируются', () => {
  const m0 = run([created()]);
  const m1 = reduce(m0, ev('user_message', { turn: 't1', text: 'q' }, { trace: 'нет такой' }));
  assert.deepEqual(m1.sessions, m0.sessions);
  const m2 = reduce(m0, ev('странный_вид', {}, { step: 5 }));
  assert.deepEqual(m2.sessions, m0.sessions);
});

test('isEvent: самодостаточное событие требует все поля', () => {
  assert.equal(isEvent(created()), true);
  assert.equal(isEvent(null), false);
  assert.equal(isEvent({ id: 'a', trace: 's', step: 0, kind: 'cancel', input: {} }), false); // нет time
  assert.equal(isEvent({ id: '', trace: 's', step: 0, kind: 'cancel', input: {}, time: 1 }), false);
  assert.equal(isEvent({ id: 'a', trace: 's', step: -1, kind: 'cancel', input: {}, time: 1 }), false);
  assert.equal(isEvent({ id: 'a', trace: 's', step: 0, kind: 'cancel', input: [], time: 1 }), false);
  const bad = reduce(initialModel(), { id: 'a', kind: 'session_created' });
  assert.deepEqual(bad, initialModel());
});

test('nextStep и makeEvent: исходящее событие собирается из модели', () => {
  const m = run([created(), ev('user_message', { turn: 't1', text: 'q' }, { step: 4 })]);
  assert.equal(nextStep(m, 's1'), 5);
  assert.equal(nextStep(m, 'нет'), 0);
  const e = makeEvent('cancel', 's1', 5, { turn: 't1' }, { newId: () => 'id-1', now: () => 777 });
  assert.deepEqual(e, { id: 'id-1', trace: 's1', step: 5, kind: 'cancel', input: { turn: 't1' }, time: 777 });
  assert.equal(isEvent(e), true);
});

test('splitBlocks: текст и блоки кода, незакрытый блок остаётся кодом', () => {
  assert.deepEqual(splitBlocks(''), []);
  assert.deepEqual(splitBlocks('просто\nтекст'), [{ type: 'text', text: 'просто\nтекст' }]);
  assert.deepEqual(
    splitBlocks('до\n```js\nlet a = 1;\n```\nпосле'),
    [
      { type: 'text', text: 'до' },
      { type: 'code', text: 'let a = 1;', lang: 'js' },
      { type: 'text', text: 'после' },
    ],
  );
  const open = splitBlocks('начало\n```\nкод без конца');
  assert.equal(open.length, 2);
  assert.deepEqual(open[1], { type: 'code', text: 'код без конца', lang: '' });
  // HTML остаётся обычными символами: его никто не разбирает
  assert.deepEqual(splitBlocks('<img src=x onerror=alert(1)>'), [{ type: 'text', text: '<img src=x onerror=alert(1)>' }]);
});

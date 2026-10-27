// Вкладка «Машины» (задача 192.1): событие machine_state в модели, список «Работает сейчас», карточка отладки, мок.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../state.js';
import { parseMachineState, workingNow, previewValue, branchLabel, machineJson, machineOpenKey } from '../machines.js';
import { createMachinesPanel } from '../machines-ui.js';
import { parseRouteState } from '../routes.js';
import { createMockServer, foldMachine, machineInput, routeStateInput } from '../mock.js';
import { createFakeDocument } from './fake-dom.mjs';

let n = 0;
const ev = (kind, input = {}, { trace = 's1', step = 0, time = 1000 + step } = {}) => { n += 1; return { id: `m${n}`, trace, step, kind, input, time }; };
const run = (events, model = st.initialModel()) => events.reduce((m, e) => st.reduce(m, e), model);
const created = () => ev('session_created', { name: 'S', agent: 'opencode' }, { step: 0, time: 1000 });
const machine = (extra = {}) => ({
  machine: 'DialogSession', table: 'dialog', state: 'Awaiting', since: 5000, started: true, last_input: { signal: 'user_message' }, data: { user: 'привет', reply: '' }, journal: [], ...extra,
});

test('machine_state: машина ложится в сессию, журнал — не больше 20 строк, порядок списка и шаг цепочки не трогаются', () => {
  const journal = Array.from({ length: 30 }, (_, i) => ({ code: `c${i}`, at: i, note: '' }));
  const m0 = run([created()]);
  const m1 = st.reduce(m0, ev('machine_state', machine({ journal }), { step: 77, time: 9000 }));
  const s = m1.sessions.s1;
  assert.equal(s.machine.state, 'Awaiting');
  assert.equal(s.machine.journal.length, 20);
  assert.equal(s.machine.journal.at(-1).code, 'c29');
  assert.equal(s.updatedAt, m0.sessions.s1.updatedAt);
  assert.equal(s.lastStep, m0.sessions.s1.lastStep);
  assert.deepEqual(m1.seen, m0.seen, 'отладочные события не копятся в seen');
});

test('machine_state: запоздавшее событие отбрасывается, чужая сессия — тоже, неверный вход не ломает', () => {
  const m1 = run([created(), ev('machine_state', machine({ state: 'Idle' }), { time: 9000 })]);
  const stale = st.reduce(m1, ev('machine_state', machine({ state: 'Awaiting' }), { time: 8000 }));
  assert.equal(stale, m1);
  assert.equal(st.reduce(m1, ev('machine_state', machine(), { trace: 'nope', time: 9500 })), m1);
  const bad = st.reduce(m1, ev('machine_state', { state: 5, journal: 'x' }, { time: 9500 }));
  assert.equal(bad.sessions.s1.machine.state, '');
  assert.deepEqual(bad.sessions.s1.machine.journal, []);
});

test('parseMachineState и machineJson', () => {
  const m = parseMachineState(machine());
  assert.equal(m.table, 'dialog');
  assert.equal(m.since, 5000);
  assert.deepEqual(JSON.parse(machineJson(m)).data, { user: 'привет', reply: '' });
  assert.equal(machineOpenKey('s1'), 'crew-machine-debug:s1');
});

test('previewValue и branchLabel: длинные строки режутся, короткие нет', () => {
  assert.deepEqual(previewValue('abc'), { text: 'abc', cut: false, full: 'abc' });
  const p = previewValue('я'.repeat(300));
  assert.equal(p.cut, true);
  assert.equal(Array.from(p.text).length, 120);
  assert.equal(p.full.length, 300);
  assert.equal(previewValue(5).text, '5');
  assert.equal(branchLabel({ a: 1, b: 2 }), '{2}');
  assert.equal(branchLabel([1, 2, 3]), '[3]');
});

const sessionWith = (extra) => ({ ...run([created()]).sessions.s1, ...extra });

test('«Работает сейчас»: машина диалога по состоянию сессии', () => {
  const first = (state) => workingNow(sessionWith({ state }), [])[0];
  assert.equal(first('idle').state, 'waiting');
  assert.equal(first('answering').state, 'running');
  assert.equal(first('error').state, 'error');
  assert.equal(first('cancelled').state, 'done');
  assert.equal(workingNow(sessionWith({ state: 'idle', machine: parseMachineState(machine({ since: 42 })) }), [])[0].since, 42);
});

test('«Работает сейчас»: шаги режима, прогон, тесты, публикация и очередь', () => {
  const task = { id: '1', number: '001', title: 't', branch: 'b', worktree: 'w', subtasks: [], state: 'finishing', tests_running: true };
  const route = st.reduce(run([created()]), ev('route_state', routeStateInput('full', { finished: 1, running: true, active: true, task }), { step: 3 })).sessions.s1;
  const items = workingNow(route, ['a', 'b']);
  const by = (k) => items.find((i) => i.key === k);
  assert.equal(by('run').state, 'running');
  assert.equal(by('step:1').state, 'done');
  assert.equal(by('step:2').state, 'running');
  assert.equal(by('step:3').state, 'waiting');
  assert.ok(by('step:2').title.length > 0 && by('step:2').n === 2);
  assert.equal(by('tests').state, 'running');
  assert.equal(by('publish').state, 'running');
  assert.equal(by('queue').detail, '2');
  assert.deepEqual(workingNow(sessionWith({}), []).map((i) => i.key), ['dialog']);
});

// ---- карточки ----

function setup(session, { stored = {}, now = 100_000 } = {}) {
  const doc = createFakeDocument();
  const store = { ...stored };
  const log = { copied: [], got: [], renders: 0 };
  const panel = createMachinesPanel(doc, {
    now: () => now,
    durationText: (ms) => `${Math.round(ms / 1000)} с`,
    onCopy: (x) => log.copied.push(x),
    onGet: (id) => log.got.push(id),
    rerender: () => { log.renders += 1; },
    storage: () => ({ getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }),
  });
  const paint = (queued = []) => {
    const box = doc.createElement('div');
    box.append(...panel.render(session, queued));
    return box;
  };
  return { doc, panel, store, log, paint };
}

test('«Работает сейчас» рисует строки с состоянием и временем в состоянии', () => {
  const s = setup(sessionWith({ state: 'answering', machine: parseMachineState(machine({ since: 70_000 })) }));
  const box = s.paint(['x']);
  const rows = box.querySelectorAll('.mach-row');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].getAttribute('data-state'), 'running');
  assert.equal(rows[0].querySelector('.mach-state').textContent, 'идёт');
  assert.equal(rows[0].querySelector('.mach-time').textContent, '30 с');
  assert.equal(rows[1].getAttribute('data-kind'), 'queue');
});

test('карточка отладки скрыта по умолчанию; раскрытие хранится по сессии и запрашивает состояние', () => {
  const session = sessionWith({ state: 'idle', machine: parseMachineState(machine()) });
  const s = setup(session);
  let box = s.paint();
  assert.equal(box.querySelector('.mach-debug-head').getAttribute('aria-expanded'), 'false');
  assert.equal(box.querySelector('.mach-body'), null);
  box.querySelector('.mach-debug-head').click();
  assert.equal(s.store['crew-machine-debug:s1'], '1');
  assert.deepEqual(s.log.got, ['s1']);
  assert.equal(s.log.renders, 1);
  box = s.paint();
  assert.equal(box.querySelector('.mach-debug-head').getAttribute('aria-expanded'), 'true');
  assert.equal(box.querySelector('.mach-statename').textContent, 'Awaiting');
  box.querySelector('.mach-debug-head').click();
  assert.equal(s.store['crew-machine-debug:s1'], '0');
});

test('без localStorage карточка просто закрыта и не падает', () => {
  const doc = createFakeDocument();
  const panel = createMachinesPanel(doc, {
    now: () => 1, durationText: () => '', onCopy() {}, onGet() {}, rerender() {},
    storage: () => { throw new Error('нет хранилища'); },
  });
  const box = doc.createElement('div');
  box.append(...panel.render(sessionWith({ state: 'idle' }), []));
  box.querySelector('.mach-debug-head').click();
  assert.equal(box.querySelector('.mach-debug-head').getAttribute('aria-expanded'), 'false');
});

test('раскрытая карточка: данные деревом, длинное значение — «показать целиком», журнал, копирование JSON', () => {
  const long = 'ж'.repeat(400);
  const session = sessionWith({ state: 'idle', machine: parseMachineState(machine({ data: { user: long, nested: { a: 1 } }, journal: [{ code: 'user_message', at: 1000, note: 'привет' }] })) });
  const s = setup(session, { stored: { 'crew-machine-debug:s1': '1' } });
  let box = s.paint();
  const leaf = box.querySelector('.mach-leaf[data-path="data/user"]');
  assert.ok(leaf.querySelector('.mach-val').textContent.length < 200);
  leaf.querySelector('.mach-more').click();
  box = s.paint();
  assert.ok(box.querySelector('.mach-leaf[data-path="data/user"] .mach-val').textContent.length > 400);
  const branch = box.querySelector('.mach-branch[data-path="data/nested"]');
  assert.equal(branch.getAttribute('aria-expanded'), 'false');
  branch.click();
  box = s.paint();
  assert.ok(box.querySelector('.mach-leaf[data-path="data/nested/a"]'));
  assert.equal(box.querySelectorAll('.mach-jrow').length, 1);
  box.querySelector('.mach-copy').click();
  assert.equal(JSON.parse(s.log.copied[0]).state, 'Awaiting');
});

test('данные, обрезанные сервером, показываются с пометкой', () => {
  const session = sessionWith({ state: 'idle', machine: parseMachineState(machine({ data: { truncated: true, size: 99999, head: '{"user":"..."' } })) });
  const s = setup(session, { stored: { 'crew-machine-debug:s1': '1' } });
  assert.ok(s.paint().querySelector('.mach-cut').textContent.includes('99999'));
});

test('нет состояния — подсказка и кнопка запроса', () => {
  const s = setup(sessionWith({ state: 'idle' }), { stored: { 'crew-machine-debug:s1': '1' } });
  s.paint().querySelector('.mach-ask').click();
  assert.deepEqual(s.log.got, ['s1']);
});

// ---- мок ----

test('мок: с machines:true в журнале есть состояние машины каждой сессии', () => {
  const server = createMockServer({ now: () => 5_000_000, machines: true });
  const sessions = Object.values(run(server.journal()).sessions);
  assert.ok(sessions.length >= 3);
  assert.ok(sessions.every((s) => s.machine && s.machine.machine === 'DialogSession'));
  assert.ok(sessions.some((s) => s.machine.state === 'Idle'));
});

test('мок: ход меняет состояние Awaiting -> Idle, machine_state_get отвечает, без machines — событий нет', () => {
  const server = createMockServer({ now: () => 5_000_000, machines: true });
  const entries = server.handle(ev('user_message', { turn: 't9', text: 'привет' }, { trace: 'ses-demo-2', step: 50, time: 5_000_000 }));
  const machines = entries.filter((e) => e.event.kind === 'machine_state');
  assert.equal(machines[0].event.input.state, 'Awaiting');
  assert.equal(machines.at(-1).event.input.state, 'Idle');
  assert.equal(machines[0].event.input.data.user, 'привет');
  const got = server.handle(ev('machine_state_get', {}, { trace: 'ses-demo-2', step: 51, time: 5_000_100 }));
  assert.equal(got.filter((e) => e.event.kind === 'machine_state').length, 1);
  const quiet = createMockServer({ now: () => 5_000_000 });
  assert.equal(quiet.handle(ev('user_message', { turn: 't9', text: 'привет' }, { trace: 'ses-demo-2', step: 50 })).some((e) => e.event.kind === 'machine_state'), false);
});

test('foldMachine: чанки копят ответ, журнал не длиннее 20', () => {
  let m = { state: 'Idle', since: 0, user: '', reply: '', lastInput: null, userAttempt: 0, agentAttempt: 0, journal: [] };
  m = foldMachine(m, 'user_message', { text: 'q' }, 1);
  for (let i = 0; i < 30; i += 1) m = foldMachine(m, 'agent_chunk', { text: 'x' }, 2 + i);
  assert.equal(m.reply, 'x'.repeat(30));
  assert.equal(m.journal.length, 20);
  assert.equal(machineInput(m).data.reply.length, 30);
  assert.equal(foldMachine(m, 'tool_call', {}, 9), m);
});

test('«Служебные подсказки агенту» (192.5): вид и время, полный текст по клику, новейшие сверху; последние 20; нет подсказок — пояснение', () => {
  const none = setup(sessionWith({ state: 'idle' }));
  const emptyBox = none.paint();
  assert.equal(emptyBox.querySelector('.mach-hints .card-title').textContent, 'Служебные подсказки агенту');
  assert.match(emptyBox.querySelector('.mach-hints').textContent, /Подсказок пока не было/);
  const hints = Array.from({ length: 22 }, (_, i) => ({ ms: 1_000_000 + i, kind: i % 2 === 0 ? 'список задач' : 'Распознать задачи', text: `текст ${i}` }));
  const routeState = parseRouteState({ route: 'interactive', hints });
  assert.equal(routeState.hints.length, 20, 'на странице не больше 20');
  const s = setup(sessionWith({ state: 'idle', routeState }));
  let box = s.paint();
  const rows = box.querySelectorAll('.hint-row');
  assert.equal(rows.length, 20);
  assert.equal(rows[0].querySelector('.hint-kind').textContent, 'Распознать задачи', 'новейшая сверху');
  assert.equal(box.querySelectorAll('.hint-text').length, 0, 'текст скрыт');
  rows[0].querySelector('.hint-toggle').click();
  assert.equal(s.log.renders, 1);
  box = s.paint();
  assert.equal(box.querySelectorAll('.hint-text')[0].textContent, 'текст 21', 'полный текст по клику');
  assert.match(s.panel.signature(sessionWith({ state: 'idle', routeState }), []), /текст 21/);
});

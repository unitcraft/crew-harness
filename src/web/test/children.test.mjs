// Дочерние сессии (задача 192.3): вложенность и сворачивание в списке, потомки для удаления, разбор детей и родителя из route_state,
// панель детей с открытием ребёнка, выбор способа в карточке («Как подзадачу задачи K» и др.), сигналы.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../state.js';
import { parseRouteState } from '../routes.js';
import { parseCrewTask, defaultWay, wayOptions, parseWay, rowActions, crewSignal, kindText } from '../crew-task.js';
import { createCrewTaskUi } from '../crew-task-ui.js';
import { createFakeDocument } from './fake-dom.mjs';

const S = (id, name, extra = {}) => ({ id, name, project: '', projectId: 'p', parent: '', pinned: false, updatedAt: 0, ...extra });
const ids = (rows) => rows.map((r) => `${r.depth}:${r.session.id}`);

test('список: дочерняя сессия стоит под родителем с отступом; у родителя счёт детей', () => {
  const list = [S('top', 'Оркестратор', { updatedAt: 9 }), S('k1', 'Правки пульта', { parent: 'top', updatedAt: 5 }), S('k2', 'Тесты', { parent: 'top', updatedAt: 6 }), S('solo', 'Сама по себе', { updatedAt: 1 })];
  const g = st.groupSessions(list, {});
  const rows = g.projects[0].rows;
  assert.deepEqual(ids(rows), ['0:top', '1:k2', '1:k1', '0:solo']);
  assert.equal(rows[0].kids, 2);
  assert.equal(rows[3].kids, 0);
});

test('список: свёрнутый родитель прячет детей и внуков, остальное на месте', () => {
  const list = [S('top', 'T', { updatedAt: 9 }), S('k', 'K', { parent: 'top', updatedAt: 8 }), S('g', 'G', { parent: 'k', updatedAt: 7 }), S('solo', 'Solo', { updatedAt: 1 })];
  const g = st.groupSessions(list, { collapsed: new Set(['top']) });
  assert.deepEqual(ids(g.projects[0].rows), ['0:top', '0:solo']);
  assert.equal(g.projects[0].rows[0].collapsed, true);
  const open = st.groupSessions(list, { collapsed: new Set(['k']) });
  assert.deepEqual(ids(open.projects[0].rows), ['0:top', '1:k', '0:solo']);
});

test('descendantsOf: дети и внуки, не сам родитель и не чужие', () => {
  const list = [S('top', 'T', { updatedAt: 9 }), S('k', 'K', { parent: 'top', updatedAt: 8 }), S('g', 'G', { parent: 'k', updatedAt: 7 }), S('solo', 'Solo', { updatedAt: 1 })];
  assert.deepEqual(st.descendantsOf(list, 'top').map((s) => s.id), ['k', 'g']);
  assert.deepEqual(st.descendantsOf(list, 'solo'), []);
  assert.deepEqual(st.descendantsOf(list, 'g'), []);
});

test('сессия из session_created несёт parent; route_state — детей, родителя, эпик и блок слияния', () => {
  const model = st.reduce(st.initialModel(), { id: 'e1', trace: 'c1', step: 0, kind: 'session_created', input: { name: 'Дочь', agent: 'claude', parent: 'top', parent_kind: 'subtask' }, time: 1 });
  assert.equal(model.sessions.c1.parent, 'top');
  const rs = parseRouteState({
    route: 'interactive',
    children: [{ k: 1, number: '233', kind: 'подзадача', title: 'Панель', folder: '233-232-privet-panel', branch: 'task/233-232-privet-panel', session: 'top-c1', state: 'running', state_text: 'идёт', done: 1, total: 3, touches: ['a.js'] }, { k: 2, number: '234', title: 'Тест', state: 'merged', session: 'top-c2', waits_for: 0 }, 5, { state: 'зря' }],
    children_block: ['233'],
    epic: true,
    child: { parent: 'top', parent_name: 'Оркестратор', kind: 'subtask', parent_no: '232', k: 1, target: 'parent' },
  });
  assert.equal(rs.kids.list.length, 3);
  assert.equal(rs.kids.merged, 1);
  assert.equal(rs.kids.total, 3);
  assert.deepEqual(rs.kids.block, ['233']);
  assert.equal(rs.kids.epic, true);
  assert.equal(rs.kids.child.parentName, 'Оркестратор');
  assert.equal(rs.kids.child.target, 'parent');
  assert.equal(rs.kids.list[2].state, 'running');
  assert.equal(parseRouteState({ route: 'interactive' }).kids.child, null);
  assert.deepEqual(parseRouteState({}).kids.list, []);
});

test('карточка: способ по умолчанию — отдельная задача; пометка агента (подзадача, задача эпика, дополнить) выбрана заранее', () => {
  const crew = parseCrewTask({ proposals: [], targets: [{ number: 232, title: 'Привет', session: 's', epic: false }, { number: 100, title: 'Эпик', session: 'e', epic: true }, { number: 0 }] });
  assert.equal(crew.targets.length, 2);
  const base = { kind: 'new', parent: 0, epic: 0, extends: 0, state: 'open', title: 'x' };
  assert.equal(defaultWay(base), 'new:0');
  assert.equal(defaultWay({ ...base, kind: 'subtask', parent: 232 }), 'subtask:232');
  assert.equal(defaultWay({ ...base, kind: 'epic_task', epic: 100 }), 'epic_task:100');
  assert.equal(defaultWay({ ...base, kind: 'extend', extends: 232 }), 'extend:232');
  const values = wayOptions(base, crew).map((o) => o.value);
  assert.deepEqual(values, ['new:0', 'subtask:232', 'extend:232', 'subtask:100', 'epic_task:100', 'extend:100']);
  assert.deepEqual(parseWay('subtask:232'), { mode: 'subtask', target: 232 });
  assert.deepEqual(parseWay('мусор'), { mode: 'new', target: 0 });
  assert.match(kindText({ ...base, kind: 'subtask', parent: 232 }), /подзадача задачи 232/);
  assert.match(kindText({ ...base, kind: 'epic_task', epic: 100 }), /задача эпика 100/);
  // выбор «Дополнить» меняет главную кнопку
  assert.equal(rowActions(base, 'extend:232')[0].action, 'extend');
  assert.equal(rowActions(base, 'new:0')[0].action, 'start');
});

test('сигналы: способ и агент уходят с кнопкой, слияние подзадач и эпик — свои сигналы', () => {
  assert.deepEqual(crewSignal.prop(3, 'start', { mode: 'subtask', target: 232, agent: 'codex' }), { kind: 'route_prop', input: { id: 3, action: 'start', mode: 'subtask', target: 232, agent: 'codex' } });
  assert.deepEqual(crewSignal.prop(3, 'discuss'), { kind: 'route_prop', input: { id: 3, action: 'discuss' } });
  assert.deepEqual(crewSignal.childrenMerge(), { kind: 'route_children_merge', input: {} });
  assert.deepEqual(crewSignal.epic(true), { kind: 'route_epic', input: { on: true } });
});

test('панель: дети с состоянием и прогрессом, клик открывает сессию ребёнка; у ребёнка — ссылка на родителя', () => {
  const doc = createFakeDocument();
  const opened = [];
  const ui = createCrewTaskUi(doc, { onSelect: (id) => opened.push(id), onEpic() {} }, { agents: () => [] });
  const routeState = parseRouteState({
    route: 'interactive',
    children: [{ k: 1, number: '233', title: 'Панель', session: 'top-c1', state: 'running', state_text: 'идёт', done: 1, total: 3 }, { k: 2, number: '234', title: 'Тест', session: 'top-c2', state: 'waits', state_text: 'ждёт 233' }],
  });
  const panel = ui.panel({ id: 'top', draft: false, routeState });
  const kids = panel.querySelectorAll('.crew-kid');
  assert.equal(kids.length, 2);
  assert.match(kids[0].textContent, /233/);
  assert.match(kids[0].textContent, /Панель/);
  assert.match(kids[1].textContent, /ждёт 233/);
  kids[1].click();
  assert.deepEqual(opened, ['top-c2']);
  const childPanel = ui.panel({ id: 'top-c1', draft: false, routeState: parseRouteState({ route: 'interactive', child: { parent: 'top', parent_name: 'Оркестратор', kind: 'subtask', parent_no: '232', k: 1, target: 'parent' } }) });
  const link = childPanel.querySelectorAll('.crew-parent');
  assert.equal(link.length, 1);
  link[0].click();
  assert.equal(opened[1], 'top');
});

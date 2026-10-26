// Порядок сессий и проектов (задача 192): чистые функции и события session_placed / session_deleted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { byOrder, moveInOrder, groupSessions, initialModel, reduce, sessionList } from '../state.js';

const S = (id, extra = {}) => ({ id, name: id, updatedAt: 1, project: '', projectId: 'p1', ...extra });
const ids = (list) => list.map((s) => s.id);

test('moveInOrder: перед целью, после цели, на себя и чужой id ничего не меняют, вход не портится', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveInOrder(list, 'a', 'c', false), ['b', 'a', 'c', 'd']);
  assert.deepEqual(moveInOrder(list, 'a', 'c', true), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveInOrder(list, 'd', 'a', false), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveInOrder(list, 'c', 'c', true), list);
  assert.deepEqual(moveInOrder(list, 'x', 'c', true), list);
  assert.deepEqual(moveInOrder(list, 'a', 'x', true), list);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});

test('byOrder: ручное место сильнее активности, без места — сверху, свежие выше', () => {
  const list = [
    S('old', { updatedAt: 1 }),
    S('r2', { rank: 2, updatedAt: 100 }),
    S('r0', { rank: 0, updatedAt: 1 }),
    S('fresh', { updatedAt: 50 }),
    S('r1', { rank: 1, updatedAt: 10 }),
  ];
  assert.deepEqual(ids([...list].sort(byOrder)), ['fresh', 'old', 'r0', 'r1', 'r2']);
});

test('groupSessions: внутри проекта действует ручной порядок; проекты идут в порядке списка проектов', () => {
  const projects = [{ id: 'p2', name: 'Два' }, { id: 'p1', name: 'Один' }];
  const list = [
    S('a', { rank: 1, updatedAt: 99 }),
    S('b', { rank: 0, updatedAt: 1 }),
    S('c', { projectId: 'p2', updatedAt: 5 }),
  ];
  const g = groupSessions(list, { projects });
  assert.deepEqual(g.projects.map((x) => x.id), ['p2', 'p1'], 'порядок проектов — как в списке сервера, а не по активности');
  assert.deepEqual(g.projects[1].rows.map((r) => r.session.id), ['b', 'a']);
});

function made(id) {
  return reduce(initialModel(), { id: `c-${id}`, trace: id, step: 0, kind: 'session_created', time: 100, input: { name: id, agent: 'x', project_id: 'p1', project: 'Один' } });
}

test('session_placed: место, перенос в другой проект и в «Без проекта»; активность не меняется', () => {
  let m = made('s1');
  m = reduce(m, { id: 'e1', trace: 's1', step: 1, kind: 'session_placed', time: 900, input: { rank: 3 } });
  assert.equal(m.sessions.s1.rank, 3);
  assert.equal(m.sessions.s1.projectId, 'p1');
  assert.equal(m.sessions.s1.updatedAt, 100, 'перестановка не «свежее событие»');
  m = reduce(m, { id: 'e2', trace: 's1', step: 2, kind: 'session_placed', time: 901, input: { rank: -1, project_id: 'p2', project: 'Два' } });
  assert.deepEqual([m.sessions.s1.rank, m.sessions.s1.projectId, m.sessions.s1.project], [-1, 'p2', 'Два']);
  m = reduce(m, { id: 'e3', trace: 's1', step: 3, kind: 'session_placed', time: 902, input: { rank: 0, project_id: '', project: '' } });
  assert.deepEqual([m.sessions.s1.projectId, m.sessions.s1.project], ['', '']);
  assert.equal(reduce(m, { id: 'e3', trace: 's1', step: 3, kind: 'session_placed', time: 902, input: { rank: 9 } }), m, 'повтор безвреден');
});

test('session_deleted: сессия уходит из модели, повтор и чужая цепочка безвредны', () => {
  let m = made('s1');
  m = reduce(m, { id: 'srv-1', trace: 's1', step: 0, kind: 'session_deleted', time: 5, input: {} });
  assert.deepEqual(sessionList(m), []);
  assert.equal(reduce(m, { id: 'srv-1', trace: 's1', step: 0, kind: 'session_deleted', time: 5, input: {} }), m);
  const again = reduce(m, { id: 'srv-2', trace: 'nope', step: 0, kind: 'session_deleted', time: 5, input: {} });
  assert.deepEqual(sessionList(again), []);
});

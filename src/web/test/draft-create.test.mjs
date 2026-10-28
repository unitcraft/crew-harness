import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFolder, makeProject } from '../projects.js';

test('папка из ответа сервера: repo=false запоминается, иначе поля нет (считаем репозиторием)', () => {
  assert.equal(makeFolder({ path: 'C:/a', repo: false }).repo, false);
  assert.equal(makeFolder({ path: 'C:/a', repo: true }).repo, undefined);
  assert.equal(makeFolder({ path: 'C:/a' }).repo, undefined);
  assert.equal(makeProject({ id: 'x', name: 'p', folders: [{ path: 'C:/a', repo: false }] }).folders[0].repo, false);
});

test('задача 192.8: пока хаб готовит рабочую копию, подпись — «готовлю рабочую копию…», потом — обычная', async () => {
  const { parseWhere, whereText } = await import('../routes.js');
  const prep = { routeState: { where: parseWhere({ kind: 'preparing' }) } };
  assert.equal(prep.routeState.where.kind, 'preparing');
  assert.match(whereText(prep), /^готовлю рабочую копию/);
  const ready = { routeState: { where: parseWhere({ kind: 'wip', worktree: '/trees/x-1' }) } };
  assert.equal(whereText(ready), 'работа идёт в отдельной копии (без ветки)');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFolder, makeProject } from '../projects.js';

test('папка из ответа сервера: repo=false запоминается, иначе поля нет (считаем репозиторием)', () => {
  assert.equal(makeFolder({ path: 'C:/a', repo: false }).repo, false);
  assert.equal(makeFolder({ path: 'C:/a', repo: true }).repo, undefined);
  assert.equal(makeFolder({ path: 'C:/a' }).repo, undefined);
  assert.equal(makeProject({ id: 'x', name: 'p', folders: [{ path: 'C:/a', repo: false }] }).folders[0].repo, false);
});

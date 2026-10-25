// Чистая модель проектов: пути, разбор .env, проверка и тело запроса, подпись сессии, группы в списке сессий.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../projects.js';
import { groupSessions } from '../lists.js';

test('normalizePath: косые, повторы, хвост, буква диска, корни', () => {
  assert.equal(p.normalizePath('c:\\work\\app\\'), 'C:/work/app');
  assert.equal(p.normalizePath('C://work///z/'), 'C:/work/z');
  assert.equal(p.normalizePath('c:'), 'C:/');
  assert.equal(p.normalizePath('C:\\'), 'C:/');
  assert.equal(p.normalizePath('/'), '/');
  assert.equal(p.normalizePath('/srv/app/'), '/srv/app');
  assert.equal(p.normalizePath('  '), '');
  assert.equal(p.normalizePath(undefined), '');
});

test('folderName, parentPath, samePath, joinPath', () => {
  assert.equal(p.folderName('C:/work/app'), 'app');
  assert.equal(p.folderName('D:/'), 'D:/');
  assert.equal(p.parentPath('C:/work/app'), 'C:/work');
  assert.equal(p.parentPath('C:/work'), 'C:/');
  assert.equal(p.parentPath('D:/'), null);
  assert.equal(p.parentPath('/home'), '/');
  assert.equal(p.parentPath('/'), null);
  assert.ok(p.samePath('c:\\Work\\App', 'C:/work/app'));
  assert.ok(!p.samePath('/a/B', '/a/b'));
  assert.equal(p.joinPath('', 'C:/'), 'C:/');
  assert.equal(p.joinPath('C:/', 'work'), 'C:/work');
  assert.equal(p.joinPath('C:/work', 'app'), 'C:/work/app');
  assert.ok(p.isAbsolutePath('C:\\x') && p.isAbsolutePath('/x') && !p.isAbsolutePath('x/y'));
});

test('parseEnv: переменные, комментарии, export, кавычки и многострочное значение', () => {
  const text = [
    '# комментарий', '', 'NODE_ENV=production', 'export A = 1  # хвост', "B='x # не комментарий'",
    'C="первая', 'вторая"', 'EMPTY=',
  ].join('\n');
  const r = p.parseEnv(text);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.vars.map((v) => [v.key, v.value]), [
    ['NODE_ENV', 'production'], ['A', '1'], ['B', 'x # не комментарий'], ['C', 'первая\nвторая'], ['EMPTY', ''],
  ]);
  assert.equal(r.vars[3].line, 6);
  assert.equal(p.countEnv(text), 5);
  assert.deepEqual(p.envKeys('A=1\nB=2\nA=3'), ['A', 'B']);
  assert.equal(p.countEnv('A=1\nA=2'), 1);
  assert.equal(p.parseEnv('A=1\r\nB=2').vars.length, 2);
});

test('parseEnv: ошибки с номером строки по-русски', () => {
  const r = p.parseEnv('OK=1\nбез равно\n1BAD=2\nQ="не закрыта\n');
  assert.deepEqual(r.errors.map((e) => e.message), [
    'строка 2: нет знака «=»', 'строка 3: неверное имя «1BAD»', 'строка 4: кавычка не закрыта',
  ]);
  assert.deepEqual(r.vars.map((v) => v.key), ['OK']);
  assert.match(p.parseEnv("A='x' y").errors[0].message, /лишний текст/);
  assert.deepEqual(p.parseEnv('').errors, []);
});

test('makeProject / parseProjects: пустое и мусор не ломают, значения env в список не попадают', () => {
  const full = p.makeProject({ id: 'a', name: 'N', folders: [{ path: 'd:\\x', worktree: 1, branch: ' dev ' }, { path: '' }], env: 'K=v' });
  assert.deepEqual(full.folders, [{ path: 'D:/x', worktree: true, branch: 'dev' }]);
  assert.deepEqual(full.envKeys, ['K']);
  const row = p.makeProject({ id: 'b', name: 'M', folders: [], env_keys: ['A', 'B'] });
  assert.deepEqual(row.envKeys, ['A', 'B']);
  assert.equal(row.env, '');
  assert.deepEqual(p.makeProject(null), { id: '', name: '', folders: [], env: '', envKeys: [] });
  const list = p.parseProjects({ projects: [{ id: 'a', name: 'x' }, { name: 'без id' }, null] });
  assert.deepEqual(list.map((x) => x.id), ['a']);
  assert.deepEqual(p.parseProjects(null), []);
});

test('validateProject и projectPayload', () => {
  assert.deepEqual(p.validateProject({ name: '  ', folders: [], env: '' }).errors, { name: 'empty' });
  const dup = p.validateProject({ name: 'x', folders: [{ path: 'D:/a' }, { path: 'd:\\a\\' }], env: '' });
  assert.equal(dup.errors.folders, 'duplicate');
  const bad = p.validateProject({ name: 'x', folders: [], env: 'oops' });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.env, /^строка 1:/);
  assert.ok(p.validateProject({ name: 'x', folders: [{ path: 'D:/a' }], env: 'A=1' }).ok);
  assert.deepEqual(p.projectPayload({ name: ' x ', folders: [{ path: 'd:\\a', worktree: true }], env: 'A=1' }),
    { name: 'x', folders: [{ path: 'D:/a', worktree: true }], env: 'A=1' });
});

test('папка новой сессии: единственная сама, из нескольких — запрошенная или первая', () => {
  const one = p.makeProject({ id: '1', name: 'a', folders: [{ path: 'C:/a' }] });
  const two = p.makeProject({ id: '2', name: 'b', folders: [{ path: 'C:/a' }, { path: 'C:/b' }] });
  assert.ok(!p.needsFolderChoice(one) && p.needsFolderChoice(two));
  assert.equal(p.pickFolder(one, 'C:/zzz').path, 'C:/a');
  assert.equal(p.pickFolder(two, 'c:\\b').path, 'C:/b');
  assert.equal(p.pickFolder(two, '').path, 'C:/a');
  assert.equal(p.pickFolder(p.makeProject({ id: '3', name: 'c' }), 'x'), null);
  assert.equal(p.pickFolder(null), null);
});

test('sessionPlace: «Проект · папка (ветка)», пустые части пропускаются', () => {
  assert.equal(p.sessionPlace({ project: 'crew', folder: 'C:/work/app', branch: 'main' }), 'crew · app (main)');
  assert.equal(p.sessionPlace({ project: 'crew', folder: 'C:/work/app', branch: '' }), 'crew · app');
  assert.equal(p.sessionPlace({ project: 'crew', folder: '', branch: 'main' }), 'crew');
  assert.equal(p.sessionPlace({ project: '', folder: 'C:/a', branch: 'main' }), '');
});

test('pluralRu и errorText', () => {
  const f = (n) => p.pluralRu(n);
  assert.deepEqual([0, 1, 2, 4, 5, 11, 12, 21, 22, 25, 111].map(f), ['many', 'one', 'few', 'few', 'many', 'many', 'many', 'one', 'few', 'many', 'many']);
  assert.equal(p.errorText({ error: ' строка 2: плохо ' }, 'x'), 'строка 2: плохо');
  assert.equal(p.errorText({}, 'запас'), 'запас');
  assert.equal(p.errorText(null, 'запас'), 'запас');
});

const S = (id, extra = {}) => ({ id, name: id, updatedAt: 1, project: '', projectId: '', ...extra });

test('groupSessions: по projectId, удалённый проект — в «Без проекта», имя без id — своя группа', () => {
  const projects = [{ id: 'p1', name: 'Один' }, { id: 'p2', name: 'Два' }];
  const list = [
    S('a', { projectId: 'p1', project: 'старое имя', updatedAt: 10 }),
    S('b', { projectId: 'gone', project: 'Удалён', updatedAt: 20 }),
    S('c', { project: 'legacy', updatedAt: 5 }),
    S('d', { updatedAt: 1 }),
  ];
  const g = groupSessions(list, { projects });
  assert.deepEqual(g.projects.map((x) => [x.project, x.id, x.rows.map((r) => r.session.id)]), [
    ['', '', ['b', 'd']],
    ['Один', 'p1', ['a']],
    ['legacy', '', ['c']],
  ]);
});

test('groupSessions: includeEmpty добавляет проекты без сессий в конец по имени; без списка проектов id остаётся ключом', () => {
  const projects = [{ id: 'p1', name: 'Бета' }, { id: 'p2', name: 'Альфа' }];
  const g = groupSessions([S('a', { projectId: 'p1', updatedAt: 3 })], { projects, includeEmpty: true });
  assert.deepEqual(g.projects.map((x) => [x.project, x.rows.length]), [['Бета', 1], ['Альфа', 0]]);
  const unknown = groupSessions([S('a', { projectId: 'px', project: 'Имя' })], {});
  assert.deepEqual(unknown.projects.map((x) => [x.project, x.id]), [['Имя', 'px']]);
});

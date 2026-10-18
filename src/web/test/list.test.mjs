// Чистые функции списка, ленты разговора и подписей (задача 094): без DOM, без часов.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../state.js';

const S = (id, name, extra = {}) => ({ id, name, project: '', parent: '', pinned: false, updatedAt: 0, ...extra });

const ids = (rows) => rows.map((r) => `${r.depth}:${r.session.id}`);

// ---- фильтр и группы ----------------------------------------------------------------------

test('filterSessions: подстрока названия без учёта регистра и пробелов по краям; пусто — всё', () => {
  const list = [S('a', 'Разбор падающих тестов'), S('b', 'Уборка временных файлов'), S('c', 'Релиз')];
  assert.deepEqual(st.filterSessions(list, '').map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(st.filterSessions(list, '  ').map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(st.filterSessions(list, 'ТЕСТ').map((s) => s.id), ['a']);
  assert.deepEqual(st.filterSessions(list, ' уборка ').map((s) => s.id), ['b']);
  assert.deepEqual(st.filterSessions(list, 'нет такой'), []);
  assert.deepEqual(st.filterSessions(list, undefined).map((s) => s.id), ['a', 'b', 'c']);
});

test('groupSessions: закреплённые отдельно, проекты по свежести, без проекта — своя группа', () => {
  const list = [
    S('a', 'A', { project: 'p1', updatedAt: 10 }),
    S('b', 'B', { project: 'p2', updatedAt: 30 }),
    S('c', 'C', { project: 'p1', updatedAt: 20 }),
    S('d', 'D', { updatedAt: 5 }),
  ];
  const g = st.groupSessions(list, { pinned: new Set(['c']) });
  assert.deepEqual(ids(g.pinned), ['0:c']);
  assert.deepEqual(g.projects.map((p) => p.project), ['p2', 'p1', '']);
  assert.deepEqual(ids(g.projects[1].rows), ['0:a']);
});

test('groupSessions: дочерняя сессия идёт под родителем с отступом, сирота — на верхнем уровне', () => {
  const list = [
    S('root', 'R', { project: 'p', updatedAt: 50 }),
    S('kid', 'K', { project: 'p', parent: 'root', updatedAt: 60 }),
    S('grand', 'G', { project: 'p', parent: 'kid', updatedAt: 70 }),
    S('orphan', 'O', { project: 'p', parent: 'нет такого', updatedAt: 10 }),
  ];
  const g = st.groupSessions(list, {});
  assert.deepEqual(ids(g.projects[0].rows), ['0:root', '1:kid', '2:grand', '0:orphan']);
  assert.deepEqual(g.pinned, []);
});

test('groupSessions: закреплённый ребёнок уходит в закреплённые, его родитель остаётся в проекте', () => {
  const list = [
    S('root', 'R', { project: 'p', updatedAt: 50 }),
    S('kid', 'K', { project: 'p', parent: 'root', updatedAt: 60 }),
  ];
  const g = st.groupSessions(list, { pinned: new Set(['kid']) });
  assert.deepEqual(ids(g.pinned), ['0:kid']);
  assert.deepEqual(ids(g.projects[0].rows), ['0:root']);
});

test('groupSessions: цикл родителей не зависает и ничего не теряет', () => {
  const list = [S('a', 'A', { parent: 'b', updatedAt: 1 }), S('b', 'B', { parent: 'a', updatedAt: 2 })];
  const g = st.groupSessions(list, {});
  assert.deepEqual(g.projects[0].rows.map((r) => r.session.id).sort(), ['a', 'b']);
});

test('groupSessions: фильтр и группы вместе — пустые группы не создаются', () => {
  const list = [S('a', 'Альфа', { project: 'p1' }), S('b', 'Бета', { project: 'p2' })];
  const g = st.groupSessions(st.filterSessions(list, 'бет'), {});
  assert.deepEqual(g.projects.map((p) => p.project), ['p2']);
});

test('effectivePins: ручное решение важнее данных сессии', () => {
  const list = [S('a', 'A', { pinned: true }), S('b', 'B'), S('c', 'C', { pinned: true })];
  const pins = st.effectivePins(list, { b: true, c: false });
  assert.deepEqual([...pins].sort(), ['a', 'b']);
});

// ---- лента разговора ----------------------------------------------------------------------

let n = 0;
const ev = (kind, input, step, extra = {}) => { n += 1; return { id: `l${n}`, trace: 's', step, kind, input, time: 1000 + step, ...extra }; };
const run = (events) => events.reduce(st.reduce, st.initialModel());
const head = () => [ev('session_created', { name: 'Т', agent: 'a' }, 0), ev('user_message', { turn: 't1', text: 'привет' }, 1)];

test('timeline: текст до и после инструмента делится по номеру шага, а не по приходу', () => {
  const m = run([
    ...head(),
    ev('agent_chunk', { turn: 't1', text: 'после' }, 4),
    ev('tool_call', { id: 'c1', title: 'ls', kind: 'execute', status: 'completed' }, 3),
    ev('agent_chunk', { turn: 't1', text: 'до' }, 2),
    ev('agent_done', { turn: 't1' }, 5),
  ]);
  const items = st.timeline(m.sessions.s);
  assert.deepEqual(items.map((i) => i.type), ['user', 'text', 'work', 'text', 'actions']);
  assert.equal(items[1].text, 'до');
  assert.equal(items[3].text, 'после');
  assert.equal(items[2].rows[0].type, 'tool');
  assert.equal(new Set(items.map((i) => i.key)).size, items.length);
});

test('timeline: подряд идущие рабочие строки — одна группа; текст между ними разрывает группу', () => {
  const m = run([
    ...head(),
    ev('tool_call', { id: 'c1', title: 'a', kind: 'read', status: 'completed' }, 2),
    ev('background_task', { id: 'b1', title: 'build', status: 'running', started: 1 }, 3),
    ev('agent_chunk', { turn: 't1', text: 'тут текст' }, 4),
    ev('tool_call', { id: 'c2', title: 'b', kind: 'edit', status: 'failed' }, 5),
  ]);
  const items = st.timeline(m.sessions.s);
  assert.deepEqual(items.map((i) => i.type), ['user', 'work', 'text', 'work', 'running']);
  assert.deepEqual(items[1].rows.map((r) => r.type), ['tool', 'task']);
  assert.deepEqual(st.workSummary(items[1].rows), { count: 2, failed: 0, running: 1 });
  assert.deepEqual(st.workSummary(items[3].rows), { count: 1, failed: 1, running: 0 });
});

test('timeline: запрос разрешения входит в группу строкой perm, решение видно в ней', () => {
  const m = run([
    ...head(),
    ev('permission_request', { turn: 't1', request: 'p1', action: 'Записать', detail: 'a.txt' }, 2),
    ev('permission_decision', { request: 'p1', decision: 'allow' }, 3),
  ]);
  const work = st.timeline(m.sessions.s).find((i) => i.type === 'work');
  assert.equal(work.rows[0].type, 'perm');
  assert.equal(work.rows[0].decision, 'allow');
});

test('timeline: идущий ход даёт строку running с началом хода; законченный — строку действий с текстом', () => {
  const live = run([...head(), ev('agent_chunk', { turn: 't1', text: 'ответ' }, 2)]);
  const li = st.timeline(live.sessions.s);
  assert.deepEqual(li.map((i) => i.type), ['user', 'text', 'running']);
  assert.equal(li[1].streaming, true);
  assert.equal(li[2].since, 1001);

  const done = run([...head(), ev('agent_chunk', { turn: 't1', text: 'ответ' }, 2), ev('agent_done', { turn: 't1' }, 3)]);
  const di = st.timeline(done.sessions.s);
  assert.deepEqual(di.map((i) => i.type), ['user', 'text', 'actions']);
  assert.equal(di[1].streaming, false);
  assert.equal(di[2].text, 'ответ');
  assert.equal(di[2].at, 1003);
});

test('timeline: отказ, ошибка и отмена дают заметку; действий под ответом нет', () => {
  const refused = run([...head(), ev('agent_refused', { turn: 't1', reason: 'нельзя' }, 2)]);
  const note = st.timeline(refused.sessions.s).find((i) => i.type === 'note');
  assert.deepEqual([note.tone, note.reason], ['refused', 'нельзя']);
  const cancelled = run([...head(), ev('agent_chunk', { turn: 't1', text: 'x' }, 2), ev('cancel', { turn: 't1' }, 3)]);
  assert.equal(st.timeline(cancelled.sessions.s).find((i) => i.type === 'note').tone, 'cancelled');
  assert.equal(st.timeline(cancelled.sessions.s).some((i) => i.type === 'actions'), false);
});

test('timeline: карточка правок хода стоит после содержимого, перед действиями', () => {
  const m = run([
    ...head(),
    ev('file_diff', { path: 'a.js', added: 3, removed: 0 }, 2),
    ev('file_diff', { path: 'b.js', added: 1, removed: 4 }, 3),
    ev('agent_chunk', { turn: 't1', text: 'готово' }, 4),
    ev('agent_done', { turn: 't1' }, 5),
  ]);
  const items = st.timeline(m.sessions.s);
  assert.deepEqual(items.map((i) => i.type), ['user', 'text', 'diffs', 'actions']);
  assert.deepEqual(items[2].totals, { files: 2, added: 4, removed: 4 });
  assert.equal(items[2].rows.length, 2);
});

test('timeline: пустая сессия — пустая лента; инструмент без ответа агента не пропадает', () => {
  assert.deepEqual(st.timeline(run([ev('session_created', { name: 'Т', agent: 'a' }, 0)]).sessions.s), []);
  const m = run([ev('session_created', { name: 'Т', agent: 'a' }, 0), ev('tool_call', { id: 'c', title: 'x', kind: 'read', status: 'pending', turn: 'нет' }, 1)]);
  assert.deepEqual(st.timeline(m.sessions.s).map((i) => i.type), ['work']);
});

// ---- безопасный разбор текста ---------------------------------------------------------------

test('inlineSpans: код в обратных кавычках отделяется, одиночная кавычка остаётся символом', () => {
  assert.deepEqual(st.inlineSpans('вызови `foo()` дважды'), [
    { text: 'вызови ', code: false }, { text: 'foo()', code: true }, { text: ' дважды', code: false },
  ]);
  assert.deepEqual(st.inlineSpans('без кода'), [{ text: 'без кода', code: false }]);
  assert.deepEqual(st.inlineSpans('одна ` кавычка'), [{ text: 'одна ` кавычка', code: false }]);
  assert.deepEqual(st.inlineSpans(''), []);
  assert.deepEqual(st.inlineSpans('`<b>x</b>`'), [{ text: '<b>x</b>', code: true }]);
});

test('paragraphs: абзацы по пустой строке, маркированные и нумерованные списки', () => {
  assert.deepEqual(st.paragraphs(''), []);
  assert.deepEqual(st.paragraphs('один\nв две строки\n\nвторой'), [
    { type: 'p', text: 'один\nв две строки' }, { type: 'p', text: 'второй' },
  ]);
  assert.deepEqual(st.paragraphs('Пункты:\n- а\n- б\nитог'), [
    { type: 'p', text: 'Пункты:' }, { type: 'ul', items: ['а', 'б'] }, { type: 'p', text: 'итог' },
  ]);
  assert.deepEqual(st.paragraphs('1. раз\n2. два'), [{ type: 'ol', items: ['раз', 'два'] }]);
  assert.deepEqual(st.paragraphs('<img src=x onerror=1>'), [{ type: 'p', text: '<img src=x onerror=1>' }]);
});

// ---- подписи и числа ------------------------------------------------------------------------

test('usagePercent и usageLevel: округление, зажим 0..100, красный от 90', () => {
  assert.equal(st.usagePercent(null), 0);
  assert.equal(st.usagePercent({ used: 76000, size: 200000 }), 38);
  assert.equal(st.usagePercent({ used: 300, size: 200 }), 100);
  assert.equal(st.usagePercent({ used: 1, size: 3 }), 33);
  assert.equal(st.usageLevel(89), 'normal');
  assert.equal(st.usageLevel(90), 'high');
  assert.equal(st.usageLevel(100), 'high');
});

test('tokenParts: единицы, тысячи и миллионы', () => {
  assert.deepEqual(st.tokenParts(950), { value: 950, unit: '' });
  assert.deepEqual(st.tokenParts(76400), { value: 76, unit: 'k' });
  assert.deepEqual(st.tokenParts(1_250_000), { value: 1.3, unit: 'm' });
});

test('durationLabel: две старшие единицы, нули в начале не показываются', () => {
  assert.deepEqual(st.durationLabel(12_000), [[12, 's']]);
  assert.deepEqual(st.durationLabel(96_000), [[1, 'm'], [36, 's']]);
  assert.deepEqual(st.durationLabel(3_720_000), [[1, 'h'], [2, 'm']]);
  assert.deepEqual(st.durationLabel(((3 * 24 + 7) * 60 + 5) * 60_000), [[3, 'd'], [7, 'h']]);
  assert.deepEqual(st.durationLabel(-5), [[0, 's']]);
  assert.deepEqual(st.durationLabel(0), [[0, 's']]);
});

test('agoParts: только что, минуты, часы, дни', () => {
  const now = 10_000_000_000;
  assert.deepEqual(st.agoParts(now - 20_000, now), { unit: 'now', n: 0 });
  assert.deepEqual(st.agoParts(now + 5000, now), { unit: 'now', n: 0 });
  assert.deepEqual(st.agoParts(now - 5 * 60_000, now), { unit: 'min', n: 5 });
  assert.deepEqual(st.agoParts(now - 3 * 3_600_000, now), { unit: 'hour', n: 3 });
  assert.deepEqual(st.agoParts(now - 2 * 86_400_000, now), { unit: 'day', n: 2 });
});

test('fileParts: имя и путь-пояснение, обратные косые превращаются в прямые', () => {
  assert.deepEqual(st.fileParts('src/web/app.js'), { dir: 'src/web', name: 'app.js' });
  assert.deepEqual(st.fileParts('readme.md'), { dir: '', name: 'readme.md' });
  assert.deepEqual(st.fileParts('a\\b\\c.txt'), { dir: 'a/b', name: 'c.txt' });
});

test('тема: нормализация и цикл система -> светлая -> тёмная', () => {
  assert.equal(st.normalizeTheme('dark'), 'dark');
  assert.equal(st.normalizeTheme('light'), 'light');
  assert.equal(st.normalizeTheme('system'), 'system');
  assert.equal(st.normalizeTheme('что-то'), 'system');
  assert.equal(st.normalizeTheme(null), 'system');
  assert.equal(st.nextTheme('system'), 'light');
  assert.equal(st.nextTheme('light'), 'dark');
  assert.equal(st.nextTheme('dark'), 'system');
  assert.equal(st.nextTheme('мусор'), 'light');
  assert.equal(typeof st.THEME_KEY, 'string');
});

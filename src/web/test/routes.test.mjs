// Режимы работы по методике (задача 192p): модель состояния, счёт «N из M», сигналы, события в состоянии страницы, заглушка.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ROUTES, DEFAULT_ROUTE, INTERACTIVE_STATE, STEP_ICON, STEP_STATE_KEY, normalizeRoute, routeName, routeDescription, parseRouteState,
  stepCounter, counterText, stepToSkip, showStrip, stripActions, subtaskPercent, subtaskProgressText, routeSignal,
  subtaskCountText, showSubtasks, taskHeading, subtaskActions, hasSubtaskActions, bannerCount, subtaskNotes,
  commitsText, filesText, mergeLabel, diffTotals, finishPrompt, readyPrompt, overlapPrompt, parseWhere, whereText, wipStalePrompt,
} from '../routes.js';
import { S } from '../strings.js';
import { initialModel, reduce, KINDS, makeEvent, nextStep } from '../state.js';
import { createMockServer, INITIAL_JOURNAL, routeStateInput, editTask } from '../mock.js';
import { timeline } from '../state.js';

const view = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

const steps = (...states) => states.map((state, i) => ({ n: i + 1, title: `шаг ${i + 1}`, state }));

test('четыре режима по порядку, у каждого название и описание из strings.js; по умолчанию интерактивный', () => {
  assert.deepEqual(ROUTES.map((r) => r.id), ['interactive', 'fast', 'full', 'planning']);
  assert.equal(DEFAULT_ROUTE, 'interactive');
  assert.equal(routeName('interactive'), 'Интерактивный');
  assert.equal(routeName('fast'), 'Быстрая задача');
  assert.equal(routeName('full'), 'Полный путь');
  assert.equal(routeName('planning'), 'Планирование');
  for (const r of ROUTES) {
    assert.ok(S[r.nameKey] && S[r.descKey], r.id);
    assert.ok(!routeDescription(r.id).includes('\n'), 'описание в одну строку');
  }
  assert.deepEqual(ROUTES.map((r) => r.hasSteps), [false, true, true, true]);
});

test('normalizeRoute: неизвестное значение — интерактивный', () => {
  assert.equal(normalizeRoute('full'), 'full');
  for (const bad of ['', 'x', null, undefined, 3, {}]) assert.equal(normalizeRoute(bad), 'interactive');
});

test('parseRouteState: чистит payload; у interactive шагов нет, а задача (сессия в git) остаётся', () => {
  assert.deepEqual(parseRouteState(undefined), INTERACTIVE_STATE);
  const inter = parseRouteState({ route: 'interactive', steps: steps('done'), running: true, task: { id: 'a', number: 7, title: 'b', branch: 'task/a', subtasks: [] } });
  assert.deepEqual([inter.route, inter.steps, inter.running], ['interactive', [], false]);
  assert.deepEqual([inter.task.id, inter.task.number, inter.task.branch], ['a', '007', 'task/a']);
  const rs = parseRouteState({
    route: 'full', running: true,
    steps: [{ n: 1, title: 'a', state: 'done' }, { title: 'b', state: 'странное' }, 5, { n: 3, title: 7, state: 'running' }],
    task: { id: '192p', title: 'T', subtasks: [{ n: 1, title: 's', state: 'running', done: 9, total: 5, items: [{ text: 'x', done: true }, 3] }, { title: 'p' }] },
  });
  assert.equal(rs.route, 'full');
  assert.equal(rs.running, true);
  assert.deepEqual(rs.steps, [{ n: 1, title: 'a', state: 'done' }, { n: 2, title: 'b', state: 'pending' }, { n: 3, title: '', state: 'running' }]);
  assert.equal(rs.task.subtasks[0].done, 5, 'done не больше total');
  assert.deepEqual(rs.task.subtasks[0].items, [{ text: 'x', done: true }]);
  assert.deepEqual(rs.task.subtasks[1], {
    n: 2, title: 'p', state: 'planned', done: 0, total: 0, items: [], branch: '', worktree: '', merged: false, mergedInto: '',
    parallel: false, waitsFor: 0, queued: false, touches: [], merging: false, needsOwner: false, ownerText: '',
  });
});

test('подзадача без присланных чисел считается по чекбоксам', () => {
  const rs = parseRouteState({ route: 'fast', steps: [], task: { id: 'x', title: 't', subtasks: [{ n: 1, items: [{ text: 'a', done: true }, { text: 'b', done: false }, { text: 'c', done: true }] }] } });
  assert.deepEqual([rs.task.subtasks[0].done, rs.task.subtasks[0].total], [2, 3]);
});

test('счётчик «N из M»: готовые и пропущенные из всех', () => {
  const s = steps('done', 'done', 'skipped', 'running', 'pending', 'pending', 'pending');
  assert.deepEqual(stepCounter(s), { done: 3, total: 7 });
  assert.equal(counterText(s), '3 из 7');
  assert.equal(counterText([]), '0 из 0');
});

test('какой шаг пропустит кнопка: выполняемый, иначе первый ожидающий, иначе никакой', () => {
  assert.equal(stepToSkip(steps('done', 'running', 'pending')), 2);
  assert.equal(stepToSkip(steps('done', 'pending', 'pending')), 2);
  assert.equal(stepToSkip(steps('done', 'skipped')), null);
});

test('кнопки полосы: прогнать — когда не идёт и есть ожидающие; остановить — когда идёт; полоса — только у режимов с шагами', () => {
  const idle = parseRouteState({ route: 'full', steps: steps('done', 'pending'), running: false });
  assert.deepEqual(stripActions(idle), { run: true, skip: true, stop: false });
  const going = parseRouteState({ route: 'full', steps: steps('done', 'running', 'pending'), running: true });
  assert.deepEqual(stripActions(going), { run: false, skip: true, stop: true });
  const over = parseRouteState({ route: 'full', steps: steps('done', 'done'), running: false });
  assert.deepEqual(stripActions(over), { run: false, skip: false, stop: false });
  assert.deepEqual(stripActions(null), { run: false, skip: false, stop: false });
  assert.equal(showStrip(idle), true);
  assert.equal(showStrip(INTERACTIVE_STATE), false);
  assert.equal(showStrip(parseRouteState({ route: 'full', steps: [] })), false);
  assert.equal(showStrip(null), false);
});

test('подзадачи: процент и подпись done/total', () => {
  assert.equal(subtaskPercent({ done: 3, total: 5 }), 60);
  assert.equal(subtaskPercent({ done: 0, total: 4 }), 0);
  assert.equal(subtaskPercent({ done: 0, total: 0 }), 0);
  assert.equal(subtaskPercent({ done: 9, total: 5 }), 100);
  assert.equal(subtaskProgressText({ done: 3, total: 5 }), '3/5');
});

test('сигналы страницы серверу: форма по контракту', () => {
  assert.deepEqual(routeSignal.set('fast'), { kind: 'session_route', input: { route: 'fast' } });
  assert.deepEqual(routeSignal.set('мусор'), { kind: 'session_route', input: { route: 'interactive' } });
  assert.deepEqual(routeSignal.run(), { kind: 'route_run', input: {} });
  assert.deepEqual(routeSignal.skip(4), { kind: 'route_skip', input: { step: 4 } });
  assert.deepEqual(routeSignal.stop(), { kind: 'route_stop', input: {} });
  assert.deepEqual(routeSignal.subtaskNew(), { kind: 'route_subtask_new', input: {} });
  assert.deepEqual(routeSignal.subtaskSame(), { kind: 'route_subtask_same', input: {} });
  assert.deepEqual(routeSignal.subtaskWorktree(2), { kind: 'route_subtask_worktree', input: { n: 2 } });
  assert.deepEqual(routeSignal.subtaskDone(3), { kind: 'route_subtask_done', input: { n: 3 } });
  assert.deepEqual(routeSignal.newTask(), { kind: 'route_new_task', input: {} });
});

// ---- задача: номер, ветка, дерево, подзадачи

const taskRaw = (extra = {}) => ({
  id: 't', number: '007', title: 'Уборка', branch: 'task/007', worktree: 'C:/work/wt/007', suggest_new_task: false, subtasks: [], ...extra,
});

test('задача: number, branch, worktree, suggest_new_task; у подзадачи branch, worktree, merged, merged_into', () => {
  const rs = parseRouteState({
    route: 'interactive',
    task: taskRaw({
      suggest_new_task: true,
      subtasks: [{ n: 1, title: 'a', branch: 'b1', worktree: 'w1', merged: true }, { n: 2, title: 'b', merged_into: 1 }, { n: 3, title: 'c', merged_into: 'x', merged: 'да' }],
    }),
  });
  const task = rs.task;
  assert.deepEqual([task.number, task.branch, task.worktree, task.suggestNewTask], ['007', 'task/007', 'C:/work/wt/007', true]);
  assert.deepEqual(task.subtasks.map((x) => [x.branch, x.worktree, x.merged, x.mergedInto]), [['b1', 'w1', true, ''], ['', '', false, '1'], ['', '', false, 'x']]);
  assert.equal(parseRouteState({ route: 'interactive', task: taskRaw({ suggest_new_task: 1 }) }).task.suggestNewTask, false, 'только true');
});

test('заголовок задачи «Задача NNN · название»; число number дополняется нулями до трёх цифр', () => {
  assert.equal(taskHeading(parseRouteState({ route: 'interactive', task: taskRaw() }).task), 'Задача 007 · Уборка');
  assert.equal(taskHeading(parseRouteState({ route: 'interactive', task: taskRaw({ number: 12 }) }).task), 'Задача 012 · Уборка');
  assert.equal(taskHeading(parseRouteState({ route: 'interactive', task: taskRaw({ number: '', id: '' }) }).task), 'Уборка');
});

test('подзадач словами по-русски', () => {
  const words = [1, 2, 4, 5, 11, 12, 21, 22, 25].map(subtaskCountText);
  assert.deepEqual(words, ['1 подзадача', '2 подзадачи', '4 подзадачи', '5 подзадач', '11 подзадач', '12 подзадач', '21 подзадача', '22 подзадачи', '25 подзадач']);
});

test('меню «⋯» подзадачи: что доступно', () => {
  const sub = (extra) => parseRouteState({ route: 'interactive', task: taskRaw({ subtasks: [{ n: 1, ...extra }] }) }).task.subtasks[0];
  assert.deepEqual(subtaskActions(sub({ state: 'running' })), { worktree: true, done: true, same: true, fresh: true });
  assert.deepEqual(subtaskActions(sub({ state: 'planned', worktree: 'w' })), { worktree: false, done: true, same: false, fresh: false });
  assert.deepEqual(subtaskActions(sub({ state: 'done', worktree: 'w', merged: true })), { worktree: false, done: false, same: false, fresh: false });
  assert.equal(hasSubtaskActions(sub({ state: 'done', worktree: 'w', merged: true })), false);
  assert.equal(hasSubtaskActions(sub({ state: 'done' })), true);
});

test('баннер «Задача разрослась»: только по suggest_new_task и пока владелец не нажал «Продолжить» на этом числе подзадач', () => {
  const rs = (suggest, n) => parseRouteState({ route: 'interactive', task: taskRaw({ suggest_new_task: suggest, subtasks: Array.from({ length: n }, (_, i) => ({ n: i + 1 })) }) });
  assert.equal(bannerCount(rs(true, 6), undefined), 6);
  assert.equal(bannerCount(rs(true, 6), 6), 0, 'Продолжить запомнено');
  assert.equal(bannerCount(rs(true, 7), 6), 7, 'появилась следующая подзадача — снова');
  assert.equal(bannerCount(rs(false, 6), undefined), 0);
  assert.equal(bannerCount(INTERACTIVE_STATE, undefined), 0);
  assert.equal(bannerCount(null, undefined), 0);
});

test('строки ленты по смене задачи: новая подзадача и «дописана»; без прежней задачи или с другой — нет', () => {
  const task = (subs, id = 't') => parseRouteState({ route: 'interactive', task: taskRaw({ id, subtasks: subs }) }).task;
  const one = task([{ n: 1 }]);
  assert.deepEqual(subtaskNotes(one, task([{ n: 1 }, { n: 2 }])), [{ n: 2, action: 'new' }]);
  assert.deepEqual(subtaskNotes(one, task([{ n: 1, merged_into: 1 }])), [{ n: 1, action: 'extended' }]);
  assert.deepEqual(subtaskNotes(task([{ n: 1, merged_into: 1 }]), task([{ n: 1, merged_into: 1 }])), [], 'уже была');
  assert.deepEqual(subtaskNotes(null, one), []);
  assert.deepEqual(subtaskNotes(one, task([{ n: 1 }, { n: 2 }], 'другая')), []);
});

test('ровно эти ключи строк ленты и меню есть в strings.js', () => {
  for (const key of ['route.note_new', 'route.note_extended', 'route.sub_act_worktree', 'route.sub_act_done', 'route.sub_act_same', 'route.sub_act_new', 'route.sub_merged']) {
    assert.ok(S[key], key);
  }
  assert.equal(S['route.banner'], 'Задача разрослась ({count}). Закрыть и начать новую?');
  assert.equal(S['route.banner_close'], 'Закрыть и начать новую');
  assert.equal(S['route.banner_keep'], 'Продолжить');
});

test('значки и подписи шагов: по одному на каждое состояние, значки из встроенного спрайта', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const state of ['pending', 'running', 'done', 'skipped']) {
    assert.ok(S[STEP_STATE_KEY[state]], state);
    assert.ok(html.includes(`<symbol id="${STEP_ICON[state]}"`), STEP_ICON[state]);
  }
});

// ---- события в состоянии страницы

const ev = (id, trace, step, kind, input) => ({ id, trace, step, kind, input, time: 1000 + step });
const created = ev('c', 's', 0, 'session_created', { name: 'N', agent: 'opencode' });

test('route_state входит в виды событий; у новой сессии режим интерактивный и подсказка «нет route_state»', () => {
  assert.ok(KINDS.includes('route_state'));
  const m = reduce(initialModel(), created);
  assert.equal(m.sessions.s.route, 'interactive');
  assert.deepEqual(m.sessions.s.routeState, INTERACTIVE_STATE);
});

test('редьюсер: route_state кладёт режим и состояние; старый шаг и повтор id игнорируются', () => {
  let m = reduce(initialModel(), created);
  const full = routeStateInput('full', { finished: 3, active: true });
  const e1 = ev('r1', 's', 1, 'route_state', full);
  m = reduce(m, e1);
  assert.equal(m.sessions.s.route, 'full');
  assert.equal(m.sessions.s.routeState.steps.length, 7);
  assert.equal(m.sessions.s.routeState.task.subtasks.length, 2);
  assert.equal(reduce(m, e1), m, 'повтор id — тот же объект');
  const stale = reduce(m, ev('r0', 's', 1, 'route_state', routeStateInput('interactive')));
  assert.equal(stale.sessions.s.route, 'full', 'тот же шаг, другой id — устарело');
  const back = reduce(m, ev('r2', 's', 2, 'route_state', routeStateInput('interactive')));
  assert.equal(back.sessions.s.route, 'interactive');
  assert.deepEqual(back.sessions.s.routeState.steps, []);
  assert.equal(back.sessions.s.routeState.task, null);
});

test('редьюсер: новая подзадача и «дописана» дают строки ленты «подзадача N: …»; повтор события строк не множит', () => {
  const raw = (subs) => routeStateInput('fast', { task: taskRaw({ subtasks: subs }) });
  let m = reduce(initialModel(), created);
  m = reduce(m, ev('r1', 's', 1, 'route_state', raw([{ n: 1, title: 'a', state: 'running', done: 0, total: 1 }])));
  assert.equal(m.sessions.s.messages.length, 0, 'первое состояние строк не даёт');
  const second = ev('r2', 's', 2, 'route_state', raw([{ n: 1, title: 'a', state: 'done', done: 1, total: 1 }, { n: 2, title: 'b', state: 'running' }]));
  m = reduce(m, second);
  m = reduce(m, ev('r3', 's', 3, 'route_state', raw([{ n: 1, state: 'done' }, { n: 2, state: 'running', merged_into: 1 }])));
  assert.equal(reduce(m, second), m);
  const items = timeline(m.sessions.s).filter((x) => x.type === 'routenote');
  assert.deepEqual(items.map((x) => [x.n, x.action]), [[2, 'new'], [2, 'extended']]);
  assert.equal(new Set(items.map((x) => x.key)).size, 2);
});

test('редьюсер: route_state с неверным режимом не ломает сессию', () => {
  const m = reduce(reduce(initialModel(), created), ev('r1', 's', 1, 'route_state', { route: '???', steps: 'нет' }));
  assert.equal(m.sessions.s.route, 'interactive');
});

// ---- заглушка

function setup() {
  let t = 9_000_000;
  const server = createMockServer({ now: () => t });
  let model = INITIAL_JOURNAL.reduce(reduce, initialModel());
  let n = 0;
  const trace = 'ses-demo-1';
  const send = (kind, input) => {
    const e = makeEvent(kind, trace, nextStep(model, trace), input, { newId: () => `c${(n += 1)}`, now: () => t });
    const entries = server.handle(e);
    return entries.filter((x) => x.event.kind === 'route_state');
  };
  const deliver = (entries, upTo = Infinity) => {
    for (const x of entries.filter((y) => y.delay <= upTo)) model = reduce(model, x.event);
  };
  return { send, deliver, advance: (ms) => { t += ms; }, get: () => model.sessions[trace] };
}

test('журнал-заготовка: сессия «Разбор падающих тестов» — Полный путь, 7 шагов (3 готово, тесты выполняются), 2 подзадачи 3/5 и 0/4', () => {
  const s = INITIAL_JOURNAL.reduce(reduce, initialModel()).sessions['ses-demo-1'];
  assert.equal(s.name, 'Разбор падающих тестов');
  assert.equal(s.route, 'full');
  assert.deepEqual(s.routeState.steps.map((x) => x.state), ['done', 'done', 'done', 'running', 'pending', 'pending', 'pending']);
  assert.deepEqual(s.routeState.steps.map((x) => x.title).slice(0, 4), ['Постановка', 'План', 'Реализация', 'Тесты']);
  assert.deepEqual(s.routeState.task.subtasks.map((x) => [x.done, x.total]), [[3, 5], [0, 4]]);
  assert.equal(counterText(s.routeState.steps), '3 из 7');
  const others = Object.values(INITIAL_JOURNAL.reduce(reduce, initialModel()).sessions).filter((x) => x.id !== 'ses-demo-1');
  assert.ok(others.every((x) => x.route === 'interactive'));
});

test('заглушка: session_route меняет режим, interactive очищает шаги и задачу', () => {
  const { send, deliver, get } = setup();
  deliver(send('session_route', { route: 'fast' }));
  assert.equal(get().route, 'fast');
  assert.equal(get().routeState.steps.length, 4);
  assert.ok(get().routeState.steps.every((x) => x.state === 'pending'));
  deliver(send('session_route', { route: 'interactive' }));
  assert.equal(get().route, 'interactive');
  assert.deepEqual(get().routeState.steps, []);
});

test('заглушка: «Прогнать шаги» двигает состояния по таймеру и заканчивает running=false', () => {
  const { send, deliver, get } = setup();
  const entries = send('route_run', {});
  assert.ok(entries.length >= 4);
  assert.deepEqual(entries.map((x) => x.delay), [...entries.map((x) => x.delay)].sort((a, b) => a - b));
  assert.ok(entries.every((x) => x.tag === 'ses-demo-1#route'), 'метка для снятия остановкой');
  deliver(entries);
  const done = get().routeState;
  assert.equal(done.running, false);
  assert.ok(done.steps.every((x) => x.state === 'done'));
  assert.equal(counterText(done.steps), '7 из 7');
});

test('заглушка: остановка во время прогона оставляет состояние на этот момент и running=false', () => {
  const { send, deliver, advance, get } = setup();
  const run = send('route_run', {});
  deliver(run, 80);
  assert.equal(get().routeState.running, true);
  advance(1300); // первый шаг закончен, второй выполняется
  const stop = send('route_stop', {});
  assert.equal(stop.length, 1);
  deliver(stop);
  const rs = get().routeState;
  assert.equal(rs.running, false);
  assert.deepEqual(rs.steps.map((x) => x.state).slice(0, 5), ['done', 'done', 'done', 'done', 'running']);
});

test('журнал-заготовка: интерактивная задача 007 с веткой и двумя подзадачами (1 — в отдельном дереве и влита); «разрослась» — в другой сессии', () => {
  const m = INITIAL_JOURNAL.reduce(reduce, initialModel());
  const a = m.sessions['ses-demo-2'];
  assert.equal(a.route, 'interactive');
  assert.deepEqual(a.routeState.steps, []);
  assert.equal(taskHeading(a.routeState.task), 'Задача 007 · Уборка временных файлов');
  assert.equal(a.routeState.task.branch, 'task/007-cleanup');
  const [s1, s2] = a.routeState.task.subtasks;
  assert.deepEqual([s1.worktree !== '', s1.merged, s2.worktree, s2.merged], [true, true, '', false]);
  const b = m.sessions['ses-demo-4'].routeState;
  assert.equal(b.task.suggestNewTask, true);
  assert.equal(bannerCount(b, undefined), 6);
});

test('заглушка: сигналы подзадач — новая, дописать, в дерево, готово и влить, закрыть задачу', () => {
  const task = parseRouteState({ route: 'interactive', task: editTask(routeStateInput('full').task, 'route_subtask_same') }).task;
  assert.equal(task.subtasks[0].mergedInto, '1');
  const base = routeStateInput('full').task;
  const added = editTask(base, 'route_subtask_new');
  assert.deepEqual(added.subtasks.map((x) => [x.n, x.state]), [[1, 'done'], [2, 'planned'], [3, 'running']]);
  assert.equal(editTask(base, 'route_subtask_worktree', { n: 2 }).subtasks[1].worktree, 'C:/work/wt/192-2');
  const merged = editTask(base, 'route_subtask_done', { n: 1 }).subtasks[0];
  assert.deepEqual([merged.state, merged.done, merged.merged], ['done', 5, true]);
  const fresh = editTask(base, 'route_new_task');
  assert.deepEqual([fresh.number, fresh.subtasks.length, fresh.suggest_new_task], ['193', 0, false]);
  assert.equal(base.subtasks[0].state, 'running', 'исходная задача не меняется');
  const { send, deliver, get } = setup();
  deliver(send('route_subtask_new', {}));
  assert.equal(get().routeState.task.subtasks.length, 3);
  assert.ok(timeline(get()).some((x) => x.type === 'routenote' && x.action === 'new' && x.n === 3));
  deliver(send('route_subtask_done', { n: 1 }));
  assert.equal(get().routeState.task.subtasks[0].merged, true);
  deliver(send('route_new_task', {}));
  assert.equal(get().routeState.task.number, '193');
  assert.equal(get().routeState.steps.length, 7, 'шаги режима задача не трогает');
});

// ---- окончание задачи, пересечения, метки

const taskOf = (extra) => parseRouteState({ route: 'interactive', task: taskRaw(extra) }).task;

test('задача: state, unmerged_commits, finish, diff, overlap; у подзадачи parallel, merging, needs_owner', () => {
  const task = taskOf({
    state: 'ready', unmerged_commits: 2, finish: true,
    diff: { files: [{ path: 'a.js', added: 3, removed: 1 }, { path: '', added: 1 }, 7] },
    overlap: { n: 2, with: 1, files: ['a.js', 5], seconds: 20 },
    subtasks: [{ n: 1, parallel: true, merging: true }, { n: 2, state: 'merging' }, { n: 3, needs_owner: 'решите конфликт' }, { n: 4, needs_owner: true, needs_owner_text: 'нужно слово' }],
  });
  assert.deepEqual([task.state, task.unmergedCommits, task.finish], ['ready', 2, true]);
  assert.deepEqual(task.diff.files, [{ path: 'a.js', added: 3, removed: 1 }]);
  assert.deepEqual(task.overlap, { n: 2, with: 1, files: ['a.js'], seconds: 20 });
  assert.deepEqual(task.subtasks.map((x) => [x.parallel, x.merging, x.needsOwner, x.ownerText]), [
    [true, true, false, ''], [false, true, false, ''], [false, false, true, 'решите конфликт'], [false, false, true, 'нужно слово']]);
  assert.equal(task.subtasks[1].state, 'running', 'merging — работа идёт');
  const bare = taskOf({});
  assert.deepEqual([bare.state, bare.unmergedCommits, bare.finish, bare.overlap, bare.diff.files], ['active', 0, false, null, []]);
  assert.equal(taskOf({ state: 'странно' }).state, 'active');
  assert.equal(taskOf({ overlap: { n: 1, with: 2 } }).overlap.seconds, 30, 'по умолчанию 30 с');
});

test('метка списка сессий: «готово к влитию», «не влито: N коммитов»; у влитой нет', () => {
  assert.equal(mergeLabel(null), null);
  assert.deepEqual(mergeLabel(taskOf({ state: 'ready', unmerged_commits: 2 })), { kind: 'ready', text: 'готово к влитию' });
  assert.deepEqual(mergeLabel(taskOf({ state: 'kept', unmerged_commits: 2 })), { kind: 'unmerged', text: 'не влито: 2 коммита' });
  assert.equal(mergeLabel(taskOf({ state: 'active', unmerged_commits: 5 })).text, 'не влито: 5 коммитов');
  assert.equal(mergeLabel(taskOf({ state: 'kept', unmerged_commits: 0 })), null);
  assert.equal(mergeLabel(taskOf({ state: 'done', unmerged_commits: 3 })), null);
  assert.deepEqual([1, 2, 5, 11, 21].map(commitsText), ['1 коммит', '2 коммита', '5 коммитов', '11 коммитов', '21 коммит']);
  assert.deepEqual([1, 3, 7].map(filesText), ['1 файл', '3 файла', '7 файлов']);
});

test('карточки: «Закончить задачу» пока шаги не пошли, «Задача готова» по state=ready, пересечение по overlap; сводка diff', () => {
  assert.equal(finishPrompt(taskOf({ finish: true })), true);
  assert.equal(finishPrompt(taskOf({ finish: true, state: 'finishing' })), false);
  assert.equal(finishPrompt(taskOf({ finish: true, state: 'ready' })), false);
  assert.equal(finishPrompt(taskOf({})), false);
  assert.equal(finishPrompt(null), false);
  assert.equal(readyPrompt(taskOf({ state: 'ready' })), true);
  assert.equal(readyPrompt(taskOf({})), false);
  assert.equal(overlapPrompt(taskOf({})), null);
  assert.equal(overlapPrompt(taskOf({ overlap: { n: 2, with: 1 } })).n, 2);
  const diff = taskOf({ diff: { files: [{ path: 'a', added: 5, removed: 1 }, { path: 'b', added: 2, removed: 4 }] } }).diff;
  assert.deepEqual(diffTotals(diff), { files: 2, added: 7, removed: 5 });
  assert.deepEqual(diffTotals(null), { files: 0, added: 0, removed: 0 });
});

test('новые сигналы: слить, тесты, удалить дерево, Worktree, параллельно, выбор дерева; «оставить» и «публикации» нет', () => {
  assert.deepEqual(routeSignal.merge(), { kind: 'route_merge', input: {} });
  assert.deepEqual(routeSignal.testsRun(), { kind: 'route_tests_run', input: {} });
  assert.deepEqual(routeSignal.treeDrop(true), { kind: 'route_tree_drop', input: { force: true } });
  assert.deepEqual(routeSignal.treeDrop(), { kind: 'route_tree_drop', input: { force: false } });
  assert.deepEqual(routeSignal.worktree(false), { kind: 'session_worktree', input: { on: false } });
  assert.equal(routeSignal.keep, undefined);
  assert.equal(routeSignal.publish, undefined);
  assert.deepEqual(routeSignal.subtaskParallel(2, true), { kind: 'route_subtask_parallel', input: { n: 2, on: true } });
  assert.deepEqual(routeSignal.subtaskParallel(2, 'да'), { kind: 'route_subtask_parallel', input: { n: 2, on: false } });
  assert.deepEqual(routeSignal.subtaskChoose(2, 'shared'), { kind: 'route_subtask_choose', input: { n: 2, tree: 'shared' } });
  assert.deepEqual(routeSignal.subtaskChoose(2, 'own'), { kind: 'route_subtask_choose', input: { n: 2, tree: 'own' } });
  assert.deepEqual(routeSignal.subtaskChoose(2, 'мусор'), { kind: 'route_subtask_choose', input: { n: 2, tree: 'own' } }, 'по умолчанию — отдельное дерево');
});

test('журнал-заготовка: s1 — пересечение 2 с 1; s2 — готова с diff; s3 — просьба закончить; s4 — конфликт и нужен владелец', () => {
  const m = INITIAL_JOURNAL.reduce(reduce, initialModel());
  const task = (id) => m.sessions[id].routeState.task;
  assert.deepEqual([task('ses-demo-1').overlap.n, task('ses-demo-1').overlap.with, task('ses-demo-1').subtasks[1].parallel], [2, 1, true]);
  assert.equal(readyPrompt(task('ses-demo-2')), true);
  assert.equal(task('ses-demo-2').diff.files.length, 3);
  assert.equal(mergeLabel(task('ses-demo-2')).kind, 'ready');
  assert.equal(finishPrompt(task('ses-demo-3')), true);
  assert.equal(mergeLabel(task('ses-demo-3')).text, 'не влито: 3 коммита');
  const subs = task('ses-demo-4').subtasks;
  assert.equal(subs[4].merging, true);
  assert.equal(subs[5].needsOwner, true);
  assert.match(subs[5].ownerText, /Конфликт/);
});

test('заглушка: «Закончить» — быстрый маршрут и прогон ведут задачу finishing → ready; затем «Слить в main»', () => {
  let t = 9_000_000;
  const server = createMockServer({ now: () => t });
  let model = INITIAL_JOURNAL.reduce(reduce, initialModel());
  const trace = 'ses-demo-3';
  let n = 0;
  const send = (kind, input, upTo = Infinity) => {
    const e = makeEvent(kind, trace, nextStep(model, trace), input, { newId: () => `f${(n += 1)}`, now: () => t });
    const entries = server.handle(e);
    for (const x of entries.filter((y) => y.delay <= upTo)) model = reduce(model, x.event);
    return entries;
  };
  const deliverRest = (entries) => { for (const x of entries) model = reduce(model, x.event); };
  const task = () => model.sessions[trace].routeState.task;
  send('session_route', { route: 'fast' });
  assert.equal(task().finish, true, 'задача пережила смену режима');
  const run = send('route_run', {}, 80);
  assert.equal(task().state, 'finishing');
  assert.equal(task().finish, false);
  assert.equal(finishPrompt(task()), false);
  assert.equal(model.sessions[trace].routeState.running, true, 'прогон идёт');
  deliverRest(run);
  assert.equal(model.sessions[trace].routeState.running, false, 'после доставки всего плана прогон кончен');
  assert.ok(run.length >= 5);
  assert.equal(task().state, 'ready');
  assert.ok(task().diff.files.length > 0);
  assert.equal(mergeLabel(task()).kind, 'ready');
  send('route_merge', {});
  assert.deepEqual([task().state, task().unmergedCommits, mergeLabel(task())], ['done', 0, null]);
});

test('заглушка: «параллельно» и выбор дерева при пересечении', () => {
  const { send, deliver, get } = setup();
  assert.equal(get().routeState.task.overlap.n, 2);
  deliver(send('route_subtask_parallel', { n: 1, on: true }));
  assert.equal(get().routeState.task.subtasks[0].parallel, true);
  deliver(send('route_subtask_choose', { n: 2, tree: 'own' }));
  assert.equal(get().routeState.task.overlap, null);
  assert.equal(get().routeState.task.subtasks[1].worktree, 'C:/work/wt/192-2');
});

test('проводка: карточки над полем, метка в списке, напоминание при открытии, обратный отсчёт 30 с', () => {
  for (const name of ['onRouteFinish', 'onRouteMerge', 'onRouteTestsRun', 'onRouteTreeDrop', 'onRouteSubtaskParallel', 'onRouteSubtaskChoose', 'onNotice']) {
    assert.match(app, new RegExp(`${name}\\(`), name);
  }
  for (const name of ['onRouteFinish', 'onRouteMerge', 'onRouteTestsRun', 'onRouteTreeDrop', 'onRouteSubtaskChoose']) assert.match(view, new RegExp(`handlers\\.${name}\\(`), name);
  assert.match(view, /'data-card': 'finish'/);
  assert.match(view, /'data-card': 'ready'/);
  assert.match(view, /'data-card': 'overlap'/);
  assert.match(view, /'data-card': 'stale'/);
  assert.doesNotMatch(view, /onRouteKeep|onRoutePublish/);
  assert.doesNotMatch(app, /onRouteKeep|onRoutePublish|routeSignal\.(keep|publish)/);
  assert.match(view, /class: 'session-merge'/);
  assert.match(view, /\[data-until\]/);
  assert.match(view, /handlers\.onNotice/);
  assert.match(app, /send\('route_run'/);
  assert.match(css, /\.route-btn\.dark \{[^}]*var\(--fg\)/);
});

test('заглушка: пропуск шага отмечает его пропущенным', () => {
  const { send, deliver, get } = setup();
  deliver(send('route_skip', { step: 5 }));
  assert.equal(get().routeState.steps[4].state, 'skipped');
  assert.equal(get().routeState.running, false);
  assert.equal(counterText(get().routeState.steps), '4 из 7');
});

// ---- проводка страницы

test('проводка: чип режима первым в строке статуса, aria-label «Режим работы», без шеврона; меню вверх слева; страница шлёт сигналы', () => {
  assert.equal(S['route.label'], 'Режим работы');
  assert.match(view, /const routeButton = h\(doc, 'button', \{[^}]*'aria-label': t\('route\.label'\)/);
  assert.match(view, /class: 'composer-status', 'data-empty': 'true' \}, projectButton, worktreeButton, whereNote, routeButton, h\(doc, 'span', \{ class: 'grow' \}\), statusGroup/);
  assert.doesNotMatch(view, /routeButton\.replaceChildren\([^;]*icon\(/, 'шеврона у чипа нет');
  assert.match(view, /menu\.dataset\.side = 'left'/);
  assert.match(css, /\.menu\[data-side="left"\] \{ left: 0; \}/);
  for (const name of ['onRoute', 'onRouteRun', 'onRouteSkip', 'onRouteStop']) {
    assert.match(app, new RegExp(`${name}\\(`), name);
    assert.match(view, new RegExp(`handlers\\.${name}\\(`), name);
  }
});

test('проводка: баннер и меню подзадач шлют сигналы; строка ленты «routenote» рисуется', () => {
  for (const name of ['onRouteSubtaskNew', 'onRouteSubtaskSame', 'onRouteSubtaskWorktree', 'onRouteSubtaskDone', 'onRouteNewTask']) {
    assert.match(app, new RegExp(`${name}\\(`), name);
    assert.match(view, new RegExp(`handlers\\.${name}\\(`), name);
  }
  assert.match(view, /case 'routenote':/);
  assert.match(view, /aria-label': t\('route\.sub_more'\)/);
});

test('полоса шагов и баннер лежат в абсолютном контейнере над полем и не сдвигают макет; цвета только через токены', () => {
  assert.match(css, /\.route-over \{ position: absolute;/);
  const block = css.slice(css.indexOf('режимы работы по методике (задача 192p)'));
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'в стилях режимов нет прямых цветов');
});

test('номер задачи сессии показывается без решётки: в заголовке чата и в строке списка, с подсказкой «Задача N: название»', async () => {
  const fs = await import('node:fs');
  const view = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
  const strings = fs.readFileSync(new URL('../strings.js', import.meta.url), 'utf8');
  assert.match(view, /const taskNo = h\(doc, 'span', \{ class: 'task-no', hidden: true \}\)/);
  assert.match(view, /h\(doc, 'h2', \{ class: 'title' \}, crumb, crumbSep, titleText, taskNo, titleInput\)/);
  assert.match(view, /class: 'task-no', text: taskInfo\.number/);
  assert.match(strings, /'route\.task_no_title': 'Задача \{number\}: \{title\}'/);
  assert.doesNotMatch(strings, /'[^']*#\{number\}/);
  assert.doesNotMatch(view, /text: `#|text: '#'/);
});

test('режим без шагов: подзадач в интерфейсе нет — без списка; строк ленты «подзадача N» нет', () => {
  const subs = [{ n: 1, title: 'привет', state: 'planned', done: 0, total: 0 }, { n: 2, title: 'задай мне вопрос?', state: 'planned', done: 0, total: 0 }];
  const inter = parseRouteState({ route: 'interactive', task: taskRaw({ subtasks: subs }) });
  assert.equal(showSubtasks(inter), false);
  for (const route of ['fast', 'full', 'planning']) assert.equal(showSubtasks(parseRouteState({ route, task: taskRaw({ subtasks: subs }) })), true, route);
  assert.equal(showSubtasks(INTERACTIVE_STATE), false);
  assert.deepEqual(subtaskNotes(inter.task, parseRouteState({ route: 'interactive', task: taskRaw({ subtasks: [...subs, { n: 3 }] }) }).task, true), []);
  const card = view.slice(view.indexOf('function subtasksCard'), view.indexOf('// Вкладки правой колонки'));
  assert.doesNotMatch(card, /parallel|route\.messages/, 'ни «параллельно», ни журнала сообщений');
  assert.match(card, /withSubs && task\.subtasks\.length > 0 \? list : false/);
});

test('задача 192.4: подпись, где идёт работа — прямо в main, прямо в ветке папки, своя ветка wip/…, ветка задачи, черновик', () => {
  const rs = (raw) => parseRouteState({ route: 'interactive', ...raw });
  const sess = (routeState, extra = {}) => ({ draft: false, routeState, ...extra });
  assert.equal(whereText(sess(rs({ where: { kind: 'folder', branch: 'main' } }))), 'работа идёт прямо в main');
  assert.equal(whereText(sess(rs({ where: { kind: 'folder', branch: 'feature/x' } }))), 'работа идёт прямо в ветке feature/x папки проекта');
  assert.equal(whereText(sess(rs({ where: { kind: 'folder', branch: '' } }))), '', 'папка не репозиторий или отсоединённая голова: подписи нет');
  assert.equal(whereText(sess(rs({ where: { kind: 'wip', branch: '', worktree: '/w/repo-ab12' } }))), 'работа идёт в отдельной копии (без ветки)');
  assert.equal(whereText(sess(rs({ task: { id: '007-x', branch: 'task/007-x', worktree: '/w/t' } }))), 'работа идёт в ветке task/007-x');
  assert.equal(whereText({ draft: true, worktree: false }), 'работа пойдёт прямо в папке проекта, без отдельной ветки');
  assert.match(whereText({ draft: true }), /без ветки/);
  assert.equal(whereText(null), '');
  assert.equal(whereText(sess(null)), '');
});

test('задача 192.4: where из route_state вычищается; карточка устаревшей wip-ветки — только у wip без задачи', () => {
  assert.equal(parseWhere(undefined), null);
  assert.deepEqual(parseWhere({ kind: 'wip', branch: '', worktree: 'W', unmerged_commits: 2, work: true, idle_days: 31, stale: true }),
    { kind: 'wip', branch: '', worktree: 'W', unmergedCommits: 2, work: true, idleDays: 31, stale: true });
  assert.equal(parseWhere({ kind: 'junk' }).kind, 'folder');
  const stale = parseRouteState({ route: 'interactive', where: { kind: 'wip', branch: '', stale: true } });
  assert.equal(wipStalePrompt(stale), true);
  assert.equal(wipStalePrompt(parseRouteState({ route: 'interactive', where: { kind: 'wip', branch: '', stale: false } })), false);
  assert.equal(wipStalePrompt(parseRouteState({ route: 'interactive', where: { kind: 'folder', branch: 'main', stale: true } })), false);
  assert.equal(wipStalePrompt(null), false);
  assert.equal(parseRouteState({ route: 'fast' }).where, null);
});

test('задача 192.4: подпись и карточка wip подключены в view.js и стили есть', () => {
  assert.match(view, /whereNote/);
  assert.match(view, /whereText\(session\)/);
  assert.match(view, /wipStalePrompt/);
  assert.match(css, /\.where-note/);
});

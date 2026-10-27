// Закрытие задачи тремя путями, тесты ветки и main, устаревшая сессия, режим «Планирование», новая сессия с Worktree (задача 192).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ROUTES, parseRouteState, routeSignal, finishPrompt, readyPrompt, branchTestsText, mainTestsText, agoText, testsRunnable, stalePrompt, normalizeRoute, mergeLabel,
} from '../routes.js';
import { addDraft, patchDraft, dropDrafts, initialModel, reduce } from '../state.js';
import { t } from '../strings.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const view = read('view.js');
const app = read('app.js');
const css = read('app.css');

const NOW = 10_000_000_000;
const task = (extra = {}) => ({
  id: '007-x', number: '007', title: 'X', branch: 'task/007-x', worktree: 'C:/work/wt/007-x', state: 'active', unmerged_commits: 2, finish: true, subtasks: [], ...extra,
});
const state = (extra = {}) => parseRouteState({ route: 'fast', steps: [], task: task(extra) });

test('карточка «Закончить задачу»: три пути, «Слить в main» первая и главная, с подписью про push; «Оставить в дереве» нет нигде', () => {
  const card = view.slice(view.indexOf("'data-card': 'finish'") - 120, view.indexOf("'data-card': 'stale'"));
  const merge = card.indexOf("t('route.finish_merge')");
  const fast = card.indexOf("t('route.finish_fast')");
  const full = card.indexOf("t('route.finish_full')");
  assert.ok(merge > 0 && merge < fast && fast < full, 'порядок: слить, быстрая, полный путь');
  assert.match(card, /button\(toParent \? t\('route\.finish_merge_parent'\) : t\('route\.finish_merge'\), 'primary', \(\) => handlers\.onRouteMerge\(session\.id\)\)/);
  assert.match(card, /button\(t\('route\.finish_fast'\), '', \(\) => handlers\.onRouteFinish\(session\.id, 'fast'\)\)/);
  assert.match(card, /button\(t\('route\.finish_full'\), '', \(\) => handlers\.onRouteFinish\(session\.id, 'full'\)\)/);
  assert.match(card, /class: 'route-merge-note', text: toParent \? t\('route\.finish_merge_parent_note'\) : t\('route\.finish_merge_note'\)/);
  assert.equal(t('route.finish_merge'), 'Слить в main');
  assert.equal(t('route.finish_merge_note'), 'push в origin/main');
  assert.equal(t('route.finish_fast'), 'Шаги окончания как быстрая задача');
  assert.equal(t('route.finish_full'), 'Шаги окончания как полный путь');
  assert.ok(!/finish_keep|route_keep|route_task_resume|parked/i.test(view + app + read('routes.js') + read('state.js') + read('mock.js') + read('transport.js')), 'парковки в странице нет');
  assert.equal((card.match(/route-btn|button\(/g) || []).length > 0, true);
});

test('слово «Слить в main» — это и есть слово на push: сигнал route_merge уходит одним нажатием, подтверждения второго нет', () => {
  assert.match(app, /onRouteMerge\(trace\) \{ send\(\.\.\.signal\(trace, routeSignal\.merge\(\)\)\); \}/);
  assert.deepEqual(routeSignal.merge(), { kind: 'route_merge', input: {} });
});

test('карточка готовности: «Слить в main» с подписью, без «Оставить»; прежняя «Влить в main и запушить» заменена', () => {
  const ready = view.slice(view.indexOf("'data-card': 'ready'"), view.indexOf("'data-card': 'overlap'"));
  assert.match(ready, /t\('route\.ready_publish'\), 'dark', \(\) => handlers\.onRouteMerge\(session\.id\)/);
  assert.match(ready, /route-merge-note/);
  assert.equal(t('route.ready_publish'), 'Слить в main');
  assert.equal(finishPrompt(state().task), true);
  assert.equal(readyPrompt(state({ state: 'ready' }).task), true);
});

test('тесты ветки: зелёные, красные, не гонялись, не на этом коммите; когда и на каком коммите', () => {
  const run = (o) => parseRouteState({ route: 'fast', task: task({ tests: { branch: o } }) }).task.tests.branch;
  assert.equal(branchTestsText(run({}), NOW), 'Тесты ветки: не гонялись');
  const green = run({ state: 'green', result: 'green', commit: 'abcdef1234', head: 'abcdef1234', at: NOW - 5 * 60000 });
  assert.equal(branchTestsText(green, NOW), 'Тесты ветки: зелёные (5 мин назад, коммит abcdef1)');
  const red = run({ state: 'red', result: 'red', commit: 'abcdef1234', head: 'abcdef1234', at: NOW - 3 * 3600000 });
  assert.equal(branchTestsText(red, NOW), 'Тесты ветки: красные (3 ч назад, коммит abcdef1)');
  const old = run({ state: 'outdated', result: 'green', commit: 'abcdef1234', head: '9999999aaa', at: NOW - 3 * 86400000 });
  const text = branchTestsText(old, NOW);
  assert.match(text, /^Тесты ветки: не гонялись на этом коммите \(последний прогон: зелёные\)/);
  assert.match(text, /3 дн\. назад, коммит abcdef1/);
  assert.match(text, /вершина ветки 9999999/);
  assert.equal(agoText(NOW - 10_000, NOW), 'только что');
  assert.equal(agoText(NOW - 2 * 3600000, NOW), '2 ч назад');
});

test('тесты main: последний прогон CI или «CI: нет данных»', () => {
  const main = (o) => parseRouteState({ route: 'fast', task: task({ tests: { main: o } }) }).task.tests.main;
  assert.equal(mainTestsText(main({}), NOW), 'CI: нет данных');
  assert.equal(mainTestsText(main({ state: 'green', result: 'green', commit: '5a4b3c2d11', at: NOW - 60 * 60000, source: 'ci' }), NOW), 'Тесты main: зелёные (CI, 1 ч назад, коммит 5a4b3c2)');
  assert.match(mainTestsText(main({ state: 'red', result: 'red', commit: '5a4b3c2d11', at: NOW - 60000, source: 'ci' }), NOW), /^Тесты main: красные \(CI, 1 мин назад/);
  assert.equal(mainTestsText(main({ state: 'bogus' }), NOW), 'CI: нет данных');
});

test('кнопка «Прогнать тесты»: есть у задачи с деревом, пока на вершине нет зелёного и прогон не идёт; сигнал route_tests_run', () => {
  const g = { state: 'green', result: 'green', commit: 'a', head: 'a', at: 1 };
  assert.equal(testsRunnable(state().task), true);
  assert.equal(testsRunnable(state({ tests: { branch: g } }).task), false, 'зелёные на вершине: не нужна');
  assert.equal(testsRunnable(state({ tests: { branch: { ...g, state: 'outdated' } } }).task), true, 'прогон был на другом коммите');
  assert.equal(testsRunnable(state({ tests_running: true }).task), false);
  assert.equal(testsRunnable(state({ worktree: '' }).task), false, 'без дерева гонять негде');
  assert.deepEqual(routeSignal.testsRun(), { kind: 'route_tests_run', input: {} });
  assert.match(view, /testsRunnable\(task\) \? button\(t\('route\.tests_run'\), '', \(\) => handlers\.onRouteTestsRun\(session\.id\)\)/);
  assert.match(view, /class: 'route-tests-line'/, 'строки о тестах есть в карточке');
  assert.match(view, /class: 'rsub-tests'/, 'и в панели задачи');
  assert.match(app, /onRouteTestsRun\(trace\) \{ send\(\.\.\.signal\(trace, routeSignal\.testsRun\(\)\)\); \}/);
});

test('устаревшая сессия: карточка спрашивает, «Оставить» убирает её, работа в ветке требует «Удалить вместе с работой»', () => {
  assert.equal(stalePrompt(state({ stale: true, idle_days: 31 }).task), true);
  assert.equal(stalePrompt(state({ stale: false }).task), false);
  assert.equal(stalePrompt(state({ stale: true, worktree: '' }).task), false);
  assert.equal(state({ stale: true, idle_days: 31 }).task.idleDays, 31);
  const card = view.slice(view.indexOf("'data-card': 'stale'") - 200, view.indexOf("'data-card': 'stale'") + 1200);
  assert.match(card, /handlers\.onRouteTreeDrop\(session\.id, true\)/);
  assert.match(card, /handlers\.onRouteTreeDrop\(session\.id, false\)/);
  assert.match(card, /staleKept\.add/);
  assert.equal(t('route.stale_ask', { number: '007' }), 'Удалить дерево и ветку задачи 007?');
  assert.deepEqual(routeSignal.treeDrop(true), { kind: 'route_tree_drop', input: { force: true } });
  assert.equal(mergeLabel(state({ stale: true }).task).kind, 'unmerged');
});

test('режим «Планирование»: четвёртый в списке, у него есть шаги, его понимает разбор состояния', () => {
  assert.deepEqual(ROUTES.map((r) => r.id), ['interactive', 'fast', 'full', 'planning']);
  assert.equal(normalizeRoute('planning'), 'planning');
  const s = parseRouteState({ route: 'planning', steps: [{ n: 1, title: 'Интервью', state: 'running' }, { n: 2, title: 'Формулировка задания', state: 'pending' }], running: true, task: task({ worktree: '', branch: '' }) });
  assert.equal(s.route, 'planning');
  assert.equal(s.steps.length, 2);
  assert.equal(s.running, true);
  assert.equal(s.task.worktree, '');
  assert.equal(t('route.planning'), 'Планирование');
  assert.deepEqual(routeSignal.set('planning'), { kind: 'session_route', input: { route: 'planning' } });
});

test('новая сессия: режим по умолчанию — Интерактивный, Worktree включён; режим и Worktree выбираются до первого сообщения и уходят с ним', () => {
  let m = addDraft(initialModel(), { id: 'd1', agent: 'codex', projectId: 'p1', project: 'crew', folder: 'C:/work/crew', branch: 'main', now: 5 });
  assert.equal(m.sessions.d1.route, 'interactive');
  assert.equal(m.sessions.d1.worktree, true);
  m = patchDraft(m, 'd1', { route: 'planning', worktree: false });
  assert.deepEqual([m.sessions.d1.route, m.sessions.d1.worktree], ['planning', false]);
  assert.match(app, /const input = \{ name: nameFromText\(text\)[^}]*route: normalizeRoute\(draft\.route\), worktree: draft\.worktree !== false \}/);
  assert.match(app, /if \(model\.sessions\[trace\] && model\.sessions\[trace\]\.draft\) \{ model = patchDraft\(model, trace, \{ route: normalizeRoute\(route\) \}\)/);
  assert.match(app, /onDraftWorktree\(trace, on\) \{ model = patchDraft\(model, trace, \{ worktree: on === true \}\)/);
  assert.match(app, /onWorktree\(trace, on\) \{ send\(\.\.\.signal\(trace, routeSignal\.worktree\(on\)\)\); \}/);
  assert.deepEqual(routeSignal.worktree(true), { kind: 'session_worktree', input: { on: true } });
  // настоящая сессия берёт режим из route_state, а черновиком не остаётся
  const real = reduce(dropDrafts(m), { id: 'srv-1', trace: 'd1', step: 0, kind: 'session_created', input: { name: 'Привет', agent: 'codex' }, time: 7 });
  assert.equal(real.sessions.d1.draft, undefined);
});

test('новая сессия: проект выбирается списком (значок папки, галочка у выбранного); под полем проект · Worktree · режим · агент · модель · усилие', () => {
  assert.match(view, /class: 'project-picker', role: 'listbox'/);
  assert.match(view, /icon\(doc, 'i-folder', 'project-icon'\)/);
  assert.match(view, /class: 'project-check' \}, checked \? icon\(doc, 'i-check'\)/);
  assert.match(view, /'aria-selected': checked \? 'true' : 'false'/);
  assert.ok(!/draft-project|draftBar/.test(view), 'прежнего выпадающего списка проекта нет');
  assert.ok(!/Choose environment/.test(view + read('strings.js')), 'выбора окружения нет');
  const row = view.match(/const status = h\(doc, 'div', \{ class: 'composer-status', [^}]*\}, ([^;]*)\);/)[1];
  const order = ['projectButton', 'worktreeButton', 'routeButton', 'statusGroup'].map((n) => row.indexOf(n));
  assert.ok(order.every((x) => x >= 0) && order.every((x, i) => i === 0 || order[i - 1] < x), 'порядок: проект, Worktree, режим, остальное справа');
  assert.match(view, /worktreeButton\.setAttribute\('aria-pressed', String\(treeOn \|\| hasTree\)\)/);
  assert.match(view, /worktreeButton\.disabled = hasTree/);
  assert.match(view, /icon\(doc, 'i-branch'\), h\(doc, 'span', \{ text: t\('route\.worktree'\) \}\)/);
  assert.match(css, /\.project-picker \{/);
  assert.match(css, /\.project-row\[aria-selected="true"\]/);
  assert.match(css, /\.worktree-chip\[aria-pressed="true"\]/);
});

test('удаление сессии с не влитой работой: владелец выбирает, ветку оставить или удалить; без работы — как было', () => {
  const row = read('session-row.js');
  assert.match(row, /handlers\.onDeleteSession\(session\.id, all \? 'drop' : 'keep'\)/);
  assert.match(row, /const work = task && task\.worktree \? task\.unmergedCommits : 0;/);
  assert.match(app, /onDeleteSession\(trace, branch = ''\) \{ send\('session_delete', trace, nextStep\(model, trace\), branch \? \{ branch \} : \{\}\); \}/);
});

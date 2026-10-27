// Распознавание задач (задача 192.2): разбор route_state, строки и кнопки списка, сигналы, карточки и полоса «Распознать задачи».
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCrewTask, EMPTY_CREW, crewSignal, listedItems, singleCard, activeText, rowText, rowActions, problemText, wordHint, recognizeShown } from '../crew-task.js';
import { parseRouteState } from '../routes.js';
import { createCrewTaskUi } from '../crew-task-ui.js';
import { createFakeDocument } from './fake-dom.mjs';

const prop = (extra = {}) => ({ id: 1, kind: 'new', title: 'Кнопка выхода', summary: 'сделать кнопку', extends: 0, extends_title: '', touches: ['src/web/view.js'], state: 'open', with_n: 0, with_files: [], unknown: false, listed: true, choice: '', note: '', ...extra });
const wire = (extra = {}) => ({ proposals: [prop(), prop({ id: 2, kind: 'extend', extends: 3, title: 'Тест' }), prop({ id: 3, listed: false, title: 'Одиночная' })], active: 2, max_active: 3, confirm_word: 'задача', over_word: 'сверх', candidates: 1, ...extra });

test('parseCrewTask: поля хаба ложатся в модель, пустой вход даёт пустое состояние, мусор отбрасывается', () => {
  const crew = parseCrewTask(wire());
  assert.equal(crew.proposals.length, 3);
  assert.equal(crew.proposals[1].extends, 3);
  assert.equal(crew.active, 2);
  assert.equal(crew.maxActive, 3);
  assert.equal(crew.confirmWord, 'задача');
  assert.equal(crew.candidates, 1);
  assert.deepEqual(parseCrewTask({}), EMPTY_CREW);
  assert.deepEqual(parseCrewTask(null), EMPTY_CREW);
  assert.equal(parseCrewTask({ proposals: [5, 'x', prop({ state: 'зря' })] }).proposals[0].state, 'open');
});

test('route_state несёт crew и в интерактивном режиме, и в режиме с шагами', () => {
  assert.equal(parseRouteState({ route: 'interactive', ...wire() }).crew.proposals.length, 3);
  assert.equal(parseRouteState({ route: 'fast', steps: [], ...wire() }).crew.active, 2);
  assert.deepEqual(parseRouteState({ route: 'interactive' }).crew, EMPTY_CREW);
});

test('список: номера идут по порядку списка, одиночная карточка — последняя не из списка', () => {
  const crew = parseCrewTask(wire());
  const items = listedItems(crew);
  assert.deepEqual(items.map((p) => p.number), [1, 2]);
  assert.equal(singleCard(crew).title, 'Одиночная');
  assert.equal(singleCard(parseCrewTask({ proposals: [prop()] })), null);
});

test('строки и кнопки: новая — «В работу», дополняет — «Дополнить K», пересечение и лимит — свои кнопки', () => {
  const crew = parseCrewTask(wire());
  const [a, b] = listedItems(crew);
  assert.equal(rowText(a, 1), '1. Кнопка выхода — отдельная задача — затронет: src/web/view.js');
  assert.match(rowText(b, 2), /дополняет задачу 3/);
  assert.deepEqual(rowActions(a).map((x) => x.action), ['start', 'discuss', 'forget']);
  assert.deepEqual(rowActions(b).map((x) => x.action), ['extend', 'discuss', 'forget']);
  assert.equal(rowActions(b)[0].label, 'Дополнить 3');
  const over = { ...a, state: 'overlap', withN: 1, withFiles: ['src/web/view.js'] };
  assert.deepEqual(rowActions(over).map((x) => x.action), ['wait', 'parallel', 'forget']);
  assert.match(problemText(over, crew), /пересекается с задачей 1 по: src\/web\/view\.js/);
  assert.match(problemText({ ...over, unknown: true, withFiles: [] }, crew), /неизвестны/);
  const limit = { ...a, state: 'limit' };
  assert.deepEqual(rowActions(limit).map((x) => x.action), ['over', 'queue', 'forget']);
  assert.match(problemText(limit, crew), /лимит 3.*«сверх»/);
  assert.deepEqual(rowActions({ ...a, choice: 'discuss' }).map((x) => x.action), ['start', 'forget']);
});

test('слова и счётчик: «в работе N из лимита M», без лимита — «в работе N», подсказка кодового слова по состоянию', () => {
  const crew = parseCrewTask(wire());
  assert.equal(activeText(crew), 'в работе 2 из лимита 3');
  assert.equal(activeText({ ...crew, maxActive: 0 }), 'в работе 2');
  assert.match(wordHint({ state: 'open' }, crew), /слово «задача»/);
  assert.match(wordHint({ state: 'limit' }, crew), /«сверх»/);
  assert.match(wordHint({ state: 'overlap' }, crew), /подождать/);
});

test('сигналы: кнопка карточки, распознавание, быстрый ответ', () => {
  assert.deepEqual(crewSignal.prop(4, 'start'), { kind: 'route_prop', input: { id: 4, action: 'start' } });
  assert.deepEqual(crewSignal.recognize(), { kind: 'route_recognize', input: {} });
  assert.deepEqual(crewSignal.quick('1, 2 — в работу'), { kind: 'route_quick', input: { text: '1, 2 — в работу' } });
  assert.equal(recognizeShown({ id: 's1' }), true);
  assert.equal(recognizeShown({ id: 's1', draft: true }), false);
  assert.equal(recognizeShown(null), false);
});

function mount(extra = {}) {
  const doc = createFakeDocument();
  const log = [];
  const ui = createCrewTaskUi(doc, {
    onCrewProp: (...a) => log.push(['prop', ...a]),
    onCrewRecognize: (...a) => log.push(['recognize', ...a]),
    onCrewQuick: (...a) => log.push(['quick', ...a]),
  });
  const session = { id: 's1', routeState: parseRouteState({ route: 'interactive', ...wire(extra) }) };
  ui.render(session);
  return { doc, ui, log, session };
}

test('полоса и карточки: кнопка «Распознать задачи», строки списка, кнопки строк, одиночная карточка с «Это не задача»', () => {
  const { ui, log } = mount();
  const el = ui.el;
  assert.equal(el.hidden, false);
  const buttons = (root) => root.querySelectorAll('button');
  const byText = (text) => buttons(el).filter((b) => b.textContent === text);
  assert.equal(byText('Распознать задачи').length, 1);
  byText('Распознать задачи')[0].click();
  assert.deepEqual(log.pop(), ['recognize', 's1']);
  assert.equal(el.querySelectorAll('.crew-row').length, 2);
  byText('В работу')[0].click();
  assert.deepEqual(log.pop(), ['prop', 's1', 1, 'start', { mode: 'new', target: 0, agent: '' }]);
  byText('Дополнить 3')[0].click();
  assert.deepEqual(log.pop(), ['prop', 's1', 2, 'extend', { mode: 'extend', target: 3, agent: '' }]);
  byText('Обсудить дальше')[0].click();
  assert.deepEqual(log.pop(), ['prop', 's1', 1, 'discuss']);
  byText('Это не задача')[0].click();
  assert.deepEqual(log.pop(), ['prop', 's1', 3, 'dismiss']);
  assert.match(el.textContent, /в работе 2 из лимита 3/);
  assert.match(el.textContent, /Кандидаты: 1/);
  assert.match(el.textContent, /или напишите слово «задача»/);
});

test('быстрый ответ: поле шлёт текст и очищается, пустое не шлёт; поле переживает перерисовку', () => {
  const { ui, log, session } = mount();
  const quick = ui.el.querySelector('.crew-quick');
  quick.value = '1, 3 — в работу; 2 — забыть';
  const apply = ui.el.querySelectorAll('button').filter((b) => b.textContent === 'Применить')[0];
  apply.click();
  assert.deepEqual(log.pop(), ['quick', 's1', '1, 3 — в работу; 2 — забыть']);
  assert.equal(quick.value, '');
  apply.click();
  assert.equal(log.length, 0);
  quick.value = 'черновик';
  ui.render({ ...session, routeState: parseRouteState({ route: 'interactive', ...wire({ active: 1 }) }) });
  assert.equal(ui.el.querySelector('.crew-quick'), quick);
  assert.equal(quick.value, 'черновик');
});

test('без списка и карточек остаётся только полоса; у черновика ничего нет; панель говорит про кандидатов и «Задач нет»', () => {
  const doc = createFakeDocument();
  const ui = createCrewTaskUi(doc, { onCrewProp() {}, onCrewRecognize() {}, onCrewQuick() {} });
  const empty = { id: 's2', routeState: parseRouteState({ route: 'interactive' }) };
  ui.render(empty);
  assert.equal(ui.el.hidden, false);
  assert.equal(ui.el.querySelectorAll('.route-card').length, 0);
  const panel = ui.panel(empty);
  assert.match(panel.textContent, /Задач нет/);
  assert.match(panel.textContent, /в работе 0 из лимита 0|в работе 0/);
  ui.render({ ...empty, draft: true });
  assert.equal(ui.el.hidden, true);
  assert.equal(ui.panel({ ...empty, draft: true }), false);
  const withCands = { id: 's3', routeState: parseRouteState({ route: 'interactive', candidates: 2, max_active: 3, active: 1 }) };
  assert.match(ui.panel(withCands).textContent, /Кандидаты: 2/);
});

test('панель: подзадачи из списка агента видны и в интерактивном режиме; старый журнал сообщений остаётся счётчиком', async () => {
  const { showSubtasks } = await import('../routes.js');
  const subs = [{ n: 1, title: 'А', state: 'running', done: 0, total: 0, touches: ['a.txt'] }, { n: 2, title: 'Б', state: 'waits', waits_for: 1, done: 0, total: 0 }];
  const crewTask = { id: '001-x', number: '001', title: 'А', subtasks: subs, crew: true };
  const made = parseRouteState({ route: 'interactive', task: crewTask });
  assert.equal(showSubtasks(made), true);
  assert.equal(made.task.subtasks[1].state, 'waits');
  assert.equal(made.task.subtasks[1].waitsFor, 1);
  assert.deepEqual(made.task.subtasks[0].touches, ['a.txt']);
  assert.equal(showSubtasks(parseRouteState({ route: 'interactive', task: { ...crewTask, crew: false } })), false);
  const { subWaitsText } = await import('../crew-task.js');
  assert.equal(subWaitsText(made.task.subtasks[1]), 'ждёт задачу 1');
  assert.equal(subWaitsText({ state: 'waits', waitsFor: 0 }), 'ждёт места под лимитом');
  assert.equal(subWaitsText(made.task.subtasks[0]), '');
});

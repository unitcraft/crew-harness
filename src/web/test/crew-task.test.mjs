// Распознавание задач (задача 192.2): разбор route_state, строки и кнопки списка, сигналы, карточки и полоса «Распознать задачи».
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCrewTask, EMPTY_CREW, crewSignal, listedItems, singleCard, activeText, rowText, rowActions, problemText, wordHint, recognizeShown, applyCounts, applyLabel, applyPlan, tableRows, problemRows } from '../crew-task.js';
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

test('сигналы: кнопка карточки, распознавание', () => {
  assert.deepEqual(crewSignal.prop(4, 'start'), { kind: 'route_prop', input: { id: 4, action: 'start' } });
  assert.deepEqual(crewSignal.recognize(), { kind: 'route_recognize', input: {} });
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
    onCrewApply: (...a) => log.push(['apply', ...a]),
  });
  const session = { id: 's1', routeState: parseRouteState({ route: 'interactive', ...wire(extra) }) };
  ui.render(session);
  return { doc, ui, log, session };
}

test('полоса и таблица: кнопка «Распознать задачи», строка на кандидата, по умолчанию «Обсудить», одиночная карточка с «Это не задача»', () => {
  const { ui, log } = mount();
  const el = ui.el;
  const byText = (text) => el.querySelectorAll('button').filter((b) => b.textContent === text);
  assert.equal(byText('Распознать задачи').length, 1);
  byText('Распознать задачи')[0].click();
  assert.deepEqual(log.pop(), ['recognize', 's1']);
  // таблица: заголовки и две строки, у каждой три переключателя, выбран «Обсудить»
  assert.deepEqual(el.querySelectorAll('th').map((x) => x.textContent), ['№', 'Название', 'Краткое содержание', 'Затронет', 'Решение', 'Способ']);
  const rows = el.querySelectorAll('tbody tr');
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Кнопка выхода/);
  assert.match(rows[0].textContent, /сделать кнопку/);
  assert.match(rows[0].textContent, /src\/web\/view\.js/);
  assert.deepEqual(rows[0].querySelectorAll('input').map((r) => [r.value, r.checked]), [['work', false], ['discuss', true], ['forget', false]]);
  assert.deepEqual(rows[0].querySelectorAll('label').map((l) => l.textContent), ['В работу', 'Обсудить', 'Забыть']);
  assert.equal(rows[0].querySelectorAll('select').length, 0, 'способ виден только у «В работу»');
  assert.equal(el.querySelectorAll('.crew-apply')[0].textContent, 'Применить: 0 в работу · 2 обсудить · 0 забыть');
  assert.equal(el.querySelectorAll('.crew-quick').length, 0, 'текстового быстрого ответа нет');
  // одиночная карточка
  byText('Это не задача')[0].click();
  assert.deepEqual(log.pop(), ['prop', 's1', 3, 'dismiss']);
  assert.match(el.textContent, /в работе 2 из лимита 3/);
  assert.match(el.textContent, /Кандидаты: 1/);
  assert.match(el.textContent, /или напишите слово «задача»/);
});

test('таблица: выбор «В работу» открывает «Способ», подпись кнопки считает, «Применить» шлёт всю таблицу одним вызовом', () => {
  const targets = [{ number: 3, title: 'Старая', session: 's9', epic: false }];
  const { ui, log, session } = mount({ targets });
  const el = ui.el;
  const radio = (row, value) => el.querySelectorAll('tbody tr')[row].querySelectorAll('input').filter((r) => r.value === value)[0];
  const choose = (row, value) => { const r = radio(row, value); r.checked = true; r.dispatchEvent({ type: 'change', target: r }); };
  choose(0, 'work');
  assert.equal(el.querySelectorAll('.crew-apply')[0].textContent, 'Применить: 1 в работу · 1 обсудить · 0 забыть');
  let way = el.querySelectorAll('tbody tr')[0].querySelectorAll('select')[0];
  assert.ok(way, 'у «В работу» есть «Способ»');
  assert.deepEqual(way.querySelectorAll('option').map((o) => o.textContent), ['Отдельная задача', 'Дочерняя задача эпика 3 · Старая', 'Эпик', 'Дополнить 3 · Старая']);
  choose(1, 'forget');
  assert.equal(el.querySelectorAll('.crew-apply')[0].textContent, 'Применить: 1 в работу · 0 обсудить · 1 забыть');
  way = el.querySelectorAll('tbody tr')[0].querySelectorAll('select')[0];
  way.value = 'child:3';
  way.dispatchEvent({ type: 'change', target: way });
  el.querySelectorAll('.crew-apply')[0].click();
  assert.deepEqual(log.pop(), ['apply', 's1', [{ id: 1, action: 'work', mode: 'child', target: 3, agent: '' }, { id: 2, action: 'forget' }]]);
  assert.ok(session);
});

test('таблица: без открытых задач «Способ» — только «Отдельная задача» и «Эпик»; пометка агента про несуществующую задачу не выбирается', () => {
  const { ui } = mount({ proposals: [prop({ id: 1, kind: 'child', epic: 55 }), prop({ id: 2, kind: 'epic', title: 'Большая' })] });
  const el = ui.el;
  const choose = (row) => { const r = el.querySelectorAll('tbody tr')[row].querySelectorAll('input').filter((x) => x.value === 'work')[0]; r.checked = true; r.dispatchEvent({ type: 'change', target: r }); };
  choose(0);
  choose(1);
  const ways = el.querySelectorAll('tbody tr').map((row) => row.querySelectorAll('select')[0]);
  assert.deepEqual(ways[0].querySelectorAll('option').map((o) => o.textContent), ['Отдельная задача', 'Эпик']);
  assert.equal(ways[0].value, 'new:0');
  assert.equal(ways[1].value, 'epic:0', 'пометка «эпик» от агента выбрана');
});

test('сводка и план таблицы: счёт по решениям, способ и агент только у «В работу»; строки с пересечением в таблицу не входят', () => {
  const crew = parseCrewTask({ proposals: [prop({ id: 1 }), prop({ id: 2 }), prop({ id: 3 }), prop({ id: 4, state: 'overlap', with_n: 1 })], targets: [{ number: 7, title: 'Т', session: 's', epic: false }] });
  const rows = tableRows(crew);
  assert.deepEqual(rows.map((p) => p.id), [1, 2, 3]);
  const choices = new Map([[1, 'work'], [3, 'forget']]);
  const counts = applyCounts(rows, choices);
  assert.deepEqual(counts, { work: 1, discuss: 1, forget: 1 });
  assert.equal(applyLabel(counts), 'Применить: 1 в работу · 1 обсудить · 1 забыть');
  assert.deepEqual(applyPlan(rows, choices, new Map([[1, 'epic:0']]), new Map([[1, 'codex']]), crew), [
    { id: 1, action: 'work', mode: 'epic', target: 0, agent: 'codex' }, { id: 2, action: 'discuss' }, { id: 3, action: 'forget' },
  ]);
  const over = problemRows(crew);
  assert.equal(over.length, 1);
});

test('без списка и карточек остаётся только полоса; у черновика ничего нет; панель говорит про кандидатов и «Задач нет»', () => {
  const doc = createFakeDocument();
  const ui = createCrewTaskUi(doc, { onCrewProp() {}, onCrewRecognize() {}, onCrewApply() {} });
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

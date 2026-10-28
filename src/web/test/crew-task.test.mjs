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
  assert.match(wordHint({ state: 'open' }, crew), /со словом «задача»/);
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

test('полоса и таблица: кнопка «Распознать задачи», строка на кандидата, по умолчанию «Обсудить», одиночная карточка с «Только обсуждение»', () => {
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
  byText('Только обсуждение')[0].click();
  assert.deepEqual(log.pop(), ['prop', 's1', 3, 'dismiss']);
  assert.match(el.textContent, /в работе 2 из лимита 3/);
  assert.match(el.textContent, /Кандидаты: 1/);
  assert.doesNotMatch(el.textContent, /или напишите слово/);
  assert.match(byText('В работу').at(-1).getAttribute('title'), /Enter в поле ввода со словом «задача» тоже подтверждает/);
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
  assert.deepEqual(way.querySelectorAll('option').map((o) => o.textContent), ['Отдельная задача', 'Дочерняя задача к 3 · Старая', 'Новый эпик (разделить на части)', 'Дополнить 3 · Старая']);
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
  assert.deepEqual(ways[0].querySelectorAll('option').map((o) => o.textContent), ['Отдельная задача', 'Новый эпик (разделить на части)']);
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

// ---- карточка предложения (задача 192.13): подписи, режим выполнения, эпик с дочерними, кнопки
function mountSingle(extra = {}, deps = {}) {
  const doc = createFakeDocument();
  const log = [];
  const ui = createCrewTaskUi(doc, { onCrewProp: (...a) => log.push(['prop', ...a]), onCrewRecognize() {}, onCrewApply() {} }, deps);
  const crew = { proposals: [prop({ id: 7, listed: false, title: 'Отладчик', kind: 'epic', mode: 'full', reason: 'две независимые части', children: [{ title: 'Фронт', summary: 'страница', touches: ['src/web'], mode: 'fast' }, { title: 'Бек', summary: 'сервер', touches: [], mode: '' }], ...extra })], active: 0, max_active: 3, confirm_word: 'задача', over_word: 'сверх', targets: [{ number: 5, title: 'Своя', session: 's9', epic: false }] };
  const session = { id: 's1', agent: 'codex', routeState: parseRouteState({ route: 'interactive', ...crew }) };
  ui.render(session);
  return { ui, log, session, el: ui.el };
}

test('карточка: подписи «Как оформить / Кто делает / Режим выполнения», фраза «Агент предлагает», нет фразы про кодовое слово', () => {
  const { el } = mountSingle({}, { agents: () => ['codex', 'opencode'] });
  const text = el.textContent;
  assert.match(text, /Агент предлагает: эпик/);
  assert.match(text, /режим: Полный путь \(8 шагов\) — две независимые части/);
  assert.match(text, /Как оформить:/);
  assert.match(text, /Кто делает:/);
  assert.match(text, /Режим выполнения:/);
  assert.doesNotMatch(text, /или напишите слово/);
  const way = el.querySelectorAll('.crew-way')[0];
  assert.deepEqual(way.querySelectorAll('option').map((o) => o.textContent), ['Отдельная задача', 'Дочерняя задача к 5 · Своя', 'Новый эпик (разделить на части)', 'Дополнить 5 · Своя']);
  assert.equal(way.value, 'epic:0', 'выбран вариант агента');
  assert.deepEqual(el.querySelectorAll('.crew-run')[0].querySelectorAll('option').map((o) => o.textContent), ['Супер быстро (малый маршрут, до 30 мин)', 'Быстрая задача (6 шагов)', 'Полный путь (8 шагов)']);
  assert.equal(el.querySelectorAll('.crew-run')[0].value, 'full', 'режим агента выбран');
  assert.equal(el.querySelectorAll('.crew-agent')[0].querySelectorAll('option')[0].textContent, 'этот же агент (codex)');
  assert.match(text, /делится на дочерние/, 'у способа есть пояснение мелким серым');
});

test('карточка: у способа «Дочерняя задача к K» пояснение — «K станет эпиком»; кнопки «В работу» и «Только обсуждение» с подсказками', () => {
  const { el, log } = mountSingle({ kind: 'child', epic: 5, children: [], mode: '', reason: '' });
  assert.match(el.textContent, /задача 5 станет эпиком/);
  const start = el.querySelectorAll('button').filter((b) => b.textContent === 'В работу')[0];
  assert.match(start.getAttribute('title'), /Enter в поле ввода со словом «задача» тоже подтверждает/);
  const talk = el.querySelectorAll('button').filter((b) => b.textContent === 'Только обсуждение')[0];
  assert.equal(talk.getAttribute('title'), 'Задачу не создавать: карточка исчезнет, агент не предложит то же снова');
  talk.click();
  assert.deepEqual(log.pop(), ['prop', 's1', 7, 'dismiss']);
  assert.equal(el.querySelectorAll('button').filter((b) => b.textContent === 'Это не задача').length, 0);
});

test('карточка эпика: дочерние строками с флажками «создать»; «В работу» уходит с режимом и отмеченными частями', () => {
  const { el, log } = mountSingle();
  const kids = el.querySelectorAll('.crew-child');
  assert.equal(kids.length, 2);
  assert.match(kids[0].textContent, /Фронт/);
  assert.match(kids[0].textContent, /режим: Быстрая задача \(6 шагов\)/);
  assert.deepEqual(kids.map((k) => k.querySelectorAll('input')[0].checked), [true, true]);
  // все отмечены: части не перечисляются (создать все), режим агента уходит
  el.querySelectorAll('button').filter((b) => b.textContent === 'В работу')[0].click();
  assert.deepEqual(log.pop(), ['prop', 's1', 7, 'start', { mode: 'epic', target: 0, agent: '', run: 'full', children: '' }]);
  // снять вторую часть: уходит «0»
  const box = el.querySelectorAll('.crew-child')[1].querySelectorAll('input')[0];
  box.click();
  el.querySelectorAll('button').filter((b) => b.textContent === 'В работу')[0].click();
  assert.equal(log.pop()[4].children, '0');
});

test('карточка: владелец меняет режим выполнения — он уходит с кнопкой; сигнал несёт run и children', () => {
  const { el, log } = mountSingle({ kind: 'new', mode: '', reason: '', children: [] });
  assert.equal(el.querySelectorAll('.crew-run')[0].value, 'interactive', 'без предложения агента — «Супер быстро»');
  const run = el.querySelectorAll('.crew-run')[0];
  run.value = 'fast';
  run.dispatchEvent({ type: 'change' });
  el.querySelectorAll('button').filter((b) => b.textContent === 'В работу')[0].click();
  assert.deepEqual(log.pop(), ['prop', 's1', 7, 'start', { mode: 'new', target: 0, agent: '', run: 'fast' }]);
  assert.deepEqual(crewSignal.prop(7, 'start', { mode: 'epic', target: 0, run: 'full', children: '0,1' }), { kind: 'route_prop', input: { id: 7, action: 'start', mode: 'epic', target: 0, run: 'full', children: '0,1' } });
});

test('parseCrewTask: режим, причина и дочерние эпика; неизвестный режим и дочерняя без названия отбрасываются', () => {
  const crew = parseCrewTask({ proposals: [prop({ mode: 'turbo', reason: 'r', children: [{ title: '' }, { title: 'А', mode: 'fast' }, 5] })] });
  assert.equal(crew.proposals[0].mode, '');
  assert.equal(crew.proposals[0].reason, 'r');
  assert.deepEqual(crew.proposals[0].children, [{ title: 'А', summary: '', touches: [], mode: 'fast' }]);
});

test('варианты способа берутся только из targets страницы: чужих задач в списке нет', () => {
  const { el } = mountSingle({ kind: 'new', mode: '', children: [] });
  const labels = el.querySelectorAll('.crew-way')[0].querySelectorAll('option').map((o) => o.textContent);
  assert.equal(labels.filter((l) => /· /.test(l)).length, 2, 'только задача 5 (дочерняя к и дополнить)');
});

// Внимание к сессии (задача 192.14): состояния списка, эвристика вопроса, заголовок вкладки, выключатели уведомлений и звука.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialModel, reduce, timeline } from '../state.js';
import { endsWithQuestion, ownerItemOpen, needsOwnerReason, needsOwner, waitKey, silentMinutes, attention, waitingKeys, pageTitle, SILENT_DEFAULT_MIN } from '../attention.js';
import { createNotifier, BELL_KEY, SOUND_KEY } from '../notify.js';
import { t } from '../strings.js';

const view = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

let n = 0;
const ev = (trace, kind, input = {}, time = 1000) => ({ id: `e${n += 1}`, trace, step: n, kind, input, time });
function session(texts = [], extra = {}) {
  let m = reduce(initialModel(), ev('s1', 'session_created', { name: 'Задача', agent: 'codex' }, 1000));
  m = reduce(m, ev('s1', 'user_message', { turn: 't1', text: 'сделай' }, 2000));
  if (texts.length > 0) {
    for (const x of texts) m = reduce(m, ev('s1', 'agent_chunk', { turn: 't1', text: x }, 3000));
    m = reduce(m, ev('s1', 'agent_done', { turn: 't1' }, 4000));
  }
  return { ...m.sessions.s1, ...extra };
}
const withItems = (items) => ({ routeState: { task: { subtasks: [{ items }] } } });

test('эвристика вопроса: «?», «нужн», «уточните» в последнем абзаце; обычный итог — нет', () => {
  assert.equal(endsWithQuestion('Готово.\n\nКакой вариант выбрать?'), true);
  assert.equal(endsWithQuestion('Нужны целевая версия и объём первого режима.'), true);
  assert.equal(endsWithQuestion('Всё сделано.\n\nПожалуйста, подтвердите слияние'), true);
  assert.equal(endsWithQuestion('Что нужно выбрать?\n\nИтог: правка готова, тесты зелёные.'), false);
  assert.equal(endsWithQuestion('Сделано и проверено.'), false);
  assert.equal(endsWithQuestion(''), false);
});

test('ждёт вас: текст-вопрос, пункт «Владелец …» в чек-листе, форма вопроса, разрешение; обычный конец хода — нет', () => {
  assert.equal(needsOwnerReason(session(['Нужна целевая версия, уточните.'])), 'text');
  assert.equal(needsOwnerReason(session(['Готово.'], withItems([{ text: 'Владелец уточнил версию', done: false }]))), 'checklist');
  assert.equal(needsOwnerReason(session(['Готово.'], withItems([{ text: 'Владелец уточнил версию', done: true }]))), '');
  assert.equal(ownerItemOpen(session([], withItems([{ text: 'Реализация', done: false }]))), false);
  assert.equal(needsOwnerReason(session(['Готово.'])), '');
  assert.equal(needsOwnerReason(session(['Готово.'], { pendingQuestion: { request: 'r1', questions: [] } })), 'question');
  assert.equal(needsOwnerReason(session([], { state: 'permission' })), 'permission');
  assert.equal(needsOwner(session(['Готово?'], { draft: true })), false);
  // ход идёт: вопрос в начатом тексте ещё не повод
  assert.equal(needsOwnerReason(session(['Нужно?'], { state: 'answering' })), '');
});

test('состояния строки списка: идёт, ждёт (мигает, пока не открыта), прочитано, непрочитанное, ошибка, молчит', () => {
  const ask = session(['Нужна версия?']);
  const key = waitKey(ask);
  assert.deepEqual(attention(ask, {}), { state: 'waiting', blink: true, minutes: 0 });
  assert.deepEqual(attention(ask, { acked: key }), { state: 'waiting', blink: false, minutes: 0 });
  assert.equal(attention(session(['Готово.']), { unread: true }).state, 'unread');
  assert.equal(attention(session(['Готово.']), {}).state, 'idle');
  assert.equal(attention(session([], { state: 'error' }), {}).state, 'error');
  const running = session([], { updatedAt: 10 * 60000, turnStartedAt: 10 * 60000 });
  assert.equal(attention(running, { now: 11 * 60000 }).state, 'running');
  assert.deepEqual(attention(running, { now: 16 * 60000 }), { state: 'silent', blink: false, minutes: 6 });
  assert.equal(silentMinutes(running, 16 * 60000, 0), 0, 'настройка 0 выключает «молчит»');
  assert.equal(SILENT_DEFAULT_MIN, 5);
});

test('ждущие сессии считаются без уже открытых; заголовок «(N) …» и мигание', () => {
  const a = session(['Нужна версия?']);
  const b = { ...session(['Готово.']), id: 's2' };
  assert.deepEqual(waitingKeys([a, b], {}), [`s1|${waitKey(a)}`]);
  assert.deepEqual(waitingKeys([a, b], { s1: waitKey(a) }), []);
  assert.equal(pageTitle('Пульт', 0, true, 'Нужен ваш ответ'), 'Пульт');
  assert.equal(pageTitle('Пульт', 2, false, 'Нужен ваш ответ'), '(2) Пульт');
  assert.equal(pageTitle('Пульт', 2, true, 'Нужен ваш ответ'), '(2) ● Нужен ваш ответ');
});

test('полоса «Агент ждёт вашего ответа» идёт в ленте после конца хода с вопросом и не появляется без него', () => {
  const asked = timeline(session(['Нужна версия?']));
  assert.equal(asked.at(-1).type, 'needs');
  assert.equal(timeline(session(['Готово.'])).some((x) => x.type === 'needs'), false);
  assert.equal(timeline(session([], {})).some((x) => x.type === 'needs'), false);
  assert.match(view, /case 'needs': \{/);
  assert.equal(t('attn.need_reply'), 'Агент ждёт вашего ответа');
});

function fakeWorld({ hidden = true, permission = 'granted' } = {}) {
  const doc = { title: 'Пульт', hidden, hasFocus: () => !doc.hidden, querySelector: () => null };
  const store = new Map();
  const shown = [];
  class Notif { constructor(title, o) { shown.push([title, o.body]); } }
  Notif.permission = permission;
  Notif.requestPermission = async () => { Notif.permission = 'granted'; return 'granted'; };
  let dings = 0;
  class Audio {
    constructor() { dings += 1; }
    createGain() { return { gain: {}, connect() {} }; }
    createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; }
    get destination() { return {}; }
    get currentTime() { return 0; }
  }
  const intervals = [];
  const notifier = createNotifier({
    doc, win: {}, storage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    timers: { every: (fn) => { intervals.push(fn); return () => intervals.splice(intervals.indexOf(fn), 1); } },
    Notification: Notif, AudioContext: Audio, baseTitle: 'Пульт', blinkText: 'Нужен ваш ответ',
  });
  return { doc, store, shown, notifier, intervals, Notif, dings: () => dings };
}

test('уведомления и звук выключены по умолчанию, выбор помнится, при первом включении просят разрешение', async () => {
  const w = fakeWorld({ permission: 'default' });
  assert.equal(w.notifier.bellOn(), false);
  assert.equal(w.notifier.soundOn(), false);
  assert.equal(await w.notifier.setBell(true), true);
  assert.equal(w.store.get(BELL_KEY), '1');
  w.notifier.setSound(true);
  assert.equal(w.store.get(SOUND_KEY), '1');
  const again = createNotifier({ doc: w.doc, win: {}, storage: { getItem: (k) => w.store.get(k) ?? null, setItem() {} }, timers: { every: () => () => {} }, baseTitle: 'П', blinkText: 'Н' });
  assert.equal(again.bellOn(), true);
  const denied = fakeWorld({ permission: 'denied' });
  assert.equal(await denied.notifier.setBell(true), false);
  const closed = createNotifier({ doc: {}, win: {}, storage: { getItem() { throw new Error('закрыто'); }, setItem() { throw new Error('закрыто'); } }, timers: { every: () => () => {} }, baseTitle: 'П', blinkText: 'Н' });
  assert.equal(closed.bellOn(), false);
});

test('уведомление и «динь» — о новой ждущей сессии, когда вкладка не на виду или открыта другая; заголовок с числом и мигает', async () => {
  const w = fakeWorld({ hidden: true });
  await w.notifier.setBell(true);
  w.notifier.setSound(true);
  const before = w.dings();
  assert.equal(w.notifier.update(['s1|text:t1'], { s1: 'Задача' }, 's1'), 1);
  assert.deepEqual(w.shown, [['Нужен ваш ответ', 'Задача']]);
  assert.equal(w.dings(), before + 1);
  assert.equal(w.doc.title, '(1) Пульт');
  assert.equal(w.intervals.length, 1, 'мигание заголовка идёт, пока вкладка не в фокусе');
  w.intervals[0]();
  assert.equal(w.doc.title, '(1) ● Нужен ваш ответ');
  w.intervals[0]();
  assert.equal(w.doc.title, '(1) Пульт');
  // то же самое ещё раз: повторно не шумим
  assert.equal(w.notifier.update(['s1|text:t1'], { s1: 'Задача' }, 's1'), 0);
  // вкладка на виду и открыта эта же сессия: тихо
  w.doc.hidden = false;
  assert.equal(w.notifier.update(['s1|text:t1', 's2|text:t2'], { s2: 'Другая' }, 's1'), 1, 'другая сессия — шумим');
  assert.equal(w.notifier.update(['s1|text:t1', 's2|text:t2', 's3|q:r'], {}, 's3'), 0, 'открытая — нет');
  w.notifier.update([], {}, 's1');
  assert.equal(w.doc.title, 'Пульт');
  assert.equal(w.intervals.length, 0, 'ждущих нет: мигание остановлено');
});

test('вёрстка и проводка: выключатели в шапке списка, подпись «ждёт вас», мигание раз в 2 с, «молчит» с кнопкой «Прервать»', () => {
  assert.match(view, /bellButton, soundButton, themeButton/);
  assert.match(view, /t\('attn\.waiting'\)/);
  assert.match(view, /silent-cancel/);
  assert.match(app, /notifier\.update\(waitingKeys\(all, ui\.acked\), names, ui\.selected \|\| ''\)/);
  assert.match(app, /setInterval\(\(\) => render\(\), 30000\)/);
  assert.match(css, /\.session-item\[data-blink="true"\] \.dot\[data-attn="waiting"\][^{]*\{ animation: attn-blink 2s/);
  assert.match(css, /\.session-item\[data-attn="waiting"\] \.session-name \{ font-weight: 700; \}/);
  assert.equal(t('attn.waiting'), 'ждёт вас');
  assert.equal(t('attn.silent', { n: 7 }), 'молчит 7 мин');
});

test('хаб присылает минуты молчания (agent_silent_minutes): страница разбирает их, нет поля — -1', async () => {
  const { parseCrewTask } = await import('../crew-task.js');
  assert.equal(parseCrewTask({ silent_minutes: 7 }).silentMinutes, 7);
  assert.equal(parseCrewTask({ silent_minutes: 0 }).silentMinutes, 0);
  assert.equal(parseCrewTask({}).silentMinutes, -1);
});

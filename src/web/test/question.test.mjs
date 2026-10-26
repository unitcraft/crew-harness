// Проверки формы вопросов агента (задача 192): модель question.js и путь события в состоянии сессии.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeQuestions, createForm, selectOption, setOtherText, moveCursor, setCursor, setActive, isAnswered, nextUnanswered,
  canSubmit, markSent, buildAnswer, buildSkip, digitOption, summarize, otherIndex,
} from '../question.js';
import { initialModel, reduce, timeline } from '../state.js';
import { INITIAL_JOURNAL, createMockServer } from '../mock.js';

const RAW = [
  { question: 'Способ?', header: 'Способ', multiSelect: false, options: [{ label: 'А', description: 'раз' }, { label: 'Б', description: 'два' }, { label: 'В', description: '' }] },
  { question: 'Что проверить?', header: '', multiSelect: true, options: [{ label: 'Тесты', description: '' }, { label: 'Стражи', description: '' }, { label: 'Вид', description: '' }] },
];
const qs = () => normalizeQuestions(RAW);

test('вопросы из события: до четырёх, пустое отбрасывается, поля приводятся к виду', () => {
  assert.deepEqual(normalizeQuestions(null), []);
  assert.deepEqual(normalizeQuestions([{ question: '  ' }, 5, null]), []);
  const many = Array.from({ length: 6 }, (_, i) => ({ question: `в${i}`, options: [{ label: 'х' }] }));
  assert.equal(normalizeQuestions(many).length, 4);
  const [q] = normalizeQuestions([{ question: 'Q', header: 7, multiSelect: 'yes', options: [{ label: '' }, { label: 'ok' }, 'bad'] }]);
  assert.deepEqual(q, { question: 'Q', header: '', multiSelect: false, options: [{ label: 'ok', description: '' }] });
});

test('одиночный выбор: новый пункт заменяет прежний, «Другое» исключает варианты', () => {
  const q = qs();
  let f = createForm(q);
  assert.equal(isAnswered(f, q, 0), true, 'в вопросе с одним ответом первый вариант выбран заранее');
  assert.deepEqual(f.answers[0].picked, [0]);
  f = selectOption(f, q, 0, 1);
  assert.deepEqual(f.answers[0], { picked: [1], other: false, text: '' });
  f = selectOption(f, q, 0, 2);
  assert.deepEqual(f.answers[0].picked, [2]);
  f = selectOption(f, q, 0, otherIndex(q[0]));
  assert.deepEqual(f.answers[0], { picked: [], other: true, text: '' });
  f = selectOption(f, q, 0, 0);
  assert.deepEqual(f.answers[0], { picked: [0], other: false, text: '' });
  assert.equal(selectOption(f, q, 0, 9), f, 'несуществующий пункт форму не меняет');
});

test('множественный выбор: пункты переключаются, «Другое» живёт рядом с вариантами', () => {
  const q = qs();
  let f = createForm(q);
  f = selectOption(f, q, 1, 2);
  f = selectOption(f, q, 1, 0);
  assert.deepEqual(f.answers[1].picked, [0, 2]);
  f = selectOption(f, q, 1, 2);
  assert.deepEqual(f.answers[1].picked, [0]);
  f = selectOption(f, q, 1, otherIndex(q[1]));
  assert.deepEqual(f.answers[1], { picked: [0], other: true, text: '' });
  f = selectOption(f, q, 1, otherIndex(q[1]));
  assert.equal(f.answers[1].other, false);
});

test('«Другое» считается ответом только с непустым текстом', () => {
  const q = qs();
  let f = selectOption(createForm(q), q, 0, otherIndex(q[0]));
  assert.equal(isAnswered(f, q, 0), false);
  f = setOtherText(f, 0, '   ');
  assert.equal(isAnswered(f, q, 0), false);
  f = setOtherText(f, 0, ' свой вариант ');
  assert.equal(isAnswered(f, q, 0), true);
  // мульти: хотя бы один вариант ИЛИ «Другое» с текстом
  let m = selectOption(createForm(q), q, 1, otherIndex(q[1]));
  assert.equal(isAnswered(m, q, 1), false);
  m = setOtherText(m, 1, 'x');
  assert.equal(isAnswered(m, q, 1), true);
  assert.equal(setOtherText(m, 1, 'x'), m, 'тот же текст — та же форма');
});

test('проверка отправки: нужны ответы на все вопросы; отправленная форма второй раз не уходит', () => {
  const q = qs();
  let f = createForm(q);
  assert.equal(canSubmit(f, q), false);
  assert.equal(buildAnswer('r1', f, q), null);
  f = selectOption(f, q, 0, 0);
  assert.equal(canSubmit(f, q), false);
  assert.equal(nextUnanswered(f, q, 0), 1);
  assert.equal(nextUnanswered(f, q, 1), 1);
  f = selectOption(f, q, 1, 1);
  assert.equal(canSubmit(f, q), true);
  assert.equal(nextUnanswered(f, q, 0), -1);
  const sent = markSent(f);
  assert.equal(canSubmit(sent, q), false);
  assert.equal(buildAnswer('r1', sent, q), null);
  assert.equal(canSubmit(markSent(sent, false), q), true);
  assert.equal(canSubmit(createForm([]), []), false);
});

test('сбор question_answer: индексы с нуля, названия вариантов, текст «Другого»', () => {
  const q = qs();
  let f = createForm(q);
  f = selectOption(f, q, 0, 1);
  f = selectOption(f, q, 1, 0);
  f = selectOption(f, q, 1, 2);
  f = selectOption(f, q, 1, otherIndex(q[1]));
  f = setOtherText(f, 1, '  ещё вот это ');
  assert.deepEqual(buildAnswer('req-1', f, q), {
    request: 'req-1',
    skipped: false,
    answers: [
      { index: 0, selected: ['Б'], other: '' },
      { index: 1, selected: ['Тесты', 'Вид'], other: 'ещё вот это' },
    ],
  });
  // выбор «Другого» снят — текст в ответ не попадает
  const off = selectOption(f, q, 1, otherIndex(q[1]));
  assert.equal(buildAnswer('req-1', off, q).answers[1].other, '');
});

test('пропуск: question_answer с skipped и без ответов', () => {
  assert.deepEqual(buildSkip('req-2'), { request: 'req-2', skipped: true });
});

test('вкладки и указатель: активный вопрос, переход по кругу, цифры 1–9', () => {
  const q = qs();
  const f = createForm(q);
  assert.equal(f.active, 0);
  assert.equal(setActive(f, q, 1).active, 1);
  assert.equal(setActive(f, q, 5), f);
  assert.equal(moveCursor(f, q, 0, 1).cursor[0], 1);
  assert.equal(moveCursor(f, q, 0, -1).cursor[0], otherIndex(q[0]), 'вверх с первого — на «Другое»');
  assert.equal(moveCursor(setCursor(f, q, 0, otherIndex(q[0])), q, 0, 1).cursor[0], 0, 'вниз с «Другого» — на первый');
  assert.equal(setCursor(f, q, 0, 99), f);
  assert.equal(digitOption('1'), 0);
  assert.equal(digitOption('9'), 8);
  assert.equal(digitOption('0'), -1);
  assert.equal(digitOption('a'), -1);
  assert.equal(digitOption('10'), -1);
});

test('строки для ленты: «вопрос -> выбор», лишнее и пустое отбрасывается', () => {
  const q = qs();
  const lines = summarize(q, {
    request: 'r',
    skipped: false,
    answers: [
      { index: 0, selected: ['А'], other: '' },
      { index: 1, selected: ['Тесты', 'Вид'], other: 'и ещё' },
      { index: 7, selected: ['х'], other: '' },
      { index: 1.5, selected: ['х'] },
    ],
  });
  assert.deepEqual(lines, [
    { question: 'Способ?', choice: 'А' },
    { question: 'Что проверить?', choice: 'Тесты, Вид, и ещё' },
  ]);
  assert.deepEqual(summarize(q, { request: 'r', skipped: true }), []);
  assert.deepEqual(summarize(q, null), []);
});

// ---- путь события через состояние сессии --------------------------------------------------------

let n = 0;
const ev = (kind, input, step) => { n += 1; return { id: `q${n}`, trace: 's1', step, kind, input, time: 1000 + step }; };
const run = (events) => events.reduce((m, e) => reduce(m, e), initialModel());
const created = () => ev('session_created', { name: 'С', agent: 'opencode' }, 0);
const asked = (request = 'r1') => ev('question_request', { turn: 't1', request, questions: RAW }, 2);

test('question_request открывает вопрос в сессии, повтор того же события безвреден', () => {
  const a = asked();
  const m = run([created(), ev('user_message', { turn: 't1', text: 'привет' }, 1), a]);
  const s = m.sessions.s1;
  assert.equal(s.pendingQuestion.request, 'r1');
  assert.equal(s.pendingQuestion.turn, 't1');
  assert.equal(s.pendingQuestion.questions.length, 2);
  assert.equal(s.state, 'answering', 'состояние хода вопрос не меняет');
  assert.equal(reduce(m, a), m);
  // тот же запрос под другим id не открывается второй раз
  assert.equal(reduce(m, ev('question_request', { request: 'r1', questions: RAW }, 3)).sessions.s1.pendingQuestion, s.pendingQuestion);
});

test('question_request без годных вопросов игнорируется', () => {
  const m = run([created(), ev('question_request', { request: 'r1', questions: [{ question: '' }] }, 1)]);
  assert.equal(m.sessions.s1.pendingQuestion, null);
});

test('question_answer закрывает вопрос и оставляет строку «ответ» в ленте', () => {
  const m = run([created(), asked(), ev('question_answer', {
    request: 'r1', skipped: false, answers: [{ index: 0, selected: ['А'], other: '' }, { index: 1, selected: [], other: 'своё' }],
  }, 3)]);
  const s = m.sessions.s1;
  assert.equal(s.pendingQuestion, null);
  const row = timeline(s).find((i) => i.type === 'answer');
  assert.equal(row.skipped, false);
  assert.deepEqual(row.lines, [{ question: 'Способ?', choice: 'А' }, { question: 'Что проверить?', choice: 'своё' }]);
});

test('пропуск: вопрос закрыт, в ленте строка о пропуске', () => {
  const m = run([created(), asked(), ev('question_answer', { request: 'r1', skipped: true }, 3)]);
  assert.equal(m.sessions.s1.pendingQuestion, null);
  const row = timeline(m.sessions.s1).find((i) => i.type === 'answer');
  assert.equal(row.skipped, true);
  assert.equal(row.lines[0].question, 'Способ?');
});

test('question_resolved снимает форму без строки в ленте; чужой запрос её не трогает', () => {
  const open = run([created(), asked()]);
  assert.equal(reduce(open, ev('question_resolved', { request: 'другой' }, 3)).sessions.s1.pendingQuestion.request, 'r1');
  const closed = reduce(open, ev('question_resolved', { request: 'r1' }, 4));
  assert.equal(closed.sessions.s1.pendingQuestion, null);
  assert.equal(timeline(closed.sessions.s1).some((i) => i.type === 'answer'), false);
  // закрытый запрос заново не открывается
  assert.equal(reduce(closed, ev('question_request', { request: 'r1', questions: RAW }, 5)).sessions.s1.pendingQuestion, null);
});

test('отмена хода и конец хода снимают висящий вопрос', () => {
  const base = [created(), ev('user_message', { turn: 't1', text: 'x' }, 1), asked()];
  assert.equal(run([...base, ev('cancel', {}, 3)]).sessions.s1.pendingQuestion, null);
  assert.equal(run([...base, ev('agent_done', { turn: 't1' }, 3)]).sessions.s1.pendingQuestion, null);
  assert.equal(run([...base, ev('error', { turn: 't1', message: 'x' }, 3)]).sessions.s1.pendingQuestion, null);
  assert.equal(run([created(), asked(), ev('cancel', {}, 3)]).sessions.s1.pendingQuestion, null, 'и у сессии без работающего хода');
});

test('заглушка: у «Разбор падающих тестов» висит вопрос из двух вопросов; ответ из страницы идёт в ленту', () => {
  const m0 = INITIAL_JOURNAL.reduce(reduce, initialModel());
  const s = Object.values(m0.sessions).find((x) => x.name === 'Разбор падающих тестов');
  const pq = s.pendingQuestion;
  assert.equal(pq.questions.length, 2);
  assert.equal(pq.questions[0].multiSelect, false);
  assert.equal(pq.questions[1].multiSelect, true);
  assert.ok(pq.questions.every((q) => q.options.length >= 3 && q.options.length <= 4 && q.options.every((o) => o.description)));
  const f = selectOption(selectOption(createForm(pq.questions), pq.questions, 0, 0), pq.questions, 1, 1);
  const answer = buildAnswer(pq.request, f, pq.questions);
  const server = createMockServer({ now: () => 7_000_000 });
  const echoed = server.handle({ id: 'a1', trace: s.id, step: 99, kind: 'question_answer', input: answer, time: 7_000_000 });
  const m1 = echoed.reduce((m, x) => reduce(m, x.event), m0);
  assert.equal(m1.sessions[s.id].pendingQuestion, null);
  assert.equal(timeline(m1.sessions[s.id]).filter((i) => i.type === 'answer').length, 1);
});

test('заглушка: вопрос по просьбе владельца — форма, ответ продолжает ход', () => {
  let t = 8_000_000;
  const server = createMockServer({ now: () => (t += 1) });
  let m = INITIAL_JOURNAL.reduce(reduce, initialModel());
  const trace = Object.keys(m.sessions)[0];
  const apply = (entries) => { for (const x of entries) m = reduce(m, x.event); };
  apply(server.handle({ id: 'u1', trace, step: 500, kind: 'user_message', input: { turn: 'tq', text: 'Спроси меня про выбор' }, time: t }));
  const pq = m.sessions[trace].pendingQuestion;
  assert.ok(pq && pq.turn === 'tq');
  const f = selectOption(selectOption(createForm(pq.questions), pq.questions, 0, 2), pq.questions, 1, 0);
  apply(server.handle({ id: 'a2', trace, step: 501, kind: 'question_answer', input: buildAnswer(pq.request, f, pq.questions), time: t }));
  assert.equal(m.sessions[trace].pendingQuestion, null);
  assert.equal(m.sessions[trace].state, 'idle');
});

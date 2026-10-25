// Голосовой ввод (задача 192): обёртка над распознавателем речи на подставном распознавателе и подставном поле.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDictation, speechCtor, reasonOf, NO_API_REASON } from '../voice.js';

class FakeRec {
  static last = null;
  constructor() { FakeRec.last = this; this.started = false; }
  start() { this.started = true; }
  stop() { this.started = false; this.onend(); }
  say(parts, resultIndex = 0) {
    const results = parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
    this.onresult({ resultIndex, results });
  }
}

const field = (value, from = value.length, to = from) => ({
  value, selectionStart: from, selectionEnd: to, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
});

const make = (f, extra = {}) => {
  const log = { changes: 0, statuses: [] };
  const d = createDictation({ Ctor: FakeRec, field: f, onChange: () => { log.changes += 1; }, onStatus: (s) => log.statuses.push(s), ...extra });
  return { d, log };
};

test('speechCtor: берёт SpeechRecognition, затем webkitSpeechRecognition, иначе null', () => {
  const A = class {}; const B = class {};
  assert.equal(speechCtor({ SpeechRecognition: A, webkitSpeechRecognition: B }), A);
  assert.equal(speechCtor({ webkitSpeechRecognition: B }), B);
  assert.equal(speechCtor({}), null);
  assert.equal(speechCtor(null), null);
});

test('промежуточный и итоговый текст встают в позицию курсора, хвост остаётся на месте, поле даёт знать об изменении', () => {
  const f = field('начало конец', 7);
  const { d, log } = make(f);
  assert.equal(d.start(), true);
  assert.equal(FakeRec.last.lang, 'ru-RU');
  assert.equal(FakeRec.last.interimResults, true);
  FakeRec.last.say([['при', false]]);
  assert.equal(f.value, 'начало при конец');
  FakeRec.last.say([['привет', true], [' мир', false]]);
  assert.equal(f.value, 'начало привет мир конец');
  FakeRec.last.say([['привет', true], [' мир', true]]);
  assert.equal(f.value, 'начало привет мир конец');
  assert.equal(f.selectionStart, 'начало привет мир'.length);
  assert.equal(log.changes, 3);
  assert.deepEqual(log.statuses.map((s) => s.state), ['recording']);
  d.stop();
  assert.deepEqual(log.statuses.map((s) => s.state), ['recording', 'idle']);
  assert.equal(d.active(), false);
});

test('выделенный текст заменяется сказанным; сообщение само не уходит (поле — единственное, что меняется)', () => {
  const f = field('аааXXXббб', 3, 6);
  const { d } = make(f);
  d.start();
  FakeRec.last.say([['ага', true]]);
  assert.equal(f.value, 'ааа ага ббб');
});

test('нет распознавателя: статус «недоступно» с причиной, запись не начинается', () => {
  const log = [];
  const d = createDictation({ Ctor: null, field: field(''), onStatus: (s) => log.push(s) });
  assert.equal(d.start(), false);
  assert.deepEqual(log, [{ state: 'unavailable', reason: NO_API_REASON }]);
});

test('ошибка распознавания называется причиной по-русски; незнакомый код — как есть', () => {
  const { d, log } = make(field(''));
  d.start();
  FakeRec.last.onerror({ error: 'not-allowed' });
  assert.deepEqual(log.statuses.at(-1), { state: 'unavailable', reason: 'нет доступа к микрофону' });
  FakeRec.last.onend();
  assert.deepEqual(log.statuses.at(-1), { state: 'unavailable', reason: 'нет доступа к микрофону' });
  assert.equal(reasonOf('network'), 'нет связи со службой распознавания речи');
  assert.equal(reasonOf('service-not-allowed'), 'браузер не разрешает службу распознавания');
  assert.equal(reasonOf('no-speech'), 'речь не расслышана');
  assert.equal(reasonOf('что-то'), 'что-то');
});

test('toggle: первый вызов начинает запись, второй её останавливает', () => {
  const { d } = make(field('x'));
  d.toggle();
  assert.equal(d.active(), true);
  d.toggle();
  assert.equal(d.active(), false);
});

test('язык может быть функцией: берётся в момент начала записи', () => {
  let current = 'ru-RU';
  const d = createDictation({ Ctor: FakeRec, field: field(''), lang: () => current });
  d.start();
  assert.equal(FakeRec.last.lang, 'ru-RU');
  d.stop();
  current = 'de-DE';
  d.start();
  assert.equal(FakeRec.last.lang, 'de-DE');
});

// ---- кнопка-микрофон: подсказки по состояниям, таймер, клик и удержание (задача 192) ----
import { micTitleKey, clockText, createMicPress, HOLD_MS } from '../voice.js';
import { t } from '../strings.js';

test('подсказка кнопки по состояниям: покой — «нажмите, чтобы начать», запись — «нажмите, чтобы остановить», распознавание', () => {
  assert.equal(t(micTitleKey('idle')), 'Нажмите, чтобы начать запись');
  assert.equal(t(micTitleKey('unavailable')), 'Нажмите, чтобы начать запись');
  assert.equal(t(micTitleKey('recording')), 'Идёт запись… нажмите, чтобы остановить');
  assert.equal(t(micTitleKey('processing')), 'Распознаю…');
});

test('таймер записи: секунды как м:сс', () => {
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(7.9), '0:07');
  assert.equal(clockText(65), '1:05');
  assert.equal(clockText(-3), '0:00');
});

function fakeDictation() {
  const d = { on: false, starts: 0, stops: 0, active: () => d.on, start() { d.on = true; d.starts += 1; }, stop() { d.on = false; d.stops += 1; }, toggle() { if (d.on) d.stop(); else d.start(); } };
  return d;
}

test('клик — переключатель: короткое нажатие стартует и при отпускании НЕ останавливает, следующий клик останавливает', () => {
  const d = fakeDictation();
  let clock = 0;
  const press = createMicPress({ dictation: d, now: () => clock });
  press.down(); clock += 120; press.up();
  assert.deepEqual([d.on, d.starts, d.stops], [true, 1, 0]);
  clock += 3000; press.down(); clock += 80; press.up();
  assert.deepEqual([d.on, d.starts, d.stops], [false, 1, 1]);
});

test('удержание дольше порога — «рация»: отпустил — стоп; после остановки по клику отпускание ничего не меняет', () => {
  const d = fakeDictation();
  let clock = 0;
  const press = createMicPress({ dictation: d, now: () => clock });
  press.down(); clock += HOLD_MS + 50; press.up();
  assert.deepEqual([d.on, d.stops], [false, 1]);
  // второй нажим останавливает активную запись; отпускание после долгого нажатия повторно не стопит
  d.start(); press.down(); clock += 2000; press.up();
  assert.deepEqual([d.on, d.stops], [false, 2]);
});

test('Пробел и Enter на кнопке (click без указателя) — тот же переключатель', () => {
  const d = fakeDictation();
  const press = createMicPress({ dictation: d, now: () => 0 });
  press.key();
  assert.equal(d.on, true);
  press.key();
  assert.equal(d.on, false);
});

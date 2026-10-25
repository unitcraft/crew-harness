// Дорожка уровня голоса и вид карточки в записи (задача 192).
import test from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, smoothLevel, pushLevel, barHeights, recordingView, createMeter, BARS } from '../meter.js';
import { createDictation } from '../voice.js';
import { t } from '../strings.js';

test('levelOf: тишина (середина 128) — 0, громкий сигнал — до 1, пустое окно — 0', () => {
  assert.equal(levelOf(new Uint8Array(256).fill(128)), 0);
  assert.equal(levelOf(new Uint8Array(0)), 0);
  const loud = Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 250 : 6));
  assert.equal(levelOf(loud), 1);
  const quiet = Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 132 : 124));
  assert.ok(levelOf(quiet) > 0 && levelOf(quiet) < 0.3);
});

test('smoothLevel: подъём быстрее спада', () => {
  const up = smoothLevel(0, 1) - 0;
  const down = 1 - smoothLevel(1, 0);
  assert.ok(up > down);
});

test('pushLevel: окно ровно BARS, новый справа, старые смещаются влево, уровень ограничен 0..1', () => {
  let w = pushLevel([], 0);
  assert.equal(w.length, BARS);
  w = pushLevel(w, 0.5);
  w = pushLevel(w, 7);
  w = pushLevel(w, -2);
  assert.deepEqual(w.slice(-3), [0.5, 1, 0]);
  assert.equal(w.length, BARS);
  let long = [];
  for (let i = 0; i < BARS + 10; i += 1) long = pushLevel(long, i / 100);
  assert.equal(long.length, BARS);
  assert.equal(long[0], 10 / 100);
});

test('barHeights: тишина — точка минимальной высоты, голос — выше, максимум не превышен, длина окна сохранена', () => {
  const px = barHeights([0, 0.03, 0.5, 1], 3, 24);
  assert.deepEqual(px.slice(0, 2), [3, 3]);
  assert.ok(px[2] > 3 && px[2] < px[3]);
  assert.equal(px[3], 24);
  assert.equal(barHeights(pushLevel([], 0.2)).length, BARS);
});

test('вид карточки: в записи — «Слушаю…», без кнопки отправки, с «↵» и дорожкой; в покое — как было', () => {
  const rec = recordingView('recording');
  assert.equal(t(rec.placeholderKey), 'Слушаю…');
  assert.deepEqual([rec.hideSend, rec.showEnter, rec.showWave], [true, true, true]);
  for (const s of ['idle', 'processing', 'error', 'unavailable']) {
    const v = recordingView(s);
    assert.equal(t(v.placeholderKey), 'Enter — отправить, Ctrl+Enter — в очередь на потом');
    assert.deepEqual([v.hideSend, v.showEnter, v.showWave], [false, false, false]);
  }
  assert.equal(t('voice.stop_insert'), 'Остановить и вставить текст');
});

test('измеритель без микрофона не падает: ровные точки, остановка чистит таймер', async () => {
  const seen = [];
  let ticks = 0;
  const timers = { setInterval: (f) => { ticks += 1; f(); return 7; }, clearInterval: () => { ticks -= 1; } };
  const meter = createMeter({ mediaDevices: undefined, AudioCtx: undefined, onLevels: (w) => seen.push(w), timers });
  await meter.start();
  assert.ok(seen.length >= 2);
  assert.ok(seen.every((w) => w.length === BARS && w.every((l) => l === 0)));
  meter.stop();
  assert.equal(ticks, 0);
});

test('Esc: запись браузерным распознавателем отменяется, сказанное в поле не остаётся', () => {
  class Rec {
    static last = null;
    constructor() { Rec.last = this; }
    start() {}
    stop() { this.onend(); }
    abort() { this.onend(); }
  }
  const field = { value: 'до после', selectionStart: 3, selectionEnd: 3, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } };
  const d = createDictation({ Ctor: Rec, field });
  d.start();
  Rec.last.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'привет' }], { isFinal: true })] });
  assert.equal(field.value, 'до привет после');
  d.cancel();
  assert.equal(field.value, 'до после');
  assert.equal(d.active(), false);
});

// ---- правая группа карточки: порядок и зазоры без наложений (задача 192) ----
import fs from 'node:fs';
const viewSrc = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
const cssSrc = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

test('правая группа карточки: таймер, дорожка, строка кнопок (отмена, отправка, «↵», микрофон) в этом порядке; таймер не внутри микрофона', () => {
  const box = viewSrc.match(/const box = h\(doc, 'div', \{ class: 'box' \}, input,\s*([^;]*)\);/);
  assert.ok(box, 'карточка найдена');
  assert.match(box[1], /^micTimer, wave, h\(doc, 'div', \{ class: 'box-row' \}, cancelButton, sendButton, enterButton, micWrap\)/);
  assert.match(viewSrc, /const micWrap = h\(doc, 'div', \{ class: 'mic-wrap' \}, micButton, micMore, voiceMenu\);/);
});

test('таймер мелкий серый фиксированной ширины, стрелка провайдера в записи скрыта, зазоры 6–8 px', () => {
  assert.match(cssSrc, /\.mic-timer \{[^}]*width: 34px[^}]*color: var\(--fg-muted\)/);
  assert.ok(!/\.mic-timer \{[^}]*--danger/.test(cssSrc));
  assert.match(cssSrc, /\.box\.recording \.mic-more \{ display: none; \}/);
  assert.match(cssSrc, /\.box \{ display: flex; align-items: flex-end; gap: 8px;/);
  assert.match(cssSrc, /\.box-row \{ flex: none; gap: 6px; \}/);
  assert.match(cssSrc, /\.mic-wrap \{ gap: 6px; \}/);
});

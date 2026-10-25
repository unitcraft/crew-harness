// Локальная запись (задача 192): весь путь «микрофон → WAV → /api/stt → поле» на подставных частях.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalDictation } from '../recorder.js';

function rig({ stream = true, fetchReply, mic = '', failGum = null } = {}) {
  const log = { statuses: [], changes: 0, posts: [], gum: [], stopped: 0, closed: 0, timers: [] };
  const track = { stop() { log.stopped += 1; } };
  const mediaDevices = {
    async getUserMedia(c) {
      log.gum.push(c);
      if (failGum && (!failGum.once || log.gum.length === 1)) throw Object.assign(new Error('x'), { name: failGum.name });
      return { getTracks: () => [track] };
    },
  };
  let processor = null;
  class FakeCtx {
    constructor() { this.sampleRate = 48000; this.state = 'running'; this.destination = {}; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { processor = { connect() {}, disconnect() {}, onaudioprocess: null }; return processor; }
    async close() { log.closed += 1; }
  }
  const field = { value: 'начало конец', selectionStart: 7, selectionEnd: 7, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } };
  const fetchFn = fetchReply || (async (url, init) => { log.posts.push({ url, init }); return { ok: true, status: 200, json: async () => ({ text: ' привет мир ' }) }; });
  const timers = {
    setTimeout: (f, ms) => { log.timers.push({ f, ms }); return log.timers.length; },
    clearTimeout: () => {},
  };
  const d = createLocalDictation({
    field, mediaDevices: stream ? mediaDevices : undefined, AudioCtx: FakeCtx, fetchFn, timers,
    getLang: () => 'ru', getMic: () => mic,
    onChange: () => { log.changes += 1; }, onStatus: (s) => log.statuses.push(s),
  });
  const talk = (seconds) => {
    const n = Math.round(48000 * seconds);
    processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(n).fill(0.2) } });
  };
  return { d, field, log, talk };
}
const tick = () => new Promise((r) => setImmediate(r));

test('запись → WAV 16 кГц на /api/stt → текст в позицию курсора, сообщение не уходит', async () => {
  const { d, field, log, talk } = rig();
  assert.equal(d.start(), true);
  await tick();
  assert.equal(d.active(), true);
  assert.deepEqual(log.gum, [{ audio: true }]);
  talk(1);
  d.stop();
  await tick(); await tick();
  assert.deepEqual(log.statuses.map((s) => s.state), ['recording', 'processing', 'idle']);
  assert.equal(log.posts.length, 1);
  assert.equal(log.posts[0].url, '/api/stt?lang=ru');
  assert.equal(log.posts[0].init.headers['Content-Type'], 'audio/wav');
  assert.equal(log.posts[0].init.body.size, 44 + 16000 * 2, '1 секунда 16 кГц моно 16 бит');
  assert.equal(field.value, 'начало привет мир конец');
  assert.equal(field.selectionStart, 'начало привет мир'.length);
  assert.equal(log.changes, 1);
  assert.equal(log.stopped, 1, 'микрофон отпущен');
  assert.equal(log.closed, 1);
  assert.equal(d.busy(), false);
});

test('выбранный микрофон уходит в getUserMedia; пропавший заменяется микрофоном по умолчанию', async () => {
  const a = rig({ mic: 'dev-7' });
  a.d.start(); await tick();
  assert.deepEqual(a.log.gum[0], { audio: { deviceId: { exact: 'dev-7' } } });
  const b = rig({ mic: 'gone', failGum: { name: 'OverconstrainedError', once: true } });
  b.d.start(); await tick();
  assert.deepEqual(b.log.gum, [{ audio: { deviceId: { exact: 'gone' } } }, { audio: true }]);
  assert.equal(b.d.active(), true);
});

test('нет доступа к микрофону, нет mediaDevices, занят — ошибка с причиной, кнопка свободна для повтора', async () => {
  const denied = rig({ failGum: { name: 'NotAllowedError' } });
  denied.d.start(); await tick();
  assert.deepEqual(denied.log.statuses.at(-1), { state: 'error', reason: 'нет доступа к микрофону' });
  assert.equal(denied.d.busy(), false);
  const none = rig({ stream: false });
  none.d.start(); await tick();
  assert.match(none.log.statuses.at(-1).reason, /защищённый адрес/);
  const busy = rig({ failGum: { name: 'NotReadableError' } });
  busy.d.start(); await tick();
  assert.equal(busy.log.statuses.at(-1).reason, 'микрофон занят другим приложением');
});

test('ошибки сервера: 503 — «не запущен», сеть, пустой текст; поле не меняется', async () => {
  const off = rig({ fetchReply: async () => ({ ok: false, status: 503, json: async () => ({ error: 'stt off' }) }) });
  off.d.start(); await tick(); off.talk(1); off.d.stop(); await tick(); await tick();
  assert.deepEqual(off.log.statuses.at(-1), { state: 'error', reason: 'сервер распознавания не запущен' });
  assert.equal(off.field.value, 'начало конец');
  const net = rig({ fetchReply: async () => { throw new Error('offline'); } });
  net.d.start(); await tick(); net.talk(1); net.d.stop(); await tick(); await tick();
  assert.equal(net.log.statuses.at(-1).reason, 'нет связи с сервером');
  const empty = rig({ fetchReply: async () => ({ ok: true, status: 200, json: async () => ({ text: '  ' }) }) });
  empty.d.start(); await tick(); empty.talk(1); empty.d.stop(); await tick(); await tick();
  assert.equal(empty.log.statuses.at(-1).reason, 'речь не расслышана');
});

test('слишком короткая запись на сервер не уходит; остановка до готовности микрофона тоже обрабатывается', async () => {
  const { d, log, talk } = rig();
  d.start(); await tick(); talk(0.1); d.stop(); await tick();
  assert.equal(log.posts.length, 0);
  assert.deepEqual(log.statuses.at(-1), { state: 'error', reason: 'запись слишком короткая' });
  const early = rig();
  early.d.start(); early.d.stop(); await tick(); await tick();
  assert.equal(early.log.posts.length, 0);
  assert.equal(early.log.stopped, 1, 'микрофон отпущен и при ранней остановке');
  assert.equal(early.d.busy(), false);
});

test('предел 60 секунд: таймер автоостановки, подсказка в статусе «распознаю»', async () => {
  const { d, log, talk } = rig();
  d.start(); await tick();
  assert.equal(log.timers.length, 1);
  assert.equal(log.timers[0].ms, 60000);
  talk(1);
  log.timers[0].f();
  await tick(); await tick();
  assert.match(log.statuses.find((s) => s.state === 'processing').reason, /предел записи в 60 с/);
  assert.equal(log.posts.length, 1);
});

test('toggle и повторный start во время обработки; правка поля за время распознавания — текст по текущему курсору', async () => {
  let release;
  const slow = async () => new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => ({ text: 'вставка' }) }); });
  const { d, field, talk } = rig({ fetchReply: slow });
  d.toggle(); await tick();
  talk(1);
  d.toggle(); await tick();
  assert.equal(d.active(), false);
  assert.equal(d.busy(), true);
  assert.equal(d.start(), false, 'пока распознаётся, новая запись не начинается');
  field.value = 'Привет!'; field.selectionStart = 7; field.selectionEnd = 7;
  release(); await tick(); await tick();
  assert.equal(field.value, 'Привет! вставка');
});

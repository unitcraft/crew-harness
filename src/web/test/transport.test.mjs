// Проверки транспорта: выбор режима, воспроизведение заглушки, WebSocket с повтором.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMode, createTransport, parseAgentRegistry, RETRY_STEPS } from '../transport.js';
import { createMockServer } from '../mock.js';
import { makeEvent } from '../state.js';

function fakeTimers() {
  let now = 0;
  let seq = 0;
  const q = new Map();
  return {
    set(fn, ms) { seq += 1; q.set(seq, { at: now + ms, fn }); return seq; },
    clear(id) { q.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let best = null;
        for (const [id, x] of q) if (x.at <= end && (!best || x.at < best[1].at)) best = [id, x];
        if (!best) break;
        q.delete(best[0]);
        now = best[1].at;
        best[1].fn();
      }
      now = end;
    },
    pending: () => q.size,
  };
}

class FakeSocket {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeSocket.all.push(this); }
  send(s) { this.sent.push(s); }
  close() { this.readyState = 3; this.onclose?.({}); }
  open() { this.readyState = 1; this.onopen?.({}); }
  message(data) { this.onmessage?.({ data }); }
  drop() { this.readyState = 3; this.onclose?.({}); }
}

test('chooseMode: ?mock=1 — заглушка; http — сокет /ws; file без mock — нет сервера', () => {
  assert.deepEqual(chooseMode('?mock=1', 'file:', ''), { mode: 'mock' });
  assert.deepEqual(chooseMode('?mock=1', 'http:', 'localhost:80'), { mode: 'mock' });
  assert.deepEqual(chooseMode('', 'http:', 'localhost:7000'), { mode: 'ws', url: 'ws://localhost:7000/ws' });
  assert.deepEqual(chooseMode('', 'https:', 'example.test'), { mode: 'ws', url: 'wss://example.test/ws' });
  assert.deepEqual(chooseMode('', 'file:', ''), { mode: 'nofile' });
  assert.deepEqual(chooseMode('?mock=0', 'http:', 'h'), { mode: 'ws', url: 'ws://h/ws' });
});

test('реестр live-агентов: только непустые id/label, без полей запуска', () => {
  assert.deepEqual(parseAgentRegistry({ agents: [
    { id: 'opencode', label: 'OpenCode', program: 'hidden.exe', args: ['acp'] },
    { id: 'kimi', label: 'Kimi Code', program: 'kimi.cmd', args: ['acp'] },
  ] }), [
    { id: 'opencode', label: 'OpenCode' }, { id: 'kimi', label: 'Kimi Code' },
  ]);
  assert.deepEqual(parseAgentRegistry({ agents: [{ id: 'bad', label: '' }, null, { id: '', label: 'No id' }] }), []);
  assert.deepEqual(parseAgentRegistry(null), []);
});

test('заглушка: статус «mock», журнал сразу, ответ по таймеру, отмена снимает остаток', () => {
  const timers = fakeTimers();
  const statuses = [];
  const got = [];
  let t = 1;
  const server = createMockServer({ now: () => (t += 1) });
  const tr = createTransport({
    mode: 'mock', server, timers, onEvent: (e) => got.push(e), onStatus: (s) => statuses.push(s),
  });
  tr.start();
  assert.equal(statuses.at(-1).state, 'mock');
  assert.ok(got.length > 0);

  const trace = got[0].trace;
  let n = 0;
  const mk = (kind, input, step) => makeEvent(kind, trace, step, input, { newId: () => `u${(n += 1)}`, now: () => 9 });
  assert.equal(tr.send(mk('user_message', { turn: 'tt', text: 'Объясни' }, 90)), true);
  timers.advance(0);
  assert.equal(got.at(-1).kind, 'user_message');
  timers.advance(700);
  const chunks = got.filter((e) => e.kind === 'agent_chunk' && e.input.turn === 'tt').length;
  assert.ok(chunks >= 1);
  tr.send(mk('cancel', { turn: 'tt' }, 91));
  timers.advance(60_000);
  assert.equal(got.some((e) => e.kind === 'agent_done' && e.input.turn === 'tt'), false);
  assert.equal(got.at(-1).kind, 'cancel');
});

test('сокет: подключение, приём события и пачки, мусор отбрасывается', () => {
  FakeSocket.all = [];
  const timers = fakeTimers();
  const statuses = [];
  const got = [];
  const tr = createTransport({
    mode: 'ws', url: 'ws://h/ws', timers, WebSocketImpl: FakeSocket,
    onEvent: (e) => got.push(e), onStatus: (s) => statuses.push(s.state),
  });
  tr.start();
  assert.equal(statuses.at(-1), 'connecting');
  const ws = FakeSocket.all[0];
  assert.equal(ws.url, 'ws://h/ws');
  ws.open();
  assert.equal(statuses.at(-1), 'connected');
  ws.message(JSON.stringify({ id: 'a', trace: 's', step: 0, kind: 'cancel', input: {}, time: 1 }));
  ws.message(JSON.stringify([{ id: 'b' }, { id: 'c' }]));
  ws.message('не json');
  ws.message(JSON.stringify(42));
  assert.deepEqual(got.map((e) => e.id), ['a', 'b', 'c']);
  assert.equal(statuses.at(-1), 'connected');
});

test('сокет: отправка уходит JSON-ом, до открытия — false', () => {
  FakeSocket.all = [];
  const timers = fakeTimers();
  const tr = createTransport({ mode: 'ws', url: 'ws://h/ws', timers, WebSocketImpl: FakeSocket, onEvent() {}, onStatus() {} });
  const e = { id: 'a', trace: 's', step: 0, kind: 'cancel', input: {}, time: 1 };
  tr.start();
  assert.equal(tr.send(e), false);
  FakeSocket.all[0].open();
  assert.equal(tr.send(e), true);
  assert.deepEqual(JSON.parse(FakeSocket.all[0].sent[0]), e);
});

test('сокет: разрыв — обратный отсчёт и повтор, успех сбрасывает ступень', () => {
  FakeSocket.all = [];
  const timers = fakeTimers();
  const statuses = [];
  const tr = createTransport({
    mode: 'ws', url: 'ws://h/ws', timers, WebSocketImpl: FakeSocket,
    onEvent() {}, onStatus: (s) => statuses.push(s),
  });
  tr.start();
  FakeSocket.all[0].drop();
  assert.deepEqual(statuses.at(-1), { state: 'retry', seconds: RETRY_STEPS[0] });
  timers.advance(1000);
  assert.deepEqual(statuses.at(-1), { state: 'retry', seconds: RETRY_STEPS[0] - 1 });
  timers.advance(1000);
  assert.equal(statuses.at(-1).state, 'connecting');
  assert.equal(FakeSocket.all.length, 2);
  FakeSocket.all[1].drop(); // вторая неудача — вторая ступень
  assert.deepEqual(statuses.at(-1), { state: 'retry', seconds: RETRY_STEPS[1] });
  timers.advance(RETRY_STEPS[1] * 1000);
  FakeSocket.all[2].open();
  assert.equal(statuses.at(-1).state, 'connected');
  FakeSocket.all[2].drop();
  assert.deepEqual(statuses.at(-1), { state: 'retry', seconds: RETRY_STEPS[0] });
});

test('stop снимает таймеры и закрывает сокет без повтора', () => {
  FakeSocket.all = [];
  const timers = fakeTimers();
  const tr = createTransport({ mode: 'ws', url: 'ws://h/ws', timers, WebSocketImpl: FakeSocket, onEvent() {}, onStatus() {} });
  tr.start();
  FakeSocket.all[0].open();
  tr.stop();
  assert.equal(timers.pending(), 0);
  timers.advance(120_000);
  assert.equal(FakeSocket.all.length, 1);
});

test('режим «нет сервера» (страница из файла без ?mock=1): статус и отказ отправки', () => {
  const statuses = [];
  const tr = createTransport({ mode: 'nofile', timers: fakeTimers(), onEvent() {}, onStatus: (s) => statuses.push(s.state) });
  tr.start();
  assert.equal(statuses.at(-1), 'nofile');
  assert.equal(tr.send({}), false);
});

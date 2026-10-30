// Run the real app event handlers with only DOM/transport/clock boundaries replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import * as state from '../state.js';
import * as attention from '../attention.js';
import * as strings from '../strings.js';
import * as queue from '../queue.js';
import * as loading from '../loading.js';
import * as attachments from '../attachments.js';
import * as routes from '../routes.js';
import * as crew from '../crew-task.js';
import * as delivery from '../delivery.js';
import { chooseMode, parseAgentRegistry } from '../transport.js';

const memory = () => {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
};
async function app(storage = memory(), sendResult = true, hash = '#s=s') {
  const source = process.env.RED_260 === '1'
    ? execFileSync('git', ['show', 'f8b08227:src/web/app.js'], { encoding: 'utf8' })
    : fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  let callbacks;
  const sent = [];
  const timeouts = [];
  const context = {
    ...state, ...attention, ...strings, ...queue, ...attachments, ...routes, ...crew, ...delivery, ...loading,
    chooseMode, parseAgentRegistry,
    console, URLSearchParams, Date, Math, Promise,
    crypto: { randomUUID: () => `client-${sent.length}-${Math.random()}` },
    localStorage: storage, sessionStorage: memory(),
    location: { search: '', protocol: 'http:', host: 'test.invalid', hash },
    document: { documentElement: { setAttribute() {}, removeAttribute() {} }, getElementById() {}, addEventListener() {} },
    addEventListener() {}, requestAnimationFrame() {},
    setInterval() {}, setTimeout(fn) { timeouts.push(fn); return timeouts.length; }, clearTimeout() {},
    fetch: async () => ({ ok: true, json: async () => ({ agents: [{ id: 'agent', label: 'Agent' }] }) }),
    createNotifier: () => ({ bellOn: () => false, soundOn: () => false, update() {} }),
    createProjectsApi: () => ({ list: async () => ({ ok: true, projects: [] }) }),
    createView: () => ({ render() {}, tick() {}, setAgents() {} }),
    createTransport(deps) {
      callbacks = deps;
      return { start() {}, send(event) {
        sent.push(event);
        if (sendResult instanceof Error) throw sendResult;
        return sendResult;
      } };
    },
  };
  vm.createContext(context);
  const code = source.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/g, '')
    .replace('start().then(', 'globalThis.started = start().then(')
    + '\nglobalThis.probe = { handlers, getModel: () => model, getUI: () => ui };';
  vm.runInContext(code, context);
  await context.started;
  const event = (kind, input = {}, extra = {}) => callbacks.onEvent({ id: `srv-${Math.random()}`, trace: 's', step: 1, kind, input, time: Date.now(), ...extra });
  event('session_created', { name: 'test', agent: 'agent' }, { step: 0 });
  return { ...context.probe, sent, event, timeouts, status: value => callbacks.onStatus(value), storage };
}

test('260: реальный onSend сохраняет исчезавшее сообщение до эха; reload не отправляет его снова', async () => {
  const first = await app();
  assert.equal(first.handlers.onSend('s', 'не терять сообщение'), true);
  const saved = first.handlers.deliveryItems?.('s') || [];
  assert.equal(saved.length, 1, 'локальная копия должна существовать даже без эха сервера');
  assert.equal(saved[0].text, 'не терять сообщение');
  const second = await app(first.storage);
  assert.equal(second.sent.length, 0);
  assert.equal(second.handlers.deliveryItems('s')[0].state, 'unknown');
  second.handlers.onRetry('s', saved[0].id);
  assert.equal(second.sent.length, 0, 'при потерянном подтверждении retry запрещён');
});

test('260: offline retry однократен, receipt коррелирует с другим engine turn, позднее эхо снимает копию', async () => {
  const first = await app(memory(), false);
  first.handlers.onSend('s', 'текст');
  const [saved] = first.handlers.deliveryItems('s');
  assert.equal(saved.state, 'not_sent');
  const second = await app(first.storage, true);
  second.handlers.onRetry('s', saved.id);
  second.handlers.onRetry('s', saved.id);
  assert.equal(second.sent.length, 1);
  assert.equal(second.sent[0].id, saved.id);
  second.event('message_delivery', { client_id: saved.id, accepted: true, turn: 'engine-73' });
  assert.equal(second.handlers.deliveryItems('s')[0].state, 'accepted');
  second.event('user_message', { turn: 'engine-73', text: 'текст' });
  assert.equal(second.handlers.deliveryItems('s').length, 0);
});

test('260: исключение send — неизвестный исход; storage failure не разрешает отправку', async () => {
  const thrown = await app(memory(), new Error('socket race'));
  assert.equal(thrown.handlers.onSend('s', 'текст'), true);
  const [saved] = thrown.handlers.deliveryItems('s');
  assert.equal(saved.state, 'unknown');
  thrown.handlers.onRetry('s', saved.id);
  assert.equal(thrown.sent.length, 1);
  const denied = await app({ getItem() { return null; }, setItem() { throw Error('quota'); } });
  assert.equal(denied.handlers.onSend('s', 'оставить в composer'), false);
  assert.equal(denied.sent.length, 0);
});

test('260: backend ошибка без turn остаётся в чате и локально после reload без секретного payload', async () => {
  const first = await app();
  first.event('error', { turn: '', message: 'cannot be started: Authorization: Bearer secret123 https://example.test?token=secret' });
  assert.match(state.timeline(first.getModel().sessions.s).find(x => x.tone === 'error').reason, /запустить агента/);
  const second = await app(first.storage);
  const [error] = second.handlers.deliveryItems('s');
  assert.equal(error.state, 'error');
  assert.match(error.reason, /запустить агента/);
  assert.doesNotMatch(JSON.stringify(error), /secret123|password|Bearer|https:/);
});

test('260: отказ создания первой сессии сохраняет и текст, и метаданные для reload', async () => {
  const first = await app(memory(), false);
  first.handlers.onNewToggle(true);
  const draft = Object.values(first.getModel().sessions).find(s => s.draft);
  assert.ok(draft);
  assert.equal(first.handlers.onSend(draft.id, 'первое сообщение'), false);
  const [saved] = first.handlers.deliveryItems(draft.id);
  assert.equal(saved.text, 'первое сообщение');
  assert.equal(saved.state, 'not_sent');
  const second = await app(first.storage, true, '');
  assert.ok(second.getModel().sessions[draft.id]);
  assert.equal(second.getUI().awaiting, draft.id, 'локальная копия первой сессии должна открываться и без ссылки');
  assert.equal(second.handlers.deliveryItems(draft.id)[0].text, 'первое сообщение');
  assert.equal(second.sent.length, 0);
});

test('260: передача первого сообщения сокету не удаляет локальную сессию до эха создания', async () => {
  const first = await app();
  first.handlers.onNewToggle(true);
  const draft = Object.values(first.getModel().sessions).find(s => s.draft);
  assert.equal(first.handlers.onSend(draft.id, 'первое сообщение без эха'), true);
  assert.ok(first.getModel().sessions[draft.id], 'локальная сессия должна оставаться доступной до эха создания');
  assert.equal(first.handlers.deliveryItems(draft.id)[0].text, 'первое сообщение без эха');
});

test('260: связанный отказ сервера остаётся рядом с конкретной локальной копией', async () => {
  const first = await app();
  first.handlers.onSend('s', 'не терять');
  const [saved] = first.handlers.deliveryItems('s');
  first.event('error', { client_id: saved.id, turn: '', message: 'cannot be started: secret' });
  first.event('message_delivery', { client_id: saved.id, accepted: false, turn: '' });
  const [failed] = first.handlers.deliveryItems('s');
  assert.equal(failed.text, 'не терять');
  assert.equal(failed.state, 'received');
  assert.match(failed.reason, /запустить агента/);
  assert.doesNotMatch(JSON.stringify(failed), /secret/);
  const second = await app(first.storage);
  assert.match(second.handlers.deliveryItems('s')[0].reason, /запустить агента/);
  second.handlers.onRetry('s', saved.id);
  assert.equal(second.sent.length, 0);
});

test('260: поздний успешный ответ убирает сохранённую ошибку своего хода и после reload', async () => {
  const first = await app();
  first.event('user_message', { turn: 'engine-turn', text: 'текст' });
  first.event('error', { turn: 'engine-turn', message: 'connection lost' });
  assert.equal(first.handlers.deliveryItems('s').length, 1);
  first.event('agent_chunk', { turn: 'engine-turn', text: 'поздний ответ' }, { step: 3 });
  first.event('agent_done', { turn: 'engine-turn' }, { step: 4 });
  assert.equal(first.handlers.deliveryItems('s').length, 0);
  const second = await app(first.storage);
  assert.equal(second.handlers.deliveryItems('s').length, 0);
});

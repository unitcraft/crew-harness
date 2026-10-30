import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModel, reduce, timeline } from '../state.js';
import { createDelivery, createDraftStore, safeError, restoreText, afterSendText } from '../delivery.js';
import { deliveryCard } from '../delivery-ui.js';
import { createFakeDocument } from './fake-dom.mjs';

test('260: текст записан до передачи, reload запрещает повтор неизвестной доставки', async () => {
  const { createDelivery } = await import('../delivery.js');
  const storage = { value: null, getItem() { return this.value; }, setItem(k, v) { this.value = v; } };
  const d = createDelivery(storage);
  const event = { id: 'out-1', trace: 's', kind: 'user_message', input: { text: 'не терять', turn: 'client-turn' }, time: 2 };
  assert.equal(d.add(event), true);
  assert.match(storage.value, /не терять/);
  assert.equal(createDelivery(storage).items('s')[0].state, 'unknown');
  assert.equal(createDelivery(storage).canRetry('out-1'), false);
  d.failed('out-1', 'offline');
  assert.equal(d.canRetry('out-1'), true);
});

test('260: ошибка без turn не подменяет законченный ответ; поздний ответ закрывает ошибку своего хода', () => {
  let i = 0;
  const e = (kind, input) => ({ id: `e${++i}`, trace: 's', step: i, kind, input, time: i });
  let m = reduce(initialModel(), e('session_created', {}));
  m = reduce(m, e('user_message', { turn: 't', text: 'вопрос' }));
  m = reduce(m, e('error', { turn: 't', message: 'network failure' }));
  assert.equal(m.sessions.s.messages[1].status, 'error');
  m = reduce(m, e('agent_chunk', { turn: 't', text: 'поздний ответ' }));
  m = reduce(m, e('agent_done', { turn: 't' }));
  assert.equal(m.sessions.s.messages[1].status, 'done');
  m = reduce(m, e('error', { message: 'cannot be started' }));
  assert.equal(m.sessions.s.messages[1].status, 'done');
  assert.equal(timeline(m.sessions.s).filter(x => x.tone === 'error').length, 1);
});

test('260: retry, возврат, подробности и доступность карточки', () => {
  const doc = createFakeDocument();
  let retried = 0, restored = '', copied = '';
  const item = { id: 'id', state: 'not_sent', images: [], text: '<b>не HTML</b>', reason: 'offline Authorization: Bearer secret' };
  const card = deliveryCard(doc, item, { retry: () => retried++, restore: t => restored = t, copy: t => copied = t });
  assert.equal(card.getAttribute('role'), 'alert');
  assert.match(card.textContent, /⚠/);
  const buttons = card.querySelectorAll('.delivery-actions button');
  buttons[0].click(); buttons[0].click();
  assert.equal(retried, 1);
  buttons[1].click();
  assert.equal(restored, item.text);
  card.querySelector('details').querySelector('button').click();
  assert.match(copied, /Сообщение не отправлено/);
  assert.doesNotMatch(card.textContent + copied, /Bearer|secret/);
  for (const state of ['unknown', 'received', 'accepted', 'agent_error']) {
    const c = deliveryCard(doc, { ...item, state }, {});
    assert.equal(c.querySelector('.delivery-actions button').disabled, true);
  }
});

test('260: карточка сворачивается в строку с причиной и раскрывается с теми же действиями', () => {
  const doc = createFakeDocument();
  const item = { id: 'fold', state: 'not_sent', images: [], text: 'текст сообщения', reason: 'offline' };
  // по умолчанию раскрыта
  const open0 = deliveryCard(doc, item, {});
  assert.equal(open0.querySelector('.delivery-head').getAttribute('aria-expanded'), 'true');
  assert.equal(open0.querySelector('.delivery-body').hidden, false);
  // свёрнутая: тело скрыто, строка держит иконку и краткую причину, кнопка раскрытия доступна с клавиатуры
  const folded = deliveryCard(doc, { ...item, collapsed: true }, {});
  const head = folded.querySelector('.delivery-head');
  assert.equal(head.tagName, 'BUTTON');
  assert.equal(head.getAttribute('aria-expanded'), 'false');
  assert.equal(folded.querySelector('.delivery-body').hidden, true);
  assert.match(head.textContent, /⚠/);
  assert.match(head.textContent, /Соединение прервано/);
  assert.doesNotMatch(head.textContent, /текст сообщения/);
  // переключатель сообщает состояние наружу: страница запоминает его по ключу карточки
  const seen = new Set();
  const live = deliveryCard(doc, item, {
    toggle(headEl, body) {
      const key = 'hide:fold';
      if (seen.has(key)) { seen.delete(key); headEl.setAttribute('aria-expanded', 'true'); body.hidden = false; }
      else { seen.add(key); headEl.setAttribute('aria-expanded', 'false'); body.hidden = true; }
    }, retry() {}, restore() {}, copy() {},
  });
  const liveHead = live.querySelector('.delivery-head');
  liveHead.click();
  assert.equal(liveHead.getAttribute('aria-expanded'), 'false');
  assert.equal(live.querySelector('.delivery-body').hidden, true);
  // перерисовка с запомненной свёрнутостью — карточка остаётся строкой; новая карточка с другим ключом раскрыта
  const again = deliveryCard(doc, { ...item, collapsed: seen.has('hide:fold') }, {});
  assert.equal(again.querySelector('.delivery-head').getAttribute('aria-expanded'), 'false');
  const other = deliveryCard(doc, { ...item, id: 'other', collapsed: seen.has('hide:other') }, {});
  assert.equal(other.querySelector('.delivery-head').getAttribute('aria-expanded'), 'true');
  // раскрытие возвращает те же действия
  liveHead.click();
  assert.equal(liveHead.getAttribute('aria-expanded'), 'true');
  assert.equal(live.querySelector('.delivery-body').hidden, false);
  assert.equal(live.querySelector('.delivery-actions button').textContent.length > 0, true);
});

test('260: черновик сохраняется, хранилище ограничено без вытеснения неотправленных', () => {
  const map = new Map();
  const storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) };
  createDraftStore(storage).set('s', 'новый черновик');
  assert.equal(createDraftStore(storage).get('s'), 'новый черновик');
  const d = createDelivery(storage);
  for (let i = 0; i < 100; i++) assert.equal(d.add({ id: `e${i}`, trace: 's', input: { text: 'сохранить' }, time: i }), true);
  assert.equal(d.add({ id: 'too-many', trace: 's', input: { text: 'не отправлять' }, time: 101 }), false);
  assert.equal(d.items('s').length, 100);
  d.forget('e0');
  assert.equal(d.items('s').length, 99);
});

test('260: ошибки с секретами разрешают только фиксированную безопасную причину', () => {
  for (const value of ['Authorization: Bearer sk-secret', 'HTTP 503 https://example.test/?key=secret', '{"api_key":"secret","error":"401"}', 'token=secret\nopaque sensitive provider detail']) {
    assert.doesNotMatch(safeError(value), /secret|pass|api_key|PRIVATE KEY|example|Bearer/);
    assert.equal(safeError(safeError(value)), safeError(value));
  }
});

test('260: отсутствующий в реестре агент имеет конкретную безопасную причину и действие', () => {
  const message = safeError('the agent cannot be started: the agent legacy-agent is not configured token=secret');
  assert.match(message, /не настроен на сервере/);
  assert.match(message, /доступным агентом/);
  assert.doesNotMatch(message, /legacy-agent|secret|token/);
  assert.equal(safeError(message), message);
});

test('260: возврат не затирает черновик; позднее завершение upload не очищает новую правку', () => {
  assert.equal(restoreText('отправленное', 'новый черновик'), 'отправленное\n\nновый черновик');
  assert.equal(restoreText('отправленное', ''), 'отправленное');
  assert.equal(afterSendText('отправленное', 'новый черновик'), 'новый черновик');
  assert.equal(afterSendText('отправленное', 'отправленное'), '');
});

test('260: завершение старого хода не стирает новую или непривязанную ошибку', () => {
  const storage = { getItem() { return null; }, setItem() {} };
  const d = createDelivery(storage);
  d.error({ id: 'new-error', trace: 's', input: { turn: 't', message: 'network' }, time: 20 });
  d.error({ id: 'unbound', trace: 's', input: { message: 'network' }, time: 5 });
  const m = { sessions: { s: { messages: [{ role: 'agent', turn: 't', status: 'done', doneAt: 10 }] } } };
  d.reconcile(m);
  assert.equal(d.items('s').length, 2);
  m.sessions.s.messages[0].doneAt = 30;
  d.reconcile(m);
  assert.deepEqual(d.items('s').map(r => r.id), ['unbound']);
});

test('260: технический отказ ответа — заметный блок принятого сообщения, не неотправка', () => {
  const doc = createFakeDocument();
  let restored = '';
  for (const reason of ['ConnectionLost', 'NoResult', 'Timeout', 'MaxTokens', 'ModelRefused']) {
    const item = { id: 'accepted', state: 'agent_refused', images: [], text: 'принятый вопрос', reason };
    const card = deliveryCard(doc, item, { restore: text => restored = text, copy() {} });
    assert.equal(card.getAttribute('role'), 'alert');
    assert.ok(card.classList.contains('delivery-error'));
    assert.match(card.textContent, /⚠ Сообщение принято сервером/);
    assert.equal(card.querySelectorAll('.delivery-actions button')[0].disabled, true);
    card.querySelectorAll('.delivery-actions button')[1].click();
    assert.equal(restored, item.text);
    assert.doesNotMatch(safeError(reason), /Точная причина недоступна/);
  }
});

test('260: ошибка запуска до первого хода не исчезает из ленты', () => {
  let m = reduce(initialModel(), { id: 'c', trace: 's', step: 0, kind: 'session_created', input: {}, time: 1 });
  m = reduce(m, { id: 'e', trace: 's', step: 1, kind: 'error', input: { turn: '', message: 'the agent cannot be started: unavailable' }, time: 2 });
  const note = timeline(m.sessions.s).find(x => x.tone === 'error');
  assert.ok(note, 'причина ошибки должна быть непосредственно в чате');
  assert.match(note.reason, /Не удалось запустить агента/);
});

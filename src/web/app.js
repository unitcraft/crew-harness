// app.js — вход страницы: связывает транспорт, редьюсер и рисование.
//
// Поток один: событие приходит из transport -> state.reduce даёт новую модель -> view рисует.
// Решения владельца (сообщение, отмена, разрешение, новая сессия) уходят событиями через тот же
// транспорт и появляются на экране, только когда вернутся в потоке: пульт состояния не хранит.
// Здесь живёт лишь то, чего в потоке нет по природе: какая сессия открыта на экране.

import { initialModel, reduce, makeEvent, nextStep } from './state.js';
import { t } from './strings.js';
import { createView } from './view.js';
import { chooseMode, createTransport } from './transport.js';
import { AGENTS, createMockServer } from './mock.js';

const FLASH_MS = 4000;

const timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id),
};

function newId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

document.title = t('app.title');

let model = initialModel();
let status = { state: 'connecting' };
const ui = { selected: null, newOpen: false, pane: 'list', flash: '', awaiting: null };

const ctx = { newId, now: () => Date.now() };
let view = null;
let queued = false;

function draw() {
  if (!queued) return;
  queued = false;
  if (ui.awaiting && model.sessions[ui.awaiting]) {
    ui.selected = ui.awaiting;
    ui.pane = 'chat';
    ui.awaiting = null;
  }
  view.render(model, ui, status);
}

// Перерисовка склеивает близкие события в один кадр. Вторая страховка — таймер: в скрытой
// вкладке requestAnimationFrame не вызывается, и модель, уже обновлённая потоком, не
// доходила бы до экрана; таймер вызывает то же самое, кто первый — тот и рисует.
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(draw);
  timers.set(draw, 60);
}

function flash(text) {
  ui.flash = text;
  render();
  timers.set(() => { ui.flash = ''; render(); }, FLASH_MS);
}

function send(kind, trace, step, input) {
  const ok = transport.send(makeEvent(kind, trace, step, input, ctx));
  if (!ok) flash(t('conn.send_failed'));
  return ok;
}

const handlers = {
  onSelect(trace) { ui.selected = trace; ui.pane = 'chat'; render(); },
  onBack() { ui.pane = 'list'; render(); },
  onNewToggle(open) { ui.newOpen = open; render(); },
  onCreate({ agent, name }) {
    const trace = newId();
    const count = Object.keys(model.sessions).length;
    const title = name || t('sessions.untitled', { n: count + 1 });
    if (send('session_created', trace, 0, { name: title, agent })) {
      ui.awaiting = trace;
      ui.newOpen = false;
      render();
    }
  },
  onSend(trace, text) {
    return send('user_message', trace, nextStep(model, trace), { turn: newId(), text });
  },
  onCancel(trace) {
    const session = model.sessions[trace];
    const open = session ? session.messages.filter((m) => m.role === 'agent' && m.status === 'streaming').at(-1) : undefined;
    send('cancel', trace, nextStep(model, trace), open ? { turn: open.turn } : {});
  },
  onDecide(trace, request, decision) {
    send('permission_decision', trace, nextStep(model, trace), { request, decision });
  },
};

view = createView(document, {
  app: document.getElementById('app'),
  side: document.getElementById('side'),
  main: document.getElementById('main'),
  status: document.getElementById('status'),
  overlay: document.getElementById('overlay'),
}, { agents: AGENTS, now: ctx.now, handlers });

const picked = chooseMode(location.search, location.protocol, location.host);
const transport = createTransport({
  mode: picked.mode,
  url: picked.url,
  server: picked.mode === 'mock' ? createMockServer({ now: ctx.now }) : undefined,
  WebSocketImpl: globalThis.WebSocket,
  timers,
  onEvent(event) {
    const next = reduce(model, event);
    if (next !== model) { model = next; render(); }
  },
  onStatus(next) { status = next; render(); },
});

transport.start();
render();

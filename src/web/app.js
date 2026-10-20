// app.js — вход страницы: связывает транспорт, редьюсер и рисование.
//
// Поток один: событие приходит из transport -> state.reduce даёт новую модель -> view рисует.
// Решения владельца (сообщение, отмена, разрешение, новая сессия) уходят событиями через тот же
// транспорт и появляются на экране, только когда вернутся в потоке: пульт состояния не хранит.
// Здесь живёт лишь то, чего в потоке нет по природе: какая сессия открыта на экране.

import {
  initialModel, reduce, makeEvent, nextStep, normalizeTheme, nextTheme, THEME_KEY,
} from './state.js';
import { t } from './strings.js';
import { createView } from './view.js';
import { chooseMode, createTransport, parseAgentRegistry } from './transport.js';
import {
  AGENTS, MODES, MODELS, EFFORTS, createMockServer,
} from './mock.js';

const FLASH_MS = 4000;
const TICK_MS = 1000;

const timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id),
};

function newId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Тема: выбор владельца живёт в localStorage (без внешних запросов); недоступное хранилище не ломает страницу.
function readTheme() {
  try { return normalizeTheme(globalThis.localStorage.getItem(THEME_KEY)); } catch { return 'system'; }
}
function saveTheme(value) {
  try {
    if (value === 'system') globalThis.localStorage.removeItem(THEME_KEY);
    else globalThis.localStorage.setItem(THEME_KEY, value);
  } catch { /* закрытое хранилище: выбор живёт до перезагрузки */ }
}
function applyTheme(value) {
  const root = document.documentElement;
  if (value === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value);
}

document.title = t('app.title');

let model = initialModel();
let status = { state: 'connecting' };
const ui = {
  selected: null, newOpen: false, newProject: '', pane: 'list', flash: '', flashTone: 'error', awaiting: null, theme: readTheme(), pins: {},
};
applyTheme(ui.theme);

const ctx = { newId, now: () => Date.now() };
let view = null;
let queued = false;
let transport = null;

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

function flash(text, tone = 'error') {
  ui.flash = text;
  ui.flashTone = tone;
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
  onNewToggle(open, project) { ui.newOpen = open; ui.newProject = open ? (project ?? '') : ''; render(); },
  onPin(trace, pinned) { ui.pins = { ...ui.pins, [trace]: pinned }; render(); },
  onTheme() {
    ui.theme = nextTheme(ui.theme);
    applyTheme(ui.theme);
    saveTheme(ui.theme);
    render();
  },
  onCopy(text) {
    const clip = globalThis.navigator && globalThis.navigator.clipboard;
    if (!clip || typeof clip.writeText !== 'function') { flash(t('chat.copy_failed')); return; }
    clip.writeText(text).then(() => flash(t('chat.copied'), 'info'), () => flash(t('chat.copy_failed')));
  },
  onCreate({ agent, name, project }) {
    const trace = newId();
    const count = Object.keys(model.sessions).length;
    const title = name || t('sessions.untitled', { n: count + 1 });
    const input = project ? { name: title, agent, project } : { name: title, agent };
    if (send('session_created', trace, 0, input)) {
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

const picked = chooseMode(location.search, location.protocol, location.host);
async function start() {
  let agents = AGENTS;
  let registryFailed = false;
  if (picked.mode === 'ws') {
    try {
      const response = await fetch('/api/agents', { cache: 'no-store' });
      if (!response.ok) throw new Error('agent registry unavailable');
      agents = parseAgentRegistry(await response.json());
    } catch {
      agents = [];
      registryFailed = true;
    }
  }
  view = createView(document, {
    app: document.getElementById('app'), side: document.getElementById('side'),
    main: document.getElementById('main'), rail: document.getElementById('rail'),
    status: document.getElementById('status'), overlay: document.getElementById('overlay'),
  }, { agents, modes: MODES, models: MODELS, efforts: EFFORTS, now: ctx.now, handlers, registryFailed });
  setInterval(() => view.tick(), TICK_MS);
  transport = createTransport({
    mode: picked.mode, url: picked.url,
    server: picked.mode === 'mock' ? createMockServer({ now: ctx.now }) : undefined,
    WebSocketImpl: globalThis.WebSocket, timers,
    onEvent(event) {
      const next = reduce(model, event);
      if (next !== model) { model = next; render(); }
    },
    onStatus(next) { status = next; render(); },
  });
  transport.start();
  render();
}
start();

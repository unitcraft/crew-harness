// app.js — вход страницы: связывает транспорт, редьюсер и рисование.
//
// Поток один: событие приходит из transport -> state.reduce даёт новую модель -> view рисует.
// Решения владельца (сообщение, отмена, разрешение, новая сессия) уходят событиями через тот же
// транспорт и появляются на экране, только когда вернутся в потоке: пульт состояния не хранит.
// Здесь живёт лишь то, чего в потоке нет по природе: какая сессия открыта на экране.

import {
  initialModel, reduce, makeEvent, nextStep, normalizeTheme, nextTheme, THEME_KEY, beginSwitch, undoSwitch,
} from './state.js';
import { t } from './strings.js';
import { createView } from './view.js';
import { createQueue } from './queue.js';
import { uploadImages, messageInput } from './attachments.js';
import { chooseMode, createTransport, parseAgentRegistry } from './transport.js';
import { createProjectsApi } from './projects-api.js';

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
  selected: null, newOpen: false, newProjectId: '', projects: null, pane: 'list', flash: '', flashTone: 'error', awaiting: null, theme: readTheme(), pins: {},
};
applyTheme(ui.theme);

const ctx = { newId, now: () => Date.now() };
let view = null;
let queued = false;
let transport = null;
// fetch берётся при каждом вызове: в режиме ?mock=1 страница подменяет globalThis.fetch уже после старта
const projectsApi = createProjectsApi(() => globalThis.fetch.bind(globalThis), t('projects.offline'));

async function loadProjects() {
  const r = await projectsApi.list();
  if (r.ok) ui.projects = r.projects;
  else if (ui.projects === null) flash(t('projects.load_failed', { reason: r.error }));
  render();
}

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

// Очередь «на потом» (Ctrl+Enter при работающем агенте): живёт только в странице, по сессиям, FIFO.
const queue = createQueue();

/** Ход закончился — следующее сообщение очереди уходит как обычная отправка; сессии нет в модели — очередь сброшена. */
function drain() {
  queue.prune(model.sessions);
  for (const trace of queue.traces()) {
    const text = queue.take(trace, model.sessions[trace]);
    if (text === undefined) continue;
    if (!send('user_message', trace, nextStep(model, trace), { turn: newId(), text })) queue.restore(trace, text);
  }
}

// Картинка сообщения уходит на сервер сырыми байтами (не через WebSocket: тот несёт строки, а мегабайт текстом хаб читал бы десятки секунд).
async function postImage(trace, item) {
  const response = await fetch(`/api/session-image/${encodeURIComponent(trace)}`, {
    method: 'POST', headers: { 'Content-Type': item.type }, body: item.blob, cache: 'no-store',
  });
  if (!response.ok) {
    let reason = `${response.status}`;
    try { reason = (await response.json()).error || reason; } catch { /* тело не JSON: остаётся код */ }
    throw new Error(reason);
  }
  const data = await response.json();
  return { n: data.n };
}

const handlers = {
  queued(trace) { return queue.count(trace); },
  onQueue(trace, text) {
    queue.push(trace, text);
    render();
    drain();
    return true;
  },
  onUnqueue(trace) { queue.popLast(trace); render(); },
  onSelect(trace) { ui.selected = trace; ui.pane = 'chat'; render(); },
  onBack() { ui.pane = 'list'; render(); },
  onNewToggle(open, projectId) { ui.newOpen = open; ui.newProjectId = open ? (projectId ?? '') : ''; render(); },
  onProjectsChanged() { loadProjects(); },
  onNotice(text, tone) { flash(text, tone); },
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
  onCreate({ agent, name, project, folder, branch }) {
    const trace = newId();
    const count = Object.keys(model.sessions).length;
    const title = name || t('sessions.untitled', { n: count + 1 });
    const input = { name: title, agent };
    // сессия внутри проекта: идентификатор проекта и папка — как в договорённости с сервером; имя проекта — для старого вида группы
    if (project) {
      input.project = project.name;
      input.project_id = project.id;
      if (folder) input.folder = folder;
      if (branch) input.branch = branch;
    }
    if (send('session_created', trace, 0, input)) {
      ui.awaiting = trace;
      ui.newOpen = false;
      render();
    }
  },
  // Без картинок — как раньше, сразу. С картинками — сначала они на сервер по очереди, потом сообщение с их номерами.
  onSend(trace, text, images = []) {
    if (images.length === 0) return send('user_message', trace, nextStep(model, trace), { turn: newId(), text });
    return uploadImages(trace, images, postImage).then((up) => {
      if (!up.ok) {
        flash(t('images.upload_failed', { name: up.name, reason: up.error }));
        return false;
      }
      return send('user_message', trace, nextStep(model, trace), messageInput(newId(), text, up.images));
    });
  },
  onCancel(trace) {
    const session = model.sessions[trace];
    const open = session ? session.messages.filter((m) => m.role === 'agent' && m.status === 'streaming').pop() : undefined;
    send('cancel', trace, nextStep(model, trace), open ? { turn: open.turn } : {});
  },
  onSwitchAgent(trace, agent) {
    // Страница не ждёт сервера: сразу показывает значения новой семьи (каталог), а не остатки прежней (задача 192o).
    model = beginSwitch(model, trace, agent);
    render();
    if (!send('session_agent', trace, nextStep(model, trace), { agent })) {
      model = undoSwitch(model, trace);
      render();
    }
  },
  onChoose(trace, setting, value) {
    send('session_setting', trace, nextStep(model, trace), { setting, value });
  },
  onAnswer(trace, answer) {
    return send('question_answer', trace, nextStep(model, trace), answer);
  },
  onDecide(trace, request, decision) {
    send('permission_decision', trace, nextStep(model, trace), { request, decision });
  },
};

// Любая ошибка запуска или обработки события — на экран блоком стража (boot-guard.js), а не молча в консоль.
function reportError(e) {
  const report = globalThis.__crewBootError;
  if (typeof report === 'function') report(e && e.message ? e.message : String(e));
  if (globalThis.console) globalThis.console.error(e);
}

const picked = chooseMode(location.search, location.protocol, location.host);
async function start() {
  // каркас страницы уже в index.html, модули загружены и выполняются: старт состоялся, а ожидание списка агентов и соединения — не повод для тревоги
  document.documentElement.setAttribute('data-booted', '1');
  // mock.js (заготовленный журнал) грузится ТОЛЬКО в режиме ?mock=1: реальной странице он не нужен, и сбой его загрузки её не роняет.
  let mock = null;
  let agents = [];
  if (picked.mode === 'mock') {
    mock = await import('./mock.js');
    agents = mock.AGENTS;
  }
  let registryFailed = false;
  if (picked.mode === 'mock') globalThis.fetch = mock.mockFetch(globalThis.fetch.bind(globalThis));
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
  }, { agents, now: ctx.now, handlers, registryFailed, imageSrc: mock ? mock.mockImageSrc : undefined, projectsApi });
  setInterval(() => view.tick(), TICK_MS);
  transport = createTransport({
    mode: picked.mode, url: picked.url,
    server: mock ? mock.createMockServer({ now: ctx.now }) : undefined,
    WebSocketImpl: globalThis.WebSocket, timers,
    onEvent(event) {
      try {
        const next = reduce(model, event);
        if (next !== model) { model = next; drain(); render(); }
      } catch (e) {
        reportError(e);
      }
    },
    onStatus(next) { status = next; render(); },
  });
  transport.start();
  loadProjects();
  render();
}
start().then(() => {
  // страж запуска (boot-guard.js) ждёт этот признак: нет его — показывает «Ошибка запуска», а не пустой экран
  document.documentElement.setAttribute('data-booted', '1');
  try { globalThis.sessionStorage.removeItem('crew-boot-retry'); } catch { /* хранилища нет: счётчик повтора не нужен */ }
}, reportError);

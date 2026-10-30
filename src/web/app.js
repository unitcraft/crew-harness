// app.js — вход страницы: связывает транспорт, редьюсер и рисование.
//
// Поток один: событие приходит из transport -> state.reduce даёт новую модель -> view рисует.
// Решения владельца (сообщение, отмена, разрешение, новая сессия) уходят событиями через тот же
// транспорт; сервер остаётся источником истории. Локальная копия delivery.js хранит текст до
// подтверждения, а не выдаёт запись в сокет за принятие сервером.

import {
  initialModel, reduce, makeEvent, nextStep, normalizeTheme, nextTheme, THEME_KEY, beginSwitch, undoSwitch,
  addDraft, dropDrafts, patchDraft, nameFromText,
} from './state.js';
import { waitingKeys, waitKey, SILENT_DEFAULT_MIN } from './attention.js';
import { createNotifier } from './notify.js';
import { t } from './strings.js';
import { createView } from './view.js';
import { createQueue } from './queue.js';
import { uploadImages, messageInput } from './attachments.js';
import { chooseMode, createTransport, parseAgentRegistry } from './transport.js';
import { createProjectsApi } from './projects-api.js';
import { routeSignal, normalizeRoute } from './routes.js';
import { crewSignal } from './crew-task.js';
import { createLoading } from './loading.js';
import { createDelivery, safeError } from './delivery.js';

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
// Переключатель Worktree новой сессии: по умолчанию выключен, последний выбор помнится на уровне пульта.
const WORKTREE_KEY = 'crew-console-draft-worktree';
function readWorktreePref() {
  try { return globalThis.localStorage.getItem(WORKTREE_KEY) === '1'; } catch { return false; }
}
function saveWorktreePref(on) {
  try { globalThis.localStorage.setItem(WORKTREE_KEY, on ? '1' : '0'); } catch { /* закрытое хранилище: выбор живёт до перезагрузки */ }
}
function applyTheme(value) {
  const root = document.documentElement;
  if (value === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value);
}

document.title = t('app.title');

// Внимание к сессии (задача 192.14): заголовок «(N) …», значок вкладки, уведомление и «динь»; выключатели помнятся в localStorage.
const notifier = createNotifier({
  doc: document, win: globalThis, storage: (() => { try { return globalThis.localStorage; } catch { return null; } })(),
  timers: { every: (fn, ms) => { const id = setInterval(fn, ms); return () => clearInterval(id); } },
  Notification: globalThis.Notification, AudioContext: globalThis.AudioContext || globalThis.webkitAudioContext,
  baseTitle: t('app.title'), blinkText: t('attn.tab_title'),
});

let model = initialModel();
const delivery = createDelivery((() => { try { return globalThis.localStorage; } catch { return null; } })());
// Pending first messages must remain reachable even if creation never reached the server.
for (const saved of delivery.sessions()) {
  if (model.sessions[saved.id]) continue;
  model = addDraft(model, { ...saved, now: saved.createdAt || Date.now() });
  model = patchDraft(model, saved.id, { route: saved.route, worktree: saved.worktree });
}
let status = { state: 'connecting' };
const UNREAD_KEY = 'crew-console-unread';
function readUnread() {
  try {
    const v = JSON.parse(globalThis.localStorage.getItem(UNREAD_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function saveUnread(value) {
  try { globalThis.localStorage.setItem(UNREAD_KEY, JSON.stringify(value)); } catch { /* закрытое хранилище: пометки живут до перезагрузки */ }
}
// ссылка на сессию (#s=<id>): после загрузки журнала страница её открывает
const linked = /^#s=(.+)$/.exec(globalThis.location ? globalThis.location.hash : '');
const ui = {
  selected: null, projects: null, pane: 'list', flash: '', flashTone: 'error', awaiting: linked ? decodeURIComponent(linked[1]) : null, theme: readTheme(), pins: {}, unread: readUnread(), acked: {}, silentMin: SILENT_DEFAULT_MIN, notify: { bell: notifier.bellOn(), sound: notifier.soundOn(), denied: false },
};
// A failed first create has no server row to select. Reopen its saved local copy on reload;
// an explicit session link always takes precedence. This never resends anything.
if (!ui.awaiting) {
  const recovery = delivery.sessions().at(-1);
  if (recovery) ui.awaiting = recovery.id;
}
applyTheme(ui.theme);

const ctx = { newId, now: () => Date.now() };
let view = null;
let queued = false;
let transport = null;
let presetInfo = null; // наборы с сервера (задача 192.12): {active, presets, roles}
let agentList = []; // семьи агентов: нужны, чтобы выбрать первую для черновика новой сессии
// fetch берётся при каждом вызове: в режиме ?mock=1 страница подменяет globalThis.fetch уже после старта
const projectsApi = createProjectsApi(() => globalThis.fetch.bind(globalThis), t('projects.offline'));
const loading = createLoading({ timers, projects: () => projectsApi.list(), changed() {
  ui.loading = loading.state;
  ui.projects = loading.state.projects.data;
  if (view) render();
} });
ui.loading = loading.state;

async function loadProjects() {
  await loading.loadProjects();
}

// Сессия, созданная первым сообщением, должна появиться. Таймаут не меняет её id: возможен поздний ответ.
const CREATE_WAIT_MS = 10000;
function watchCreated(trace) {
  timers.set(() => {
    if (model.sessions[trace] && !model.sessions[trace].draft) return;
    flash(t('chat.create_timeout', { n: CREATE_WAIT_MS / 1000 }));
    // Never invent a new session id on timeout: the old create may still arrive.
    ui.awaiting = null;
    ui.selected = trace;
    ui.pane = 'chat';
    render();
  }, CREATE_WAIT_MS);
}

function draw() {
  if (!queued) return;
  queued = false;
  // сессию удалили (здесь или в другом окне): открытый чат закрывается
  if (ui.selected && ui.selected !== ui.awaiting && !model.sessions[ui.selected]) { ui.selected = null; ui.pane = 'list'; }
  if (ui.awaiting && model.sessions[ui.awaiting]) {
    ui.selected = ui.awaiting;
    ui.pane = 'chat';
    ui.awaiting = null;
  }
  // открытая и видимая сессия, которая ждёт, считается замеченной: подсветка в списке гаснет
  const viewing = typeof document.hasFocus === 'function' ? document.hasFocus() && !document.hidden : !document.hidden;
  const opened = ui.selected ? model.sessions[ui.selected] : undefined;
  if (viewing && opened && !opened.draft) {
    const key = waitKey(opened);
    if (key !== '' && ui.acked[opened.id] !== key) ui.acked = { ...ui.acked, [opened.id]: key };
  }
  const all = Object.values(model.sessions);
  for (const x of all) { const m = x.routeState && x.routeState.crew ? x.routeState.crew.silentMinutes : -1; if (m >= 0) { ui.silentMin = m; break; } }
  const names = {};
  for (const x of all) names[x.id] = x.name;
  notifier.update(waitingKeys(all, ui.acked), names, ui.selected || '');
  ui.notify = { bell: notifier.bellOn(), sound: notifier.soundOn(), denied: ui.notify.denied };
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

function savedSession(trace) {
  const s = model.sessions[trace];
  return s ? { id: trace, agent: s.agent, projectId: s.projectId, project: s.project, folder: s.folder, branch: s.branch,
    route: normalizeRoute(s.route), worktree: s.worktree === true, createdAt: s.createdAt } : null;
}
function sendMessage(trace, text, images = [], retry = null) {
  const event = makeEvent('user_message', trace, nextStep(model, trace), messageInput(newId(), text, images), ctx);
  if (retry) { event.id = retry.id; event.input.turn = retry.clientTurn || event.input.turn; }
  else {
    if (!delivery.add(event, savedSession(trace))) {
      flash(t('delivery.storage'));
      return false;
    }
  }
  try {
    if (!transport.send(event)) delivery.failed(event.id, 'offline');
  } catch { delivery.unknown(event.id); }
  timers.set(() => { if (delivery.items(trace).some(r => r.id === event.id && r.state === 'sending')) { delivery.unknown(event.id); render(); } }, 10000);
  render();
  return true;
}

// Очередь сообщений (Enter при работающем агенте): живёт только в странице, по сессиям, FIFO.
const queue = createQueue();

/** Ход закончился — следующее сообщение очереди уходит как обычная отправка; сессии нет в модели — очередь сброшена. */
function drain() {
  queue.prune(model.sessions);
  for (const trace of queue.traces()) {
    const item = queue.take(trace, model.sessions[trace]);
    if (item === undefined) continue;
    // в очереди лежит { text, images }: картинки уходят на сервер при выдаче, а не при постановке
    const images = item.images ?? [];
    const delivered = handlers.onSend(trace, item.text, images);
    if (images.length === 0) {
      if (!delivered) queue.restore(trace, item);
    } else {
      Promise.resolve(delivered).then((ok) => { if (!ok) { queue.restore(trace, item); render(); } }, () => { queue.restore(trace, item); render(); });
    }
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
const signal = (trace, { kind, input }) => [kind, trace, nextStep(model, trace), input];

const handlers = {
  onRetryProjects() { loadProjects(); },
  onRetrySessions() { transport?.retry(); },
  deliveryItems(trace) { return delivery.items(trace); },
  onRetry(trace, id) {
    const session = model.sessions[trace];
    if (!session || session.draft || ['answering', 'permission'].includes(session.state)) return;
    const item = delivery.beginRetry(id);
    if (item) sendMessage(trace, item.text, [], item);
  },
  onForgetDelivery(id) { delivery.forget(id); render(); },
  queued(trace) { return queue.count(trace); },
  onQueue(trace, text, images = []) {
    queue.push(trace, { text, images });
    render();
    drain();
    return true;
  },
  onUnqueue(trace) { queue.popLast(trace); render(); },
  queuedItems(trace) { return queue.items(trace); },
  /** «Вернуть на редактирование»: сообщение уходит из очереди, страница кладёт его в поле. */
  onUnqueueAt(trace, index) {
    const item = queue.removeAt(trace, index);
    render();
    return item;
  },
  /** «Отправить сейчас»: сообщение первым в очереди, текущий ход отменяется, как кнопкой «Отмена хода»; дальше выдача сама. */
  onSendNow(trace, index) {
    queue.moveToFront(trace, index);
    handlers.onCancel(trace);
    render();
  },
  onSelect(trace) {
    ui.selected = trace;
    ui.pane = 'chat';
    if (ui.unread[trace]) { ui.unread = { ...ui.unread, [trace]: false }; saveUnread(ui.unread); }
    render();
  },
  async onBell() {
    const on = await notifier.setBell(!notifier.bellOn());
    ui.notify = { bell: on, sound: notifier.soundOn(), denied: !on && typeof globalThis.Notification === 'function' && globalThis.Notification.permission === 'denied' };
    render();
  },
  onSound() { notifier.setSound(!notifier.soundOn()); render(); },
  onUnread(trace, on) { ui.unread = { ...ui.unread, [trace]: on }; saveUnread(ui.unread); render(); },
  onMoveSession(trace, projectId) { send('session_move', trace, nextStep(model, trace), { project_id: projectId }); },
  onDeleteSession(trace, branch = '') { send('session_delete', trace, nextStep(model, trace), branch ? { branch } : {}); },
  onReorderSessions(ids) { if (ids.length > 0) send('session_reorder', ids[0], nextStep(model, ids[0]), { ids }); },
  // порядок проектов: страница показывает его сразу, сервер запоминает для всех страниц
  async onReorderProjects(ids) {
    const byId = new Map((ui.projects || []).map((p) => [p.id, p]));
    ui.projects = [...ids.map((id) => byId.get(id)).filter(Boolean), ...(ui.projects || []).filter((p) => !ids.includes(p.id))];
    render();
    const r = await projectsApi.order(ids);
    if (!r.ok) flash(t('projects.order_failed', { reason: r.error }));
    loadProjects();
  },
  onBack() { ui.pane = 'list'; render(); },
  // «+» у проекта: пустой чат новой сессии; на сервер она уходит с первым сообщением (задача 192)
  onNewToggle(open, projectId = '') {
    if (!open) {
      model = dropDrafts(model);
      if (ui.selected && !model.sessions[ui.selected]) ui.selected = null;
      render();
      return;
    }
    const project = (ui.projects || []).find((p) => p.id === projectId);
    const folder = project && project.folders[0] ? project.folders[0] : null;
    const agent = (agentList.find((a) => !a.disabled) || { id: '' }).id;
    const id = newId();
    model = addDraft(dropDrafts(model), {
      id, agent, projectId: project ? project.id : '', project: project ? project.name : '', folder: folder ? folder.path : '', branch: folder && folder.branch ? folder.branch : '', worktree: readWorktreePref(), now: Date.now(),
    });
    ui.selected = id;
    ui.pane = 'chat';
    render();
  },
  onDraftProject(trace, projectId) {
    const project = (ui.projects || []).find((p) => p.id === projectId);
    const folder = project && project.folders[0] ? project.folders[0] : null;
    model = patchDraft(model, trace, {
      projectId: project ? project.id : '', project: project ? project.name : '', folder: folder ? folder.path : '', branch: folder && folder.branch ? folder.branch : '',
    });
    render();
  },
  onDraftFolder(trace, path) {
    const d = model.sessions[trace];
    const project = d && (ui.projects || []).find((p) => p.id === d.projectId);
    const folder = project && project.folders.find((f) => f.path === path);
    if (folder) { model = patchDraft(model, trace, { folder: folder.path, branch: folder.branch || '' }); render(); }
  },
  onRename(trace, name) {
    const clean = String(name).trim();
    if (clean) send('session_rename', trace, nextStep(model, trace), { name: clean });
  },
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
  // Без картинок — как раньше, сразу. С картинками — сначала они на сервер по очереди, потом сообщение с их номерами.
  onSend(trace, text, images = []) {
    const draft = model.sessions[trace];
    let reserved = null;
    if (draft && draft.draft) {
      // Protect the first message before even creating its session (creation may fail too).
      const event = makeEvent('user_message', trace, 0, { text, turn: newId(), images: images.map(i => ({ name: i.name })) }, ctx);
      if (!delivery.add(event, savedSession(trace))) { flash(t('delivery.storage')); return false; }
      reserved = { id: event.id, clientTurn: event.input.turn };
      // первое сообщение черновика: сначала создаётся сессия (проект, папка, агент), потом уходит сообщение
      const folderInfo = (((ui.projects || []).find((p) => p.id === draft.projectId) || { folders: [] }).folders).find((f) => f.path === draft.folder);
      const treeOk = !(folderInfo && folderInfo.repo === false); // папка не git: сессия создаётся без дерева
      const input = { name: nameFromText(text) || t('sessions.new_name_placeholder'), agent: draft.agent, route: normalizeRoute(draft.route), worktree: draft.worktree !== false && treeOk };
      if (draft.preset) input.preset = draft.preset;
      if (draft.projectId) {
        input.project = draft.project;
        input.project_id = draft.projectId;
        if (draft.folder) input.folder = draft.folder;
        if (draft.branch) input.branch = draft.branch;
      }
      model = dropDrafts(model, trace);
      let created = false;
      try { created = send('session_created', trace, 0, input); } catch { delivery.unknown(reserved.id); return false; }
      if (!created) {
        delivery.failed(reserved.id, 'offline');
        model = { ...model, sessions: { ...model.sessions, [trace]: draft } };
        render();
        return false;
      }
      ui.awaiting = trace;
      watchCreated(trace);
    }
    if (images.length === 0) return sendMessage(trace, text, [], reserved);
    return uploadImages(trace, images, postImage).then((up) => {
      if (!up.ok) {
        flash(t('images.upload_failed', { name: up.name, reason: safeError(up.error) }));
        if (reserved) delivery.failed(reserved.id, up.error);
        else {
          const event = makeEvent('user_message', trace, nextStep(model, trace), { text, images: images.map(i => ({ name: i.name })) }, ctx);
          if (delivery.add(event, savedSession(trace))) delivery.failed(event.id, up.error);
        }
        render();
        return false;
      }
      return sendMessage(trace, text, up.images, reserved);
    });
  },
  onCancel(trace) {
    const session = model.sessions[trace];
    const open = session ? session.messages.filter((m) => m.role === 'agent' && m.status === 'streaming').pop() : undefined;
    send('cancel', trace, nextStep(model, trace), open ? { turn: open.turn } : {});
  },
  onSwitchAgent(trace, agent) {
    if (model.sessions[trace] && model.sessions[trace].draft) { model = patchDraft(model, trace, { agent }); render(); return; }
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
  // Режимы работы по методике (задача 192p): сигналы серверу; состояние вернётся событием route_state.
  onRoute(trace, route) {
    // черновик новой сессии: режим выбирается на странице и уходит с первым сообщением
    if (model.sessions[trace] && model.sessions[trace].draft) { model = patchDraft(model, trace, { route: normalizeRoute(route) }); render(); return; }
    send(...signal(trace, routeSignal.set(route)));
  },
  onDraftPreset(trace, name) { model = patchDraft(model, trace, { preset: name }); render(); },
  onSessionPreset(trace, name) { send('session_preset', trace, nextStep(model, trace), { preset: name }); },
  onDraftWorktree(trace, on) { saveWorktreePref(on === true); model = patchDraft(model, trace, { worktree: on === true }); render(); },
  onWorktree(trace, on) { send(...signal(trace, routeSignal.worktree(on))); },
  onResultRepo(trace, repoId) { send(...signal(trace, routeSignal.resultRepo(repoId))); },
  onRouteRun(trace) { send(...signal(trace, routeSignal.run())); },
  onRouteSkip(trace, step) { send(...signal(trace, routeSignal.skip(step))); },
  onRouteStop(trace) { send(...signal(trace, routeSignal.stop())); },
  onRouteSubtaskNew(trace) { send(...signal(trace, routeSignal.subtaskNew())); },
  onRouteSubtaskSame(trace) { send(...signal(trace, routeSignal.subtaskSame())); },
  onRouteSubtaskWorktree(trace, n) { send(...signal(trace, routeSignal.subtaskWorktree(n))); },
  onRouteSubtaskDone(trace, n) { send(...signal(trace, routeSignal.subtaskDone(n))); },
  onRouteNewTask(trace) { send(...signal(trace, routeSignal.newTask())); },
  // «Слить в main» — слово владельца на push в origin/main (хаб сам коммитит оставленное агентом одним коммитом, тесты не гоняет)
  onRouteMerge(trace) { send(...signal(trace, routeSignal.merge())); },
  // Отладочное состояние машины (задача 192.1): явный запрос; ответ вернётся событием machine_state, в журнал оно не пишется.
  onMachineGet(trace) { if (model.sessions[trace] && !model.sessions[trace].draft) send('machine_state_get', trace, nextStep(model, trace), {}); },
  // Состав запроса к агенту (задача 192.11): явный запрос хода; ответ вернётся событием turn_request, в журнал оно не пишется.
  onRequestGet(trace, turn) { if (model.sessions[trace] && !model.sessions[trace].draft) send('request_get', trace, nextStep(model, trace), { turn }); },
  onRouteTestsRun(trace) { send(...signal(trace, routeSignal.testsRun())); },
  onRouteTreeDrop(trace, force) { send(...signal(trace, routeSignal.treeDrop(force))); },
  onRouteSubtaskParallel(trace, n, on) { send(...signal(trace, routeSignal.subtaskParallel(n, on))); },
  // Распознавание задач (задача 192.2): кнопка «Распознать задачи», кнопки карточек, быстрый ответ
  onCrewRecognize(trace) { send(...signal(trace, crewSignal.recognize())); },
  onExtUndo(trace, id) { send(...signal(trace, crewSignal.extUndo(id))); },
  onCrewProp(trace, id, action, opts) { send(...signal(trace, crewSignal.prop(id, action, opts))); },
  onChildrenMerge(trace) { send(...signal(trace, crewSignal.childrenMerge())); },
  onCrewApply(trace, items) { send(...signal(trace, crewSignal.apply(items))); },
  onRouteSubtaskChoose(trace, n, tree) { send(...signal(trace, routeSignal.subtaskChoose(n, tree))); },
  // «Закончить задачу»: переключить режим и сразу прогнать шаги окончания — два сигнала подряд, шаг события у каждого свой
  onRouteFinish(trace, route) {
    if (!send(...signal(trace, routeSignal.set(route)))) return;
    send('route_run', trace, nextStep(model, trace) + 1, {});
  },
  onNotice(text) { flash(text, 'info'); },
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
  const registryFailed = false;
  if (picked.mode === 'mock') globalThis.fetch = mock.mockFetch(globalThis.fetch.bind(globalThis));
  agentList = agents;
  // задача 192.12: наборы «роль → семья, модель, усилие» (GET /api/presets); без ответа выбора набора нет
  // Эти справочники не задерживают ни каркас, ни загрузку проектов и сессий.
  fetch('/api/presets', { cache: 'no-store' }).then(async (response) => {
    if (response.ok) { presetInfo = await response.json(); render(); }
  }).catch(() => { /* выбор набора просто не показывается */ });
  view = createView(document, {
    app: document.getElementById('app'), side: document.getElementById('side'),
    main: document.getElementById('main'), rail: document.getElementById('rail'),
    status: document.getElementById('status'), overlay: document.getElementById('overlay'),
  }, { agents, now: ctx.now, handlers, registryFailed, registryPending: picked.mode === 'ws', imageSrc: mock ? mock.mockImageSrc : undefined, projectsApi, presets: () => presetInfo });
  if (picked.mode === 'ws') {
    fetch('/api/agents', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('agent registry unavailable');
      const next = parseAgentRegistry(await response.json());
      view.setAgents(next, false); agentList = next; render();
    }).catch(() => { view.setAgents([], true); agentList = []; render(); });
  }
  setInterval(() => view.tick(), TICK_MS);
  setInterval(() => render(), 30000); // «молчит N мин» в списке обновляется сам
  document.addEventListener('visibilitychange', () => { notifier.visibilityChanged(); render(); });
  globalThis.addEventListener('focus', () => { notifier.visibilityChanged(); render(); });
  globalThis.addEventListener('blur', () => notifier.visibilityChanged());
  transport = createTransport({
    mode: picked.mode, url: picked.url,
    server: mock ? mock.createMockServer({ now: ctx.now, machines: true }) : undefined,
    WebSocketImpl: globalThis.WebSocket, timers,
    onEvent(event) {
      try {
        if (event.kind === 'message_delivery') { delivery.receipt(event.input); render(); }
        if (event.kind === 'error' && event.input) delivery.error(event);
        const next = reduce(model, event);
        if (next !== model) { model = next; drain(); render(); }
        delivery.reconcile(model);
      } catch (e) {
        reportError(e);
      }
    },
    onStatus(next) { status = next; if (next.state === 'retry') delivery.disconnected(); render(); },
    onSnapshot(phase, ids) {
      if (phase === 'loading') {
        if (loading.state.sessions.data !== null) loadProjects();
        loading.sessionsStart();
      }
      else if (phase === 'error') loading.sessionsError();
      else {
        // Удалённые за время разрыва сессии исчезают только после полного снимка.
        if (ids) {
          const keep = new Set(ids);
          model = { ...model, sessions: Object.fromEntries(Object.entries(model.sessions).filter(([id, s]) => s.draft || keep.has(id))) };
        }
        loading.sessionsReady();
      }
    },
  });
  transport.start();
  loadProjects();
  render();
  globalThis.addEventListener('pagehide', () => { loading.stop(); transport.stop(); }, { once: true });
}
start().then(() => {
  // страж запуска (boot-guard.js) ждёт этот признак: нет его — показывает «Ошибка запуска», а не пустой экран
  document.documentElement.setAttribute('data-booted', '1');
  try { globalThis.sessionStorage.removeItem('crew-boot-retry'); } catch { /* хранилища нет: счётчик повтора не нужен */ }
}, reportError);

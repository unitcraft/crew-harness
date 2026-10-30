import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoading } from '../loading.js';
import { createView } from '../view.js';
import { initialModel, reduce } from '../state.js';
import { createFakeDocument } from './fake-dom.mjs';

function clock() {
  const jobs = new Map(); let id = 0;
  return { set(fn) { jobs.set(++id, fn); return id; }, clear(id) { jobs.delete(id); },
    flush() { for (const [id, fn] of [...jobs]) { jobs.delete(id); fn(); } }, pending: () => jobs.size };
}
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('проекты: pending отличается от пустого успеха; повторы и устаревшие ответы безопасны', async () => {
  const timers = clock(); const requests = [];
  const load = createLoading({ timers, changed() {}, projects: () => { const d = deferred(); requests.push(d); return d.promise; } });
  const first = load.loadProjects();
  assert.equal(load.state.projects.phase, 'loading');
  assert.equal(load.state.projects.data, null);
  timers.flush(); assert.equal(load.state.projects.slow, true);
  const second = load.loadProjects();
  requests[1].resolve({ ok: true, projects: [] }); await second;
  assert.equal(load.state.projects.phase, 'ready');
  requests[0].resolve({ ok: true, projects: [{ id: 'old' }] }); await first;
  assert.deepEqual(load.state.projects.data, []);
  assert.equal(timers.pending(), 0);
});

test('ошибка проектов и повтор независимы от сессий; обновление хранит данные', async () => {
  const timers = clock(); let response = { ok: false, error: 'недоступно' };
  const load = createLoading({ timers, changed() {}, projects: async () => response });
  load.sessionsStart(); load.sessionsReady();
  await load.loadProjects();
  assert.equal(load.state.projects.phase, 'error');
  assert.equal(load.state.sessions.phase, 'ready');
  response = { ok: true, projects: [{ id: 'p' }] }; await load.loadProjects();
  load.sessionsStart();
  assert.equal(load.state.sessions.refreshing, true);
  assert.deepEqual(load.state.projects.data, [{ id: 'p' }]);
  load.stop(); assert.equal(timers.pending(), 0);
});

test('сессии: медленный ответ не становится успехом; ошибка и повтор сохраняют готовность прошлого списка', () => {
  const timers = clock(); const load = createLoading({ timers, changed() {}, projects() {} });
  load.sessionsStart(); timers.flush();
  assert.equal(load.state.sessions.phase, 'loading');
  assert.equal(load.state.sessions.slow, true);
  load.sessionsReady(); load.sessionsStart(); load.sessionsError();
  assert.equal(load.state.sessions.phase, 'error');
  assert.equal(load.state.sessions.refreshing, true);
  load.sessionsStart(); load.sessionsReady();
  assert.equal(load.state.sessions.phase, 'ready');
  assert.equal(timers.pending(), 0);
});

test('остановка игнорирует незавершённый HTTP-ответ и очищает оба таймера', async () => {
  const timers = clock(); const response = deferred(); let changes = 0;
  const load = createLoading({ timers, changed() { changes += 1; }, projects: () => response.promise });
  const pending = load.loadProjects(); load.sessionsStart();
  load.stop(); const before = changes;
  response.resolve({ ok: true, projects: [] }); await pending;
  assert.equal(changes, before); assert.equal(timers.pending(), 0);
});

test('вид: нет ложного empty, готовые проекты видны до сессий, retry вызывает нужный обработчик', () => {
  const doc = createFakeDocument(); const refs = {};
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[key] = doc.createElement('div'); doc.body.append(refs[key]);
  }
  let retried = '';
  const view = createView(doc, refs, { agents: [], now: () => 0, handlers: {
    queued: () => 0, queuedItems: () => [],
    onRetryProjects() { retried = 'projects'; }, onRetrySessions() { retried = 'sessions'; },
  } });
  const timers = clock(); const load = createLoading({ timers, changed() {}, projects() {} });
  const ui = { projects: null, loading: load.state, selected: null, pins: {}, theme: 'system' };
  let model = initialModel();
  const draw = () => view.render(model, ui, { state: 'connected' });
  draw();
  const empty = refs.side.querySelectorAll('.empty').find((n) => n.textContent.includes('Сессий пока нет'));
  assert.equal(empty.hidden, true);
  assert.equal(refs.side.querySelectorAll('.load-skeleton').length, 4);
  assert.match(refs.status.textContent, /Загружаем проекты и сессии/);
  ui.projects = [{ id: 'p', name: 'Готовый проект', folders: [] }];
  load.state.projects = { phase: 'ready', data: ui.projects };
  draw();
  assert.match(refs.side.textContent, /Готовый проект/);
  assert.doesNotMatch(refs.side.querySelector('.groups').textContent, /В этом проекте пока нет/);
  load.sessionsError(); draw();
  refs.side.querySelector('.load-source button').click();
  assert.equal(retried, 'sessions');
  model = reduce(model, { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'Сохранённая', project_id: 'p' } });
  ui.selected = 's'; load.sessionsReady(); draw();
  load.sessionsStart(); draw();
  assert.match(refs.side.textContent, /Сохранённая/);
  assert.equal(ui.selected, 's');
  assert.match(refs.status.textContent, /Обновляем/);
  load.stop();
});

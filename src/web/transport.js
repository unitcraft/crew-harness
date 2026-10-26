// transport.js — откуда берутся события и куда уходят решения владельца.
//
// Два режима за одним лицом { start, send, stop }:
//   mock — воспроизведение заглушки (mock.js) без сервера, по ?mock=1;
//   ws   — WebSocket к /ws сервиса: события приходят JSON-ом (одно или массив), решения
//          уходят JSON-ом. Пульт не хранит состояния: исходящее событие рисуется, только когда
//          сервер вернёт его в потоке (заглушка делает то же самое).
// Часы, таймеры и класс сокета приходят снаружи, чтобы разрыв и повтор проверялись под Node.
//
// Статусы (onStatus): { state: 'connecting' | 'connected' | 'mock' | 'nofile' } и
// { state: 'retry', seconds } — обратный отсчёт до следующей попытки.

/** Ступени ожидания между попытками, секунды; успех возвращает на первую. */
export const RETRY_STEPS = Object.freeze([2, 5, 10, 30]);

// Сигналы режимов работы (задача 192p): любой из них снимает идущий прогон шагов заглушки и ставит свой ответ.
const ROUTE_SIGNALS = ['session_route', 'route_run', 'route_skip', 'route_stop', 'route_subtask_new', 'route_subtask_same', 'route_subtask_worktree', 'route_subtask_done', 'route_new_task',
  'route_merge', 'route_tests_run', 'route_tree_drop', 'session_worktree', 'route_subtask_parallel', 'route_subtask_choose'];

/** Выбор режима по адресу страницы. Чистая функция, чтобы проверяться без браузера. */
export function chooseMode(search, protocol, host) {
  const params = new URLSearchParams(search);
  if (params.get('mock') === '1') return { mode: 'mock' };
  if (protocol === 'http:' || protocol === 'https:') {
    return { mode: 'ws', url: `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws` };
  }
  return { mode: 'nofile' };
}

/** Keep only public registry fields; command details never enter the page. */
export function parseAgentRegistry(payload) {
  if (!payload || !Array.isArray(payload.agents)) return [];
  return payload.agents.flatMap((entry) => {
    if (!entry || typeof entry.id !== 'string' || typeof entry.label !== 'string') return [];
    const id = entry.id.trim();
    const label = entry.label.trim();
    return id && label ? [{ id, label }] : [];
  });
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param deps.mode           'mock' | 'ws' | 'nofile'
 * @param deps.server         (mock) createMockServer(...)
 * @param deps.url            (ws) адрес сокета
 * @param deps.WebSocketImpl  (ws) класс сокета
 * @param deps.timers         { set(fn, ms) -> id, clear(id) }
 * @param deps.onEvent        (событие) => void
 * @param deps.onStatus       (статус) => void
 */
export function createTransport(deps) {
  const { mode, server, url, WebSocketImpl, timers, onEvent, onStatus } = deps;

  // ---- заглушка ----
  const scheduled = new Map(); // id таймера -> trace

  function schedule(entries) {
    for (const { delay, event, tag } of entries) {
      const id = timers.set(() => { scheduled.delete(id); onEvent(event); }, delay);
      scheduled.set(id, tag ?? event.trace);
    }
  }

  function dropScheduled(trace) {
    for (const [id, tr] of [...scheduled]) {
      if (tr === trace) { timers.clear(id); scheduled.delete(id); }
    }
  }

  function startMock() {
    onStatus({ state: 'mock' });
    for (const event of server.journal()) onEvent(event);
  }

  function sendMock(event) {
    // Отмена хода снимает всё, что заглушка ещё не успела «сказать» по этой цепочке.
    if (event.kind === 'cancel') dropScheduled(event.trace);
    // Прогон шагов режима (задача 192p) живёт под своей меткой: смена режима, пропуск и остановка снимают только его.
    if (ROUTE_SIGNALS.includes(event.kind)) dropScheduled(`${event.trace}#route`);
    schedule(server.handle(event));
    return true;
  }

  // ---- сокет ----
  let socket = null;
  let attempt = 0;
  let timer = null;
  let stopped = false;

  function connect() {
    timer = null;
    onStatus({ state: 'connecting' });
    const ws = new WebSocketImpl(url);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      onStatus({ state: 'connected' });
    };
    ws.onmessage = (message) => {
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      const list = Array.isArray(data) ? data : [data];
      for (const e of list) if (isObject(e)) onEvent(e);
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      if (!stopped) countdown(RETRY_STEPS[Math.min(attempt, RETRY_STEPS.length - 1)]);
      attempt += 1;
    };
    ws.onerror = () => {}; // за ошибкой всегда следует close; повтор заводит он
  }

  function countdown(seconds) {
    onStatus({ state: 'retry', seconds });
    timer = timers.set(() => {
      if (seconds <= 1) connect();
      else countdown(seconds - 1);
    }, 1000);
  }

  function sendSocket(event) {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify(event));
    return true;
  }

  // ---- лицо ----
  return {
    start() {
      if (mode === 'mock') startMock();
      else if (mode === 'ws') connect();
      else onStatus({ state: 'nofile' });
    },
    send(event) {
      if (mode === 'mock') return sendMock(event);
      if (mode === 'ws') return sendSocket(event);
      return false;
    },
    stop() {
      stopped = true;
      if (timer !== null) { timers.clear(timer); timer = null; }
      for (const id of scheduled.keys()) timers.clear(id);
      scheduled.clear();
      if (socket) { const ws = socket; socket = null; ws.close(); }
    },
  };
}

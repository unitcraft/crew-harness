// state.js — чистый редьюсер: событие -> модель вида. Ни DOM, ни часов, ни случайности.
//
// Зачем отдельно: страница только рисует поток событий; всё, что решает «что на экране»,
// живёт здесь и проверяется под Node без браузера (test/state.test.mjs). Один и тот же
// журнал событий всегда даёт один и тот же вид — потому заглушка и настоящий сервер
// взаимозаменяемы, а повтор события (тот же id) безвреден.
//
// Событие самодостаточно: { id, trace, step, kind, input, time }.
//   id     — уникальный код события; повтор с тем же id игнорируется
//   trace  — цепочка событий, для пульта это id сессии
//   step   — номер шага в цепочке; куски ответа склеиваются в порядке step, а не прибытия
//   kind   — вид из KINDS
//   input  — данные вида (объект)
//   time   — момент, миллисекунды эпохи

// Чистые функции списка, ленты и подписей живут в lists.js; снаружи всё берётся отсюда.
export * from './lists.js';

export const KINDS = Object.freeze([
  'session_created', 'user_message', 'agent_chunk', 'agent_done', 'agent_refused',
  'permission_request', 'permission_decision', 'cancel', 'error',
  // задача 094: рабочие события хода (соответствуют ACP session/update)
  'usage_update', 'tool_call', 'tool_call_update', 'output_file', 'file_diff',
  'background_task', 'background_task_update',
  'session_model', 'agent_switched',
]);

export const TOOL_KINDS = Object.freeze(['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'other']);
// cancelled ставит редьюсер сам при отмене хода; из потока он тоже принимается
export const TOOL_STATUSES = Object.freeze(['pending', 'in_progress', 'completed', 'failed', 'cancelled']);
export const FILE_KINDS = Object.freeze(['create', 'edit', 'delete']);
export const TASK_STATUSES = Object.freeze(['running', 'completed', 'failed', 'stopped']);

/** Ключ localStorage для выбора темы: 'system' | 'light' | 'dark'. */
export const THEME_KEY = 'crew-console-theme';

// Ключи подписей состояний в strings.js — полными литералами, чтобы проверка «все ключи
// использованы» видела их без догадок.
export const STATE_KEYS = Object.freeze({
  idle: 'state.idle',
  answering: 'state.answering',
  permission: 'state.permission',
  refused: 'state.refused',
  error: 'state.error',
  cancelled: 'state.cancelled',
});

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function isEvent(e) {
  return isObject(e)
    && typeof e.id === 'string' && e.id.length > 0
    && typeof e.trace === 'string' && e.trace.length > 0
    && Number.isInteger(e.step) && e.step >= 0
    && typeof e.kind === 'string'
    && isObject(e.input)
    && typeof e.time === 'number' && Number.isFinite(e.time);
}

export function initialModel() {
  return { sessions: {}, seen: {} };
}

/** Собрать исходящее событие владельца. Часы и генератор id приходят снаружи. */
export function makeEvent(kind, trace, step, input, { newId, now }) {
  return { id: newId(), trace, step, kind, input, time: now() };
}

/** Следующий номер шага в цепочке: сразу за самым большим виденным. */
export function nextStep(model, trace) {
  const s = model.sessions[trace];
  return s ? s.lastStep + 1 : 0;
}

/** Сессии для списка: свежие сверху, при равенстве — по id, чтобы порядок не плавал. */
export function sessionList(model) {
  return Object.values(model.sessions).sort((a, b) => (b.updatedAt - a.updatedAt) || (a.id < b.id ? -1 : 1));
}

// ---- ход рассуждения редьюсера -------------------------------------------------------

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);

// Выбор, который агент отдаёт по ACP (задача 192): модели, усилие, режимы. Чего агент не отдал — пустой список, кнопки нет.
const choiceList = (v) => (Array.isArray(v)
  ? v.filter((c) => isObject(c) && typeof c.id === 'string' && c.id).map((c) => ({ id: c.id, name: str(c.name, c.id), description: str(c.description) }))
  : []);

export function optionsOf(input) {
  return {
    models: choiceList(input.models),
    modelId: str(input.model_id),
    efforts: choiceList(input.efforts),
    effort: str(input.effort),
    effortName: str(input.effort_name),
    modes: choiceList(input.modes),
    mode: str(input.mode),
  };
}

export const NO_OPTIONS = Object.freeze(optionsOf({}));

const userKey = (turn) => `u:${turn}`;
const agentKey = (turn) => `a:${turn}`;
const permKey = (request) => `p:${request}`;

function newAgentMessage(turn) {
  return { key: agentKey(turn), role: 'agent', turn, text: '', chunks: [], status: 'streaming', reason: '', doneAt: 0 };
}

const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const count = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function parseCost(v) {
  if (isObject(v) && Number.isFinite(v.amount)) return { amount: v.amount, currency: str(v.currency) };
  if (Number.isFinite(v)) return { amount: v, currency: '' };
  return null;
}

/** Сообщение агента по ходу: найти или (если его user_message потерялся) завести. */
function agentMessageFor(messages, turn) {
  const key = agentKey(turn);
  const i = messages.findIndex((m) => m.key === key);
  return i >= 0 ? { index: i, message: messages[i] } : { index: -1, message: newAgentMessage(turn) };
}

function putMessage(messages, index, message) {
  if (index >= 0) return messages.map((m, i) => (i === index ? message : m));
  return [...messages, message];
}

const live = (session) => session.state === 'answering' || session.state === 'permission';

function lastTurn(session) {
  for (let i = session.messages.length - 1; i >= 0; i -= 1) {
    if (session.messages[i].role === 'agent') return session.messages[i].turn;
  }
  return '';
}

function apply(session, event) {
  const { input } = event;
  const turn = str(input.turn) || lastTurn(session);

  switch (event.kind) {
    case 'session_model': {
      if (event.step <= session.modelStep) return session;
      return { ...session, model: str(input.model), options: optionsOf(input), modelStep: event.step };
    }
    case 'agent_switched': {
      // смена семьи в окне (задача 192): тот же разговор, другой агент; строка в ленте говорит, что и как передано
      const key = `sw:${event.id}`;
      if (session.messages.some((m) => m.key === key)) return session;
      const total = Number.isInteger(input.total) ? input.total : 0;
      const shown = Number.isInteger(input.shown) ? input.shown : total;
      return {
        ...session,
        agent: str(input.to, session.agent),
        messages: [...session.messages, { role: 'switch', key, from: str(input.from), to: str(input.to), shown, total, cut: input.cut === 1 }],
      };
    }
    case 'user_message': {
      const userTurn = str(input.turn, event.id);
      const user = { key: userKey(userTurn), role: 'user', turn: userTurn, text: str(input.text) };
      if (session.messages.some((m) => m.key === user.key)) return session;
      return {
        ...session,
        state: 'answering',
        pending: null,
        turnStartedAt: event.time,
        messages: [...session.messages, user, newAgentMessage(userTurn)],
      };
    }

    case 'agent_chunk': {
      const { index, message } = agentMessageFor(session.messages, turn);
      if (message.status !== 'streaming') return session; // кусок после отмены/отказа/конца — запоздалый
      if (message.chunks.some((c) => c.step === event.step)) return session; // другой id, тот же шаг: уже есть
      const chunks = [...message.chunks, { step: event.step, text: str(input.text) }].sort((a, b) => a.step - b.step);
      return {
        ...session,
        state: session.state === 'permission' ? 'permission' : 'answering',
        messages: putMessage(session.messages, index, { ...message, chunks, text: chunks.map((c) => c.text).join('') }),
      };
    }

    case 'agent_done': {
      const { index, message } = agentMessageFor(session.messages, turn);
      if (message.status !== 'streaming') return session;
      return {
        ...session,
        state: 'idle',
        pending: null,
        messages: putMessage(session.messages, index, { ...message, status: 'done', doneAt: event.time }),
      };
    }

    case 'agent_refused': {
      const { index, message } = agentMessageFor(session.messages, turn);
      if (message.status !== 'streaming') return session;
      return {
        ...session,
        state: 'refused',
        pending: null,
        messages: putMessage(session.messages, index, { ...message, status: 'refused', reason: str(input.reason) }),
      };
    }

    case 'permission_request': {
      const request = str(input.request, event.id);
      const key = permKey(request);
      if (session.messages.some((m) => m.key === key)) return session;
      const entry = { request, turn, action: str(input.action), detail: str(input.detail) };
      return {
        ...session,
        state: 'permission',
        pending: entry,
        messages: [...session.messages, { key, role: 'permission', ...entry, step: event.step, decision: null }],
      };
    }

    case 'permission_decision': {
      const request = str(input.request);
      const decision = input.decision;
      if (decision !== 'allow' && decision !== 'deny') return session;
      const i = session.messages.findIndex((m) => m.key === permKey(request));
      if (i < 0 || session.messages[i].decision !== null) return session;
      const messages = session.messages.map((m, j) => (j === i ? { ...m, decision } : m));
      const closes = session.pending !== null && session.pending.request === request;
      return {
        ...session,
        messages,
        pending: closes ? null : session.pending,
        state: closes ? 'answering' : session.state,
      };
    }

    case 'cancel': {
      if (!live(session)) return session;
      const messages = session.messages.map((m) => {
        if (m.role === 'agent' && m.status === 'streaming') return { ...m, status: 'cancelled' };
        if (m.role === 'permission' && m.decision === null) return { ...m, decision: 'cancelled' };
        return m;
      });
      const tools = session.tools.map((x) => (x.status === 'pending' || x.status === 'in_progress' ? { ...x, status: 'cancelled' } : x));
      const tasks = session.tasks.map((x) => (x.status === 'running' ? { ...x, status: 'stopped', finishedAt: event.time } : x));
      return { ...session, state: 'cancelled', pending: null, messages, tools, tasks };
    }

    case 'usage_update': {
      const { used, size } = input;
      if (!Number.isFinite(used) || used < 0 || !Number.isFinite(size) || size <= 0) return session;
      if (session.usage && event.step < session.usage.step) return session;
      return { ...session, usage: { used, size, cost: parseCost(input.cost), step: event.step } };
    }

    case 'tool_call': {
      const id = str(input.id);
      if (!id || session.tools.some((x) => x.id === id)) return session;
      const tool = {
        id,
        turn,
        step: event.step,
        updatedStep: event.step,
        title: str(input.title, id),
        kind: pick(input.kind, TOOL_KINDS, 'other'),
        status: pick(input.status, TOOL_STATUSES, 'pending'),
        detail: str(input.detail),
      };
      return { ...session, tools: [...session.tools, tool] };
    }

    case 'tool_call_update': {
      const i = session.tools.findIndex((x) => x.id === str(input.id));
      if (i < 0 || event.step <= session.tools[i].updatedStep) return session;
      const old = session.tools[i];
      const status = pick(input.status, TOOL_STATUSES, old.status);
      const detail = typeof input.detail === 'string' ? input.detail : old.detail;
      if (status === old.status && detail === old.detail) return session;
      return { ...session, tools: session.tools.map((x, j) => (j === i ? { ...old, status, detail, updatedStep: event.step } : x)) };
    }

    case 'output_file': {
      const path = str(input.path);
      if (!path) return session;
      const kind = pick(input.kind, FILE_KINDS, 'edit');
      const i = session.outputs.findIndex((x) => x.path === path);
      if (i < 0) return { ...session, outputs: [...session.outputs, { path, kind, step: event.step }] };
      const old = session.outputs[i];
      const merged = old.kind === 'create' && kind === 'edit' ? 'create' : kind;
      if (merged === old.kind) return session;
      return { ...session, outputs: session.outputs.map((x, j) => (j === i ? { ...old, kind: merged } : x)) };
    }

    case 'file_diff': {
      const path = str(input.path);
      if (!path) return session;
      const entry = { path, added: count(input.added), removed: count(input.removed), step: event.step, turn };
      const i = session.diffs.findIndex((x) => x.path === path);
      if (i < 0) return { ...session, diffs: [...session.diffs, entry] };
      if (event.step < session.diffs[i].step) return session;
      return { ...session, diffs: session.diffs.map((x, j) => (j === i ? entry : x)) };
    }

    case 'background_task': {
      const id = str(input.id);
      if (!id || session.tasks.some((x) => x.id === id)) return session;
      const status = pick(input.status, TASK_STATUSES, 'running');
      const task = {
        id,
        turn,
        step: event.step,
        updatedStep: event.step,
        title: str(input.title, id),
        status,
        started: Number.isFinite(input.started) ? input.started : event.time,
        finishedAt: status === 'running' ? null : event.time,
      };
      return { ...session, tasks: [...session.tasks, task] };
    }

    case 'background_task_update': {
      const i = session.tasks.findIndex((x) => x.id === str(input.id));
      if (i < 0 || event.step <= session.tasks[i].updatedStep) return session;
      if (!TASK_STATUSES.includes(input.status)) return session;
      const old = session.tasks[i];
      const finishedAt = input.status === 'running' ? null : event.time;
      return { ...session, tasks: session.tasks.map((x, j) => (j === i ? { ...old, status: input.status, finishedAt, updatedStep: event.step } : x)) };
    }

    case 'error': {
      const { index, message } = agentMessageFor(session.messages, turn);
      const messages = turn && message.status === 'streaming'
        ? putMessage(session.messages, index, { ...message, status: 'error', reason: str(input.message) })
        : session.messages;
      return { ...session, state: 'error', pending: null, messages };
    }

    default:
      return session;
  }
}

/**
 * Применить одно событие. Возвращает ту же модель (тот же объект), если событие не
 * годится, уже виделось или ничего не меняет; иначе — новую. Входные данные не меняются.
 */
export function reduce(model, event) {
  if (!isEvent(event) || !KINDS.includes(event.kind)) return model;
  if (model.seen[event.id]) return model;

  const seen = { ...model.seen, [event.id]: true };

  if (event.kind === 'session_created') {
    if (model.sessions[event.trace]) return { ...model, seen };
    const session = {
      id: event.trace,
      name: str(event.input.name, event.trace),
      agent: str(event.input.agent),
      model: '',
      options: NO_OPTIONS,
      modelStep: event.step,
      state: 'idle',
      createdAt: event.time,
      updatedAt: event.time,
      lastStep: event.step,
      messages: [],
      pending: null,
      project: str(event.input.project),
      folder: str(event.input.folder),
      branch: str(event.input.branch),
      parent: str(event.input.parent),
      pinned: event.input.pinned === true,
      usage: null,
      tools: [],
      outputs: [],
      tasks: [],
      diffs: [],
      turnStartedAt: 0,
    };
    return { ...model, seen, sessions: { ...model.sessions, [event.trace]: session } };
  }

  const session = model.sessions[event.trace];
  if (!session) return model; // чужая цепочка без session_created: нечего рисовать, и id не запоминаем

  const changed = apply(session, event);
  const next = {
    ...changed,
    updatedAt: Math.max(session.updatedAt, event.time),
    lastStep: Math.max(session.lastStep, event.step),
  };
  return { ...model, seen, sessions: { ...model.sessions, [event.trace]: next } };
}

// ---- безопасный текст -------------------------------------------------------------

/**
 * Разбить ответ на текст и блоки кода по ограждениям ```. Ничего не разбирает как HTML:
 * результат view.js кладёт в узлы через textContent. Незакрытый блок (ответ ещё идёт)
 * остаётся кодом до конца текста.
 */
export function splitBlocks(text) {
  const blocks = [];
  let mode = 'text';
  let lang = '';
  let lines = [];
  const flush = () => {
    const body = lines.join('\n');
    if (mode === 'code') blocks.push({ type: 'code', text: body, lang });
    else if (body.trim().length > 0) blocks.push({ type: 'text', text: body });
    lines = [];
  };
  for (const line of String(text).split('\n')) {
    const fence = /^\s*```\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      if (mode === 'text') { mode = 'code'; lang = fence[1]; } else { mode = 'text'; lang = ''; }
    } else {
      lines.push(line);
    }
  }
  flush();
  return blocks;
}

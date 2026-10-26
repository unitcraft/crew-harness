// machines.js — машины сессии на странице (задача 192.1): чистый модуль без DOM и часов.
// Событие machine_state { machine, table, state, since, started, last_input, data, journal } — отладочное состояние машины диалога:
// сервер шлёт его при каждой смене состояния и при подключении страницы, в журнал сессии оно не пишется.
// Здесь: разбор события, список «Работает сейчас» (из сессии, режима и очереди) и усечение длинных значений для дерева данных.

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);

export const JOURNAL_SHOWN = 20;
export const VALUE_LIMIT = 120;

/** Состояния строки «Работает сейчас»: ждёт, идёт, ошибка, готово. */
export const WORK_STATES = Object.freeze(['waiting', 'running', 'error', 'done']);

/** Вычистить payload machine_state: неверное отбрасывается, журнал — не больше JOURNAL_SHOWN последних строк. */
export function parseMachineState(input) {
  const src = isObject(input) ? input : {};
  const journal = (Array.isArray(src.journal) ? src.journal : []).filter(isObject)
    .map((j) => ({ code: str(j.code), at: Number.isFinite(j.at) ? j.at : 0, note: str(j.note) }))
    .slice(-JOURNAL_SHOWN);
  return {
    machine: str(src.machine),
    table: str(src.table, 'dialog'),
    state: str(src.state),
    since: Number.isFinite(src.since) && src.since > 0 ? src.since : 0,
    started: src.started === true,
    lastInput: src.last_input === undefined ? null : src.last_input,
    data: src.data === undefined ? null : src.data,
    journal,
  };
}

/** Что копирует кнопка: вся карточка машины одним JSON. */
export function machineJson(m) {
  return JSON.stringify({
    machine: m.machine, table: m.table, state: m.state, since: m.since, started: m.started, input: m.lastInput, data: m.data, journal: m.journal,
  }, null, 2);
}

/** Значение для дерева: короткое — как есть, длинная строка — начало и признак обрезки (полный текст по кнопке). */
export function previewValue(v, limit = VALUE_LIMIT) {
  if (typeof v === 'string') {
    const chars = Array.from(v);
    return chars.length > limit ? { text: chars.slice(0, limit).join(''), cut: true, full: v } : { text: v, cut: false, full: v };
  }
  const text = v === null ? 'null' : String(v);
  return { text, cut: false, full: text };
}

/** Содержимое узла-ветки для подписи: «{3}» у объекта и «[2]» у массива. */
export function branchLabel(v) {
  if (Array.isArray(v)) return `[${v.length}]`;
  if (isObject(v)) return `{${Object.keys(v).length}}`;
  return '';
}

const DIALOG_STATE = Object.freeze({
  idle: 'waiting', answering: 'running', permission: 'waiting', refused: 'error', error: 'error', cancelled: 'done',
});
const STEP_WORK = Object.freeze({ pending: 'waiting', running: 'running', done: 'done', skipped: 'done' });

/**
 * Список «Работает сейчас». Элемент: { key, kind, state, title, detail, since? }.
 * kind: dialog | step | run | tests | publish | queue. since — миллисекунды эпохи, если известно с сервера (иначе страница считает сама).
 */
export function workingNow(session, queued = []) {
  const items = [];
  const machine = session.machine || null;
  items.push({
    key: 'dialog', kind: 'dialog', state: DIALOG_STATE[session.state] ?? 'waiting', title: 'dialog', detail: machine ? machine.state : session.state,
    since: machine && machine.since ? machine.since : undefined, signal: session.state,
  });
  const rs = session.routeState;
  if (rs && rs.steps && rs.steps.length > 0) {
    if (rs.running) items.push({ key: 'run', kind: 'run', state: 'running', title: rs.route, detail: '' });
    for (const s of rs.steps) {
      items.push({ key: `step:${s.n}`, kind: 'step', state: STEP_WORK[s.state] ?? 'waiting', title: s.title, detail: s.state, n: s.n });
    }
  }
  const task = rs ? rs.task : null;
  if (task) {
    const tests = task.tests && task.tests.branch ? task.tests.branch : null;
    if (task.testsRunning) items.push({ key: 'tests', kind: 'tests', state: 'running', title: 'tests', detail: '' });
    else if (tests && tests.result === 'red') items.push({ key: 'tests', kind: 'tests', state: 'error', title: 'tests', detail: tests.command, since: tests.at || undefined });
    else if (tests && tests.result === 'green') items.push({ key: 'tests', kind: 'tests', state: 'done', title: 'tests', detail: tests.command, since: tests.at || undefined });
    if (task.state === 'finishing') items.push({ key: 'publish', kind: 'publish', state: 'running', title: 'publish', detail: task.number });
    else if (task.state === 'ready') items.push({ key: 'publish', kind: 'publish', state: 'waiting', title: 'publish', detail: task.number });
    else if (task.state === 'done') items.push({ key: 'publish', kind: 'publish', state: 'done', title: 'publish', detail: task.number });
  }
  if (queued.length > 0) items.push({ key: 'queue', kind: 'queue', state: 'waiting', title: 'queue', detail: String(queued.length) });
  return items;
}

/** Ключ localStorage: раскрытие карточки отладки — по сессии. */
export const machineOpenKey = (sessionId) => `crew-machine-debug:${sessionId}`;

// routes.js — режимы работы по методике (задача 192p): чистый модуль без DOM и часов.
//
// Три режима: «Интерактивный» (по умолчанию: задачи пишутся и делаются по супербыстрому пути, шагов нет),
// «Быстрая задача» и «Полный путь» (у обоих есть шаги, которые можно прогнать после реализации).
// Сервер присылает событие route_state { route, steps, running, task }; страница отдаёт сигналы
// session_route / route_run / route_skip / route_stop. Здесь — только модель состояния, счёт «N из M»
// и сборка сигналов; рисует view.js, тексты берутся из strings.js.

import { t } from './strings.js';

export const DEFAULT_ROUTE = 'interactive';
export const DEFAULT_OVERLAP_SECONDS = 30;

// Режимы — литералами ключей, чтобы проверка строк видела каждый.
export const ROUTES = Object.freeze([
  Object.freeze({ id: 'interactive', nameKey: 'route.interactive', descKey: 'route.interactive_desc', hasSteps: false }),
  Object.freeze({ id: 'fast', nameKey: 'route.fast', descKey: 'route.fast_desc', hasSteps: true }),
  Object.freeze({ id: 'full', nameKey: 'route.full', descKey: 'route.full_desc', hasSteps: true }),
]);

export const STEP_STATES = Object.freeze(['pending', 'running', 'done', 'skipped']);
export const SUBTASK_STATES = Object.freeze(['planned', 'running', 'done']);
export const TASK_STATES = Object.freeze(['active', 'finishing', 'ready', 'done', 'kept']);

export const STEP_STATE_KEY = Object.freeze({
  pending: 'route.step_pending', running: 'route.step_running', done: 'route.step_done', skipped: 'route.step_skipped',
});
export const SUBTASK_STATE_KEY = Object.freeze({
  planned: 'route.sub_planned', running: 'route.sub_running', done: 'route.sub_done',
});

/** Значки шагов из встроенного спрайта: ⏳ ожидает, ▶ выполняется, ✓ готово, ⊘ пропущен. */
export const STEP_ICON = Object.freeze({
  pending: 'i-clock', running: 'i-play', done: 'i-check', skipped: 'i-skip',
});

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export const routeIds = () => ROUTES.map((r) => r.id);

export function normalizeRoute(value) {
  return routeIds().includes(value) ? value : DEFAULT_ROUTE;
}

export function routeInfo(id) {
  return ROUTES.find((r) => r.id === normalizeRoute(id));
}

/** Название и описание режима на экране. */
export const routeName = (id) => t(routeInfo(id).nameKey);
export const routeDescription = (id) => t(routeInfo(id).descKey);

function parseItems(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(isObject).map((x) => ({ text: str(x.text), done: x.done === true }));
}

// number приходит строкой «007» или числом 7; на экране всегда три цифры
const numberText = (v) => (typeof v === 'string' ? v.trim() : (Number.isInteger(v) && v >= 0 ? String(v).padStart(3, '0') : ''));
const refText = (v) => (typeof v === 'string' ? v : (Number.isInteger(v) ? String(v) : ''));

function parseSubtask(raw, index) {
  const items = parseItems(raw.items);
  // счёт берётся из присланных чисел; нет их — считается по чекбоксам
  const total = num(raw.total) || items.length;
  const done = Math.min(total, num(raw.done) || (num(raw.total) ? 0 : items.filter((x) => x.done).length));
  return {
    n: Number.isInteger(raw.n) ? raw.n : index + 1,
    title: str(raw.title),
    state: raw.state === 'merging' ? 'running' : (SUBTASK_STATES.includes(raw.state) ? raw.state : 'planned'),
    done,
    total,
    items,
    branch: str(raw.branch),
    worktree: str(raw.worktree),
    merged: raw.merged === true,
    mergedInto: refText(raw.merged_into),
    parallel: raw.parallel === true,
    // конфликт слияния решает агент (merging); needs_owner — true или текст: без решения владельца дальше не идти
    merging: raw.merging === true || raw.state === 'merging',
    needsOwner: raw.needs_owner === true || (typeof raw.needs_owner === 'string' && raw.needs_owner.length > 0),
    ownerText: str(raw.needs_owner_text) || (typeof raw.needs_owner === 'string' ? raw.needs_owner : ''),
  };
}

function parseDiff(raw) {
  const files = isObject(raw) && Array.isArray(raw.files)
    ? raw.files.filter((f) => isObject(f) && typeof f.path === 'string' && f.path).map((f) => ({ path: f.path, added: num(f.added), removed: num(f.removed) }))
    : [];
  return { files };
}

function parseOverlap(raw) {
  if (!isObject(raw) || !Number.isInteger(raw.n)) return null;
  return {
    n: raw.n,
    with: Number.isInteger(raw.with) ? raw.with : 0,
    files: Array.isArray(raw.files) ? raw.files.filter((f) => typeof f === 'string') : [],
    seconds: num(raw.seconds) || DEFAULT_OVERLAP_SECONDS,
  };
}

function parseTask(raw) {
  if (!isObject(raw)) return null;
  const subtasks = Array.isArray(raw.subtasks) ? raw.subtasks.filter(isObject).map(parseSubtask) : [];
  return {
    id: str(raw.id),
    number: numberText(raw.number),
    title: str(raw.title),
    branch: str(raw.branch),
    worktree: str(raw.worktree),
    suggestNewTask: raw.suggest_new_task === true,
    subtasks,
    state: TASK_STATES.includes(raw.state) ? raw.state : 'active',
    unmergedCommits: num(raw.unmerged_commits),
    finish: Boolean(raw.finish),
    diff: parseDiff(raw.diff),
    overlap: parseOverlap(raw.overlap),
  };
}

/** Вычистить payload route_state: неверное отбрасывается; у режима interactive шагов нет, а задача (если сессия в git) остаётся. */
export function parseRouteState(input) {
  const src = isObject(input) ? input : {};
  const route = normalizeRoute(src.route);
  if (!routeInfo(route).hasSteps) return { route, steps: [], running: false, task: parseTask(src.task) };
  const steps = (Array.isArray(src.steps) ? src.steps : []).filter(isObject).map((s, i) => ({
    n: Number.isInteger(s.n) ? s.n : i + 1,
    title: str(s.title),
    state: STEP_STATES.includes(s.state) ? s.state : 'pending',
  }));
  return { route, steps, running: src.running === true, task: parseTask(src.task) };
}

export const INTERACTIVE_STATE = Object.freeze(parseRouteState({ route: DEFAULT_ROUTE }));

/** Счётчик «N из M»: пройденные шаги (готово и пропущено) из всех. */
export function stepCounter(steps) {
  const done = steps.filter((s) => s.state === 'done' || s.state === 'skipped').length;
  return { done, total: steps.length };
}

export const counterText = (steps) => {
  const { done, total } = stepCounter(steps);
  return t('route.counter', { done, total });
};

/** Шаг, который кнопка «Пропустить шаг» пропустит: выполняемый, а если нет такого — первый ожидающий. */
export function stepToSkip(steps) {
  const s = steps.find((x) => x.state === 'running') || steps.find((x) => x.state === 'pending');
  return s ? s.n : null;
}

export const hasPending = (steps) => steps.some((s) => s.state === 'pending');

/** Показывать ли полосу шагов. */
export const showStrip = (state) => Boolean(state) && routeInfo(state.route).hasSteps && state.steps.length > 0;

/** Что доступно на кнопках полосы. */
export function stripActions(state) {
  const steps = state ? state.steps : [];
  const running = Boolean(state && state.running);
  return {
    run: !running && hasPending(steps),
    skip: stepToSkip(steps) !== null,
    stop: running,
  };
}

/** Доля подзадачи в процентах (0–100). */
export function subtaskPercent(sub) {
  return sub.total > 0 ? Math.round((Math.min(sub.done, sub.total) / sub.total) * 100) : 0;
}

export const subtaskProgressText = (sub) => t('route.sub_progress', { done: sub.done, total: sub.total });

/** Подзадач словами: «1 подзадача», «3 подзадачи», «5 подзадач». */
export function subtaskCountText(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return t('route.count_one', { n });
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return t('route.count_few', { n });
  return t('route.count_many', { n });
}

/** Заголовок панели задачи: «Задача 007 · название». */
export function taskHeading(task) {
  const head = task.number || task.id;
  if (head && task.title) return t('route.task_head', { number: head, title: task.title });
  if (head) return t('route.task_head_bare', { number: head });
  return task.title || t('route.task');
}

/** Что можно сделать с подзадачей из меню «⋯»: вынести в дерево, готово и влить, дописать в предыдущую / начать новую (у активной). */
export function subtaskActions(sub) {
  const active = sub.state === 'running';
  return {
    worktree: !sub.worktree && !sub.merged,
    done: !sub.merged,
    same: active,
    fresh: active,
  };
}
export const hasSubtaskActions = (sub) => Object.values(subtaskActions(sub)).some(Boolean);

/** Баннер «Задача разрослась»: сервер просит (suggest_new_task) и владелец не нажал «Продолжить» на этом числе подзадач. */
export function bannerCount(state, dismissedAt) {
  const task = state && state.task;
  if (!task || !task.suggestNewTask) return 0;
  return dismissedAt === task.subtasks.length ? 0 : task.subtasks.length;
}

/**
 * Строки ленты «подзадача N: новая / дополнена» по смене состояния задачи. Сервер отдельного события для них не шлёт:
 * новая подзадача — это номер, которого раньше не было; дополнена — у подзадачи появилось merged_into.
 * Без прежней задачи (первое состояние, смена задачи) строк нет: история не восстанавливается.
 */
export function subtaskNotes(prevTask, nextTask) {
  if (!prevTask || !nextTask || prevTask.id !== nextTask.id) return [];
  const notes = [];
  for (const sub of nextTask.subtasks) {
    const before = prevTask.subtasks.find((x) => x.n === sub.n);
    if (!before) notes.push({ n: sub.n, action: 'new' });
    else if (!before.mergedInto && sub.mergedInto) notes.push({ n: sub.n, action: 'extended' });
  }
  return notes;
}

export const NOTE_KEY = Object.freeze({ new: 'route.note_new', extended: 'route.note_extended' });

/** Коммитов словами: «1 коммит», «2 коммита», «5 коммитов». */
export function commitsText(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return t('route.commits_one', { n });
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return t('route.commits_few', { n });
  return t('route.commits_many', { n });
}

/** Файлов словами. */
export function filesText(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return t('route.files_one', { n });
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return t('route.files_few', { n });
  return t('route.files_many', { n });
}

/** Метка списка сессий и панели задачи: «готово к влитию» или «не влито: N коммитов»; готовая и влитая задача метки не имеет. */
export function mergeLabel(task) {
  if (!task) return null;
  if (task.state === 'ready') return { kind: 'ready', text: t('route.label_ready') };
  if (task.state !== 'done' && task.unmergedCommits > 0) return { kind: 'unmerged', text: t('route.label_unmerged', { commits: commitsText(task.unmergedCommits) }) };
  return null;
}

/** Итоги правок задачи: файлов, добавлено, удалено. */
export function diffTotals(diff) {
  const files = diff ? diff.files : [];
  return { files: files.length, added: files.reduce((a, f) => a + f.added, 0), removed: files.reduce((a, f) => a + f.removed, 0) };
}

/** Карточка «Закончить задачу»: сервер просит закончить (finish), шаги окончания ещё не пошли и задача не готова. */
export const finishPrompt = (task) => Boolean(task) && task.finish && task.state !== 'finishing' && task.state !== 'ready';
/** Карточка «Задача готова»: шаги окончания пройдены, слово за владельцем. */
export const readyPrompt = (task) => Boolean(task) && task.state === 'ready';
/** Карточка пересечения подзадач; без неё нет вопроса. */
export const overlapPrompt = (task) => (task && task.overlap ? task.overlap : null);

/** Сигналы страницы серверу: { kind, input }; шаг события и id добавляет app.js. */
export const routeSignal = Object.freeze({
  set: (route) => ({ kind: 'session_route', input: { route: normalizeRoute(route) } }),
  run: () => ({ kind: 'route_run', input: {} }),
  skip: (step) => ({ kind: 'route_skip', input: { step } }),
  stop: () => ({ kind: 'route_stop', input: {} }),
  subtaskNew: () => ({ kind: 'route_subtask_new', input: {} }),
  subtaskSame: () => ({ kind: 'route_subtask_same', input: {} }),
  subtaskWorktree: (n) => ({ kind: 'route_subtask_worktree', input: { n } }),
  subtaskDone: (n) => ({ kind: 'route_subtask_done', input: { n } }),
  newTask: () => ({ kind: 'route_new_task', input: {} }),
  publish: () => ({ kind: 'route_publish', input: {} }),
  keep: () => ({ kind: 'route_keep', input: {} }),
  subtaskParallel: (n, on) => ({ kind: 'route_subtask_parallel', input: { n, on: on === true } }),
  subtaskChoose: (n, tree) => ({ kind: 'route_subtask_choose', input: { n, tree: tree === 'shared' ? 'shared' : 'own' } }),
});

// routes.js — режимы работы по методике (задача 192p): чистый модуль без DOM и часов.
//
// Четыре режима: «Интерактивный» (по умолчанию: задачи пишутся и делаются по супербыстрому пути, шагов нет),
// «Быстрая задача» и «Полный путь» (у обоих есть шаги, которые можно прогнать после реализации) и «Планирование»
// (агент не делает задачу, а доводит до готовности задание: шаги есть, дерева нет).
// Сервер присылает событие route_state { route, steps, running, task }; страница отдаёт сигналы
// session_route / route_run / route_skip / route_stop. Здесь — только модель состояния, счёт «N из M»
// и сборка сигналов; рисует view.js, тексты берутся из strings.js.

import { t } from './strings.js';
import { parseCrewTask } from './crew-task.js';

export const DEFAULT_ROUTE = 'interactive';
export const DEFAULT_OVERLAP_SECONDS = 30;

// Режимы — литералами ключей, чтобы проверка строк видела каждый.
export const ROUTES = Object.freeze([
  Object.freeze({ id: 'interactive', nameKey: 'route.interactive', descKey: 'route.interactive_desc', hasSteps: false }),
  Object.freeze({ id: 'fast', nameKey: 'route.fast', descKey: 'route.fast_desc', hasSteps: true }),
  Object.freeze({ id: 'full', nameKey: 'route.full', descKey: 'route.full_desc', hasSteps: true }),
  Object.freeze({ id: 'planning', nameKey: 'route.planning', descKey: 'route.planning_desc', hasSteps: true }),
]);

export const STEP_STATES = Object.freeze(['pending', 'running', 'done', 'skipped']);
export const SUBTASK_STATES = Object.freeze(['planned', 'running', 'done', 'waits']);
export const TASK_STATES = Object.freeze(['active', 'finishing', 'ready', 'done']);

export const STEP_STATE_KEY = Object.freeze({
  pending: 'route.step_pending', running: 'route.step_running', done: 'route.step_done', skipped: 'route.step_skipped',
});
export const SUBTASK_STATE_KEY = Object.freeze({
  planned: 'route.sub_planned', running: 'route.sub_running', done: 'route.sub_done', waits: 'route.sub_waits',
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
    // задача 192.2: подзадача ждёт другую (waitsFor) или место под лимитом (queued); файлы, которые она затронет
    waitsFor: num(raw.waits_for),
    queued: raw.queued === true,
    touches: Array.isArray(raw.touches) ? raw.touches.filter((x) => typeof x === 'string') : [],
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

const TESTS_STATES = Object.freeze(['never', 'outdated', 'green', 'red']);

function parseTestsRun(raw) {
  const r = isObject(raw) ? raw : {};
  return {
    state: TESTS_STATES.includes(r.state) ? r.state : 'never',
    result: r.result === 'green' || r.result === 'red' ? r.result : '',
    commit: str(r.commit),
    head: str(r.head),
    at: Number.isFinite(r.at) && r.at > 0 ? r.at : 0,
    command: str(r.command),
    source: str(r.source),
  };
}

function parseTests(raw) {
  const r = isObject(raw) ? raw : {};
  return { branch: parseTestsRun(r.branch), main: parseTestsRun(r.main) };
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
    // сообщений владельца в задаче; старые журналы числа не присылали — тогда по одному на подзадачу
    messages: num(raw.messages) || subtasks.length,
    state: TASK_STATES.includes(raw.state) ? raw.state : 'active',
    unmergedCommits: num(raw.unmerged_commits),
    finish: Boolean(raw.finish),
    // задача 192.2: подзадачи завёл владелец по списку агента (у каждой свой message.N.md), а не журнал сообщений
    crew: raw.crew === true,
    stale: raw.stale === true,
    idleDays: num(raw.idle_days),
    tests: parseTests(raw.tests),
    testsRunning: raw.tests_running === true,
    diff: parseDiff(raw.diff),
    overlap: parseOverlap(raw.overlap),
  };
}

/**
 * Задача 192.5: служебные подсказки агенту (то, что хаб говорит агенту скрытыми заметками): время, вид и полный текст; последние 20 на сессию. Только в памяти хаба, в ленте и в журнале их нет.
 * Хаб шлёт hints [{ ms, kind, text }].
 */
export function parseHints(src) {
  const list = Array.isArray(src && src.hints) ? src.hints : [];
  return list.filter(isObject).map((x) => ({ ms: num(x.ms), kind: str(x.kind), text: str(x.text) })).filter((x) => x.text !== '').slice(-20);
}

const KID_STATES = ['running', 'waits', 'ready', 'merged'];

/**
 * Задачи 192.3 и 192.5: дочерние задачи эпика (дочерние сессии) и сведения о себе, если сессия — дочерняя. Хаб шлёт children (строки таблицы task/children.md),
 * children_unmerged (номера не слитых дочерних: справка «останутся отдельно», слияние эпика они не держат), child { parent, parent_name, kind, parent_no, k, target }, epic.
 */
export function parseKids(src) {
  const list = (Array.isArray(src.children) ? src.children : []).filter(isObject).map((r) => ({
    k: num(r.k),
    number: str(r.number),
    kind: str(r.kind),
    title: str(r.title),
    folder: str(r.folder),
    branch: str(r.branch),
    session: str(r.session),
    state: KID_STATES.includes(r.state) ? r.state : 'running',
    stateText: str(r.state_text),
    waitsFor: num(r.waits_for),
    done: num(r.done),
    total: num(r.total),
    touches: Array.isArray(r.touches) ? r.touches.filter((x) => typeof x === 'string') : [],
  }));
  const c = isObject(src.child) ? src.child : null;
  return {
    list,
    merged: list.filter((r) => r.state === 'merged').length,
    total: list.length,
    unmerged: Array.isArray(src.children_unmerged) ? src.children_unmerged.filter((x) => typeof x === 'string') : [],
    epic: src.epic === true,
    child: c && str(c.parent) ? { parent: str(c.parent), parentName: str(c.parent_name), kind: str(c.kind), parentNo: str(c.parent_no), parentBranch: str(c.parent_branch), k: num(c.k), target: c.target === 'parent' ? 'parent' : 'main' } : null,
  };
}

/**
 * Задача 192.4: где работает агент, пока у сессии нет задачи. kind: 'wip' (отдельная копия-дерево на отсоединённом коммите, без ветки) или 'folder' (папка проекта на её текущей ветке).
 * Хаб шлёт where { kind, branch, worktree, unmerged_commits, work, idle_days, stale }; у сессии с задачей поля нет (там ветка задачи).
 */
export function parseWhere(raw) {
  if (!isObject(raw)) return null;
  return {
    kind: raw.kind === 'wip' ? 'wip' : 'folder',
    branch: str(raw.branch),
    worktree: str(raw.worktree),
    unmergedCommits: num(raw.unmerged_commits),
    work: raw.work === true,
    idleDays: num(raw.idle_days),
    stale: raw.stale === true,
  };
}

/**
 * Подпись под полем: где идёт работа. Черновик: Worktree включён — «в отдельной копии (без ветки), создастся с первым сообщением», выключен — «прямо в папке проекта».
 * Открытая сессия: задача с веткой — «в ветке task/…»; wip — «в отдельной копии (без ветки)»; без дерева — «прямо в main» или «прямо в ветке X» (текущая ветка папки проекта).
 */
export function whereText(session) {
  if (!session) return '';
  if (session.draft) return session.worktree === false ? t('where.draft_folder') : t('where.draft_tree');
  const rs = session.routeState;
  if (!rs) return '';
  const task = rs.task;
  if (task && task.worktree) return task.branch ? t('where.branch', { branch: task.branch }) : '';
  const w = rs.where;
  if (!w) return '';
  if (w.kind === 'wip') return t('where.copy');
  if (!w.branch) return '';
  return w.branch === 'main' ? t('where.main') : t('where.folder_branch', { branch: w.branch });
}

/** Карточка тихого дерева wip (30 дней без дела): хаб ничего не удаляет сам, страница спрашивает. */
export const wipStalePrompt = (rs) => Boolean(rs) && !rs.task && Boolean(rs.where) && rs.where.kind === 'wip' && rs.where.stale;

/** Вычистить payload route_state: неверное отбрасывается; у режима interactive шагов нет, а задача (если сессия в git) остаётся. */
export function parseRouteState(input) {
  const src = isObject(input) ? input : {};
  const route = normalizeRoute(src.route);
  const useTree = src.use_tree !== false;
  if (!routeInfo(route).hasSteps) return { route, stepless: true, steps: [], running: false, useTree, task: parseTask(src.task), where: parseWhere(src.where), crew: parseCrewTask(src), kids: parseKids(src), hints: parseHints(src) };
  const steps = (Array.isArray(src.steps) ? src.steps : []).filter(isObject).map((s, i) => ({
    n: Number.isInteger(s.n) ? s.n : i + 1,
    title: str(s.title),
    state: STEP_STATES.includes(s.state) ? s.state : 'pending',
  }));
  return { route, stepless: false, steps, running: src.running === true, useTree, task: parseTask(src.task), where: parseWhere(src.where), crew: parseCrewTask(src), kids: parseKids(src), hints: parseHints(src) };
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

/** В режиме без шагов подзадач нет: сообщения владельца — журнал сообщений задачи, а не подзадачи с чек-листом. */
export const showSubtasks = (state) => Boolean(state) && (state.stepless !== true || Boolean(state.task && state.task.crew));

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
export function subtaskNotes(prevTask, nextTask, stepless = false) {
  if (stepless || !prevTask || !nextTask || prevTask.id !== nextTask.id) return [];
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
/** Время словами: «только что», «5 мин назад», «3 ч назад», «4 дн. назад». `now` — часы страницы, мс. */
export function agoText(at, now) {
  const min = Math.max(0, Math.floor((now - at) / 60000));
  if (min < 1) return t('route.ago_now');
  if (min < 60) return t('route.ago_min', { n: min });
  if (min < 60 * 48) return t('route.ago_hour', { n: Math.floor(min / 60) });
  return t('route.ago_day', { n: Math.floor(min / 1440) });
}
const shortSha = (sha) => (sha ? sha.slice(0, 7) : '');

/** Строка о тестах ветки: зелёные / красные / не гонялись / не на этом коммите; когда и на каком коммите. */
export function branchTestsText(run, now) {
  if (run.state === 'never') return t('route.tests_branch', { state: t('route.tests_never') });
  const when = t('route.tests_when', { ago: agoText(run.at, now), commit: shortSha(run.commit) });
  if (run.state === 'outdated') {
    const result = t(run.result === 'red' ? 'route.tests_red' : 'route.tests_green');
    return `${t('route.tests_branch', { state: t('route.tests_outdated', { result }) })} · ${when} · ${t('route.tests_head', { commit: shortSha(run.head) })}`;
  }
  return `${t('route.tests_branch', { state: t(run.state === 'green' ? 'route.tests_green' : 'route.tests_red') })} (${when})`;
}

/** Строка о main: последний прогон CI GitHub, иначе «CI: нет данных». */
export function mainTestsText(run, now) {
  if (run.state !== 'green' && run.state !== 'red') return t('route.tests_main_none');
  return `${t('route.tests_main', { state: t(run.state === 'green' ? 'route.tests_green' : 'route.tests_red') })} (CI, ${t('route.tests_when', { ago: agoText(run.at, now), commit: shortSha(run.commit) })})`;
}

/** Кнопка «Прогнать тесты»: у задачи есть дерево, прогон не идёт и на вершине ветки нет зелёного. */
export const testsRunnable = (task) => Boolean(task) && Boolean(task.worktree) && !task.testsRunning && task.tests.branch.state !== 'green';

/** Карточка устаревшей сессии: хаб ничего не удаляет сам, страница спрашивает. */
export const stalePrompt = (task) => Boolean(task) && task.stale && Boolean(task.worktree);

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
  merge: () => ({ kind: 'route_merge', input: {} }),
  testsRun: () => ({ kind: 'route_tests_run', input: {} }),
  treeDrop: (force) => ({ kind: 'route_tree_drop', input: { force: force === true } }),
  worktree: (on) => ({ kind: 'session_worktree', input: { on: on === true } }),
  subtaskParallel: (n, on) => ({ kind: 'route_subtask_parallel', input: { n, on: on === true } }),
  subtaskChoose: (n, tree) => ({ kind: 'route_subtask_choose', input: { n, tree: tree === 'shared' ? 'shared' : 'own' } }),
});

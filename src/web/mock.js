// mock.js — заглушка вместо сервера: заготовленный журнал событий и «сервер-воспроизведение».
//
// Зачем: страница рисует только поток событий и передаёт решения такими же событиями, поэтому
// её можно собрать и проверить, пока настоящего сервера (/ws) и агента нет. Заглушка делает
// то, что позже сделает сервис: повторяет событие владельца и добавляет события агента.
// Тексты разговоров здесь — данные потока, а не интерфейс (интерфейс — strings.js).
//
// Сервер чистый: ни таймеров, ни DOM. handle(событие) возвращает список { delay, event };
// расписание и отмену ведёт transport.js.

export const AGENTS = Object.freeze([
  Object.freeze({ id: 'opencode', labelKey: 'agent.opencode' }),
  Object.freeze({ id: 'second', labelKey: 'agent.second', disabled: true }),
]);

// Выбор под полем ввода — заглушка: значения показываются, действия за ними нет.
export const MODES = Object.freeze([
  Object.freeze({ id: 'ask', labelKey: 'mode.ask' }),
  Object.freeze({ id: 'read', labelKey: 'mode.read' }),
]);
export const MODELS = Object.freeze([
  Object.freeze({ id: 'base', labelKey: 'model.base' }),
  Object.freeze({ id: 'fast', labelKey: 'model.fast' }),
  Object.freeze({ id: 'deep', labelKey: 'model.deep' }),
]);
export const EFFORTS = Object.freeze([
  Object.freeze({ id: 'low', labelKey: 'effort.low' }),
  Object.freeze({ id: 'medium', labelKey: 'effort.medium' }),
  Object.freeze({ id: 'high', labelKey: 'effort.high' }),
]);

const BASE = 1_792_314_000_000;
const SEC = 1000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const END = BASE + 3 * HOUR;
const CTX = 200_000;

// ---- заготовленный журнал ---------------------------------------------------------------------

function buildJournal() {
  const out = [];
  const steps = {};
  const add = (trace, kind, input, time) => {
    steps[trace] = (steps[trace] ?? -1) + 1;
    out.push({ id: `${trace}-${steps[trace]}`, trace, step: steps[trace], kind, input, time });
  };

  // 1. закреплённая, закончена: инструменты, фоновые задачи, правки, результаты
  const s1 = 'ses-demo-1';
  add(s1, 'session_created', {
    name: 'Разбор падающих тестов', agent: 'opencode', project: 'crew-harness', folder: 'C:/work/crew-harness', branch: 'task/flaky-tests',
  }, BASE);
  add(s1, 'user_message', { turn: 't1', text: 'Почему тест на дубликаты событий иногда красный?' }, BASE + MIN);
  add(s1, 'tool_call', { id: 'c1', title: 'src/web/test/state.test.mjs', kind: 'read', status: 'in_progress' }, BASE + MIN + 300);
  add(s1, 'tool_call_update', { id: 'c1', status: 'completed' }, BASE + MIN + 600);
  add(s1, 'tool_call', { id: 'c2', title: 'порядок прибытия кусков', kind: 'search', status: 'completed' }, BASE + MIN + 900);
  add(s1, 'tool_call', { id: 'c3', title: 'node --test "src/web/test/*.test.mjs"', kind: 'execute', status: 'in_progress' }, BASE + MIN + 1200);
  add(s1, 'tool_call_update', { id: 'c3', status: 'completed', detail: '49 из 49 пройдено, 1 ложное падение при повторе' }, BASE + MIN + 3000);
  add(s1, 'agent_chunk', { turn: 't1', text: 'Похоже, тест полагается на порядок прибытия. ' }, BASE + MIN + 3400);
  add(s1, 'agent_chunk', { turn: 't1', text: 'Если куски приходят вперемешку, их нужно сортировать по номеру шага (`step`), а не по прибытию:\n\n```js\nchunks.sort((a, b) => a.step - b.step);\n```\n\n' }, BASE + MIN + 3800);
  add(s1, 'agent_chunk', { turn: 't1', text: 'Что я поменял:\n- сортировка кусков в `state.js`;\n- проверка на перемешанный порядок в тесте;\n- запись в журнале.\n\nПосле этого порядок прибытия перестаёт влиять на результат.' }, BASE + MIN + 4200);
  add(s1, 'file_diff', { path: 'src/web/state.js', added: 12, removed: 3 }, BASE + MIN + 4300);
  add(s1, 'file_diff', { path: 'src/web/test/state.test.mjs', added: 24, removed: 0 }, BASE + MIN + 4300);
  add(s1, 'file_diff', { path: 'src/web/mock.js', added: 4, removed: 1 }, BASE + MIN + 4300);
  add(s1, 'file_diff', { path: 'doc/tasks/095-flaky/log.md', added: 3, removed: 0 }, BASE + MIN + 4300);
  const outputs = [
    ['src/web/state.js', 'edit'], ['src/web/test/state.test.mjs', 'edit'], ['src/web/mock.js', 'edit'],
    ['doc/tasks/095-flaky/log.md', 'create'], ['doc/tasks/095-flaky/analysis.md', 'create'], ['report/summary.md', 'create'],
  ];
  for (const [path, kind] of outputs) add(s1, 'output_file', { path, kind }, BASE + MIN + 4400);
  add(s1, 'background_task', { id: 'bg0', title: 'сторож файлов (watch)', status: 'running', started: BASE - (3 * 24 + 7) * HOUR }, BASE + MIN + 4500);
  add(s1, 'background_task_update', { id: 'bg0', status: 'completed' }, BASE + MIN + 4600);
  for (let i = 1; i <= 5; i += 1) {
    add(s1, 'background_task', { id: `bg${i}`, title: `node --test, прогон ${i}`, status: 'running', started: BASE + MIN + 1200 + i * 100 }, BASE + MIN + 4600);
    add(s1, 'background_task_update', { id: `bg${i}`, status: i === 4 ? 'failed' : 'completed' }, BASE + MIN + 4700 + i * 100);
  }
  add(s1, 'usage_update', { used: 76_000, size: CTX }, BASE + MIN + 4800);
  add(s1, 'agent_done', { turn: 't1' }, BASE + MIN + 5000);

  // 2. отказ агента после запроса разрешения
  const s2 = 'ses-demo-2';
  add(s2, 'session_created', {
    name: 'Уборка временных файлов', agent: 'opencode', project: 'crew-harness', folder: 'C:/work/crew-harness', branch: 'main',
  }, BASE + 5 * MIN);
  add(s2, 'user_message', { turn: 't1', text: 'Удали все временные файлы в проекте.' }, BASE + 6 * MIN);
  add(s2, 'agent_chunk', { turn: 't1', text: 'Для этого мне нужно удалить файлы в папке tmp. ' }, BASE + 6 * MIN + 400);
  add(s2, 'permission_request', { turn: 't1', request: 'j2-perm', action: 'Удалить файлы в папке tmp/', detail: 'tmp/cache.bin, tmp/build.log' }, BASE + 6 * MIN + 800);
  add(s2, 'permission_decision', { request: 'j2-perm', decision: 'deny' }, BASE + 7 * MIN);
  add(s2, 'agent_refused', { turn: 't1', reason: 'вы отклонили удаление, файлы не тронуты' }, BASE + 7 * MIN + 300);
  add(s2, 'usage_update', { used: 12_000, size: CTX }, BASE + 7 * MIN + 400);

  // 3. ошибка в другом проекте
  const s4 = 'ses-demo-4';
  add(s4, 'session_created', {
    name: 'Заметки к релизу', agent: 'opencode', project: 'docs-site', folder: 'C:/work/docs-site', branch: 'main', pinned: true,
  }, BASE + HOUR);
  add(s4, 'user_message', { turn: 't1', text: 'Собери заметки к релизу из журнала изменений.' }, BASE + HOUR + MIN);
  add(s4, 'agent_chunk', { turn: 't1', text: 'Читаю журнал изменений… ' }, BASE + HOUR + MIN + 400);
  add(s4, 'error', { turn: 't1', message: 'обрыв связи с агентом' }, BASE + HOUR + MIN + 900);
  add(s4, 'usage_update', { used: 31_000, size: CTX }, BASE + HOUR + MIN + 1000);

  // 4. дочерняя сессия закреплённой, работа идёт: красная полоска контекста и бегущая строка
  const s3 = 'ses-demo-3';
  add(s3, 'session_created', {
    name: 'Проверка стражей', agent: 'opencode', project: 'crew-harness', folder: 'C:/work/crew-harness', branch: 'task/flaky-tests', parent: s1,
  }, END - 4 * MIN);
  add(s3, 'user_message', { turn: 't1', text: 'Прогони все стражи по индексу и скажи, что красное.' }, END - 96 * SEC);
  add(s3, 'agent_chunk', { turn: 't1', text: 'Запускаю стражи; пока они идут, смотрю список изменённых файлов.' }, END - 94 * SEC);
  add(s3, 'tool_call', { id: 'g1', title: 'git status --short', kind: 'execute', status: 'completed' }, END - 92 * SEC);
  add(s3, 'tool_call', { id: 'g2', title: 'sh scripts/guards/run-all.sh --index', kind: 'execute', status: 'in_progress' }, END - 90 * SEC);
  add(s3, 'background_task', { id: 'bgg', title: 'sh scripts/guards/run-all.sh --index', status: 'running', started: END - 90 * SEC }, END - 90 * SEC);
  add(s3, 'output_file', { path: 'report/guards.txt', kind: 'create' }, END - 60 * SEC);
  add(s3, 'usage_update', { used: 188_000, size: CTX }, END - 5 * SEC);

  return out;
}

/** Заготовленный журнал: время событий привязано к BASE, чтобы тесты были детерминированы. */
export const INITIAL_JOURNAL = Object.freeze(buildJournal().map((e) => Object.freeze(e)));

/**
 * Сдвинуть времена журнала так, чтобы последнее событие было за пять секунд до nowMs: при открытии страницы
 * «N мин назад» и таймер идущей работы показывают живые значения. Разности между событиями сохраняются.
 */
export function rebaseJournal(journal, nowMs) {
  const max = Math.max(...journal.map((e) => e.time));
  const shift = nowMs - 5 * SEC - max;
  return journal.map((e) => {
    const input = e.kind === 'background_task' && Number.isFinite(e.input.started)
      ? { ...e.input, started: e.input.started + shift }
      : e.input;
    return { ...e, input, time: e.time + shift };
  });
}

// ---- ответы заглушки ----------------------------------------------------------------------------

const PLAIN_CHUNKS = [
  'Коротко: ',
  'событие самодостаточно, поэтому поток можно воспроизвести заново.\n\nПример:\n',
  '```js\nconst a = reduce(model, event);\n',
  'const b = reduce(model, event);\n',
  '```\n',
  'Оба вызова дают один и тот же вид, ',
  'а повтор события ничего не ломает.',
];

const PERMISSION_LEAD = ['Чтобы это сделать, ', 'мне нужно изменить файлы в рабочей папке. '];
const PERMISSION_ALLOWED = ['Готово: ', 'изменения внесены, ничего лишнего не тронуто.'];

const WORK_LEAD = 'Смотрю код и прогоняю проверки. ';
const WORK_RESULT = [
  'Итог:\n- чтение `state.js` и тестов: без замечаний;\n',
  '- прогон набора завершён, красных нет;\n- отчёт записан в `report/summary.md`.\n\n',
  'Правки небольшие, их видно в карточке ниже.',
];

const WANTS_PERMISSION = /файл|удал|команд|запуст|разреш/i;
const WANTS_WORK = /тест|прогон|собер|сбор|проверь|отч[её]т|инструмент/i;

const CHUNK_FIRST_MS = 350;
const CHUNK_EVERY_MS = 320;
const CONTEXT_STEP_PLAIN = 4000;
const CONTEXT_STEP_WORK = 16_000;

export function createMockServer({ journal, now = Date.now } = {}) {
  const shown = journal ?? rebaseJournal(INITIAL_JOURNAL, now());
  const lastStep = {};
  const pending = {};
  const used = {};
  let serial = 0;

  const note = (e) => {
    lastStep[e.trace] = Math.max(lastStep[e.trace] ?? -1, e.step);
    if (e.kind === 'usage_update' && Number.isFinite(e.input.used)) used[e.trace] = e.input.used;
  };
  shown.forEach(note);

  function mint(entries, trace, delay, kind, input) {
    lastStep[trace] = (lastStep[trace] ?? -1) + 1;
    serial += 1;
    entries.push({
      delay,
      event: { id: `srv-${serial}`, trace, step: lastStep[trace], kind, input, time: now() + delay },
    });
  }

  function speak(entries, trace, turn, texts, from) {
    texts.forEach((text, i) => mint(entries, trace, from + i * CHUNK_EVERY_MS, 'agent_chunk', { turn, text }));
    return from + texts.length * CHUNK_EVERY_MS;
  }

  function usage(entries, trace, delay, grow) {
    used[trace] = Math.min(CTX, (used[trace] ?? 20_000) + grow);
    mint(entries, trace, delay, 'usage_update', { used: used[trace], size: CTX });
  }

  function work(entries, trace, turn) {
    let t = CHUNK_FIRST_MS;
    const next = (ms = CHUNK_EVERY_MS) => { t += ms; return t; };
    mint(entries, trace, t, 'agent_chunk', { turn, text: WORK_LEAD });
    const read = `tool-${serial + 1}`;
    mint(entries, trace, next(), 'tool_call', { turn, id: read, title: 'src/web/state.js', kind: 'read', status: 'in_progress' });
    mint(entries, trace, next(200), 'tool_call_update', { id: read, status: 'completed' });
    const run = `tool-${serial + 1}`;
    mint(entries, trace, next(), 'tool_call', { turn, id: run, title: 'node --test "src/web/test/*.test.mjs"', kind: 'execute', status: 'in_progress' });
    const task = `task-${serial + 1}`;
    mint(entries, trace, next(100), 'background_task', { turn, id: task, title: 'node --test, фоновый прогон', status: 'running', started: now() + t });
    mint(entries, trace, next(400), 'tool_call_update', { id: run, status: 'completed', detail: 'все проверки пройдены' });
    usage(entries, trace, next(100), CONTEXT_STEP_WORK);
    t = speak(entries, trace, turn, WORK_RESULT, next());
    mint(entries, trace, next(100), 'output_file', { path: 'report/summary.md', kind: 'create' });
    mint(entries, trace, next(0), 'output_file', { path: 'src/web/state.js', kind: 'edit' });
    mint(entries, trace, next(0), 'file_diff', { turn, path: 'src/web/state.js', added: 18, removed: 4 });
    mint(entries, trace, next(0), 'file_diff', { turn, path: 'src/web/view.js', added: 6, removed: 0 });
    mint(entries, trace, next(0), 'file_diff', { turn, path: 'src/web/test/view.test.mjs', added: 0, removed: 11 });
    mint(entries, trace, next(100), 'background_task_update', { id: task, status: 'completed' });
    mint(entries, trace, next(100), 'agent_done', { turn });
  }

  function handle(event) {
    note(event);
    const entries = [{ delay: 0, event }];
    const { trace, input } = event;

    if (event.kind === 'user_message') {
      const turn = typeof input.turn === 'string' ? input.turn : event.id;
      const text = String(input.text);
      if (WANTS_PERMISSION.test(text)) {
        const end = speak(entries, trace, turn, PERMISSION_LEAD, CHUNK_FIRST_MS);
        const request = `perm-${serial + 1}`;
        mint(entries, trace, end, 'permission_request', {
          turn, request, action: 'Изменить файлы в рабочей папке', detail: 'src/example.txt (запись), tmp/old.log (удаление)',
        });
        pending[trace] = { request, turn };
      } else if (WANTS_WORK.test(text)) {
        work(entries, trace, turn);
      } else {
        const end = speak(entries, trace, turn, PLAIN_CHUNKS, CHUNK_FIRST_MS);
        usage(entries, trace, end, CONTEXT_STEP_PLAIN);
        mint(entries, trace, end + 20, 'agent_done', { turn });
      }
    } else if (event.kind === 'permission_decision') {
      const open = pending[trace];
      if (open && open.request === input.request) {
        delete pending[trace];
        if (input.decision === 'allow') {
          const end = speak(entries, trace, open.turn, PERMISSION_ALLOWED, CHUNK_FIRST_MS);
          mint(entries, trace, end, 'agent_done', { turn: open.turn });
        } else {
          mint(entries, trace, CHUNK_FIRST_MS, 'agent_refused', {
            turn: open.turn, reason: 'вы отклонили действие, файлы не тронуты',
          });
        }
      }
    } else if (event.kind === 'cancel') {
      delete pending[trace];
    }
    return entries;
  }

  return { handle, journal: () => shown };
}

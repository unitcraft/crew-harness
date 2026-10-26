// mock.js — заглушка вместо сервера: заготовленный журнал событий и «сервер-воспроизведение».
//
// Зачем: страница рисует только поток событий и передаёт решения такими же событиями, поэтому
// её можно собрать и проверить, пока настоящего сервера (/ws) и агента нет. Заглушка делает
// то, что позже сделает сервис: повторяет событие владельца и добавляет события агента.
// Тексты разговоров здесь — данные потока, а не интерфейс (интерфейс — strings.js).
//
// Сервер чистый: ни таймеров, ни DOM. handle(событие) возвращает список { delay, event };
// расписание и отмену ведёт transport.js.

import { parseEnv, normalizePath, parentPath, samePath } from './projects.js';

export const AGENTS = Object.freeze([
  Object.freeze({ id: 'opencode', labelKey: 'agent.opencode' }),
  Object.freeze({ id: 'second', labelKey: 'agent.second', disabled: true }),
]);

const BASE = 1_792_314_000_000;
const SEC = 1000;
const MIN = 60_000;

// Что «агент» предлагает выбрать (задача 192): как configOptions настоящего агента.
const MOCK_OPTIONS = {
  model: 'Sonnet 5.5',
  model_id: 'sonnet',
  models: [{ id: 'opus', name: 'Opus 5.5' }, { id: 'fable', name: 'Fable 5.1' }, { id: 'sonnet', name: 'Sonnet 5.5' }, { id: 'haiku', name: 'Haiku 5.5' }, { id: 'old', name: 'Sonnet 4' }],
  effort: 'high',
  effort_name: 'Усилие',
  efforts: [{ id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }],
  mode: 'default',
  modes: [
    { id: 'default', name: 'Auto', description: 'Агент сам решает про разрешения' },
    { id: 'manual', name: 'Manual', description: 'Всегда спрашивать перед правками' },
    { id: 'acceptEdits', name: 'Accept edits', description: 'Принимать правки файлов автоматически' },
    { id: 'plan', name: 'Plan', description: 'Составить план до правок' },
  ],
};
const HOUR = 60 * MIN;
const END = BASE + 3 * HOUR;
const CTX = 200_000;

// Вопросы агента с выбором (задача 192): данные потока, как и тексты разговоров.
function mockQuestions() {
  return [
    {
      question: 'Как чинить ложное падение теста на дубликаты событий?',
      header: 'Способ',
      multiSelect: false,
      options: [
        { label: 'Сортировать по step', description: 'Куски склеиваются по номеру шага, порядок прибытия не важен.' },
        { label: 'Ждать все куски', description: 'Склейка только после agent_done; проще, но ответ не растёт на глазах.' },
        { label: 'Повторять тест', description: 'Перезапуск при красном; прячет причину, а не лечит.' },
      ],
    },
    {
      question: 'Что ещё проверить после правки?',
      header: 'Проверки',
      multiSelect: true,
      options: [
        { label: 'Тесты страницы', description: 'node --test для src/web.' },
        { label: 'Стражи', description: 'sh scripts/guards/run-all.sh по индексу.' },
        { label: 'Вид в браузере', description: 'Светлая и тёмная темы, узкий экран.' },
        { label: 'Журнал задачи', description: 'Запись в doc/tasks.' },
      ],
    },
  ];
}

// ---- заготовленный журнал ---------------------------------------------------------------------

function buildJournal() {
  const out = [];
  const steps = {};
  const add = (trace, kind, input, time) => {
    steps[trace] = (steps[trace] ?? -1) + 1;
    out.push({ id: `${trace}-${steps[trace]}`, trace, step: steps[trace], kind, input, time });
  };

  // каталог семьи (задача 192o): сессии без собственной сводки показывают списки своей семьи
  add('agents', 'agent_catalog', { agent: 'opencode', updated: BASE, ...MOCK_OPTIONS }, BASE);

  // 1. закреплённая, закончена: инструменты, фоновые задачи, правки, результаты
  const s1 = 'ses-demo-1';
  add(s1, 'session_created', {
    name: 'Разбор падающих тестов', agent: 'opencode', project: 'crew-harness', project_id: 'proj-crew', folder: 'C:/work/crew-harness', branch: 'task/flaky-tests',
  }, BASE);
  add(s1, 'session_model', MOCK_OPTIONS, BASE + 1);
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
  // второе сообщение с приложенными картинками: запись о них стоит прямо перед сообщением (так её кладёт сервер)
  add(s1, 'message_images', {
    images: [
      { n: 1, name: 'image.png', mime: 'image/png', bytes: 2048 },
      { n: 2, name: 'image-2.png', mime: 'image/png', bytes: 2048 },
    ],
  }, BASE + 2 * MIN);
  add(s1, 'user_message', { turn: 't2', text: 'Вот два скриншота красного прогона. Что на них?' }, BASE + 2 * MIN + 100);
  add(s1, 'agent_chunk', { turn: 't2', text: 'На обоих одно и то же падение: тест ждёт порядок прибытия кусков.' }, BASE + 2 * MIN + 600);
  add(s1, 'agent_done', { turn: 't2' }, BASE + 2 * MIN + 900);
  add(s1, 'question_request', { turn: 't1', request: 'ask-demo-1', questions: mockQuestions() }, BASE + MIN + 5100);

  // 2. отказ агента после запроса разрешения
  const s2 = 'ses-demo-2';
  add(s2, 'session_created', {
    name: 'Уборка временных файлов', agent: 'opencode', project: 'crew-harness', project_id: 'proj-crew', folder: 'C:/work/crew-harness', branch: 'main',
  }, BASE + 5 * MIN);
  add(s2, 'user_message', { turn: 't1', text: 'Удали все временные файлы в проекте.' }, BASE + 6 * MIN);
  add(s2, 'agent_chunk', { turn: 't1', text: 'Для этого мне нужно удалить файлы в папке tmp. ' }, BASE + 6 * MIN + 400);
  add(s2, 'permission_request', { turn: 't1', request: 'j2-perm', action: 'Выполнить команду', detail: 'rm -rf tmp/cache.bin tmp/build.log' }, BASE + 6 * MIN + 800);
  add(s2, 'permission_decision', { request: 'j2-perm', decision: 'deny' }, BASE + 7 * MIN);
  add(s2, 'agent_refused', { turn: 't1', reason: 'вы отклонили удаление, файлы не тронуты' }, BASE + 7 * MIN + 300);
  add(s2, 'usage_update', { used: 12_000, size: CTX }, BASE + 7 * MIN + 400);

  // 3. ошибка в другом проекте
  const s4 = 'ses-demo-4';
  add(s4, 'session_created', {
    name: 'Заметки к релизу', agent: 'opencode', project: 'docs-site', project_id: 'proj-docs', folder: 'C:/work/docs-site', branch: 'main', pinned: true,
  }, BASE + HOUR);
  add(s4, 'user_message', { turn: 't1', text: 'Собери заметки к релизу из журнала изменений.' }, BASE + HOUR + MIN);
  add(s4, 'agent_chunk', { turn: 't1', text: 'Читаю журнал изменений… ' }, BASE + HOUR + MIN + 400);
  add(s4, 'error', { turn: 't1', message: 'обрыв связи с агентом' }, BASE + HOUR + MIN + 900);
  add(s4, 'usage_update', { used: 31_000, size: CTX }, BASE + HOUR + MIN + 1000);

  // 4. дочерняя сессия закреплённой, работа идёт: красная полоска контекста и бегущая строка
  const s3 = 'ses-demo-3';
  add(s3, 'session_created', {
    name: 'Проверка стражей', agent: 'opencode', project: 'crew-harness', project_id: 'proj-crew', folder: 'C:/work/crew-harness', branch: 'task/flaky-tests', parent: s1,
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

const WANTS_QUESTION = /спроси|вопрос|выбор/i;
const QUESTION_LEAD = ['Есть развилка, ', 'уточню у вас. '];
const QUESTION_ANSWERED = ['Принято, ', 'продолжаю по вашему выбору.'];
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
  const asks = {};
  const picks = {};
  const family = {};
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
    const entries = [];
    const { trace, input } = event;
    // сообщение с картинками: сервер сначала кладёт в журнал запись о них, потом само сообщение
    if (event.kind === 'user_message' && Array.isArray(input.images) && input.images.length > 0) {
      const images = input.images.map((i) => ({ n: i.n, name: String(i.name), mime: 'image/png', bytes: 2048 }));
      mint(entries, trace, 0, 'message_images', { images });
    }
    entries.push({ delay: 0, event });

    if (event.kind === 'user_message') {
      const turn = typeof input.turn === 'string' ? input.turn : event.id;
      const text = String(input.text);
      if (WANTS_QUESTION.test(text)) {
        const end = speak(entries, trace, turn, QUESTION_LEAD, CHUNK_FIRST_MS);
        const request = `ask-${serial + 1}`;
        mint(entries, trace, end, 'question_request', { turn, request, questions: mockQuestions() });
        asks[trace] = { request, turn };
      } else if (WANTS_PERMISSION.test(text)) {
        const end = speak(entries, trace, turn, PERMISSION_LEAD, CHUNK_FIRST_MS);
        const request = `perm-${serial + 1}`;
        mint(entries, trace, end, 'permission_request', {
          turn, request, action: 'Выполнить команду', detail: 'node scripts/clean.js tmp/\nrm -f tmp/old.log',
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
    } else if (event.kind === 'question_answer') {
      // ответ владельца: эхо уже в entries (оно закрывает форму и пишет строку в ленту); ход, ждавший ответа, продолжается
      const open = asks[trace];
      if (open && open.request === input.request) {
        delete asks[trace];
        const end = speak(entries, trace, open.turn, QUESTION_ANSWERED, CHUNK_FIRST_MS);
        mint(entries, trace, end, 'agent_done', { turn: open.turn });
      }
    } else if (event.kind === 'session_agent') {
      const from = family[trace] || 'opencode';
      family[trace] = String(input.agent);
      mint(entries, trace, CHUNK_FIRST_MS, 'agent_switched', { from, to: String(input.agent), shown: 4, total: 4, cut: 0 });
    } else if (event.kind === 'session_setting') {
      const key = { mode: 'mode', model: 'model_id', effort: 'effort' }[input.setting];
      if (key) {
        picks[trace] = { ...(picks[trace] || {}), [key]: input.value };
        const merged = { ...MOCK_OPTIONS, ...picks[trace] };
        const named = merged.models.find((m) => m.id === merged.model_id);
        mint(entries, trace, CHUNK_FIRST_MS, 'session_model', { ...merged, model: named ? named.name : merged.model });
      }
    } else if (event.kind === 'cancel') {
      delete pending[trace];
      delete asks[trace];
    }
    return entries;
  }

  return { handle, journal: () => shown };
}

// ---- заглушка распознавания речи (задача 192): в режиме ?mock=1 сервера нет, но выбор провайдера и запись можно проверить
export const MOCK_STT_TEXT = 'пример распознанного текста';

// ---- заглушка проектов и обзора папок (задача 192n): всё в памяти, как договорённость с сервером

/** Дерево папок заглушки: путь -> вложенные каталоги. Диски: C:/ и D:/. */
const MOCK_TREE = Object.freeze({
  'C:/': ['Users', 'work'],
  'C:/Users': ['demo'],
  'C:/work': ['api-server', 'crew-harness', 'docs-site', 'notes'],
  'C:/work/api-server': ['src', 'tests'],
  'C:/work/crew-harness': ['doc', 'scripts', 'src'],
  'C:/work/crew-harness/src': ['web', 'machine'],
  'C:/work/docs-site': ['content', 'theme'],
  'C:/work/notes': [],
  'D:/': ['data', 'tmp'],
  'D:/data': ['archive'],
});
const MOCK_GIT = Object.freeze({
  'C:/work/crew-harness': 'main',
  'C:/work/docs-site': 'docs',
  'C:/work/api-server': 'develop',
});
const MOCK_RECENT = Object.freeze(['C:/work/crew-harness', 'C:/work/docs-site', 'C:/work/api-server']);

function mockProjects() {
  const projects = [
    {
      id: 'proj-crew', name: 'crew-harness', env: 'NODE_ENV=production\nGIT_AUTHOR_NAME=Your Name',
      folders: [{ path: 'C:/work/crew-harness', branch: 'main', worktree: true }],
    },
    {
      id: 'proj-docs', name: 'docs-site', env: '',
      folders: [{ path: 'C:/work/docs-site', worktree: false }, { path: 'C:/work/notes', worktree: false }],
    },
  ];
  let serial = 2;
  const find = (id) => projects.find((p) => p.id === id);
  const checked = (body) => {
    if (!body || typeof body.name !== 'string' || body.name.trim() === '') return 'название проекта не задано';
    const env = parseEnv(body.env);
    if (env.errors.length > 0) return env.errors[0].message;
    return '';
  };
  const clean = (body) => ({
    name: body.name.trim(),
    env: typeof body.env === 'string' ? body.env : '',
    folders: (Array.isArray(body.folders) ? body.folders : []).map((f) => {
      const out = { path: normalizePath(f.path), worktree: f.worktree === true };
      if (typeof f.branch === 'string' && f.branch) out.branch = f.branch;
      return out;
    }),
  });
  return {
    summary: () => ({ projects: projects.map((p) => ({ id: p.id, name: p.name, folders: p.folders, env_keys: parseEnv(p.env).vars.map((v) => v.key) })) }),
    get: find,
    create(body) {
      const error = checked(body);
      if (error) return { status: 400, body: { error } };
      serial += 1;
      const project = { id: `proj-${serial}`, ...clean(body) };
      projects.push(project);
      return { status: 201, body: { id: project.id } };
    },
    update(id, body) {
      const at = projects.findIndex((p) => p.id === id);
      if (at < 0) return { status: 404, body: { error: 'проект не найден' } };
      const error = checked(body);
      if (error) return { status: 400, body: { error } };
      projects[at] = { id, ...clean(body) };
      return { status: 200, body: { id } };
    },
    remove(id) {
      const at = projects.findIndex((p) => p.id === id);
      if (at < 0) return { status: 404, body: { error: 'проект не найден' } };
      projects.splice(at, 1);
      return { status: 200, body: {} };
    },
  };
}

function mockFsList(rawPath) {
  const path = normalizePath(rawPath);
  if (path === '') {
    return { status: 200, body: { path: '', parent: null, entries: ['C:/', 'D:/'].map((name) => ({ name, dir: true })), recent: [...MOCK_RECENT] } };
  }
  const key = Object.keys(MOCK_TREE).find((k) => samePath(k, path));
  if (key === undefined) return { status: 404, body: { error: `папка не найдена: ${path}` } };
  return { status: 200, body: { path: key, parent: parentPath(key), entries: MOCK_TREE[key].map((name) => ({ name, dir: true })) } };
}

function mockFsGit(rawPath) {
  const key = Object.keys(MOCK_GIT).find((k) => samePath(k, rawPath));
  return { status: 200, body: key === undefined ? { is_repo: false, branch: '' } : { is_repo: true, branch: MOCK_GIT[key] } };
}

/** fetch, который сам отвечает на /api/stt, /api/projects и /api/fs/*, а всё остальное отдаёт настоящему fetch. */
export function mockFetch(real) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const reply = ({ status, body }) => json(body, status);
  const projects = mockProjects();
  const numbers = {};
  return async (url, init) => {
    const [path, query = ''] = String(url).split('?');
    const method = String((init && init.method) || 'GET').toUpperCase();
    // загрузка картинки сообщения (задача 192): сервера нет, номер выдаёт заглушка
    const upload = /^\/api\/session-image\/([^/]+)$/.exec(path);
    if (upload && init && init.method === 'POST') {
      numbers[upload[1]] = (numbers[upload[1]] ?? 0) + 1;
      return json({ n: numbers[upload[1]], bytes: init.body && init.body.size ? init.body.size : 0 });
    }
    if (path === '/api/stt/status') return json({ available: true, provider: 'local', model: 'small' });
    if (path === '/api/stt') return json({ text: MOCK_STT_TEXT });
    if (path === '/api/fs/list') return reply(mockFsList(new URLSearchParams(query).get('path') ?? ''));
    if (path === '/api/fs/git') return reply(mockFsGit(new URLSearchParams(query).get('path') ?? ''));
    if (path === '/api/projects') {
      if (method === 'GET') return json(projects.summary());
      if (method === 'POST') return reply(projects.create(JSON.parse(init.body)));
    }
    const one = /^\/api\/projects\/([^/]+)$/.exec(path);
    if (one) {
      const id = decodeURIComponent(one[1]);
      if (method === 'GET') { const p = projects.get(id); return p ? json(p) : json({ error: 'проект не найден' }, 404); }
      if (method === 'PUT') return reply(projects.update(id, JSON.parse(init.body)));
      if (method === 'DELETE') return reply(projects.remove(id));
    }
    return real(url, init);
  };
}

/** Адрес картинки в режиме ?mock=1: сервера нет, у всех одна заготовленная картинка рядом со страницей. */
export const mockImageSrc = () => 'mock-image.png';

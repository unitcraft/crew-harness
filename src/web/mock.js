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

const BASE = 1_792_314_000_000;
const MIN = 60_000;

const ev = (id, trace, step, kind, input, time) => ({ id, trace, step, kind, input, time });

/** Два готовых разговора: один закончен, второй упёрся в отказ. */
export const INITIAL_JOURNAL = Object.freeze([
  ev('j1-0', 'ses-demo-1', 0, 'session_created', { name: 'Разбор падающих тестов', agent: 'opencode' }, BASE),
  ev('j1-1', 'ses-demo-1', 1, 'user_message', { turn: 't1', text: 'Почему тест на дубликаты событий иногда красный?' }, BASE + MIN),
  ev('j1-2', 'ses-demo-1', 2, 'agent_chunk', { turn: 't1', text: 'Похоже, тест полагается на порядок прибытия. ' }, BASE + MIN + 400),
  ev('j1-3', 'ses-demo-1', 3, 'agent_chunk', { turn: 't1', text: 'Если куски приходят вперемешку, нужно сортировать по номеру шага:\n\n```js\nchunks.sort((a, b) => a.step - b.step);\n```\n' }, BASE + MIN + 800),
  ev('j1-4', 'ses-demo-1', 4, 'agent_chunk', { turn: 't1', text: 'После этого порядок прибытия перестаёт влиять на результат.' }, BASE + MIN + 1200),
  ev('j1-5', 'ses-demo-1', 5, 'agent_done', { turn: 't1' }, BASE + MIN + 1500),

  ev('j2-0', 'ses-demo-2', 0, 'session_created', { name: 'Уборка временных файлов', agent: 'opencode' }, BASE + 5 * MIN),
  ev('j2-1', 'ses-demo-2', 1, 'user_message', { turn: 't1', text: 'Удали все временные файлы в проекте.' }, BASE + 6 * MIN),
  ev('j2-2', 'ses-demo-2', 2, 'agent_chunk', { turn: 't1', text: 'Для этого мне нужно удалить файлы в папке tmp. ' }, BASE + 6 * MIN + 400),
  ev('j2-3', 'ses-demo-2', 3, 'permission_request', { turn: 't1', request: 'j2-perm', action: 'Удалить файлы в папке tmp/', detail: 'tmp/cache.bin, tmp/build.log' }, BASE + 6 * MIN + 800),
  ev('j2-4', 'ses-demo-2', 4, 'permission_decision', { request: 'j2-perm', decision: 'deny' }, BASE + 7 * MIN),
  ev('j2-5', 'ses-demo-2', 5, 'agent_refused', { turn: 't1', reason: 'вы отклонили удаление, файлы не тронуты' }, BASE + 7 * MIN + 300),
]);

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

const WANTS_PERMISSION = /файл|удал|команд|запуст|разреш/i;

const CHUNK_FIRST_MS = 350;
const CHUNK_EVERY_MS = 320;

export function createMockServer({ journal = INITIAL_JOURNAL, now = Date.now } = {}) {
  const lastStep = {};
  const pending = {};
  let serial = 0;

  const note = (e) => { lastStep[e.trace] = Math.max(lastStep[e.trace] ?? -1, e.step); };
  journal.forEach(note);

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

  function handle(event) {
    note(event);
    const entries = [{ delay: 0, event }];
    const { trace, input } = event;

    if (event.kind === 'user_message') {
      const turn = typeof input.turn === 'string' ? input.turn : event.id;
      if (WANTS_PERMISSION.test(String(input.text))) {
        const end = speak(entries, trace, turn, PERMISSION_LEAD, CHUNK_FIRST_MS);
        const request = `perm-${serial + 1}`;
        mint(entries, trace, end, 'permission_request', {
          turn, request, action: 'Изменить файлы в рабочей папке', detail: 'src/example.txt (запись), tmp/old.log (удаление)',
        });
        pending[trace] = { request, turn };
      } else {
        const end = speak(entries, trace, turn, PLAIN_CHUNKS, CHUNK_FIRST_MS);
        mint(entries, trace, end, 'agent_done', { turn });
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

  return { handle, journal: () => journal };
}

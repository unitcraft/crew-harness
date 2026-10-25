// Проверки заглушки: журналы и сервер-воспроизведение складываются в правильные виды.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mock from '../mock.js';
import { INITIAL_JOURNAL, AGENTS, createMockServer } from '../mock.js';
import { initialModel, reduce, isEvent, makeEvent, nextStep } from '../state.js';

function setup() {
  let t = 5_000_000;
  const server = createMockServer({ now: () => (t += 1) });
  let model = INITIAL_JOURNAL.reduce(reduce, initialModel());
  let n = 0;
  const newId = () => `c${(n += 1)}`;
  const send = (kind, trace, input) => {
    const e = makeEvent(kind, trace, nextStep(model, trace), input, { newId, now: () => (t += 1) });
    const entries = server.handle(e);
    for (const x of entries) model = reduce(model, x.event);
    return entries;
  };
  return { server, send, get: () => model };
}

test('журнал-заготовка: события валидны, id уникальны, сессии в разных состояниях', () => {
  assert.ok(INITIAL_JOURNAL.every(isEvent));
  const ids = INITIAL_JOURNAL.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const m = INITIAL_JOURNAL.reduce(reduce, initialModel());
  const states = Object.values(m.sessions).map((s) => s.state).sort();
  assert.deepEqual(states, ['answering', 'error', 'idle', 'refused']);
});

test('список агентов: OpenCode доступен, второй помечен на потом', () => {
  assert.equal(AGENTS[0].id, 'opencode');
  assert.equal(AGENTS[0].disabled, undefined);
  assert.ok(AGENTS.slice(1).every((a) => a.disabled === true));
});

test('обычный ответ: эхо, куски по возрастающим шагам, завершение', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  const entries = send('user_message', trace, { turn: 'tx', text: 'Объясни коротко' });
  const kinds = entries.map((x) => x.event.kind);
  assert.equal(kinds[0], 'user_message');
  assert.ok(kinds.filter((k) => k === 'agent_chunk').length >= 3);
  assert.equal(kinds.at(-1), 'agent_done');
  assert.ok(entries.every((x, i) => i === 0 || x.delay >= entries[i - 1].delay));
  assert.ok(entries.every((x) => isEvent(x.event)));
  const steps = entries.map((x) => x.event.step);
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b));
  assert.equal(new Set(steps).size, steps.length);
  const s = get().sessions[trace];
  assert.equal(s.state, 'idle');
  assert.ok(s.messages.find((x) => x.key === 'a:tx').text.length > 20);
});

test('сценарий с разрешением: запрос, отказ после «Отклонить»', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  const entries = send('user_message', trace, { turn: 'tp', text: 'Удали временный файл' });
  assert.equal(entries.at(-1).event.kind, 'permission_request');
  assert.equal(get().sessions[trace].state, 'permission');
  const request = get().sessions[trace].pending.request;
  const after = send('permission_decision', trace, { request, decision: 'deny' });
  assert.equal(after.at(-1).event.kind, 'agent_refused');
  assert.equal(get().sessions[trace].state, 'refused');
  assert.equal(get().sessions[trace].pending, null);
});

test('сценарий с разрешением: «Разрешить» ведёт к ответу и завершению', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  send('user_message', trace, { turn: 'tp', text: 'Запусти команду' });
  const request = get().sessions[trace].pending.request;
  const after = send('permission_decision', trace, { request, decision: 'allow' });
  assert.equal(after.at(-1).event.kind, 'agent_done');
  assert.equal(get().sessions[trace].state, 'idle');
});

test('новая сессия: сервер повторяет session_created и не выдумывает лишнего', () => {
  const { send, get } = setup();
  const before = Object.keys(get().sessions).length;
  const entries = send('session_created', 'новая', { name: 'Новая', agent: 'opencode' });
  assert.equal(entries.length, 1);
  assert.equal(Object.keys(get().sessions).length, before + 1);
});

test('отмена: сервер только повторяет событие, остальное снимает транспорт', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  send('user_message', trace, { turn: 'tc', text: 'Расскажи' });
  const entries = send('cancel', trace, { turn: 'tc' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event.kind, 'cancel');
});

test('журнал-заготовка: закреплённая, дочерняя, красный контекст, правки, результаты, фоновые задачи', () => {
  const m = INITIAL_JOURNAL.reduce(reduce, initialModel());
  const all = Object.values(m.sessions);
  assert.ok(all.some((s) => s.pinned), 'нужна закреплённая сессия');
  assert.ok(all.some((s) => s.parent && m.sessions[s.parent]), 'нужна дочерняя сессия с существующим родителем');
  assert.ok(new Set(all.map((s) => s.project)).size >= 2, 'нужно не меньше двух проектов');
  assert.ok(all.some((s) => s.usage && s.usage.used / s.usage.size >= 0.9), 'нужен контекст от 90 %');
  assert.ok(all.some((s) => s.usage && s.usage.used / s.usage.size < 0.5), 'нужен спокойный контекст');
  assert.ok(all.some((s) => s.diffs.length >= 3), 'нужна карточка правок на 3-4 файла');
  assert.ok(all.some((s) => s.outputs.length >= 5), 'нужны результаты с «Показать ещё»');
  assert.ok(all.some((s) => s.tasks.some((t) => t.status === 'running')), 'нужна идущая фоновая задача');
  assert.ok(all.some((s) => s.tasks.filter((t) => t.status !== 'running').length >= 2), 'нужны завершённые задачи');
  assert.ok(all.some((s) => s.tools.length >= 3), 'нужны вызовы инструментов');
  assert.ok(all.some((s) => s.state === 'answering'), 'нужна идущая работа');
  assert.ok(all.every((s) => s.folder !== undefined && s.branch !== undefined));
});

test('rebaseJournal: сдвигает времена так, что последнее событие чуть раньше «сейчас», разности сохраняются', () => {
  assert.equal(typeof mock.rebaseJournal, 'function');
  const now = 9_000_000_000_000;
  const rebased = mock.rebaseJournal(INITIAL_JOURNAL, now);
  assert.equal(rebased.length, INITIAL_JOURNAL.length);
  const max = Math.max(...rebased.map((e) => e.time));
  assert.ok(now - max > 0 && now - max <= 30_000);
  const d0 = INITIAL_JOURNAL[3].time - INITIAL_JOURNAL[1].time;
  assert.equal(rebased[3].time - rebased[1].time, d0);
  assert.ok(rebased.every((e, i) => e.id === INITIAL_JOURNAL[i].id && isEvent(e)));
});

test('сценарий работы: инструменты, фоновая команда, контекст, файлы, правки, завершение', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  const entries = send('user_message', trace, { turn: 'tw', text: 'Прогони тесты и собери отчёт' });
  const kinds = entries.map((x) => x.event.kind);
  for (const k of ['tool_call', 'tool_call_update', 'background_task', 'background_task_update', 'usage_update', 'output_file', 'file_diff', 'agent_chunk']) {
    assert.ok(kinds.includes(k), `нет события ${k}`);
  }
  assert.ok(kinds.filter((k) => k === 'tool_call').length >= 2);
  assert.ok(kinds.filter((k) => k === 'file_diff').length >= 3 && kinds.filter((k) => k === 'file_diff').length <= 4);
  assert.equal(kinds.at(-1), 'agent_done');
  assert.ok(entries.every((x) => isEvent(x.event)));
  const steps = entries.map((x) => x.event.step);
  assert.equal(new Set(steps).size, steps.length);
  assert.ok(entries.every((x, i) => i === 0 || x.delay >= entries[i - 1].delay));
  const s = get().sessions[trace];
  assert.equal(s.state, 'idle');
  assert.ok(s.tools.length >= 2 && s.tools.every((t) => t.status === 'completed'));
  assert.equal(s.tasks.at(-1).status, 'completed');
  assert.ok(s.usage && s.usage.used > 0);
  assert.ok(s.outputs.length >= 1);
  assert.ok(s.diffs.length >= 3);
});

test('обычный ответ тоже обновляет контекст, а контекст растёт от хода к ходу', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  send('user_message', trace, { turn: 'a1', text: 'Объясни коротко' });
  const first = get().sessions[trace].usage.used;
  send('user_message', trace, { turn: 'a2', text: 'Объясни ещё' });
  assert.ok(get().sessions[trace].usage.used > first);
});

test('сценарий разрешения не ломается: «Запусти команду» по-прежнему просит разрешения', () => {
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  const entries = send('user_message', trace, { turn: 'pp', text: 'Запусти команду сборки' });
  assert.equal(entries.at(-1).event.kind, 'permission_request');
});

// задача 189: диалог разрешения показывает саму команду (detail), а не только вид действия
test('запрос разрешения: в detail — сама команда, у заготовки и у живого сценария', () => {
  const m = INITIAL_JOURNAL.reduce(reduce, initialModel());
  const perms = Object.values(m.sessions).flatMap((s) => s.messages.filter((x) => x.role === 'permission'));
  assert.ok(perms.length >= 1, 'в заготовке нужен запрос разрешения');
  for (const p of perms) {
    assert.ok(typeof p.detail === 'string' && p.detail.length > 0, 'detail не пуст');
    assert.notEqual(p.detail, p.action, 'detail — это не подпись действия');
  }
  const { send, get } = setup();
  const trace = Object.keys(get().sessions)[0];
  send('user_message', trace, { turn: 'tp', text: 'Запусти команду' });
  const pending = get().sessions[trace].pending;
  assert.ok(pending.detail.includes('node scripts/clean.js'), 'в detail видна команда');
  assert.ok(pending.detail.includes('\n'), 'многострочная команда приходит целиком');
});

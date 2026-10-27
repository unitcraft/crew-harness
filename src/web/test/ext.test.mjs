// Дополнение открытой задачи, применённое сразу (задача 192.7): серая строка ленты «Дополнено в задачу K «название»: кратко» с кнопкой «Отменить»,
// после отмены — строка без кнопки; сигнал route_ext_undo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialModel, reduce, timeline } from '../state.js';
import { parseCrewTask, crewSignal } from '../crew-task.js';
import { t } from '../strings.js';

let counter = 0;
const ev = (kind, input = {}, { step = 0 } = {}) => ({ id: `x${(counter += 1)}`, trace: 's1', step, kind, input, time: 1000 + step });
const run = (events) => events.reduce((m, e) => reduce(m, e), initialModel());
const created = () => ev('session_created', { name: 'Беседа', agent: 'claude' });
const ext = (extra = {}) => ({ id: 1, task: 3, title: 'Кнопка выхода', text: 'ещё добавь подтверждение', at: 5, undone: false, ...extra });
const state = (extensions, step) => ev('route_state', { route: 'interactive', extensions }, { step });
const lines = (m) => timeline(m.sessions.s1).filter((x) => x.type === 'autoext');

test('parseCrewTask: дополнения читаются, мусор и нулевой номер отбрасываются', () => {
  assert.deepEqual(parseCrewTask({ extensions: [ext(), { id: 0 }, 5, ext({ id: 2, undone: true })] }).extensions.map((x) => [x.id, x.undone]), [[1, false], [2, true]]);
  assert.deepEqual(parseCrewTask({}).extensions, []);
});

test('в ленте одна серая строка на дополнение, повтор состояния её не дублирует', () => {
  const m = run([created(), state([ext()], 1), state([ext()], 2)]);
  assert.equal(lines(m).length, 1);
  const line = lines(m)[0];
  assert.deepEqual({ task: line.task, title: line.title, text: line.text, undone: line.undone }, { task: 3, title: 'Кнопка выхода', text: 'ещё добавь подтверждение', undone: false });
  assert.equal(t('route.ext_line', line), 'Дополнено в задачу 3 «Кнопка выхода»: ещё добавь подтверждение');
  assert.equal(t('route.ext_undo'), 'Отменить');
});

test('отмена меняет ту же строку (без новой), второе дополнение — вторая строка', () => {
  const m = run([created(), state([ext()], 1), state([ext({ undone: true })], 2), state([ext({ undone: true }), ext({ id: 2, text: 'второе' })], 3)]);
  assert.deepEqual(lines(m).map((x) => [x.id, x.undone]), [[1, true], [2, false]]);
  assert.match(t('route.ext_undone', lines(m)[0]), /отменено/);
});

test('сигнал и кнопка: route_ext_undo с номером дополнения, обработчик подключён в странице', () => {
  assert.deepEqual(crewSignal.extUndo(4), { kind: 'route_ext_undo', input: { id: 4 } });
  const web = new URL('../', import.meta.url);
  const read = (n) => fs.readFileSync(new URL(n, web), 'utf8');
  assert.match(read('view.js'), /handlers\.onExtUndo\(currentTrace, item\.id\)/);
  assert.match(read('view.js'), /item\.undone \? false : h\(doc, 'button'/);
  assert.match(read('app.js'), /onExtUndo\(trace, id\) \{ send\(\.\.\.signal\(trace, crewSignal\.extUndo\(id\)\)\); \}/);
  assert.match(read('transport.js'), /'route_ext_undo'/);
});

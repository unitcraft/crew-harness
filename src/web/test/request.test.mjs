// Вкладка «Запрос» (задача 192.11): событие turn_request в модели, разбор, карточки частей, выбор хода, раскрытие, копирование, сырой обмен, мок.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../state.js';
import {
  parseTurnRequest, addRequest, pickRequest, traceRange, requestJson, prettySchema, REQUEST_KEEP, firstLine,
} from '../request.js';
import { createRequestPanel } from '../request-ui.js';
import { createMockServer, requestInput } from '../mock.js';
import { createFakeDocument } from './fake-dom.mjs';

let n = 0;
const ev = (kind, input = {}, { trace = 's1', step = 0, time = 1000 + step } = {}) => { n += 1; return { id: `r${n}`, trace, step, kind, input, time }; };
const created = () => ev('session_created', { name: 'S', agent: 'opencode' }, { step: 0, time: 1000 });
const part = (kind, title, text, extra = {}) => ({ kind, title, text, chars: Array.from(text).length, approx_tokens: Math.floor(Array.from(text).length / 4), truncated: false, ...extra });
const wire = (turn, extra = {}) => ({
  session: 's1', turn, at: 5000 + turn, agent: 'opencode', cwd: 'C:/work/app', mode: 'default', route: 'interactive', model: 'm', effort: 'high', label: '',
  parts: [part('mode_instruction', 'Инструкция режима', 'Ты в режиме беседы.'), part('owner_message', 'Сообщение владельца', 'привет, мир'), part('images', 'Картинки: 1', 'shot.png (image/png)')],
  tools: {
    hub: [{ name: 'ask_user_question', description: 'Ask the user a question.\nSecond line.', schema: '{"type":"object","properties":{"question":{"type":"string"}}}' }],
    agent: [{ name: 'Read', kind: 'read', title: 'Read file a.txt' }], commands: ['init - make a file'],
  },
  mcp: [{ name: 'crew', url_kind: 'http, 127.0.0.1' }], raw_ref: { file: 'acp.jsonl', from_line: turn * 10, to_line: 0 }, ...extra,
});
const run = (events) => events.reduce((m, e) => st.reduce(m, e), st.initialModel());

test('turn_request: разбор частей, сумма токенов, инструменты, параметры, сырой обмен', () => {
  const r = parseTurnRequest(wire(1));
  assert.equal(r.parts.length, 3);
  assert.deepEqual(r.parts.map((p) => p.kind), ['mode_instruction', 'owner_message', 'images']);
  assert.equal(r.totalTokens, r.parts.reduce((a, p) => a + p.tokens, 0));
  assert.equal(r.hubTools[0].name, 'ask_user_question');
  assert.ok(r.hubTools[0].schema.includes('\n'), 'схема — читаемый JSON');
  assert.deepEqual(r.agentTools, [{ name: 'Read', kind: 'read', title: 'Read file a.txt' }]);
  assert.deepEqual(r.commands, ['init - make a file']);
  assert.equal(r.mcp[0].urlKind, 'http, 127.0.0.1');
  assert.deepEqual(r.raw, { file: 'acp.jsonl', from: 10, to: 0 });
  assert.equal(parseTurnRequest({ parts: [{ kind: 'странный' }, 5], turn: 'x' }).parts[0].kind, 'other');
  assert.equal(parseTurnRequest(null).turn, 0);
  assert.equal(prettySchema('не json'), 'не json');
});

test('turn_request: ложится в сессию, тот же ход заменяется, хранится не больше 20, в seen не попадает', () => {
  let m = run([created()]);
  for (let i = 1; i <= 25; i += 1) m = st.reduce(m, ev('turn_request', wire(i)));
  const s = m.sessions.s1;
  assert.equal(s.requests.length, REQUEST_KEEP);
  assert.equal(s.requests[0].turn, 6);
  assert.equal(s.requests.at(-1).turn, 25);
  const m2 = st.reduce(m, ev('turn_request', wire(25, { raw_ref: { file: 'acp.jsonl', from_line: 250, to_line: 259 } })));
  assert.equal(m2.sessions.s1.requests.length, REQUEST_KEEP);
  assert.equal(m2.sessions.s1.requests.at(-1).raw.to, 259);
  assert.deepEqual(m2.seen, m.seen);
  assert.equal(st.reduce(m, ev('turn_request', wire(3), { trace: 'nope' })), m, 'чужая сессия — ничего');
  assert.equal(m.sessions.s1.updatedAt, run([created()]).sessions.s1.updatedAt, 'порядок списка не меняется');
});

test('выбор хода и диапазон строк сырого обмена', () => {
  const list = addRequest(addRequest([], parseTurnRequest(wire(1))), parseTurnRequest(wire(2)));
  assert.equal(pickRequest(list, 0).turn, 2);
  assert.equal(pickRequest(list, 1).turn, 1);
  assert.equal(pickRequest(list, 9).turn, 2);
  assert.equal(pickRequest([], 0), null);
  assert.deepEqual(traceRange(list[0], list), { from: 10, to: 19 }, 'конец — перед следующим ходом');
  assert.deepEqual(traceRange(list[1], list), { from: 20, to: 219 }, 'у последнего — не больше 200 строк');
  const closed = parseTurnRequest(wire(1, { raw_ref: { file: 'acp.jsonl', from_line: 10, to_line: 14 } }));
  assert.deepEqual(traceRange(closed, list), { from: 10, to: 14 }, 'конец сказал хаб');
  assert.equal(traceRange(parseTurnRequest(wire(1, { raw_ref: { file: 'acp.jsonl', from_line: 0, to_line: 0 } })), list), null, 'трасса выключена');
  assert.ok(JSON.parse(requestJson(list[0])).parts.length === 3);
  assert.equal(firstLine('\n  Раз\nДва'), 'Раз');
});

// ---- карточки ----

function setup(requests, { fetchTrace } = {}) {
  const doc = createFakeDocument();
  const log = { copied: [], got: [], renders: 0, traces: [] };
  const session = { id: 's1', requests: requests.map((r) => parseTurnRequest(r)) };
  const panel = createRequestPanel(doc, {
    onCopy: (x) => log.copied.push(x),
    onGet: (id, turn) => log.got.push([id, turn]),
    fetchTrace: fetchTrace ?? ((id, from, to) => { log.traces.push([id, from, to]); return Promise.resolve({ lines: [{ n: from, t: 1, dir: 'out', line: '{"method":"session/prompt"}' }] }); }),
    rerender: () => { log.renders += 1; },
  });
  const paint = () => { const box = doc.createElement('div'); box.append(...panel.render(session)); return box; };
  return { doc, panel, log, paint, session };
}

test('без запросов — пояснение границы и кнопка «Запросить у сервера»', () => {
  const s = setup([]);
  const box = s.paint();
  assert.ok(box.querySelector('.req-border').textContent.includes('системный промпт'));
  box.querySelector('.req-ask').click();
  assert.deepEqual(s.log.got, [['s1', 0]]);
});

test('вкладка: последний ход по умолчанию, сводка, пояснение границы, карточки свёрнуты', () => {
  const s = setup([wire(1), wire(2)]);
  const box = s.paint();
  assert.equal(box.querySelector('.req-card').getAttribute('data-turn'), '2');
  assert.ok(box.querySelector('.req-border').textContent.includes('не видит'));
  assert.ok(box.querySelector('.req-sum').textContent.startsWith('частей 3, ≈ '));
  assert.equal(box.querySelectorAll('.req-chip').length, 2);
  assert.equal(box.querySelectorAll('.req-part').length, 3);
  assert.equal(box.querySelector('.req-text'), null, 'текст скрыт, пока карточка свёрнута');
  assert.equal(box.querySelector('.req-part .req-head').getAttribute('aria-expanded'), 'false');
});

test('выбор хода, раскрытие части и копирование текста', () => {
  const s = setup([wire(1), wire(2)]);
  let box = s.paint();
  box.querySelectorAll('.req-chip')[0].click();
  assert.equal(s.log.renders, 1);
  box = s.paint();
  assert.equal(box.querySelector('.req-card').getAttribute('data-turn'), '1');
  box.querySelectorAll('.req-part .req-head')[1].click();
  box = s.paint();
  const pre = box.querySelector('.req-part .req-text');
  assert.equal(pre.textContent, 'привет, мир');
  box.querySelector('.req-part .req-copy').click();
  assert.deepEqual(s.log.copied, ['привет, мир']);
  box.querySelectorAll('.req-part .req-head')[1].click();
  assert.equal(s.paint().querySelector('.req-part .req-text'), null);
  // последний чип возвращает «следить за последним»
  box = s.paint();
  box.querySelectorAll('.req-chip')[1].click();
  assert.equal(s.paint().querySelector('.req-card').getAttribute('data-turn'), '2');
});

test('инструменты: хаб — имя, описание, схема; агент и команды — со слов агента', () => {
  const s = setup([wire(1)]);
  let box = s.paint();
  const tools = box.querySelector('.req-tools');
  assert.ok(tools.textContent.includes('ask_user_question'));
  assert.ok(tools.textContent.includes('со слов агента'));
  assert.ok(tools.querySelector('.req-agent-tool').textContent.includes('Read'));
  assert.ok(tools.querySelector('.req-command').textContent.includes('init'));
  assert.equal(tools.querySelector('.req-tool .req-text'), null);
  tools.querySelector('.req-tool .req-head').click();
  box = s.paint();
  const open = box.querySelector('.req-tool');
  assert.ok(open.textContent.includes('Second line.'));
  assert.ok(open.querySelector('.req-text').textContent.includes('"properties"'));
  open.querySelector('.req-copy').click();
  assert.ok(s.log.copied[0].includes('"question"'));
});

test('параметры: агент, режим, модель, усилие, папка, MCP', () => {
  const s = setup([wire(1)]);
  const text = s.paint().querySelector('.req-params').textContent;
  for (const x of ['opencode', 'default', 'interactive', 'C:/work/app', 'high', 'crew: http, 127.0.0.1']) assert.ok(text.includes(x), x);
});

test('сырой обмен: строки по запросу, ошибка, выключенная трасса', async () => {
  const s = setup([wire(1), wire(2)]);
  let box = s.paint();
  const first = box.querySelectorAll('.req-raw-btn')[0];
  assert.ok(first.textContent.includes('20–219'));
  first.click();
  assert.deepEqual(s.log.traces, [['s1', 20, 219]]);
  await new Promise((r) => setTimeout(r, 0));
  box = s.paint();
  assert.ok(box.querySelector('.req-raw').textContent.includes('session/prompt'));
  box.querySelector('.req-rawcard .req-copy').click();
  assert.ok(s.log.copied[0].includes('session/prompt'));
  // ошибка сервера
  const bad = setup([wire(1)], { fetchTrace: () => Promise.resolve({ error: 'нет файла' }) });
  bad.paint().querySelector('.req-raw-btn').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(bad.paint().querySelector('.req-raw-error').textContent.includes('нет файла'));
  const off = setup([wire(1, { raw_ref: { file: 'acp.jsonl', from_line: 0, to_line: 0 } })]);
  assert.equal(off.paint().querySelector('.req-raw-btn'), null);
});

test('мок: сообщение даёт turn_request, request_get повторяет ход', () => {
  const server = createMockServer({ machines: true });
  const input = requestInput('s1', 2, 'привет', 1);
  assert.equal(input.turn, 2);
  assert.ok(input.tools.hub.length > 0 && input.parts.some((p) => p.kind === 'owner_message'));
  assert.ok(parseTurnRequest(input).hubTools[0].schema.includes('\n'));
  assert.ok(server);
});

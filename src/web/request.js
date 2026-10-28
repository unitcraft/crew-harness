// request.js — состав запроса к агенту на странице (задача 192.11): чистый модуль без DOM и часов.
// Событие turn_request { session, turn, at, agent, cwd, mode, route, model, effort, label, parts[], tools{hub,agent,commands}, mcp[], raw_ref{file,from_line,to_line} }:
// хаб шлёт его на каждый ход агенту; он хранится в памяти хаба (последние 20 ходов) и в журнал сессии не пишется.
// ЧЕСТНАЯ ГРАНИЦА: хаб видит только то, что сам отправляет агенту по ACP. Собственный системный промпт агента и список его встроенных инструментов он не видит.

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);

/** Сколько ходов хранит и показывает страница (как хаб). */
export const REQUEST_KEEP = 20;

/** Виды частей запроса. */
export const PART_KINDS = Object.freeze(['hub_note', 'mode_instruction', 'reminder', 'task_list', 'owner_message', 'images', 'tool_result_hint', 'other']);

/** Самый длинный диапазон строк сырого обмена, который просит страница. */
export const TRACE_SPAN = 200;

function parsePart(p) {
  const kind = PART_KINDS.includes(p.kind) ? p.kind : 'other';
  return {
    kind, title: str(p.title), text: str(p.text), chars: num(p.chars), tokens: num(p.approx_tokens), truncated: p.truncated === true,
  };
}

/** Схема инструмента как читаемый JSON (если пришёл не JSON — как есть). */
export function prettySchema(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch (e) { return String(text); }
}

/** Вычистить payload turn_request: неверное отбрасывается. */
export function parseTurnRequest(input) {
  const src = isObject(input) ? input : {};
  const parts = (Array.isArray(src.parts) ? src.parts : []).filter(isObject).map(parsePart);
  const tools = isObject(src.tools) ? src.tools : {};
  const raw = isObject(src.raw_ref) ? src.raw_ref : {};
  return {
    turn: num(src.turn),
    at: num(src.at),
    agent: str(src.agent),
    cwd: str(src.cwd),
    mode: str(src.mode),
    route: str(src.route),
    model: str(src.model),
    effort: str(src.effort),
    label: str(src.label),
    parts,
    hubTools: (Array.isArray(tools.hub) ? tools.hub : []).filter(isObject)
      .map((x) => ({ name: str(x.name), description: str(x.description), schema: prettySchema(str(x.schema)) })),
    agentTools: (Array.isArray(tools.agent) ? tools.agent : []).filter(isObject).map((x) => ({ name: str(x.name), kind: str(x.kind), title: str(x.title) })),
    commands: (Array.isArray(tools.commands) ? tools.commands : []).filter((x) => typeof x === 'string'),
    mcp: (Array.isArray(src.mcp) ? src.mcp : []).filter(isObject).map((x) => ({ name: str(x.name), urlKind: str(x.url_kind) })),
    raw: { file: str(raw.file, 'acp.jsonl'), from: num(raw.from_line), to: num(raw.to_line) },
    totalChars: parts.reduce((a, p) => a + p.chars, 0),
    totalTokens: parts.reduce((a, p) => a + p.tokens, 0),
  };
}

/** Список ходов с новым: ход с тем же номером заменяется (хаб досылает его с концом строк), порядок по номеру, не больше REQUEST_KEEP. */
export function addRequest(list, req) {
  if (req.turn <= 0) return list;
  const rest = list.filter((r) => r.turn !== req.turn);
  rest.push(req);
  rest.sort((a, b) => a.turn - b.turn);
  return rest.slice(-REQUEST_KEEP);
}

/** Выбранный ход: номер 0 — последний; нет такого — последний. */
export function pickRequest(list, turn) {
  if (list.length === 0) return null;
  return list.find((r) => r.turn === turn) ?? list[list.length - 1];
}

/** Строки acp.jsonl этого хода: конец — по хабу, иначе строка перед следующим ходом, иначе не больше TRACE_SPAN строк. 0 в from — трасса выключена. */
export function traceRange(req, list) {
  if (req.raw.from <= 0) return null;
  const next = list.find((r) => r.turn > req.turn && r.raw.from > 0);
  let to = req.raw.to > 0 ? req.raw.to : (next ? next.raw.from - 1 : req.raw.from + TRACE_SPAN - 1);
  to = Math.max(req.raw.from, Math.min(to, req.raw.from + TRACE_SPAN - 1));
  return { from: req.raw.from, to };
}

/** Что копирует кнопка у карточки части: её текст. А у всего запроса — JSON без служебного. */
export function requestJson(req) {
  return JSON.stringify({
    turn: req.turn, at: req.at, agent: req.agent, cwd: req.cwd, mode: req.mode, route: req.route, model: req.model, effort: req.effort,
    parts: req.parts, tools: { hub: req.hubTools, agent: req.agentTools, commands: req.commands }, mcp: req.mcp, raw_ref: req.raw,
  }, null, 2);
}

/** Первая строка текста, обрезанная до limit знаков. */
export function firstLine(text, limit = 90) {
  const line = String(text).split('\n').find((x) => x.trim() !== '') ?? '';
  const chars = Array.from(line.trim());
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : chars.join('');
}

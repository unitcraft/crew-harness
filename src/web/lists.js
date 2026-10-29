// lists.js — чистые функции вокруг модели вида: список сессий, лента разговора, подписи и числа.
// Ни DOM, ни часов (время приходит аргументом). state.js переэкспортирует всё отсюда, поэтому
// тесты и страница берут их из одного места; view.js только рисует результат.

// ---- список сессий: фильтр, закрепление, группы ------------------------------------------

const byRecency = (a, b) => (b.updatedAt - a.updatedAt) || (a.id < b.id ? -1 : 1);

const hasRank = (s) => Number.isFinite(s.rank);

/**
 * Порядок сессий внутри проекта (задача 192): место, которое владелец задал перетаскиванием (rank, меньше — выше), сильнее
 * сортировки по активности; сессии без места (новые) стоят над всеми, свежие выше.
 */
import { needsOwnerReason } from './attention.js';

export const byOrder = (a, b) => {
  if (hasRank(a) && hasRank(b)) return (a.rank - b.rank) || byRecency(a, b);
  if (hasRank(a) !== hasRank(b)) return hasRank(a) ? 1 : -1;
  return byRecency(a, b);
};

/**
 * Список id после перетаскивания: id переезжает перед targetId (after=false) или после него (after=true).
 * Неизвестный id или цель, совпадающая с переносимым, — список не меняется (копия).
 */
export function moveInOrder(ids, id, targetId, after) {
  const list = [...ids];
  if (id === targetId || !list.includes(id) || !list.includes(targetId)) return list;
  const rest = list.filter((x) => x !== id);
  const at = rest.indexOf(targetId);
  rest.splice(after ? at + 1 : at, 0, id);
  return rest;
}

/** Сессии, чьё название содержит запрос (без учёта регистра); пустой запрос — все. */
export function filterSessions(sessions, query) {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return [...sessions];
  return sessions.filter((s) => String(s.name).toLowerCase().includes(q));
}

/** Все потомки сессии (дети, дети детей): им обязан сказать удаляющий родителя. Порядок — от ближних к дальним. */
export function descendantsOf(sessions, id) {
  const out = [];
  const seen = new Set([id]);
  let front = [id];
  while (front.length > 0) {
    const next = [];
    for (const s of sessions) {
      if (s.parent && front.includes(s.parent) && !seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
        next.push(s.id);
      }
    }
    front = next;
  }
  return out;
}

/** Множество закреплённых id: ручное решение (overrides[id]) важнее данных сессии. */
export function effectivePins(sessions, overrides = {}) {
  const out = new Set();
  for (const s of sessions) {
    const manual = overrides[s.id];
    if (typeof manual === 'boolean' ? manual : s.pinned === true) out.add(s.id);
  }
  return out;
}

/**
 * Дерево сессий группы: потомки под родителем, сирота и участник цикла — на верхнем уровне. У строки `kids` — сколько у неё прямых дочерних;
 * родитель из `collapsed` (множество id) свёрнут: его потомков в списке нет (`collapsed: true` у строки).
 */
function buildTree(list, collapsed = new Set()) {
  const present = new Set(list.map((s) => s.id));
  const kids = new Map();
  const roots = [];
  for (const s of [...list].sort(byOrder)) {
    if (s.parent && s.parent !== s.id && present.has(s.parent)) {
      if (!kids.has(s.parent)) kids.set(s.parent, []);
      kids.get(s.parent).push(s);
    } else {
      roots.push(s);
    }
  }
  const rows = [];
  const seen = new Set();
  // потомки свёрнутого родителя в списке не показываются и не всплывают на верхнем уровне
  const hide = (id) => {
    for (const k of kids.get(id) ?? []) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      hide(k.id);
    }
  };
  const walk = (s, depth) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    const mine = kids.get(s.id) ?? [];
    const folded = mine.length > 0 && collapsed.has(s.id);
    rows.push({ session: s, depth, kids: mine.length, collapsed: folded });
    if (!folded) for (const k of mine) walk(k, depth + 1);
    else hide(s.id);
  };
  for (const r of roots) walk(r, 0);
  for (const s of [...list].sort(byOrder)) walk(s, 0); // цикл родителей: ничего не теряем
  return rows;
}

/**
 * Группы для левой колонки: { pinned: [{session, depth:0}], projects: [{project, id, rows}] }.
 * Закреплённые вынесены, остальные собраны по проекту (свежие проекты выше).
 * Сессия с projectId — в группе этого проекта; если список проектов известен (projects — массив {id, name}), а такого
 * проекта в нём нет (удалён), сессия уходит в «Без проекта». Сессия только с именем project — в группе по имени (id пуст).
 * includeEmpty добавляет известные проекты без сессий (в конец, по имени): у них тоже есть кнопка «+».
 */
export function groupSessions(sessions, { pinned = new Set(), projects = null, includeEmpty = false, collapsed = new Set() } = {}) {
  const pinnedList = [];
  const known = projects ? new Map(projects.map((p) => [p.id, p])) : null;
  const byKey = new Map();
  const slot = (key, project, id) => {
    if (!byKey.has(key)) byKey.set(key, { project, id, list: [] });
    return byKey.get(key);
  };
  for (const s of sessions) {
    if (pinned.has(s.id)) { pinnedList.push(s); continue; }
    if (s.projectId && (!known || known.has(s.projectId))) {
      const real = known ? known.get(s.projectId) : undefined;
      slot(`id:${s.projectId}`, real ? real.name : (s.project || s.projectId), s.projectId).list.push(s);
    } else if (s.project && !s.projectId) {
      slot(`name:${s.project}`, s.project, '').list.push(s);
    } else {
      slot('', '', '').list.push(s);
    }
  }
  if (includeEmpty) slot('', '', ''); // «Без проекта» есть всегда: с «+» справа, даже пока в ней пусто
  if (includeEmpty && known) for (const p of known.values()) slot(`id:${p.id}`, p.name, p.id);
  // порядок проектов — тот, что владелец задал перетаскиванием и сервер хранит (порядок списка projects); остальные группы после них, свежие выше
  const place = new Map((projects ?? []).map((p, i) => [p.id, i]));
  const placed = (g) => (g.id !== '' && place.has(g.id) ? place.get(g.id) : Infinity);
  const groups = [...byKey.values()]
    .map((g) => ({ ...g, latest: g.list.length > 0 ? Math.max(...g.list.map((s) => s.updatedAt)) : -1 }))
    .sort((x, y) => {
      if (placed(x) !== placed(y)) return placed(x) < placed(y) ? -1 : 1;
      return (y.latest - x.latest) || (x.project < y.project ? -1 : (x.project > y.project ? 1 : 0));
    })
    .map(({ project, id, list }) => ({ project, id, rows: buildTree(list, collapsed) }));
  return {
    pinned: pinnedList.sort(byRecency).map((session) => ({ session, depth: 0, kids: 0, collapsed: false })),
    projects: groups,
  };
}

// ---- лента разговора -----------------------------------------------------------------------

/** Итог группы рабочих строк: сколько действий, сколько с ошибкой, сколько идёт. */
export function workSummary(rows) {
  let failed = 0;
  let running = 0;
  for (const r of rows) {
    if (r.type === 'tool') {
      if (r.status === 'failed') failed += 1;
      if (r.status === 'pending' || r.status === 'in_progress') running += 1;
    } else if (r.type === 'task') {
      if (r.status === 'failed') failed += 1;
      if (r.status === 'running') running += 1;
    }
  }
  return { count: rows.length, failed, running };
}

export function diffTotals(diffs) {
  return diffs.reduce((acc, d) => ({ files: acc.files + 1, added: acc.added + d.added, removed: acc.removed + d.removed }),
    { files: 0, added: 0, removed: 0 });
}

export function taskSummary(tasks) {
  const running = tasks.filter((x) => x.status === 'running').length;
  return { running, finished: tasks.length - running, total: tasks.length };
}

function workRows(session) {
  const rows = [];
  for (const x of session.tools) rows.push({ ...x, type: 'tool', key: `t:${x.id}` });
  for (const x of session.tasks) rows.push({ ...x, type: 'task', key: `b:${x.id}` });
  for (const m of session.messages) {
    if (m.role === 'permission') {
      rows.push({
        type: 'perm', key: m.key, step: m.step ?? 0, turn: m.turn, request: m.request, action: m.action, detail: m.detail, decision: m.decision,
      });
    }
  }
  return rows;
}

/**
 * Лента разговора в порядке шагов: сообщения владельца, куски текста агента, рабочие строки (инструменты,
 * запросы разрешений, фоновые задачи) сгруппированы подряд, карточка правок хода, заметки об исходе,
 * действия под ответом и строка идущей работы. Ничего не знает о DOM; ключи устойчивы для повторного рисования.
 */
export function timeline(session) {
  const items = [];
  const rows = workRows(session);
  const agentTurns = new Set(session.messages.filter((m) => m.role === 'agent').map((m) => m.turn));
  const lastAgentTurn = [...session.messages].reverse().find((m) => m.role === 'agent')?.turn;
  const emitted = new Set();

  for (const m of session.messages) {
    if (m.role === 'user') {
      items.push({ type: 'user', key: m.key, text: m.text, turn: m.turn, images: m.images ?? [], at: m.at ?? 0 });
    } else if (m.role === 'skipped') {
      items.push({ type: 'skipped', key: m.key, agent: m.agent, count: m.count });
    } else if (m.role === 'dropped') {
      items.push({ type: 'dropped', key: m.key, setting: m.setting, value: m.value, used: m.used });
    } else if (m.role === 'switch') {
      items.push({ type: 'switch', key: m.key, from: m.from, to: m.to, shown: m.shown, total: m.total, cut: m.cut });
    } else if (m.role === 'answer') {
      items.push({ type: 'answer', key: m.key, skipped: m.skipped, lines: m.lines });
    } else if (m.role === 'auto_extend') {
      const x = (session.routeState?.crew?.extensions ?? []).find((e) => e.id === m.id);
      if (x) items.push({ type: 'autoext', key: m.key, id: x.id, task: x.task, title: x.title, text: x.text, undone: x.undone });
    } else if (m.role === 'route_note') {
      items.push({ type: 'routenote', key: m.key, n: m.n, action: m.action });
    } else if (m.role === 'agent') {
      const own = rows.filter((r) => r.turn === m.turn);
      own.forEach((r) => emitted.add(r.key));
      const stream = [
        ...m.chunks.map((c) => ({ chunk: c, step: c.step, order: 0 })),
        ...own.map((r) => ({ row: r, step: r.step, order: 1 })),
      ].sort((a, b) => (a.step - b.step) || (a.order - b.order));

      const content = [];
      let text = '';
      let group = [];
      let segment = 0;
      const flushText = () => {
        if (text.trim().length > 0) content.push({ type: 'text', key: `${m.key}:s${segment}`, text, streaming: false, turn: m.turn });
        if (text.length > 0) segment += 1;
        text = '';
      };
      const flushGroup = () => {
        if (group.length > 0) content.push({ type: 'work', key: `w:${m.turn}:${group[0].key}`, rows: group });
        group = [];
      };
      for (const part of stream) {
        if (part.chunk) { flushGroup(); text += part.chunk.text; } else { flushText(); group.push(part.row); }
      }
      flushText();
      flushGroup();
      const last = content[content.length - 1];
      if (last && last.type === 'text' && m.status === 'streaming') last.streaming = true;
      items.push(...content);

      // расход токенов хода (задача 192): строка под ответом агента, только если агент его сообщил
      const used = usageSummary(m.usage);
      if (used && m.status !== 'streaming') items.push({ type: 'usage', key: `tok:${m.turn}`, ...used, context: m.turn === lastAgentTurn && session.usage ? { used: session.usage.used, size: session.usage.size } : null });

      const diffs = session.diffs.filter((d) => d.turn === m.turn);
      if (diffs.length > 0) items.push({ type: 'diffs', key: `d:${m.turn}`, rows: diffs, totals: diffTotals(diffs) });

      if (m.status === 'refused' || m.status === 'error' || m.status === 'cancelled') {
        items.push({ type: 'note', key: `n:${m.turn}`, tone: m.status, reason: m.reason });
      } else if (m.status === 'done' && m.text.trim().length > 0) {
        items.push({ type: 'actions', key: `x:${m.turn}`, text: m.text, at: m.doneAt, turn: m.turn });
      }
    }
  }

  const orphans = rows.filter((r) => !emitted.has(r.key) && !agentTurns.has(r.turn)).sort((a, b) => a.step - b.step);
  if (orphans.length > 0) items.push({ type: 'work', key: `w:orphans:${orphans[0].key}`, rows: orphans });

  if (session.state === 'answering') items.push({ type: 'running', key: 'running', since: session.turnStartedAt, last: Math.max(session.updatedAt || 0, session.turnStartedAt || 0) });
  // задача 192.14: ход закончен, а агент ждёт ответа обычным текстом или пунктом чек-листа: полоса под его последним сообщением, пока владелец не ответит
  else if (['text', 'checklist'].includes(needsOwnerReason(session))) items.push({ type: 'needs', key: 'needs' });
  return items;
}

// ---- безопасный разбор абзацев и кода в строке -------------------------------------------------

/** Разбить строку на обычный текст и `код` (парные обратные кавычки); непарная остаётся символом. */
export function inlineSpans(text) {
  const spans = [];
  const push = (value, code) => {
    if (value.length === 0) return;
    const last = spans[spans.length - 1];
    if (last && !code && !last.code) last.text += value;
    else spans.push({ text: value, code });
  };
  const s = String(text);
  let pos = 0;
  while (pos < s.length) {
    const open = s.indexOf('`', pos);
    if (open < 0) { push(s.slice(pos), false); break; }
    const close = s.indexOf('`', open + 1);
    if (close < 0) { push(s.slice(pos), false); break; }
    push(s.slice(pos, open), false);
    if (close === open + 1) push('``', false);
    else push(s.slice(open + 1, close), true);
    pos = close + 1;
  }
  return spans;
}

/** Текст ответа -> абзацы и списки. Никакой разметки: результат кладётся в узлы через textContent. */
export function paragraphs(text) {
  const blocks = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    blocks.push(cur.type === 'p' ? { type: 'p', text: cur.lines.join('\n') } : { type: cur.type, items: cur.lines });
    cur = null;
  };
  for (const line of String(text).split('\n')) {
    if (line.trim() === '') { flush(); continue; }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    let type = 'p';
    if (bullet) type = 'ul';
    else if (numbered) type = 'ol';
    if (!cur || cur.type !== type) { flush(); cur = { type, lines: [] }; }
    cur.lines.push(bullet ? bullet[1] : numbered ? numbered[1] : line);
  }
  flush();
  return blocks;
}

// ---- числа и подписи -------------------------------------------------------------------------------

/** Доля занятого окна контекста, целые проценты 0..100. */
export function usagePercent(usage) {
  if (!usage || !(usage.size > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((usage.used / usage.size) * 100)));
}

/** Красная полоска — от 90 %. */
export function usageLevel(percent) {
  return percent >= 90 ? 'high' : 'normal';
}

/** Число токенов для подписи: { value, unit } с unit '' | 'k' | 'm'. */
export function tokenParts(n) {
  if (n < 1000) return { value: n, unit: '' };
  if (n < 1_000_000) return { value: Math.round(n / 1000), unit: 'k' };
  return { value: Math.round(n / 100_000) / 10, unit: 'm' };
}

/** Длительность двумя старшими единицами: [[1,'m'],[36,'s']]; единицы — 'd','h','m','s'. */
export function durationLabel(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const parts = [
    ['d', Math.floor(total / 86400)],
    ['h', Math.floor(total / 3600) % 24],
    ['m', Math.floor(total / 60) % 60],
    ['s', total % 60],
  ];
  const first = parts.findIndex(([, v]) => v > 0);
  if (first < 0) return [[0, 's']];
  const out = [[parts[first][1], parts[first][0]]];
  const next = parts[first + 1];
  if (next && next[1] > 0) out.push([next[1], next[0]]);
  return out;
}

/** «Сколько назад»: { unit: 'now' | 'min' | 'hour' | 'day', n }. */
export function agoParts(ms, now) {
  const diff = now - ms;
  if (diff < 60_000) return { unit: 'now', n: 0 };
  if (diff < 3_600_000) return { unit: 'min', n: Math.floor(diff / 60_000) };
  if (diff < 86_400_000) return { unit: 'hour', n: Math.floor(diff / 3_600_000) };
  return { unit: 'day', n: Math.floor(diff / 86_400_000) };
}

/** Путь файла -> имя и путь-пояснение. */
export function fileParts(path) {
  const p = String(path).split('\\').join('/');
  const i = p.lastIndexOf('/');
  return i < 0 ? { dir: '', name: p } : { dir: p.slice(0, i), name: p.slice(i + 1) };
}

export function normalizeTheme(v) {
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** Цикл переключателя темы: как в системе -> светлая -> тёмная -> как в системе. */
export function nextTheme(current) {
  const c = normalizeTheme(current);
  if (c === 'system') return 'light';
  return c === 'light' ? 'dark' : 'system';
}

// ---- выбор модели: поиск и группы по провайдеру (задача 192) -------------------------------

/** Провайдер модели — часть id до первой «/» ('' — у id без неё). */
export function providerOf(id) {
  const at = String(id).indexOf('/');
  return at > 0 ? String(id).slice(0, at) : '';
}

/** Модели, чьи id или название содержат запрос (без учёта регистра, пробелы по краям не считаются); пустой запрос — все. */
export function filterModels(models, query) {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return [...models];
  return models.filter((m) => `${m.id}\n${m.name}`.toLowerCase().includes(q));
}

/** Модели по провайдерам в порядке первого появления: [{ provider, models }]. */
export function groupModels(models) {
  const groups = [];
  for (const m of models) {
    const provider = providerOf(m.id);
    let g = groups.find((x) => x.provider === provider);
    if (!g) { g = { provider, models: [] }; groups.push(g); }
    g.models.push(m);
  }
  return groups;
}

/** Общее первое слово имён значений («Thinking Low / Thinking High» → «Thinking»), если оно у ВСЕХ и после него есть ещё слово; иначе ''. */
export function commonWordPrefix(names) {
  if (names.length < 2) return '';
  const word = (n) => { const at = String(n).indexOf(' '); return at > 0 ? String(n).slice(0, at) : ''; };
  const first = word(names[0]);
  if (!first) return '';
  return names.every((n) => word(n) === first) ? first : '';
}

/** Значения усилия для показа: имя агента без общего первого слова; данные агента не меняются (id те же). */
export function effortChoices(efforts) {
  const prefix = commonWordPrefix(efforts.map((e) => e.name));
  return efforts.map((e) => (prefix ? { ...e, name: e.name.slice(prefix.length + 1) } : e));
}

// ---- расход токенов хода (задача 192) -----------------------------------------------------------

/** Число с узкими неразрывными пробелами между тысячами: 173312 -> «173 312». */
export function groupThousands(n) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return '';
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
}

/** Форма слова по числу: 'one' (1, 21), 'few' (2-4, 22-24), 'many' (остальное). */
export function ruForm(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
  return 'many';
}

const STOP_LABEL = { end_turn: 'stop', tool_use: 'tool-call' };

/**
 * Расход токенов хода из события turn_usage: { steps, rows, latest, expandable }. rows - строки шагов (из input.steps, если агент
 * присылает расход по шагам; иначе одна строка итога); latest - последняя строка. Нет чисел - null (строки в ленте не будет).
 * «Всего» - то, что вошло в запрос: новые плюс из кэша (так считает и строка-образец); нет обоих - как дал агент.
 */
export function usageSummary(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : undefined);
  const row = (label, r) => {
    const fresh = num(r.new);
    const cached = num(r.cached);
    const given = num(r.total);
    const total = fresh !== undefined || cached !== undefined ? (fresh ?? 0) + (cached ?? 0) : given;
    return { label, new: fresh, cached, total };
  };
  const listed = Array.isArray(usage.steps) ? usage.steps.filter((x) => x && typeof x === 'object') : [];
  const rows = listed.length > 0
    ? listed.map((x, i) => row(typeof x.label === 'string' && x.label ? x.label : String(i + 1), x))
    : [row(STOP_LABEL[usage.reason] ?? (typeof usage.reason === 'string' && usage.reason ? usage.reason : 'stop'), usage)];
  const latest = rows[rows.length - 1];
  if (latest.new === undefined && latest.cached === undefined && latest.total === undefined) return null;
  return { steps: rows.length, rows, latest, expandable: rows.length > 1 };
}

/** Время сообщения под пузырём: { kind: 'now' | 'today' | 'yesterday' | 'older', clock: 'ЧЧ:ММ', date: 'дд.мм' } (местное время). */
export function messageTime(at, now) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(at);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  if (now - at < 60_000) return { kind: 'now', clock, date };
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date(now)) - midnight(d)) / 86_400_000);
  if (days <= 0) return { kind: 'today', clock, date };
  if (days === 1) return { kind: 'yesterday', clock, date };
  return { kind: 'older', clock, date };
}

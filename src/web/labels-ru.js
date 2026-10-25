// labels-ru.js — русские названия и описания режимов и уровней усилия (задача 192).
// Агенты отдают их по-английски; здесь только то, что известно наверняка. Нет перевода — показываем как пришло:
// не выдумываем и не переводим машинно. Названия моделей не переводятся вовсе.

const MODES = {
  default: ['По умолчанию', 'Ручное подтверждение, инструменты выполняются обычно'],
  manual: ['Ручной', 'Всегда спрашивать перед изменениями'],
  plan: ['План', 'Только планирование, без выполнения инструментов'],
  auto: ['Авто', 'Безопасные операции подтверждаются автоматически', [[/permission decisions/i, 'Агент сам решает вопросы разрешений']]],
  yolo: ['YOLO', 'Подтверждать всё автоматически'],
  'accept edits': ['Принимать правки', 'Автоматически принимать все правки файлов'],
  'bypass permissions': ['Без запросов', 'Принимать все разрешения'],
};

const EFFORTS = {
  default: ['По умолчанию'],
  low: ['Низкое'],
  medium: ['Среднее'],
  high: ['Высокое'],
  xhigh: ['Очень высокое'],
  max: ['Максимальное'],
};

const TABLES = { mode: MODES, effort: EFFORTS };

// Разные написания одного и того же: «acceptEdits», «Accept edits», «accept_edits».
const ALIASES = {
  acceptedits: 'accept edits', bypasspermissions: 'bypass permissions', 'extra high': 'xhigh', 'x-high': 'xhigh', 'extra-high': 'xhigh',
};

function norm(text) {
  const s = String(text || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return ALIASES[s] || ALIASES[s.replace(/ /g, '')] || s;
}

// labelOf(kind, item) — kind: 'mode' | 'effort'; item: { id, name, description? } как отдал агент.
// Возвращает { name, description, title }: показывать name/description, в title — оригинал (по-английски).
// Сначала английское название (оно точнее: бывает id «default» с названием «Manual»), затем id агента.
export function labelOf(kind, item) {
  const original = item || {};
  const name = original.name || '';
  const description = original.description || '';
  const table = TABLES[kind];
  const entry = table && (table[norm(name)] || table[norm(original.id)]);
  if (!entry) return { name, description, title: '' };
  let ruDescription = entry[1] || description;
  for (const [pattern, text] of entry[2] || []) if (pattern.test(description)) ruDescription = text;
  const title = [name, description].filter(Boolean).join(' — ');
  return { name: entry[0], description: ruDescription, title: title === entry[0] ? '' : title };
}

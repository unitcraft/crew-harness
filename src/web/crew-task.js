// crew-task.js — задача 192.2: распознавание задач агентом и подтверждение владельцем; чистый модуль без DOM.
//
// Хаб кладёт в route_state поля `proposals` (карточки), `active`, `max_active`, `confirm_word`, `over_word`, `candidates`. Главный путь — кнопка «Распознать задачи»:
// агент присылает список (`listed`), у каждой строки кнопки «В работу», «Обсудить дальше», «Забыть» и общее поле быстрого ответа. Одиночное предложение
// агента (`crew_task`, настройка route_auto_propose) — карточка с кодовым словом. Здесь — разбор payload и сборка сигналов; рисует crew-task-ui.js.

import { t } from './strings.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v) => (Number.isFinite(v) ? v : 0);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

const PROPOSAL_STATES = ['open', 'overlap', 'limit'];

function parseProposal(raw) {
  return {
    id: num(raw.id),
    kind: raw.kind === 'extend' ? 'extend' : 'new',
    title: str(raw.title),
    summary: str(raw.summary),
    extends: num(raw.extends),
    extendsTitle: str(raw.extends_title),
    touches: strings(raw.touches),
    state: PROPOSAL_STATES.includes(raw.state) ? raw.state : 'open',
    withN: num(raw.with_n),
    withFiles: strings(raw.with_files),
    unknown: raw.unknown === true,
    listed: raw.listed === true,
    choice: str(raw.choice),
    note: str(raw.note),
  };
}

/** Состояние распознавания из route_state; нет полей — пустое (старый хаб). */
export function parseCrewTask(input) {
  const src = isObject(input) ? input : {};
  return {
    proposals: (Array.isArray(src.proposals) ? src.proposals : []).filter(isObject).map(parseProposal),
    active: num(src.active),
    maxActive: num(src.max_active),
    confirmWord: str(src.confirm_word),
    overWord: str(src.over_word),
    candidates: num(src.candidates),
  };
}

export const EMPTY_CREW = Object.freeze(parseCrewTask({}));

/** Сигналы страницы серверу: { kind, input }; шаг события и id добавляет app.js. */
export const crewSignal = Object.freeze({
  prop: (id, action) => ({ kind: 'route_prop', input: { id, action: String(action) } }),
  recognize: () => ({ kind: 'route_recognize', input: {} }),
  quick: (text) => ({ kind: 'route_quick', input: { text: String(text) } }),
});

/** Строки списка «Распознать задачи» (по порядку, номера с 1 — как в быстром ответе). */
export function listedItems(crew) {
  return crew.proposals.filter((p) => p.listed).map((p, i) => ({ ...p, number: i + 1 }));
}

/** Одиночное предложение, на которое отвечает кодовое слово: последнее не из списка. */
export function singleCard(crew) {
  const singles = crew.proposals.filter((p) => !p.listed);
  return singles.length > 0 ? singles[singles.length - 1] : null;
}

/** «в работе N из лимита M» (лимит 0 — без лимита). */
export function activeText(crew) {
  return crew.maxActive > 0 ? t('crewtask.active_limit', { n: crew.active, max: crew.maxActive }) : t('crewtask.active', { n: crew.active });
}

/** Что делает работа словами: «новая» или «дополняет подзадачу K (message.K.md)». */
export function kindText(p) {
  if (p.kind === 'extend' && p.extends > 0) return t('crewtask.extends', { n: p.extends });
  return t('crewtask.new');
}

/** Строка списка: «1. Название — новая — затронет: файлы». */
export function rowText(p, number) {
  const parts = [`${number}. ${p.title}`, kindText(p)];
  if (p.touches.length > 0) parts.push(t('crewtask.touches', { files: p.touches.join(', ') }));
  return parts.join(' — ');
}

/** Кнопки строки списка: для «дополняет» первая — «Дополнить K», для остального — «В работу». */
export function rowActions(p) {
  const work = p.kind === 'extend' && p.extends > 0
    ? { action: 'extend', label: t('crewtask.act_extend', { n: p.extends }), primary: true }
    : { action: 'start', label: t('crewtask.act_start'), primary: true };
  const out = [];
  if (p.state === 'open') {
    out.push(work);
    if (p.choice !== 'discuss') out.push({ action: 'discuss', label: t('crewtask.act_discuss'), primary: false });
    out.push({ action: 'forget', label: t('crewtask.act_forget'), primary: false });
  } else if (p.state === 'overlap') {
    out.push({ action: 'wait', label: t('crewtask.act_wait'), primary: true });
    out.push({ action: 'parallel', label: t('crewtask.act_parallel'), primary: false });
    out.push({ action: 'forget', label: t('crewtask.act_forget'), primary: false });
  } else {
    out.push({ action: 'over', label: t('crewtask.act_over'), primary: false });
    out.push({ action: 'queue', label: t('crewtask.act_queue'), primary: true });
    out.push({ action: 'forget', label: t('crewtask.act_forget'), primary: false });
  }
  return out;
}

/** Текст проблемы карточки: пересечение с подзадачей или упёртый лимит; для обычной — пусто. */
export function problemText(p, crew) {
  if (p.state === 'overlap') {
    if (p.unknown || p.withFiles.length === 0) return t('crewtask.overlap_unknown', { n: p.withN });
    return t('crewtask.overlap', { n: p.withN, files: p.withFiles.join(', ') });
  }
  if (p.state === 'limit') return t('crewtask.limit', { n: crew.active, max: crew.maxActive, word: crew.overWord });
  return '';
}

/** Подсказка одиночной карточки про кодовое слово: какое слово что делает в этом состоянии. */
export function wordHint(p, crew) {
  if (p.state === 'limit') return t('crewtask.word_over', { word: crew.overWord });
  if (p.state === 'overlap') return t('crewtask.word_wait', { word: crew.confirmWord });
  return t('crewtask.word', { word: crew.confirmWord });
}

/** Что стоит в строке подзадачи, которая ждёт: другую подзадачу или место под лимитом (иначе пусто). */
export function subWaitsText(sub) {
  if (sub.state !== 'waits') return '';
  return sub.waitsFor > 0 ? t('crewtask.waits_for', { n: sub.waitsFor }) : t('crewtask.waits_queue');
}

/** Видна ли кнопка «Распознать задачи»: в сессии, не в черновике. */
export const recognizeShown = (session) => Boolean(session) && !session.draft;

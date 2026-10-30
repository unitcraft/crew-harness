// view.js — рисование DOM по модели. Никакой логики «что произошло»: это в state.js и lists.js.
//
// Правила, на которых держится безопасность и спокойный вид:
//   * текст из событий попадает в DOM ТОЛЬКО через textContent / createTextNode — никакой
//     разметки из данных (проверка страницы ищет innerHTML и родню);
//   * каркас строится один раз; при каждой перерисовке меняется только то, что изменилось,
//     поэтому ответ агента растёт без мерцания, а черновик в поле ввода не пропадает;
//   * прокрутка вниз только если владелец уже был у конца: читающего историю не дёргаем;
//   * значки — один спрайт, встроенный в index.html (<use href="#i-имя">), цвет берут из темы; ширина полоски и кольца контекста
//     ставится свойством --fill / --ring через CSSOM, а не атрибутом style (его запрещает CSP).

import { t } from './strings.js';
import { BARS, barHeights, createMeter, recordingView } from './meter.js';
import { createDictation, speechCtor, createMicPress, micTitleKey, clockText } from './voice.js';
import { createLocalDictation } from './recorder.js';
import { createToast } from './toast.js';
import { h, svgNode, icon } from './dom.js';
import { createProjectsUi } from './projects-ui.js';
import { createSideKit } from './session-row.js';
import { LANGS, createVoiceSettings, langFor, pageLang } from './stt.js';
import { isBusy, keyAction } from './queue.js';
import { historyStep, NO_HISTORY } from './history.js';
import { canSend } from './attachments.js';
import { createAttachUi } from './attach-ui.js';
import { createViewer } from './viewer-ui.js';
import { createMachinesPanel } from './machines-ui.js';
import { createRequestPanel } from './request-ui.js';
import { createCrewTaskUi } from './crew-task-ui.js';
import { subWaitsText } from './crew-task.js';
import { labelOf } from './labels-ru.js';
import {
  createForm, selectOption, setOtherText, setCursor, moveCursor, setActive, isAnswered, nextUnanswered, canSubmit,
  markSent, buildAnswer, buildSkip, digitOption, otherIndex,
} from './question.js';
import {
  STATE_KEYS, sessionList, splitBlocks, filterSessions, groupSessions, descendantsOf, effectivePins, timeline, paragraphs, inlineSpans,
  workSummary, messageTime, groupThousands, ruForm, effortChoices, shownOf, familyOf, filterModels, groupModels, usagePercent, usageLevel, tokenParts, durationLabel, agoParts, fileParts, taskSummary,
} from './state.js';
import { attention, SILENT_DEFAULT_MIN } from './attention.js';
import {
  ROUTES, STEP_ICON, STEP_STATE_KEY, SUBTASK_STATE_KEY, routeName, routeDescription, counterText, stepToSkip, showStrip, stripActions,
  subtaskPercent, subtaskProgressText, showSubtasks, INTERACTIVE_STATE, NOTE_KEY, taskHeading, subtaskActions, hasSubtaskActions, bannerCount, subtaskCountText,
  mergeLabel, diffTotals, finishPrompt, readyPrompt, overlapPrompt, commitsText, filesText, branchTestsText, mainTestsText, testsRunnable, stalePrompt, whereText, wipStalePrompt,
} from './routes.js';

const NEAR_BOTTOM_PX = 40;
const FOLD_DIFFS = 3;
const FOLD_OUTPUTS = 4;
const FOLD_TASKS = 3;
const WIDE_QUERY = '(min-width: 1101px)';

// Таблицы значков и подписей — литералами, чтобы проверка страницы и проверка строк видели каждый ключ.
const TOOL_ICON = {
  read: 'i-eye', edit: 'i-pencil', delete: 'i-trash', move: 'i-move', search: 'i-search',
  execute: 'i-terminal', think: 'i-think', fetch: 'i-globe', other: 'i-dot',
};
const TOOL_LABEL = {
  read: 'tool.read', edit: 'tool.edit', delete: 'tool.delete', move: 'tool.move', search: 'tool.search',
  execute: 'tool.execute', think: 'tool.think', fetch: 'tool.fetch', other: 'tool.other',
};
const TOOL_STATUS = {
  pending: 'status.pending', in_progress: 'status.in_progress', completed: 'status.completed',
  failed: 'status.failed', cancelled: 'status.cancelled',
};
const TASK_STATUS = {
  running: 'task.running', completed: 'task.completed', failed: 'task.failed', stopped: 'task.stopped',
};
const USAGE_STEP_KEY = { one: 'usage.step_one', few: 'usage.step_few', many: 'usage.step_many' };
const TASK_ICON = { running: 'i-clock', completed: 'i-check', failed: 'i-x', stopped: 'i-stop' };
const PERM_ICON = { allow: 'i-check', deny: 'i-x', cancelled: 'i-stop', wait: 'i-clock' };
const FILE_ICON = { create: 'i-file-plus', edit: 'i-file-edit', delete: 'i-file-x' };
const THEME_ICON = { system: 'i-monitor', light: 'i-sun', dark: 'i-moon' };
const THEME_LABEL = { system: 'theme.system', light: 'theme.light', dark: 'theme.dark' };
const DECISION_KEY = { allow: 'chat.perm_allowed', deny: 'chat.perm_denied', cancelled: 'chat.perm_cancelled' };
const UNIT_KEY = { d: 'unit.d', h: 'unit.h', m: 'unit.m', s: 'unit.s' };
const AGO_KEY = { now: 'ago.now', min: 'ago.min', hour: 'ago.hour', day: 'ago.day' };

/**
 * @param doc       document
 * @param refs      { side, main, rail, app, status, overlay } — корневые узлы из index.html
 * @param deps      { agents, now, handlers }
 *   deps.projectsApi — клиент проектов (projects-api.js); handlers.onProjectsChanged() — список проектов изменился, перечитать;
 *   handlers.onNotice(text, tone) — короткая заметка в строке статуса.
 *   handlers: onSelect(trace), onBack(), onNewToggle(open, projectId?) — пустой чат новой сессии, onDraftProject(trace, id), onDraftFolder(trace, path), onRename(trace, name),
 *             onSend(trace, text, images?) -> bool | Promise<bool> (images — вложения: сначала уходят на сервер, потом сообщение), onCancel(trace), onDecide(trace, request, decision),
 *             onPin(trace, pinned), onTheme(), onCopy(text),
 *             onAnswer(trace, answer) -> bool — ответ на вопросы агента (question_answer) или пропуск,
 *             onSwitchAgent(trace, agent) — продолжить этот разговор на другом агенте,
 *             onChoose(trace, setting, value) — выбор режима, модели или усилия (setting: 'mode' | 'model' | 'effort')
 */
export function createView(doc, refs, deps) {
  const {
    agents, now, handlers, registryFailed = false, registryPending = false, imageSrc = (image) => image.src, projectsApi, presets = () => null,
  } = deps;
  const win = doc.defaultView;
  const drafts = new Map();
  const attachDrafts = new Map(); // вложения по сессиям: как черновик, живут до отправки
  const open = new Set(); // раскрытые строки и карточки по ключу: переживают перерисовку
  let query = '';
  let railOpen = null; // null — «как задано шириной», true/false — выбор владельца
  let current = { session: undefined, ui: undefined };

  const agentLabel = (id) => {
    const a = agents.find((x) => x.id === id);
    return a ? (a.labelKey ? t(a.labelKey) : a.label) : id;
  };

  function formatTime(ms) {
    const d = new Date(ms);
    const today = new Date(now());
    const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    return sameDay
      ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  const durationText = (ms) => durationLabel(ms).map(([n, u]) => t(UNIT_KEY[u], { n })).join(' ');
  const agoText = (ms) => {
    const a = agoParts(ms, now());
    return t(AGO_KEY[a.unit], { n: a.n });
  };
  function tokensText(n) {
    const { value, unit } = tokenParts(n);
    const shown = String(value).replace('.', ',');
    if (unit === 'k') return t('tokens.k', { n: shown });
    if (unit === 'm') return t('tokens.m', { n: shown });
    return shown;
  }

  // ---------------------------------------------------------------- левая колонка

  const themeButton = h(doc, 'button', { type: 'button', class: 'icon-btn' });
  // задача 192.14: выключатели «колокольчик» (уведомления браузера) и «звук»; по умолчанию выключены, состояние ведёт notify.js
  const bellButton = h(doc, 'button', { type: 'button', class: 'icon-btn attn-toggle', 'data-kind': 'bell', 'aria-pressed': 'false', title: t('attn.bell_off'), 'aria-label': t('attn.bell_off') }, icon(doc, 'i-bell'));
  const soundButton = h(doc, 'button', { type: 'button', class: 'icon-btn attn-toggle', 'data-kind': 'sound', 'aria-pressed': 'false', title: t('attn.sound_off'), 'aria-label': t('attn.sound_off') }, icon(doc, 'i-volume'));
  bellButton.addEventListener('click', () => handlers.onBell && handlers.onBell());
  soundButton.addEventListener('click', () => handlers.onSound && handlers.onSound());
  let toggleSig = '';
  function renderToggles(ui) {
    const n = ui.notify || { bell: false, sound: false, denied: false };
    const sig = JSON.stringify([n.bell, n.sound, n.denied]);
    if (sig === toggleSig) return;
    toggleSig = sig;
    const bellText = n.bell ? t('attn.bell_on') : (n.denied ? t('attn.bell_denied') : t('attn.bell_off'));
    bellButton.setAttribute('aria-pressed', String(Boolean(n.bell)));
    bellButton.title = bellText;
    bellButton.setAttribute('aria-label', bellText);
    soundButton.setAttribute('aria-pressed', String(Boolean(n.sound)));
    soundButton.title = n.sound ? t('attn.sound_on') : t('attn.sound_off');
    soundButton.setAttribute('aria-label', soundButton.title);
  }
  const search = h(doc, 'input', {
    type: 'search', class: 'search-input', autocomplete: 'off', placeholder: t('sessions.search'), 'aria-label': t('sessions.search'),
  });
  const agentNotice = h(doc, 'p', { class: 'empty', text: t(registryFailed ? 'sessions.agents_unavailable' : 'sessions.agents_none'), hidden: agents.length > 0 || registryPending });
  const retryAgents = h(doc, 'button', { type: 'button', class: 'link-btn', text: t('sessions.agents_retry'), hidden: !registryFailed });
  retryAgents.addEventListener('click', () => doc.defaultView.location.reload());
  const groupsBox = h(doc, 'nav', { class: 'groups', 'aria-label': t('sessions.title') });
  const listEmpty = h(doc, 'p', { class: 'empty', text: t('sessions.empty'), hidden: true });
  const loadingBox = h(doc, 'div', { class: 'list-loading', 'aria-live': 'polite', role: 'status' });
  let loadingSig = '';
  const notFound = h(doc, 'p', { class: 'empty', text: t('sessions.not_found'), hidden: true });

  refs.side.replaceChildren(
    h(doc, 'div', { class: 'side-head' }, h(doc, 'h2', { text: t('sessions.title') }), h(doc, 'span', { class: 'side-head-tools' }, bellButton, soundButton, themeButton)),
    h(doc, 'div', { class: 'side-tools' },
      h(doc, 'label', { class: 'search' }, icon(doc, 'i-search'), search)),
    agentNotice, retryAgents, loadingBox, groupsBox, listEmpty, notFound,
  );

  themeButton.addEventListener('click', () => handlers.onTheme());
  search.addEventListener('input', () => { query = search.value; if (current.ui) renderList(current.model, current.ui); });

  /** Метка «Нужен ваш ответ»: оранжевая точка и плашка; в списке сессий и в карточке вопросов. */
  function askBadge(text = t('ask.need')) {
    return h(doc, 'span', { class: 'ask-badge' }, h(doc, 'span', { class: 'ask-dot', 'aria-hidden': 'true' }), h(doc, 'span', { class: 'ask-badge-text', text }));
  }

  // ---- проекты: список приходит из страницы (ui.projects), окна живут в projects-ui.js
  let projectsList = null; // null — список ещё не загружен
  let groupMenu = ''; // id проекта, чьё меню «⋯» открыто
  const projectById = (id) => (projectsList ? projectsList.find((p) => p.id === id) : undefined);
  const projectsUi = createProjectsUi(doc, {
    api: projectsApi,
    onChanged: () => handlers.onProjectsChanged(),
    onNotice: (text, tone) => handlers.onNotice(text, tone),
  });

  const sideKit = createSideKit(doc, {
    handlers,
    projects: () => projectsList,
    confirm: (text, words = {}) => projectsUi.confirm({ title: t('session.delete_title'), text, ok: words.ok || t('session.delete_ok'), cancel: words.cancel || t('session.delete_cancel') }),
    descendants: (id) => descendantsOf(sessionList(current.model), id),
    linkFor: (id) => {
      const loc = win && win.location;
      return `${loc ? loc.origin + loc.pathname : ''}#s=${encodeURIComponent(id)}`;
    },
    render: () => { listSig = ''; if (current.ui) renderList(current.model, current.ui); if (typeof syncHeadMenu === 'function') syncHeadMenu(); },
  });
  let listSig = '';
  const foldedParents = new Set(); // родители, чьи дочерние свёрнуты в списке
  let activeProject = null; // проект выбранной сессии или черновика ('' - без проекта), null - ничего не выбрано
  /** Номер и название задачи сессии, если у неё есть задача с номером; иначе null. */
  function sessionTask(s) {
    const task = s.routeState && s.routeState.task;
    return task && task.number ? { number: task.number, title: task.title || '' } : null;
  }

  function sessionRow({ session: s, depth, kids = 0, collapsed = false }, ui, pins, gctx) {
    const active = s.id === ui.selected;
    const pinned = pins.has(s.id);
    const unread = Boolean(ui.unread && ui.unread[s.id] === true);
    const taskInfo = sessionTask(s);
    const stateLabel = t(STATE_KEYS[s.state]);
    const attn = attention(s, { now: now(), silentMin: ui.silentMin ?? SILENT_DEFAULT_MIN, unread, acked: (ui.acked || {})[s.id] || '' });
    const attnText = attn.state === 'waiting' ? t('attn.waiting') : attn.state === 'silent' ? t('attn.silent', { n: attn.minutes }) : attn.state === 'error' ? t('attn.error') : '';
    const merge = mergeLabel(s.routeState && s.routeState.task);
    const item = sideKit.isRenaming(s.id) ? sideKit.renameField(s) : h(doc, 'button', {
      type: 'button',
      class: 'session-item',
      'data-attn': attn.state,
      'data-blink': attn.blink ? 'true' : false,
      'data-merge': merge ? merge.kind : false,
      'aria-current': active ? 'true' : 'false',
      title: t('sessions.time_title', { state: stateLabel, time: formatTime(s.updatedAt) }),
    },
    depth > 0 ? icon(doc, 'i-branch', 'child-mark') : false,
    depth > 0 ? h(doc, 'span', { class: 'sr', text: t('sessions.child') }) : false,
    unread ? h(doc, 'span', { class: 'unread', role: 'img', 'aria-label': t('session.unread'), title: t('session.unread') }) : false,
    taskInfo ? h(doc, 'span', { class: 'task-no', text: taskInfo.number, title: taskInfo.title ? t('route.task_no_title', { number: taskInfo.number, title: taskInfo.title }) : t('route.task_head_bare', { number: taskInfo.number }) }) : false,
    h(doc, 'span', { class: 'session-name', text: s.name }),
    s.pendingQuestion ? h(doc, 'span', { class: 'ask-line' }, askBadge()) : false,
    attnText ? h(doc, 'span', { class: 'attn-label', 'data-attn': attn.state, text: attnText }) : false,
    h(doc, 'span', { class: 'dot', 'data-state': s.state, 'data-attn': attn.state, 'aria-hidden': 'true' }),
    h(doc, 'span', { class: 'sr', text: stateLabel }),
    merge ? h(doc, 'span', { class: 'session-merge', 'data-kind': merge.kind, text: merge.text }) : false);
    if (!sideKit.isRenaming(s.id)) item.addEventListener('click', () => handlers.onSelect(s.id));
    const cls = ['session', active ? 'is-active' : '', pinned ? 'is-pinned' : '', unread ? 'is-unread' : ''].filter(Boolean).join(' ');
    // родитель с дочерними сворачивается: стрелка перед строкой, число скрытых видно в подсказке
    let fold = false;
    if (kids > 0) {
      const label = collapsed ? t('sessions.unfold', { n: kids }) : t('sessions.fold');
      fold = h(doc, 'button', { type: 'button', class: 'icon-btn small fold-btn', 'aria-expanded': String(!collapsed), 'aria-label': label, title: label }, icon(doc, collapsed ? 'i-chevron-right' : 'i-chevron-down'));
      fold.addEventListener('click', (e) => {
        e.stopPropagation();
        if (foldedParents.has(s.id)) foldedParents.delete(s.id); else foldedParents.add(s.id);
        listSig = '';
        if (current.ui) renderList(current.model, current.ui);
      });
    }
    const li = h(doc, 'li', { class: `${cls}${kids > 0 ? ' has-kids' : ''}`, 'data-depth': Math.min(depth, 2) }, fold, item, sideKit.moreButton(s), sideKit.menuFor(s, { pinned, unread }) || false);
    sideKit.rowDnd(li, { id: s.id, group: gctx.key, ids: gctx.ids, projectId: s.projectId || '', enabled: gctx.draggable });
    return li;
  }

  function closeGroupMenu() {
    groupMenu = '';
    if (current.ui) renderList(current.model, current.ui);
  }

  function menuAction(label, iconId, onPick, danger = false) {
    const row = h(doc, 'button', { type: 'button', class: danger ? 'menu-item is-danger' : 'menu-item', role: 'menuitem' },
      h(doc, 'span', { class: 'menu-check' }, icon(doc, iconId)),
      h(doc, 'span', { class: 'menu-label' }, h(doc, 'span', { text: label })));
    row.addEventListener('click', onPick);
    return row;
  }

  /** Группа сессий. group.id пуст — «Без проекта» или проект только по имени (меню «⋯» только у настоящих проектов). */
  function groupNode(title, rows, ui, pins, group = null) {
    const isProject = Boolean(group) && group.id !== '';
    // перетаскивание сессий: внутри группы проекта; в «Закреплённых» порядок по активности
    const gctx = { key: group ? `${group.id}|${title}` : '', ids: rows.map((r) => r.session.id), draggable: Boolean(group) };
    const head = h(doc, 'div', { class: 'group-head' },
      h(doc, 'div', { class: 'group-title' }, isProject ? icon(doc, 'i-folder', 'group-icon') : false, h(doc, 'h3', { text: title }),
        group && group.id !== '' ? h(doc, 'span', { class: 'group-count', title: t('projects.count_title', { n: rows.length }), text: String(rows.length) }) : false));
    if (group) {
      const actions = h(doc, 'div', { class: 'group-actions' });
      const label = t('sessions.group_add', { project: title });
      const add = h(doc, 'button', { type: 'button', class: 'icon-btn small', 'aria-label': label, title: label }, icon(doc, 'i-plus'));
      add.addEventListener('click', () => handlers.onNewToggle(true, group.id));
      actions.append(add);
      if (group.id !== '') {
        const menuLabel = t('projects.menu', { project: title });
        const more = h(doc, 'button', {
          type: 'button', class: 'icon-btn small', 'aria-label': menuLabel, title: menuLabel, 'aria-haspopup': 'menu', 'aria-expanded': String(groupMenu === group.id),
        }, icon(doc, 'i-more'));
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          groupMenu = groupMenu === group.id ? '' : group.id;
          if (current.ui) renderList(current.model, current.ui);
        });
        actions.append(more);
        if (groupMenu === group.id) {
          const project = projectById(group.id);
          head.append(h(doc, 'div', { class: 'menu group-menu', role: 'menu', 'data-side': 'right' },
            menuAction(t('projects.edit'), 'i-pencil', () => { closeGroupMenu(); projectsUi.openEditor(group.id); }),
            menuAction(t('projects.delete'), 'i-trash', () => { closeGroupMenu(); if (project) projectsUi.removeProject(project); }, true)));
        }
      }
      head.append(actions);
    }
    const body = rows.length === 0 && current.ui?.loading && current.ui.loading.sessions.phase !== 'ready'
      ? h(doc, 'p', { class: 'group-empty', text: t('loading.sessions') })
      : rows.length === 0
      ? h(doc, 'p', { class: 'group-empty', text: t('projects.group_empty') })
      : h(doc, 'ul', { class: 'group-list' }, ...rows.map((r) => sessionRow(r, ui, pins, gctx)));
    const active = Boolean(group) && activeProject !== null && group.id === activeProject;
    const section = h(doc, 'section', { class: 'group', 'data-active': active ? 'true' : false, 'data-project': isProject ? 'true' : false }, head, body);
    if (group) sideKit.projectDnd({ section, head, projectId: group.id, free: Boolean(group.free) });
    return section;
  }

  const projectsHeadNew = h(doc, 'button', { type: 'button', class: 'projects-new', title: t('projects.new') }, icon(doc, 'i-plus'), h(doc, 'span', { text: t('projects.new') }));
  projectsHeadNew.addEventListener('click', () => projectsUi.createByFolder((projectsList || []).map((p) => p.name)));
  const projectsHead = h(doc, 'div', { class: 'projects-head' }, h(doc, 'h3', { text: t('projects.title') }), projectsHeadNew);

  function renderList(model, ui) {
    const loading = ui.loading;
    const loadSig = JSON.stringify(loading);
    if (loadSig !== loadingSig) {
      loadingSig = loadSig;
      const nodes = [];
      if (loading) {
        const entries = [
          ['projects', 'loading.projects', 'projects.load_failed', handlers.onRetryProjects],
          ['sessions', 'loading.sessions', 'loading.sessions_error', handlers.onRetrySessions],
        ];
        for (const [key, label, errorLabel, retry] of entries) {
          const source = loading[key];
          if (source.phase === 'ready') continue;
          const text = source.phase === 'error' ? t(errorLabel, { reason: t('projects.offline') }) : source.refreshing ? t('loading.refreshing') : t(label);
          const row = h(doc, 'div', { class: 'load-source', 'data-source': key }, h(doc, 'p', { text }));
          if (source.phase === 'error') {
            const button = h(doc, 'button', { type: 'button', class: 'link-btn', text: t('loading.retry'), 'aria-label': `${t('loading.retry')}: ${t(label)}` });
            button.addEventListener('click', () => retry?.()); row.append(button);
          } else {
            if (source.slow) row.append(h(doc, 'p', { text: t('loading.slow') }));
            if (!source.refreshing) row.append(h(doc, 'div', { class: 'load-skeleton', 'aria-hidden': 'true' }), h(doc, 'div', { class: 'load-skeleton', 'aria-hidden': 'true' }));
          }
          nodes.push(row);
        }
      }
      loadingBox.replaceChildren(...nodes);
      loadingBox.hidden = nodes.length === 0;
    }
    projectsList = ui.projects ?? null;
    const all = sessionList(model).filter((x) => !x.draft);
    const selectedSession = ui.selected ? model.sessions[ui.selected] : undefined;
    activeProject = selectedSession ? (selectedSession.projectId || '') : null;
    const pins = effectivePins(all, ui.pins);
    const filtered = filterSessions(all, query);
    const groups = groupSessions(filtered, { pinned: pins, projects: projectsList, includeEmpty: query.trim() === '', collapsed: foldedParents });
    const rowSig = (r) => [r.depth, r.kids, r.collapsed, r.session.parent, r.session.id, r.session.name, r.session.state, r.session.updatedAt, r.session.rank, r.session.projectId, (sessionTask(r.session) || {}).number, ui.unread ? ui.unread[r.session.id] : undefined, Boolean(r.session.pendingQuestion), (mergeLabel(r.session.routeState && r.session.routeState.task) || {}).text, (() => { const a = attention(r.session, { now: now(), silentMin: ui.silentMin ?? SILENT_DEFAULT_MIN, unread: Boolean(ui.unread && ui.unread[r.session.id] === true), acked: (ui.acked || {})[r.session.id] || '' }); return `${a.state}:${a.blink}:${a.minutes}`; })()];
    const sig = JSON.stringify([loading?.sessions.phase, ui.selected, activeProject, query, groupMenu, sideKit.sig(), groups.pinned.map(rowSig), groups.projects.map((p) => [p.project, p.id, p.rows.map(rowSig)])]);
    const shown = groups.pinned.length + groups.projects.length;
    listEmpty.hidden = Boolean(loading && (loading.projects.phase !== 'ready' || loading.sessions.phase !== 'ready')) || all.length > 0 || (projectsList !== null && projectsList.length > 0);
    notFound.hidden = Boolean(loading && (loading.sessions.phase !== 'ready' || loading.projects.phase !== 'ready')) || !(all.length > 0 && shown === 0);
    if (sig === listSig) return;
    if (sideKit.isDragging()) { sideKit.deferRender(); return; } // пока тащат, список не пересобирается
    listSig = sig;
    const nodes = [];
    if (groups.pinned.length > 0) nodes.push(groupNode(t('sessions.pinned'), groups.pinned, ui, pins));
    const named = groups.projects.filter((p) => p.project !== '');
    const free = groups.projects.filter((p) => p.project === '');
    nodes.push(projectsHead);
    for (const p of named) nodes.push(groupNode(p.project, p.rows, ui, pins, { id: p.id }));
    for (const p of free) nodes.push(groupNode(t('sessions.no_project'), p.rows, ui, pins, { id: '', free: true }));
    sideKit.rebuild(() => groupsBox.replaceChildren(...nodes));
    sideKit.afterRender(groupsBox);
  }

  // меню «⋯» закрывается кликом в стороне и Esc
  doc.addEventListener('click', (e) => {
    if (groupMenu === '' || e.composedPath().some((n) => n && n.classList && n.classList.contains('group-menu'))) return;
    closeGroupMenu();
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || groupMenu === '' || projectsUi.openCount() > 0) return;
    closeGroupMenu();
  });

  // ---------------------------------------------------------------- центр: заголовок и разговор

  const backButton = h(doc, 'button', { type: 'button', class: 'icon-btn chat-back', 'aria-label': t('chat.back'), title: t('chat.back') }, icon(doc, 'i-back'));
  // Заголовок переименовывается на месте (задача 192): поле лежит поверх текста тех же размеров, ничего не прыгает
  const titleText = h(doc, 'span', { class: 'title-text', title: t('chat.rename'), tabindex: '0', role: 'button' });
  const titleInput = h(doc, 'input', { class: 'title-input', type: 'text', maxlength: '200', autocomplete: 'off', 'aria-label': t('chat.rename'), hidden: true });
  // номер задачи сессии (если есть): приглушённо рядом с названием, без решётки
  const taskNo = h(doc, 'span', { class: 'task-no', hidden: true });
  // «родитель › ребёнок» (задача 192.3): у дочерней сессии перед названием стоит название родителя, клик открывает его чат
  const crumb = h(doc, 'button', { type: 'button', class: 'title-parent', hidden: true });
  const crumbSep = h(doc, 'span', { class: 'title-sep', 'aria-hidden': 'true', text: '›', hidden: true });
  crumb.addEventListener('click', () => { if (crumb.dataset.parent) handlers.onSelect(crumb.dataset.parent); });
  const title = h(doc, 'h2', { class: 'title' }, crumb, crumbSep, titleText, taskNo, titleInput);
  let renaming = false;
  function finishRename(save) {
    if (!renaming) return;
    renaming = false;
    title.classList.remove('is-editing');
    titleInput.hidden = true;
    const session = current.session;
    const name = titleInput.value.trim();
    if (save && session && name !== '' && name !== session.name) {
      titleText.textContent = name;
      handlers.onRename(session.id, name);
    }
  }
  function startRename() {
    const session = current.session;
    if (renaming || !session || session.draft) return;
    renaming = true;
    titleInput.value = session.name;
    title.classList.add('is-editing');
    titleInput.hidden = false;
    titleInput.focus();
    titleInput.select();
  }
  titleText.addEventListener('click', startRename);
  titleText.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startRename(); } });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finishRename(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishRename(false); }
  });
  titleInput.addEventListener('blur', () => finishRename(true));
  // черновик новой сессии: вместо названия — выбор проекта (и папки, если их несколько)
  // Выбор проекта новой сессии — списком посреди пустого чата (значок папки, галочка у выбранного) и кнопкой в строке под полем.
  const draftFolder = h(doc, 'select', { class: 'draft-folder', 'aria-label': t('chat.draft_folder'), hidden: true });
  draftFolder.addEventListener('change', () => { if (currentTrace) handlers.onDraftFolder(currentTrace, draftFolder.value); });
  const projectPicker = h(doc, 'div', { class: 'project-picker', role: 'listbox', 'aria-label': t('chat.draft_project') });
  let draftSig = '';
  function projectRow({ id, name, checked }) {
    const row = h(doc, 'button', { type: 'button', class: 'project-row', role: 'option', 'aria-selected': checked ? 'true' : 'false', 'data-project': id },
      icon(doc, 'i-folder', 'project-icon'),
      h(doc, 'span', { class: 'project-name', text: name }),
      h(doc, 'span', { class: 'project-check' }, checked ? icon(doc, 'i-check') : false));
    row.addEventListener('click', () => { if (currentTrace) handlers.onDraftProject(currentTrace, id); });
    return row;
  }
  // папка черновика из списка проектов страницы (с признаком repo) или null
  function draftFolderInfo(session) {
    const project = (projectsList ?? []).find((p) => p.id === session.projectId);
    return project ? project.folders.find((f) => f.path === session.folder) || null : null;
  }
  function syncProjectPicker(session) {
    const list = projectsList ?? [];
    const project = list.find((p) => p.id === session.projectId);
    const many = Boolean(project) && project.folders.length > 1;
    const sig = JSON.stringify([list.map((p) => [p.id, p.name]), session.projectId, many ? project.folders.map((f) => f.path) : [], session.folder]);
    if (sig === draftSig && projectPicker.parentNode) return;
    draftSig = sig;
    draftFolder.hidden = !many;
    draftFolder.replaceChildren(...(many ? project.folders.map((f) => h(doc, 'option', { value: f.path, text: f.path })) : []));
    if (many) draftFolder.value = session.folder;
    projectPicker.replaceChildren(
      projectRow({ id: '', name: t('chat.project_none'), checked: !project }),
      ...list.map((p) => projectRow({ id: p.id, name: p.name, checked: Boolean(project) && p.id === project.id })),
      ...(many ? [h(doc, 'div', { class: 'project-folder' }, draftFolder)] : []));
  }
  // Шапка чата (задача 192.6): только название (с «родитель ›» и номером задачи) и шеврон ⌄ с меню действий сессии
  const headMenu = h(doc, 'span', { class: 'head-menu' });
  let headCtx = null; // { session, pinned, unread } показанной сессии
  function syncHeadMenu() {
    if (!headCtx) { headMenu.replaceChildren(); return; }
    const open = sideKit.menuFor(headCtx.session, { pinned: headCtx.pinned, unread: headCtx.unread, rename: startRename }, 'head');
    headMenu.replaceChildren(...[sideKit.headButton(headCtx.session), open].filter(Boolean));
  }
  const titleBlock = h(doc, 'div', { class: 'title-block', hidden: true }, title, headMenu);
  const railButton = h(doc, 'button', { type: 'button', class: 'icon-btn', 'aria-label': t('rail.toggle'), title: t('rail.toggle'), 'aria-pressed': 'true' }, icon(doc, 'i-panel'));
  const topbar = h(doc, 'header', { class: 'topbar' }, backButton, titleBlock, railButton);

  const pick = h(doc, 'p', { class: 'pick', text: t('chat.pick') });
  const thread = h(doc, 'div', { class: 'thread' });
  const log = h(doc, 'div', { class: 'log', role: 'log', 'aria-live': 'off' }, thread);
  const emptyChat = h(doc, 'p', { class: 'empty', text: t('chat.empty') });

  // поле ввода
  const input = h(doc, 'textarea', {
    id: 'composer-input', rows: 1, placeholder: t('composer.placeholder'), 'aria-label': t('chat.input_label'),
  });
  // Кнопки круглые, без видимого текста: имя — для чтения с экрана, подсказка о клавишах — в title (задача 192).
  const micButton = h(doc, 'button', { type: 'button', class: 'mic-btn', 'data-tip': `${t('voice.start')} · ${t('voice.right_click')}`, 'aria-label': `${t('voice.label')}: ${t('voice.start')}`, 'data-state': 'idle' }, icon(doc, 'i-mic'));
  const wave = h(doc, 'div', { class: 'wave', 'aria-hidden': 'true', hidden: true }, ...Array.from({ length: BARS }, () => h(doc, 'i')));
  const micTimer = h(doc, 'span', { class: 'mic-timer', 'aria-hidden': 'true', hidden: true });
  // стрелка рядом с микрофоном открывает меню: провайдер распознавания, язык, микрофон
  const micMore = h(doc, 'button', { type: 'button', class: 'mic-more', title: t('voice.menu'), 'aria-label': t('voice.menu'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon(doc, 'i-chevron-down'));
  const voiceMenu = h(doc, 'div', { class: 'menu voice-menu', role: 'menu', 'data-side': 'right', hidden: true });
  const voiceList = h(doc, 'div', { class: 'menu-list' });
  voiceMenu.append(voiceList);
  const micWrap = h(doc, 'div', { class: 'mic-wrap' }, micButton, micMore, voiceMenu);
  // Ошибки голоса — красная плашка над полем: position absolute, место в потоке не занимает, макет не прыгает
  const voiceToastText = h(doc, 'span', { class: 'voice-toast-text' });
  const voiceToastClose = h(doc, 'button', { type: 'button', class: 'voice-toast-close', title: t('voice.dismiss'), 'aria-label': t('voice.dismiss') }, icon(doc, 'i-x'));
  const voiceHint = h(doc, 'div', { class: 'voice-toast', role: 'alert', hidden: true }, voiceToastText, voiceToastClose);
  const voiceToast = createToast({
    show(text) { voiceToastText.textContent = text; voiceHint.hidden = false; },
    hide() { voiceHint.hidden = true; voiceToastText.textContent = ''; },
    timers: { setTimeout: (f, ms) => globalThis.setTimeout(f, ms), clearTimeout: (id) => globalThis.clearTimeout(id) },
  });
  voiceHint.addEventListener('click', () => voiceToast.hide());
  const cancelButton = h(doc, 'button', { type: 'button', class: 'cancel-btn', hidden: true, 'data-tip': t('chat.cancel'), 'aria-label': t('chat.cancel') }, icon(doc, 'i-stop'), h(doc, 'span', { class: 'sr-only', text: t('chat.cancel') }));
  const sendButton = h(doc, 'button', { type: 'button', class: 'send-btn', 'data-tip': t('composer.hint'), disabled: true }, icon(doc, 'i-return'), h(doc, 'span', { class: 'sr-only', text: t('chat.send') }));
  // счётчик очереди — над полем, position absolute: его появление не меняет высоту
  const queueButton = h(doc, 'button', { type: 'button', class: 'queue-count', hidden: true, title: t('composer.queued_hint') });
  // картинки сообщения: полоска превью — первой строкой карточки (задача 192)
  const viewer = createViewer(doc, { h, icon });
  const attach = createAttachUi(doc, {
    h, icon, showError: (text) => voiceToast.show(text), onChange: () => fitInput(),
    onView: (images, at, from) => viewer.open(images, at, from),
  });
  // панель записи (таймер и дорожка) лежит поверх карточки справа от места микрофона: ширина поля не меняется
  const recPanel = h(doc, 'div', { class: 'rec-panel' }, micTimer, wave);
  const plusButton = h(doc, 'button', { type: 'button', class: 'plus-btn', title: t('images.add'), 'aria-label': t('images.add') }, icon(doc, 'i-plus'));
  const box = h(doc, 'div', { class: 'box' }, attach.row, plusButton, input,
    recPanel, h(doc, 'div', { class: 'box-row' }, cancelButton, sendButton, micWrap));
  attach.bindPicker(plusButton);
  attach.bindPaste(input);
  attach.bindDrop(box);
  // счётчик очереди (Enter при работающем агенте); клик убирает последнее сообщение

  const ringFill = svgNode(doc, 'circle', { class: 'ring-fill', cx: 12, cy: 12, r: 9, pathLength: 100 });
  const ring = svgNode(doc, 'svg', { class: 'ring', viewBox: '0 0 24 24', role: 'img' });
  ring.append(svgNode(doc, 'circle', { class: 'ring-track', cx: 12, cy: 12, r: 9 }), ringFill);
  const ringBox = h(doc, 'span', { class: 'ring-box' });
  ringBox.append(ring);

  // строка статуса под полем: слева режим (когда агент его сообщает), справа модель и спиннер хода
  // Голосовой ввод (задача 192): нажать и держать — пишет, отпустить — стоп; короткое нажатие и Пробел/Enter — переключатель.
  let storage = null;
  try { storage = win && win.localStorage ? win.localStorage : null; } catch { storage = null; }
  const page = pageLang(doc);
  const voiceSettings = createVoiceSettings({
    storage,
    fetchFn: (...args) => win.fetch(...args),
    mediaDevices: win && win.navigator ? win.navigator.mediaDevices : undefined,
    page,
  });
  const voiceChange = () => { fitInput(); if (currentTrace) drafts.set(currentTrace, input.value); };
  // Запись: «Слушаю…» вместо подсказки, дорожка уровня, «↵» вместо отправки (задача 192)
  const waveBars = [...wave.children];
  const paintWave = (levels) => { const px = barHeights(levels, 3, 22); waveBars.forEach((bar, i) => { bar.style.height = `${px[i]}px`; }); };
  const meter = createMeter({
    mediaDevices: win && win.navigator ? win.navigator.mediaDevices : undefined,
    AudioCtx: win ? (win.AudioContext || win.webkitAudioContext) : undefined,
    getMic: () => voiceSettings.state.mic,
    onLevels: paintWave,
  });
  let recordingNow = false;
  function paintRecording(state) {
    const v = recordingView(state);
    input.placeholder = t(v.placeholderKey);
    box.classList.toggle('recording', v.showWave);
    const micUse = micButton.querySelector('use');
    if (micUse) micUse.setAttribute('href', v.showWave ? '#i-mic-fill' : '#i-mic');
    wave.hidden = !v.showWave;
    recordingNow = v.hideSend;
    input.spellcheck = !v.showWave; // красные волны орфографии при записи не нужны
    syncSend(!cancelButton.hidden);
    if (v.showWave) meter.start(); else meter.stop();
  }
  // Таймер записи «0:07» рядом с кнопкой, пока идёт запись
  let micClock = null;
  let micStartedAt = 0;
  const paintMicTimer = () => { micTimer.textContent = clockText((now() - micStartedAt) / 1000); };
  function setMicTimer(on) {
    if (on && micClock === null) {
      micStartedAt = now();
      paintMicTimer();
      micTimer.hidden = false;
      micClock = setInterval(paintMicTimer, 500);
    } else if (!on && micClock !== null) {
      clearInterval(micClock);
      micClock = null;
      micTimer.hidden = true;
      micTimer.textContent = '';
    }
  }
  // Состояние кнопки и подсказка под полем: «недоступно» (серая: браузер без распознавания) и «ошибка» (можно повторить)
  const voiceStatus = (s) => {
    micButton.dataset.state = s.state;
    const hint = t(micTitleKey(s.state));
    micButton.dataset.tip = s.state === 'recording' || s.state === 'processing' ? hint : `${hint} · ${t('voice.right_click')}`;
    micButton.setAttribute('aria-label', `${t('voice.label')}: ${hint}`);
    setMicTimer(s.state === 'recording');
    paintRecording(s.state);
    if (s.state === 'unavailable') voiceToast.show(t('voice.unavailable', { reason: s.reason }));
    else if (s.state === 'error') voiceToast.show(t('voice.failed', { reason: s.reason }));
    else if (s.state === 'processing' && s.reason) voiceToast.show(t('voice.processing_note', { note: s.reason }));
    else if (s.state !== 'processing') voiceToast.hide();
  };
  const browserDictation = createDictation({
    Ctor: speechCtor(win),
    field: input,
    lang: () => langFor('browser', voiceSettings.state.lang, page),
    onChange: voiceChange,
    onStatus: voiceStatus,
  });
  const localDictation = createLocalDictation({
    field: input,
    mediaDevices: win && win.navigator ? win.navigator.mediaDevices : undefined,
    AudioCtx: win ? (win.AudioContext || win.webkitAudioContext) : undefined,
    fetchFn: (...args) => win.fetch(...args),
    getLang: () => langFor('local', voiceSettings.state.lang),
    getMic: () => voiceSettings.state.mic,
    workletUrl: new URL('./rec-worklet.js', import.meta.url).href,
    onChange: voiceChange,
    onStatus: voiceStatus,
  });
  // Одна ручка на два распознавателя: какой работает, решает выбор в меню на момент нажатия.
  let currentDictation = browserDictation;
  const dictation = {
    start() { currentDictation = voiceSettings.provider() === 'local' ? localDictation : browserDictation; return currentDictation.start(); },
    stop() { currentDictation.stop(); },
    cancel() { if (currentDictation.cancel) currentDictation.cancel(); },
    toggle() { if (currentDictation.active()) currentDictation.stop(); else this.start(); },
    active() { return browserDictation.active() || localDictation.active(); },
  };
  // серая кнопка — только если работать будет браузерный распознаватель, а его в этом браузере нет
  const syncMicIdle = () => {
    if (micButton.dataset.state !== 'idle' && micButton.dataset.state !== 'unavailable') return;
    micButton.dataset.state = voiceSettings.provider() === 'browser' && !speechCtor(win) ? 'unavailable' : 'idle';
  };
  syncMicIdle();
  voiceSettings.refreshStatus().then(syncMicIdle);

  // ---- меню голосового ввода
  const voiceRow = ({ name, description, checked, disabled, onPick }) => {
    const row = menuRow({ name, description, checked, onPick: disabled ? () => {} : onPick });
    if (disabled) row.setAttribute('aria-disabled', 'true');
    return row;
  };
  function renderVoiceMenu() {
    const st = voiceSettings.state;
    const provider = voiceSettings.provider();
    const offline = st.available === false;
    const rows = [
      h(doc, 'div', { class: 'menu-head', text: t('voice.provider_head') }),
      voiceRow({ name: t('voice.p_browser'), checked: provider === 'browser', onPick: () => { voiceSettings.setProvider('browser'); syncMicIdle(); renderVoiceMenu(); } }),
      voiceRow({
        name: t('voice.p_local'), description: offline ? t('voice.not_running') : false, checked: provider === 'local', disabled: offline,
        onPick: () => { voiceSettings.setProvider('local'); syncMicIdle(); renderVoiceMenu(); },
      }),
      h(doc, 'div', { class: 'menu-sep', role: 'separator' }),
      h(doc, 'div', { class: 'menu-head', text: t('voice.lang_head') }),
      ...LANGS.map((l) => voiceRow({
        name: l.id === 'auto' ? t('voice.lang_auto') : l.name, checked: st.lang === l.id,
        onPick: () => { voiceSettings.setLang(l.id); renderVoiceMenu(); },
      })),
      h(doc, 'div', { class: 'menu-sep', role: 'separator' }),
      h(doc, 'div', { class: 'menu-head', text: provider === 'local' ? t('voice.mic_head') : t('voice.mic_head_browser') }),
      voiceRow({ name: t('voice.mic_default'), checked: st.mic === '' || !st.mics.devices.some((d) => d.id === st.mic), onPick: () => { voiceSettings.setMic(''); renderVoiceMenu(); } }),
      ...st.mics.devices.filter((d) => d.id !== 'default').map((d, i) => voiceRow({
        name: d.label || t('voice.mic_n', { n: i + 1 }), checked: st.mic === d.id, onPick: () => { voiceSettings.setMic(d.id); renderVoiceMenu(); },
      })),
    ];
    if (!st.mics.labelled) {
      rows.push(voiceRow({
        name: t('voice.mic_allow'),
        onPick: async () => {
          try {
            const stream = await win.navigator.mediaDevices.getUserMedia({ audio: true });
            for (const track of stream.getTracks()) track.stop();
          } catch (e) {
            voiceStatus({ state: 'error', reason: e && e.name === 'NotAllowedError' ? t('voice.err_denied') : t('voice.err_no_mic') });
          }
          await voiceSettings.refreshMics();
          renderVoiceMenu();
        },
      }));
    }
    voiceList.replaceChildren(...rows);
    voiceMenu.hidden = false;
    micMore.setAttribute('aria-expanded', 'true');
  }
  function closeVoiceMenu() {
    voiceMenu.hidden = true;
    micMore.setAttribute('aria-expanded', 'false');
  }
  const toggleVoiceMenu = () => {
    if (!voiceMenu.hidden) { closeVoiceMenu(); return; }
    renderVoiceMenu();
    // статус сервера и список микрофонов узнаём при открытии: сервер могли запустить или остановить
    Promise.all([voiceSettings.refreshStatus(), voiceSettings.refreshMics()]).then(() => { if (!voiceMenu.hidden) renderVoiceMenu(); syncMicIdle(); });
  };
  micMore.addEventListener('click', toggleVoiceMenu);
  // правый клик на микрофоне — то же меню (провайдер, язык, микрофон), как и по стрелке рядом
  micButton.addEventListener('contextmenu', (e) => { e.preventDefault(); if (voiceMenu.hidden) toggleVoiceMenu(); });
  doc.addEventListener('click', (e) => { if (!voiceMenu.hidden && !e.composedPath().includes(micWrap)) closeVoiceMenu(); });
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !voiceMenu.hidden) closeVoiceMenu(); });
  const micPress = createMicPress({ dictation, now, onStart: () => { voiceSettings.refreshStatus().then(syncMicIdle); } });
  micButton.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    micPress.down();
  });
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dictation.active()) { e.preventDefault(); dictation.cancel(); } });
  micButton.addEventListener('pointerup', () => micPress.up());
  micButton.addEventListener('pointercancel', () => micPress.up());
  micButton.addEventListener('pointerleave', () => micPress.up());
  micButton.addEventListener('click', (e) => { if (e.detail === 0) micPress.key(); });

  const statusModel = h(doc, 'span', { class: 'status-model' });
  const familyButton = h(doc, 'button', { type: 'button', class: 'status-btn', hidden: true, title: t('status.agent'), 'aria-label': t('status.agent'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const modeButton = h(doc, 'button', { type: 'button', class: 'status-btn', hidden: true, title: t('menu.mode'), 'aria-label': t('menu.mode'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const modelButton = h(doc, 'button', { type: 'button', class: 'status-btn', hidden: true, title: t('status.model'), 'aria-label': t('status.model'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const effortButton = h(doc, 'button', { type: 'button', class: 'status-btn', hidden: true, title: t('menu.effort'), 'aria-label': t('menu.effort'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  // Режим работы по методике (задача 192p): слева в строке статуса, плоский текст без шеврона.
  const routeButton = h(doc, 'button', { type: 'button', class: 'status-btn route-chip', hidden: true, title: t('route.label'), 'aria-label': t('route.label'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  // Под полем новой сессии: Worktree · режим · агент · модель · усилие; проект выбирается только списком посреди пустого чата (задача 192.6).
  const worktreeButton = h(doc, 'button', { type: 'button', class: 'status-btn worktree-chip', hidden: true, 'aria-pressed': 'true', title: t('route.worktree_on') },
    icon(doc, 'i-branch'), h(doc, 'span', { text: t('route.worktree') }));
  worktreeButton.addEventListener('click', () => {
    if (worktreeButton.disabled || !currentTrace) return;
    const on = worktreeButton.getAttribute('aria-pressed') !== 'true';
    if (worktreeButton.dataset.draft === 'true') handlers.onDraftWorktree(currentTrace, on); else handlers.onWorktree(currentTrace, on);
  });
  // Задача 192.12: набор «роль → семья, модель, усилие» — выбор под полем новой сессии и у открытой сессии
  const resultRepoSelect = h(doc, 'select', { class: 'status-btn', hidden: true, title: 'Репозиторий результата', 'aria-label': 'Репозиторий результата' });
  let resultRepoRecords = [];
  function fillResultRepos(selected = '', label = '') {
    resultRepoSelect.replaceChildren(h(doc, 'option', { value: '', text: 'Результат: свой репозиторий' }),
      ...resultRepoRecords.map((p) => h(doc, 'option', { value: p.id, text: `Результат: ${p.dir} → ${p.remote}/${p.branch}` })));
    if (selected && !resultRepoRecords.some((p) => p.id === selected)) resultRepoSelect.append(h(doc, 'option', { value: selected, text: `Результат: ${label || selected}` }));
    resultRepoSelect.append(h(doc, 'option', { value: '__register', text: 'Подтвердить другой репозиторий…' }));
    resultRepoSelect.value = selected;
  }
  resultRepoSelect.addEventListener('focus', async () => {
    if (!projectsApi || !projectsApi.listResultRepos) return;
    const selected = resultRepoSelect.value;
    const r = await projectsApi.listResultRepos();
    if (r.ok) { resultRepoRecords = (r.body && r.body.repositories) || []; fillResultRepos(selected); }
  });
  resultRepoSelect.addEventListener('change', async () => {
    if (!currentTrace || resultRepoSelect.disabled) return;
    if (resultRepoSelect.value !== '__register') { handlers.onResultRepo(currentTrace, resultRepoSelect.value); return; }
    const trace = currentTrace;
    const previous = current.session && current.session.routeState ? current.session.routeState.resultRepo : '';
    fillResultRepos(previous);
    const path = await projectsUi.pickFolder();
    if (!path) return;
    const inspected = await projectsApi.inspectResultRepo(path);
    if (!inspected.ok) { handlers.onNotice(inspected.error, 'error'); return; }
    const target = inspected.body;
    const confirmed = await projectsUi.confirm({ title: 'Подтвердить репозиторий результата', text: `${target.dir}\n${target.common}\n${target.url}\n${target.remote}/${target.branch}\nКарточка проекта Crew не создаётся.`, ok: 'Подтверждаю', cancel: 'Отмена' });
    if (!confirmed || trace !== currentTrace) return;
    const registered = await projectsApi.registerResultRepo(target);
    if (!registered.ok) { handlers.onNotice(registered.error, 'error'); return; }
    resultRepoRecords.push(registered.body);
    fillResultRepos(registered.body.id);
    handlers.onResultRepo(trace, registered.body.id);
  });
  const presetSelect = h(doc, 'select', { class: 'status-btn preset-chip', hidden: true, title: t('preset.label'), 'aria-label': t('preset.label') });
  presetSelect.addEventListener('change', () => {
    if (!currentTrace) return;
    if (presetSelect.dataset.draft === 'true') handlers.onDraftPreset(currentTrace, presetSelect.value); else handlers.onSessionPreset(currentTrace, presetSelect.value);
  });
  // Задача 192.4: где идёт работа (main, ветка папки проекта или своя ветка wip/задачи)
  // Задача 192.6: подпись — отдельной строкой под строкой чипов, чтобы не отнимать у них ширину
  const whereNote = h(doc, 'p', { class: 'where-note', hidden: true });
  const spinner = h(doc, 'span', { class: 'spinner', role: 'img', 'aria-label': t('composer.working'), hidden: true });
  const menu = h(doc, 'div', { class: 'menu', role: 'menu', hidden: true });
  // Одна группа чипов у правого края: семья, режим, модель и усилие; за ней кольцо контекста и спиннер (задача 192).
  const statusGroup = h(doc, 'div', { class: 'status-group' }, familyButton, modeButton, statusModel, modelButton, effortButton);
  const status = h(doc, 'div', { class: 'composer-status', 'data-empty': 'true' }, worktreeButton, routeButton, resultRepoSelect, h(doc, 'span', { class: 'grow' }), statusGroup, ringBox, spinner, presetSelect, menu);

  // Меню выбора режима, модели и усилия (задача 192): показывает только то, что агент отдал по ACP.
  const MENU_MODELS = 4;
  let menuKind = null; // null | 'mode' | 'model' | 'more' | 'effort'
  let options = null;
  let currentAgent = '';
  let currentRoute = INTERACTIVE_STATE.route;
  let menuQuery = '';
  let menuSig = '';
  const menuSearch = h(doc, 'input', { type: 'search', class: 'menu-search', placeholder: t('menu.search'), 'aria-label': t('menu.search'), autocomplete: 'off', hidden: true });
  const menuList = h(doc, 'div', { class: 'menu-list' });
  menu.append(menuSearch, menuList);
  const nameOf = (list, id) => (list.find((c) => c.id === id) || { name: '' }).name;
  // Режимы и усилие — по-русски там, где перевод известен; оригинал агента остаётся в title (labels-ru.js).
  const labelFor = (kind, list, id) => labelOf(kind, list.find((c) => c.id === id) || { name: '' });

  function closeMenu() {
    menuKind = null;
    menu.hidden = true;
    modeButton.setAttribute('aria-expanded', 'false');
    modelButton.setAttribute('aria-expanded', 'false');
    effortButton.setAttribute('aria-expanded', 'false');
    familyButton.setAttribute('aria-expanded', 'false');
    routeButton.setAttribute('aria-expanded', 'false');
  }

  function choose(setting, value) {
    if (currentTrace) handlers.onChoose(currentTrace, setting, value);
    closeMenu();
  }

  function menuRow({ name, description, checked, number, arrow, tip, onPick }) {
    const row = h(doc, 'button', { type: 'button', class: 'menu-item', role: 'menuitem', 'aria-checked': checked ? 'true' : 'false', title: tip || false },
      h(doc, 'span', { class: 'menu-check' }, checked ? icon(doc, 'i-check') : false),
      h(doc, 'span', { class: 'menu-label' }, h(doc, 'span', { text: name }), description ? h(doc, 'small', { text: description }) : false),
      arrow ? h(doc, 'span', { class: 'menu-end' }, icon(doc, 'i-chevron-right')) : h(doc, 'span', { class: 'menu-end menu-num', text: number ? String(number) : '' }));
    row.addEventListener('click', onPick);
    return row;
  }

  function renderMenu() {
    menuList.replaceChildren();
    if (menuKind === 'agent') {
      menuSearch.hidden = true;
      menu.dataset.side = 'right';
      menuList.append(h(doc, 'div', { class: 'menu-head', text: t('menu.agent') }), ...agents.map((a, i) => menuRow({
        name: agentLabel(a.id), checked: a.id === currentAgent, number: i < 9 ? i + 1 : 0,
        onPick: () => { if (currentTrace && a.id !== currentAgent) handlers.onSwitchAgent(currentTrace, a.id); closeMenu(); },
      })));
      menu.hidden = false;
      return;
    }
    if (menuKind === 'route') {
      menuSearch.hidden = true;
      menu.dataset.side = 'left';
      menuList.append(h(doc, 'div', { class: 'menu-head', text: t('route.label') }), ...ROUTES.map((r, i) => menuRow({
        name: routeName(r.id), description: routeDescription(r.id), checked: r.id === currentRoute, number: i + 1,
        onPick: () => { if (currentTrace && r.id !== currentRoute) handlers.onRoute(currentTrace, r.id); closeMenu(); },
      })));
      menu.hidden = false;
      return;
    }
    if (!options || !menuKind) { menu.hidden = true; return; }
    const rows = [];
    const searchable = menuKind === 'model' || menuKind === 'more';
    menuSearch.hidden = !searchable;
    const searching = searchable && menuQuery.trim().length > 0;
    const numbered = (list, setting, current) => list.map((c, i) => {
      const l = setting === 'model' ? { name: c.name, description: c.description, title: '' } : labelOf(setting, c);
      return menuRow({
        name: l.name, description: l.description, tip: l.title, checked: c.id === current, number: i < 9 ? i + 1 : 0, onPick: () => choose(setting, c.id),
      });
    });
    if (menuKind === 'mode') {
      menu.dataset.side = 'right';
      rows.push(h(doc, 'div', { class: 'menu-head', text: t('menu.mode') }), ...numbered(options.modes, 'mode', options.mode));
    } else {
      menu.dataset.side = 'right';
      if (searching) {
        const found = filterModels(options.models, menuQuery);
        if (found.length === 0) rows.push(h(doc, 'div', { class: 'menu-head', text: t('menu.none') }));
        rows.push(...found.map((c) => menuRow({ name: c.name, description: c.description, checked: c.id === options.modelId, onPick: () => choose('model', c.id) })));
      } else if (menuKind === 'model') {
        rows.push(...numbered(options.models.slice(0, MENU_MODELS), 'model', options.modelId));
        if (options.models.length > MENU_MODELS) rows.push(h(doc, 'div', { class: 'menu-sep', role: 'separator' }));
        if (options.models.length > MENU_MODELS) rows.push(menuRow({ name: t('menu.more_models'), arrow: true, onPick: () => openMenu('more') }));
      } else if (menuKind === 'more') {
        rows.push(menuRow({ name: t('menu.back'), onPick: () => openMenu('model') }));
        const groups = groupModels(options.models);
        for (const g of groups) {
          if (g.provider) rows.push(h(doc, 'div', { class: 'menu-head', text: g.provider }));
          rows.push(...g.models.map((c) => menuRow({
            name: g.provider ? c.name.replace(`${g.provider}/`, '') : c.name, description: c.description, checked: c.id === options.modelId, onPick: () => choose('model', c.id),
          })));
        }
      } else {
        rows.push(h(doc, 'div', { class: 'menu-head', text: t('menu.effort') }),
          ...numbered(effortChoices(options.efforts), 'effort', options.effort));
      }
    }
    menuList.append(...rows);
    menu.hidden = false;
    menuList.querySelector('[aria-checked="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  function openMenu(kind) {
    menuKind = kind;
    menuQuery = '';
    menuSearch.value = '';
    menuSig = kind === 'route' ? currentRoute : JSON.stringify(options);
    familyButton.setAttribute('aria-expanded', kind === 'agent' ? 'true' : 'false');
    routeButton.setAttribute('aria-expanded', kind === 'route' ? 'true' : 'false');
    modeButton.setAttribute('aria-expanded', kind === 'mode' ? 'true' : 'false');
    modelButton.setAttribute('aria-expanded', kind === 'model' || kind === 'more' ? 'true' : 'false');
    effortButton.setAttribute('aria-expanded', kind === 'effort' ? 'true' : 'false');
    renderMenu();
    if (kind === 'model' || kind === 'more') menuSearch.focus();
    else menu.querySelector('.menu-item')?.focus();
  }

  menuSearch.addEventListener('input', () => { menuQuery = menuSearch.value; renderMenu(); });
  // стрелки ходят по строкам, Enter в поиске берёт первую найденную
  menu.addEventListener('keydown', (e) => {
    const items = [...menuList.querySelectorAll('.menu-item')];
    const at = items.indexOf(doc.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (items[at + 1] || items[0])?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (at <= 0 && !menuSearch.hidden) menuSearch.focus(); else (items[at - 1] || items[items.length - 1])?.focus();
    } else if (e.key === 'Enter' && doc.activeElement === menuSearch && items.length > 0) {
      e.preventDefault();
      items[0].click();
    }
  });

  const toggleMenu = (kind) => { if (menuKind) closeMenu(); else openMenu(kind); };
  familyButton.addEventListener('click', () => toggleMenu('agent'));
  routeButton.addEventListener('click', () => toggleMenu('route'));
  modeButton.addEventListener('click', () => toggleMenu('mode'));
  modelButton.addEventListener('click', () => toggleMenu('model'));
  effortButton.addEventListener('click', () => toggleMenu('effort'));
  // номера строк — горячие клавиши; у строк без номера (Назад, подменю) их нет
  doc.addEventListener('keydown', (e) => {
    if (!menuKind) return;
    if (e.key === 'Escape') { closeMenu(); return; }
    if (/^[1-9]$/.test(e.key)) {
      const rows = [...menuList.querySelectorAll('.menu-num')];
      const at = rows.findIndex((n) => n.textContent === e.key);
      if (at >= 0) { e.preventDefault(); rows[at].closest('.menu-item').click(); }
    }
  });
  doc.addEventListener('click', (e) => { if (menuKind && !e.composedPath().includes(status)) closeMenu(); });

  // Полоса шагов режима (задача 192p): абсолютно над полем ввода, макет не сдвигает.
  const routeStrip = h(doc, 'section', { class: 'route-strip', hidden: true, 'aria-label': t('route.label') });
  let stripSig = '';
  function renderRouteStrip(session) {
    const rs = session.routeState;
    if (!showStrip(rs)) {
      if (stripSig !== '') { stripSig = ''; routeStrip.hidden = true; routeStrip.replaceChildren(); }
      return;
    }
    const folded = open.has('route-folded');
    const sig = JSON.stringify([session.id, rs, folded]);
    if (sig === stripSig) return;
    stripSig = sig;
    const acts = stripActions(rs);
    const skipStep = stepToSkip(rs.steps);
    const fold = h(doc, 'button', { type: 'button', class: 'route-fold', 'aria-expanded': String(!folded), title: t('route.fold') },
      icon(doc, 'i-chevron-down', 'chev'),
      h(doc, 'span', { class: 'route-title', text: t('route.steps_title', { name: routeName(rs.route) }) }),
      h(doc, 'span', { class: 'route-count', text: counterText(rs.steps) }));
    fold.addEventListener('click', () => {
      if (open.has('route-folded')) open.delete('route-folded'); else open.add('route-folded');
      stripSig = '';
      renderRouteStrip(current.session);
    });
    const run = h(doc, 'button', { type: 'button', class: 'route-btn primary', text: t('route.run'), disabled: !acts.run });
    const skip = h(doc, 'button', { type: 'button', class: 'route-btn', text: t('route.skip'), disabled: !acts.skip });
    const stop = h(doc, 'button', { type: 'button', class: 'route-btn danger', text: t('route.stop'), disabled: !acts.stop });
    run.addEventListener('click', () => handlers.onRouteRun(session.id));
    skip.addEventListener('click', () => handlers.onRouteSkip(session.id, skipStep));
    stop.addEventListener('click', () => handlers.onRouteStop(session.id));
    const steps = h(doc, 'ol', { class: 'route-steps', hidden: folded }, ...rs.steps.map((x) => h(doc, 'li', {
      class: 'route-step', 'data-state': x.state, title: t(STEP_STATE_KEY[x.state]), 'aria-label': `${x.title}: ${t(STEP_STATE_KEY[x.state])}`,
    }, icon(doc, STEP_ICON[x.state]), h(doc, 'span', { text: x.title }))));
    routeStrip.replaceChildren(h(doc, 'div', { class: 'route-head' }, fold, h(doc, 'div', { class: 'route-actions' }, run, skip, stop)), steps);
    routeStrip.dataset.running = String(rs.running);
    routeStrip.hidden = false;
  }

  // Баннер «Задача разрослась»: над полем, рядом с полосой шагов; «Продолжить» запоминается до следующей подзадачи.
  const routeBanner = h(doc, 'section', { class: 'route-banner', hidden: true, role: 'status' });
  const bannerDismissed = new Map(); // «сессия:задача» -> число подзадач на момент «Продолжить»
  let bannerSig = '';
  function renderRouteBanner(session) {
    const rs = session.routeState;
    const task = rs && rs.task;
    const count = bannerCount(rs, task ? bannerDismissed.get(`${session.id}:${task.id}`) : undefined);
    const sig = JSON.stringify([session.id, count, task && task.id]);
    if (sig === bannerSig) return;
    bannerSig = sig;
    if (count === 0) { routeBanner.hidden = true; routeBanner.replaceChildren(); return; }
    const close = h(doc, 'button', { type: 'button', class: 'route-btn primary', text: t('route.banner_close') });
    const keep = h(doc, 'button', { type: 'button', class: 'route-btn', text: t('route.banner_keep') });
    close.addEventListener('click', () => handlers.onRouteNewTask(session.id));
    keep.addEventListener('click', () => {
      bannerDismissed.set(`${session.id}:${task.id}`, count);
      bannerSig = '';
      renderRouteBanner(session);
    });
    routeBanner.replaceChildren(
      h(doc, 'span', { class: 'route-banner-text', text: t('route.banner', { count: subtaskCountText(count) }) }),
      h(doc, 'div', { class: 'route-actions' }, close, keep));
    routeBanner.hidden = false;
  }

  // Карточки задачи над полем (задача 192p): «Закончить задачу», «Задача готова», пересечение подзадач.
  const routeCards = h(doc, 'div', { class: 'route-cards', hidden: true });
  const staleKept = new Set(); // «сессия:задача», у которых владелец нажал «Оставить» на устаревшей сессии
  const overlapSeen = new Map(); // «сессия:задача:N:M» -> когда выберется «Отдельное дерево» (мс страницы)
  let cardsSig = '';
  const numberOf = (task) => task.number || task.id;
  function renderTaskCards(session) {
    const task = session.routeState && session.routeState.task;
    const finish = finishPrompt(task);
    const ready = readyPrompt(task);
    const overlap = overlapPrompt(task);
    const diffKey = `route-diff:${session.id}`;
    const showDiff = open.has(diffKey);
    let deadline = 0;
    if (overlap) {
      const key = `${session.id}:${task.id}:${overlap.n}:${overlap.with}`;
      if (!overlapSeen.has(key)) overlapSeen.set(key, now() + overlap.seconds * 1000);
      deadline = overlapSeen.get(key);
    }
    const stale = stalePrompt(task) && !staleKept.has(`${session.id}:${task.id}`);
    const kids = (session.routeState && session.routeState.kids) || { unmerged: [], child: null };
    const held = kids.unmerged;
    const toParent = Boolean(kids.child) && kids.child.target === 'parent';
    // у дочерней задачи эпика с веткой кнопка закрытия — «Влить в ветку эпика K», подпись называет ветку; иначе «Слить в main» (push в origin/main)
    const epicNo = kids.child ? kids.child.parentNo : '';
    const epicBranch = kids.child ? kids.child.parentBranch : '';
    const sig = JSON.stringify([session.id, task && [task.id, task.number, task.branch, task.state, task.unmergedCommits, task.diff, task.tests, task.testsRunning, task.stale, task.idleDays], finish, ready, overlap, showDiff, deadline, stale, held, toParent, epicNo, epicBranch, wipStalePrompt(session.routeState) && !staleKept.has(`${session.id}:wip`) && session.routeState.where]);
    if (sig === cardsSig) return;
    cardsSig = sig;
    const cards = [];
    const button = (text, cls, run) => {
      const b = h(doc, 'button', { type: 'button', class: `route-btn ${cls}`.trim(), text });
      b.addEventListener('click', run);
      return b;
    };
    // тесты не блокируют слияние, но видны: у ветки задачи и у main, с кнопкой «Прогнать тесты»
    const testsBlock = () => {
      const when = now();
      return h(doc, 'div', { class: 'route-tests' },
        h(doc, 'p', { class: 'route-tests-line', 'data-state': task.tests.branch.state, text: branchTestsText(task.tests.branch, when) }),
        h(doc, 'p', { class: 'route-tests-line', 'data-state': task.tests.main.state, text: mainTestsText(task.tests.main, when) }),
        task.testsRunning ? h(doc, 'p', { class: 'route-tests-line muted', text: t('route.tests_running') }) : false,
        testsRunnable(task) ? button(t('route.tests_run'), '', () => handlers.onRouteTestsRun(session.id)) : false);
    };
    if (finish) {
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'finish' },
        h(doc, 'strong', { class: 'route-card-title', text: t('route.finish_title', { number: numberOf(task) }) }),
        testsBlock(),
        held.length > 0 && !toParent ? h(doc, 'span', { class: 'route-card-text', text: t('route.children_unmerged', { list: held.join(', ') }) }) : false,
        h(doc, 'div', { class: 'route-actions' },
          h(doc, 'span', { class: 'route-merge' },
            button(toParent ? t('route.finish_merge_parent', { n: epicNo }) : t('route.finish_merge'), 'primary', () => handlers.onRouteMerge(session.id)),
            h(doc, 'small', { class: 'route-merge-note', text: toParent ? t('route.finish_merge_parent_note', { branch: epicBranch }) : t('route.finish_merge_note') })),
          button(t('route.finish_fast'), '', () => handlers.onRouteFinish(session.id, 'fast')),
          button(t('route.finish_full'), '', () => handlers.onRouteFinish(session.id, 'full')))));
    }
    if (stale) {
      const work = task.unmergedCommits > 0;
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'stale' },
        h(doc, 'strong', { class: 'route-card-title', text: t('route.stale_title', { days: task.idleDays }) }),
        h(doc, 'span', { class: 'route-card-text', text: t('route.stale_ask', { number: numberOf(task) }) }),
        work ? h(doc, 'span', { class: 'route-card-text', text: t('route.stale_work', { commits: commitsText(task.unmergedCommits) }) }) : false,
        h(doc, 'div', { class: 'route-actions' },
          work ? button(t('route.stale_drop_work'), 'danger', () => handlers.onRouteTreeDrop(session.id, true)) : button(t('route.stale_drop'), 'danger', () => handlers.onRouteTreeDrop(session.id, false)),
          button(t('route.stale_keep'), '', () => { staleKept.add(`${session.id}:${task.id}`); cardsSig = ''; renderTaskCards(current.session); }))));
    }
    const wipRs = session.routeState;
    if (wipStalePrompt(wipRs) && !staleKept.has(`${session.id}:wip`)) {
      const w = wipRs.where;
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'stale' },
        h(doc, 'strong', { class: 'route-card-title', text: t('where.stale_title', { branch: w.branch, days: w.idleDays }) }),
        h(doc, 'span', { class: 'route-card-text', text: t('where.stale_ask') }),
        w.work ? h(doc, 'span', { class: 'route-card-text', text: t('route.stale_work', { commits: w.unmergedCommits > 0 ? commitsText(w.unmergedCommits) : t('session.delete_wip_dirty') }) }) : false,
        h(doc, 'div', { class: 'route-actions' },
          w.work ? button(t('route.stale_drop_work'), 'danger', () => handlers.onRouteTreeDrop(session.id, true)) : button(t('route.stale_drop'), 'danger', () => handlers.onRouteTreeDrop(session.id, false)),
          button(t('route.stale_keep'), '', () => { staleKept.add(`${session.id}:wip`); cardsSig = ''; renderTaskCards(current.session); }))));
    }
    if (ready) {
      const totals = diffTotals(task.diff);
      const summary = t('route.ready_summary', {
        branch: task.branch || '—', commits: commitsText(task.unmergedCommits), files: filesText(totals.files), added: totals.added, removed: totals.removed,
      });
      const files = task.diff.files.length === 0
        ? [h(doc, 'li', { class: 'muted', text: t('route.diff_none') })]
        : task.diff.files.map((f) => h(doc, 'li', { class: 'route-diff-row', title: f.path },
          h(doc, 'span', { class: 'route-diff-path', text: f.path }),
          h(doc, 'span', { class: 'counts' }, h(doc, 'span', { class: 'plus', text: `+${f.added}` }), h(doc, 'span', { class: 'minus', text: `−${f.removed}` }))));
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'ready' },
        h(doc, 'strong', { class: 'route-card-title', text: t('route.ready_title', { number: numberOf(task) }) }),
        h(doc, 'span', { class: 'route-card-text', text: summary }),
        testsBlock(),
        showDiff ? h(doc, 'ul', { class: 'route-diff' }, ...files) : false,
        held.length > 0 && !toParent ? h(doc, 'span', { class: 'route-card-text', text: t('route.children_unmerged', { list: held.join(', ') }) }) : false,
        h(doc, 'div', { class: 'route-actions' },
          h(doc, 'span', { class: 'route-merge' },
            button(toParent ? t('route.ready_publish_parent', { n: epicNo }) : t('route.ready_publish'), 'dark', () => handlers.onRouteMerge(session.id)),
            h(doc, 'small', { class: 'route-merge-note', text: toParent ? t('route.finish_merge_parent_note', { branch: epicBranch }) : t('route.finish_merge_note') })),
          button(showDiff ? t('route.ready_hide') : t('route.ready_show'), '', () => {
            if (open.has(diffKey)) open.delete(diffKey); else open.add(diffKey);
            cardsSig = '';
            renderTaskCards(current.session);
          }))));
    }
    if (overlap) {
      const timer = h(doc, 'span', { class: 'route-card-timer', 'data-until': deadline, text: t('route.overlap_timer', { seconds: Math.max(0, Math.ceil((deadline - now()) / 1000)) }) });
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'overlap' },
        h(doc, 'span', { class: 'route-card-text', text: t('route.overlap', { n: overlap.n, with: overlap.with, files: overlap.files.join(', ') }) }),
        timer,
        h(doc, 'div', { class: 'route-actions' },
          button(t('route.overlap_own'), 'primary', () => handlers.onRouteSubtaskChoose(session.id, overlap.n, 'own')),
          button(t('route.overlap_shared'), '', () => handlers.onRouteSubtaskChoose(session.id, overlap.n, 'shared')))));
    }
    routeCards.replaceChildren(...cards);
    routeCards.hidden = cards.length === 0;
  }

  const crewUi = createCrewTaskUi(doc, handlers, { agents: () => Object.keys((current.model && current.model.catalog) || {}).sort() });
  const routeOver = h(doc, 'div', { class: 'route-over' }, crewUi.el, routeCards, routeBanner, routeStrip);

  // форма вопросов агента (задача 192): элемент ленты сообщений, под сообщением владельца; прокручивается вместе с лентой
  const askCard = h(doc, 'div', { class: 'ask', role: 'dialog', hidden: true });
  const askWrap = h(doc, 'div', { class: 'ask-wrap', hidden: true }, askCard);
  log.append(askWrap);
  const composer = h(doc, 'div', { class: 'composer' },
    routeOver,
    box,
    voiceHint,
    queueButton,
    status,
    whereNote);

  // Кнопка «вниз»: круглая, по центру над полем; есть, только когда лента не в самом низу; точка — пришло новое, пока читали выше.
  const jumpButton = h(doc, 'button', { type: 'button', class: 'jump-btn', hidden: true, title: t('chat.to_bottom'), 'aria-label': t('chat.to_bottom') },
    icon(doc, 'i-arrow-down'), h(doc, 'span', { class: 'jump-dot', hidden: true, 'aria-hidden': 'true' }));
  const jumpDot = jumpButton.querySelector('.jump-dot');
  const jumpWrap = h(doc, 'div', { class: 'jump-wrap' }, jumpButton);
  let unseen = false; // пока лента не в самом низу, что-то появилось или дописалось
  const distanceFromBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight;
  function syncJump() {
    const away = distanceFromBottom() > NEAR_BOTTOM_PX;
    if (!away) unseen = false;
    jumpButton.hidden = !away;
    jumpDot.hidden = !(away && unseen);
    jumpButton.setAttribute('aria-label', unseen ? t('chat.to_bottom_new') : t('chat.to_bottom'));
    jumpButton.title = unseen ? t('chat.to_bottom_new') : t('chat.to_bottom');
  }
  log.addEventListener('scroll', syncJump);
  jumpButton.addEventListener('click', () => {
    if (typeof log.scrollTo === 'function') log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    else log.scrollTop = log.scrollHeight;
  });
  const chat = h(doc, 'section', { class: 'chat', hidden: true }, log, jumpWrap, composer);
  refs.main.replaceChildren(topbar, pick, chat);

  backButton.addEventListener('click', () => handlers.onBack());
  railButton.addEventListener('click', () => {
    const wide = Boolean(win && win.matchMedia && win.matchMedia(WIDE_QUERY).matches);
    railOpen = !(railOpen === null ? wide : railOpen);
    if (current.ui) refs.app.dataset.rail = railOpen ? 'open' : 'closed';
    railButton.setAttribute('aria-pressed', String(railOpen));
  });

  let currentTrace = null;
  const nodes = new Map(); // key элемента ленты -> { node, sig, item }

  let historyState = NO_HISTORY; // где мы в истории отправленных сообщений (↑ и ↓ в поле)
  let uploading = false; // картинки уходят на сервер: второй отправки пока нет
  function submit() {
    const text = input.value.trim();
    const images = attach.items();
    if (!currentTrace || uploading || (text.length === 0 && images.length === 0)) return;
    // пока вопрос агента ждёт ответа, обычное сообщение не уходит: форма просит ответить или пропустить
    if (current.session && current.session.pendingQuestion) { nudgeAsk(); return; }
    const trace = currentTrace;
    historyState = NO_HISTORY; // после отправки история с пустого поля: новое сообщение в её конце, ↑ показывает его первым
    // агент занят ходом: сообщение (и его картинки) встаёт в очередь страницы и уходит, когда ход закончится
    if (current.session && isBusy(current.session.state)) {
      if (handlers.onQueue(trace, text, images)) {
        input.value = '';
        attach.clear();
        drafts.delete(trace);
        attachDrafts.delete(trace);
        fitInput();
      }
      return;
    }
    if (images.length === 0) {
      const done = handlers.onSend(trace, text);
      if (done) {
        input.value = '';
        fitInput();
        drafts.delete(trace);
      }
      return;
    }
    uploading = true;
    fitInput();
    const finish = (ok) => {
      uploading = false;
      if (ok) {
        drafts.delete(trace);
        attachDrafts.delete(trace);
        if (currentTrace === trace) { input.value = ''; attach.clear(); }
      }
      fitInput();
    };
    Promise.resolve(handlers.onSend(trace, text, images)).then(finish, () => finish(false));
  }
  // «↵» нет совсем, пока нечего отправлять (пустое поле, нет картинок) и во время записи: правая группа не двигается, поле сжимается
  function syncSend(busy) {
    const can = canSend(input.value, attach.items(), uploading);
    // в записи место кнопки остаётся (visibility), чтобы поле не меняло ширину и текст не перетекал в нижнюю строку
    sendButton.hidden = !can && !recordingNow;
    sendButton.style.visibility = recordingNow ? 'hidden' : '';
    sendButton.disabled = !can || recordingNow;
  }
  // Авторазмер: высота по содержимому, не выше 5 строк (дальше — внутренняя прокрутка, см. max-height в app.css).
  function fitInput() {
    syncSend(!cancelButton.hidden);
    input.style.height = 'auto';
    if (input.scrollHeight > 0) input.style.height = `${input.scrollHeight}px`; // 0 — чат скрыт: оставить auto
  }
  sendButton.addEventListener('click', () => submit());
  input.addEventListener('keydown', (e) => {
    // в записи Enter останавливает её и вставляет текст, а не отправляет сообщение
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && dictation.active()) { e.preventDefault(); dictation.stop(); return; }
    if (keyAction(e)) { e.preventDefault(); submit(); return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.isComposing && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && current.session) {
      const texts = current.session.messages.filter((m) => m.role === 'user' && m.text.trim().length > 0).map((m) => m.text);
      const step = historyStep({ texts, state: historyState, value: input.value, caret: input.selectionStart, key: e.key });
      if (step.handled) {
        e.preventDefault();
        historyState = step.state;
        input.value = step.value;
        input.setSelectionRange(step.value.length, step.value.length);
        fitInput();
        if (currentTrace) drafts.set(currentTrace, input.value);
      }
    }
  });
  queueButton.addEventListener('click', () => { if (currentTrace) handlers.onUnqueue(currentTrace); });
  input.addEventListener('input', () => {
    // правка текста историю не сбрасывает: ↑ и ↓ ходят по ней и с изменённым текстом (history.js)
    fitInput();
    if (currentTrace) drafts.set(currentTrace, input.value);
  });
  cancelButton.addEventListener('click', () => { if (currentTrace) handlers.onCancel(currentTrace); });

  // ---- элементы ленты

  function spans(text) {
    return inlineSpans(text).map((s) => (s.code ? h(doc, 'code', { class: 'inline', text: s.text }) : doc.createTextNode(s.text)));
  }

  function proseNodes(text) {
    const out = [];
    for (const b of splitBlocks(text)) {
      if (b.type === 'code') {
        out.push(h(doc, 'pre', {}, h(doc, 'code', { text: b.text, 'data-lang': b.lang || undefined })));
        continue;
      }
      for (const p of paragraphs(b.text)) {
        if (p.type === 'p') out.push(h(doc, 'p', {}, ...spans(p.text)));
        else out.push(h(doc, p.type, {}, ...p.items.map((item) => h(doc, 'li', {}, ...spans(item)))));
      }
    }
    return out;
  }

  const summaryText = (sum) => [
    t('work.summary', { n: sum.count }),
    sum.failed > 0 ? t('work.failed', { n: sum.failed }) : '',
    sum.running > 0 ? t('work.running', { n: sum.running }) : '',
  ].filter(Boolean).join(' · ');

  function rowLabel(r) {
    if (r.type === 'tool') return t('work.tool', { kind: t(TOOL_LABEL[r.kind]), title: r.title });
    if (r.type === 'task') return t('work.task', { status: t(TASK_STATUS[r.status]), title: r.title });
    return t('work.perm', { action: r.action, decision: r.decision ? t(DECISION_KEY[r.decision]) : t('chat.perm_waiting') });
  }

  function rowIcon(r) {
    if (r.type === 'tool') return icon(doc, TOOL_ICON[r.kind]);
    if (r.type === 'task') return icon(doc, TASK_ICON[r.status]);
    return icon(doc, PERM_ICON[r.decision ?? 'wait']);
  }

  function rowStatus(r) {
    if (r.type === 'tool') return h(doc, 'span', { class: 'row-status', text: t(TOOL_STATUS[r.status]) });
    if (r.type === 'task') {
      return r.finishedAt === null
        ? h(doc, 'span', { class: 'row-status', 'data-since': r.started, text: durationText(now() - r.started) })
        : h(doc, 'span', { class: 'row-status', text: durationText(r.finishedAt - r.started) });
    }
    return false;
  }

  const rowState = (r) => r.status ?? r.decision ?? 'wait';

  function workRow(r) {
    const detail = r.type === 'task' ? '' : r.detail;
    return h(doc, 'div', { class: 'work-row', 'data-state': rowState(r) },
      rowIcon(r),
      h(doc, 'div', { class: 'row-main' },
        h(doc, 'div', { class: 'row-label', text: rowLabel(r) }),
        detail ? h(doc, 'div', { class: 'row-detail', text: detail }) : false),
      rowStatus(r));
  }

  function toggleOpen(key, button, body) {
    const next = !open.has(key);
    if (next) open.add(key); else open.delete(key);
    button.setAttribute('aria-expanded', String(next));
    if (body) body.hidden = !next;
  }

  function fillWork(entry, item) {
    const single = item.rows.length === 1 ? item.rows[0] : null;
    const isOpen = open.has(item.key);
    const label = single ? rowLabel(single) : summaryText(workSummary(item.rows));
    const toggle = h(doc, 'button', { type: 'button', class: 'disclosure', 'aria-expanded': String(isOpen), 'data-state': single ? rowState(single) : 'group' },
      single ? rowIcon(single) : icon(doc, 'i-bolt'),
      h(doc, 'span', { class: 'disc-text', text: label }),
      single ? rowStatus(single) : false,
      icon(doc, 'i-chevron-right', 'chev'));
    const body = h(doc, 'div', { class: 'work-body', hidden: !isOpen }, ...(single ? [single] : item.rows).map((r) => workRow(r)));
    if (single && !single.detail) {
      // у одиночной строки без подробностей раскрывать нечего: показываем то, что есть
      body.replaceChildren(h(doc, 'div', { class: 'work-row' }, h(doc, 'div', { class: 'row-main row-detail', text: t('work.no_detail') })));
    }
    toggle.addEventListener('click', () => toggleOpen(item.key, toggle, body));
    entry.node.replaceChildren(toggle, body);
  }

  function fillDiffs(entry, item) {
    const key = `more:${item.key}`;
    const all = open.has(key);
    const rows = all ? item.rows : item.rows.slice(0, FOLD_DIFFS);
    const list = h(doc, 'ul', { class: 'diff-list' }, ...rows.map((d) => {
      const fp = fileParts(d.path);
      return h(doc, 'li', { class: 'diff-row' },
        icon(doc, 'i-file'),
        h(doc, 'span', { class: 'file-name', text: fp.name }),
        fp.dir ? h(doc, 'span', { class: 'file-dir', text: fp.dir }) : h(doc, 'span', { class: 'file-dir' }),
        h(doc, 'span', { class: 'counts' },
          h(doc, 'span', { class: 'plus', text: `+${d.added}` }),
          h(doc, 'span', { class: 'minus', text: `−${d.removed}` })));
    }));
    const more = item.rows.length > FOLD_DIFFS
      ? h(doc, 'button', { type: 'button', class: 'link-btn', text: all ? t('diffs.hide') : t('diffs.show_all', { n: item.rows.length }) })
      : h(doc, 'span');
    more.addEventListener('click', () => {
      if (all) open.delete(key); else open.add(key);
      entry.sig = null;
      fillDiffs(entry, item);
    });
    entry.node.replaceChildren(
      h(doc, 'div', { class: 'card-title', text: t('diffs.title', { n: item.totals.files }) }),
      list,
      h(doc, 'div', { class: 'diff-foot' }, more, h(doc, 'span', { class: 'counts' },
        h(doc, 'span', { class: 'plus', text: `+${item.totals.added}` }),
        h(doc, 'span', { class: 'minus', text: `−${item.totals.removed}` }))),
    );
  }

  function fillItem(entry, item) {
    const { node } = entry;
    switch (item.type) {
      case 'user': {
        // картинки сообщения — миниатюры над текстом; клик открывает просмотрщик (стрелки листают картинки этого сообщения)
        const shown = item.images.map((image) => ({ src: imageSrc(image), name: image.name }));
        const thumbs = shown.length > 0
          ? h(doc, 'div', { class: 'thumbs' }, ...shown.map((image, at) => {
            const label = t('images.open', { name: image.name });
            const button = h(doc, 'button', { type: 'button', class: 'thumb', title: label, 'aria-label': label },
              h(doc, 'img', { class: 'thumb-img', src: image.src, alt: t('images.alt', { name: image.name }), loading: 'lazy' }));
            button.addEventListener('click', () => viewer.open(shown, at, button));
            return button;
          }))
          : false;
        node.replaceChildren(h(doc, 'span', { class: 'sr', text: t('chat.you') }),
          h(doc, 'div', { class: 'bubble' }, thumbs, ...(item.text.trim().length > 0 ? proseNodes(item.text) : [])),
          messageActions(item));
        break;
      }
      case 'queued': {
        // сообщение в очереди: приглушённый пузырь под текущим ходом, ряд иконок виден всегда
        node.dataset.queued = 'true';
        node.replaceChildren(h(doc, 'span', { class: 'sr', text: t('chat.you') }),
          h(doc, 'div', { class: 'bubble' },
            item.images.length > 0 ? h(doc, 'p', { class: 'queued-images', text: t('msg.images_n', { n: item.images.length }) }) : false,
            ...(item.text.trim().length > 0 ? proseNodes(item.text) : [])),
          messageActions(item));
        break;
      }
      case 'skipped':
        node.replaceChildren(h(doc, 'span', { text: t('chat.images_skipped', { agent: agentLabel(item.agent) }) }));
        break;
      case 'text':
        node.dataset.streaming = String(item.streaming);
        node.replaceChildren(h(doc, 'span', { class: 'sr', text: t('chat.agent') }), h(doc, 'div', { class: 'prose' }, ...proseNodes(item.text)));
        break;
      case 'work':
        fillWork(entry, item);
        break;
      case 'diffs':
        fillDiffs(entry, item);
        break;
      case 'usage': {
        const n = item.steps;
        const parts = [
          item.latest.new !== undefined ? t('usage.new', { n: groupThousands(item.latest.new) }) : '',
          item.latest.cached !== undefined ? t('usage.cached', { n: groupThousands(item.latest.cached) }) : '',
          item.latest.total !== undefined ? t('usage.total', { n: groupThousands(item.latest.total) }) : '',
        ].filter(Boolean);
        if (item.context) parts.push(t('usage.context', { used: groupThousands(item.context.used), size: groupThousands(item.context.size) }));
        const text = t('usage.line', { steps: t(USAGE_STEP_KEY[ruForm(n)], { n }), parts: parts.join(' · ') });
        if (!item.expandable) {
          node.replaceChildren(h(doc, 'span', { class: 'usage-line', text }));
          break;
        }
        const key = `usage:${item.key}`;
        const isOpen = open.has(key);
        const toggle = h(doc, 'button', { type: 'button', class: 'usage-toggle', 'aria-expanded': String(isOpen), title: t('usage.toggle') },
          h(doc, 'span', { class: 'usage-sign', 'aria-hidden': 'true', text: isOpen ? '\u2212' : '+' }), h(doc, 'span', { text: ` ${text}` }));
        toggle.addEventListener('click', () => {
          if (open.has(key)) open.delete(key); else open.add(key);
          entry.sig = null;
          fillItem(entry, item);
        });
        const table = isOpen
          ? h(doc, 'table', { class: 'usage-table' },
            h(doc, 'thead', {}, h(doc, 'tr', {}, ...['usage.col_step', 'usage.col_new', 'usage.col_cached', 'usage.col_total'].map((key) => h(doc, 'th', { text: t(key) })))),
            h(doc, 'tbody', {}, ...item.rows.map((r) => h(doc, 'tr', {},
              h(doc, 'td', { text: r.label }),
              h(doc, 'td', { text: r.new === undefined ? '' : groupThousands(r.new) }),
              h(doc, 'td', { text: r.cached === undefined ? '' : groupThousands(r.cached) }),
              h(doc, 'td', { text: r.total === undefined ? '' : groupThousands(r.total) })))))
          : false;
        node.replaceChildren(...(table ? [toggle, table] : [toggle]));
        break;
      }
      case 'dropped':
        node.replaceChildren(h(doc, 'span', {
          text: t({ mode: 'chat.dropped_mode', model: 'chat.dropped_model', effort: 'chat.dropped_effort' }[item.setting] ?? 'chat.dropped_mode', { value: item.value, used: item.used }),
        }));
        break;
      case 'switch': {
        const text = t('chat.switched', { agent: agentLabel(item.to) });
        node.replaceChildren(h(doc, 'span', { text: item.cut ? `${text} ${t('chat.switched_cut', { shown: item.shown, total: item.total })}` : text }));
        break;
      }
      case 'answer': {
        const lines = item.skipped
          ? [t('ask.skipped', { question: item.lines.length > 0 ? item.lines[0].question : '' })]
          : item.lines.map((l) => t('ask.answer', { question: l.question, choice: l.choice }));
        node.replaceChildren(...lines.map((text) => h(doc, 'div', { text })));
        break;
      }
      case 'autoext': {
        const label = t(item.undone ? 'route.ext_undone' : 'route.ext_line', { task: item.task, title: item.title, text: item.text });
        const undo = item.undone ? false : h(doc, 'button', { type: 'button', class: 'link-btn', text: t('route.ext_undo') });
        if (undo) undo.addEventListener('click', () => { if (currentTrace) handlers.onExtUndo(currentTrace, item.id); });
        node.replaceChildren(h(doc, 'span', { text: label }), ...(undo ? [undo] : []));
        break;
      }
      case 'routenote':
        node.replaceChildren(h(doc, 'span', { text: t(NOTE_KEY[item.action], { n: item.n }) }));
        break;
      case 'note': {
        let text = t('chat.cancelled');
        if (item.tone === 'refused') text = item.reason ? t('chat.refused', { reason: item.reason }) : t('chat.refused_plain');
        if (item.tone === 'error') text = item.reason ? t('chat.error', { message: item.reason }) : t('chat.error_plain');
        node.dataset.tone = item.tone;
        node.replaceChildren(h(doc, 'span', { text }));
        break;
      }
      case 'needs': {
        node.dataset.needs = 'true';
        node.replaceChildren(askBadge(t('attn.need_reply')));
        break;
      }
      case 'actions': {
        const copy = h(doc, 'button', { type: 'button', class: 'icon-btn small', 'aria-label': t('chat.copy'), title: t('chat.copy') }, icon(doc, 'i-copy'));
        copy.addEventListener('click', () => handlers.onCopy(item.text));
        node.dataset.row = 'hover';
        node.replaceChildren(copy, h(doc, 'span', { class: 'ago', 'data-ago': item.at, text: agoText(item.at) }));
        break;
      }
      default: {
        const dots = h(doc, 'span', { class: 'dots', 'aria-hidden': 'true' }, h(doc, 'i'), h(doc, 'i'), h(doc, 'i'));
        node.replaceChildren(dots, h(doc, 'span', { text: t('chat.running') }),
          item.since > 0 ? h(doc, 'span', { class: 'elapsed', 'data-since': item.since, text: durationText(now() - item.since) }) : false,
          h(doc, 'span', { class: 'silent-note', hidden: true, 'data-last': item.last || 0 },
            h(doc, 'span', { class: 'silent-text' }),
            (() => { const b = h(doc, 'button', { type: 'button', class: 'link-btn silent-cancel', text: t('attn.interrupt') }); b.addEventListener('click', () => { if (currentTrace) handlers.onCancel(currentTrace); }); return b; })()));
      }
    }
  }

  // Ряд под ответом агента показывается при наведении на любую часть этого ответа (и по касанию): items одного хода несут data-turn
  let hotTurn = '';
  function setHot(turn) {
    if (turn === hotTurn) return;
    hotTurn = turn;
    for (const row of thread.querySelectorAll('[data-row="hover"]')) {
      if (turn && row.dataset.turn === turn) row.dataset.hot = 'on'; else delete row.dataset.hot;
    }
  }
  thread.addEventListener('mouseover', (e) => { const item = e.target.closest ? e.target.closest('[data-turn]') : null; setHot(item ? item.dataset.turn : ''); });
  thread.addEventListener('mouseleave', () => setHot(''));
  // Ряд иконок под сообщением владельца раскрывается по касанию пузыря только пальцем: клик мышью (и по самим кнопкам ряда) его не «залипает».
  function clearTaps(except) {
    for (const n of thread.querySelectorAll('[data-tap="on"]')) if (n !== except) delete n.dataset.tap;
  }
  thread.addEventListener('click', (e) => {
    const item = e.target.closest ? e.target.closest('.item-user, .item-text') : null;
    if (!item) { clearTaps(null); return; }
    const touch = e.pointerType === 'touch';
    if (item.classList.contains('item-user')) {
      if (!touch || (e.target.closest && e.target.closest('button'))) return;
      clearTaps(item);
      item.dataset.tap = item.dataset.tap === 'on' ? '' : 'on';
    } else setHot(hotTurn === item.dataset.turn ? '' : item.dataset.turn);
  });
  thread.addEventListener('mouseleave', () => clearTaps(null));

  // ---- сообщения владельца: ряд мелких иконок под пузырём (при наведении; в очереди — всегда)
  function timeText(at) {
    if (!at) return '';
    const m = messageTime(at, now());
    if (m.kind === 'now') return t('msg.time_now');
    if (m.kind === 'today') return m.clock;
    if (m.kind === 'yesterday') return t('msg.time_yesterday', { clock: m.clock });
    return t('msg.time_older', { date: m.date, clock: m.clock });
  }
  function iconButton(doc2, id, label, onClick) {
    const b = h(doc2, 'button', { type: 'button', class: 'msg-btn', title: label, 'aria-label': label }, icon(doc2, id));
    b.addEventListener('click', onClick);
    return b;
  }
  /** Текст сообщения в поле ввода: перед тем, что уже набрано (через пустую строку); фокус в поле, курсор после вставленного, ничего не уходит. */
  function putInField(text, images = []) {
    const keep = input.value;
    input.value = keep.trim() === '' ? text : `${text}\n\n${keep}`;
    if (images.length > 0) attach.restore([...attach.items(), ...images]);
    fitInput();
    if (currentTrace) drafts.set(currentTrace, input.value);
    input.focus();
    input.setSelectionRange(text.length, text.length);
  }
  function messageActions(item) {
    const queued = item.type === 'queued';
    const row = h(doc, 'div', { class: 'msg-actions', 'data-queued': queued ? 'true' : undefined });
    if (queued) {
      row.append(h(doc, 'span', { class: 'msg-state', text: t('msg.queued') }));
    } else {
      row.append(h(doc, 'span', { class: 'msg-check', title: t('msg.delivered'), 'aria-label': t('msg.delivered') }, icon(doc, 'i-check2')),
        h(doc, 'span', { class: 'msg-time', 'data-at': item.at || undefined, text: timeText(item.at) }));
    }
    row.append(iconButton(doc, 'i-copy', t('msg.copy'), () => handlers.onCopy(item.text)),
      iconButton(doc, 'i-undo', t('msg.restore'), () => putInField(item.text)));
    if (queued) {
      row.append(iconButton(doc, 'i-x', t('msg.unqueue'), () => {
        const back = handlers.onUnqueueAt(currentTrace, item.index);
        if (back) putInField(back.text, back.images ?? []);
      }));
      const now2 = h(doc, 'button', { type: 'button', class: 'msg-now', text: t('msg.send_now') });
      now2.addEventListener('click', () => handlers.onSendNow(currentTrace, item.index));
      row.append(now2);
    }
    return row;
  }

  function makeEntry(item) {
    const cls = { diffs: 'item card diffs', work: 'item item-work' }[item.type] ?? `item item-${item.type}`;
    return { node: h(doc, 'div', { class: cls, 'data-key': item.key, 'data-turn': item.turn || undefined }), sig: null, item };
  }

  // Напоминание при открытии сессии: в задаче есть не влитые коммиты (один раз за сессию страницы).
  const reminded = new Set();
  function remindUnmerged(session) {
    const task = session.routeState && session.routeState.task;
    const label = mergeLabel(task);
    if (!label || label.kind !== 'unmerged' || reminded.has(session.id)) return;
    reminded.add(session.id);
    if (handlers.onNotice) handlers.onNotice(t('route.remind_unmerged', { number: numberOf(task), commits: commitsText(task.unmergedCommits) }));
  }

  function renderChat(model, ui) {
    const session = ui.selected ? model.sessions[ui.selected] : undefined;
    pick.hidden = Boolean(session);
    chat.hidden = !session;
    titleBlock.hidden = !session;
    if (!session) { currentTrace = null; return; }

    if (currentTrace !== session.id) {
      if (currentTrace) {
        drafts.set(currentTrace, input.value);
        attachDrafts.set(currentTrace, attach.take());
      }
      currentTrace = session.id;
      historyState = NO_HISTORY;
      nodes.clear();
      thread.replaceChildren();
      input.value = drafts.get(session.id) ?? '';
      attach.restore(attachDrafts.get(session.id));
      fitInput();
      finishRename(false);
      closeMenu();
      remindUnmerged(session);
    }
    title.hidden = Boolean(session.draft);
    headMenu.hidden = Boolean(session.draft);
    headCtx = session.draft ? null : { session, pinned: effectivePins(sessionList(model).filter((x) => !x.draft), ui.pins).has(session.id), unread: Boolean(ui.unread && ui.unread[session.id] === true) };
    syncHeadMenu();
    if (!renaming) titleText.textContent = session.name;
    const parentSession = session.parent ? model.sessions[session.parent] : undefined;
    crumb.hidden = !parentSession;
    crumbSep.hidden = !parentSession;
    crumb.textContent = parentSession ? parentSession.name : '';
    crumb.dataset.parent = parentSession ? parentSession.id : '';
    crumb.title = parentSession ? t('chat.parent_crumb', { name: parentSession.name }) : '';
    const taskInfo = sessionTask(session);
    taskNo.hidden = !taskInfo;
    taskNo.textContent = taskInfo ? taskInfo.number : '';
    taskNo.title = taskInfo ? (taskInfo.title ? t('route.task_no_title', { number: taskInfo.number, title: taskInfo.title }) : t('route.task_head_bare', { number: taskInfo.number })) : '';
    // Что показать про семью, модель, режим и усилие: данные показанной семьи (собственная сводка сессии, иначе каталог семьи)
    const shown = shownOf(model, session);
    const busy = isBusy(session.state);
    const queued = handlers.queued(session.id);
    queueButton.hidden = queued === 0;
    if (queued > 0) queueButton.textContent = t('composer.queued', { n: queued });
    cancelButton.hidden = !busy;
    syncSend(busy);
    options = shown.options;
    currentAgent = shown.agent;
    currentRoute = session.route || INTERACTIVE_STATE.route;
    routeButton.hidden = false;
    routeButton.replaceChildren(h(doc, 'span', { text: routeName(currentRoute) }));
    // проект и Worktree: у черновика — выбор; у открытой сессии без дерева — переключатель на следующую задачу
    const task = session.routeState && session.routeState.task;
    const hasTree = Boolean((task && task.worktree) || (session.routeState && session.routeState.where && session.routeState.where.kind === 'wip'));
    const resultRepo = session.routeState ? session.routeState.resultRepo : '';
    const resultLabel = session.routeState ? session.routeState.resultLabel : '';
    resultRepoSelect.hidden = Boolean(session.draft);
    resultRepoSelect.disabled = Boolean(task) || hasTree || busy || Boolean(session.routeState && session.routeState.where && session.routeState.where.kind === 'preparing');
    fillResultRepos(resultRepo || '', resultLabel);
    const treeOn = session.draft ? session.worktree !== false : (session.routeState ? session.routeState.useTree !== false : true);
    worktreeButton.hidden = false;
    worktreeButton.dataset.draft = String(Boolean(session.draft));
    worktreeButton.setAttribute('aria-pressed', String(treeOn || hasTree));
    // задача 192.6: папка проекта не git-репозиторий — дерево сделать нельзя, переключатель выключен и недоступен
    const draftFolder0 = session.draft ? draftFolderInfo(session) : null;
    const noRepo = Boolean(draftFolder0) && draftFolder0.repo === false;
    worktreeButton.setAttribute('aria-pressed', String((treeOn && !noRepo) || hasTree));
    worktreeButton.disabled = hasTree || noRepo;
    worktreeButton.title = noRepo ? t('route.worktree_not_repo') : hasTree ? t('route.worktree_locked') : (treeOn ? t('route.worktree_on') : t('route.worktree_off'));
    routeButton.title = `${t('route.label')}: ${routeDescription(currentRoute)}`;
    // набор: показываем, когда сервер отдал больше одного
    const presetInfo = presets();
    const presetList = presetInfo && Array.isArray(presetInfo.presets) ? presetInfo.presets : [];
    presetSelect.hidden = presetList.length < 2;
    if (presetList.length >= 2) {
      const chosen = session.preset || (presetInfo.active || 'default');
      const sig = `${presetList.map((p) => p.name).join('|')}`;
      if (presetSelect.dataset.sig !== sig) {
        presetSelect.replaceChildren(...presetList.map((p) => h(doc, 'option', { value: p.name, text: p.name === 'default' ? t('preset.default_name') : p.name, title: p.description || '' })));
        presetSelect.dataset.sig = sig;
      }
      presetSelect.value = chosen;
      presetSelect.dataset.draft = String(Boolean(session.draft));
    }
    const where = session.draft ? (noRepo ? t('where.draft_folder') : (treeOn ? whereText(session) : t('where.draft_off'))) : whereText(session);
    whereNote.hidden = !where;
    const accounting = session.folder || (projectById(session.projectId) || {}).name || 'проект сессии';
    const resultWhere = resultRepo ? `Учёт: ${accounting} → результат: ${resultLabel || resultRepo}` : '';
    whereNote.hidden = !where && !resultWhere;
    whereNote.textContent = [where, resultWhere].filter(Boolean).join(' · ');
    whereNote.title = whereNote.textContent;
    familyButton.hidden = agents.length < 2;
    familyButton.replaceChildren(h(doc, 'span', { text: agentLabel(shown.agent) }));
    const hasModes = Boolean(options && options.modes.length > 0);
    const hasModels = Boolean(options && options.models.length > 0);
    const hasEfforts = Boolean(options && options.efforts.length > 0);
    modeButton.hidden = !hasModes;
    const modeLabel = hasModes ? labelFor('mode', options.modes, options.mode) : { name: '', title: '' };
    modeButton.title = modeLabel.title ? `${t('menu.mode')}: ${modeLabel.title}` : t('menu.mode');
    modeButton.replaceChildren(h(doc, 'span', { text: hasModes ? (modeLabel.name || t('menu.mode')) : '' }));
    modelButton.hidden = !hasModels;
    modelButton.replaceChildren(h(doc, 'span', { text: hasModels ? (shown.model || nameOf(options.models, options.modelId) || t('session.model_unknown')) : '' }));
    effortButton.hidden = !hasEfforts;
    const effortLabel = hasEfforts ? labelFor('effort', effortChoices(options.efforts), options.effort) : { name: '', title: '' };
    effortButton.title = effortLabel.title ? `${t('menu.effort')}: ${effortLabel.title}` : t('menu.effort');
    effortButton.replaceChildren(h(doc, 'span', { text: effortLabel.name }));
    statusModel.hidden = hasModels;
    statusModel.textContent = shown.model || (shown.loading ? t('session.loading') : '');
    spinner.hidden = !busy;
    status.dataset.empty = String(routeButton.hidden && worktreeButton.hidden && familyButton.hidden && !statusModel.textContent && !busy && !hasModes && !hasModels && !hasEfforts && !session.usage);
    if (menuKind === 'agent') renderMenu();
    else if (menuKind === 'route') {
      if (menuSig !== currentRoute) renderMenu();
      menuSig = currentRoute;
    } else if (menuKind && ((menuKind === 'mode' && !hasModes) || (menuKind === 'effort' && !hasEfforts) || ((menuKind === 'model' || menuKind === 'more') && !hasModels))) closeMenu();
    else if (menuKind) {
      const sig = JSON.stringify(options);
      if (sig !== menuSig) renderMenu();
      menuSig = sig;
    }

    const pct = usagePercent(session.usage);
    ring.style.setProperty('--ring', String(pct));
    ring.dataset.level = usageLevel(pct);
    ring.setAttribute('aria-label', t('composer.ring', { n: pct }));
    ringBox.hidden = !session.usage;
    renderRouteStrip(session);
    renderRouteBanner(session);
    renderTaskCards(session);
    crewUi.render(session);

    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight <= NEAR_BOTTOM_PX;
    const items = timeline(session);
    // сообщения в очереди — под текущим ходом, в порядке постановки
    handlers.queuedItems(session.id).forEach((q, index) => {
      items.push({ type: 'queued', key: `queued:${index}:${q.text.length}:${q.text.slice(0, 24)}`, text: q.text, images: q.images ?? [], index });
    });
    if (items.length === 0) {
      if (session.draft) {
        syncProjectPicker(session);
        if (!projectPicker.parentNode) thread.replaceChildren(projectPicker);
      } else if (!emptyChat.parentNode) thread.replaceChildren(emptyChat);
    } else {
      if (emptyChat.parentNode) emptyChat.remove();
      if (projectPicker.parentNode) projectPicker.remove();
    }
    let created = 0;
    let changed = false;
    const alive = new Set();
    items.forEach((item, i) => {
      let entry = nodes.get(item.key);
      if (!entry) { entry = makeEntry(item); nodes.set(item.key, entry); created += 1; }
      alive.add(item.key);
      entry.item = item;
      const sig = JSON.stringify(item);
      if (sig !== entry.sig) { entry.sig = sig; fillItem(entry, item); changed = true; }
      if (thread.children[i] !== entry.node) thread.insertBefore(entry.node, thread.children[i] ?? null);
    });
    for (const [key, entry] of nodes) if (!alive.has(key)) { entry.node.remove(); nodes.delete(key); }
    if (nearBottom || created === items.length) log.scrollTop = log.scrollHeight;
    else if (changed || created > 0) unseen = true;
    syncJump();
  }

  // ---------------------------------------------------------------- правая колонка

  function card(titleText, ...children) {
    return h(doc, 'section', { class: 'card' }, h(doc, 'h3', { class: 'card-title', text: titleText }), ...children);
  }

  function fileRow(path, iconId) {
    const fp = fileParts(path);
    return h(doc, 'li', { class: 'file-row', title: path },
      icon(doc, iconId),
      h(doc, 'span', { class: 'file-name', text: fp.name }),
      h(doc, 'span', { class: 'file-dir', text: fp.dir }));
  }

  function foldButton(key, total, fold) {
    if (total <= fold) return false;
    const showAll = open.has(key);
    const button = h(doc, 'button', { type: 'button', class: 'link-btn', text: showAll ? t('rail.show_less') : t('rail.show_more', { n: total - fold }) });
    button.addEventListener('click', () => {
      if (showAll) open.delete(key); else open.add(key);
      railSig = '';
      renderRail(current.session);
    });
    return button;
  }

  function envCard(s) {
    const row = (iconId, labelKey, value) => h(doc, 'div', { class: 'env-row' },
      icon(doc, iconId),
      h(doc, 'dt', { text: t(labelKey) }),
      h(doc, 'dd', { text: value || t('rail.none'), class: value ? '' : 'muted' }));
    return card(t('rail.env'), h(doc, 'dl', { class: 'env' },
      row('i-folder', 'rail.project', s.project),
      row('i-folder', 'rail.folder', s.folder),
      row('i-branch', 'rail.branch', s.branch),
      row('i-terminal', 'rail.agent', agentLabel(s.agent))));
  }

  function meterNode(pct) {
    const meter = h(doc, 'span', { class: 'meter', 'data-level': usageLevel(pct), 'aria-hidden': 'true' }, h(doc, 'span', { class: 'meter-fill' }));
    meter.style.setProperty('--fill', `${pct}%`);
    return meter;
  }

  function contextCard(s) {
    const closed = open.has('ctx-closed');
    const pct = usagePercent(s.usage);
    const head = h(doc, 'button', { type: 'button', class: 'card-head', 'aria-expanded': String(!closed) },
      icon(doc, 'i-chevron-down', 'chev'),
      h(doc, 'span', { class: 'card-title', text: t('rail.context') }),
      h(doc, 'span', { class: 'grow' }),
      s.usage ? h(doc, 'span', { class: 'pct', 'data-level': usageLevel(pct), text: `${pct} %` }) : false,
      s.usage ? meterNode(pct) : false);
    const lines = [];
    if (s.usage) {
      lines.push(h(doc, 'p', { text: t('rail.ctx_detail', { used: tokensText(s.usage.used), size: tokensText(s.usage.size) }) }));
      if (s.usage.cost) {
        const cost = `${s.usage.cost.amount.toFixed(2)} ${s.usage.cost.currency}`.trim();
        lines.push(h(doc, 'p', { text: t('rail.ctx_cost', { cost }) }));
      }
    } else {
      lines.push(h(doc, 'p', { class: 'muted', text: t('rail.ctx_unknown') }));
    }
    const body = h(doc, 'div', { class: 'card-body', hidden: closed }, ...lines);
    head.addEventListener('click', () => {
      toggleOpen('ctx-closed', head, null);
      const nowClosed = open.has('ctx-closed');
      head.setAttribute('aria-expanded', String(!nowClosed));
      body.hidden = nowClosed;
    });
    return h(doc, 'section', { class: 'card card-context' }, head, body);
  }

  function outputsCard(s) {
    const key = 'more:outputs';
    const rows = open.has(key) ? s.outputs : s.outputs.slice(0, FOLD_OUTPUTS);
    return card(t('rail.outputs'),
      s.outputs.length === 0
        ? h(doc, 'p', { class: 'muted', text: t('rail.outputs_empty') })
        : h(doc, 'ul', { class: 'file-list' }, ...rows.map((o) => fileRow(o.path, FILE_ICON[o.kind]))),
      foldButton(key, s.outputs.length, FOLD_OUTPUTS));
  }

  function tasksCard(s) {
    const key = 'more:tasks';
    const sum = taskSummary(s.tasks);
    const ordered = [...s.tasks].sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1));
    const rows = open.has(key) ? ordered : ordered.slice(0, FOLD_TASKS);
    const list = h(doc, 'ul', { class: 'task-list' }, ...rows.map((x) => h(doc, 'li', { class: 'task-row', 'data-state': x.status, title: x.title },
      icon(doc, TASK_ICON[x.status]),
      h(doc, 'span', { class: 'task-title', text: x.title }),
      x.finishedAt === null
        ? h(doc, 'span', { class: 'task-time', 'data-since': x.started, text: durationText(now() - x.started) })
        : h(doc, 'span', { class: 'task-time', text: durationText(x.finishedAt - x.started) }))));
    return card(t('rail.tasks'),
      s.tasks.length === 0 ? h(doc, 'p', { class: 'muted', text: t('rail.tasks_empty') }) : list,
      foldButton(key, s.tasks.length, FOLD_TASKS),
      sum.finished > 0 ? h(doc, 'p', { class: 'finished', text: t('rail.tasks_finished', { n: sum.finished }) }) : false);
  }

  // Задача режима (задача 192p): заголовок с номером и веткой, подзадачи с прогрессом done/total; клик раскрывает чекбоксы (только чтение),
  // меню «⋯» отдаёт серверу сигналы по подзадаче.
  let subMenu = null; // ключ подзадачи с открытым меню «⋯»
  const subKey = (task, sub) => `sub:${task.id}:${sub.n}`;
  function subtaskMenu(sessionId, sub) {
    const acts = subtaskActions(sub);
    const row = (text, run) => {
      const b = h(doc, 'button', { type: 'button', class: 'menu-item', role: 'menuitem' }, h(doc, 'span', { class: 'menu-label', text }));
      b.addEventListener('click', () => { subMenu = null; run(); railSig = ''; renderRail(current.session); });
      return b;
    };
    return h(doc, 'div', { class: 'rsub-menu', role: 'menu' },
      acts.same ? row(t('route.sub_act_same'), () => handlers.onRouteSubtaskSame(sessionId)) : false,
      acts.fresh ? row(t('route.sub_act_new'), () => handlers.onRouteSubtaskNew(sessionId)) : false,
      acts.worktree ? row(t('route.sub_act_worktree'), () => handlers.onRouteSubtaskWorktree(sessionId, sub.n)) : false,
      acts.done ? row(t('route.sub_act_done'), () => handlers.onRouteSubtaskDone(sessionId, sub.n)) : false);
  }
  function subtaskRow(s, task, sub) {
    const key = subKey(task, sub);
    const isOpen = open.has(key);
    const pct = subtaskPercent(sub);
    const meter = h(doc, 'span', { class: 'meter route-meter', 'data-level': sub.state === 'done' ? 'done' : 'part', 'aria-hidden': 'true' }, h(doc, 'span', { class: 'meter-fill' }));
    meter.style.setProperty('--fill', `${pct}%`);
    const toggle = h(doc, 'button', { type: 'button', class: 'rsub-head', 'aria-expanded': String(isOpen), title: t(SUBTASK_STATE_KEY[sub.state]) },
      icon(doc, 'i-chevron-right', 'chev'),
      h(doc, 'span', { class: 'rsub-title', text: t('route.sub_title', { n: sub.n, title: sub.title }) }),
      sub.merged ? h(doc, 'span', { class: 'rsub-merged', text: t('route.sub_merged') }) : false,
      sub.merging ? h(doc, 'span', { class: 'rsub-merging', text: t('route.sub_merging') }) : false,
      h(doc, 'span', { class: 'rsub-count', text: subWaitsText(sub) || subtaskProgressText(sub) }));
    const items = sub.items.length === 0
      ? [h(doc, 'li', { class: 'rsub-item muted', text: t('route.sub_items_empty') })]
      : sub.items.map((x) => h(doc, 'li', { class: 'rsub-item', 'data-done': String(x.done) },
        h(doc, 'span', { class: 'rsub-box', 'aria-hidden': 'true' }, x.done ? icon(doc, 'i-check') : false),
        h(doc, 'span', { text: x.text })));
    const body = h(doc, 'ul', { class: 'rsub-items', hidden: !isOpen }, ...items);
    toggle.addEventListener('click', () => {
      const next = !open.has(key);
      if (next) open.add(key); else open.delete(key);
      toggle.setAttribute('aria-expanded', String(next));
      body.hidden = !next;
      railSig = '';
    });
    const more = hasSubtaskActions(sub)
      ? h(doc, 'button', { type: 'button', class: 'rsub-more', text: '⋯', title: t('route.sub_more'), 'aria-label': t('route.sub_more'), 'aria-haspopup': 'menu', 'aria-expanded': String(subMenu === key) })
      : false;
    if (more) {
      more.addEventListener('click', () => { subMenu = subMenu === key ? null : key; railSig = ''; renderRail(current.session); });
    }
    const where = [sub.branch ? t('route.sub_branch', { branch: sub.branch }) : '', sub.worktree ? t('route.sub_tree', { worktree: sub.worktree }) : ''].filter(Boolean).join(' · ');
    return h(doc, 'li', { class: 'rsub', 'data-state': sub.state, 'data-merged': String(sub.merged) },
      h(doc, 'div', { class: 'rsub-row' }, toggle, more),
      where || sub.worktree ? h(doc, 'div', { class: 'rsub-where' }, sub.worktree ? h(doc, 'span', { class: 'rsub-own', text: t('route.sub_own_tree') }) : false, where) : false,
      sub.needsOwner ? h(doc, 'div', { class: 'rsub-owner', role: 'alert', text: sub.ownerText || t('route.sub_owner') }) : false,
      meter, body,
      more && subMenu === key ? subtaskMenu(s.id, sub) : false);
  }

  function panelTestsButton(s) {
    const b = h(doc, 'button', { type: 'button', class: 'link-btn', text: t('route.tests_run') });
    b.addEventListener('click', () => handlers.onRouteTestsRun(s.id));
    return b;
  }

  function subtasksCard(s) {
    const task = s.routeState && s.routeState.task;
    if (!task) return false;
    const withSubs = showSubtasks(s.routeState);
    const list = h(doc, 'ul', { class: 'rsub-list' }, ...task.subtasks.map((sub) => subtaskRow(s, task, sub)));
    const newTask = h(doc, 'button', { type: 'button', class: 'link-btn', text: t('route.new_task') });
    newTask.addEventListener('click', () => handlers.onRouteNewTask(s.id));
    const label = mergeLabel(task);
    return card(taskHeading(task),
      label ? h(doc, 'p', { class: 'rsub-label', 'data-kind': label.kind, text: label.text }) : false,
      task.branch ? h(doc, 'p', { class: 'rsub-task', text: t('route.task_branch', { branch: task.branch }) }) : false,
      task.worktree ? h(doc, 'p', { class: 'rsub-task', text: t('route.task_tree', { worktree: task.worktree }) }) : false,
      task.worktree ? h(doc, 'p', { class: 'rsub-tests', 'data-state': task.tests.branch.state, text: branchTestsText(task.tests.branch, now()) }) : false,
      task.worktree ? h(doc, 'p', { class: 'rsub-tests', 'data-state': task.tests.main.state, text: mainTestsText(task.tests.main, now()) }) : false,
      task.worktree && testsRunnable(task) ? panelTestsButton(s) : false,
      task.worktree && task.testsRunning ? h(doc, 'p', { class: 'rsub-tests muted', text: t('route.tests_running') }) : false,
      task.stale ? h(doc, 'p', { class: 'rsub-label', 'data-kind': 'unmerged', text: t('route.stale_title', { days: task.idleDays }) }) : false,
      withSubs && task.subtasks.length === 0 ? h(doc, 'p', { class: 'muted', text: t('route.sub_none') }) : false,
      withSubs && task.subtasks.length > 0 ? list : false,
      newTask);
  }

  // Вкладки правой колонки (задача 192.1): «Сведения» и «Машины» в той же колонке; выбор помнится в localStorage (без него — «Сведения»).
  const RAIL_TAB_KEY = 'crew-rail-tab';
  let railTab = 'info';
  try { if (win && win.localStorage) { const saved = win.localStorage.getItem(RAIL_TAB_KEY); if (saved === 'machines' || saved === 'request') railTab = saved; } } catch (e) { railTab = 'info'; }
  const machinesPanel = createMachinesPanel(doc, {
    now,
    durationText,
    onCopy: (text) => handlers.onCopy(text),
    onGet: (id) => { if (handlers.onMachineGet) handlers.onMachineGet(id); },
    rerender: () => { railSig = ''; renderRail(current.session); },
  });
  const requestPanel = createRequestPanel(doc, {
    onCopy: (text) => handlers.onCopy(text),
    onGet: (id, turn) => { if (handlers.onRequestGet) handlers.onRequestGet(id, turn); },
    fetchTrace: (id, from, to) => win.fetch(`/api/session-trace/${encodeURIComponent(id)}?from=${from}&to=${to}`, { cache: 'no-store' }).then((r) => r.json()),
    rerender: () => { railSig = ''; renderRail(current.session); },
  });
  const railTabInfo = h(doc, 'button', { type: 'button', class: 'rail-tab', role: 'tab', 'data-tab': 'info', text: t('rail.tab_info') });
  const railTabMachines = h(doc, 'button', { type: 'button', class: 'rail-tab', role: 'tab', 'data-tab': 'machines', text: t('rail.tab_machines') });
  const railTabRequest = h(doc, 'button', { type: 'button', class: 'rail-tab', role: 'tab', 'data-tab': 'request', text: t('rail.tab_request') });
  const railTabs = h(doc, 'div', { class: 'rail-tabs', role: 'tablist', 'aria-label': t('rail.tabs') }, railTabInfo, railTabMachines, railTabRequest);
  function pickRailTab(tab) {
    if (railTab === tab) return;
    railTab = tab;
    try { if (win && win.localStorage) win.localStorage.setItem(RAIL_TAB_KEY, tab); } catch (e) { /* выбор вкладки не сохранится */ }
    if (tab === 'machines' && current.session && handlers.onMachineGet) handlers.onMachineGet(current.session.id);
    if (tab === 'request' && current.session && current.session.requests.length === 0 && handlers.onRequestGet) handlers.onRequestGet(current.session.id, 0);
    railSig = '';
    renderRail(current.session);
  }
  railTabInfo.addEventListener('click', () => pickRailTab('info'));
  railTabMachines.addEventListener('click', () => pickRailTab('machines'));
  railTabRequest.addEventListener('click', () => pickRailTab('request'));

  let railSig = '';
  function renderRail(raw) {
    // при смене семьи правая панель называет уже новую (задача 192o)
    const session = raw ? { ...raw, agent: familyOf(raw) } : raw;
    if (!session) {
      if (railSig !== 'none') { railSig = 'none'; refs.rail.replaceChildren(h(doc, 'p', { class: 'rail-pick', text: t('rail.pick') })); }
      return;
    }
    const queued = handlers.queuedItems ? handlers.queuedItems(session.id) : [];
    const sig = JSON.stringify([railTab, railTab === 'machines' ? machinesPanel.signature(session, queued) : '', railTab === 'request' ? requestPanel.signature(session) : '', session.id, session.project, session.folder, session.branch, session.agent, session.usage, session.outputs,
      session.tasks.map((x) => [x.id, x.title, x.status, x.started, x.finishedAt]), session.routeState && session.routeState.task, session.routeState && session.routeState.crew,
      [...open].filter((k) => k.startsWith('more:') || k.startsWith('sub:') || k === 'ctx-closed'), subMenu]);
    if (sig === railSig) return;
    railSig = sig;
    for (const b of [railTabInfo, railTabMachines, railTabRequest]) {
      const on = b.dataset.tab === railTab;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('on', on);
    }
    const cards = railTab === 'machines'
      ? machinesPanel.render(session, queued)
      : railTab === 'request'
        ? requestPanel.render(session)
        : [envCard(session), crewUi.panel(session), subtasksCard(session), contextCard(session), outputsCard(session), tasksCard(session)].filter(Boolean);
    refs.rail.replaceChildren(railTabs, ...cards);
  }

  // ---------------------------------------------------------------- диалог разрешения

  let shownRequest = null;
  function renderDialog(model, ui) {
    const session = ui.selected ? model.sessions[ui.selected] : undefined;
    const pending = session ? session.pending : null;
    if (!pending) {
      if (shownRequest !== null) {
        shownRequest = null;
        refs.overlay.hidden = true;
        refs.overlay.replaceChildren();
        if (!chat.hidden) input.focus();
      }
      return;
    }
    if (shownRequest === pending.request) return;
    shownRequest = pending.request;

    const allow = h(doc, 'button', { type: 'button', class: 'primary', text: t('perm.allow') });
    const deny = h(doc, 'button', { type: 'button', class: 'danger', text: t('perm.deny') });
    allow.addEventListener('click', () => handlers.onDecide(session.id, pending.request, 'allow'));
    deny.addEventListener('click', () => handlers.onDecide(session.id, pending.request, 'deny'));
    const dialog = h(doc, 'div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'perm-title' },
      h(doc, 'h3', { id: 'perm-title', text: t('perm.title') }),
      h(doc, 'dl', {},
        h(doc, 'dt', { text: t('perm.action') }),
        h(doc, 'dd', { text: pending.action }),
        pending.detail ? h(doc, 'dt', { text: t('perm.detail') }) : false,
        pending.detail ? h(doc, 'dd', { class: 'detail', text: pending.detail }) : false),
      h(doc, 'div', { class: 'actions' }, deny, allow));
    refs.overlay.replaceChildren(dialog);
    refs.overlay.hidden = false;
    deny.focus(); // безопасное умолчание: Enter не разрешает действие
  }

  // ---------------------------------------------------------------- форма вопросов агента (задача 192)

  const askForms = new Map(); // `${сессия}:${запрос}` -> форма (question.js); переживает переключение сессий
  let askShown = null;
  let askUi = null; // { key, sync, focusFirst, nudge } построенной сейчас карточки

  askCard.addEventListener('keydown', (e) => { if (askUi) askUi.onKey(e); });
  function nudgeAsk() { if (askUi) askUi.nudge(); }

  function buildAsk(trace, pq, key) {
    const { questions } = pq;
    const get = () => askForms.get(key);
    const multi = questions.length > 1;
    let panels = [];
    let tabs = [];
    let badge = null;
    let badgeText = null;
    let skip = null;
    let send = null;

    function sync() {
      const f = get();
      panels.forEach((p, qi) => {
        const q = questions[qi];
        const a = f.answers[qi];
        p.node.hidden = qi !== f.active;
        p.inputs.forEach((inp, oi) => {
          const on = oi === otherIndex(q) ? a.other : a.picked.includes(oi);
          inp.checked = on;
          p.rows[oi].dataset.on = String(on);
        });
        p.text.hidden = !a.other;
        if (tabs[qi]) {
          tabs[qi].setAttribute('aria-selected', String(qi === f.active));
          tabs[qi].tabIndex = qi === f.active ? 0 : -1;
          tabs[qi].dataset.done = String(isAnswered(f, questions, qi));
        }
      });
      askCard.setAttribute('aria-labelledby', `ask-q-${f.active}`);
      send.disabled = !canSubmit(f, questions);
      skip.disabled = f.sent;
      badge.dataset.alert = 'false';
      badgeText.textContent = t('ask.need');
    }
    const put = (form) => { askForms.set(key, form); sync(); };

    const optionRow = (qi, oi, name, description, isOther) => {
      const q = questions[qi];
      const input = h(doc, 'input', {
        type: q.multiSelect ? 'checkbox' : 'radio', class: 'ask-input', name: `ask-${qi}`, 'data-oi': oi,
      });
      const text = h(doc, 'span', { class: 'ask-text' },
        h(doc, 'span', { class: 'ask-name', text: name }),
        description ? h(doc, 'span', { class: 'ask-desc', text: description }) : false);
      const row = h(doc, 'label', { class: isOther ? 'ask-opt ask-opt-other' : 'ask-opt' }, input, text, h(doc, 'span', { class: 'ask-key', 'aria-hidden': 'true', text: String(oi + 1) }));
      input.addEventListener('change', () => {
        put(selectOption(get(), questions, qi, oi));
        if (isOther && get().answers[qi].other) panels[qi].text.focus();
      });
      return { row, input };
    };

    panels = questions.map((q, qi) => {
      const rows = q.options.map((o, oi) => optionRow(qi, oi, o.label, o.description, false));
      const other = optionRow(qi, otherIndex(q), t('ask.other'), '', true);
      const text = h(doc, 'textarea', { class: 'ask-text-input', rows: 2, placeholder: t('ask.other_placeholder'), 'aria-label': t('ask.other_label'), hidden: true });
      text.value = get().answers[qi].text;
      text.addEventListener('input', () => put(setOtherText(get(), qi, text.value)));
      const heading = h(doc, 'h3', { class: 'ask-q', id: `ask-q-${qi}`, text: q.question }, q.multiSelect ? h(doc, 'span', { class: 'ask-multi', text: t('ask.multi') }) : false);
      const list = h(doc, 'div', { class: 'ask-options', role: q.multiSelect ? 'group' : 'radiogroup', 'aria-labelledby': `ask-q-${qi}` }, ...rows.map((r) => r.row), other.row, text);
      const node = h(doc, 'div', { class: 'ask-panel', id: `ask-panel-${qi}`, role: multi ? 'tabpanel' : false, hidden: true }, heading, list);
      return { node, inputs: [...rows, other].map((r) => r.input), rows: [...rows, other].map((r) => r.row), text };
    });

    tabs = multi ? questions.map((q, qi) => {
      const tab = h(doc, 'button', {
        type: 'button', class: 'ask-tab', role: 'tab', id: `ask-tab-${qi}`, 'aria-controls': `ask-panel-${qi}`,
      }, h(doc, 'span', { text: q.header || t('ask.tab_n', { n: qi + 1 }) }), icon(doc, 'i-check'));
      tab.addEventListener('click', () => { put(setActive(get(), questions, qi)); panels[qi].inputs[get().cursor[qi]].focus(); });
      return tab;
    }) : [];
    const tabRow = multi ? h(doc, 'div', { class: 'ask-tabs', role: 'tablist', 'aria-label': t('ask.tabs') }, ...tabs) : false;

    badgeText = h(doc, 'span', { class: 'ask-badge-text', text: t('ask.need') });
    badge = h(doc, 'span', { class: 'ask-badge' }, h(doc, 'span', { class: 'ask-dot', 'aria-hidden': 'true' }), badgeText);
    skip = h(doc, 'button', { type: 'button', class: 'ask-skip', title: t('ask.skip_title'), text: t('ask.skip') });
    send = h(doc, 'button', { type: 'button', class: 'ask-send', title: t('ask.send_title') }, h(doc, 'span', { text: t('ask.send') }), h(doc, 'kbd', { text: t('ask.send_hint') }));
    const foot = h(doc, 'div', { class: 'ask-foot' }, h(doc, 'span', { class: 'grow' }), skip, send);
    askCard.replaceChildren(...[tabRow, ...panels.map((p) => p.node), foot].filter(Boolean));
    askWrap.replaceChildren(askCard, h(doc, 'div', { class: 'ask-status' }, badge));

    const focusRow = (qi, oi, intoText) => {
      const p = panels[qi];
      if (intoText && get().answers[qi].other) p.text.focus();
      else p.inputs[oi].focus();
    };
    const deliver = (answer) => {
      put(markSent(get()));
      if (!handlers.onAnswer(trace, answer)) put(markSent(get(), false));
    };
    const doSkip = () => { if (!get().sent) deliver(buildSkip(pq.request)); };
    const doSend = () => {
      const f = get();
      const answer = buildAnswer(pq.request, f, questions);
      if (answer) { deliver(answer); return; }
      // не всё отвечено: Enter ведёт к первому вопросу без ответа
      const next = nextUnanswered(f, questions, f.active);
      if (next >= 0 && next !== f.active) { put(setActive(f, questions, next)); focusRow(next, get().cursor[next], false); }
    };
    skip.addEventListener('click', doSkip);
    send.addEventListener('click', doSend);

    const onKey = (e) => {
      if (e.isComposing) return;
      const f = get();
      const qi = f.active;
      const q = questions[qi];
      const target = e.target;
      const onText = target.tagName === 'TEXTAREA';
      const onButton = target.tagName === 'BUTTON';
      if (e.key === 'Escape') { e.preventDefault(); doSkip(); return; }
      if (e.key === 'Enter') {
        if (onText && e.shiftKey) return; // перенос строки в «Другом»
        if (onButton && !e.ctrlKey && !e.metaKey) return; // Enter на кнопке нажимает её
        e.preventDefault();
        doSend();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const digit = digitOption(e.key);
      if (digit >= 0 && !onText) {
        if (digit > otherIndex(q)) return;
        e.preventDefault();
        put(selectOption(f, questions, qi, digit));
        focusRow(qi, digit, digit === otherIndex(q));
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (onButton) return;
      if (onText && !(e.key === 'ArrowUp' && target.selectionStart === 0 && target.selectionEnd === 0)) return;
      e.preventDefault();
      const from = onText ? otherIndex(q) : Number(target.dataset.oi);
      const moved = moveCursor(setCursor(f, questions, qi, from), questions, qi, e.key === 'ArrowDown' ? 1 : -1);
      const oi = moved.cursor[qi];
      put(q.multiSelect ? moved : selectOption(moved, questions, qi, oi));
      focusRow(qi, oi, !q.multiSelect && oi === otherIndex(q));
    };

    askUi = {
      key,
      onKey,
      focusFirst() { const f = get(); focusRow(f.active, f.cursor[f.active], false); },
      nudge() {
        badge.dataset.alert = 'true';
        badgeText.textContent = t('ask.blocked');
        askUi.focusFirst();
      },
    };
    sync();
  }

  function renderAsk(model, ui) {
    const session = ui.selected ? model.sessions[ui.selected] : undefined;
    const pq = session ? session.pendingQuestion : null;
    const key = pq ? `${session.id}:${pq.request}` : null;
    const open = new Set(Object.values(model.sessions).filter((s) => s.pendingQuestion).map((s) => `${s.id}:${s.pendingQuestion.request}`));
    for (const k of [...askForms.keys()]) if (!open.has(k)) askForms.delete(k);
    if (key === askShown) return; // состояние формы ведёт сама карточка; перерисовка не нужна
    const hadFocus = askCard.contains(doc.activeElement);
    askShown = key;
    if (!pq) {
      askUi = null;
      askWrap.hidden = true;
      askWrap.replaceChildren(askCard);
      askCard.hidden = true;
      askCard.replaceChildren();
      askCard.removeAttribute('aria-labelledby');
      if (hadFocus && !chat.hidden) input.focus();
      return;
    }
    if (!askForms.has(key)) askForms.set(key, createForm(pq.questions));
    buildAsk(session.id, pq, key);
    askCard.hidden = false;
    askWrap.hidden = false;
    log.scrollTop = log.scrollHeight; // лента сама прокручивается к карточке вопроса
    askUi.focusFirst();
  }

  // ---------------------------------------------------------------- строка статуса

  function statusText(status) {
    switch (status.state) {
      case 'loading': return t('loading.all');
      case 'refreshing': return t('loading.refreshing');
      case 'load_error': return t('loading.error');
      case 'connected': return t('conn.connected');
      case 'mock': return t('conn.mock');
      case 'retry': return t('conn.retry', { seconds: status.seconds });
      case 'nofile': return t('conn.nofile');
      default: return t('conn.connecting');
    }
  }

  let statusSig = '';
  function renderStatus(status, flash, tone, loading) {
    if (loading && status.state === 'connected') {
      const sources = Object.values(loading);
      if (sources.some((s) => s.phase === 'error')) status = { state: 'load_error' };
      else if (sources.some((s) => s.phase !== 'ready')) status = { state: sources.some((s) => s.refreshing) ? 'refreshing' : 'loading' };
    }
    const sig = JSON.stringify([status, flash, tone]);
    if (sig === statusSig) return;
    statusSig = sig;
    refs.status.dataset.state = status.state;
    refs.status.replaceChildren(
      h(doc, 'span', { class: 'status-dot', 'aria-hidden': 'true' }),
      h(doc, 'span', { class: 'status-text', text: `${t('conn.label')}: ${statusText(status)}` }),
      ...(flash ? [h(doc, 'span', { class: 'status-flash', 'data-tone': tone, text: flash })] : []),
    );
  }

  // ---------------------------------------------------------------- тема и время

  let themeSig = '';
  function renderTheme(theme) {
    if (theme === themeSig) return;
    themeSig = theme;
    const label = t(THEME_LABEL[theme]);
    themeButton.setAttribute('aria-label', label);
    themeButton.setAttribute('title', label);
    themeButton.replaceChildren(icon(doc, THEME_ICON[theme]));
  }

  /** Обновить «идёт 1 мин 36 с» и «5 мин назад», не трогая остальное: вызывается раз в секунду. */
  function tick() {
    for (const node of doc.querySelectorAll('[data-since]')) {
      const text = durationText(now() - Number(node.dataset.since));
      if (node.textContent !== text) node.textContent = text;
    }
    for (const node of doc.querySelectorAll('[data-until]')) {
      const text = t('route.overlap_timer', { seconds: Math.max(0, Math.ceil((Number(node.dataset.until) - now()) / 1000)) });
      if (node.textContent !== text) node.textContent = text;
    }
    for (const node of doc.querySelectorAll('.msg-time[data-at]')) {
      const text = timeText(Number(node.dataset.at));
      if (node.textContent !== text) node.textContent = text;
    }
    const silentMin = (current.ui && current.ui.silentMin) ?? SILENT_DEFAULT_MIN;
    for (const node of doc.querySelectorAll('.silent-note[data-last]')) {
      const last = Number(node.dataset.last);
      const minutes = silentMin > 0 && last > 0 ? Math.floor((now() - last) / 60000) : 0;
      const show = minutes >= silentMin && silentMin > 0;
      node.hidden = !show;
      const textNode = node.querySelector('.silent-text');
      if (show && textNode) { const text = t('attn.silent_line', { n: minutes }); if (textNode.textContent !== text) textNode.textContent = text; }
    }
    for (const node of doc.querySelectorAll('[data-ago]')) {
      const text = agoText(Number(node.dataset.ago));
      if (node.textContent !== text) node.textContent = text;
    }
  }

  doc.addEventListener('click', (e) => {
    if (subMenu === null) return;
    const path = e.composedPath();
    if (path.some((n) => n.classList && (n.classList.contains('rsub-menu') || n.classList.contains('rsub-more')))) return;
    subMenu = null;
    railSig = '';
    renderRail(current.session);
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || subMenu === null) return;
    subMenu = null;
    railSig = '';
    renderRail(current.session);
  });

  let formSig = '';
  return {
    tick,
    setAgents(next, failed) {
      agents.splice(0, agents.length, ...next);
      agentNotice.textContent = t(failed ? 'sessions.agents_unavailable' : 'sessions.agents_none');
      agentNotice.hidden = agents.length > 0;
      retryAgents.hidden = !failed;
      menuSig = ''; draftSig = '';
    },
    /** Вернуть текст в поле ввода сессии (черновик не создался: сообщение не теряется). */
    putText(trace, text) {
      drafts.set(trace, text);
      if (currentTrace === trace) { input.value = text; fitInput(); }
    },
    /** ui: { selected, projects, pane, flash, theme, pins }; status: { state, seconds? } */
    render(model, ui, status) {
      const session = ui.selected ? model.sessions[ui.selected] : undefined;
      current = { model, ui, session };
      refs.app.dataset.pane = ui.pane;
      refs.app.dataset.rail = railOpen === null ? 'auto' : (railOpen ? 'open' : 'closed');
      const wide = Boolean(win && win.matchMedia && win.matchMedia(WIDE_QUERY).matches);
      railButton.setAttribute('aria-pressed', String(railOpen === null ? wide : railOpen));
      renderTheme(ui.theme);
      renderToggles(ui);
      renderList(model, ui);
      renderChat(model, ui);
      renderRail(session);
      renderDialog(model, ui);
      renderAsk(model, ui);
      renderStatus(status, ui.flash, ui.flashTone, ui.loading);
      tick();
    },
  };
}

// view.js — рисование DOM по модели. Никакой логики «что произошло»: это в state.js и lists.js.
//
// Правила, на которых держится безопасность и спокойный вид:
//   * текст из событий попадает в DOM ТОЛЬКО через textContent / createTextNode — никакой
//     разметки из данных (проверка страницы ищет innerHTML и родню);
//   * каркас строится один раз; при каждой перерисовке меняется только то, что изменилось,
//     поэтому ответ агента растёт без мерцания, а черновик в поле ввода не пропадает;
//   * прокрутка вниз только если владелец уже был у конца: читающего историю не дёргаем;
//   * значки — один спрайт icons.svg (<use>), цвет берут из темы; ширина полоски и кольца контекста
//     ставится свойством --fill / --ring через CSSOM, а не атрибутом style (его запрещает CSP).

import { t } from './strings.js';
import { createDictation, speechCtor } from './voice.js';
import {
  STATE_KEYS, sessionList, splitBlocks, filterSessions, groupSessions, effectivePins, timeline, paragraphs, inlineSpans,
  workSummary, filterModels, groupModels, usagePercent, usageLevel, tokenParts, durationLabel, agoParts, fileParts, taskSummary,
} from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NEAR_BOTTOM_PX = 48;
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
const TASK_ICON = { running: 'i-clock', completed: 'i-check', failed: 'i-x', stopped: 'i-stop' };
const PERM_ICON = { allow: 'i-check', deny: 'i-x', cancelled: 'i-stop', wait: 'i-clock' };
const FILE_ICON = { create: 'i-file-plus', edit: 'i-file-edit', delete: 'i-file-x' };
const THEME_ICON = { system: 'i-monitor', light: 'i-sun', dark: 'i-moon' };
const THEME_LABEL = { system: 'theme.system', light: 'theme.light', dark: 'theme.dark' };
const DECISION_KEY = { allow: 'chat.perm_allowed', deny: 'chat.perm_denied', cancelled: 'chat.perm_cancelled' };
const UNIT_KEY = { d: 'unit.d', h: 'unit.h', m: 'unit.m', s: 'unit.s' };
const AGO_KEY = { now: 'ago.now', min: 'ago.min', hour: 'ago.hour', day: 'ago.day' };

function h(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== false && child !== null && child !== undefined) node.append(child);
  return node;
}

function svgNode(doc, tag, attrs = {}) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Значок из спрайта icons.svg: id — литерал вида 'i-имя'. */
function icon(doc, id, extra = '') {
  const svg = svgNode(doc, 'svg', { class: extra ? `icon ${extra}` : 'icon', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgNode(doc, 'use', { href: `icons.svg#${id}` }));
  return svg;
}

/**
 * @param doc       document
 * @param refs      { side, main, rail, app, status, overlay } — корневые узлы из index.html
 * @param deps      { agents, now, handlers }
 *   handlers: onSelect(trace), onBack(), onNewToggle(open, project?), onCreate({agent, name, project}),
 *             onSend(trace, text) -> bool, onCancel(trace), onDecide(trace, request, decision),
 *             onPin(trace, pinned), onTheme(), onCopy(text),
 *             onSwitchAgent(trace, agent) — продолжить этот разговор на другом агенте,
 *             onChoose(trace, setting, value) — выбор режима, модели или усилия (setting: 'mode' | 'model' | 'effort')
 */
export function createView(doc, refs, deps) {
  const {
    agents, now, handlers, registryFailed = false,
  } = deps;
  const win = doc.defaultView;
  const drafts = new Map();
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
  const search = h(doc, 'input', {
    type: 'search', class: 'search-input', autocomplete: 'off', placeholder: t('sessions.search'), 'aria-label': t('sessions.search'),
  });
  const newButton = h(doc, 'button', { type: 'button', class: 'new-btn' }, icon(doc, 'i-plus'), h(doc, 'span', { text: t('sessions.new') }));
  const agentSelect = h(doc, 'select', { id: 'new-agent' });
  for (const a of agents) {
    agentSelect.append(h(doc, 'option', { value: a.id, disabled: a.disabled === true, text: a.labelKey ? t(a.labelKey) : a.label }));
  }
  const nameInput = h(doc, 'input', { id: 'new-name', type: 'text', autocomplete: 'off', placeholder: t('sessions.new_name_placeholder') });
  const projectInput = h(doc, 'input', { id: 'new-project', type: 'text', autocomplete: 'off', placeholder: t('sessions.new_project_placeholder') });
  const createButton = h(doc, 'button', { type: 'submit', class: 'primary', text: t('sessions.new_create') });
  createButton.disabled = agents.length === 0;
  const agentNotice = h(doc, 'p', { class: 'empty', text: t(registryFailed ? 'sessions.agents_unavailable' : 'sessions.agents_none'), hidden: agents.length > 0 });
  const retryAgents = h(doc, 'button', { type: 'button', class: 'link-btn', text: t('sessions.agents_retry'), hidden: !registryFailed });
  retryAgents.addEventListener('click', () => doc.defaultView.location.reload());
  const closeButton = h(doc, 'button', { type: 'button', text: t('sessions.new_close') });
  const newForm = h(doc, 'form', { class: 'new-form', hidden: true },
    h(doc, 'label', { for: 'new-agent' }, t('sessions.new_agent'), agentSelect),
    h(doc, 'label', { for: 'new-name' }, t('sessions.new_name'), nameInput),
    h(doc, 'label', { for: 'new-project' }, t('sessions.new_project'), projectInput),
    agentNotice, retryAgents, h(doc, 'div', { class: 'actions' }, closeButton, createButton));
  const groupsBox = h(doc, 'nav', { class: 'groups', 'aria-label': t('sessions.title') });
  const listEmpty = h(doc, 'p', { class: 'empty', text: t('sessions.empty') });
  const notFound = h(doc, 'p', { class: 'empty', text: t('sessions.not_found'), hidden: true });

  refs.side.replaceChildren(
    h(doc, 'div', { class: 'side-head' }, h(doc, 'h2', { text: t('sessions.title') }), themeButton),
    h(doc, 'div', { class: 'side-tools' },
      h(doc, 'label', { class: 'search' }, icon(doc, 'i-search'), search),
      newButton),
    newForm, groupsBox, listEmpty, notFound,
  );

  themeButton.addEventListener('click', () => handlers.onTheme());
  newButton.addEventListener('click', () => handlers.onNewToggle(newForm.hidden));
  closeButton.addEventListener('click', () => handlers.onNewToggle(false));
  newForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handlers.onCreate({ agent: agentSelect.value, name: nameInput.value.trim(), project: projectInput.value.trim() });
    nameInput.value = '';
  });
  search.addEventListener('input', () => { query = search.value; if (current.ui) renderList(current.model, current.ui); });

  let listSig = '';
  function sessionRow({ session: s, depth }, ui, pins) {
    const active = s.id === ui.selected;
    const pinned = pins.has(s.id);
    const stateLabel = t(STATE_KEYS[s.state]);
    const item = h(doc, 'button', {
      type: 'button',
      class: 'session-item',
      'aria-current': active ? 'true' : 'false',
      title: t('sessions.time_title', { state: stateLabel, time: formatTime(s.updatedAt) }),
    },
    depth > 0 ? h(doc, 'span', { class: 'corner', 'aria-hidden': 'true' }) : false,
    depth > 0 ? h(doc, 'span', { class: 'sr', text: t('sessions.child') }) : false,
    h(doc, 'span', { class: 'session-name', text: s.name }),
    h(doc, 'span', { class: 'dot', 'data-state': s.state, 'aria-hidden': 'true' }),
    h(doc, 'span', { class: 'sr', text: stateLabel }));
    item.addEventListener('click', () => handlers.onSelect(s.id));
    const pinLabel = `${pinned ? t('sessions.unpin') : t('sessions.pin')}: ${s.name}`;
    const pin = h(doc, 'button', {
      type: 'button', class: 'pin-btn', 'aria-pressed': pinned ? 'true' : 'false', 'aria-label': pinLabel, title: pinLabel,
    }, icon(doc, 'i-pin'));
    pin.addEventListener('click', () => handlers.onPin(s.id, !pinned));
    const cls = ['session', active ? 'is-active' : '', pinned ? 'is-pinned' : ''].filter(Boolean).join(' ');
    return h(doc, 'li', { class: cls, 'data-depth': Math.min(depth, 2) }, item, pin);
  }

  function groupNode(title, rows, ui, pins, project) {
    const head = h(doc, 'div', { class: 'group-head' }, h(doc, 'h3', { text: title }));
    if (project !== undefined) {
      const label = t('sessions.group_add', { project: title });
      const add = h(doc, 'button', { type: 'button', class: 'icon-btn small', 'aria-label': label, title: label }, icon(doc, 'i-plus'));
      add.addEventListener('click', () => handlers.onNewToggle(true, project));
      head.append(add);
    }
    return h(doc, 'section', { class: 'group' }, head, h(doc, 'ul', { class: 'group-list' }, ...rows.map((r) => sessionRow(r, ui, pins))));
  }

  function renderList(model, ui) {
    const all = sessionList(model);
    const pins = effectivePins(all, ui.pins);
    const groups = groupSessions(filterSessions(all, query), { pinned: pins });
    const rowSig = (r) => [r.depth, r.session.id, r.session.name, r.session.state, r.session.updatedAt];
    const sig = JSON.stringify([ui.selected, query, groups.pinned.map(rowSig), groups.projects.map((p) => [p.project, p.rows.map(rowSig)])]);
    const shown = groups.pinned.length + groups.projects.length;
    listEmpty.hidden = all.length > 0;
    notFound.hidden = !(all.length > 0 && shown === 0);
    if (sig === listSig) return;
    listSig = sig;
    const nodes = [];
    if (groups.pinned.length > 0) nodes.push(groupNode(t('sessions.pinned'), groups.pinned, ui, pins));
    for (const p of groups.projects) nodes.push(groupNode(p.project || t('sessions.no_project'), p.rows, ui, pins, p.project));
    groupsBox.replaceChildren(...nodes);
  }

  // ---------------------------------------------------------------- центр: заголовок и разговор

  const backButton = h(doc, 'button', { type: 'button', class: 'icon-btn chat-back', 'aria-label': t('chat.back'), title: t('chat.back') }, icon(doc, 'i-back'));
  const title = h(doc, 'h2');
  const agentText = h(doc, 'span', { class: 'agent-name' });
  const modelText = h(doc, 'span', { class: 'session-model-slot', 'data-session-model': '' });
  const stateBadge = h(doc, 'span', { class: 'badge' });
  const titleBlock = h(doc, 'div', { class: 'title-block', hidden: true }, title, h(doc, 'div', { class: 'sub' }, agentText, modelText, stateBadge));
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
  const micButton = h(doc, 'button', { type: 'button', class: 'mic-btn', title: t('voice.hold'), 'aria-label': t('voice.label'), 'data-state': 'idle' }, icon(doc, 'i-mic'));
  const voiceHint = h(doc, 'p', { class: 'voice-hint', role: 'status', hidden: true });
  const cancelButton = h(doc, 'button', { type: 'button', class: 'cancel-btn', hidden: true, title: t('chat.cancel') }, icon(doc, 'i-stop'), h(doc, 'span', { class: 'sr-only', text: t('chat.cancel') }));
  const sendButton = h(doc, 'button', { type: 'button', class: 'send-btn', title: t('composer.hint'), disabled: true }, icon(doc, 'i-send'), h(doc, 'span', { class: 'sr-only', text: t('chat.send') }));
  const box = h(doc, 'div', { class: 'box' }, input,
    h(doc, 'div', { class: 'box-row' }, micButton, cancelButton, sendButton));

  const ringFill = svgNode(doc, 'circle', { class: 'ring-fill', cx: 12, cy: 12, r: 9, pathLength: 100 });
  const ring = svgNode(doc, 'svg', { class: 'ring', viewBox: '0 0 24 24', role: 'img' });
  ring.append(svgNode(doc, 'circle', { class: 'ring-track', cx: 12, cy: 12, r: 9 }), ringFill);
  const ringBox = h(doc, 'span', { class: 'ring-box' });
  ringBox.append(ring);

  // строка статуса под полем: слева режим (когда агент его сообщает), справа модель и спиннер хода
  // Голосовой ввод (задача 192): нажать и держать — пишет, отпустить — стоп; короткое нажатие и Пробел/Enter — переключатель.
  const HOLD_MS = 400;
  let pressedAt = 0;
  let pressing = false;
  let ignoreUp = false;
  const dictation = createDictation({
    Ctor: speechCtor(win),
    field: input,
    lang: 'ru-RU',
    onChange() { fitInput(); if (currentTrace) drafts.set(currentTrace, input.value); },
    onStatus(s) {
      micButton.dataset.state = s.state;
      voiceHint.hidden = s.state !== 'unavailable';
      voiceHint.textContent = s.state === 'unavailable' ? t('voice.unavailable', { reason: s.reason }) : '';
    },
  });
  if (!speechCtor(win)) micButton.dataset.state = 'unavailable';
  micButton.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    pressedAt = now();
    pressing = true;
    if (dictation.active()) { dictation.stop(); ignoreUp = true; } else { ignoreUp = false; dictation.start(); }
  });
  const releaseMic = () => {
    if (!pressing) return;
    pressing = false;
    if (!ignoreUp && dictation.active() && now() - pressedAt >= HOLD_MS) dictation.stop();
  };
  micButton.addEventListener('pointerup', releaseMic);
  micButton.addEventListener('pointercancel', releaseMic);
  micButton.addEventListener('pointerleave', releaseMic);
  micButton.addEventListener('click', (e) => { if (e.detail === 0) dictation.toggle(); });

  const statusModel = h(doc, 'span', { class: 'status-model' });
  const familyButton = h(doc, 'button', { type: 'button', class: 'status-btn', hidden: true, 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const modeButton = h(doc, 'button', { type: 'button', class: 'status-btn', hidden: true, 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const modelButton = h(doc, 'button', { type: 'button', class: 'status-btn', hidden: true, 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const spinner = h(doc, 'span', { class: 'spinner', role: 'img', 'aria-label': t('composer.working'), hidden: true });
  const menu = h(doc, 'div', { class: 'menu', role: 'menu', hidden: true });
  const status = h(doc, 'div', { class: 'composer-status', hidden: true }, familyButton, modeButton, h(doc, 'span', { class: 'grow' }), statusModel, modelButton, ringBox, spinner, menu);

  // Меню выбора режима, модели и усилия (задача 192): показывает только то, что агент отдал по ACP.
  const MENU_MODELS = 4;
  let menuKind = null; // null | 'mode' | 'model' | 'more' | 'effort'
  let options = null;
  let currentAgent = '';
  let menuQuery = '';
  let menuSig = '';
  const menuSearch = h(doc, 'input', { type: 'search', class: 'menu-search', placeholder: t('menu.search'), 'aria-label': t('menu.search'), autocomplete: 'off', hidden: true });
  const menuList = h(doc, 'div', { class: 'menu-list' });
  menu.append(menuSearch, menuList);
  const nameOf = (list, id) => (list.find((c) => c.id === id) || { name: '' }).name;

  function closeMenu() {
    menuKind = null;
    menu.hidden = true;
    modeButton.setAttribute('aria-expanded', 'false');
    modelButton.setAttribute('aria-expanded', 'false');
    familyButton.setAttribute('aria-expanded', 'false');
  }

  function choose(setting, value) {
    if (currentTrace) handlers.onChoose(currentTrace, setting, value);
    closeMenu();
  }

  function menuRow({ name, description, checked, number, arrow, onPick }) {
    const row = h(doc, 'button', { type: 'button', class: 'menu-item', role: 'menuitem', 'aria-checked': checked ? 'true' : 'false' },
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
      menu.dataset.side = 'left';
      menuList.append(h(doc, 'div', { class: 'menu-head', text: t('menu.agent') }), ...agents.map((a, i) => menuRow({
        name: agentLabel(a.id), checked: a.id === currentAgent, number: i < 9 ? i + 1 : 0,
        onPick: () => { if (currentTrace && a.id !== currentAgent) handlers.onSwitchAgent(currentTrace, a.id); closeMenu(); },
      })));
      menu.hidden = false;
      return;
    }
    if (!options || !menuKind) { menu.hidden = true; return; }
    const rows = [];
    const searchable = menuKind === 'model' || menuKind === 'more';
    menuSearch.hidden = !searchable;
    const searching = searchable && menuQuery.trim().length > 0;
    const numbered = (list, setting, current) => list.map((c, i) => menuRow({
      name: c.name, description: c.description, checked: c.id === current, number: i < 9 ? i + 1 : 0, onPick: () => choose(setting, c.id),
    }));
    if (menuKind === 'mode') {
      menu.dataset.side = 'left';
      rows.push(h(doc, 'div', { class: 'menu-head', text: t('menu.mode') }), ...numbered(options.modes, 'mode', options.mode));
    } else {
      menu.dataset.side = 'right';
      if (searching) {
        const found = filterModels(options.models, menuQuery);
        if (found.length === 0) rows.push(h(doc, 'div', { class: 'menu-head', text: t('menu.none') }));
        rows.push(...found.map((c) => menuRow({ name: c.name, description: c.description, checked: c.id === options.modelId, onPick: () => choose('model', c.id) })));
      } else if (menuKind === 'model') {
        rows.push(...numbered(options.models.slice(0, MENU_MODELS), 'model', options.modelId));
        if (options.efforts.length > 0 || options.models.length > MENU_MODELS) rows.push(h(doc, 'div', { class: 'menu-sep', role: 'separator' }));
        if (options.efforts.length > 0) {
          rows.push(menuRow({
            name: `${options.effortName || t('menu.effort')}  ${nameOf(options.efforts, options.effort)}`, arrow: true, onPick: () => openMenu('effort'),
          }));
        }
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
        rows.push(menuRow({ name: t('menu.back'), onPick: () => openMenu('model') }),
          h(doc, 'div', { class: 'menu-head', text: options.effortName || t('menu.effort') }),
          ...numbered(options.efforts, 'effort', options.effort));
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
    menuSig = JSON.stringify(options);
    familyButton.setAttribute('aria-expanded', kind === 'agent' ? 'true' : 'false');
    modeButton.setAttribute('aria-expanded', kind === 'mode' ? 'true' : 'false');
    modelButton.setAttribute('aria-expanded', kind === 'mode' || kind === 'agent' ? 'false' : 'true');
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
  modeButton.addEventListener('click', () => toggleMenu('mode'));
  modelButton.addEventListener('click', () => toggleMenu('model'));
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

  const composer = h(doc, 'div', { class: 'composer' },
    box,
    voiceHint,
    status);

  const chat = h(doc, 'section', { class: 'chat', hidden: true }, log, composer);
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

  function submit() {
    const text = input.value.trim();
    if (!currentTrace || text.length === 0) return;
    if (handlers.onSend(currentTrace, text)) {
      input.value = '';
      fitInput();
      drafts.delete(currentTrace);
    }
  }
  // Авторазмер: высота по содержимому, не выше 5 строк (дальше — внутренняя прокрутка, см. max-height в app.css).
  function fitInput() {
    sendButton.disabled = cancelButton.hidden === false || input.value.trim().length === 0;
    input.style.height = 'auto';
    if (input.scrollHeight > 0) input.style.height = `${input.scrollHeight}px`; // 0 — чат скрыт: оставить auto
  }
  sendButton.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  input.addEventListener('input', () => {
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
      case 'user':
        node.replaceChildren(h(doc, 'span', { class: 'sr', text: t('chat.you') }), h(doc, 'div', { class: 'bubble' }, ...proseNodes(item.text)));
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
      case 'switch': {
        const text = t('chat.switched', { agent: agentLabel(item.to) });
        node.replaceChildren(h(doc, 'span', { text: item.cut ? `${text} ${t('chat.switched_cut', { shown: item.shown, total: item.total })}` : text }));
        break;
      }
      case 'note': {
        let text = t('chat.cancelled');
        if (item.tone === 'refused') text = item.reason ? t('chat.refused', { reason: item.reason }) : t('chat.refused_plain');
        if (item.tone === 'error') text = item.reason ? t('chat.error', { message: item.reason }) : t('chat.error_plain');
        node.dataset.tone = item.tone;
        node.replaceChildren(h(doc, 'span', { text }));
        break;
      }
      case 'actions': {
        const copy = h(doc, 'button', { type: 'button', class: 'icon-btn small', 'aria-label': t('chat.copy'), title: t('chat.copy') }, icon(doc, 'i-copy'));
        copy.addEventListener('click', () => handlers.onCopy(item.text));
        node.replaceChildren(copy, h(doc, 'span', { class: 'ago', 'data-ago': item.at, text: agoText(item.at) }));
        break;
      }
      default: {
        const dots = h(doc, 'span', { class: 'dots', 'aria-hidden': 'true' }, h(doc, 'i'), h(doc, 'i'), h(doc, 'i'));
        node.replaceChildren(dots, h(doc, 'span', { text: t('chat.running') }),
          item.since > 0 ? h(doc, 'span', { class: 'elapsed', 'data-since': item.since, text: durationText(now() - item.since) }) : false);
      }
    }
  }

  function makeEntry(item) {
    const cls = { diffs: 'item card diffs', work: 'item item-work' }[item.type] ?? `item item-${item.type}`;
    return { node: h(doc, 'div', { class: cls, 'data-key': item.key }), sig: null, item };
  }

  function renderChat(model, ui) {
    const session = ui.selected ? model.sessions[ui.selected] : undefined;
    pick.hidden = Boolean(session);
    chat.hidden = !session;
    titleBlock.hidden = !session;
    if (!session) { currentTrace = null; return; }

    if (currentTrace !== session.id) {
      if (currentTrace) drafts.set(currentTrace, input.value);
      currentTrace = session.id;
      nodes.clear();
      thread.replaceChildren();
      input.value = drafts.get(session.id) ?? '';
      fitInput();
      title.textContent = session.name;
      closeMenu();
    }
    agentText.textContent = agentLabel(session.agent);
    modelText.textContent = session.model || t('session.model_unknown');
    stateBadge.textContent = t(STATE_KEYS[session.state]);
    stateBadge.dataset.state = session.state;
    const busy = session.state === 'answering' || session.state === 'permission';
    cancelButton.hidden = !busy;
    sendButton.disabled = busy || input.value.trim().length === 0;
    options = session.options || null;
    currentAgent = session.agent;
    familyButton.hidden = agents.length < 2;
    familyButton.replaceChildren(h(doc, 'span', { text: agentLabel(session.agent) }), icon(doc, 'i-chevron-down'));
    const hasModes = Boolean(options && options.modes.length > 0);
    const hasModels = Boolean(options && (options.models.length > 0 || options.efforts.length > 0));
    modeButton.hidden = !hasModes;
    modeButton.replaceChildren(h(doc, 'span', { text: hasModes ? (nameOf(options.modes, options.mode) || t('menu.mode')) : '' }), hasModes ? icon(doc, 'i-chevron-down') : false);
    modelButton.hidden = !hasModels;
    modelButton.replaceChildren(h(doc, 'span', {
      text: hasModels ? [session.model || nameOf(options.models, options.modelId) || t('session.model_unknown'), nameOf(options.efforts, options.effort)].filter(Boolean).join('  ') : '',
    }), hasModels ? icon(doc, 'i-chevron-down') : false);
    statusModel.hidden = hasModels;
    statusModel.textContent = session.model || '';
    spinner.hidden = !busy;
    status.hidden = familyButton.hidden && !session.model && !busy && !hasModes && !hasModels && !session.usage;
    if (menuKind === 'agent') renderMenu();
    else if (menuKind && ((menuKind === 'mode' && !hasModes) || (menuKind !== 'mode' && !hasModels))) closeMenu();
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

    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight <= NEAR_BOTTOM_PX;
    const items = timeline(session);
    if (items.length === 0) {
      if (!emptyChat.parentNode) thread.replaceChildren(emptyChat);
    } else if (emptyChat.parentNode) {
      emptyChat.remove();
    }
    let created = 0;
    const alive = new Set();
    items.forEach((item, i) => {
      let entry = nodes.get(item.key);
      if (!entry) { entry = makeEntry(item); nodes.set(item.key, entry); created += 1; }
      alive.add(item.key);
      entry.item = item;
      const sig = JSON.stringify(item);
      if (sig !== entry.sig) { entry.sig = sig; fillItem(entry, item); }
      if (thread.children[i] !== entry.node) thread.insertBefore(entry.node, thread.children[i] ?? null);
    });
    for (const [key, entry] of nodes) if (!alive.has(key)) { entry.node.remove(); nodes.delete(key); }
    if (nearBottom || created === items.length) log.scrollTop = log.scrollHeight;
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

  let railSig = '';
  function renderRail(session) {
    if (!session) {
      if (railSig !== 'none') { railSig = 'none'; refs.rail.replaceChildren(h(doc, 'p', { class: 'rail-pick', text: t('rail.pick') })); }
      return;
    }
    const sig = JSON.stringify([session.id, session.project, session.folder, session.branch, session.agent, session.usage, session.outputs,
      session.tasks.map((x) => [x.id, x.title, x.status, x.started, x.finishedAt]), [...open].filter((k) => k.startsWith('more:') || k === 'ctx-closed')]);
    if (sig === railSig) return;
    railSig = sig;
    refs.rail.replaceChildren(envCard(session), contextCard(session), outputsCard(session), tasksCard(session));
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

  // ---------------------------------------------------------------- строка статуса

  function statusText(status) {
    switch (status.state) {
      case 'connected': return t('conn.connected');
      case 'mock': return t('conn.mock');
      case 'retry': return t('conn.retry', { seconds: status.seconds });
      case 'nofile': return t('conn.nofile');
      default: return t('conn.connecting');
    }
  }

  let statusSig = '';
  function renderStatus(status, flash, tone) {
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
    for (const node of doc.querySelectorAll('[data-ago]')) {
      const text = agoText(Number(node.dataset.ago));
      if (node.textContent !== text) node.textContent = text;
    }
  }

  let formSig = '';
  return {
    tick,
    /** ui: { selected, newOpen, newProject, pane, flash, theme, pins }; status: { state, seconds? } */
    render(model, ui, status) {
      const session = ui.selected ? model.sessions[ui.selected] : undefined;
      current = { model, ui, session };
      refs.app.dataset.pane = ui.pane;
      refs.app.dataset.rail = railOpen === null ? 'auto' : (railOpen ? 'open' : 'closed');
      const wide = Boolean(win && win.matchMedia && win.matchMedia(WIDE_QUERY).matches);
      railButton.setAttribute('aria-pressed', String(railOpen === null ? wide : railOpen));
      newForm.hidden = !ui.newOpen;
      const form = `${ui.newOpen}:${ui.newProject ?? ''}`;
      if (form !== formSig) {
        formSig = form;
        if (ui.newOpen) projectInput.value = ui.newProject ?? '';
      }
      renderTheme(ui.theme);
      renderList(model, ui);
      renderChat(model, ui);
      renderRail(session);
      renderDialog(model, ui);
      renderStatus(status, ui.flash, ui.flashTone);
      tick();
    },
  };
}

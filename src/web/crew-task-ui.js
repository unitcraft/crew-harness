// crew-task-ui.js — задача 192.2: рисование карточек распознанных задач (над полем ввода), полоса «Распознать задачи» и блок кандидатов в правой панели.
// Логика — в crew-task.js; здесь только DOM. Текст попадает в DOM через h() (textContent).

import { t } from './strings.js';
import { h } from './dom.js';
import { EMPTY_CREW, listedItems, singleCard, activeText, rowText, rowActions, problemText, wordHint, recognizeShown, kindText, defaultWay, wayOptions, parseWay } from './crew-task.js';

/**
 * handlers: { onCrewProp(trace, id, action, opts), onCrewRecognize(trace), onCrewQuick(trace, text), onSelect(trace), onEpic(trace, on) }.
 * deps: { agents() — семьи агентов, из которых можно выбрать для сессии новой задачи }.
 */
export function createCrewTaskUi(doc, handlers, deps = {}) {
  const agentList = typeof deps.agents === 'function' ? deps.agents : () => [];
  const ways = new Map(); // «сессия:карточка» -> выбранный способ «режим:номер» (переживает перерисовку)
  const agents = new Map(); // «сессия:карточка» -> семья агента для сессии задачи ('' — как у этой)
  const el = h(doc, 'div', { class: 'crew-over', hidden: true });
  // поле быстрого ответа одно на страницу и переживает перерисовку (иначе набранное пропало бы)
  const quick = h(doc, 'input', { type: 'text', class: 'crew-quick', placeholder: t('crewtask.quick_placeholder'), 'aria-label': t('crewtask.quick_label') });
  let sig = '';
  let quickSession = '';

  const button = (text, cls, run) => {
    const b = h(doc, 'button', { type: 'button', class: `route-btn ${cls}`.trim(), text });
    b.addEventListener('click', run);
    return b;
  };

  // способ и семья, выбранные в строке, уходят вместе с кнопкой
  function chosen(session, p) {
    const key = `${session.id}:${p.id}`;
    return { key, way: ways.get(key) || defaultWay(p), agent: agents.get(key) || '' };
  }

  function wayControls(session, crew, p) {
    if (p.state !== 'open') return false;
    const { key, way, agent } = chosen(session, p);
    const select = h(doc, 'select', { class: 'crew-way', 'aria-label': t('crewtask.way_label') },
      ...wayOptions(p, crew).map((o) => h(doc, 'option', { value: o.value, text: o.label, selected: o.value === way })));
    select.value = way;
    select.addEventListener('change', () => { ways.set(key, select.value); sig = ''; render(current); });
    const families = agentList();
    const family = families.length > 1 ? h(doc, 'select', { class: 'crew-agent', 'aria-label': t('crewtask.agent_label'), title: t('crewtask.agent_label') },
      h(doc, 'option', { value: '', text: t('crewtask.agent_same'), selected: agent === '' }),
      ...families.map((a) => h(doc, 'option', { value: a, text: a, selected: a === agent }))) : false;
    if (family) {
      family.value = agent;
      family.addEventListener('change', () => { agents.set(key, family.value); });
    }
    return h(doc, 'span', { class: 'crew-way-row' }, select, family);
  }

  function press(session, p, action) {
    const { way, agent } = chosen(session, p);
    const { mode, target } = parseWay(way);
    const work = action === 'start' || action === 'extend';
    if (work) handlers.onCrewProp(session.id, p.id, action, { mode, target, agent });
    else handlers.onCrewProp(session.id, p.id, action);
  }

  function listCard(session, crew, items) {
    const rows = items.map((p) => {
      const problem = problemText(p, crew);
      return h(doc, 'li', { class: 'crew-row', 'data-state': p.state, 'data-choice': p.choice },
        h(doc, 'span', { class: 'crew-row-text', text: rowText(p, p.number) }),
        wayControls(session, crew, p),
        p.choice === 'discuss' ? h(doc, 'span', { class: 'crew-row-mark muted', text: t('crewtask.discussing') }) : false,
        p.summary ? h(doc, 'span', { class: 'crew-row-summary muted', text: p.summary }) : false,
        problem ? h(doc, 'span', { class: 'crew-row-problem', text: problem }) : false,
        h(doc, 'span', { class: 'route-actions' }, ...rowActions(p, chosen(session, p).way).map((a) => button(a.label, a.primary ? 'primary' : '', () => press(session, p, a.action)))));
    });
    const send = () => {
      const text = quick.value.trim();
      if (!text) return;
      handlers.onCrewQuick(session.id, text);
      quick.value = '';
    };
    quick.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } };
    return h(doc, 'section', { class: 'route-card crew-list', 'data-card': 'crew-list' },
      h(doc, 'strong', { class: 'route-card-title', text: t('crewtask.list_title') }),
      h(doc, 'ol', { class: 'crew-rows' }, ...rows),
      h(doc, 'div', { class: 'crew-quick-row' }, quick, button(t('crewtask.quick_apply'), 'primary', send)),
      h(doc, 'small', { class: 'route-merge-note', text: t('crewtask.quick_format') }));
  }

  function singleCardEl(session, crew, p) {
    const problem = problemText(p, crew);
    return h(doc, 'section', { class: 'route-card crew-single', 'data-card': 'crew-single', 'data-state': p.state },
      h(doc, 'strong', { class: 'route-card-title', text: t('crewtask.single_title', { title: p.title }) }),
      h(doc, 'span', { class: 'route-card-text', text: `${kindText(p)}${p.summary ? ` · ${p.summary}` : ''}` }),
      wayControls(session, crew, p),
      problem ? h(doc, 'span', { class: 'crew-row-problem', text: problem }) : false,
      h(doc, 'div', { class: 'route-actions' },
        ...rowActions(p, chosen(session, p).way).filter((a) => a.action !== 'discuss').map((a) => button(a.action === 'forget' ? t('crewtask.act_not_task') : a.label, a.primary ? 'primary' : '', () => press(session, p, a.action === 'forget' ? 'dismiss' : a.action)))),
      h(doc, 'small', { class: 'route-merge-note', text: wordHint(p, crew) }));
  }

  /** Перерисовать по сессии (вызывается из render() view.js). */
  let current = null;
  function render(session) {
    current = session;
    const crew = (session && session.routeState && session.routeState.crew) || EMPTY_CREW;
    const items = listedItems(crew);
    const single = singleCard(crew);
    const show = recognizeShown(session);
    const next = JSON.stringify([session && session.id, show, crew, [...ways], [...agents], agentList()]);
    if (next === sig) return;
    sig = next;
    if (session && session.id !== quickSession) { quickSession = session.id; quick.value = ''; }
    if (!show) { el.hidden = true; el.replaceChildren(); return; }
    const bar = h(doc, 'div', { class: 'crew-bar' },
      button(t('crewtask.recognize'), '', () => handlers.onCrewRecognize(session.id)),
      h(doc, 'span', { class: 'crew-count muted', text: activeText(crew) }),
      crew.candidates > 0 ? h(doc, 'span', { class: 'crew-count muted', text: t('crewtask.candidates', { n: crew.candidates }) }) : false);
    el.replaceChildren(...[bar, items.length > 0 ? listCard(session, crew, items) : false, single ? singleCardEl(session, crew, single) : false].filter(Boolean));
    el.hidden = false;
  }

  /** Блок правой панели: сколько в работе и кандидаты (нет задач и нет кандидатов — подсказка, как они появляются). */
  function panel(session) {
    const crew = (session && session.routeState && session.routeState.crew) || EMPTY_CREW;
    if (!recognizeShown(session)) return false;
    const task = session.routeState && session.routeState.task;
    const hasSubs = Boolean(task) && task.subtasks.length > 0;
    const kids = (session.routeState && session.routeState.kids) || { list: [], merged: 0, total: 0, child: null, epic: false };
    // родитель этой сессии: клик открывает его чат
    const parent = kids.child ? h(doc, 'button', { type: 'button', class: 'crew-parent link-btn', text: t('crewtask.parent_of', { name: kids.child.parentName || kids.child.parent }) }) : false;
    if (parent) parent.addEventListener('click', () => handlers.onSelect(kids.child.parent));
    const list = kids.list.length === 0 ? false : h(doc, 'ul', { class: 'crew-kids' }, ...kids.list.map((r) => {
      const row = h(doc, 'button', { type: 'button', class: 'crew-kid', 'data-state': r.state, disabled: r.session === '' },
        h(doc, 'span', { class: 'task-no', text: r.number }),
        h(doc, 'span', { class: 'crew-kid-title', text: r.title }),
        h(doc, 'span', { class: 'crew-kid-state muted', text: r.stateText || r.state }),
        r.total > 0 ? h(doc, 'span', { class: 'crew-kid-progress muted', text: t('route.sub_progress', { done: r.done, total: r.total }) }) : false);
      row.addEventListener('click', () => { if (r.session) handlers.onSelect(r.session); });
      return h(doc, 'li', { class: 'crew-kid-item' }, row);
    }));
    const epic = kids.epic ? h(doc, 'p', { class: 'rsub-task', text: t('crewtask.epic_mark') }) : h(doc, 'button', { type: 'button', class: 'link-btn crew-epic', text: t('crewtask.epic_set'), title: t('crewtask.epic_set_title') });
    if (!kids.epic) epic.addEventListener('click', () => handlers.onEpic(session.id, true));
    return h(doc, 'section', { class: 'card crew-panel' },
      h(doc, 'h3', { class: 'card-title', text: t('crewtask.panel_title') }),
      h(doc, 'p', { class: 'rsub-task', text: activeText(crew) }),
      crew.candidates > 0 ? h(doc, 'p', { class: 'rsub-task', text: t('crewtask.candidates', { n: crew.candidates }) }) : false,
      parent,
      list ? h(doc, 'h4', { class: 'crew-kids-title', text: t('crewtask.kids_title', { merged: kids.merged, total: kids.total }) }) : false,
      list,
      kids.child ? false : epic,
      hasSubs || list ? false : h(doc, 'p', { class: 'muted', text: t('crewtask.none') }));
  }

  return { el, render, panel };
}

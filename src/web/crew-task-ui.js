// crew-task-ui.js — задача 192.2: рисование карточек распознанных задач (над полем ввода), полоса «Распознать задачи» и блок кандидатов в правой панели.
// Логика — в crew-task.js; здесь только DOM. Текст попадает в DOM через h() (textContent).

import { t } from './strings.js';
import { h } from './dom.js';
import { EMPTY_CREW, listedItems, singleCard, activeText, rowText, rowActions, problemText, wordHint, recognizeShown, kindText } from './crew-task.js';

/** handlers: { onCrewProp(trace, id, action), onCrewRecognize(trace), onCrewQuick(trace, text) }. */
export function createCrewTaskUi(doc, handlers) {
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

  function listCard(session, crew, items) {
    const rows = items.map((p) => {
      const problem = problemText(p, crew);
      return h(doc, 'li', { class: 'crew-row', 'data-state': p.state, 'data-choice': p.choice },
        h(doc, 'span', { class: 'crew-row-text', text: rowText(p, p.number) }),
        p.choice === 'discuss' ? h(doc, 'span', { class: 'crew-row-mark muted', text: t('crewtask.discussing') }) : false,
        p.summary ? h(doc, 'span', { class: 'crew-row-summary muted', text: p.summary }) : false,
        problem ? h(doc, 'span', { class: 'crew-row-problem', text: problem }) : false,
        h(doc, 'span', { class: 'route-actions' }, ...rowActions(p).map((a) => button(a.label, a.primary ? 'primary' : '', () => handlers.onCrewProp(session.id, p.id, a.action)))));
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
      problem ? h(doc, 'span', { class: 'crew-row-problem', text: problem }) : false,
      h(doc, 'div', { class: 'route-actions' },
        ...rowActions(p).filter((a) => a.action !== 'discuss').map((a) => button(a.action === 'forget' ? t('crewtask.act_not_task') : a.label, a.primary ? 'primary' : '', () => handlers.onCrewProp(session.id, p.id, a.action === 'forget' ? 'dismiss' : a.action)))),
      h(doc, 'small', { class: 'route-merge-note', text: wordHint(p, crew) }));
  }

  /** Перерисовать по сессии (вызывается из render() view.js). */
  function render(session) {
    const crew = (session && session.routeState && session.routeState.crew) || EMPTY_CREW;
    const items = listedItems(crew);
    const single = singleCard(crew);
    const show = recognizeShown(session);
    const next = JSON.stringify([session && session.id, show, crew]);
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
    return h(doc, 'section', { class: 'card crew-panel' },
      h(doc, 'h3', { class: 'card-title', text: t('crewtask.panel_title') }),
      h(doc, 'p', { class: 'rsub-task', text: activeText(crew) }),
      crew.candidates > 0 ? h(doc, 'p', { class: 'rsub-task', text: t('crewtask.candidates', { n: crew.candidates }) }) : false,
      hasSubs ? false : h(doc, 'p', { class: 'muted', text: t('crewtask.none') }));
  }

  return { el, render, panel };
}

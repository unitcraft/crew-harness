// crew-task-ui.js — задача 192.2/192.5: рисование карточек распознанных задач (над полем ввода), полоса «Распознать задачи» и блок задач в правой панели.
// Список распознанных — ТАБЛИЦА кандидатов: по строке на кандидата (№, название, краткое содержание, затронет: файлы), три переключателя «В работу / Обсудить / Забыть» (по умолчанию «Обсудить»),
// для «В работу» — выпадающий «Способ», внизу одна кнопка «Применить: N в работу · M обсудить · K забыть». Логика — в crew-task.js; здесь только DOM. Текст попадает в DOM через h() (textContent).

import { t } from './strings.js';
import { h } from './dom.js';
import {
  EMPTY_CREW, CHOICES, DEFAULT_CHOICE, singleCard, activeText, tableRows, problemRows, rowText, rowActions, problemText, wordHint, recognizeShown, kindText, defaultWay, wayOptions, parseWay,
  applyCounts, applyLabel, applyPlan, defaultRun, runOptions, proposesText, wayHint, childrenPicked,
} from './crew-task.js';

// подписи переключателей: ключи литералами (проверка strings.test.mjs ищет их в исходниках)
const choiceLabel = (c) => (c === 'work' ? t('crewtask.choice_work') : c === 'forget' ? t('crewtask.choice_forget') : t('crewtask.choice_discuss'));

/**
 * handlers: { onCrewProp(trace, id, action, opts), onCrewRecognize(trace), onCrewApply(trace, items), onSelect(trace), onChildrenMerge(trace) }.
 * deps: { agents() — семьи агентов, из которых можно выбрать для сессии новой задачи }.
 */
export function createCrewTaskUi(doc, handlers, deps = {}) {
  const agentList = typeof deps.agents === 'function' ? deps.agents : () => [];
  const ways = new Map(); // «сессия:карточка» -> выбранный способ «способ:номер» (переживает перерисовку)
  const agents = new Map(); // «сессия:карточка» -> семья агента для сессии задачи ('' — как у этой)
  const choices = new Map(); // «сессия:карточка» -> work | discuss | forget
  const runs = new Map(); // «сессия:карточка» -> режим выполнения (interactive | fast | full)
  const kidsOff = new Map(); // «сессия:карточка» -> множество номеров частей эпика, с которых снята отметка
  const el = h(doc, 'div', { class: 'crew-over', hidden: true });
  let sig = '';

  const button = (text, cls, run) => {
    const b = h(doc, 'button', { type: 'button', class: `route-btn ${cls}`.trim(), text });
    b.addEventListener('click', run);
    return b;
  };

  // способ и семья, выбранные в строке, уходят вместе с кнопкой
  function chosen(session, crew, p) {
    const key = `${session.id}:${p.id}`;
    return { key, way: ways.get(key) || defaultWay(p, crew), agent: agents.get(key) || '' };
  }

  function wayControls(session, crew, p) {
    if (p.state !== 'open') return false;
    const { key, way, agent } = chosen(session, crew, p);
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

  function press(session, crew, p, action) {
    const { way, agent } = chosen(session, crew, p);
    const { mode, target } = parseWay(way);
    const work = action === 'start' || action === 'extend';
    if (work) {
      const key = `${session.id}:${p.id}`;
      const opts = { mode, target, agent, run: runs.get(key) || defaultRun(p) };
      if (mode === 'epic' && p.children.length > 0) opts.children = childrenPicked(p.children.length, kidsOff.get(key) || new Set());
      handlers.onCrewProp(session.id, p.id, action, opts);
    } else handlers.onCrewProp(session.id, p.id, action);
  }

  // Таблица кандидатов: одна кнопка внизу применяет решения по всем строкам.
  function tableCard(session, crew, rows, problems) {
    const choiceOf = (p) => choices.get(`${session.id}:${p.id}`) || DEFAULT_CHOICE;
    const local = new Map(rows.map((p) => [p.id, choiceOf(p)]));
    const body = rows.map((p) => {
      const key = `${session.id}:${p.id}`;
      const radios = CHOICES.map((c) => {
        const input = h(doc, 'input', { type: 'radio', name: `crew-choice-${key}`, value: c, 'aria-label': choiceLabel(c) });
        input.checked = choiceOf(p) === c;
        input.addEventListener('change', () => { choices.set(key, c); sig = ''; render(current); });
        return h(doc, 'label', { class: 'crew-choice', 'data-choice': c }, input, h(doc, 'span', { text: choiceLabel(c) }));
      });
      return h(doc, 'tr', { class: 'crew-row', 'data-choice': choiceOf(p), 'data-id': String(p.id) },
        h(doc, 'td', { class: 'crew-no', text: String(p.number) }),
        h(doc, 'td', { class: 'crew-title', text: p.title }),
        h(doc, 'td', { class: 'crew-summary muted', title: p.summary, text: p.summary }),
        h(doc, 'td', { class: 'crew-touches muted', text: p.touches.join(', ') }),
        h(doc, 'td', { class: 'crew-choices' }, ...radios),
        h(doc, 'td', { class: 'crew-way-cell' }, choiceOf(p) === 'work' ? wayControls(session, crew, p) : false));
    });
    const counts = applyCounts(rows, local);
    const apply = button(applyLabel(counts), 'primary crew-apply', () => {
      handlers.onCrewApply(session.id, applyPlan(rows, local, ways_for(session), agents_for(session), crew));
    });
    const table = rows.length === 0 ? false : h(doc, 'table', { class: 'crew-table' },
      h(doc, 'thead', {}, h(doc, 'tr', {},
        h(doc, 'th', { text: t('crewtask.col_no') }), h(doc, 'th', { text: t('crewtask.col_title') }), h(doc, 'th', { text: t('crewtask.col_summary') }),
        h(doc, 'th', { text: t('crewtask.col_touches') }), h(doc, 'th', { text: t('crewtask.col_choice') }), h(doc, 'th', { text: t('crewtask.col_way') }))),
      h(doc, 'tbody', {}, ...body));
    const problemList = problems.length === 0 ? false : h(doc, 'ul', { class: 'crew-rows' }, ...problems.map((p) => h(doc, 'li', { class: 'crew-row', 'data-state': p.state },
      h(doc, 'span', { class: 'crew-row-text', text: rowText(p, p.number) }),
      h(doc, 'span', { class: 'crew-row-problem', text: problemText(p, crew) }),
      h(doc, 'span', { class: 'route-actions' }, ...rowActions(p, '').map((a) => button(a.label, a.primary ? 'primary' : '', () => press(session, crew, p, a.action)))))));
    return h(doc, 'section', { class: 'route-card crew-list', 'data-card': 'crew-list' },
      h(doc, 'strong', { class: 'route-card-title', text: t('crewtask.list_title') }),
      table,
      problemList,
      rows.length > 0 ? h(doc, 'div', { class: 'crew-apply-row' }, apply) : false);
  }

  // выбранные способы и семьи, переведённые из «сессия:карточка» в «карточка» для applyPlan
  function ways_for(session) {
    const out = new Map();
    for (const [k, v] of ways) if (k.startsWith(`${session.id}:`)) out.set(Number.parseInt(k.slice(session.id.length + 1), 10), v);
    return out;
  }
  function agents_for(session) {
    const out = new Map();
    for (const [k, v] of agents) if (k.startsWith(`${session.id}:`)) out.set(Number.parseInt(k.slice(session.id.length + 1), 10), v);
    return out;
  }

  // Поле с подписью и пояснением мелким серым под ним (пояснение меняется вместе с выбранным пунктом)
  function field(label, control, hint) {
    return h(doc, 'div', { class: 'crew-field' }, h(doc, 'label', { class: 'crew-field-label' }, h(doc, 'span', { class: 'crew-field-name', text: label }), control), hint);
  }

  // Одиночная карточка: что предложил агент, три выбора с подписями (как оформить, кто делает, режим выполнения), части эпика, кнопки «В работу» и «Только обсуждение»
  function singleCardEl(session, crew, p) {
    const problem = problemText(p, crew);
    const { key, way, agent } = chosen(session, crew, p);
    const open = p.state === 'open';
    let controls = false;
    if (open) {
      const rerender = () => { sig = ''; render(current); };
      const wayHintEl = h(doc, 'small', { class: 'crew-field-hint muted', text: wayHint(way) });
      const waySelect = h(doc, 'select', { class: 'crew-way', 'aria-label': t('crewtask.way_label') },
        ...wayOptions(p, crew).map((o) => h(doc, 'option', { value: o.value, text: o.label, selected: o.value === way })));
      waySelect.value = way;
      waySelect.addEventListener('change', () => { ways.set(key, waySelect.value); rerender(); });
      const families = agentList();
      let who = false;
      if (families.length > 1) {
        const sameLabel = session.agent ? t('crewtask.agent_same_named', { name: session.agent }) : t('crewtask.agent_same');
        const sel = h(doc, 'select', { class: 'crew-agent', 'aria-label': t('crewtask.agent_label'), title: t('crewtask.agent_label') },
          h(doc, 'option', { value: '', text: sameLabel, selected: agent === '' }),
          ...families.map((a) => h(doc, 'option', { value: a, text: a, selected: a === agent })));
        sel.value = agent;
        sel.addEventListener('change', () => { agents.set(key, sel.value); });
        who = field(t('crewtask.who_label'), sel, h(doc, 'small', { class: 'crew-field-hint muted', text: t('crewtask.who_hint') }));
      }
      const run = runs.get(key) || defaultRun(p);
      const runList = runOptions();
      const runHint = h(doc, 'small', { class: 'crew-field-hint muted', text: (runList.find((o) => o.value === run) || runList[0]).hint });
      const runSelect = h(doc, 'select', { class: 'crew-run', 'aria-label': t('crewtask.run_label') },
        ...runList.map((o) => h(doc, 'option', { value: o.value, text: o.label, selected: o.value === run })));
      runSelect.value = run;
      runSelect.addEventListener('change', () => { runs.set(key, runSelect.value); rerender(); });
      const isEpic = parseWay(way).mode === 'epic' && p.children.length > 0;
      const off = kidsOff.get(key) || new Set();
      const kids = !isEpic ? false : h(doc, 'div', { class: 'crew-children' },
        h(doc, 'strong', { class: 'crew-children-title', text: t('crewtask.children_title') }),
        h(doc, 'ul', { class: 'crew-children-list' }, ...p.children.map((c, i) => {
          const box = h(doc, 'input', { type: 'checkbox', 'aria-label': c.title });
          box.checked = !off.has(i);
          box.addEventListener('change', () => {
            const next = new Set(kidsOff.get(key) || []);
            if (box.checked) next.delete(i); else next.add(i);
            kidsOff.set(key, next);
            rerender();
          });
          const runName = (runList.find((o) => o.value === c.mode) || {}).label;
          return h(doc, 'li', { class: 'crew-child', 'data-index': String(i) },
            h(doc, 'label', {}, box, h(doc, 'span', { class: 'crew-child-title', text: c.title })),
            c.summary && c.summary !== c.title ? h(doc, 'small', { class: 'crew-field-hint muted', text: c.summary }) : false,
            runName ? h(doc, 'small', { class: 'crew-field-hint muted', text: t('crewtask.proposes_run', { run: runName }) }) : false);
        })));
      controls = h(doc, 'div', { class: 'crew-controls' },
        field(t('crewtask.how_label'), waySelect, wayHintEl),
        who,
        field(t('crewtask.run_label'), runSelect, runHint),
        kids);
    }
    const startTip = wordHint(p, crew);
    return h(doc, 'section', { class: 'route-card crew-single', 'data-card': 'crew-single', 'data-state': p.state },
      h(doc, 'strong', { class: 'route-card-title', text: t('crewtask.single_title', { title: p.title }) }),
      h(doc, 'span', { class: 'crew-proposes', text: proposesText(p) }),
      p.summary ? h(doc, 'span', { class: 'route-card-text muted', text: p.summary }) : false,
      controls,
      problem ? h(doc, 'span', { class: 'crew-row-problem', text: problem }) : false,
      h(doc, 'div', { class: 'route-actions' },
        ...rowActions(p, chosen(session, crew, p).way).filter((a) => a.action !== 'discuss').map((a) => {
          const b = button(a.action === 'forget' ? t('crewtask.act_not_task') : a.label, a.primary ? 'primary' : '', () => press(session, crew, p, a.action === 'forget' ? 'dismiss' : a.action));
          if (a.action === 'forget') b.setAttribute('title', t('crewtask.act_not_task_title'));
          else if (a.primary) b.setAttribute('title', startTip);
          return b;
        })),
      p.state === 'open' ? false : h(doc, 'small', { class: 'route-merge-note', text: startTip }));
  }

  /** Перерисовать по сессии (вызывается из render() view.js). */
  let current = null;
  function render(session) {
    current = session;
    const crew = (session && session.routeState && session.routeState.crew) || EMPTY_CREW;
    const rows = tableRows(crew);
    const problems = problemRows(crew);
    const single = singleCard(crew);
    const show = recognizeShown(session);
    const next = JSON.stringify([session && session.id, show, crew, [...ways], [...agents], [...choices], [...runs], [...kidsOff].map(([k, v]) => [k, [...v]]), agentList()]);
    if (next === sig) return;
    sig = next;
    if (!show) { el.hidden = true; el.replaceChildren(); return; }
    const bar = h(doc, 'div', { class: 'crew-bar' },
      button(t('crewtask.recognize'), '', () => handlers.onCrewRecognize(session.id)),
      h(doc, 'span', { class: 'crew-count muted', text: activeText(crew) }),
      crew.candidates > 0 ? h(doc, 'span', { class: 'crew-count muted', text: t('crewtask.candidates', { n: crew.candidates }) }) : false);
    el.replaceChildren(...[bar, rows.length + problems.length > 0 ? tableCard(session, crew, rows, problems) : false, single ? singleCardEl(session, crew, single) : false].filter(Boolean));
    el.hidden = false;
  }

  /** Блок правой панели: сколько в работе и кандидаты (нет задач и нет кандидатов — подсказка, как они появляются). */
  function panel(session) {
    const crew = (session && session.routeState && session.routeState.crew) || EMPTY_CREW;
    if (!recognizeShown(session)) return false;
    const task = session.routeState && session.routeState.task;
    const hasSubs = Boolean(task) && task.subtasks.length > 0;
    const kids = (session.routeState && session.routeState.kids) || { list: [], merged: 0, total: 0, child: null, epic: false, unmerged: [] };
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
    // эпик — любая открытая задача, у которой есть дочерние: пометка и необязательная кнопка «Влить все дочерние» (дочерние идут в ветку эпика; в main эпик уходит когда захочет)
    const epic = kids.epic ? h(doc, 'p', { class: 'rsub-task crew-epic-mark', text: t('crewtask.epic_mark') }) : false;
    const unmerged = kids.list.filter((r) => r.state !== 'merged').length;
    const branched = Boolean(task) && Boolean(task.branch);
    const mergeAll = kids.epic && branched && unmerged > 0 ? h(doc, 'button', { type: 'button', class: 'link-btn crew-merge-all', title: t('crewtask.merge_all_title'), text: t('crewtask.merge_all') }) : false;
    if (mergeAll) mergeAll.addEventListener('click', () => handlers.onChildrenMerge(session.id));
    const note = kids.unmerged.length > 0 ? h(doc, 'p', { class: 'rsub-task crew-unmerged', text: t('route.children_unmerged', { list: kids.unmerged.join(', ') }) }) : false;
    return h(doc, 'section', { class: 'card crew-panel' },
      h(doc, 'h3', { class: 'card-title', text: t('crewtask.panel_title') }),
      h(doc, 'p', { class: 'rsub-task', text: activeText(crew) }),
      crew.candidates > 0 ? h(doc, 'p', { class: 'rsub-task', text: t('crewtask.candidates', { n: crew.candidates }) }) : false,
      parent,
      epic,
      list ? h(doc, 'h4', { class: 'crew-kids-title', text: t('crewtask.kids_title', { merged: kids.merged, total: kids.total }) }) : false,
      list,
      note,
      mergeAll,
      hasSubs || list ? false : h(doc, 'p', { class: 'muted', text: t('crewtask.none') }));
  }

  return { el, render, panel };
}

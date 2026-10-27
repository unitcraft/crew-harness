// machines-ui.js — вкладка «Машины» правой колонки (задача 192.1): «Работает сейчас» и раскрываемая карточка «Состояние машин (отладка)».
// Рисует только то, что дал machines.js. Текст — через textContent. Раскрытие карточки хранится по сессии в localStorage (в try/catch).

import { t } from './strings.js';
import { h, icon } from './dom.js';
import {
  workingNow, machineJson, previewValue, branchLabel, machineOpenKey, JOURNAL_SHOWN,
} from './machines.js';

const WORK_STATE_TEXT = Object.freeze({
  waiting: 'mach.state_waiting', running: 'mach.state_running', error: 'mach.state_error', done: 'mach.state_done',
});

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param doc
 * @param deps { now, durationText(ms), onCopy(text), onGet(trace), rerender(), storage? }
 */
export function createMachinesPanel(doc, deps) {
  const { now, durationText, onCopy, onGet, rerender } = deps;
  const stamps = new Map(); // «сессия|ключ|состояние» -> когда страница впервые это увидела
  const treeState = new Map(); // путь в дереве -> раскрыто ли
  const fullShown = new Set(); // пути длинных значений, показанных целиком
  const hintOpen = new Set(); // «сессия|время|вид» подсказок, показанных целиком
  let rev = 0;

  const store = () => {
    try { return deps.storage ? deps.storage() : doc.defaultView.localStorage; } catch (e) { return null; }
  };
  function isOpen(id) {
    try { const s = store(); return Boolean(s) && s.getItem(machineOpenKey(id)) === '1'; } catch (e) { return false; }
  }
  function saveOpen(id, value) {
    try { const s = store(); if (s) s.setItem(machineOpenKey(id), value ? '1' : '0'); } catch (e) { /* без хранилища карточка после перезагрузки просто закрыта */ }
  }
  const changed = () => { rev += 1; rerender(); };

  function stampOf(sessionId, item) {
    if (item.since) return item.since;
    const key = `${sessionId}|${item.key}|${item.state}`;
    if (!stamps.has(key)) stamps.set(key, now());
    return stamps.get(key);
  }

  function itemTitle(item) {
    if (item.kind === 'dialog') return t('mach.dialog');
    if (item.kind === 'step') return t('mach.step', { n: item.n, title: item.title });
    if (item.kind === 'run') return t('mach.run');
    if (item.kind === 'tests') return t('mach.tests');
    if (item.kind === 'publish') return t('mach.publish');
    return t('mach.queue');
  }

  function itemDetail(item) {
    if (item.kind === 'queue') return t('mach.queue_detail', { n: item.detail });
    if (item.kind === 'run') return item.title;
    return item.detail || '';
  }

  function workRow(sessionId, item) {
    const since = stampOf(sessionId, item);
    return h(doc, 'li', { class: 'mach-row', 'data-state': item.state, 'data-kind': item.kind },
      h(doc, 'span', { class: 'mach-dot', 'aria-hidden': 'true' }),
      h(doc, 'div', { class: 'mach-main' },
        h(doc, 'div', { class: 'mach-title', text: itemTitle(item) }),
        itemDetail(item) ? h(doc, 'div', { class: 'mach-detail muted', text: itemDetail(item) }) : false),
      h(doc, 'div', { class: 'mach-side' },
        h(doc, 'span', { class: 'mach-state', text: t(WORK_STATE_TEXT[item.state]) }),
        h(doc, 'span', { class: 'mach-time muted', 'data-since': since, text: durationText(now() - since) })));
  }

  function workCard(session, queued) {
    const items = workingNow(session, queued);
    return h(doc, 'section', { class: 'card mach-now' },
      h(doc, 'h3', { class: 'card-title', text: t('mach.now') }),
      h(doc, 'ul', { class: 'mach-list' }, ...items.map((i) => workRow(session.id, i))));
  }

  // ---- дерево данных ----

  function leaf(path, key, value) {
    const p = previewValue(value);
    const full = fullShown.has(path);
    const shown = full ? p.full : p.text;
    const text = typeof value === 'string' ? `"${shown}"${p.cut && !full ? '…' : ''}` : shown;
    const row = h(doc, 'div', { class: 'mach-leaf', 'data-path': path },
      h(doc, 'span', { class: 'mach-key', text: key }),
      h(doc, 'span', { class: 'mach-val', 'data-type': typeof value, text }));
    if (p.cut) {
      const b = h(doc, 'button', { type: 'button', class: 'link-btn mach-more', text: full ? t('mach.hide') : t('mach.show_full') });
      b.addEventListener('click', () => { if (fullShown.has(path)) fullShown.delete(path); else fullShown.add(path); changed(); });
      row.append(b);
    }
    return row;
  }

  function node(path, key, value, depth) {
    if (value === null || typeof value !== 'object') return leaf(path, key, value);
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
    const opened = treeState.has(path) ? treeState.get(path) : depth < 1;
    const head = h(doc, 'button', { type: 'button', class: 'mach-branch', 'aria-expanded': String(opened), 'data-path': path },
      icon(doc, 'i-chevron-down', 'chev'),
      h(doc, 'span', { class: 'mach-key', text: key }),
      h(doc, 'span', { class: 'mach-count muted', text: branchLabel(value) }));
    head.addEventListener('click', () => { treeState.set(path, !opened); changed(); });
    const box = h(doc, 'div', { class: 'mach-node' }, head);
    if (opened) box.append(h(doc, 'div', { class: 'mach-kids' }, ...entries.map(([k, v]) => node(`${path}/${k}`, k, v, depth + 1))));
    return box;
  }

  function section(title, value, path) {
    let body;
    if (value === null || value === undefined) {
      body = h(doc, 'p', { class: 'muted', text: t('mach.none') });
    } else if (isObject(value) && value.truncated === true) {
      body = h(doc, 'div', {}, h(doc, 'p', { class: 'muted mach-cut', text: t('mach.cut', { size: value.size }) }), leaf(`${path}/head`, 'head', String(value.head ?? '')));
    } else {
      body = node(path, title, value, 0);
    }
    return h(doc, 'div', { class: 'mach-section', 'data-section': path }, h(doc, 'h4', { class: 'mach-sub', text: title }), body);
  }

  function clock(ms) {
    const d = new Date(ms);
    const two = (n) => String(n).padStart(2, '0');
    return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  }

  function journalList(m) {
    if (m.journal.length === 0) return h(doc, 'p', { class: 'muted', text: t('mach.none') });
    return h(doc, 'ol', { class: 'mach-journal' }, ...m.journal.map((j) => h(doc, 'li', { class: 'mach-jrow' },
      h(doc, 'span', { class: 'mach-code', text: j.code }),
      h(doc, 'span', { class: 'mach-jtime muted', text: j.at ? clock(j.at) : '' }),
      j.note ? h(doc, 'span', { class: 'mach-note muted', text: j.note }) : false)));
  }

  function debugBody(session) {
    const m = session.machine;
    if (!m) {
      const ask = h(doc, 'button', { type: 'button', class: 'link-btn mach-ask', text: t('mach.ask') });
      ask.addEventListener('click', () => onGet(session.id));
      return h(doc, 'div', { class: 'card-body mach-body' }, h(doc, 'p', { class: 'muted', text: t('mach.waiting_data') }), ask);
    }
    const copy = h(doc, 'button', { type: 'button', class: 'link-btn mach-copy', text: t('mach.copy') });
    copy.addEventListener('click', () => onCopy(machineJson(m)));
    const since = m.since || now();
    return h(doc, 'div', { class: 'card-body mach-body' },
      h(doc, 'dl', { class: 'env mach-facts' },
        h(doc, 'dt', { text: t('mach.table') }), h(doc, 'dd', { text: `${m.table} (${m.machine})` }),
        h(doc, 'dt', { text: t('mach.state') }),
        h(doc, 'dd', {}, h(doc, 'span', { class: 'mach-statename', text: m.state }), ' ',
          h(doc, 'span', { class: 'muted', 'data-since': since, text: durationText(now() - since) }))),
      section(t('mach.input'), m.lastInput, 'input'),
      section(t('mach.data'), m.data, 'data'),
      h(doc, 'div', { class: 'mach-section' },
        h(doc, 'h4', { class: 'mach-sub', text: t('mach.journal', { n: JOURNAL_SHOWN }) }), journalList(m)),
      copy);
  }

  // ---- служебные подсказки агенту (задача 192.5) ----

  function hintsCard(session) {
    const hints = (session.routeState && session.routeState.hints) || [];
    const rows = hints.slice().reverse().map((x) => {
      const key = `${session.id}|${x.ms}|${x.kind}`;
      const opened = hintOpen.has(key);
      const toggle = h(doc, 'button', { type: 'button', class: 'link-btn hint-toggle', 'aria-expanded': String(opened), text: opened ? t('mach.hint_hide') : t('mach.hint_show') });
      toggle.addEventListener('click', () => { if (opened) hintOpen.delete(key); else hintOpen.add(key); changed(); });
      return h(doc, 'li', { class: 'hint-row', 'data-kind': x.kind },
        h(doc, 'div', { class: 'hint-head' },
          h(doc, 'span', { class: 'hint-time muted', text: x.ms ? clock(x.ms) : '' }),
          h(doc, 'span', { class: 'hint-kind', text: x.kind }),
          toggle),
        opened ? h(doc, 'pre', { class: 'hint-text mono', text: x.text }) : false);
    });
    return h(doc, 'section', { class: 'card mach-hints' },
      h(doc, 'h3', { class: 'card-title', text: t('mach.hints') }),
      rows.length === 0 ? h(doc, 'p', { class: 'muted', text: t('mach.hints_none') }) : h(doc, 'ul', { class: 'hint-list' }, ...rows),
      rows.length === 0 ? false : h(doc, 'p', { class: 'muted hint-note', text: t('mach.hints_note', { n: rows.length }) }));
  }

  // ---- контекст агента (задача 192.5) ----

  function contextCard(session) {
    const cx = (session.routeState && session.routeState.context) || { used: 0, size: 0, compactions: [] };
    const usage = session.usage && session.usage.size > 0 ? session.usage : (cx.size > 0 ? cx : null);
    const rows = cx.compactions.slice().reverse().map((x) => h(doc, 'li', { class: 'ctx-row' },
      h(doc, 'span', { class: 'ctx-time muted', text: x.ms ? clock(x.ms) : '' }),
      h(doc, 'span', { class: 'ctx-change', text: t('mach.context_row', { from: x.before, to: x.after }) })));
    return h(doc, 'section', { class: 'card mach-context' },
      h(doc, 'h3', { class: 'card-title', text: t('mach.context') }),
      h(doc, 'p', { class: 'ctx-now', text: usage ? t('mach.context_now', { used: usage.used, size: usage.size }) : t('mach.context_unknown') }),
      rows.length === 0 ? h(doc, 'p', { class: 'muted', text: t('mach.context_none') }) : h(doc, 'ul', { class: 'ctx-list' }, ...rows),
      h(doc, 'p', { class: 'muted hint-note', text: t('mach.context_note', { pct: 40 }) }));
  }

  function debugCard(session) {
    const opened = isOpen(session.id);
    const head = h(doc, 'button', { type: 'button', class: 'card-head mach-debug-head', 'aria-expanded': String(opened) },
      icon(doc, 'i-chevron-down', 'chev'),
      h(doc, 'span', { class: 'card-title', text: t('mach.debug') }));
    head.addEventListener('click', () => {
      saveOpen(session.id, !opened);
      if (!opened) onGet(session.id);
      changed();
    });
    return h(doc, 'section', { class: 'card mach-debug' }, head, opened ? debugBody(session) : false);
  }

  return {
    /** Подпись содержимого: меняется, когда должна меняться картинка. */
    signature(session, queued) {
      return JSON.stringify([rev, session.machine, session.state, session.routeState, queued.length, isOpen(session.id), [...hintOpen]]);
    },
    render(session, queued) {
      return [workCard(session, queued), contextCard(session), hintsCard(session), debugCard(session)];
    },
  };
}

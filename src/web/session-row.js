// session-row.js — то, что живёт у строки сессии и шапки проекта в левой колонке (задача 192): меню «⋯», переименование
// на месте и перетаскивание. Состояние (какое меню открыто, что переименовывается, что тащат) хранится здесь, а список рисует
// view.js; когда состояние меняется, зовётся deps.render(). Текст — только textContent (dom.js).
//
// Перетаскивание: сессию можно поставить выше или ниже другой сессии того же проекта (порядок ложится на сервер сигналом
// session_reorder), бросить на шапку другого проекта (сигнал session_move) или на «Без проекта»; проект можно поставить выше
// или ниже другого проекта (порядок ложится в projects.json). Место вставки — линия над или под строкой, шапка проекта,
// куда бросают сессию, подсвечивается. Пока тащат, список не перерисовывается: иначе браузер теряет источник и обрывает перенос.

import { t } from './strings.js';
import { h, icon } from './dom.js';
import { moveInOrder } from './lists.js';
import { commitsText } from './routes.js';

/**
 * @param doc  document
 * @param deps { handlers, projects() — список проектов страницы или null, confirm(text, {ok, cancel}) — Promise<boolean>, linkFor(id) — ссылка на сессию, render() }
 *   handlers: onPin(id, pinned), onUnread(id, on), onRename(id, name), onCopy(text), onMoveSession(id, projectId), onDeleteSession(id),
 *   onReorderSessions(ids), onReorderProjects(ids)
 */
export function createSideKit(doc, deps) {
  const { handlers, projects, confirm, linkFor, render } = deps;
  let menu = null; // { id, sub: '' | 'move' }
  let renaming = null; // { id, draft, fresh }
  let drag = null; // { kind: 'session' | 'project', id, group, project, el }
  let marked = null; // { el, cls }
  let deferred = false;
  let rebuilding = false;

  // ---------------------------------------------------------------- меню «⋯»

  function closeMenu() {
    if (!menu) return;
    menu = null;
    render();
  }

  function menuRow({ label, iconId, onPick, danger = false, arrow = false, checked = false }) {
    const row = h(doc, 'button', { type: 'button', class: danger ? 'menu-item is-danger' : 'menu-item', role: 'menuitem', 'aria-checked': checked ? 'true' : false },
      h(doc, 'span', { class: 'menu-check' }, iconId ? icon(doc, iconId) : false, checked ? icon(doc, 'i-check') : false),
      h(doc, 'span', { class: 'menu-label' }, h(doc, 'span', { text: label })),
      arrow ? h(doc, 'span', { class: 'menu-end' }, icon(doc, 'i-chevron-right')) : false);
    row.addEventListener('click', (e) => { e.stopPropagation(); onPick(); });
    return row;
  }

  const separator = () => h(doc, 'div', { class: 'menu-sep', role: 'separator' });

  function startRename(session) {
    menu = null;
    renaming = { id: session.id, draft: session.name, fresh: true };
    render();
  }

  function askDelete(session) {
    menu = null;
    render();
    // у сессии есть дочерние (задача 192.3): владельца спрашивают про них, они не остаются сиротами молча
    const kids = typeof deps.descendants === 'function' ? deps.descendants(session.id) : [];
    const text = kids.length > 0
      ? t('session.delete_with_kids', { name: session.name, n: kids.length, names: kids.map((k) => `«${k.name}»`).join(', ') })
      : t('session.delete_confirm', { name: session.name });
    const words = kids.length > 0 ? { ok: t('session.delete_kids_ok'), cancel: t('session.delete_cancel') } : undefined;
    (words ? confirm(text, words) : confirm(text)).then((yes) => {
      if (!yes) return;
      for (const k of [...kids].reverse()) handlers.onDeleteSession(k.id);
      // ветка и дерево задачи живут, пока есть сессия; не влитую работу не теряем молча: владелец выбирает
      const task = session.routeState && session.routeState.task;
      const work = task && task.worktree ? task.unmergedCommits : 0;
      // задача 192.4: у работы без задачи свои ветка и дерево wip/<имя>: не влитая работа или изменённые файлы — тот же вопрос
      const where = session.routeState && !task ? session.routeState.where : null;
      const wip = where && where.kind === 'wip' && where.work ? where : null;
      if (!work && !wip) { handlers.onDeleteSession(session.id); return; }
      const ask = wip
        ? t('session.delete_wip', { branch: wip.branch, what: wip.unmergedCommits > 0 ? commitsText(wip.unmergedCommits) : t('session.delete_wip_dirty') })
        : t('session.delete_work', { commits: commitsText(work) });
      confirm(ask, { ok: t('session.delete_all'), cancel: t('session.delete_keep') })
        .then((all) => handlers.onDeleteSession(session.id, all ? 'drop' : 'keep'));
    });
  }

  /** Меню открытой сессии (или null, если открыто не у неё). ctx: { pinned, unread }. */
  function menuFor(session, ctx) {
    if (!menu || menu.id !== session.id) return null;
    if (menu.sub === 'move') {
      const list = projects() ?? [];
      const rows = [
        menuRow({ label: t('menu.back'), iconId: 'i-back', onPick: () => { menu = { id: session.id, sub: '' }; render(); } }),
        separator(),
        ...list.map((p) => menuRow({
          label: p.name, iconId: 'i-folder', checked: p.id === session.projectId,
          onPick: () => { menu = null; render(); if (p.id !== session.projectId) handlers.onMoveSession(session.id, p.id); },
        })),
        menuRow({
          label: t('sessions.no_project'), checked: !session.projectId,
          onPick: () => { menu = null; render(); if (session.projectId) handlers.onMoveSession(session.id, ''); },
        }),
      ];
      return h(doc, 'div', { class: 'menu session-menu', role: 'menu', 'data-side': 'right' }, ...rows);
    }
    return h(doc, 'div', { class: 'menu session-menu', role: 'menu', 'data-side': 'right' },
      menuRow({
        label: ctx.pinned ? t('session.menu_unpin') : t('session.menu_pin'), iconId: 'i-pin',
        onPick: () => { menu = null; render(); handlers.onPin(session.id, !ctx.pinned); },
      }),
      menuRow({
        label: ctx.unread ? t('session.menu_read') : t('session.menu_unread'), iconId: 'i-dot',
        onPick: () => { menu = null; render(); handlers.onUnread(session.id, !ctx.unread); },
      }),
      menuRow({ label: t('session.menu_rename'), iconId: 'i-pencil', onPick: () => startRename(session) }),
      separator(),
      menuRow({
        label: t('session.menu_link'), iconId: 'i-copy',
        onPick: () => { menu = null; render(); handlers.onCopy(linkFor(session.id)); },
      }),
      menuRow({ label: t('session.menu_move'), iconId: 'i-folder', arrow: true, onPick: () => { menu = { id: session.id, sub: 'move' }; render(); } }),
      separator(),
      menuRow({ label: t('session.menu_delete'), iconId: 'i-trash', danger: true, onPick: () => askDelete(session) }));
  }

  /** Кнопка «⋯» у строки сессии. */
  function moreButton(session) {
    const label = t('session.menu', { name: session.name });
    const open = menu !== null && menu.id === session.id;
    const button = h(doc, 'button', {
      type: 'button', class: 'more-btn', 'aria-label': label, title: label, 'aria-haspopup': 'menu', 'aria-expanded': String(open),
    }, icon(doc, 'i-more'));
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      menu = open ? null : { id: session.id, sub: '' };
      render();
    });
    return button;
  }

  doc.addEventListener('click', (e) => {
    if (!menu) return;
    if (e.composedPath().some((n) => n && n.classList && (n.classList.contains('session-menu') || n.classList.contains('more-btn')))) return;
    closeMenu();
  });
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) closeMenu(); });

  // ---------------------------------------------------------------- переименование на месте

  function finishRename(session, save) {
    if (!renaming || renaming.id !== session.id || rebuilding) return;
    const name = renaming.draft.trim();
    renaming = null;
    if (save && name !== '' && name !== session.name) handlers.onRename(session.id, name);
    render();
  }

  /** Поле вместо кнопки строки: те же размеры, Enter сохраняет, Esc отменяет, уход из поля сохраняет. */
  function renameField(session) {
    const input = h(doc, 'input', {
      class: 'session-rename', type: 'text', maxlength: '200', autocomplete: 'off', spellcheck: 'false', 'aria-label': t('session.rename_label'),
    });
    input.value = renaming.draft;
    input.addEventListener('input', () => { if (renaming) renaming.draft = input.value; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finishRename(session, true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishRename(session, false); }
    });
    input.addEventListener('blur', () => finishRename(session, true));
    return h(doc, 'div', { class: 'session-item is-renaming' }, input);
  }

  /** После перерисовки списка: поле переименования получает фокус (при первом показе — с выделенным названием). */
  function afterRender(root) {
    if (!renaming) return;
    const input = root.querySelector('.session-rename');
    if (!input) return;
    input.focus();
    if (renaming.fresh) {
      renaming.fresh = false;
      if (typeof input.select === 'function') input.select();
    } else if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  // ---------------------------------------------------------------- перетаскивание

  function clearMark() {
    if (!marked) return;
    marked.el.classList.remove(marked.cls);
    marked = null;
  }

  function setMark(el, cls) {
    if (marked && marked.el === el && marked.cls === cls) return;
    clearMark();
    el.classList.add(cls);
    marked = { el, cls };
  }

  function endDrag() {
    clearMark();
    if (drag && drag.el) drag.el.classList.remove('is-dragging');
    drag = null;
    if (deferred) { deferred = false; render(); }
  }

  function startDrag(e, el, info) {
    if (menu) menu = null;
    drag = { ...info, el };
    el.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', info.id); } catch { /* перенос без данных тоже работает */ }
    }
  }

  function isAfter(el, e) {
    const r = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { top: 0, height: 0 };
    return e.clientY > r.top + r.height / 2;
  }

  function accept(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  /**
   * Строку сессии можно тащить; на неё можно бросать сессии того же проекта.
   * @param info { id, group — ключ группы, ids — id сессий группы сверху вниз, projectId, enabled }
   */
  function rowDnd(li, info) {
    if (!info.enabled) return;
    li.setAttribute('draggable', 'true');
    li.addEventListener('dragstart', (e) => startDrag(e, li, { kind: 'session', id: info.id, group: info.group, project: info.projectId }));
    li.addEventListener('dragend', endDrag);
    li.addEventListener('dragover', (e) => {
      if (!drag || drag.kind !== 'session' || drag.group !== info.group || drag.id === info.id) return;
      accept(e);
      setMark(li, isAfter(li, e) ? 'drop-after' : 'drop-before');
    });
    li.addEventListener('dragleave', (e) => { if (marked && marked.el === li && !li.contains(e.relatedTarget)) clearMark(); });
    li.addEventListener('drop', (e) => {
      if (!drag || drag.kind !== 'session' || drag.group !== info.group || drag.id === info.id) return;
      e.preventDefault();
      const after = isAfter(li, e);
      const moved = drag.id;
      clearMark();
      const ids = moveInOrder(info.ids, moved, info.id, after);
      if (ids.join('\n') !== info.ids.join('\n')) handlers.onReorderSessions(ids);
    });
  }

  /**
   * Шапка проекта: её можно тащить (порядок проектов), на неё можно бросить проект (поставить рядом) или сессию (перенести в проект).
   * @param info { section, head, projectId, free — группа «Без проекта»: сессию можно бросить, тащить нельзя }
   */
  function projectDnd({ section, head, projectId, free = false }) {
    const real = projectId !== '';
    if (real) {
      head.setAttribute('draggable', 'true');
      head.addEventListener('dragstart', (e) => {
        if (e.target !== head) return; // сессии внутри тащатся своими обработчиками
        startDrag(e, section, { kind: 'project', id: projectId, group: '', project: projectId });
      });
      head.addEventListener('dragend', endDrag);
    }
    head.addEventListener('dragover', (e) => {
      if (!drag) return;
      if (drag.kind === 'session' && (real || free) && drag.project !== projectId) {
        accept(e);
        setMark(head, 'drop-into');
      } else if (drag.kind === 'project' && real && drag.id !== projectId) {
        accept(e);
        setMark(section, isAfter(head, e) ? 'drop-after' : 'drop-before');
      }
    });
    head.addEventListener('dragleave', (e) => { if (marked && (marked.el === head || marked.el === section) && !head.contains(e.relatedTarget)) clearMark(); });
    head.addEventListener('drop', (e) => {
      if (!drag) return;
      if (drag.kind === 'session' && (real || free) && drag.project !== projectId) {
        e.preventDefault();
        const moved = drag.id;
        clearMark();
        handlers.onMoveSession(moved, projectId);
      } else if (drag.kind === 'project' && real && drag.id !== projectId) {
        e.preventDefault();
        const after = isAfter(head, e);
        const moved = drag.id;
        clearMark();
        const list = (projects() ?? []).map((p) => p.id);
        const ids = moveInOrder(list, moved, projectId, after);
        if (ids.join('\n') !== list.join('\n')) handlers.onReorderProjects(ids);
      }
    });
  }

  return {
    menuFor, moreButton, renameField, afterRender, rowDnd, projectDnd,
    isRenaming: (id) => renaming !== null && renaming.id === id,
    isDragging: () => drag !== null,
    /** Перерисовку отложили, пока тащат: после броска она выполнится сама. */
    deferRender() { deferred = true; },
    /** Обёртка вокруг пересборки списка: уход фокуса из удаляемого поля не считается завершением переименования. */
    rebuild(fn) { rebuilding = true; try { fn(); } finally { rebuilding = false; } },
    /** Что из состояния видно на экране: часть подписи списка (перерисовывается, когда меняется). */
    sig: () => JSON.stringify([menu, renaming ? renaming.id : '']),
    closeMenu,
  };
}

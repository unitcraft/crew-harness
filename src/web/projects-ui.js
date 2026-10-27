// projects-ui.js — окна проектов: «Новый проект / Изменить проект», «Переменные окружения» и «Выбор папки».
//
// Окна — слои поверх страницы (стопка): Esc закрывает верхний, Tab ходит по кругу внутри верхнего,
// при закрытии фокус возвращается туда, откуда окно открыли. Текст — только textContent (dom.js).
// Сеть — через projects-api.js (подставляется), поэтому на моке всё работает так же, как на сервисе.

import { t } from './strings.js';
import { h, icon } from './dom.js';
import {
  countEnv, folderName, joinPath, makeFolder, normalizePath, parseEnv, pluralRu, projectPayload, samePath, uniqueProjectName, validateProject, worktreesDirHint,
} from './projects.js';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
const ENV_COUNT_KEY = { one: 'project.env_one', few: 'project.env_few', many: 'project.env_many' };
const MAX_LISTED_ERRORS = 3;

/** Подпись числа переменных: «Нет для этого проекта» или «3 переменные». */
export function envSummary(n) {
  return n === 0 ? t('project.env_none') : t(ENV_COUNT_KEY[pluralRu(n)], { n });
}

/**
 * @param doc  document
 * @param deps { api, onChanged(), onNotice(text, tone) } — api из projects-api.js
 */
export function createProjectsUi(doc, deps) {
  const { api, onChanged, onNotice } = deps;
  const layers = []; // от нижнего к верхнему: { root, dialog, opener, close }

  // ---------------------------------------------------------------- слои

  function topLayer() { return layers[layers.length - 1]; }

  function closeLayer(layer, result) {
    const at = layers.indexOf(layer);
    if (at < 0) return;
    layers.splice(at, 1);
    layer.root.remove();
    if (layer.opener && typeof layer.opener.focus === 'function' && doc.contains(layer.opener)) layer.opener.focus();
    layer.done(result);
  }

  /** Показать окно поверх страницы. Возвращает слой; layer.promise закрывается значением из close(). */
  function pushLayer(dialog, { cancelValue = null, scrimClose = false } = {}) {
    const root = h(doc, 'div', { class: 'overlay layer' }, dialog);
    let done = () => {};
    const promise = new Promise((resolve) => { done = resolve; });
    const layer = { root, dialog, opener: doc.activeElement, done, promise, cancelValue };
    layer.close = (value) => closeLayer(layer, value === undefined ? cancelValue : value);
    if (scrimClose) root.addEventListener('mousedown', (e) => { if (e.target === root) layer.close(); });
    layers.push(layer);
    doc.body.append(root);
    return layer;
  }

  doc.addEventListener('keydown', (e) => {
    const layer = topLayer();
    if (!layer) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      layer.close();
      return;
    }
    if (e.key === 'Tab') {
      const items = [...layer.dialog.querySelectorAll(FOCUSABLE)].filter((n) => !n.closest('[hidden]'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = doc.activeElement;
      if (!layer.dialog.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  const dialogShell = (labelId, className, ...children) => h(doc, 'div', {
    class: `dialog modal ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelId,
  }, ...children);

  // ---------------------------------------------------------------- выбор папки

  /** Открыть окно выбора папки. Результат: нормальный путь или null (отмена). */
  function pickFolder(start = '') {
    let state = { path: '', parent: null, entries: [], recent: [], error: '', loading: true };
    let ticket = 0;
    const pathInput = h(doc, 'input', {
      type: 'text', id: 'picker-path', class: 'mono', autocomplete: 'off', spellcheck: 'false', placeholder: t('picker.path_placeholder'), 'aria-label': t('picker.path'),
    });
    const goButton = h(doc, 'button', { type: 'submit', class: 'picker-go', text: t('picker.go') });
    const upButton = h(doc, 'button', { type: 'button', class: 'picker-up', 'aria-label': t('picker.up'), title: t('picker.up') }, icon(doc, 'i-arrow-up'), h(doc, 'span', { text: '..' }));
    const listTitle = h(doc, 'div', { class: 'picker-head', id: 'picker-list-title' });
    const list = h(doc, 'ul', { class: 'picker-list', 'aria-labelledby': 'picker-list-title' });
    const note = h(doc, 'p', { class: 'picker-note muted' });
    const recentBox = h(doc, 'div', { class: 'picker-recent', hidden: true });
    const errorBox = h(doc, 'p', { class: 'plate', role: 'alert', hidden: true });
    const cancel = h(doc, 'button', { type: 'button', text: t('picker.cancel') });
    const choose = h(doc, 'button', { type: 'button', class: 'primary', text: t('picker.choose') });
    const form = h(doc, 'form', { class: 'picker-path-row', novalidate: true }, pathInput, goButton);
    const dialog = dialogShell('picker-title', 'picker',
      h(doc, 'h3', { id: 'picker-title', text: t('picker.title') }),
      form,
      h(doc, 'div', { class: 'picker-bar' }, upButton, h(doc, 'span', { class: 'muted picker-hint', text: t('picker.hint') })),
      listTitle, list, note, recentBox, errorBox,
      h(doc, 'div', { class: 'actions' }, cancel, choose));
    const layer = pushLayer(dialog, { cancelValue: null, scrimClose: true });

    function paint() {
      const atRoots = state.path === '';
      listTitle.textContent = atRoots ? t('picker.roots') : state.path;
      upButton.disabled = state.parent === null || state.loading;
      choose.disabled = atRoots || state.loading;
      note.textContent = state.loading ? t('picker.loading') : (state.entries.length === 0 && !state.error ? t('picker.empty') : '');
      errorBox.hidden = state.error === '';
      errorBox.textContent = state.error;
      list.replaceChildren(...state.entries.map((e) => {
        const target = joinPath(state.path, e.name);
        const item = h(doc, 'button', { type: 'button', class: 'picker-item', 'data-path': target },
          icon(doc, atRoots ? 'i-laptop' : 'i-folder'), h(doc, 'span', { text: e.name.replace(/\/$/, '') || e.name }));
        item.addEventListener('click', () => go(target));
        return h(doc, 'li', {}, item);
      }));
      const recent = state.recent.filter((p) => p !== '');
      recentBox.hidden = recent.length === 0;
      recentBox.replaceChildren(...(recent.length === 0 ? [] : [
        h(doc, 'div', { class: 'picker-head', text: t('picker.recent') }),
        ...recent.map((p) => {
          const b = h(doc, 'button', { type: 'button', class: 'picker-item', title: p }, icon(doc, 'i-folder'),
            h(doc, 'span', { class: 'picker-recent-name', text: folderName(p) }), h(doc, 'span', { class: 'muted picker-recent-path', text: p }));
          b.addEventListener('click', () => layer.close(p));
          return b;
        }),
      ]));
    }

    async function go(path) {
      const mine = ticket + 1;
      ticket = mine;
      state = { ...state, loading: true, error: '' };
      paint();
      const r = await api.fsList(normalizePath(path));
      if (mine !== ticket) return false;
      if (!r.ok) {
        state = { ...state, loading: false, error: t('picker.failed', { reason: r.error }) };
        paint();
        return false;
      }
      state = { path: r.path, parent: r.parent, entries: r.entries, recent: r.recent.length > 0 ? r.recent : state.recent, error: '', loading: false };
      pathInput.value = r.path;
      paint();
      return true;
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); go(pathInput.value); });
    upButton.addEventListener('click', () => { if (state.parent !== null) go(state.parent); });
    // двойной клик выбирает текущий каталог (первый клик уже вошёл в папку)
    list.addEventListener('dblclick', () => { if (state.path !== '' && !state.loading) layer.close(state.path); });
    cancel.addEventListener('click', () => layer.close());
    choose.addEventListener('click', async () => {
      const typed = normalizePath(pathInput.value);
      if (typed !== state.path && typed !== '' && !(await go(typed))) return;
      if (state.path !== '') layer.close(state.path);
    });
    // стрелки ходят по папкам
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...list.querySelectorAll('.picker-item')];
      const at = items.indexOf(doc.activeElement);
      if (at < 0) return;
      e.preventDefault();
      (items[at + (e.key === 'ArrowDown' ? 1 : -1)] || items[at]).focus();
    });

    go(start).then(() => pathInput.focus());
    return layer.promise;
  }

  // ---------------------------------------------------------------- переменные окружения

  /**
   * Подокно переменных .env. Результат: новый текст (кнопка «Готово») или null (Esc).
   * serverError — сообщение сервера «строка N: …», которое нужно показать сразу.
   */
  function editEnv({ projectName, text, serverError = '' }) {
    const area = h(doc, 'textarea', {
      id: 'env-text', class: 'mono env-text', rows: 10, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off',
      placeholder: t('env.placeholder'), 'aria-label': t('env.label'),
    });
    area.value = text;
    const counter = h(doc, 'span', { class: 'muted env-count', 'aria-live': 'polite' });
    const plate = h(doc, 'div', { class: 'plate', role: 'alert', hidden: true });
    const done = h(doc, 'button', { type: 'button', class: 'primary', text: t('env.done') });
    const dialog = dialogShell('env-title', 'env',
      h(doc, 'h3', { id: 'env-title', text: t('env.title') }),
      h(doc, 'p', { class: 'muted', text: t('env.hint', { project: projectName || t('project.unnamed') }) }),
      area,
      h(doc, 'div', { class: 'env-meta' }, counter),
      plate,
      h(doc, 'p', { class: 'muted env-format', text: t('env.format') }),
      h(doc, 'div', { class: 'actions' }, done));
    const layer = pushLayer(dialog, { cancelValue: null });

    function gotoLine(line) {
      const lines = area.value.split('\n');
      let from = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i += 1) from += lines[i].length + 1;
      area.focus();
      area.setSelectionRange(from, from + (lines[line - 1] ?? '').length);
    }

    function refresh() {
      const parsed = parseEnv(area.value);
      counter.textContent = envSummary(new Set(parsed.vars.map((v) => v.key)).size);
      const items = parsed.errors.slice(0, MAX_LISTED_ERRORS).map((er) => {
        const b = h(doc, 'button', { type: 'button', class: 'plate-line', title: t('env.goto', { line: er.line }), text: er.message });
        b.addEventListener('click', () => gotoLine(er.line));
        return b;
      });
      if (parsed.errors.length > MAX_LISTED_ERRORS) items.push(h(doc, 'span', { text: t('env.more_errors', { n: parsed.errors.length - MAX_LISTED_ERRORS }) }));
      if (items.length === 0 && serverError && area.value === text) items.push(h(doc, 'span', { text: serverError }));
      plate.hidden = items.length === 0;
      plate.replaceChildren(...items);
      done.disabled = parsed.errors.length > 0;
    }

    area.addEventListener('input', refresh);
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !done.disabled) { e.preventDefault(); layer.close(area.value); } });
    done.addEventListener('click', () => layer.close(area.value));
    refresh();
    area.focus();
    return layer.promise;
  }

  // ---------------------------------------------------------------- окно проекта

  /**
   * Открыть «Новый проект» (id не задан) или «Изменить проект» (id проекта).
   * Результат: id сохранённого проекта или null.
   */
  async function openEditor(id) {
    let project = { id: '', name: '', folders: [], env: '', worktreesDir: '' };
    if (id) {
      const r = await api.get(id);
      if (!r.ok) { onNotice(t('projects.open_failed', { reason: r.error }), 'error'); return null; }
      project = r.project;
    }
    const draft = { name: project.name, folders: project.folders.map(makeFolder), env: project.env, worktreesDir: project.worktreesDir || '' };
    const git = new Map(); // путь (нижний регистр) -> { isRepo, branch }
    const gitKey = (p) => normalizePath(p).toLowerCase();

    const nameInput = h(doc, 'input', {
      id: 'project-name', type: 'text', autocomplete: 'off', placeholder: t('project.name_placeholder'), 'aria-describedby': 'project-name-error',
    });
    nameInput.value = draft.name;
    const nameError = h(doc, 'p', { class: 'field-error', id: 'project-name-error', hidden: true, text: t('project.name_required') });
    const addButton = h(doc, 'button', { type: 'button', class: 'add-folder', title: t('project.add_folder_title') }, icon(doc, 'i-plus'), h(doc, 'span', { text: t('project.add_folder') }));
    const folderList = h(doc, 'ul', { class: 'proj-folders' });
    const folderNote = h(doc, 'p', { class: 'muted proj-empty', text: t('project.folders_empty') });
    // задача 192.5: «папка деревьев» проекта — под списком папок
    const treesInput = h(doc, 'input', {
      id: 'project-trees', type: 'text', class: 'mono', autocomplete: 'off', spellcheck: 'false', placeholder: t('project.trees_placeholder'), 'aria-describedby': 'project-trees-hint project-trees-error',
    });
    treesInput.value = draft.worktreesDir;
    const treesHint = h(doc, 'p', { class: 'muted field-hint', id: 'project-trees-hint' });
    const treesError = h(doc, 'p', { class: 'field-error', id: 'project-trees-error', hidden: true });
    const envValue = h(doc, 'span', { class: 'muted env-summary' });
    const envButton = h(doc, 'button', { type: 'button', class: 'proj-env' },
      icon(doc, 'i-terminal'), h(doc, 'span', { class: 'proj-env-label', text: t('project.env') }), envValue, icon(doc, 'i-chevron-right', 'chev'));
    const plate = h(doc, 'p', { class: 'plate', role: 'alert', hidden: true });
    const cancel = h(doc, 'button', { type: 'button', text: t('project.cancel') });
    const submit = h(doc, 'button', { type: 'submit', class: 'primary', text: project.id ? t('project.save') : t('project.create') });
    const form = h(doc, 'form', { class: 'proj-form', novalidate: true },
      h(doc, 'label', { class: 'field', for: 'project-name' }, h(doc, 'span', { text: t('project.name') }), nameInput, nameError),
      h(doc, 'section', { class: 'proj-section', 'aria-labelledby': 'project-folders-title' },
        h(doc, 'div', { class: 'proj-section-head' }, h(doc, 'h4', { id: 'project-folders-title', text: t('project.folders') }), addButton),
        folderList, folderNote),
      h(doc, 'label', { class: 'field proj-trees', for: 'project-trees' }, h(doc, 'span', { text: t('project.trees') }), treesInput, treesHint, treesError),
      envButton,
      plate,
      h(doc, 'div', { class: 'actions' }, cancel, submit));
    const dialog = dialogShell('project-title', 'project', h(doc, 'h3', { id: 'project-title', text: project.id ? t('project.edit_title') : t('project.new_title') }), form);
    const layer = pushLayer(dialog, { cancelValue: null });

    const showPlate = (text) => { plate.hidden = text === ''; plate.textContent = text; };

    function paintFolders() {
      folderNote.hidden = draft.folders.length > 0;
      folderList.replaceChildren(...draft.folders.map((f, index) => {
        const info = git.get(gitKey(f.path));
        const repo = info ? info.isRepo : null; // null — ещё не знаем
        const nameText = folderName(f.path);
        const remove = h(doc, 'button', { type: 'button', class: 'icon-btn small', 'aria-label': t('project.folder_remove', { folder: nameText }), title: t('project.folder_remove', { folder: nameText }) }, icon(doc, 'i-x'));
        remove.addEventListener('click', () => { draft.folders.splice(index, 1); showPlate(''); paintFolders(); });
        const box = h(doc, 'input', { type: 'checkbox', id: `wt-${index}`, disabled: repo === false });
        box.checked = f.worktree && repo !== false;
        box.addEventListener('change', () => { f.worktree = box.checked; });
        const wtLabel = h(doc, 'label', { class: 'check', for: `wt-${index}`, title: repo === false ? t('project.worktree_off') : t('project.worktree_tip') }, box, h(doc, 'span', { text: t('project.worktree') }));
        let chip = false;
        if (info && info.isRepo) {
          const shown = f.branch && f.branch !== info.branch ? f.branch : info.branch;
          const current = shown === info.branch;
          chip = h(doc, 'span', { class: 'chip', title: t('project.branch_title', { branch: shown }) }, icon(doc, 'i-branch'), h(doc, 'span', { text: shown }),
            current ? h(doc, 'span', { class: 'chip-note', text: t('project.branch_current') }) : false);
        } else if (info && !info.isRepo) {
          chip = h(doc, 'span', { class: 'chip chip-off', text: t('project.not_repo') });
        }
        return h(doc, 'li', { class: 'proj-folder' },
          icon(doc, 'i-folder'),
          h(doc, 'div', { class: 'pf-main', title: f.path }, h(doc, 'strong', { text: nameText }), h(doc, 'small', { class: 'muted', text: f.path })),
          chip, wtLabel, remove);
      }));
    }

    async function learnGit(path) {
      const key = gitKey(path);
      if (git.has(key)) return;
      const r = await api.fsGit(path);
      git.set(key, { isRepo: r.ok && r.isRepo, branch: r.branch });
      if (layers.includes(layer)) paintFolders();
    }

    function paintEnv() { envValue.textContent = envSummary(countEnv(draft.env)); }

    function paintTrees() {
      const hint = worktreesDirHint(treesInput.value);
      treesHint.textContent = hint.kind === 'beside' ? t('project.trees_beside') : hint.kind === 'absolute' ? t('project.trees_absolute', { path: hint.path }) : t('project.trees_named', { name: hint.name });
    }

    async function addFolder() {
      const path = await pickFolder('');
      if (path === null) return;
      if (draft.folders.some((f) => samePath(f.path, path))) { showPlate(t('project.folder_dup')); return; }
      showPlate('');
      draft.folders.push(makeFolder({ path, worktree: false }));
      paintFolders();
      await learnGit(path);
      addButton.focus();
    }

    async function openEnv(serverError = '') {
      const text = await editEnv({ projectName: nameInput.value.trim(), text: draft.env, serverError });
      if (text !== null) { draft.env = text; showPlate(''); paintEnv(); }
      envButton.focus();
    }

    addButton.addEventListener('click', addFolder);
    envButton.addEventListener('click', () => openEnv());
    cancel.addEventListener('click', () => layer.close());
    nameInput.addEventListener('input', () => { nameError.hidden = true; nameInput.removeAttribute('aria-invalid'); });
    treesInput.addEventListener('input', () => { draft.worktreesDir = treesInput.value; treesError.hidden = true; treesInput.removeAttribute('aria-invalid'); paintTrees(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      draft.name = nameInput.value;
      draft.worktreesDir = treesInput.value;
      const check = validateProject(draft);
      treesError.hidden = !check.errors.worktreesDir;
      if (check.errors.worktreesDir) {
        treesError.textContent = t(check.errors.worktreesDir === 'dots' ? 'project.trees_dots' : 'project.trees_control');
        treesInput.setAttribute('aria-invalid', 'true');
        treesInput.focus();
        return;
      }
      nameError.hidden = !check.errors.name;
      if (check.errors.name) { nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); return; }
      if (check.errors.folders) { showPlate(t('project.folder_dup')); return; }
      if (check.errors.env) { showPlate(check.errors.env); openEnv(check.errors.env); return; }
      submit.disabled = true;
      submit.textContent = t('project.saving');
      const payload = projectPayload(draft);
      const r = project.id ? await api.update(project.id, payload) : await api.create(payload);
      submit.disabled = false;
      submit.textContent = project.id ? t('project.save') : t('project.create');
      if (!r.ok) {
        showPlate(r.error);
        if (/^строка\s+\d+/.test(r.error)) openEnv(r.error);
        return;
      }
      const savedId = project.id || (r.id ?? '');
      layer.close(savedId || true);
      onChanged();
    });

    paintFolders();
    paintEnv();
    paintTrees();
    for (const f of draft.folders) learnGit(f.path);
    nameInput.focus();
    return layer.promise;
  }

  /** «Новый проект»: только выбор одной папки; название — имя папки (при совпадении «имя (2)»), его можно поправить в настройках проекта. */
  async function createByFolder(names) {
    const path = await pickFolder('');
    if (path === null) return null;
    const name = uniqueProjectName(folderName(path) || path, names);
    const r = await api.create(projectPayload({ name, folders: [makeFolder({ path, worktree: false })], env: '' }));
    if (!r.ok) { onNotice(t('projects.create_failed', { reason: r.error }), 'error'); return null; }
    onChanged();
    return r.id || true;
  }

  /** Окно подтверждения: { title, text, ok, cancel } -> Promise<boolean>; Esc и «Отмена» — false, фокус сначала на «Отмена». */
  function confirm({ title, text, ok, cancel }) {
    const cancelButton = h(doc, 'button', { type: 'button', class: 'confirm-cancel', text: cancel });
    const okButton = h(doc, 'button', { type: 'button', class: 'confirm-ok danger', text: ok });
    const dialog = dialogShell('confirm-title', 'confirm-dialog',
      h(doc, 'h3', { id: 'confirm-title', text: title }),
      h(doc, 'p', { class: 'confirm-text', text }),
      h(doc, 'div', { class: 'actions' }, cancelButton, okButton));
    const layer = pushLayer(dialog, { cancelValue: false, scrimClose: true });
    cancelButton.addEventListener('click', () => layer.close(false));
    okButton.addEventListener('click', () => layer.close(true));
    cancelButton.focus();
    return layer.promise;
  }

  async function removeProject(project) {
    const r = await api.remove(project.id);
    if (!r.ok) { onNotice(t('projects.delete_failed', { reason: r.error }), 'error'); return false; }
    onNotice(t('projects.deleted', { project: project.name }), 'info');
    onChanged();
    return true;
  }

  return { openEditor, createByFolder, confirm, removeProject, pickFolder, editEnv, openCount: () => layers.length };
}

// attach-ui.js — рисование вложений-картинок (задача 192): полоска превью над строкой ввода, вставка из буфера,
// перетаскивание файлов в карточку; клик по превью открывает просмотрщик (viewer-ui.js). Решения («что можно приложить») — в attachments.js;
// здесь только узлы DOM и события. Текст из данных попадает в DOM через textContent/атрибуты, как везде в view.js.

import { t } from './strings.js';
import {
  addImages, removeImage, pickerAccept, clipboardImages, clipboardHasText, dragHasFiles, droppedFiles,
} from './attachments.js';

/** Надпись об отказе: по коду ошибки addImages. */
const ERROR_KEY = {
  type: 'images.err_type', empty: 'images.err_empty', size: 'images.err_size', count: 'images.err_count',
};

export function errorText(error) {
  return t(ERROR_KEY[error.code] ?? 'images.err_type', { name: error.name });
}

/**
 * Полоска вложений текущей сессии. Список вложений живёт здесь; view.js переносит его между сессиями (take/restore).
 * @param deps.h, deps.icon   конструкторы узлов из view.js
 * @param deps.showError      (text) — красная плашка тем же механизмом toast.js
 * @param deps.onChange       () — список изменился (кнопка отправки, высота поля)
 * @param deps.onView         (items, index, back) — открыть просмотрщик (back — функция: узел для возврата фокуса): items — [{ src, name }] всех приложенных картинок
 */
export function createAttachUi(doc, { h, icon, showError, onChange, onView = () => {} }) {
  const win = doc.defaultView;
  const URLApi = win && win.URL && typeof win.URL.createObjectURL === 'function' ? win.URL : globalThis.URL;
  let list = [];
  let seq = 0;
  const urls = new Map(); // id вложения -> blob:-адрес превью

  const row = h(doc, 'div', { class: 'attach-row', hidden: true, role: 'list', 'aria-label': t('images.attached') });

  function urlOf(item) {
    if (!urls.has(item.id)) urls.set(item.id, URLApi.createObjectURL(item.blob));
    return urls.get(item.id);
  }

  function forget(ids) {
    for (const id of ids) {
      if (urls.has(id)) { URLApi.revokeObjectURL(urls.get(id)); urls.delete(id); }
    }
  }

  function draw() {
    row.hidden = list.length === 0;
    row.replaceChildren(...list.map((item) => {
      const img = h(doc, 'img', { class: 'attach-img', src: urlOf(item), alt: t('images.alt', { name: item.name }) });
      const openLabel = t('images.open', { name: item.name });
      const open = h(doc, 'button', { type: 'button', class: 'attach-open', title: openLabel, 'aria-label': openLabel }, img);
      open.addEventListener('click', () => {
        // полоска перерисовывается при каждом добавлении: фокус возвращаем на превью по id, а не на узел, которого уже может не быть
        const back = () => [...row.children].find((n) => n.getAttribute('data-id') === item.id)?.children[0] ?? null;
        onView(list.map((x) => ({ src: urlOf(x), name: x.name })), list.findIndex((x) => x.id === item.id), back);
      });
      const label = t('images.remove', { name: item.name });
      const remove = h(doc, 'button', { type: 'button', class: 'attach-x', title: label, 'aria-label': label }, icon(doc, 'i-x'));
      remove.addEventListener('click', (e) => { e.stopPropagation(); drop(item.id); });
      return h(doc, 'div', { class: 'attach', role: 'listitem', 'data-id': item.id }, open, remove);
    }));
  }

  function drop(id) {
    list = removeImage(list, id);
    forget([id]);
    draw();
    onChange();
  }

  function add(files) {
    const result = addImages(list, files, seq);
    seq = result.seq;
    list = result.list;
    draw();
    if (result.errors.length > 0) showError(result.errors.map(errorText).join('. '));
    onChange();
  }

  /** Вставка: картинки из буфера прикладываются; если в буфере нет текста, обычную вставку отменяем (в поле нечего класть). */
  function onPaste(e) {
    const files = clipboardImages(e.clipboardData);
    if (files.length === 0) return;
    if (!clipboardHasText(e.clipboardData)) e.preventDefault();
    add(files);
  }

  function bindPaste(input) {
    input.addEventListener('paste', onPaste);
  }

  /** Перетаскивание файлов в карточку: рамка подсвечивается (data-drop), бросок прикладывает картинки. */
  function bindDrop(card) {
    let depth = 0;
    const off = () => { depth = 0; delete card.dataset.drop; };
    card.addEventListener('dragenter', (e) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth += 1;
      card.dataset.drop = 'on';
    });
    card.addEventListener('dragover', (e) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    card.addEventListener('dragleave', (e) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      depth -= 1;
      if (depth <= 0) off();
    });
    card.addEventListener('drop', (e) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      off();
      add(droppedFiles(e.dataTransfer));
    });
  }

  /** Кнопка «+»: открывает системный выбор изображений; выбранные уходят в тот же список, что вставка и перетаскивание. */
  function bindPicker(button) {
    const chooser = doc.createElement('input');
    chooser.type = 'file';
    chooser.accept = pickerAccept();
    chooser.multiple = true;
    chooser.hidden = true;
    chooser.setAttribute('aria-hidden', 'true');
    chooser.tabIndex = -1;
    chooser.addEventListener('change', () => {
      const files = [...(chooser.files || [])];
      chooser.value = '';
      if (files.length > 0) add(files);
    });
    button.after(chooser);
    button.addEventListener('click', () => chooser.click());
  }

  return {
    row,
    add,
    bindPicker,
    items: () => list,
    count: () => list.length,
    /** Забрать вложения (при смене сессии): список уходит из полоски, превью освобождаются, файлы остаются в списке. */
    take() {
      const mine = list;
      forget(mine.map((x) => x.id));
      list = [];
      draw();
      return mine;
    },
    /** Вернуть вложения сессии (или пусто). */
    restore(items) {
      list = items ?? [];
      draw();
    },
    /** Всё отправлено или отменено. */
    clear() {
      forget(list.map((x) => x.id));
      list = [];
      draw();
      onChange();
    },
    bindPaste,
    bindDrop,
  };
}

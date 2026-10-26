// viewer-ui.js — просмотрщик изображений поверх страницы (задача 192s): DOM и события. Вся математика (вписывание, зум в точке,
// границы перетаскивания, клавиши) — в viewer.js. Картинка двигается и масштабируется одним transform (translate + scale) на
// самом <img>: без canvas и без перерисовки — большие изображения остаются плавными (will-change: transform).
// Открывается из ленты (миниатюры сообщения) и из карточки ввода (превью до отправки): open(items, index, opener).

import { t } from './strings.js';
import {
  fitState, fitScale, clampPan, zoomAt, wheelFactor, stepScale, isPannable, toggleAt, formatPercent, stepIndex,
  panBy, pinch, arrowAction, zoomKey, captionParts, toCentered, isFit, MIN_SCALE, MAX_SCALE,
} from './viewer.js';

/** Сдвиг указателя, после которого щелчок по фону уже перетаскивание и окно не закрывает. */
const CLICK_SLOP = 5;

/**
 * @param doc  document
 * @param deps { h, icon } — конструкторы узлов из view.js; measure(stage) -> {w, h} (для тестов)
 */
export function createViewer(doc, { h, icon, measure }) {
  const win = doc.defaultView;
  const img = h(doc, 'img', { class: 'viewer-img', alt: '', draggable: 'false' });
  const stage = h(doc, 'div', { class: 'viewer-stage' }, img);

  function button(iconId, labelKey, cls = '') {
    const label = t(labelKey);
    return h(doc, 'button', { type: 'button', class: `viewer-btn ${cls}`.trim(), title: label, 'aria-label': label }, icon(doc, iconId));
  }
  const zoomOutBtn = button('i-zoom-out', 'viewer.zoom_out');
  const zoomInBtn = button('i-zoom-in', 'viewer.zoom_in');
  const actualBtn = button('i-actual', 'viewer.actual');
  const fitBtn = button('i-fit', 'viewer.fit');
  const closeBtn = button('i-x', 'viewer.close');
  const pct = h(doc, 'span', { class: 'viewer-pct', text: '100%' });
  const bar = h(doc, 'div', { class: 'viewer-bar', role: 'toolbar', 'aria-label': t('viewer.tools') },
    zoomOutBtn, pct, zoomInBtn, actualBtn, fitBtn, closeBtn);
  const prevBtn = button('i-back', 'viewer.prev', 'viewer-nav viewer-prev');
  const nextBtn = button('i-chevron-right', 'viewer.next', 'viewer-nav viewer-next');
  const capName = h(doc, 'span', { class: 'viewer-cap-name' });
  const capDims = h(doc, 'span', { class: 'viewer-cap-dims' });
  const capCount = h(doc, 'span', { class: 'viewer-cap-count' });
  const caption = h(doc, 'div', { class: 'viewer-caption' }, capName, capDims, capCount);
  const box = h(doc, 'div', {
    class: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('viewer.title'), tabindex: '-1', hidden: true,
  }, stage, prevBtn, nextBtn, bar, caption);
  doc.body.append(box);

  let items = [];
  let index = 0;
  let opener = null;
  let size = null;        // натуральный размер текущей картинки или null, пока она грузится
  let state = { scale: 1, x: 0, y: 0 };
  let fitMode = true;     // пока владелец не менял масштаб, при смене размеров окна картинка остаётся вписанной
  const pointers = new Map();
  let drag = null;        // { moved } — идёт перетаскивание или щелчок по фону
  let pinching = null;    // { dist, start }

  const isOpen = () => !box.hidden;

  function view() {
    if (typeof measure === 'function') return measure(stage);
    return { w: stage.clientWidth || win?.innerWidth || 1, h: stage.clientHeight || win?.innerHeight || 1 };
  }

  const fitNow = () => (size ? fitScale(view(), size) : 1);

  function render(animate = false) {
    img.dataset.anim = animate ? '1' : '';
    img.style.transform = `translate(-50%, -50%) translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    img.dataset.crisp = state.scale >= 2 ? '1' : '';
    const pannable = size ? isPannable(state, view(), size) : false;
    stage.dataset.pan = pannable ? (drag ? 'grabbing' : 'grab') : '';
    pct.textContent = formatPercent(state.scale);
    zoomOutBtn.disabled = state.scale <= MIN_SCALE + 1e-9;
    zoomInBtn.disabled = state.scale >= MAX_SCALE - 1e-9;
  }

  function drawCaption() {
    const c = captionParts(items[index], size, index, items.length);
    capName.textContent = c.name;
    capDims.textContent = c.dims;
    capCount.textContent = c.counter;
    capDims.hidden = c.dims === '';
    capCount.hidden = c.counter === '';
    const many = items.length > 1;
    prevBtn.hidden = !many;
    nextBtn.hidden = !many;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === items.length - 1;
    box.setAttribute('aria-label', `${t('viewer.title')}: ${c.name}`);
    img.setAttribute('alt', t('images.alt', { name: c.name }));
  }

  function setFit(animate = false) {
    state = size ? fitState(view(), size) : { scale: 1, x: 0, y: 0 };
    fitMode = true;
    render(animate);
  }

  function onLoaded() {
    if (!isOpen()) return;
    const w = img.naturalWidth || 0;
    const hh = img.naturalHeight || 0;
    size = w > 0 && hh > 0 ? { w, h: hh } : null;
    drawCaption();
    setFit();
  }

  function show(i) {
    index = i;
    size = null;
    drag = null;
    pointers.clear();
    pinching = null;
    const item = items[index];
    drawCaption();
    state = { scale: 1, x: 0, y: 0 };
    render();
    img.removeAttribute('src');
    img.setAttribute('src', item.src);
    // картинка уже в кэше: размеры известны сразу, события load может не быть
    if (img.complete && img.naturalWidth > 0) onLoaded();
  }

  function applyZoom(next, animate) {
    state = next;
    fitMode = size ? isFit(state, fitNow()) : true;
    render(animate);
  }

  /** Масштаб вокруг точки (от центра окна); без точки — вокруг центра. */
  function zoomTo(target, cx = 0, cy = 0, animate = false) {
    if (!size) return;
    applyZoom(zoomAt(state, target, cx, cy, view(), size), animate);
  }

  function actual() {
    if (!size) return;
    zoomTo(1, 0, 0, true);
  }

  function go(dir) {
    const next = stepIndex(index, items.length, dir);
    if (next !== index) show(next);
  }

  function close() {
    if (!isOpen()) return;
    box.hidden = true;
    img.removeAttribute('src');
    items = [];
    size = null;
    drag = null;
    pointers.clear();
    pinching = null;
    const back = typeof opener === 'function' ? opener() : opener;
    opener = null;
    if (back && typeof back.focus === 'function') back.focus();
  }

  const local = (e) => {
    const r = stage.getBoundingClientRect();
    return toCentered(view(), e.clientX - (r.left || 0), e.clientY - (r.top || 0));
  };

  // ---- мышь, перо, палец
  stage.addEventListener('wheel', (e) => {
    if (!isOpen()) return;
    e.preventDefault();
    if (!size) return;
    const p = local(e);
    zoomTo(state.scale * wheelFactor(e.deltaY, e.deltaMode), p.x, p.y, false);
  }, { passive: false });

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (typeof stage.setPointerCapture === 'function') {
      try { stage.setPointerCapture(e.pointerId); } catch { /* указатель мог уже уйти */ }
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinching = { dist: Math.hypot(a.x - b.x, a.y - b.y), start: state };
      drag = null;
    } else if (pointers.size === 1) {
      drag = { moved: 0, onImage: e.target === img };
    }
    render();
  });

  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev || !size) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pinching && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const r = stage.getBoundingClientRect();
      const mid = toCentered(view(), (a.x + b.x) / 2 - (r.left || 0), (a.y + b.y) / 2 - (r.top || 0));
      applyZoom(pinch(pinching.start, pinching.dist, Math.hypot(a.x - b.x, a.y - b.y), mid, view(), size), false);
      return;
    }
    if (!drag) return;
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (isPannable(state, view(), size)) {
      state = panBy(state, dx, dy, view(), size);
      fitMode = false;
      render();
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinching = null;
    if (typeof stage.releasePointerCapture === 'function') {
      try { stage.releasePointerCapture(e.pointerId); } catch { /* уже отпущен */ }
    }
    if (pointers.size === 0 && drag) {
      const tap = drag.moved < CLICK_SLOP && !drag.onImage && e.type === 'pointerup';
      drag = null;
      render();
      if (tap) close(); // щелчок по тёмному фону закрывает; по картинке и после перетаскивания — нет
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  stage.addEventListener('dblclick', (e) => {
    if (!size) return;
    e.preventDefault();
    const p = local(e);
    applyZoom(toggleAt(state, p.x, p.y, view(), size), true);
  });

  // ---- кнопки панели
  zoomInBtn.addEventListener('click', () => zoomTo(stepScale(state.scale, 1), 0, 0, true));
  zoomOutBtn.addEventListener('click', () => zoomTo(stepScale(state.scale, -1), 0, 0, true));
  actualBtn.addEventListener('click', actual);
  fitBtn.addEventListener('click', () => setFit(true));
  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  img.addEventListener('load', onLoaded);
  img.addEventListener('error', () => { if (isOpen()) { size = null; drawCaption(); setFit(); } });

  // ---- клавиши: пока просмотрщик открыт, они только его (Esc не идёт дальше: меню и поле ввода его не получают)
  function focusables() {
    return [prevBtn, nextBtn, zoomOutBtn, zoomInBtn, actualBtn, fitBtn, closeBtn].filter((b) => !b.hidden && !b.disabled);
  }

  doc.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const list = focusables();
      if (list.length === 0) return;
      const at = list.indexOf(doc.activeElement);
      const next = e.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : (at < 0 || at === list.length - 1 ? 0 : at + 1);
      e.preventDefault();
      list[next].focus();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const zoom = zoomKey(e.key);
    if (zoom) {
      e.preventDefault();
      if (zoom === 'in') zoomTo(stepScale(state.scale, 1), 0, 0, true);
      else if (zoom === 'out') zoomTo(stepScale(state.scale, -1), 0, 0, true);
      else if (zoom === 'fit') setFit(true);
      else actual();
      return;
    }
    const act = size ? arrowAction(e.key, { pannable: isPannable(state, view(), size), count: items.length })
      : arrowAction(e.key, { pannable: false, count: items.length });
    if (!act) return;
    e.preventDefault();
    if (act.type === 'nav') go(act.dir);
    else { state = panBy(state, act.dx, act.dy, view(), size); fitMode = false; render(true); }
  }, true);

  win?.addEventListener?.('resize', () => {
    if (!isOpen() || !size) return;
    if (fitMode) setFit();
    else { state = clampPan(state, view(), size); render(); }
  });

  return {
    /**
     * @param list    [{ src, name }] — картинки одного сообщения (или одной карточки ввода)
     * @param at      с какой начать
     * @param from    узел (или функция, отдающая узел), на который вернуть фокус при закрытии
     */
    open(list, at = 0, from = null) {
      if (!Array.isArray(list) || list.length === 0) return;
      items = list;
      opener = from;
      box.hidden = false;
      show(Math.min(list.length - 1, Math.max(0, at)));
      box.focus();
    },
    close,
    isOpen,
    /** Текущее состояние (для проверок). */
    snapshot: () => ({ index, size, ...state, fit: fitMode }),
  };
}

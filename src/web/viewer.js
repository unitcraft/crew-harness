// viewer.js — чистая математика просмотрщика изображений (задача 192s): без DOM и таймеров.
//
// Состояние вида — { scale, x, y }: scale — во сколько раз показ больше натурального размера картинки (1 = 100%),
// (x, y) — смещение ЦЕНТРА картинки от центра окна в пикселях. Точки окна (курсор, щипок) здесь задаются в тех же осях:
// от центра окна, а не от его левого верхнего угла (перевод — toCentered). Размеры окна и картинки — { w, h }.

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
/** Шаг кнопок «+» и «−» и клавиш. */
export const BUTTON_FACTOR = 1.25;
/** Сколько пикселей сдвигает картинку стрелка. */
export const PAN_STEP = 60;
/** Поле вокруг вписанной картинки: чтобы она не прилипала к краям. */
export const FIT_PADDING = 24;
/** Сколько картинки (в пикселях окна) обязано остаться на экране при перетаскивании. */
export const KEEP_VISIBLE = 96;

const EPS = 1e-6;

export const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Масштаб «вписать»: вся картинка в окне, но не больше натурального размера. */
export function fitScale(view, size, padding = FIT_PADDING) {
  if (!(size.w > 0) || !(size.h > 0)) return 1;
  const aw = Math.max(1, view.w - 2 * padding);
  const ah = Math.max(1, view.h - 2 * padding);
  return clampScale(Math.min(1, aw / size.w, ah / size.h));
}

/** Вид «вписано»: по центру. */
export function fitState(view, size) {
  return { scale: fitScale(view, size), x: 0, y: 0 };
}

/** Точка окна (от левого верхнего угла) -> точка от центра окна. */
export const toCentered = (view, px, py) => ({ x: px - view.w / 2, y: py - view.h / 2 });

/**
 * Не дать утащить картинку за экран. Если картинка по оси меньше окна — она по этой оси стоит по центру;
 * если больше — на экране остаётся не меньше KEEP_VISIBLE её пикселей.
 */
export function clampPan(state, view, size) {
  const w = size.w * state.scale;
  const h = size.h * state.scale;
  const bound = (img, win) => {
    if (img <= win + EPS) return 0;
    return Math.max(0, (img + win) / 2 - Math.min(KEEP_VISIBLE, win / 2));
  };
  const bx = bound(w, view.w);
  const by = bound(h, view.h);
  // «+ 0» убирает отрицательный ноль
  return { scale: state.scale, x: Math.min(bx, Math.max(-bx, state.x)) + 0, y: Math.min(by, Math.max(-by, state.y)) + 0 };
}

/** Масштаб до `target` (с границами 10%–800%) так, чтобы точка (cx, cy) от центра окна осталась на месте. */
export function zoomAt(state, target, cx, cy, view, size) {
  const scale = clampScale(target);
  const k = scale / state.scale;
  return clampPan({ scale, x: cx - (cx - state.x) * k, y: cy - (cy - state.y) * k }, view, size);
}

/** Множитель за один «тик» колеса: плавно, знак deltaY — приближение вверх. deltaMode: 0 пиксели, 1 строки, 2 страницы. */
export function wheelFactor(deltaY, deltaMode = 0) {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const bounded = Math.max(-240, Math.min(240, px));
  return Math.exp(-bounded * 0.0018);
}

/** Масштаб на кнопку/клавишу: dir = 1 приблизить, -1 отдалить. */
export const stepScale = (scale, dir) => clampScale(dir > 0 ? scale * BUTTON_FACTOR : scale / BUTTON_FACTOR);

/** Картинка выходит за окно хотя бы по одной оси: её можно таскать (крупнее «вписано» ещё не значит «больше окна»). */
export const isPannable = (state, view, size) => size.w * state.scale > view.w + EPS || size.h * state.scale > view.h + EPS;

/** Масштаб равен «вписано» (с допуском на округление). */
export const isFit = (state, fit) => Math.abs(state.scale - fit) <= 0.001;

/**
 * Двойной щелчок: вписано -> 100% в точке щелчка (если картинка и так не больше окна, то 200%: иначе щелчок ничего не покажет);
 * не вписано -> вписано.
 */
export function toggleAt(state, cx, cy, view, size) {
  const fit = fitScale(view, size);
  if (!isFit(state, fit)) return fitState(view, size);
  return zoomAt(state, fit >= 1 ? 2 : 1, cx, cy, view, size);
}

/** Масштаб в процентах для индикатора: «150%». */
export const formatPercent = (scale) => `${Math.round(scale * 100)}%`;

/** Номер картинки после шага: без зацикливания (на краю остаётся на месте). */
export function stepIndex(index, count, dir) {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index + dir));
}

/** Перетаскивание: новое состояние по смещению указателя. */
export function panBy(state, dx, dy, view, size) {
  return clampPan({ scale: state.scale, x: state.x + dx, y: state.y + dy }, view, size);
}

/** Щипок двумя пальцами: масштаб от начального, точка между пальцами остаётся на месте. */
export function pinch(start, startDist, dist, mid, view, size) {
  if (!(startDist > 0) || !(dist > 0)) return start;
  return zoomAt(start, start.scale * (dist / startDist), mid.x, mid.y, view, size);
}

/**
 * Что делает стрелка. Картинка приближена (можно таскать) — двигает её; иначе ←/→ меняют картинку, если их несколько.
 * @returns {{type: 'pan', dx: number, dy: number} | {type: 'nav', dir: number} | null}
 */
export function arrowAction(key, { pannable, count }) {
  const dirs = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const d = dirs[key];
  if (!d) return null;
  if (pannable) return { type: 'pan', dx: d[0] * PAN_STEP, dy: d[1] * PAN_STEP };
  if (key === 'ArrowLeft' && count > 1) return { type: 'nav', dir: -1 };
  if (key === 'ArrowRight' && count > 1) return { type: 'nav', dir: 1 };
  return null;
}

/** Что делает клавиша масштаба; null — клавиша не наша. */
export function zoomKey(key) {
  if (key === '+' || key === '=') return 'in';
  if (key === '-' || key === '_') return 'out';
  if (key === '0') return 'fit';
  if (key === '1') return 'actual';
  return null;
}

/** Подпись снизу: имя, размеры в пикселях и номер. Размеры неизвестны (картинка ещё грузится) — без них. */
export function captionParts(item, size, index, count) {
  return {
    name: item.name,
    dims: size && size.w > 0 && size.h > 0 ? `${size.w}×${size.h}` : '',
    counter: count > 1 ? `${index + 1} / ${count}` : '',
  };
}

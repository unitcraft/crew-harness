// Просмотрщик изображений (задача 192s): математика viewer.js и поведение viewer-ui.js на минимальном поддельном DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MIN_SCALE, MAX_SCALE, fitScale, fitState, clampScale, zoomAt, clampPan, panBy, stepScale, wheelFactor, formatPercent,
  stepIndex, toggleAt, isFit, isPannable, arrowAction, zoomKey, captionParts, toCentered, pinch, PAN_STEP,
} from '../viewer.js';
import { createViewer } from '../viewer-ui.js';
import { t } from '../strings.js';

const view = { w: 1000, h: 800 };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// ---- математика

test('границы масштаба 10%–800%', () => {
  assert.equal(MIN_SCALE, 0.1);
  assert.equal(MAX_SCALE, 8);
  assert.equal(clampScale(0.01), 0.1);
  assert.equal(clampScale(50), 8);
  assert.equal(clampScale(1.5), 1.5);
});

test('вписать: горизонтальная и вертикальная картинки, малая не увеличивается сверх натурального', () => {
  near(fitScale(view, { w: 2000, h: 500 }, 0), 0.5);   // упёрлась в ширину
  near(fitScale(view, { w: 500, h: 4000 }, 0), 0.2);   // упёрлась в высоту
  near(fitScale(view, { w: 100, h: 80 }, 0), 1);       // малая — 100%, не больше
  near(fitScale(view, { w: 1000, h: 800 }, 24), (800 - 48) / 800);   // по высоте теснее
  assert.equal(fitScale(view, { w: 0, h: 0 }), 1);
  assert.deepEqual(fitState(view, { w: 2000, h: 500 }), { scale: fitScale(view, { w: 2000, h: 500 }), x: 0, y: 0 });
  assert.equal(fitScale(view, { w: 1e6, h: 1e6 }), 0.1);   // не ниже 10%
});

test('зум в точке: точка картинки под курсором остаётся под курсором', () => {
  const size = { w: 3000, h: 2000 };
  const start = { scale: 0.5, x: 40, y: -25 };
  const p = { x: 210, y: -130 }; // курсор от центра окна
  // точка картинки под курсором до зума: (p - центр картинки) / scale
  const before = { u: (p.x - start.x) / start.scale, v: (p.y - start.y) / start.scale };
  for (const target of [0.8, 1, 2.5, 8]) {   // у каждого картинка шире окна: упора в центр нет
    const next = zoomAt(start, target, p.x, p.y, view, size);
    near(next.scale, target);
    near((p.x - next.x) / next.scale, before.u, 1e-7);
    near((p.y - next.y) / next.scale, before.v, 1e-7);
  }
  // за границы масштаба не выйти
  assert.equal(zoomAt(start, 99, 0, 0, view, size).scale, 8);
  assert.equal(zoomAt(start, 0, 0, 0, view, size).scale, 0.1);
});

test('зум в центр не двигает картинку; приближение от вписанного вокруг угла сдвигает её к углу', () => {
  const size = { w: 3000, h: 2000 };
  const fit = fitState(view, size);
  const c = zoomAt(fit, 1, 0, 0, view, size);
  assert.deepEqual([c.x, c.y], [0, 0]);
  const corner = toCentered(view, 0, 0); // левый верхний угол окна
  const z = zoomAt(fit, 1, corner.x, corner.y, view, size);
  assert.ok(z.x > 0 && z.y > 0, 'картинка уехала вправо-вниз: её левый верх остался у угла окна');
});

test('границы перетаскивания: меньшая оси картинка по центру, большая не уходит за экран целиком', () => {
  const small = clampPan({ scale: 1, x: 300, y: -300 }, view, { w: 200, h: 100 });
  assert.deepEqual([small.x, small.y], [0, 0]);
  const big = { w: 4000, h: 3000 };
  const far = clampPan({ scale: 1, x: 99999, y: -99999 }, view, big);
  // правый край картинки (центр + w/2) может уйти не дальше, чем оставить на экране KEEP_VISIBLE пикселей
  assert.ok(far.x < (4000 + 1000) / 2 && far.x > 1000 / 2, `x=${far.x}`);
  assert.ok(far.y > -(3000 + 800) / 2 && far.y < -800 / 2, `y=${far.y}`);
  // слева/справа симметрия
  assert.equal(clampPan({ scale: 1, x: -99999, y: 0 }, view, big).x, -far.x);
  // внутри границ — без изменений
  assert.deepEqual(clampPan({ scale: 1, x: 120, y: -80 }, view, big), { scale: 1, x: 120, y: -80 });
  // panBy клампит
  assert.equal(panBy({ scale: 1, x: 0, y: 0 }, 99999, 0, view, big).x, far.x);
});

test('кнопки: шаг 25%, колесо: вверх приближает, вниз отдаляет; проценты', () => {
  near(stepScale(1, 1), 1.25);
  near(stepScale(1.25, -1), 1);
  assert.equal(stepScale(8, 1), 8);
  assert.equal(stepScale(0.1, -1), 0.1);
  assert.ok(wheelFactor(-100) > 1);
  assert.ok(wheelFactor(100) < 1);
  near(wheelFactor(-100) * wheelFactor(100), 1);
  assert.ok(wheelFactor(-3, 1) > 1, 'построчная прокрутка (deltaMode 1) тоже работает');
  assert.equal(formatPercent(1.5), '150%');
  assert.equal(formatPercent(0.1), '10%');
  assert.equal(formatPercent(0.333), '33%');
  assert.equal(formatPercent(8), '800%');
});

test('смена картинки не зацикливается и не выходит за края', () => {
  assert.equal(stepIndex(0, 3, 1), 1);
  assert.equal(stepIndex(2, 3, 1), 2);
  assert.equal(stepIndex(0, 3, -1), 0);
  assert.equal(stepIndex(1, 3, -1), 0);
  assert.equal(stepIndex(0, 0, 1), 0);
});

test('двойной щелчок: вписано -> 100% в точке, иначе -> вписано; малая картинка -> 200%', () => {
  const size = { w: 3000, h: 2000 };
  const fit = fitState(view, size);
  assert.ok(isFit(fit, fit.scale));
  const p = { x: -200, y: 100 };
  const z = toggleAt(fit, p.x, p.y, view, size);
  near(z.scale, 1);
  near((p.x - z.x) / z.scale, (p.x - fit.x) / fit.scale, 1e-7);   // точка щелчка осталась на месте
  assert.ok(isPannable(z, view, size));
  assert.ok(!isPannable(fit, view, size));
  assert.ok(!isPannable({ scale: 2, x: 0, y: 0 }, view, { w: 100, h: 100 }), 'малая картинка, даже приближенная, окна не превышает');
  assert.ok(isPannable({ scale: 8, x: 0, y: 0 }, view, { w: 130, h: 50 }), '800% от 130 px = 1040 px шире окна в 1000 px');
  assert.deepEqual(toggleAt(z, 0, 0, view, size), fit);
  const tiny = { w: 100, h: 100 };
  assert.equal(toggleAt(fitState(view, tiny), 0, 0, view, tiny).scale, 2);
});

test('щипок: масштаб по отношению расстояний, точка между пальцами остаётся', () => {
  const size = { w: 3000, h: 2000 };
  const start = { scale: 0.5, x: 0, y: 0 };
  const mid = { x: 100, y: 50 };
  const z = pinch(start, 100, 200, mid, view, size);
  near(z.scale, 1);
  near((mid.x - z.x) / z.scale, (mid.x - start.x) / start.scale, 1e-7);
  assert.equal(pinch(start, 0, 200, mid, view, size), start);
});

test('клавиши: масштаб; стрелки — листание у вписанной, сдвиг у приближенной', () => {
  assert.equal(zoomKey('+'), 'in');
  assert.equal(zoomKey('='), 'in');
  assert.equal(zoomKey('-'), 'out');
  assert.equal(zoomKey('0'), 'fit');
  assert.equal(zoomKey('1'), 'actual');
  assert.equal(zoomKey('a'), null);
  assert.deepEqual(arrowAction('ArrowRight', { pannable: false, count: 3 }), { type: 'nav', dir: 1 });
  assert.deepEqual(arrowAction('ArrowLeft', { pannable: false, count: 3 }), { type: 'nav', dir: -1 });
  assert.equal(arrowAction('ArrowRight', { pannable: false, count: 1 }), null);
  assert.equal(arrowAction('ArrowUp', { pannable: false, count: 3 }), null);
  assert.deepEqual(arrowAction('ArrowLeft', { pannable: true, count: 3 }), { type: 'pan', dx: PAN_STEP, dy: 0 });
  assert.deepEqual(arrowAction('ArrowDown', { pannable: true, count: 1 }), { type: 'pan', dx: 0, dy: -PAN_STEP });
  assert.equal(arrowAction('x', { pannable: true, count: 3 }), null);
});

test('подпись: имя, W×H, «2 / 3»', () => {
  assert.deepEqual(captionParts({ name: 'a.png' }, { w: 640, h: 480 }, 1, 3), { name: 'a.png', dims: '640×480', counter: '2 / 3' });
  assert.deepEqual(captionParts({ name: 'a.png' }, null, 0, 1), { name: 'a.png', dims: '', counter: '' });
});

// ---- поддельный DOM

class El {
  constructor(tag, doc) {
    this.tag = tag; this.doc = doc; this.children = []; this.attrs = new Map(); this.listeners = {};
    this.dataset = {}; this.style = {}; this.className = ''; this.textContent = ''; this.parent = null;
    this.disabled = false; this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this.clientWidth = 1000; this.clientHeight = 800;
    this.focusCalls = 0;
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'hidden') this._hidden = true; }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  get hidden() { return this._hidden === true; }
  set hidden(v) { this._hidden = Boolean(v); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; }
  focus() { this.doc.activeElement = this; this.focusCalls += 1; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  find(cls) {
    if ((this.className || '').split(/\s+/).includes(cls)) return this;
    for (const c of this.children) { const r = c.find(cls); if (r) return r; }
    return null;
  }
  fire(type, props = {}) {
    const e = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...props };
    for (const fn of this.listeners[type] ?? []) fn(e);
    return e;
  }
  click() { return this.fire('click'); }
}

function fakeDoc() {
  const doc = { activeElement: null, listeners: {} };
  doc.createElement = (tag) => new El(tag, doc);
  doc.createElementNS = (ns, tag) => new El(tag, doc);
  doc.body = new El('body', doc);
  doc.addEventListener = (type, fn) => { (doc.listeners[type] ??= []).push(fn); };
  doc.defaultView = { innerWidth: 1000, innerHeight: 800, listeners: {}, addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); } };
  doc.key = (key, props = {}) => {
    const e = { type: 'keydown', key, target: doc.body, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...props };
    for (const fn of doc.listeners.keydown ?? []) fn(e);
    return e;
  };
  return doc;
}

function h(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}
const icon = (doc, id) => h(doc, 'svg', { 'data-icon': id });

function setup() {
  const doc = fakeDoc();
  const viewer = createViewer(doc, { h, icon });
  const box = doc.body.children[0];
  const img = box.find('viewer-img');
  const stage = box.find('viewer-stage');
  const loaded = (w, hh) => { img.naturalWidth = w; img.naturalHeight = hh; img.fire('load'); };
  const btn = (cls) => box.find(cls);
  return { doc, viewer, box, img, stage, loaded, btn, pct: box.find('viewer-pct'), cap: box.find('viewer-caption') };
}
const IMAGES = [{ src: 'a.png', name: 'a.png' }, { src: 'b.png', name: 'b.png' }, { src: 'c.png', name: 'c.png' }];
const pointer = (id, x, y, props = {}) => ({ pointerId: id, clientX: x, clientY: y, button: 0, ...props });

test('диалог: role, aria-modal, подпись по-русски; закрыт до открытия', () => {
  const { box, viewer } = setup();
  assert.equal(box.getAttribute('role'), 'dialog');
  assert.equal(box.getAttribute('aria-modal'), 'true');
  assert.match(box.getAttribute('aria-label'), /^Просмотр изображения/);
  assert.equal(box.hidden, true);
  assert.equal(viewer.isOpen(), false);
});

test('открытие: фокус внутрь, подпись с размерами и номером, вписанный масштаб; закрытие возвращает фокус', () => {
  const { doc, viewer, box, img, loaded, pct, cap } = setup();
  const opener = doc.createElement('button');
  viewer.open(IMAGES, 1, opener);
  assert.equal(box.hidden, false);
  assert.equal(doc.activeElement, box);
  assert.equal(img.getAttribute('src'), 'b.png');
  loaded(2000, 1000);
  assert.equal(cap.find('viewer-cap-dims').textContent, '2000×1000');
  assert.equal(cap.find('viewer-cap-count').textContent, '2 / 3');
  assert.equal(cap.find('viewer-cap-name').textContent, 'b.png');
  assert.equal(pct.textContent, '48%');   // (1000 - 48) / 2000
  assert.match(img.style.transform, /scale\(0\.476\)/);
  viewer.close();
  assert.equal(box.hidden, true);
  assert.equal(doc.activeElement, opener);
  assert.equal(img.getAttribute('src'), null);
});

test('узел возврата фокуса можно отдать функцией', () => {
  const { doc, viewer } = setup();
  const later = doc.createElement('button');
  viewer.open(IMAGES, 0, () => later);
  viewer.close();
  assert.equal(doc.activeElement, later);
});

test('Esc закрывает и не идёт дальше; пока закрыт — клавиши не трогаются', () => {
  const { doc, viewer, box } = setup();
  assert.equal(doc.key('Escape').defaultPrevented, false);
  viewer.open(IMAGES, 0, null);
  const e = doc.key('Escape');
  assert.equal(e.defaultPrevented, true);
  assert.equal(e.stopped, true);
  assert.equal(box.hidden, true);
});

test('кнопка «Закрыть», клик по тёмному фону закрывает; клик по картинке и перетаскивание — нет', () => {
  const { viewer, box, stage, img, loaded } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  stage.fire('pointerdown', pointer(1, 20, 20)); stage.fire('pointerup', pointer(1, 20, 20));
  assert.equal(box.hidden, true);
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  stage.fire('pointerdown', pointer(2, 500, 400, { target: img })); stage.fire('pointerup', pointer(2, 500, 400, { target: img }));
  assert.equal(box.hidden, false);
  viewer.close();
  viewer.open(IMAGES, 0, null);
  const closeBtn = box.children.find((c) => c.className === 'viewer-bar').children.at(-1);
  closeBtn.click();
  assert.equal(box.hidden, true);
});

test('клавиши масштаба: + − 1 0, проценты на панели', () => {
  const { doc, viewer, loaded, pct } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  const fit = viewer.snapshot().scale;
  doc.key('+');
  near(viewer.snapshot().scale, fit * 1.25);
  doc.key('-'); doc.key('-');
  near(viewer.snapshot().scale, fit / 1.25);
  doc.key('1');
  assert.equal(viewer.snapshot().scale, 1);
  assert.equal(pct.textContent, '100%');
  doc.key('0');
  near(viewer.snapshot().scale, fit);
  assert.equal(viewer.snapshot().fit, true);
  for (let i = 0; i < 40; i += 1) doc.key('+');
  assert.equal(viewer.snapshot().scale, 8);
  assert.equal(pct.textContent, '800%');
  for (let i = 0; i < 60; i += 1) doc.key('-');
  assert.equal(viewer.snapshot().scale, 0.1);
});

test('клавиши с ctrl/meta не перехватываются (зум браузера остаётся)', () => {
  const { doc, viewer, loaded } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  const before = viewer.snapshot().scale;
  assert.equal(doc.key('+', { ctrlKey: true }).defaultPrevented, false);
  assert.equal(viewer.snapshot().scale, before);
});

test('стрелки: у вписанной листают картинки, у приближенной двигают её; на краях не зацикливаются', () => {
  const { doc, viewer, img, loaded, cap } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  doc.key('ArrowLeft');
  assert.equal(viewer.snapshot().index, 0);
  doc.key('ArrowRight');
  assert.equal(viewer.snapshot().index, 1);
  assert.equal(img.getAttribute('src'), 'b.png');
  loaded(800, 600);
  assert.equal(cap.find('viewer-cap-dims').textContent, '800×600');
  assert.equal(viewer.snapshot().scale, 1);        // малая картинка вписана в 100%
  doc.key('ArrowRight'); loaded(3000, 2000);
  doc.key('ArrowRight');
  assert.equal(viewer.snapshot().index, 2);
  // приближаем — стрелки двигают
  doc.key('1');
  const x0 = viewer.snapshot().x;
  doc.key('ArrowLeft');
  assert.equal(viewer.snapshot().index, 2);
  assert.equal(viewer.snapshot().x, x0 + PAN_STEP);
  doc.key('0');
  doc.key('ArrowLeft');
  assert.equal(viewer.snapshot().index, 1);
});

test('смена картинки возвращает вписанный вид', () => {
  const { doc, viewer, loaded } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  doc.key('1');
  doc.key('ArrowRight'); // двигает, а не листает
  assert.equal(viewer.snapshot().index, 0);
  doc.key('0'); doc.key('ArrowRight'); loaded(1000, 4000);
  const s = viewer.snapshot();
  assert.equal(s.index, 1);
  near(s.scale, (800 - 48) / 4000);
  assert.deepEqual([s.x, s.y], [0, 0]);
});

test('колесо: центр масштабирования — курсор', () => {
  const { viewer, stage, loaded } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  const before = viewer.snapshot();
  const cursor = { x: 700, y: 300 }; // от левого верха окна
  const c = toCentered({ w: 1000, h: 800 }, cursor.x, cursor.y);
  const e = stage.fire('wheel', { clientX: cursor.x, clientY: cursor.y, deltaY: -240, deltaMode: 0 });
  assert.equal(e.defaultPrevented, true);
  const after = viewer.snapshot();
  assert.ok(after.scale > before.scale);
  near((c.x - after.x) / after.scale, (c.x - before.x) / before.scale, 1e-6);
  near((c.y - after.y) / after.scale, (c.y - before.y) / before.scale, 1e-6);
});

test('перетаскивание: у вписанной не двигает, у приближенной двигает; курсор «рука»', () => {
  const { doc, viewer, stage, loaded } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  stage.fire('pointerdown', pointer(1, 100, 100, { target: stage }));
  stage.fire('pointermove', pointer(1, 160, 130));
  assert.equal(viewer.snapshot().x, 0);
  stage.fire('pointerup', pointer(1, 160, 130));
  doc.key('1');
  assert.equal(stage.dataset.pan, 'grab');
  stage.fire('pointerdown', pointer(1, 100, 100));
  assert.equal(stage.dataset.pan, 'grabbing');
  stage.fire('pointermove', pointer(1, 160, 130));
  const s = viewer.snapshot();
  assert.deepEqual([s.x, s.y], [60, 30]);
  stage.fire('pointerup', pointer(1, 160, 130));
  assert.equal(stage.dataset.pan, 'grab');
  assert.equal(viewer.isOpen(), true, 'после перетаскивания окно не закрылось');
  // дальше границы не утащить
  stage.fire('pointerdown', pointer(1, 0, 0)); stage.fire('pointermove', pointer(1, 99999, 0));
  assert.ok(viewer.snapshot().x < (3000 + 1000) / 2);
});

test('щипок двумя пальцами приближает', () => {
  const { viewer, stage, loaded } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  const before = viewer.snapshot().scale;
  stage.fire('pointerdown', pointer(1, 450, 400)); stage.fire('pointerdown', pointer(2, 550, 400));
  stage.fire('pointermove', pointer(2, 650, 400));
  near(viewer.snapshot().scale, before * 2, 1e-9);
  stage.fire('pointerup', pointer(1, 450, 400)); stage.fire('pointerup', pointer(2, 650, 400));
  assert.equal(viewer.isOpen(), true, 'жест двумя пальцами окно не закрывает');
});

test('двойной щелчок: вписано -> 100%, ещё раз -> вписано', () => {
  const { viewer, stage, loaded } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  const fit = viewer.snapshot().scale;
  stage.fire('dblclick', { clientX: 300, clientY: 200 });
  assert.equal(viewer.snapshot().scale, 1);
  stage.fire('dblclick', { clientX: 300, clientY: 200 });
  near(viewer.snapshot().scale, fit);
});

test('кнопки панели: +, −, 1:1, вписать, предыдущая/следующая', () => {
  const { viewer, box, loaded, pct } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  const bar = box.children.find((c) => c.className === 'viewer-bar');
  const [out, , inn, actual, fit] = bar.children;
  const fitScaleNow = viewer.snapshot().scale;
  inn.click(); near(viewer.snapshot().scale, fitScaleNow * 1.25);
  out.click(); near(viewer.snapshot().scale, fitScaleNow);
  actual.click(); assert.equal(viewer.snapshot().scale, 1); assert.equal(pct.textContent, '100%');
  fit.click(); near(viewer.snapshot().scale, fitScaleNow);
  const prev = box.find('viewer-prev');
  const next = box.find('viewer-next');
  assert.equal(prev.disabled, true);
  next.click();
  assert.equal(viewer.snapshot().index, 1);
  assert.equal(prev.disabled, false);
  next.click();
  assert.equal(next.disabled, true);
  prev.click();
  assert.equal(viewer.snapshot().index, 1);
});

test('одна картинка: кнопок листания и номера нет', () => {
  const { viewer, box, loaded, cap } = setup();
  viewer.open([IMAGES[0]], 0, null); loaded(300, 200);
  assert.equal(box.find('viewer-prev').hidden, true);
  assert.equal(box.find('viewer-next').hidden, true);
  assert.equal(cap.find('viewer-cap-count').hidden, true);
});

test('Tab не выходит из диалога', () => {
  const { doc, viewer, box, loaded } = setup();
  viewer.open([IMAGES[0]], 0, null); loaded(3000, 2000);
  const bar = box.children.find((c) => c.className === 'viewer-bar');
  const last = bar.children.at(-1);
  last.focus();
  const e = doc.key('Tab');
  assert.equal(e.defaultPrevented, true);
  assert.equal(doc.activeElement, bar.children[0]);
  doc.key('Tab', { shiftKey: true });
  assert.equal(doc.activeElement, last);
});

test('картинка из кэша (complete) вписывается сразу, без события load', () => {
  const doc = fakeDoc();
  const viewer = createViewer(doc, { h, icon });
  const img = doc.body.children[0].find('viewer-img');
  Object.defineProperty(img, 'complete', { get: () => img.getAttribute('src') !== null });
  img.naturalWidth = 2000; img.naturalHeight = 1000;
  viewer.open(IMAGES, 0, null);
  assert.equal(viewer.snapshot().scale, 0.476);
});

test('изменение размера окна: вписанная остаётся вписанной, приближенная — на месте в границах', () => {
  const { doc, viewer, box, loaded } = setup();
  viewer.open(IMAGES, 0, null); loaded(3000, 2000);
  const stageEl = box.find('viewer-stage');
  stageEl.clientWidth = 500; stageEl.clientHeight = 400;
  for (const fn of doc.defaultView.listeners.resize) fn({});
  near(viewer.snapshot().scale, fitScale({ w: 500, h: 400 }, { w: 3000, h: 2000 }));
});

// ---- подключение к странице

test('в странице один просмотрщик: старый lightbox убран, миниатюры ленты и карточки открывают viewer', () => {
  const web = new URL('../', import.meta.url);
  const read = (n) => fs.readFileSync(new URL(n, web), 'utf8');
  assert.ok(!/createLightbox|lightbox/.test(read('attach-ui.js') + read('view.js') + read('app.css')));
  assert.match(read('view.js'), /createViewer\(doc, \{ h, icon \}\)/);
  assert.match(read('view.js'), /viewer\.open\(shown, at, button\)/);
  assert.match(read('view.js'), /onView: \(images, at, from\) => viewer\.open\(images, at, from\)/);
  assert.match(read('attach-ui.js'), /onView\(list\.map/);
  assert.match(read('app.css'), /--viewer-scrim: rgba\(0, 0, 0, \.85\)/);
  assert.equal(t('viewer.title'), 'Просмотр изображения');
});

test('превью карточки ввода — кнопка, открывающая просмотрщик со всеми приложенными', async () => {
  const { createAttachUi } = await import('../attach-ui.js');
  const doc = fakeDoc();
  doc.defaultView.URL = { createObjectURL: (b) => `blob:${b.tag}`, revokeObjectURL() {} };
  const calls = [];
  const ui = createAttachUi(doc, { h, icon, showError() {}, onChange() {}, onView: (...a) => calls.push(a) });
  ui.add([
    { name: 'a.png', type: 'image/png', size: 10, tag: 'a' },
    { name: 'b.png', type: 'image/png', size: 10, tag: 'b' },
  ]);
  const second = ui.row.children[1].children[0];
  assert.equal(second.className, 'attach-open');
  assert.equal(second.getAttribute('aria-label'), t('images.open', { name: 'b.png' }));
  second.click();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0].map((x) => x.name), ['a.png', 'b.png']);
  assert.equal(calls[0][1], 1);
  assert.equal(calls[0][2](), second);
  ui.add([{ name: 'c.png', type: 'image/png', size: 10, tag: 'c' }]);   // полоска перерисована: старого узла уже нет
  const redrawn = ui.row.children[1].children[0];
  assert.notEqual(redrawn, second);
  assert.equal(calls[0][2](), redrawn);
});

// fake-dom.mjs — крошечный DOM для проверок окон проектов без браузера и сторонних пакетов.
// Умеет ровно то, что нужно projects-ui.js: узлы, атрибуты, события с всплытием, простые селекторы,
// фокус, value/checked/hidden/disabled. Это не замена браузеру: полный прогон на странице — в самой проверке на моке.

class FakeEvent {
  constructor(type, init = {}) {
    Object.assign(this, { type, bubbles: true, defaultPrevented: false, stopped: false }, init);
  }

  preventDefault() { this.defaultPrevented = true; }

  stopPropagation() { this.stopped = true; }

  composedPath() { return this.path ?? []; }
}

class TextNode {
  constructor(text) { this.text = String(text); this.parentNode = null; }

  get textContent() { return this.text; }
}

function parseSimple(selector) {
  // один составной селектор: tag#id.class[attr][attr="v"]:not(:disabled):not([a="b"])
  const parts = { tag: '', id: '', classes: [], attrs: [], nots: [] };
  let rest = selector.trim();
  const tag = /^[a-z][a-z0-9-]*/i.exec(rest);
  if (tag) { parts.tag = tag[0].toLowerCase(); rest = rest.slice(tag[0].length); }
  while (rest.length > 0) {
    let m;
    if ((m = /^#([\w-]+)/.exec(rest))) parts.id = m[1];
    else if ((m = /^\.([\w-]+)/.exec(rest))) parts.classes.push(m[1]);
    else if ((m = /^\[([\w-]+)(?:="([^"]*)")?\]/.exec(rest))) parts.attrs.push([m[1], m[2]]);
    else if ((m = /^:not\((:disabled|\[[^\]]*\])\)/.exec(rest))) parts.nots.push(m[1]);
    else throw new Error(`fake-dom: селектор не поддержан: ${selector}`);
    rest = rest.slice(m[0].length);
  }
  return parts;
}

// цепочка потомков «a b c»: последний узел совпадает сам, остальные — среди предков по порядку
function parseChain(selector) { return selector.trim().split(/\s+/).map(parseSimple); }
function matchesChain(el, chain, root) {
  if (!matchesSimple(el, chain[chain.length - 1])) return false;
  let at = chain.length - 2;
  for (let n = el.parentNode; at >= 0 && n instanceof FakeElement && n !== root.parentNode; n = n.parentNode) {
    if (matchesSimple(n, chain[at])) at -= 1;
  }
  return at < 0;
}

function matchesSimple(el, p) {
  if (p.tag && el.tagName.toLowerCase() !== p.tag) return false;
  if (p.id && el.getAttribute('id') !== p.id) return false;
  if (!p.classes.every((c) => el.className.split(/\s+/).includes(c))) return false;
  if (!p.attrs.every(([k, v]) => (v === undefined ? el.hasAttribute(k) : el.getAttribute(k) === v))) return false;
  for (const n of p.nots) {
    if (n === ':disabled' ? el.disabled : matchesSimple(el, parseSimple(n))) return false;
  }
  return true;
}

export class FakeElement {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = [];
    this._value = '';
    this._checked = false;
    this.type = '';
  }

  get children() { return this.childNodes.filter((n) => n instanceof FakeElement); }

  get className() { return this.attrs.get('class') ?? ''; }

  set className(v) { this.attrs.set('class', String(v)); }

  get id() { return this.attrs.get('id') ?? ''; }

  get hidden() { return this.attrs.has('hidden'); }

  set hidden(v) { if (v) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }

  get disabled() { return this.attrs.has('disabled'); }

  set disabled(v) { if (v) this.attrs.set('disabled', ''); else this.attrs.delete('disabled'); }

  get checked() { return this._checked; }

  set checked(v) { this._checked = Boolean(v); }

  get title() { return this.attrs.get('title') ?? ''; }

  set title(v) { this.attrs.set('title', String(v)); }

  get dataset() {
    const el = this;
    return new Proxy({}, {
      get: (_, k) => el.attrs.get(`data-${k}`),
      set: (_, k, v) => { el.attrs.set(`data-${k}`, String(v)); return true; },
    });
  }

  get value() {
    if (this.tagName === 'SELECT') {
      const options = this.querySelectorAll('option');
      const hit = options.find((o) => o.getAttribute('value') === this._value);
      return hit ? this._value : (options[0] ? options[0].getAttribute('value') ?? '' : '');
    }
    return this._value;
  }

  set value(v) { this._value = String(v); }

  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }

  set textContent(v) { this.replaceChildren(new TextNode(v)); }

  setAttribute(k, v) {
    this.attrs.set(k, String(v));
    if (k === 'type') this.type = String(v);
    if (k === 'value') this._value = String(v);
  }

  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }

  hasAttribute(k) { return this.attrs.has(k); }

  removeAttribute(k) { this.attrs.delete(k); }

  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'string' ? new TextNode(n) : n;
      if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }

  replaceChildren(...nodes) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
    this.parentNode = null;
  }

  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  closest(selector) {
    const sels = selector.split(',').map(parseSimple);
    for (let n = this; n instanceof FakeElement; n = n.parentNode) if (sels.some((p) => matchesSimple(n, p))) return n;
    return null;
  }

  querySelectorAll(selector) {
    const sels = selector.split(/,(?![^(]*\))/).map(parseChain);
    const out = [];
    const walk = (el) => {
      for (const c of el.children) {
        if (sels.some((p) => matchesChain(c, p, this))) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  addEventListener(type, fn) { this.listeners.push({ type, fn }); }

  dispatchEvent(event) {
    event.target = event.target ?? this;
    event.path = [];
    for (let n = this; n; n = n.parentNode) event.path.push(n);
    for (const node of event.path) {
      for (const l of (node.listeners ?? []).filter((x) => x.type === event.type)) l.fn(event);
      if (event.stopped || !event.bubbles) break;
    }
    return !event.defaultPrevented;
  }

  focus() { this.ownerDocument.activeElement = this; }

  click() {
    if (this.disabled) return;
    if (this.tagName === 'INPUT' && this.type === 'checkbox') { this._checked = !this._checked; this.dispatchEvent(new FakeEvent('change')); }
    const ok = this.dispatchEvent(new FakeEvent('click', { detail: 1 }));
    if (ok && this.tagName === 'BUTTON' && (this.type === 'submit' || this.type === '')) {
      const form = this.closest('form');
      if (form) form.dispatchEvent(new FakeEvent('submit'));
    }
  }

  setSelectionRange() {}
}

export function createFakeDocument() {
  const doc = {
    listeners: [],
    parentNode: null,
    activeElement: null,
    createElement: (tag) => new FakeElement(doc, tag),
    createElementNS: (_ns, tag) => new FakeElement(doc, tag),
    createTextNode: (text) => new TextNode(text),
    addEventListener(type, fn) { doc.listeners.push({ type, fn }); },
    dispatchEvent(event) {
      event.target = event.target ?? doc;
      event.path = [doc];
      for (const l of doc.listeners.filter((x) => x.type === event.type)) l.fn(event);
      return !event.defaultPrevented;
    },
    contains: (node) => doc.body.contains(node) || node === doc.body,
  };
  doc.body = new FakeElement(doc, 'body');
  doc.documentElement = doc.body;
  doc.body.parentNode = doc;
  doc.body.listeners = [];
  return doc;
}

export const key = (name, extra = {}) => new FakeEvent('keydown', { key: name, ...extra });
export const input = () => new FakeEvent('input');
export const dbl = () => new FakeEvent('dblclick');
export const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0)); };
export const event = (type, init) => new FakeEvent(type, init);

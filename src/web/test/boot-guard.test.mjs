// Страж запуска (задача 192): ошибка при старте — видимый блок с кнопкой сброса, а не пустой экран; чтение хранилища не бросает.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeTheme } from '../state.js';

const source = fs.readFileSync(new URL('../boot-guard.js', import.meta.url), 'utf8');

function el(tag) {
  return {
    tag, children: [], style: {}, attrs: {}, listeners: {}, textContent: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
}

function boot({ booted = false, storage } = {}) {
  const body = el('body');
  const handlers = {};
  const timers = [];
  const reloads = [];
  const root = { getAttribute: (k) => (k === 'data-booted' && booted ? '1' : null) };
  const win = {
    document: { body, documentElement: root, createElement: el },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    location: { reload: () => reloads.push(1) },
    ...(storage ? { localStorage: storage, sessionStorage: storage } : {}),
  };
  vm.runInNewContext(source, { window: win, globalThis: win });
  return { win, body, handlers, timers, reloads };
}

const textOf = (node) => [node.textContent, ...node.children.map(textOf)].join('|');

test('исключение при старте: на странице блок «Ошибка запуска: …» с кнопкой сброса, второй блок не добавляется', () => {
  const { win, body } = boot();
  win.__crewBootError('что-то упало');
  win.__crewBootError('и ещё');
  assert.equal(body.children.length, 1);
  const block = body.children[0];
  assert.match(textOf(block), /Ошибка запуска: что-то упало/);
  assert.match(textOf(block), /Сбросить локальные данные и перезагрузить/);
  assert.equal(block.attrs.role, 'alert');
});

test('window error и unhandledrejection попадают в тот же блок', () => {
  const a = boot();
  a.handlers.error({ message: 'SyntaxError: Unexpected token' });
  assert.match(textOf(a.body.children[0]), /Unexpected token/);
  const b = boot();
  b.handlers.unhandledrejection({ reason: new Error('отказ промиса') });
  assert.match(textOf(b.body.children[0]), /отказ промиса/);
});

test('страница не объявила «запущена» за срок: блок; объявила — тишина', () => {
  const quiet = boot({ booted: true });
  quiet.timers[0].fn();
  assert.equal(quiet.body.children.length, 0);
  const loud = boot({ booted: false });
  loud.timers[0].fn();
  assert.match(textOf(loud.body.children[0]), /не запустилась/);
});

test('кнопка сброса чистит только наши ключи (crew-…) и перезагружает страницу', () => {
  const data = { 'crew-console-theme': 'dark', 'crew-draft': 'x', other: 'keep' };
  const storage = {
    get length() { return Object.keys(data).length; },
    key: (i) => Object.keys(data)[i],
    removeItem: (k) => { delete data[k]; },
  };
  const { win, body, reloads } = boot({ storage });
  win.__crewBootError('x');
  body.children[0].children[1].listeners.click();
  assert.deepEqual(Object.keys(data), ['other']);
  assert.equal(reloads.length, 1);
});

test('сброс без хранилища не бросает', () => {
  const { win, body, reloads } = boot();
  win.__crewBootError('x');
  body.children[0].children[1].listeners.click();
  assert.equal(reloads.length, 1);
});

test('сохранённая тема неверной формы читается как «система», а не бросает', () => {
  for (const bad of [null, undefined, '', '{"a":1}', 42, 'purple', {}, []]) assert.equal(normalizeTheme(bad), 'system');
  assert.equal(normalizeTheme('dark'), 'dark');
});

function memoryStorage() {
  const data = {};
  return {
    data,
    get length() { return Object.keys(data).length; },
    key: (i) => Object.keys(data)[i],
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

test('не загрузился скрипт страницы (503): один автоповтор через секунду, второй раз — блок, без цикла', () => {
  const storage = memoryStorage();
  const first = boot({ storage });
  first.handlers.error({ target: { tagName: 'SCRIPT', src: 'http://127.0.0.1:8100/app.js' } });
  assert.equal(first.body.children.length, 0);
  const reload = first.timers.find((x) => x.ms === 1000);
  assert.ok(reload, 'повтор поставлен на секунду');
  reload.fn();
  assert.equal(first.reloads.length, 1);
  assert.equal(storage.data['crew-boot-retry'], '1');
  const second = boot({ storage });
  second.handlers.error({ target: { tagName: 'SCRIPT', src: 'http://127.0.0.1:8100/app.js' } });
  assert.match(textOf(second.body.children[0]), /не загрузился http:\/\/127.0.0.1:8100\/app.js/);
  assert.equal(second.reloads.length, 0);
});

test('не загрузилась картинка или стили — не ошибка запуска; обычное исключение — блок', () => {
  const a = boot({ storage: memoryStorage() });
  a.handlers.error({ target: { tagName: 'IMG', src: 'x.png' } });
  assert.equal(a.body.children.length, 0);
  a.handlers.error({ target: a.win, message: 'boom' });
  assert.match(textOf(a.body.children[0]), /boom/);
});

// Плашка ошибки голосового ввода (задача 192): гаснет сама, не занимает место в потоке (проверка CSS).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createToast, TOAST_MS } from '../toast.js';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(web, 'app.css'), 'utf8');
// тело первого правила с таким селектором: от «селектор {» до закрывающей скобки
const rule = (selector) => {
  const from = css.indexOf(`
${selector} {`);
  assert.ok(from >= 0, `нет правила ${selector}`);
  const open = css.indexOf('{', from);
  return css.slice(open + 1, css.indexOf('}', open));
};

function rig() {
  const log = { shown: [], hid: 0, timers: [], cleared: [] };
  const timers = {
    setTimeout: (f, ms) => { log.timers.push({ f, ms }); return log.timers.length; },
    clearTimeout: (id) => log.cleared.push(id),
  };
  const toast = createToast({ show: (t) => log.shown.push(t), hide: () => { log.hid += 1; }, timers });
  return { toast, log };
}

test('плашка гаснет сама через 6 секунд', () => {
  const { toast, log } = rig();
  toast.show('нет доступа к микрофону');
  assert.equal(toast.visible(), true);
  assert.equal(TOAST_MS, 6000);
  assert.equal(log.timers[0].ms, 6000);
  log.timers[0].f();
  assert.equal(toast.visible(), false);
  assert.equal(log.hid, 1);
});

test('новая ошибка перезапускает отсчёт; закрытие по клику снимает таймер; повторное скрытие ничего не делает', () => {
  const { toast, log } = rig();
  toast.show('раз');
  toast.show('два');
  assert.deepEqual(log.shown, ['раз', 'два']);
  assert.deepEqual(log.cleared, [1], 'таймер первой ошибки снят');
  toast.hide();
  assert.equal(log.hid, 1);
  assert.deepEqual(log.cleared, [1, 2]);
  toast.hide();
  assert.equal(log.hid, 1);
});

test('CSS: плашка ошибки и счётчик очереди вынесены из потока, поле не сдвигается', () => {
  for (const selector of ['.voice-toast', '.queue-count']) assert.match(rule(selector), /position:\s*absolute/, selector);
  assert.match(rule('.composer'), /position:\s*relative/, 'плашка позиционируется от композера');
  assert.match(rule('.composer-status[data-empty="true"]'), /visibility:\s*hidden/, 'строка статуса держит место');
  assert.doesNotMatch(rule('.composer-status[data-empty="true"]'), /display:\s*none/);
});

test('CSS: плашка красная через токены темы, role=alert в разметке', () => {
  const r = rule('.voice-toast');
  assert.match(r, /color:\s*var\(--danger\)/);
  assert.match(r, /background:\s*var\(--danger-soft\)/);
  assert.match(fs.readFileSync(path.join(web, 'view.js'), 'utf8'), /class: 'voice-toast', role: 'alert'/);
});

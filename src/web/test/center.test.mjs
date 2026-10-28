// Центральная подложка (задача 190): в светлой теме центр белый (--center: #ffffff) и применён
// на центральную область (верхняя полоса, лента, правая колонка); в тёмной теме --center равен
// прежнему --bg, то есть тёмная тема не меняется; боковая панель остаётся на --side.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(web, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function tokens(selector) {
  const i = css.indexOf(`${selector} {`);
  assert.ok(i >= 0, `в app.css нет блока ${selector}`);
  const body = css.slice(i + selector.length + 2, css.indexOf('}', i));
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function rule(selector) {
  const i = css.indexOf(`${selector} {`);
  assert.ok(i >= 0, `в app.css нет правила ${selector}`);
  return css.slice(i + selector.length + 2, css.indexOf('}', i));
}

const light = tokens(':root');
const darkBySystem = tokens(':root:not([data-theme="light"])');
const darkByHand = tokens(':root[data-theme="dark"]');

test('в светлой теме центральная подложка белая: --center: #ffffff', () => {
  assert.equal(light['--center'], '#ffffff');
});

test('палитра светлой темы со скрина владельца (192): боковая панель #fafafa, выбранный пункт #e1e1e1', () => {
  assert.equal(light['--side'], '#fafafa');
  assert.equal(light['--active'], '#e1e1e1');
  assert.equal(light['--bg'], '#ffffff');
  assert.equal(light['--surface-2'], '#f3f3f3');
  assert.equal(light['--user-bg'], '#f3f3f3');
  assert.equal(light['--hover'], '#efefef');
  assert.equal(light['--border'], '#e5e5e5');
  assert.equal(light['--fg'], '#191919');
  assert.equal(light['--fg-muted'], '#666666');
  assert.equal(light['--danger'], '#a42528');
});

test('в тёмной теме --center равен прежнему --bg (тёмная тема не меняется)', () => {
  for (const [name, dark] of [['по системе', darkBySystem], ['по выбору', darkByHand]]) {
    assert.equal(dark['--center'], dark['--bg'], `тёмная ${name}: --center должен повторять --bg`);
    assert.notEqual(dark['--center'], '#ffffff', `тёмная ${name}: центр не должен быть белым`);
  }
});

test('--center применён на центральную область: верхняя полоса, лента, правая колонка', () => {
  for (const selector of ['.topbar', '.main', '.rail']) {
    assert.match(rule(selector), /background:\s*var\(--center\)/, `${selector} должен использовать var(--center)`);
  }
});

test('боковая панель не меняется: остаётся на var(--side)', () => {
  assert.match(rule('.side-col'), /background:\s*var\(--side\)/);
  assert.doesNotMatch(rule('.side-col'), /var\(--center\)/);
});

test('шапка чата: одна строка высотой не больше 48 px, без вертикальных отступов', () => {
  const r = rule('.topbar');
  const h = Number(/(?:^|[;\s])height:\s*(\d+)px/.exec(r)[1]);
  assert.ok(h >= 44 && h <= 48, `высота шапки ${h}px`);
  assert.match(r, /padding:\s*0 /);
  assert.doesNotMatch(css, /\.topbar \{ min-height/);
});

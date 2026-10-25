// Тема (задача 094): токены светлой и тёмной темы читаются из app.css; контраст текста не ниже 4,5:1;
// тёмная тема по системе и по ручному выбору — одни и те же значения.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(web, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector) {
  const i = css.indexOf(`${selector} {`);
  assert.ok(i >= 0, `в app.css нет блока ${selector}`);
  const body = css.slice(i + selector.length + 2, css.indexOf('}', i));
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };
const darkBySystem = { ...light, ...block(':root:not([data-theme="light"])') };

function luminance(hex) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// текст -> фоны, на которых он встречается
const PAIRS = {
  '--fg': ['--bg', '--side', '--center', '--surface', '--surface-2', '--active', '--hover'],
  '--fg-muted': ['--bg', '--side', '--center', '--surface', '--surface-2', '--active', '--hover'],
  '--accent': ['--bg', '--side', '--center', '--surface', '--surface-2'],
  '--accent-fg': ['--accent'],
  '--danger': ['--bg', '--side', '--center', '--surface', '--surface-2', '--active', '--danger-soft'],
  '--ok': ['--bg', '--side', '--center', '--surface'],
  '--warn': ['--bg', '--side', '--center', '--surface', '--surface-2', '--warn-soft'],
  '--code-fg': ['--code-bg'],
  '--user-fg': ['--user-bg'],
};

for (const [name, theme] of [['светлая', light], ['тёмная', dark]]) {
  test(`контраст текста и фона не ниже 4,5:1: ${name} тема`, () => {
    const bad = [];
    for (const [fg, bgs] of Object.entries(PAIRS)) {
      for (const bg of bgs) {
        assert.match(theme[fg] ?? '', /^#[0-9a-f]{6}$/i, `${fg} не задан шестизначным цветом`);
        assert.match(theme[bg] ?? '', /^#[0-9a-f]{6}$/i, `${bg} не задан шестизначным цветом`);
        const c = contrast(theme[fg], theme[bg]);
        if (c < 4.5) bad.push(`${fg} на ${bg}: ${c.toFixed(2)}`);
      }
    }
    assert.deepEqual(bad, []);
  });
}

test('тёмная тема по системе и по ручному выбору задают одни и те же значения', () => {
  assert.deepEqual(darkBySystem, dark);
  assert.notDeepEqual(dark, light, 'тёмная тема должна отличаться от светлой');
});

test('цели нажатия: токен --hit не меньше 40 px', () => {
  assert.match(light['--hit'], /^\d+px$/);
  assert.ok(parseInt(light['--hit'], 10) >= 40);
});

test('в app.css нет цветов вне блоков токенов (всё через var)', () => {
  const outside = css
    .replace(/:root[^{]*\{[^}]*\}/g, '')
    .replace(/@media[^{]*\{\s*(:root[^{]*\{[^}]*\}\s*)\}/g, '');
  const hex = outside.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  const fn = outside.match(/\brgba?\(/g) ?? [];
  assert.deepEqual([...hex, ...fn], []);
});

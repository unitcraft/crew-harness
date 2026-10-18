// Проверки strings.js: все тексты интерфейса по-русски, в одном файле, все ключи живые.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S, t, fmt } from '../strings.js';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = fs.readdirSync(web)
  .filter((f) => f.endsWith('.js') && f !== 'strings.js' && f !== 'serve.mjs')
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(web, f), 'utf8') }));

test('все ключи strings.js где-то использованы (литералом в другом модуле)', () => {
  const unused = Object.keys(S).filter((key) => !sources.some((s) => s.text.includes(`'${key}'`)));
  assert.deepEqual(unused, []);
});

test('каждый t(\'ключ\') в коде ссылается на существующий ключ', () => {
  const missing = [];
  for (const s of sources) {
    for (const m of s.text.matchAll(/\bt\(\s*'([^']+)'/g)) if (!(m[1] in S)) missing.push(`${s.name}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('значения непусты и по-русски (кроме названия агента)', () => {
  const latinOnly = new Set(['agent.opencode']);
  for (const [key, value] of Object.entries(S)) {
    assert.equal(typeof value, 'string', key);
    assert.ok(value.length > 0, key);
    if (!latinOnly.has(key)) assert.match(value, /[А-Яа-яЁё]/, `нет кириллицы: ${key}`);
  }
});

test('подстановки {имя} в t и fmt; неизвестный ключ виден, а не пуст', () => {
  assert.equal(fmt('через {seconds} с', { seconds: 5 }), 'через 5 с');
  assert.equal(fmt('без {нет}', {}), 'без {нет}');
  assert.equal(t('conn.retry', { seconds: 7 }), S['conn.retry'].replace('{seconds}', '7'));
  assert.match(t('нет.такого'), /нет\.такого/);
});

test('index.html без видимого текста: все надписи приходят из strings.js', () => {
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, '');
  assert.equal(visible, '');
});

// Спрайт значков встроен в index.html (задача 192): значки не зависят от отдельного запроса icons.svg.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const web = new URL('../', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, web), 'utf8');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const symbolsOf = (text) => [...text.matchAll(/<symbol [\s\S]*?<\/symbol>/g)].map((m) => norm(m[0]));

const html = read('index.html');
const jsFiles = fs.readdirSync(web).filter((n) => n.endsWith('.js'));

test('каждый значок i-… из кода есть во встроенном спрайте index.html', () => {
  const inline = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map((m) => m[1]));
  const used = new Set();
  for (const name of jsFiles) {
    const text = read(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of text.matchAll(/'(i-[\w-]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 15, 'значки найдены');
  const missing = [...used].filter((id) => !inline.has(id));
  assert.deepEqual(missing, []);
});

test('встроенный спрайт совпадает с icons.svg, а ссылки на значки — внутри документа', () => {
  assert.deepEqual(symbolsOf(html), symbolsOf(read('icons.svg')));
  assert.match(read('view.js'), /href: `#\$\{id\}`/);
  assert.ok(!/icons\.svg#/.test(read('view.js')));
  assert.match(html, /<svg class="sprite" width="0" height="0" aria-hidden="true"/);
});

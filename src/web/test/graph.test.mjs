// Граф статических импортов страницы (задача 192): реальная страница не тянет mock.js ни прямо, ни через другие модули;
// режим ?mock=1 берёт его динамическим import() внутри app.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('../', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, dir), 'utf8');

function staticImports(name) {
  const text = read(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]\.\/([\w.-]+\.js)['"]/gm)].map((m) => m[1]);
}

function closure(entry) {
  const seen = new Set();
  const walk = (n) => { if (seen.has(n)) return; seen.add(n); staticImports(n).forEach(walk); };
  walk(entry);
  return seen;
}

test('app.js в реальном режиме не зависит от mock.js: ни прямо, ни через другие модули', () => {
  const graph = closure('app.js');
  assert.ok(!graph.has('mock.js'), [...graph].join(', '));
  for (const needed of ['view.js', 'state.js', 'transport.js', 'queue.js', 'voice.js', 'labels-ru.js']) assert.ok(graph.has(needed), needed);
});

test('mock.js подгружается только динамически и только в режиме mock', () => {
  const app = read('app.js');
  assert.match(app, /if \(picked\.mode === 'mock'\) \{\s*mock = await import\('\.\/mock\.js'\);/);
  assert.ok(!/from '\.\/mock\.js'/.test(app));
});

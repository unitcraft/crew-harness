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

test('index.html заранее просит все модули страницы (modulepreload), и список совпадает с графом импортов app.js: водопад не растягивает загрузку', () => {
  const html = read('index.html');
  const preload = [...html.matchAll(/<link rel="modulepreload" href="([\w.-]+\.js)">/g)].map((m) => m[1]).sort();
  const graph = [...closure('app.js')].sort();
  assert.deepEqual(preload, graph);
  assert.ok(!preload.includes('mock.js'), 'mock.js только по ?mock=1');
  assert.ok(preload.length >= 20);
});

test('front: предел соединений поднят (по умолчанию Polaris их 16, и несколько вкладок исчерпывали его), Keep-Alive короче простоя сервера, живые страницы пингуются', () => {
  const front = fs.readFileSync(new URL('../../server/front/front.nv', import.meta.url), 'utf8');
  assert.match(front, /policy\.max_inflight\(1024\)/);
  assert.match(front, /resp\.header\("Keep-Alive", "timeout=50"\)/);
  assert.match(front, /const PING_EVERY_MS = 25000/);
  assert.match(front, /ws_out\(4, ""\)/);
  assert.match(front, /frame_bytes\(OpCode\.Ping, \[\]u8\.new\(\)\)/);
});

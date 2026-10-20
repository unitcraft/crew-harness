// Real app.js browser regression probe. Usage: node test/app-browser.mjs <playwright-module> <chrome-executable> [--red <baseline-app.js>]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [playwrightPath, chromePath, redFlag, baselinePath] = process.argv.slice(2);
assert.ok(playwrightPath && chromePath, 'pass portable Playwright module and Chrome executable paths');
const { chromium } = await import(pathToFileURL(path.resolve(playwrightPath)).href);
const red = redFlag === '--red';
if (red) assert.ok(baselinePath, '--red requires the pre-fix app.js fixture');
const offline = redFlag === '--offline';
const noRegistry = redFlag === '--no-registry';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/agents') {
    if (noRegistry) { res.writeHead(503).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ agents: [{ id: 'opencode', label: 'OpenCode' }, { id: 'kimi', label: 'Kimi' }] }));
    return;
  }
  const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(web, name);
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, {
    'content-type': name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'self'; connect-src 'self' ws://127.0.0.1:*",
  });
  res.end(name === 'app.js' && red ? fs.readFileSync(baselinePath) : fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-proxy-server'] });
try {
  const page = await browser.newPage();
  const errors = [];
  const frames = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.routeWebSocket(`ws://127.0.0.1:${port}/ws`, (socket) => {
    socket.onMessage((raw) => frames.push(JSON.parse(String(raw))));
    globalThis.__appSocket = socket;
    if (offline) socket.close();
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'commit' });
  if (noRegistry) {
    await page.getByRole('button', { name: 'Новая сессия', exact: true }).click();
    await page.locator('#new-agent').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#new-agent option').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Создать' }).isDisabled(), true);
    assert.match(await page.locator('#side').textContent(), /Не удалось загрузить список агентов сервера/);
    console.log(JSON.stringify({ verdict: 'REGISTRY unavailable safely', createDisabled: true, agents: 0 }));
    process.exitCode = 0;
  } else {
  await page.getByRole('button', { name: 'Новая сессия', exact: true }).click();
  await page.locator('#new-agent').selectOption('opencode');
  await page.locator('#new-name').fill('browser probe');
  await page.getByRole('button', { name: 'Создать' }).click();
  if (red) {
    await page.waitForTimeout(200);
    assert.ok(errors.some((message) => message.includes('transport is not defined')), JSON.stringify({ errors, frames }));
    assert.equal(frames.length, 0);
    assert.equal(await page.locator('#new-agent').isVisible(), true);
    console.log(JSON.stringify({ verdict: 'RED confirmed', errors, websocketFramesSent: frames.length, formStillVisible: true }));
  } else if (offline) {
    await page.waitForTimeout(100);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(frames.length, 0);
    assert.equal(await page.locator('#new-agent').isVisible(), true, 'failed create must keep the form open');
    assert.notEqual(await page.locator('#status').textContent(), '', 'failed create must report unavailable transport');
    console.log(JSON.stringify({ verdict: 'OFFLINE refused', errors, websocketFramesSent: frames.length, formStillVisible: true, status: await page.locator('#status').textContent() }));
  } else {
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(frames.length, 1);
    const created = frames[0];
    assert.equal(created.kind, 'session_created');
    assert.equal(created.input.agent, 'opencode');
    globalThis.__appSocket?.send(JSON.stringify({ id: 'e1', trace: created.trace, step: 0, kind: 'session_created', input: { name: 'browser probe', agent: 'opencode' }, time: Date.now() }));
    await page.waitForFunction(() => document.querySelector('.chat:not([hidden])'));
    assert.equal(await page.locator('#new-agent').isVisible(), false, 'successful create closes the form');
    await page.locator('#composer-input').fill('safe test message');
    await page.getByRole('button', { name: 'Отправить' }).click();
    await page.waitForFunction(() => document.querySelector('#composer-input')?.value === '');
    assert.equal(frames[1].kind, 'user_message');
    assert.equal(frames[1].input.text, 'safe test message');
    globalThis.__appSocket?.send(JSON.stringify(frames[1]));
    globalThis.__appSocket?.send(JSON.stringify({ id: 'e2', trace: created.trace, step: 2, kind: 'permission_request', input: { turn: frames[1].input.turn, request: 'approval-1', action: 'safe test action', detail: 'probe only' }, time: Date.now() }));
    await page.getByRole('button', { name: 'Разрешить' }).click();
    assert.equal(frames[2].kind, 'permission_decision');
    assert.deepEqual(frames[2].input, { request: 'approval-1', decision: 'allow' });
    globalThis.__appSocket?.send(JSON.stringify(frames[2]));
    globalThis.__appSocket?.send(JSON.stringify({ id: 'e3', trace: created.trace, step: 4, kind: 'agent_done', input: { turn: frames[1].input.turn }, time: Date.now() }));
    await page.locator('#composer-input').fill('cancel probe');
    await page.getByRole('button', { name: 'Отправить' }).click();
    globalThis.__appSocket?.send(JSON.stringify(frames[3]));
    globalThis.__appSocket?.send(JSON.stringify({ id: 'e4', trace: created.trace, step: 6, kind: 'agent_chunk', input: { turn: frames[3].input.turn, text: 'working' }, time: Date.now() }));
    await page.getByRole('button', { name: 'Отмена хода' }).click();
    assert.equal(frames[4].kind, 'cancel');
    assert.equal(frames[4].trace, created.trace);
    // Registry choices are live agents (no ?mock=1); select Kimi and verify its ID is preserved too.
    await page.getByRole('button', { name: 'Новая сессия', exact: true }).click();
    await page.locator('#new-agent').selectOption('kimi');
    await page.getByRole('button', { name: 'Создать' }).click();
    assert.equal(frames[5].kind, 'session_created');
    assert.equal(frames[5].input.agent, 'kimi');
    console.log(JSON.stringify({ verdict: 'GREEN', errors, frames }));
  }
  }
} finally {
  await browser.close();
  server.close();
}

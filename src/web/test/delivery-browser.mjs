// Isolated real-browser probe; no connection to a user's service or session.
// node src/web/test/delivery-browser.mjs <playwright-core/index.mjs> <chrome.exe>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [modulePath, chromePath] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(modulePath).href);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const api = {
    '/api/agents': { agents: [{ id: 'opencode', label: 'OpenCode' }] },
    '/api/presets': { presets: [] }, '/api/projects': { projects: [] },
    '/api/result-repositories': { repositories: [] },
  };
  if (url.pathname in api) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(api[url.pathname])); return; }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const page = await browser.newPage();
  const frames = [], errors = [];
  let socket;
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(`ws://127.0.0.1:${server.address().port}/ws`, ws => {
    socket = ws;
    ws.onMessage(raw => frames.push(JSON.parse(String(raw))));
    ws.send(JSON.stringify({ id: 'created', trace: 's', step: 0, kind: 'session_created', input: { name: 'Изолированная проверка 260', agent: 'opencode' }, time: 1 }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/#s=s`);
  const input = page.locator('#composer-input');
  await input.fill('исчезавшее сообщение');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#composer-input').value === '');
  await page.locator('.item-delivery').waitFor();
  assert.equal(frames.length, 1);
  assert.match(await page.locator('.item-delivery').textContent(), /исчезавшее сообщение/);
  socket.send(JSON.stringify({ id: 'synthetic-error', trace: 's', step: 1, kind: 'error', input: { turn: '', message: 'cannot be started: Authorization: Bearer secret260' }, time: 2 }));
  await page.getByText('Не удалось запустить агента. Проверьте установленный агент и его настройки.', { exact: true }).first().waitFor();
  // карточка сворачивается в строку; свёрнутость переживает перерисовку страницы без перезагрузки
  const errCard = page.locator('.delivery-error', { hasText: 'Не удалось запустить агента' });
  const errHead = errCard.locator('.delivery-head');
  assert.equal(await errHead.getAttribute('aria-expanded'), 'true');
  await errHead.click();
  assert.equal(await errHead.getAttribute('aria-expanded'), 'false');
  await errCard.locator('.delivery-body').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.delivery-error', { hasText: 'Не удалось запустить агента' }).locator('.delivery-head').getAttribute('aria-expanded'), 'false');
  await page.reload();
  await page.locator('.item-delivery').first().waitFor();
  // после перезагрузки страницы карточка снова раскрыта по умолчанию: чужое состояние не наследуется
  assert.equal(await page.locator('.delivery-error', { hasText: 'Не удалось запустить агента' }).locator('.delivery-head').getAttribute('aria-expanded'), 'true');
  assert.equal(frames.length, 1, 'reload must not replay a message');
  const saved = page.locator('.item-delivery').filter({ hasText: 'исчезавшее сообщение' });
  assert.match(await saved.textContent(), /Доставка неизвестна/);
  assert.equal(await saved.getByRole('button', { name: 'Повторить', exact: true }).isDisabled(), true);
  await input.fill('новый черновик');
  await saved.getByRole('button', { name: 'Вернуть в поле ввода', exact: true }).click();
  assert.equal(await input.inputValue(), 'исчезавшее сообщение\n\nновый черновик');
  await page.reload();
  await input.waitFor();
  assert.equal(await input.inputValue(), 'исчезавшее сообщение\n\nновый черновик');
  assert.doesNotMatch(await page.locator('#main').textContent(), /secret260|Bearer/);
  socket.send(JSON.stringify({ id: 'accepted-user', trace: 's', step: 2, kind: 'user_message', input: { turn: 'engine-turn', text: 'исчезавшее сообщение' }, time: 3 }));
  socket.send(JSON.stringify({ id: 'receipt', trace: 's', step: 3, kind: 'message_delivery', input: { client_id: frames[0].id, accepted: true, turn: 'engine-turn' }, time: 4 }));
  await saved.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.item-user').count(), 1);
  assert.equal(frames.length, 1);
  socket.send(JSON.stringify({ id: 'turn-error', trace: 's', step: 4, kind: 'error', input: { turn: 'engine-turn', message: 'network failure secret260' }, time: 5 }));
  await page.getByText('Сообщение принято сервером, но агент не завершил обработку.', { exact: false }).first().waitFor();
  socket.send(JSON.stringify({ id: 'late-answer', trace: 's', step: 5, kind: 'agent_chunk', input: { turn: 'engine-turn', text: 'поздний успешный ответ' }, time: 6 }));
  socket.send(JSON.stringify({ id: 'late-done', trace: 's', step: 6, kind: 'agent_done', input: { turn: 'engine-turn' }, time: 7 }));
  await page.getByText('поздний успешный ответ', { exact: true }).waitFor();
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('crew-console-delivery-v1') || '[]').some(r => r.turn === 'engine-turn'));
  await page.reload();
  await input.waitFor();
  assert.equal(await page.getByText('Сообщение принято сервером, но агент не завершил обработку.', { exact: false }).count(), 0);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByRole('button', { name: 'Новая сессия в проекте Без проекта', exact: true }).click();
  await input.fill('первое сообщение без подтверждения создания');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await page.locator('.item-delivery').filter({ hasText: 'первое сообщение без подтверждения создания' }).waitFor();
  const beforeReload = frames.length;
  assert.equal(new URL(page.url()).hash, '');
  await page.reload();
  await page.locator('.chat:not([hidden]) .item-delivery').filter({ hasText: 'первое сообщение без подтверждения создания' }).waitFor();
  assert.equal(frames.length, beforeReload, 'a failed first create must reopen its local copy without resending');
  assert.deepEqual(errors, []);
  console.log('260: browser GREEN — loss/reload, safe restore, persistent draft/error, foldable error card, late receipt, no duplicate or secrets');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

// Usage: node src/web/test/agent-choice-browser.mjs <playwright-core> <chrome> [isolated-url]
// Only a local draft is created; no prompt is sent to an agent.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const [modulePath, executablePath, url = 'http://127.0.0.1:8103/'] = process.argv.slice(2);
const { chromium } = require(modulePath);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: /Новая сессия/ }).first().click();
  const family = page.locator('.status-group button').first();
  await family.waitFor();
  assert.equal(await family.getAttribute('aria-disabled'), 'true');
  // Playwright locator.click refuses aria-disabled, while a real mouse must still
  // reach the explanatory button (it has no native disabled attribute).
  const box = await family.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByText(/В настройках сервера доступна одна семья/).waitFor();
  const effort = page.locator('.status-group button').last();
  await effort.focus(); await page.keyboard.press('Enter');
  const reason = await effort.getAttribute('title');
  await page.getByText(reason, { exact: true }).waitFor();
  await family.focus(); await page.keyboard.press('Space');
  await page.getByText(/В настройках сервера доступна одна семья/).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, mouse: true, enter: true, space: true, errors }));
} finally { await browser.close(); }

// Проверка страницы: настоящая папка чиста, а на нарушении проверка краснеет (красные пробы).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPage } from './page-check.mjs';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Копия страницы (без тестов) во временной папке: пробу можно портить, не трогая настоящую.
function withCopy(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-page-'));
  try {
    for (const f of fs.readdirSync(web)) {
      const src = path.join(web, f);
      if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(dir, f));
    }
    mutate(dir);
    return checkPage(dir).problems;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const edit = (dir, name, fn) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8')));
};

test('настоящая страница чиста', () => {
  const { problems, stats } = checkPage(web);
  assert.deepEqual(problems, []);
  assert.ok(stats.used > 10, 'переменных темы должно быть использовано заметно');
  assert.ok(stats.modules >= 6);
});

test('проба: переименован app.js — краснеет', () => {
  const problems = withCopy((d) => fs.renameSync(path.join(d, 'app.js'), path.join(d, 'app2.js')));
  assert.ok(problems.some((p) => p.includes('app.js')), problems.join('\n'));
});

test('проба: ссылка на несуществующий файл в index.html — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'index.html', (s) => s.replace('app.js', 'нет-такого.js')));
  assert.ok(problems.some((p) => p.includes('нет-такого.js')), problems.join('\n'));
});

test('проба: убрана переменная темы — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'app.css', (s) => s.replaceAll('--bg:', '--bg-gone:')));
  assert.ok(problems.some((p) => p.includes('var(--bg)')), problems.join('\n'));
});

test('проба: внешний ресурс (CDN) — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'index.html', (s) => s.replace('</head>', '<link rel="stylesheet" href="https://cdn.example.com/x.css"></head>')));
  assert.ok(problems.some((p) => p.includes('внешняя ссылка')), problems.join('\n'));
});

test('проба: внешний адрес в скрипте и ws:// — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'app.js', (s) => `${s}\nconst x = 'ws://93.184.216.34/steal';\n`));
  assert.ok(problems.some((p) => p.includes('внешняя ссылка')), problems.join('\n'));
});

test('проба: встроенные <style>, <script>, onclick и style="" — краснеет по каждому', () => {
  for (const bit of ['<style>a{}</style>', '<script>1</script>', '<div onclick="x()"></div>', '<div style="color:red"></div>']) {
    const problems = withCopy((d) => edit(d, 'index.html', (s) => s.replace('</body>', `${bit}</body>`)));
    assert.ok(problems.length > 0, bit);
  }
});

test('проба: innerHTML в модуле — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'view.js', (s) => `${s}\nnode.innerHTML = event.input.text;\n`));
  assert.ok(problems.some((p) => p.includes('innerHTML')), problems.join('\n'));
});

test('проба: импорт несуществующего модуля — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'app.js', (s) => `import './ghost.js';\n${s}`));
  assert.ok(problems.some((p) => p.includes('ghost.js')), problems.join('\n'));
});

test('проба: убрана тёмная тема — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'app.css', (s) => s.replaceAll('prefers-color-scheme', 'prefers-contrast')));
  assert.ok(problems.some((p) => p.includes('тёмной')), problems.join('\n'));
});

test('комментарий о запретном не считается нарушением', () => {
  const problems = withCopy((d) => {
    edit(d, 'index.html', (s) => s.replace('<head>', '<head><!-- нельзя: <style>, <script>, https://cdn.example.com -->'));
    edit(d, 'app.js', (s) => `// нельзя innerHTML и https://cdn.example.com\n${s}`);
  });
  assert.deepEqual(problems, []);
});

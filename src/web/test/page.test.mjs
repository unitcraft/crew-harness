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
  assert.ok(stats.icons >= 15, 'в icons.svg должен быть набор значков');
  assert.ok(stats.iconRefs >= 15, 'значки должны использоваться в модулях');
});

test('icons.svg найден, каждый значок из модулей в нём есть', () => {
  assert.ok(fs.existsSync(path.join(web, 'icons.svg')));
  const sprite = fs.readFileSync(path.join(web, 'icons.svg'), 'utf8');
  assert.match(sprite, /<symbol id="i-/);
  assert.doesNotMatch(sprite, /<script|<image|href\s*=\s*["']https?:/i);
});

test('проба: нет icons.svg — краснеет', () => {
  const problems = withCopy((d) => fs.rmSync(path.join(d, 'icons.svg')));
  assert.ok(problems.some((p) => p.includes('icons.svg')), problems.join('\n'));
});

test('проба: значок из модуля без символа в спрайте — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'view.js', (s) => `${s}\nconst ghost = 'i-ghost-icon';\n`));
  assert.ok(problems.some((p) => p.includes('i-ghost-icon')), problems.join('\n'));
});

test('проба: внешняя ссылка внутри icons.svg — краснеет, пространство имён xmlns — нет', () => {
  const problems = withCopy((d) => edit(d, 'icons.svg', (s) => s.replace('</svg>', '<use href="https://cdn.example.com/x.svg#a"/></svg>')));
  assert.ok(problems.some((p) => p.includes('внешняя ссылка')), problems.join('\n'));
  assert.deepEqual(withCopy(() => {}), []);
});

test('проба: имя образца в интерфейсе — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'strings.js', (s) => `${s}\n// Claude\n`));
  assert.ok(problems.some((p) => p.includes('имя образца')), problems.join('\n'));
});

test('проба: нет theme.js, на который ссылается index.html — краснеет', () => {
  const problems = withCopy((d) => fs.rmSync(path.join(d, 'theme.js')));
  assert.ok(problems.some((p) => p.includes('theme.js')), problems.join('\n'));
});

test('проба: переименован app.js — краснеет', () => {
  const problems = withCopy((d) => fs.renameSync(path.join(d, 'app.js'), path.join(d, 'app2.js')));
  assert.ok(problems.some((p) => p.includes('app.js')), problems.join('\n'));
});

test('проба: ссылка на несуществующий файл в index.html — краснеет', () => {
  const problems = withCopy((d) => edit(d, 'index.html', (s) => s.replace('src="app.js"', 'src="нет-такого.js"')));
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

test('страница не скроллится: html и body без прокрутки, корень по высоте окна, строка сетки не растёт от содержимого', () => {
  const css = fs.readFileSync(path.join(web, 'app.css'), 'utf8');
  assert.match(css, /html, body \{ height: 100%; margin: 0; overflow: hidden; \}/);
  const app = css.match(/\n\.app \{([^}]*)\}/)[1];
  assert.match(app, /height: 100vh;\s*height: 100dvh;/);
  assert.match(app, /grid-template-rows: minmax\(0, 1fr\)/);
  assert.ok(!/min-height: 100(vh|dvh)/.test(css), 'нигде нет min-height: 100vh');
  assert.match(css, /\.log \{ flex: 1; min-height: 0; overflow-y: auto; \}/);
});

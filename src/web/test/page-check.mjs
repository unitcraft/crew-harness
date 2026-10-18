// Проверка каркаса страницы (аналог check-page.py образца, на Node): всё, что ломает страницу молча.
//   * внешний ресурс — запрещён правилом страницы, и CSP его блокирует;
//   * встроенный <style>/<script>/обработчик/style="" — CSP отказывает, страница пустая;
//   * локальный href/src/url()/import на несуществующий файл — тихий 404 или белый экран;
//   * var(--x) без определения — свойство молча пропадает;
//   * innerHTML и родня — вставка разметки из данных события;
//   * значок из модуля без символа в icons.svg — пустое место на странице;
//   * имя образца в файлах страницы — интерфейс не должен нести чужое название.
// Запуск руками: node src/web/test/page-check.mjs [папка]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Имя пространства имён SVG (createElementNS) — не адрес, к которому ходит страница.
const SVG_NS = 'http://www.w3.org/2000/svg';

const REQUIRED = ['index.html', 'app.css', 'app.js', 'icons.svg'];

const EXTERNAL = /(?:(?:https?|wss?):)?\/\/(?!\s)(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9A-Fa-f:]+\]|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

const HANDLERS = ['onclick', 'onload', 'onerror', 'onsubmit', 'onchange', 'oninput', 'onmouseover', 'onmouseout',
  'onfocus', 'onblur', 'onkeydown', 'onkeyup', 'onkeypress', 'ondblclick', 'oncontextmenu', 'onwheel',
  'onscroll', 'ontoggle', 'onanimationend', 'ontransitionend'];

// Вставка разметки и выполнение строк: в модулях страницы им не место.
const DANGEROUS_JS = [
  [/\.innerHTML\b/, 'innerHTML'],
  [/\.outerHTML\b/, 'outerHTML'],
  [/\binsertAdjacentHTML\b/, 'insertAdjacentHTML'],
  [/\bdocument\.write\b/, 'document.write'],
  [/\beval\s*\(/, 'eval('],
  [/\bnew\s+Function\b/, 'new Function'],
  [/setAttribute\(\s*['"]style['"]/, 'setAttribute("style")'],
  [/\bcreateContextualFragment\b/, 'createContextualFragment'],
  [/\bDOMParser\b/, 'DOMParser'],
];

const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\w\\])\/\/.*$/gm, '$1');

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

export function checkPage(webDir) {
  const web = path.resolve(webDir);
  const problems = [];
  const read = (name) => fs.readFileSync(path.join(web, name), 'utf8');

  for (const name of REQUIRED) {
    const f = path.join(web, name);
    if (!fs.existsSync(f)) problems.push(`${name}: файла нет — страница без него не работает`);
    else if (fs.statSync(f).size === 0) problems.push(`${name}: файл пуст`);
  }
  if (problems.length) return { problems, stats: { web } };

  const html = read('index.html');
  const sprite = read('icons.svg');
  const css = read('app.css');
  const jsNames = fs.readdirSync(web).filter((f) => f.endsWith('.js')).sort();
  const markup = stripHtmlComments(html);
  const cssClean = stripCssComments(css);

  // 1. внешние ресурсы
  // xmlns — не ссылка, а имя пространства имён: из проверки внешних адресов он исключён
  const spriteClean = stripHtmlComments(sprite).replace(/\sxmlns(?::\w+)?\s*=\s*["'][^"']*["']/g, '');
  const scan = [['index.html', markup], ['app.css', cssClean], ['icons.svg', spriteClean], ...jsNames.map((n) => [n, stripJsComments(read(n)).replaceAll(SVG_NS, '')])];
  for (const [name, text] of scan) {
    for (const m of text.matchAll(EXTERNAL)) {
      problems.push(`${name}:${lineOf(text, m.index)}: внешняя ссылка ${m[0]}`);
    }
  }

  // 2. встроенный код
  if (/<style[\s>]/i.test(markup)) problems.push('index.html: встроенный <style> — CSP отказывает');
  if (/<script(?![^>]*(?<![-\w])src\s*=)[^>]*>/i.test(markup)) problems.push('index.html: встроенный <script> — CSP отказывает');
  for (const h of HANDLERS) {
    if (new RegExp(`[\\s"']${h}\\s*=`, 'i').test(markup)) problems.push(`index.html: обработчик ${h}= — это встроенный код`);
  }
  if (/[\s"']style\s*=/i.test(markup)) problems.push('index.html: атрибут style="" — CSP отказывает');

  // 3. локальные ссылки: html, url() в css, import в модулях
  for (const m of markup.matchAll(/(?:href|src)\s*=\s*["']([^"'#?]+)/g)) {
    const ref = m[1];
    if (/^(?:https?:|\/\/|data:|mailto:)/.test(ref)) continue;
    if (!fs.existsSync(path.join(web, ref))) problems.push(`index.html:${lineOf(markup, m.index)}: ссылка на ${ref}, файла нет`);
  }
  for (const m of cssClean.matchAll(/url\(\s*["']?([^"')]+)/g)) {
    const ref = m[1];
    if (/^(?:https?:|\/\/|data:)/.test(ref)) continue;
    if (!fs.existsSync(path.join(web, ref))) problems.push(`app.css:${lineOf(cssClean, m.index)}: url(${ref}), файла нет`);
  }
  for (const name of jsNames) {
    const text = stripJsComments(read(name));
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      if (!fs.existsSync(path.join(web, path.dirname(name), m[1]))) {
        problems.push(`${name}:${lineOf(text, m.index)}: импорт ${m[1]}, файла нет`);
      }
    }
  }

  // 4. переменные темы: определены в каком-либо :root (светлом или тёмном) либо ставятся из скрипта
  const used = new Set([...cssClean.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));
  const defined = new Set();
  for (const block of cssClean.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const d of block[1].matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(d[1]);
  }
  const setByScript = new Set();
  for (const name of jsNames) {
    for (const m of read(name).matchAll(/setProperty\(\s*['"](--[a-z0-9-]+)/g)) setByScript.add(m[1]);
  }
  for (const v of [...used].sort()) {
    if (!defined.has(v) && !setByScript.has(v)) problems.push(`app.css: var(${v}) не определена ни в :root, ни из скрипта`);
  }

  // 5. тёмная тема есть и переопределяет те же переменные
  if (!/prefers-color-scheme\s*:\s*dark/.test(cssClean)) problems.push('app.css: нет тёмной темы (prefers-color-scheme: dark)');

  // 6. разметка из данных
  for (const name of jsNames) {
    const text = stripJsComments(read(name));
    for (const [re, label] of DANGEROUS_JS) {
      const m = re.exec(text);
      if (m) problems.push(`${name}:${lineOf(text, m.index)}: ${label} — разметка из данных запрещена`);
    }
  }

  // 7. значки: каждый 'i-имя' из модулей есть в icons.svg; в спрайте нет кода и своих стилей
  const symbols = new Set([...spriteClean.matchAll(/<symbol\s[^>]*\bid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
  if (/<script[\s>]/i.test(spriteClean)) problems.push('icons.svg: <script> внутри спрайта');
  if (/[\s"']style\s*=|<style[\s>]/i.test(spriteClean)) problems.push('icons.svg: встроенные стили внутри спрайта');
  const refs = new Set();
  for (const name of jsNames) {
    const text = stripJsComments(read(name));
    for (const m of text.matchAll(/['"](i-[a-z0-9-]+)['"]/g)) {
      refs.add(m[1]);
      if (!symbols.has(m[1])) problems.push(`${name}:${lineOf(text, m.index)}: значок ${m[1]} не найден в icons.svg`);
    }
  }

  // 8. имя образца не должно попадать в интерфейс (комментарии тоже: файлы страницы публичны)
  const BRAND = /claude|anthropic/i;
  for (const [name, text] of [['index.html', html], ['app.css', css], ['icons.svg', sprite], ...jsNames.map((n) => [n, read(n)])]) {
    const m = BRAND.exec(text);
    if (m) problems.push(`${name}:${lineOf(text, m.index)}: имя образца «${m[0]}» в файле страницы`);
  }

  return {
    problems,
    stats: { web, defined: defined.size, used: used.size, modules: jsNames.length, icons: symbols.size, iconRefs: refs.size },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { problems, stats } = checkPage(dir);
  console.log(`проверяется: ${stats.web}`);
  if (stats.defined !== undefined) console.log(`переменных определено: ${stats.defined}, использовано: ${stats.used}, модулей: ${stats.modules}, значков: ${stats.icons}, ссылок на значки: ${stats.iconRefs}`);
  console.log(`СТРАНИЦА: ${problems.length === 0 ? 'чисто' : 'КРАСНО'}`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(problems.length === 0 ? 0 : 1);
}

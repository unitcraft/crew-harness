// Задача 265: компактный выбор репозитория результата и видимые настройки агента.
// Чип «Результат» — кнопка с тем же меню, что у соседних чипов: ширина ограничена, длинные
// имена сокращаются многоточием (полный текст — в title и aria-label), меню открывается слева
// и не перекрывает правую колонку. Текущий агент виден при любом числе доступных (0/1/N);
// режим, модель и усилие не пропадают молча: без вариантов чип остаётся приглушённым,
// а title называет фактическую причину (загружаются / появятся после запуска / агент не предоставляет).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

test('репозиторий результата — кнопка-чип с меню, не широкий select', () => {
  assert.match(view, /const resultRepoButton = h\(doc, 'button', \{ type: 'button', class: 'status-btn result-chip'/);
  assert.doesNotMatch(view, /resultRepoSelect = h\(doc, 'select'/, 'select со строкой на всю ширину убран');
  assert.match(view, /resultRepoButton\.addEventListener\('click', \(\) => toggleMenu\('result'\)\)/);
});

test('чип результата компактный: ширина ограничена, текст сокращается многоточием, полный — в title и aria-label', () => {
  assert.match(css, /\.result-chip \{[^}]*max-width/);
  assert.match(css, /\.result-chip > span \{[^}]*overflow: hidden[^}]*text-overflow: ellipsis/);
  assert.match(view, /resultRepoButton\.title = text/);
  assert.match(view, /resultRepoButton\.setAttribute\('aria-label', text\)/);
});

test('меню результата — общее меню чипов: слева (не перекрывает правую колонку), список обновляется при открытии', () => {
  const branch = view.slice(view.indexOf("if (menuKind === 'result')"), view.indexOf('if (!options || !menuKind)'));
  assert.match(branch, /menu\.dataset\.side = 'left'/, 'меню прижато к левому краю строки, как чип маршрута');
  assert.match(branch, /menuRow\(\{ name: 'Свой репозиторий'/);
  assert.match(branch, /description: `→ \$\{p\.remote\}\/\$\{p\.branch\}`/, 'длинный хвост — в описании строки меню, оно переносится');
  assert.match(branch, /Подтвердить другой репозиторий…/);
  assert.match(view, /if \(kind === 'result'\) refreshResultRepos\(\)/, 'список перечитывается при открытии меню');
  assert.match(css, /\.menu \{[^}]*max-width: min\(380px, 92vw\)/, 'меню ограничено по ширине');
});

test('выбор результата недоступен при задаче/дереве/ходе — как прежде; меню не открывается у выключенного чипа', () => {
  assert.match(view, /resultRepoButton\.disabled = Boolean\(task\) \|\| hasTree/);
  assert.match(view, /if \(kind === 'result' && resultRepoButton\.disabled\) return;/);
  assert.match(view, /handlers\.onResultRepo\(currentTrace, p\.id\)/);
});

test('текущий агент виден при любом числе доступных: чип не прячется, при 0/1 — приглушён и title называет причину', () => {
  assert.doesNotMatch(view, /familyButton\.hidden = agents\.length/, 'чип агента больше не исчезает при одном агенте');
  assert.match(view, /familyButton\.hidden = false/);
  assert.match(view, /familyButton\.setAttribute\('aria-disabled', String\(agents\.length < 2\)\)/);
  assert.match(view, /t\('status\.agent_one'\)/, 'один агент — причина в подсказке');
  assert.match(view, /t\('status\.agents_loading'\)/, 'реестр ещё грузится — причина в подсказке');
  assert.match(view, /if \(kind === 'agent' && agents\.length < 2\) return;/, 'меню выбора не открывается, когда выбирать не из чего');
});

test('режим и усилие не пропадают без объяснения: чип остаётся, приглушён, title — фактическая причина', () => {
  assert.doesNotMatch(view, /modeButton\.hidden = !hasModes/);
  assert.doesNotMatch(view, /effortButton\.hidden = !hasEfforts/);
  assert.match(view, /modeButton\.setAttribute\('aria-disabled', String\(!hasModes\)\)/);
  assert.match(view, /effortButton\.setAttribute\('aria-disabled', String\(!hasEfforts\)\)/);
  assert.match(view, /t\('status\.options_loading'\)/, 'варианты ещё грузятся');
  assert.match(view, /t\('status\.options_after_start'\)/, 'черновик без записи каталога — параметры появятся после запуска');
  assert.match(view, /t\('status\.mode_unsupported'\)/);
  assert.match(view, /t\('status\.effort_unsupported'\)/);
  assert.match(view, /if \(kind === 'mode' && !hasOpts\('modes'\)\) return;/, 'меню режима не открывается без вариантов');
  assert.match(view, /if \(kind === 'effort' && !hasOpts\('efforts'\)\) return;/, 'меню усилия не открывается без вариантов');
});

test('модель: без списка выбора имя видно текстом; без имени — «Модель не сообщена» с причиной, а не пусто', () => {
  assert.match(view, /statusModel\.textContent = shown\.model \|\| \(shown\.loading \? t\('session\.loading'\) : t\('session\.model_unknown'\)\)/);
  assert.match(view, /t\('status\.model_unsupported'\)/);
  assert.match(view, /if \(\(kind === 'model' \|\| kind === 'more'\) && !hasOpts\('models'\)\) return;/);
});

test('приглушённые чипы выглядят недоступными и не реагируют на наведение', () => {
  assert.match(css, /\.status-btn\[aria-disabled="true"\] \{[^}]*opacity/);
  assert.match(css, /\.status-btn\[aria-disabled="true"\]:hover \{ background: transparent; \}/);
});

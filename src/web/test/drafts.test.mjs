// Серия правок по скринам (задача 192): новый проект одной папкой, «+» открывает пустой чат, переименование названия на месте.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialModel, reduce, addDraft, dropDrafts, patchDraft, nameFromText, sessionList } from '../state.js';
import { uniqueProjectName } from '../projects.js';
import { t } from '../strings.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const viewSrc = read('view.js');
const appSrc = read('app.js');
const cssSrc = read('app.css');

test('название нового проекта по имени папки: свободное — как есть, занятое — «имя (2)», «имя (3)», регистр не важен', () => {
  assert.equal(uniqueProjectName('crew-harness', []), 'crew-harness');
  assert.equal(uniqueProjectName('crew-harness', ['Другой']), 'crew-harness');
  assert.equal(uniqueProjectName('crew-harness', ['crew-harness']), 'crew-harness (2)');
  assert.equal(uniqueProjectName('crew-harness', ['Crew-Harness', 'crew-harness (2)']), 'crew-harness (3)');
  assert.equal(uniqueProjectName('', []), 'Проект');
});

test('черновик новой сессии: есть в модели, помечен draft, не пишется на сервер; сбрасывается; поля меняются', () => {
  let m = initialModel();
  m = addDraft(m, { id: 'd1', agent: 'codex', projectId: 'p1', project: 'crew', folder: 'C:/work/crew', branch: 'main', now: 5 });
  const s = m.sessions.d1;
  assert.equal(s.draft, true);
  assert.deepEqual([s.agent, s.projectId, s.folder, s.state, s.messages.length], ['codex', 'p1', 'C:/work/crew', 'idle', 0]);
  m = patchDraft(m, 'd1', { agent: 'kimi' });
  assert.equal(m.sessions.d1.agent, 'kimi');
  // черновик одной сессии заменяет прежний
  m = addDraft(dropDrafts(m), { id: 'd2', agent: 'codex', now: 6 });
  assert.deepEqual(Object.keys(m.sessions), ['d2']);
  m = dropDrafts(m);
  assert.deepEqual(Object.keys(m.sessions), []);
  // настоящая сессия после создания приходит событием и черновиком не является
  const real = reduce(m, { id: 'srv-1', trace: 'd2', step: 0, kind: 'session_created', input: { name: 'Привет', agent: 'codex' }, time: 7 });
  assert.equal(real.sessions.d2.draft, undefined);
  assert.deepEqual(sessionList(real).map((x) => x.id), ['d2']);
});

test('название по умолчанию из первых слов первого сообщения; пусто — пусто', () => {
  assert.equal(nameFromText('  Сделай   список задач для релиза и проверь тесты на старой версии '), 'Сделай список задач для релиза и');
  assert.equal(nameFromText(''), '');
  assert.ok(nameFromText('x'.repeat(100)).length <= 60);
  assert.equal(t('sessions.new_name_placeholder'), 'Без названия');
});

test('переименование: событие session_renamed меняет имя, пустое и чужое не трогают', () => {
  let m = reduce(initialModel(), { id: 'a', trace: 's', step: 0, kind: 'session_created', input: { name: 'Старое', agent: 'x' }, time: 1 });
  m = reduce(m, { id: 'b', trace: 's', step: 1, kind: 'session_renamed', input: { name: '  Новое  ' }, time: 2 });
  assert.equal(m.sessions.s.name, 'Новое');
  m = reduce(m, { id: 'c', trace: 's', step: 2, kind: 'session_renamed', input: { name: '   ' }, time: 3 });
  assert.equal(m.sessions.s.name, 'Новое');
});

test('кнопки «Новая сессия» и её формы нет; «+» открывает черновик, сессия создаётся с первой отправкой', () => {
  assert.ok(!/newButton|newForm|new-form|new-btn/.test(viewSrc), 'в списке нет формы новой сессии');
  assert.ok(!/onCreate\b/.test(appSrc), 'прежнего onCreate нет');
  assert.match(appSrc, /onNewToggle\(open, projectId = ''\)[\s\S]*addDraft\(dropDrafts\(model\)/);
  assert.match(appSrc, /if \(draft && draft\.draft\) \{[\s\S]*send\('session_created', trace, 0, input\)/);
  assert.match(viewSrc, /\.filter\(\(x\) => !x\.draft\)/, 'черновик не показывается в списке слева');
});

test('новый проект — выбор одной папки без формы; название по папке', () => {
  assert.match(viewSrc, /projectsHeadNew\.addEventListener\('click', \(\) => projectsUi\.createByFolder\(/);
  const ui = read('projects-ui.js');
  assert.match(ui, /async function createByFolder\(names\) \{\s*const path = await pickFolder\(''\);/);
  assert.match(ui, /uniqueProjectName\(folderName\(path\) \|\| path, names\)/);
});

test('заголовок: переименование на месте — поле поверх текста тех же размеров, подсказка «Переименовать», Enter/Esc/потеря фокуса', () => {
  assert.match(viewSrc, /title: t\('chat\.rename'\), tabindex: '0', role: 'button'/);
  assert.match(viewSrc, /if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); finishRename\(true\); \} else if \(e\.key === 'Escape'\)/);
  assert.match(viewSrc, /titleInput\.addEventListener\('blur', \(\) => finishRename\(true\)\)/);
  assert.match(viewSrc, /name !== '' && name !== session\.name/);
  assert.match(cssSrc, /\.title-input \{ position: absolute; inset: 0; width: 100%; height: 100%;/);
  assert.match(cssSrc, /\.title\.is-editing \.title-text \{ visibility: hidden; \}/);
  assert.ok(!/\.title-input[^}]*--accent/.test(cssSrc), 'у поля названия нет синей рамки');
  assert.equal(t('chat.rename'), 'Переименовать');
});

test('поиск по сессиям: как поле ввода сообщения, без синей рамки и без второй рамки внутри; окно настроек проекта шире', () => {
  assert.match(cssSrc, /\.search \{ border-radius: 14px; box-shadow: var\(--shadow-card\); \}/);
  const focus = cssSrc.match(/\.search:focus-within \{([^}]*)\}/)[1];
  assert.ok(!/accent/.test(focus) && /outline: none/.test(focus));
  assert.match(cssSrc, /\.search-input \{[^}]*border: 0;[^}]*box-shadow: none;/);
  assert.match(cssSrc, /\.dialog\.modal \{ width: min\(640px, 100%\);/);
});

test('строка проекта выделена: значок папки, жирное имя, фон шапки, полоска у активного', () => {
  assert.match(viewSrc, /icon\(doc, 'i-folder', 'group-icon'\)/);
  assert.match(cssSrc, /\.group\[data-project="true"\] \.group-head h3 \{[^}]*font-weight: 700/);
  assert.match(cssSrc, /\.group\[data-active="true"\] \.group-head \{ box-shadow: inset 2px 0 var\(--accent\); \}/);
});

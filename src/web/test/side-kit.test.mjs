// Строка сессии и шапка проекта (задача 192): меню «⋯», переименование на месте, подтверждение удаления, перетаскивание.
// DOM — fake-dom.mjs; события перетаскивания — обычные объекты с dataTransfer и clientY.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDocument, event, key } from './fake-dom.mjs';
import { createSideKit } from '../session-row.js';
import { h } from '../dom.js';

function setup({ answer = true } = {}) {
  const doc = createFakeDocument();
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  const handlers = {
    onPin: rec('pin'), onUnread: rec('unread'), onRename: rec('rename'), onCopy: rec('copy'), onMoveSession: rec('move'),
    onDeleteSession: rec('delete'), onReorderSessions: rec('reorder'), onReorderProjects: rec('projects'),
  };
  const asked = [];
  const box = h(doc, 'div', {});
  doc.body.append(box);
  const sessions = [{ id: 'a', name: 'Привет', projectId: 'p1' }, { id: 'b', name: 'Второй', projectId: 'p1' }, { id: 'c', name: 'Третий', projectId: 'p1' }];
  let drawn = 0;
  let kit = null;
  const projects = [{ id: 'p1', name: 'Один' }, { id: 'p2', name: 'Два' }];
  const draw = () => {
    drawn += 1;
    const lis = sessions.map((s) => {
      const field = kit.isRenaming(s.id) ? kit.renameField(s) : h(doc, 'button', { class: 'session-item', text: s.name });
      const li = h(doc, 'li', { class: 'session' }, field, kit.moreButton(s), kit.menuFor(s, { pinned: false, unread: false }) || false);
      li.getBoundingClientRect = () => ({ top: 100, height: 40 });
      kit.rowDnd(li, { id: s.id, group: 'p1', ids: sessions.map((x) => x.id), projectId: s.projectId, enabled: true });
      return li;
    });
    kit.rebuild(() => box.replaceChildren(...lis));
    kit.afterRender(box);
  };
  kit = createSideKit(doc, {
    handlers, projects: () => projects, confirm: async (text) => { asked.push(text); return answer; },
    linkFor: (id) => `http://x/#s=${id}`, render: draw,
  });
  draw();
  const row = (id) => box.children[sessions.findIndex((s) => s.id === id)];
  return { doc, kit, calls, asked, box, row, draw, drawn: () => drawn };
}
const labels = (el) => el.querySelectorAll('.menu-item').map((n) => n.textContent.trim());
const drag = (type, extra = {}) => event(type, { dataTransfer: { setData() {}, effectAllowed: '', dropEffect: '' }, clientY: 0, ...extra });

test('меню «⋯»: закрепить, непрочитанной, переименовать, ссылка, переместить, удалить (красный)', () => {
  const s = setup();
  assert.equal(s.row('a').querySelector('.session-menu'), null);
  s.row('a').querySelector('.more-btn').click();
  const menu = s.row('a').querySelector('.session-menu');
  assert.deepEqual(labels(menu), ['Закрепить', 'Отметить непрочитанной', 'Переименовать', 'Скопировать ссылку', 'Переместить в проект', 'Удалить']);
  assert.ok(menu.querySelectorAll('.menu-item').at(-1).className.includes('is-danger'));
  assert.equal(s.row('b').querySelector('.session-menu'), null, 'меню только у одной сессии');
  s.doc.dispatchEvent(key('Escape'));
  assert.equal(s.row('a').querySelector('.session-menu'), null, 'Esc закрывает');
});

test('меню: закрепить, непрочитанной и ссылка уходят обработчикам', () => {
  const s = setup();
  const pick = (n) => { s.row('a').querySelector('.more-btn').click(); s.row('a').querySelectorAll('.menu-item')[n].click(); };
  pick(0);
  pick(1);
  pick(3);
  assert.deepEqual(s.calls, [['pin', 'a', true], ['unread', 'a', true], ['copy', 'http://x/#s=a']]);
  assert.equal(s.row('a').querySelector('.session-menu'), null, 'после выбора меню закрыто');
});

test('«Переместить в проект»: список проектов с отметкой текущего и «Без проекта»', () => {
  const s = setup();
  s.row('a').querySelector('.more-btn').click();
  s.row('a').querySelectorAll('.menu-item')[4].click();
  assert.deepEqual(labels(s.row('a').querySelector('.session-menu')), ['Назад', 'Один', 'Два', 'Без проекта']);
  const items = s.row('a').querySelectorAll('.menu-item');
  assert.equal(items[1].getAttribute('aria-checked'), 'true');
  items[1].click();
  assert.deepEqual(s.calls, [], 'в тот же проект — ничего не уходит');
  const toProject = (n) => {
    s.row('a').querySelector('.more-btn').click();
    s.row('a').querySelectorAll('.menu-item')[4].click();
    s.row('a').querySelectorAll('.menu-item')[n].click();
  };
  toProject(2);
  toProject(3);
  assert.deepEqual(s.calls, [['move', 'a', 'p2'], ['move', 'a', '']]);
});

test('переименование на месте: поле с названием, Enter сохраняет, Esc отменяет, уход из поля сохраняет', () => {
  const s = setup();
  const start = () => { s.row('a').querySelector('.more-btn').click(); s.row('a').querySelectorAll('.menu-item')[2].click(); };
  start();
  let input = s.row('a').querySelector('.session-rename');
  assert.equal(input.value, 'Привет');
  assert.equal(s.doc.activeElement, input, 'фокус в поле');
  input.value = ' Новое имя ';
  input.dispatchEvent(event('input'));
  input.dispatchEvent(key('Enter'));
  assert.deepEqual(s.calls, [['rename', 'a', 'Новое имя']]);
  assert.equal(s.row('a').querySelector('.session-rename'), null);
  start();
  input = s.row('a').querySelector('.session-rename');
  input.value = 'Не то';
  input.dispatchEvent(event('input'));
  input.dispatchEvent(key('Escape'));
  assert.equal(s.calls.length, 1, 'Esc ничего не отправляет');
  start();
  input = s.row('a').querySelector('.session-rename');
  input.value = 'Через blur';
  input.dispatchEvent(event('input'));
  input.dispatchEvent(event('blur'));
  assert.deepEqual(s.calls.at(-1), ['rename', 'a', 'Через blur']);
  start();
  s.row('a').querySelector('.session-rename').dispatchEvent(key('Enter'));
  assert.equal(s.calls.length, 2, 'то же название — не отправляется');
});

test('перерисовка списка во время переименования не сохраняет и не теряет набранное', () => {
  const s = setup();
  s.row('a').querySelector('.more-btn').click();
  s.row('a').querySelectorAll('.menu-item')[2].click();
  const input = s.row('a').querySelector('.session-rename');
  input.value = 'Набрано';
  input.dispatchEvent(event('input'));
  s.draw();
  assert.equal(s.row('a').querySelector('.session-rename').value, 'Набрано');
  assert.deepEqual(s.calls, []);
});

test('удаление: подтверждение с текстом владельца, «Нет» ничего не удаляет', async () => {
  const yes = setup({ answer: true });
  yes.row('a').querySelector('.more-btn').click();
  yes.row('a').querySelectorAll('.menu-item')[5].click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(yes.asked, ['Удалить сессию «Привет»? Это удалит её историю.']);
  assert.deepEqual(yes.calls, [['delete', 'a']]);
  const no = setup({ answer: false });
  no.row('a').querySelector('.more-btn').click();
  no.row('a').querySelectorAll('.menu-item')[5].click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(no.calls, []);
});

test('перетаскивание сессии: линия под строкой, бросок отдаёт новый порядок, dragend снимает метку', () => {
  const s = setup();
  const a = s.row('a');
  const c = s.row('c');
  assert.equal(a.getAttribute('draggable'), 'true');
  a.dispatchEvent(drag('dragstart'));
  assert.ok(a.className.includes('is-dragging'));
  const over = drag('dragover', { clientY: 130 });
  c.dispatchEvent(over);
  assert.equal(over.defaultPrevented, true);
  assert.ok(c.className.includes('drop-after'));
  c.dispatchEvent(drag('dragover', { clientY: 105 }));
  assert.ok(c.className.includes('drop-before') && !c.className.includes('drop-after'));
  c.dispatchEvent(drag('dragover', { clientY: 130 }));
  c.dispatchEvent(drag('drop', { clientY: 130 }));
  assert.deepEqual(s.calls, [['reorder', ['b', 'c', 'a']]]);
  assert.ok(!c.className.includes('drop-'));
  a.dispatchEvent(drag('dragend'));
  assert.ok(!a.className.includes('is-dragging'));
  assert.equal(s.kit.isDragging(), false);
});

test('на себя и без перемещения — ничего не уходит', () => {
  const s = setup();
  s.row('a').dispatchEvent(drag('dragstart'));
  const own = drag('dragover');
  s.row('a').dispatchEvent(own);
  assert.equal(own.defaultPrevented, false);
  s.row('b').dispatchEvent(drag('dragover', { clientY: 105 }));
  s.row('b').dispatchEvent(drag('drop', { clientY: 105 }));
  assert.deepEqual(s.calls, [], 'a уже стоит перед b');
  s.row('a').dispatchEvent(drag('dragend'));
});

test('пока тащат, перерисовка откладывается и выполняется после броска', () => {
  const s = setup();
  s.row('a').dispatchEvent(drag('dragstart'));
  s.kit.deferRender();
  const before = s.drawn();
  s.row('a').dispatchEvent(drag('dragend'));
  assert.equal(s.drawn(), before + 1);
});

test('шапка проекта: бросок сессии переносит её, бросок проекта ставит рядом; свой проект и «Без проекта»', () => {
  const s = setup();
  const mk = (projectId, free = false) => {
    const head = h(s.doc, 'div', { class: 'group-head' });
    const section = h(s.doc, 'section', { class: 'group' }, head);
    head.getBoundingClientRect = () => ({ top: 0, height: 40 });
    s.kit.projectDnd({ section, head, projectId, free });
    return { head, section };
  };
  const p1 = mk('p1');
  const p2 = mk('p2');
  const none = mk('', true);
  assert.equal(p2.head.getAttribute('draggable'), 'true');
  assert.equal(none.head.getAttribute('draggable'), null, '«Без проекта» не тащится');
  s.row('a').dispatchEvent(drag('dragstart'));
  const own = drag('dragover');
  p1.head.dispatchEvent(own);
  assert.equal(own.defaultPrevented, false, 'в свой проект переносить нечего');
  p2.head.dispatchEvent(drag('dragover'));
  assert.ok(p2.head.className.includes('drop-into'));
  p2.head.dispatchEvent(drag('drop'));
  none.head.dispatchEvent(drag('dragover'));
  none.head.dispatchEvent(drag('drop'));
  s.row('a').dispatchEvent(drag('dragend'));
  assert.deepEqual(s.calls, [['move', 'a', 'p2'], ['move', 'a', '']]);

  p2.head.dispatchEvent(drag('dragstart', { target: p2.head }));
  p1.head.dispatchEvent(drag('dragover', { clientY: 5 }));
  assert.ok(p1.section.className.includes('drop-before'));
  p1.head.dispatchEvent(drag('drop', { clientY: 5 }));
  assert.deepEqual(s.calls.at(-1), ['projects', ['p2', 'p1']]);
  p2.head.dispatchEvent(drag('dragend'));
});

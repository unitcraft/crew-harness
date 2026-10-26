// История ↑/↓ в поле ввода, ряд иконок под сообщениями и очередь в ленте (задача 192).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { historyStep, NO_HISTORY } from '../history.js';
import { messageTime } from '../lists.js';
import { createQueue } from '../queue.js';
import { S, t } from '../strings.js';

const web = new URL('../', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, web), 'utf8');
const texts = ['первое', 'второе\nв две строки', 'третье'];
const up = (state, value = '', caret = value.length) => historyStep({ texts, state, value, caret, key: 'ArrowUp' });
const down = (state, value, caret = value.length) => historyStep({ texts, state, value, caret, key: 'ArrowDown' });

test('↑ из пустого поля показывает последнее отправленное, дальше — к более старым; на самом старом стоит', () => {
  let r = up(NO_HISTORY);
  assert.deepEqual([r.handled, r.value, r.state.index], [true, 'третье', 2]);
  r = up(r.state, r.value);
  assert.deepEqual([r.value, r.state.index], ['второе\nв две строки', 1]);
  // каретка в конце двух строк: ↑ ходит по строкам поля, история молчит
  assert.equal(up(r.state, r.value).handled, false);
  assert.equal(up(r.state, r.value, 3).handled, true);
  r = up(r.state, r.value, 3);
  assert.deepEqual([r.value, r.state.index], ['первое', 0]);
  r = up(r.state, r.value);
  assert.deepEqual([r.value, r.state.index], ['первое', 0]);
});

test('↓ идёт к новым, за последним возвращает черновик', () => {
  let r = up(NO_HISTORY, 'мой черновик');
  assert.deepEqual([r.handled, r.value, r.state.index, r.state.draft], [true, 'третье', 2, 'мой черновик']);
  r = up(r.state, r.value);
  const back = down(r.state, r.value);
  assert.deepEqual([back.handled, back.value, back.state.index], [true, 'третье', 2]);
  const end = down(back.state, back.value);
  assert.deepEqual([end.handled, end.value, end.state.index], [true, 'мой черновик', -1]);
});

test('правка показанного сообщения историю не выключает: ↑ и ↓ идут дальше, черновик возвращается всегда', () => {
  let r = up(NO_HISTORY, 'черновик');
  r = up(r.state, 'третье!!!'); // правили показанное
  assert.deepEqual([r.handled, r.value, r.state.index, r.state.draft], [true, texts[1], 1, 'черновик']);
  r = down(r.state, `${texts[1]} (правка)`);
  assert.deepEqual([r.handled, r.value, r.state.index], [true, 'третье', 2]);
  r = down(r.state, 'третье?');
  assert.deepEqual([r.handled, r.value, r.state.index], [true, 'черновик', -1]);
});

test('после отправки история с пустого поля: новое сообщение в конце, ↑ показывает его первым', () => {
  const after = [...texts, 'только что отправленное'];
  const r = historyStep({ texts: after, state: NO_HISTORY, value: '', caret: 0, key: 'ArrowUp' });
  assert.deepEqual([r.handled, r.value, r.state.index], [true, 'только что отправленное', 3]);
});

test('история включается и из непустого поля (первая строка), но не из середины многострочного текста и без отправленных', () => {
  assert.equal(up(NO_HISTORY, 'набираю').handled, true);
  assert.equal(up(NO_HISTORY, 'а\nб', 3).handled, false);
  assert.equal(historyStep({ texts: [], state: NO_HISTORY, value: '', caret: 0, key: 'ArrowUp' }).handled, false);
  assert.equal(down(NO_HISTORY, '').handled, false);
  assert.equal(historyStep({ texts, state: NO_HISTORY, value: '', caret: 0, key: 'ArrowLeft' }).handled, false);
});

test('поле ввода: стрелки не перехватываются при IME и с модификаторами; история сбрасывается набором и сменой сессии', () => {
  const view = read('view.js');
  assert.match(view, /e\.key === 'ArrowUp' \|\| e\.key === 'ArrowDown'\) && !e\.isComposing && !e\.shiftKey && !e\.ctrlKey && !e\.altKey && !e\.metaKey/);
  assert.match(view, /m\.role === 'user' && m\.text\.trim\(\)\.length > 0/);
  assert.match(view, /historyState = NO_HISTORY;\s*nodes\.clear\(\);/);
  assert.doesNotMatch(view, /input\.addEventListener\('input', \(\) => \{\s*historyState = NO_HISTORY;/, 'правка историю не сбрасывает');
  assert.match(view, /historyState = NO_HISTORY; \/\/ после отправки/);
});

test('время сообщения: только что, сегодня ЧЧ:ММ, вчера, раньше — дата', () => {
  const at = new Date(2026, 9, 26, 14, 5).getTime();
  assert.equal(messageTime(at, at + 30_000).kind, 'now');
  const today = messageTime(at, new Date(2026, 9, 26, 18, 0).getTime());
  assert.deepEqual([today.kind, today.clock], ['today', '14:05']);
  const yesterday = messageTime(at, new Date(2026, 9, 27, 0, 10).getTime());
  assert.deepEqual([yesterday.kind, yesterday.clock], ['yesterday', '14:05']);
  const older = messageTime(at, new Date(2026, 9, 29, 9, 0).getTime());
  assert.deepEqual([older.kind, older.date, older.clock], ['older', '26.10', '14:05']);
  assert.equal(t('msg.time_yesterday', { clock: '14:05' }), 'вчера 14:05');
  assert.equal(t('msg.time_older', { date: '26.10', clock: '14:05' }), '26.10 14:05');
  assert.equal(S['msg.time_now'], 'только что');
});

test('очередь: убрать по номеру («✕»), поставить первым («Отправить сейчас»), выдача и после отмены хода', () => {
  const q = createQueue();
  const m = (text) => ({ text, images: [] });
  q.push('s', m('a'));
  q.push('s', m('b'));
  q.push('s', m('c'));
  assert.deepEqual(q.items('s').map((x) => x.text), ['a', 'b', 'c']);
  assert.equal(q.removeAt('s', 1).text, 'b');
  assert.equal(q.removeAt('s', 5), undefined);
  q.moveToFront('s', 1);
  assert.deepEqual(q.items('s').map((x) => x.text), ['c', 'a']);
  const sess = (state, n) => ({ state, messages: new Array(n).fill({}) });
  assert.equal(q.take('s', sess('answering', 2)), undefined);
  // ход отменён или кончился ошибкой: очередь идёт дальше
  assert.equal(q.take('s', sess('cancelled', 2)).text, 'c');
  assert.equal(q.take('s', sess('error', 4)).text, 'a');
});

test('сообщение владельца: ряд иконок (доставлено, время, копировать, вернуть в поле) скрыт без наведения, виден при наведении и в очереди; ✕ и «Отправить сейчас» только в очереди', () => {
  const view = read('view.js');
  const css = read('app.css');
  assert.match(css, /\.msg-actions \{[^}]*min-height: 24px[^}]*visibility: hidden;/);
  assert.match(css, /\.item-user:hover \.msg-actions, \.item-user:has\(:focus-visible\) \.msg-actions, \.item-user\[data-tap="on"\] \.msg-actions, \.msg-actions\[data-queued="true"\] \{ visibility: visible; \}/);
  assert.match(view, /iconButton\(doc, 'i-copy', t\('msg\.copy'\), \(\) => handlers\.onCopy\(item\.text\)\)/);
  assert.match(view, /iconButton\(doc, 'i-undo', t\('msg\.restore'\), \(\) => putInField\(item\.text\)\)/);
  assert.match(view, /if \(queued\) \{\s*row\.append\(iconButton\(doc, 'i-x', t\('msg\.unqueue'\)/);
  assert.match(view, /handlers\.onSendNow\(currentTrace, item\.index\)/);
  // «вернуть»: текст встаёт перед набранным через пустую строку, курсор после вставленного, ничего не отправляется
  assert.match(view, /input\.value = keep\.trim\(\) === '' \? text : `\$\{text\}\\n\\n\$\{keep\}`;/);
  assert.match(view, /input\.setSelectionRange\(text\.length, text\.length\)/);
  // под ответом агента ряд только с «Скопировать» и временем, виден при наведении на ответ
  assert.match(css, /\.item-actions\[data-row="hover"\] \{ visibility: hidden; \}/);
  assert.equal(S['msg.copy'], 'Скопировать');
  assert.equal(S['msg.restore'], 'Вернуть в поле ввода');
  assert.equal(S['msg.unqueue'], 'Вернуть на редактирование');
  assert.equal(S['msg.send_now'], 'Отправить сейчас');
});

test('сообщения в очереди — приглушённые пузыри под текущим ходом, в порядке постановки', () => {
  const view = read('view.js');
  const app = read('app.js');
  assert.match(view, /handlers\.queuedItems\(session\.id\)\.forEach\(\(q, index\) => \{\s*items\.push\(\{ type: 'queued'/);
  assert.match(read('app.css'), /\.item-queued \.bubble \{ opacity: \.7; \}/);
  assert.match(app, /onSendNow\(trace, index\) \{\s*queue\.moveToFront\(trace, index\);\s*handlers\.onCancel\(trace\);/);
  assert.match(app, /onUnqueueAt\(trace, index\) \{\s*const item = queue\.removeAt\(trace, index\);/);
});

test('ряд иконок: вплотную под пузырём, внутри той же зоны наведения; не залипает после клика мышью и ухода мыши', () => {
  const view = read('view.js');
  const css = read('app.css');
  assert.match(css, /\.msg-actions \{[^}]*margin-top: 0; padding-top: 4px;/);
  assert.doesNotMatch(css, /\.item-user:focus-within/, 'после клика по кнопке фокус остаётся — залипание');
  assert.match(css, /\.item-actions\[data-row="hover"\]:has\(:focus-visible\)/);
  // касание раскрывает ряд только пальцем, клик мышью и по кнопкам ряда — нет; уход мыши и клик мимо гасят
  assert.match(view, /const touch = e\.pointerType === 'touch';/);
  assert.match(view, /if \(!touch \|\| \(e\.target\.closest && e\.target\.closest\('button'\)\)\) return;/);
  assert.match(view, /thread\.addEventListener\('mouseleave', \(\) => clearTaps\(null\)\)/);
});

test('кнопка «вниз»: порог 40 px, плавная прокрутка по клику, точка «есть новое», автопрокрутка только у самого низа', () => {
  const view = read('view.js');
  const css = read('app.css');
  assert.match(view, /const NEAR_BOTTOM_PX = 40;/);
  assert.match(view, /const away = distanceFromBottom\(\) > NEAR_BOTTOM_PX;/);
  assert.match(view, /if \(!away\) unseen = false;/);
  assert.match(view, /log\.scrollTo\(\{ top: log\.scrollHeight, behavior: 'smooth' \}\)/);
  assert.match(view, /if \(nearBottom \|\| created === items\.length\) log\.scrollTop = log\.scrollHeight;\s*else if \(changed \|\| created > 0\) unseen = true;\s*syncJump\(\);/);
  assert.match(view, /log\.addEventListener\('scroll', syncJump\)/);
  assert.match(css, /\.jump-btn \{[^}]*left: 50%[^}]*border-radius: 50%/);
  assert.equal(S['chat.to_bottom'], 'Вниз');
});

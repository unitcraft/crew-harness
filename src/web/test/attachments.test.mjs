// Проверки attachments.js: модель картинок сообщения (задача 192) — добавление, лимиты, имена, удаление, сбор сообщения, буфер обмена.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_BYTES, defaultName, uniqueName, addImages, removeImage, canSend,
  uploadImages, messageInput, clipboardImages, clipboardHasText, dragHasFiles, droppedFiles, imageUrl,
} from '../attachments.js';

const file = (name, type = 'image/png', size = 1000) => ({ name, type, size });

test('допустимы png, jpeg, webp, gif; лимиты — 6 штук и 10 МБ', () => {
  assert.deepEqual([...IMAGE_TYPES], ['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  assert.equal(MAX_IMAGES, 6);
  assert.equal(MAX_IMAGE_BYTES, 10 * 1024 * 1024);
});

test('имя по умолчанию и уникальное имя: image.png, image-2.png, image-3.png', () => {
  assert.equal(defaultName('image/png'), 'image.png');
  assert.equal(defaultName('image/jpeg'), 'image.jpg');
  assert.equal(uniqueName([], 'image.png'), 'image.png');
  assert.equal(uniqueName(['image.png'], 'image.png'), 'image-2.png');
  assert.equal(uniqueName(['image.png', 'image-2.png'], 'image.png'), 'image-3.png');
  assert.equal(uniqueName(['a'], 'a'), 'a-2');
});

test('добавление: одинаковые имена из буфера получают номера, id растут, список не меняется на месте', () => {
  const none = [];
  const r1 = addImages(none, [file('image.png'), file('image.png'), file('')], 0);
  assert.deepEqual(none, []);
  assert.deepEqual(r1.errors, []);
  assert.deepEqual(r1.list.map((x) => x.name), ['image.png', 'image-2.png', 'image-3.png']);
  assert.deepEqual(r1.list.map((x) => x.id), ['att-1', 'att-2', 'att-3']);
  assert.equal(r1.seq, 3);
  const r2 = addImages(r1.list, [file('image.png')], r1.seq);
  assert.equal(r2.list.at(-1).name, 'image-4.png');
  assert.equal(r2.list.at(-1).id, 'att-4');
});

test('тип не из списка, пустой и слишком большой файл отклоняются, остальные принимаются', () => {
  const r = addImages([], [
    file('a.svg', 'image/svg+xml'), file('b.txt', 'text/plain'), file('c.png', 'image/png', 0),
    file('big.png', 'image/png', MAX_IMAGE_BYTES + 1), file('edge.png', 'image/png', MAX_IMAGE_BYTES), file('ok.gif', 'image/gif'),
  ]);
  assert.deepEqual(r.errors.map((e) => `${e.code}:${e.name}`), ['type:a.svg', 'type:b.txt', 'empty:c.png', 'size:big.png']);
  assert.deepEqual(r.list.map((x) => x.name), ['edge.png', 'ok.gif']);
});

test('не больше шести на сообщение: лишние не добавляются, ошибка одна', () => {
  const eight = Array.from({ length: 8 }, (_, i) => file(`p${i}.png`));
  const r = addImages([], eight);
  assert.equal(r.list.length, MAX_IMAGES);
  assert.deepEqual(r.errors.map((e) => e.code), ['count']);
  const again = addImages(r.list, [file('late.png')], r.seq);
  assert.equal(again.list.length, MAX_IMAGES);
  assert.deepEqual(again.errors.map((e) => e.code), ['count']);
});

test('удаление по id; чужой id — тот же список', () => {
  const { list } = addImages([], [file('a.png'), file('b.png')]);
  const one = removeImage(list, 'att-1');
  assert.deepEqual(one.map((x) => x.name), ['b.png']);
  assert.equal(removeImage(one, 'att-99'), one);
  assert.deepEqual(removeImage(one, 'att-2'), []);
});

test('отправка разрешена с текстом, с одной картинкой без слов, и не разрешена при пустом и во время загрузки', () => {
  const { list } = addImages([], [file('a.png')]);
  assert.equal(canSend('', [], false), false);
  assert.equal(canSend('   ', [], false), false);
  assert.equal(canSend('привет', [], false), true);
  assert.equal(canSend('', list, false), true);
  assert.equal(canSend('привет', list, true), false);
});

test('сбор сообщения: без картинок вход прежний, с картинками — ещё images: [{name, n}]', () => {
  assert.deepEqual(messageInput('t1', 'привет'), { turn: 't1', text: 'привет' });
  assert.deepEqual(messageInput('t1', 'привет', []), { turn: 't1', text: 'привет' });
  assert.deepEqual(messageInput('t1', '', [{ name: 'image.png', n: 3 }]), { turn: 't1', text: '', images: [{ name: 'image.png', n: 3 }] });
});

test('загрузка: по очереди, номера и имена в порядке списка; первая неудача останавливает остальное', async () => {
  const { list } = addImages([], [file('a.png'), file('b.png'), file('c.png')]);
  const calls = [];
  const ok = await uploadImages('s1', list, async (trace, item) => { calls.push(`${trace}:${item.name}`); return { n: calls.length }; });
  assert.deepEqual(ok, { ok: true, images: [{ name: 'a.png', n: 1 }, { name: 'b.png', n: 2 }, { name: 'c.png', n: 3 }] });
  assert.deepEqual(calls, ['s1:a.png', 's1:b.png', 's1:c.png']);

  const seen = [];
  const bad = await uploadImages('s1', list, async (trace, item) => {
    seen.push(item.name);
    if (item.name === 'b.png') throw new Error('413 слишком большая');
    return { n: 1 };
  });
  assert.deepEqual(bad, { ok: false, error: '413 слишком большая', name: 'b.png' });
  assert.deepEqual(seen, ['a.png', 'b.png']);

  const nonum = await uploadImages('s1', list, async () => ({}));
  assert.equal(nonum.ok, false);
  assert.equal(nonum.name, 'a.png');
});

test('буфер обмена: картинки из items (kind file, image/*); текст и не-картинки пропускаются', () => {
  const png = file('image.png');
  const items = [
    { kind: 'string', type: 'text/plain', getAsFile: () => null },
    { kind: 'file', type: 'image/png', getAsFile: () => png },
    { kind: 'file', type: 'application/pdf', getAsFile: () => file('x.pdf', 'application/pdf') },
    { kind: 'file', type: 'image/jpeg', getAsFile: () => null },
  ];
  assert.deepEqual(clipboardImages({ items }), [png]);
  assert.deepEqual(clipboardImages({ items: [], files: [png, file('t.txt', 'text/plain')] }), [png]);
  assert.deepEqual(clipboardImages({ items: [{ kind: 'string', type: 'text/plain' }] }), []);
  assert.deepEqual(clipboardImages(null), []);
  assert.deepEqual(clipboardImages({}), []);
});

test('есть ли текст в буфере и тащат ли файлы', () => {
  assert.equal(clipboardHasText({ types: ['text/plain', 'Files'] }), true);
  assert.equal(clipboardHasText({ types: ['Files'] }), false);
  assert.equal(clipboardHasText(null), false);
  assert.equal(dragHasFiles({ types: ['Files'] }), true);
  assert.equal(dragHasFiles({ types: ['text/uri-list'] }), false);
  assert.equal(dragHasFiles(null), false);
  assert.deepEqual(droppedFiles({ files: [file('a.png'), file('b.txt', 'text/plain')] }).map((f) => f.name), ['a.png', 'b.txt']);
  assert.deepEqual(droppedFiles(null), []);
});

test('адрес картинки на сервере', () => {
  assert.equal(imageUrl('abc-1', 3), '/api/session-image/abc-1/3');
  assert.equal(imageUrl('a b', 1), '/api/session-image/a%20b/1');
});

// Выбор провайдера, язык, микрофон, запросы к /api/stt (задача 192): на подставных fetch, хранилище и mediaDevices.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGS, resolveProvider, langFor, pageLang, insertAt, micReason, sttReason, fetchSttStatus, postStt, listMics, createVoiceSettings,
} from '../stt.js';

const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('провайдер по умолчанию: локальный, если сервер доступен, иначе браузер; явный выбор главнее', () => {
  assert.equal(resolveProvider(null, true), 'local');
  assert.equal(resolveProvider(null, false), 'browser');
  assert.equal(resolveProvider(null, null), 'browser');
  assert.equal(resolveProvider('browser', true), 'browser');
  assert.equal(resolveProvider('local', true), 'local');
  assert.equal(resolveProvider('local', null), 'local');
  assert.equal(resolveProvider('local', false), 'browser', 'сервер не запущен: временно браузер');
});

test('язык: локальному — код или auto, браузерному — BCP-47, «Авто» — язык страницы', () => {
  assert.equal(langFor('local', 'auto'), 'auto');
  assert.equal(langFor('local', 'ru'), 'ru');
  assert.equal(langFor('browser', 'auto', 'ru-RU'), 'ru-RU');
  assert.equal(langFor('browser', 'auto', 'en-US'), 'en-US');
  const bcp = Object.fromEntries(LANGS.filter((l) => l.id !== 'auto').map((l) => [l.id, langFor('browser', l.id)]));
  assert.deepEqual(bcp, { ru: 'ru-RU', en: 'en-US', uk: 'uk-UA', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', zh: 'zh-CN', ja: 'ja-JP' });
  assert.equal(langFor('local', 'нет-такого'), 'auto');
  assert.equal(pageLang({ documentElement: { lang: 'ru' } }), 'ru-RU');
  assert.equal(pageLang({ documentElement: { lang: 'en' } }), 'en-US');
  assert.equal(pageLang({ documentElement: { lang: 'pt-BR' } }), 'ru-RU');
  assert.equal(pageLang(null), 'ru-RU');
});

test('insertAt: позиция курсора, пробелы по краям, замена выделенного, пустой текст ничего не меняет', () => {
  assert.deepEqual(insertAt('начало конец', 7, 7, ' привет '), { value: 'начало привет конец', caret: 'начало привет'.length });
  assert.deepEqual(insertAt('', 0, 0, 'да'), { value: 'да', caret: 2 });
  assert.deepEqual(insertAt('aaaXXXbbb', 3, 6, 'ok'), { value: 'aaa ok bbb', caret: 6 });
  assert.deepEqual(insertAt('abc', 3, 3, '  '), { value: 'abc', caret: 3 });
});

test('причины ошибок по-русски', () => {
  assert.equal(micReason({ name: 'NotAllowedError' }), 'нет доступа к микрофону');
  assert.equal(micReason({ name: 'NotFoundError' }), 'микрофон не найден');
  assert.equal(micReason({ name: 'NotReadableError' }), 'микрофон занят другим приложением');
  assert.match(micReason({ name: 'NO_MEDIA' }), /защищённый адрес/);
  assert.equal(sttReason(503, { error: 'x' }), 'сервер распознавания не запущен');
  assert.equal(sttReason(413, null), 'запись слишком длинная');
  assert.equal(sttReason(502, { error: 'модель упала' }), 'сервер распознавания не справился: модель упала');
  assert.equal(sttReason(500, null), 'ответ сервера 500');
});

test('статус сервера: доступен, недоступен, сбой сети — недоступен', async () => {
  assert.deepEqual(await fetchSttStatus(async () => reply(200, { available: true, provider: 'local', model: 'small' })), { available: true, model: 'small' });
  assert.equal((await fetchSttStatus(async () => reply(200, { available: false }))).available, false);
  assert.equal((await fetchSttStatus(async () => reply(500, {}))).available, false);
  assert.equal((await fetchSttStatus(async () => { throw new Error('offline'); })).available, false);
});

test('запрос распознавания: POST /api/stt?lang=…, audio/wav, текст из ответа; ошибки с причиной', async () => {
  const calls = [];
  const wav = Uint8Array.from([1, 2, 3]);
  const ok = async (url, init) => { calls.push({ url, init }); return reply(200, { text: 'привет' }); };
  assert.deepEqual(await postStt(ok, wav, 'ru'), { ok: true, text: 'привет' });
  assert.equal(calls[0].url, '/api/stt?lang=ru');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'audio/wav');
  assert.equal(calls[0].init.body.size, 3);
  assert.equal(calls[0].init.body.type, 'audio/wav');
  assert.deepEqual(await postStt(async () => reply(503, { error: 'нет' }), wav, 'auto'), { ok: false, reason: 'сервер распознавания не запущен' });
  assert.deepEqual(await postStt(async () => { throw new Error('x'); }, wav, 'auto'), { ok: false, reason: 'нет связи с сервером' });
  assert.deepEqual(await postStt(async () => ({ ok: true, status: 200, json: async () => { throw new Error('не json'); } }), wav, 'auto'), { ok: true, text: '' });
});

test('микрофоны: только входы; без подписей — признак «нужно разрешение»', async () => {
  const dev = (kind, deviceId, label) => ({ kind, deviceId, label });
  const withLabels = { enumerateDevices: async () => [dev('audioinput', 'a', 'USB'), dev('audiooutput', 'o', 'Колонки'), dev('audioinput', 'b', 'Встроенный')] };
  assert.deepEqual(await listMics(withLabels), { devices: [{ id: 'a', label: 'USB' }, { id: 'b', label: 'Встроенный' }], labelled: true });
  const bare = { enumerateDevices: async () => [dev('audioinput', 'a', '')] };
  assert.equal((await listMics(bare)).labelled, false);
  assert.deepEqual(await listMics(undefined), { devices: [], labelled: false });
  assert.deepEqual(await listMics({ enumerateDevices: async () => { throw new Error('x'); } }), { devices: [], labelled: false });
});

test('настройки: выбор запоминается в хранилище и читается заново; чужие значения отбрасываются', async () => {
  const storage = store();
  const fetchFn = async () => reply(200, { available: true, model: 'small' });
  const a = createVoiceSettings({ storage, fetchFn, page: 'ru-RU' });
  assert.equal(a.provider(), 'browser', 'пока статус не известен');
  await a.refreshStatus();
  assert.equal(a.provider(), 'local', 'умолчание при доступном сервере');
  assert.equal(a.lang(), 'auto');
  a.setProvider('browser');
  a.setLang('de');
  a.setMic('dev-1');
  assert.equal(a.lang(), 'de-DE');
  const b = createVoiceSettings({ storage, fetchFn, page: 'ru-RU' });
  assert.deepEqual([b.state.saved, b.state.lang, b.state.mic], ['browser', 'de', 'dev-1']);
  b.setMic('');
  assert.equal(storage.getItem('crew.voice.mic'), null);
  const c = createVoiceSettings({ storage: store({ 'crew.voice.provider': 'cloud', 'crew.voice.lang': 'xx' }), fetchFn });
  assert.deepEqual([c.state.saved, c.state.lang], [null, 'auto']);
  // хранилище, которое бросает, и его отсутствие не ломают настройки
  const broken = { getItem() { throw new Error('closed'); }, setItem() { throw new Error('closed'); }, removeItem() { throw new Error('closed'); } };
  const d = createVoiceSettings({ storage: broken, fetchFn });
  d.setLang('ja');
  assert.equal(d.state.lang, 'ja');
  assert.equal(createVoiceSettings({ storage: null, fetchFn }).provider(), 'browser');
});

test('настройки: локальный выбран, но сервер не запущен — работает браузер, выбор сохранён', async () => {
  const s = createVoiceSettings({ storage: store({ 'crew.voice.provider': 'local' }), fetchFn: async () => reply(200, { available: false }) });
  await s.refreshStatus();
  assert.equal(s.state.available, false);
  assert.equal(s.provider(), 'browser');
  assert.equal(s.state.saved, 'local');
  assert.equal(s.lang(), 'ru-RU');
});

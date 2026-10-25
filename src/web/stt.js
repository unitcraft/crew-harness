// stt.js — выбор провайдера распознавания речи, языка и микрофона; запрос к локальному распознаванию (задача 192).
// Модуль не знает DOM: хранилище, fetch и mediaDevices приходят снаружи (так их заменяет тест).
// Языки здесь — данные (названия на своём языке), а не надписи интерфейса, поэтому лежат не в strings.js.

export const LANGS = Object.freeze([
  { id: 'auto', name: 'Авто', bcp: '' },
  { id: 'ru', name: 'Русский', bcp: 'ru-RU' },
  { id: 'en', name: 'English', bcp: 'en-US' },
  { id: 'uk', name: 'Укра\u0457нська', bcp: 'uk-UA' }, // ukrainian i-diaeresis is written as a code: the hygiene guard takes its literal for mojibake
  { id: 'de', name: 'Deutsch', bcp: 'de-DE' },
  { id: 'fr', name: 'Français', bcp: 'fr-FR' },
  { id: 'es', name: 'Español', bcp: 'es-ES' },
  { id: 'zh', name: '中文', bcp: 'zh-CN' },
  { id: 'ja', name: '日本語', bcp: 'ja-JP' },
]);

export const PROVIDERS = Object.freeze(['browser', 'local']);
export const MAX_RECORD_SECONDS = 60;
export const MIN_RECORD_SECONDS = 0.3;
const KEYS = Object.freeze({ provider: 'crew.voice.provider', lang: 'crew.voice.lang', mic: 'crew.voice.mic' });

/** Язык страницы в виде BCP-47 для браузерного распознавания: html lang="ru" → ru-RU, неизвестный → ru-RU. */
export function pageLang(doc) {
  const raw = String((doc && doc.documentElement && doc.documentElement.lang) || '').trim().toLowerCase();
  const hit = LANGS.find((l) => l.bcp && (l.bcp.toLowerCase() === raw || l.id === raw.split('-')[0]));
  return hit ? hit.bcp : 'ru-RU';
}

/** Язык для провайдера: локальному — короткий код или auto; браузерному — BCP-47, «Авто» = язык страницы. */
export function langFor(provider, langId, page = 'ru-RU') {
  const lang = LANGS.find((l) => l.id === langId) || LANGS[0];
  if (provider === 'local') return lang.id;
  return lang.bcp || page;
}

/**
 * Какой провайдер работает прямо сейчас. saved — выбор владельца (null — не выбирал), available — ответ
 * /api/stt/status (true, false или null — ещё неизвестно). «Локальный» при известной недоступности временно
 * заменяется браузерным, сам выбор не стирается: сервер поднимут — вернётся.
 */
export function resolveProvider(saved, available) {
  if (saved === 'browser') return 'browser';
  if (saved === 'local') return available === false ? 'browser' : 'local';
  return available === true ? 'local' : 'browser';
}

/** Вставка текста в позицию [from, to); возвращает { value, caret } с пробелами по краям, где нужно. */
export function insertAt(value, from, to, text) {
  const before = value.slice(0, from);
  const after = value.slice(to);
  const spoken = String(text || '').trim();
  if (!spoken) return { value, caret: from };
  const glue = before && !/\s$/.test(before) ? ' ' : '';
  const tail = after && !/^\s/.test(after) ? ' ' : '';
  return { value: `${before}${glue}${spoken}${tail}${after}`, caret: before.length + glue.length + spoken.length };
}

/** Причина по-русски для ошибки getUserMedia. */
export function micReason(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'нет доступа к микрофону';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'микрофон не найден';
  if (name === 'NotReadableError' || name === 'AbortError') return 'микрофон занят другим приложением';
  if (name === 'NO_MEDIA') return 'для записи нужен защищённый адрес (https или localhost)';
  return String((err && (err.message || name)) || 'микрофон недоступен');
}

/** Причина по-русски по ответу /api/stt. */
export function sttReason(status, body) {
  const detail = body && typeof body.error === 'string' ? body.error : '';
  if (status === 503) return 'сервер распознавания не запущен';
  if (status === 413) return 'запись слишком длинная';
  if (status === 502) return detail ? `сервер распознавания не справился: ${detail}` : 'сервер распознавания не справился';
  return detail || `ответ сервера ${status}`;
}

/** GET /api/stt/status → { available, model }; сбой сети или формата — available: false. */
export async function fetchSttStatus(fetchFn) {
  try {
    const r = await fetchFn('/api/stt/status', { cache: 'no-store' });
    if (!r.ok) return { available: false, model: '' };
    const body = await r.json();
    return { available: body.available === true, model: body.model || '' };
  } catch {
    return { available: false, model: '' };
  }
}

/** POST /api/stt?lang=… с WAV; возвращает { ok: true, text } или { ok: false, reason }. */
export async function postStt(fetchFn, wav, lang) {
  let r;
  try {
    r = await fetchFn(`/api/stt?lang=${encodeURIComponent(lang)}`, {
      method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: new Blob([wav], { type: 'audio/wav' }),
    });
  } catch {
    return { ok: false, reason: 'нет связи с сервером' };
  }
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  if (!r.ok) return { ok: false, reason: sttReason(r.status, body) };
  return { ok: true, text: body && typeof body.text === 'string' ? body.text : '' };
}

/** Микрофоны: список входов и признак «подписей нет» (разрешения на микрофон ещё не давали). */
export async function listMics(mediaDevices) {
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') return { devices: [], labelled: false };
  try {
    const all = await mediaDevices.enumerateDevices();
    const devices = all.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'communications')
      .map((d) => ({ id: d.deviceId, label: d.label || '' }));
    return { devices, labelled: devices.length > 0 && devices.every((d) => d.label) };
  } catch {
    return { devices: [], labelled: false };
  }
}

/**
 * Настройки голосового ввода: что выбрано и что известно о сервере и микрофонах.
 * @param deps { storage, fetchFn, mediaDevices, page }
 */
export function createVoiceSettings({ storage, fetchFn, mediaDevices, page = 'ru-RU' }) {
  const read = (key) => { try { return storage ? storage.getItem(key) : null; } catch { return null; } };
  const write = (key, value) => {
    try {
      if (!storage) return;
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
    } catch { /* хранилища может не быть: выбор тогда живёт до закрытия страницы */ }
  };
  const savedProvider = read(KEYS.provider);
  const savedLang = read(KEYS.lang);
  const s = {
    saved: PROVIDERS.includes(savedProvider) ? savedProvider : null,
    lang: LANGS.some((l) => l.id === savedLang) ? savedLang : 'auto',
    mic: read(KEYS.mic) || '',
    available: null,
    model: '',
    mics: { devices: [], labelled: false },
  };
  return {
    state: s,
    provider() { return resolveProvider(s.saved, s.available); },
    lang() { return langFor(this.provider(), s.lang, page); },
    async refreshStatus() {
      const st = await fetchSttStatus(fetchFn);
      s.available = st.available;
      s.model = st.model;
      return st;
    },
    async refreshMics() { s.mics = await listMics(mediaDevices); return s.mics; },
    setProvider(id) { if (PROVIDERS.includes(id)) { s.saved = id; write(KEYS.provider, id); } },
    setLang(id) { if (LANGS.some((l) => l.id === id)) { s.lang = id; write(KEYS.lang, id); } },
    setMic(id) { s.mic = id || ''; write(KEYS.mic, s.mic || null); },
  };
}

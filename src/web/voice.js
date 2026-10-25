// voice.js — голосовой ввод в поле сообщения (задача 192): обёртка над Web Speech API браузера.
// Речь уходит в службу распознавания самого браузера (Google или Яндекс), не на наш сервер. Модуль не знает DOM:
// поле — любой объект со строкой value и выделением selectionStart/selectionEnd; распознаватель — любой конструктор с
// интерфейсом SpeechRecognition (так его заменяет тест). Ничего не отправляется само: текст только попадает в поле.

/** Конструктор распознавателя окна, если браузер его даёт (в Chromium он с префиксом webkit). */
export function speechCtor(win) {
  if (!win) return null;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

const REASONS = Object.freeze({
  'not-allowed': 'нет доступа к микрофону',
  'service-not-allowed': 'браузер не разрешает службу распознавания',
  network: 'нет связи со службой распознавания речи',
  'no-speech': 'речь не расслышана',
  'audio-capture': 'микрофон не найден',
  'language-not-supported': 'язык не поддерживается',
  aborted: 'запись прервана',
});

/** Причина по коду ошибки распознавания, по-русски; незнакомый код называется как есть. */
export function reasonOf(code) {
  return REASONS[code] || String(code || 'неизвестная ошибка');
}

export const NO_API_REASON = 'в браузере нет распознавания речи';

/**
 * @param deps.Ctor      конструктор распознавателя или null
 * @param deps.field     поле: { value, selectionStart, selectionEnd, setSelectionRange? }
 * @param deps.lang      язык распознавания, например 'ru-RU'
 * @param deps.onChange  вызывается после каждого изменения поля (подогнать высоту, сохранить черновик)
 * @param deps.onStatus  вызывается с { state: 'idle' | 'recording' | 'unavailable', reason? }
 * @returns { start(), stop(), toggle(), active() }
 */
export function createDictation({ Ctor, field, lang = 'ru-RU', onChange = () => {}, onStatus = () => {} }) {
  let rec = null;
  let before = '';
  let after = '';
  let finalText = '';
  let failed = false;

  const compose = (interim) => {
    const spoken = `${finalText}${interim}`;
    const glue = spoken && before && !/\s$/.test(before) ? ' ' : '';
    const tail = spoken && after && !/^\s/.test(after) ? ' ' : '';
    field.value = `${before}${glue}${spoken}${tail}${after}`;
    const caret = before.length + glue.length + spoken.length;
    if (typeof field.setSelectionRange === 'function') field.setSelectionRange(caret, caret);
    onChange();
  };

  function start() {
    if (rec) return false;
    if (!Ctor) { onStatus({ state: 'unavailable', reason: NO_API_REASON }); return false; }
    const value = String(field.value ?? '');
    const from = Number.isInteger(field.selectionStart) ? field.selectionStart : value.length;
    const to = Number.isInteger(field.selectionEnd) ? field.selectionEnd : from;
    before = value.slice(0, from);
    after = value.slice(to);
    finalText = '';
    failed = false;
    let r;
    try {
      r = new Ctor();
    } catch (e) {
      onStatus({ state: 'unavailable', reason: reasonOf(e && e.name) });
      return false;
    }
    r.lang = lang;
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (event) => {
      // results накапливает весь сеанс записи: итог и черновик пересобираются целиком, а не дописываются
      let interim = '';
      finalText = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0] ? result[0].transcript : '';
        if (result.isFinal) finalText += text; else interim += text;
      }
      compose(interim);
    };
    r.onerror = (event) => {
      failed = true;
      onStatus({ state: 'unavailable', reason: reasonOf(event && event.error) });
    };
    r.onend = () => {
      rec = null;
      // после ошибки браузер всё равно кончает запись: «недоступно» остаётся, а не сбрасывается в «покой»
      if (!failed) onStatus({ state: 'idle' });
    };
    rec = r;
    try {
      r.start();
    } catch (e) {
      rec = null;
      onStatus({ state: 'unavailable', reason: reasonOf(e && e.name) });
      return false;
    }
    onStatus({ state: 'recording' });
    return true;
  }

  function stop() {
    if (rec) rec.stop();
  }

  return {
    start,
    stop,
    toggle() { if (rec) stop(); else start(); },
    active() { return rec !== null; },
  };
}

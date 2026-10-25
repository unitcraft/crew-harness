// recorder.js — голосовой ввод через локальное распознавание (задача 192): запись микрофона страницей и отправка WAV
// на /api/stt. Интерфейс тот же, что у createDictation из voice.js (start / stop / toggle / active), статусы шире:
//   idle | recording | processing { reason? — пояснение } | error { reason }.
// Ничего не отправляется в чат само: распознанный текст только попадает в позицию курсора поля.
// Браузерные части (микрофон, звуковой контекст, fetch, таймеры) приходят снаружи, поэтому модуль проверяется в node.

import { chunksToWav16k, wavSeconds } from './wav.js';
import { MAX_RECORD_SECONDS, MIN_RECORD_SECONDS, insertAt, micReason, postStt } from './stt.js';

const NOT_HEARD = 'речь не расслышана';
const TOO_SHORT = 'запись слишком короткая';
const LIMIT_NOTE = `Достигнут предел записи в ${MAX_RECORD_SECONDS} с.`;

/**
 * @param deps.field         поле: { value, selectionStart, selectionEnd, setSelectionRange? }
 * @param deps.mediaDevices  navigator.mediaDevices или undefined
 * @param deps.AudioCtx      конструктор AudioContext
 * @param deps.fetchFn       fetch
 * @param deps.getLang       () → код языка для сервера ('auto', 'ru', ...)
 * @param deps.getMic        () → deviceId выбранного микрофона или ''
 * @param deps.workletUrl    адрес rec-worklet.js; без него (или при сбое) запись идёт через ScriptProcessor
 * @param deps.timers        { setTimeout, clearTimeout }
 * @param deps.onChange      вызывается после изменения поля
 * @param deps.onStatus      вызывается со статусом
 */
export function createLocalDictation({
  field, mediaDevices, AudioCtx, fetchFn, getLang = () => 'auto', getMic = () => '', workletUrl = '',
  timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id) },
  onChange = () => {}, onStatus = () => {},
}) {
  let phase = 'idle'; // idle | starting | recording | processing
  let stopAsked = false;
  let session = null;
  let timer = null;
  let startValue = '';
  let from = 0;
  let to = 0;
  let limitHit = false;
  let cancelAsked = false;

  async function openCapture() {
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function' || !AudioCtx) {
      throw Object.assign(new Error('no media'), { name: 'NO_MEDIA' });
    }
    const mic = getMic();
    let stream;
    try {
      stream = await mediaDevices.getUserMedia({ audio: mic ? { deviceId: { exact: mic } } : true });
    } catch (e) {
      // сохранённого микрофона уже нет (отключили): пробуем микрофон по умолчанию
      if (mic && e && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) stream = await mediaDevices.getUserMedia({ audio: true });
      else throw e;
    }
    const ctx = new AudioCtx();
    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const chunks = [];
      let node = null;
      let viaWorklet = false;
      if (workletUrl && ctx.audioWorklet && typeof globalThis.AudioWorkletNode === 'function') {
        try {
          await ctx.audioWorklet.addModule(workletUrl);
          node = new globalThis.AudioWorkletNode(ctx, 'rec-capture');
          node.port.onmessage = (e) => chunks.push(e.data);
          viaWorklet = true;
        } catch { node = null; }
      }
      if (!node) {
        node = ctx.createScriptProcessor(4096, 1, 1);
        node.onaudioprocess = (e) => chunks.push(Float32Array.from(e.inputBuffer.getChannelData(0)));
      }
      source.connect(node);
      node.connect(ctx.destination); // выход молчит (в него ничего не пишем), но без подключения узел не опрашивается
      return {
        viaWorklet,
        close() {
          try { source.disconnect(); node.disconnect(); } catch { /* уже отключено */ }
          for (const track of stream.getTracks()) track.stop();
          if (typeof ctx.close === 'function') ctx.close().catch(() => {});
          return { chunks, rate: ctx.sampleRate };
        },
      };
    } catch (e) {
      for (const track of stream.getTracks()) track.stop();
      if (typeof ctx.close === 'function') ctx.close().catch(() => {});
      throw e;
    }
  }

  async function finish() {
    phase = 'processing';
    if (timer !== null) { timers.clearTimeout(timer); timer = null; }
    const { chunks, rate } = session.close();
    session = null;
    const wav = chunksToWav16k(chunks, rate);
    if (wavSeconds(wav) < MIN_RECORD_SECONDS) {
      phase = 'idle';
      onStatus({ state: 'error', reason: TOO_SHORT });
      return;
    }
    onStatus({ state: 'processing', reason: limitHit ? LIMIT_NOTE : '' });
    const result = await postStt(fetchFn, wav, getLang());
    phase = 'idle';
    if (!result.ok) { onStatus({ state: 'error', reason: result.reason }); return; }
    if (!result.text.trim()) { onStatus({ state: 'error', reason: NOT_HEARD }); return; }
    // поле, пока шло распознавание, могли править: тогда текст встаёт туда, где курсор сейчас
    const unchanged = field.value === startValue;
    const value = String(field.value ?? '');
    const a = unchanged ? from : (Number.isInteger(field.selectionStart) ? field.selectionStart : value.length);
    const b = unchanged ? to : (Number.isInteger(field.selectionEnd) ? field.selectionEnd : a);
    const next = insertAt(value, a, b, result.text);
    field.value = next.value;
    if (typeof field.setSelectionRange === 'function') field.setSelectionRange(next.caret, next.caret);
    onChange();
    onStatus({ state: 'idle' });
  }

  async function begin() {
    try {
      session = await openCapture();
    } catch (e) {
      phase = 'idle';
      onStatus({ state: 'error', reason: micReason(e) });
      return;
    }
    if (cancelAsked) { session.close(); session = null; phase = 'idle'; onStatus({ state: 'idle' }); return; }
    if (stopAsked) { await finish(); return; }
    phase = 'recording';
    timer = timers.setTimeout(() => { limitHit = true; stop(); }, MAX_RECORD_SECONDS * 1000);
  }

  function start() {
    if (phase !== 'idle') return false;
    phase = 'starting';
    stopAsked = false;
    cancelAsked = false;
    limitHit = false;
    startValue = String(field.value ?? '');
    from = Number.isInteger(field.selectionStart) ? field.selectionStart : startValue.length;
    to = Number.isInteger(field.selectionEnd) ? field.selectionEnd : from;
    onStatus({ state: 'recording' });
    begin();
    return true;
  }

  function stop() {
    if (phase === 'starting') stopAsked = true;
    else if (phase === 'recording') finish();
  }

  // Esc: запись выбрасывается, на распознавание не уходит, в поле ничего не попадает
  function cancel() {
    if (phase === 'starting') { cancelAsked = true; return; }
    if (phase !== 'recording') return;
    if (timer !== null) { timers.clearTimeout(timer); timer = null; }
    session.close();
    session = null;
    phase = 'idle';
    onStatus({ state: 'idle' });
  }

  return {
    start,
    stop,
    cancel,
    toggle() { if (phase === 'starting' || phase === 'recording') stop(); else if (phase === 'idle') start(); },
    active() { return phase === 'starting' || phase === 'recording'; },
    busy() { return phase !== 'idle'; },
  };
}

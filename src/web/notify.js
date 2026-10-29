// notify.js — задача 192.14: заметить, что сессия ждёт владельца, когда вкладка не на виду: заголовок «(N) …» с миганием, точка в значке вкладки,
// уведомление браузера и тихий «динь». Всё зависит от внешнего мира через deps, чтобы проверяться без браузера.
//
// deps: { doc, win, storage (localStorage или null), timers: { every(fn, ms) -> stop }, Notification (класс или undefined), AudioContext (класс или undefined) }.
// Выключатели «колокольчик» и «звук» по умолчанию выключены; выбор помнится в localStorage (в try/catch).

import { pageTitle } from './attention.js';

export const BELL_KEY = 'crew-console-notify';
export const SOUND_KEY = 'crew-console-sound';
export const BLINK_MS = 2000;

function readFlag(storage, key) {
  try { return storage ? storage.getItem(key) === '1' : false; } catch { return false; }
}
function writeFlag(storage, key, on) {
  try { if (storage) storage.setItem(key, on ? '1' : '0'); } catch { /* закрытое хранилище: выбор живёт до перезагрузки */ }
}

/** Короткий «динь» без файлов: два тона по 120 мс; нет AudioContext — тишина. */
export function playDing(AudioContext) {
  if (typeof AudioContext !== 'function') return false;
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    gain.connect(ctx.destination);
    [[880, 0], [1320, 0.12]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.12);
    });
    return true;
  } catch { return false; }
}

/** Точка в значке вкладки: круг значка и оранжевая точка в углу (canvas); нет canvas — пусто. */
export function faviconDataUrl(doc, dot) {
  try {
    const canvas = doc.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const g = canvas.getContext('2d');
    if (!g) return '';
    g.fillStyle = '#3b6df0';
    g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill();
    if (dot) {
      g.fillStyle = '#f08a24';
      g.beginPath(); g.arc(24, 8, 8, 0, Math.PI * 2); g.fill();
    }
    return canvas.toDataURL('image/png');
  } catch { return ''; }
}

export function createNotifier(deps) {
  const { doc, win, storage = null, timers, baseTitle, blinkText } = deps;
  const Notif = deps.Notification;
  const state = { bell: readFlag(storage, BELL_KEY), sound: readFlag(storage, SOUND_KEY), count: 0, blinkOn: false, known: new Set(), stop: null, started: false };
  const iconLink = () => doc.querySelector ? doc.querySelector('link[rel="icon"]') : null;
  let baseIcon = null;
  const listeners = [];
  const changed = () => listeners.forEach((fn) => fn());

  const hidden = () => Boolean(doc.hidden) || (typeof doc.hasFocus === 'function' && !doc.hasFocus());

  function paint() {
    doc.title = pageTitle(baseTitle, state.count, state.blinkOn, blinkText);
    const link = iconLink();
    if (link) {
      if (baseIcon === null) baseIcon = link.getAttribute('href');
      const url = state.count > 0 ? faviconDataUrl(doc, true) : '';
      if (state.count > 0 && url) { link.setAttribute('href', url); link.setAttribute('type', 'image/png'); }
      else if (baseIcon) { link.setAttribute('href', baseIcon); link.setAttribute('type', 'image/svg+xml'); }
    }
  }

  function ensureBlink() {
    const need = state.count > 0 && hidden();
    if (need && !state.stop) {
      state.stop = timers.every(() => { state.blinkOn = !state.blinkOn; paint(); if (!(state.count > 0 && hidden())) { state.blinkOn = false; paint(); stopBlink(); } }, BLINK_MS);
    } else if (!need && state.stop) { stopBlink(); state.blinkOn = false; paint(); }
  }
  function stopBlink() { if (state.stop) { state.stop(); state.stop = null; } }

  return {
    state,
    onChange(fn) { listeners.push(fn); },
    bellOn: () => state.bell,
    soundOn: () => state.sound,
    /** Включить/выключить уведомления; при первом включении просит разрешение браузера. Возвращает promise<bool> — что в итоге включено. */
    async setBell(on) {
      if (on && typeof Notif === 'function' && Notif.permission === 'default' && typeof Notif.requestPermission === 'function') {
        try { await Notif.requestPermission(); } catch { /* отказ — ниже */ }
      }
      state.bell = Boolean(on) && typeof Notif === 'function' && Notif.permission !== 'denied';
      writeFlag(storage, BELL_KEY, state.bell);
      changed();
      return state.bell;
    },
    setSound(on) {
      state.sound = Boolean(on);
      writeFlag(storage, SOUND_KEY, state.sound);
      if (state.sound) playDing(deps.AudioContext); // сразу слышно, что звук включён
      changed();
    },
    /**
     * Сколько сессий ждут владельца (`keys` — «id|ключ» ещё не открытых) и какие из них новые.
     * names: id -> название; selected: открытая сессия. Уведомление и звук — только о новых и только когда вкладка не на виду или открыта другая сессия.
     */
    update(keys, names = {}, selected = '') {
      state.count = keys.length;
      const fresh = keys.filter((k) => !state.known.has(k));
      state.known = new Set(keys);
      paint();
      ensureBlink();
      const away = hidden();
      const worth = fresh.filter((k) => away || k.split('|')[0] !== selected);
      if (worth.length === 0) return 0;
      if (state.bell && typeof Notif === 'function' && Notif.permission === 'granted') {
        for (const k of worth.slice(0, 3)) {
          const id = k.split('|')[0];
          try { new Notif(blinkText, { body: names[id] || id, tag: `crew-${id}` }); } catch { /* уведомление не показалось: подсветка остаётся */ }
        }
      }
      if (state.sound) playDing(deps.AudioContext);
      return worth.length;
    },
    /** Вкладка снова на виду: мигание останавливается. */
    visibilityChanged() { ensureBlink(); },
  };
}

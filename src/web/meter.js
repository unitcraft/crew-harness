// meter.js — бегущая дорожка уровня голоса во время записи (задача 192). Чистые функции окна уровней и измеритель
// на AnalyserNode: свой getUserMedia, закрывается при остановке записи; не вышло — ровные точки, страница не падает.

export const BARS = 40;
export const TICK_MS = 50;
const SILENT = 0.04; // ниже этого уровня столбик — точка

/** Уровень 0..1 по окну времени-амплитуды (Uint8Array AnalyserNode, середина 128): среднеквадратичное с запасом усиления. */
export function levelOf(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = (samples[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 5);
}

/** Сглаживание: подъём быстрый, спад медленный, чтобы дорожка не дёргалась. */
export function smoothLevel(prev, next) {
  return next > prev ? prev * 0.35 + next * 0.65 : prev * 0.8 + next * 0.2;
}

/** Окно из size уровней: новый справа, старые смещаются влево; короткое окно слева добито нулями. */
export function pushLevel(window, level, size = BARS) {
  const next = [...window, Math.max(0, Math.min(1, level))];
  while (next.length < size) next.unshift(0);
  return next.slice(next.length - size);
}

/** Высоты столбиков в px: тишина — точка (minPx), голос — до maxPx. */
export function barHeights(window, minPx = 3, maxPx = 24) {
  return window.map((l) => (l < SILENT ? minPx : Math.round(minPx + l * (maxPx - minPx))));
}

/** Что показывает карточка: в записи — «Слушаю…» вместо подсказки, без кнопки отправки, с «↵» и дорожкой. */
export function recordingView(state) {
  const on = state === 'recording';
  return { placeholderKey: on ? 'voice.listening' : 'composer.placeholder', hideSend: on, showEnter: on, showWave: on };
}

/**
 * Измеритель уровня. getMic() — выбранный микрофон или ''. onLevels(window) вызывается каждые TICK_MS мс.
 * start() не бросает: при отказе дорожка остаётся ровными точками.
 */
export function createMeter({ mediaDevices, AudioCtx, getMic = () => '', onLevels, timers = { setInterval: (f, ms) => setInterval(f, ms), clearInterval: (id) => clearInterval(id) } }) {
  let token = 0;
  let tick = null;
  let stream = null;
  let ctx = null;
  let win = pushLevel([], 0);

  function release() {
    if (tick !== null) { timers.clearInterval(tick); tick = null; }
    if (stream) { for (const track of stream.getTracks()) track.stop(); stream = null; }
    if (ctx && typeof ctx.close === 'function') ctx.close().catch(() => {});
    ctx = null;
  }

  async function start() {
    const mine = token + 1;
    token = mine;
    release();
    win = pushLevel([], 0);
    onLevels(win);
    let analyser = null;
    try {
      if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function' || !AudioCtx) throw new Error('no media');
      const mic = getMic();
      let s;
      try {
        s = await mediaDevices.getUserMedia({ audio: mic ? { deviceId: { exact: mic } } : true });
      } catch (e) {
        if (mic) s = await mediaDevices.getUserMedia({ audio: true }); else throw e;
      }
      if (token !== mine) { for (const track of s.getTracks()) track.stop(); return; }
      stream = s;
      ctx = new AudioCtx();
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') await ctx.resume();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
    } catch {
      analyser = null; // нет измерителя: ровные точки
    }
    if (token !== mine) { release(); return; }
    const buffer = analyser ? new Uint8Array(analyser.fftSize) : null;
    let last = 0;
    tick = timers.setInterval(() => {
      let level = 0;
      if (analyser) {
        analyser.getByteTimeDomainData(buffer);
        level = smoothLevel(last, levelOf(buffer));
        last = level;
      }
      win = pushLevel(win, level);
      onLevels(win);
    }, TICK_MS);
  }

  function stop() {
    token += 1;
    release();
    win = pushLevel([], 0);
    onLevels(win);
  }

  return { start, stop };
}

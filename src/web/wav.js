// wav.js — запись в WAV для локального распознавания (задача 192): сведение к 16 кГц моно и кодирование PCM16.
// Чистые функции без DOM и без звуковых API браузера: проверяются в node. Сервер ждёт именно такой формат:
// RIFF/WAVE, 16000 Гц, 1 канал, 16 бит, little-endian.

export const WAV_RATE = 16000;

/** Склеивает куски записи (Float32Array) в один массив. */
export function concatChunks(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * Пересчёт частоты. Понижение — усреднение окна (простой фильтр от наложения частот), повышение — линейная
 * интерполяция. Результат зависит только от входа: без случайности и без состояния.
 */
export function resample(input, from, to) {
  if (!(from > 0) || !(to > 0)) throw new RangeError('частота должна быть положительной');
  if (from === to) return Float32Array.from(input);
  const length = Math.floor((input.length * to) / from);
  const out = new Float32Array(length);
  const ratio = from / to;
  for (let i = 0; i < length; i += 1) {
    if (ratio > 1) {
      const a = Math.floor(i * ratio);
      const b = Math.min(input.length, Math.max(a + 1, Math.ceil((i + 1) * ratio)));
      let sum = 0;
      for (let j = a; j < b; j += 1) sum += input[j];
      out[i] = sum / (b - a);
    } else {
      const pos = i * ratio;
      const a = Math.floor(pos);
      const frac = pos - a;
      const x = input[a];
      const y = a + 1 < input.length ? input[a + 1] : x;
      out[i] = x + (y - x) * frac;
    }
  }
  return out;
}

/** Float32 [-1, 1] → Int16, с отсечением выбросов. */
export function floatToPcm16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }
  return out;
}

/** WAV-файл (заголовок 44 байта + данные) из Int16Array; частота — rate, один канал. */
export function encodeWav(pcm, rate = WAV_RATE) {
  const bytes = pcm.length * 2;
  const out = new Uint8Array(44 + bytes);
  const view = new DataView(out.buffer);
  const tag = (at, s) => { for (let i = 0; i < s.length; i += 1) out[at + i] = s.charCodeAt(i); };
  tag(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // моно
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, bytes, true);
  for (let i = 0; i < pcm.length; i += 1) view.setInt16(44 + i * 2, pcm[i], true);
  return out;
}

/** Всё вместе: куски записи на частоте sourceRate → готовый WAV 16 кГц моно 16 бит. */
export function chunksToWav16k(chunks, sourceRate) {
  return encodeWav(floatToPcm16(resample(concatChunks(chunks), sourceRate, WAV_RATE)), WAV_RATE);
}

/** Длительность записи в секундах по числу отсчётов на 16 кГц. */
export function wavSeconds(wav) {
  return Math.max(0, (wav.length - 44) / 2 / WAV_RATE);
}

// WAV для локального распознавания (задача 192): заголовок, частота, длина, пересчёт частоты.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WAV_RATE, concatChunks, resample, floatToPcm16, encodeWav, chunksToWav16k, wavSeconds } from '../wav.js';

const ascii = (u8, from, len) => String.fromCharCode(...u8.slice(from, from + len));

test('заголовок: RIFF/WAVE, PCM, 1 канал, 16000 Гц, 16 бит, длины сходятся', () => {
  const wav = encodeWav(Int16Array.from([0, 1000, -1000, 32767]), WAV_RATE);
  const view = new DataView(wav.buffer);
  assert.equal(ascii(wav, 0, 4), 'RIFF');
  assert.equal(ascii(wav, 8, 4), 'WAVE');
  assert.equal(ascii(wav, 12, 4), 'fmt ');
  assert.equal(ascii(wav, 36, 4), 'data');
  assert.equal(view.getUint16(20, true), 1, 'PCM');
  assert.equal(view.getUint16(22, true), 1, 'моно');
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(28, true), 32000, 'байт в секунду');
  assert.equal(view.getUint16(32, true), 2, 'выравнивание');
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 8, 'байт данных');
  assert.equal(view.getUint32(4, true), wav.length - 8, 'размер RIFF');
  assert.equal(wav.length, 44 + 8);
  assert.deepEqual([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)], [0, 1000, -1000, 32767]);
});

test('floatToPcm16: границы, отсечение выбросов', () => {
  assert.deepEqual([...floatToPcm16(Float32Array.from([0, 1, -1, 2, -3, 0.5]))], [0, 32767, -32768, 32767, -32768, 16384]);
});

test('resample 48 кГц → 16 кГц: длина втрое меньше, значения детерминированы', () => {
  const input = Float32Array.from({ length: 48000 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000));
  const a = resample(input, 48000, 16000);
  const b = resample(input, 48000, 16000);
  assert.equal(a.length, 16000);
  assert.deepEqual([...a], [...b]);
  const flat = resample(new Float32Array(300).fill(0.25), 48000, 16000);
  assert.equal(flat.length, 100);
  assert.ok(flat.every((v) => Math.abs(v - 0.25) < 1e-6));
  // усреднение окна из трёх отсчётов
  assert.deepEqual([...resample(Float32Array.from([0, 3, 6, 9, 12, 15]), 48000, 16000)], [3, 12]);
});

test('resample: та же частота — копия, повышение — линейная интерполяция, нулевая частота — ошибка', () => {
  const x = Float32Array.from([0.1, 0.2]);
  const same = resample(x, 16000, 16000);
  assert.deepEqual([...same], [...x]);
  assert.notEqual(same, x);
  assert.deepEqual([...resample(Float32Array.from([0, 1]), 8000, 16000)].map((v) => Math.round(v * 100) / 100), [0, 0.5, 1, 1]);
  assert.throws(() => resample(x, 0, 16000), RangeError);
});

test('chunksToWav16k: куски склеиваются, итог — 16 кГц, длительность считается', () => {
  const chunks = [new Float32Array(24000).fill(0.1), new Float32Array(24000).fill(0.1)]; // 1 с на 48 кГц
  assert.equal(concatChunks(chunks).length, 48000);
  const wav = chunksToWav16k(chunks, 48000);
  assert.equal(wav.length, 44 + 16000 * 2);
  assert.equal(wavSeconds(wav), 1);
  assert.equal(ascii(wav, 0, 4), 'RIFF');
  assert.equal(wavSeconds(encodeWav(new Int16Array(0))), 0);
});

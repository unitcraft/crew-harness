// rec-worklet.js — захват звука для локального распознавания (задача 192): отдаёт странице куски отсчётов микрофона.
// Запасной путь без AudioWorklet живёт в recorder.js. Файл отдельный: CSP страницы запрещает встроенный код.
class RecCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) this.port.postMessage(channel.slice());
    return true;
  }
}
registerProcessor('rec-capture', RecCapture);

// toast.js — плавающая плашка с ошибкой: показывается, гаснет сама через TOAST_MS или по команде (задача 192).
// Модуль не знает DOM: показ и скрытие приходят снаружи, таймеры — тоже (так их заменяет тест).

export const TOAST_MS = 6000;

/**
 * @param deps.show    (text) — показать плашку с текстом
 * @param deps.hide    () — убрать плашку
 * @param deps.timers  { setTimeout, clearTimeout }
 * @param deps.ms      через сколько погаснуть сама
 * @returns { show(text), hide(), visible() }
 */
export function createToast({ show, hide, timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id) }, ms = TOAST_MS }) {
  let timer = null;
  let shown = false;
  const stop = () => { if (timer !== null) { timers.clearTimeout(timer); timer = null; } };
  const api = {
    show(text) {
      stop();
      shown = true;
      show(text);
      timer = timers.setTimeout(() => api.hide(), ms);
    },
    hide() {
      stop();
      if (!shown) return;
      shown = false;
      hide();
    },
    visible() { return shown; },
  };
  return api;
}

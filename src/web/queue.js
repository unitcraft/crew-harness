// queue.js — очередь сообщений «на потом» (задача 192b): Ctrl+Enter при работающем агенте.
//
// Очередь живёт только в странице (в потоке событий её нет): по сессии, FIFO. Модуль чистый — ни
// DOM, ни транспорта: app.js вызывает take() на каждое изменение модели, view.js — keyAction().

/** Агент занят ходом: отвечает или ждёт разрешения (так же определён спиннер в view.js). */
export function isBusy(state) {
  return state === 'answering' || state === 'permission';
}

/**
 * Что делает нажатие клавиши в поле ввода: 'send' | 'queue' | null (не наше).
 * Enter — отправка как раньше; Ctrl+Enter / Cmd+Enter — в очередь, если агент занят, иначе обычная отправка.
 * Shift+Enter остаётся переносом строки.
 */
export function keyAction(e, busy) {
  if (e.key !== 'Enter' || e.isComposing) return null;
  if (e.ctrlKey || e.metaKey) return busy ? 'queue' : 'send';
  if (e.shiftKey) return null;
  return 'send';
}

export function createQueue() {
  const lists = new Map();   // trace -> string[]
  const sentAt = new Map();  // trace -> число сообщений сессии в момент выдачи (страховка от двойной выдачи)

  return {
    push(trace, text) {
      const list = lists.get(trace) ?? [];
      list.push(text);
      lists.set(trace, list);
      return list.length;
    },
    count(trace) { return (lists.get(trace) ?? []).length; },
    traces() { return [...lists.keys()]; },
    /** Убрать последнее поставленное сообщение (клик по счётчику). Возвращает его текст или undefined. */
    popLast(trace) {
      const list = lists.get(trace);
      const text = list ? list.pop() : undefined;
      if (list && list.length === 0) lists.delete(trace);
      return text;
    },
    /**
     * Выдать следующее сообщение, если ход закончился (состояние «ждёт»). Пока отправленное не дошло
     * до модели (число сообщений не выросло), второе не выдаётся.
     */
    take(trace, session) {
      const list = lists.get(trace);
      if (!list || list.length === 0 || !session || session.state !== 'idle') return undefined;
      if (sentAt.get(trace) === session.messages.length) return undefined;
      const text = list.shift();
      if (list.length === 0) lists.delete(trace);
      sentAt.set(trace, session.messages.length);
      return text;
    },
    /** Отправка не удалась: вернуть сообщение в начало очереди. */
    restore(trace, text) {
      const list = lists.get(trace) ?? [];
      list.unshift(text);
      lists.set(trace, list);
      sentAt.delete(trace);
    },
    /** Сессии нет в модели (удалена): её очередь сбрасывается. */
    prune(sessions) {
      for (const trace of [...lists.keys()]) if (!sessions[trace]) lists.delete(trace);
      for (const trace of [...sentAt.keys()]) if (!sessions[trace]) sentAt.delete(trace);
    },
  };
}

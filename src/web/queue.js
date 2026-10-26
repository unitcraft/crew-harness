// queue.js — очередь сообщений (задача 192b, переделана): Enter при работающем агенте ставит сообщение в очередь страницы.
//
// Очередь живёт только в странице (в потоке событий её нет): по сессии, FIFO. Модуль чистый — ни
// DOM, ни транспорта: app.js вызывает take() на каждое изменение модели, view.js — keyAction().

/** Агент занят ходом: отвечает или ждёт разрешения (так же определён спиннер в view.js). */
export function isBusy(state) {
  return state === 'answering' || state === 'permission';
}

/**
 * Что делает нажатие клавиши в поле ввода: 'send' | null (не наше). Enter — отправить: агент свободен — сообщение уходит сразу,
 * занят — встаёт в очередь страницы и уходит, когда ход закончится (решает view.js по состоянию сессии, не клавиша).
 * Shift+Enter — перенос строки (его вставляет сам браузер). Ctrl+Enter и Cmd+Enter — особого действия нет.
 */
export function keyAction(e) {
  if (e.key !== 'Enter' || e.isComposing) return null;
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
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
    /** Сообщения очереди сессии, первое поставленное первым (для ленты). */
    items(trace) { return [...(lists.get(trace) ?? [])]; },
    /** Убрать сообщение по номеру («вернуть на редактирование»): возвращает его или undefined. */
    removeAt(trace, index) {
      const list = lists.get(trace);
      if (!list || index < 0 || index >= list.length) return undefined;
      const [item] = list.splice(index, 1);
      if (list.length === 0) lists.delete(trace);
      return item;
    },
    /** «Отправить сейчас»: сообщение встаёт первым, остальные идут за ним. */
    moveToFront(trace, index) {
      const list = lists.get(trace);
      if (!list || index <= 0 || index >= list.length) return;
      const [item] = list.splice(index, 1);
      list.unshift(item);
    },
    traces() { return [...lists.keys()]; },
    /** Убрать последнее поставленное сообщение (клик по счётчику). Возвращает его текст или undefined. */
    popLast(trace) {
      const list = lists.get(trace);
      const text = list ? list.pop() : undefined;
      if (list && list.length === 0) lists.delete(trace);
      return text;
    },
    /**
     * Выдать следующее сообщение, если ход закончился (агент не отвечает и не ждёт разрешения: «ждёт», «отменён», «ошибка»). Пока отправленное не дошло
     * до модели (число сообщений не выросло), второе не выдаётся.
     */
    take(trace, session) {
      const list = lists.get(trace);
      if (!list || list.length === 0 || !session || isBusy(session.state)) return undefined;
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

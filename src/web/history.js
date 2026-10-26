// history.js — история отправленных сообщений сессии в поле ввода (задача 192): ↑ и ↓, как в терминале.
// Чистая функция: страница передаёт тексты отправленных сообщений (из ленты, она переживает перезагрузку), текст поля и позицию курсора.
// История включается, только когда стрелка не нужна самому полю: ↑ — курсор в первой строке, ↓ — в последней. Идти назад можно из пустого
// поля, дальше — пока текст не правили после перехода; правка выводит из истории, стрелки снова ходят по строкам.

export const NO_HISTORY = Object.freeze({ index: -1, draft: '' });

/**
 * @param texts  тексты отправленных сообщений сессии, старые первыми
 * @param state  { index, draft }: index -1 — история не листается
 * @returns { handled, value, state } — handled false: стрелка не наша, поле делает своё
 */
export function historyStep({ texts, state, value, caret, key }) {
  const none = { handled: false, value, state };
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return none;
  const first = !value.slice(0, caret).includes('\n');
  const last = !value.slice(caret).includes('\n');
  if (key === 'ArrowUp') {
    if (!first || texts.length === 0) return none;
    if (state.index === -1) {
      if (value.trim() !== '') return none;
      const index = texts.length - 1;
      return { handled: true, value: texts[index], state: { index, draft: value } };
    }
    if (value !== texts[state.index]) return none;
    const index = Math.max(0, state.index - 1);
    return { handled: true, value: texts[index], state: { index, draft: state.draft } };
  }
  if (!last || state.index === -1 || value !== texts[state.index]) return none;
  if (state.index < texts.length - 1) {
    const index = state.index + 1;
    return { handled: true, value: texts[index], state: { index, draft: state.draft } };
  }
  return { handled: true, value: state.draft, state: { index: -1, draft: '' } };
}

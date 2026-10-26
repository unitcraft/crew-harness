// history.js — история отправленных сообщений сессии в поле ввода (задача 192): ↑ и ↓, как в терминале.
// Чистая функция: страница передаёт тексты отправленных сообщений (из ленты, она переживает перезагрузку), текст поля и позицию курсора.
// ↑ в первой строке и ↓ в последней ВСЕГДА ходят по истории, даже если текст изменён. Набранное до первого ↑ запоминается как черновик
// и возвращается при ↓ за последним сообщением. Правка показанного сообщения индекс не сбрасывает; уйдя с него стрелкой, правку теряем
// (черновик — свой текст владельца — не теряется никогда).

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
      const index = texts.length - 1;
      return { handled: true, value: texts[index], state: { index, draft: value } };
    }
    const index = Math.max(0, Math.min(state.index, texts.length - 1) - 1);
    return { handled: true, value: texts[index], state: { index, draft: state.draft } };
  }
  if (!last || state.index === -1) return none;
  if (state.index < texts.length - 1) {
    const index = state.index + 1;
    return { handled: true, value: texts[index], state: { index, draft: state.draft } };
  }
  return { handled: true, value: state.draft, state: { index: -1, draft: '' } };
}

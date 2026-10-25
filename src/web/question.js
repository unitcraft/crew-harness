// question.js — модель формы вопросов агента (задача 192): выбор, проверка, сбор ответа. Ни DOM, ни часов.
//
// Агент задаёт 1–4 вопроса с готовыми вариантами. Вопрос — { question, header, multiSelect, options: [{ label, description }] };
// к вариантам агента форма всегда добавляет последний пункт «Другое» со свободным текстом (его номер — options.length).
// Форма — обычное значение: каждая функция возвращает новую форму, старая не меняется. view.js только рисует её
// и вызывает эти функции; состояние DOM в форму не входит.
//
// Ответ страницы серверу (событие question_answer):
//   { request, skipped: false, answers: [{ index, selected: [label, ...], other: 'текст или пусто' }] }
//   { request, skipped: true }
// index — номер вопроса в списке, с нуля.

export const MAX_QUESTIONS = 4;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');

/** Привести вопросы из события к виду формы: до четырёх, пустые вопросы и варианты без названия отбрасываются. */
export function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const q of raw) {
    if (!isObject(q)) continue;
    const question = str(q.question).trim();
    if (!question) continue;
    const options = (Array.isArray(q.options) ? q.options : [])
      .filter((o) => isObject(o) && str(o.label).trim())
      .map((o) => ({ label: str(o.label), description: str(o.description) }));
    out.push({ question, header: str(q.header).trim(), multiSelect: q.multiSelect === true, options });
    if (out.length === MAX_QUESTIONS) break;
  }
  return out;
}

/** Пустая форма: ничего не выбрано, открыт первый вопрос, указатель на первом пункте каждого. */
export function createForm(questions) {
  return {
    active: 0,
    sent: false,
    cursor: questions.map(() => 0),
    answers: questions.map(() => ({ picked: [], other: false, text: '' })),
  };
}

const replaceAt = (list, i, value) => list.map((x, j) => (j === i ? value : x));
const withAnswer = (form, qi, answer) => ({ ...form, answers: replaceAt(form.answers, qi, answer) });

/** Номер пункта «Другое» в вопросе. */
export const otherIndex = (question) => question.options.length;

/**
 * Выбрать пункт oi вопроса qi: одиночный выбор заменяет прежний, множественный переключает.
 * oi === otherIndex(question) — «Другое». Несуществующий пункт форму не меняет.
 */
export function selectOption(form, questions, qi, oi) {
  const q = questions[qi];
  if (!q || !Number.isInteger(oi) || oi < 0 || oi > otherIndex(q)) return form;
  const a = form.answers[qi];
  const isOther = oi === otherIndex(q);
  let next;
  if (q.multiSelect) {
    if (isOther) next = { ...a, other: !a.other };
    else next = { ...a, picked: a.picked.includes(oi) ? a.picked.filter((x) => x !== oi) : [...a.picked, oi].sort((x, y) => x - y) };
  } else {
    next = isOther ? { ...a, picked: [], other: true } : { ...a, picked: [oi], other: false };
  }
  return { ...withAnswer(form, qi, next), cursor: replaceAt(form.cursor, qi, oi) };
}

/** Текст «Другого». Сам по себе пункт не выбирает: выбор — selectOption. */
export function setOtherText(form, qi, text) {
  const a = form.answers[qi];
  if (!a || a.text === text) return form;
  return withAnswer(form, qi, { ...a, text });
}

/** Поставить указатель вопроса на пункт oi (ничего не выбирает). */
export function setCursor(form, questions, qi, oi) {
  const q = questions[qi];
  if (!q || !Number.isInteger(oi) || oi < 0 || oi > otherIndex(q) || form.cursor[qi] === oi) return form;
  return { ...form, cursor: replaceAt(form.cursor, qi, oi) };
}

/** Сдвинуть указатель вопроса на delta пунктов по кругу (в круг входит «Другое»). */
export function moveCursor(form, questions, qi, delta) {
  const q = questions[qi];
  if (!q) return form;
  const size = otherIndex(q) + 1;
  const next = (((form.cursor[qi] + delta) % size) + size) % size;
  return { ...form, cursor: replaceAt(form.cursor, qi, next) };
}

/** Открыть вопрос qi (вкладку). */
export function setActive(form, questions, qi) {
  if (!questions[qi] || form.active === qi) return form;
  return { ...form, active: qi };
}

/** Вопрос отвечен: выбран вариант агента или выбрано «Другое» с непустым текстом. */
export function isAnswered(form, questions, qi) {
  const a = form.answers[qi];
  if (!questions[qi] || !a) return false;
  return a.picked.length > 0 || (a.other && a.text.trim().length > 0);
}

/** Номер первого неотвеченного вопроса, начиная с from по кругу; -1, если отвечены все. */
export function nextUnanswered(form, questions, from = 0) {
  const n = questions.length;
  for (let k = 0; k < n; k += 1) {
    const qi = (from + k) % n;
    if (!isAnswered(form, questions, qi)) return qi;
  }
  return -1;
}

/** Отправить можно, когда отвечены все вопросы и форма ещё не ушла. */
export function canSubmit(form, questions) {
  return questions.length > 0 && !form.sent && nextUnanswered(form, questions) === -1;
}

/** Форма ушла (повторная отправка до ответа сервера запрещена); false — вернуть, если отправка не удалась. */
export function markSent(form, sent = true) {
  return form.sent === sent ? form : { ...form, sent };
}

/** Собрать question_answer. Незаполненная форма — null (отправлять нечего). */
export function buildAnswer(request, form, questions) {
  if (!canSubmit(form, questions)) return null;
  return {
    request,
    skipped: false,
    answers: questions.map((q, index) => {
      const a = form.answers[index];
      return {
        index,
        selected: a.picked.map((oi) => q.options[oi].label),
        other: a.other ? a.text.trim() : '',
      };
    }),
  };
}

/** Пропуск вопроса. */
export function buildSkip(request) {
  return { request, skipped: true };
}

/** Цифра 1–9 -> номер пункта (с нуля); иначе -1. */
export function digitOption(key) {
  return /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
}

/**
 * Строки «вопрос -> выбор» для ленты по ответу страницы (question_answer). Берутся только вопросы, на которые
 * ответ есть; выбор — названия вариантов и текст «Другого» через запятую.
 */
export function summarize(questions, answer) {
  if (!isObject(answer) || !Array.isArray(answer.answers)) return [];
  const lines = [];
  for (const a of answer.answers) {
    if (!isObject(a) || !Number.isInteger(a.index) || !questions[a.index]) continue;
    const chosen = [...(Array.isArray(a.selected) ? a.selected.filter((s) => typeof s === 'string' && s) : []), str(a.other).trim()].filter(Boolean);
    if (chosen.length > 0) lines.push({ question: questions[a.index].question, choice: chosen.join(', ') });
  }
  return lines;
}

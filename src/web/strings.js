// strings.js — все тексты интерфейса, по-русски, в одном месте.
//
// Зачем: надписи не разбросаны по view.js и index.html, поэтому их можно разом вынести в
// словарь (другой язык, правка формулировок) и проверить: каждый ключ использован
// (test/strings.test.mjs), каждый t('ключ') в коде существует. index.html видимого текста
// не содержит вовсе. Тексты внутри заготовленных разговоров заглушки (mock.js) — это данные
// потока, а не интерфейс, и сюда не относятся.
//
// Подстановки — {имя}; значение берётся из объекта второго аргумента t().

export const S = Object.freeze({
  'app.title': 'Пульт CrewHarness',

  'sessions.title': 'Сессии',
  'sessions.empty': 'Сессий пока нет. Создайте первую.',
  'sessions.new': 'Новая сессия',
  'sessions.new_agent': 'Агент',
  'sessions.new_name': 'Название',
  'sessions.new_name_placeholder': 'Без названия',
  'sessions.new_create': 'Создать',
  'sessions.new_close': 'Закрыть',
  'sessions.untitled': 'Сессия {n}',
  'sessions.time_title': 'Последнее событие: {time}',

  'agent.opencode': 'OpenCode',
  'agent.second': 'Второй агент — позже',

  'state.idle': 'Ожидает',
  'state.answering': 'Отвечает',
  'state.permission': 'Ждёт разрешения',
  'state.refused': 'Отказ',
  'state.error': 'Ошибка',
  'state.cancelled': 'Ход отменён',

  'chat.pick': 'Выберите сессию слева или создайте новую.',
  'chat.empty': 'Напишите агенту первое сообщение.',
  'chat.back': 'К сессиям',
  'chat.you': 'Вы',
  'chat.agent': 'Агент',
  'chat.input_label': 'Сообщение агенту',
  'chat.placeholder': 'Сообщение. Enter — отправить, Shift+Enter — новая строка.',
  'chat.send': 'Отправить',
  'chat.cancel': 'Отмена хода',
  'chat.thinking': 'Агент отвечает…',
  'chat.cancelled': 'Ход отменён',
  'chat.refused': 'Агент отказался: {reason}',
  'chat.refused_plain': 'Агент отказался.',
  'chat.error': 'Ошибка: {message}',
  'chat.error_plain': 'Ошибка при ответе.',
  'chat.perm_line': 'Запрос разрешения: {action}',
  'chat.perm_allowed': 'Вы разрешили',
  'chat.perm_denied': 'Вы отклонили',
  'chat.perm_cancelled': 'Снят отменой хода',
  'chat.perm_waiting': 'Ждёт вашего решения',

  'perm.title': 'Агент просит разрешения',
  'perm.action': 'Действие',
  'perm.detail': 'Подробности',
  'perm.allow': 'Разрешить',
  'perm.deny': 'Отклонить',

  'conn.label': 'Соединение',
  'conn.connecting': 'Подключение…',
  'conn.connected': 'Подключено',
  'conn.mock': 'Воспроизведение заглушки',
  'conn.retry': 'Соединение разорвано, повтор через {seconds} с',
  'conn.nofile': 'Нет сервера: страница открыта из файла. Добавьте ?mock=1 или откройте её с сервера.',
  'conn.send_failed': 'Не отправлено: нет соединения.',
});

/** Подставить {имя} из vars; нет значения — остаётся как есть, чтобы пропуск был виден. */
export function fmt(template, vars = {}) {
  return template.replace(/\{([^{}]+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
}

/** Текст интерфейса по ключу. Неизвестный ключ виден на экране, а не молча пуст. */
export function t(key, vars) {
  return Object.hasOwn(S, key) ? fmt(S[key], vars) : `⟦${key}⟧`;
}

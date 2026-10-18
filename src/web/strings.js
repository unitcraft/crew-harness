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

  // ---- левая колонка
  'sessions.title': 'Сессии',
  'sessions.empty': 'Сессий пока нет. Создайте первую.',
  'sessions.not_found': 'Ничего не найдено',
  'sessions.search': 'Поиск по сессиям',
  'sessions.pinned': 'Закреплённые',
  'sessions.no_project': 'Без проекта',
  'sessions.group_add': 'Новая сессия в проекте {project}',
  'sessions.pin': 'Закрепить',
  'sessions.unpin': 'Открепить',
  'sessions.child': 'дочерняя',
  'sessions.new': 'Новая сессия',
  'sessions.new_agent': 'Агент',
  'sessions.new_name': 'Название',
  'sessions.new_name_placeholder': 'Без названия',
  'sessions.new_project': 'Проект',
  'sessions.new_project_placeholder': 'Без проекта',
  'sessions.new_create': 'Создать',
  'sessions.new_close': 'Закрыть',
  'sessions.untitled': 'Сессия {n}',
  'sessions.time_title': '{state}. Последнее событие: {time}',

  'theme.system': 'Тема: как в системе. Нажмите, чтобы выбрать светлую',
  'theme.light': 'Тема: светлая. Нажмите, чтобы выбрать тёмную',
  'theme.dark': 'Тема: тёмная. Нажмите, чтобы вернуть как в системе',

  'agent.opencode': 'OpenCode',
  'agent.second': 'Второй агент — позже',

  'state.idle': 'Ожидает',
  'state.answering': 'Отвечает',
  'state.permission': 'Ждёт разрешения',
  'state.refused': 'Отказ',
  'state.error': 'Ошибка',
  'state.cancelled': 'Ход отменён',

  // ---- разговор
  'chat.pick': 'Выберите сессию слева или создайте новую.',
  'chat.empty': 'Напишите агенту первое сообщение.',
  'chat.back': 'К сессиям',
  'chat.you': 'Вы:',
  'chat.agent': 'Агент:',
  'chat.input_label': 'Сообщение агенту',
  'chat.send': 'Отправить',
  'chat.cancel': 'Отмена хода',
  'chat.running': 'Агент работает',
  'chat.cancelled': 'Ход отменён',
  'chat.refused': 'Агент отказался: {reason}',
  'chat.refused_plain': 'Агент отказался.',
  'chat.error': 'Ошибка: {message}',
  'chat.error_plain': 'Ошибка при ответе.',
  'chat.copy': 'Копировать ответ',
  'chat.copied': 'Ответ скопирован',
  'chat.copy_failed': 'Не удалось скопировать',
  'chat.perm_allowed': 'вы разрешили',
  'chat.perm_denied': 'вы отклонили',
  'chat.perm_cancelled': 'снят отменой хода',
  'chat.perm_waiting': 'ждёт вашего решения',

  'work.summary': 'Выполнено действий: {n}',
  'work.failed': 'с ошибкой: {n}',
  'work.running': 'идут: {n}',
  'work.tool': '{kind} · {title}',
  'work.task': 'Фоновая команда {status} · {title}',
  'work.perm': 'Запрос разрешения · {action} — {decision}',
  'work.no_detail': 'Подробностей нет',

  'tool.read': 'Чтение',
  'tool.edit': 'Правка',
  'tool.delete': 'Удаление',
  'tool.move': 'Перенос',
  'tool.search': 'Поиск',
  'tool.execute': 'Команда',
  'tool.think': 'Размышление',
  'tool.fetch': 'Загрузка',
  'tool.other': 'Действие',

  'status.pending': 'ожидает',
  'status.in_progress': 'выполняется',
  'status.completed': 'готово',
  'status.failed': 'ошибка',
  'status.cancelled': 'отменено',

  'task.running': 'работает',
  'task.completed': 'завершена',
  'task.failed': 'с ошибкой',
  'task.stopped': 'остановлена',

  'diffs.title': 'Изменено файлов: {n}',
  'diffs.show_all': 'Показать все ({n})',
  'diffs.hide': 'Свернуть',

  // ---- поле ввода
  'composer.placeholder': 'Введите / для команд',
  'composer.hint': 'Enter — отправить, Shift+Enter — новая строка',
  'composer.attach': 'Вложения — позже',
  'composer.voice': 'Голосовой ввод — позже',
  'composer.mode_label': 'Режим разрешений',
  'composer.agent_label': 'Агент',
  'composer.model_label': 'Модель',
  'composer.effort_label': 'Усилие',
  'composer.ring': 'Контекст занят на {n} %',
  'mode.ask': 'Спрашивать',
  'mode.read': 'Авто для чтения',
  'model.base': 'Базовая',
  'model.fast': 'Быстрая',
  'model.deep': 'Глубокая',
  'effort.low': 'Низкое',
  'effort.medium': 'Среднее',
  'effort.high': 'Высокое',

  // ---- правая колонка
  'rail.toggle': 'Сведения о сессии',
  'rail.pick': 'Откройте сессию, чтобы увидеть окружение, контекст и результаты.',
  'rail.env': 'Окружение',
  'rail.project': 'Проект',
  'rail.folder': 'Папка',
  'rail.branch': 'Ветка',
  'rail.agent': 'Агент',
  'rail.none': 'не указано',
  'rail.context': 'Контекст',
  'rail.ctx_detail': 'Занято {used} из {size} токенов',
  'rail.ctx_cost': 'Стоимость: {cost}',
  'rail.ctx_unknown': 'Данных о контексте пока нет',
  'rail.outputs': 'Результаты',
  'rail.outputs_empty': 'Файлов пока нет',
  'rail.tasks': 'Фоновые задачи',
  'rail.tasks_empty': 'Задач пока нет',
  'rail.tasks_finished': 'Завершено: {n}',
  'rail.show_more': 'Показать ещё ({n})',
  'rail.show_less': 'Свернуть',

  // ---- время и числа
  'ago.now': 'только что',
  'ago.min': '{n} мин назад',
  'ago.hour': '{n} ч назад',
  'ago.day': '{n} дн. назад',
  'unit.d': '{n} д',
  'unit.h': '{n} ч',
  'unit.m': '{n} мин',
  'unit.s': '{n} с',
  'tokens.k': '{n} тыс.',
  'tokens.m': '{n} млн',

  // ---- диалог разрешения
  'perm.title': 'Агент просит разрешения',
  'perm.action': 'Действие',
  'perm.detail': 'Подробности',
  'perm.allow': 'Разрешить',
  'perm.deny': 'Отклонить',

  // ---- соединение
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

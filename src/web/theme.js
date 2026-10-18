// theme.js — выбранная тема до первой отрисовки. Обычный скрипт, не модуль: должен выполниться
// синхронно, пока страница не нарисована. Берёт выбор из localStorage ('light' | 'dark'); нет выбора или
// хранилище недоступно — страница следует системе (prefers-color-scheme в app.css). Сам выбор по клику
// меняет app.js; ключ здесь тот же, что THEME_KEY в state.js.
(function applyStoredTheme() {
  try {
    var value = window.localStorage.getItem('crew-console-theme');
    if (value === 'light' || value === 'dark') document.documentElement.setAttribute('data-theme', value);
  } catch (e) {
    // хранилище закрыто (приватное окно, запрет сайтов): остаётся тема системы
  }
}());

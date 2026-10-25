// boot-guard.js — страж запуска (задача 192). Обычный скрипт, не модуль: грузится первым и живёт, даже если модули
// страницы не загрузились или упали при старте. Любая ошибка запуска (исключение, необработанный отказ промиса, модуль,
// который не разобрался или не нашёлся, страница, что не заявила «запущена» за BOOT_WAIT_MS) показывается видимым блоком
// «Ошибка запуска: …» с кнопкой «Сбросить локальные данные и перезагрузить», а не пустым экраном.
// Только то, что умеют старые Chromium: без ?., ??, let над var не обязательно, стили — через CSSOM (CSP запрещает style="").
(function crewBootGuard(global) {
  var BOOT_WAIT_MS = 5000;
  var OUR_KEY = /^crew-/;
  var shown = false;

  function clearOurStorage() {
    ['localStorage', 'sessionStorage'].forEach(function (name) {
      try {
        var store = global[name];
        var keys = [];
        for (var i = 0; i < store.length; i += 1) keys.push(store.key(i));
        keys.forEach(function (key) { if (OUR_KEY.test(String(key))) store.removeItem(key); });
      } catch (e) {
        // хранилища нет или оно закрыто: чистить нечего
      }
    });
  }

  function show(message) {
    if (shown) return;
    var doc = global.document;
    if (!doc || !doc.body) return;
    shown = true;
    var box = doc.createElement('div');
    box.id = 'boot-error';
    box.setAttribute('role', 'alert');
    var s = box.style;
    s.position = 'fixed'; s.left = '0'; s.right = '0'; s.top = '0'; s.zIndex = '2147483647';
    s.padding = '16px'; s.background = '#fbe4e1'; s.color = '#7a1a14'; s.font = '15px/1.4 system-ui, sans-serif';
    var text = doc.createElement('p');
    text.style.margin = '0 0 10px';
    text.textContent = 'Ошибка запуска: ' + String(message || 'неизвестная ошибка');
    var button = doc.createElement('button');
    button.type = 'button';
    button.textContent = 'Сбросить локальные данные и перезагрузить';
    button.style.padding = '8px 12px';
    button.addEventListener('click', function () {
      clearOurStorage();
      global.location.reload();
    });
    box.appendChild(text);
    box.appendChild(button);
    doc.body.appendChild(box);
  }

  function messageOf(value) {
    if (value && value.message) return value.message;
    return String(value);
  }

  global.__crewBootError = show;
  global.__crewClearOurStorage = clearOurStorage;
  global.addEventListener('error', function (event) {
    show(event && event.message ? event.message : messageOf(event && event.error));
  });
  global.addEventListener('unhandledrejection', function (event) {
    show(messageOf(event && event.reason));
  });
  // страница объявляет себя запущенной атрибутом data-booted (app.js): нет его за срок — значит, модуль не стартовал
  global.setTimeout(function () {
    var root = global.document && global.document.documentElement;
    if (root && root.getAttribute('data-booted') !== '1') show('страница не запустилась за ' + (BOOT_WAIT_MS / 1000) + ' с (проверьте консоль браузера)');
  }, BOOT_WAIT_MS);
}(typeof window !== 'undefined' ? window : globalThis));

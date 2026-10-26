// boot-guard.js — страж запуска (задача 192). Обычный скрипт, не модуль: грузится первым и живёт, даже если модули
// страницы не загрузились или упали при старте. Любая ошибка запуска (исключение, необработанный отказ промиса, модуль,
// который не разобрался или не нашёлся) показывается видимым красным блоком
// «Ошибка запуска: …» с кнопкой «Сбросить локальные данные и перезагрузить», а не пустым экраном.
// Старт, что завис (страница не заявила «запущена» за BOOT_WAIT_MS, 15 с: запрос модуля ждёт, а не падает): один раз сама перезагружается
// с новым адресом (?_r=…, сокет и ответ берутся заново), второй раз — нейтральная строка с кнопками «Подождать» и «Перезагрузить».
// Только то, что умеют старые Chromium: без ?., ??, let над var не обязательно, стили — через CSSOM (CSP запрещает style="").
(function crewBootGuard(global) {
  var BOOT_WAIT_MS = 15000;
  var OUR_KEY = /^crew-/;
  var RETRY_KEY = 'crew-boot-retry';
  var RETRY_MS = 1000;
  var shown = false;
  var slow = null;

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

  // Перезагрузка с новым адресом: ?_r=<время> заставляет браузер взять соединение и ответ заново (а не ждать «мёртвый» keep-alive сокет)
  function freshReload() {
    var loc = global.location;
    try {
      var search = String(loc.search || '').replace(/([?&])_r=\d+&?/, '$1').replace(/[?&]$/, '');
      var url = String(loc.pathname || '/') + search + (search.indexOf('?') >= 0 ? '&' : '?') + '_r=' + Date.now() + String(loc.hash || '');
      loc.replace(url);
    } catch (e) {
      loc.reload();
    }
  }

  // Завис старт: один автоповтор (счётчик в sessionStorage общий с повтором после ошибки загрузки скрипта), потом — строка с кнопками
  function stalledStart() {
    var store;
    try { store = global.sessionStorage; } catch (e) { store = null; }
    var tried = false;
    try { tried = !!(store && store.getItem(RETRY_KEY)); } catch (e) { tried = false; }
    if (tried || !store) { showSlow(); return; }
    try { store.setItem(RETRY_KEY, '1'); } catch (e) { showSlow(); return; }
    freshReload();
  }

  // Долгий старт — не ошибка: нейтральная строка с кнопкой «Подождать», без красного блока и без role=alert
  function showSlow() {
    var doc = global.document;
    if (shown || slow || !doc || !doc.body) return;
    var box = doc.createElement('div');
    box.id = 'boot-slow';
    var s = box.style;
    s.position = 'fixed'; s.left = '0'; s.right = '0'; s.top = '0'; s.zIndex = '2147483646';
    s.padding = '12px 16px'; s.background = '#f1f1f1'; s.color = '#333'; s.font = '14px/1.4 system-ui, sans-serif';
    var text = doc.createElement('span');
    text.textContent = 'Страница запускается дольше обычного\u2026 ';
    var button = doc.createElement('button');
    button.type = 'button';
    button.textContent = 'Подождать';
    button.style.marginLeft = '8px';
    button.addEventListener('click', function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    });
    var again = doc.createElement('button');
    again.type = 'button';
    again.textContent = '\u041f\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c';
    again.style.marginLeft = '8px';
    again.addEventListener('click', function () { freshReload(); });
    box.appendChild(text);
    box.appendChild(button);
    box.appendChild(again);
    doc.body.appendChild(box);
    slow = box;
  }

  function messageOf(value) {
    if (value && value.message) return value.message;
    return String(value);
  }

  global.__crewBootError = show;
  global.__crewClearOurStorage = clearOurStorage;
  // Не загрузился скрипт страницы (сеть, 503): один раз перезагрузить через секунду; счётчик в sessionStorage, чтобы не зациклиться.
  function retryOrShow(src) {
    var store;
    try { store = global.sessionStorage; } catch (e) { store = null; }
    var tried = false;
    try { tried = !!(store && store.getItem(RETRY_KEY)); } catch (e) { tried = false; }
    if (tried || !store) { show('не загрузился ' + (src || 'скрипт страницы')); return; }
    try { store.setItem(RETRY_KEY, '1'); } catch (e) { show('не загрузился ' + (src || 'скрипт страницы')); return; }
    global.setTimeout(function () { global.location.reload(); }, RETRY_MS);
  }

  // третий аргумент true: ошибки загрузки <script> не всплывают, их видно только на перехвате
  global.addEventListener('error', function (event) {
    var target = event && event.target;
    if (target && target !== global && target.tagName === 'SCRIPT') { retryOrShow(target.src); return; }
    if (target && target !== global && target.tagName) return; // не загрузилась картинка или таблица стилей: не ошибка запуска
    show(event && event.message ? event.message : messageOf(event && event.error));
  }, true);
  global.addEventListener('unhandledrejection', function (event) {
    show(messageOf(event && event.reason));
  });
  // страница объявляет себя запущенной атрибутом data-booted (app.js): нет его за срок — значит, модуль не стартовал
  global.setTimeout(function () {
    var root = global.document && global.document.documentElement;
    if (root && root.getAttribute('data-booted') !== '1') stalledStart();
  }, BOOT_WAIT_MS);
}(typeof window !== 'undefined' ? window : globalThis));

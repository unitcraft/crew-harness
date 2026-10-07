# Язык Нова — выписка фактов (из публичного репозитория https://github.com/nv-lang/nova, 2026-10-07)

Источник каждой строки — файл репозитория https://github.com/nv-lang/nova (пути относительно его корня).

- Статическая типизация с выводом типов, структурная типизация; без классов и наследования; данные + методы
  `fn T @m()`, структурные `protocol` (spec/overview.md п.3, spec/paradigm.ru.md).
- Суммы-типы `type Shape enum | Circle {..} | Square {..}`, записи, newtype, кортежи; обобщения `[T]` с границами
  протоколами (spec/syntax.md).
- Нет null — `Option[T]`; нет исключений — эффект `Fail[E]` (`throw`, `?`, `!!`), сахар над `Result[T,E]`
  (spec/effects.md).
- Неизменяемость по умолчанию: `ro`, изменение — `mut` (spec/paradigm.ru.md).
- Алгебраические эффекты с обработчиками (`fn f() Db Net Time Fail -> R`, `with Db = h { ... }`; тесты без моков);
  стандартные эффекты `Io, Net, Db, Fs, Time, Random, Log, Os` (spec/overview.md, spec/effects.md).
- Async — не эффект и без `await`: приостановка — забота среды выполнения (spec/effects.md, «Async — invisible
  infrastructure (D62)»).
- Структурная конкурентность: `spawn`, `supervised`, `parallel for`, `detach`, токены отмены, `Channel[T]`, `select`;
  M:N планировщик волокон на libuv (spec/overview.md п.6, spec/syntax.md).
- Память: сборщик мусора (сейчас Boehm), escape-анализ; `consume` для детерминированного освобождения ресурсов
  (spec/overview.md п.2, README.md).
- Цель сборки — только нативный код (Нова → C → бинарник); WASM/JS не упоминаются; компилятор сейчас на Rust (compiler-codegen), идёт самохостинг — компилятор на самой Нове пишется в https://github.com/nv-lang/nova/tree/main/novac (владелец, 2026-10-07).
- std (std/src): collections, concurrency, crypto (jwt), data (sql-построитель без драйвера, semver), encoding (json,
  csv, toml, ini, url, base64, hex), ffi, fs, identifiers (uuid, ulid), io, math, net (tcp, udp, dns), os (процессы
  `Command.new`), path, testing, text (regex, diff, markdown), time (tz, duration, cron), unicode.
- Нет в std: SQLite, WebSocket, HTTP — HTTP в отдельных пакетах nova-http v0.1.1, nova-tls, nova-polaris (веб-фреймворк
  с WebSocket, без тега) (README.md, «Ecosystem»).
- Синтаксис: объявления в стиле Go (`name type`), методы и `match` как в Rust, обобщения `[T]`.
- Зрелость: v0.1.0, «early, but working»; заморожено только помеченное `#stable`; нет `nova fmt`, менеджера пакетов,
  горячей перезагрузки, конкурентного GC; часть std «aspirational» (std/src/STATUS.md).

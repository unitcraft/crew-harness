# Анализ задачи 144: вынос ядра Алулы в отдельный пакет Нова

Дата: 2026-10-22. Основа: ветка `task-144-alula-core-extraction` от `origin/main`. Замеры сняты командами по дереву (импорты — поиском `import crew_harness.<модуль>`, тесты — числом строк `test "` в `*_test.nv`). Текст составлен исполнителем и записан оркестратором (инструмент записи не дал подагенту создать этот файл).

## 0. Где замер расходится с постановкой

| Что | Постановка | Замер |
|---|---|---|
| Файлов `.nv` в ядре | 130 | 173 из 220 в `src/`; с тестами 45 284 строки |
| Меток `ORACLE-WORKAROUND` в ядре | 56 файлов | 137 меток в 92 файлах (в продукте было 191 в 121; остаётся 54 в 29) |
| Зависимости ядра | только `std` | верно: `std` (`std.io`, `std.os`, `std.fs` только в `portolan_cli` и `portolan.nv`); продуктовых импортов нет |
| Состав ядра по импортам | типы, выражения, значения, журнал + интерпретатор | ядро замкнуто вместе с `engine`: `machine_run` и `machine_nested_run` импортируют `crew_harness.engine` (14 + 1 импорт); сам `engine` не импортирует ничего. Поэтому `engine` — в ядре |
| `registry.nv`, `data.nv` — «продукт» | продукт | не отделяются без потери поведения, см. (б) |

## 1. Разбор

### (а) Файлы по пакетам
Столбцы: .nv / из них тестовых / строк / тестов.

| Пакет (`src/…`) | .nv | тест. | строк | тестов | Куда | Причина |
|---|---|---|---|---|---|---|
| `engine` | 10 | 4 | 2196 | 49 | ядро | его импортирует `machine_run`; сам ничего не импортирует |
| `machine` | 13 | 6 | 6299 | 173 | ядро | значения, типы, выражения, вычислитель, реестр, коды журнала, данные |
| `machine_table` | 13 | 9 | 5347 | 116 | ядро | модель, декодер `machine/2`, проверки |
| `machine_text` | 34 | 11 | 10724 | 216 | ядро | переводчик таблиц, обратный генератор |
| `machine_run` | 22 | 12 | 6110 | 182 | ядро | интерпретатор, вложенные машины, прогон сценариев |
| `machine_nested_run` | 2 | 2 | 317 | 28 | ядро | пары «родитель + вложенная» |
| `machine_agent`, `machine_agent_en` | 5, 2 | 4, 2 | 689, 469 | 29, 14 | ядро | шаг агента методики |
| `machine_cycle` | 7 | 7 | 1395 | 48 | ядро | проверка цикла методики |
| `machine_dialog` | 2 | 2 | 347 | 24 | ядро | таблица диалога; импорт только ядра |
| `machine_nested`, `machine_nested_eq` | 6, 1 | 5, 1 | 1611, 204 | 143, 6 | ядро | вложенные машины |
| `machine_runner` | 9 | 9 | 1367 | 59 | ядро | запуск задачи (около 7 минут) |
| `machine_session` | 8 | 8 | 1658 | 89 | ядро | начало сессии |
| `machine_text_eq/_fmt/_lang/_render/_unicode` | 5, 7, 4, 2, 2 | 4, 7, 4, 2, 2 | 755, 849, 977, 676, 377 | 43, 64, 83, 49, 27 | ядро | доказательства переводчика |
| `portolan_cli`, `portolan_scenarios`, `portolan_eq` | 11, 2, 5 | 7, 2, 5 | 2062, 300, 537 | 126, 22, 67 | ядро | программа `portolan` |
| `portolan.nv` | 1 | 0 | — | 0 | ядро | точка входа программы |
| **Итого ядро** | **173** | **115** | **45 284** | **1657** | | 22 папки |
| `chat` | 3 | 2 | 1290 | 52 | продукт | рукописная машина чата |
| `machine_chat`, `machine_dialog_eq` | 1, 2 | 1, 2 | 379, 762 | 11, 20 | продукт | импортируют модуль `chat` продукта |
| `acp`, `acp_live` | 6, 4 | 2, 4 | 2090, 1023 | 48, 39 | продукт | клиент ACP |
| `storage`, `pgconf`, `pgdb`, `pgstore` | 3, 2, 6, 3 | 2, 1, 2, 2 | 715, 191, 984, 735 | 16, 5, 29, 16 | продукт | обработчики эффектов |
| `server`, `server_live`, `server_pg` | 13, 1, 1 | 5, 1, 1 | 3429, 59, 121 | 51, 12, 12 | продукт | сервер и хаб |
| `web`, `pg` (скрипты), `crew_harness.nv`, `crew_hub.nv` | — | — | — | 0 | продукт | пульт, SQL, точки входа |
| **Итого продукт** | **47** | | | **311** | | |

Тестов было 1968 = ядро 1657 + продукт 311.

### (б) Граница внутри `src/machine`
Постановка оставляла в продукте `registry.nv` и `data.nv`. Без потери поведения это невозможно:
1. `standard_registry()` вызывает не-тестовый код ядра: `portolan_cli/commands.nv` (реестр по умолчанию у команд программы), `machine_text/render_states.nv`, `machine_run/nested.nv` (там же `machine_files()`). Реестр — это реестр машин методики (встреча, шаг агента, проверка цикла, начало сессии, запуск задачи), а не продуктовых.
2. Из 15 машин и 621 сценария продуктовые только `chat*` и `dialog*`; остальное — машины методики и примеры формата. При этом `chat` и `dialog` — главные испытательные машины интерпретатора: на них построены тесты `machine_run`, `machine_table`, `machine_text`, `machine_text_eq`, `portolan_eq`.
3. `machine_files()`, `scenario_files()`, `schema_files()` читает почти каждый пакет тестов.

Решение (обратимо, вопрос владельцу в `log.md`): `registry.nv`, журнальные таблицы, `data.nv`, `schema/`, `machines/`, `scenarios/` переезжают в ядро как есть. В продукте остаются тесты, которым нужен модуль `chat` (`machine_chat`, `machine_dialog_eq`), они читают данные через `alula.machine`; хаб берёт диалог из `alula.machine` (`dialog_machine_text`). Интерфейс реестра (`Registry`, `Primitive`, `register`, `check_call_position`, …) — в ядре; «маленького реестра» для тестов не потребовалось, они берут `standard_registry()`. Папки `examples/` нет: `embed_str` читает файл относительно модуля, образцы лежат в `src/machine/machines/` и `src/machine/scenarios/` и описаны в README.

### (в) Тесты, читающие файлы машин или методики
Все, что читают `machine_files`/`table_files`/`scenario_files`/`schema_files`, переезжают с данными: `machine_run`, `machine_table`, `machine_text`, `machine_text_eq/_render/_fmt/_lang`, `machine_cycle`, `machine_runner`, `machine_session`, `machine_agent(_en)`, `machine_nested(_eq/_run)`, `machine_dialog`, `portolan_cli`, `portolan_eq`, `portolan_scenarios`. Файлы методики напрямую не читаются: данные скопированы в `machines/`, `machine_text/keywords.tsv`, `machine_runner/methodology_rows.tsv`. В продукте остаются `machine_chat` и `machine_dialog_eq`. Продуктовый `server/words_test.nv` читал с диска `src/engine/engine.nv`; исправлено.

### (г) Места продукта, импортирующие ядро
24 файла, 38 строк: `engine` 22, `machine_run` 7, `machine` 6, `machine_table` 3. Файлы: `acp` (`client.nv`, `project.nv`, `project_test.nv`), `acp_live` (`ack_test.nv`, `client_test.nv`, `e2e_test.nv`), `chat` (`chat.nv`, `chat_engine_test.nv`, `chat_test.nv`), `machine_chat` (`equal_test.nv`), `machine_dialog_eq` (`equal_test.nv`, `inject_test.nv`), `pgstore` (`engine_test.nv`, `handlers.nv`, `handlers_test.nv`), `server` (`dialog_test.nv`, `hub.nv`, `portolan.nv`, `portolan_test.nv`, `testkit.nv`, `words_test.nv`), `storage` (`files.nv`, `files_engine_test.nv`, `files_test.nv`). `crew_harness.nv`, `crew_hub.nv`, `pgdb`, `pgconf`, `server_live`, `server_pg`, `web` ядро не импортируют.

### (д) Как Нова подключает зависимость
Как `postgres`, `polaris`, `http`, `tls`: `alula = { git = "<адрес>", version = "0.1" }`, блокировка фиксирует коммит; версия берётся из метки `v0.1.0` репозитория. Путь в `[dependencies]` Oracle отвергает (`E_DEP_PATH_OUTSIDE_REPO`, D420); для разработки до публикации — `[replace] alula = { path = "../alula-core" }` в `nova.override.toml` (не коммитится, в `.gitignore`). `nova test` override использует, `nova build` — нет (разбирает блокировку по git); проверено.

### (е) Метки Oracle
137 меток в 92 файлах ядра (постановка: 56 файлов); из ядра используются 35 пунктов (8–13, 20, 25–27, 29, 32–34, 36–48, 50–55, 60, 61). В новом репозитории: `spikes/env/README.md` (установка + эти пункты с теми же номерами), `repro_engine/`, `repro_text_import/`, `workarounds.md`, `scripts/oracle-workarounds.py`, страж `check-oracle-workarounds.py` + `run-all.sh`. В продукте индекс перестроен (54 метки).

### (ж) Этапы
А: каркас → engine → machine → machine_table → machine_text → machine_run → machine_nested_run → machine_agent* → доказательства переводчика → вложенные → цикл+диалог → сессия+раннер → программа portolan → метки Oracle → страж границы → README (16 коммитов, `nova test` по папке после каждого). Б: один атомарный коммит (зависимость, импорты, удаление, READMEs, индекс меток — стражи в режиме индекса требуют их вместе), затем `log.md`.

## 2. Красная проба
Страж границы на дереве продукта по путям ядра: красный, 424 нарушения в 173 файлах (имя `crew_harness` в `module`/`import`). После выноса на новом репозитории: ок.

## 3. «Было → стало»
Тестов 1968 → 1657 + 311; файлов `.nv` 220 → 173 + 47; меток Oracle 191 → 137 + 54.

## 4. Что осталось
- Создание и публикация репозитория (организация, имя, адрес), затем исправление адреса в `nova.toml`, `nova update`, проверка продукта без override и слияние ветки. → не нужно, потому что публикацию делает владелец или интегратор Новы по письму, а слияние этапа Б продукта — шаг этой же задачи 144 после публикации.
- Переименование «Портолан» → «Алула» и расширений `*.portolan.*`. → задача 128 (в новом репозитории).
- `$id` в двух файлах схемы указывает на репозиторий продукта: формат не трогали. → задача 128.
- CI нового репозитория. → не нужно, потому что публикация репозитория вне границ этой задачи, а CI заводит тот, кто публикует.

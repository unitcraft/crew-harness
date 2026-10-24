2026-10-24 04:25 документ: постановка записана оркестратором по слову владельца («До v0.4.0, отдельной задачей», 2026-10-24); номер 166 назначен вручную (запуск процессов в среде был заблокирован), перед коммитом сверить, что он свободен (`doc/tasks/` и `node scripts/task-number.mjs`); исполнитель не запущен — старт после доработки 158 и слова владельца на запуск
2026-10-24 06:05 документ: исполнитель принял задание 166 «заменить слово (word) на сигнал в коде, API, тестах и документах пакета alula и продукта»; постановка — в origin/main (`doc/tasks/166-word-to-signal/task/message.md`), в эту ветку не копируется (ветка старше, был бы конфликт при перебазировании); ветки `task-166-word-to-signal` созданы поверх веток 158 в деревьях пакета и продукта.
2026-10-24 06:06 документ: опись — ниже, первой частью (инструмент не даёт создать analysis.md: «разбор отчётом, не файлом», как в задаче 158); сделана чтением до правок на коммитах пакета `1151a74` и продукта `14b711f`, закоммичена после правок вместе с числами «после»; список для Методики — `format-word-list.md`.

## Опись «слово» (word) → «сигнал» (до правок)

Способ: поиск по всем отслеживаемым файлам обоих деревьев и английскому `word`, и русскому «слов-»; из продукта исключены `opencode-plugin/` (граница задачи: плагин не менять), `doc/tasks/`, `doc/archive/`, `doc/research/` (история). Каждое место просмотрено глазами: «word» в этих деревьях значит четыре разных вещи, а сигнал — только одна из них.

### 1. Четыре смысла «word»

| Смысл | Что это | Решение |
|---|---|---|
| S. слово стороны (сигнал) | то, что сторона или внешний код говорит машине: `Incoming.word`, `accepts_word`, `WordDef`, список слов хаба | **заменить на «сигнал»** (классы а, б, в, г) |
| L. слово языка (лексика) | слово таблицы ключевых слов, служебное слово, слово файла на языке, слово имени (`TxWords`, `words_load`, `kw(...)`, `is_keyword`, `jn_words`) | не трогать: другое понятие (ложное срабатывание) |
| F. ключ формата или слово Методики | ключи, шапки, словарь v11, `human_word`, `stop_word`, `factory_word`, старые ключи, которые формат 2.22 отвергает по имени | не менять (класс д): `format-word-list.md` |
| N. естественное слово | «слово владельца» (цитата), «the first word of the prompt», `last words`, `password`, `keyword` | не трогать |

### 2. Размер поиска (строк со «word» / «слов-»; без `keyword`, `password`, «словарь», «условие»)

Пакет `alula` (всего 1732 / 505):

| Группа файлов | word | слов- | Смысл |
|---|---:|---:|---|
| `spec/` (спецификация, образцы, таблица слов) | 176 | 207 | F, L: Методика |
| копии файлов спецификации в `src/**/cases`, таблицы `*.tsv`, `tools/` | 153 | 157 | L, F |
| переводчик `src/machine_text*` (код и тесты) | 835 | 65 | L (таблица слов языка), F (отказы по старым формам); S: 2 места |
| прочий `src/` (движок, интерпретатор, проверки, CLI, примеры) | 498 | 19 | S и L вперемешку |
| документы, README, `examples/`, `scripts/` | 70 | 57 | S, L |

Продукт (всего 703 / 204):

| Группа файлов | word | слов- | Смысл |
|---|---:|---:|---|
| `machines/methodology/` (таблицы и сценарии Методики) | 346 | 47 | F: Методика |
| `doc/`, `AGENTS.md` (Канон, цитаты владельца) | 3 | 86 | N |
| `scripts/` (стражи, хуки) | 24 | 63 | N, L |
| `src/pg*`, `src/server/front`, `src/web` | 10 | 2 | N, L (команда запуска словами) |
| прочий `src/` (хаб, ACP, чат, тесты машин, сервер) | 309 | 6 | S и L |
| остальное (`spikes/`, `machines/product/`) | 11 | 0 | S, N |

### 3. Классы (а)–(г): что менять; числа ДО правок (токенов / файлов)

(а) Идентификаторы и API:

| Имя | Пакет | Продукт | Станет |
|---|---:|---:|---|
| `Incoming.word` (конструктор, вызовы) | 15 / 6 | 15 / 5 | `Incoming.signal` |
| `AlulaMachine.accepts_word` | 4 / 3 | 41 / 5 | `accepts_signal` |
| тип `WordDef` | 13 / 4 | 0 | `SignalDef` |
| `find_word`, `word_decl`, `dec_words`, `dec_words_or_empty`, `word_used_in_signal`, `rn_words_cell` | 18 / 4 | 0 | `find_signal`, `signal_decl`, `dec_signals`, `dec_signals_or_empty`, `signal_used_in_rows`, `rn_signals_cell` |
| тип `CodeWord`, конструктор `cw(` | 0 | 34 / 2 | `CodeSignal`, `cs(` |
| `words_given_by_code`, `words_from_agent` | 0 | 9 / 3 | `signals_given_by_code`, `signals_from_agent` |
| помощники тестов `word_in`, `word_event`, `words_of` | 73 / 8 (`tools/check-alula-keywords.py` имеет свой `words_of`: лексика, остаётся) | 18 / 6 | `signal_in`, `signal_with_input`, `signals_of` |
| коды журнала примеров `word_allowed`, `word_denied` | 9 / 5 | 0 | `signal_allowed`, `signal_denied` |
| локальные `words` / `word`, где это список или имя сигнала (`step.nv`, `check.nv`, `party.nv`, `render.nv`, `table_test.nv`, `signals_test.nv`) | около 25 строк | около 5 строк | `signals` / `signal` |

Решения по именам:
- `Incoming.word` → `Incoming.signal`: поля `signal` у `Incoming` нет (поля `id, trace, step, kind, name, request, input, at`), конфликта нет.
- `WordDef` описывает и сигнал стороны или машины, и часть ответа (`progress`) той же формы. Выбрано `SignalDef` (смысл записан в комментарии типа); `EventDef` не взято: «событие» в модели — это `EventPat` (образец в строке таблицы).
- `CodeWord` → `CodeSignal`: список хозяина (`signals_given_by_code`, `signals_from_agent`) назван владельцем; виды событий в нём (`input`, `progress`, `answered`, `refused`, `expired`) остаются.
- В `machine_dialog_eq` уже есть `signal_event(name)`; помощник с полем `input` назван `signal_with_input`.

(б) Файлы и модули:

| Файл | Дерево | Станет |
|---|---|---|
| `src/server/words.nv`, `src/server/words_test.nv` | продукт | `signals.nv`, `signals_test.nv` (`git mv`) |
| `examples/scenarios/echo-words…`, `keeper-foreign-word…` | пакет | `echo-signals…`, `keeper-foreign-signal…` (ссылки: `src/examples/data.nv`, `examples/README.md`, `src/alula_cli/README.md`) |
| `machines/product/scenarios/free-input-word-without-row…` | продукт | `free-input-signal-without-row…` (ссылки: `src/machines/data.nv`, `src/product_machines/data.nv`, `v217_test.nv`) |

Не переименовываются (другой смысл): `src/machine_text/words.nv` и `words_test.nv` (таблица слов языка — лексика), `src/machine_text_fmt/words_test.nv`, `src/machine_run/words_test.nv`, `src/machine_table/words_test.nv` (слова значений перечисления, P-7), семь сценариев Методики `machines/methodology/scenarios/*-word-*`.

(в) Комментарии и документы (смысл S): пакет — `src/engine/types.nv`, `nested_test.nv`, `README.md`; `src/machine_run/accepts.nv`, `step.nv`, `build.nv`, тесты `v213`, `v217`, `v25`, `params`; `src/machine_table/check.nv`, `model.nv`, `v212_test.nv`; «a gate that waits for a word» в четырёх `support_test.nv`; `src/machine/README.md` (около 17 строк); `docs/debugging.md` (в списке видов события стоял снятый вид `word`); `examples/README.md`, `echo|keeper|retry.alula.md`. Продукт — `src/server/README.md` (раздел «The border of the table and the code» и соседние), `src/acp/README.md`, `src/acp/project.nv`, комментарии и имена тестов в `src/machine_run_machines`, `machine_dialog`, `machine_dialog_eq`, `machine_cycle`, `machine_runner`, `machine_session`, `machine_table_machines`; `spikes/env/*` (путь файла с пометкой обхода). Всего около 120 строк.

(г) Тексты, которые видит пользователь: сообщения об ошибках со словом стороны есть только в отказах по старым формам (они называют старый ключ и остаются, это класс д). Менялись: шаблоны журнала примеров `examples/journal.md` («слово «разрешить»» → «сигнал «разрешить»», 2 строки), названия сценариев примеров (9) и продукта (4), заголовок `examples/gate.alula.json` (1). Строки журнала хаба и сообщения сервера слов стороны не содержали.

### 4. Класс (д): ключи формата и слова Методики — НЕ менялись

Подробно — `format-word-list.md`. Коротко: (1) старые ключи, которые 2.22 отвергает по имени (`words` у стороны и перечисления, вид и шаг `word`, `halt_word`, событие `слово(…)`, столбец `слова ворот`): код отказа и его тесты держат старое имя нарочно; (2) живые имена формата: поле `human_word` сигнала `human_stop` фрагмента «Пауза», читаемое имя `слова_человека` ↔ `human_words`; (3) словарь v11 (`glossary_names.tsv`, хеш `60383c370415`): 31 строка со «Word»/`word` и 19 с «слов-»; файл не менялся (проверено `cmp`); (4) машины Методики в продукте: `StopWord`/`stop_word`/`NoWord` (около 1300 вхождений), `factory_word`, `factory_word_date`, `PlanStopWord`, коды журнала `factory_word_missing`, `factory_word_date_missing`, параметр `word` двух примитивов; (5) тексты спецификации: остатки прежнего термина в прозе (строки 162, 311, 1373, 1432, 1452 и параллельные английские).

### 5. Ложные срабатывания (не менялись)

- Таблица слов языка: `TxWords`, `TxWord`, `words_load`, `words_rows`, `kw`, `kw_all`, `is_keyword`, `tx_keywords`, `cx.words` (около 700 строк в `src/machine_text*`), `tools/check-alula-keywords.py` (253 строки), `tools/check-alula-samples.py`.
- Слово имени и строки: `jn_words`, `jn_translit`, `rj_word`, `p_eat_word`, «служебное слово», «ключевое слово не из языка файла».
- Слово значения перечисления: `EnumValue`, `word_is_code`, `word_pairs`, `word_owners`, тесты P-7; в `encode.nv` и `README` встречается устаревшее «the key `words` of the type» — про перечисление, не про сигнал (замечено, не правилось: вне границ).
- Слово команды и параметры запуска: `fs_words`, `st_words`, `hub_words`, `agent_words`; `options.nv` (`words` — слова командной строки).
- Слова словаря Методики: `fail_code_word`, `class_word`, `code_word`, `kind_word`, `state_kind_word`.
- Естественный язык: «слово владельца» в цитатах, `last words`, «the first word of the prompt» (тестовый агент), «two words».
- `keyword` (52), `password` (тесты PostgreSQL), `wordmark` (логотип).
- Привязка `word` в примерах `echo` и `retry` (`content: word`): кусок текста, не слово стороны; имя не менялось, чтобы не трогать пары «таблица ↔ дерево».
- «словарь», «Условие» (шапки таблиц) в русском тексте.
- `opencode-plugin/`: 89 файлов содержат `word` (в основном `password`, `keyword`, «слово владельца»); границы задачи: плагин не менять; имён класса (а) там нет (проверено поиском).

## Что сделано, решения, числа

### Коммиты (ничего не слито и не запушено)

Пакет `alula`, ветка `task-166-word-to-signal` поверх `1151a74`: красная проба `fc62e09`; переименование `367a063` (51 файл, 201 строка вставлена и 201 удалена, переименования файлов — `git mv`, концы строк LF, `git diff --check` чист). Продукт, ветка `task-166-word-to-signal` поверх `14b711f`: красная проба `d2cfa11`; переименование, опись, список для Методики и этот журнал — следующим коммитом.

### Красная проба (до правок, на коде веток 158)

| Тест | Дерево | Результат на старом коде |
|---|---|---|
| `src/engine/signal_test.nv`: `Incoming.signal(...)` | пакет | `src/engine`: 0 прошло, 1 красный (CODEGEN-FAIL, E_NO_STATIC_METHOD: у `Incoming` нет метода `signal`) |
| `src/machine_table/signal_def_test.nv`: `SignalDef { ... }` | пакет | `src/machine_table`: 0 прошло, 1 красный (E_UNKNOWN_TYPE `SignalDef`) |
| `src/machine_run_machines/accepts_signal_test.nv`: `accepts_signal` | продукт | `src/machine_run_machines`: 0 прошло, 1 красный (E7320: нет метода `accepts_signal` у `AlulaMachine`) |
| `src/server/signals_given_test.nv`: `signals_given_by_code`, `signals_from_agent` | продукт | `src/server`: 1 прошла, 1 красная (`undefined identifier signals_from_agent`) |

Единица красной пробы — папка модуля Nova (она не собирается целиком, поэтому «1 красный» — вся папка со всеми её тестами). Коммиты проб содержат только файлы проб, то есть на дереве соответствующего коммита проба красная. После переименования четыре пробы зелёные и остаются обычными тестами.

### Числа ПОСЛЕ

| Что | До | После |
|---|---|---|
| `Incoming.word` | пакет 15, продукт 15 | 0 и 0 (в пакете осталось 1 упоминание в `docs/history.md`, строка о переименовании: история, исключение) |
| `accepts_word` | пакет 4, продукт 41 | 0 и 0 (то же упоминание в `docs/history.md`) |
| `WordDef` | пакет 13 | 0 (упоминание в `docs/history.md`) |
| `find_word`, `word_decl`, `dec_words*`, `word_used_in_signal`, `rn_words_cell` | пакет 18 | 0 |
| `CodeWord`, `cw(` | продукт 34 | 0 |
| `words_given_by_code`, `words_from_agent` | продукт 9 | 0 |
| `word_in`, `word_event` | пакет 73, продукт 18 | 0 и 0 (в `tools/check-alula-keywords.py` остался `words_of` — лексика) |
| `word_allowed`, `word_denied` | пакет 9 | 0 |
| файлы `words.nv`, `words_test.nv` продукта, сценарии `echo-words`, `keeper-foreign-word`, `free-input-word-without-row` | 3 файла + 3 | 0 (переименованы) |
| строки со «word» (без `keyword`, `password`) | пакет 1732, продукт 703 | пакет 1541, продукт 517 |
| строки со «слов-» (без «словарь», «условие») | пакет 505, продукт 204 | пакет 503, продукт 204 (русские места — формат, лексика и Методика; два изменены в `examples/journal.md`) |
| число тестов (`test "..."` в `*_test.nv`) | пакет 2198, продукт 822 | пакет 2200, продукт 824 (+2 пробы в каждом) |

Поиск после правки: `accepts_word`, `Incoming.word`, `words_given_by_code`, `words_from_agent`, `words.nv` по обоим деревьям (без `doc/tasks/` продукта и без `opencode-plugin/`) — только в `docs/history.md` пакета (строка о переименовании) и в этом журнале.

Исключения AC-2 (названы): `docs/history.md` пакета (история, имена старых названий в записи о переименовании); `doc/tasks/*` продукта (история задач); `tools/check-alula-keywords.py: words_of` (лексика таблицы слов); класс (д) — `format-word-list.md`; ложные срабатывания — раздел 5 описи.

### Решения

1. `WordDef` → `SignalDef`, а не `EventDef` (раздел 3 описи); тип хранит и часть ответа, это записано в комментарии типа.
2. Тексты отказов по старым формам (`words`, `kind: word`, `halt_word`, `слово(…)`, `слова ворот`) оставлены нарочно: они называют старое имя, чтобы объяснить отказ; это класс (д).
3. Привязка `word` в примерах `echo` и `retry` (`content: word`) не менялась: это кусок текста; смена потребовала бы править пары «таблица ↔ дерево» ради имени, не имеющего отношения к стороне.
4. Тесты отказа по старым ключам (`v213 word step refused`, `v213 party words key refused` и им подобные) оставлены с прежними именами: они проверяют, что старый ключ отвергается.
5. Слово `слово` в таблицах Методики и словарь v11 не трогались (граница задачи).
6. Замечено, не правилось (вне границ): в `src/machine_run/encode.nv` и `src/machine/README.md` встречается устаревшее «the key `words` of the type» про перечисление (ключ теперь `values`).

### Проверки

- Пакет: `nova test src --jobs 2 --timeout 900` — 18 из 18 папок зелёные, 1 без тестов (`src/examples`); `--strict-effects` — 18 из 18, 1 без тестов. Программа `alula` собрана (51 с); `alula test examples` — 66 из 66; `alula compile` примеров `keeper`, `echo`, `retry` даёт JSON, байт в байт равный хранимому. Стражи пакета `sh scripts/guards/run-all.sh` — 4 из 4 (ок); `python tools/check-alula-translation.py` — структура ru/en совпадает (заголовков 27, ограждений 60, строк каталога 27, меток 217); `tools/check-alula-samples.py` — расхождений 0 (проверка имён по словарю пропущена: путь к словарю не задан, он у Методики).
- Хеши (AC-3): `spec/`, `src/*/cases`, `src/machine_text/*.tsv` (в том числе словарь `glossary_names.tsv`), `src/machine_text/fragments` и `tools/` не изменены вовсе (`git diff HEAD` по ним пуст), поэтому хеши образцов ru `642e1f78f0f7`, en `928cd807453a` и словаря v11 `60383c370415` прежние; тесты, закрепляющие эти хеши, зелёные. Ключи формата и их разборщики (`json.nv`, `scenario.nv`, схемы) не менялись, кроме переименования типа `SignalDef` и функций `dec_signals*` внутри разборщика (имена внутри кода, ключи JSON те же).
- Продукт, обычный режим: все папки, кроме трёх с PostgreSQL и каталогов без `.nv` (`src/pg`, `src/web`), `nova test … --jobs 2 --timeout 900` — 27 из 28 зелёные в общем прогоне; `src/machine_table_machines/check_test` в общем прогоне упал по таймеру (950 с при низком приоритете и нагрузке другой команды), отдельно (`--jobs 1`) зелёный; 1 папка без тестов (`src/product_machines`).
- Продукт, строгий режим (`--strict-effects --jobs 2 --timeout 1800`): 26 из 28 в общем прогоне; `src/acp_live/ack_test` (SEGV 0xC0000005 в общем прогоне под нагрузкой) и `src/machine_text_render_machines/render_test` (таймер 1883 с) отдельно (`--jobs 1`, строгий) зелёные, 2 из 2.
- НЕ проверены: три папки, которым нужна временная PostgreSQL в Docker: `src/pgdb/calls`, `src/pgstore/engine_test`, `src/server_pg/hub_pg_test` (Docker не запущен, по заданию не запускался и системные настройки не менялись). В них нет старых имён (поиск), но прогнать их надо при запущенном Docker до слияния.
- Стражи продукта: `sh scripts/guards/run-all.sh` — 9 из 9 (ок); `python scripts/guards/guard-secrets.py --tree` — ок.
- Нагрузка: все прогоны шли с низким приоритетом (`start /low`), не более 2 заданий; одновременно с другими прогонами я не работал.

### Оценка в часах

Сделано: около 2,2 часа календарного времени (около 1,2 часа опись и правки, около 1 часа ожидания прогонов при нагрузке на машину). До слияния остаётся: перепроверка трёх папок PostgreSQL при запущенном Docker (около 0,3 часа), приёмка и слияние вместе с 158 до метки `v0.4.0` (слово владельца): около 0,5 часа.

### Письмо Методике (выписка; полный список — `format-word-list.md`)

В пакете `alula` 0.4.0 слово стороны заменено на «сигнал» в коде и документах (`Incoming.signal`, `accepts_signal`, `SignalDef`, `signals_given_by_code`); формат 2.22, ключи, спецификация и словарь не менялись, хеши образцов (ru `642e1f78f0f7`, en `928cd807453a`) и словаря v11 (`60383c370415`) прежние. В ваших текстах и в ключах формата остались такие «слово»: (1) живое поле `слово_человека` / `human_word` сигнала `человека_стоп` / `human_stop` и `продолжить` / `continue` фрагмента «Пауза» (спецификация, образцы, `names_host.tsv`, деревья машин Методики: 43 файла, 53 вхождения) и читаемое имя `слова_человека` ↔ `human_words` в таблице слов, строка 172; (2) словарь v11: 31 строка со «Word»/`word` (среди них про сигнал стороны: `Слово`/`Word`, `ПолученоСлово`/`WordReceived`, `слово`/`word`, `слова`/`words`, `слово_ответа`, `слово_подтверждения`, `ПАУЗА_*`/`PauseWord*`) и 19 с «слов-»; (3) остатки термина в прозе спецификации: «слова ворот», «слово человека» (русские строки 311, 1373, 1432, 1452 и параллельные английские; запись AL-38 в истории изменений — как есть); (4) ваши машины в продукте: `StopWord`/`stop_word`/`NoWord` (около 1300 вхождений), `factory_word`, `factory_word_date`, `PlanStopWord`, коды журнала `factory_word_missing`, `factory_word_date_missing`, параметр `word` примитивов `copy_approval` и `create_approved_copy`, сценарии `runner-factory-word-*`, `runner-plan-stop-word-*`, `session-flow-unknown-word`: «слово завода» и «стоп-слово» — метки документа, а не сигналы стороны; (5) старые ключи (`words` у стороны и перечисления, вид и шаг `word`, `halt_word`, событие `слово(…)`, столбец `слова ворот`), которые 2.22 отвергает по имени: переводчик и программа называют их в сообщении об отказе. Решения — ваши: оставить `human_word` или переименовать в `human_signal` / `сигнал_человека` (это меняет формат, словарь и все хеши образцов); привести ли прозу и таблицы к «сигнал стороны»; оставлять ли старые имена в сообщениях об отказе.

2026-10-24 07:45 документ: задача исполнена в обоих деревьях и не слита: красная проба и переименование закоммичены на ветках `task-166-word-to-signal` пакета (`fc62e09`, `367a063`) и продукта; наборы пакета (обычный и строгий) и продукта (обычный и строгий, без трёх папок PostgreSQL) зелёные, три папки PostgreSQL не проверены (Docker не запущен); оценка до слияния — около 0,8 часа (перепроверка трёх папок и приёмка); список для Методики — `format-word-list.md`.

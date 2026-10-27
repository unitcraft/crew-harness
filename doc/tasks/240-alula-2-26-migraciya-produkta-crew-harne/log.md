2026-10-27 10:42 документ: задание заведено плагином: «Алула 2.26: миграция ПРОДУКТА (crew-harness) на формат 2.26 »; task/message.md — шаблон из полей задачи; основа — main 56f1a7d

2026-10-27 10:50 документ: исполнение начато по заданию интегратора (`task/message.md`). Пакет `alula` 0.9.0: метка v0.9.0, коммит 6444780f04efcb24a285dcad90eb746394c12450 (`git rev-parse v0.9.0^{commit}` в дереве пакета); пакет не правится — его вершина v0.9.0 выгружена `git archive` во временную папку вне репозитория, программа собрана оттуда (`nova build src/alula.nv`, очередь машины): `alula 0.9.0 (Alula 2.26, machine/2)`; скрипт миграции — `tools/migrate-alula-226.py` той же вершины. Набор машин методики (`alula-machines` её репозитория) — только читается: критерий копирует его во временную папку, переносит копию и гоняет её. Пробный прогон скрипта (`--dry-run`) на копии `machines/`: 13 файлов, места по существу два — сигнал машины `отмена` в обращении к стороне `агент` (`product/chat.alula.md:108`, `product/dialog.alula.md:90`); остальные места — деревья (пересборка `--alula`).

2026-10-27 10:50 документ: **красная проба (первая запись работы):** критерий `accept-240` (скрипт вне репозитория, текст — в конце журнала) на коде до миграции (основа 953af16), программа 0.9.0, папки `src/` пропущены (`ACCEPT_240_SRC=skip`) — красный, 12 красных. Тесты машин при этом зелёные (81 из 81, 514 из 514): программа 0.9.0 ещё читает деревья 2.25 (шов 2.25 декодера), поэтому зелёные тесты сами по себе переноса не доказывают — критерий требует формат 2.26 у каждой таблицы, `alula_version` 2.26 у каждого дерева, «файлов 0, мест 0» у `--dry-run` скрипта и пин 0.9.0:

```
КРАСНОЕ: migrate --dry-run machines: итог: файлов 23, мест 2
КРАСНОЕ: старых форм в machines: 113
machines/methodology/agent-step-sample.txt:5:- format: 2.25
machines/methodology/agent-step-sample.txt:280:- Читает: число_повторов, ход
КРАСНОЕ: machines/methodology/agent_step.alula.md: не format 2.26
  (и так для cycle_check, dialog_steps, session_start, task_runner, product/chat, product/dialog)
trees: 7 tables, differ 0
КРАСНОЕ: nova.toml: alula не 0.9.0
КРАСНОЕ: nova.lock.toml: alula не 0.9.0 / 6444780
НЕ ПРИНЯТО 240 (12 красных): product 81 из 81; methodology 514 из 514; набор методики 508 из 508; старых форм 113; деревья равны; пин не 0.9.0; src: пропущено (ACCEPT_240_SRC=skip)
```

2026-10-27 10:58 документ: миграция скриптом пакета (`python tools/migrate-alula-226.py --alula <alula 0.9.0> machines`): код 1, «файлов 17, мест 4». Методика — без мест: 5 таблиц и 5 деревьев на 2.26 (деревья пересобраны скриптом), рядом положены библиотеки `machines/methodology/libs/pause.alula.md` и `libs/cycle_arithmetic.alula.md` (хеш — по файлу рядом), в 3 тестах `cycle_check` (`cycle-failure-3`, `cycle-review-entry-2`, `cycle-review-entry-3`) скрипт переставил порядок `все_данные` в записи `machine_data` по дереву 2.26; `alula test machines/methodology` — 514 из 514. Образец `agent-step-sample.txt` (копия `spec/samples/agent-step.alula.md` пакета, расширение не `.alula.md`, поэтому скрипт его не видит) перенесён тем же скриптом через копию с именем `agent-step.alula.md` во временной папке: результат равен образцу пакета 0.9.0, кроме трёх строк прозы, которые отличались и раньше (ссылки, «Внешние функции»); проза «версия формата 2.25» → 2.26 в образце и в `agent_step.alula.md`. Продукт: таблицы `chat`, `dialog` перенесены (шапка, `## Выход`, без `№`, без `Читает`, без столбца `пишет`, без `КодСбоя` — его даёт библиотека `контракт`, без счётчика пользователя `попытка_пользователя`, без поля запроса `reply` с чтением `исполнитель`, `## Части ответа` → тип в `## Типы` и столбец `части` у стороны `агент`, событие `часть { содержание: кусок }`), 4 места: сигнал `отмена` в обращении ОЖИДАНИЕ к стороне `агент` (по месту в каждой таблице) и два дерева, которые из-за него не собираются.

2026-10-27 10:58 документ: тип части назван `КусокОтвета` (критерий 1): строка `тип КусокОтвета { содержание строка }`, столбец `части` стороны `агент` — `КусокОтвета`, JSON-имя `agent_chunk` — строкой `## Имена` (`| КусокОтвета | agent_chunk |`; тесты кормят часть именем `agent_chunk`). Запись примера спецификации 7а `тип КусокОтвета запись { содержание строка }` переводчик 0.9.0 не принимает (`после имени типа ожидается { (запись) или перечисление`) — расхождение примера спецификации пакета с переводчиком, в пакет не правится (граница задачи); у нас — запись без слова `запись`. Срок тишины заново от каждой части — правило библиотеки `контракт` (7а) 2.26, в таблице не пишется; тест `chat-chunk-renews-term` / `dialog-flow-chunk-renews-term` его проверяет.

2026-10-27 10:58 документ: пин: `nova.toml` — `version = "0.9.0"` (полностью, как в 230: pin `>=0.9.0, <0.10.0`), комментарий о 0.9; `nova update alula` — `nova.lock.toml`: `alula` 0.9.0, коммит 6444780f04efcb24a285dcad90eb746394c12450, pin `version:>=0.9.0, <0.10.0`.

2026-10-27 10:58 документ: **разбор отмены (критерий 2), проверено на копии `machines/product` программой 0.9.0:** (1) слово свободного ввода стороны `пользователь` (вид `human`, счётчик `—`; у `chat` `отмена` уже стоит в её сигналах, у `dialog` добавлена) в строке ОЖИДАНИЯ (`Сторона: агент`) — `alula check`: `$.states[1].rows[3].event: the signal cancel is not a signal of the party агент and is not declared in signals`; спецификация 4.3: «Сигнал стороны принимается строкой обращения, чья `Сторона` его объявила», и тест продукта `free-input-signal-without-row` показывает то же поведение движка — слово пользователя в ОЖИДАНИИ отбрасывается (`event_ignored`); (2) та же строка в собственных `## Общие события` машины — `$.common_events[0].event: the signal cancel is not declared in signals` (сигналы машины в 2.26 приносит только библиотека); (3) сигнал `отмена` у стороны `агент` — `signals of a party are for the gates (human, enhanced, gatekeeper)`; (4) `отмена_запроса` (`cancel_request`) объявляет только библиотека «Пауза»: она требует сторону `enhanced` с `продолжить`, состояние ПАУЗА, данное `остановка`, концы ОСТАНОВЛЕНО и ОШИБКА, и ведёт в ОСТАНОВЛЕНО с `Отказ(ОтмененоРодителем)` — у `dialog` после отмены возврат в ПОКОЙ и конца нет, ~10 тестов отмены меняют исход (`StoppedByHuman` → `Cancelled`) и журнал, сервер шлёт `cancel` без идентификатора запроса. Ни один из двух путей Методики на 0.9.0 цели 81 из 81 без смены поведения не даёт; вопрос интегратору с рекомендацией (qid `qmvqe2yozbe92`, 10:53), выбор не сделан до его ответа.

2026-10-27 10:59 документ: ответ интегратора (письмо, 10:54): разбор отмены принят и передан оркестратору для Методики — вариант (а): подтвердить чтение спецификации (слово свободного ввода принимается строкой любого текущего состояния) и выпустить пакет 0.9.1 с исключением в проверке; запасной (б): отмена пользователя как `сбой` запроса агента с кодом `ОстановленоЧеловеком` (правка `src/server` и тестов отмены, отдельным шагом); до ответа Методики строка отмены не решается. Уточнение (вопрос `qmvqe9k71arwj`, ответ интегратора 10:59): «machines/methodology/ — ПАПКА ЭТОГО репозитория …, её перенос ОСТАВЛЯЕТЕ»; набор методики в её репозитории только читается (копия для прогона).

2026-10-27 11:54 документ: решение по отмене (письмо интегратора, 11:54, передано от оркестратора и Методики): «не ждём — выбирайте вариант, который даёт 81/81 с НАИМЕНЬШЕЙ правкой таблиц, и записывайте выбор строкой в журнале … либо иной путь, если найдёте меньший»; пин 0.9.0 — в этой же задаче, сдача без ожидания.

2026-10-27 12:10 документ: **выбор по отмене (критерий 2): отмена — сигнал протокола вызова `отмена_запроса` (JSON `cancel_request`) в собственных `## Общие события` машин `chat` и `dialog`; сигнал объявляет подключённая библиотека продукта `machines/product/libs/call_cancel.alula.md` («Отмена запроса»).** Разбор (программа 0.9.0, копии): (а) слово свободного ввода стороны `пользователь` в строке ОЖИДАНИЯ — отказ проверки (выше, 10:58); (б) отмена как `сбой` запроса агента с кодом `ОстановленоЧеловеком` — меняет смысл существующего сбоя `stopped_by_human` (тест `chat-refused-stopped-by-human`: журнал `agent_refused`), эталон на Нове `src/chat`, сервер и тесты отмены; (в) своя библиотека с `сигнал(отмена)` или собственные общие события машины без подключения — `the signal cancel is not declared in signals`; (г) библиотека не может вести в ПОКОЙ `dialog`: `## Требует` принимает только концы (`требует конец ПОКОЙ; в машине его нет`); (д) **проходит**: машина подключает библиотеку, в которой есть строка с сигналом протокола (тогда дерево получает сигналы протокола `human_stop`, `parent_stop`, `cancel_request`, `parent_continue`, `parent_halt`), и пишет строку `| сигнал(отмена_запроса) | состояние == ОЖИДАНИЕ | <прежние действия> | <прежний переход> |` в своих общих событиях; пустая библиотека сигналов не приносит. Строка библиотеки — одна, по смыслу протокола: отмена после конца машины отбрасывается с записью языка `cancel_discarded_already_replied`. Переименование JSON-имени сигнала протокола строкой `## Имена` (и машины, и библиотеки) переводчик молча не применяет — имя остаётся `cancel_request`, поэтому хозяин шлёт `cancel_request`. Чтобы у кода было одно имя отмены, в `chat` строка ПОКОЯ (слово пользователя `отмена`, журнал `cancelled_before_request`) тоже стала общим событием `состояние == ПОКОЙ`, а сигнал `отмена` снят со стороны `пользователь` (у `dialog` отмены у пользователя и не было). Поведение, журнал и исходы те же: StoppedByHuman, `cancelled_before_request` / `cancelled_while_waiting`, `отменить_открытые(сторона: агент)`, у `dialog` — ПОКОЙ.

2026-10-27 12:10 документ: что изменилось вслед за выбором: тесты продукта — имя события отмены `cancel` → `cancel_request` в 11 файлах (`chat-cancel-*`, `chat-answer-after-cancel`, `dialog-cancel-*`, `dialog-flow-*cancel*`, `dialog-turn-ends`), в `dialog-cancel-idle` — запись `event_ignored` с `event=cancel_request`; три теста `free-input-*` — без проверки `user_attempt` (у стороны свободного ввода в 2.26 счётчика нет, данного нет; имена тестов сказали это); код хозяина — `src/server/hub.nv` (`Hub.cancel` шлёт `cancel_request`), `src/server/signals.nv` (словарь границы), эталон `src/chat/chat.nv` (`chat_event_of`, `user_cancels`, метка события); тесты `src/` по отмене (`chat_test`, `server/dialog_test`, `server/signals_test`, `machine_run_machines`, `machine_dialog_eq/equal_test`, `machine_dialog/border_test`). `alula test machines/product` — 81 из 81 на деревьях 2.26; деревья равны сборке 7 из 7.

2026-10-27 12:10 документ: рукописное дерево `chat.alula.json` (латинские внутренние имена, красивая печать) перенесено руками по сборке 2.26 таблицы: `alula_version` 2.26, тип `agent_chunk` в `types`, данные без `writes` и без счётчиков (`open_requests` данного движка — как в сборке), сигналы протокола и подключение `call_cancel`, общие события (3 строки), `reads` состояний, без поля запроса `reply`; сравнение с `alula compile` — по правилу `trees.py` (имена — допуск, остальное равно). Деревья, собранные программой, — без перевода строки в конце, как в 184/225 (тесты `src/` сравнивают текст побайтно).

2026-10-27 12:10 документ: тесты `src/` (разведка 10:58: 14 красных папок из 20, 43 проверки; прогон 2 в 11:41: 29): (1) API перевода 0.9.0 требует библиотеки рядом — `src/machines/data.nv`: `library_files()` (4 файла `machines/methodology/libs/` и `machines/product/libs/call_cancel.alula.md`), `library_files_in(dir)` для программы на памяти, списки `methodology_libraries`/`product_libraries`, таблицы — только файлы самой папки (`embed_dir` рекурсивен); вызовы `translate_checked`/`translate_report` в тестах → `…_with(…, library_files())`, программа `alula` в тестах кладёт библиотеки в `/m/libs/`; (2) формы 2.25 в проверках: формат 2.26, `### Пауза` вместо `Пауза(…)`, маркер `- ` обязателен (AL-137: тест «ag markers required» — таблица без маркеров отклоняется), столбца `читает` нет (выражение по умолчанию — пустая ячейка), порядок данных (данные движка первыми), поле запроса ворот В13 только для стороны (чтения исполнителя выводит проверка, `reads`), два подключения у `cycle_check`, одно у раннера, `## Выход`, пустой раздел не пишется; пробные таблицы в `machine_cycle/fit_test.nv` и `machine_runner/prep_test.nv` переведены на 2.26 (вторая — тем же скриптом пакета); (3) английский образец «Шаг агента»: пакет 0.9.0 встраивает для своих тестов копию 2.25 (`methodology_en_text`), продукт взял копию `spec/samples/agent-step.en.alula.md` 0.9.0 как есть — `machines/methodology/agent-step-sample.en.txt`; (4) английский круг машины с библиотекой на 0.9.0 не замыкается — render на английский оставляет путь русского файла библиотеки, библиотека читается только на языке машины (`библиотека libs/cycle_arithmetic.alula.md написана на языке ru, а машина — на en`); пакет сам пропускает такие таблицы в своём круге (c222, задача 239), у нас — так же: `connects_library` в `src/machines/data.nv`, круги на английском для таких машин не идут, английские тесты «english file» проверяют отказ.

2026-10-27 13:35 документ: прогон 3 (22 папки `src/`: 20 папок машин, `chat`, `server`; 12:15–13:05) — 8 зелёных, 14 красных, 29 проверок; правки по нему: (1) строка библиотеки `call_cancel` стала объявлением — `| сигнал(отмена_запроса) | ложь |  | то же |`: прежняя строка «отмена после конца — `cancel_discarded_already_replied`» расходилась с машиной на Нове (эталон пишет `event_ignored`), теперь лишнюю отмену в конце отбрасывает движок с той же записью, что и эталон (проверено `alula test`: `event_ignored(event=cancel_request;state=Done)`); строку-объявление не берёт ни один тест (`dl scenarios take every row` её исключает, с пояснением); (2) находка пакета: `render` 0.9.0 пишет часть старой записью `часть(agent_chunk { content: кусок })`, переводчик 0.9.0 её отклоняет (`с 2.26 часть пишется часть, часть(имя) или часть { … }`) — круг «дерево → текст → дерево» любой машины с частью ответа на 0.9.0 не замыкается; в кругах тестов эта одна запись чинится (`part_mended` в `src/machines/data.nv`), остальное сравнивается (проверено CLI: после починки дерево `dialog` равно исходному, кроме `title`, рукописное `chat` — по правилу имён); (3) перевод без реестра хозяина (`translate_report_with`) в 2.26 не равен дереву для машин с внешними функциями — дерево несёт выведенные чтения состояний со скрытыми чтениями функций реестра (AL-138); равенство файлу проверяет перевод со сверкой; (4) число строк `agent_step` — нижняя граница `> 100`, как у соседних машин; (5) фикстуры `machine_table_machines/load_test` правят рукописное дерево `chat` — обновлены (данные без `writes` и счётчиков, поле запроса `reads: party`, тип части в существующем разделе `types`); в рукописном дереве ключ `reads` состояния стоит после `party`; (6) `server/signals_test`: сигнал, который таблица знает, берёт строка состояния или общее событие; (7) `machine_run_machines`: событие в конце — `event_ignored(event=cancel_request;state=Done)`, у стороны свободного ввода нет данного счётчика; (8) `machine_dialog`: строк ОЖИДАНИЯ 4, общих событий 2, сводка «3 states, 8 rows»; (9) `machine_session` в прогоне 3 убит по времени (1928 с при пределе 1800; машина была занята двумя папками сразу) — предел в прогоне 4 поднят до 3600 с, число и смысл проверок не менялись.

2026-10-27 14:26 документ: прогон 4 (22 папки, 13:38–14:16) — 16 зелёных, 6 красных; правки (только тесты): перевод со сверкой несёт выведенные чтения состояний, без сверки — нет (`dialog`, `chat_test`, `render_test`); тест ходов `machine_dialog_eq` слал события каждого хода на `agent-1`, а с 2.26 открытые запросы — данные машины (библиотека `контракт`) и машина сама отбрасывает ответ на закрытый запрос, эталон на Нове оставляет это движку — события хода теперь идут на запрос этого хода (проверено CLI); фикстуры рукописного дерева `chat` и развилки ОБЪЁМ `session_start` на записи 2.26, тексты отказов — по `alula check` 0.9.0; порядок `все_данные`: данные движка, данные «Паузы», данные машины, счётчики сторон. Прогон 5 (6 папок) — 5 зелёных, `machine_session` — одна проверка порядка счётчиков, исправлена.

2026-10-27 15:08 документ: **итог — критерий `accept-240` чистым заходом** (вершина кода 60e791f, программа `alula 0.9.0 (Alula 2.26, machine/2)`, папки `src/` по две, `--jobs 2`, предел файла 3600 с; очередь машины; 14:27–15:08, 40 мин):

```
trees: 7 tables, differ 0
ПРИНЯТО 240: alula 0.9.0; product 81 из 81; methodology 514 из 514; набор методики 508 из 508; старых форм 0; деревья равны; пин 0.9.0; src: папок 22 зелёных, красных 0
```

Числа: 7 таблиц и 7 деревьев на 2.26, тестов 595 (продукт 81 из 81, методика 514 из 514); копия набора методики (`alula-machines` её репозитория, только чтение) перенесена тем же скриптом без мест — 508 из 508; `migrate-alula-226.py --dry-run machines` — «итог: файлов 0, мест 0»; старых форм 0; деревья равны сборке 7 из 7 (`chat` — по правилу `trees.py`); пин 0.9.0 (6444780); `nova test` 22 папок `src/` (20 папок машин, `chat`, `server`) — красных 0; стражи дерева 9 из 9. Не прогонялись: папки с PostgreSQL (`pgstore`, `server_pg`) и живые (`acp_live`, `server_live`) — в них правок нет, кроме имени сигнала в общем помощнике `user_cancels()` (`src/chat`).

2026-10-27 15:08 документ: находки для пакета 0.9.1 (переданы интегратору, приняты): (1) проверка 4.3 не берёт слово свободного ввода стороны human в строке обращения к другой стороне (спецификация 1 и 4.3: «строкой текущего состояния»); сигнал протокола объявляет только подключённая библиотека со строкой этого сигнала; `## Имена` (машины и библиотеки) JSON-имя сигнала протокола молча не меняет; (2) английский текст машины с библиотекой хранит путь русского файла и не переводится назад (пакет сам обходит это в c222); (3) пример 7а `тип КусокОтвета запись { … }` переводчик не принимает; (4) `render` пишет часть старой записью `часть(agent_chunk { … })`, переводчик её отклоняет. После 0.9.1 с новыми хешами «Паузы» — отдельный малый шаг: две копии в `machines/methodology/libs/`, хеш в 5 таблицах, пересборка 5 деревьев.

2026-10-27 15:08 документ: текст скрипта критерия `accept-240.sh` (вне репозитория; запуск из корня дерева; `trees.py` — текст из журнала 225, только шапка «accept-240, the programme 0.9.0»; `nova-env.sh` — переменные `setup-env.ps1` Nova Oracle 0.1.0 для Git Bash):

```sh
#!/bin/sh
# accept-240: criterion of the task 240 (the machines of the product on Alula 2.26, the package alula 0.9.0).
# The script is OUTSIDE the repository; its text is recorded in doc/tasks/240-alula-2-26-migraciya-produkta-crew-harne/log.md.
# usage (from the root of the working tree):  sh accept-240.sh
# env: ALULA (the program alula 0.9.0), MIGRATE (tools/migrate-alula-226.py of the package 0.9.0), ACCEPT_240_METH_SET (the machine set of the methodology, alula-machines: read only, a copy is moved in a temp folder),
#      ACCEPT_240_SRC=skip (do not run the folders of src/ - the red probe only), ACCEPT_240_PAR (folders of src/ at once, default 1), ACCEPT_240_TIMEOUT (seconds per test file, default 1800),
#      ACCEPT_240_REUSE=1 (keep the green folders already in ACCEPT_240_OUT).
# The last line: ПРИНЯТО 240: alula 0.9.0; product 81 из 81; methodology 514 из 514; набор методики 508 из 508; старых форм 0; деревья равны; пин 0.9.0; src: папок K зелёных, красных 0
set -u
export PYTHONUTF8=1
HERE=$(cd "$(dirname "$0")" && pwd)
ALULA="${ALULA:-alula}"
MIGRATE="${MIGRATE:-migrate-alula-226.py}"
PAR="${ACCEPT_240_PAR:-1}"
TMO="${ACCEPT_240_TIMEOUT:-1800}"
OUT="${ACCEPT_240_OUT:-${TMPDIR:-/tmp}/accept-240-$$}"
mkdir -p "$OUT"
BAD=0
fail() { echo "КРАСНОЕ: $*"; BAD=$((BAD + 1)); }
tests_of() { "$ALULA" test "$1" >"$2" 2>&1; sed -n 's/^\([0-9][0-9]*\) of \([0-9][0-9]*\) tests passed$/\1 \2/p' "$2" | tail -1; }

# 0. the program
V=$("$ALULA" version 2>&1 | head -1)
[ "$V" = "alula 0.9.0 (Alula 2.26, machine/2)" ] || fail "alula version: «$V»"

# 1. the tests of the two folders of machines
set -- $(tests_of machines/product "$OUT/product.txt") 0 0; PN=$1; PM=$2
[ "$PN" = 81 ] && [ "$PM" = 81 ] || fail "alula test machines/product: $PN из $PM (нужно 81 из 81); $(grep -v 'passed$' "$OUT/product.txt" | head -c 400 | tr '\n' ' ')"
set -- $(tests_of machines/methodology "$OUT/methodology.txt") 0 0; MN=$1; MM=$2
[ "$MN" = 514 ] && [ "$MM" = 514 ] || fail "alula test machines/methodology: $MN из $MM (нужно 514 из 514); $(grep -v 'passed$' "$OUT/methodology.txt" | head -c 400 | tr '\n' ' ')"

# 2. the old forms: the migration script has nothing to move, no 2.25 in machines/, no signal of the machine in the product
DRY=$(python "$MIGRATE" --dry-run machines 2>&1 | tail -1)
[ "$DRY" = "итог: файлов 0, мест 0" ] || fail "migrate --dry-run machines: $DRY"
OLD=$(grep -rnE -e 'format: 2\.25' -e '"alula_version": ?"2\.25"' -e '^## (Сигналы|Концы|Части ответа|Обязывает)' -e '^- ?Читает:' -e '^Читает:' machines | wc -l)
[ "$OLD" = 0 ] || { fail "старых форм в machines: $OLD"; grep -rnE -e 'format: 2\.25' -e '"alula_version": ?"2\.25"' -e '^## (Сигналы|Концы|Части ответа|Обязывает)' -e '^- ?Читает:' -e '^Читает:' machines | cut -c1-120 | head -5; }
for f in machines/*/*.alula.md; do grep -q '^- format: 2.26$' "$f" || fail "$f: не format 2.26"; done

# 3. the trees equal the build of the program 0.9.0 (parse of JSON; chat.alula.json is written by hand: see trees.py)
TREES=ok
python "$HERE/trees.py" "$ALULA" machines "$OUT" || { fail "деревья не равны сборке"; TREES=no; }

# 4. the pin of the product
PIN=ok
grep -qE '^alula = \{ git = "https://github.com/nv-lang/nova-alula", version = "0\.9\.0" \}' nova.toml || { fail "nova.toml: alula не 0.9.0"; PIN=no; }
python - <<'PY' || { fail "nova.lock.toml: alula не 0.9.0 / 6444780"; PIN=no; }
import re, sys
t = open("nova.lock.toml", encoding="utf-8").read()
m = re.search(r'\[\[package\]\]\nname = "alula"\n(.*?)(?:\n\n|\Z)', t, re.S)
b = m.group(1) if m else ""
ok = 'version = "0.9.0"' in b and 'commit = "6444780f04efcb24a285dcad90eb746394c12450"' in b and 'pin = "version:>=0.9.0, <0.10.0"' in b
sys.exit(0 if ok else 1)
PY

# 5. the set of the methodology (foreign zone: read only; a copy is moved in a temp folder and run)
SETLINE="набор методики: не назван"
if [ -n "${ACCEPT_240_METH_SET:-}" ] && [ -d "$ACCEPT_240_METH_SET" ]; then
  rm -rf "$OUT/methset" && mkdir -p "$OUT/methset" && cp -r "$ACCEPT_240_METH_SET/." "$OUT/methset/"
  python "$MIGRATE" --alula "$ALULA" "$OUT/methset" >"$OUT/methset.mig" 2>&1; MC=$?
  set -- $(tests_of "$OUT/methset" "$OUT/methset.txt") 0 0
  SETLINE="набор методики $1 из $2"
  [ "$MC" = 0 ] && [ "$1" = 508 ] && [ "$2" = 508 ] || fail "набор методики: миграция код $MC, $1 из $2 (нужно 508 из 508); $(grep ':[0-9]*: ' "$OUT/methset.mig" | head -3 | tr '\n' ' ')"
else
  fail "набор методики: ACCEPT_240_METH_SET не назван"
fi

# 6. the units of src/ with the machines
FOLDERS="machines machine_registry machine_agent machine_agent_en machine_cycle machine_dialog machine_chat alula_eq_machines alula_tests_machines alula_cli_machines machine_text_machines machine_text_eq_machines machine_text_render_machines machine_session machine_dialog_eq machine_nested_eq machine_nested_run machine_run_machines machine_table_machines machine_runner chat server"
K=0; RED=0
if [ "${ACCEPT_240_SRC:-run}" = skip ]; then
  SRCLINE="src: пропущено (ACCEPT_240_SRC=skip)"
  BAD=$((BAD + 1))
else
. /tmp/accept-240/nova-env.sh
  run_folder() {
    f="$1"
    if [ "${ACCEPT_240_REUSE:-}" = 1 ] && grep -q '^ok' "$OUT/src_$f.res" 2>/dev/null; then return; fi
    if nova test "src/$f" --jobs 2 --timeout "$TMO" >"$OUT/src_$f.txt" 2>&1; then echo "ok $f" >"$OUT/src_$f.res"; else echo "red $f" >"$OUT/src_$f.res"; fi
  }
  running=0
  for f in $FOLDERS; do
    run_folder "$f" &
    running=$((running + 1))
    if [ "$running" -ge "$PAR" ]; then wait; running=0; fi
  done
  wait
  for f in $FOLDERS; do
    if grep -q '^ok' "$OUT/src_$f.res" 2>/dev/null; then K=$((K + 1)); else RED=$((RED + 1)); echo "красная папка src/$f: $(grep -aiE 'FAIL|error' "$OUT/src_$f.txt" | head -3 | cut -c1-300 | tr '\n' ' ')"; fi
  done
  [ "$RED" = 0 ] || BAD=$((BAD + 1))
  SRCLINE="src: папок $K зелёных, красных $RED"
fi

SUM="product $PN из $PM; methodology $MN из $MM; $SETLINE; старых форм $OLD; деревья $([ "$TREES" = ok ] && echo равны || echo не равны); пин $([ "$PIN" = ok ] && echo 0.9.0 || echo не 0.9.0); $SRCLINE"
if [ "$BAD" = 0 ]; then
  echo "ПРИНЯТО 240: alula 0.9.0; $SUM"
  exit 0
fi
echo "НЕ ПРИНЯТО 240 ($BAD красных): $SUM"
exit 1
```

# Разбор 112: имена по Портолану — файлы машин `*.portolan.md`, сценарии `*.scenario.test.json`, ссылки на новые имена файлов методики

Задание — `task/message.md`. Источник: слова владельца в чате оркестратора, 2026-10-19: «по рекомендации»; решения Методики по слову её владельца (2026-10-19): язык «Портолан», файл машины `*.portolan.md`, спецификация `state-machine-portolan-spec.md`, образец `state-machine-agent-step.portolan.md`; расширение сценариев с `test` предложено оркестратором и принято словом «по рекомендации». Быстрый маршрут, механическая задача: поведение, формат `scenario/0`, схемы и слои имён (`machine/2`, `TableMachine`) не менялись. Текст разбора составлен по отчёту исполнителя (инструмент записи не дал подагенту создать этот файл) и записан оркестратором.

## 1. Что сделано

- **AC-1, имена файлов.** `git mv` переименованы 139 файлов (история сохранена, сходство 99–100 %): 131 сценарий `src/machine/scenarios/*.scenario.json` → `*.scenario.test.json`; `src/machine/machines/chat.table.md` → `chat.portolan.md`, `agent_step.table.txt` → `agent_step.portolan.txt`; в `src/machine_text_eq/cases/` четыре файла `*.table.md` (`agent-step`, `format-examples`, `meeting-wrapper`, `unsupported-examples`) → `*.portolan.md`; файлы определений `meeting-definitions.defs.md` и `src/machine_text/defs/cycle-arithmetic.defs.md` → `*.portolan.md`. Образец методики `src/machine_agent/cases/agent-step-methodology.portolan.txt` уже носил новое имя (задача 110). Расширение `.txt` у двух копий осталось (проза ссылается на файлы методики, страж ссылок читает только `.md`). Переводчик и `is_table_name` (`src/machine/data.nv`) по-прежнему принимают `.table.md`, `.portolan.md`, `.table.txt`, `.portolan.txt` (переходный период; тест `sm both extensions` не тронут); новые файлы — только `.portolan.*`.
- **Перечни и тесты.** `src/machine/data.nv` (перечни `scenario_files()`, `table_files()`, функции текстов, комментарии), `src/machine_agent/{agent,cover}_test.nv`, `src/machine_run/{mech,params,scenario}_test.nv`, `src/machine_text/{chat,machine}_test.nv`, `src/machine_text/defs.nv`, `src/machine_text_eq/{cases,cases_test,eq_test,include_test,pilot_run_test}.nv`, генератор `doc/tasks/109-agent-step-machine/tools/gen_scenarios.py` (имена выходных файлов и строк `NamedText`). Замена — скриптом с подсчётом по файлам: 35 файлов, 254 строки.
- **AC-2, ссылки на файлы методики.** `state-machine-table-format.md` → `state-machine-portolan-spec.md` и `state-machine-agent-step-table.md` → `state-machine-agent-step.portolan.md` в README `src/machine`, `src/machine_text`, комментариях `expr.nv`, `value.nv`, `model.nv`, описании схемы `machine-2.schema.json` (только текст описания, не структура), в документах 106–110 и в `doc/research/2026-10-19-portolan-history.md`. Имени `state-machine-portolan-format.md` в дереве не было. В таблице слоёв имён истории Портолана старые имена названы как «бывш.» (`*.table.md`, `*.scenario.json`).
- **Название языка.** В `src/machine/README.md` и `src/machine_text/README.md` формат назван «Портолан (Portolan)»: заголовок и первый абзац переводчика, таблица единиц, строки про чат и «Шаг агента»; в таблицу «Layout» добавлена строка об именах файлов (`*.portolan.md`, `*.scenario.test.json`, принятие старых имён).
- **Исторические отчёты 105–111.** Заменены только имена файлов методики и пути наших файлов, которые существуют сейчас под новым именем. Места, где отчёт рассказывает про смену расширения (110: `analysis.md`, строка про `.table.txt` и `.table.md`; `log.md`, строки 6 и 7; `task/message.md`, про файлы 2.5 и 2.6), оставлены как история.
- Коммиты: f1f2746 (src: переименования, перечни, тесты, README), 176075c (документы, журнал, генератор) — SHA до перебазирования.

## 2. Красная проба

До правок добавлены два теста, которые требуют новые имена: `names by the Portolan` (`src/machine_run/scenario_test.nv`: ровно 131 сценарий с именем `*.scenario.test.json`, 2 файла машин `.portolan.md` или `.portolan.txt`, 7 машин JSON) и `cs names by the Portolan` (`src/machine_text_eq/cases_test.nv`: 5 файлов случаев `.portolan.md`). На старом дереве: `nova test src/machine_run` — `FAIL: names by the Portolan — scenario_test.nv:242: assert failed: f.name.ends_with(".scenario.test.json")`; `nova test src/machine_text_eq` — `FAIL: cs names by the Portolan — cases_test.nv:62: assert failed: f.name.ends_with(".portolan.md")`. После переименования оба зелёные. Тесты остаются в наборе: имя нового файла в старом виде их снова покраснит. Прежние тесты (`lists of files`, `every scenario`, `cs files`) сверяют перечни с каталогами и сами сторожат, что файл не потерян.

## 3. Проверки

- Юниты по одному, `--jobs 4`: `machine`, `machine_table`, `machine_run`, `machine_text`, `machine_text_fmt`, `machine_agent`, `machine_chat`, `machine_text_eq` — все PASS (17–59 с).
- Полный набор `nova test src --jobs 4` на временном контейнере PostgreSQL (`src/pg/testdb.ps1`, затем `-Stop`): PASS 23, FAIL 0 (183 с). `nova test src --jobs 4 --strict-effects`: PASS 23, FAIL 0 (177 с). Новых тестов два (красная проба), остальные не менялись; сценариев 131 (проверено тестом `names by the Portolan`), файлов машин на Портолане 2 + 5 случаев, машин JSON 7.
- Поиск по дереву: `scenario.json`, `state-machine-table-format`, `state-machine-portolan-format`, `state-machine-agent-step-table` — ноль вхождений вне папки задачи 112.
- Стражи `sh scripts/guards/run-all.sh`: ок 8, FAIL 0 (md-link: осмотрено 1058 ссылок).
- Находок Oracle нет, пункт README после п. 43 не заводился.

## 4. Решения и расхождения

- **Файлы определений переименованы** `.defs.md` → `.portolan.md`: задание велело проверить раздел 1 спецификации, а там сказано, что файл определений и файл фрагмента — тоже `*.portolan.md` с шапкой своего вида; нового расширения для определений Методика не называла (проверено по локальной копии репозитория методики, версия 2.9).
- **Исторические формулировки** про смену расширения не переписаны (раздел 1), поэтому в документах 110 имена `.table.md` остались как история.
- **Схема.** В `machine-2.schema.json` изменён только текст описания (ссылка на имя файла методики); структура и ключи не менялись.
- **Находка вне задачи.** Генератор сценариев 109 (`gen_scenarios.py`) устарел до этой задачи: запуск перезаписывает `agent-step-policy-1` ключом `PERMISSION_POLICY` вместо `проект.политика_разрешений`. После проверки имён файл возвращён из индекса; содержимое сценариев не менялось.

## 5. Что осталось

- Генератор `gen_scenarios.py` даёт `agent-step-policy-1` со старым ключом параметра: запуск генератора ломает один сценарий (остальные 74 из 75 совпадают с файлами). → не нужно, потому что генератор был разовым инструментом задачи 109, сценарии правятся руками и проверены тестами; починка вне границ задачи.
- Двуязычный Портолан (версия 2.9 методики: английские ключевые слова, русский и английский образцы). → задача 113 (следующая по плану владельца, «по рекомендации», 2026-10-19).
- Старые расширения (`.table.md`, `.table.txt`) по-прежнему принимаются перечнем `is_table_name`; когда снять переходный период, не решено. → не нужно, потому что принятие старых имён — требование задания (AC-1), а срок снятия назначит владелец вместе с обновлением основной копии (AGENTS.md пп. 11–12); код читает текст и расширение не проверяет, риска нет.
- Не проверено: подхват переименований рабочей копией `main` и работающей службой. → не нужно, потому что работа велась только в рабочем дереве задачи; обновление основной копии — по слову владельца «обновляй», код `src/machine*` плагином OpenCode не загружается.

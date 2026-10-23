2026-10-23 21:32 документ: задание заведено плагином: «Разделение пакета alula и продукта: реестр и журнал как данные, examples, машины в продукт»; task/message.md — шаблон (заполнить); основа — task-split 3d130b4
2026-10-23 22:10 документ: разбор — ниже, первой частью (инструмент не даёт создать analysis.md: «разбор отчётом, не файлом»; так же сделано в 155); числа сверены кодом пакета `5f8392d`, не прозой постановки.

## Разбор (до кода)

### 1. Примитивы: хозяин

Источник: `src/machine/registry.nv`, `standard_registry()` (56 примитивов) и `src/machine/machines/*.alula.json` (списки `primitives`).

| Хозяин | Число | Какие |
|---|---|---|
| язык | 2 | `time_now`, `new_id` (встроенные: раздел 7, AL-107; их знает `ScriptedHost` пакета) |
| методика | 54 | шаг агента 3 (`reply_validation`, `close_agent_turn`, `check_cache`), совещание 17 (`party_profile`, `role_context`, `call_trace`, `call_step`, `parse_agent_reply`, `proposal_*` 3, `count_in_model_tally`, `journal_findings`, `journal_machine_data`, `journal_decision`, `remove_unsound`, `build_summary`, `close_for_writing`, `open_for_writing`, `move_to_archive`), запуск сессии 4 (`launch_scope`, `launch_profile`, `session_context`, `parse_session_artifact`), `stop_agent_group` 1, раннер 29 |
| продукт | 0 | машины `chat`, `dialog` примитивов не зовут |

Таблицы ролей разбора (3 строки `parse_agent_reply`: `witness`, `author`, `lens`) и три набора типов (`standard_types`: 11 записей, 6 вариантов; `session_types`; `runner_types`) — методики.

Расхождения с постановкой:
1. `close_agent_turn` — примитив методики, но его зовёт пример языка `actions` (`actions.alula.json`): в `examples/registry.md` он записан как пример хозяина; это не реестр методики.
2. Образцы `spec/samples/` (шаг агента ru/en, совещание) нельзя проверить без реестра: их проверки (тексты, разбор, хеши) остаются в пакете, а нужные им примитивы лежат данными в `spec/samples/registry.md` (раздел 7 спецификации и так показывает «пример реестра пилотов»); 29 примитивов раннера, 4 сессии и `stop_agent_group` едут в `machines/methodology/registry.md` и в пакете не остаются.
3. `render_states.nv` (`rn_class_of`) берёт класс примитива из `standard_registry()` для таблицы «Примитивы» отрисованного файла: после разделения реестр хозяина передаётся отрисовке аргументом (язык сам знает только 2 примитива класса `reading`).

### 2. Коды журнала: хозяин

Источник: `journal_methodology.md` (86 строк), `journal_product.md` (56 строк), `journal.nv`, коды в действиях `"do": "journal"` всех 15 машин.

| Хозяин | Число | Какие |
|---|---|---|
| язык | 35 | формат 5: `signal_passed`, `input_rejected`, `machine_error`, `machine_data`, `fork_no_match`; «Пауза» 8: `human_stop`, `pause_by_parent_stop`, `cancel_discarded_foreign_request`, `cancel_discarded_already_replied`, `request_cancelled`, `cancel_parse_no_match`, `human_continue`, `parent_continue`; движок и исполнитель 22 (14 «движок продукта» + 8 «исполнитель продукта» в `journal_product.md`: `machine_started` … `form_returned`) |
| методика | 73 | остальные 73 строки `journal_methodology.md` (86 − 13 языка); из них 15 ни одна из 4 машин не пишет (коды совещания: `agent_usage`, `open_finding`, `unclosed_finding`, `meeting_decision` и др.) — остаются в таблице как данные |
| продукт | 10 | `user_message`, `agent_chunk`, `agent_done`, `agent_refused`, `cancelled_while_waiting`, `no_answer_in_time`, `cancelled_before_request`, `session_closed`, `turn_answered`, `turn_refused` |
| примеры языка | 24 | `child_answered`, `child_failed` (caller), `callee_answered`, `callee_failed`, `callee_silent` (callee), `lens_answered`, `lens_lost` (fan, lenses), `big`, `small`, `boom`, `doubled`, `seen` (actions), `started`, `stepped`, `reached_limit` (calc), `stop_discarded`, `work_done`, `work_failed` (gate), `failed`, `got`, `other_failure`, `retrying`, `silent`, `transient` (variants) |

Расхождение: пример `dialog_steps` (вложенная пара) пишет `user_message`, `session_closed`, `turn_answered`, `turn_refused` — четыре кода из 10 продукта. Решение по месту: таблицы — самостоятельные данные своего хозяина, поэтому `examples/journal.md` содержит 28 строк (24 + эти 4 с теми же шаблонами), `machines/product/journal.md` — 10. Одинаковый код в таблицах двух разных хозяев не конфликтует: проверка `journal_table_issues` сверяет хозяина только с кодами ЯЗЫКА. Суммы сошлись: 35 + 73 + 10 + 24 = 142 = 86 + 56.

### 3. Данные, которые едут

Машины (`src/machine/machines/`): пакет (examples) — `calc`, `fan`, `gate`, `lenses`, `variants`, `actions`, `caller`, `callee`, `dialog_steps` (9); продукт — `chat`, `dialog` (2); методика (переходно в продукте) — `agent_step`, `cycle_check`, `task_runner`, `session_start` (4).

Сценарии (`src/machine/scenarios/`, 626), по полю `machine`: `agent_step` 83, `cycle_check` 101, `task_runner` 257, `session_start` 55 (методика, 496); `ChatSession` 42, `DialogSession` 39 (продукт, 81; из них 5 `free-input-*`: 3 чата и 2 диалога); `caller` 17, `fan` 9, `dialog_steps` 6 (вложенные, 32), `Variants` 5, `Gate` 5, `Calc` 4, `Lenses` 3 (примеры, 49). Расхождение с постановкой: в ней 572 едут и 54 остаются (`free 5` посчитаны примерами); по коду `free-input-*` — сценарии машин `chat` и `dialog`, поэтому едут 496 + 81 = 577, остаются 49. Свободный ввод в примерах покрывают новые сценарии.

### 4. Тесты (2639 в 22 папках): что едет

Метод: скрипт разбирает каждый `*_test.nv` на тесты и вспомогательные функции и помечает тест, если он (или функция, которую он зовёт) читает машину, таблицу или сценарии продукта/методики, их реестр, журнал или типы. Результат: 386 тестов из 2639 (ориентир постановки ≈ 370–410 сошёлся); остальные 2253 — язык и остаются, у них заменяются только источник реестра и данные примеров.

| Папка пакета | Тестов | Едут | Куда |
|---|---|---|---|
| machine_runner / machine_session / machine_cycle | 59 / 89 / 48 | тесты, читающие машину, её сценарии, реестр и журнал методики (проверки таблиц против прозы методики, покрытие строк, журнал, поток сценариев) | продукт: те же имена папок |
| machine_agent, machine_agent_en | 84, 14 | `agent_test`, `cover_test`, `journal_test`, часть `sample_test`, `v217_test`, `english_test` (прогон 75 сценариев) | продукт: `machine_agent`, `machine_agent_en`; остаток (образцы, хеши, разбор) остаётся в пакете |
| machine_dialog | 24 | все | продукт: `machine_dialog` |
| alula_eq, alula_scenarios, alula_cli, machine_run, machine_table, machine_text, machine_text_eq, machine_text_render, machine_nested, machine_nested_eq, machine_nested_run, machine | остальные из 386 | тесты, чей вход — `chat`, `dialog`, `agent_step`, `cycle_check`, `session_start`, `task_runner` | продукт: папка `<имя>_machines` (отдельный модуль на каждую) |

Правило Oracle «одна папка — один модуль — один юнит тестов» соблюдается: у каждой папки продукта своё имя модуля `crew_harness.<папка>`. Предел 4 КБ строк вывода юнита: имена тестов короткие, юниты не больше исходных.

### 5. Решения

1. Данные хозяина — Markdown-файлы рядом с машинами: `registry.md` (таблицы форм раздела 7: примитивы `имя | параметры | результат | класс | читает | пишет`, роли `примитив | роль | результат | читает`, типы `тип | вид | состав`; типы в записи дерева `machine/2`, как читает `parse_spec`; `|` внутри ячейки пишется `\|`) и `journal.md` (таблица `Машина | Код события | Русский шаблон | Параметры`, как была в `journal_methodology.md`). Пакет сам держит `journal_language.md` (35 строк) и реестр языка из 2 примитивов.
2. Программа `alula`: флаги `--registry <файл>` и `--journal <файл>`; без флагов файлы `registry.md` и `journal.md` берутся рядом с файлом команды (для `test` — из самой папки). Проверка идёт против «язык + хозяин»; код хозяина, повторяющий код языка, и примитив хозяина с именем примитива языка — ошибки.
3. API библиотеки: `language_registry()`, `language_journal()`, `parse_journal(text)`, `parse_registry_table(text)`, `host_registry(реестр, журнал)`; нет `standard_registry`, `standard_types`, `session_types`, `runner_types`, `journal_union`, встроенных текстов машин продукта и методики.
4. Пакет: данные примеров — в `examples/`, модуль `alula.examples` отдаёт их тестам (`embed_str("../../examples/…")`, проверено пробой); данные образцов — `spec/samples/registry.md`.
5. Продукт: `machines/product/`, `machines/methodology/`; модуль `crew_harness.machines` отдаёт данные тестам и хабу; локальная зависимость на пакет — `nova.override.toml`, не коммитится.
6. Остаток вне задачи: `names_host.tsv` (имена вложенных машин методики `шаг_агента`, `совещание` … для сторон вида `machine`) и включаемый файл `арифметика_цикла` остаются в пакете как часть словаря и спецификации (хеши `60383c370415`, `642e1f78f0f7`, `928cd807453a` закреплены); их передача методике — задача 159.

## Ход работы

2026-10-24 00:04 документ: красная проба до кода (пакет `5f8392d` без правок + новые тесты и данные): `alula test examples` старой программой — 43 из 66 сценариев (23 новых красные: журнальные коды новых примеров не в таблицах старого пакета, реестр хозяина программа не читала); новые тесты `host_test.nv` (реестр и журнал хозяина) на старом коде не собираются (нет `load_host`, `spec/samples/registry.md`). Красная проба снята коммитами пакета ниже.
2026-10-24 00:05 документ: решение: `dialog_steps` едет не в `examples/`, а в `machines/methodology/` — его вызываемая машина `agent_step` методики (контракт `ЗапросАгента`); в примерах пакета остаются 8 машин (calc, fan, gate, lenses, variants, actions, caller, callee) и 7 новых малых таблиц (echo, retry, verdict, router, pausable, keeper, batch), 66 сценариев (43 прежних + 23 новых). Журнал примеров — 24 кода, не 28; 4 кода пары `dialog_steps` — в журнале методики (77 строк) и продукта (10).
2026-10-24 00:06 документ: решение: загрузчик реестра (`parse_registry_table`, `host_registry`, `load_host`) и читатель типов `parse_spec` — в `alula.machine` (не в `machine_table`): так модуль `alula.examples` (данные для тестов) зависит только от `alula.machine`, и тесты `machine_table` могут им пользоваться без цикла.
2026-10-24 00:07 документ: решение: язык-реестр `language_registry()` хранит 35 кодов языка (проверка кодов включена); хозяин без `journal.md` проверяется против 35 кодов языка, хозяин без `registry.md` — против двух примитивов. Образцы (`spec/samples/`) проверяются реестром `spec/samples/registry.md` (20 примитивов пилотов) без таблицы кодов (`without_journal`).
2026-10-24 00:08 документ: тесты: пакет 2639 → 2198 + новых; продукт 311 → 819. Отбор переезжающих тестов — скрипт по чтению машин, сценариев, реестра и журнала продукта/методики (с замыканием по вспомогательным функциям); ложные срабатывания (тесты на образцах, на примерах, циклы по всем таблицам) возвращены в пакет, циклы «по всем таблицам» существуют в двух копиях: пакет по таблицам примеров, продукт по таблицам продукта и методики.
2026-10-24 00:53 документ: оценка срока (по требованию оркестратора, числом часов): до сдачи полных наборов осталось ≈ 1,3 ч. Сделано: пакет — полный набор plain 18 из 18 папок (418 с) и strict 18 из 18 (394 с), зелёные; продукт — все папки с перенесёнными тестами зелёные по отдельности. Осталось: (а) полный набор продукта plain с временным PostgreSQL ≈ 0,4 ч (прежние 12 папок ≈ 4 мин, `machine_runner` ≈ 11 мин под нагрузкой, остальное параллельно); (б) тот же strict ≈ 0,4 ч; (в) сборка программы `alula` пакета и `alula test` по `examples/`, `machines/product/`, `machines/methodology/` ≈ 0,2 ч; (г) проверка программ продукта `crew_hub`/`crew_harness`, стражи, коммиты, числа в log.md и отчёт ≈ 0,3 ч. Срок сдачи: 2026-10-24 около 02:15 (сейчас 00:53). Строку обновлю, если оценка изменится.
2026-10-24 01:43 документ: оценка срока обновлена: до сдачи ≈ 1,2 ч (сдача 2026-10-24 около 02:55). Сделано: продукт plain — 31 из 33 папок зелёные в общем прогоне (2279 с), 2 красные в общем прогоне перепроверены отдельно и зелёные (`src/server` — таймер 1623 с под нагрузкой, отдельно 152 с; `src/server_pg/hub_pg_test` «burst chunks» — отдельно 129 с); идёт продукт strict ≈ 0,65 ч; после него ≈ 0,2 ч сборка программы `alula` и `alula test` по трём папкам, ≈ 0,3 ч коммиты, числа и отчёт.

## Итоги и числа (2026-10-24)

Коммиты. Пакет, ветка `task-158-alula-split` от `5f8392d`: `4db7587` (реестр и журнал как данные, программа), `03c009d` (`examples/`, данные машин из пакета убраны), `29e9736` (тесты машин из пакета), `dcf1c35` (подраздел 7а, AL-113), `bd9792e` (версия 0.4.0, история, README), `6dcc0c6` (тесты языка, что только казались продуктовыми). Продукт, ветка `task-158-alula-split` от `83a2555`: `74993cd` (`machines/`), `bbba215` (`src/product_machines`, `src/machines`, хаб, `nova.toml`), `e7b1d7e` (тесты машин в 18 папках); эта запись и итоги — следующим коммитом.

Числа. Тесты: пакет 2639 → 2198, продукт 311 → 819 (всего «пакет + продукт»: 2198 + 508 = 2706 при прежних 2639 (продуктовые 311 не считаются)). Из них новые: `host_test` реестра и журнала 22 (с проверкой подраздела 7а), `host_test` программы 12 + 3 цикла по таблицам примеров, 7 малых тестов реестра пакета, 14 `machine_registry`/журнала продукта, 8 данных `machines`. Сценарии: 626 → пакет 66 (49 − 6 `nested-steps` + 23 новых) + продукт 583 (81 + 502) = 649 ≥ 626. Красная проба: 23 из 66 сценариев `examples/` красные на старой программе, тесты `host_test` на старом коде не собираются.

Переехало: машин 7 (chat, dialog → `machines/product/`; agent_step, cycle_check, session_start, task_runner, dialog_steps → `machines/methodology/`), сценариев 583 (81 + 502), реестр методики 54 примитива + 3 роли + 3 набора типов, журнал методики 73 + 4, журнал продукта 10, тестов 508 в продукте (по папкам: machine_runner 59, machine_session 89, machine_cycle 48, machine_dialog 24, machine_nested_eq 6, machine_agent 16, machine_agent_en 4, machine_nested_run 4, machine_registry 21, alula_eq_machines 61, alula_scenarios_machines 12, alula_cli_machines 11, machine_run_machines 91, machine_text_machines 5, machine_text_eq_machines 8, machine_text_render_machines 25, machine_table_machines 19, machines 8). Остались в пакете: язык, `examples/` (15 машин JSON, 10 таблиц), образцы `spec/samples/` с `registry.md`, имена вложенных машин `names_host.tsv` и файл определений `арифметика_цикла` (решение 159).

Проверки. Пакет: `nova test src --jobs 4 --timeout 900` 18 из 18 папок (1 без тестов: `src/examples`) за 418 с, `--strict-effects` 18 из 18 за 394 с; `alula test examples` 66 из 66; программа 0.4.0 собрана; стражи пакета (4) зелёные; `check-alula-translation.py` — структура ru/en совпадает (метки 217). Продукт (с `nova.override.toml` на дерево пакета, временный PostgreSQL `src/pg/testdb.ps1`, затем `-Stop`): `nova test src` 31 из 33 в общем прогоне, 2 красных перепроверены отдельно и зелёные (`src/server` — таймер под нагрузкой; `src/server_pg/hub_pg_test` «burst chunks» — зависит от нагрузки); `--strict-effects` 32 из 33, `hub_pg_test` отдельно зелёный; `alula test machines/product` 81 из 81, `machines/methodology` 502 из 502 программой пакета 0.4.0; стражи продукта (9) и секреты — зелёные. Хеши образцов (642e1f78f0f7, 928cd807453a) и словаря (60383c370415) не менялись, тесты пакета их проверяют.

Риски и откат. Ломающее изменение API пакета; продукт на `nova.lock.toml` (пин `<0.4.0`) без `nova.override.toml` не соберётся, пока не опубликована `v0.4.0` и не выполнен `nova update alula` (так задумано). Откат: ветки не слиты и не опубликованы; достаточно не сливать; публикация — по слову владельца. Тесты и хаб продукта зависят от экспортов `lex_round_trips`, `parse_registry_table`, `host_registry`, `load_host`, `host_types`, `render_machine_in`, `without_journal` (новые в 0.4.0).

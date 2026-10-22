# Анализ задачи 151: семантика Алулы 2.15–2.17 в пакете `alula`

Текст составлен исполнителем и записан оркестратором (инструмент записи не дал подагенту создать этот файл).

**Основа.** Состояние 2.17 в `main` Методики — коммит `52ea20f` (последний перед 2.18): спецификация, `alula-keywords.tsv` (219 строк), словарь версии 11, образцы «Шаг агента» (ru, en) и «Совещание». Версии 2.18+ не вводились.

| Метка | Правило 2.15–2.17 | Где в пакете | Тесты |
|---|---|---|---|
| AL-51 | свободный ввод: обращение к стороне без счётчика (ворота не открываются) | `machine_table/check.nv` (раздел «party of a free input») | `machine_table/v217_test.nv`, `machine_text_lang/v217_free_test.nv`, `machine_run/v217_test.nv` |
| AL-52 | `счётчик` необязателен только у стороны вида `human`, `—` = нет счётчика; у такой стороны нет таблицы `Запрос`; ключ `counter` необязателен в дереве | `machine_text/party.nv`, `render.nv`, `machine_table/check.nv`, схема | те же и `machine_text_render/v217_test.nv` |
| AL-53 | JSON-имена строятся сами: строка `## Имена` → латиница как есть → словарь целиком → транслитерация по словам (типы и состояния Pascal, остальное snake) | `machine_text/jname.nv`, `parse.nv`, `decl.nv`, `state.nv`, `party.nv` | `machine_text_lang/v217_names_test.nv`, `machine_text/v217_test.nv` |
| AL-56 | `—` в столбце выражения Запроса = то же имя; запись `имя` = выражению даёт предупреждение | `machine_text/state.nv`, `render_states.nv` | `machine_text_lang/v217_free_test.nv`, `machine_text_render/v217_test.nv` |
| AL-57 | `иначе` обязателен только там, где тип не доказывает исчерпание; лишнее написанное `иначе` — предупреждение | `machine_table/check.nv` (`check_forks`, `fork_proved`, `machine_warnings`), `machine_text/checked.nv` | `machine_table/v217_test.nv`, `machine_text_lang/v217_test.nv`, правки `machine_run`, `machine_runner`, `machine_session` |
| AL-58 | 10 пространств различимости JSON-имён | `jname.nv` (реестр `TxJn`, `jn_finish`), `include.nv`, `party.nv` | `machine_text_lang/v217_spaces_test.nv`, `machine_nested/v217_test.nv` |
| AL-59 | слово из двух алфавитов — ошибка | `jname.nv` (`jn_mixed`) | `machine_text/v217_test.nv`, `v217_names_test.nv` |
| AL-60 | раздел `## Имена` (после `## Типы`), скобки после имён — ошибка; лишняя, повторная и нелатинская строка — ошибки | `defs.nv`, `parse.nv`, `state.nv`, `jname.nv` (`jn_rows_read`) | `machine_text_lang/v217_rows_test.nv`, `news_test.nv`, `machine_text_render/v217_test.nv` |
| AL-61/62 | словарь v11 закреплён хешем `60383c370415` (первые 12 знаков SHA-256 нормативной части, 1268 пар), смена формата и хеша — вместе | `jname.nv` (`glossary_*`), `glossary_names.tsv`, `scripts/glossary-names.py`, `machine.nv` | `machine_text/v217_test.nv` |
| AL-63 | группа слов `kind_param` в таблице слов 2.17 | `alula-keywords.tsv` (219 строк) | `machine_text/v213_test.nv`, `v217_test.nv` |
| AL-64 | правило регистра | образец в `machine_agent/methodology.nv` | `machine_agent/v217_test.nv` |
| формат | `alula_version: "2.17"`, `machine_version: alula-2.17` | `machine_table/json.nv`, схема `machine-2.schema.json` | `machine_table/alula_version_test.nv`, `alula_cli`, `alula_eq` |

## Решения

1. Словарь — файл пакета `glossary_names.tsv`, его делает `scripts/glossary-names.py`. Имя с двумя английскими (`расход`: `usage` и `transport_usage`) в словарь не входит.
2. `chat` и `dialog` переведены на свободный ввод. `dialog_steps` оставлена с воротами: её состояние `ЖДУ` читает данные через таблицу `Запрос`, а у обращения со свободным вводом её нет.
3. Две недостижимые `иначе` удалены (`Scope` в `session_start`, `PhaseSwitch` в `task_runner`). Остальные развилки без доказанного исчерпания оставлены с `иначе`.
4. Таблица «Шага агента» продукта собрана из образца 2.17 плюс ключи проекта плюс пять строк `## Имена` вида `ИтогХода.<вариант>.расход | usage`.
5. Тест интерпретатора «fork no match» теперь проверяет отказ загрузки таблицы без `иначе`. Доказательство конца `Errored` в `machine_session` идёт по изменённой таблице, где условия развилки ложны, а `иначе` возвращена.
6. Тесты `machine_runner` называют отброшенную строку `PhaseSwitch#7` (`dropped_rows`) и сверяют остальные строки таблицы методики.
7. Файл фрагмента «Пауза»: `запрос_вызова | запрос_вызова` заменено на `—`.

**Порядок работы:** красная проба → анализ → коммиты пакета по темам с `nova test` после каждого → продукт → `log.md`.

## Что осталось

- Ссылка без владельца на поле с двумя JSON-именами (`находки` в «Совещании»: `findings` и `lens_findings`) остаётся ошибкой; JSON-имя нелатинской вложенной машины берётся из реестра хозяина (`names_host.tsv`). → не нужно, потому что это уточнение к Методике, оно уходит ей в письме о готовности после задачи 152.
- `nova build` программ продукта против пакета 0.4 не проверен: сборка не читает локальный `[replace]`. → не нужно, потому что пакет публикуется один раз после задачи 152, сборку продукта проверит оркестратор после публикации.

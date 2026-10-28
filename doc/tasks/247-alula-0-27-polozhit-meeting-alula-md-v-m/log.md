2026-10-29 00:45 документ: задание заведено плагином: «Алула 0.27: положить meeting.alula.md в machines/methodology»; task/message.md — шаблон из полей задачи; основа — main 03e12d67
2026-10-29 00:45 пуск: запуск №1 исп [2026-10-29 00:45] — 247 исп «Алула 0.27: положить meeting.alula.md в machines/methodology продукта, чтобы cycle_check собирался и дерево пересобралос»

2026-10-29 00:53 документ: исполнение начато по заданию интегратора (`task/message.md`). Основа — main 03e12d67 (сдача 246). Программа — `alula 0.27.0 (Алула 0.27)` (сборка опубликованного пакета, метка v0.27.0 на 2a8960a4); скрипт — `tools/migrate-alula-227.py` пакета 0.27.0 (только чтение). Файл `meeting.alula.md` — из репозитория методики, коммит 1db4005 (`alula-machines/meeting.alula.md`, blob e7c87d86), только чтение. Пробная копия во временной папке: с `meeting.alula.md` рядом `alula compile cycle_check` собирает дерево, `alula test` — методика 514/514, продукт 81/81; `meeting.alula.md` один не собирается (примитивы хозяина не зарегистрированы в программе) — дерева у него нет и не будет, это вызываемая машина методики, а не таблица продукта; её подключения — те же библиотеки продукта (хеш «Паузы» `87162f9feb8c`, арифметики `34ef3ee7c00b`). Пересобранное дерево `cycle_check` отличается от коммитнутого: стороны `machine` — `input`/`callee_types` вместо прежнего `input_type`, в `types` — типы вызываемых (записей 18 вместо 10, вариантов 13 вместо 7).

2026-10-29 00:53 документ: **красная проба (первая запись работы):** критерий `accept-247` (скрипт вне репозитория, порядок воспроизведения — ниже) на коде до копии (03e12d67), папки `src/` пропущены (`ACCEPT_247_SRC=skip`) — красный, 6 красных:

```
КРАСНОЕ: machines/methodology/meeting.alula.md: нет или не равен файлу методики 1db4005
КРАСНОЕ: alula compile cycle_check: machines/methodology/cycle_check.alula.md:113:33: name: вызываемой машины `meeting` нет в реестре хозяина: файл машины с `machine: meeting` рядом с вызывающей (или в папке реестра); типы входа и итога берутся из неё (AL-146)
КРАСНОЕ: деревья не равны сборке
tree machines\methodology\cycle_check.alula.md: compile failed: … вызываемой машины `meeting` нет в реестре хозяина …
trees: 7 tables, differ 1
КРАСНОЕ: src доказывает отказ без meeting: 7 мест
КРАСНОЕ: src: «place of the owner (task 246)» осталось 10 мест
НЕ ПРИНЯТО 247 (6 красных): alula 0.27.0 (Алула 0.27); meeting нет; cycle_check не собирается; product 81 из 81; methodology 514 из 514; итог: файлов 0, мест 0; деревья не равны; отказов meeting в src 7; src: пропущено (ACCEPT_247_SRC=skip)
```

## Воспроизведение критерия accept-247

Нужны программа `alula` 0.27.0, исходники пакета 0.27.0 и репозиторий методики (оба только читать), настроенная среда Nova. Тяжёлые прогоны — через очередь машины.

1. `alula version`: `alula 0.27.0 (Алула 0.27)`.
2. `machines/methodology/meeting.alula.md` побайтно равен `git show 1db4005:alula-machines/meeting.alula.md` репозитория методики.
3. `alula compile machines/methodology/cycle_check.alula.md -o <temporary-tree> --force` — код 0.
4. `alula test machines/product` — 81/81; `alula test machines/methodology` — 514/514.
5. `python <package>/tools/migrate-alula-227.py --dry-run machines` — `итог: файлов 0, мест 0`.
6. Для каждой `machines/*/*.alula.md`, кроме `meeting.alula.md` (вызываемая методики: дерева нет и быть не должно): `alula compile` и сравнение разобранного JSON с соседним `.alula.json`; места владельца нет, допуск — только рукописный `chat` (строковые листья `name`, `party`, `bind`, `content`, `title`), как в 246.
7. В `src/` нет текста `нет в реестре хозяина` и пометки `place of the owner (task 246)`: тесты больше не доказывают отказ без `meeting`.
8. `nova test src/<folder> --jobs 2 --timeout 1800` для 22 папок задачи 246, не больше двух папок одновременно; красную перепроверить отдельно.

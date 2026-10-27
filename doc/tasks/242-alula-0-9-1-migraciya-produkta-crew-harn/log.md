2026-10-27 18:02 документ: задание заведено плагином: «Алула 0.9.1: миграция ПРОДУКТА (crew-harness) под новую Пауз»; task/message.md — шаблон из полей задачи; основа — main 9545279

2026-10-27 18:20 документ: исполнение начато по заданию интегратора (`task/message.md`). Пакет `alula` 0.9.1: метка v0.9.1, коммит 02589b40d9bc5f70caecbd19c7dadfca86d9303b (`git rev-parse v0.9.1^{commit}` в дереве пакета); пакет не правится — вершина v0.9.1 выгружена `git archive` во временную папку вне репозитория, оттуда скрипт `tools/migrate-alula-226.py` и файлы `libs/`; программа — собранная `alula 0.9.1 (Alula 2.26, machine/2)`. Набор машин методики (`alula-machines` её репозитория, на 2.26 пакета 0.9.0) только читается: критерий копирует его во временную папку, переносит копию скриптом 0.9.1 и гоняет её. Пробный прогон скрипта на копии `machines/`: «изменился бы» — `libs/pause.alula.md` и 5 таблиц методики, 5 мест «дерево» (пересборка `--alula`); таблицы продукта `chat`, `dialog` «Паузу» не подключают, скрипт их не меняет.

2026-10-27 18:20 документ: **красная проба (первая запись работы):** критерий `accept-242` (скрипт вне репозитория, текст — в конце журнала по сдаче) на коде до миграции (основа 91cb7d5), программа 0.9.1, папки `src/` пропущены (`ACCEPT_242_SRC=skip`) — красный, 24 красных. Программа 0.9.1 подключение «Паузы» 0.9.0 не собирает (`в ## Требует тип данного остановка называет параметр код_остановки`), поэтому методика — 0 из 514; деревья продукта расходятся со сборкой 0.9.1 (`$.includes[0].brings.signals: length 1 != 5`, `$.signals`):

```
КРАСНОЕ: machines/methodology/libs/pause.alula.md: не файл пакета 0.9.1
КРАСНОЕ: machines/methodology/libs/pause.en.alula.md: не файл пакета 0.9.1
КРАСНОЕ: machines/methodology/agent_step.alula.md: хеш «Паузы» не e7d85aa43589
КРАСНОЕ: machines/methodology/agent_step.alula.md: «Выход» без Пауза.причина == ПричинаПаузы.Остановлена
КРАСНОЕ: machines/methodology/agent_step.alula.md: «Выход» без Пауза.причина == ПричинаПаузы.Отменена
  (и так для cycle_check, dialog_steps, session_start, task_runner)
tree machines\methodology\agent_step.alula.md: compile failed: … в библиотеке Пауза (libs/pause.alula.md:20): в `## Требует` тип данного `остановка` называет параметр `код_остановки` библиотеки … (раздел 9)
tree machines\product\chat.alula.json differs from the build (2 places), first: $.includes[0].brings.signals: length 1 != 5; $.signals: length 1 != 5
tree machines\product\dialog.alula.json differs from the build (2 places), first: $.includes[0].brings.signals: length 1 != 5; $.signals: length 1 != 5
trees: 7 tables, differ 7
КРАСНОЕ: деревья не равны сборке
КРАСНОЕ: nova.toml: alula не 0.9.1
КРАСНОЕ: nova.lock.toml: alula не 0.9.1 / 02589b4
НЕ ПРИНЯТО 242 (24 красных): product 81 из 81; methodology 0 из 514; набор методики 508 из 508; старых форм 55; деревья не равны; пин не 0.9.1; src: пропущено (ACCEPT_242_SRC=skip)
```

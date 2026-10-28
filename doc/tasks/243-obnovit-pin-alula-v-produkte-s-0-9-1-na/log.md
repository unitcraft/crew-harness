2026-10-28 17:47 документ: задание заведено плагином: «Обновить пин alula в продукте с 0.9.1 на 0.9.2 (тег v0.9.2, »; task/message.md — шаблон из полей задачи; основа — main 4fca4c8

2026-10-28 18:05 документ: исполнение начато по заданию интегратора (`task/message.md`). Пакет `alula` 0.9.2: метка v0.9.2, коммит e69d729dae150e77d77b75e0f86bd5575ba68458 (`git rev-parse v0.9.2^{commit}` в дереве пакета); от v0.9.1 отличается одной строкой `| причина | reason |` в `## Имена` файла `libs/pause.alula.md` (хеш e7d85aa43589 → ff49cbe958c1; `libs/pause.en.alula.md` прежний, d254e6297f61). Пакет не правится: вершина v0.9.2 выгружена `git archive` во временную папку вне репозитория. Код программы в v0.9.2 не менялся (`PROGRAM_VERSION` по-прежнему `0.9.1`), библиотеки программа читает из `libs/` рядом с машиной, поэтому программа — собранная `alula 0.9.1 (Alula 2.26, machine/2)`.

2026-10-28 18:05 документ: **красная проба (первая запись работы):** критерий `accept-243` (скрипт вне репозитория, порядок воспроизведения — ниже) на коде до правки (основа 9453dfe), папки `src/` пропущены (`ACCEPT_243_SRC=skip`) — красный, 16 красных. Таблицы и деревья на 0.9.1 проходят свои тесты, но библиотека — не файл 0.9.2, подключения называют хеш 0.9.1, пин — 0.9.1:

```
КРАСНОЕ: machines/methodology/libs/pause.alula.md: не файл пакета 0.9.2
КРАСНОЕ: machines/methodology/agent_step.alula.md: хеш «Паузы» не ff49cbe958c1
  (и так для cycle_check, dialog_steps, session_start, task_runner и копии образца agent-step-sample.txt)
КРАСНОЕ: machines/methodology/agent_step.alula.json: хеш «Паузы» в подключении дерева не ff49cbe958c1
  (и так для cycle_check, dialog_steps, session_start, task_runner)
КРАСНОЕ: хеш e7d85aa43589 остался: 11 мест
trees: 7 tables, differ 0
КРАСНОЕ: nova.toml: alula не 0.9.2
КРАСНОЕ: nova.lock.toml: alula не 0.9.2 / e69d729
НЕ ПРИНЯТО 243 (16 красных): product 81 из 81; methodology 514 из 514; хешей e7d85aa43589 11; деревья равны; пин не 0.9.2; src: пропущено (ACCEPT_243_SRC=skip)
```

## Воспроизведение критерия

Нужны программа `alula` (сборка пакета; v0.9.2 печатает `alula 0.9.1 (Alula 2.26, machine/2)`), файлы пакета на `v0.9.2` (только читать) и настроенная среда Nova. Тяжёлые прогоны — через очередь машины.

1. `alula version`: `alula 0.9.1 (Alula 2.26, machine/2)`; хеш `libs/pause.alula.md` пакета — ff49cbe958c1, `libs/pause.en.alula.md` — d254e6297f61.
2. `alula test machines/product` — 81/81; `alula test machines/methodology` — 514/514.
3. `python <package>/tools/migrate-alula-226.py --dry-run machines` — `итог: файлов 0, мест 0`. Обе библиотеки `pause` равны файлам пакета 0.9.2; в каждой таблице методики, подключающей `libs/pause.alula.md` (и в копии образца `agent-step-sample.txt`), строка `- Хеш: ff49cbe958c1`; в подключении `pause` их деревьев — `"hash":"ff49cbe958c1"`; хеш e7d85aa43589 в `machines/` и `src/` не встречается.
4. Для семи `machines/*/*.alula.md`: `alula compile <table> -o <temporary-tree> --force`; разобранный JSON равен соседнему `.alula.json` (для рукописного `chat` — с допуском строковых листьев `name`, `party`, `bind`, `content`, `title`, как в задаче 242).
5. `nova.toml` — alula 0.9.2; запись `alula` в `nova.lock.toml` — версия 0.9.2, pin `version:>=0.9.2, <0.10.0`, commit `e69d729dae150e77d77b75e0f86bd5575ba68458`.
6. `nova test src/<folder> --jobs 2 --timeout 3600` для 22 папок задачи 242 (`machines machine_registry machine_agent machine_agent_en machine_cycle machine_dialog machine_chat alula_eq_machines alula_tests_machines alula_cli_machines machine_text_machines machine_text_eq_machines machine_text_render_machines machine_session machine_dialog_eq machine_nested_eq machine_nested_run machine_run_machines machine_table_machines machine_runner chat server`); красную перепроверить отдельно.

Статус: в работе

# 005 — Ускорить вливание задач: слот при принятии, предпроверка без замка, дополнительные поля задачи — result (Сессия С5, 2026-10-08)

Журнал запусков ведётся ниже по шагам. Тесты — только отдельными файлами, по одному, с паузой 5 с; `npm test` целиком не запускался (только в строках «не запускался»).

## Ревизия и база

- Ветка: `task-005-faster-landing`, связанное рабочее дерево рядом с основной копией (путь машины не записывается). Основная копия `main` — только чтение.
- `BASE` = `868023440170ea0e6a0926da1cb5a76459c301f5` (`git merge-base main task-005-faster-landing` на момент создания ветки; `main` — коммит «Fix window crash on verb input»).
- База плана (вторая строка plan.md): `22af5f12c2604f4762425d3c3dc9589fa0a15578`. `main` с тех пор ушёл на семь коммитов. Сравнение по файлам плана: `git diff --stat 22af5f1..868023440170 -- opencode-plugin` затрагивает `config-schema.ts` (в двух строках справочника профилей моделей — ссылка на раздел README, плюс строка импорта `paths.ts`), `paths.ts` (константа), `tui.ts`, `sidebar.tsx`, `progress-sidebar.tsx`, `dialog-*.ts*`, `profile-cmd.ts` и тесты окна. Ключи 005 добавляются в конец групп схемы, строки профилей не пересекаются; файлы, которые 005 не правит (DNC-03, DNC-11), в это сравнение попали, но предел «от `$BASE`» считается от записанного значения. Вывод: пересечения по смыслу нет, остановка «ревизия» не нужна (план сам велит считать `$BASE` в момент создания ветки и перечитывать места по имени функции).
- Окружение: Node v24.15.0, git 2.56.0, Python 3.14.4.
- Деревья других задач — только чтение (`git worktree list`); задача 007 правит те же `core.ts`, `index.ts`, `config-schema.ts`, `tasks.ts`: правки 005 локальные и в концах своих разделов.

## Базовое состояние (шаг 1)

Прежние самотесты по одному до первого среза (`node test/<файл>.test.mjs` из `opencode-plugin/`, пауза 5 с между запусками; `node test/cleanup-tmp.mjs` перед серией):

| Тест | ячеек ok | упало | пропущено | время, с | итоговая строка |
|---|---|---|---|---|---|
| crew-review | 52 | 0 | 0 | 23 | `crew-review.test ok` |
| crew-flowwatch | 13 | 0 | 0 | 5 | `crew-flowwatch.test ok` |
| crew-tasks | 28 | 0 | 0 | 12 | `crew-tasks.test ok` |
| crew-place | 8 | 0 | 0 | 4 | `crew-place.test ok` |
| crew-cfgtool | 17 | 0 | 0 | 14 | `crew-cfgtool.test ok` |
| crew-help | 32 | 0 | 0 | 0 | `crew-help.test ok` |
| crew-plan-task | 33 | 0 | 0 | 17 | `crew-plan-task.test ok` |
| crew-profiles-select | 54 | 0 | 0 | 70 | `crew-profiles-select.test ok` |
| crew-profiles-config | 31 | 0 | 0 | 9 | `crew-profiles-config.test ok` |
| crew-profiles-docs | 27 | 0 | 0 | 0 | `crew-profiles-docs.test ok` |
| crew-acceptor | 25 | 0 | 0 | 12 | `crew-acceptor.test ok` |
| crew-restart | 13 | 0 | 0 | 6 | `crew-restart.test ok` |
| crew-plans | 15 | 0 | 0 | 0 | `crew-plans.test ok` |
| crew-autoclose | 8 | 0 | 0 | 1 | `crew-autoclose.test ok` |

- `sh scripts/guards/run-all.sh` на базе (дерево ветки без правок кода, с новым ADR и тестами шага 1): `итого: ок 7, судить нечего 0, пропущено 0, FAIL 0`.
- В `main` 47 файлов `*.test.mjs` (число «37» в AGENTS п.7 устарело уже на базе и этой задачей не правится).

## Журнал запусков

шаг 1: сделан, ветка и дерево созданы, `BASE` записан, базовое состояние четырнадцати тестов и `run-all.sh` снято (таблица выше); `node test/landing-golden.mjs --write` записал снимок 18 текстов до правок ядра (отказ `crew_spawn` по лимиту, `list`, `show` для пяти задач, письма `formatTaskLetter`, `planTaskLetter`, `reviewLetter`, `planMergeLetter`, напоминания приёмщику и автору); `node test/landing-golden.mjs --check` — `golden ok (18 texts)`; `--check --defaults` — `golden ok (18 texts, default values of the new keys set)`; `node test/crew-landing-golden.test.mjs` — `crew-landing-golden.test ok`, 2 ячейки ok и одна `skip AC-01 значения по умолчанию: ключей ещё нет` (включается сама, когда в схеме появляется `accepted_slot`); контроль: копия снимка с испорченной строкой даёт `golden differs: letter reviewLetter #2` и код 1; `guard-secrets.py --tree` — ок (в снимке только маркер `<TMP>`). Коммит `34342bb`
шаг 2: сделан, `doc/canon/decisions/ADR-0009-merge-precheck-without-lock.md` (Статус: предложено, 2026-10-08; пять решений, 11 вариантов — `grep -c "^[0-9]\. \*\*"` печатает 11) и строка в реестре (`grep -c merge-precheck-without-lock doc/canon/decisions/README.md` — 1); `python scripts/guards/check-md-links.py` — ок, `guard-secrets.py --tree` и `check-private-names.py` — ок. Коммит `4cbd0ef`, раньше коммита шага 3
шаг 3: сделан, `config-schema.ts` (вид `extraFields`, `RESERVED_FIELD_IDS`, `EXTRA_ID_RE`, четыре ключа: `accepted_slot`, `cleanup_limit`, `task_extra_fields` — после `default_priority`, `merge_precheck` — после `cleanup`; `invalid` для `extraFields`), `core.ts` (`CrewConfig`: `acceptedSlot`, `cleanupLimit`, `mergePrecheck`, `extraFields`; `extraFieldsOf` — терпимый разбор; отдельная строка импорта из `config-schema.ts`, чтобы не менять существующую), `node test/crew-landing-config.test.mjs` — `crew-landing-config.test ok`, 15 ячеек (`AC-25 отказы`, `AC-25 записи читаются`, `AC-25 guide`, сверка зарезервированных `id` с полями входа `crew_spawn`); `crew-landing-golden` теперь 3 ячейки ok (вторая, `AC-01 значения по умолчанию`, включилась сама — ключ появился в схеме; правка теста не потребовалась); по одному: `crew-cfgtool` 17 ok, `crew-config` 10 ok, `crew-profiles-config` 31 ok, `crew-help` 32 ok — как в базе. `git show -U0 | grep '^-[^-]'` по коммиту пуст (удалённых строк нет). Коммит `57ceb1c`
шаг 4: сделан, `tasks.ts` (`countedOpen`, `waitingCleanup`; `OPEN_STATUSES`, `isOpen`, `WORKING_STATUSES` не тронуты — `git diff "$BASE" -- opencode-plugin/tasks.ts | grep -E '^[-+].*(OPEN_STATUSES|WORKING_STATUSES|export const isOpen)'` пуст), `core.ts` (`crew_spawn`: счёт через `countedOpen`, отказ по `cleanup_limit`, ветка `free` перед старой строкой отказа; `taskRow` — « — ждёт уборки»), `index.ts` (шаги авто-плана, письма напоминания при `free`); `node test/crew-landing-slot.test.mjs` — `crew-landing-slot.test ok`, 24 ячейки (`AC-02`, `AC-03 c1…c5`, `AC-04`, `AC-05`, `AC-06`); по одному как в базе: `crew-landing-golden` 3 ok, `crew-flowwatch` 13, `crew-tasks` 28, `crew-plan-task` 33, `crew-place` 8, 0 упавших; `landing-golden --check` и `--check --defaults` — `golden ok`. Удалены в `core.ts` ровно две строки (`taskRow`, `if` лимита), в `index.ts` — строки счёта слота и письма напоминания.

## Точка остановки (передача)

Остановка по слову координатора: владелец продолжит реализацию сам. Сделаны шаги 1–4 (коммиты в ветке `task-005-faster-landing`), ничего не отправлено (пуш — только Г1/Г2 по слову владельца). Следующий шаг — 5 (дополнительные поля задачи: `extra`, `parseExtra`, `extraBlock`, `review.ts` `reviewLetter`, `crew-landing-extra.test.mjs`). Зелёные: `crew-landing-golden`, `crew-landing-config`, `crew-landing-slot`, `crew-cfgtool`, `crew-config`, `crew-profiles-config`, `crew-help`, `crew-flowwatch`, `crew-tasks`, `crew-plan-task`, `crew-place`. Не запускались: остальные прежние тесты из регрессии (`crew-review`, `crew-acceptor` и др. — после шагов 8, 11, 13). Вспомогательные скрипты запуска лежат вне репозитория.

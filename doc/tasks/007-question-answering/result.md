Статус: в работе

# 007 — Кто отвечает на вопросы сессий: владелец, по рекомендациям — result (Сессия С5, 2026-10-09)

Журнал запусков ведётся ниже по шагам. Тесты — только отдельными файлами, по одному, с паузой 10 с между файлами; `npm test` целиком не запускался; процессы OpenCode и служба не останавливались и не перезапускались. Задержка службы («loop lag» в журнале службы) за время работы не превышала 4,7 с.

## Ревизия и база

- Ветка: `task-007-question-answering`, связанное рабочее дерево рядом с основной копией (путь машины не записывается), создано от `origin/main` (по слову владельца: задача 005 влита в `main`, коммит `40e78c3`). Основная копия `main` — только чтение.
- `BASE` = `40e78c388e49de85a8d22e5a87135718af54def7` (`git merge-base origin/main task-007-question-answering` на момент создания ветки). Команды DoD «пусто» и «только эти файлы» считаются от этого значения, пересчитываются после каждого ребейза.
- База плана (вторая строка plan.md): `d385553734aee1c0455ab5e06679556a393f17fe`. Сравнение: `git diff --name-only d385553 HEAD -- <файлы плана>` непусто: `config-schema.ts`, `core.ts`, `index.ts`, `review.ts`, `tasks.ts`, `package.json`, `README.md` плагина, `test/README.md`, `doc/canon/decisions/README.md`. Это ровно содержимое влитой задачи 005 (ключи схемы `accepted_slot`, `cleanup_limit`, `merge_precheck`, `task_extra_fields`, `precheck.ts`, ADR-0009, правки `core.ts` и `index.ts` в местах далеко от `nudge` и `syncStatus`), которое план описывает в разделе «Порядок слияния» (пересечения и приём «вторая задача ребейзит и пересъёмает снимки»). `status.ts`, `settings.ts` и `doc/canon/process.md` с базы плана не менялись. Снимок текстов базы (шаг 1) снят уже на новой базе `40e78c3`, то есть с ключами 005. Остановка «ревизия» не наступила: расхождение предусмотрено планом и словом владельца в задании сессии. Номера строк кода в плане дрейфуют (поиск по имени, как сказано в плане): `syncStatus` теперь `index.ts:764`, `userAfter` `core.ts:586`, `turnEnd` `core.ts:651`, `HELP` `core.ts:1021`, `endsWithQuestion` `status.ts:57`.
- Окружение: Node v24.15.0, git 2.56.0, Python 3.14.4. Хуки git установлены (`core.hooksPath` = `scripts/githooks`).
- Деревья других задач — только чтение (`git worktree list`): `task-005-faster-landing` (влита, `40e78c3`), `task-013-runner-core`, `config-model-profiles`.

## Базовое состояние (шаг 1)

Прежние самотесты по одному до первого среза кода (`node test/<файл>.test.mjs` из `opencode-plugin/`, пауза 10 с между запусками; `node test/cleanup-tmp.mjs` перед серией), ревизия `40e78c3` плюс файлы шага 1 (кода ядра не тронуто):

| Тест | ячеек ok | упало | пропущено | время, с | итоговая строка |
|---|---|---|---|---|---|
| crew-status | 12 | 0 | 0 | 4 | `crew-status.test ok` |
| crew-stuck | 3 | 0 | 0 | 5 | `crew-stuck.test ok` |
| crew-push | 45 | 0 | 0 | 27 | `crew-push.test ok` |
| crew-cfgtool | 17 | 0 | 0 | 13 | `crew-cfgtool.test ok` |
| crew-config | 10 | 0 | 0 | 2 | `crew-config.test ok` |
| crew-help | 32 | 0 | 0 | 1 | `crew-help.test ok` |
| crew-settings | 20 | 0 | 0 | 14 | `crew-settings.test ok` |
| crew-sidebar | 22 | 0 | 0 | 1 | `crew-sidebar.test ok` |
| crew-profiles-docs | 27 | 0 | 0 | 1 | `crew-profiles-docs.test ok` |
| crew-plans | 15 | 0 | 0 | 0 | `crew-plans.test ok` |

- `sh scripts/guards/run-all.sh` на базе с файлами шагов 1 и 2: `итого: ок 7, судить нечего 0, пропущено 0, FAIL 0`.
- В `main` 57 файлов `*.test.mjs` (число «37» в AGENTS п.7 устарело, этой задачей не правится).

## Журнал запусков

шаг 1: сделан, ветка и дерево созданы от `origin/main` @ `40e78c3`, `BASE` записан, базовое состояние десяти прежних тестов и `run-all.sh` снято (таблица выше); `test/answer-harness.mjs` (общий каркас: ящик во временной папке, настоящая sqlite-база `session_v2` и `session_message`, фальшивый хост, окно с вкладками, записи ходов `turn`, письма и уведомления из ящика), `test/answer-golden.mjs` (11 текстов базы: уведомление «ждёт вас» вкладки владельца и его повтор, письмо пересылки вопроса сессии задачи `ask-…`, `/crew` и боковая панель для четырёх состояний, `crew_config guide` и `show`, `crew_help`, `formatLetters`; в `guide` и `show` строки ключей `answer_*`, заголовок группы «ОТВЕТЫ НА ВОПРОСЫ» и пустая строка перед ним исключаются при сравнении), `node test/answer-golden.mjs --write` записал `test/answer-golden.json` до правок ядра и тот же снимок как `test/answer-golden-base.json` (для прогона 0 доказательства красного); `node test/answer-golden.mjs --check` и `--check --owner` печатают `golden ok`; `test/crew-answer-golden.test.mjs` (ячейки `AC-01 без ключей`, `AC-01 owner во всех типах` — пропуск `skip: ключей ещё нет` до шага 3, `AC-01 control`) печатает `crew-answer-golden.test ok`; три ячейки и снимок не содержат путей машины (`guard-secrets.py --tree` — ок).
шаг 2: сделан, `doc/canon/decisions/ADR-0010-question-answering-modes.md` (Статус: предложено, 2026-10-09; пять решений, 13 вариантов — `grep -c "^[0-9]\. \*\*"` печатает 13) и строка 0010 в реестре (`grep -c question-answering-modes doc/canon/decisions/README.md` — 1); `python scripts/guards/check-md-links.py` — ок, `guard-secrets.py --tree` — ок, `check-private-names.py` — ок. Остановка у ворот Г0: ADR-0010 принимает владелец; шаги 3–13 не начаты.

## Открытое

- Ворота Г0: принятие ADR-0010 владельцем (правка первой строки на «Статус: принято, <дата>, владелец» и статуса в строке 0010 реестра отдельным коммитом `ADR: accept question answering modes (owner, <дата>)` — по слову владельца).

Остановка у ворот Г0 (не «ревизия», «план», «требования» и не «вопрос»): ждёт принятия ADR-0010 владельцем; шаги 3–13 не начаты.

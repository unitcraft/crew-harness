Статус: готово

# 005 — Ускорить вливание задач: слот при принятии, предпроверка без замка, дополнительные поля задачи — result (Сессия С5, 2026-10-08)

Журнал запусков ведётся ниже по шагам. Тесты — только отдельными файлами, по одному, с паузой 5 с; `npm test` целиком не запускался (только в строках «не запускался»).

## Ревизия и база

- Ветка: `task-005-faster-landing`, связанное рабочее дерево рядом с основной копией (путь машины не записывается). Основная копия `main` — только чтение.
- `BASE` = `868023440170ea0e6a0926da1cb5a76459c301f5` (`git merge-base main task-005-faster-landing` на момент создания ветки; `main` — коммит «Fix window crash on verb input»).
- База плана (вторая строка plan.md): `22af5f12c2604f4762425d3c3dc9589fa0a15578`. `main` с тех пор ушёл на семь коммитов. Сравнение по файлам плана: `git diff --stat 22af5f1..868023440170 -- opencode-plugin` затрагивает `config-schema.ts` (в двух строках справочника профилей моделей — ссылка на раздел README, плюс строка импорта `paths.ts`), `paths.ts` (константа), `tui.ts`, `sidebar.tsx`, `progress-sidebar.tsx`, `dialog-*.ts*`, `profile-cmd.ts` и тесты окна. Ключи 005 добавляются в конец групп схемы, строки профилей не пересекаются; файлы, которые 005 не правит (DNC-03, DNC-11), в это сравнение попали, но предел «от `$BASE`» считается от записанного значения. Вывод: пересечения по смыслу нет, остановка «ревизия» не нужна (план сам велит считать `$BASE` в момент создания ветки и перечитывать места по имени функции).
- Второй ребейз (С5д, 2026-10-09, шаг 13): `origin/main` @ `e606a43`, `BASE` = `e606a436e16b9731bd2e4f3335598a8c89e38239`; без конфликтов, `range-diff` — 24 из 24 коммита `=`. Первая новая база (после шагов 1–4) — ниже.
- Новая база (С5д, 2026-10-09): ребейз ветки на `origin/main` @ `1af4f92` прошёл без конфликтов (семь коммитов 005 перенесены; хеши изменились, `range-diff` см. шаг 13). `BASE` = `1af4f92eca7cb1c204886e60cd51b39739d4114a` (`git merge-base origin/main HEAD`); команды DoD «пусто» и «только эти файлы» считаются от него. Между старой и новой базой в `opencode-plugin` изменился только `tui.ts` (11 строк) и тест окна `crew-instant-commands.test.mjs`; остальное — документы задач 007…011. Запись `BASE` выше (`868023440170`) — база шагов 1–4 до ребейза. ADR-0009 по-прежнему свободный номер на `main`.
- Третий ребейз (С5п, 2026-10-09): `origin/main` @ `d56267e` (ушёл только материалом задач, `opencode-plugin`, `scripts`, `doc/canon` не менялись), `BASE` = `d56267e88af7fed0d117e57605543d76446f35e4`; без конфликтов, 29 коммитов перенесены; тесты затронутых файлов прогнаны до ребейза на том же коде плагина.
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
шаг 5: сделан, `tasks.ts` (`Task.extra`), `core.ts` (вход `extra` в общей схеме `taskInput`; `parseExtra`, `extraBlock`, `EXTRA_VALUE_MAX`; вызов в `crew_spawn` сразу после проверки обязательных полей и в `assign`; отказ `extra` у `order`; блок в `formatTaskLetter`, `planTaskLetter` (РП-11) и `crew_task show`), `review.ts` (`reviewLetter`: блок и строка «ЗАПИСЬ ЗАДАЧИ: <путь файла>, поле extra»; правки только в строке импорта и ниже блока замка); `node test/crew-landing-extra.test.mjs` — `crew-landing-extra.test ok`, 22 ячейки (`AC-23 c1…c5`: 5 строк по маске `AC-23 c`, плюс `AC-23 assign c1`, `без extra`, `граница`, `order`; `AC-24`: 7 строк по маске — исполнитель, приёмщик, путь файла (проба читает `extra` из файла по пути письма), `show`, `reassign`, `без extra` (письма с пустым и отсутствующим `extra` равны письмам с вырезанным блоком), `план`; `REQ-18 порядок`, `REQ-18 подпись`; `REQ-24 old record`); по одному: `crew-tasks` 28 ok за 12 с, `crew-review` 52 ok за 26 с, `crew-plan-task` 33 ok за 27 с, `crew-profiles-docs` 27 ok за 1 с, 0 упавших; `landing-golden --check` и `--check --defaults` — `golden ok (18 texts)`. Отступление от плана: в схеме входа `extra` описан один раз в общем `taskInput`, поэтому поле видно и в `crew_task` (нужно для `assign`; `order` отказывает текстом). Коммит `a80d126`
шаг 6: сделан, `precheck.ts` (новый: `runGit` — локальное чтение git, `hasOrigin` по коду `git remote get-url origin` (0 — есть, 2 — нет, иное — сбой), `originTip` — `ls-remote` через `spawn` со своим сроком 20 с, `killTree` по номеру запуска (Windows `taskkill /T /F /PID`, POSIX — группа); `TIP_TIMEOUT_MS`), `review.ts` (только `export` у `repoDir`); отступление от плана: `git remote get-url` читается синхронно через `runGit` (локальная настройка, сети нет), асинхронным остаётся только `ls-remote`; `node test/crew-landing-tip.test.mjs` — `crew-landing-tip.test ok`, 25 ячеек, около 70 с (сами сетевые случаи идут параллельно, самый долгий 20,8 с, всего 23 с): `AC-32` (полный хеш, без кеша, `target_branch`, точное имя, ветки нет, нет origin, нет origin и ветки, недоступен, код 128), `AC-20 tip` (ссылки, размер объектов, нет `FETCH_HEAD`), `AC-11` шесть случаев (нет адреса 15,7 с, закрытый порт 5,2 с, молчит http 15,7 с, молчит https 20,3 с, недоступный адрес 15,8 с, ssh 20,3 с; ssh установлен) — у каждого сбой с текстом и «процессов git с этим адресом: 0» по списку процессов с условием на имя `git*`; ячейка контроля показывает, что список видит ждущий `git` и что `killTree` по номеру снимает дерево; зависание «закрытого порта» и «недоступного адреса» воспроизвелось по-разному на этой машине (закрытый порт отвечает отказом за 5 с, остальные доходят до срока git 15 с или плагина 20 с) — РП-07 вариант 1 не понадобился. Проба: `originTip` по публичному `https://github.com/unitcraft/crew-harness.git` ветка `main` вернул `1af4f92eca7cb1c204886e60cd51b39739d4114a` за 1,0 с (совпало с `origin/main`). Список процессов до и после теста не содержит чужих остановок: тест убивает только свой запуск по номеру. Коммит см. `git log` (`Precheck: read the tip …`)
шаг 7: сделан, `tasks.ts` (`PrecheckRecord`, `Task.precheck`), `precheck.ts` (`seams` — пустой объект, `beginPrecheck`, `finishPrecheck`, `unlockMerge`, `markPrecheckStale`, `roundOf`, `isLive`, `neighbourHints` — пока пустая строка до шага 9), `core.ts` (действия `precheck`, `unlock` в перечне и описании, поле `candidate`, оба списка прав расширены, вызовы `markPrecheckStale` в `review` из `submitted`, `rework` (в том числе `sync`), `cancel`, `reassign`); общий каркас тестов `test/landing-harness.mjs` (поддельный хост, настоящий git, локальный `origin`, второй клон, вкладки приёмщиков; без `.test.` в имени, `npm test` его не берёт); `node test/crew-landing-precheck.test.mjs` — `crew-landing-precheck.test ok`, 38 ячеек, около 100 с (`AC-10 a…f` шесть, `AC-12` две, `AC-13 a…h` восемь, `AC-14 a…e` пять, `AC-33` две, `AC-34` две, `AC-36 a, b, c, d1, d2` пять, `AC-32 precheck`, `REQ-24 old record` две, `REQ-06` три); по одному: `crew-review` 52 ok за 33 с, `crew-acceptor` 25 ok за 16 с, `crew-plans` 15 ok, 0 упавших; `git diff origin/main -- review.ts` не содержит строк замка (0). Отступление от плана: отказ «`precheck` вне статуса `reviewing`» стоит перед отказом «записи нет», поэтому ячейка `AC-10 f` (устаревшая запись) делает запись устаревшей через `unlock`, а не через `rework`. Коммит см. `git log` (`Precheck and unlock: record, rights, staleness`)
шаг 8: сделан, `precheck.ts` (`gateMerge` по десяти шагам плана; однострочные сверки с маркерами `GATE:same-tip` (`sameTip`), `GATE:green` (`isFresh`), `GATE:recheck` (`recordUnchanged`), `GATE:lock` (`lockStillMine`); `acceptedTip`), `core.ts` (`merge`: при `required` блок с `gateMerge` стоит перед прежними строками `takeMergeLock`, которые не тронуты и работают при `off`; `accept`: `accepted_on` и строка истории «принята на …», только если у задачи есть запись предпроверки); `node test/crew-landing-gate.test.mjs` — `crew-landing-gate.test ok`, 38 ячеек, 291 с (`AC-07` две, `AC-08 a, b, b2, c`, `AC-09`, `AC-09 новый precheck`, `AC-09 занят`, `AC-12 merge off`, `AC-11 merge закрытый порт` и `молчит` (21,5 с, процессов git с адресом 0), `AC-20 сбой`, `AC-20`, `AC-32 merge` две, `AC-15`, `AC-17`, `AC-34` две, `AC-35 c1, c2, c3, c4, c4b, c5, c6a, c6b, c7` — девять, `AC-37 c1, c1 перехват, c2, c3`, `AC-14 merge a…e`); по одному: `crew-landing-precheck` 38 ok (после правки каркаса), `crew-review` 52 ok, `crew-flowwatch` 13 ok, `crew-acceptor` 25 ok, 0 упавших; `grep -n "seams\." *.ts` вне `precheck.ts` пусто; `git diff origin/main -- review.ts` не содержит строк замка (0). Каркас теста: перед каждым вызовом инструмента обновляется отметка окна (`beat`), потому что синхронные операции git теста на несколько секунд задерживают таймер, и держатель с «мёртвым» окном считался бы брошенным (в первом прогоне `AC-09 занят` упал именно так; это свойство теста, не кода). Коммит см. `git log` (`Merge gate: lock only on the tip that was green`)
шаг 9: сделан (РП-06 вариант 1), `precheck.ts` (`neighbourHints` — только чтение журнала задач: «параллельно идут» и «после зелёной приняты»; `acceptWarning`), `core.ts` (`accept`: `const warn = …` после проверки `isMerged`, приписан к двум `return` с `finishCleaned` и «принята …», отдельная строка истории «предупреждение: …»; `show`: подсказка соседей у задачи с действующей записью); `node test/crew-landing-hints.test.mjs` — `crew-landing-hints.test ok`, 9 ячеек, 74 с (`AC-21 без предупреждения`, `AC-21`, `AC-21 off`, `AC-22 идут`, `AC-22 show`, `AC-22 идут зелёная`, `AC-22 никого`, `AC-22 после зелёной`, `AC-22 после зелёной (нет)`); по одному `crew-review` 52 ok, 0 упавших; команда DNC-09 из DoD (диапазон `accept` и `cleaned` по `$BASE`) печатает `ok` (удалены ровно два `return`); в `precheck.ts` слов «queue», «очередь», «очередной» нет. Находка при написании теста: кандидат, собранный слиянием ветки задачи в вершину `origin/main` без расхождений, совпадает с веткой задачи (перемотка), поэтому ячейка с предупреждением собирает кандидата с собственным коммитом. Коммит см. `git log` (`Precheck: accept warning and neighbour hints`)
шаг 10: сделан, `precheck.ts` (`precheckLines(t, session)` — строки «предпроверка: идёт/зелёная/устарела …» и «замок вливания: твой с … на вершине …» / «замок: нет» / «у другого приёмщика»; пусто, если записи нет; `show` шага 11 берёт её же), `index.ts` (письмо «работа прервана перезапуском» получает строки состояния; одна строка импорта, одна строка `const pre = …`, правка строки `text`); каркас `test/landing-harness.mjs` расширен режимом `attach` (второй экземпляр плагина в дочернем процессе на тех же папках) и базой OpenCode для прерванных ходов; `test/landing-child.mjs` (дочерний процесс: готов → ждёт файл `go` → вызывает `crew_task` → печатает `RESULT`); `node test/crew-landing-race.test.mjs` — `crew-landing-race.test ok`, 14 ячеек, 113 с: `AC-16 держатели живые` (замок каждой из 8 сессий не считается брошенным), `AC-16 раунд 1…5` (8 процессов, ровно один победитель, остальные 7 получили отказ с именем держателя), `AC-18 раунд 1…5` (замок старше 2 ч, 7 процессов, один победитель в каждом из пяти раундов; двойной победитель (Н-03) за пять раундов не воспроизвёлся — вывод «не воспроизведён» не значит «невозможен»), `AC-19 accept` (замок взят одним процессом, `accept` проходит в другом), `AC-19 merge` (после «перезапуска» повтор на сдвинутой вершине отказан, запись устарела), `Г-7` (пустая запись задачи — отказ, замка нет); `node test/crew-landing-letters.test.mjs` — `crew-landing-letters.test ok`, 2 ячейки, 68 с (`AC-19 письмо`, `AC-19 письмо без записи`: письмо без записи прежнее); по одному `crew-restart` 13 ok, `crew-profiles-docs` 27 ok, 0 упавших. Находка при отладке: синтетическая задача без `review_qid` (в каркасе теста) давала обязательство без `qid`, и напоминание падало на `safeKey(undefined)`; в настоящей задаче `review_qid` ставится при назначении приёмщика, поэтому каркас теперь ставит его сам; в коде плагина ничего не менялось по этой причине. Коммит см. `git log` (`Races and restart: …`)
шаг 11: сделан, `review.ts` (`reviewLetter`: при `required` шаг «ПРЕДПРОВЕРКА» перед «нашёл ошибки» и `merge`, нумерация без разрыва, слова о том, что замок выдаётся на проверенную вершину; при `free` фраза «ПОСЛЕ ПРИНЯТИЯ … ждущих уборки N из M» («N, предела нет» при `cleanup_limit: 0`); `planMergeLetter`: тот же шаг предпроверки; правки — строка импорта и ниже блока замка), `core.ts` (`show` — строки `precheckLines`; описание `crew_task` и `crew_spawn` по-английски: `precheck`, `unlock`, `candidate`, `extra`, флаги; раздел «ПРИЁМКА» в `HELP` — абзац «ПРЕДПРОВЕРКА ВЛИВАНИЯ» и про `accepted_slot`, `cleanup_limit`, `task_extra_fields`), `README.md` плагина («Review and merge»: три флага, абзацы «After the landing» и «If something goes wrong»; сигнатура `crew_spawn` с `extra?`), `test/README.md` (десять строк), `package.json` (`scripts.test`: десять имён в конец); `node test/crew-landing-letters.test.mjs` — `crew-landing-letters.test ok`, 19 ячеек, 79 с (`AC-19 письмо` две, `AC-31` одиннадцать: по умолчанию побайтно, required и порядок, план, нумерация, free, free без предела, оба, show шести видов, `AC-26` три: описание `crew_task`, описание `crew_spawn`, `HELP`); по одному: `crew-help` 32 ok, `crew-review` 52 ok, `crew-flowwatch` 13 ok, `crew-profiles-docs` 27 ok, 0 упавших; `node test/landing-golden.mjs --check` — `golden ok (18 texts)` (письма при значениях по умолчанию побайтно прежние); `python scripts/guards/check-md-links.py` — ок; `grep -c` по README — 12 строк (≥5). Два коммита: `Review letters, show, help and README: precheck, free slot, extra fields` и `Tests: register the landing tests`
шаг 12: сделан, маркеры `GATE:same-tip`, `GATE:green`, `GATE:recheck`, `GATE:lock` в `precheck.ts` — по одной строке (`node test/landing-red.mjs --markers-only` — `markers ok`); `test/landing-red.mjs` копирует `opencode-plugin/*.ts` и `package.json` во временную папку, заменяет одну строку по маркеру заглушкой `=> true` и запускает `crew-landing-gate.test.mjs` на копии (`CREW_PLUGIN_DIR`, код импортируется по file URL); чтобы прогоны не шли по пять минут, в gate-тесте добавлен отбор разделов `LANDING_SECTIONS` (без переменной идёт всё, как в шаге 8); `node test/landing-red.mjs` — 143 с, вывод: `прогон 1: sameTip -> true: красных ячеек 4 (AC-09, AC-17)`, `прогон 2: isFresh -> true: красных ячеек 4 (AC-08)`, `прогон 3: recordUnchanged and lockStillMine -> true: красных ячеек 4 (AC-37)`, `прогон 4: no stub: красных ячеек 0`, `landing-red ok`; контроль: на копии без маркера `GATE:lock` скрипт печатает `маркер не найден: GATE:lock — нужна ровно одна строка, найдено 0` и выходит с кодом 2. Коммит см. `git log` (`Tests: prove the merge gate red with stubs`)
шаг 13: сделан (до ворот Г1), второй ребейз на `origin/main` @ `e606a43` (в `main` влилась закрывающая часть задачи 004 и правки документов 007): 24 коммита ветки перенесены без конфликтов, `git range-diff` показывает все 24 как `=` (содержимое не изменилось, `README.md` плагина слился автоматически — правки 004 в других разделах); `BASE` = `e606a436e16b9731bd2e4f3335598a8c89e38239`. После ребейза по одному, с паузой 5 с: четырнадцать прежних тестов и десять новых (таблица ниже), `sh scripts/guards/run-all.sh` — `итого: ок 7, судить нечего 0, пропущено 0, FAIL 0`, `guard-secrets.py --tree` и `check-private-names.py` — ок; команды DoD «пусто» и «только эти файлы» с контролями (раздел «Доказательства уровней»). `npm test` целиком не запускался; полный проход всех 57 файлов по одному — только по слову владельца до пуша (ворота Г1).

## Прогоны после ребейза (по одному, пауза 5 с)

Таблица — слой после третьего ребейза, до правок по review-1 и review-2: числа ячеек в трёх строках (`config`, `extra`, `gate`) с тех пор выросли, текущие числа — в строках «сейчас» и в разделах «Исправления по review-1» и «Исправления по review-2»; время — того прогона.

| Тест | Ячеек ok | Упало | Пропущено | Время, с |
|---|---|---|---|---|
| crew-review | 52 | 0 | 0 | 24 |
| crew-flowwatch | 13 | 0 | 0 | 5 |
| crew-tasks | 28 | 0 | 0 | 10 |
| crew-place | 8 | 0 | 0 | 4 |
| crew-cfgtool | 17 | 0 | 0 | 13 |
| crew-help | 32 | 0 | 0 | 1 |
| crew-plan-task | 33 | 0 | 0 | 21 |
| crew-profiles-select | 54 | 0 | 0 | 76 |
| crew-profiles-config | 31 | 0 | 0 | 11 |
| crew-profiles-docs | 27 | 0 | 0 | 0 |
| crew-acceptor | 25 | 0 | 0 | 12 |
| crew-restart | 13 | 0 | 0 | 6 |
| crew-plans | 15 | 0 | 0 | 0 |
| crew-autoclose | 8 | 0 | 0 | 0 |
| crew-landing-golden | 3 | 0 | 0 | 7 |
| crew-landing-config | 15 (сейчас 16) | 0 | 0 | 19 |
| crew-landing-slot | 24 | 0 | 0 | 10 |
| crew-landing-extra | 22 (сейчас 23) | 0 | 0 | 3 |
| crew-landing-precheck | 38 | 0 | 0 | 72 |
| crew-landing-gate | 38 (сейчас 43) | 0 | 0 | 171 |
| crew-landing-hints | 9 | 0 | 0 | 40 |
| crew-landing-letters | 19 | 0 | 0 | 69 |
| crew-landing-tip | 25 | 0 | 0 | 47 |
| crew-landing-race | 14 | 0 | 0 | 46 (см. «Находки») |

Прежние четырнадцать тестов дали те же числа ячеек, что в базовом состоянии шага 1 (52, 13, 28, 8, 17, 32, 33, 54, 31, 27, 25, 13, 15, 8): упавших и пропущенных нет. `crew-landing-race` в прогоне подряд после ребейза упал в двух раундах из-за аварии дочернего процесса теста (см. «Находки», пункт 1); после правки каркаса теста он прошёл шесть раз подряд (14 ячеек, 0 упавших), код плагина этим не менялся.

## Находки

1. Вне задачи (Out of scope notes): два экземпляра плагина в разных процессах, получив событие простоя одной и той же сессии с обязательством, одновременно кладут напоминание в ящик под одним и тем же именем файла; переименование временного файла на Windows даёт `EPERM`, и процесс падает (`postLetter`, `core.ts`, в отличие от `saveTask`, повтора не делает). Доказательство: вывод дочернего процесса теста гонок `crew_task` в первой раскладке теста — файл `…\inbox\sesR3\.1791506356281-nudge-rq3-cqfj.tmp` → `…\1791506356281-nudge-rq3-cqfj.json`, в трёх раундах `AC-16`: два в прогоне после ребейза и один в отдельном прогоне. Каркас теста теперь регистрирует в дочернем процессе только его вкладку, поэтому событий простоя чужих вкладок там нет. Код `postLetter` задачей не правится (DNC-06 и граница «чужие дефекты»).
2. Н-03 (двойной победитель при перехвате замка старше `MERGE_STALE_MS`): во всех прогонах теста гонок (около пятнадцати, по пять раундов `AC-18` в каждом) победитель был один. Это «не воспроизведено», а не «невозможно»: гонка зависит от тайминга процессов.
3. Зависание на недоступном адресе (РП-07): на этой машине закрытый порт отвечает отказом за 5 с, «нет адреса» и «недоступный адрес» доходят до срока git (15 с), молчащий сервер по `http`, `https` и `ssh` — до срока плагина (20 с); во всех случаях процессов git с адресом после срока нет (`ssh` установлен, ячейка `AC-11 ssh` выполнена).
4. Число «37» в AGENTS п.7 устарело (на `BASE` в `opencode-plugin/test` теперь 57 файлов `*.test.mjs`: 47 прежних и 10 новых); задачей не правится.

## Доказательства уровней

- A Static: `load ok` для `config-schema`, `tasks`, `review`, `precheck`, `core`, `index`; `git diff --check "$BASE"..HEAD` пуст (контроль: `diff --cached --check` на файле с пробелом в конце печатает `trailing whitespace`, код 2).
- B Automated: таблица выше; новые десять — `<имя>.test ok`; прежние четырнадцать — как в базе.
- C Runtime: ячейки `AC-07`, `AC-09`, `AC-11` (шесть случаев), `AC-11 merge`, `AC-16`…`AC-19`, `AC-32 merge`, `AC-35` на одноразовых репозиториях с локальным `origin` и дочерними процессами; настоящая среда не трогалась (Г3).
- D Visual: N/A (визуального нет, показ приёмщику — тексты, уровень E).
- E Requirements: таблица «Трассировка» ниже.
- F Negative: `AC-08`, `AC-10`, `AC-11`, `AC-13`, `AC-15`, `AC-23`, `AC-25`, `AC-32`, `AC-34`, `AC-36`, `AC-37` зелёные (ячейки в таблице); доказательство красного `AC-30`: `node test/landing-red.mjs` — `прогон 1…5`, `landing-red ok` (вывод в шаге 12 и в разделе «Исправления по review-2»; пятый прогон добавлен С5п).
- G Regression: прежние четырнадцать тестов — как в базе; `run-all.sh` без `FAIL`; DNC-01…DNC-12 — по команде DoD (ниже).
- DNC-01: `landing-golden --check` и `--check --defaults` — `golden ok (18 texts)`; удалённые строки `core.ts` (`git diff -U0 "$BASE"..HEAD | grep '^-[^-]'`): закрывающая скобка типа `CrewConfig` (переехала ниже новых полей), `taskRow`, описание `crew_spawn`, строка счёта `inflight` в `crew_spawn`, описание `crew_task`, перечень действий, два списка прав, два `return` в `accept`; `index.ts`: строка `text` письма «работа прервана», строка счёта слота авто-плана, три строки напоминания о принятой; `review.ts`: две строки импорта, `repoDir` (добавлен `export`), три строки порядка в `reviewLetter` и две строки в `planMergeLetter` (нумерация шагов); в других местах удалений нет.
- DNC-02: `git diff "$BASE"..HEAD -- tasks.ts | grep -cE '^[-+].*(OPEN_STATUSES|WORKING_STATUSES|export const isOpen)'` — `0`, при этом diff по `tasks.ts` непуст (+27 строк); контроль на копии с изменённым словом `OPEN_STATUSES` печатает `2`.
- DNC-03, AC-28, DNC-11: `git diff --stat "$BASE"..HEAD` по запретным путям пуст; контроль со списком, включающим `core.ts`, печатает строку `core.ts`.
- DNC-04: `git diff --name-only | grep -vE …` пуст (код 1); контроль с `opencode-plugin/status.ts` печатает путь.
- DNC-05: `grep -niE 'queue|очеред' precheck.ts` пуст; контроль `printf 'const queue = []\n' | grep …` печатает строку.
- DNC-06: изменённых строк `review.ts` с именами замка — `0`; хунков в диапазоне 12…74 — `0`; контроль (пробел в строке 31 копии) печатает `1`.
- DNC-07: первые аргументы `runGit` — `merge-base`, `remote`, `rev-parse` (подмножество разрешённых); `ls-remote` — одна строка внутри `originTip`; `execFile|spawn|process.kill|taskkill` — строки только внутри `runGit`, `originTip`, `killTree` и строка `import`; контроль `runGit(d, ["fetch","origin"])` печатает совпадение.
- DNC-08: `taskkill` с `/PID` — 1, с `/IM` или `/FI` — 0, `pkill|killall` — пусто; в тестах `tip` и `race` процессы убиваются только по номеру своего запуска, список процессов `git*` с адресом/портом после срока — 0.
- DNC-09: команда DoD печатает `ok` (удалены ровно два `return` приёма); контроли на копии базы: `if (false)` вместо `if (!done.ok)` в диапазоне `accept` — `bad 1 0`, замена строки в `merge` — `bad 1 0`; изменённых строк `review.ts` с `isMerged|cleanupDone` — `0`.
- DNC-10: в этом файле команды запуска тестов — по одному имени файла, `npm test` — только в строках «не запускался».
- DNC-12: `grep -n "перезапис" test/crew-landing-*.test.mjs` пуст; `AC-15` показывает отказ REQ-12 под `required`.

## Трассировка

| Пункт | Реализация, метод | Доказательство | Статус |
|---|---|---|---|
| REQ-01 | ключ `accepted_slot`, `loadConfig` | `crew-landing-config` AC-25 | PASS |
| REQ-02 | `countedOpen` в двух местах | `crew-landing-slot` AC-02, AC-04 | PASS |
| REQ-03 | `cleanup_limit`, `waitingCleanup` | `crew-landing-slot` AC-03 c1…c5 | PASS |
| REQ-04 | тексты при `free` и `hold` | `crew-landing-slot` AC-05, AC-06 | PASS |
| REQ-05 | ключ `merge_precheck` | AC-25; `crew-landing-gate` AC-12 merge off | PASS |
| REQ-06 | `beginPrecheck` | `crew-landing-precheck` REQ-06 (три), AC-13, AC-34; gate AC-07 | PASS |
| REQ-07 | `finishPrecheck` | precheck AC-10 a…f, AC-33, AC-36 a…d2 | PASS |
| REQ-08 | `gateMerge`, пять однострочных сверок (`GATE:same-tip`, `green`, `recheck`, `lock`, `release`) | gate AC-07…AC-09, AC-17, AC-35, AC-37; `landing-red` | PASS |
| REQ-09 | `originTip`, `killTree` | `crew-landing-tip` (25); gate AC-11 merge | PASS |
| REQ-10 | `unlockMerge` | precheck AC-13 a…h; AC-12 unlock | PASS |
| REQ-11 | `markPrecheckStale` в пяти местах, `accepted_on` | precheck AC-14 a…e; gate AC-14 merge, AC-07 запись | PASS |
| REQ-12 | шаг 3(а) ворот | gate AC-15 | PASS |
| REQ-13 | `acceptWarning` | `crew-landing-hints` AC-21 (три) | PASS |
| REQ-14 | `neighbourHints` | hints AC-22 (пять) | PASS |
| REQ-15 | `precheckLines` в письме «работа прервана» | letters AC-19 письмо (две); race AC-19 | PASS |
| REQ-16 | ключ `task_extra_fields`, `invalid` | config AC-25 | PASS |
| REQ-17 | `parseExtra` в `crew_spawn`, `assign` | `crew-landing-extra` AC-23 | PASS |
| REQ-18 | `Task.extra`, `extraBlock` | extra AC-24 (семь), REQ-18 (две) | PASS |
| REQ-19 | шесть мест показа | letters AC-26 (три), AC-31 (одиннадцать); `grep` README 12 строк; живой показ — Г3 | PASS (кроме живой среды) |
| REQ-20 | схема, опросник | config AC-25 guide | PASS |
| REQ-21 | `ADR-0009-merge-precheck-without-lock.md` (`Статус: принято, 2026-10-09, владелец`, коммит `d49a277`), строка реестра | коммит ADR раньше коммита `Config:`; `check-md-links.py` ок | PASS |
| REQ-22 | ответ интегратору — в сдаче | сдача после ворот | NOT VERIFIED |
| REQ-23 | десять тестов, `package.json`, `landing-red` | таблица прогонов; `AC-30` | PASS |
| REQ-24 | необязательные `precheck`, `extra` | precheck и extra: REQ-24 old record | PASS |
| AC-01 | снимок текстов базы | golden: AC-01 (две), `landing-golden --check` (оба режима) | PASS |
| AC-02 | `free` против `hold` на одних данных | slot AC-02 free, hold | PASS |
| AC-03 | отказ по `cleanup_limit` | slot AC-03 c1…c5 | PASS |
| AC-04 | авто-план | slot AC-04 (четыре) | PASS |
| AC-05 | вкладка принятой | slot AC-05 (пять) | PASS |
| AC-06 | слова о месте | slot AC-06 free, hold, контроль | PASS |
| AC-07 | весь путь | gate AC-07 (две) | PASS |
| AC-08 | нет записи, идёт, устарела | gate AC-08 a, b, b2, c | PASS |
| AC-09 | сдвиг `origin` | gate AC-09 (три) | PASS |
| AC-10 | шесть отказов | precheck AC-10 a…f | PASS |
| AC-11 | сбой чтения без замка и без остатков | tip AC-11 (шесть, процессов 0); gate AC-11 merge (две) | PASS |
| AC-12 | `off` | precheck AC-12 (две); gate AC-12 merge off; `crew-review` без правок | PASS |
| AC-13 | unlock | precheck AC-13 a…h | PASS |
| AC-14 | пять путей устаревания | precheck AC-14 a…e; gate AC-14 merge a…e | PASS |
| AC-15 | второй замок для B | gate AC-15 | PASS |
| AC-16 | гонка замка | race AC-16 (живые, раунды 1…5) | PASS |
| AC-17 | чтение под замком | gate AC-17; красный при заглушке | PASS |
| AC-18 | перехват | race AC-18 раунды 1…5, двойной победитель не воспроизведён | PASS |
| AC-19 | перезапуск | race AC-19 (две); letters AC-19 письмо (две) | PASS |
| AC-20 | ссылки, объекты, `FETCH_HEAD` | tip AC-20 tip; gate AC-20, AC-20 сбой | PASS |
| AC-21 | предупреждение `accept` | hints AC-21, без предупреждения, off | PASS |
| AC-22 | соседние задачи | hints AC-22 (пять) | PASS |
| AC-23 | отказы `extra` | extra AC-23 c1…c5, assign, order | PASS |
| AC-24 | блок в письмах и `show` | extra AC-24 (семь) | PASS |
| AC-25 | схема, запись, опросник | config AC-25 (три) | PASS |
| AC-26 | описание, справка, README, ADR | letters AC-26 (три); `grep` README; `ls`/`grep` ADR | PASS |
| AC-27 | ребейз, порядок | два ребейза без конфликтов, `range-diff` 24 из 24 `=`; `crew-profiles-select`, `crew-profiles-config` | PASS |
| AC-28 | запретные пути, `OPEN_STATUSES` | команды DoD с контролями; стражи секретов и имён | PASS |
| AC-29 | файл сдачи | сдача после ворот | NOT VERIFIED |
| AC-30 | доказательство красного | `landing-red` (пять прогонов, контроль маркера) | PASS |
| AC-31 | письма и `show` для флагов | letters AC-31 (одиннадцать) | PASS |
| AC-32 | нет ветки, нет origin, недоступен | tip AC-32 (четыре+); precheck, gate AC-32 | PASS |
| AC-33 | предупреждение ветки задачи | precheck AC-33 (две) | PASS |
| AC-34 | задача-план | precheck AC-34 (две); gate AC-34 (две) | PASS |
| AC-35 | повтор `merge` | gate AC-35 c1…c7, c4b (девять) | PASS |
| AC-36 | замена записи, подсказка `fetch` | precheck AC-36 a, b, c, d1, d2 | PASS |
| AC-37 | изменения внутри чтения | gate AC-37 c1, c1 перехват, c2, c3, c4…c8 | PASS |
| DNC-01 | текст прежний | golden, четырнадцать тестов, список удалённых строк | PASS |
| DNC-02 | статусы не меняются | команда DoD, контроль; slot AC-05 | PASS |
| DNC-03 | панель и окно | `git diff --stat` пуст | PASS |
| DNC-04 | только свои пути | команда DoD, контроль | PASS |
| DNC-05 | нет хранимой очереди | `grep` пуст, контроль | PASS |
| DNC-06 | замок не правится | команды DoD, контроль | PASS |
| DNC-07 | только чтение git | команды DoD; AC-20 | PASS |
| DNC-08 | чужие процессы | команды DoD; списки процессов в тестах | PASS |
| DNC-09 | `accept` и `cleaned` | команда DoD, два контроля | PASS |
| DNC-10 | тесты по одному | этот файл | PASS |
| DNC-11 | задачи 003 и 004, профили | `git diff --stat` пуст | PASS |
| DNC-12 | дефекты замка | `grep` пуст; AC-15 | PASS |

## Отметки DoD

Утверждённый `plan.md` не правится (отметка возвращала бы его в «черновик»); отметки пунктов DoD ведутся здесь, по перепрогону С6 (`review-1.md`, раздел 1) и прогонам С5п (раздел ниже). Уровни: A, B, C, E, F, G — [x]; D — N/A. Все сценарии AC-01…AC-37, кроме AC-29, и REQ-21, REQ-24, DNC-01…DNC-12 — [x] по строкам таблицы «Трассировка»; AC-29 и REQ-22 — [ ] (сдача после ворот, NOT VERIFIED).

## Исправления по review-1

Проверка С6, заход 1 (`review-1.md`): существенных 1, поверхностных 4. Решения владельца — «по рекомендации» (2026-10-09). Дерево: ветка `task-005-faster-landing`, правка поверх `d49a277`.

1. Существенная (находка 1): ворота `merge` определяли «замок мой» по сессии. Исправлено в `precheck.ts`: `lockStillMine(project, session, n)` сверяет сессию И номер задачи (`holdsFor`, маркер `GATE:lock` остался на одной строке); снятие замка в шагах 6–8 — через `releaseOwnLock`, которая снимает замок, только если держатель — эта сессия и эта задача, поэтому отказ первой задачи не снимает замок, взятый той же сессией для второй. Замок выдаётся и считается своим, только когда совпали сессия и задача. Ячейки в `crew-landing-gate.test.mjs`: `AC-37 c4` (замок снят и взят той же сессией для другой задачи после сдвига `origin`, проба из review-1: выдан на `1a40d59`, `origin` `9e51e1b`) и `AC-37 c5` (отказ первой не снимает замок второй). До правки обе красные (`FAIL`, c4: «выдан на вершину»), после — зелёные.
   Отступление от плана (план не правится): шаг 9 плана («замок всё ещё у этой сессии») и REQ-08 предписывали сверку `holdsMergeLock(project, session)` только по сессии; теперь сверка по сессии и задаче, снятие замка в шагах 6–8 — тоже по паре. `review.ts` и `holdsMergeLock` не тронуты (DNC-06): сверка по паре читает `mergeHolder`. В тексте REQ-08 слова «у этой сессии» читать как «у этой сессии для этой задачи».
2. Поверхностная (находка 2): в `RESERVED_FIELD_IDS` (`config-schema.ts`) добавлены `__proto__`, `constructor`, `prototype` — их не принимают ни схема `task_extra_fields`, ни `extraFieldsOf`; `extraBlock` (`core.ts`) выбирает значения через `Object.hasOwn`, а не `in`. Ячейки: `REQ-18 служебные имена` (`crew-landing-extra.test.mjs`, красная без правки, зелёная с ней) и `AC-25 reserved ids: service names` (`crew-landing-config.test.mjs`).
3. Поверхностная (находка 3): строка REQ-21, раздел «Assumptions» и «Known limitations» приведены к дереву (ADR принят `d49a277`, даты у строк; снято «полный проход не делался» — проход сделан С6).
4. Поверхностная (находка 4): отметки DoD — в разделе выше, `plan.md` не правился.
5. Вне задачи, не делалось: `legacyWalk` с битым файлом настроек (внесён в материал задачи 006); `postLetter` EPERM (отдельная задача позже).

Прогоны после правки (по одному, пауза 10 с, `npm test` не запускался): `crew-landing-gate` 40 ok за 232 с, `crew-landing-precheck` 38 ok, `crew-landing-race` 14 ok, `crew-landing-extra` 23 ok, `crew-landing-config` 16 ok, `crew-landing-letters` 19 ok, `crew-landing-slot` 24 ok, `crew-landing-tip` 25 ok, `crew-landing-hints` 9 ok, `crew-review` 52 ok, `crew-acceptor` 25 ok, `crew-cfgtool` 17 ok, `crew-help` 32 ok; код 0, FAIL 0 везде; `node test/landing-golden.mjs --check` и `--check --defaults` — `golden ok`.

## Исправления по review-2

Проверка С6, заход 2 (`review-2.md`): существенных 0, поверхностных 3. Решение владельца — «по рекомендации» (2026-10-09): исправить отдельной мелкой правкой после слияния. Дерево: ветка `task-005-review2-fixes` от `origin/main` @ `40e78c3` (Сессия С5п); `spec.md` и `plan.md` не правились.

1. Находка 1 (ячейки на шаги 6 и 7): в `crew-landing-gate.test.mjs` добавлены `AC-37 c6` (вершина сдвинулась, шаг 7: внутри чтения замок переведён на другую задачу той же сессии — отказ «сдвинулась», замок другой задачи цел) и `AC-37 c7` (чтение вершины не удалось, шаг 6: тот же перевод замка — отказ «узнать не удалось», замок другой задачи цел). Для них снятие замка в `precheck.ts` вынесено в однострочную сверку `mayRelease` с маркером `GATE:release` (`releaseOwnLock` вызывает её). В `landing-red.mjs` — прогон 4 «mayRelease -> true»: красные `c5`, `c6`, `c7` (ячейки названы в проверке, а не только раздел); прогон 3 теперь называет `c4`, `c5`, `c8`; прогон без заглушки — пятый. Красное: на заглушке `GATE:release` падают `c5`, `c6`, `c7` (на коде без заглушки зелёные: код был корректен, ячейки закрывают защиту от регрессии).
2. Находка 2 (замок по экземпляру): исправлено локально в `precheck.ts`, без правки `review.ts` и формата замка (DNC-06) и без правки плана. После `takeMergeLock` (шаг 5) ворота читают метку `at` замка (`mergeHolder(project)?.at`) и сверяют её в шагах 6–9: `lockStillMine` и `mayRelease` принимают метку (`holdsFor(project, session, n, at)`); шаг 4 (повтор держателя, замок взят в прошлом вызове) метку не передаёт. Замок, снятый и снова взятый той же сессией для той же задачи (параллельный `merge`), теперь даёт раннему вызову «Замок потерян» вместо «выдан» на сдвинувшуюся вершину, и его отказ не снимает замок другого вызова. Ячейка `AC-37 c8`: красная на коде `origin/main` (`FAIL AC-37 c8`, «выдан на вершину»), зелёная на правке; краснится заглушкой `GATE:lock` (прогон 3). Остаток: два параллельных `merge` одной задачи одной сессии при записи метки в одну и ту же миллисекунду неразличимы (метка — `Date.now()`); вероятность пренебрежимо мала, окно между сверкой и записью `lock_on` по-прежнему названо в README.
3. Находка 3 (`result.md`): строка «Artifacts» и база — исправлены коммитом `40e78c3` (ветка отправлена, база названа); таблица «Прогоны после ребейза» получила пояснение и пометки «сейчас» у трёх строк (`config` 16, `extra` 23, `gate` 43); в трассировке исправлены число сверок и прогонов `landing-red` (REQ-08, AC-30), перечень ячеек AC-37 (c1…c8) и ссылка на «прогон 1…5» в разделе F. Отметки DoD — по-прежнему в разделе «Отметки DoD» здесь, `plan.md` не правился.

Прогоны после правки (по одному, пауза 10 с, `npm test` не запускался): `crew-landing-gate` 43 ok за 204 с, `crew-landing-race` 14 ok, `crew-landing-tip` 25 ok, `crew-landing-precheck` 38 ok, `crew-landing-hints` 9 ok, `crew-landing-letters` 19 ok; код 0, FAIL 0 везде; `node test/landing-red.mjs` — пять прогонов, `landing-red ok` (прогон 3: красных 7, `c4`, `c5`, `c8` названы; прогон 4: `c5`, `c6`, `c7`; прогон 5 без заглушки: 0), `--markers-only` — `markers ok`; `landing-golden --check` и `--check --defaults` — `golden ok`; `sh scripts/guards/run-all.sh` — `итого: ок 7, FAIL 0`; `git diff --check` пуст. Задержка службы перед прогонами 1,0–2,7 с (порог 5 с не достигался). Не запускались (код не менялся): `crew-landing-config`, `-extra`, `-slot`, `crew-review`, `crew-acceptor`, `crew-cfgtool`, `crew-help`.

Вне задачи, не делалось: пути `accept`, `rework`, `cancel` определяют замок только по сессии (Ф-10 и В-06 спецификации; `DNC-06` запрещает менять формат замка) — отдельная задача.

## RESULT

Implemented: слот при принятии и счётчик «ждёт уборки» (`accepted_slot`, `cleanup_limit`); предпроверка вливания и ворота `merge` без замка до зелёной записи (`merge_precheck: required`, действия `precheck`, `unlock`); дополнительные поля задачи (`task_extra_fields`, вход `extra`); показ приёмщику; ADR-0009; десять самотестов, каркас, доказательство красного.

Changed: `opencode-plugin/precheck.ts` (новый), `tasks.ts`, `config-schema.ts`, `core.ts`, `review.ts`, `index.ts`, `README.md`, `package.json`, `test/` (десять тестов, `landing-harness.mjs`, `landing-child.mjs`, `landing-red.mjs`, `landing-golden.mjs`, `landing-golden.json`, `README.md`), `doc/canon/decisions/ADR-0009-merge-precheck-without-lock.md` и реестр, папка задачи.

Verification: уровни A–G по разделу «Доказательства уровней»; D — N/A.

Acceptance criteria: 36 из 37 PASS, AC-29 NOT VERIFIED (сдача после ворот).

How to verify: из `opencode-plugin/` в дереве ветки — `node test/<файл>` по одному (список в таблице «Прогоны»), `node test/landing-golden.mjs --check`, `node test/landing-red.mjs`; из корня — `sh scripts/guards/run-all.sh`; команды DoD из `plan.md` с `BASE` из этого файла.

Regressions: нет (уровень G: прежние четырнадцать тестов как в базе, тексты при значениях по умолчанию побайтно прежние).

Assumptions: FACT — владелец утвердил РП-01…РП-11 вариантом 1 (2026-10-08); ADR-0009 принят владельцем 2026-10-09 (коммит `d49a277`); `git remote get-url` читается синхронно (локальная настройка).

Known limitations: AC-29 и REQ-22 (NOT VERIFIED, сдача после ворот) — решение владельца: ожидается, вынесено владельцу 2026-10-09 (закроется при сдаче); живая проверка на настоящей службе (Г3) не выполнена — решение владельца: ожидается на Г3, вынесено владельцу 2026-10-09; двойной победитель Н-03 не воспроизведён — решение владельца: ожидается, вынесено владельцу 2026-10-09 (в проверке С6 не воспроизведён тоже). Снято: «полный проход всех 57 файлов тестов не делался» — проход сделан проверкой С6 (review-1.md, раздел 1: 57 из 57, сумма ok 1552, FAIL 0) на `d49a277`; после исправлений review-1 перепрогнаны только затронутые файлы (раздел «Исправления по review-1»).

Out of scope notes: находки 1 и 4 раздела «Находки» (гонка `postLetter` на Windows; число «37» в AGENTS п.7).

Remaining questions: нет открытых UNKNOWN; ворота Г1 (принять ADR-0009, пуш), Г2 (слияние), Г3 (переключение) — по слову владельца.

Artifacts: ветка `task-005-faster-landing` (отправлена на origin), база на момент слияния — `origin/main` (база реализации `e606a43`), коммиты — `git log --oneline "$BASE"..HEAD`; порядок выкатки и откат: слияние без перезапуска, ключи в настройках проекта включает интегратор, откат — убрать ключи; новых переменных и секретов нет.

## Правка по решению владельца 2026-10-09: ключи включены по умолчанию (Сессия С5д)

Слово владельца (2026-10-09, из чата): `accepted_slot` по умолчанию `free`, `merge_precheck` по умолчанию `required`. Имена и допустимые значения ключей прежние; `cleanup_limit` 10; `task_extra_fields` пуст; прежнее поведение — явные `hold` и `off`, других значений и синонимов нет.

- Код: умолчания в `config-schema.ts` (справочник и рекомендации), `core.ts` (`loadConfig`, комментарии, справка `crew_help`, описания `crew_spawn` и `crew_task`, отказ `precheck` при `off`), `precheck.ts` (отказ `merge` без записи предпроверки теперь называет порядок «precheck без замка, затем merge на проверенную вершину» и ключ возврата `merge_precheck: off`), `review.ts` (письма приёмщика), `tasks.ts` (комментарий).
- Тексты: README плагина (оба ключа), README тестов, спецификация, план, ADR-0009 (запись решения владельца с датой).
- Тесты: `landing-golden.mjs` и `crew-landing-golden` (проходы `--check --legacy`, `--dump` без ключей против `--new`), `crew-landing-config`, `crew-landing-letters`, `crew-landing-slot`, `crew-landing-precheck` (ячейки «по умолчанию» и «явные hold/off»), прежние `crew-review`, `crew-acceptor`, `crew-plan-task`, `crew-profiles-windows` ставят `off`/`hold` явно.
- DNC-01 теперь читается так: тексты при явных `hold` и `off` равны снимку базы; без ключей тексты равны текстам с явными `free` и `required`.

## Автоотпускание замка слияния (Сессия С5д, решение владельца 2026-10-09)

- Код: `releaseLandedLock` в `precheck.ts`, поле `landed` записи предпроверки, вызов на проходе службы в `index.ts`, `accept` без замка после отпускания (`core.ts`), строка про замок в ответе `merge`, `LOCK_LIFECYCLE` в письмах приёмщика (`review.ts`), справка, описание `crew_task`, README плагина.
- Правка интегратора проекта по просьбе владельца принята как своя: тексты письма, справки и отказа `merge` про «замок до CI не брать», «влить именно проверенный кандидат», слот и уборку (`review.ts`, `core.ts`, `precheck.ts`, README, ячейки в `crew-landing-gate` и `crew-landing-letters`).
- Тесты: новый `crew-landing-release` (14 ячеек); ячейки AC-26 и AC-31 в `crew-landing-letters`. `crew-profiles-config`, ячейка AC-23, не трогалась (чинит другая ветка).

## Подсказки о замке в ответах (Сессия С5д, решение владельца 2026-10-10)

- Код: строки о замке в ответах `accept`, `rework`, `cancel`, `cleaned` (`core.ts`), письмо о долго держимом замке с держателем, задачей, временем и действием (`index.ts`). Поведение замка не менялось.
- Тексты: README плагина; справка `crew_help`, описание инструмента и письмо приёмщика уже совпадали с правилом, эталоны `answer-golden*.json` не затронуты.
- Тесты: ячейки `REQ-28` в `crew-landing-hints`, ячейка письма и уточнённый образец в `crew-flowwatch`.
- Слово «LANDED» (из скрипта вливания проекта) в письмо не вошло; автоотпускание в письме названо с условием `merge_precheck: required`. Прочие ответы про «замок вливания» не переписывались (старые тексты, тесты на них).
- Письмо о замке по-прежнему идёт автору задачи (интегратору); держателю отдельного письма нет.

## Сохранение дерева улик при уборке (Сессия С5д, решение владельца 2026-10-10)

- Код: `crew_task cleaned {n, keep:[путь]}` — до 8 путей; путь проверяется до записи (worktree репозитория или папка внутри папки деревьев проекта; не основное дерево, не ветка); сохранённое дерево уборка не проверяет (`cleanupDone`, напоминание о хвостах); запись `kept` и строка истории «улики сохранены: <путь>»; ответ «Сохранено: <путь> (не проверялось уборкой)».
- Тексты: `crew_help`, описание `crew_task`, письмо приёмщика (одна строка), README плагина.
- Тесты: новый `crew-landing-keep` (REQ-29); эталон ответов обновлялся только при расхождении (см. журнал).
- Проверка С6: существенных 0; принято наблюдение про ветку, выбранную в сохранённом дереве (подсказка `git checkout --detach`, ячейка KEEP-10), и про корень относительных путей в README.

Статус: в работе

# 002 — Стражи репозитория — результат реализации (Сессия С5, 2026-10-08)

Вход: spec.md и plan.md (оба «утверждено, 2026-10-08, владелец»; решения Р-01…Р-07 приняты по рекомендации). Ветка задачи
`task-002-guards` в связанном рабочем дереве рядом с репозиторием; основная рабочая копия `main` не затрагивалась.
Хуки git в общий `.git` не ставились, `git push` не выполнялся, GitHub не трогался (`gh` не вызывался).

## Ревизия, база, окружение

- `$BASE` = `git merge-base main task-002-guards` = `b7234224f1aeab8071e6600a204fee58acc1a260` (головка `main` в момент создания ветки; коммит
  с утверждённым планом). Команды DoD считаются от этого значения; после каждого ребейза значение пересчитывается.
- Сравнение с базой плана (вторая строка plan.md, `583764e`): `git diff --name-only 583764e main` — из файлов плана (карта плана: `AGENTS.md`, `README.md`,
  `doc/canon/decisions/*`, `doc/canon/process.md`, `doc/tasks/README.md`, `doc/tasks/001-crew-service/task/draft-plan-previous.md`, `.gitattributes`) изменённых нет;
  изменились только папка задачи 002 (план, заходы проверки, журналы) и шесть файлов `opencode-plugin/` (`core.ts`, `index.ts`, `watch.ts`,
  `test/crew-help.test.mjs`, `test/crew-mcp.test.mjs`, `test/crew-watch.test.mjs`) — чужие задачи, по DNC-01 не правятся и не затрагивают план. `git merge-base --is-ancestor d963ecc HEAD` — код 0.
- Окружение: Python 3.14.4 (команда `python`), git 2.56.0, GNU bash 5.3 (Git Bash), `dash` на машине есть (`dash -n` выполнима), `gh` с входом владельца есть (не использовалась), node 24.

## Базовое состояние (шаг 6 алгоритма, шаг 1 плана)

- `node test/cleanup-tmp.mjs` — «18 old test folders removed», код 0.
- 37 файлов `opencode-plugin/test/*.test.mjs`, каждый отдельно, пауза 5 с между ними: 37 из 37 код 0, упавших 0, пропущенных 0 (слова skip в выводе — только в именах проверок);
  проекту не нужна сборка (зависимостей нет, `node_modules` не нужен).
- Замер целей стражей на `$BASE` (по тексту из `git ls-files`, расширения из списка бинарных исключены): файлов 163; BOM 0; UTF-16 0; NUL 0; файлов с CRLF 0; смешанных концов строк 0;
  управляющих байтов (включая 0x7F) 0; файлов с U+FFFD 2 (`doc/tasks/001-crew-service/spec-review-3.md`, `spec-review-4.md`, всего 3 строки — Н-11); подписей кракозябр 0;
  `.md` в индексе 93; файлов `*.test.mjs` 37 (число для AC-21). Первые строки `spec.md` и `plan.md` задач 001 и 002 — «Статус: …».

## Журнал шагов

шаг 1: сделан, ветка и дерево созданы (`git status --short` пуст, `git merge-base --is-ancestor $BASE HEAD` код 0), версии инструментов и базовое состояние записаны выше
шаг 2: сделан, `test-guardlib.py` (19 проб, упало 0), `test-run-all.py` (15 проб, упало 0), `LC_ALL=C python scripts/guards/selftest/test-guardlib.py` (упало 0); уточнение ADR-0002 по Р-01 отдельным коммитом
шаг 3: сделан, `test-guard-secrets.py` (26 проб), `test-check-private-names.py` (18 проб), оба упало 0; ручной прогон `guard-secrets.py --tree` на дереве — «ок», `check-private-names.py` без списка — красный «предпосылка» с подсказкой, как завести список
шаг 4: сделан, `test-check-text-hygiene.py` (27 проб, упало 0, в том числе под `LC_ALL=C`); на дереве страж красный ровно по трём строкам U+FFFD записей 001 (Н-11), других находок нет; страж нашёл и литералы порчи в собственных файлах (исправлено: образцы собираются из кодов символов)
шаг 5 (часть до ворот Г6): страж ссылок и якорей и его самотест (24 пробы) готовы, строка 8 материала 001 исправлена (`git diff -U0` — одна строка); страж ссылок на дереве красный ровно по двум цитатам записей 001 (`spec-review-12.md:47`, `spec-review-13.md:41`) — пометки с причиной по Г6 ждут слова владельца
шаг 6: сделан, три самотеста (`check-task-docs` 16 проб, `check-no-status-table` 13, `check-tests-have-checks` 9, упало 0), на дереве «ок: осмотрено 51 файлов задач», «ок: осмотрено 93 файлов .md», «ок: осмотрено 37 файлов тестов»; `git grep -c "001-crew-service" -- doc/tasks/README.md` — пусто, код 1
шаг 7: сделан, `test-guard-commit-message.py` (34 пробы, упало 0, в том числе под `LC_ALL=C`)
шаг 8: сделан, `test-guard-git.py` (19 проб, упало 0: таблица AC-10 — 59 команд из 42 строк, 24 дополнительные, красная проба на каждое из 11 правил, пять положений записи хука); `watchRefusal` на дереве с готовым `.claude/settings.json` — `undefined` для четырёх команд из списка запретов, ключа `permissions` нет; `node test/crew-deny.test.mjs` — «crew-deny.test ok»
шаг 9: сделан, `test-pre-commit.py` (13), `test-commit-msg.py` (19), `test-pre-push.py` (9), `test-commit-range.py` (10), `test-install-hooks.py` (11), везде упало 0; `time sh scripts/githooks/pre-commit` с индексом из одного файла — 5,8 с (порог 10 с, Р-03)
шаг 10: сделан, `test-check-wiring.py` (19 проб), `test-prove-red.py` (10), `test-probe-empty-root.py` (5), упало 0; `sh scripts/guards/probe-empty-root.sh` — 24 запуска, «ок» на пустоте нет; `sh scripts/guards/prove-red.sh` — «ок: доказано 13 из 13»
шаг 11 (до ворот Г3): написаны `.github/workflows/guards.yml`, `scripts/guards/ci-mask.sh` (самотест `test-ci-mask.py`, 11 проб, под sh и dash), шаблон `scripts/guards/probe/probe-log.yml.tmpl`; оба YAML разобраны PyYAML на машине (в репозиторий зависимость не вводится); пуши и прогоны Actions — ворота Г3, не выполнялись
шаг 12 (до ворот Г4): написан `scripts/github-setup.sh`, `test-github-setup.py` (13 проб на подставной команде `gh`, настоящий GitHub не вызывался), `--dry-run protect` печатает тело запроса; запуск против GitHub — ворота Г4, не выполнялся
шаг 13: сделан, правки `AGENTS.md` (раздел «Стражи», пометки «механизм» у п.3, 4, 5, 6, 8, 15, п.4 по О-07), `README.md` (три строки), уточнение ADR-0006 (датированная вставка); сверка — в разделе «Пометки AGENTS.md» ниже
шаг 14 (часть до ворот Г1, Г2, Г3, Г5, Г6): приёмка выполнена, см. «Сквозная приёмка»; установка хуков, пуши, слияние, список имён и подтверждение Г6 ждут слов владельца

## Расхождения с планом, замечания по ходу

- Уточнение порядка коммитов шага 2: библиотека самотестов `selftest/stlib.py` вошла в первый коммит вместе с `test-guardlib.py` (самотест не запускается без неё); отдельный коммит
  «self-test library and runner» содержит `run-selftests.sh`. Состав шагов, файлов и контрактов не менялся.
- Права на исполнение: при коммите с `--only` на Windows (`core.fileMode=false`) git заново читает режим файла из рабочей копии и сбрасывает `100755`, выставленный `git update-index --chmod=+x`;
  коммиты с `+x` делаются без `--only`, когда в индексе лежат ровно перечисленные файлы (проверяется перед каждым коммитом). Из-за этого три файла из шага 2 получили `+x` отдельным коммитом.
- Порядок коммитов шага 8: запись в `.claude/settings.json` закоммичена до самотеста (самотест читает этот файл), порядок внутри шага — деталь, состав не менялся.
- В `run-selftests.sh` добавлена проверка формы самотеста (законная проба первой, все четыре вида проб) — усиление AC-17, число самотестов прежнее (21).
- `lib/find-python.sh` читает необязательную переменную `GUARDS_PYTHON_CANDIDATES` (список кандидатов через запятую): только для самотестов, чтобы воспроизвести «нет рабочего интерпретатора»; режим стража она не задаёт.
- Ветка пересобрана до первого пуша по решению владельца (ребейз неопубликованной ветки, О-01): из сообщений всех коммитов убран трейлер `Co-Authored-By`, а в двух ранних коммитах (стража секретов и стража текста) восстановлено итоговое содержимое файлов с образцами (литералы порчи и образец пути машины заменены сборкой из кусков). Пустой после этого коммит исправления образца пути убран. Дерево побайтово прежнее (`git diff` старой и новой вершин пуст), порядок шагов и разбивка сохранены; прежняя вершина `6b45b7e` оставлена меткой `task-002-guards-backup` (не публикуется); сборка — командами `git commit-tree`, без `filter-branch`. `$BASE` пересчитан: `git merge-base main task-002-guards` = `b7234224f1aeab8071e6600a204fee58acc1a260`, прежний.

## Пометки AGENTS.md (правило → пометка → REQ)

Сверено построчно с парами REQ-32 (`git diff $BASE HEAD -- AGENTS.md`, `git grep -n "механизм" -- AGENTS.md`).

| Правило | Пометка в AGENTS.md | Основание |
|---|---|---|
| п.3 изменения в отдельном рабочем дереве | механизма нет: хуки каталог работы агента не видят; судится приёмкой (Сессия С6, владелец на воротах) | Н-12 |
| п.3 в `main` только `--ff-only` | механизм: защита ветки `main` на GitHub, линейная история | REQ-17 |
| п.4 сообщение по-английски, `-s`, без трейлеров соавторства | механизм: страж сообщения, вызывает `commit-msg`, `pre-push`, CI | REQ-13, REQ-14, REQ-15, REQ-18, REQ-19 |
| п.4 файлы по имени, без `git add -A`, перечень файлов в команде | механизм: хук агента — подсказка, не барьер | REQ-16, Н-12, О-07 |
| п.4 без упоминаний инструментов | механизма нет: страж не берётся | Н-03 |
| п.5 никогда не `push --force` | механизм: защита ветки `main`; для веток задач — подсказка хука агента | REQ-17, REQ-16 |
| п.5 пуш только после зелёных тестов | судится приёмкой: Сессия С6 перепрогоняет тесты, владелец на воротах сдачи | REQ-17 (проверки статуса не включаются) |
| п.6 уборка веток и деревьев | механизма нет: уборка — вне задачи | — |
| п.8 весь набор тестов перед пушем | судится приёмкой (как вторая половина п.5) | — |
| п.15 без приватных данных | механизм: стражи приватности, вызывают `pre-commit`, `commit-msg`, `pre-push`, CI; ручной поиск заменён ссылкой на стражей | REQ-01…REQ-06, REQ-38 |

Построчная сверка п.4 с правилами хука агента: область коммита (`--only`/`-o`, `--include`/`-i`, ` -- <файлы>`) и пометка `# index-verified`
в хуке — в п.4 названы три формы перечня файлов; `git add -- <файлы>` только чтобы git узнал новый файл (О-07); отказы на `add -A`, `add .` — те же. Пометка «механизм» у правила, которое ничем из задачи
не держится (п.5 «пуш после зелёных тестов», п.8), не стоит.

## Сквозная приёмка (шаг 14, до ворот)

Тяжёлые прогоны шли по одному, последним изменением кода был коммит «locale-independent order of guards and self-tests»; доказательства ниже собраны после него.

- `LC_ALL=C sh scripts/guards/selftest/run-selftests.sh`: «ок: осмотрено 21 самотестов, упало 0» (7 мин 46 с); то же под `LC_ALL=ru_RU.UTF-8`: «ок: осмотрено 21 самотестов, упало 0» (10 мин 31 с);
  `diff` двух выводов без строк времени — пуст (AC-29, локальная часть).
- `sh scripts/guards/prove-red.sh`: «ок: доказано 13 из 13» (13 стражей: 7 `check-*`, `guard-secrets`, `guard-commit-message`, хук агента, три хука git); `git status --porcelain` до и после — оба пусты (AC-17).
- `sh scripts/guards/probe-empty-root.sh`: «ок: осмотрено 24 запусков, «ок» на пустоте нет» (8 стражей x 3 мишени, AC-18).
- Тесты плагина по одному, пауза 5 с: 37 из 37 код 0, упавших 0, пропущенных 0 — как в базовом состоянии (AC-26, DoD «Уровень G»).
- `time sh scripts/githooks/pre-commit` с индексом из одного файла: 5,6 с при пороге 10 с (Р-03, AC-25); две красные строки стражей — известные записи 001 (Н-11).
- Стражи на дереве задачи (с временным выдуманным списком имён): `guard-secrets.py --tree` — «ок: осмотрено 214 файлов»; `check-private-names.py` — «ок: осмотрено 214 файлов»; `check-no-status-table.py` — «ок: осмотрено 93 файлов .md»;
  `check-task-docs.py` — «ок: осмотрено 51 файлов задач»; `check-tests-have-checks.py` — «ок: осмотрено 37 файлов тестов»; `check-wiring.py` — «ок: осмотрено 20 стражей»;
  `check-md-links.py` — красный ровно по `spec-review-12.md:47` и `spec-review-13.md:41`; `check-text-hygiene.py` — красный ровно по `spec-review-3.md:221`, `spec-review-4.md:156`, `spec-review-4.md:157` (все пять — записи 001, Н-11, Г6).
- Имитация `pre-push` по каждому коммиту ветки (одноразовый клон и одноразовый удалённый репозиторий во временной папке, хуки только в клоне, общий `.git` не тронут), после пересборки: `git push` ветки прошёл (код 0, «осмотрено 39 коммитов пуша»); стражи по каждому коммиту (секреты, имена с временным списком, гигиена текста, сообщение): судилось 39, красных 0. До пересборки красными были все 39 (трейлер) и два ранних коммита (литералы).
- DNC и границы: `git diff --name-only $BASE HEAD -- opencode-plugin/` — пусто; `-- doc/archive/` — пусто; `-- .gitattributes` — пусто; `git diff --stat $BASE HEAD -- doc/canon/decisions/` — только ADR-0002 (+4 строки) и ADR-0006 (+6 строк);
  `git diff --diff-filter=M --stat $BASE HEAD -- 'doc/tasks/*/task/*'` — один файл `doc/tasks/001-crew-service/task/draft-plan-previous.md`, одна строка; положительный контроль: та же команда на одноразовом репозитории с заведомо
  изменённым материалом выводит файл, а шаблон с завершающей косой чертой пуст; `git merge-base --is-ancestor d963ecc HEAD` — код 0; `git push` и `git push --force` не вызывались вовсе (журнал команд сессии).
- Правки по AC-05 (перечень, `git diff --stat $BASE HEAD -- AGENTS.md doc/archive doc/canon doc/tasks/README.md opencode-plugin README.md doc/tasks/001-crew-service`): `AGENTS.md` (REQ-32, О-07, п.15), `README.md` (+3 строки, REQ-32),
  `doc/canon/decisions/ADR-0002` и `ADR-0006` (датированные уточнения, Р-01 и REQ-32), `doc/canon/process.md` (+2 строки, О-03), `doc/tasks/README.md` (таблица и список убраны, О-03), материал 001 (одна строка, О-02). Записи 001 пометками не тронуты (Г6).
- Поиск меток доноров: `git grep -c -i -E "(^|[^A-Za-z])[AB]: (guards|githooks|claude-hooks|install-hooks|\.github)" -- scripts .github .claude` — пусто, код 1; положительный контроль: тот же поиск по `plan.md` находит 16 строк.
- Уровень D (визуальная проверка): N/A, у задачи нет интерфейса: стражи, хуки и CI работают в терминале.

## Трассировка

REQ-01 → `guard-secrets.py` → `test-guard-secrets.py`, `test-pre-commit.py` → 26 и 13 проб, упало 0 (DoD: REQ-01, REQ-06, AC-01, AC-02) → PASS
REQ-02 → `lib/names.py`, `check-private-names.py` → `test-check-private-names.py`, 18 проб; настоящий список владельца не применялся (Г1) → PASS
REQ-03 → `names.load_names`, `lib/find-python.sh` → четыре случая отсутствия списка в `test-check-private-names.py`, `test-run-all.py` → PASS
REQ-04 → вывод без значения, `ci-mask.sh`, шаблон пробы → `test-check-private-names.py` (0 совпадений с контролем), `test-ci-mask.py`; журнал настоящего прогона не получен (Г3, Г4) → NOT VERIFIED
REQ-05 → `lib/guardlib.py` `judged_files` → `test-guardlib.py`, `test-check-private-names.py` → PASS
REQ-06 → `lib/machine_paths.py` → `test-guard-secrets.py` (определение и пробы) → PASS
REQ-07 → `check-md-links.py` → `test-check-md-links.py` (24 пробы) → PASS
REQ-08 → `check-md-links.py` `github_slug`, `heading_anchors` → `test-check-md-links.py` → PASS
REQ-09 → `check-text-hygiene.py` → `test-check-text-hygiene.py` (27 проб) → PASS
REQ-10 → `check-text-hygiene.py` → `test-check-text-hygiene.py` → PASS
REQ-11 → `check-text-hygiene.py` → `test-check-text-hygiene.py` → PASS
REQ-12 → `check-text-hygiene.py` → `test-check-text-hygiene.py` → PASS
REQ-13 → `guard-commit-message.py` → `test-guard-commit-message.py`, `test-commit-msg.py` → PASS
REQ-14 → `lib/message.py` → `test-guard-commit-message.py`, `test-commit-msg.py` (режимы editor, message, diff) → PASS
REQ-15 → `guard-commit-message.py` → `test-guard-commit-message.py` (--ci, без настройки, GITHUB_ACTIONS) → PASS
REQ-16 → `agent-hooks/guard-git.py`, `.claude/settings.json` → `test-guard-git.py` (19 проб) → PASS
REQ-17 → `github-setup.sh protect` → `test-github-setup.py` на подставном gh и `--dry-run`; настоящая защита не применялась (Г4) → NOT VERIFIED
REQ-18 → `githooks/pre-push`, `commit-range.sh` → `test-pre-push.py` (9 проб), имитация по 39 коммитам → PASS
REQ-19 → `commit-range.sh`, `guards.yml` → `test-commit-range.py`; прогон Actions не выполнялся (Г3) → NOT VERIFIED
REQ-20 → `check-task-docs.py` → `test-check-task-docs.py`; дерево «ок: осмотрено 51 файлов задач» → PASS
REQ-21 → `check-task-docs.py` → `test-check-task-docs.py` → PASS
REQ-22 → `check-task-docs.py` → `test-check-task-docs.py` → PASS
REQ-23 → `check-no-status-table.py`, правки README задач и process.md → `test-check-no-status-table.py`; `git grep -c "001-crew-service" -- doc/tasks/README.md` пусто → PASS
REQ-24 → `run-all.sh`, `githooks/pre-commit` → `test-run-all.py`, `test-pre-commit.py` → PASS
REQ-25 → `check-wiring.py` → `test-check-wiring.py` (19 проб), дерево «ок: осмотрено 20 стражей» → PASS
REQ-26 → `prove-red.sh`, `selftest/` → «ок: доказано 13 из 13», `test-prove-red.py` → PASS
REQ-27 → `probe-empty-root.sh`, `guardlib.no_target` → 24 запуска без «ок», `test-probe-empty-root.py` → PASS
REQ-28 → `install-hooks.sh` → `test-install-hooks.py` (11 проб) → PASS
REQ-29 → `.github/workflows/guards.yml` → разобран PyYAML и `dash -n` по скриптам; прогон Actions не выполнялся (Г3) → NOT VERIFIED
REQ-30 → `check-tests-have-checks.py` → `test-check-tests-have-checks.py`; дерево «ок: осмотрено 37 файлов тестов» → PASS
REQ-31 → шапки и комментарии написаны заново → поиск меток доноров пусто (контроль 16), `guard-secrets.py --tree` ноль; список владельца не применялся (Г1) → PASS
REQ-32 → `AGENTS.md`, `README.md`, ADR-0006, `doc/tasks/README.md`, `doc/canon/process.md` → таблица выше, `git grep -n "механизм" -- AGENTS.md` → PASS
REQ-33 → буфер в `pre-commit` → `test-pre-commit.py` (`git commit | head -1`) → PASS
REQ-34 → `time sh scripts/githooks/pre-commit` → 5,6 с при пороге 10 с → PASS
REQ-35 → четыре вида вердикта, `run-all.sh` счёт → `test-guardlib.py`, `test-run-all.py` → PASS
REQ-36 → метки шапок, `check-wiring.py` → дерево «ок: осмотрено 20 стражей» → PASS
REQ-37 → байтовый разбор, UTF-8 вывод → `diff` вывода `run-selftests.sh` под `LC_ALL=C` и `ru_RU.UTF-8` пуст; ubuntu в CI не проверялся (Г3) → PASS
REQ-38 → `guard-commit-message.py` → `test-guard-commit-message.py`, `test-commit-msg.py`, `test-pre-push.py` → PASS
AC-01 → `test-guard-secrets.py`, `test-pre-commit.py`; коммит правки п.15 проходит `guard-secrets.py --commit` (коммит `AGENTS.md: guards, install and mechanism notes`, в имитации красный только по трейлеру) → PASS
AC-02 → `test-guard-secrets.py` (режим дерева) → PASS
AC-03 → `test-check-private-names.py` (CRLF, номер образца, 0 совпадений значения) → PASS
AC-04 → локально четыре случая (`test-check-private-names.py`); прогоны Actions без секрета и с секретом не выполнялись (Г3, Г4) → NOT VERIFIED
AC-05 → на дереве со списком владельца (список из 14 образцов, применён; значения не записаны) `check-private-names.py` и `guard-secrets.py --tree` «ок: осмотрено 215 файлов», перечень правок выше → PASS
AC-06 → `test-check-md-links.py` → PASS
AC-07 → после пометок Г6 `check-md-links.py` на дереве «ок: осмотрено 89 ссылок», материал 001 исправлен одной строкой → PASS
AC-08 → `test-check-text-hygiene.py` → PASS
AC-09 → `test-guard-commit-message.py`, `test-commit-msg.py` → PASS
AC-10 → `test-guard-git.py` (59 команд из 42 строк таблицы), `prove-red.sh` → PASS
AC-11 → скрипт и `--dry-run protect` проверены на подставном gh; вывод `gh api` и пуши не получены (Г4) → NOT VERIFIED
AC-12 → `test-pre-push.py` (cherry-pick, rebase --continue, новая ветка, удаление) → PASS
AC-13 → `test-commit-range.py` (три вида диапазона); прогон Actions не выполнялся (Г3) → NOT VERIFIED
AC-14 → `test-check-task-docs.py`; дерево 001, 002 «ок» → PASS
AC-15 → `test-check-no-status-table.py`; дерево «ок»; в `doc/tasks/README.md` таблицы и ссылок на папки задач нет → PASS
AC-16 → `test-check-wiring.py` → PASS
AC-17 → четыре вида проб в каждом самотесте (проверяет `run-selftests.sh`), «доказано 13 из 13», `git status --porcelain` пуст → PASS
AC-18 → `probe-empty-root.sh`, `test-commit-msg.py` (`--amend -m`) → PASS
AC-19 → `test-install-hooks.py` → PASS
AC-20 → workflow написан; прогоны на ветке задачи и на служебной ветке с нарушением не выполнялись (Г3) → NOT VERIFIED
AC-21 → `test-check-tests-have-checks.py`; «ок: осмотрено 37 файлов тестов» → PASS
AC-22 → со списком владельца `check-private-names.py` и `guard-secrets.py --tree` «ок», поиск меток доноров по `scripts .github .claude` пуст → PASS
AC-23 → таблица выше, `git diff` документов, `git grep -n "механизм" -- AGENTS.md` → PASS
AC-24 → `test-pre-commit.py` → PASS
AC-25 → `time sh scripts/githooks/pre-commit` 5,6 с → PASS
AC-26 → `git diff --name-only $BASE HEAD -- opencode-plugin/` пусто; 37 тестов по одному, упавших 0 → PASS
AC-27 → `git merge-base --is-ancestor d963ecc HEAD` код 0; `git diff --diff-filter=M` — один файл, одна строка; `.gitattributes` не изменён → PASS
AC-28 → строки вердиктов в самотестах, счёт `run-all.sh`; прогон Actions с подложенным пропуском не выполнялся (Г3) → NOT VERIFIED
AC-29 → вывод `run-selftests.sh` под двумя локалями совпал построчно; прогон Actions на ubuntu не выполнялся (Г3) → NOT VERIFIED
AC-30 → `test-pre-commit.py` (грязная рабочая копия, `--only`, неотслеживаемый файл) → PASS
AC-31 → `ci-mask.sh`, шаблон пробы, `github-setup.sh log-search` проверены на подставных данных; прогон на GitHub не выполнялся (Г3, Г4) → NOT VERIFIED
AC-32 → `test-guard-commit-message.py`, `test-commit-msg.py`, `test-pre-push.py` → PASS
DNC-01 → `opencode-plugin/` без правок; `watchRefusal` на дереве с готовым файлом — `undefined`; в `.claude/settings.json` нет `permissions`; `crew-deny.test.mjs` ok → PASS
DNC-02 → `git diff --stat $BASE HEAD -- doc/archive/` пусто → PASS
DNC-03 → в ADR добавлены только датированные уточнения ADR-0002 и ADR-0006 → PASS
DNC-04 → единственное изменение материалов — строка 8 `draft-plan-previous.md` (О-02) → PASS
DNC-05 → история не переписана, `git push` не вызывался → PASS
DNC-06 → `git diff --stat $BASE HEAD -- .gitattributes` пусто → PASS

## RESULT

Implemented: репозиторные стражи (секреты и пути машины, запрещённые имена, гигиена текста, ссылки и якоря, форматы документов задач, таблицы статусов, пустые тесты, сообщение коммита), хук агента для команд оболочки,
хуки git `pre-commit`, `commit-msg`, `pre-push`, установщик, мета-проверка подключения, «доказательство красного», прогон на пустом корне, 21 самотест, workflow CI, скрипт настроек GitHub, правки Канона.
Changed: новые `scripts/`, `.github/workflows/guards.yml`, `.claude/settings.json`; правки `AGENTS.md`, `README.md`, `doc/tasks/README.md`, `doc/canon/process.md`, уточнения ADR-0002 и ADR-0006, одна строка материала 001.
Verification: уровни A (sh, dash, Python 3.9-синтаксис, JSON), B (21 самотест, тесты плагина), E (трассировка), F (красные пробы, «доказано 13 из 13»), G (тесты плагина как в базе) — PASS; уровень C (прогон Actions, защита `main`) — NOT VERIFIED, ворота Г3 и Г4; уровень D — N/A.
Acceptance criteria: PASS — AC-01, 02, 03, 05, 06, 07, 08, 09, 10, 12, 14, 15, 16, 17, 18, 19, 21, 23, 24, 25, 26, 27, 30, 32; NOT VERIFIED — AC-04, 11, 13, 20, 28, 29, 31 (причины в таблице).
How to verify: см. «Пометки AGENTS.md» и «Сквозная приёмка»; команды — в разделе «Стражи» `AGENTS.md`; полный набор самотестов — `sh scripts/guards/selftest/run-selftests.sh` (около 8-10 минут, под нагрузкой — по одному тесту).
Regressions: нет; тесты плагина дают тот же результат, что в базовом состоянии (37 из 37), код плагина не менялся.
Assumptions: Python 3.9 и новее с командой `python`, `git` не старее 2.40, `sh` (Git Bash или dash); ожидаемый адрес автора берётся из `git config user.email` в момент установки; сообщение в смысле «что git сохранит» судится по `GIT_EDITOR` (`:` при `-m`, `-F`, `--no-edit`).
Known limitations: (1) пока не даны слова владельца на ворота, нет прогонов на GitHub (CI, защита `main`, секрет, проба журнала) и прогонов со списком владельца; (2) записи задачи 001 (Н-11) закрыты пометками с причиной на пяти строках (Г6), текст записей не менялся;
(3) Р-07: флаг `-v` в командной строке при `-m`/`-F` хуку не виден (хвост за ножницами судится строже), `core.editor=:` без `-m` даёт режим `message`; (4) хук агента — подсказка, не барьер (Н-12), в живом окне OpenCode не проверялся (U-07).
полный прогон `run-selftests.sh` занимает 8-10 минут из-за хуков git в одноразовых репозиториях (`test-commit-msg.py` около 2,5 минут).
Remaining questions: слова владельца по воротам (раздел «Ждёт владельца»), нет (трейлер убран, ветка пересобрана).
Artifacts: ветка `task-002-guards` (39 коммитов от `$BASE`, включая коммиты журнала), связанное рабочее дерево рядом с репозиторием; переменные и секреты для CI — `CREW_PRIVATE_NAMES` (список владельца), `CREW_PRIVATE_NAMES_PROBE` (временный, из `probe-set`); скриншотов и логов нет (интерфейса нет).

## Ждёт владельца

Остановка на воротах; всё остальное в плане сделано и подтверждено выше. Нужны слова владельца (по одному действию за слово, каждое слово — отдельное разрешение):

- Г1 — ЗАКРЫТ: список из 14 образцов создан оркестратором по слову владельца и применён (значения нигде не записаны); AC-05 и AC-22 подтверждены.
- Г6 — ЗАКРЫТ (слово «метки на 001 — да» получено, пометки поставлены отдельным коммитом `Mark quoted broken links and replacement characters in task 001 records`; страж ссылок и страж текста на дереве зелёные). Было: слово «метки на 001 — да» (отдельный коммит с пометками `guard-allow(md-link)` и `guard-allow(fffd)` с причиной на пяти строках, текст записей не меняется) либо «001 закрыла класс сама»; без этого страж ссылок и страж текста на дереве красны, а хук `pre-commit` в рабочей копии `main` будет отклонять коммиты.
- Г2 — ЗАКРЫТ: `sh scripts/install-hooks.sh` выполнен в общем `.git` (`core.hooksPath` = `scripts/githooks`, `crewharness.expectedEmail` из `user.email`; `merge.ff` не ставится по REQ-28 и решению В9). Путь относительный: он существует в дереве задачи; в живой копии `main` папки `scripts/githooks` пока нет, хуки там не срабатывают и не мешают (проверено `git hook run --ignore-missing pre-commit` — код 0) до слияния (Г5). Пустой индекс: `pre-commit` в дереве задачи — 5,3 с, 7 стражей «ок».
- Г3 — каждый пуш по отдельному слову: «пушь task-002-guards» (первый красный прогон без секрета, ожидаем по AC-04), затем служебные ветки `probe/*` и ветка с подложенным нарушением, затем `main`; для первого пуша нужна область токена `workflow` у менеджера учётных данных git.
- Г4 — запуск `scripts/github-setup.sh` против GitHub по одному действию: `secret`, `probe-set`, `probe-branch <слаг>`, `protect --branch probe/<слаг>`, `protect`, `status`, `probe-clear`; слово вида «запускай github-setup: protect».
- Г5 — слияние в живую рабочую копию `main`: «вливай» (`git merge --ff-only task-002-guards`; приносит `.claude/settings.json` и начинает действовать на работающих агентов, Р-05) и пуш `main`; пробу хука в живом окне OpenCode (U-07) — по отдельному слову «проба хука в окне».

вопрос: жду слов владельца по воротам Г1, Г2, Г3, Г4, Г5 в таком порядке; до этого статус остаётся «в работе».

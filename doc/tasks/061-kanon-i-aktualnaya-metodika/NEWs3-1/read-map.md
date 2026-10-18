# Read map — С3, собственное чтение

Это карта фактически прочитанного в этой сессии, а не аттестация прошлых сессий. Номера строк приводятся по результатам чтения файлов.

| Источник | Собственное чтение | Граница |
|---|---|---|
| `doc/tasks/061-kanon-i-aktualnaya-metodika/task/message.md` | 1–41 целиком | Первичная постановка; позднее назначение С3 и решения из prompt учитывались отдельно |
| `doc/tasks/061-kanon-i-aktualnaya-metodika/spec.md` | 1–129 целиком | Утверждённый subject; не менялся |
| `doc/tasks/061-kanon-i-aktualnaya-metodika/owner-gate-decisions.md` | 1–65 целиком | Дословные решения/границы |
| `doc/tasks/061-kanon-i-aktualnaya-metodika/catalog-owner-decision-2026-10-16.md` | 1–18 целиком | Дословное решение и статус каталога |
| `doc/tasks/061-kanon-i-aktualnaya-metodika/analysis.md` | 1–61 целиком | Краткая актуальная аналитическая карта |
| `doc/tasks/061-kanon-i-aktualnaya-metodika/spec-trace.md` | 1–645 целиком | A01–A94, локаторы и future mapping |
| `doc/tasks/061-kanon-i-aktualnaya-metodika/031-impact.md` | 1–439 | Остаток после 439 не прочитан; покрытие C01–C60 планируется по полной карте, но я лично не перечитал её остаток. Это ограничение С3, не заявленный полный аудит |
| `doc/tasks/061-kanon-i-aktualnaya-metodika/method-delta.md` | 1–445 целиком | До строки 445 включительно; продолжение после 445 требует отдельной проверки С4 |
| `doc/tasks/061-kanon-i-aktualnaya-metodika/source-inventory.md` | 1–399 целиком | Наследованные ranges не считаются моим чтением первичных исходников |
| `doc/canon/README.md` | 1–41 целиком | Вход и параметры |
| `doc/canon/process.md` | 1–248 целиком | Нормативные отличия/добавления, gates, result placement, overrides |
| `doc/canon/decisions/README.md` | 1–68 | Реестр просмотрен по этим строкам; перечень далее не прочитан этой сессией |
| `doc/canon/decisions/ADR-0006-public-repository.md` | 1–49 | Начало документа просмотрено, файл далее не прочитан полностью |
| `doc/canon/decisions/ADR-0007-plan-in-task-epics.md` | 1–59 | Целиком |
| `.opencode/crew-harness.json` | 1–94 | Read-only, целиком |
| `AGENTS.md` | полный текст в предоставленных инструкциях | Не перечитывал файл отдельной командой |
| 045 `plan.md` | 1–175 | Остаток не прочитан; plan относится к чужому uncommitted worktree |
| 013 worktree | root listing + `ls-files src/runner_core`, `Test-Path src`, `Test-Path src/runner_core` | Вывод ls-files пуст, обе проверки `False`; ни spec, ни task content не читались в этой С3 |
| External methodology | `git diff a449..78ed` по `completeness-check.md`, `doc/open-questions.md`, `methodology.md`, `task-sessions.md`; presentation diff path перечислен | Не полное чтение внешних методических файлов. Методические детали взяты из diff, не заявляю whole-file read |

Инструментальный отказ при первой команде сравнения: PowerShell отклонил unquoted `^{commit}` аргумент с `ScriptBlock...`; исправленный вызов в кавычках прошёл. Это не изменило внешние деревья и не требует исправления history.

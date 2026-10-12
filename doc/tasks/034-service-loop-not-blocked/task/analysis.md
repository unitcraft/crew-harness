# Разбор: что блокировало цикл службы (задача 034)

## Главное открытие

`leftoversOf` уже был асинхронным (`execFile`), но шаг `leftWatch` вызывал перед ним `loadConfig(t.directory)`. Тот через
`settings.ts` (`readSettingsFolder`, кеш 5 с) делает подряд 4-6 синхронных `execFileSync("git")` (`rev-parse`, `symbolic-ref`,
`show`), а при `acceptance_file` ещё и `git show` в `acceptance-file.ts`. Те же вызовы стояли в `assignReviewers`, `planSteps`,
`syncTitles` (через `loadConfig`/`profileState`). Каждый вызов под нагрузкой — секунды, цикл службы стоит.

## Места и решения

| Место | Откуда зовётся | Решение |
| --- | --- | --- |
| `settings.ts` `readSettingsFolder` (rev-parse, symbolic-ref, show) | `loadConfig` из шагов прохода и инструментов | Переведено: чтение — генератор, два водителя. Первое чтение папки и режим без службы — синхронно; в службе (`background.on`) устаревшее значение отдаётся сразу, перечитывание идёт в фоне через `gitAsync`. |
| `acceptance-file.ts` `git show` | `loadConfig` | Переведено так же (устаревшее сразу, обновление в фоне). |
| `review.ts` `gitA` (`leftoversOf`) | `leftWatch` | Переведено на общую очередь `gitAsync` (предел 8-20 с, не более 2 процессов). |
| `review.ts` `fileAt` | шаг `planSteps` | Для прохода добавлен `fileAtAsync`; `fileAt` оставлен для инструментов. |
| `review.ts` `isMerged`, `cleanupDone`, `autoTrack`, `keptOnBranch`, `resolveKeep`, `removeSide` | обработчики инструментов `crew_task` (по вызову сессии) | Оставлено: не в проходе, действие одной сессии, цепочка вызывающих велика. |
| `core.ts` `repoLabel`, `repoName` (rev-parse) | на первое обращение, затем кеш по папке | Оставлено: один раз на папку. |
| `core.ts` 1873, 2610 (`--show-toplevel`) | обработчики инструментов | Оставлено. |
| `config-diverge.ts` `git show` | `crew_doctor`, панель; кеш 5 с | Оставлено. |
| `precheck.ts`, `journal.ts` (`rev-parse HEAD`), `profile-windows.ts`, `github.ts` (`gh auth token`), `watch.ts` (`where git`, `taskkill`) | инструменты и разовые запуски | Оставлено. |

## Предел времени шага

`async-git.ts`: `forEachBudget` (с курсором между проходами) для `leftWatch`; `stepBudget` для `assignReviewers` и
`syncTitles` (сделанное само выпадает из выборки). Между элементами цикл событий получает слово; предел `STEP_BUDGET_MS` = 5000;
в журнал одна строка `step X yielded after N ms (done k of m)`. Медленный шаг (>1000 мс): `slow step X: N ms`, не чаще раза
в минуту на шаг (обёртка `step()` в `index.ts`).

## Что осталось блокирующим

- Первое чтение настроек каждой папки (старт службы) и вызовы инструментов — синхронные git.
- Чтение файлов задач/карточек (`listTasks`, `allCards`), `writeFileSync` кешей — локальные, но на 100% процессоре и диске тоже
  медленны; не измерялись.
- База OpenCode (несколько ГБ) в плагине не читается.
- Блокировка из-за не-git причин (сборка контекста, GC) этой задачей не лечится.

## Как мерить эффект

В `%TEMP%/opencode-plugins.log`: строки `loop lag N ms` (число и величина за сутки до и после перезапуска службы с правкой),
новые строки `slow step X: N ms` и `step X yielded ...`. Ожидание: `loop lag` с названием шага `leftWatch`/`assignReviewers`/
`syncTitles` больше не превышает несколько сотен мс.
Откат режима: переменная `CREW_HARNESS_SYNC_GIT=1` у службы возвращает синхронное чтение настроек.

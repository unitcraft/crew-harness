Заход 3: существенных 0, поверхностных 0, проб 4

Объект: `git diff main HEAD -- opencode-plugin` (ветка 015-subplan-stage): две правки, `opencode-plugin/index.ts:982` и новая клетка в `opencode-plugin/test/crew-profiles-select.test.mjs`. Код не правился. Тесты по одному, с паузой 7 с, все зелёные: `crew-profiles-select`, `crew-profiles-data`, `crew-profiles-cmd`, `crew-plan-task`, `crew-tier`, `crew-model`. Весь `npm test` не гонялся.

## Находки

Нет. Поверхностная находка 2 из `review-2.md` (этап `develop` в записи среза у шага-подплана) закрыта этой правкой. Поверхностная находка 1 из `review-2.md` (`/crew-sets show` для spec/delivery) закрыта раньше: `opencode-plugin/profile-cmd.ts:380-384` печатает «окно не применяется: у этапа пока нет сессий».

## Правка index.ts:982

- В `stampClamp` вместо литерала `"develop"` стоит `stageOfLaunch(t, "executor")` (`opencode-plugin/profiles.ts:202`): задача с полем `plan` даёт `plan`, обычный шаг даёт `develop`. Подплан создаётся на `index.ts:973-979` с `plan`, переменная `t` в этой точке уже задана.
- Выбор модели не менялся: `model` и `tier` считаются выше (`index.ts:964-965`) по `clampTier("medium", cfg.tierBounds)`. Аргумент `stage` у `stampClamp` (`opencode-plugin/core.ts:1379`) попадает только в поле `stage` записи `profiles[]` и в строку события и журнала.
- Ветка с набором (`stampProfile(stepChoice)`) не тронута: шаги авто-плана с набором выбираются по клетке `develop` (`index.ts:939`), это прежнее решение.

## Пробы

1. Регрессия теста. Копия `opencode-plugin` во временной папке, в `index.ts:982` возвращён литерал `"develop"`, запуск `node --experimental-strip-types test/crew-profiles-select.test.mjs`. Вывод: `FAIL 015 review-2 #2: a sub-plan step without a set is a plan task and its clamp record says stage plan (not develop) :: [true,[{... "stage":"develop", ... "tier":"light","model":"claude-code/haiku", ... "clamped_from":"medium"}]]` и `crew-profiles-select.test: FAIL 1`. На ветке с правкой тест проходит (`crew-profiles-select.test ok`). Тест ловит регрессию. Побочно видно, что модель и ступень (haiku, light) при регрессии те же, то есть правка меняет только поле `stage`.
2. Срез границами на путях без набора. Тесты `crew-tier` (`crew_spawn`, `reassign`, приёмщик без клетки) и `crew-profiles-select` (шаг авто-плана: клетки 016 review-1 №1 и №3, подплан: новая клетка) прошли. Обход мест выбора модели: `crew_spawn` (`core.ts:1770, 1801`), шаг авто-плана (`index.ts:964-982`), приёмщик (`index.ts:598-600, 679`), `reassign` (`core.ts:2217, 2239`); каждое место даёт срез и запись через `clampTier`/`stampClamp` или `resolveStageProfile`. Неохваченных путей нет.
3. Наследование и псевдоним, реальный запуск `profiles.ts` (скрипт во временной папке, набор: develop=claude/heavy, plan=codex/task, accept=codex/medium). Вывод:
   - `develop claude/heavy explicit`
   - `develop_accept codex/medium explicit`
   - `plan codex/task explicit`
   - `plan_accept none`
   - `spec codex/task inherited from plan`
   - `spec_accept none`
   - `delivery claude/medium inherited from develop`
   - `delivery_accept codex/light inherited from develop_accept`
   - `alias develop_accept {"family":"codex","tier":"medium"}`
   - `new beats old {"family":"claude","tier":"light"}`
   - `clamp [{"tier":"medium","from":"heavy"},{"tier":"medium","from":"light"},{"tier":"medium"}]`
   Все восемь этапов дают ожидаемое. Сдача берётся ступенью ниже, разбор без ступени ниже, `plan_accept` без явной клетки пуст (идёт по `spawn_models`, как задумано), поэтому и `spec_accept`, наследующий от него, пуст. `accept` читается как `develop_accept`, новое имя главнее. Совпадает с `INHERIT` (`opencode-plugin/profiles.ts:234-239`) и `opencode-plugin/README.md:516`.
4. Осмотр diff на безопасность: поиск по `git diff main HEAD` путей машины (диски, домашние папки), слов token, secret, api key, password, приватных имён и трейлеров соавторства — совпадений 0; `git status --short` пуст (кроме этого файла). Вне `opencode-plugin` изменений нет.

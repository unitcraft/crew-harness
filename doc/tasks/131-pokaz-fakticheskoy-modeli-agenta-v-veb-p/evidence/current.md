# Текущее доказательство — задача 131

## Контракт

- Источник — ACP `session/new` response `configOptions` и полные `config_option_update.configOptions`.
- Берётся первый по порядку `category: "model"`, `type: "select"`; `currentValue` сопоставляется с именем в плоских или сгруппированных `options`. При отсутствии данных передаётся пустая модель, UI показывает «Модель не сообщена».
- `models.currentModelId`, имя агента, глобальные настройки, `_meta`, provider и variant не используются.
- `session_model` — событие истории сессии, обновляется только при большем `step`; чужая сессия отфильтровывается ACP-клиентом.
- UI slot: `span.session-model-slot[data-session-model]` рядом с именем агента; CSS/layout остаётся зоной 130.

## Проверки

- RED до правки: `node --test --test-name-pattern="модель сессии" test/state.test.mjs` падал — reducer не знал `session_model` и не сохранял модель.
- GREEN: полный web-набор `node --test test/*.test.mjs` — 102/102.
- `node --check src/acp/testdata/fake_agent.mjs` — без ошибок.
- `git diff --check` — без ошибок.
- Nova-наборы `nova test src/acp`, `nova test src/acp_live` и серверные тесты не запускались: `nova` и указанный в `spikes/env/README.md` setup-env отсутствуют в доступной среде.

## Осталось

- Повторить полный затронутый набор Nova для ACP, ACP live и server в среде с Nova; проверить компиляцию и исполнение новых ACP/hub тестов.
- Независимая приёмка, exact candidate/precheck и merge gates.

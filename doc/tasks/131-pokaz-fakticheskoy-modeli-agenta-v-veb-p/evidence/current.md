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
- `nova test src/acp` — PASS: 1, FAIL: 0.
- `nova test src/acp_live` — PASS: 1, FAIL: 0.
- `nova test src/server` — PASS: 2, FAIL: 0.
- Все три Nova-прогона выполнены штатным Nova Oracle 0.1.0 из toolchain, предоставленного интегратором, через очередь машины. Первый вызов собрал libuv/runtime cache; повторных сборок toolchain не делалось.

## Осталось

- Независимая приёмка, exact candidate/precheck и merge gates.

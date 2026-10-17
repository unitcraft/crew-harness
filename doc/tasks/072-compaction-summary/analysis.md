# Разбор 072: сводка при сжатии контекста — коротко и по образцу

Задание — `task/message.md`. Источник разбора: собранный JS внутри исполняемого файла `opencode` версии 2.0.26 (читается как текст) и
типы `@opencode-ai/plugin` 1.18.9 (для 2.0.26 устарели). Живую службу не трогали, второго окна OpenCode не запускали.

## 1. Разбор

### 1.1 Влияет ли плагин на сводку сейчас

Нет. Плагин регистрирует только хуки сессии `context` (подсказка вкладки) и `model.request` (модель вкладки); слово `compaction` в
коде встречается лишь при подсчёте времени активности (`core.ts`, строки `session_message` вида `compaction`). Сводку целиком пишет
OpenCode.

### 1.2 Есть ли способ влиять: да — хук сессии `compaction`

Доказательство из сборки (сервис `SessionModelRequest`):

- запрос сжатия строится тем же конструктором, что основной, но с отдельным хуком: `compaction:(p)=>a("compaction",p,u("compaction",p.agent))`,
  где `u=(p,f)=>(g,C)=>e.trigger("session",p,{...g,agent:f,tools:C})`; снимок запроса — `sessionID, model, system, messages, options`, плюс
  `agent` и `tools`;
- хуки вызываются по порядку регистрации и меняют снимок на месте, сервис возвращает его же; дальше запрос строится из изменённых `system`
  и `messages`;
- имя хука — просто строка: `ctx.session.hook(имя, функция, параметры)`; сама сборка регистрирует `for(let g of["context","compaction","generate"])`
  для своих правил;
- `ev.system` у `compaction` того же вида, что у `context`, поэтому тот же `ev.system.push({type:"text", text})`, что делает плагин для
  подсказки, подходит и здесь;
- старого хука `experimental.session.compacting` (в типах 1.18.9 — «заменить промпт») в сборке 2.0.26 нет: строки `session.compacting`,
  `experimental.session.compacting`, `experimental.compaction.autocontinue` не найдены; типы устарели.

### 1.3 Что нельзя

Шаблон сводки и рамка запроса — константы сборки. Они добавляются после хука последним сообщением пользователя, поэтому хук не может ни
заменить, ни убрать их; он может дополнить системную часть и историю. Сводка принимается, только если в ней есть хотя бы одна
строка-заголовок шаблона (`## Objective`, `## Requirements`, `## Decisions`, `## Work State`, `## Next Move`, `## Relevant Files`,
`## Important Context`); иначе запрос повторяется с напоминанием, а при втором промахе сжатие падает с «Compaction summary did not match
the required template». Поэтому образец не меняет заголовки шаблона, а раскладывается под них.

### 1.4 Настройки

- `opencode.jsonc`, `compaction`: `auto`, `keep.tokens`, `buffer` (старое имя `reserved` читается как `buffer`), устаревшие `tail_turns` и
  `prune`. Настройки для текста промпта нет.
- В настройке провайдера или модели `settings.compaction.type`: `summary` (по умолчанию, текстовая сводка) или `native` (сжатие делает
  провайдер; шаблон тогда не используется и наше правило не действует).
- Скрытый агент `compaction`: `config.agent.compaction.model` и `.system`; `system` заменяет системный текст запроса, шаблон остаётся.
  Это правка `opencode.jsonc` владельца, которую задача не делает, и она действовала бы на все проекты; плагин решает то же для своих
  вкладок хуком.

### 1.5 Действующий промпт сжатия (дословно, из сборки 2.0.26)

Запрос сжатия: система вкладки (плюс правило плагина, если включено) + история до границы «хвоста» + последнее сообщение пользователя из
абзацев. Первое сжатие вкладки начинается с «You MUST summarize the conversation above into a structured summary that will be given to
another agent to resume the work.»; если в истории уже есть сводка — с «Update the existing checkpoint in the conversation above into one
consolidated summary.» и правил обновления («Newer history always takes precedence over the existing checkpoint…»). Дальше в обоих
случаях идут одни и те же абзацы:

1. «Summarize only what the user and the assistant said and did. Leave out instructions and setup the assistant was given rather than told
   by the user: repository conventions, instruction files such as AGENTS.md, and environment details like the session ID. The next agent
   receives current versions of all of these separately.»
2. Шаблон (`<template>`): `## Objective`, `## Requirements`, `## Decisions`, `## Work State` (`### Completed`, `### Active`, `### Blocked`),
   `## Next Move`, `## Relevant Files` (до 15 путей), `## Important Context` («facts the next agent cannot continue without and cannot easily
   find on its own; or "(none)"»).
3. Правила: «Keep each section concise… Prefer short references over detailed restatement… Preserve exact file paths, symbols, commands,
   error strings, URLs, and identifiers… Carry forward only user questions or requests that remain unanswered… Preserve consequential
   workflow state, including whether changes are uncommitted, committed, pushed, under review, or merged… Do not mention the summary
   process or that context was compacted.»
4. «Do not continue the task or call tools.»
5. «Return only the structured summary in the requested format. Do not include a preamble, explanation, or other commentary.»

Блок «Important Context» со скриншота владельца — последний раздел этого шаблона. Вероятная причина его вида: правило «Preserve exact …
identifiers» плюс «facts the next agent cannot continue without» модель читает как «хеши, номера, оговорки»; про даты слов владельца, пути
и запреты шаблон молчит, а «Work State» и «Decisions» просят «why», что тянет процессные подробности (это вывод по тексту, живая сводка не
воспроизводилась).

### 1.6 Выбранный путь и обоснование

Хук `compaction` плагина, а не запасной путь через подсказку вкладок:

- подсказка вкладок (`context`) уходит в каждый запрос вкладки, предел TT-1e — 1100 знаков (занято 1088), образец в него не помещается, а
  изменение подсказки заново оплачивает историю всех вкладок; хук `compaction` действует только на запрос сжатия;
- правило, прочитанное вкладкой за сотню ходов до сжатия, шаблон последнего сообщения перебивает; правило в системной части самого запроса
  сжатия стоит рядом с шаблоном.

Правило дополняет, а не заменяет шаблон, и раскладывает образец под его заголовки. Включение — настройка `compaction_summary` (по
умолчанию `true`); вкладкам с провайдером `claude-code` текст не добавляется (их сжимает сам Claude Code), как и подзадачам-детям (у
плагина для них нет карточки).

### 1.7 Где лежит образец

В Каноне, `doc/canon/process.md`, раздел «Сводка при сжатии контекста», а не в README плагина: образец — правило работы вкладок,
одинаковое для всех проектов и окон; README описывает механизм и настройку и ссылается на Канон. Английская запись образца
(`opencode-plugin/compaction-summary.ts`) — не второй источник: тест `crew-compaction-summary` сверяет с Каноном пять названий разделов и
заголовки шаблона.

## 2. Образец сводки (то, что плагин требует от вкладки)

Язык владельца; слова владельца дословные; код, пути и команды — как есть. Порядок 1–1,5 тысячи знаков на раздел, всего до 6 тысяч.

| Раздел образца | Что в нём | Заголовок шаблона OpenCode |
|---|---|---|
| Что решил владелец | слова владельца дословно, с датой и источником; решение, которое позднее слово изменило или сняло, не повторяется | Decisions |
| Открытые вопросы владельцу | вопрос, рекомендация и довод, кто ждёт ответа; отвеченное не повторяется | Work State, Blocked |
| Что идёт и что ждёт | задачи с названием, а не номер один; сессии с видом; кто чего ждёт | Work State, Active и Blocked |
| Где лежат документы | пути (папки задач, спецификации, планы, журналы), не хеши | Relevant Files |
| Что нельзя делать | запреты владельца и границы работы, каждый с датой и источником | Requirements |

Хеши коммитов и файлов, номера карточек запуска и сессий, процессные оговорки проверяющих — только если без них нельзя продолжить (под
Important Context), иначе ссылкой на файл или «(none)». Рассказа о ходе работы, вывода инструментов и тестов в сводке нет.

## 3. Что сделано

1. Красная проба до кода — `opencode-plugin/test/crew-compaction-summary.test.mjs` (24 клетки красные из 26), коммит `6cf172a` перед правкой кода.
2. Хук `compaction` в `index.ts` (после `context`, в `try`, как `model.request`): без `sessionID` и без массива `system` — выход; провайдер
   `claude-code` — выход; нет карточки вкладки (подзадача) — выход; `compaction_summary: false` — выход; иначе `ev.system.push({type:"text", text})`.
3. `compaction-summary.ts` — `COMPACTION_SECTIONS` и `compactionSummaryText(язык)`; в шапке ссылка на Канон.
4. Настройка `compaction_summary` (`config-schema.ts`, `core.ts`): булево, по умолчанию `true`; снимок `answer-golden.json` обновлён только по двум
   ключам (`config: guide`, `config: show`).
5. Канон — раздел «Сводка при сжатии контекста» в `doc/canon/process.md`; README плагина — абзац; строка в `test/README.md`; открытый вопрос.

## 4. Проверка

- Красная проба до кода: `crew-compaction-summary` 24 FAIL из 26 клеток; после правки зелёный.
- Исполнитель. Полный `npm test`: 114 файлов, по 4 одновременно; зелёных 112; `crew-hung-turn` и `crew-progress` (AC-11, медиана 1,34 мс при
  пределе 1 мс) упали под нагрузкой и прошли при отдельном запуске. Стражи: ок 8, FAIL 0. Живое сжатие не запускалось.
- Оркестратор: сборка вместе с 073 — итог в `log.md`.

## 5. Не сделано

- Действие правила на настоящую сводку не измерено: живое сжатие вкладки требует обновления основной копии и перезапуска службы (владелец, AGENTS.md, пп. 11–12) → open-questions #8.
- Сжатие типа `native` (провайдер пишет сводку сам) правило не затрагивает → не нужно, потому что в настройках владельца оно не включено (`compaction.type` не задан, действует `summary`), а при включении шаблон всё равно не плагина.
- Проверка длины и состава готовой сводки программой → не нужно, потому что сводка рождается в процессе OpenCode и плагин её текста не видит; соблюдение образца судит владелец по первой сводке (Канон, раздел о сводке).

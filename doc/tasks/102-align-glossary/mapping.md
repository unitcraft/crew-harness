# Таблица расхождений: имена кода продукта и словарь методики (версия 6)

Образец: `state-machines/state-machine-glossary.md` (версия 6, 2026-10-19; в задании названа «версия 5, разделы 1–2»: номер вырос на единицу из-за журнала, раздел 3.2 словаря — это то же письмо о расхождениях) и `state-machines/state-machine-journal.md` репозитория `unitcraft/ai-dev-methodology`, коммит `744e0af` (только чтение). Продукт до задачи — словарь `src/engine/GLOSSARY.md` (версия 091, коммит методики `03b93a2`).

Решения: **переименовать** — имя продукта заменено именем словаря; **ввести** — имя словаря появляется в продукте впервые; **убрать** — имени словаря нет, понятие вытесняется другим; **оставить: причина** — у имени нет соответствия в словаре либо Oracle 0.1.0 или смысл продукта не дают заменить.
Чего в продукте нет и что не добавляется (слово задания: «не реализовано — не добавлять»): ворота, вратарь, усиленный исполнитель (`"enhanced"`, `enhanced_attempt`), вложенные машины (`signal`, `reply`, `NestedSignal`, `Callable`), пауза и общие события (`CommonEvent`), объекты (`Objects`), `Rerun`, `NotAwaited`, `Kind`/`AppealDescription`, `model_tally`, `StopWord`, `Summary` (`essential`/`critical`/`probes`). Для них в продукте нет имён, поэтому переименовывать нечего; этих слов в `src/` нет.

## 1. Типы, протоколы, эффекты

| Имя продукта (091) | Имя словаря | Решение |
|---|---|---|
| `Event` (конверт события: `id`, `trace`, `step`, `kind`, `name`, `request`, `input`, `at`) | `Incoming` (раздел 3.2, п. 10: «проектное `Event` = наше `Incoming`») | **переименовать** в `Incoming`. `Event` теперь событие машины: у машины чата это `ChatEvent` (см. раздел 5) |
| `EventKind` (`Input`, `Progress`, `Answered`, `Refused`, `Expired`) | нет (п. 19: «вид события — вариант `Event`»); ближе всего `Received` (`ResponseReceived`, `WordReceived`, `RequestExpired`) | **оставить: нет соответствия.** У `Received` нет `Progress` (частичные данные, продлевающие срок), у продукта нет обобщённых `Received[Event, RoleResult]`; конверт кодирует событие машины как `name` + `input` (границу решает Oracle, п. 8) |
| `Agent` (эффект: `send`, `receive`, `cancel`, `ack`) | `Link` (п. 13) | **переименовать** в `Link`. Операции `send`, `receive`, `cancel` совпали; `ack` оставлено (подтверждение входящего после фиксации, задание 095; в методике нет); `signal` и `reply` не вводятся (вложенных машин и вызывающей стороны нет) |
| `Journal` (эффект: `write`, `read_all`), `Store` (`save`, `load`) | `Journal` (`write`), `Store` (`save`, `load`) | совпадает; `read_all` — операция чтения журнала при возобновлении, в методике нет — **оставить** |
| `Machine` (протокол `name`, `initial`, `state_name`, `step`) | `Machine` (протокол, п. 11) | имя совпадает; протокол стал обобщённым `Machine[S]` (S — состояние), `step` возвращает `Transition[S]` и получает `Environment` (см. п. «Шаг» ниже) |
| `Engine[M]` | `Engine` (п. 12) | **переименовать параметры:** `Engine[M, S]`; методика называет параметров больше |
| `StepResult { state, outputs }` | нет отображения (п. 18) | **убрать:** шаг возвращает `Transition[S]` |
| `StepOutput` (`Send`, `Log`, `Cancel`, `Save`, `Finish`), `LogNote` | нет отображения (п. 18) | **убрать.** Побочное идёт через `Environment`; записанные за шаг приказы лежат у движка в `Order` (внутренняя запись реализации среды, не часть контракта машины) |
| `SendOrder`, `CancelOrder`, `Conclusion` | нет отображения (п. 18: «`Conclusion` не используется») | **оставить: нет соответствия.** Это аргументы операций среды продукта (`order_send`, `order_cancel`, `order_finish`): в методике запрос рождается из описания обращения состояния, отмена — правилом 18 движка, конец — видом `Final` и `end_response`; продукт держит явные приказы, как в 091 |
| — | `Transition[State]` (`Go`, `Stay`, `Rerun`, `NotAwaited`) | **ввести** `Transition[S]` с `Go(S)` и `Stay`; `Rerun` и `NotAwaited` не вводятся: перезапуска состояния и очереди «не ждёт» в продукте нет |
| — | `Environment` (протокол) | **ввести.** Операции: `write_journal(JournalEvent)` — как в словаре; `order_send`, `order_cancel`, `order_save`, `order_finish` — имён в словаре нет (см. выше «`SendOrder`…»), выбраны по приказам продукта. Реализует `StepEnvironment` движка (записывает приказы по порядку) |
| — | `JournalParam`, `JournalEvent` (версия 6) | **ввести** как в методике: `JournalParam { name, value }`, `JournalEvent { code, params }`; помощники `param(name, value)`, `journal_event(code, params)` |
| `JournalEntry { trace, step, cause, state, request, at, kind, text }` | `JournalEntry { trace, step, cause, state, request, at, event, model_tally }` (п. 16) | **переименовать/убрать поля:** `kind` убрано, `text` заменено на `event: JournalEvent`; `model_tally` не вводится (учёта токенов по моделям в продукте нет); `at` остаётся числом миллисекунд (методика: `Timestamp`; смена типа сломала бы формат строки и тесты часов, поведение не меняется) |
| `Snapshot { step, data }` | `Snapshot { engine_data, machine_data }` | **оставить: причина.** Обработчики (файл, `jsonb` с проверкой «объект») хранят один JSON-объект; две строки потребовали бы менять схему хранения. Граница, о которой говорит п. 15 — кодирование состояния только в снимке, — выполнена: поле `state` в JSON снимка — вложенный объект состояния (`Machine.encode_state`), старый снимок (`machine_state` текстом) читается |
| `EngineState` (запись, обобщена по состоянию: `EngineState[S]`) | `EngineState[State]` | имя совпадает; поля — раздел 2 |
| `OpenRequest { id, party, attempt, step, input, idle_term, deadline }` | `Waiting { sent, term }` (п. 17) | **переименовать/убрать поля:** `idle_term` и `deadline` заменены полем `waiting: Waiting`; `OpenRequest` остаётся (хранит `input` для повторной отправки, в методике запрос лежит в списке `open_requests` строк и данных машины) |
| — | `Waiting` | **ввести** `Waiting { sent, term }`: `sent` — часы (мс) на момент заказа или продления, `term` — срок бездействия; «нет ответа в срок», когда `term > 0` и `sent + term <= now` (поведение 091 то же) |
| `PartyCounter { party, attempts }` | нет (п. 19) | **оставить: нет соответствия.** В методике счётчики попыток — поля данных машины (`…_attempt`, `next_attempt`); в продукте их держит движок (правило 15) |
| `FailCode`, `Request`, `Reply`, `Rejection`, `Response` (`Answer`, `Refusal`) | те же (пп. 14, 21) | совпадают, десять кодов те же |
| `Outcome` | — | не заводится (занято прелюдией Нова), как и в словаре |
| `MemoryWorld` | нет | **оставить: нет соответствия** (двойник мира для тестов) |
| `ChatSession`, `ChatState`, `ChatEvent`, `ChatStep` | нет (п. 22: демонстрационная машина «не отображается») | `ChatStep` **убрать** (шаг возвращает `Transition[ChatState]`); остальные **оставить: причина.** Словарь называет перечисления машины `State`, `Event` внутри её модуля; приставка `Chat` держит их различимыми от параметра `S` и от `Incoming` в файлах, где подключено и то и другое, а `Event` рядом с драйвером PostgreSQL путался в 098 (`spikes/env`, п. 22; после переименования движка в `Incoming` совместная сборка не проверялась) |

## 2. Поля

| Тип | Имя продукта | Имя словаря | Решение |
|---|---|---|---|
| `Request`, `Reply`, `Rejection` | `id`, `attempt`, `party`, `input`, `idle_term`, `trace`, `step`, `request`, `result`, `reason`, `text` | те же (раздел 2.9) | совпадают |
| `Incoming` | `id`, `request`, `trace`, `step`, `at` | `id`, `request` (`Incoming`); `trace`, `step`, `at` — в конверте движка | остаются |
| `Incoming` | `kind`, `name`, `input` | `party`, `body` | **оставить: причина** (см. `EventKind`): тело события машины в продукте — пара `name`/`input`; `party` не вводится, сторона события видна из запроса |
| `EngineState` | `trace`, `step`, `event_counter` | те же | совпадают |
| `EngineState` | `machine_state` (текст) | `state` (типизированное, п. 15) | **переименовать в `state` и типизировать** (`EngineState[S]`): Oracle 0.1.0 позволяет, если типы указывать явно (обход, раздел 6) |
| `EngineState` | `open` | `open_requests` | **переименовать** в `open_requests` (список записей `OpenRequest`, не строк) |
| `EngineState` | `closed`, `counters`, `final_kind`, `final_text`, `final_code`, `final_step` | нет | **оставить: нет соответствия** (закрытые запросы для отказа «ответ на закрытый запрос», счётчики сторон, итог сессии — задание 091, правила 15, 17, 35) |
| `Engine` | `machine`, `id` | `machine` | совпадает; `id` — идентификатор сессии, в методике это `call_request_id` данных движка, **оставить** (запроса вызова в продукте нет) |
| `Engine` | `state` (данные движка) | `engine_state` (соглашение 3: «`@engine_state.<поле>`») | **переименовать** в `engine_state` |
| `Engine` | `to_send` | `to_send` (там — стороны набора, здесь — заказанные и не отправленные запросы) | **оставить** (то же понятие «к отправке») |
| `Engine` | `to_cancel`, `to_ack` | нет | **оставить: нет соответствия** (отмены после фиксации; ключи подтверждения входящих, задание 095) |
| `JournalEntry` | `trace`, `step`, `cause`, `state`, `request`, `at` | те же (п. 16) | совпадают |
| `JournalEntry` | `kind`, `text` | `event` | **убрать** оба, добавить `event` |
| `JournalEvent`, `JournalParam` | `code`, `params`, `name`, `value` | те же | введены |
| `Waiting` | `sent`, `term` | `sent`, `term` | введены |
| `Snapshot` | `step`, `data` | `engine_data`, `machine_data` | **оставить** (см. раздел 1) |
| `MemoryWorld` | все | нет | оставить |

## 3. Функции, методы, операции

| Имя продукта | Имя словаря | Решение |
|---|---|---|
| `Engine.commit` | `commit` | совпадает |
| `Engine.accept` | `on_arrival` (при приходе: приём в порядке прихода, счётчик событий, отбрасывание чужого, фиксация) | **переименовать** в `on_arrival` |
| `Engine.dispatch` | `send_requests` (посылает запросы обращения) | **оставить: причина.** `dispatch` ещё сообщает обработчику подтверждения и посылает отмены; `send_requests` посылает только запросы обращения |
| `Engine.pump` | `run_loop` (цикл до готового ответа) | **оставить: причина.** `pump` — один оборот цикла, возвращает число шагов; `run_loop` крутится до ответа |
| `Engine.feed` | нет | оставить (приём и отправка вместе, нет соответствия) |
| `start_engine`, `resume_engine` | `start`, `resume` (методы уже созданного `Engine`, принимают запрос вызова) | **оставить: причина.** Свободные функции создают исполнителя по машине и идентификатору; у методики методы существуют на готовом исполнителе и берут запрос |
| `restart` (внутренняя функция) | `after_restart` | **оставить:** строит исполнителя и делает шаг «перезапуск»; `after_restart` — метод готового |
| `EngineState.close` | `close_request` (убрать из открытых, запомнить) | **переименовать** в `close_request` |
| `EngineState.bump` | `next_attempt` (метод `Machine`) | **оставить: причина** (счётчики у движка, не у машины) |
| `EngineState.renew`, `open_of`, `open_of_party` | нет | оставить |
| `Engine.why_not_open`, `apply`, `mark` | нет | оставить (внутренние) |
| `Engine.step_number`, `is_finished`, `open_ids`, `trace`, `outcome` | нет (`outcome` в словаре — локальное имя) | оставить |
| `Engine.machine_state()` | `state` | **переименовать** в `state()` (даёт типизированное состояние) |
| `Machine.name` | нет | оставить (имя машины для стороны итога) |
| `Machine.initial`, `state_name`, `step` | те же | совпадают; `initial` и `state_name` типизированы, `step` — по п. 18 |
| — | `Machine.capture`, `restore` (данные машины) | не вводятся; для кодирования состояния на границе снимка введены **`encode_state(state) -> str`** и **`decode_state(text) -> Option[S]`** (близко к `encode`/`decode` словаря: `capture`/`restore` несут данные машины, а в продукте состояние лежит в движке) |
| `FailCode.name`, `all`, `parse`, `of` | `fail_code_word` (слова в `snake_case` для журнала) | `name` и остальные **оставить** (строка в снимке и входе события — формат провода продукта); **ввести** `fail_code_word` и им писать код сбоя в параметрах журнала |
| — | `param`, `journal_event` | введены |
| `journal_line`, `parse_journal_line`, `encode_snapshot`, `decode_snapshot` | `encode`, `decode` (псевдокод среза) | оставить (кодеки провода продукта) |
| `memory_journal`, `memory_store`, `memory_agent`, `memory_time` | нет | `memory_agent` → **`memory_link`** (обработчик переименованного эффекта), остальные оставить |
| `Event.incoming`, `Event.from_source`, `Event.word`, `EventKind.*` | нет | `Event.*` → `Incoming.incoming`, `Incoming.from_source`, `Incoming.word` (вслед за типом); методы `EventKind` оставить |
| `acp_agent` | нет | **переименовать** в `acp_link` (обработчик эффекта `Link`) |
| `AgentLink` (канал процесса агента), `Inbound`, `connect` | нет | **оставить:** это связь с ОС-процессом агента, а не эффект `Link`; соответствия нет |
| `AcpClient`, `AcpConfig`, `AcpQueued`, `AcpOption`, `AcpPending`, `AcpInboxItem`, `AcpRecovered`, `Projection`, `PageInput`, `RpcMessage` (`RpcCall`, `RpcNote`, `RpcResult`, `RpcFailure`, `RpcGarbage`), `LineSplitter` и функции модулей `acp`, `acp_live` | нет | **оставить: нет соответствия** — методика не описывает клиента ACP |
| `PgConfig`, `PgFault`, `Loaded`, `PgWorld`, `TestDb`, `pg_*`, `file_journal`, `file_store`, `valid_session_name`, `session_path`, `append_line`, `read_lines`, `replace_file`, … модулей `storage`, `pgdb`, `pgconf`, `pgstore` | нет (обработчики эффектов `Journal`, `Store` — вне словаря: «обработчик — любой») | **оставить: нет соответствия** |
| `put`, `text_of`, `int_of`, `list_of`, `object_of`, `field`, … (помощники JSON) | нет | оставить |

## 4. Варианты и значения

| Имя продукта | Решение |
|---|---|
| `FailCode.*` (10 вариантов) | совпадают с `FailCode` словаря |
| `Response.Answer`, `Response.Refusal` | совпадают |
| `EventKind.Input/Progress/Answered/Refused/Expired` | оставить (см. раздел 1) |
| `Transition.Go/Stay` | введены |
| `Order.Journal/Send/Cancel/Save/Finish` | внутренняя запись реализации среды (раздел 1) |
| `StepOutput.Send/Log/Cancel/Save/Finish` | убраны |
| `ChatState.Idle/Awaiting/Done/Failed`, `ChatEvent.UserMessage/AgentChunk/AgentDone/AgentRefused/Cancel/Timeout` | оставить (машины чата в словаре нет, п. 22) |
| Стороны запроса: `"agent"` | остаётся; `"human"`/`"enhanced"` в продукте нет |
| Идентификатор события `<вид>-<номер>` (`input-2`, `progress-3`, `restart-3`, `start-1`) | совпадает по формату с п. 20 (`start`, `restart`); виды `answer`/`failure` в словаре — для событий приёма ответа, у продукта их роль играют `answered`/`refused` — **оставить** |

## 5. Журнал (версия 6): коды событий продукта

Строка журнала несёт `event.code` (латинский `snake_case`, один смысл — один код, без приставки машины) и `event.params` (список `{name, value}`, значение — строка). В `jsonb` и в файле строка — один JSON-объект: `{"trace":…,"step":…,"cause":…,"state":…,"request":…,"at":…,"event":{"code":…,"params":{"имя":"значение"}}}`; русского текста в движке и в машине чата нет. Таблицы шаблонов методики (80 кодов, машины методики) не содержат кодов продукта; русские шаблоны этих кодов — задача показа, вне этой задачи, код читаем без шаблона. Старые строки (`kind`, `text`) читаются: код — тот, что движок пишет теперь для того же (`sent` → `request_sent`, `restart` → `engine_resumed`, `note` остаётся `note`), параметр `text`, ключ источника в конце текста строки `event` — параметр `source`; перезапуск по журналу старого движка читает отметки и ничего не шлёт повторно (проверка `old journal` в `chat_engine_test.nv`).

| Бывший `kind`: текст | Код | Параметры |
|---|---|---|
| `start`: «machine X» | `machine_started` | `machine` |
| `event`: «kind/name src=key» | `event_accepted` | `kind`, `name`, `source` (только если ключ есть) |
| `discarded`: причина | `reply_discarded` | `reason` ∈ `no_request_id`, `closed_request`, `unknown_request` |
| `request`: «to P, attempt N» | `request_ordered` | `party`, `attempt` |
| `sent`: «attempt N» | `request_sent` | `attempt` |
| `closed` | `request_closed` | `how` ∈ `answered`, `refused`, `expired`, `cancelled`, `machine_ended`; при `refused` ещё `code` (слово кода сбоя) |
| `cancel` | `cancel_ordered` | `reason` ∈ `machine`, `idle_term`, `machine_ended` |
| `cancel_sent` | `cancel_sent` | — |
| `snapshot`: «snapshot of step N ordered» | `snapshot_ordered` | `step` |
| `finish`: «answer» / «refusal Code» | `machine_finished` | `outcome` ∈ `answer`, `refusal`; `code` (слово кода сбоя или пусто) |
| `restart`: «resumed from …» | `engine_resumed` | `snapshot_step`, `open`, `not_sent`, `ignored_lines` |
| `note`: «cancel of P: no open request» | `cancel_without_request` | `party` |
| `note` машины чата | `user_message` (`text`), `cancelled_before_request`, `agent_chunk` (`text`), `agent_done`, `agent_refused` (`code`), `cancelled_while_waiting`, `no_answer_in_time`, `event_ignored` (`event`, `state`), `event_unknown` (`name`) | см. слева |

## 6. Oracle 0.1.0: что решило

- **Типизированное состояние сделано.** Протокол `Machine[S]` и `Engine[M, S]`, `EngineState[S]` с перечислением `S` собираются и работают, если параметры типов при вызове свободных функций указывать явно (`start_engine[ChatState, ChatSession](…)`); вывод параметров по-прежнему даёт сломанный C (пункты 12, 13 `spikes/env/README.md`, воспроизведения не меняются). Для методов типа явные параметры не нужны. Воспроизведение рабочего образца: `spikes/env/repro_engine/src/typed_state_explicit`.
- `Transition[S]` — обобщённое перечисление с вариантом-параметром: собирается (запрет п. 8 касался варианта `str` в обобщённом перечислении).
- Параметр-протокол `mut environment Environment` принимается и вызывается; запись, реализующая протокол, передаётся значением.
- `Event` продукта рядом с `ListenerMsg.Event` драйвера (п. 22): после переименования в `Incoming` у движка записи с таким именем нет; совместную сборку с `postgres.pgnet` задача не проверяла (модуль `wire.nv` по-прежнему обходится без `pgnet`).
- Новое ограничение Oracle, найденное задачей: оператор `?` на `Option` от перечисления внутри обобщённой функции ломает C (`spikes/env/repro_engine/src/option_try_generic_enum`, п. 27); обход — `match`. Второе наблюдение: запись `Имя { … }` в голове `match` не разбирается (`expected ')', got '{'`) — имя связывают до `match` (п. 26). Подробности — `analysis.md`.

## Итог по таблицам

- **Переименовано (10):** `Event` → `Incoming`, `Agent` → `Link`, `acp_agent` → `acp_link`, `memory_agent` → `memory_link`, `accept` → `on_arrival`, `EngineState.machine_state` и `Engine.machine_state()` → `state`, `EngineState.open` → `open_requests`, `EngineState.close` → `close_request`, `Engine.state` → `engine_state`.
- **Заменено структурой словаря (8):** `StepOutput`, `StepResult`, `LogNote`, `ChatStep` (шаг возвращает `Transition[S]`, приказы — в `Environment`); `JournalEntry.kind` и `JournalEntry.text` (→ `event: JournalEvent`); `OpenRequest.idle_term` и `OpenRequest.deadline` (→ `waiting: Waiting`).
- **Введено:** `Transition` (`Go`, `Stay`), `Environment`, `JournalParam`, `JournalEvent`, `Waiting` (`sent`, `term`), `param`, `journal_event`, `fail_code_word`, `Machine[S]`/`EngineState[S]`/`Engine[M, S]` (типизированное состояние), `engine_state`, `open_requests`, `write_journal`; имена продукта без соответствия: `order_send`, `order_cancel`, `order_save`, `order_finish`, `encode_state`, `decode_state`, `Order`, `StepEnvironment`, `value_of`.
- **Оставлено с причиной:** `EventKind`, `Snapshot { step, data }`, `PartyCounter`, `OpenRequest`, `closed`, `counters`, `final_*`, `SendOrder`, `CancelOrder`, `Conclusion`, `to_cancel`, `to_ack`, `start_engine`, `resume_engine`, `dispatch`, `pump`, `feed`, `at: int`, `FailCode.name`, демонстрационная машина `Chat*`, `AgentLink`; остальные имена — клиент ACP, обработчики хранилищ, помощники — без соответствия (раздел 7).
- **Не отображено, не добавлялось:** ворота, вратарь, усиленный исполнитель (`"enhanced"`, `enhanced_attempt`), вложенные машины, пауза, `Rerun`, `NotAwaited`, `Kind`, `AppealDescription`, `model_tally`, `StopWord` (`NoWord`), `Summary` (`essential`/`critical`/`probes`), `Callable`, `Objects`; в продукте таких имён нет — проверено поиском по `src/`.
- Вклад в механическое выравнивание ветки 099: `rename-map.json` и `rename.mjs` (раздел «Выравнивание параллельных работ» в `analysis.md`).


## 7. Полный перечень объявленных имён по модулям

Перечень снят с текста `src/` после задачи (типы, поля записей, функции и методы, варианты перечислений, константы; локальные переменные и параметры — по тем же правилам, что соседние имена, и в таблицу не вынесены). Метки: **совпадает** — имя есть в словаре версии 6 для того же понятия (в модуле `engine`; `Incoming.kind` и `Incoming.name` — исключения из раздела 2); **то же слово у другого понятия словаря (оставлено)** — слово есть в словаре, но означает другое (`phase` раннера, `start` движка, `check` совещания …), общего понятия нет; **введено** — имя словаря появилось в продукте впервые; **переименовано** — прежнее имя продукта в разделе 1–3; **оставлено** — у имени нет соответствия в словаре (методика не описывает этот код: клиент ACP, обработчики хранилищ, помощники JSON, тестовые двойники, демонстрационная машина), переименовывать не к чему. Причина по группам — в начале каждого модуля.

### engine

Движок: имена типов и операций — разделы 1–5; помощники кодека и мелкие функции (`put`, `text_of`, `int_of`, `list_of`, `object_of`, `now_ms`, `request_of`, `reply_of`, `entry_of`, `entry_in`, `bump`, `renew`, `open_of`, `open_of_party`, `why_not_open`, `apply`, `mark`, `overtaken_lines`, `restart`) в словаре не названы — оставлены.

- fn / оставлено: `put`, `text_of`, `int_of`, `list_of`, `object_of`, `journal_line`, `parse_journal_line`, `open_to_json`, `open_from_json`, `counter_to_json`, `counter_from_json`, `sample_entry`, `sample_state`, `read_all`, `ack`, `now_ms`, `request_of`, `reply_of`, `entry_of`, `entry_in`, `bump`, `renew`, `open_of`, `open_of_party`, `overtaken_lines`, `advance`, `deliver`, `entries`, `memory_journal`, `memory_store`, `memory_time`, `is_request_bound`, `renews_term`, `closes_request`, `kind_of`
- fn / новое имя продукта: `event_to_json`, `event_from_json`, `old_event`, `waiting_to_json`, `waiting_of`, `state_to_json`, `state_text_of`, `engine_state_of`, `stub`, `encode_state`, `decode_state`, `closed_event`, `cancel_event`, `order_send`, `order_cancel`, `order_save`, `order_finish`, `memory_link`, `value_of`
- type / новое имя продукта: `Mode`, `Stub`, `Order`, `StepEnvironment`
- field / оставлено: `n`, `to_cancel`, `to_ack`, `journal`, `snapshots`, `inbox`, `cancelled`, `acked`, `saves_at_ack`, `clock_ms`, `saves`, `failure`, `attempts`, `closed`, `final_kind`, `final_text`, `final_code`, `final_step`
- fn / введено по словарю: `name`, `close_request`, `write_journal`, `fail_code_word`, `param`, `journal_event`
- fn / совпадает: `initial`, `state_name`, `step`, `write`, `save`, `load`, `send`, `receive`, `cancel`
- variant / новое имя продукта: `Calm`, `Busy`, `Note`
- type / совпадает: `Journal`, `Store`, `Engine`, `Machine`, `FailCode`, `Request`, `Reply`, `Rejection`, `Response`, `JournalEntry`, `Snapshot`, `EngineState`
- type / введено по словарю: `Link`, `Environment`, `Incoming`, `Transition`, `JournalParam`, `JournalEvent`, `Waiting`
- field / совпадает: `machine`, `id`, `to_send`, `attempt`, `party`, `input`, `idle_term`, `trace`, `step`, `request`, `result`, `reason`, `text`, `kind`, `at`, `cause`, `data`, `event_counter`, `counters`
- field / введено по словарю: `engine_state`, `sent`, `name`, `value`, `code`, `params`, `state`, `event`, `term`, `waiting`, `open_requests`
- field / новое имя продукта: `orders`
- variant / оставлено: `Send`, `Cancel`, `Save`, `Finish`, `Input`, `Progress`, `Refused`, `Expired`
- type / оставлено: `MemoryWorld`, `EventKind`, `SendOrder`, `CancelOrder`, `Conclusion`, `OpenRequest`, `PartyCounter`
- variant / совпадает: `NoResult`, `ModelRefused`, `ConnectionLost`, `FormNotFixed`, `Timeout`, `Cancelled`, `StoppedByHuman`, `CeilingReached`, `MaxTokens`, `MaxTurnRequests`, `Answer`, `Refusal`, `Answered`
- variant / введено по словарю: `Go`, `Stay`

### chat

Демонстрационная машина: в словаре её нет (п. 22) — имена с приставкой `Chat` и события `UserMessage`, `AgentChunk`, … оставлены; шаг приведён к `Transition` и `Environment`.

- type / оставлено: `ChatState`, `ChatEvent`, `ChatSession`
- field / то же слово у другого понятия словаря (оставлено): `party`, `idle_term`
- fn / оставлено: `chat_session`, `put`, `text_of`, `encode_chat_state`, `decode_chat_state`, `chat_state_name`, `chat_event_of`, `user_says`, `user_cancels`, `agent_chunk`, `agent_done`, `agent_refused`, `event_label`, `ignored`, `finish_answer`, `finish_refusal`, `chat_step`, `begin`, `resumed`, `has_snapshot`, `feed`, `accept_only`, `dispatch`, `pump`, `reply_of`, `rejection_of`, `answer_of`, `refusal_of`, `dead_event_line`, `stamped`, `said`, `chunk`, `done`, `refused`, `expired`, `cancelled`, `run`, `name_of`
- fn / введено по словарю: `name`
- fn / то же слово у другого понятия словаря (оставлено): `initial`, `state_name`, `step`, `summary`
- fn / новое имя продукта: `encode_state`, `decode_state`, `of_code`, `codes_of`, `encoded`, `same`, `codes`
- variant / оставлено: `Idle`, `Awaiting`, `Failed`, `UserMessage`, `AgentChunk`, `AgentDone`, `AgentRefused`, `Cancel`
- variant / то же слово у другого понятия словаря (оставлено): `Done`, `Timeout`
- type / новое имя продукта: `Run`
- field / введено по словарю: `state`
- field / новое имя продукта: `moved`, `orders`

### storage

Файловые обработчики `Journal` и `Store`: словарь говорит «обработчик — любой», имён обработчиков не задаёт — оставлены.

- fn / оставлено: `valid_session_name`, `open_data_dir`, `session_path`, `ends_cleanly`, `append_line`, `read_lines`, `replace_file`, `snapshot_of`, `put`, `snapshot_text`, `parse_snapshot`, `path_or_stop`, `file_journal`, `file_store`, `engine_root`, `begin`, `resumed`, `feed`, `pump`, `entries_of`, `stale_entry`, `fresh_root`, `entry_at`, `present`, `text_of`, `path_of`, `xs`
- const / оставлено: `MAX_NAME`
- fn / новое имя продукта: `of_code`
- fn / то же слово у другого понятия словаря (оставлено): `state_name`

### acp

Клиент ACP и проекция событий: методика его не описывает — оставлены; переименован только обработчик `acp_agent` → `acp_link` и тип `Event` → `Incoming` в сигнатурах.

- type / оставлено: `AcpConfig`, `AcpQueued`, `AcpOption`, `AcpPending`, `AcpInboxItem`, `AcpClient`, `AcpRecovered`, `RpcMessage`, `LineSplitter`, `Inbound`, `AgentLink`, `Projection`, `PageInput`
- field / оставлено: `program`, `args`, `cwd`, `inbox_path`, `key`, `options`, `seq`, `config`, `next_rpc`, `init_rpc`, `new_rpc`, `prompt_rpc`, `agent`, `active`, `permissions`, `taken`, `next_seq`, `stderr`, `exit_code`, `last_error`, `items`, `next`, `pending`, `out`, `inb`, `kill`
- field / то же слово у другого понятия словаря (оставлено): `request`, `text`, `id`, `kind`, `link`, `phase`, `session`, `queue`, `ready`, `input`
- field / введено по словарю: `event`, `code`, `name`
- fn / оставлено: `default_config`, `parse_value`, `initialize_params`, `new_session_params`, `prompt_params`, `session_params`, `outcome_result`, `field`, `field_text`, `field_int`, `kind_of_name`, `event_line`, `ack_line`, `seq_line`, `key_of`, `item_of`, `parse_event_line`, `recovered_of`, `recover_inbox`, `compact_inbox`, `tail_of`, `open_client`, `next_id`, `say`, `push`, `note`, `refuse`, `refuse_everything`, `process_ended`, `fail_handshake`, `on_result`, `on_failure`, `on_update`, `on_permission`, `on_call`, `on_line`, `take`, `drive`, `poll`, `next_event`, `acknowledge`, `option_for`, `decide`, `decide_event`, `close`, `session_id`, `agent_name`, `stderr_tail`, `last_error`, `unacked`, `unacked_keys`, `pending_permissions`, `put`, `field_of`, `garbage`, `parse_rpc`, `versioned`, `rpc_request_line`, `rpc_notification_line`, `rpc_result_line`, `rpc_error_line`, `line_of`, `feed`, `flush`, `j`, `str_at`, `int_at`, `inbound_of`, `stdin_of`, `stdout_of`, `stderr_of`, `read_stdout`, `read_stderr`, `write_loop`, `write_stdin`, `link_now_ms`, `watch_child`, `keep_link`, `connect`, `stop`, `get_of`, `text_field`, `int_field`, `proj`, `skipped`, `rpc_key`, `tool_kind`, `known_status`, `detail_of`, `chunk_projection`, `tool_call_projection`, `tool_call_update_projection`, `usage_projection`, `project_update`, `project_permission`, `progress_event`, `refused_event`, `stop_event`, `page_input`, `turn_object`, `object_input`, `text_input`, `turn_only`, `with_turn`, `permission_input`, `refusal_input`, `page_input_of`, `page_event`, `request_of`, `page_of`, `input_of`, `stamped`
- fn / то же слово у другого понятия словаря (оставлено): `enqueue`, `cancel_request`, `phase`
- fn / новое имя продукта: `acp_link`
- const / оставлено: `STDERR_KEEP`, `STUCK_WRITE_MS`
- variant / оставлено: `RpcCall`, `RpcNote`, `RpcResult`, `RpcFailure`, `RpcGarbage`

### acp_live

Тесты клиента ACP на поддельном агенте и сквозной тест: помощники тестов — оставлены; затронуты только имена `Incoming`, `Link`, `acp_link`.

- fn / оставлено: `inbox_file`, `with_inbox`, `take`, `repo_root`, `fake_agent_path`, `fake_config`, `start_with`, `req`, `now_ms`, `is_final`, `collect_turn`, `collect_quiet`, `collect_until`, `names_of`, `text_of`, `with_name`, `request_of`, `last_of`, `wait_phase`, `data_root`, `e2e_config`, `e2e_begin`, `e2e_resume`, `e2e_feed`, `e2e_pump`, `run_to_end`, `e2e_entries`, `occurrences`, `answer_text`, `opencode_program`, `empty_project_dir`
- fn / то же слово у другого понятия словаря (оставлено): `start`
- fn / новое имя продукта: `state_text`

### pgdb

Слой PostgreSQL: настройки, вызовы, цикл по сокету, поддержка тестов — словаря нет — оставлены; `test_line` теперь пишет событие (`code`, параметр `text`).

- type / оставлено: `PgFault`, `Loaded`, `PgConfig`, `TestDb`
- field / оставлено: `sqlstate`, `journal`, `host`, `port`, `database`, `user`, `password`, `admin`, `app`, `role`
- field / то же слово у другого понятия словаря (оставлено): `message`, `step`, `snapshot`
- fn / оставлено: `rows_of`, `params_of`, `run`, `lines_json`, `pg_save_step`, `pg_load`, `pg_migrate`, `pg_rows`, `wrong_password`, `never_printed`, `line_at`, `snap_at`, `save_step`, `load_session`, `loaded_or_stop`, `is_error_with`, `is_ok`, `text_of_line`, `text_key`, `number_key`, `parse_pg_config`, `is_local`, `describe`, `full_text`, `must_config`, `check_fails`, `test_settings`, `test_port`, `setting_text`, `test_app_password`, `test_admin_password`, `test_admin_on`, `test_sql`, `test_must_sql`, `test_count`, `schema_text`, `test_migrate`, `new_test_db`, `drop_test_db`, `put`, `test_line`, `test_snap`, `nonce_bytes`, `stop_fault`, `session_fault`, `pump`, `first_error`, `round`
- fn / то же слово у другого понятия словаря (оставлено): `check`
- field / введено по словарю: `name`
- const / оставлено: `TEST_ADMIN_USER`

### pgconf

Настройки подключения к PostgreSQL — словаря нет — оставлены.

- fn / оставлено: `env_or`, `pg_config_env`, `pg_config`, `full_text`, `must_config`, `temp_file`

### pgstore

Обработчики `Journal`, `Store` на PostgreSQL (`PgWorld`, `pg_journal`, `pg_store`) — словаря нет — оставлены.

- fn / оставлено: `begin`, `resumed`, `feed`, `accept_only`, `dispatch`, `pump`, `journal_of`, `snapshot_of`, `same_entry`, `same_entries`, `snapshot_data`, `answer_text`, `assert_same`, `story_conversation`, `story_cancel`, `story_timeout`, `story_refusal`, `fault`, `pg_write`, `pg_commit`, `pg_read_all`, `pg_load_snapshot`, `pg_journal`, `pg_store`, `entry_at`, `unit_ok`, `write_lines`, `read_all`, `snap`, `texts_of`
- fn / то же слово у другого понятия словаря (оставлено): `state_name`, `stop_text`, `save_snapshot`, `load_snapshot`
- fn / новое имя продукта: `of_code`, `same_event`
- type / оставлено: `PgWorld`
- field / оставлено: `cfg`, `pending`, `committed`
- field / то же слово у другого понятия словаря (оставлено): `session`

Итого по перечню: оставлено — 437, новое имя продукта — 42, введено по словарю — 32, совпадает — 53, то же слово у другого понятия словаря (оставлено) — 32 (всего 596 объявленных имён).

Убраны: `StepOutput`, `StepResult`, `LogNote`, `ChatStep`, `JournalEntry.kind`, `JournalEntry.text`, `OpenRequest.idle_term`, `OpenRequest.deadline`, `source_of`, `event_label (text of a note)`.

Статус: утверждено

Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть

# План эпика: инструменты CrewHarness в Nova-пульте

Тип: эпик  
Ветка: task/135-instrumenty-crewharness-v-pulte-epik-per  
Маршрут: fast (данные маршрута этого эпика; не полный цикл С1–С4). План не утверждает перенос выполненным.

## Цель и результат

Агенты OpenCode и Kimi — сменяемые ACP исполнители, Nova-пульт — единственный авторитетный владелец инструментов CrewHarness, прав, состояний, почты, истории, очередей, журналов и gate lifecycle. У агентов остаются только общие файловые/командные инструменты по их штатной capability/permission политике. Каждая host-зависимость имеет адаптер, замену или явное ограничение. Не оборачивать старый TypeScript плагин как окончательное решение.

**Результат эпика:** небольшие вертикальные части Nova-пульта (UI/API, хранение/контракты, установка и документация), с capability ограниченными операциями, ACP вызовом из OpenCode и Kimi и проверенной изоляцией от управляющего плагина. Действующий сервис и плагин не отключать до явного решения о готовности/переключении.

## Основание раннего task view

Приоритет владельца: «134 задачу хочу посмотреть на пульте» (владелец, 2026-10-21, direct message, формулировка передана интегратором); разрешение уточнения: «Разрешить одно уточнение (Recommended)» (владелец, 2026-10-21, ответ через question tool на вопрос о единственном финальном уточнении). Поэтому read-only task metadata view — самостоятельный ранний пользовательский slice через временный read adapter к действующему source, доступный до полного переноса; он не является ACP chat view.

## Условия и зависимости

* Сначала независимо проверить и согласовать этот план у владельца. Этапы запускает интегратор внутри уже разрешённого эпика; эта задача не заводит подзадачи.
* P0 задача 134 идёт первой независимо; 130/131/132 и 133 — читать/согласовать пересечения, не расширять scope. Задача 136 — dependency / соседний workstream действующего task lifecycle инструмента: перенос task state/operations только после принятого результата 136, контракт ниже, реализацию не дублировать.
* Обязательный нулевой техэтап — MCP + изоляция ACP OpenCode/Kimi. E0 блокирует только публикацию CrewHarness tools агентам через ACP и перенос ACP/управляющего плагина; он не блокирует отдельный read-only task metadata view из E1. До E0 PASS нельзя заявлять поддержанную публикацию инструментария. Проверять только disposable workspace/конфигурации, без login/prompt, новых расходов, смены глобальных настроек.
* Каждый этап получает собственную задачу, exact acceptance SHA, новый независимый приёмочный взгляд и отдельный rollout/rollback. Тяжёлые gates — через очередь машины. Для каждого этапа минимум три различающие пробы; обязательно реальные инструментальные вызовы с обоих ACP путей в изолированной среде и отсутствие plugin side effects. Никаких переключений live data без отдельного решения владельца.

## Границы и места результата

* Продуктовые контракты, права, state transitions, task/mailbox/lifecycle API: будущий `src/` (предварительно `src/server/`, `src/storage/`, новые модули Nova tools/API; точные каталоги уточнить после инвентаризации репозитория этапа). Не переносить правила как вызовы старого TS.
* ACP bridge/adapter: `src/acp/`, `src/acp_live/`, `src/server/`; MCP transport только после положительной пробы. Shared transport contract не встраивает OpenCode API.
* UI/установка/операторские операции и безопасный cutover: `src/web/`, `src/server/front/`, setup/run docs и соответствующие тесты/README.
* Текущие источники для сопоставления: `opencode-plugin/core.ts`, `journal.ts`, `tasks.ts`, `watch.ts`, `review.ts`, `settings.ts`, `index.ts`; инвентаризация в `inventory.md`. Не менять эти файлы этим планом.
* Нормы проекта и публичные операционные правила — только после утверждения отдельными ADR/Каноном по процессу; plan.md сам не является нормой. Форматы и схема — рядом с кодом-владельцем, документация пользователя — README соответствующей части.

## Этапы

### E0 — Проверка моста и изоляции (блокирующий spike)

**Fast scope / результат пользователя:** короткая матрица MCP/tool invocation и изоляции только по двум установленным ACP путям; отдельный go/no-go для каждого. Никакого продуктового endpoint в E0.

Контракт: из disposable worktree/subprocess использовать read-only sentinel tool за MCP stdio, зафиксировать точные версии, протокольные сообщения/ошибки, выбранные plugins и наблюдаемые side effects. Сравнить базовый запуск и запуск с изоляцией, не менять global config. Хранить только безопасные доказательства, никаких секретов.

Различающие пробы: (1) оба клиента принимают MCP и делают tool call; отсутствие support/ошибка отвергается как NO-GO; (2) sentinel не вызывается без разрешённого MCP и вызывается ровно один раз при выбранном профиле; (3) управляющий plugin отсутствует в процессе и нет его файловых/почтовых/wakeup side effects; (4) глобальная конфигурация/hash остаётся неизменной, выбранные сторонние plugins сохраняют ожидаемое поведение. Оба ACP проходят независимо.

Проверка и stop rule: fake ACP protocol tests + интеграционные тесты процесса с mock MCP tool; обязательный реальный tool invocation отдельно из OpenCode ACP и Kimi ACP в disposable среде, без login/prompt/расходов и без смены глобальных настроек. Наличие handshake не засчитывает invocation. Если такой вызов требует login/prompt либо безопасный реальный вызов пока не удаётся, соответствующий ACP tool-publication/migration путь остаётся NO-GO/blocked; задать владельцу отдельный вопрос о допустимости условий пробы. Только ACP-зависимые этапы/функции блокируются; E1 read-only task view может идти независимо. Это не доказательство несовместимости ACP/MCP: до разрешённой проверки факт неизвестен. Не выдавать fake test или handshake за реальное доказательство.

### E1 — Пульт как единственная identity и authority (вертикальный UI/API slice)

**Зависимость:** текущий доступный task metadata source и минимальная серверная project identity/security gate. E0 и ACP model/tool calls не являются зависимостью этого read-only slice. E1 не запускает ACP session, agent tool или модельный вызов. **Fast scope / самостоятельный ранний результат пользователя:** read-only task cards в Nova UI по реальным task metadata из текущего авторитетного источника: список/деталь с номером, status, сохранённым brief/task text, checks/evidence и task history. Slice доступен до полного переноса и без ACP chat/session. Название чата (включая задачу 134) не подменяет metadata задачи.

Контракт: предложенные read-only `GET /api/tasks` и `GET /api/tasks/{task-id}` в `src/server/` возвращают проекцию `{task_id, project_id, status, brief, checks:[{id,status,evidence_ref}], history:[...]}` прямо из действующего task metadata source; UI card/list в `src/web/`. Маршруты не добавляют create/update/delete. Adapter не создаёт cache/copy, не имеет write path, не мигрирует данные и не меняет/оборачивает действующего writer. Task metadata (номер, brief, status, checks/evidence, task history) отделена от ACP chat transcript, ACP session id и engine journal; читать историю задачи из чата нельзя. Сервер формирует project principal; project scope берётся из проверенной identity/registry, а не из параметра агента/UI. `/api/agents` остаётся публичной проекцией id/label без команд/args/env. Capability registry — deny-by-default; ACP adapter и task reader не получают прямого DB доступа. При недоступном или неоднозначном текущем источнике card явно показывает unavailable/error и не синтезирует карточку из чата. Более поздняя смена task writer требует отдельного этапа/разрешения и не является частью E1. Места: `src/server/`, `src/web/`, source-specific read adapter; `src/acp/` не является источником task metadata.

Различающие пробы: task card показывает точные fixture status/brief/check/evidence/history из действующего source, а одно лишь ACP chat с похожим названием не даёт карточку; cross-project task id и подмена project principal дают отказ/пустое отсутствие данных; read adapter на чтение не пишет ни в старый source, ни в новую таблицу/cache (сверка write counters/checksum до/после); source unavailable даёт явный error, не fallback в чат. Дополнительно неизвестный agent id отвергается без записи; подмена role/session в payload не меняет principal.

Rollout/rollback E1: включить read-only UI/query только для тестового principal/project, без feature включения task mutation; сравнить read projections с исходными metadata по id/count/check/evidence/history; rollback — скрыть UI/route и вернуть прежний экран, поскольку записи/миграций/изменения writer не было. Изоляция проекта проверяется до открытия UI любому другому scope. Этот rollout разрешён независимо от E0 и ACP/login/prompt, так как он не вызывает ACP.

### E2 — Почта, роли и журналы

**Зависимость:** E1 task-card read-only slice, project identity/capability и E0 PASS. **Fast scope / результат пользователя:** следующий отдельный UI slice — ACP chat session с видимой session identity, затем один почтовый сценарий send→inbox→reply с серверным qid; task card остаётся самостоятельной проекцией task metadata, не чатом.

Контракт: типизированные операции `list/send/inbox/reply/wait` и `role/read help/doctor`; qid, адресация, sender identity, wake intent, journal line schemas — серверные. `progress_line`, `log_line`, `usage_line` разделены по контрактам/правам; дата/подпись ставятся сервером. Идемпотентность и delivery claim защищают от duplicate reader/wakeup. Файловая metadata и PG transcript/journal остаются разными объектами с разными схемами/владельцами.

Пробы: доставлено/ответ с тем же qid только один раз; cross-project и forged sender/role отказ; закрытая/переданная сессия не может ответить/разбудить; неверная строка журнала отвергается без записи. Обе ACP сессии вызывают send/read-only operation из изоляции.

### E3 — Task lifecycle и plan UI

**Зависимость:** E1 read-only cards + E2 identity/ACP session/mail wakeup и принятый результат 136; до 136 E3 task mutation/correction gate закрыт. **Fast scope / результат пользователя:** один минимальный task mutation path create→submit→show updated card/history с ролевым отказом; остальные task/plan операции идут отдельными малыми срезами E3, не одним большим endpoint.

Контракт: task numbers/task folders и прежние session ids/launch ordinals сохраняются; `crew_spawn`, assign/order, push/reassign/cancel/priority/route, submit/deliver, plan review/check/round/approval представлены отдельными API operations. Интегратор/исполнитель/приёмщик enforced server-side; owner words и их датированные источники — immutable evidence. ACP start/wakeup adapter не владеет статусом. По контракту 136 состояния различны: «выполнена» — независимо принята/влита, ожидает установки/обязательных prod-проверок; «закрыта» — отдельный финальный шаг после доставки, prod-проверок и окончательной приёмки; cleanup не означает close. Выполненная задача штатно возвращается на доработку под прежним номером в новом цикле. Закрытая может быть явно переоткрыта только разрешённым действием; история не откатывается. Оба пути сохраняют task identity/history/старую acceptance, получают новые ресурсы и исполнителя, проходят независимую приёмку; агрегаты предыдущего цикла не восстанавливаются, прежние эффекты не повторяются. Новые статусы/циклы не мигрируют старые записи автоматически. Не менять реальные closed/cancelled задачи. Никакой нормы запрета reopen здесь не вводится.

Пробы: reassign сохраняет task id/history и блокирует старую сессию; worker не может создать задачу/решить план; неподтверждённое/устаревшее owner word не создаёт fast task; cleanup не закрывает задачу; completed returns to correction as a new cycle; closed rejects correction without explicit authorized reopen; both return/reopen paths preserve old history/acceptance and don't replay side effects; cancelled task rejects late submit.

### E4 — Очереди, timer/watch и machine lifecycle

**Зависимость:** E1 capabilities, E2 wake/notification и E3 task/session ownership. **Fast scope / результат пользователя:** один read-only wait job через queue status→completion/cancel, с единственной доставкой; machine command execution добавляется только отдельным ограниченным runner-срезом.

Контракт: очередь задачи/машины, slot ownership, cancel, timeout, retry, stale/failure states, notification и wakeup — атомарный lifecycle пульта. Command runner — отдельный adapter с allowlist/permissions deny; не общий shell tool и не обход agent permissions. Событие завершения и уведомление имеют идемпотентный ключ.

Пробы: limit=1 сериализует тяжёлые задания; cancel до запуска не исполняет команду; runner failure/timeout отмечается FAIL и освобождает slot ровно раз; чужая команда/запрещённый путь отвергается. Реальные tool calls обоих ACP — только безопасный queue status/read-only.

### E5 — Приёмка, evidence, precheck и merge-lock

**Зависимость:** E1 roles/capabilities, E2 immutable journal, E3 task lifecycle и E4 queue semantics для тяжёлого CI/precheck. **Fast scope / результат пользователя:** один изолированный gate сценарий check→precheck evidence→lock/denial для точной вершины; merge/accept/cleanup — следующие малые срезы, с отдельными guard conditions и без live push.

Контракт: `review/rework/check/precheck/merge/unlock/accept/cleanup/track` с ролями, FAIL/stale, точным candidate/base SHA, lock ownership/expiry и доказательством. Git/CI adapter отдельно исполняет операции, API авторизует transition; lock берётся лишь после precheck если проект требует, candidate фиксируется точно. Evidence/keep не стираются cleanup-ом.

Пробы: stale base между precheck и merge не выдаёт замок; другой principal не может unlock/accept; красный или отсутствующий evidence не проходит gate; retry одной команды не дублирует merge/cleanup. Реальные безопасные ACP calls — только inspect/status в disposable repo, запрет push/merge в тесте.

### E6 — Настройки, установка, совместимость и rollback rehearsal

**Зависимость:** E0 isolation PASS и принятые E1–E5 contracts; допустимые host-specific ограничения известны. Completed→closed transition для новых циклов опирается на подтверждённые delivery/установку/prod-проверки из этого этапа; без них финальное закрытие не разрешено. **Fast scope / результат пользователя:** установка в отдельный каталог + dry-run конфигурации/backup и одна production-readiness checklist на disposable deployment; миграционный cutover не включается до отдельного решения владельца и репетиции.

Контракт: guide/show/set, настройки проекта, профили/ограничения и конфигурация ACP остаются в понятном источнике; секреты не в UI/log/repo. Миграционный importer/exporter — dry-run only в отдельном инструменте, фиксирует mapping всех ids/relations и checksum. Явный freeze/drain/cutover/rollback playbook; default запуска не меняет чужие данные и не активирует пульт как writer.

Пробы: неполный/конфликтный mapping блокирует cutover; dry-run не пишет исходные или целевые данные и не мигрирует старые task records; snapshot/restore сохраняет known fixtures + task/mailbox and chat transcript separately; cleanup сам по себе не переводит `выполнена` в `закрыта`, отсутствие delivery/prod evidence блокирует close; rollback до новых writes возвращает прежний reader/writer; после write запрещён silent rollback. Install/uninstall не меняет global ACP/plugin config.

## Общие ворота каждого этапа

1. Сначала независимый тест-контракт и не менее трёх различающих проб (включая отказ/границу полномочий).
2. Для ACP/tool-publication этапов — поддельные агенты для unit/integration, затем реальные OpenCode и Kimi ACP calls только в disposable среде и только безопасно без login/prompt/расходов. Если реальный вызов требует запрещённых условий либо недоступен в этой границе, отметить ACP путь NO-GO/blocked и спросить владельца; никогда не считать fake test или handshake pass. Read-only task view E1 тестируется по существующему source/fixture и не требует ACP/model invocation.
3. Инспекция загрузки plugins и sentinel side effects подтверждает отсутствие управляющего плагина в обоих ACP путях; любая неопределённость — NO-GO.
4. Проверка точного SHA кандидата после тестов, полного затронутого набора и независимая приёмка; никаких «зелёных» результатов с другого SHA. Machine-heavy gates — очередь.
5. UI, server-side permission, аудит, установка и документация готовы для результата этапа. Rollout отключён по умолчанию; rollback описан и упражнён только в изоляции.
6. Сверка неизменности существующей истории/идентификаторов/owner evidence и отсутствие второго writer/reader/wakeup. Никакой автоматической миграции реальных задач.

## Запуск и остановка

Сначала владелец утверждает этот план после независимой проверки. Затем интегратор запускает E0 как первую отдельную задачу; NO-GO блокирует только ACP-зависимые этапы/функции, E1 read-only task view может запускаться независимо от E0. После каждого этапа отдельные ворота и явное утверждение перехода. Старый OpenCode plugin/runtime продолжает обслуживать прежний контур до проверки готовности всех функций и отдельного решения о rollout. Переключение реальных читателей/писателей/процессов не входит в этот план и без отдельного слова владельца не производится.

# Анализ актуализации Канона — черновик С1п-4

Статус: черновик

## Вывод и единственные карты

Владелец, 2026-10-16 (`task/message.md:9–11`): «канон надо перевести на использование последенй версии методики»; «получается надо просмотреть результаты 031 задачи, возможно нужно внести изменения в результат 031». Полная задача обязана после ворот реально внести выбранное обновление и проверить действующие места, не ограничиться исследованием. Политика pin/перехода, место/версии новой редакции и внешний registry не выбраны автором за владельца.

Единственная актуальная авторская карта всех16changedpaths/применимых hunks — [method-delta.md](method-delta.md); прежняя тематическая таблица удалена, не оставлена вторым источником. Все её темы разнесены по M/S/R/F anchors, включая уточнение цели (которого **нет** в oldS66), OQ5какпроцедуру, machine-tail/tool и условия протокола сходимости. Это аналитическое исправление источников, не дословный перенос таблицы. Единственная карта исходных атомов — [spec-trace.md](spec-trace.md), полевой crosswalk — [031-impact.md](031-impact.md). Исторические fixes1/2/3/partial/review не переписываются и не являются независимым PASS.

Old `f333efa319e445efe029ee6963b477ca8fe3bc1c`; current `a449bd2e218e04384d1d42e0c1bffe892495e298`; approved031 `4b48c50eef1fb46af4f074a80511979b16e515e3`. Plugin evidence строго492c166, не live. Сравнениеab2→currentR меняет только профильsecondopinion232–233: принятое journalоснование не новость061. Q5принятаprocess125–144 на9d391ba и равнаcurrent; остальныеQвопросы не нормы. AlgorithmrawGitLF51475байт SHA `ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96`, old=current; CRLFhash8a0004… был ошибочно назван источником, сохранён только как историческая ошибка в описи. Semanticdeltaalgorithm нет.

## Обязательность и provenance — независимые оси

`process.md:5–12` принимает основу целиком. После выбранного pin норма действует по собственным условиям, кроме явного owner-approved override с источником. `partial/not tested/unconfirmed` — статус практики, не выключатель. M154сохраняетownerclosedlist/gates; M709–718применяется по своим условиям; M1550включёнпоумолчанию и не равен отключённымhelpers. Замысел не согласование§18: optionalусловияпоследнего не отменяют замысел. S108–110подзадача=пунктбезворот против process151–160отдельнойнумеруемойработы — semanticoverride, не нейтральнаянумерация. Адреса/причины/будущиешаги и границыcode по каждому смыслу в method-delta, внешнюю методику в Canon не пересказывать.

## Формат031: три оси, не runtime PASS

Crosswalk031-impact разделяет данные/refs, нормативную семантику REQ/AC/пар и новыеполя/shape. Readycolon конфликт approved259/309/540 сcurrentR88 доказан; новаяgrammarref не override прямых REQ/AC. Нужна отдельно утверждаемая семантическая редакция для покрытияcurrent, даже если shapeпрежняя. ИзолирующаяNпара сохраняет знаменательstartN, не прежнийнеизолирующий0/2→1/1. Полный новый JSONkeygap не доказан; это не достаточность/совместимость. Versions/reader правила проверяются отдельно на В-02, ни автоматическогоbump, ни автоматическогосохраненияschemaVersion.

Mutablelaunches[] снаружи JSONC, но REQ27/29approved325/329 требуют декларации предусмотренных намерений: регистрациядоrequest,offset/snapshot,stopallretry,processgroup/starttime,lock/cleanup. Поатрибутный маршрут в graph/actions/events/routes/typedbindings не заменяется одним externalreason. Exactsignatures/domain/nullability/availability неизвестны для каждой такой операции. OrdinaryС2линзы черезprompt/document, а не meeting-onlylens.sessionId; profileValue имеет ровноtier/effort/reasoning/budget, неfamily. Fresh/differentfamily требует декларативнойполитики+внешнегоселектора, не выдуманногоAPI.

## Блокеры045 и013

1. **План045, находкаС4-4**: нужен per-anchor/per-DNC checklist/test. Каждая запись: точный источник/указатель, входы, проверка, target или reason пустого результата, expected, evidence/команда, reviewer `PASS`/`NOT VERIFIED` и причина. Проверить все9DNC: gatesbeforeartifacts; protectedinputs/Canon/config/main; no runtime/validator/git/live/delete/restart;013readonly/noorders; nofalsecompatibility; noinventedregistry; destination/tools; nonewchildtasks;privacy/liveclaims. DNC08 отдельно **история создания/сессий/задач плюс состав/имена папок**, не одно вместо другого. Canonнеисправляетплан045;045неправитсяэтойС1п.
2. **В-05 registry/signatures** независимо открыт. Нужен авторитетный комплект16kinds: predicate,unit,route-trigger,event,action,effect,profile-stage,profile-value,gate,outcome,document-status,grammar,scenario,role,prompt,context. Для каждого ID: version/digest/provenance; predicateargs/result/outcomes; unitnumerator/denominator; route-triggergate→outcome; event/action/effectpayload/boundary/confirmation/result; promptsource/hash/substitutions; contextschema/domain/availability и остальные typed signatures. Методика даёт обязанности/нормативныеworkflowIDs, не существующие executoroperations. В-03 рекомендует получить существующий источник; отсутствие источника блокирует, не запускает проектированиеновогоконтракта без нового слова владельца.

013 — отдельное read-onlyдерево: specчерновик, `src/`/`src/runner_core` отсутствуют. Message46–49/log16/42 о «Контракт внутри013» — известное решение2026-10-09, не freshdelta061/неconsumerAPI. Spec457–512толькоразрабатывает14предметов/версию/hash/отдельноеapprovalДОкода; proposedrunner-regulation.mdнеутверждённыйAPI. Никакойсовместимости013/полногоwhitelist не доказано. Source/status/hashes и глубина чтения в source-inventory/read-map; унаследованные широкие ranges не названы собственным полным аудитом.

## Результат, current и сохранность

Canon README/«Параметры для раннера» и process/«Основа» получают выбранное основание; process/«Отличия» и отдельное правило перехода — согласованные overrides/переход; новый ADR/реестр/входнаяссылка — только решения. AGENTSтолькопридоказанномвоздействиинаправиларепозитория. Первый будущий перенос **любого** результата061, включаяREADME/process/ADR, создаёт current сэтимместом; каждыйследующийдополняет. ОжиданиеВ-02неоткладываетуказательвнесённогоCanon. Canon-first/currentсразу→format-later/currentдополнить допустим; Canon-first/currentтолькоприformat недопустим.

Новая редакция031 proposed `src/runner_core/regulation/format.md`: «Контракт формата», «Версии и совместимость», «Приёмочные пары», «Источники и покрытие». ПослеВ-02шаг«Ввести новую редакцию формата» создаётсамодостаточнуюнорму/проверяетпары/дополняетcurrent;неправитapproved031нидо,нипослеворот. ОТВ01 045(spec191/log27,владелец2026-10-15) выбралкомплектрядомсreader; plan13/90/185фиксируеткаталог,ноимяformat.mdиразделы—предложение061. Process185сейчасopencode-plugin: адресноеуточнение/новыйADRтребуютВ-02. Отсутствиеreaderнеразрешаетразнестикомплект.

Latestпроверяетсяпоназванномуupstream/моментуворотипередвнесением,фиксируютсяcommit/hashes;drift→новыйdelta/затронутыеворота. Активныезадачипереходяттолькоповыборувладельца,безстарыхpin/review/seriesпереписей. СейчасCanon/current/format/JSONC/schema/registry/implementationне создаются; всеисходыавторские,двепредметныеиоднасводнаяпроверкивпереди.

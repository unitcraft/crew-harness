# Собственная поатрибутная сверка C01–C60

Первичные номера 031 относятся к `spec.md` в approved `4b48c50eef1fb46af4f074a80511979b16e515e3` (здесь и далее используется сокращение `4b48c50`). R/M/S — Git-объекты методики `a449bd2`. Проверена каждая строка нынешнего impact, а не только её ID. Ниже «форма» означает условную декларативную выразимость, НЕ наличие matching registry, API или semantic PASS. Во всех строках независимо применены три оси: данные/refs, семантика нормы, shape/version. Две существенные исторические семантические несовместимости представлены как предмет исследования, не как новые ошибки 061.

## Повторно используемые формы: собственный контроль

A соответствует 031:37–39,58–61,70,111,117,325–329. Action/event имеют все пять required ключей; разные boundary enums не смешаны. Edge содержит required nullable predicate/routeId, массив ordered actionUse; event-field берётся только из edge.on. Несколько шагов порядка требуют отдельных переходов/вызовов и подтверждённых исходов, не массива root state. Confirmation/result для external action находится во внешней signature; у gateEffect оно явно в записи. Ни sourceRef, ни payloadSchema нельзя опустить.

B соответствует 031:87–89,111: шесть закрытых ветвей, включая required ключ value даже при literal null; никаких выражений/дот-путей/сборки object из частей. Context catalogRef указывает единственный binding kind=context; name — внешний output. Обязательный получатель не питается optional source. Совместим весь домен, не выбранное значение. Документная многозначность не становится scalar.

T соответствует 031:74–89. Шесть ветвей, все branch keys required, nullable у значения. Integer имеет оба bound keys integer|null и safe-integer предел; array items — schema non-null, maxItems 1..10000, пустое значение массива допустимо; object properties/required distinct subset/additionalProperties=false. Boolean не integer; enum→string допустим, обратное без ограничения нет. Для object гарантируются required keys получателя и запрещаются возможные лишние ключи источника; для array включаются items и maxItems.

D соответствует 031:34,46–49,93,119–132,301–307. У session обязательны также repeatable/phaseId, у agent/meeting role/promptRef non-null. Prompt — внешний registry ref с source/hash/closed substitutions, не локальный document. Filename basename, без slash/glob, четыре токена, без повторов/коллизий; numberBinding только при {N}. Review требует summary binding на локальное поле summary, facts — required context current meeting n, не summary. Fields/markers/statusRules имеют closed enum и собственную локальность. RequiredBy только node/session/gate.

P соответствует 031:50,99–109,309,540: все пять массивов required/non-null, nSourceRules может быть пустым только без используемых правил. Counted требует unitRule и node.unit; zero-unit имеет оба null и только связанную session КОММИТ/ПУШ. Launch не start; finishMarkers не дополняется start. Полная пара numerator/denominator внешняя; summary.N — номер проверки, не единица. Прямое exact готово и N/N остаются семантическим препятствием независимо от grammar ref.

G соответствует 031:39–43,55–57,95,113–117,138,289–295,317–321,341. Edge↔route взаимно однозначны, target=edge.to, trigger refs/outcome согласованы; gate-decision требует owner_decision с required gateId/decisionId и внешней матрицей decision→outcome. Route единственный источник counter writes; decision.counterEffects=[]; preserve/incrementOn/resetOn — точные индексы. Recompute — nonliteral typed snapshot, не формула; один effect на counter. Параметры все required keys, true/default=null, false/non-null; resetPolicy имеет три значения. Cycle stage только spec/plan/review/delivery/meeting, unique; параметры доменов ≥1/≥0/≥1. Terminal без исходящих, gate не terminal, фазовая принадлежность и достижимость обязательны. Общая форма G не отменяет этих отношений.

V соответствует 031:28–32,62,95,97,138,279–281,323,339. Полный manifest commit/files, от 1 до 128 paths с raw SHA, sourceRef commit совпадает. TypedRef имеет закрытые namespaces, owner только у локальных ссылок. Represented требует targets, external/not_requirement требует reason, а не произвольного пропуска. 16 kinds, максимум один binding/kind; digest/version не substitutes signatures. Отчёт содержит стадии отдельно и становится неактуальным при смене bytes. Версии рассматриваются ниже, а не выбираются из отсутствия нового ключа.

## Каждый launch-атрибут

C01. R89/160/591 → 031:34,58–61,70,111,325/329. Номер экземпляра не session.code и не новый root key. Декларация registration и типизированный output допустимы; конкретный max+1 output, его integer domain/availability и operation неизвестны. Для 045 нужны отдельные source/target и authoritative signature. Семантическая обязанность сохранена; shape gap не доказан.

C02. R89/160 → session.code:string и отдельный event payload регистрации (031:34,59–61). Статическая session и экземпляр launch различены. Code/ref/required source не выводятся из одного repeatable. Данные code известны норме, внешняя signature записи — нет; 045 не заменяет её каталогом sessions.

C03. R159/592 → ordered actions на edges/events/routes (031:38/70/117/325). Running/registration до request выражается порядком подтверждённых переходов, не именем действия. Save/request payload/result/outcomes unknown. Условная форма есть; ни исполнения atomic/order, ни нового shape не доказано.

C04. R152 → intention persist перед gate и после изменения, 031:325/329; atomic write снаружи. Обязательный sourceRef не снимается runtime reason. Signature persist, confirmation и atomicity неизвестны; узкий saveTask не state.save. 045 требует внешний источник и статическое намерение.

C05. R160/592 → append record до launch-line через отдельные actionUse/edges, 031:70/111/117. Domain/requiredness полного record и результат append unknown. Append-only history не mutable array в регламенте. 045 не удаляет декларацию; shape gap не доказан.

C06. R160/592 → pre-line length через context/event-field, 031:87/111. Offset должен быть до launch, не off_p после неё. Единица длины, bounds, requiredness и output name не определены API; 045 обязана получить signature, а не закрепить придуманный integer.

C07. R593–594 → два post-line outputs: progress и profile, 031:87/111. Их нельзя слить с C06. Каждому нужны domain/availability и соответствующий получатель; optional output required payload не питает. Декларативная форма достаточна условно; signatures неизвестны.

C08. R159–160/591–595 → time payload через T/B (031:74–89/111), не встроенные часы JSON. Не выбирается epoch/string/precision/timezone без signature. Runtime время и декларация отдельно, последствие 045 — проверить весь output domain.

C09. R89/159/590 → создание именованной группы до request, отдельный external effect (031:58/327). ID типа OS handle/string/integer не предрешён; confirmation/result обязательны по registry. Нет факта stop-group API; 045 получает источник.

C10. R89/159/681 → group start time плюс identity predicate, 031:44/97/111. Одного PID недостаточно. Arg schema/result/outcomes и starttime precision/availability неизвестны; обязанность сверки не исчезла из-за отсутствия поля State в JSONC.

C11. R89/574/600–601 → stop-all, проверка пустоты, только затем retry/exit. 031:325/327/329 разрешает намерения/подтверждённые переходы, не выполнение. Полный scope команд и stop/empty signatures unknown; 045 проверяет все отказные ветви, не только success.

C12. R572–574/600–601 → failed/halt в meeting против В13/exit вне meeting, 031:39–42/117/293. Нормативное ветвление известно, mapping реального event outcome неизвестен. Нельзя по имени outcome выбрать другой target. Форма G применима без новой cycle stage.

C13. R277/594 → before-call result count snapshot, 031:89/111/113. Нужен required/non-null compatible integer domain для recompute; new-old не expression JSONC. Snapshot и единицы old/new неизвестны в registry; 045 не сравнивает общий result count с приростом сессии.

C14. R602 → tail(code,post-launch offset), 031:70/111/325. Оба input связываются отдельно; event-field только edge.on, context только signature. Exact tail operation/output grammar unknown; требуется текущий code, не произвольная роль.

C15. R680–681 → lock acquisition, identity/starttime, stop, empty check. 031:325/329 задаёт декларативную recovery последовательность, не root lock field. Ownership/release/confirmation signatures unknown по отдельности. Blanket external reason не покрывает намерение.

C16. R681/608 → отсутствие group: task-scoped process lookup либо В13; существенный journal violation: log, не autorepair. 031:39/70/111/325/329 позволяет две отдельные ветви. Lookup result/domain/availability и log diagnostic signature неизвестны; 045 не маскирует общий process kill под подтверждённую операцию.

## Progress

C17. R88 против 031:259/309/540. Whole-keyword допускает знак после готово, approved прямо запрещает готово:. Семантический конфликт реальный; новое значение grammar не override. Данные и shape отдельно, versions только через В-02.

C18. R89 → 031:103–107/309: один agent start и отдельный launch, nondecreasing k. Grammar и внешний history input нужны вместе; static sessions не launch history. Нормативная форма известна, signature history неизвестна; 045 нужны пары отсутствия/дублирования.

C19. R90 → append-only correction, current k и quote10–30/вся короткая; 031:103/111/309. Допустимы grammar плюс history context, но ни regex, ни один успешный snapshot не доказывает цитату. Signature/availability неизвестны; отдельные негативы требуются.

C20. R90/275 → correction не numerator и не liveness. 031:99–101/113 допускает unit/context и явные route effects. Timer/исторический input внешние. Из grammar alone нельзя получить сохранность счётчика/таймера; 045 не increment-ит correction.

C21. R91/716 → сравнение с startN, k>startN допустим. 031:101 agent N приоритетен для показа, 105/309/540 — historical final N/N. Стартовый snapshot и unit/history predicate требуют signature; карта честно требует семантической оценки, не объявляет finalN достаточным.

C22. R91/716 → low-N с правдивой причиной. 031:105/309/540 N/N не покрывает изолированный 0/2→1/2 ready. Причина и artifact check через document/context допустимы условно; исключение требует отдельной семантической редакции. Новый обязательный JSON key не доказан.

C23. R91/94 → после final только same-k/same-keyword correction и отдельные low-N исходы. 031:103/111/309 позволяет history grammar/predicate declarations, но старые прямые ограничения требуют новых пар. Arbitrary after-final запись не становится законной от повторного grammar ref.

C24. R91/716 → отсутствие или два start не completion. 031:105/259/540 уже требует start, а history count определяется внешним контрактом. Два negative отдельно; matching registry и full history обязательны, availability не выдумывается.

C25. R92 → 031:50/109/263/309/540 точные пять stop kinds и reason. Нужны данные/grammar, нет нового enum. Surprise, пропуск вида, дубль и отсутствие причины незаконны; ready и zero-unit не stop.

C26. R84/87/94/277 → artifact evidence и своевременный step. 031:44/48/97/111/325 даёт prompt/doc/predicate оболочку; count не proof. Clock/artifact schema и availability неизвестны; отсутствующий artifact нельзя covered по одному журналу.

C27. R86/90/105–120 → подпись ≤80, clock external, journal tool если есть, приоритет session tail. 031:48/93/103/111 позволяет grammar/prompt/substitutions; реальная tool availability неизвестна. 045 не называет инструмент runtime operation без источника.

C28. R103/149/234 и неизвестный N → 031:99–107/311. No-data с reason не zero; КОММИТ/ПУШ одна start без profile hint, но launch profile остаётся. Нет unit.none; counted denominator=0 не zero-unit. Unit signature неизвестна, closed форма известна.

## Проверяющие и протокол норм

C29. S69/M707 → 031:34/46/48/93/325: fresh launch policy, prompt/doc version/readlist. Repeatable не гарантия свежести. Внешние selector/launch/context signatures неизвестны; допустима декларация, не факт исполнения.

C30. M707 → ordinary agent prompt и document sections/counts/probes, 031:34/46/48/93/305. Lens.sessionId:69 только meeting; agent туда не помещается. Filename spec-review-{N}.md без {lens} разрешён. Нового поля не требуется для текста инструкции, actual grammar/prompt registry unknown.

C31. M707 → summary N/K/M/P и Версия/readlist/линзовые sections, 031:48/121/305; номер через summary, минимум проб через cycle parameter:57/115. Summary.N не denominator units. Известные ограничения можно материализовать, signatures grammar outputs ещё требуются.

C32. M1550 → до рекомендации/до owner decision, default-on/explicit-off, не helper. 031:34/48/56/70/117/293. Parameters default/nullability и owner gate не подменяются автоматическим ответом; decision/context signature unknown. Форма есть, отключение не выведено из helpers-off.

C33. M1550/R232 → fresh/different-family if available и disclosure совпадения. 031:48/93/111 позволяет prompt/doc policy и selector output, НЕ profile.family. Selector inputs/family/availability/domain неизвестны; source-bound declaration не подтверждает API.

C34. R232 → A/reasoning/effort3–4/отдельная модель, 031:51–54/311. Четыре profileValue keys string|null ровно по matching profile-value; local tier bounds heavy/medium/light|null. A→tier и effort enums требуют registry. Никакого пятого family key.

C35. M1550 → facts-only, ≤10, weak point, log passed text/result, reply verdict/ref и оба варианта при disagreement. 031:46/48/56/70/117 даёт prompt/doc/counter/order форму. Message/record signatures unknown; одно имя lens не покрывает этих атрибутов.

C36. M711 → >1 нормы/механизм, goal-ref/boundary/base excerpts; fresh/facts/≤10/sporno/two records. 031:46/48/56/70/111/117. Имена полей текста не выдаются за root JSON keys. Classification/count/context и exchange contracts unknown; не включать registry/OQ в count норм.

C37. M711/1570 → intent не agreement/review/proof/clean pass, mixed split и без boundary у review norms. 031:48/57/93/117. Новая cycle.stage=intent запрещена, prompt/disposition допустимы. Optional agreement не отключает intent; semantic classifier signature unknown.

C38. M712 → первая boundary строка, возврат без неё, цель не вырезается. 031:48 required/multiplicity/grammar/onInvalid плюс predicate:44/97. Наличие field=true не доказывает цель. Exact return outcome/predicate/grammar unknown; 045 проверяет смысл отдельно.

C39. M713 → база before-first-edit и base цикла, excerpt и условия not-addressed. 031:30–32/48/93/97/111. Невнесение/неопаснее/неопора/необязанность закрыть и доказанная база проверяются по finding; hash alone не proof. Semantic predicate signature unknown.

C40. M713 → whole-read/link соседей, OQ question/addressee/default/deadline, >3 critical-equivalent сигнал, privacy не выносится. 031:48/56/70/111 позволяет отдельные text fields/counter/notification. Данные четырёх полей известны, classification/notification/context unknown. 045 не объявляет смысловой PASS по required fields.

C41. M714 → порядок narrow/weaken/delete/question, new-vs-clarification и три условия выноса. 031:48/95/117: disposition/OQ/route, namespaces не расширены. Classifier/event signatures unknown; новый task не создаётся из одного декларативного имени.

C42. M714 → одна попытка, раздельные правки, новая существенная→откат+OQ, non-address не откат, last ceiling exception. 031:57/70/111/113/115/321/329. Ceilings/repair route и preserve history существуют декларативно; finding/version/revert signatures unknown. Ни origin, ни счётчик не сбрасывается молча.

C43. M715 → не прогонялось, concrete input/two readings-or-no-outcome, дописывание трассы, next reviewer подтверждает опровержение, implementation witness. 031:48/49/93/325 даёт report fields/prompt/order. Trace grammar и implementation evidence неизвестны; отсутствие runtime не снижает severity.

C44. M715 → legal/illegal/why, judge формы, version batch/change list. 031:48/62/93/325 позволяет таблицу/coverage/publication intention. Literal обязанность известна, external publication/versioned consumer unknown. Эта декларация не разрешает push.

C45. M716 → review norms только executability на 2–3 циклах/истории; mixed others две линзы. 031:34/48/57/69/93. Ordinary prompt/document, stage review/meeting по смыслу, не executability stage или meeting-only lens для agent. Exact applicability/history contract unknown.

C46. S66/R98–120 → обе части machine-tail, code/unit/tool/session priority including profile exception. 031:34/48/93/111 prompt hash/substitution и context policy. Tool availability/точный prompt contract unknown; регламент не запускает tool по имени.

C47. S66 → clarification before old message, date/source/marker и preservation. 031:48/93/70/111/325. Декларативное storage/write intention есть, concrete action signature unknown. Old anchor нельзя заменить current формулировкой.

C48. S110 против process151–160 → 031:34/62/93 source-backed project override. Это semantic difference терминов, не новое поле сессии или разрешение child task. Данные текста и refs известны, проектный номер не подменяет запуск.

C49. M541/S122/183/192/317–324 → current.md literal basename, source/destination fields и transfer order, 031:46–49/93/119/325. Без {N} numberBinding запрещён. Первый Canon перенос требует current сразу, format потом пополняет; approved immutable. Tool/grammar signatures unknown, единственность — ручная приёмка.

C50. M1562 → receiving language независимо от optional mode, 031:34/48/93; subsystem:68 не предусловие этой обязанности. Инструкция известна, receiver-language/context/translation evidence unknown; owner_language не semantic controller.

## Версии, реестры и сценарии

C51. R169/385/720/M707 → 031:30–32/93/138/339: immutable source hash и actual approval evidence. Approval hash не новый root field. Данные pin/files известны; факт approval/runtime verification внешний. Смена hash делает отчёт устаревшим.

C52. 031:19/23/28/279/281/500/568/670: schemaVersion major.minor, regulationVersion major.minor.patch, minReaderVersion major.minor. Unknown key требует новой schemaVersion и explicit compatibility, reader ниже minimum/unknown major/minor+unknown fields отказывает без fallback. Semantic-only изменение не определяет автоматически ни bump, ни сохранение 1.0. В-02 сохраняет решение открытым.

C53. Каждый applicable source → 031:62/95/323/343 coverage. Represented nonempty targets; external/not_requirement nonempty reason; sourceFile из manifest; REQ/AC/DNC разрешаются в сопроводительной spec. Runtime external не отменяет static A declarations. Hash не доказывает completeness.

C54. M154/1552/R689–707 → gate ownerRequired/default/decisions, 031:40–42/293. True означает null default и ≥1 decision, false — обязательную local default ref; decision effects=[]; gate effects требуют effect registry и confirmation/result. Нормативная политика известна, actual owner decision/signatures нет.

C55. Gate decision → outcome, 031:39/41/117: exact gate/local decision/route refs, edge.on=owner_decision event с required gateId/decisionId; mapping из matching route-trigger registry. Другая target или outcome по имени незаконна. Матрица и payload domain/availability unknown; В-05 не закрыт.

C56. R702/722 → 031:295/138: commit/message-check/push/send отдельны, gate не terminal. Форма узлов/порядка известна; external effects/signatures/confirmation unknown. Submit 061 не delivery/owner approval.

C57. R705/329 → 031:325/329: start/abort/confirmation/resume/next node/idempotency намерения обязательны при применимости. Next node ref локален, key/payload type/domain/requiredness неизвестны. Declared idempotency не exactly-once runtime.

C58. 031:31/45/97/504/676 → 16 закрытых kinds с version/digest, ≤1 binding/kind. Whitelist builtin names не signatures, hash не authority и не полнота. Для каждого kind нужен authoritative source и typed contract; ни Canon update, ни draft 013 не предоставляют его.

C59. 031:67/146/333–335/506/556–560/590/594 → scenarioVersion major.minor, contractRef ID@version, requiredLinks unique и expectedKinds с ≥1 state/actions. Steps непрерывны от0, success length=events, error последний, state/actions по expectedKinds, events nonempty. Только оболочка; initialState/event/payload/state/actions/error signatures и consumer 013 unknown. Совместимость не объявлена.

C60. Q5 и источниковые dispositions → 031:62/95/323. Procedural Q5 имеет document/prompt obligations, прочие Q вопросы не нормы; presentation/starter-kit/frozen не переносимый Canon. DX в method-delta не новый enum coverage: будущие записи обязаны выбрать разрешённый disposition с reason. В impact сокращение DX отсылает к disposition переноса, не предлагается serialized key/value. Дефекта расширения enum не установлено.

## Итог независимых осей

Все 60 маршрутов имеют предметный выход. Новых потерянных mandatory ключей, ложных enum/типов либо missing-field примера, доказывающего новый JSON key, не найдено. Конкретные signatures/domain/availability остаются неизвестными именно там, где карта это называет; условная форма не превращена в sufficiency/compatibility. C17/C22 требуют отдельной семантической редакции REQ/AC/пар; C18–C24 требуют истории/startN/repeat tests, не одной grammar ref. Версии и новое место только В-02. Это закрытие прежнего К1 по нынешнему тексту в данной области, не утверждение будущего полного комплекта 045.

# Полевой crosswalk031 — единственная авторская карта С1п-5

Статус: черновик; не правка approved031 и не новая schema/registry.

Источники: approved `4b48c50eef1fb46af4f074a80511979b16e515e3:doc/tasks/031-runner-regulation-in-plugin/spec.md` (**номера 031 ниже — строки этого original**, не строки этой карты). Методика `a449bd2e218e04384d1d42e0c1bffe892495e298`, M=methodology.md, R=task-runner.md, S=task-sessions.md. Все изменённые смыслы/назначения Canon — `method-delta.md`; карта ниже адресует их атрибуты, а не заменяет внешнюю норму своим пересказом. Прежние семь широких строк заменены, не оставлены второй действующей картой.

## Closed формы и независимые оси

Каждый объект закрыт 031:17–23: required ключ не optional, nullable разрешает только явный null; неизвестный ключ запрещён. Каталожные ID локальны/уникальны, только ASCII regex 031:17; типизированная ссылка разрешается именно в названном namespace. Наличие формы не означает наличие заполненных данных/registry/исполнения.

Вердикты: **уже выражается** (У) — есть разрешённая форма указанной декларации; **нужны только данные** (Д) — нормативные ограничения этой части достаточны, нужны конкретные значения/refs; **семантический конфликт** (С) — прямое противоречие нормы/REQ/AC/пары; **нужен формат** (Ф) — обязательный атрибут без допустимого поля доказан; **внешний контракт** (В) — неизвестны точные signatures/domain/availability/consumer; **открытый вопрос** (О) — источник оставляет выбор открытым. В каждой строке У означает **условную форму при matching registry**, не semantic PASS. Д не назначается неизвестной signature. Ф здесь не доказан; отсутствие Ф не совместимость.

Три оси для КАЖДОГО маршрута: **данные/refs**, **нормативная семантика REQ/AC/пары**, **shape/version**. Ни одна не заменяет другую. Маршруты C01–C60 используют точные общие пределы A/B/T/D/P/G/V ниже; это часть каждого маршрута, не пропуск атрибутов. Итоги по осям — после маршрутов; исключения С помечены явно.

### Повторно используемые точные пути (не имена операций)

**A — намерения.** Источник: 031:37–39,58–61,70,74–89,111,117,325–329. В `actions[]` обязательны non-null ключи `id,kind:string,payloadSchema:object,sourceRef:object,effectBoundary:string`. Boundary — ровно `pure_data|external_effect|human_decision`. В `events[]` те же ключи, boundary — `input|external_result|human_decision|internal`.

`payloadSchema` — ровно `{type:"object",properties:object,required:array<string>,additionalProperties:false}`. Required — distinct и подмножество properties; пустой массив не отменяет обязанность источника. В `graph.edges[].actions[]` упорядочены `actionUse{actionId:string,bindings:object}`, без повтора actionId на ребре, с точной ссылкой на actions.

У edge обязательны `id,from,to,on,outcome:string,predicate,routeId:string|null,actions:array`; from/to ссылаются на nodes, on — на events, outcome задан signature. У graph — startNode/terminalNode/edges, минимум одно ребро для применимой нормы. Порядок launch/save/request/stop/retry декларируется отдельными edges/actions/events, не runtime-полем в корне JSONC.

**B — binding.** Источник: 031:87–89,93–97,111. Закрытые ветви: `{kind:"literal",value:JSON}`, `{kind:"counter",ref}`, `{kind:"parameter",ref}`, `{kind:"event-field",eventId,field}`, `{kind:"document-field",documentId,fieldId}`, `{kind:"context",catalogRef,name}`. Строки non-null и непустые; literal=null допустим только nullable-получателю. Формул, dotted path и fallback нет.

Event-field читает только верхнеуровневое поле edge.on. Context catalogRef ссылается на единственный binding kind=context, name — точное имя registry. Каждое required payload-свойство обязательно связано; весь domain источника включён в domain получателя. Required-получатель требует required availability источника; optional не означает null. Object/array передаётся одной константой или одной совместимой typed-ссылкой, не собирается из частей. Signatures action/event точно совпадают с registry.

**T — fieldSchema.** Источник: 031:74–89. Ветви — ровно string/boolean/integer/enum/array/object; в каждой обязательны type/nullable. Integer добавляет minimum/maximum с типом integer|null и предел безопасных целых ±9007199254740991. Enum добавляет непустой distinct enum. Array требует items с non-null schema и maxItems от 1 до 10000. Object требует properties/required/additionalProperties=false.

Сама schema non-null; nullable относится к value. Проверяется весь domain, не один snapshot. Null допустим только nullable-получателю, потенциально отсутствующий output — только необязательному получателю. T в маршруте означает возможную форму, **не утверждение типа неизвестного внешнего output**.

**D — документы/промпты.** Источник: 031:34,46–49,93,119–121,305–307. У sessions обязательны id/code/kind/phaseId:string, repeatable:boolean, role/promptRef:string|null. Для agent/meeting role и promptRef непусты; для human promptRef=null, для system оба null. PromptRef — имя внешнего prompt registry, не URL или локальный document ID; registry задаёт sourceRef/hash и закрытую schema подстановок.

У document обязательны id/filename:string, phaseId:string|null, statusRules/fields/markers/requiredBy:array. Filename — basename, токены только `{N}`, `{round}`, `{lens}`, `{void}`; literal current.md допустим. У documentField обязательны `id,section,grammar,valueType:string,required:boolean,multiplicity:string,normalization,onInvalid:string`. ValueType: string/integer/boolean/enum/array/object; multiplicity: one/zero_or_one/one_or_more/zero_or_more; normalization: exact/trim/line_endings; onInvalid: error/diagnostic/gate. Grammar — внешняя ограниченная literal/token, не regex кода.

RequiredBy — typedRef только node/session/gate. Status имеет firstLine/meaning/allowedNext с distinct refs. Marker имеет required и count enum exactly_one/at_most_one/one_or_more. Новые ID полей/grammar эта карта не объявляет действующим registry.

**P — progress.** Источник: 031:50,99–109,309,540. Обязательны non-null массивы linePatterns/launchMarkers/finishMarkers/stopKinds/nSourceRules; все, кроме nSourceRules, непустые. LinePattern — ровно `id,grammar:string,mode:counted|zero-unit,hasDate:boolean,unitRule:string|null`. Counted требует non-null unitRule/node.unit; zero-unit требует оба null и допустим лишь для связанных КОММИТ/ПУШ session nodes.

`node.unit` содержит non-null строки source/numeratorRule из единственного внешнего unit binding. `nSourceRules` — точное unique объединение использованных non-null unit rules, не числа или локальные счётчики. Denominator — integer≥0 либо no_data с причиной, неизвестное не заменяется нулём. Summary.N — не N единиц: С2 — итого описи, С3/С4 — count REQ, С8 — count AC. Точные grammar/unit/context signatures остаются внешней неизвестностью UNKNOWN-07 approved 031.

**G — routes/gates/counters/cycles.** Источник: 031:39–43,55–57,95,113–117,321. Route требует id/edgeId/targetNode, trigger{kind,ref:typedRef,value:string|null}, массивы invalidate/enqueue/preserve/counterEffects. Edge↔route — ровно один к одному, targetNode=edge.to. Trigger.kind — event/gate-decision/predicate-outcome. Поля и target enums не расширяются. Invalidate допускает только document/gate, enqueue — node/session, preserve — counter IDs.

Counter — integer/boolean/enum с initial/bounds. Effects: set/increment/decrement/reset/preserve/recompute; when — route/event. Recompute требует non-null ссылочный B, не literal. Set/recompute требуют required non-null source полного совместимого domain; формул нет. `cycle.stage` закрыт: spec/plan/review/delivery/meeting, unique. `cleanChecksParam/ceilingParam/minimumProbesParam` — ссылки на integer parameters с minimum≥1/≥1/≥0 соответственно.

Parameter.required=true требует присутствующего default=null; false — ненулевого type-correct default. Bounds бывают только у integer, values — только у enum; resetPolicy и события — по 031:115. Новые стадии и дубли числовых полей не разрешены.

**V — provenance/refs.** Источник: 031:28–32,62,95,138,279–281,323,339. Обязателен `manifest.methodology={repository,commit,files}`: repository — ровно публичная методика, commit — 40 hex, files — 1..128 уникальных POSIX relative paths с sha256 из 64 hex. SourceRef содержит ровно file/section/commit из manifest, section непустой, commit совпадает.

Coverage entry требует id/sourceFile/anchor/kind/disposition/targets. Kind: rule/format/gate/parameter/example/out_of_scope; disposition: represented/external_contract/not_requirement. Для represented targets — непустые unique typedRef. Для остальных обязателен непустой reason, targets может быть пустым; это не разрешение пустого represented. REQ/AC/DNC targets разрешаются в сопроводительной спецификации.

Registry binding имеет ровно id/kind/version/digest:string, 16 закрытых kinds, version major.minor, digest 64 hex, не более одного binding на kind. Binding без matching registry не даёт семантического успеха.

## Запуски/state/recovery — каждый атрибут отдельно

Ни один C01–C16 не предлагает root launches[]в JSONC. Mutable значение снаружи 031:329; **декларация намерения обязательна**325/329. В каждой строке требуются A/B/V покрытие source→target и внешняя точная signature для указанного атрибута; неизвестность не разрешает выкинуть декларацию.

### C01 R89/93/160/591: порядковый номер каждого запуска, max+1

**Approved 031: поле/тип/кратность/ссылка:** A декларация registration до request, B context/event-field илисовместимый snapshot; session34 не экземпляр запуска

**Вердикт и внешняя граница: следствие для 045:** У форма+В: имя вычисляющего output, integer домен/доступность max из state/log и signature не получены. 045 запросить подтверждённый номер/операцию, не выдумывать builtin max

### C02 R89/160: код и граница сессии от регистрации

**Approved 031: поле/тип/кратность/ссылка:** sessions34code: string, kind закрыт; A registration event/codepayload+B; PlaunchMarker отдельный

**Вердикт и внешняя граница: следствие для 045:** У+В: exact code/source/full payload signature и required availability после registration неизвестны. 045 отдельно от статического справочника sessions

### C03 R159/592: running/регистрация **до запроса**

**Approved 031: поле/тип/кратность/ссылка:** A упорядоченные edges/actions, on/outcome по event signature; G route↔edge, REQ27/29

**Вердикт и внешняя граница: следствие для 045:** У+В: save/request operation names, порядок confirmation/result и signatures unknown. 045 не объявлять atomic/order по одному TaskSession.launch

### C04 R152: atomic save после изменений/перед воротами

**Approved 031: поле/тип/кратность/ссылка:** A state persist intention+G порядок before gate; runtime atomic write исключён 329

**Вердикт и внешняя граница: следствие для 045:** У+В: persist payload/atomicity/подтверждающее событие неизвестны; ES plugin сохраняет Task, не state. 045 нужен external contract, но target declaration непуст

### C05 R160/592: append-only launch record перед строкой launch

**Approved 031: поле/тип/кратность/ссылка:** A registration→linewrite, B typed payload; V source cover

**Вердикт и внешняя граница: следствие для 045:** У+В: append contract/record required fields/nullability/domain/commit availability unknown. 045 требуется намерение и ordering, не root mutable array

### C06 R160/592: длина progress.log **до launch**

**Approved 031: поле/тип/кратность/ссылка:** A/B context или event-field, T для согласованного домена offset; mutable value external

**Вердикт и внешняя граница: следствие для 045:** У+В: units(length bytes/other), safe integer bound, requiredness/name output/signature unknown. 045 не подставлять offset самого запроса вместо до line

### C07 R593–594: offsets **после launch** для progress/profile

**Approved 031: поле/тип/кратность/ссылка:** A две отдельные декларации snapshot, B outputs полностью совместимы T

**Вердикт и внешняя граница: следствие для 045:** У+В: каждая из двух length signature/domain/availability unknown; 045 два атрибута, не одно off_p до launch

### C08 R160/591–595: время запуска

**Approved 031: поле/тип/кратность/ссылка:** A event/context payload, T тип времени только по registry; неавторский clock literal

**Вердикт и внешняя граница: следствие для 045:** У+В: epoch/string/precision/timezone/nullability/name clock output не объявлены нормой. 045 запросить time contract, не придумывать тип API

### C09 R89/159/590: именованная process group до старта

**Approved 031: поле/тип/кратность/ссылка:** A external effect создания→request, B group output; T type по signature

**Вердикт и внешняя граница: следствие для 045:** У+В: identifier string/integer/OS handle и result schema/name/required availability unknown. 045 effect confirmation/result, не псевдооперация stop-group по имени

### C10 R89/159/681: **время старта группы**, сверка identity

**Approved 031: поле/тип/кратность/ссылка:** A/Bgroup identity+starttime перед cleanup; whole-domain T

**Вердикт и внешняя граница: следствие для 045:** У+В: конкретный тип/time precision/identity predicate args/results/domain и availability unknown. 045 нельзя остановить чужой reused PID по одному номеру

### C11 R89/574/600–601: stop **всей** группы и запущенных команд до retry/exit

**Approved 031: поле/тип/кратность/ссылка:** A external effect→подтверждение пустоты→G ветвь retry/exit;325/327/329

**Вердикт и внешняя граница: следствие для 045:** У+В: stop/empty check signatures, scope all commands, success/failure outcomes unknown. 045 нужно покрыть все отказ/retry/inactivity/stop ветви, нет пропуска как«runtime»

### C12 R574/600–601: meeting failed/halt vs вне meeting exit/В13

**Approved 031: поле/тип/кратность/ссылка:** G route/gate/exhaustive outcomes, A result payload

**Вердикт и внешняя граница: следствие для 045:** У+В: mapping результатов stop/failed/halt/confirmation unknown; 045 не выбирать другой outcome/target из догадки

### C13 R594/277: result-count snapshot до call, С5/С5д только прирост этой сессии

**Approved 031: поле/тип/кратность/ссылка:** D result fields+grammar, A/Bsnapshot с nonnull required integer output при required получателе; G recompute только совместимая ссылка

**Вердикт и внешняя граница: следствие для 045:** У+В: name count output/единица old+new/fieldSchema/availability signature unknown. 045 не объявлять формулу new-old регламента, неполный общий result

### C14 R602: tail от после launch offset **только текущий code**

**Approved 031: поле/тип/кратность/ссылка:** A/Btail inputs(code, offset), P декларация progress связи, REQ19/27/29

**Вердикт и внешняя граница: следствие для 045:** У+В: exact tail operation/inputs/output grammar+availability unknown. 045 оба аргумента отдельно с source, не строки любого роли кода

### C15 R681: cleanup прежней group **только под lock**, сверить starttime

**Approved 031: поле/тип/кратность/ссылка:** A/G lock→identity→stop→empty check; lock runtime не JSON key

**Вердикт и внешняя граница: следствие для 045:** У+В: lock ownership/acquire/release/identity inputs/confirmation unknown; 045 декларативный порядок каждого эффекта, not whole external reason

### C16 R681/608: нет group→найти процессы task или В13; существенный journal violation→log, не autorepair

**Approved 031: поле/тип/кратность/ссылка:** A/Btask process lookup/log event+G В13fallback, D log field; разные ветви по source

**Вердикт и внешняя граница: следствие для 045:** У+В: lookup scope/result/availability и journal diagnostic/log signature unknown по отдельности. 045 не останавливать процессы по маске и не автоисправлять запрет


## Progress — формы, история и изолирующие пары

### C17 R88: whole keyword/допустимый знак после, ready colon

**Approved 031: точный маршрут/предел:** P grammar ref103, НО direct 259/309/540 exact готово без colon

**Вердикт и следствие для 045:** **С**: требуются новые REQ/AC/пары в отдельной редакции; grammar не override. У формы/P отдельно, shape Ф не доказан

### C18 R89: одна agent start, launch отдельно, k неубывает

**Approved 031: точный маршрут/предел:** P103–107 counted vs zero-unit/node unit/grammar; A проверка истории

**Вердикт и следствие для 045:** У/Д для известной формы start/launch; В для исторического предиката/context signature. 045 не подменять launch 0/0 агентским стартом

### C19 R90: correction quote10–30/вся короткая, current k/append-only

**Approved 031: точный маршрут/предел:** P grammar+unit, D quoted history/context через B, A проверка; 309append-only

**Вердикт и следствие для 045:** У условной формы+В exact grammar/history signature, не просто regex. 045 новые пары для current k/quote и отрицательных случаев

### C20 R90/275: correction не единица/не живость

**Approved 031: точный маршрут/предел:** P unit rule99–101 и A/G counter effect только в route; B context declared T

**Вердикт и следствие для 045:** У+В: numerator/timer input signature/outcomes unknown. 045 коррекция не increment/не refresh таймера; runtime evidence отдельно

### C21 R91/716: done сравнить со **startN**, k>N допустим

**Approved 031: точный маршрут/предел:** P105/309/540 N/N и 101 agent N приоритет; A/Bstart snapshot/predicate

**Вердикт и следствие для 045:** У для ссылочной формы+В history/unit/context signature; нужно явно оценить semantic REQ/AC/пары start binding, не объявлять прежний final N достаточным

### C22 R91/716: k<startN с обоснованным«N завышено»может completion

**Approved 031: точный маршрут/предел:** P историческая N/N форма 105/309/540 не покрывает исключение; D reason/артефакт+A проверка

**Вердикт и следствие для 045:** **С**по исключению N; У форма grammar/doc+В exact grammar/artifact signature. 045 отдельная изолирующая пара ниже, не 0/2→1/1

### C23 R91/94: финальная ошибка→same k/same keyword повтор, low N→stop/дальше/обоснование

**Approved 031: точный маршрут/предел:** P grammar+history A/B; произвольная запись после final незаконна

**Вердикт и следствие для 045:** У+В history predicate/outcomes/availability; semantic пары current должны утверждаться, не одна grammar ref

### C24 R91/716: done без start/после второго start не completion

**Approved 031: точный маршрут/предел:** P105/309/540 уже отвергает нет start; A/B count start/full history

**Вердикт и следствие для 045:** У известного ограничения+В exact history signature; 045 контроли 0 start/2 start отдельны

### C25 R92: пять stop kinds и причина

**Approved 031: точный маршрут/предел:** P50/109/263/309/540 точно множество 5 без дублей, stop grammar; не success/zero-unit

**Вердикт и следствие для 045:** У/Д: нормы/closed enum достаточны для данных; выполнение grammar при matching registry. 045 surprise/нет вида/нет причины отдельные негативы

### C26 R84/87/94/277: единица доказана артефактом; своевременный step, skip по artifact

**Approved 031: точный маршрут/предел:** D result fields multiplicity+P unit+A/B artifact check; predicates44/97 только внешний whitelist

**Вердикт и следствие для 045:** У+В exact artifact/context/clock/predicate contracts; 045 число строк/готово не доказательство выполненного, никакого semantic PASS по count

### C27 R109–120: длина подписи 80/clock/source, tool если есть/session tail старше общего

**Approved 031: точный маршрут/предел:** P grammar/hasDate: boolean, D prompt/source/substitutions; clock actual external

**Вердикт и следствие для 045:** У/Д известных literal ограничений+В tool availability/clock/prompt contract. 045 не изобретать opencode journal runtime operation из имени инструмента

### C28 R103/215/716: неизвестный N не 0; zero-unit только КОММИТ/ПУШ без profile/done

**Approved 031: точный маршрут/предел:** P99–107 точные union/node/sessioncode/ref; profiles311 не отключаются

**Вердикт и следствие для 045:** У/Д семантики zero-unit; В unit names/signatures/availability. 045 не unit.none и не counted null; profile launch может быть, profile hint нет


### Две независимые пары (не runtime validator)

1. Общий контроль: `С1 0/1 старт → С1 1/1 готово` допустим обоим источникам. Mutation только символа: `…1/1 готово: итог` допустим current R88 по целому keyword/знаку после, запрещён approved259/309/540. Новая grammar ref не отменяет запрет.
2. **Изолирующая N-пара**, одинаковые start/финальные дроби: `С1 0/2 старт → С1 1/2 готово — N завышено: один источник` допустим current R91 **только при правдивом артефакте одного источника**. Без причины `С1 0/2 старт → С1 1/2 готово` не completion. Approved N/N норма семантически не выражает это исключение, хотя shape grammar ref может остаться. `0/2→1/1` не доказывает данное исключение: финальная дробь уже имеет k=N, то есть N/N. Дополнительные контроли k>startN/нет start/2 start не подменяют эту однофакторную пару.

## Проверяющие, second opinion и каждое условие протокола норм

### C29 S69/M707: новая без history, whole-read, immutable version

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D sessions agent/role/promptRef; D документ version/summary, V source hash; A launch policy

**Вердикт, данные и внешняя граница для 045:** У для декларации в prompt/doc+В exact fresh launch/selector/context signature/availability. 045 не равнять repeatable с fresh history, не claim фактического выполнения

### C30 M707: ordinary С2 линзы со своим разделом/счётом/пробами

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D prompt instruction+documents[].fields/grammar/required/multiplicity; **lens 69 sessionId ТОЛЬКО meeting**

**Вердикт, данные и внешняя граница для 045:** У/Д для описания разделов в документе, В точные prompt/grammar contracts. 045 не помещать agent С2 sessionId в lenses, не«исправлять»kind агента ради ссылки. Обычный `spec-review-{N}.md` с разделами двух линз не требует токена `{lens}`/каталога meeting-линз

### C31 M707/Sreview: номер захода/Версия/summary/readlist/3 пробы, обе обязательные линзы

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D summary 305 закрытый N/K/M/P object grammar, review numberBinding121 summary field, not pass units; D другие поля+G minimumProbesParam

**Вердикт, данные и внешняя граница для 045:** У/Д известных текстовых/числовых ограничений+В grammar output/prompt signature. 045 счёт по линзе не одна общая summary без разделов

### C32 M1550: условие перед рекомендацией/до owner decision; default on/explicit off; не helper/не judge

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D prompt/source+parameters 56 required/default по G, A/G предварительный шаг и отключение по решению

**Вердикт, данные и внешняя граница для 045:** У+В policy context/availability/decision event signature; 045 «helpers off»не норма отключения opinion, owner closed list не автоматизировать

### C33 M1550/R232: fresh/different family если доступна; совпадение в ответе

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D prompt+document fields для политики/факта fresh/family+ A/B selector result; НЕ profiles.family

**Вердикт, данные и внешняя граница для 045:** У условной декларации+В selector name/inputs/доступные согласованные поставщики/семья output domain/nullability/availability unknown. 045 отдельный внешний selector contract, не придуманный API

### C34 R232: класс A/reasoning/effort3 или 4, отдельная модель

**Approved 031: поле/тип/ссылка/закрытые ограничения:** profiles 51–54/311 defaults/stageRules/limits; profileValue **ровно tier/effort/reasoning/budget: string|null**, registry values; tier limits heavy/medium/light|null

**Вердикт, данные и внешняя граница для 045:** У формы+В matching profile-stage/value и отображение A→tier/3–4 values; Д только известных условий. 045 family нельзя пятым ключом; выбор модели снаружи/с внешним selector

### C35 M1550: facts-only,≤10 messages, слабое место, log переданный текст/итог, reply вердикт/ref, разошлись оба

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D prompt/fields required/grammar, integer parameter bounds G, A/G order и message counter; V log ref

**Вердикт, данные и внешняя граница для 045:** У+В exact message/record/context signature и availability; 045 нужны каждое текстовое обязательство и контроль≤10, не одно имя lens

### C36 M711: порог>1 нормы/механизм; intent3 поля, факты+свежий собеседник≤10, спорно, запись review task/log

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D intent поля: goal ref/boundary/base excerpts; prompt ref, A/Bexchange, G integer limit; not new root field

**Вердикт, данные и внешняя граница для 045:** У+В: неизвестны точные contracts для count норм/context/prompt/signatures. Для 045 различимы порог, три поля, пометка «спорно» и два места записи; registry/OQ не считаются нормой для этого count.

### C37 M711/1570: intent не agreement/не review/не доказательство; boundary не пишется для norms about review, mixed split

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D prompt/context/disposition fields; G существующие review/meeting ветви, не cycle.stage=intent

**Вердикт, данные и внешняя граница для 045:** У+В точная classification/context schema; 045 не использовать optional согласование как off замысла, не прибавлять чистый заход

### C38 M712: первая boundary строка/возврат если нет, сама boundary проверяема целью

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D required field multiplicity one+grammar/onInvalid gate/error, A/B source goal check

**Вердикт, данные и внешняя граница для 045:** У+В exact grammar/predicate/return outcomes unknown; 045 граница не может вырезать дефект цели, нет валидности по одному required=true

### C39 M713: base hash/выдержка+5 условий«не по адресу», бремя автора/сомнение внесена

**Approved 031: поле/тип/ссылка/закрытые ограничения:** V commit/source; D base excerpt/обоснование; predicates44/97+G outcomes

**Вердикт, данные и внешняя граница для 045:** У+В semantic predicate inputs/result outcomes unknown; 045 на каждую находку проверить не привнесла/не опаснее/не опирается/не должна закрыть/база доказана, а goal не вне предмета

### C40 M713: whole-read/связь соседей; OQ4 поля;>3 critical equiv сигнал; privacy не выносится

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D read list/link evidence/OQ fields question/addressee/default/deadline; G counter min/max и A owner notification

**Вердикт, данные и внешняя граница для 045:** У/Д для известных 4 полей/порога+В точная critical classification/notification/context signature. 045 полнота whole-read и source privacy не по JSON PASS

### C41 M714: сузить/ослабить/удалить/вопрос; new vs clarification; открыто+не утверждает опровержение+вопрос в проекте

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D disposition/marker/OQ record, prompt; G route/только namespace allowed

**Вердикт, данные и внешняя граница для 045:** У+В semantic classifier/payload contracts; 045 не автосоздание задачи, а declared gate при new concept, старый смысл не отменяется

### C42 M714: одна попытка, раздельность, новая существенная→откат+OQ, не по адресу не откат, last ceiling исключение

**Approved 031: поле/тип/ссылка/закрытые ограничения:** G cycle/ceiling/repairRoute/counters/route effects, A/B revert intention+V previous hash

**Вердикт, данные и внешняя граница для 045:** У+В точные findings/version/rollback signatures; 045 история и счётчик не обнуляются, последний заход проверить отдельно

### C43 M715: «не прогонялось», конкретный input+2 readings/нет итога; следующий подтверждает опровержение; impl свидетель

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D marker/trace fields/required/multiplicity, D prompt, V source; A/G review order

**Вердикт, данные и внешняя граница для 045:** У+В exact trace grammar/implementation evidence contract; 045 серьёзность не снижается по отсутствию runtime, трасса не один ярлык

### C44 M715: legal/illegal/why таблица, судья формы, version batch/change list

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D fields/table grammar, V manifest versions/coverage, A publication intent G owner required

**Вердикт, данные и внешняя граница для 045:** У/Д известных обязательств таблицы/судьи; В publication/versioned consumer contract. 045/013 не подтверждает reader, пуш сейчас запрещён

### C45 M716: нормы о самой проверке — исполнимость 2–3 цикла/история, без обхода; mix остальные две линзы

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D prompt/review sections/history records; G existing stage review/meeting, integer parameters; lens69 не ordinary

**Вердикт, данные и внешняя граница для 045:** У+В exact applicability/context/history signature; 045 не выдумывать cycle.stage=executability, не подменять прогоны именем lens

### C46 S66/R105–120: машинный хвост 2 части/код/единица/инструмент если есть/session tail приоритет

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D promptregistry hash/substitutions+sourceRef 93; D doc instruction, A/Btool availability

**Вердикт, данные и внешняя граница для 045:** У+В exact prompt/context/tool contracts; 045 приоритет profile исключения нельзя потерять в общем prompt

### C47 S66: уточнение перед old message с датой/source/пометкой, old сохранить

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D prompt/документ fields и A/B preserve old/write clarification/V source

**Вердикт, данные и внешняя граница для 045:** У+В exact document storage/action signature; 045 не подменять old anchor текущим смыслом, не переписывать историю

### C48 S110: иной project смысл подзадачи

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D prompt/source coverage+sessions kind/code/phases; V override provenance

**Вердикт, данные и внешняя граница для 045:** У/Д нормативной декларации override, не shape изменение; 045 отдельные задачи только разрешённым scope, не из общего слова

### C49 M541/S122/183/192/317–324: first transfer current, immutable approved, one place/copies/literal строки

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D literal current.md, requiredBy/fields/markers, без numberBinding если нет{N}; V source/dest; A/G transfer order

**Вердикт, данные и внешняя граница для 045:** У для формы+Д адресов после ворот, В exact transfer/tool grammar; 045 current061 первый Canon перенос не ждёт format, копии не 2 нормы. Единственность смыслов приёмкой, не JSON-only

### C50 M1562: язык принимающего без optional режима

**Approved 031: поле/тип/ссылка/закрытые ограничения:** D prompt/context instruction+V source coverage; optional subsystem 68 только если режим включён, не условие языка письма

**Вердикт, данные и внешняя граница для 045:** У/Д инструкции+В receiver-language/context/translation evidence contract; 045 не обещать смысловой контролёр по owner_language


## Версии, реестры, ворота и внешняя совместимость

### C51 R169/385/720/M707: immutable pin/hashes/approval не устаревший

**Approved 031: поле/тип/закрытые ограничения:** V manifest files1..128/sourceRef/coverage/report339; approval hash не field регламента

**Вердикт и точная граница для 045:** У/Д pin/hashes данных+В реальный approval/runtime evidence; 045 новый source hash инвалидирует отчёт, commit-only неполнота

### C52 031REQ04/ОТВ 01: schemaVersion vs regulationVersion vs reader

**Approved 031: поле/тип/закрытые ограничения:** root.schemaVersion major.minor; manifest.regulationVersion major.minor.patch; compatibility.minReaderVersion major.minor;03119/23/28/279/281/500/568/670

**Вердикт и точная граница для 045:** У раздельной формы+О выбор редакции/reader на В02; semantic-only не авто bump/не автосохранение. 045 при new key нужна новая schemaVersion+политика, недостаточно менять ref

### C53 Каждый применимый M/S/R/Q procedural anchor→coverage

**Approved 031: поле/тип/закрытые ограничения:** V62/323/343: represented nonempty targets, external/not_requirement reason; sourceFile из manifest; REQ/AC/DNC typed refs

**Вердикт и точная граница для 045:** У/Д адресов из утверждённой нормы+В где подписи unknown; 045 runtime external не разрешает убрать статические декларации A; hash не coverage

### C54 M154/1552/R689–707: owner closed list/defaults/gates

**Approved 031: поле/тип/закрытые ограничения:** gates 40: ownerRequired boolean; true→defaultDecision null, decisions≥1; false→local decision non-null; decision 41 counterEffects=[]; effects 42 payload signature/confirmation

**Вердикт и точная граница для 045:** У/Д известных гейт политик+В фактическое решение/effect contract; 045 не autoanswer owner-gate, не effect-kind

### C55 Rgate-decision: decision→outcome и target

**Approved 031: поле/тип/закрытые ограничения:** G, 031:117: trigger.kind=gate-decision, ref.namespace=gate, ref.id=gate узла edge.from, value=локальный decision.id. Edge.on — событие kind=owner_decision с required gateId/decisionId. Edge.outcome задаётся точной матрицей route-trigger registry.

**Вердикт и точная граница для 045:** У формы+В**точная матрица unknown**, payload/domain/availability unknown; 045 unsupported-catalog не выбрать outcome по имени/whitelistdigest

### C56 R702/722: commit/message-check/push/send отдельно

**Approved 031: поле/тип/закрытые ограничения:** REQ12:295 отдельные nodes/session/gates;138 terminal no outgoing, gate не terminal; G route exact

**Вердикт и точная граница для 045:** У/Д нормативной последовательности+В effects/confirmation/result signatures. 045 submit 061 не deliver/owner approval, пуш не вызывается картой

### C57 R705/329: recovery/start/abort/confirm/resume/next node/idempotency

**Approved 031: поле/тип/закрытые ограничения:** A/G events/routes/typed bindings по REQ29; next node→nodes, idempotency key payload/B по matching T

**Вердикт и точная граница для 045:** У+В exact recovery event/kind/key type/domain/required availability unknown для каждого типа события. 045 не выдавать declared idempotency за exactly-once runtime

### C58 Registry/signatures полного комплекта

**Approved 031: поле/тип/закрытые ограничения:** V31/97/504:16 kind closed, version/digest,≤1 binding/kind; predicateCatalog45 только builtin имена, не signatures; D prompt/T context/A effects/P unit

**Вердикт и точная граница для 045:** У формы+В: полный утверждённый каталог и signatures ещё не получены. В-05 решён только как путь проектирования в 045, не как доказанная полнота. Matching catalog необходим, но один digest или whitelist не подтверждает operation и не доказывает полноту. Требования ко всем 16 видам и matching version/digest не ослаблены.

### C59 Сценарии 013, REQ32/UNKNOWN08

**Approved 031: поле/тип/закрытые ограничения:** scenarioContract 67 version major.minor/ref ID@version, requiredLinks unique REQ/AC/DNC/source; expectedKinds unique поднабор state/actions/error,≥1 state/actions;146 steps continuous eventIndex/error last

**Вердикт и точная граница для 045:** У оболочки+В initial state/event/payload/state/actions/error signatures/availability и approved contract 013 нет. 045 не объявлять совместимость schemaVersion или draft 013

### C60 Q5/P/M history/presentation/starter kit dispositions

**Approved 031: поле/тип/закрытые ограничения:** V coverage kind/disposition/reason; D procedural OQ поля, не runtime новые ключи

**Вердикт и точная граница для 045:** У/Д данных уже принятой Q5 процедуры 9d391ba/process125–144; О внешних Q вопросов; DX для неприменимых presentation/starterkit/frozen историй с reason в method-delta. 045 не выкинуть Q5 как«вопрос»и не импортировать off signoff policy


## Вывод по каждой оси и будущие ворота

**Данные/refs:** C01–C16/C19–C24/C29–C47/C50/C55/C57–C59 требуют точных matching registry/selector/context/operation contracts по каждому атрибуту. Разрешённая форма не доказывает фактические значения. Для известных literal/enum/pin/doc правил Д означает подготовку данных после ворот, не подтверждённый комплект.

В-03/В-05 решён как путь: каталог проектируется в существующей 045. Десять исходных видов сначала утверждаются по закреплённому commit методики как источнику смысла. Шесть predicate/route-trigger/action/effect/grammar/context — предложения «проект реализатора, не источник методики» с отдельными воротами владельца на следующих воротах 045; до решения их нет в данных для чтения 013. Unknown блокирует полноту. Это не готовые signatures/version/digest или утверждение плана. Старое ожидание источника до 2026-10-23 снято, open-questions #4 закрыт. Полное основание — `owner-gate-decisions.md`, В-03/В-05; per-anchor/per-DNC блокер остаётся отдельным.

**Семантика/REQ/AC/пары:** C17 готово: и C22 исключение N требуют явной предлагаемой редакции исторических инвариантов в НОВОМ пакете. C18–C24 также требуют адресной сверки истории/startN/повторов, новая grammar не переписывает прямой REQ/AC. Остальные строчные декларации подчинены точным нормативным условиям и override, не объявляются исполнившимися потому, что есть shape.

**Shape/version:** нового mandatory JSON key gap не показано; сигнатурная неизвестность не доказательство нового поля. При этом семантическая достаточность 1.0 не подтверждена из-за C17/C22. 031:19 расширение unknown key→новая schemaVersion/explicit compatibility;279 reader ниже минимума/unknown major/minor с unknown fields→отказ без fallback;568 major/signature mismatch→отказ. Эти правила НЕ задают готовую bump матрицу для semantic-only edit. На В02 нужно утвердить изменения семантики/REQ/AC/пар→shape-diff→schemaVersion/regulationVersion/minReaderVersion→reader refusal/compatibility matrix. Ни автоматически оставить 1.0, ни автоматически назначить 2.0 нельзя.

Единственное выбранное место новой редакции — `src/runner_core/regulation/format.md`, разделы «Контракт формата», «Версии и совместимость», «Приёмочные пары», «Источники и покрытие». В-02 выбрал также направление адресного уточнения process:185 и нового ADR/реестра/входной ссылки. Это не утверждение ещё не написанных текста/REQ/AC/пар и schemaVersion/regulationVersion/minReaderVersion. Прежняя shape 1.0 допустима только при подтверждённой отдельной оценке versions/compatibility; иначе вопрос о shape возвращается владельцу.

Approved 031 всегда immutable input. Первый будущий перенос любого результата 061, включая Canon README/process/ADR, создаёт current; format-later пополняет его, не откладывая указатель внесённого Канона. Ни current, ни format, ни schema/JSONC/registry сейчас не создаются. Эти трассы и closed limits — не runtime validator, не полная совместимость 013 и не независимый PASS.

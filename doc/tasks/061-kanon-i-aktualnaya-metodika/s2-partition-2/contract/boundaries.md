# Самостоятельная сверка границ 045/013 и поставки

Номера ниже — авторские исходники 045, не копии из main. Spec утверждена, план из 188 строк остаётся черновиком. SHA совпали с назначением. Прочитаны вся spec, весь plan (строка 46 дочитана сегментами), весь plan-review-4, log:1–59 и fixes1–3. Старые исправления — история, не нынешний PASS.

## Два разных блокера

Первый: plan-review-4:9–16 и plan:136–137/154–162 не задают законченный протокол ручной проверки каждого anchor и DNC. Файла с правильным именем недостаточно. REQ-04/AC-03 задачи 061, analysis:25 и trace:A48/A76 направляют исправление в будущую правку плана 045, не в Canon вместо плана. Это достаточный исследовательский маршрут, но не закрытие блокера 045.

Требуемая запись процедуры: ID/source anchor/version/hash; inputs; вопрос проверки; target либо непустой reason отсутствия target; expected; evidence (именованный test/check и фактический результат); reviewer; PASS или NOT VERIFIED с причиной. Одна запись на каждый applicable anchor и каждую DNC. Положительный пример: декларация stop-all имеет отдельные targets, неизвестная внешняя signature раскрыта. Отрицательный: covered только по digest либо из графа удалено намерение stop-all как runtime. Второй случай не PASS даже при syntax/shape успехе. Это проверка обещания 061, не созданный production checklist 045.

Второй: В-05 plan:83–87 и spec:69–79 требуют authoritative registry. Ни обновление Канона, ни рекомендация 061 В-03 А не предоставляют API. Отсутствие источника оставляет блокировку, не запускает проектирование нового контракта. Ответы 045 ОТВ-01/02/03 выбирают место, средства и read-only границу, не whitelist.

## Все 18 REQ: источник → предметный выход 061

Каждая строка сравнивает обязательство утверждённой 045 с обещанием или запретом 061, не принимает будущие артефакты. Общий expected: сохранённая обязанность, точный маршрут или явная внешняя граница. Evidence — названные строки обоих текстов и fingerprints. Во всех строках это сравнение PASS; будущее выполнение 045 — NOT VERIFIED: комплект и скрипты не созданы, план не утверждён.

R01 (045:59). Approved inputs/reviews immutable → 061 REQ-05/DNC-01, impact:120; исторический 031 никогда не destination.

R02 (:61). Pin f333 и конфликт вместо тихой адаптации → 061 REQ-02/06, В-01/01а/02; переход только после owner choice, история не переписывается.

R03 (:63). Настоящий JSONC/comments → impact A/V/C53/58, новый format отдельно от JSONC 045; в 061 артефакт не создаётся.

R04 (:65). Полный passport/files/hash/anchor → impact V/C51/53 и source-inventory; hash не coverage.

R05 (:67). Все graph/recovery branches → impact C01–28/54–57; runtime external не удаляет намерения.

R06 (:69). Все 16 kinds → analysis:26, impact C58; source/signatures явно unknown.

R07 (:71). Prompt/context/unit/predicate/effect/matrix → impact B/D/G/P/V/C55/58; весь domain и required availability, не один snapshot.

R08 (:73). Provenance operation IDs → 061 DNC-02/В-03, impact C01–16/58; normative ID не API.

R09 (:75). Per-anchor/manual semantics → 061 REQ-04/AC-03 и analysis:25; исправление именно плана 045.

R10 (:77). Missing refs/catalog/matrix → impact C55/58, В-03; NOT VERIFIED, не default route.

R11 (:79). Read-only013 comparison → 061 REQ-04/AC-04, analysis28; конкретные unknown, без возобновления.

R12 (:81). Все слои verification и команды → analysis25/REQ-04; это future plan045, общего validator061 нет.

R13 (:83). Positive/negative fixture diagnostics → impact C17–28/В-02, analysis:25; новые семантические пары требуют утверждения, не заменяют семь проб 045.

R14 (:85). Owner gates для spec/plan → 061 В-01/02/03 и DNC-01; текущий аудит не разрешает реализацию.

R15 (:87). Комплект/evidence/dispositions → 061 REQ-04/05 и trace:125–146; исследование не выдаётся за выполненную 045.

R16 (:89). One destination/tools/delivery → 061 spec:76/84–88, analysis:34; directory согласован с 045, имя format.md и четыре раздела — только предложение В-02. Scripts 045 не будущий reader.

R17 (:91). Separate tree/no config/main → 061 DNC-01/04, read-only baseline; чужие коммиты не перенесены.

R18 (:93). Privacy/factual PASS → 061 DNC-02/04, traceA68; guards здесь не запускались и PASS не объявлены.

## Все 14 AC: inputs/source → expected/evidence/исход

Для каждой AC входы — утверждённая запись 045, плановая строка того же AC и связь 061. PASS этой сверки означает сохранённую границу; сама будущая AC отдельно NOT VERIFIED по указанной причине.

A01 (:97/plan44): стадийный список paths, 061 DNC-01/04. Expected — нет производства в 061; собственный baseline подтверждает. Исторический состав начала 045 сейчас не аттестуется повторно.

A02 (:99/plan45): provenance origin base. Expected — 061 не меняет refs/ancestry 045. Baseline сохраняет HEAD/status; историческое происхождение 045 не подтверждается одним нынешним HEAD.

A03 (:101/plan46): все 15 approved source файлов. Expected — immutable approved 031, без сокращения по новому inventory 061. Собственный hash spec 031 подтверждён. Полный будущий inventory 045 — NOT VERIFIED, его команда здесь не исполнялась.

A04 (:103/plan47): Canon conflicts. Expected —061 отделяет новый Canon/В-02 от immutable031; source exact process185 первично прочитан. Тихой адаптации нет.

A05 (:105/plan48): pinned bytes/ranges. Expected — exact old/current в 061, будущие upstream/gates названы. Нынешний remote latest не измерялся; будущий passport 045 — NOT VERIFIED.

A06 (:107/plan49/98–124): 25 required roots, 3 optional. Expected — closed root 031 сохранён, semantic-only не означает автосохранение версии. Первичный 031:27 подтверждает список. Future removal scripts не существуют; выполнение NOT VERIFIED.

A07 (:109/plan50):16 kinds/full signatures. Expected —061 В-03/analysis26/impactC58 держат отсутствие authority блокером. Registry PASS NOT VERIFIED: нет authoritative bundle.

A08 (:111/plan51): source↔ID/signature. Expected — предложенные имена не operations, negative unknown-op отдельно. Impact C01–16/55/58 это соблюдает; реальных whitelist tests нет.

A09 (:113/plan52/136): каждый anchor/disposition/manual record. Expected —analysis25 требует per-anchor поля, а не имя файла; блокер план-review4 остаётся. Конечная semantic review045 NOT VERIFIED, пока план не исправлен/утверждён и не исполнен.

A10 (:115/plan53/137): fields/versions/steps/responsibility 013. Expected — конкретный comparison, hashes/status before/after; собственная матрица 013 ниже. Совместимость NOT VERIFIED из-за неутверждённого контракта.

A11 (:117/plan54/59–70): команды/expected/positive каждого слоя. Expected —061 не превращает scripts045 в продукт. Order2→6/7→8→9→10 существует в плане, scripts не запущены.

A12 (:119/plan55/138–145): семь mutation cases. Expected — семь самостоятельных, не счёт 25 roots вместо них. Названы duplicate key/trailing comma/unknown operation/invalid signature/missing node/missing transition/digest mismatch. Future outputs NOT VERIFIED.

A13 (:121/plan56/130/168/176): единственный комплект/current/versions. Expected —061 current при первом любом переносе, format послеВ-02;045 свой current своим шагом, не изменение чужой задачи. Реальная поставка не произведена, NOT VERIFIED.

A14 (:123/plan57/146): privacy full scope и actual output. Expected — без ложного PASS; guard здесь не исполнялся. Будущий privacy результат 045 — NOT VERIFIED до разрешённого прогона.

## Все 9 DNC: отдельные проверяемые границы

Процедура будущего плана должна у каждой строки иметь inputs/source/target-or-reason/expected/evidence/result. Ниже собственная проверка 061 по каждому запрету, не исправленный DoD 045.

D01 (spec127/plan154). Проверить историю owner approvals и появление production artifacts по стадиям, не один конечный status. 061 не разрешает bypass spec/plan; expected=no artifacts. Собственные commands/paths и baseline — PASS границы 061; история выполнения 045 отдельно не судится.

D02 (129/155). Exact protected paths: approved031/message/reviews, methodology, Canon, config/main/чужое. Expected hashes/status unchanged; baseline-before/after это проверяет в названной области. Не фильтровать вложенные журналы по basename.

D03 (131/156). Осмотреть paths и список команд/наблюдений на parser/runtime/live/scenario/git/jump/commit/merge/push/restart/delete. One-off evidence не reusable product. Expected=no such operations. Собственный перечень команд соответствует; scripts/probes 061 не потребитель 031.

D04 (133/157). Task/spec/plan/code/tests/settings 013 и новые заказы. Expected=read-only before/after и отсутствие постановок 013. Собственная внешняя область: хеши 8 файлов и весь src, если появится; HEAD/status и наличие каталога. Заказов или новых задач не было; совместимость не объявлена.

D05 (135/158). Именованный semantic-claims check читает все compatibility/operation/PASS claims против source signatures. Expected=UNKNOWN при отсутствии. 061 spec22–26/64/78/impact118, собственная matrix не выдают shape за compatibility; PASS именно проверки границы.

D06 (137/159). Для каждого ID/value/mapping/prompt/context проверить authority/version/signature, proposal держать вне whitelist. Expected=unknowns not invented. 061 В-03/impactC55/58 дают точную неизвестность; authoritative bundle NOT VERIFIED, не PASS.

D07 (139/160). Сопоставить ОТВ-01/02, план:13/90/185 и spec 061:76/84–88. Единый directory, one-off tools, delivery отдельно. Expected=format name/sections/process185/newADR только после В-02. PASS границы; destination не создан и этим аудитом не утверждён.

D08 (141/161). Два независимых входа: история создания задач/сессий/заказов и рекурсивный состав/имена task folders до/после. Expected=никаких новых child tasks без owner permission. Отсутствие папок не доказывает отсутствие создания; один log не доказывает состав. Analysis:25 сохраняет обе части. Сессия не вызывала spawn/assign/order. PASS границы 061; доступ к полной внешней истории плагина 045 не присваивается.

D09 (143/162). Full public text/privacy и source-backed live claims; expected=no machine locators/secrets/private names/no fake live proof. Собственные evidence используют относительные source refs; runtime/live не проверены, privacy guards NOT VERIFIED и не обходились напрямую.

## В-05: отдельно каждый вид и недостающая authority

Первично: 031:31/93/97/117/504/676, spec 045:69–77 и plan:74–87. Для всех 16 видов ниже нужны owner, immutable version, digest и provenance. Норма даёт обязанности и некоторые IDs, но не подтверждает consumer API.

1. predicate — builtin whitelist, closed args schema, resultType, finite outcomes; authoritative signatures UNKNOWN.
2. unit — source/numeratorRule, numerator+denominator и no-data, domain/availability; имена/signatures UNKNOWN.
3. route-trigger — согласованная gate-decision→outcome матрица; UNKNOWN, target из догадки запрещён.
4. event — kind, closed payloadSchema, requiredness/domain, boundary; actual signatures UNKNOWN.
5. action — kind, payload/bindings, boundary, confirmation/result; actual operations UNKNOWN.
6. effect — gateEffect signature/boundary/confirmation/resultEvent; не effect-kind, authority UNKNOWN.
7. profile-stage — stage names/inheritance/alias; полная matching registry версия UNKNOWN.
8. profile-value — tier/effort/reasoning/budget nullability/enums, task tier mapping; UNKNOWN.
9. gate — gate identifiers/policy sources; полный authority комплект UNKNOWN.
10. outcome — закрытые допустимые результаты и их принадлежность signatures; UNKNOWN.
11. document-status — статусы/переходы/grammar; source формы известны, полный registry UNKNOWN.
12. grammar — literal/token rules, output fieldSchema/domain/nullability/availability; UNKNOWN.
13. scenario — contractRef/version, initialState/events/expected/actions/error signatures;013 не утвердил, UNKNOWN.
14. role — закрытые имена ролей/источники; полный matching registry UNKNOWN.
15. prompt — sourceRef/commit/hash/closed substitutions schema; полный комплект UNKNOWN.
16. context — output names/recursive fieldSchema/domain/nullability/required|optional availability; UNKNOWN.

Исход проверки 061: В-03 рекомендует А с доводом; А не утверждает существование источника. При его отсутствии В-05 остаётся, Б требует нового отдельного разрешения. 013 автоматически не назначается владельцем API.

## Поставка и соседние обещания

ОТВ-01 выбирает directory рядом с будущим reader; plan:13/90/185 фиксирует `src/runner_core/regulation/`. Это не доказательство существующего reader и не утверждение имени `format.md`, предложенного в 061. Spec 061:76/84/86, trace:129–135 и impact:120 ставят имя, четыре раздела, адресное изменение process185 и новый ADR за В-02. Approved 031 никогда не target. Единственность комплекта запрещает вторую действующую норму в tasks. Наличие каталогов не доказывает completeness; указатели должны вести на действующий результат.

Самостоятельные трассы: (1) Canon-first + current сразу, format-later + пополнение — законно; (2) те же переносы без current до format — запрещено; (3) ADR первым — current в том же шаге; (4) format первым после В-02 — current тогда; (5) format без В-02 — запрещено; (6) редактировать approved 031 после В-02 — запрещено. Сверено с current S192/M541 и REQ-05/AC-05/08/spec88/trace141–144 задачи 061, не по guard-условию result.md. М1 в контрактном стыке устранён, общего разрешения отложить указатель нет.

## 013: поля и пределы сравнения

Источники: spec1–105/245–270/423–534/690–716, message1–74 и log1–42. Важны REQ-24/26–30 и AC-23/24; source pin013 `cd3cb092…`, не current061. Draft schema и примерная смысловая step(state,event) не actual typed signature.

- Паспорт:013 REQ-30 требует отдельную версию/hash/полный commit/approval до кода. 031 scenarioVersion/contractRef не заменяют его; точные одинаковые значения UNKNOWN.
- InitialState/state:013 сериализуемый снимок, не заданная approved fieldSchema;031 expected state object только оболочка. Совпадение смысла, типы/полный domain UNKNOWN.
- Events/payload: 013 описывает session completion/owner reply/start, а 031 — внешние kinds/payload signatures. Имена/required keys/outcomes не утверждены в 013; match UNKNOWN.
- Steps:013 требует последовательность ожиданий;031 непрерывные eventIndex/steps до ошибки. Соответствие конкретной оболочки не approved consumer contract.
- Actions:013 pure step возвращает намерения, I/O у оболочки;031 data намерений не выполнение. Порядок значим обоим, actual schemas UNKNOWN.
- Error/diagnostics:013 неверный event не продвигает фазу;031 scenario error из внешнего registry. Exact code/payload/domain UNKNOWN.
- Version/source:013 REQ-26/30 запрещает плавающий main/fallback;031 три версии и отдельный scenarioRef. Одно schemaVersion равенство не совместимость.
- Approval/source authority: message:46–49/log:16/42 — известная история от 2026-10-09. Ни нового решения 061, ни свежего API из неё не следует. Spec draft, контракт/plan/code не созданы, src/runner_core отсутствует. Это неизвестность, не доказательство несовместимости или совместимости.

Ни один NOT VERIFIED внешнего consumer не является недочитанным источником этого аудита: доступные применимые поля/решения прочитаны, отсутствующий утверждённый контракт не выдуман.

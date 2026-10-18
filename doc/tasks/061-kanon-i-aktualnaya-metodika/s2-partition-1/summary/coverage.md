# Сводная карта обязательств и границ

Это карта аудита, не исправление авторской trace. Нумерация C1…C26 ниже — последовательные содержательные строки `../contract/matrix.md` (9–18,24–32,38–44); M — `../methodology/delta.md`. Собственное чтение предмета/постановки полное; первичная сверка ключевых стыков перечислена в `read-map.md`. Полное чтение approved031 аттестует С2к, полный применимый normative diff — С2м, по исключению `log.md:30`.

## Все REQ / AC / DNC

| Обязательство | Источник и точное evidence частей | Собственная сверка / общий вывод |
|---|---|---|
| REQ-01 | message15; M30–39, fragment-map28–31; C11–16,24 | process5–12; M154/709–716/1550; обязательность не выключается provenance. Прежняя2 исправлена |
| REQ-02 | message13/15/21; M26–60; C1–26 | Полный список hunks получен самостоятельно; old/currentS66 и algorithm проверены. Остаток М3, контрактные атрибуты К1 |
| REQ-03 | message17; C1–26 и report24–36 | Первичные03152/69/259/309/325/329/540, currentR88–94. Semantic conflict доказан; К1 — неполнота полнополевой карты, не найденный новый JSON-key |
| REQ-04 | message19/21; boundaries5–29, C24–26 | Оба045блокера отдельны; draft013 неAPI. Достоверность FACT04/05 подтверждена первичными стыками; В03 остаётся выбором |
| REQ-05 | message9–11/23/33; M32–35/47–49, C19/21 | spec38/82 требует Canon; spec88/trace46 назначает current только format. М1. Архив031 больше неtarget; proposedместо требуетВ02 |
| REQ-06 | message13/41; fragment-map29, fingerprints25; C20 | spec40/54/56/90 требует gate-time upstream/drift/переход; это будущий AC, remote latest сейчас не переаттестован |
| AC-01 | REQ01/02, M всеhunks; C15–18 | Проверяемая форма есть; авторская карта не полна: М3 |
| AC-02 | REQ03; C1–26/probesП1–3 | Labels6/строк7 не expressibility. К1; триоси отдельно |
| AC-03 | REQ04; boundaries5–13, probesП4 | По045review14–16 нужны inputs/record/target-or-reason/evidence/PASS-or-NOT VERIFIED; маршрут в план045, не закрытие Каноном |
| AC-04 | REQ04; read-map44–47/boundaries24–29 | Проверяемы hash/status/intent и отсутствиеsrc; не совместимость |
| AC-05 | REQ05; M33/48/49, C19 | Будущая поадресная сверка есть; currentfirsttransfer недостаточен (М1), остальные destination/preservation исправлены |
| AC-06 | REQ06; methodology fingerprints25/qualification | Drift должен вернуть затронутые решения на ворота; нет фиктивного сегодняшнего latest/PASS |
| AC-07 | REQ05/06; fragment-map30–32 | Выбор владельца обязателен, молчание не разрешает переход; старые pins/серии сохранены |
| AC-08 | REQ03/05; C5/7/21, report46–48 | Готово:-конфликт первично подтверждён; versions не выбраны, shape gap не доказан; отдельная N-пара не изолирует исключение (К1) |
| DNC-01 | message35–37; fingerprints обеихчастей | Текущие protected SHA/внешние109 сравнены; approved навсегдаinput; В02 не исключение preservation |
| DNC-02 | message17/19/21/31; C20–26 | Закрытыеlimits/registry ≠ исполнение; отсутствияsrc/новогоJSONключа недостаточно дляPASS |
| DNC-03 | message9/19/33; qualification обеихчастей | История полных/partial/трёхправок сохранена; registration расхождения не чинятся; чистаясерия0 |
| DNC-04 | message25/37; qualification обеихчастей | Разрешённая работа только чтение/evidence/журналы. Не покрывает атомарно всеconstraints исходника: М2 |

## Join всех изменённых и относящихся к контракту смыслов

| Методический смысл (точные ranges в M) | Маршрут С2к | Сводная квалификация |
|---|---|---|
| M154 кто решает / Rgate | C23–24 | ownerRequired/defaultDecision, outcomes/signatures; реальное решение внешнее |
| M266/541/1119; S82/122/134–137/150/183/191–192/211/317–324 | C19, C11, C17 | documents/filename/fields/requiredBy + prompt; смысловая уникальность/первыйперенос проверяются приёмкой; М1 |
| M709/711 замысел/условие/собеседник | C13 | docs/parameters/prompt/actions, внешние signatures/selector; не новый runtime-state key |
| M712–714 граница/база/вынос/ответ/откат | C14 | docs/predicates/counters/cycles/routes с closedstage/bindings; внешняя конкретная signature, не inventedpredicate |
| M715 trace/notrun/формы/судья/версия | C15/20/21 | docs grammar/coverage/manifest; evidence выполнения отдельно |
| M716 нормы самойпроверки | C16 | отдельнаялинзаисполняемости/циклы/история, meeting-onlyкаталог не обычныеС2линзы |
| M1550–1551/R232–233 | C11–12 | четыреprofileValuekeys; family/freshhistory через prompt/doc/selector, не пятыйключ |
| M1562 языкпринимающего | C17; методическая M37 | prompt/context/sourcecoverage; AGENTS/core лишь передают инструкцию, не смысловойконтролёр |
| M1570 замысел против согласования | C13–16 | не отменяет отдельного замысла; правила процедуры не runtimePASS |
| M10/1710; registry/readme/externalAGENTS | C20/22 | provenance/coverage, исторические/externalправила не импортируются |
| S66 machine-tail/уточнение; S69 restart+registration; S87–88 launcher | C17/C1–4 | сохранениестарогосообщения, prompts/docs/actions; группапроцессов/offset внешние, намерение обязательно |
| S108–111 определения | C18 | смысловойprojectoverride вprocess151–160, не schemaрасширение |
| R24/78/84/88–94 | C1/5–10 | sessioncode/launch/keyword/correction/startN/stops/артефакт; semanticредакция отдельно отформы |
| R105–120 | C17 | обязательныйjournal-tool и приоритет sessiontail; не просто текстобщегопромпта |
| R159–160/275–277 | C1–4/6–10 | mutable state внешнее; декларациииartifactchecks обязательны поREQ27/29 |
| R574/590–595/600–602/608/681/716 | C1–4/7–10 | stopgroup/starttime/lock/offset/snapshot/tail/retry/log violations; signature/availability неизвестны, каждому атрибуту своя внешняяграница |
| OQ5 процедура | M10, C17/22 | Уже принята9d391ba/process125–144, не открытыйвопрос; авторскийdelta не указал disposition (М3) |
| OQ7–87 вопросы/термин; starterkit/presentations | M5–22 | Вопросыненормы, presentationнеоригинал, starterkitнеprojectoverride. Полныйdiff прочитанС2м, своего исполнения/selftests не заявляет |

Все26 строк C осмотрены по содержанию: C22 включает coveragekind/disposition/reason/target, C25 полныйregistry/signatures/availability, C26 scenario013; это ограничения всех предыдущих условных маршрутов, а не три строки, которые можно пропустить после названия темы. Для каждого относящегося к контракту смысла M есть адрес формы либо точная внешняя граница. Ошибка авторского crosswalk не превращает отсутствие его полевойкарты в GAPаудита: аудит восстановил эти маршруты и показал дефект.

## Атомы постановки и исключения чтения

Самостоятельно сопоставлены все16содержательныхабзацев message3/7/9/11/13/15/17/19/21/23/25/29/31/33/37/41 с83 перечисленными атомами fragment-map7–22. Номера/счёт не доказательство: отдельно проверены потерянные profile/publicity/tool-refusal/submit/self-retry (:25) иscope/newtasks/models/queue (:37). Уавтора9тематическихстрок/0строк«не требование»; исходныеограничения остаютсяобязательными, но авторская доказательнаякартаихнеразличает. Все4 вопроса прочитаны: В01 выбираетА, В01а безопасноостанавливаетdrift, В02 условноА с воротами, В03 не выбираетмежду источником иотдельнойпостановкой. Это М2, не требование83новыхREQ.

Исключения `methodology/read-map:35–47` проверены не blanketPASS: неизменённые общиепрактики29–87/166–202 перекрываются полнымиalgorithm/sessions; deployment/MR284–448/770–875 иperformance968–1006/1025–1095 вне запрещённойреализации; sideissue1128–1372/внедрение1759–1990 неиспользуются дляsubjectPASS; tooling1591–1675 не изменялось, изменённыйсмыслформы/стражей1699прочитан; frozen1716–1739 историческийснимок. Ни один changed/citednormativeanchor этими исключениями не вырезан. Старые1129строкcompleteness — provenance, currentреестр52строки прочитан полностью. Contractread-map исключаетисторическиесамопробыtrace111–527/старыеreviews иостальнойplugin/013, не нормативныйspec031: он прочитанполностью. Актуальныеблокеры045 установленыspec+plan+review4, consumer013 — релевантнымиREQ/AC/message/log; полногоimplementationaudit не требуется и не заявляется.

ЛинзаА проверяет полноту/обоснование; линзаБ — честныйпроходсотложеннымformat, ошибочныйlenses/profile/launchmapping, готово:/startN, ложныеregistry/runtimePASS. Непроверенной применимойобласти в пределах разовогоразделения не обнаружено; полнота не выводится из статусовcomplete двухчастей.

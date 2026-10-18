# Независимая карта проверки

## Основа и delta

O=f333efa319e445efe029ee6963b477ca8fe3bc1c;
C=a449bd2e218e04384d1d42e0c1bffe892495e298.
Полный diff O→C получен собственным `git diff --unified=3` для всех 16 путей.
Служебные выводы оболочки дочитаны, а длинные нормативные строки повторно показаны
через `read_source.py` по 900 знаков. Это не копия внешней методики в репозитории.

| Первичная область | Собственная проверка смысла | Маршрут предмета / вывод |
|---|---|---|
| AGENTS O55–62/C55–65 | Добавлены именно frozen перечень и граница аудита методики; живые выводы не frozen | F01/M19/DX: не импортировать чужой исторический снимок |
| README O/C | Навигация: старое название полноты заменено реестром практики | F02/DX, не новая норма |
| P полный diff, включая удалённые 1–1170 | Удалены историческая сверка, источники/числа старых редакций и стыковка алгоритма; возврат проектных правил перенесён в реестр | F03: история не исчезнувшие новые обязанности продукта; действующие оригиналы проверены отдельно |
| P C1–52 целиком | Подтверждение практикой в отдельном столбце, partial не выключение; 42–49 различают result, convergency, intent, opinion, roles, terms, language, clarification | REQ01/02, M/S/R и C29–50/C60: не потеряны условия |
| Q полный diff и C1–87 | C5 — процедура; формулы и нерешённые варианты не действующее разрешение | F04/D4/C60; Q5 равна принятой 9d391bad… побайтно |
| M154 | Вне списка решает оркестратор, ворота и сомнение — владелец; закрытый список прочитан 145–154 | M02/D5/C54, ADR0010 сохраняется |
| M266,540–541,1118–1119 | Результат вне task, самодостаточность, сохранность approved, current тем же переносом, обновление адреса, ограничения копий | M03–06/M16/D1/C49 и AC05: первый Canon перенос не ждёт format |
| M707–720 целиком с длинными строками | Обе линзы; область; base burden; whole read; замысел до правки; off-scope не иммунитет; одна попытка; формы/судья; исключение норм о самой проверке; fresh без истории | M07–15/C29–45: отдельные нормы, не отключены provenance/optional agreement |
| M1550–1571, соседние 1532–1613 | Opinion default-on, не helper; facts-only, лимит10, журнал; profile; independent language rule; agreement имеет своё условие макета | M17/18/C32–37/50 и D0/D5: не выдумана обязательность optional subsystem |
| S1–416 целиком | Все prompts, preparation, статусы, терминология, перенос/копии/приёмка; old S66 не содержала clarification | S01a/b–S12, D0–D4, C46–49; project подзадача — semantic override |
| R1–723 целиком | Полный цикл, машинные формы, profile, state, stop/retry, gates, проверочные примеры; run/request/save/offset не смешаны | R01–18/C01–28/C51–59; ручной Canon override не доказательство stateful runtime |
| Algorithm C1–370 целиком | Research/документы имеют E и эквивалент доказательств; неизвестное не факт; DoD/контроль/границы публикации | Algorithm old=C=ab2 raw 51475 bytes ff55cf…; CRLF отдельно 8a0004…; нового semantic delta нет |
| presentation оба полных diff | Вывод ролей/opinion/result/terms/clarification производный, не самостоятельное расширение нормы | F06/07/DX, продуктовый UI не цель |
| starter README/conf, четыре selftests, portability — все diff | Default signoff off и лицензии комплекта; tests явно strict; фиксирован committer time | F08–14/DX: не обновление guards этого проекта и не отмена AGENTS -s; команды не исполнялись |

Принятое журнальное ab2a4ef→C меняет R только вставкой 232–233 о втором мнении.
Следовательно, новые относительно O journal/lifetime нормы не выдаются за впервые принятые в 061.

### Наблюдаемый checkout 78ed7583…

Отдельный собственный diff C→78ed: пять путей. M156–157 требует вопрос на воротах,
S234–245 — проверку внешних предпосылок и вопросов исполнителя, P две provenance строки,
Q88 — открытый быстрый путь, presentation — отображение M. R/algorithm не изменены.
Ни local HEAD, ни переданный 76c1206 не объявлены remote latest или pin задачи.
REQ06/AC06/В01а обязывают полный delta и повторные ворота перед будущим переносом;
от draft не требуется заранее выполнить перенос. Доказанного обхода этих ворот нет.

### Область неприменимости неизменённых частей

Не переносится вся историческая инфраструктура исходного проекта: его среды, трекер,
контрактная поставка и практические эпизоды не становятся новым продуктом 061.
Проверены нормативные связи с ролями, ADR, результатом, запросом, полнотой, открытыми
вопросами, свежестью и доказательствами; неизменённые инструкции иных фаз не выдаются
за новые delta. Тексты runner/sessions/algorithm прочитаны целиком, не по оглавлению.

## Approved 031 и все маршруты C01–C60

Самостоятельно прочитан весь approved spec 1–732, raw 177306 bytes,
SHA a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829.
Task 1–46, trace 1–109/528–550, запись approval log61 — первичное происхождение,
не прежние findings061. Остальная история031 не используется как новый норматив.

Общие пределы проверены по original17–147,267–343,508–612,668–684:
обязательность ключа отдельно от nullability/availability; ID локален namespace;
у локальных status/field/marker/decision/gate-effect обязателен owner; global owner запрещён.
Closed fieldSchema имеет шесть ветвей с nullable и обязательными branch keys;
integer safe bounds, enum subset, array items/maxItems и object required/properties
проверяются рекурсивно. Не подменять whole-domain удачным runtime value.
Binding шесть закрытых ветвей, context matching kind/context, event=edge.on;
object/array одной константой/ссылкой. Route аннотирует edge, counter пишет только route;
gate-effects не переходы. Локальные структурные ограничения registry не отменяет.

У/Д/С/В/О ниже — категории subject; «Ф не доказан» не значит совместимость.

| C | Что сверено самостоятельно по original | Вывод по объявленной области |
|---|---|---|
|01|325/329 registration intention; static session не launch instance|У+В output max/state/log неизвестен, built-in max не выдуман|
|02|34 code/kind/role/prompt; registration payload vs marker|У+В: static code не свидетельство регистрации|
|03|37–39/117 ordered edges/actions до request|У+В: подтверждение save/request неизвестно|
|04|13/325/329 persist intention vs atomic state|У+В: атомарность runtime отдельно|
|05|325/329 append→line, B payload matching|У+В: append signature не придумана|
|06|87–89/111 offset before launch|У+В: единица/домен/availability отдельно|
|07|111 два post-launch offsets progress/profile|У+В: не один pre-offset|
|08|74–89 time result через matching schema|У+В: epoch/string не выбран|
|09|325/327 create group перед request|У+В: OS handle не string по догадке|
|10|87/111 identity и starttime перед stop|У+В: reuse PID не разрешён|
|11|325/327/329 stop-all→empty→retry|У+В: всё дерево команд, не один процесс|
|12|39–43/117 failure/halt/exit gates|У+В: target не угадан по названию|
|13|48/87–89/111/113 snapshot count до call|У+В: recompute ссылочный, не арифметика регламента|
|14|99–109/325 code+post-offset tail|У+В: оба input обязательны|
|15|325/329 lock→identity→cleanup|У+В: lock не root mutable key|
|16|325/329 lookup fallback/В13 и log diagnostic|У+В: две ветви отдельно, не auto-repair|
|17|259/309/540 exact готово против R88 знака после|С доказан; У формы отдельно; новая grammar не отменяет REQ/AC|
|18|103–107 start/launch/node.unit|У/Д literal формы и В истории; launch не start|
|19|103/111/309 correction/history/quote|У+В grammar и history; append-only сохранён|
|20|99–101/113 numerator/timer effects|У+В: correction не increment/живость|
|21|101/105/309/540 vs R91 startN и k>N|У+В формы/history; semantic сверка явно обязательна, прежний final N не объявлен достаточным|
|22|105/309/540 N/N vs R91 exception при правдивом artifact|С по исключению; У/В отдельно, пара не меняет denominator|
|23|105/309 history after final|У+В; новые semantic пары отдельно утверждаются|
|24|105/259/309/540 отсутствие старта|У+В history, 0/2 starts проверяются раздельно|
|25|50/109/263/309 stopKinds ровно5|У/Д enum и reason; missing/дубль/чужое запрещены|
|26|48/99–109/325 artifact vs journal|У+В: число строк не доказательство|
|27|34/93/103 signature80/date/tool prompt|У/Д literals+В clock/tool; имя инструмента не runtime API|
|28|99–107/311 unknown N vs zero-unit|У/Д+В: zero-unit только связанные КОММИТ/ПУШ, не отключение profile|
|29|34/93/138/339 immutable source и fresh policy|У+В selector; repeatable не fresh|
|30|48/69/119 ordinary prompt/doc vs meeting lens|У/Д+В; agent С2 нельзя lenses.sessionId|
|31|57/121/305 summary N/K/M/P и minimumProbesParam|У/Д+В; summary.N не unit denominator|
|32|34/56/117 opinion order/default-on|У+В; helper off не opinion off|
|33|52 exact profile keys vs selector/context|У+В; family не пятое поле|
|34|51–54/311 registry tiers/effort|У+В и Д известных условий; A→tier не объявлен готовым|
|35|48/56/93/117 facts-only/10/log/reply|У+В signatures; лимит и два ответа не потеряны|
|36|48/56/93 intent3 fields и норма threshold|У+В; не новый root/cycle|
|37|34/48/57 intent не meeting/approval|У+В; mixed boundary исключение сохранено|
|38|48 required multiplicity/onInvalid|У+В semantic goal check не required=true|
|39|62/95/97/138 базы/выдержка/burden|У+В semantic classifier, не checksum proof|
|40|48/56/62 whole-read/OQ4/privacy/signal|У/Д известных полей+В проверки смысла|
|41|48/62 disposition/OQ/prompt|У+В: вопрос не автоматическая задача|
|42|43/55–57/113 ceilings/repair/revert|У+В: origin/history не сбрасываются|
|43|48/49/62 implementation/trace|У+В: отсутствие runtime не снижает серьёзность|
|44|48/62/138 form table/judge/version batch|У/Д+В publication; пуш сейчас не разрешён|
|45|34/48/57/69 norms about review|У+В: 2–3 цикла, не выдуманная stage|
|46|34/93/111 machine-tail policy|У+В context/tool; session profile exception старше общей|
|47|48/62/325 clarification/old source preservation|У+В storage/action; старый якорь не переписан|
|48|34/62 roles/override provenance|У/Д; project термин не shape gap|
|49|46/48/49/119/121 current literal|У/Д+В; отсутствие N означает запрет numberBinding|
|50|34/68/134 language input/output|У/Д+В: язык ответа действует без optional language|
|51|28–32/138/339 source hashes/approval|У/Д+В: commit не подтверждение review|
|52|19/23/28/279/281/500/568/670 версии|У+О; semantic-only edit не назначает автоматически schemaVersion|
|53|62/95/323/343 source targets/reason|У/Д+В signatures; runtime boundary не пустой represented|
|54|40–42/293 ownerRequired/defaultDecision|У/Д+В; true требует null default и decisions≥1|
|55|117 decision local ID→route/edge.on owner_decision|У+В точной матрицы; нельзя выбрать outcome по имени|
|56|138/295 separate commit/message/push/send|У/Д+В effects; gate не terminal|
|57|325/329 recovery/idempotency/next node|У+В всех отдельных signatures; не exactly-once runtime|
|58|31/45/97/299/504 полный16 kinds/version/digest|У+В; ≤1 binding/kind, whitelist names не signatures|
|59|67/146/333–335/590 scenario shell|У+В; continuous indices/terminal error/state-actions cardinality; 013 не утверждён|
|60|62/95/323 Qprocedure/P/history/kit|У/Д Q5, О нерешённых Q, DX с причиной; не signoff override|

Проверка всех шести verdict-категорий: У — только существующая разрешённая форма;
Д — лишь известные literals/данные; С — C17/C22; Ф не доказан ни одной строкой;
В — явные неизвестные signatures/domain/availability/consumer; О — реальный оставшийся
выбор versions/внешних вопросов. У не приписан runtime, В не выдан за missing key.
REQ03/AC02 требуют именно такого поатрибутного смысла, не одних ключей.
Нового противоречия crosswalk с approved original не установлено.

## Самостоятельная сверка 045 / 013 / кода

045: spec прочитана целиком, включая 18 REQ / 14 AC / 9 DNC; plan целиком,
включая длинную команду48 по частям и §8. Plan-review-4:14–16 действительно
требует проверяемый per-anchor/per-DNC протокол, а не ещё один список тем.
Plan:136–139/156–164 ещё нуждается в таком уточнении; §8:192–212 фиксирует
путь каталога, но не устраняет этот блокер. Analysis:41–49 правильно разделяет
будущую правку плана и будущий каталог. DNC08 — история создания/сессий/задач
и имена/состав папок: обе проверки названы, не подменены одним листингом.
Log045:27–29 даёт первичные ОТВ01/02 и read-only решение: комплект рядом с reader,
разовые проверки, не новый validator и не compatibility. Trace045 целиком и
current1–8 не доказывают готовность продукта, и предмет её не заявляет.

013: task1–74, spec1–26/245–598/927–963, log30–42. REQ24 и26–30 требуют
проектирования контракта, 14 предметов/versions/hash и отдельного утверждения
до кода. Уточнение message46–49 датировано 2026-10-09, не новое изменение061.
Собственный before и after-step4 подтверждают отсутствие src и src/runner_core.
Отсутствие реализации не доказывает ни совместимости, ни несовместимости.

Код492c166: journal1–414/539–610, task-folders1–146, tasks1–80/210–259,
core1454–1483, index1525–1584/1865–1877. Прослежены создание папки/задания,
writeLaunch и регистрация progressLine с launcher guard. Progress70–159/310–351
дочитан как callee: parseJournal, keywordOf, finalOf, isOverstated, finishes.
Git progress blob: 37088 bytes, SHA baf360da61c51447b60d07d74f1c4201a9939b47a923c7b82f839e09cf426f41.
Это подтверждает узкие заявления FACT06/analysis35, а не signatures всего runner.
Ни отсутствие общего runtime во всём коде, ни наличие полного runner не выводятся.

external-after-step4.json: точные ранние scope 045(102)/013(8)/method(78), HEAD,
status, raw hashes/bytes и src flags совпали. Чужие команды проверки не запускались.

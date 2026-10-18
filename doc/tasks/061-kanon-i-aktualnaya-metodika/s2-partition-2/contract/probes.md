# Пять собственных разных проб

Это не parser/schema/registry/runtime validator 031 и не приёмка 013/045. Команды лёгкие, синхронные. Чужие пишущие before/after и будущие scripts 045 не запускались. П1–П4 воспроизводятся собственными probes.py/probe-journal.mjs. П5 — именованная ручная сверка исходников. Count не coverage.

## П1 — идентичность и нормативный состав

Команда из корня: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s2-partition-2/contract/probes.py`. Строки SHA дословно в fingerprints.md, в stdout у каждой суффикс `frozen=equal`. Положительный контроль — исходные bytes против program и inputs. Отрицательный — неправильный digest из 64 нулей, без изменения источника. Approved source 031 независимо получен через git show. Группы ограничены разделом :148–263, не всей историей.

Дословный вывод соответствующей части успешного запуска, exit0:

```text
subjects=7/7; corrupted_digest_control=True
approved031=177306 bytes/732 lines/a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829
approved IDs=36/42/5; pair groups=1..18
```

Первый exploratory подсчёт списков по всему spec дал 38, не 18. Это неверная область счёта, не дефект spec. Повтор на разделе пар дал 18 и список 1..18. Все группы прочитаны: subsystems; sessions; parameters; catalog/typed refs; effect; counterEffect; cycle; payload; graph/routes; scenario; filename/comments; markers/questions; recursive schema; N source; facts number; diagnostic mapping; counted/zero-unit; stop kinds.

## П2 — закрытые формы и однофакторные нарушения

Первично 031:17–23/52/69/95/111. Осмотрены profile keys tier/effort/reasoning/budget, same+family, same−budget; meeting session и тот же ref при agent; local status typedRef с owner и без. Это точечная сверка закрытых форм, не общий schema engine.

Дословный stdout probes.py:

```text
profile: four keys=legal; +family=unknown-field; -budget=missing-field
lens session kind: meeting=legal; agent=illegal
local status ref: namespace/id/owner=legal; same ref without owner=illegal
```

Новый impactC30/33/34 не попадает в эти негативы: обычные линзы в prompt/document, family у внешнего selector, не пятый profile key. Conditional declaration и actual matching registry различены.

## П3 — полный domain/nullable/availability, не snapshot

Первично 031:74–89/111/224/576/584. Получатель — required non-null integer 1..10. Положительные source: required/non-null 1..10 и более узкий 2..8. Отрицательные отдельно меняют availability, nullable или нижнюю bound. Выбранное runtime-значение 5 лежит во всех numeric examples, но не делает optional/wide/nullable законными. Дополнительно осмотрены nested array maxItems и object required guarantee.

Дословный stdout:

```text
required-domain-1..10=True
optional-same-domain=False
nullable-same-domain=False
wide-domain-0..10=False
narrow-domain-2..8=True
successful snapshot=5 does not legalize optional/wide/nullable sources
nested controls: array maxItems 2->3=legal,4->3=illegal; object missing guaranteed required key=illegal
```

Это конкретные включения и ручная квалификация source rules, не все branch checks рекурсивного валидатора. Шесть ветвей и остальные constraints сверены в matrix.md, формы T/B; они не объявлены покрытыми пятью числами.

## П4 — изолирующая N-пара, ready colon и реальный pure journal

Первичные источники: approved 031:105/259/309/540 против current R88–94/275–277/716. Ручная пара одинаковых дробей 0/2→1/2: правдивая причина завышенного N даёт completion current; отсутствие причины и ложный artifact не дают по норме. Изменение 0/2→1/1 не изолирует final N/N. Общий ready-контроль проходит; единственная мутация двоеточия противоречит прямым approved REQ/AC.

Дословный stdout conditions probes.py:

```text
isolating-reason=True
isolating-no-reason=False
false-artifact=False
equal=True
greater=True
no-start=False
two-starts=False
ready colon: approved259/309/540=illegal; currentR88=legal whole keyword
0/2->1/2 isolates low-N; 0/2->1/1 does not isolate final N/N
```

Отдельная команда `node doc/tasks/061-kanon-i-aktualnaya-metodika/s2-partition-2/contract/probe-journal.mjs`, Nodev24.15.0. Импорт только raw-equal492c166 pure functions; fixed timestamp — тестовая константа, не текущие часы. Полный успешный stdout, exit0:

```text
equal=true
low-no-reason=false
low-reason-marker=true
final-n-not-start-n=false
greater=true
no-start=false
two-starts=false
colon=true
correction: k=1; startN=2; growth=previous-unit
builder: low-unjustified=refused; low-reason=allowed; agent-launch=refused
limits: marker truth/artifact not checked; no file writer/SDK/runner/031 validator
```

Дополнительные actual assertions: keyword готовоход и Готово не распознаются; correction не меняет k/startN/growth. Панель принимает marker причины, но не проверяет artifact truth. Поэтому нормативный false-artifact контроль не приписан механизму. ProgressLine/logLine/filewriter/SDK не вызывались.

Первая Node-проба ошибочно ожидала отказ done после 1/2 без явно сниженного n. Код законно совмещает done с последней единицей 2/2: actual=true, expected=false. Исправлен только negative fixture: n=1 при startN=2. Отказ теперь проверяет startN, а positive overstated остаётся 1/2. Код, методика и нормативное ожидание ради зелёного результата не менялись. Ошибка раскрыта в qualification.md.

## П5 — блокеры 045, источниковые границы и поставка

Именованная ручная процедура «поадресная сверка 045 и первых переносов». Перечень: spec 045:59–93 (18 REQ), :97–123 (14 AC), :127–143 (9 DNC), :191–203 (owner answers); весь plan:1–188 и review4:1–42; REQ-04/05, AC-03/05/08, В-02/03, trace:125–146, impact C49/52/55/58/59/120 задачи 061; первичные S192/M541/process175–197. Индивидуальные source/target-or-reason/expected/evidence/outcome — в boundaries.md, не скрыты общим счётом 41.

Positive: per-anchor запись с source/input/target-or-reason/expected/evidence/reviewer и PASS-or-NOT VERIFIED с причиной. Negative: только файл semantic-review.md с именем reviewer; plan:136 не задаёт заполненность records. Checklist-блокер 045 остаётся, маршрут 061 верен. Positive В-03 А — запросить authority; negative — объявить API существующим по рекомендации. Текст 061 запрещает negative. Все 16 kinds осмотрены отдельно; отсутствующие signatures остаются UNKNOWN.

Шесть трасс: Canon+current-now→format+append (допустимо); Canon→current-only-at-format (недопустимо); ADR-first+current-now (допустимо); format-first после В-02 с current (допустимо); format до В-02 (недопустимо); approved 031 edit после В-02 (недопустимо). Это ручное следование требованиям 061 и первичным sources, не transfer engine. Negative DNC-08 «только folders, без task/session creation history» отвергнут новой analysis:25. Positive требует оба свидетельства, не count alone.

Собственный before/after дал 759 protected, 31 nested journals и 109 external, unchanged=True. Точные stdout/paths/hashes — fingerprints.md и два JSON. Это сохранность названной области, не выполнение будущих AC 045 или совместимость 013.

Финальная лёгкая сверка перечней и текущего protected scope, exit 0:

```text
matrix_C=60; boundaries_REQ=18; AC=14; DNC=9
protected current=before=after:759; external:109; own text BOM/trailing/absolute-locators=0
```

Проверка собственных BOM, хвостовых пробелов и абсолютных locators не является полным privacy guard или проверкой закрытого списка приватных имён. Такой PASS не заявлен. Перечень новых файлов: report.md, read-map.md, probes.md, fingerprints.md, qualification.md, matrix.md, boundaries.md, code-boundary.md, baseline-before.json, baseline-after.json, baseline.py, probes.py, probe-journal.mjs, read-source.py.

# Собственные пробы С1п-5

Разовые проверки текста и границ, не validator, parser, reader/runtime, совместимость или независимая С2.
Cwd каждой команды — корень авторского дерева. Код — `probes.py`, `run-probe.py`,
`semantic-extra.py`, `map-and-preservation.py`, `change-diff.py`, `privacy.py` в этой папке.
Реальные stdout/stderr/exit сохранены в указанных txt; итоговые .stdout.txt/.stderr.txt —
побайтный вывод дочернего процесса, без перевода кодировки или LF/CRLF.

## П1 — решения и отрицательная подмена пути утверждением

Команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py decisions`.
Вывод — `probe-decisions-final.txt` и парные raw stdout/stderr; exit0, stderr пуст.

Дословные ключевые строки stdout:

```text
P1: full owner quotes match primary records; catalog points=5
P1 path/approval/completeness=True/False/False -> ready=False
P1 path/approval/completeness=True/True/False -> ready=False
P1 path/approval/completeness=True/True/True -> ready=True
P1 mutation path-as-approval: rejected; no source was changed
```

Все три длинные цитаты В-01/01а/02 сравниваются с сохранённым log, пять пунктов — с первичной
передачей. Условная таблица показывает, что выбранный путь без утверждённого/полного содержания
не даёт ready. Контроль текстовой подмены работает в памяти: удаление «не» в явной границе
не проходит то же ожидание. Это адресная регрессия защиты от подмены, не полнота semantic review.

## П2 — весь состав постановки, источников и связей

Команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py coverage`.
Итоговые outputs — `probe-coverage-submit.txt` и raw stdout/stderr; exit0, stderr пуст.
Проверяются все A01…A94, их исходные16 строк message, отдельное свидетельство каждого,
последовательные 6REQ/8AC/4DNC, F16/M19/S13/R18 и C60, все исходные ID1–62 и новые63–66.
`source-destination-map.json` содержит каждую исходную строку/атом/связь/назначение/проверку,
включая «не переносится: constraint исполнения» и A01 как метаданные.

Это сверка состава и адресности; число и наличие ссылки сами по себе не независимый
вердикт о смысловой полноте. Ручная сверка постановки, первичных стыков и полного значимого diff
отдельно отражена в read-map/change-map.

## П3 — closed формы, domain/availability, N-пара и first-transfer

Команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py semantics`.
Outputs — `probe-semantics-final.txt` и raw stdout/stderr; exit0, stderr пуст.
Дополнительная команда `python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/semantic-extra.py`
дала exit0, stdout в `probe-semantics-extra.txt`.

Результаты:

- profile base=True; +family=False; -budget=False по ровно четырём ключам approved031:52.
- lens.sessionId: meeting=True; agent=False; human=False по approved031:69.
- Required integer[1,10]: точный required non-null source допустим=True;
  nullable source допустим=False; optional source=False; слишком широкий [0,10]=False.
  Это условные значения таблицы включения domain, не фактические outputs неизвестного registry.
- Completion при одной start: 1/2 + правдивое «N завышено»=True;
  1/2 без причины=False; 1/2 с ложным артефактом=False; 2/2=True; 3/2=True.
  При 0 или 2 start результат False. У N-пары неизменны обе дроби; 0/2→1/1 не её доказательство.
- Первичные 031:259/309 и R88 дают различие `готово:`; grammar ref не отменяет прямой запрет.
- REQ27/29 сохраняют декларации намерений при внешних runtime values.
- Canon-first/current-now/format-later=True; current-only-at-format=False.
- Условная shape1.0 не выбирает schemaVersion/regulationVersion/minReaderVersion автоматически.

Функции моделируют только выписанные условия. Они не разбирают реальный журнал, не исполняют
JSONC/сценарий и не доказывают совместимость 013. Оригинал — критерий, не эта модель.

## П4 — форма и полный поанкерный регрессионный diff

Команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py regression`.
Outputs — `probe-regression-final.txt` и raw stdout/stderr; exit0, stderr пуст.

Дословно: `P4 routes changed beyond whitespace=C36,C55,C58`.
Все60 маршрутов сопоставлены с frozen3; причины трёх отличий — change-map.
Во всех семи subjects table_cells=0, BOM и trailing whitespace отсутствуют.
Ни один длинный смысл не спрятан в сокращённой ячейке: таблиц в subject вообще нет.

Размеры (байты): spec33427, analysis14830, impact53104, trace43116,
delta34174, inventory16390, owner-decisions9082. Spec/impact/trace/delta выше S30КБ;
это раскрытое предупреждение. Рост из-за абзацев/читаемых меток и решений, не новая цель;
нормативные условия не урезались ради порога. Ворота владельца могут отдельно оценить размер.

`python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/change-diff.py` дал exit0:
94 атома, 66 F/M/S/R и 60 C сопоставлены. Полный diff всех шести документов сохранён,
а не только отличия красивой формы. Табличный parser учитывает pipes внутри code и `|null`.

## П5 — все прежние 15 raw областей и особые pin-контексты

Команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py raw`.
Outputs — `probe-raw-final.txt` и raw stdout/stderr; exit0, stderr пуст.

Сопоставлены семь raw Git источников методики, четыре approved031, spec045,
сохранённый прежний plan045, spec013 и message013 — все15 hashes присутствуют в описи.
Текущий plan045 с append проверен дополнительно, не подменил старый ожидаемый hash.
Все84 первичные byte areas новой карты отдельно зарегистрированы в primary-fingerprints.json.

Raw algorithm old=current=ab:51475 байт, LF SHA
`ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96`;
искусственный CRLF даёт `8a0004dbfd8b6d8f9889abeb8ee02f3bf87ea9af6309ca2a21b8cfdca9eead8d`.
Q5 на9d391ba равна current, oldS66 не имеет уточнения цели, current имеет.
16 changed paths не включают algorithm. Полный ab2→current R diff — только вставка232–233
о профиле второго мнения; не новое журнальное основание 061. Remote latest здесь не измерялся.

## П6 — полная карта delta/маршрутов и неизменность истории

Команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py preservation`.
Outputs — `probe-preservation-final.txt` и raw stdout/stderr; exit0, stderr пуст.

```text
P6 normative records changed beyond whitespace=REQ-05,AC-01,AC-02,AC-06,AC-07,AC-08
P6 normative source-route-destination links=50; D0-D5/DX retained with conditions
P6 full crosswalk source/REQ/AC/destination/check links=60; unresolved signatures retained
P6 original baseline449 remains a prefix of supplement459; protected unchanged=453
P6 exact changed paths=6 allowed subjects; nested immutable journals unchanged=37
P6 no plan061/current061/format; no writes to history, code, Canon or config detected
```

`norm-route-destination-map.json`: каждый M/S/R source anchor → REQ/AC → C и полные
D0–D5/DX → назначение/проверка, плюс все60 маршрутов, включая исходные unchanged нормы031.
Unknown signatures оставлены явно, не получают PASS по наличию формы.

## Scoped privacy, не полный набор стражей

Команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py privacy`.
Промежуточный output `probe-privacy-before-submit.txt`: exit0,54 файла,errors0.
Перед done будет отдельный финальный scoped проход после freeze/отчётов; результат — fingerprints.md.
Применены реальные project judge_line/tree и private-names правила ко всем новым текстам/шести
изменённым subjects. Полный run-all/CI/npm test не запускался и зелёным не называется.

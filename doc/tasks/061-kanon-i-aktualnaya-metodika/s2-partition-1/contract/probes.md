# Собственные пробы С2к

Все команды синхронные. Ни validator031, ни отсутствующие scripts045, ни библиотека013 не запускались. Ниже четыре разные пробы, с положительными и отрицательными контролями; хеширование не засчитывается чтением.

## П1. Идентификаторы и замкнутость labels

Python прочитал корневые spec.md/031-impact.md. Regex `^REQ-(\d+)\.`, аналогично AC/DNC; записи описи после заголовка `## Опись источников` по `^\d+\. `. Labels извлечены из bold в третьей колонке семи строк, декларация — из строки «Вердикты». Дословный stdout счёта:

```text
REQ 6 unique True sequence True
AC 8 unique True sequence True
DNC 4 unique True sequence True
inventory 38
```

Первая case-sensitive проба дала `rows 7 declared 6 all_labels_declared False`: заглавная первая буква в ячейках отличается от декларации. Это не новый semantic label. После явного `casefold()` у обеих сторон:

```text
1 nonempty True unknown []
2 nonempty True unknown []
3 nonempty True unknown []
4 nonempty True unknown []
5 nonempty True unknown []
6 nonempty True unknown []
7 nonempty True unknown []
casefolded declared 6 rows 7
```

Одна предшествующая команда имела лишнюю закрывающую скобку и вернула SyntaxError без исполнения. Счёт и labels теперь подтверждены, **expressibility этим не подтверждена**. Отрицательные предметные контроли в П2/П3, а не искусственное засчитывание регистра за находку.

## П2. Нормативные пары и закрытые пределы

Самостоятельно прочитаны все 732 строки approved031, все 18 групп пар, включая :259/309/540, и current runner:88–94/716. Это не запуск будущего reader.

| Вход | Approved031 | Current | Контроль |
|---|---|---|---|
| `С1 0/1 старт → С1 1/1 готово` | Прямые ready-ограничения допускают | Допускает | Общий положительный |
| Та же трасса, `готово: итог` | Запрещено :259/309/540 | Целое keyword со знаком разрешено :88 | Изолирующий отрицательный для approved |
| `0/2 старт → 1/2 готово` | Нет финального N/N | Не completion: k<startN, причины нет | Общий отрицательный |
| `0/2 старт → 1/2 готово — N завышено: один источник` | Прежняя N/N форма не допускает такой финал | Разрешён по :91; причина сверяется по артефакту | Изолирует отдельное исключение |
| `0/2 старт → 1/1 готово — N завышено: один источник` | Проверка только равенства финальной дроби уже проходит | Исключение причины разрешает | Авторская пара не различает старое N/N и новый startN-инвариант |

В арифметическом контрольном скрипте проверены **только** равенство финальных чисел и новое условие startN/overstated. Не выдаётся за full grammar validator; старый :259 отдельно допускает k>N, поэтому последняя строка stdout ниже не вердикт всего approved:

```text
N PAIRS: isolated arithmetic control only, not validator/runtime
shared startN 2 k 2 finalN 2 old_N/N True current_start_rule True
lowN startN 2 k 1 finalN 2 old_N/N False current_start_rule False
overstated isolated startN 2 k 1 finalN 2 old_N/N False current_start_rule True
author final denominator changed startN 2 k 1 finalN 1 old_N/N True current_start_rule True
extra units startN 2 k 3 finalN 2 old_N/N False current_start_rule True
```

Дополнительный точный осмотр ограничений (три разные single mutations; не исполнение schema):

1. Approved:69 — lens.sessionId разрешается только в sessions kind=meeting. Ссылка на объявленную meeting-сессию законна; замена только kind на agent для того же lens не удовлетворяет ограничению. Обычные линзы проверки должны иметь иной адресный маршрут через prompt/document, а не автоматически через этот каталог.
2. Approved:52 — profileValue ровно tier/effort/reasoning/budget:string|null, значения/nullability по matching registry. Четыре ключа — допустимая форма; добавление `family` — unknown-field по :19/23. Выбор другой семьи должен иметь внешний selector/prompt/process contract, не выдуманное поле.
3. Approved:31/97/504/594 — binding с version/digest без matching registry не даёт semantic success; :45 запрещает signatures внутри predicateCatalog. Полный matching внешний комплект — условие разрешения, сам ID/digest не доказательство наличия. Результат: 3/3 точных ограничений подтверждены первичным чтением; авторский impact:18–19 не перечисляет эти пределы и не даёт per-attribute mapping.

## П3. Реальный узкий код журнала — положительные и отрицательные входы

Из корня своего дерева, Node `--input-type=module -`; импортированы только `buildProgress,sessionState` из journal.ts и `parseJournal,keywordOf` из progress.ts. В памяти prior: `С1 0/2 старт\nС1 1/2 источник проверен\n`. Для сборки дана фиксированная synthetic Date2000-01-01; перед выводом поле времени удалено. `progressLine`/`logLine` не вызывались, файлов не создано. Осмотрено 4 buildProgress-входа, 5 keyword-входов, 2 sessionState-трассы. Дословный stdout:

```text
обычное с пониженным N: REFUSED готово при k=1 меньше N из строки старт (2) завершением не считается (методика: «k сравнивается с N из строки старт, а не с N самой строки»); исправь по делу: работа сделана, а N завышено — progress_line {file: "doc/tasks/NNN-x/progress.log", code: "С1", kind: "done", text: "N завышено: <причина>"}; работа идёт — следующая единица k: 2; остановился — останови сессию строкой стоп с тем же k (1): progress_line {file: "doc/tasks/NNN-x/progress.log", code: "С1", kind: "stop", stop: "ворота", text: "причина"}
завышенное N: OK С1 1/2 готово — N завышено: один источник
неизвестный stop: REFUSED вид остановки «surprise» не из списка: stop — одно из слов вопрос, план, ревизия, требования, ворота (методика: «стоп: <вид> — <причина>»); пример: progress_line {file: "doc/tasks/NNN-x/progress.log", code: "С1", kind: "stop", stop: "вопрос", text: "нужен ответ интегратора о составе описи"}
разрешённый stop: OK С1 1/2 стоп: ворота — контроль
"готово" keyword=готово
"готово: итог" keyword=готово
"Готово" keyword=undefined
"готовность" keyword=undefined
"стоп: ворота — контроль" keyword=стоп
lowN final=undefined low=true startN=2
overstated final=done startN=2
```

Это подтверждение нынешнего журнала на базе492c166, не заявление о validJSONC/registry/013. Нормативный конфликт с approved031 остаётся даже при работающем текущем коде.

## П4. Границы, полнота обязательств и сохранность

Точный перечень самостоятельного осмотра: 26 строк `matrix.md`; все 18REQ/14AC/9DNC spec045; все 188 строк её plan; полный plan-review4 (42 строки); registry scope16kinds; два источника DNC08; 013 consumerREQ28–30/AC23–24, её ownerintent и отсутствие src. Контроли: конкретные commands/expected есть в plan045:131–135, per-record checklist нет в :136/161; наличие taskdirectory само по себе не свидетельствует об отсутствии plugin-заказа, поэтому обе части DNC08 нужны.

Дословные существенные результаты команд listing/hash:

```text
SRC False RUNNER False
SRC GIT TRACKED
subjects+inputs matched 7 boundary files 109 changed 0 []
FROZEN 100 5d70b248900c7e76184bce7bf0ed66df210fd70e23b613f2f4f710cdc467e3f7 same True
HEAD 492c166fbd12e00a6a924efab065f6adb4bd91f6
```

109 границ =101файл045+8файлов013, хешированы до работы и после. Все7pluginисточников побайтно равны raw492c166. Два самостоятельных отрицательных предела: src отсутствует — не «013 совместима»; authoritative registry отсутствует — не «semantic PASS». Действующих format/current061 и нового spec-review2 не создавалось.

Ограничение первого frozen-манифеста100: он исключал **все** basename progress/profile/usage, включая10вложенных исторических файлов; их ранний собственный hash этим digest не доказан. В пункте6 снят отдельный полный digest110 с исключением только трёх корневых изменяемых журналов и своего contract: b7dd5dbf9203407ebf1dd90a2a7365ba438e804960f166fde579fbc4ca6fd8b3. Это не подмена baseline100 и не доказательство ранней фиксации этих10. Они не редактировались; граница доказательства раскрыта отдельно.

Финальный повтор перед completion дал `FINAL subjects/input/boundary changes 0 []`, тот же digest100 и тот же позднийdigest110, `FINAL plugin raw equal 7/7`. По7собственным Markdown-файлам: BOM=False, trailing=0, machine_paths=False (узкийregex `[A-Z]:[/\\]`, не полныйprivacyguard). `git diff --check`: exit0, stdout/stderr пусты; untracked evidence проверены отдельно этим лёгким осмотром. Format/current061/spec-review2:False/False/False. Полные guards и тесты не запускались, ихPASS не заявляется.

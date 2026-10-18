# Пять собственных воспроизводимых проб

Команды из корня подготовленного дерева. `<методика>`, `<дерево045>`, `<дерево013>` — аргументы служебных locators, не пути публичного документа. Скрипты one-off evidence, не общий validator/reader/registry/runtime. Все команды синхронные и лёгкие. Чужие6+5 не входят в собственныйP5.

## П1. Версия, lineage и записанные baselines — линза А

Команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s2-partition-2/summary/check.py identity`, exit0.

Exact stdout идентичности:

```text
program=4164c5396b16ccf8a9536813325951ff9076e462d6acb2ecc6d5e1b36ad20715
spec.md ba00a5ded005655ff40ea6aaa24547589fcd0a379ce9e4adbe91eec4d63065af frozen=equal submitted_changes=[]
analysis.md 3eb3ca892dc83f75bae19518469695820b96bbd90fed83b544b4913b636b3d6d frozen=equal submitted_changes=[]
031-impact.md c51eb183767c05cbf0424a8bb76b48d780d0ef3042c5f0160b6e8079486aa535 frozen=equal submitted_changes=[]
spec-trace.md 9c09f9e299ba983831f67d2e5e34cd93b79daac1a8f3383146e301c3718805f1 frozen=equal submitted_changes=[]
method-delta.md f16e138ac0037980de02e7e853147ac173081bff50fb3652739df5d6d5de5565 frozen=equal submitted_changes=[]
source-inventory.md 18085182e7d6cb9b6a72ad6e25606996faf858c8f83b40d5a58765c3b8449955 frozen=equal submitted_changes=[27, 29]
spec-fixes-4.md acad089e36eb3c9ed8d4a47f26e07f72f42d6f7825100a201ac59d189d68735e frozen=equal submitted_changes=[]
methodology report=ebc8a252a7634fbf47225bae32e6d6a4306299b62d5d956c232de1ab07e613ca
contract report=92f36d21fdd23efd824b850e68dd44ffe2fb43e832404b61b7cd9407d582993a
methodology/protected-before.json recorded_equal=True entries=155
methodology/repo-before.json recorded_equal=True entries=743
contract/baseline-before.json recorded_equal=True entries=759
```

Две строки меняют только digest источников19/21; остальные шесть submitted равны frozen. Число строк одинаковое, correction прочитана. Это цепочка происхождения, не proof semantic closure. Baselines относятся к своим моментам: дополнительная индивидуальная сверка нынешних keys дала только изменённый log061 у всех трёх выборок; nested28/28/31 сохранены. Подмена expected не производилась.

## П2. Все15raw источников и принятые pins — линза А

Команда: `python …/summary/check.py raw <методика> <дерево045> <дерево013>`, exit0. Проверен не общий count, а каждый ID15–27/30/31, перечень с bytes и SHA:

```text
ID15 bytes=1861 sha256=0590d3648413073e0f090df02d0613d87b5423ac4ce6548f6e6dbb14fadd1c2f match=True
ID16 bytes=385080 sha256=b404b8d89b659956884fea74f27ed9e317881d4ff35ecf22019d9b40664c6295 match=True
ID17 bytes=51475 sha256=ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96 match=True
ID18 bytes=58883 sha256=64b221cde012f6e8d05c94fa6a467e4c5ce999bfd8071878caa3e85b8d57214d match=True
ID19 bytes=141522 sha256=178fd0f1055bbdd190a4c8d4a5316566ea7be00829f9883cbfb9fde6a2a16a85 match=True
ID20 bytes=47447 sha256=3fd55d79b4a5dc59e87c914db89327e432b96f027ee8250e60de4f24aa2368a8 match=True
ID21 bytes=28960 sha256=68b3c3a220795a6fdad7b80b6ecab93c47796dffbecfe40c0a308eabf2d53616 match=True
ID22 bytes=177306 sha256=a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829 match=True
ID23 bytes=82011 sha256=8af75b276ea92302bdb41d45a7ca0a34522af0d0e0f5fa129078fa9403166d48 match=True
ID24 bytes=56464 sha256=de0f724a355bf0e920e22994cd8566f900e1ef67fec1efbb5163aa7e3e693943 match=True
ID25 bytes=6800 sha256=f8cb1bae2cdf41996cf45ee3979d18b053f172424948e8e968b04b7611c8587d match=True
ID26 bytes=46637 sha256=685245b64f33424e225e340898399b49084f39b20f66469b58637fe96cc05ed8 match=True
ID27 bytes=58552 sha256=150c9826fc1be49a63cbd8754491c88063c9eca02d145519040d1da51c6711e4 match=True
ID30 bytes=112194 sha256=f86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376 match=True
ID31 bytes=9868 sha256=88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9 match=True
algorithm LF=ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96 CRLF=8a0004dbfd8b6d8f9889abeb8ee02f3bf87ea9af6309ca2a21b8cfdca9eead8d equal_old_current_ab=True
Q5 current=9d391ba
```

Отрицательный byte-area контроль LF→CRLF реально даёт иной hash. Самостоятельное первичное чтение old/currentS66 подтвердило, что уточнение отсутствует вold; отдельный ab2→currentR diff имеет ровно `@@ -231,0 +232,2 @@` (профиль opinion и пустая строка). Q5 прочитана целиком и байтово равна уже принятой. Семь raw plugin blobs492c166 дополнительно равны working files, до pure импорта. Hash не чтение всего файла и не coverage.

## П3. Closed формы, полный domain/availability и constraints — линза А

Команда: `python …/summary/check.py closed`, exit0. Первично03117–23/52/69/74–89/95/97/111. Exact stdout:

```text
profile: base=4; +family=unknown; -budget=missing
lens: meeting=legal; agent=illegal; ordinary agent prompt/document=conditional form
required integer[1,10] <- exact: True
required integer[1,10] <- optional: False
required integer[1,10] <- nullable: False
required integer[1,10] <- wide: False
required integer[1,10] <- narrow: True
local ref: owner required; matching digest alone != registry or API
constraints=8/8; REQ/AC/DNC=6/8/4; these counts are not closure
```

Числовая часть вычисляет включение объявленных доменов1..10/0..10/2..8, отдельные optional/nullable мутации. Profile/lens/ref строки — именованный перечень ручного сопоставления первичных closed правил, не исполненный schema engine. Обе части unknown selector/signature сохранены в нынешних C29–35. Отдельно прочитаны все16абзацев/94атома/62sourceIDs, все60C и все применимые F/M/S/R dispositions в evidence; смысловой join — coverage, не это count assertion.

## П4. Порядок переносов и semantic completion — линза Б

П4а: семь собственных ручных трасс в stitches, М1. Точно осмотрены Canon-first/current-now, однофакторный current-only-at-format, ADR-first, дополнение существующего current, format-first послеВ-02, no-answer/drift и forbidden approved target. Исходы1/3/4/5 допустимы при воротах;2/6/7 не разрешают перенос. Отдельно формат доВ-02 и самовольное утверждение имени/разделов запрещены spec76/86. Это нормативная сверка, не transfer engine.

П4б: `node doc/tasks/061-kanon-i-aktualnaya-metodika/s2-partition-2/summary/probe.mjs`, exit0, только pure progress из raw-equal492c166. Exact stdout:

```text
общий: pure=true; normative=true
двоеточие: pure=true; normative=true
правдивая причина: pure=true; normative=true
та же дробь без причины: pure=false; normative=false
та же строка, ложный артефакт: pure=true; normative=false
снижен только finalN: pure=false; normative=false
выше startN: pure=true; normative=true
нет старта: pure=false; normative=false
два старта: pure=false; normative=false
9 контролей: marker не проверяет артефакт; approved031 отдельно запрещает двоеточие
```

Normative здесь относится к названным currentR88/91/716 completion-условиям, не ко всем правилам журнала. Truth артефакта дана внешним условием ручной трассы; pure функция её не проверяет. Approved031259/309/540 отвергает colon и не покрывает lowN исключение: новые grammar refs прямые REQ/AC не отменяют. Ни parser031, ни runtime013 не запускались. FinalN reduction не completion, 0/2→1/1 не доказывает lowN исключение. Из прежней неизвестности shape не выводится ни готовый version bump, ни сохранение1.0.

## П5. Форма Ф1 — линза А

Команда: `python …/summary/check.py cells`, exit0. Парсер делит только неэкранированный pipe вне inline code. Exact stdout:

```text
method-delta.md: >100=39 max=331
031-impact.md: >100=72 max=236
spec-trace.md: >100=14 max=190
source-inventory.md: >100=8 max=333
total=133
```

Первично весьR96. Максимальные строки и склеенная обычная проза перечитаны семантически; concrete потеря обязанности/границы/доказательства не найдена. Ф1 поверхностная с обоснованием qualification, не дублируется контрактной частью. Сохранённый S-warning не вторая Ф1.

## Контроль сохранности — не шестая предметная проба

`check.py after` и `external-after <дерево045> <дерево013>` пишут только NEW after и отказываются перезаписывать before/after. Полная выборка и итог — fingerprints. Before/after семи subjects, двух reports, program и immutable raw bytes проверены дополнительно повтором identity/raw. Не менялись чужие expected или protected inputs. Это не full privacy guard и не конечная приёмка.

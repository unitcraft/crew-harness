# Шесть собственных проб

Все команды синхронные, лёгкие, без тестовых прогонов продукта и без изменений источников. `audit.py` — разовое evidence этой проверки, не production validator. Команды из корня дерева; `<методика>`, `<045>`, `<013>` — служебные локаторы внешнего клона и папок задач, не публичные пути. Числовые пробы не подменяют смысловую сверку в `delta.md`, `fragment-map.md`, `stitches.md`.

## П1 — идентичность, счёт, цепочка submitted → frozen (линза А)

Команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s2-partition-2/methodology/audit.py identity`, exit 0. Дословные контрольные строки stdout:

```text
spec.md: bytes=34726 sha256=ba00a5ded005655ff40ea6aaa24547589fcd0a379ce9e4adbe91eec4d63065af frozen=True expected=True
analysis.md: bytes=10778 sha256=3eb3ca892dc83f75bae19518469695820b96bbd90fed83b544b4913b636b3d6d frozen=True expected=True
031-impact.md: bytes=39678 sha256=c51eb183767c05cbf0424a8bb76b48d780d0ef3042c5f0160b6e8079486aa535 frozen=True expected=True
spec-trace.md: bytes=28603 sha256=9c09f9e299ba983831f67d2e5e34cd93b79daac1a8f3383146e301c3718805f1 frozen=True expected=True
method-delta.md: bytes=28006 sha256=f16e138ac0037980de02e7e853147ac173081bff50fb3652739df5d6d5de5565 frozen=True expected=True
source-inventory.md: bytes=9152 sha256=18085182e7d6cb9b6a72ad6e25606996faf858c8f83b40d5a58765c3b8449955 frozen=True expected=True
spec-fixes-4.md: bytes=17180 sha256=acad089e36eb3c9ed8d4a47f26e07f72f42d6f7825100a201ac59d189d68735e frozen=True expected=True
REQ=6 sequence=True
AC=8 sequence=True
DNC=4 sequence=True
atoms=94 paragraphs=16 not_requirement=1
sources=62 sequence=True
review2=b26425287cb0add502c3c39dd2c50890b9aef4043998cf3df2ac6a23f32574c6
```

Осмотренный результат цепочки: 7 submitted-файлов, у 6 изменения строк отсутствуют; только source-inventory отличается строками `[27, 29]`, число строк одинаковое. Её submitted SHA `c490f9efce3452e484623479a7a17c37171c5bba4b70683e44caed613fdad347`; нынешний `18085182e7d6cb9b6a72ad6e25606996faf858c8f83b40d5a58765c3b8449955`. Сам `integrator-correction.md` прочитан целиком. Это подтверждает двухстрочное исправление, не все четыре авторских исхода.

## П2 — exact delta и принятые основания (линза А)

Команда: `python …/methodology/audit.py delta <методика>`, exit 0. Дословный итог байтовых и pin-контролей:

```text
changed_paths=16
algorithm_old_current_ab_equal=True bytes=51475 raw=ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96 CRLF=8a0004dbfd8b6d8f9889abeb8ee02f3bf87ea9af6309ca2a21b8cfdca9eead8d
f333efa S66 clarification=False
a449bd2 S66 clarification=True
Q5_9d391ba_current_equal=True
```

Точный перечень 16 путей дан F01–F16 в собственной `delta.md`. Число hunks в том же порядке: `[1,1,7,12,10,3,1,4,1,2,1,2,1,4,15,12]`, всего 77. Все changed строки прочитаны с обеих сторон, кроме 1129 удалённых строк исторического P, где проверены граница/назначение удаления и ссылка на сохранённую историю. В M/S/R соответственно 10/12/15 hunks, авторская карта совпала по адресам. Отдельный ab2→current runner diff показал ровно `@@ -231,0 +232,2 @@` — профиль второго мнения и пустая строка. Q5 проверена побайтно; old/current S66 прочитаны целиком, не выведены только из grep.

Отрицательные контроли реальны: LF→CRLF даёт иной hash при том же смысле; old66 не содержит добавленного уточнения. Таким образом совпадение старого 8a0004 не могло бы доказывать чтение raw Git bytes, а наличие текущего смысла нельзя перенести в old столбец. Нынешний текст эти ошибки не повторяет.

## П3 — все raw hashes описи (линза А)

Команда: `python …/methodology/audit.py hashes <методика> <045> <013>`, exit 0. Проверены ровно 15 исходных байтовых областей: IDs15–21 (7 Git файлов методики), 22–25 (4 Git файла approved 031), 26/27 (045 spec/plan), 30/31 (013 spec/message). **15/15 совпали**; все 16 длинных hex-токенов в описи имеют длину 64 (шестнадцатый — отдельно помеченный исторический CRLF algorithm). Неверного 65-значного raw digest в frozen описи нет.

Дословные строки, особенно относящиеся к исправлению интегратора:

```text
ID19 task-runner.md: bytes=141522 LF=723 CRLF=0 sha256=178fd0f1055bbdd190a4c8d4a5316566ea7be00829f9883cbfb9fde6a2a16a85 inventory_match=True
ID21 doc/open-questions.md: bytes=28960 LF=87 CRLF=0 sha256=68b3c3a220795a6fdad7b80b6ecab93c47796dffbecfe40c0a308eabf2d53616 inventory_match=True
ID22 approved031/spec.md: bytes=177306 sha256=a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829 inventory_match=True
```

Точные остальные hashes — собственный результат сверки `delta.md` и неизменная опись. Git files методики имеют LF, CRLF=0. Внешние рабочие 045/013 проверены именно raw bytes, не объявлены Git blob с этими SHA. Hash всего approved spec не приписывает этой части его полное чтение.

## П4 — исходные атомы и настоящая рекомендация (линза А)

Собственный перечень проверки: все 16 абзацев message; все 94 A-строки; единственный A01 «не требование»; 6 REQ/8 AC/4 DNC; 4 вопроса В-01/01а/02/03. Числа групп A по абзацам: `[1,5,6,6,8,9,8,8,6,6,9,3,4,4,8,3]`; все обязанности и объединение 83→94 разобраны в `fragment-map.md`.

Отрицательный контроль предыдущей карты — `s2-partition-1/methodology/fragment-map.md:17,21`: общей строкой DNC нельзя отдельно подтвердить profile/submit/queue. Нынешние A67/70/89 имеют отдельные source и свидетельство. Перечитаны также A68/69/71/88/90: publicity, exact refusal, self-retry, tasks/agents, models/limits. Ни один не переведён в контекст. В-03 теперь рекомендует именно А с доводом «не создаёт конкурирующий API»; прежняя рекомендация лишь не связывать с 013 не выбирала между путями. Отсутствие источника оставляет блокировку, а не автоматически выбирает Б. Реальный не возникший отказ не изготовлен.

## П5 — порядок поставки и граничные исполнения (линза Б)

Точный перечень: **7 трасс** П1–П7 в `stitches.md`, полностью разобранные по первичным M541/S192 и всем соседним местам семи subjects. Точно есть контроль Canon-first/current-now/format-later, однофакторная мутация current-only-at-format, первый ADR без формата, пополнение существующего current, молчание/drift, запрет archived target и неутверждённое имя/разделы. Результат: переносы со своевременным указателем допустимы; отсутствие указателя при уже перенесённом Canon запрещено независимо от В-02; без решения/при требующем повторных ворот drift переноса нет; archived target и самовольный format запрещены.

Дополнительно пять N-исполнений по первичным R91/716: `1/2`+правдивая причина — да; `1/2` без причины — нет; ложная причина — нет; `2/2` — да; `3/2` — да, везде start `0/2`. Это нормативные условия, не запуск journal parser. Изолирующая новая пара C22 не меняет знаменатель, в отличие от прежнего ошибочного доказательства.

## П6 — предел ячейки и формат текста (линза А)

Команда: `python …/methodology/audit.py cells`, exit0. Разделители внутри inline code и экранированный pipe не делят ячейку. Дословный stdout:

```text
method-delta.md: cells_gt100=39 max_chars=331 line=37 column=3
031-impact.md: cells_gt100=72 max_chars=236 line=75 column=3
spec-trace.md: cells_gt100=14 max_chars=190 line=129 column=3
source-inventory.md: cells_gt100=8 max_chars=333 line=25 column=3
```

Первичный R96 требует таблицы только для ячеек до 100 знаков, длинное — абзацами. Найдено 133 длинные ячейки; первично перечитаны максимальные строки и обычный текст `analysis.md:11,15,21,25–36` с систематически склеенными словами. Это одна поверхностная находка Ф1 о форме, не изменение смысла/полноты/версий. Предупреждения S по 34726/39678 байт не использованы как разрешение урезать содержание.

## Отдельный контроль сохранности

`audit.py after` и `audit.py repo-after`, exit0:

```text
protected before=155 after=155 changes=0
UNCHANGED
repo protected before=743 after=743 changes=0
UNCHANGED
```

В early task baseline включены 13 вложенных progress/profile/usage, а не исключены по basename. Пределы и моменты двух собственных before — `fingerprints.md`. Контроль сохранности не прибавлен седьмой предметной пробой и не утверждает полноту содержания.

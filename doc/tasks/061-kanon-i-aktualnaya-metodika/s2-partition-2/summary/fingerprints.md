# Собственные fingerprints и сохранность

Raw SHA-256 исходных байтов, без нормализации. Hash не чтение и не semantic coverage. Все JSON keys repo-relative, машинные locators в публичные файлы не внесены.

## Момент и область раннего before

Первое действие session_move в подготовленное дерево; затем start С2с/pass3/n6, чтение Canon-entry и program. После этого, **до семи subjects и предметных записей**, снят protected-before.json: 776 существующих файлов дерева рекурсивно. Это не снимок до регистрации или до start; момент назван честно. Before не переснимался.

Исключены внутренности .git и только разрешённые рабочие выходы: NEW `s2-partition-2/summary/`, будущий собственный `spec-review-3.md`, а также три точных корневых пути задачи: progress.log, profile.log, usage.log. Log.md, task/message, program, семь subjects, inputs, submitted/correction, все прежние отчёты/история/скрипты, Canon, AGENTS, plugin/config включены. По basename ничего не исключалось. В expected все 34 вложенных журнала: 13 snapshot и 21 reviewer. Сохранность всей машины/.git не заявляется.

Внешний external-before.json снят позже, после чтения evidence частей, **до собственного первичного чтения 045/013**. Область: 101 файл папки 045, 8 файлов папки 013, tracked/untracked src при наличии, HEAD/status двух деревьев, наличие src и src/runner_core. Прочие несвязанные области внешних деревьев не аттестуются. Исходные modified/untracked чужого дерева сохранены, не присвоены себе.

## Фактическое сравнение

Команды: `python …/summary/check.py after` и `python …/summary/check.py external-after <дерево045> <дерево013>`, exit 0. Созданы собственные новые after, чужие scripts/expected не менялись. Дословно:

```text
protected before=776 after=776 changes=0
[]
external files={'045': 101, '013': 8}
external unchanged=True
```

Добавленных/исчезнувших protected путей нет. Семь subjects, два нынешних reports, program, все inputs и история неизменны. После этого меняются только свои новые отчёт/evidence и разрешённые append-only журналы; повторный лёгкий контроль existing after не требует его перезаписи.

Пары recorded before/after частей проверены отдельно: С2м155/743, С2к759/109 равны. При индивидуальной сверке прежних keys с подготовленной нынешней копией отличие только log061: интегратор дописывал сдачи/регистрации между моментами. Nested28/31 прежних maps совпали. Разница моментов не исправлялась заменой expected. Собственный early776 — отдельный baseline, не ретроисправление старых М4/К2 или чужого early100.

## Предмет и immutable bytes

Точные семь SHA, program SHA и два report SHA — П1 summary/probes.md и общий spec-review-3.md. Identity выполнена в начале и повторена после отчёта: результаты одинаковы. Subject/input/program равны; submitted отличаются только строками27/29 описи, остальные шесть побайтно равны. Сам correction прочитан целиком, а не принят по hash.

П2 raw выполнена при начале первичной сверки швов и повторена в финале: все 15 raw областей имеют те же bytes/SHA и совпадают с описью. Methodology current/old/ab, approved 031 — immutable Git objects, working copy внешней методики не правилась. Raw LF algorithm равен old/current/ab, отрицательный CRLF контроль отличается; Q5 равна `9d391ba`, runner ab diff содержит только строки 232–233. Полный методический текст в repo не копировался.

Семь plugin blobs492c166 равны working files; exact SHA перечислены в неизменном contract/fingerprints.md:44–50 и самостоятельно проверены сводной перед pure-import. Проверка использовала только progress.ts с чистыми функциями; SDK/writer/runtime не вызываются.

045 spec/plan raw SHA совпали с заданием, обе внешние before/after равны. 013 src и src/runner_core отсутствуют в обоих снимках; отсутствие не доказывает совместимость или несовместимость. Latest remote не измерялся и не объявлен текущим фактом.

Сравнения сделаны до submit: плагин может отдельно дописать служебную сдачу в своём хранилище/log после него, это не ручная правка источника агентом. Новых refs/коммитов/Git-интеграции, тяжёлых прогонов, runtime/live операций нет. Полные guards/privacy не запускались и не заявлены PASS.

Финальный дополнительный read-only контроль после создания всех Markdown-файлов: все 776 текущих protected keys равны собственным before/after; внешние JSON равны; семь собственных Markdown без BOM, хвостовых пробелов и машинных locators. Это узкая проверка, не полный privacy guard. Ветка подтверждена как review/061-topic-synthesis-r3. SHA-256 окончательного spec-review-3.md: `2f9b024cf7c0b570781d4a870e5a2de3ca987b589731eede2177b6ebf3c36e75`.

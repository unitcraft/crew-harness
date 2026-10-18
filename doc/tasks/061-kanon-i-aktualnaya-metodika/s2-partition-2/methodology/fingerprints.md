# Собственные fingerprints до и после

Это raw SHA-256 файлов, не доказательство их чтения. Все ключи JSON repo-relative, разделитель `/`. Хешируются исходные bytes, без нормализации BOM/концов строк.

## Честный момент before

Первый `protected-before.json` снят после первого действия session_move, собственного progress start и чтения program/входа Канона/task-message, **до чтения семи subjects и до предметных записей**. Создан только новый snapshot tooling `audit.py`. В нём 155 существующих файлов задачи рекурсивно: семь subjects, семь inputs, вся история/вложенные журналы, task/message, log, программа, исходная submitted-сдача и correction интегратора.

Исключены только собственная NEW папка `s2-partition-2/methodology/` и три точных корневых пути этой задачи: progress.log/profile.log/usage.log. Исключения по basename нет: все 13 вложенных журналов входят в early expected. Список первичного запуска `before` больше не переснимался и не заменялся.

Отдельный `repo-before.json` снят позже, после чтения subjects/отчётов/Canon process и создания tooling, но до первой предметной записи/счётной пробы identity. Он расширяет, а не подменяет early task155:743 существующих tracked/untracked non-ignored файлов из `git ls-files --cached --others --exclude-standard`, включая Canon/AGENTS/plugin/config/прочие материалы. Исключения те же. Не заявляется, что это состояние до первого чтения вообще, или полная аттестация .git/ignored файлов/машины.

## Сравнение

На завершении предметной работы выполнены неизменяющие sources режимы `after` и `repo-after`. Результат: task155→155, changed0; repo743→743, changed0. Исчезнувших/добавленных protected путей 0. В `protected-after.json`/`repo-after.json` та же выборка. До/после содержит все 13 nested snapshot-журналов, включая три новых submitted журнала автора; прежние 10 не потеряны.

Это сравнение до финального submit: плагин вправе отдельно дописать служебную запись сдачи в log после него. Агент log не редактировал. Первоначальный git status уже содержит modified log и множество untracked материалов подготовленного дерева; нулевой git diff не выдается за baseline. Своё дерево — `review/061-topic-methodology-r3`, исходная база 492c166. Чужие/untracked файлы не переименованы, не исправлены, не удалены.

## Все семь subjects = frozen inputs

- spec.md,34726 байт: `ba00a5ded005655ff40ea6aaa24547589fcd0a379ce9e4adbe91eec4d63065af`.
- analysis.md,10778 байт: `3eb3ca892dc83f75bae19518469695820b96bbd90fed83b544b4913b636b3d6d`.
- 031-impact.md,39678 байт: `c51eb183767c05cbf0424a8bb76b48d780d0ef3042c5f0160b6e8079486aa535`.
- spec-trace.md,28603 байт: `9c09f9e299ba983831f67d2e5e34cd93b79daac1a8f3383146e301c3718805f1`.
- method-delta.md,28006 байт: `f16e138ac0037980de02e7e853147ac173081bff50fb3652739df5d6d5de5565`.
- source-inventory.md,9152 байт: `18085182e7d6cb9b6a72ad6e25606996faf858c8f83b40d5a58765c3b8449955`.
- spec-fixes-4.md,17180 байт: `acad089e36eb3c9ed8d4a47f26e07f72f42d6f7825100a201ac59d189d68735e`.

Полный spec-review2 raw SHA `b26425287cb0add502c3c39dd2c50890b9aef4043998cf3df2ac6a23f32574c6` совпал. Submitted source-inventory `c490f9efce3452e484623479a7a17c37171c5bba4b70683e44caed613fdad347` отличается только строками 27/29. Шесть остальных submitted subjects побайтно равны нынешним; сравнение/точные результаты — П1. Старая авторская baseline относится к его моменту сдачи, поздние файлы интегратора не выдаются за прежний expected.

Все hashes описи проверены самостоятельной П3 по указанным immutable Git-объектам либо raw рабочим файлам внешних задач. Полные внешние baseline 045/013 этой частью не создавались; там выполнялись только read-only hash/чтение названных anchors. Полную их сохранность и контракты проверяет С2к. По immutable Git чтение рабочую копию внешнего клона не меняет. Пишущие before/after чужих checks не запускались.

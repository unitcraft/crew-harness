# Собственная сохранность до/после

База дерева `492c166fbd12e00a6a924efab065f6adb4bd91f6`, ветка review/061-topic-contract-r3. Первый baseline снят после session_move/start, program/task/Canon-entry чтения и создания собственного baseline.py, **до предметного чтения/сверки**. Он не объявлен снимком до регистраций интегратора или до собственной стартовой строки.

Результаты baseline-before.json/baseline-after.json содержат полные точные относительные paths/SHA и внешние HEAD/status. Оба снимка собственные, чужие baselines не запускались/не подменялись.

Выборка: все 759 файлов `git ls-files -c -o --exclude-standard`, включая subjects/inputs/program/history/log/task/Canon/AGENTS/plugin/config. Исключение только префикса NEWcontract и точных `doc/tasks/061-kanon-i-aktualnaya-metodika/{progress.log,profile.log,usage.log}`. Фильтра по basename нет. Все 13 snapshot progress/profile/usage включены; с reviewer-журналами их 31. Ignored files и внутренности .git не входят; сохранность всех файлов машины не заявляется.

Внешняя область: вся папка 045 (101 файл), вся папка 013 (8 файлов), любые tracked/untracked src paths, HEAD/status обоих деревьев и наличие src/runner_core. Все 109 файлов и метаданные до/после совпали. Отдельный осмотр подтвердил отсутствие src вообще. Прочие несвязанные файлы внешних деревьев не аттестуются. Исходные modified/untracked в 013 — прежняя работа, не наша.

Дословный итог final comparison:

```text
head=492c166fbd12e00a6a924efab065f6adb4bd91f6
protected_local=759
nested_journals=31
external={'045': 101, '013': 8}
unchanged=True
```

Команда воспроизведения: `python <contract>/baseline.py after <дерево045> <дерево013>` пишет только новый after рядом со скриптом и отказывается перезаписывать существующий. Повторный пишущий запуск не нужен: для проверки достаточно сравнить два JSON. До первой версии before внешние locators были аргументами кода script; в NEWscript заменены на CLI параметры до сдачи, публичные machine paths в evidence отсутствуют. Ни один protected source при этом не менялся.

## Семь subjects — raw SHA, frozen=equal

```text
spec.md ba00a5ded005655ff40ea6aaa24547589fcd0a379ce9e4adbe91eec4d63065af
analysis.md 3eb3ca892dc83f75bae19518469695820b96bbd90fed83b544b4913b636b3d6d
031-impact.md c51eb183767c05cbf0424a8bb76b48d780d0ef3042c5f0160b6e8079486aa535
spec-trace.md 9c09f9e299ba983831f67d2e5e34cd93b79daac1a8f3383146e301c3718805f1
method-delta.md f16e138ac0037980de02e7e853147ac173081bff50fb3652739df5d6d5de5565
source-inventory.md 18085182e7d6cb9b6a72ad6e25606996faf858c8f83b40d5a58765c3b8449955
spec-fixes-4.md acad089e36eb3c9ed8d4a47f26e07f72f42d6f7825100a201ac59d189d68735e
```

Review2 SHA b26425287cb0add502c3c39dd2c50890b9aef4043998cf3df2ac6a23f32574c6; methodology report ebc8a252a7634fbf47225bae32e6d6a4306299b62d5d956c232de1ab07e613ca. Совпали с заданием. Approved Git spec 031: 177306 байт, 732 строки, SHA a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829.

045 spec685245b64f33424e225e340898399b49084f39b20f66469b58637fe96cc05ed8; plan150c9826fc1be49a63cbd8754491c88063c9eca02d145519040d1da51c6711e4; review4ea0d84e953159a18d27b18eb5d8097806478960fe6327749a72afa928c05e6a9.013 exact hashes/HEAD/status — в двух JSON, источники отдельно не скопированы. Git objects031/методики immutable inputs; их working copies не правились.

## Raw plugin blobs и рабочее дерево

Все семь равны побайтно; hashes ниже не свидетельство чтения вне read-map ranges.

```text
journal.ts 211eb4324489886444287bb5a266adacfffd55185d4e9f64923a563967006e93
progress.ts baf360da61c51447b60d07d74f1c4201a9939b47a923c7b82f839e09cf426f41
task-folders.ts 6e13014ad6fe52a61d27b2ec3110df0d9f3f531365fbd3856cdd869fa31dadd7
tasks.ts c5eade92e01b73a37b0e78b83c8228fd1e5f548aa1fb06360f7049fcab919896
core.ts 75543b85249bd6d135b917c2bb3347c0140f33ea222afc4ad90d023f03b29384
index.ts e37562e25903e72067fd39fe463ea6d864dd8dd043f1d690e11b5532e0b6f5f1
README.md d16abd39650d4b5158b37a4a0d3a3dcaf5c31185b6ac714eef51887d700c13f9
```

Старые К2/М4 относятся к прежним деревьям и моментам; нынешний ранний baseline на 759 файлов не исправляет их задним числом. After снят до сдачи и учёта. Последующее собственное append-only progress/profile/usage разрешено; protected файлы после него не трогаются.

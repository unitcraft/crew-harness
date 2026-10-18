# Сохранность собственного запуска36

Whole before: 1552 existing files. Whole after вне точногоE: 1552. Защищённых изменённых вне разрешённых append/dynamic: 0. Новых внеE: 0. git diff HEAD по Canon/code/scripts/AGENTS/config: exit0, пусто. HEAD/ветка прежние. Approved-plan tail после первой строки равен root.

## Префиксы

- `doc/tasks/061-kanon-i-aktualnaya-metodika/log.md`: 171397 → 171397 bytes, исходный prefix SHA совпал.
- `doc/tasks/061-kanon-i-aktualnaya-metodika/profile.log`: 2383 → 2383 bytes, исходный prefix SHA совпал.
- `doc/tasks/061-kanon-i-aktualnaya-metodika/progress.log`: 10890 → 11538 bytes, исходный prefix SHA совпал.
- `doc/tasks/061-kanon-i-aktualnaya-metodika/result.md`: 3544 → 8290 bytes, исходный prefix SHA совпал.
- `doc/tasks/061-kanon-i-aktualnaya-metodika/usage.log`: 2529 → 2529 bytes, исходный prefix SHA совпал.

## Generated config

`.opencode/opencode.json`: before {'bytes': 735, 'sha256': '458360ca829da24bb5473e779d56bc6891f180a21bd159bba29c3b6675b88c31'}; after {'bytes': 735, 'sha256': '458360ca829da24bb5473e779d56bc6891f180a21bd159bba29c3b6675b88c31'}. Агент его не менял; его динамика при plugin submit не означает разрешение менять другие config. Gitdir за .git pointer не обследован.

## Собственная отрицательная находка

__pycache__/safe_io.cpython-314.pyc: 2769 bytes; SHA-256 `ad873e769b4e6309c2501030b523bfe41b9e04c51863e71d5d7fe3c5b08b9b6e`. НЕ разрешённый output, FAIL исходного nameset, не исправлен расширением expected; сохранён без удаления, не копируется в submitted. Публикация cache не разрешена.

Все старые E/notes/snapshots/expected/assignment/вложенные журналы и прежний result-prefix входили в1552 и сохранены. Внешние семь не открывались на запись; собственного внешнего before нет, глобального побайтногоPASS не заявляем.

`full-diff.patch` — полный delta защищённого предмета и append-префиксов от собственного before. Новые E фиксируются отдельно каждым файлом вsubmitted/manifest.json с frozen bytes; отсутствие их текста вgitdiffневыдаётся заотсутствиефайлов. Финальныеprogress/profile/usage/submitдобавятся послеafter, это разрешённыеappendпри неизменномстаромпрефиксе.

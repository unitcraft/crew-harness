# Собственная сохранность запуска38

Before: 1686 existing files; after на момент измерения: 1742. .git учтён только bytes/SHA; gitdatabase не обследована. Pycache36 metadata не изменена, payload не читался.

Изменённые защищённые existing: 1; пропавшие existing: 0; новые вне разрешённых E38/report: 1. Три точных исходных append-prefix: True. Rootlog до submit не изменён, будущую запись сдачи делает плагин. Generated config: [] — отдельное наблюдение, не исключение остальных config.

59 frozen36 и11 frozen37 сверены отдельно с поздними копиями; все совпали (inputs/frozen-comparison.json). Ошибочный base/prefix manifest37 не исправлялся; его bytes сохранены. Семь outputs34 внешнего клона не трогались и whole-tree аттестации того клона нет.

Снимок after перечисляет всё дерево до записи себя/fingerprints/manifest, эти три заранее названы pending; hash самого manifest не включает самого себя. После него разрешены только append3 и plugin submit-log, без предметных правок. Это явный предел измерения, не ложная финальная аттестация будущих записей.

Первичный semantic PASS отсутствует; bytes/hash/nameset не доказывают полноту квалификации. На финальном observation upstream сдвинулся c550→b293, ранний пакет сохранён и перенос остановлен.

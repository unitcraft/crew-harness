# Итоговая сохранность

Собственный ранний corpus: 988 файлов, изменён только `plan.md`; остальные 987 совпали SHA/bytes, отсутствующих нет.
Все новые файлы — собственные разрешённые plan-fixes-1.md/plan-fixes-1/**. Три точных корневых журнала исключены как mutable append-only; их строки писались только инструментами (profile — дописка), старые не редактировались.

Старый plan: {"sha256": "2b8bd91ae59453104b2c09f02b218261628a86848291ea2b88845e81e0157f9b", "bytes": 39374}

Новый plan: {"sha256": "c34e3a5f55a3364bc2a70bca5de41c8090e3e1a48d63e4e9ce21f4cb56f952be", "bytes": 62906}

Approved spec SHA: 359819ee6b75d789b94853ac7054742c1c675597e6aee3d05f36ad43abd11c0b. Метаданные 1/127 не исправлялись, нормативное тело не менялось.

Approved031: 15 Git-файлов совпали с собственным ранним снимком.
Внешние scoped снимки совпали по SHA/bytes, набору путей и HEAD: methodology — 78, 045 — 615, 013 — 355.

Отдельные отличия status (если есть): {"045": {"before": "## task/22-reestry-kontraktov-i-polnyy-jsonc-reglam...origin/main [behind 111]\n?? doc/tasks/045-runner-registry-jsonc/\n", "after": "## task/22-reestry-kontraktov-i-polnyy-jsonc-reglam...origin/main [behind 124]\n?? doc/tasks/045-runner-registry-jsonc/\n", "qualification": "Отличается только счёт behind при неизменных HEAD/файлах; внешние tracking refs не менялись этой сессией. Это наблюдение, не полное совпадение status."}}. Это не совпадение status; ранний снимок не заменён.

Область: рабочие деревья без внутренностей .git-каталогов/node_modules; .git-файлы включены только hash/bytes. Payload .git не сохранялся. Это не аудит Gitdatabase. Собственный Канон/code/config/история и вложенные journals входят в 988-файловый corpus.

Preservation expected выведен из исходного baseline, не after; plan в нём остаётся mutable input с исходным SHA. Старые before/expected/reviews не исключались.

Полный diff повторно равен old→new. Четыре собственные пробы совпадают с заранее закреплёнными expected; независимый PASS не заявлен. Remote latest не измерялся, fetch/commit/refs/merge/push/live/heavy не выполнялись.

> Публикационная копия: изменены только ссылки, кодировка или служебная разметка.
> Точные исходные байты и SHA — в [описании происхождения](../publication/provenance.json) и архиве оригиналов.

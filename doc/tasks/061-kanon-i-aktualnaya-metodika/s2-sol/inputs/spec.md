Статус: черновик
Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть

# Спецификация задачи 061 — актуализация Канона и оценка формата 031

## FACT / INFERENCE / UNKNOWN

FACT-01. Владелец поручил перевести Канон на последнюю версию методики и отдельно просмотреть результат задачи 031, возможно изменив его. Источник: task/message.md, слова владельца от 2026-10-16.

FACT-02. Зафиксированные точки сравнения: методика `a449bd2e218e04384d1d42e0c1bffe892495e298`, прежний pin `f333efa319e445efe029ee6963b477ca8fe3bc1c`, утверждённый результат 031 `4b48c50eef1fb46af4f074a80511979b16e515e3`.

FACT-03. В Canon `doc/canon/README.md` методика указана как внешняя основа без копии, а `doc/canon/process.md` задаёт проектные отличия. Параметры версии и текущих задач требуют отдельного решения.

FACT-04. По первичному чтению plan-review-4 045 имеет существенную находку о проверяемом протоколе ручной semantic review/DNC; V-05 о полном источнике registry/signatures остаётся открытым.

FACT-05. В текущих материалах 013 есть уточнение владельца от 2026-10-09 о минимальном контракте внутри 013 и отдельном утверждении до реализации; это содержимое task/message.md, не доказательство свежего изменения относительно известной истории 045 и не consumer API. Спецификация остаётся черновиком, код `src/runner_core` отсутствует.

FACT-06. Код `opencode-plugin/journal.ts` реализует конкретные операции записи прогресса append-only, сверку строк и ограничения сессии; это не доказывает наличие всего stateful runner и внешних registry signatures.

INFERENCE-01. Простая подмена ссылки на `main` недостаточна: нужны delta map норм, проектных отклонений, реально реализованных операций и закрытого контракта 031; активные задачи требуют явного перехода.

UNKNOWN-01. Независимая С2 ещё должна подтвердить финальный вывод об expressibility 031. В проверенных темах crosswalk конкретный required field gap не найден; открыты external registry/signatures, они не доказывают schema gap.

UNKNOWN-02. Какую редакцию и процедуру владелец выберет для перехода уже начатых задач на новую методику.

UNKNOWN-03. Авторитетный полный реестр и signatures для 045 и наличие отдельного реализованного runtime-контракта остаются неподтверждёнными. В 013 контракт предусмотрен черновым заданием, но его утверждение и реализация ещё не подтверждены.

## REQ

REQ-01. Сверить действующий Canon с актуальным pin `a449bd2e218e04384d1d42e0c1bffe892495e298` и сравнительным pin `f333efa319e445efe029ee6963b477ca8fe3bc1c`; каждый применимый изменённый нормативный anchor классифицировать как общую норму, проектный override/addition, provenance/status или open question. Файловые изменения не считать изменёнными нормами без семантического сравнения.

REQ-02. Для каждой затронутой нормы указать old/current anchors, Canon rule или explicit отсутствие, наблюдаемое подтверждение кода (файл/функция/callsite) либо отсутствие; классифицировать обещанное task-runner behavior отдельно от runtime. Не выводить отсутствие нормы лишь по grep.

REQ-03. Полный полевой crosswalk approved 031 1.0 должен содержать для каждого релевантного требования точный method anchor, точные 031 field/type/closed enum/nullable/restrictions либо обоснованный gap, один verdict (`уже выражается`, `нужны только данные`, `нужен формат`, `внешний контракт`, `открытый вопрос`), аргумент и consequence для 045. Обязательные темы: launch/state.launches, correction/stop/retry/process lifetime, fresh reviewer/lenses/second opinion, refs/versions/signatures, docs/progress/current.md, gate decisions/outcomes.

REQ-04. Сопоставить изменения с блокерами 045: (a) per-anchor/per-DNC checklist/test — конкретная правка чернового плана, не Canon; (b) registry/signatures — точные отсутствующие контракты, сведения выводимые из нормы и требующие внешнего выбора. Сверить 013 read-only; решение 2026-10-09 считать известной историей, не свежим изменением без pre/post evidence. Draft intent не является consumer API.

REQ-05. Определить проверяемые scope, acceptance и DNC полной задачи обновления Канона, действующее место результата и отдельную процедуру возможной новой approved revision 031. Не переписывать approved 031 и не переводить активные задачи на новый pin автоматически.

## AC

AC-01. Для каждого semantically changed normative anchor old/current pin имеют точный path/section/line, disposition, related Canon rule, code evidence/callsite or explicit absence, consequence; provenance registry and open questions separated. Файловая правка без нового требования не получает фиктивную строку нормы.

AC-02. Crosswalk перечисляет точные поля, типы, enums, cardinality/nullability/restrictions из approved 031 для всех тем REQ-03, либо минимальный пример обязательного значения, которое невозможно выразить. Каждая строка имеет один из пяти verdicts, обоснование и следствие для 045; примеры ID не названы существующими операциями.

AC-03. 045 блокер (a) дан как per-anchor/per-DNC update plan checklist с входами, полями результата и PASS/NOT VERIFIED rule; блокер (b) lists missing registry/signature categories, separates normative extractable values from external choices, and does not present a link to method as resolving В-05.

AC-04. 013 facts include current draft status, exact current hashes and read-only before/after status; 2026-10-09 owner decision is not called newly changed, code absence is not compatibility, and `task-runner.md` prose is not runtime proof.

AC-05. Result destination is self-contained: normative changes land in `doc/canon/` (and `AGENTS.md` only if evidenced); this task's future `current.md` points there and inventories historical copies. Approved 031 remains unchanged; a possible new edition is separately owner-gated. A task folder is not the sole normative destination.

## DNC

DNC-01. Не править действующий Canon, AGENTS.md, плагин, конфигурацию, approved 031, рабочие материалы 045, материалы 013 или внешний методический репозиторий до соответствующих ворот и явного разрешения.

DNC-02. Не объявлять совместимость/новую schemaVersion, runtime 013, полный registry/signatures или PASS без источника и проверки.

DNC-03. Не переписывать pins, журналы, серии, статусы и историю уже начатых задач; не создавать автоматический массовый переход.

DNC-04. Не выполнять commit, push, merge, cleanup, live update, restart, реализацию или тяжёлые проверки в этой сессии.

## Вопросы владельцу (на воротах)

В-01. Как фиксировать новую версию методики и разрешать переход уже начатых задач? Рекомендация: неизменяемый pin на старте, переход только отдельным явным решением по конкретным активным задачам с сохранением исходного журнала; так сохраняется воспроизводимость и не переписывается история.

В-02. Если crosswalk докажет недостаточность 031, разрешать ли отдельную новую редакцию формата? Рекомендация: сначала завершить crosswalk и спецификацию изменений, затем отдельное утверждение владельца; не менять approved 1.0 молча.

В-03. Откуда должен происходить авторитетный каталог registry/signatures и кто владеет этим внешним контрактом? Рекомендация: не связывать его с 013 до подтверждения владельцем того проекта/контракта.

## Результат и куда он попадает

Результат полной задачи — обновлённые нормативные файлы Канона в `doc/canon/` (и затронутые правила `AGENTS.md` только если анализ докажет их необходимость), а также `current.md` в папке задачи, указывающий одно действующее место и перечисляющий исторические копии. Сама папка задачи остаётся историей и не источником нормы. Approved 031 не переписывается: если crosswalk докажет форматный пробел, отдельная новая редакция 031 создаётся только по отдельному решению и проходит утверждение; иначе её текущий approved результат сохраняется без изменений. С1 не создаёт ни `current.md`, ни нормативную редакцию: `analysis.md`, `spec.md` и `031-impact.md` — черновые исследовательские артефакты.

## Опись источников

Единица — один источник. Источники перечислены в порядке задания С1; partial означает именно ограниченный range, не чтение целиком.

1. `task/message.md` — целиком.
2. Этот `spec.md` — до правки целиком.
3. `analysis.md` — до правки целиком.
4. `AGENTS.md` — целиком.
5. `doc/canon/README.md` — целиком.
6. `doc/canon/process.md` — строки 1–248, целиком.
7. `doc/canon/decisions/README.md` — целиком.
8. ADR-0001 — целиком.
9. ADR-0006 — целиком.
10. ADR-0007 — целиком.
11. ADR-0008 — целиком.
12. ADR-0009 — целиком.
13. ADR-0010 — целиком.
14. `crew_config view` — без изменения; просмотрены effective values и их источники.
15. Методический `README.md` на pin `a449bd2e218e04384d1d42e0c1bffe892495e298` — целиком.
16. Методический `methodology.md` на том же pin — весь текст 1–1733 прочитан диапазонами; применимые §§3–5, 9–14, 18–20 дополнительно сопоставлены через diff. SHA-256 `B404B8D89B659956884FEA74F27ED9E317881D4FF35ECF22019D9B40664C6295`.
17. Методический `task-algorithm.md` — целиком, строки 1–370; SHA-256 `8A0004DBFD8B6D8F9889ABEB8EE02F3BF87EA9AF6309CA2A21B8CFDCA9EEAD8D`.
18. Методический `task-sessions.md` — целиком, строки 1–416; SHA-256 `64B221CDE012F6E8D05C94FA6A467E4C5CE999BFD8071878CAA3E85B8D57214D`.
19. Методический `task-runner.md` — целиком, строки 1–648; SHA-256 `178FD0F1055BBDD190A4C8D4A5316566EA7BE00829F9883CBFB9FDE6A2A16A85`.
20. Методический `completeness-check.md` — строки 1–52 (файл 52 строки), целиком; SHA-256 `3FD55D79B4A5DC59E87C914DB89327E432B96F027EE8250E60DE4F24AA2368A8`.
21. Методический `doc/open-questions.md` — строки 1–87, целиком; SHA-256 `68B3C3A220795A6FDAD7B80B6ECAB93C47796DFFBECFE40C0A308EABF2D53616`.
22. Approved 031 `spec.md`, commit `4b48c50eef1fb46af4f074a80511979b16e515e3` — partial: root, contract-field table excerpts, REQ-11…35, versions/UNKNOWN and exact field excerpts; не все строки. Raw SHA-256 `a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829`.
23. Approved 031 `spec-trace.md`, тот же commit — partial: excerpts о progress/UNKNOWN/owner decisions. Raw SHA-256 `8af75b276ea92302bdb41d45a7ca0a34522af0d0e0f5fa129078fa9403166d48`.
24. Approved 031 `log.md`, тот же commit — partial: entries 235–292 on owner decisions and approval. Raw SHA-256 `de0f724a355bf0e920e22994cd8566f900e1ef67fec1efbb5163aa7e3e693943`.
25. Approved 031 `task/message.md`, тот же commit — целиком.
26. 045 `spec.md` — целиком; SHA-256 `685245b64f33424e225e340898399b49084f39b20f66469b58637fe96cc05ed8`.
27. 045 `plan.md` — строки 1–188, целиком; SHA-256 `150c9826fc1be49a63cbd8754491c88063c9eca02d145519040d1da51c6711e4`.
28. 045 `plan-review-4.md` — строки 1–42, целиком.
29. 045 `log.md` — строки 1–59, целиком.
30. 013 `spec.md` — partial: строки 1–496, до REQ-30; статус `черновик`, SHA-256 `F86A69F3CD2C76CF5A4AA1A35AC720DCD5B8C28C560C6B5150EC9526E93EB376`.
31. 013 `task/message.md` — строки 1–74, целиком; SHA-256 `88D6A8F9CDAC4CD73BA5D0E49E1C8ED1D3F1FBD772741410E8437BD8E2E8F4A9`.
32. 013 `log.md` — строки 1–42 показаны; текущий status включает существующие изменения, файл не менялся этой сессией.
33. `opencode-plugin/journal.ts` — ключевые функции `buildProgress`, `progressLine`, `logLine`, `isLauncherCard`, строки 50–407; остальное не runtime runner.
34. `opencode-plugin/task-folders.ts` — строки 1–146, целиком; `nextLaunch`, `writeLaunch`, `taskLog`.
35. `opencode-plugin/tasks.ts` — частично: строки 1–400; типы `Task`, `TaskSession`, launch/status, `saveTask`; остаток файла не исследован.
36. `opencode-plugin/core.ts` — частично: строки 1–728; настройки и связанная с task state/persistence часть, остаток не исследован.
37. `opencode-plugin/index.ts` — частично: строки 1–678, launch callsite 1547–1559, registration 1865–1875; служебные callsites и пределы подтверждения, остаток не исследован.
38. `opencode-plugin/README.md` — частично: строки 1–522; machine journal contract и boundary, остаток не исследован.

Locator digests: methodology raw SHA-256: README `0590D3648413073E0F090DF02D0613D87B5423AC4CE6548F6E6DBB14FADD1C2F`; 031 task/message `f8cb1bae2cdf41996cf45ee3979d18b053f172424948e8e968b04b7611c8587d`; 045 spec/plan SHA above совпали с заданием; 013 spec/message SHA выше совпали. `git status --short` 013 показывает прежние modified/untracked task files; `src/` и `src/runner_core` отсутствуют. Сравнение статусов до/после в рамках этого чтения не обнаружило своих изменений.

Ограничение: список содержит 38 источников; где указан partial, вывод ограничен прочитанным диапазоном. Независимая С2 должна проверить полноту источников, delta map и crosswalk. `итого: 38` — количество источников, не заявление, что каждый файл прочитан целиком.

итого: 38

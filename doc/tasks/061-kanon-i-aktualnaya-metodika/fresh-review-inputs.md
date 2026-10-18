# Корпус свежей полной проверки 061

Это карта входов автора, не доказательство полноты. Применимость самостоятельно определяется
проверяющим по постановке, Канону и первичным внешним нормам. Указанный ниже контекст — минимум,
не граница, запрещающая дочитать связанные места.

## Предмет: читать целиком

- `spec.md` — требования, критерии, запреты, выбранные направления и остающиеся ворота.
- `analysis.md` — анализ норм, формата и границ 045/013.
- `031-impact.md` — все маршруты C01–C60 вместе с полными общими пределами A/B/T/D/P/G/V.
- `spec-trace.md` — все атомы A01–A94, локаторы и назначения результатов.
- `method-delta.md` — все F/M/S/R anchors и D0–D5/DX, не только изменённые заголовки.
- `source-inventory.md` — полная опись с происхождением и глубиной; архивная библиография
  сохранена для учёта, не предписывает чтение старых отчётов.
- `owner-gate-decisions.md` — полная аналитическая часть предмета: дословные решения,
  происхождение и границы пересланных сведений.

Иных аналитических приложений с действующим смыслом нет. Побайтная копия предмета после
окончания авторских правок находится в `s1p-5/submitted/`; полный список SHA ниже.
Корневые документы и frozen копии должны совпадать. Статус спецификации — черновик.

## Постановка, решения и Канон

Исходная постановка — `task/message.md` 061, целиком. Её исходные утверждения о состоянии
путей и выбранности решений читаются с последующими решениями, не переписываются в оригинале.
Дословные решения с датами/источниками — `owner-gate-decisions.md`, целиком. Первичные
сохранённые передачи о каталоге: `catalog-owner-decision-2026-10-16.md` и
`methodology-catalog-response-2026-10-16.md`; ответ Методики — пересланный, не повторный
собственный аудит. Его более ранние ожидания о будущем выборе пути уточнены поздним решением.
`doc/open-questions.md` #4 — учёт закрытия, не новый нормативный источник.

Канон читать от `doc/canon/README.md`, далее применимые ссылки:
`doc/canon/process.md`, `AGENTS.md`, `doc/canon/decisions/README.md` и ADR.
Для сопоставления основы, границ продукта, подписки/ручного цикла, публичности, результатов,
профилей, слияния и полномочий нужны ADR-0001…0010 по применимости; не только реестр названий.
Документация частей — корневой README и `opencode-plugin/README.md` в базе кода ниже.
Конфигурация `.opencode/crew-harness.json` — только наблюдаемый read-only проектный input,
не норма вместо Канона и не разрешение менять модели/лимиты.

## Внешняя методика: первичные Git-объекты

Репозиторий: https://github.com/unitcraft/ai-dev-methodology.

- Old: `f333efa319e445efe029ee6963b477ca8fe3bc1c`.
- Current сравнения: `a449bd2e218e04384d1d42e0c1bffe892495e298`.
- Принятое журнальное основание: `ab2a4efda1d5b16a76f43ac1cd4aa245d5aed9b0`.
- Принятая процедура вопросов: `9d391bad999674c27a52dc5d1e9dae9a61d8c033`.

Не считать current сравнения актуальным remote без отдельной проверки. Поздние упоминания
commit в полученном ответе не обновляют pin 061/045 автоматически.
Raw hashes считаются по Git blob без перевода LF/CRLF.

Читать применимые правила README, methodology, algorithm, sessions, runner, реестра практики
и открытых вопросов в контексте целых норм. Исходная карта delta — указатель на hunks,
не замена первичных текстов. Для проверки их применимости нужен полный old→current diff.
Все изменённые пути перечислены далее с raw hashes; для производных/служебных файлов
проверяется и обоснование disposition, а не только факт изменения.

Особые контексты для связей:

- M154–155: полномочия и ворота; M266, M540–541: результат и единственное место.
- M707–720 целиком: линзы, сходимость, замысел, границы, история и свежесть проверки;
  не обрезать длинные строки M711/713/714/715/720.
- M1549–1571: второе мнение, настройка ответа, помощники, язык и согласование;
  условия одних подсистем не выключают другие.
- S62–111: подготовка, уточнение, запуск, единицы и термины; old/current S66 отдельно.
- S118–150,181–211,317–324: требования, результаты, перенос и приёмка.
- R78–120: машинные формы, прогресс и обе части хвоста; R152–175: state/launches.
- R214–233: профиль и второе мнение; R275–277: счёт; R574,590–608,681,689–723:
  остановка, повтор, offsets, lock/cleanup, ворота и приёмочные примеры.
- Q5: процедурный заголовок с уже принятой версией; остальное — вопросы/история по
  применимости, не автоматические решения. P: статус практики не отменяет норму.
- Algorithm — целиком по применимому промпту; равенство байтов не заменяет чтение.

## Approved 031: самостоятельный нормативный input

Commit этого репозитория: `4b48c50eef1fb46af4f074a80511979b16e515e3`.
Путь: `doc/tasks/031-runner-regulation-in-plugin/`.
`spec.md` читать целиком, включая точные типы, closed unions/enums, nullability,
cardinality, namespace/local owner, domain/availability, refs, версии и приёмочные пары.
Связанные `spec-trace.md`, `task/message.md`, `log.md`, `progress.log` и сохранённые
материалы утверждения — первичные источники происхождения approved пакета, по применимости.
Они не история проверок 061. Их наличие и hashes не заменяют смысловую сверку спецификации.
Ничего в approved пакете не является редактируемой целью.

Для полевого crosswalk особенно применимы 031:17–121,138,146,259–263,273–343,
494–505,534–543,565–570,666–672. Это не исключение остального текста.

## Рабочие пакеты 045 и 013, только чтение

Авторский пакет 045: `doc/tasks/045-runner-registry-jsonc/` в отдельном дереве,
служебный locator передаёт интегратор, не берётся из движущегося main.
Читать `spec.md`, `spec-trace.md`, `plan.md`, `log.md`, `plan-review-4.md`
и применимые источники утверждённых ОТВ-01/02. В этом пакете нет `task/message.md`:
не пытаться подменять его постановкой другой задачи; происхождение раскрывает spec-trace.
В текущем plan отдельно читать §8 целиком; `current.md` — указатель на подготовку,
не действующий готовый каталог. Прежняя plan version и текущий append различены в описи.
При необходимости история 045 проверяется для её собственных первичных решений,
не как замена оригинального плана/норм.

Пакет 013: `doc/tasks/013-runner-core/` в отдельном дереве, служебный locator от интегратора.
Читать `task/message.md`, `spec.md`, `log.md` и список файлов по применимости;
в частности статус, REQ-24 и REQ-26…30, отдельное утверждение контракта до реализации.
Проверить наличие src/runner_core и кода, а не считать описание исполнением.
Отсутствие реализации не доказывает compatibility или incompatibility.

Перед/после собственного чтения незакоммиченных 045/013 проверяющий снимает собственные
raw hashes/status и фиксирует границы. Авторские before/after не заменяют его измерение.
Не править эти пакеты, не копировать их полностью в 061, не возобновлять их работу.

## Узкие свидетельства кода

Commit `492c166fbd12e00a6a924efab065f6adb4bd91f6` этого репозитория.
Файлы `opencode-plugin/journal.ts`, `task-folders.ts`, `tasks.ts`, `core.ts`,
`index.ts`, `README.md`. Применимость определяет проверяющий по callsites, не по имени API.

Начальные контексты: journal:158–194,209–225,381–406; task-folders:103–146;
tasks:43–63,222–245; core:1454–1483; index:1543–1572. Это не утверждение,
что вне этих ranges нет механизма, и не доказательство всего stateful runner.

## Отделение истории от предмета

Не читать прошлые отчёты 061 `spec-review-*`, старые methodology/contract/summary reports,
`spec-fixes-1…5.md`, историю сессий, их программы/пробы/журналы или журнал цикла 061.
Не использовать `s1p-5/change-map.md` и авторские пробы как подсказки проверке.
Архивные source IDs в описи не требуют открытия этих материалов.
История остаётся сохранённой; для fresh проверки исходные нормы и owner decisions
даны без результатов прежних проверяющих. Проверка не сводится к вопросу «что изменилось».

## Fingerprints

Точные hashes subject/frozen и первичных источников дописываются ниже после окончательной
заморозки. До появления перечня эта карта не означает завершённой сдачи автора.

### Предмет и побайтные frozen копии

- `spec.md` = `s1p-5/submitted/spec.md`; bytes=33427; SHA-256:
  `231f86a46022d5e592a2d9b001e8ee00e4ffb180094701f82c79dee88dcc4570`

- `analysis.md` = `s1p-5/submitted/analysis.md`; bytes=14830; SHA-256:
  `e830c14b03532526583b1bf2e520bfc5479f10cb34d16d15060cae21393ce3af`

- `031-impact.md` = `s1p-5/submitted/031-impact.md`; bytes=53104; SHA-256:
  `7b6414860e7eab13981758c8fc5bfdb4df6b9dfff9f248ae76506dc53f7ca2cb`

- `spec-trace.md` = `s1p-5/submitted/spec-trace.md`; bytes=43116; SHA-256:
  `f83c3b36d5c4f846d0a0c8d1e7daaa972c9e040f7aa8942231bb71b0746e9038`

- `method-delta.md` = `s1p-5/submitted/method-delta.md`; bytes=34174; SHA-256:
  `c3ec6b250aef815b37a10afd2d1a28728630816739b357a7f25e6ecedef0e065`

- `source-inventory.md` = `s1p-5/submitted/source-inventory.md`; bytes=16390; SHA-256:
  `17bcbc65e7337143eb8d45557dfbc495d025a3880e08e383b48c5ec92fae320b`

- `owner-gate-decisions.md` = `s1p-5/submitted/owner-gate-decisions.md`; bytes=9082; SHA-256:
  `af2adfbcec277365a40d48684776921a4467930c3ed55024c77dbe60cc1cd2c9`


### Первичные источники: точные байтовые области

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/AGENTS.md`; bytes=12877; SHA-256:
  `a39139938a116019b18804760d80d8078ad033402eec66809715dff268d25a0e`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/README.md`; bytes=1839; SHA-256:
  `30657809889a3f79ac9c68a63d977578815a88d753b301bfec0dbac7e3c2498f`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/completeness-check.md`; bytes=205871; SHA-256:
  `a9006507e0fc208a3a572ae2da671cf602afd2668f703974e5b8005169c6e8fc`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/doc/open-questions.md`; bytes=14629; SHA-256:
  `22e6dc2f2de2e09a5219342bbc3cf919025a0af7d0bf0c8f816b80aed706f37d`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/methodology.md`; bytes=363338; SHA-256:
  `60ace58356ab48a9cff2634765c160545572526604dad8eacc6cbead492043ed`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/presentations/methodology.html`; bytes=15202; SHA-256:
  `455353c709c6413d4c58e615e8dd6d089e7910dccd068c44c5dd9a2fb8682a0e`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/presentations/task-sessions.html`; bytes=14462; SHA-256:
  `17cf4434044d0b338e7a0c75aebe3b0917b23a0c8926dbda19588c6bcfbf6a4f`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/starter-kit/README.md`; bytes=40433; SHA-256:
  `ee006baa6662c90cf67a81483ad360110b7c1a9fee061b2b60605dab17cc8809`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/starter-kit/scripts/guards/guards.conf`; bytes=6091; SHA-256:
  `e7458e4b185cd5da5b253657a74b59e4de0110b9df9241f75250ffc87fcb9867`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/starter-kit/scripts/guards/selftest/test-commit-msg.py`; bytes=10942; SHA-256:
  `fea3e782b47796a71e7b152050318b948253027236f0e2bd5e938715a9c09200`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/starter-kit/scripts/guards/selftest/test-commit-range.py`; bytes=10602; SHA-256:
  `0c9e31619b84b1897cf2cbf6d2872d99681d7913ea12ec36bf7ed4c38d085ff0`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/starter-kit/scripts/guards/selftest/test-guard-commit-message.py`; bytes=21070; SHA-256:
  `b00b26dc3bcdeac367192ff99374aae26026617a1588df1ba9728425a10f8929`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/starter-kit/scripts/guards/selftest/test-pre-push.py`; bytes=12227; SHA-256:
  `9be5cca20593caad97d706f247039f5da136ec5a275a26f92bfe847a13faf8af`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/starter-kit/verify-portability.sh`; bytes=22626; SHA-256:
  `394ee4e7ed03716859a1adeb65e927894392911d11aa0a11d16900c71a8aaa0c`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/task-algorithm.md`; bytes=51475; SHA-256:
  `ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/task-runner.md`; bytes=122709; SHA-256:
  `10396a7b7e8fb7b70553647b7204858bbe3ae5861b06b4c45f55a6b55bf4371f`

- `method/f333efa319e445efe029ee6963b477ca8fe3bc1c/task-sessions.md`; bytes=52142; SHA-256:
  `6aaa3e1c38381ddf6cfb22ab490487631d03678a0193495521c16814dc08dcec`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/AGENTS.md`; bytes=14844; SHA-256:
  `c17b6c9fc7e8e1223a60039688fb681950246590342d287e4625d4ecc4c79108`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/README.md`; bytes=1861; SHA-256:
  `0590d3648413073e0f090df02d0613d87b5423ac4ce6548f6e6dbb14fadd1c2f`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/completeness-check.md`; bytes=47447; SHA-256:
  `3fd55d79b4a5dc59e87c914db89327e432b96f027ee8250e60de4f24aa2368a8`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/doc/open-questions.md`; bytes=28960; SHA-256:
  `68b3c3a220795a6fdad7b80b6ecab93c47796dffbecfe40c0a308eabf2d53616`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/methodology.md`; bytes=385080; SHA-256:
  `b404b8d89b659956884fea74f27ed9e317881d4ff35ecf22019d9b40664c6295`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/presentations/methodology.html`; bytes=21668; SHA-256:
  `844b14af6e91c8028a384bedc0289b579af4bcb24307f0824e51b5d497fbe200`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/presentations/task-sessions.html`; bytes=16070; SHA-256:
  `a9d3073cf7d30b4608750f89f847bb39ebcb706c2d5cf539b693a1cd624f0db7`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/starter-kit/README.md`; bytes=40785; SHA-256:
  `da6a60e1521bdc6a668aede00416d8671bd44fd0c9826b9a23951ffe98d77ef7`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/starter-kit/scripts/guards/guards.conf`; bytes=6272; SHA-256:
  `20be7312078c67a2e70a300487a0a3ade07ab087210d69fa80bff1378cec4d2e`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/starter-kit/scripts/guards/selftest/test-commit-msg.py`; bytes=11307; SHA-256:
  `063a50620efb79749cbbc70b62a84b894ce735daf835008a76ad1b97d8e11f52`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/starter-kit/scripts/guards/selftest/test-commit-range.py`; bytes=10695; SHA-256:
  `41cab7d975ce683681477e4d4e4c1118aaf4639948135a6a67f6c2819e73b1ff`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/starter-kit/scripts/guards/selftest/test-guard-commit-message.py`; bytes=21871; SHA-256:
  `833b26d94617fc3fe18801e809d166a7e4c5fe4749b7154a2c385b2a22855a6c`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/starter-kit/scripts/guards/selftest/test-pre-push.py`; bytes=12320; SHA-256:
  `e6ce0aee86e9ba78d6a0d09d58f54d069f1d2a1608c1f97adf19adc08b016793`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/starter-kit/verify-portability.sh`; bytes=23425; SHA-256:
  `1a379610dfcb0c78e7d1263330e8c3247488532e1511f5be2968835acb22ccec`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/task-algorithm.md`; bytes=51475; SHA-256:
  `ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/task-runner.md`; bytes=141522; SHA-256:
  `178fd0f1055bbdd190a4c8d4a5316566ea7be00829f9883cbfb9fde6a2a16a85`

- `method/a449bd2e218e04384d1d42e0c1bffe892495e298/task-sessions.md`; bytes=58883; SHA-256:
  `64b221cde012f6e8d05c94fa6a467e4c5ce999bfd8071878caa3e85b8d57214d`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/log.md`; bytes=56464; SHA-256:
  `de0f724a355bf0e920e22994cd8566f900e1ef67fec1efbb5163aa7e3e693943`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/progress.log`; bytes=6110; SHA-256:
  `54283ffcb26c197780175f127b88d2e63c1f6e72b64b1ca120f85cb9e4e1d706`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-1.md`; bytes=46260; SHA-256:
  `83c74c54f08c7fb420b4e8701fe7a9397707c64505a0300a4b411862ef338efe`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-2.md`; bytes=34544; SHA-256:
  `54aeedc770969cb86a6c0e016d336933128b7bdf36e4eb3b454d0f7d76bbaef1`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-3.md`; bytes=37389; SHA-256:
  `c7a06030423c4b780d2a578c262ff543d7059b46e9f0beb109bf55681ca41bdb`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-4.md`; bytes=45292; SHA-256:
  `e881d4410c311f2e4667130d03dcf746fad14fe4a7a0b4da9fb6a3a6f7ace441`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-5.md`; bytes=15235; SHA-256:
  `e02aaae70f93fa9f2692d695492fe9d114f448b68286aba2b4c345ba7cd1c1d9`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-6.md`; bytes=36925; SHA-256:
  `7d6d4ca5d6d7164e139d40d2df4f5c937fb0319c6ccb9338797fe629caae4376`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-7-attempt-1-incomplete.md`; bytes=3218; SHA-256:
  `c22afc3da0a5ecaa917121d5ed3d91d7380e39e0c0e34bb0a3bf12f8fa1c816d`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-7.md`; bytes=70864; SHA-256:
  `b0f7d30d6ffe77f9b9cbe31ac7320a4b7bf1bc79461d38628c485d38ac015129`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-8.md`; bytes=65986; SHA-256:
  `df40154c146b90cd9e4832cfa1b7bf903a9874f667ba0c03293eb792fe2ecc4a`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-review-9.md`; bytes=64232; SHA-256:
  `c2d434feb29e001ccae90f25dcd068dffd7ad009539b6950f5bcf6d27c4a7d21`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec-trace.md`; bytes=82011; SHA-256:
  `8af75b276ea92302bdb41d45a7ca0a34522af0d0e0f5fa129078fa9403166d48`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/spec.md`; bytes=177306; SHA-256:
  `a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829`

- `approved031/doc/tasks/031-runner-regulation-in-plugin/task/message.md`; bytes=6800; SHA-256:
  `f8cb1bae2cdf41996cf45ee3979d18b053f172424948e8e968b04b7611c8587d`

- `plugin/492c166fbd12e00a6a924efab065f6adb4bd91f6/journal.ts`; bytes=58601; SHA-256:
  `211eb4324489886444287bb5a266adacfffd55185d4e9f64923a563967006e93`

- `plugin/492c166fbd12e00a6a924efab065f6adb4bd91f6/task-folders.ts`; bytes=9078; SHA-256:
  `6e13014ad6fe52a61d27b2ec3110df0d9f3f531365fbd3856cdd869fa31dadd7`

- `plugin/492c166fbd12e00a6a924efab065f6adb4bd91f6/tasks.ts`; bytes=29835; SHA-256:
  `c5eade92e01b73a37b0e78b83c8228fd1e5f548aa1fb06360f7049fcab919896`

- `plugin/492c166fbd12e00a6a924efab065f6adb4bd91f6/core.ts`; bytes=309494; SHA-256:
  `75543b85249bd6d135b917c2bb3347c0140f33ea222afc4ad90d023f03b29384`

- `plugin/492c166fbd12e00a6a924efab065f6adb4bd91f6/index.ts`; bytes=154772; SHA-256:
  `e37562e25903e72067fd39fe463ea6d864dd8dd043f1d690e11b5532e0b6f5f1`

- `plugin/492c166fbd12e00a6a924efab065f6adb4bd91f6/README.md`; bytes=88498; SHA-256:
  `d16abd39650d4b5158b37a4a0d3a3dcaf5c31185b6ac714eef51887d700c13f9`

- `project/AGENTS.md`; bytes=14812; SHA-256:
  `3963c74cfe98e5d3830dfc39f18b5ff27b58befcfba82342de40bb9902797b37`

- `project/README.md`; bytes=3284; SHA-256:
  `2c7b47e2f40cb071954d874819ec7ad84958b6bcd812ced97101d9b8642d1dac`

- `project/doc/open-questions.md`; bytes=8821; SHA-256:
  `8c66f711a17b9fa1e8e3d8f7b5f408e1904ce93be089d892e507a06985749129`

- `project/.opencode/crew-harness.json`; bytes=2605; SHA-256:
  `03e8a7f8dccdaf65e183ef7fd84947ac0e102214e677643316805d272ef9bf60`

- `project/doc/canon/decisions/ADR-0001-work-by-methodology.md`; bytes=3728; SHA-256:
  `a7ccb5d95812757493a4caffe3aa5a610ff47ed8512a6d260c9ec6838fa53a90`

- `project/doc/canon/decisions/ADR-0002-repository-layout.md`; bytes=2917; SHA-256:
  `23a7cb419488cf9a998ea47efbabff985aff137c62b5e5c763cb3f73f1b2325b`

- `project/doc/canon/decisions/ADR-0003-go-first-then-nova.md`; bytes=4860; SHA-256:
  `4ae17f2ad4818c3d7555f52fb0bb7a166d8067899ff5aa2c5266f2fd7e5d4a19`

- `project/doc/canon/decisions/ADR-0004-agent-drivers-on-subscriptions.md`; bytes=3949; SHA-256:
  `eabc04b334d6aecf45db5588cb912c7db14caa24c0fde0e280c2f85f79d02909`

- `project/doc/canon/decisions/ADR-0005-own-browser-console.md`; bytes=3184; SHA-256:
  `7982cb9fafc1b6a8c9059c7aa02eadb757b460382a141fe3cdf450277240e378`

- `project/doc/canon/decisions/ADR-0006-public-repository.md`; bytes=4848; SHA-256:
  `d850556fed553d312394126ad8242e68536155eedaa357256880e3ac048928ba`

- `project/doc/canon/decisions/ADR-0007-plan-in-task-epics.md`; bytes=5278; SHA-256:
  `f70bc4f6c6087da5bdeef12b1ccbafd1de887f3579d6b00d48a25a40c6190319`

- `project/doc/canon/decisions/ADR-0008-model-profiles-layer-and-window-files.md`; bytes=5357; SHA-256:
  `d1363e40675c55e82280d8b58e2f1b8fd0bf140c285be5f560f3b75c65e1a640`

- `project/doc/canon/decisions/ADR-0009-merge-precheck-without-lock.md`; bytes=5026; SHA-256:
  `4a37c181bb88851cd286bb03baf82a2c1339b45f480f69419c4b798d182b7efb`

- `project/doc/canon/decisions/ADR-0010-question-answering-modes.md`; bytes=4983; SHA-256:
  `d78146f409deba2f621d5dd06396e33015e7d25dd96cc41ff3072575b34f9bb6`

- `project/doc/canon/decisions/README.md`; bytes=5010; SHA-256:
  `f16270148caccfb7d6171930bd1a00c8463f14c15a69b20bc91c417ecb8351c6`

- `project/doc/canon/process.md`; bytes=43312; SHA-256:
  `1f3edf393dc194bb74baf8ee332e564bdaf8476c5609a60a2c23ccbf0171e210`

- `project/doc/canon/README.md`; bytes=4654; SHA-256:
  `b1f38d8faca5d1154b597ffb58de1ddfe464db5bb44d4a83155c6cdbbc8e05cf`

- `045/spec.md`; bytes=46637; SHA-256:
  `685245b64f33424e225e340898399b49084f39b20f66469b58637fe96cc05ed8`

- `045/spec-trace.md`; bytes=27513; SHA-256:
  `5d27240a9589b56ac39a7707ab05bb96a074c889a932632dd43b086a12e7241b`

- `045/plan.md`; bytes=65136; SHA-256:
  `4856a2410418ecce9cbff8c5656ab9229135f87db6e4ebde17ebd362b2e23857`

- `045/log.md`; bytes=51565; SHA-256:
  `8679a884f426e98e997b65977d96ba098d267b6cb9005c9d8a9a98597d84c4b3`

- `045/plan-review-4.md`; bytes=10898; SHA-256:
  `ea0d84e953159a18d27b18eb5d8097806478960fe6327749a72afa928c05e6a9`

- `045/current.md`; bytes=966; SHA-256:
  `4d849fb02670ed6c003866e0090792f0c0fff3ef6a6e71d8544c142be1162cf3`

- `013/spec.md`; bytes=112194; SHA-256:
  `f86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376`

- `013/log.md`; bytes=42991; SHA-256:
  `434e218c66362a3bccaeb5cecd3f621e4c6817dda4115be80d169cbc19c0f263`

- `013/task/message.md`; bytes=9868; SHA-256:
  `88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9`

- `061-primary/task/message.md`; bytes=15872; SHA-256:
  `45354b28004cc46168ef5b4f7c4b4a1070b46ff18981b5238d5648ae13d73727`

- `061-primary/catalog-owner-decision-2026-10-16.md`; bytes=3967; SHA-256:
  `ee04eab7cfa9b863d7a5b8f723f74126ced37d5c70bc63e112929bad084ce465`

- `061-primary/methodology-catalog-response-2026-10-16.md`; bytes=5745; SHA-256:
  `f70b32e5b17fe4ff30449b9990e38e50ad8c301f7632ad1178bc7566ada9f271`

### Дополнительный read-only контекст локального checkout

При проверке происхождения наблюдался локальный HEAD `78ed75838ef58073153e5343c9483bc462721a31`; это не проверенный remote latest
и не принятый новый pin. Before/after checkout одинаковы; семипредметная frozen редакция
остаётся сравнением old→a449bd2. Следующие пять областей — контекст самостоятельной оценки
применимости, не утверждённое дополнение к норме. Перед переносом нужны upstream-проверка,
полный delta и повторные ворота по В-01а. Не превращать наблюдение в молчаливый переход.

- `completeness-check.md` @ `78ed75838ef58073153e5343c9483bc462721a31`; bytes=49608; SHA-256:
  `6fa0007cbcadb7116d863989c9b302e04a546c471fa103b034891afa49c6a87d`; ranges: @@ -46,0 +47,2 @@
- `doc/open-questions.md` @ `78ed75838ef58073153e5343c9483bc462721a31`; bytes=29783; SHA-256:
  `f1872a151d0aaceb39737d8d2109bd3c2b8a43c7a0c6666745be83c78c0e906b`; ranges: @@ -87,0 +88 @@
- `methodology.md` @ `78ed75838ef58073153e5343c9483bc462721a31`; bytes=387098; SHA-256:
  `107013a0a8df1033760dff0efe2c0911a2e92d61c07a0ccee78d2c6ed27ee291`; ranges: @@ -155,0 +156,2 @@
- `presentations/methodology.html` @ `78ed75838ef58073153e5343c9483bc462721a31`; bytes=23190; SHA-256:
  `d33f67b884d281564aa9d59a6cb0b246226146c7ecb71e2984ea3606194ee7c7`; ranges: @@ -80,0 +81 @@
- `task-sessions.md` @ `78ed75838ef58073153e5343c9483bc462721a31`; bytes=60653; SHA-256:
  `55b8bf4854104563c56bf08fe7b5957f865d9040e99205965f6e458dd993a452`; ranges: @@ -233,0 +234,12 @@

Для чтения в исходном Git-объекте: M156 (ворота цикла сессий и вопрос),
S234–245 (п.7 С4: внешние предпосылки, read-only проверки и вопросы исполнителя),
P47–48 (происхождение практики), Q88 (открытый вопрос, не новая короткая ветка),
presentation81 (производное отображение). Task-runner.md и task-algorithm.md
между этими точками не менялись. Это не обещание совместимости или полноты будущего переноса.

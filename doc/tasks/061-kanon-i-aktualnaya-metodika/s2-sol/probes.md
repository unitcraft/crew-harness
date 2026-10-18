# Предметные пробы независимой С2

Шесть разных проб; первые пять относятся к предмету, шестая — к качеству собственного обхода. Это read-only stdout либо конкретные осмотренные перечни с числом и результатом, не parser/JSONC/schema/runtime PASS.

## П1. Состав 061 отдельно от исторических спецификаций — линза А

Выполнен Python-пересчёт начальных идентификаторов `^REQ-\d+\.`, `^AC-\d+\.`, `^DNC-\d+\.` и нумерованных пунктов описи. Для 031/045 использовался их собственный разделитель `—`, а не regex 061. Дословный stdout:

```text
REQ 5 REQ-01,REQ-02,REQ-03,REQ-04,REQ-05
AC 5 AC-01,AC-02,AC-03,AC-04,AC-05
DNC 4 DNC-01,DNC-02,DNC-03,DNC-04
inventory 38 declared_total ['38']
coverage_tables 0
not_requirement_rows 0
REQ explicit source labels 0
methodology.md actual_lines 2009
task-runner.md actual_lines 723
task-sessions.md actual_lines 416
031 [('REQ', 36), ('AC', 42), ('DNC', 5)]
045 [('REQ', 18), ('AC', 14), ('DNC', 9)]
```

Положительный контроль — существующие пять AC и все 38 пунктов найдены и перечислены; отрицательный вывод о таблице проверен чтением всего spec, а не только regex. Словосочетание «не требование» как disposition отсутствует: перечитано 0 таких строк, не «все обоснованны». В analysis есть классификационная таблица delta, но это не покрытие каждого фрагмента постановки → REQ/AC/DNC. Все пять REQ сопоставлены со словами владельца вручную: необходимость работ имеет источник в message:9–23; самостоятельные конкретизации не помечены и per-REQ source locator в spec отсутствует.

## П2. Разрешённая текущая progress-форма против закрытой нормы 031 — линза Б

Команда получения оригиналов: Python `subprocess.check_output(['git','show','4b48c50:doc/tasks/031-runner-regulation-in-plugin/spec.md'])`; для текущего runner — такой же git show во внешнем клоне на `a449bd2:task-runner.md`. Осмотрены 031:50,99–109,253–263,309,540; runner:88–94,274–278.

Два отличающихся трассируемых входа и положительный контроль:

```text
TRACE A current lawful: С1 0/1 старт -> С1 1/1 готово: итог; 031 pair17 rejects готово:
TRACE B current lawful: С1 0/2 старт -> С1 1/1 готово — N завышено: один источник; 031 REQ19/AC15 demand final N/N without that exception
CONTROL common lawful: С1 0/1 старт -> С1 1/1 готово; no conflict
SHAPE conclusion: linePattern has grammar ref but matching registry cannot overturn 031 explicit invariant; new JSON key not proved necessary
```

Это осмотр нормативных пар, не запуск несуществующего валидатора. Для трассы Б работа действительно содержит один источник: начальная оценка N=2 завышена, объяснение проверяется по артефакту. 031:105 отдельно допускает изменение N, но REQ-19 прямо фиксирует exact слово без двоеточия, а пара 17 и AC-15 называют `готово:` незаконным. Поэтому трасса А сама по себе достаточна: даже возможное разночтение N не устраняет противоречие.

Имеющееся поле: `progressFormat.linePatterns[]` — закрытый объект из пяти обязательных ключей `id:string`, `grammar:string`, `mode:counted|zero-unit`, `hasDate:boolean`, `unitRule:string|null`. Для counted unitRule non-null и совпадает с node.unit; grammar — ссылка matching kind=grammar registry. Новое значение grammar не вправе отменить фиксированный REQ-19/AC-15 approved документа. Контрпример требует пересмотра семантического контракта/приёмочных пар, но **не доказывает** необходимость нового ключа или новой schemaVersion. Это разные решения.

## П3. Полный normative diff и квалификация применимости — линза А

Выполнены `git diff --stat f333efa a449bd2`, полный `git diff f333efa a449bd2 -- methodology.md`, полный diff runner/sessions, AGENTS/README; дополнительно `git diff ab2a4ef a449bd2 -- task-runner.md task-sessions.md`. Старое нормативное содержание показывается удалёнными строками, новое — добавленными; из текущих оригиналов прочитан окружающий контекст. Удалённый исторический provenance-реестр completeness не выдаётся за новые/отменённые нормы.

Перечень изменённых путей, 16:

```text
AGENTS.md
README.md
completeness-check.md
doc/open-questions.md
methodology.md
presentations/methodology.html
presentations/task-sessions.html
starter-kit/README.md
starter-kit/scripts/guards/guards.conf
starter-kit/scripts/guards/selftest/test-commit-msg.py
starter-kit/scripts/guards/selftest/test-commit-range.py
starter-kit/scripts/guards/selftest/test-guard-commit-message.py
starter-kit/scripts/guards/selftest/test-pre-push.py
starter-kit/verify-portability.sh
task-runner.md
task-sessions.md
```

Предметный осмотр десяти групп: (1) роль/запись решения; (2) весь протокол сходимости, включая исключение для правил проверки; (3) второе мнение и профиль; (4) result/current и С1/С3/С6; (5) launch/correction/final; (6) process group/retry/state; (7) уточнение цели при перезапуске; (8) словарь задача/сессия/подзадача; (9) язык принимающего; (10) provenance/заморозка/вопросы. Группы 7 и реальное различие подзадачи не отражены надлежащим образом в analysis; по группам 1–3 статус практики смешан с обязательностью. Отдельные starter-kit/презентационные изменения не объявлены нормативными требованиями CrewHarness и не исследованы как реализация.

Дословный вывод проверки указателя группы 7:

```text
DELTA prep3 clarification: False
DELTA subtask difference: method=plan item without gates; project=separate task with own number/gates
```

False — отсутствие характерной пометки в analysis, подтверждённое чтением всей таблицы; не доказательство отсутствия нормы в проекте. В `index.ts` refinement уже имеет собственную модель доставки, но это свидетель, а не повод пропустить новую норму из delta.

## П4. Не подменён ли реальный блокер 045 отсутствием runtime 013 — линза А

Осмотрены все 203 строки spec 045, все 188 строк плана, все 42 строки С4-4, log:36–59; в 013 — статус, message:1–74, spec:400–525, финальные решения журнала. Состояние дерева и хеши сняты только чтением. Дословные ключевые stdout:

```text
spec.md 46637 203 685245b64f33424e225e340898399b49084f39b20f66469b58637fe96cc05ed8
plan.md 58552 188 150c9826fc1be49a63cbd8754491c88063c9eca02d145519040d1da51c6711e4
plan-review-4.md 10898 42 ea0d84e953159a18d27b18eb5d8097806478960fe6327749a72afa928c05e6a9
src exists False src/runner_core exists False
spec.md 112194 f86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376
task/message.md 9868 88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9
```

Четыре раздельных результата:

1. С4-4: одна существенная, 0 поверхностных, 4 пробы; воспроизводимый per-anchor/per-DNC checklist не задан; дополнительно упомянута полнота полей comparison 013.
2. В-05 плана: авторитетный registry/signatures отсутствует; перечислены 16 kinds, source/provenance и запрет выдавать proposed за существующие операции. Это отдельный блокер.
3. Пин данных 045 f333efa и поздний ручной протокол ab2a4ef различены планом:183–184; обновление журналов само не переводит JSONC на новую норму.
4. 013 остановлена до утверждения spec/контракта/кода; «Контракт внутри 013» — известное решение 2026-10-09. Нет before/after изменения, которое делало бы его свежим consumer API.

Отсутствие runtime не доказывает schema gap и не снимает обязательных деклараций. Предложение analysis:43 закрывает направление правки checklist, но не означает её выполнения и не решает В-05. Условия владельца log 045:49,54,56 о новом тексте/воротах сохраняются до отдельного изменения; актуализация Канона не заменяет утверждение правки 045.

## П5. Обратное полевое сопоставление семи тем crosswalk — линза Б

Осмотрены все семь строк impact:11–17 против полного закрытого approved spec. Ниже — допустимые **формы**, не придуманные реальные registry names/signatures.

| Тема | Точное доступное место и ограничения | Результат |
|---|---|---|
| Фактические launches | mutable journal не корень JSONC: 031:13,329,600 исключают его; декларации могут находиться в `events[].payloadSchema`/`actions[].payloadSchema` и `graph.edges[].actions` с actionUse | Внешним остаётся runtime storage/исполнение, но не исчезает обязанность описать предусмотренный порядок/входы; просто сослаться на REQ-29 недостаточно для полной декларативной трассы |
| Process group/retry/resume | action/event обязательны `id,kind,payloadSchema,sourceRef,effectBoundary`; payloadSchema ровно `type:object,properties,required,additionalProperties:false`; поля могут быть string, integer, enum, object/array по закрытой fieldSchema; edge actions упорядочены, actionUse bindings ровно required + заданные optional; контекстные outputs требуют matching signature | Нужны данные/внешние signatures; отсутствие нового root state — не доказанный пробел формы. Обязательную последовательность можно объявлять графом/action intentions, не утверждая исполнения |
| Progress | linePattern пять обязательных ключей, mode counted/zero-unit; nSourceRules unique exact refs единственного kind=unit; пять stopKinds exact; launch/finish markers фиксированы | Shape позволяет новые grammar refs, но конкретная старая норма exact `готово` противоречит новой. Не «только новые данные» без решения о редакции контракта |
| Fresh/lenses/second opinion | sessions.kind=`agent|human|system|meeting`, role/promptRef nullable по kind; lens ровно `{id,title,sessionId}`, sessionId только meeting; node.sessionId/gateId nullable по kind, description nonempty≤500; profiles exact `enabled,defaults,stageRules,limits`; stage rule profile ровно четыре string|null tier/effort/reasoning/budget по registry | Самостоятельного поля family/freshness в profile/lens нет. Это не доказывает невозможность: policy можно описать parameter enum (required/default, values, bounds/reset/sourceRef по 031:56,115), вход проверки — event/payload enum, ветвление — fixed predicate с external signature, документ — field grammar. Реальные имена/контракты не получены. Поэтому корректен условный verdict о форме, но не доказанное полное отображение всей новой процедуры одной ссылкой на lens |
| Refs/version | registryBinding ровно `{id,kind,version,digest}`, 16 закрытых kinds, не более одного каждого kind; version major.minor, digest 64hex; methodology files 1..128 path/sha, commit 40hex; coverage disposition represented/external_contract/not_requirement, typed targets unique, у двух последних reason обязателен | Поля есть; hash/пример ID не подтверждает signature или полноту. Required datum не исчезает от disposition external_contract |
| current.md/documents | document filename basename, только N/round/lens/void tokens; literal current.md допустим, numberBinding без N запрещён; fields required/multiplicity one/zero_or_one/one_or_more/zero_or_more, grammar ref и valueType из шести типов; markers literal/required/count exact enum; requiredBy node/session/gate refs | Декларативное место для документа/маркеров есть. Приёмочная сверка уникальности/копий должна оставаться требованием процесса, а не runtime обещанием |
| Gate outcomes | gate ownerRequired:boolean; true→defaultDecision=null, decisions≥1; иначе defaultDecision — локальный decision; decision.counterEffects строго []; route.trigger kind event/gate-decision/predicate-outcome; route.targetNode=edge.to; effect boundary/confirmation/resultEvent согласованы с matching registry | Допустимая форма есть, реальный outcome mapping — В-05. Факт наличия owner gate не подтверждает, кто решил или что процесс выполнен |

У fieldSchema nullable — обязательный boolean; object required определяет наличие независимо от null; array maxItems integer 1..10000; integer bounds integer|null в безопасном диапазоне; дополнительные ключи запрещены. Поэтому произвольный JSON/новое поле `freshness` в lens/profile не предлагалось как обход закрытости. Возможность условной декларации через общие формы не выдаётся за существующие registry signatures. **Обязательного datum, требующего именно нового JSON-ключа, не установлено; конфликт фиксированного семантического ограничения установлен.**

## П6. Проверка собственной полноты источников — процесс

Сверены стыки сохранённых больших stdout и дочитанных диапазонов: конкретный список из пяти выпавших фрагментов — methodology:573,723; task-runner:682; completeness:38; 031 spec:65. Все пять повторно показаны целыми строками; перечень/исход — read-map и qualification. Положительный контроль: approved 031 имеет 732 строки/177306 байт и ожидаемый SHA, все его остальные диапазоны показаны раньше; строка 65 действительно существует и задаёт display.fields, а не пустой несущественный ряд. Результат — предмет дочитан, ранние completion-отметки четырёх источников неточны. Это отдельная собственная существенная находка, не чистый процесс.

# Единственная авторская карта delta методики — С1п-5

Статус: черновик. Это поадресный анализ, не копия методики и не действующая норма.

## Область и чтение

Источник old O = `unitcraft/ai-dev-methodology @ f333efa319e445efe029ee6963b477ca8fe3bc1c`, current C = `a449bd2e218e04384d1d42e0c1bffe892495e298`. M=`methodology.md`, S=`task-sessions.md`, R=`task-runner.md`, Q=`doc/open-questions.md`, P=`completeness-check.md`. Номера строк — исходные Git-объекты; `∅ после n` означает вставку: старый текст не содержал нового правила. Ниже полный список 16 changed paths и карта hunks. Удалённая история P — не новая норма; её удаление и нормативные оригиналы квалифицированы отдельно. Собственное чтение автора и унаследованная глубина разделены в описи; карта не приписывает ему повторный полный аудит всех оригиналов.

### Единые назначения (конкретные будущие шаги, не нынешний перенос)

- **D0**: внешняя основа действует по `process.md:5–12`/ADR0001, перенос текста не нужен. Будущий шаг «Внести выбранное основание Канона» после утверждения spec и ворот переноса реализует уже выбранные В-01/В-01а: README/«Параметры для раннера», строка версии, process/«Основа» и правило явного перехода с полномочиями. Применимые внешние нормы не пересказываются. Каждая строка D0 проверяется по своему anchor; обозначение не отменяет её условий.
- **D1**: process/«Результат и куда он попадает», шаг «Согласовать действующие места и указатели». В-02 уже выбрал адресное уточнение и новый ADR/реестр/входную ссылку; содержание формата и версии ещё отдельно утверждаются. Сохранить более строгое проектное правило и current при первом любом переносе (REQ-05/AC-05), не ждать формата.
- **D2**: `process.md`, «Задача, сессия, подзадача», строки 151–160; шаг «Назвать смысловой override терминов» — не менять уже выбранный владельцем смысл, явно противопоставить внешнему S110. Если требуется новое решение — отдельные ворота, не новый смысл по умолчанию.
- **D3**: `process.md`, «Журнал хода progress.log»,60–121; шаг «Сверить принятое журнальное основание» — сохранить проектные инструмент/дату/парный запуск/переход старых журналов; общую норму не копировать второй раз. Менять код/настройки эта задача не разрешает.
- **D4**: `process.md`, «Открытые вопросы»,125–144; шаг «Сверить уже принятое основание вопросов» — сохранить pin9d391ba и project дополнения, не импортировать новые нерешённые вопросы как решения.
- **D5**: `process.md`, «Режимы ответа на вопросы» и «Роли»; шаг «Сверить границы решений» — сохранить ADR0010 и owner gates, D0 для нового внешнего текста. Новое отличие только новым ADR, не молчаливой правкой принятого.
- **DX**: перенос не нужен: внешний служебный/исторический/производный файл или непринятый вопрос. Обоснование в каждой строке; это не blanket исключение normative anchors.

Первый из этих будущих шагов, реально переносящий результат 061, создаёт current, остальные дополняют его, независимо от ожидания format. New proposed format создаётся только после В-02 в `src/runner_core/regulation/format.md`; approved031 никогда target. Последствия 031/045 всех нормативных строк — полевой `031-impact.md`, который не подменяется этой картой.

### Кодовые свидетели и честные границы

Только plugin Git база `492c166fbd12e00a6a924efab065f6adb4bd91f6`, не live:

- **EJ**: `journal.ts:158–194,209–225,381–406`: startN/correction/append-only и парная запись; это не доказательство своевременности/артефакта/всего runtime.
- **EL**: `task-folders.ts:103–146`, `index.ts:1543–1572`: writeLaunch до старта, отказ писать main; `tasks.ts:43–63` не имеет offset/processGroup/starttime. Не выдавать TaskSession.launch за state.launches.
- **ES**: `tasks.ts:222–245` — tmp+rename Task record, не atomic runtime state.
- **EG**: `core.ts:1454–1483` — инструкция про gates/answer_mode/источник письма, не факт второго мнения или исполнение норм. Языковая инструкция, ранее исследованная в core/index, не смысловой контролёр всех строк.
- **EØ**: автоматическое исполнение данного anchor не доказано этими узкими callsites; норма применяется вручную по D0/override. Это граница обследования, не утверждение, что во всём коде механизма нет.

## Все 16 изменённых путей

### F01 `AGENTS.md`

**Old → current hunk/смысл:** O58–59→C58–62: реестр, frozen перечень, граница проверки

**Класс / Canon-code / destination:** Внешние правила правки самой методики/provenance. DX: не импортировать чужую frozen таблицу/запреты; живую норму границы брать M713, не внешний AGENTS. Код EØ

### F02 `README.md`

**Old → current hunk/смысл:** O15→C15: completeness назван реестром практики

**Класс / Canon-code / destination:** Provenance/navigation; DX, проект README7–25 уже отличает Канон/историю. Не новая норма

### F03 `completeness-check.md`

**Old → current hunk/смысл:** O1→C1; O3–5→C3; O7–1135→C5; O1139→C9; O1141–1167→C11; ∅после 1170→C15–24; ∅после 1187→C42–49

**Класс / Canon-code / destination:** Реестр/provenance: удалённая история доступна 962172e, а не потеря норм. Новые 15–24: связи/абзацы/журналы/публичность/рекомендации/слово/язык/процессы/область;42–49: результат/сходимость/замысел/opinion/роль/термин/язык/уточнение. D0 для нормативных оригиналов, DX для переноса реестра; P не отменяет норму по partial/unconfirmed. EØ

### F04 `doc/open-questions.md`

**Old → current hunk/смысл:** 12 hunks: O5–13→C5;15→7;17→9;23→15;26→∅;34–51→25–26;55→30;70→45;74→49–54;77→∅;∅после 78→58–61;81→64–87

**Класс / Canon-code / destination:** **C5 процедура**, D4, уже принята 9d391ba, не вопрос. Остальное: история расчётов/источники/нерешённые вопросы §§1–12, DX; частично принятый «ответ без роста» проверяется отдельно по M714. Q3 не отменяет процедурный заголовок. EØ

### F05 `methodology.md`

**Old → current hunk/смысл:** 10 hunks, M01–M19 ниже

**Класс / Canon-code / destination:** Нормы/условия/provenance различены ниже

### F06 `presentations/methodology.html`

**Old → current hunk/смысл:** ∅после O79→C80–81; O86→C88–102; O98→C114

**Класс / Canon-code / destination:** Производное отображение ролей/opinion/результата и перенумерация секций. DX: не нормативный оригинал, сайт не target061; проверено по diff, не визуально

### F07 `presentations/task-sessions.html`

**Old → current hunk/смысл:** ∅после O102→C103–104

**Класс / Canon-code / destination:** Производное отображение терминов/уточнения/current. DX, исходные обязанности в S01–S12

### F08 `starter-kit/README.md`

**Old → current hunk/смысл:** ∅после 33→34–35;∅после 45→48;54→57;117–120→120–122

**Класс / Canon-code / destination:** Лицензии в корень/индекс, default signoff политика комплекта. DX: не обновление guards проекта. AGENTS4 требует -s, собственное отличие сохраняется; команда add комплекта не разрешает команды 061

### F09 `starter-kit/scripts/guards/guards.conf`

**Old → current hunk/смысл:** O33–36→C33–37, signoff off

**Класс / Canon-code / destination:** Default переносимого комплекта, DX; проектная обязательная подпись остаётся AGENTS4, не молчаливое принятие off

### F10 `starter-kit/scripts/guards/selftest/test-commit-msg.py`

**Old → current hunk/смысл:** O41→C41–42; O188→C189–193

**Класс / Canon-code / destination:** Строгий тестовый профиль и фиксированная committer date для amend. DX: самотест комплекта, не процесс/запуск 061; не исполнялся

### F11 `starter-kit/scripts/guards/selftest/test-commit-range.py`

**Old → current hunk/смысл:** O32→C32–33

**Класс / Canon-code / destination:** Строгий профиль самотеста, DX, не норма 061

### F12 `starter-kit/scripts/guards/selftest/test-guard-commit-message.py`

**Old → current hunk/смысл:** ∅после 242→C243–250;∅после 289→C298

**Класс / Canon-code / destination:** Штатный no-signoff контроль отдельно от strict negative tests, DX; не отменяет project -s

### F13 `starter-kit/scripts/guards/selftest/test-pre-push.py`

**Old → current hunk/смысл:** O35→C35–36

**Класс / Canon-code / destination:** Строгий профиль самотеста, DX; не запускать pre-push061

### F14 `starter-kit/verify-portability.sh`

**Old → current hunk/смысл:** O63→C63; O174→C174;∅после 276→C277–294;∅после 410→C429

**Класс / Canon-code / destination:** Лицензии в проверяемом комплекте/индексе/HEAD + проба case_licenses. DX: переносимость комплекта, не обновление Канона; не запускалось

### F15 `task-runner.md`

**Old → current hunk/смысл:** 15 hunks, R01–R18 ниже

**Класс / Canon-code / destination:** Ручное принятое ab2 отдельно от программных обязанностей

### F16 `task-sessions.md`

**Old → current hunk/смысл:** 12 hunks, S01–S12 ниже

**Класс / Canon-code / destination:** Подготовка/промпты/перенос/приёмка


## M: все 10 hunks и отдельные применимые смыслы

### M01 10–15→10

**Норма / условие / provenance:** История редакций в Git, реестр практики

**Canon / code evidence / disposition и будущий шаг:** README7–25; EØ; DX, не переносить историю как норму

### M02 ∅после 158→154–155

**Норма / условие / provenance:** Оркестратор вне списка решает с доводом в log; owner список+ворота; сомнение owner

**Canon / code evidence / disposition и будущий шаг:** process15–24/199–225, ADR0010; EG не полное исполнение; D5/D0. P46 unconfirmed — provenance, не off. Q86–87 — вопрос, не отмена gates

### M03 269→266

**Норма / условие / provenance:** DoD: результат на действующем месте, не только task

**Canon / code evidence / disposition и будущий шаг:** process175–197; EØ смысловой приёмки; D1, source→место в AC05

### M04 544→541, части 1–2

**Норма / условие / provenance:** Всё не-код и читаемый людьми контракт в коде; ровно одно конкретное место/status/шаг не позже проверки реализации

**Canon / code evidence / disposition и будущий шаг:** process183–193; EØ; D1, будущие шаги в trace; default «код» без этой оценки запрещён

### M05 тот же hunk, части 3–4

**Норма / условие / provenance:** Самодостаточность; approved immutable; копии/метки/исключения форматов; current только адреса, reader сначала current

**Canon / code evidence / disposition и будущий шаг:** process187–197, ADRindex3–6; EØ; D1. Не править 031 после ворот, только новый format к В02

### M06 тот же hunk, части 5–6

**Норма / условие / provenance:** Current тем же шагом переноса и при смене места обновляется; чужой repo отдельный MR/задача; новое ADR со связью

**Canon / code evidence / disposition и будущий шаг:** process183–197, AGENTS16; EØ; D1. First-transfer уточнён S192, не ждать format

### M07 ∅после 711→709–711

**Норма / условие / provenance:** Порог: >1 нормы или механизм; норма=абзац/пункт M/task-*, не registry/OQ. Замысел 3 поля; свежий собеседник другой семьи если доступен,≤10, факты без рассуждений, спорно/запись

**Canon / code evidence / disposition и будущий шаг:** process5–12 не отключает; EØ; D0: внешняя основа, текст не пересказывать. В task review instructions применять по этому anchor; текущая ограниченная С1п не создаёт подагентов

### M08 тот же hunk→711

**Норма / условие / provenance:** Замысел — не доказательство/не отклонённая находка/не сокращает цикл/не согласование/не заход; без границы для норм самой проверки, mixed split

**Canon / code evidence / disposition и будущий шаг:** process5–12; EØ; D0, условия не терять при применении задания проверяющим

### M09 тот же hunk→712

**Норма / условие / provenance:** Первая строка линзы обход — граница, иначе вернуть; граница не исключает цель; выход за границу сам требует классификации

**Canon / code evidence / disposition и будущий шаг:** process5–12; EØ; D0. Не превращать авторскую границу в иммунитет

### M10 тот же hunk→713

**Норма / условие / provenance:** База до первой правки + база цикла; «не по адресу» только выдержка и не внесла/не опаснее/не опирается/не должна закрыть; бремя автора/сомнение внесена; цель/дефект не вне предмета

**Canon / code evidence / disposition и будущий шаг:** process5–12; EØ; D0, доказательство в review, не grep/hash

### M11 тот же hunk→713

**Норма / условие / provenance:** Whole-read + связь для расширения соседей; вопрос 4 поля, reviewer предлагает/автор вносит; >3 critical-equivalent сигнал owner; privacy не вне предмета

**Canon / code evidence / disposition и будущий шаг:** process125–144/AGENTS15; EØ; D0+D4, существующая процедура вопросов не отменена

### M12 тот же hunk→714

**Норма / условие / provenance:** Ответ в порядке сузить/ослабить/удалить/вопрос; новое имя/правило отдельная задача; выбор старого чтения vs новое правило по цели; открыто+не утверждать опровергнутое+вопрос оформлен

**Canon / code evidence / disposition и будущий шаг:** process5–12/125–144; EØ; D0/D4. Не создавать новую задачу без owner word

### M13 тот же hunk→714

**Норма / условие / provenance:** Одна попытка/раздельные исправления; новая существенная→откат+вопрос; «не по адресу» не откат; last ceiling исключение по§18

**Canon / code evidence / disposition и будущий шаг:** process5–12; EØ; D0, старые потолки не сбрасывать

### M14 тот же hunk→715

**Норма / условие / provenance:** Неисполненная спец пометка; существенная требует вход+две чтения/нет итога; дописать трассу/иначе поверхностная; опровержение подтверждает следующий; implementation свидетель

**Canon / code evidence / disposition и будущий шаг:** process5–12; EØ; D0. Не снижать критичность лишь по отсутствию runtime

### M15 тот же hunk→715–718

**Норма / условие / provenance:** Таблица legal/illegal/why, судья каждой формы, batch/version/change-list; нормы о проверке только исполнимость 2–3 цикла/история, mixed split;718 причина/наблюдение

**Canon / code evidence / disposition и будущий шаг:** process5–12; EØ; D0, применение не runtime PASS, причину не новый override

### M16 1110→1118–1119

**Норма / условие / provenance:** Checklist: действующий результат вне task

**Canon / code evidence / disposition и будущий шаг:** process175–197; EØ; D1. Для 045 нужен отдельный per anchor/per DNC протокол плана, ссылка Canon не исправление плана

### M17 ∅после 1540→1550–1551

**Норма / условие / provenance:** Second opinion перед рекомендацией с последствиями; fresh/different family if available; facts-only≤10; log текст/итог, recommendation строка/ref; default on/explicit owner-off; не помощник/не проверка/не owner decision

**Canon / code evidence / disposition и будущий шаг:** process199–225/README40 off только helpers; EG не механизм opinion; D0+D5. P45partial не отключение, R232 профиль отдельно

### M18 1551→1562;1559→1570

**Норма / условие / provenance:** Язык принимающего без режима; замысел НЕ согласование; согласование условно по цене/проверяемости и после макета

**Canon / code evidence / disposition и будущий шаг:** AGENTS17/core инструкция не смысловой контроль; EØ; D0. Не выключать замысел тем, что optional согласование ещё не прогнано

### M19 1699→1710

**Норма / условие / provenance:** Подпись frozen снимка, внешний перечень

**Canon / code evidence / disposition и будущий шаг:** DX, provenance, не переносить чужую таблицу/заморозку; живые выводы не исключать по одному названию


## S: все 12 hunks (S01 содержит две независимые вставки)

### S01a 66→66

**Обязательство / условие:** Old: целый prompt первым, cwd/путь; **уточнения цели в old НЕТ**. Current добавляет machine-tail общий+сессионный/код/единицу

**Canon / code / disposition:** process66–88; EJ/EL лишь часть; D0+D3, нет переноса общего prompt в Canon

### S01b 66→66

**Обязательство / условие:** Если цель уточнена — в том же первом сообщении перед old message, дата/source/действует уточнение, old не удалять

**Canon / code / disposition:** AGENTS2 сохраняет слово, отдельный механизм не доказан; EØ; D0, применять при запуске, не подделывать старый source

### S02 69→69

**Обязательство / условие:** Новая без history; перед повтором закрыть агента и все команды; каждый launch парно до агента/номер

**Canon / code / disposition:** process77–88; EL/EJ регистрация не stop group; D3/D0

### S03 ∅после 81→82

**Обязательство / условие:** Current артефакт будущего переноса

**Canon / code / disposition:** process175–197; EØ; D1, не создавать сейчас

### S04 86–87→87–88

**Обязательство / условие:** Log фиксирует каждый запуск; агент не пишет launcher log

**Canon / code / disposition:** process77–101; EJ/EL; D3

### S05 ∅после 106→108–111

**Обязательство / условие:** Задача/spec/ворота; сессия=запуск; подзадача=пункт без ворот

**Canon / code / disposition:** process151–160 по owner2026-10-15: иной смысл подзадачи, явный semantic override; EL модель запуска не устанавливает смысл; D2

### S06 117→122

**Обязательство / условие:** Вторая строка spec про current

**Canon / code / disposition:** process175–197; EØ; D1/D0, первая/вторая сохранены в 061

### S07 ∅после 128→134–137

**Обязательство / условие:** Результат/место/шаг либо честный код; не названное место→вопрос с сроком

**Canon / code / disposition:** process183–197; EØ; D1, В02 не ответ автора

### S08 141→150

**Обязательство / условие:** При правке spec сохранить вторую строку

**Canon / code / disposition:** process175–197; EØ; D1/D0, неизменность literal проверяется

### S09 174→183

**Обязательство / условие:** Третья строка plan про current

**Canon / code / disposition:** process175–197; EØ; D1/D0, plan сейчас не создаётся

### S10 182→191–192

**Обязательство / условие:** Каждый результат отдельный шаг/DoD; первый перенос current, прочие дополняют/копии; исключение только честный код

**Canon / code / disposition:** process175–197; EØ; D1/REQ05/AC05, включая Canon-first

### S11 201→211

**Обязательство / условие:** При правке plan сохранить третью строку

**Canon / code / disposition:** process175–197; EØ; D1/D0

### S12 307→317–324

**Обязательство / условие:** С6 все места/current/сверка копии/единственность поиском/ссылки/метки/literal строки/MR/код как контракт; gitdiffstat только task в repo

**Canon / code / disposition:** process187–197 строже по всему Canon; EØ; D1; pin старых задач сохранить, формальный guard неполная приёмка


## R: все 15 hunks с разнесёнными атрибутами

### R01 24→24

**Обязательство / условие:** Коды А/Ф/Л по линзам

**Canon / code / disposition:** process88; EL неполный meeting runner; D3/D0

### R02 78→78

**Обязательство / условие:** Порядковый launch№ в progress

**Canon / code / disposition:** process77–86; EJ/EL; D3

### R03 84→84

**Обязательство / условие:** Журнал сигнал, артефакт/independent review доказательство; не антифальсификация

**Canon / code / disposition:** process63/102–104; EJ не доказывает честность строки; D3

### R04 88–91→88–91: keyword

**Обязательство / условие:** Целое слово/знак после; стоп/поправка colon; start одна/agent первая; session по registered launch, линзы по code

**Canon / code / disposition:** process66–101; EJ/EL; D3,031semantic conflict в impact, не только refs

### R05 тот же hunk: lifetime

**Обязательство / условие:** Group именована до старта, id+starttime, остановить всех и команды перед retry/нет процессов; manual закрыть окно

**Canon / code / disposition:** process77–88 ручная часть; EL не runtime; D3/D0, декларации REQ27/29 не выкинуть

### R06 тот же hunk: correction

**Обязательство / условие:** append-only quote10–30/вся короткая, текущий k, не единица/не живость; skip/late-start не чинит

**Canon / code / disposition:** process89–104; EJ; D3

### R07 тот же hunk: done

**Обязательство / условие:** Сравнить со startN, k>N;   no-start/second-start не completion; final повтор same k/keyword; low N три исхода/overstated с artifact; new session только запускающий

**Canon / code / disposition:** process70–107; EJ startN, не artifact; D3, отдельная изолирующая N пара в impact

### R08 93→93–94

**Обязательство / условие:** Только launcher launch+парный log; форма поверхностна, существенные исключения списком; skip по artifact

**Canon / code / disposition:** process77–104; EJ/EL лишь формальная часть; D3

### R09 104→105–120

**Обязательство / условие:** Каждый«Сессия»новый start, full machine-tail, инструмент если есть,**сессионная часть старше общей включая profile**

**Canon / code / disposition:** process66–76/88; EJ инструмент есть, не передача всего prompt; D3/D0

### R10 143→159–160

**Обязательство / условие:** Running group/time до request; launches append-only номер/code/offset/time/group/time

**Canon / code / disposition:** process33 manual override; ES не runtime state, EL без полей; D0/override сохранить, в impact намерения отдельно

### R11 ∅после 214→232–233

**Обязательство / условие:** Opinion класс A/reasoning/effort3, для security/money/data/norm 4; different family if available; отдельная модель проекта

**Canon / code / disposition:** process240–244 профиль не доказывает selector; EØ; D0, не менять модели этой сессии

### R12 256–258→275–277

**Обязательство / условие:** Correction не k, завершение startN, таймер по росту k; С5/С5д только новый artifact count, С5п findings, distinct k без start/correction/repeat

**Canon / code / disposition:** process63/102–108; EJ частично, полный artifact/timer EØ; D3/D0

### R13 555→574

**Обязательство / условие:** Вне совещания stop останавливает group перед exit

**Canon / code / disposition:** process33 manual; EØ; D0+manual override, декларативный effect в impact

### R14 571–572→590–595

**Обязательство / условие:** Group до request, n=max launches/log+1; save append launch до line; offset после линии/profile и result-count snapshot; running до call

**Canon / code / disposition:** process77–88/33; EL только часть, ES не подтверждение runtime; D0/D3

### R15 577–579→600–602

**Обязательство / условие:** Постоянный отказ/retry/бездействие→stop all+verify; meeting failed/halt; tail с off_p только текущий code

**Canon / code / disposition:** process33/87–88; EØ; D0, не выдавать сигнатуру stop-group за API

### R16 ∅после 584→608

**Обязательство / условие:** Существенные journal нарушения→log, не autorepair turn

**Canon / code / disposition:** process95–121; EJ неполный runner; D3/D0

### R17 ∅после 656→681

**Обязательство / условие:** Cleanup прежней group только после lock, проверить starttime; нет group fallback task processes/иначе В13

**Canon / code / disposition:** process33 manual; EØ; D0, конкретный внешний контракт/декларация в impact

### R18 ∅после 690→716

**Обязательство / условие:** Приёмочные примеры keywords/correction/startN/final exceptions/launch authority/retry all/quote

**Canon / code / disposition:** process60–121; EJ узкое; D3/D0, данные пар не факт полного runtime PASS


## Проверка pin/bytes и принятых оснований

`task-algorithm.md` НЕ changed path, old=current=ab2a4ef побайтно: raw Git blob **51475 байт**, LF, SHA-256 `ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96`. После искусственного LF→CRLF получается `8a0004dbfd8b6d8f9889abeb8ee02f3bf87ea9af6309ca2a21b8cfdca9eead8d`. Старое число в spec было исторически ошибочно квалифицировано как hash источника; snapshots не правятся. Semantic delta algorithm **нет**.

`ab2a4efda1d5b16a76f43ac1cd4aa245d5aed9b0`→current R: единственная вставка 232–233(second opinion профиль). Следовательно journal/R105–120/lifetime из current не«впервые 061»: manual часть принята process60–121 с ab2, runtime не подтверждён. `9d391bad999674c27a52dc5d1e9dae9a61d8c033` Q5 **побайтно равна current строке 5**, procedure уже process125–144; новые Q вопросы не обновляют процедуру/не отменяют её. Old S66 показан без уточнения, новый anchor нет подмены в старом столбце.

Реестр P42–49: result/сходимость/замысел/opinion частично/не прогнано; роль/термины/язык/уточнение unconfirmed. Это provenance, не off-switch. Спорыролей/опыта остаются внешними вопросами; проектные границы решаются ADR/воротами, не ответом автора.

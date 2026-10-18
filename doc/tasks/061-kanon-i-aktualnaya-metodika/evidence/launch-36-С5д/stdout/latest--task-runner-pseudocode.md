# Раннер: псевдокод цикла задачи

Вынесено из [task-runner.md](../../../publication/originals.zip) (историческая цель: `task-runner.md`; точный оригинал — в архиве), раздел «Алгоритм»; словарь, форматы, профили и ворота — там же. Псевдокод совещания — [task-runner-meeting-pseudocode.md](../../../publication/originals.zip) (историческая цель: `task-runner-meeting-pseudocode.md`; точный оригинал — в архиве).

> **Устарело (2026-10-17).** Схема не приведена к контракту машины (`state-machine-spec.md`, правило 35: вызов, один ответ, отмена, пауза цепочки, коды отказа). Для совещания актуальна форма состояниями — [task-runner-meeting-states.md](../../../publication/originals.zip) (историческая цель: `task-runner-meeting-states.md`; точный оригинал — в архиве); приведение этого файла — открытый вопрос со сроком 2026-11-15 (`doc/open-questions.md`).


Псевдокод. Коды сессий — из словаря; `gate(В*)` — ворота, ждут человека; `run(...)` — один запуск агента; `loop_review(...)` — повтор «проверка → правка» по «Правилам» task-sessions.md. Все функции сохраняют state после каждого изменения. Внутри фазы каждое действие перед запуском пишет `state.step`, и при входе в фазу выполнение продолжается с него, а не с первой строки.

```text
алгоритм run_task(task_dir, repo_dir):
    state ← load_or_init(task_dir)
    prepare(state)                                   # раздел «Подготовка» task-sessions.md + блокировка (ниже)
    prefix[основной] ← build_prefix(state)
    если state.running: run(state.running.сессия, source=state.running.источник, pass=state.running.заход)   # оборванная сессия заново

    пока state.phase ≠ ЗАВЕРШЕНО:
        reconcile_approvals(state)                   # файл «утверждено» с чужим hash → invalidate, log
        выбор state.phase:                           # вход в фазу — со state.step

        РАЗБОР:
            если state.next[РАЗБОР]:
                (s, src) ← state.next[РАЗБОР]; state.next[РАЗБОР] ← нет
                fixed ← run(s, source=src)
                если fixed = stopped(«вопрос»): answers ← gate(В4); write_answers(spec.md, answers); run(С1п, source=«Ответы»); owner_fix(spec); continue
            иначе если нет spec.md: run(С1)
            verdict ← loop_review(spec)
            выбор verdict:
                route(«требования»): run(С1п, source=verdict.source); continue        # остаёмся в РАЗБОР
                stopped(«вопрос»):   answers ← gate(В4); write_answers(spec.md, answers); run(С1п, source=«Ответы»); owner_fix(spec); continue
                clean:               пропуск
            answers ← gate(В4)                       # вопросы и сценарии заказчику; текст и источник каждого ответа
            если answers непусты:
                write_answers(spec.md, answers); run(С1п, source=«Ответы»); owner_fix(spec)
                если answers меняют цель, границы или сценарии: continue            # loop_review заново
            gate_approve(spec.md)                    # В5
            prefix[основной] ← build_prefix(state)   # слой 3 теперь содержит spec.md
            state.phase ← ПЛАН

        ПЛАН:
            если state.next[ПЛАН]:
                (s, src) ← state.next[ПЛАН]; state.next[ПЛАН] ← нет
                fixed ← run(s, source=src)
                выбор fixed:
                    stopped(«требования»): to_requirements(source=«последний абзац plan.md»); continue
                    stopped(«вопрос»):     answer ← gate(В7); если answer.level = «реализация»: log(«умолчание подтверждено»)
                                           иначе: route_answer(answer); continue
            иначе если нет plan.md: run(С3)
            если stop_word(plan.md) = «требования»: to_requirements(source=«последний абзац plan.md»); continue
            verdict ← loop_review(plan)
            выбор verdict:
                route(«требования»): to_requirements(source=verdict.source); continue
                stopped(«вопрос»):   answer ← gate(В7)
                                     если answer.level = «реализация»: log(«умолчание подтверждено»)   # дальше В6
                                     иначе: route_answer(answer); continue
                clean:               пропуск
            decisions ← gate(В6)                     # раздел «Требует утверждения»
            write_decisions(plan.md, decisions)
            если decisions меняют шаги, карту или DoD: run(С3п, source=«решено»); owner_fix(plan); continue
            gate_approve(plan.md)                    # В5
            prefix[основной] ← build_prefix(state)   # слой 3: spec.md + plan.md
            state.phase ← РЕАЛИЗАЦИЯ

        РЕАЛИЗАЦИЯ:
            если state.next[РЕАЛИЗАЦИЯ]:
                (s, src) ← state.next[РЕАЛИЗАЦИЯ]; state.next[РЕАЛИЗАЦИЯ] ← нет
                outcome ← run(s, source=src)         # С5п после находок или обратной связи, С5д после ответа
            иначе если нет result.md или status(result.md) = «в работе»:
                outcome ← run(С5)                    # старт или возобновление: С5 сам читает result.md
            иначе:
                outcome ← done                       # result.md готов: сразу проверка
            пока outcome ≠ done:
                выбор outcome:
                    stopped(«ревизия») | stopped(«план»): to_plan(source=«последний абзац result.md»); выйти во внешний цикл
                    stopped(«требования»): to_requirements(source=«последний абзац result.md»); выйти во внешний цикл
                    stopped(«вопрос»):
                        answer ← gate(В7)            # текст, источник, уровень ответа называет человек
                        если answer.level = «реализация»: log(«умолчание подтверждено»); outcome ← run(С5д, answer)
                        иначе: route_answer(answer); выйти во внешний цикл
            verdict ← loop_review(review)
            выбор verdict:
                route(«план»):       state.next[РЕАЛИЗАЦИЯ] ← (С5п, verdict.source); to_plan(source=verdict.source); continue
                route(«требования»): state.next[РЕАЛИЗАЦИЯ] ← (С5п, verdict.source); to_requirements(source=verdict.source); continue
                stopped(«вопрос»):   answer ← gate(В7)
                                     если answer.level = «реализация»: state.next[РЕАЛИЗАЦИЯ] ← (С5п, последний review-N.md + ответ как FACT)
                                     иначе: state.next[РЕАЛИЗАЦИЯ] ← (С5п, answer); route_answer(answer)
                                     continue
                clean:               пропуск
            decisions ← gate(В8, строки FAIL / NOT VERIFIED / Known limitations, state.out_of_scope)
            write_owner_marks(result.md, decisions); state.out_of_scope ← []; owner_fix(review)
            если среди decisions «закрыть руками»: gate(В8, «подтвердите, что закрыто»); state.clean_streak[review] ← 0; continue
            если среди decisions «урезать объём»: state.next[РЕАЛИЗАЦИЯ] ← (С5п, «решение владельца»); to_requirements(source=decisions); continue
            state.phase ← СДАЧА

        СДАЧА:
            если есть строка FAIL / NOT VERIFIED / Known limitations без «решение владельца:»: gate(В8); continue
            если state.feedback_round > 0 и есть delivery/customer.md и нет delivery/customer-<round>.md:
                rename(delivery/customer.md → delivery/customer-<round>.md)
            prefix[сдача] ← build_prefix_delivery(state)
            run(С7, delivery_mode=state.delivery_mode)
            verdict ← loop_review(delivery)
            выбор verdict:
                restart:             continue        # С7 заново после С5п по решению владельца
                route(«план»):       state.next[РЕАЛИЗАЦИЯ] ← (С5п, verdict.source); to_plan(source=verdict.source); continue
                route(«требования»): state.next[РЕАЛИЗАЦИЯ] ← (С5п, verdict.source); to_requirements(source=verdict.source); continue
                stopped(«вопрос»):   answer ← gate(В7)
                                     если answer.level = «реализация»: log(«умолчание подтверждено»); continue      # С7 заново
                                     иначе: state.next[РЕАЛИЗАЦИЯ] ← (С5п, answer); route_answer(answer); continue
                clean:               пропуск
            если в последнем review-N.md нет строки «Секреты в diff:»: gate(В12)
            если diff рабочего дерева с последним коммитом пуст:                  # сдача только текстов
                log(«сдача без изменений кода»); gate(В10г); state.phase ← ОБРАТНАЯ_СВЯЗЬ; continue
            gate(В10а)                               # коммит: показать commit.txt, ветку, состояние дерева
            run(КОММИТ)                              # промпт «Вы после С8» без пуша
            если сообщение последнего коммита ≠ commit.txt байт в байт: gate(В10б)
            gate(В10в)                               # пуш: показать сообщение из истории
            run(ПУШ)
            gate(В10г)                               # отправка customer.md заказчику — делает человек
            state.phase ← ОБРАТНАЯ_СВЯЗЬ

        ОБРАТНАЯ_СВЯЗЬ:
            fb ← gate(В11)
            если fb = завершить: state.phase ← ЗАВЕРШЕНО; continue
            state.feedback_round += 1; save(task/feedback-<round>/, fb)
            run(С9)
            owner_fix(все циклы)                     # потолок считается от этой правки
            выбор parse_route(feedback-<round>.md):
                «С1 правка»: state.next[РЕАЛИЗАЦИЯ] ← (С5п, feedback-<round>.md); to_requirements(source=feedback-<round>.md)
                «С3 правка»: state.next[РЕАЛИЗАЦИЯ] ← (С5п, feedback-<round>.md); to_plan(source=feedback-<round>.md)
                «С5 правка»: state.next[РЕАЛИЗАЦИЯ] ← (С5п, feedback-<round>.md); state.phase ← РЕАЛИЗАЦИЯ
                «С7»:        state.phase ← СДАЧА

    снять блокировку; show(«задача завершена»)


алгоритм to_requirements(source):
    invalidate(spec.md); invalidate(plan.md)         # план строится на требованиях и заново проходит С3п и С4
    state.next[РАЗБОР] ← (С1п, source)
    state.next[ПЛАН]   ← (С3п, source + «Изменения захода N» или «Ответы» в spec.md)   # и находки уровня «план» из того же файла
    state.phase ← РАЗБОР

алгоритм to_plan(source):
    invalidate(plan.md); state.next[ПЛАН] ← (С3п, source); state.phase ← ПЛАН

алгоритм route_answer(answer):                       # уровни «план» и «требования»; «реализация» разбирается в фазе
    «план»:       to_plan(source=answer)
    «требования»: to_requirements(source=answer)

алгоритм owner_fix(stage):                           # правка по решению владельца: «Потолок» task-sessions.md
    state.pass_origin[stage] ← state.pass[stage]


алгоритм loop_review(stage):
    пока state.clean_streak[stage] < ЧИСТЫХ_ПОДРЯД:
        n ← state.pass[stage]; extra ← ""
        review ← (stage = meeting) ? check_meeting(n) : run(checker(stage), pass=n)   # run не возвращает ошибок: В13 внутри
        если review = halt: вернуть halt                              # только совещание: остановка до разбора сводки
        summary ← parse_summary(review)              # в совещании — строка «Заход N: критических K, значимых Z, желательных D, проб P»: K — критические, Z и D не читаются
        если summary отсутствует: все находки существенные (в совещании — критические); log(«итоговой строки нет»)
        если summary.K = 0 и summary.P < ПРОБ_В_ЧИСТОМ:
            log(«заход n: чистый без проб, не засчитан»); state.pass[stage] += 1
            state.unaccounted[stage] += 1; если state.unaccounted[stage] ≥ 2: gate(В13, «проверка второй раз без проб»); если stage = meeting и исход «остановить»: вернуть halt
            continue                                 # проверка заново, правка не нужна
        state.unaccounted[stage] ← 0
        verdict ← gate(В3, review)                   # человек читает находки и пробы; может поднять критичность
                                                     # или не засчитать чистый заход, если пробы — не пробы;
                                                     # возвращает существенные находки с уровнями, без уровня «вне задачи»:
                                                     # те копятся в state.out_of_scope для В8;
                                                     # в совещании — все находки с серьёзностями после поправки человека, без уровней; verdict.K — критические
        state.pass[stage] += 1
        если verdict = не_засчитан: log(«заход n: пробы — не пробы, не засчитан»); continue
        если verdict.K = 0:
            если stage = meeting: state.open[meeting] += желательные находки verdict; если state.clean_streak[stage] + 1 ≥ ЧИСТЫХ_ПОДРЯД: state.open[meeting] += значимые находки verdict   # без дублей; значимые правятся только в заходе с критическими, у чистого захода правки нет, значимые последнего захода идут в открытые (methodology.md, раздел 18); значимые не последнего чистого захода в открытые не идут: следующий заход их повторит или нет
            state.clean_streak[stage] += 1; continue
        state.clean_streak[stage] ← 0
        если stage = meeting: state.open[meeting] += желательные находки verdict и значимые с полем «повтор:»   # значимая правится одной попыткой (methodology.md, раздел 18)
        если n − state.pass_origin[stage] + 1 ≥ ПОТОЛОК_ЗАХОДОВ:        # существенные остались после потолка (в совещании — критические)
            choice ← gate(В9, все находки цикла)
            owner_fix(stage)
            если stage = meeting:                    # исходы В9 для совещания: «ещё заход» (решение человека вписывается в источник правки автора: сузить или разбить предложение), «остановиться», «остановить совещание»
                «остановиться»:         state.open[meeting] += критические и значимые находки verdict, у которых нет поля «повтор:»; вернуть clean   # итог принимается с незакрытыми находками, они записываются в решение
                «остановить совещание»: вернуть halt
                «ещё заход»:            extra ← решение человека (сузить или разбить предложение); пропуск
            иначе выбор choice:
                «урезать объём»:      вернуть route(«требования», source=review)
                «разбить»:            вернуть route(«требования», source=review)   # С1п делит документ на части: REQ и AC дословно, с покрытием
                «спросить заказчика»: вернуть stopped(«вопрос»)
                «остановиться»:       только stage ∈ {review, delivery}:
                                      run(С5п, source=«решение владельца: не делаю, <дата>»)
                                      если stage = delivery: вернуть restart       # С7 заново
                                      вернуть clean
                «ещё заход»:          пропуск        # дальше правка по находкам этого захода
        если stage ≠ meeting:                        # у предложения нет уровней «требования» и «план»: находки правит автор
            levels ← уровни существенных находок из verdict
            если «требования» ∈ levels: вернуть route(«требования», source=review)
            если «план» ∈ levels и stage ∈ {review, delivery}: вернуть route(«план», source=review)
        fix ← (stage = meeting) ? критические и значимые находки verdict, у которых нет поля «повтор:» : review
        fixed ← run(fixer(stage), source=fix + extra, pass=n)         # ход диалога автора, если жив; extra — решение человека у В9
        если stage = meeting и fixed = stopped(w): fixed ← stopped(«вопрос»)     # у автора предложения единственная остановка — вопрос человеку
        выбор fixed:
            halt:               вернуть halt                           # только совещание
            stopped(«вопрос»):  вернуть stopped(«вопрос»)
            stopped(«ревизия»): вернуть route(«план», source=артефакт автора)
            stopped(w):         вернуть route(w, source=артефакт автора)
    state.clean_streak[stage] ← 0                    # следующий цикл по этому циклу проверки начнётся заново
    вернуть clean


алгоритм run(session, source?, pass?):
    # В13 внутри совещания (любое gate(В13) ниже): исход «остановить» → run возвращает halt, вызывающий поднимает его до meeting;
    # для линзы совещания любой исход, ведущий на В13 (нет артефакта, форма не исправлена, постоянная ошибка, отказ, бездействие), вместо ворот даёт failed
    # вне совещания «остановить» — остановить группу процессов агента и выйти из программы
    state.step ← session; save(state)
    N ← count_units(session)
    profile ← choose_profile(session, defaults, state.hint); state.hint ← ""
    gate(В2, profile, оценка цены)
    prompt ← PROMPTS[session] + TAIL_SESSION(session)
        # подстановки: <репозиторий> ← state.repo_dir; <папка задачи> ← state.task_dir; <источник правок> ← source;
        # <способ сдачи: …> ← state.delivery_mode; <ответ>, <кто ответил или какой документ> ← answer.text, answer.source;
        # <ветка из plan.md> ← строка «Ветка:» раздела «План» plan.md. Агент запускается из task_dir.
    kind ← сдача если session ∈ {С7, С7п, С8, КОММИТ, ПУШ} иначе основной
    если session ∈ {С1п, С3п, С5п, С5д} и dialog_alive(author(session), profile):
        conv ← continue(state.transcript[author(session)])
        если не помещается(conv + prompt, profile): закрыть диалог; conv ← new(prefix[kind]); log(«расшифровка не помещается»)
    иначе:
        conv ← new(prefix[kind])
    check_budget(conv + prompt, profile)             # В1 — только если не помещается новый диалог
    группа ← завести группу процессов агента (именованную), запомнить время её старта
    n ← 1 + наибольший номер запуска в state.launches и в строках `запуск` progress.log
    state.launches += {n, session, размер(progress.log), now, группа}; save(state)   # запись целиком до строки, только дописывается; обрыв до строки — строка в log.md, не находка
    дописать в progress.log «<код> 0/0 [время] запуск №<n>»
    off_p ← размер(progress.log); off_h ← размер(profile.log); off_r ← число строк «пункт n: сделан» и «шаг n: сделан» в result.md
    state.running ← {session, source, pass, now, группа}; save(state)
    response ← call_model(conv, prompt, profile, stream=вкл, deadline=срок_бездействия)   # срок задан только в совещании; наблюдатель прерывает ожидание, если нет байтов потока (включая служебные события), вызова инструмента и новой строки progress.log дольше срока профиля роли; в очереди общего ресурса срок приостановлен, очередь дольше срока затяжки поднимается человеку
        # перед каждым запросом (и каждым ходом с инструментами): state.prefix[kind].last_request_started_at ← время старта; save
        # временная ошибка (лимит частоты, перегрузка, сбой) → повтор до 3 раз с растущей паузой, тот же диалог
        # выход обрезан по лимиту → один ход «продолжи с места обрыва», затем ошибка
        # постоянная ошибка или отказ модели → gate(В13): «повторить» — остановить группу процессов агента, убедиться, что в ней нет процессов, и заново этот же run; «остановить» — остановить группу процессов агента и выйти из программы (в совещании — halt)
        # бездействие дольше срока → ожидание прервано, группа процессов агента остановлена целиком, log(«роль не ответила: <роль>»); для линзы — остановить группу процессов агента и вернуть failed, иначе gate(В13), исходы те же (в совещании «остановить» → halt)
    параллельно: tail(progress.log, от off_p, строки кода этой сессии) → k/N
    record_usage(response.usage); check_cache(response, kind)      # правило «Проверка после каждого запроса»
    если session ∉ {КОММИТ, ПУШ}: state.hint ← parse(profile.log, от off_h) или "" с log(«ПРОФИЛЬ не получен от <код>»)
    если артефакта сессии нет: gate(В13, последнее сообщение агента)       # «повторить» / «остановить»
    verify_formats(артефакт)
        # нарушены → один ход «исправь форму файла: …» в том же диалоге; снова нарушены → gate(В13)
    проверка журнала: существенные нарушения из «Строк progress.log» (строки `запуск`, которых нет в state.launches, повтор номера запуска, строки после итоговой, коды без запуска, ошибка в ключевом слове итоговой строки, `готово` при k меньше N из старта без исправления, `готово` без старта или после второго старта) → строка в log.md (не ход на исправление)
    если session — автор или правка:
        state.transcript[author(session)] ← {conv, started_at = state.prefix[kind].last_request_started_at, ttl, profile}
    state.running ← нет; save(state)
    вернуть outcome(артефакт)
        # статус «готово» или файл без стоп-слова → done; стоп-слово в последнем абзаце → stopped(слово)


алгоритм gate(В*, …):
    state.step ← В*; save(state)
    пока ворота открыты:
        keep_alive(conv_next)                        # conv_next — расшифровка автора текущего цикла проверки, если жива
                                                     # (её чтение продлевает и слои 0–3), иначе new(prefix текущей фазы)
    показать, ждать решения; при потолке поддержания расшифровка считается мёртвой и удаляется


алгоритм build_prefix(state):
    layer0 ← tools, отсортированные по имени
    layer1 ← read(task-algorithm.md) + rules(task-sessions.md) + TAIL_COMMON
    layer2 ← файлы task/ кроме task/feedback-*/, порядок по кодам символов имени;
             принимаемые форматы — блоками, остальные — строкой «файл <имя>, <размер> — читай инструментом»
    layer3 ← [spec.md если утверждён] + [plan.md если утверждён]
    отсечки: после layer1, после layer2, после layer3 (если непуст); четвёртая — автоматическая на хвосте
    срок жизни отсечек 1–3: длинный, если ожидаемая пауза у ворот или длительность хода больше короткого срока
    state.prefix[основной] ← {fingerprint = hash(класс, усилие, размышление, bytes(layer0..layer3)), tokens, ttl}
    вернуть (layer0, layer1, layer2, layer3)

алгоритм build_prefix_delivery(state):               # при каждом входе в СДАЧА и после restart
    слои 0–1 те же; одно сообщение: spec.md, plan.md, result.md, последний review-N.md
    отсечки после слоя 1 и после этого сообщения
    state.prefix[сдача] ← {fingerprint, tokens, ttl}


алгоритм keep_alive(conv):                           # пока открыты ворота
    период ← срок жизни самой короткой живой отсечки conv − минута
    потолок ← (цена записи − цена чтения) / цена чтения × период
    каждые период от старта предыдущего запроса, пока ожидание < потолок:
        call_model(conv, нулевой выход, без потока, без принудительного вызова инструментов,
                   без структурированного вывода; та же модель, усилие, размышление, отсечки)


алгоритм invalidate(file):
    первая строка file ← «Статус: черновик»; approvals[file] ← нет
    закрыть диалоги, в слое 3 которых был file: plan.md — диалог С5; spec.md — диалоги С3 и С5
        # диалог автора файла (С1 для spec.md, С3 для plan.md) не закрывается: его слои 0–3 не изменились,
        # правка идёт его ходом, если он жив
    prefix[основной] ← build_prefix(state)


алгоритм gate_approve(file):                         # В5
    если status(file) = утверждено и (нет approvals[file] или approvals[file].hash ≠ hash(file)):
        показать первую строку, спросить «это ваше утверждение?»; нет → первая строка ← «Статус: черновик»; log
    ждать подтверждения человека в программе, что он поставил «Статус: утверждено, <дата>, <кто>»
    approvals[file] ← {дата, кто, hash(file)}

алгоритм reconcile_approvals(state):                 # при загрузке и перед каждым run
    для file ∈ {spec.md, plan.md}: если status = утверждено и hash(file) ≠ approvals[file].hash:
        invalidate(file); log(«правка после утверждения, статус снят»)   # правило task-sessions.md


алгоритм load_or_init(task_dir):
    state ← read(state.json) или начальное состояние
    если state.running задан: файл захода, начатый оборвавшейся сессией, переименовать в *.partial.md
    для каждого stage: pass[stage] ← max(state.pass[stage], 1 + наибольший N файлов цикла на диске);
                       pass_origin[stage] ← state.pass_origin[stage] или pass[stage]
    если state.step — ворота: показать их заново и сверить с файлами (статус «утверждено», «решено:», пометка владельца,
        коммит с текстом commit.txt в истории); решение уже в файле → просить подтвердить, а не повторять сессии
    вернуть state                                    # оборванную сессию перезапускает run_task по state.running


алгоритм prepare(state):                             # идемпотентен
    проверки раздела «Подготовка» task-sessions.md
    создать task_dir/runner.lock с идентификатором процесса; занят живым процессом → остановиться
    если state.running задан: только теперь, с блокировкой, остановить прежнюю группу процессов агента из state.running (сверив время старта) и убедиться, что в ней нет процессов; без записи группы — найти и остановить процессы агента этой папки задачи, иначе gate(В13)
    в служебной папке системы контроля версий рабочего дерева (не попадает в diff) — файл с путём папки задачи;
        принадлежит другой задаче → gate(«дерево занято другой задачей»)
    первый коммит, если кода нет, — только если истории ещё нет
```

> Публикационная копия: изменены только ссылки, кодировка или служебная разметка.
> Точные исходные байты и SHA — в [описании происхождения](../../../publication/provenance.json) и архиве оригиналов.

Заход 17: существенных 3, поверхностных 0, проб 4

# 002 — проверка разбора (Сессия С2, заход 17)

Что проверено: spec.md (1199 строк, «Статус: черновик», правка Сессии С1п по spec-review-16.md). Сверено с
task/message.md и task/guards-survey.md, с Каноном (doc/canon/README.md, process.md на ревизии `ce6e833`, AGENTS.md,
decisions/) и с методикой unitcraft/ai-dev-methodology @ 41ba76f: task-algorithm.md; task-sessions.md (промпт С2,
«Правила», пробы, потолок); раздел «Машинные форматы» task-runner.md; README §5, §19–§21. Код `main`: голова `ce6e833`,
108 файлов под git, `scripts/`, `.github/`, `.claude/` нет. Решения В9 сверены по log.md. Прочитаны spec-review-16.md
целиком, spec-review-1…15 — итоги и находки, spec.md целиком.

Это заход 17, второй после сброса потолка решением В9 (б). По решению владельца хук агента — подсказка, а не барьер
(REQ-16, Н-12): новые обходы хука существенными не считаются, ложные отказы законных команд — существенны. Все три
находки ниже — ложные отказы. Каждый воспроизведён на хуке донора A, из которого убраны правила, которые REQ-16 не
берёт (проба 4).

Строк «не требование» в таблице покрытия 7: M-02, M-03, M-06, M-12, R-08, R-18, G-24. Перечитал все, с каждой
согласен. В описи 31 источник, последняя строка «итого: 31». REQ 37, AC 30, DNC 6, повторов нет (проба 1). Открытых
вопросов нет.

## Закрытие находок захода 16 (по тексту spec.md)

| № | Находка захода 16 | Где в spec.md | Итог |
|---|---|---|---|
| 1 | Из REQ-16 выпало, что главные правила судят команду без текста в кавычках и тела heredoc | REQ-16, строки 337–339: «Правила судят только исполняемую часть команды: текст в одинарных и двойных кавычках и тело heredoc вырезаются до проверки. Исключение — правила по сырой команде (обратный апостроф) и пометка `# index-verified`». AC-10, строки 734–737: зелёные `grep -n "git stash" AGENTS.md`, сообщение `-m` с `git add -A` в кавычках, heredoc с `git push --force`; красные `git stash`, `git add -A`, `git push --force` | закрыта |

Отклонённых находок в «Изменениях захода 16» нет. Соседнее правки не сломали:
- Н-12 (строки 241–243) называет цену: команда внутри `bash -c "…"` не проверяется.
- Красные пробы AC-10 с обратным апострофом остаются красными: это правила по сырой команде, вырезание их не трогает.
- Пометка `# index-verified` читается по сырой команде, как у донора.

Находки заходов 1–15 перепроверены по итогам и не открылись.

## Находки

1. Правило «флаг после `--` в `git commit`» отклоняет законную цепочку команд. Флаг ищется до конца строки, а не до
   конца команды `git commit`. Поэтому флаг следующей команды в той же строке считается флагом коммита. Отказ
   получают, например:
   - `git commit -s -F m.txt --only -- a.txt && git push -u origin <ветка>`;
   - `git commit -s -F m.txt --only -- a.txt && git status -s`;
   - `git commit -s -F m.txt --only -- a.txt; git log -1 -m`.

   Это обычная форма из AG п.4 с последующим пушем или просмотром. Проба 4: все три — код 2. Тот же коммит без
   цепочки и с `git log --oneline -1` — код 0.
   - Материал: хук агента донора A (S21), строки 266–267: `[^\n]*?\s--\s[^\n]*?\s-(?:F|m|s|S|u)\b`. Разделители
     команд `&&`, `||`, `;`, `|` диапазон не обрывают, в отличие от правил с `[^|;&\n]*` (строки 64, 73). meth §20,
     «Самотест в обе стороны, законное первым»: страж, срывающий работу, снесут вместе с правилом. Решение В9: ложные
     отказы законных команд существенны.
   - Место в spec.md: REQ-16, строка 333 («флаг после `--` в `git commit`»). Граница команды не задана. AC-10,
     строки 726–737: нет зелёной пробы с командой после коммита. «Изменения захода 15» (строка 1177) вернули правило
     без этой границы.
   - Что сделать: в REQ-16 записать, что правило «флаг после `--`» судит только аргументы самого `git commit`, до
     первого разделителя команд (`&&`, `||`, `;`, `|`, перевод строки). В AC-10 добавить зелёные пробы
     `git commit -s -F <файл> --only -- <файл> && git push -u origin <ветка>` и `… && git status -s`. Красную
     `git commit -- <файл> -F <файл>` сохранить.
   - критичность: существенная. Меняется требование (граница правила) и сценарий AC-10 (новые зелёные пробы). По
     решению В9 это ложный отказ законной команды. Обходом хука находка не является.
   - уровень: требования

2. Правила `git stash` и «запись `git config user.*`» отклоняют законные читающие команды. Правило `git stash` у
   донора ищет слово `stash` где угодно в команде git, а не на месте подкоманды. Правило записи `user.*` считает
   записью любой непробельный знак после ключа, в том числе разделитель команд. Отказ получают:
   - поиск `git log --grep stash`;
   - поиск `git grep -n stash -- AGENTS.md`;
   - чтение авторства в цепочке `git config user.name && git config user.email`;
   - чтение с запасным путём `git config user.email || echo none`.

   Проба 4: все четыре — код 2. Одиночные `git config user.email` и `git config --get user.email` — код 0.
   Ложных отказов на упоминании донор у себя избегает только для пуша и переписывания истории: там подкоманда ищется
   на своём месте. В spec.md так же устроена лишь зелёная проба `git log --grep force` в AC-10. Для `stash` и
   `config user.*` такой пробы нет.
   - Материал: хук агента донора A (S21):
     - строки 15–17: голое чтение `git config user.name` разрешено, «иначе ложные срабатывания на штатных проверках
       авторства перед коммитом»;
     - строка 64: `user\.(name|email)\s+\S`, после ключа граница команды не учитывается;
     - строка 73: `\bgit\b[^|;&\n]*\bstash\b`, подкоманда не на своём месте;
     - строки 75–79: для пуша и rebase подкоманда ищется на своём месте, «иначе `git log --grep rebase` … получали бы
       отказ за упоминание».

     Решение В9: ложные отказы существенны. REQ-15 и Д-10 требуют сверять адрес автора, поэтому чтение `user.email`
     перед коммитом — штатное действие агента.
   - Место в spec.md: REQ-16, строки 323 («`git stash`») и 330 («запись `git config user.*`»). Что считается
     подкомандой и что записью, не сказано. AC-10, строки 733–734: зелёных проб на чтение `user.*` и на упоминание
     `stash` в аргументах нет.
   - Что сделать: в REQ-16 записать, что `git stash` ловится на месте подкоманды (после `git` и его общих флагов), а
     не по слову в аргументах. Запись `git config user.*` — значение после ключа в пределах той же команды, до
     разделителя. В AC-10 добавить зелёные пробы: `git log --grep stash`, `git grep -n stash -- <файл>`,
     `git config user.email`, `git config user.name && git config user.email`. Красные `git stash` и
     `git config user.email <значение>` сохранить.
   - критичность: существенная. Меняются требование (что судит правило) и сценарий AC-10 (новые зелёные пробы). По
     решению В9 это ложный отказ законной команды.
   - уровень: требования

3. Вырезание литералов в REQ-16 не покрывает here-string PowerShell и heredoc с ограничителем в двойных кавычках.
   Хук стоит и на инструменте `PowerShell` (REQ-16, REQ-25). Там текст сообщения или файла пишут here-string
   `@'…'@`. У донора here-string вырезается только как пара одинарных кавычек. Если в теле есть апостроф (`doesn't`,
   `it's`), пары сдвигаются, и текст после апострофа судится как команда. heredoc с ограничителем `<<"EOF"` донор
   как heredoc не узнаёт: вырезаются только кавычки вокруг `EOF`, тело остаётся. Отказ (проба 4, код 2) получают:
   - сообщение коммита через here-string PowerShell, где первая строка тела содержит `doesn't`, а вторая называет
     `git push --force`;
   - запись файла через here-string `@'…'@ | Set-Content` с `doesn't` и `git push --force` в теле;
   - `cat > m.txt <<"EOF"` с `git push --force` в теле.

   Без апострофа, с `<<'EOF'` и с `<<EOF` — код 0. Сообщение коммита этой задачи будет называть правила хука, поэтому
   случай не выдуман.
   - Материал: хук агента донора A (S21), строки 208–209: `_QUOTED` — `'[^']*'|"[^"]*"`, `_HEREDOC` — ограничитель
     `'?(\w+)'?`, без двойных кавычек. Строки 326–327: сначала heredoc, затем кавычки; here-string PowerShell
     отдельно не вырезается. meth §20, «Самотест в обе стороны, законное первым». Решение В9.
   - Место в spec.md: REQ-16, строки 337–339 («текст в одинарных и двойных кавычках и тело heredoc»). Here-string
     PowerShell не назван. Что тело heredoc вырезается при любом ограничителе, не сказано явно. AC-10, строки
     734–737: зелёные пробы только в формах bash, без апострофа в теле и без `<<"EOF"`.
   - Что сделать: в REQ-16 записать, что до кавычек вырезаются целиком тело heredoc при любом ограничителе (`EOF`,
     `'EOF'`, `"EOF"`, `<<-`) и тело here-string PowerShell `@'…'@` и `@"…"@`. Апостроф внутри тела на разбор не
     влияет. Правило по сырой команде для `@"` с записью в файл остаётся (Ф-19). В AC-10 добавить зелёные пробы:
     - here-string PowerShell с `doesn't` и `git push --force` в теле — в `git commit -m` и в `Set-Content`;
     - heredoc `<<"EOF"` с `git push --force` в теле.
   - критичность: существенная. Меняются требование (что вырезается до проверки) и сценарий AC-10. По решению В9 это
     ложный отказ законной команды.
   - уровень: требования

## Пробы

Временную папку вне репозитория обозначаю `<tmp>`, хук агента донора A — «хук донора A» (S21 описи). Пути машины и
запрещённые имена сюда не перенесены.

- Проба 1. Машинные форматы и закрытие находки захода 16. Скрипт `<tmp>/fmt.py` разбирает строки spec.md до
  «Изменений захода 1». Положительный контроль — строка `исполняемую часть` нашлась. Отрицательный контроль —
  выдуманная `xyzzy-none` не нашлась. Вывод:

  ```text
  lines 1200 first 'Статус: черновик' ['итого: 31']
  REQ 37 []
  AC 30 []
  DNC 6 []
  nt 7 ['M-02', 'M-03', 'M-06', 'M-12', 'R-08', 'R-18', 'G-24']
  'заходы 1–16' [3]
  'исполняемую часть' [337]
  'heredoc' [241, 338, 735, 736]
  'here-string' [335, 610]
  "@'" []
  '<<"' []
  '&&' []
  'status -s' []
  'push -u' []
  '--grep stash' []
  'user.name &&' []
  'xyzzy-none' []
  ```

  Итог: формат строк верен, находка захода 16 закрыта. Пустые выдачи по `&&`, `push -u`, `status -s` относятся к
  находке 1, по `--grep stash` и `user.name &&` — к находке 2, по `@'` и `<<"` — к находке 3.

- Проба 2. Публичность. Скрипт `<tmp>/scan.sh` — `grep -c -i -F -f` по 22 образцам. Что в образцах:
  - имя приватного репозитория A и имена рабочих деревьев из его кода;
  - имя второго проекта и названия его каталогов;
  - корень исходников машины в трёх написаниях;
  - домашние каталоги Windows, Linux и macOS, каталог временных файлов;
  - имя пользователя машины и его короткая форма;
  - адрес почты владельца;
  - имя другого локального проекта.

  Вывод:

  ```text
  spec.md                  0
  message.md               0
  guards-survey.md         0
  log.md                   0
  progress.log             0
  profile.log              0
  spec-review-16.md        0
  ctrlA.txt                3
  ```

  Положительный контроль: 3 совпадения в первых 130 строках хука донора A, значит, поиск работает. Этот файл,
  progress.log и profile.log после записи проверены тем же поиском, совпадений 0.

- Проба 3. Код и защита ветки, только чтение:

  ```text
  $ git rev-parse --short HEAD
  ce6e833
  $ git ls-files | wc -l
  108
  $ git ls-files scripts .github .claude | wc -l
  0
  $ git ls-files 'opencode-plugin/test/*.test.mjs' | wc -l
  37
  $ gh api repos/unitcraft/crew-harness/branches/main --jq '{protected: .protected}'
  {"protected":false}
  $ gh api repos/unitcraft/crew-harness/rulesets --jq 'length'
  0
  $ git status --short | wc -l
  18
  ```

  Числа совпадают с Ф-01, Ф-02 и current_state. Защиты `main` и наборов правил нет, как в заходе 16. REQ-17 описывает
  защиту как будущую настройку скрипта (О-04). Настройки не менялись.

- Проба 4. Хук донора A в наборе правил REQ-16. Копия хука лежит в `<tmp>`. Скрипт `<tmp>/mk.py` убирает из копии
  правила, которые REQ-16 не берёт: `rebase`, `pull --rebase` и «без `-C`» (Д-05). Скрипты `<tmp>/p17.py`,
  `p17b.py`, `p17c.py` подают на вход JSON вызова инструмента. Многострочные команды показаны с `\n`. Вывод `p17.py`
  — код и команда; `p17b.py` и `p17c.py` — код, начало причины и команда:

  ```text
  $ python mk.py && python p17.py hook_spec.py
  exit 0 :: git config user.email
  exit 0 :: git config --get user.email
  exit 2 :: git config user.name && git config user.email
  exit 2 :: git config user.email || echo none
  exit 2 :: git config user.email x@example.org
  exit 2 :: git log --grep stash
  exit 2 :: git grep -n stash -- AGENTS.md
  exit 2 :: git stash
  exit 0 :: git commit -s -m @' \n Add guards for the repository. \n '@ --only -- a.txt
  exit 0 :: git commit -s -m @' \n Document the hook: it refuses git add -A and git stash. \n It does not run anything. \n '@ --only -- a.txt
  exit 0 :: git commit -s -m @' \n Document the hook: it refuses git add -A and git stash. \n It doesn't run anything. \n '@ --only -- a.txt
  exit 2 :: @' \n The hook doesn't allow git push --force. \n '@ | Set-Content -Encoding utf8 m.txt
  exit 0 :: cat > m.txt <<'EOF' \n never git push --force \n EOF
  exit 2 :: cat > m.txt <<"EOF" \n never git push --force \n EOF
  exit 0 :: git commit -s -F m.txt --only -- a.txt
  exit 2 :: git commit -s -F m.txt a.txt
  exit 0 :: git rebase main
  exit 0 :: git log --oneline -3
  $ python p17b.py hook_spec.py
  exit 2 git push --force/-f/+ref :: PowerShell :: git commit -s -m @' \n Add guards. It doesn't change the plugin. \n The agent hook refuses git push --force. \n '@ --only -- a.txt
  exit 0  :: PowerShell :: git commit -s -m @' \n Add guards. It does not change the plugin. \n The agent hook refuses git push --force. \n '@ --only -- a.txt
  exit 2 git push --force/-f/+ref :: PowerShell :: @' \n The hook doesn't allow git push --force. \n '@ | Set-Content -Encoding utf8 m.txt
  exit 0  :: Bash :: cat > m.txt <<'EOF' \n It doesn't allow git push --force. \n EOF
  exit 2 git push --force/-f/+ref :: Bash :: cat > m.txt <<"EOF" \n never git push --force \n EOF
  exit 0  :: Bash :: cat > m.txt <<EOF \n never git push --force \n EOF
  exit 2 git push --force/-f/+ref :: Bash :: git push --force
  $ python p17c.py hook_spec.py
  exit 0  :: git commit -s -F m.txt --only -- a.txt
  exit 2 flag posle '--' v git :: git commit -s -F m.txt --only -- a.txt && git push -u origin 002-guards
  exit 2 flag posle '--' v git :: git commit -s -F m.txt --only -- a.txt && git status -s
  exit 2 flag posle '--' v git :: git commit -s -F m.txt --only -- a.txt; git log -1 -m
  exit 0  :: git commit -s -F m.txt --only -- a.txt && git log --oneline -1
  exit 2 flag posle '--' v git :: git commit -s -F m.txt --only -- a.txt -s
  ```

  Положительные контроли: `git stash`, `git config user.email x@example.org`, `git push --force` и
  `… -- a.txt -s` — красные, правила работают. `git rebase main` — зелёный, значит, правила, которые REQ-16 не берёт,
  из копии действительно убраны. Отказы на законных командах — к находкам 1–3. В here-string с апострофом
  в последней строке тела отказа нет: после апострофа правило не упомянуто. Отказ `git commit -s -F m.txt a.txt`
  (перечень без `--only` и ` -- `) находкой не считаю: форму области задают REQ-16 и AC-23 (п.4 `AGENTS.md` по О-07).

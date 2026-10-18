# Шесть собственных проб сводной

Команды запускаются из корня подготовленного дерева: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s2-partition-1/summary/check.py <mode> [locator...]`. Locator передаётся аргументом, публичный путь машины не сохраняется. Все команды лёгкие, синхронные, exit0. Это не общий validator/runtime/semanticPASS.

## П1 — identity / counts / происхождение (линзаА)

Mode `identity`; проверены7subjects×2hash againstprogram и2reportSHA. Дословные итоговые строки:

```text
methodology 0c8e819380ed888c355fd37d40facd758566b8bad21a752e24f2b683e7d8d81f
contract a2eecd72c7544eae3177d48629d5ca7aea9105d604b7b6e389246598facd9d9c
COUNTS 6 8 4 SOURCES 38
HEAD 492c166fbd12e00a6a924efab065f6adb4bd91f6
```

Предшествующие7строк выводят basename, exactSHA из таблицыspec-review-2 и `IDENTICAL` укаждого. Числа пересчитаны из собственночитанногоspec; не coveragePASS. Все7сравнений повторены перед сдачей.

## П2 — old/current delta и байтоваяобласть (линзаА)

Mode `delta <methodology-clone>` плюс `anchors <clone> f333efa task-sessions.md 66`, сравнениеcurrent66 и самостоятельные diff9d391ba→currentOQ/ab2→currentR. Полныйsessionsdiff12hunksпрочитан; точныйold66 не имеетцели, current66добавляет. Дословнаястрока:

```text
ALGORITHM raw ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96 CRLF 8a0004dbfd8b6d8f9889abeb8ee02f3bf87ea9af6309ca2a21b8cfdca9eead8d old_equal True
```

Контрольобластей: rawGit иLF→CRLFразныеSHA приоднойсемантике. Rawравенold/current, algorithmнеchangedpath. OQ5процедуранеизмениласьотпринятого9d391ba; Rжурналab2ужеcurrent, diffсодержиттолькопрофиль232–233. Это подтверждаетМ3, но неновыйalgorithm/runtime.

## П3 — полныйjoin обязательств/источников (линзаА)

Mode `coverage <clone>` извлёквсеhunks16changedpaths, не тольконазваниятем. Точныйперечень: AGENTS.md,README.md,completeness-check.md,doc/open-questions.md,methodology.md,presentations/methodology.html,presentations/task-sessions.html,starter-kit/README.md,starter-kit/scripts/guards/guards.conf,starter-kit/scripts/guards/selftest/test-commit-msg.py,test-commit-range.py,test-guard-commit-message.py,test-pre-push.py,starter-kit/verify-portability.sh,task-runner.md,task-sessions.md. Последние3testbasenames относятсяктомужекаталогуselftest.

Получены все10hunksM,15R,12S; каждыйсмыслсопоставлен `coverage.md` сMdelta и26Cмаршрутами. Это проверкапоусловиям, не одновычисленноечисло. Дословныйсчёт:

```text
ATOMS 16 83 [1, 5, 6, 4, 8, 6, 5, 7, 5, 6, 10, 3, 3, 4, 7, 3] MATRIX 26
AUTHOR trace rows 9
```

Конкретныеположительныеконтроли: REQ05реальноговнесения,AC08триоси,В01вариантА. Отрицательные: task25profile/submit и37models/queue нетразличимогоconstraintмаршрута,В03невыбираетпуть;стараяколонкаS66неверна. Все6REQ/8AC/4DNCи4вопросапрочитаны, не замененыregex.

## П4 — отрицательныепары/closedlimits (линзаБ)

Mode `pairs`, собственные5арифметическихконтролей +3single-mutation:

```text
shared startN 2 k 2 finalN 2 old_final_equality True current_start_condition True
lowN startN 2 k 1 finalN 2 old_final_equality False current_start_condition False
isolated-overstated startN 2 k 1 finalN 2 old_final_equality False current_start_condition True
author-finalN startN 2 k 1 finalN 1 old_final_equality True current_start_condition True
lowered-no-reason startN 2 k 1 finalN 1 old_final_equality True current_start_condition False
control lens_meeting_limit True profile_exact4 True
agent-lens lens_meeting_limit False profile_exact4 True
extra-family lens_meeting_limit True profile_exact4 False
CONTROLS 5 arithmetic + 3 single-mutation; not full validator/runtime
```

УсловиявзятыизсобственночитанныхR91и03152/69, но кодпроверяеттолькоизолированныеусловия, неfullgrammar. Истинностьпричиныoverstatedнуждаетсявартефакте. Отдельныйнормативныйосмотр **3readyвариантов**: обычное `готово` допустимообоим; `готово:` currentR88допускает, approved259/309/540отвергает; `1/2 готово` безпричинынезавершение. Центральныйsemanticconflictневыведенизарифметики. M1проверенконкретнымчестнымпорядкомCanon-first/format-later иконтролемcurrent-first (`stitches.md`).

## П5 — внешняяграница/plugin (линзаА/контрольложногоPASS)

Mode `boundaryfacts <013-tree>`. Дословныепервый/последнийрезультаты:

```text
013 src False runner False tracked-src []
PROPOSED format exists False current061 False
```

Междуними7PLUGINстрок: journal.ts,task-folders.ts,tasks.ts,core.ts,index.ts,README.md,progress.ts — укаждого `raw_equal True`, exactSHAсовпадаютс `contract/fingerprints.md:53–59`. Своднаясама сравнилаbytesraw492c166, не использоваласьживаякопия.

Точныйсодержательныйосмотр045: review4полностью42строки, spec65–80/125–203,plan74–94/126–188,log56–59; все9DNC,16kindsиобаDNC08источникаразличены. 013spec1–23/457–512,message40–74,log33–42. Конкретныеконтроли: plan131–135commandsесть,136/161неper-recordпротокол; srcнетнеозначаетcompatible; registrybindingбезsignatureнеsemanticPASS. Остаткиуказанывboundaries,безисполненияfuturechecks.

## П6 — сохранность и пределраннегоfingerprint (процесс/линзаА)

Modes `before`, `baselines`, `external-before <clone> <045-folder> <013-tree>`, затем `after`, `external-after` с темижеаргументами. Своднаяполностьюраспарсилаbaselineобеихчастей;не запускалаcheck.pyС2мвновомдеревесизменённыможиданием.

```text
BEFORE protected 167 manifest 12617b5fb75a5c7d69721986a6ae5208b2f72b3cacdf7545e3fdbdffbd8f57e9
BEFORE protected 295 manifest e32c6b340536f7f71bc4320bdc217bdb6b770cc99332bf3f67ea0b2d30aa9521
M baseline dict 272 C baseline list 116
HISTORICAL count 10
M baseline differences in synthesis copy ['doc/tasks/061-kanon-i-aktualnaya-metodika/log.md']
CONTRACT boundary records 109 differences []
EXTERNAL 126 manifest 04991a1936dac7749d694acd7df7e2ecd14e864f8d1f1ee54331e0b8641f041e
```

Все10`HISTORICAL`строкпоказалиTrue. Точныйперечень: s1p-1/profile.log,progress.log; s1p-2/profile.log,progress.log,usage.log; s1p-3/inputs-at-submit/profile.log,progress.log,usage.log; s2-sol/inputs/profile.log,progress.log. SHAкаждогосохранёнвMbaselineиownbefore-expanded,онисовпадают. Этофактическаяцепочкасохранности, **не** раннийсобственныйhashС2кинеотменаК2. ЕдинственноеMbaselineрасхождениеlog061объясняетсядобавленнымиинтеграторомпоследующимизапусками/сводками,baselineнепереписан.

Полнаясобственнаядо/послевыборка/результат — fingerprints.md, before-expanded.json/after.json,external-before.json/external-after.json. Исключенияточнопокорню, неbasenameвложенныхsnapshots. Свои6пробне10чужихпроб, неPASSформатаилипродукта.

Фактический конечный stdout: `AFTER protected 295 changed 0 []`; `CONTRACT boundary records 109 differences []`; `EXTERNAL changes []`. Manifest126 до/после одинаков. Дополнительный лёгкий контроль выходных файлов (не седьмая предметная проба): `HYGIENE markdown 9 bad [] python AST OK`; `git diff --check` — exit0 без вывода.

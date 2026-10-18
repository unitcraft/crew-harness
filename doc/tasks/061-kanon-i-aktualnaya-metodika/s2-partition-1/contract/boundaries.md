# Границы045/013 и реализации — собственные свидетельства

## 045: два разных открытых блокера

Источник: read-only author tree задачи045; spec1–203 целиком SHA685245b64f33424e225e340898399b49084f39b20f66469b58637fe96cc05ed8, plan1–188 целиком SHA150c9826fc1be49a63cbd8754491c88063c9eca02d145519040d1da51c6711e4, plan-review-4:1–42 целиком. Утверждена толькоspec; планчерновик. Даты/approval провереныlog27–38/49–59, в частности56 остановкауворот,57–59 новаязависимость061 безразрешенияреализации.

1. **Проверяемость ручногоreview иDNC**: plan-review4:14–16 соответствует реальнымplan136–137/154–162. Названныеsemantic-review.md/013-readonly-comparison.md и имяreviewer не определяют запись на каждыйanchor икаждыйDNC. В061 analysis46 правильно требует источник/указатель,проверку,target-or-reason,evidence/команду,reviewerPASS/NOTVERIFIEDспричиной; AC03spec48 прямо требует checklist/test сinputs/record/outcomes. Это маршрут исправления **плана045**, не уже закрытаянаходка. Независимаякарта границдолжна перечислить всех9DNC: gatesbeforeartifacts;immutableinputs/Canon/config/main;no runtime/reusablevalidator/live/git/restart/delete;013readonly/noorders;no falsecompatibility;no inventedregistry;destination/tools;no newchildtask;privacy/liveclaims. Укаждой нужны конкретныевходыдо/после,осмотренныепути/записи,expected/explanation,evidence ивывод.

   ОтдельныйDNC08: нужны **оба** свидетельства — историясоздания/сессий/задач и сравнениечисла/имёнпапок. Отсутствие новойпапки не доказывает отсутствиеновойplugin-задачи; logбезсоздания не доказывает отсутствиепапки. Автор061 analysis46 называетобечасти, не подменяет ихCanon.

2. **В-05 authority/signatures**: plan74–90/170–174, spec69–79/109–115 требуют16kinds, signatures иsource длякаждогоID. Нужны predicate args/result/outcomes;unit numerator/denominator;route-trigger gate-decision→outcome;event/action/effect payload иboundary/confirmation/result;profile-stage/value;gate/outcome;document-status/grammar;scenario;role;prompt source/hash/substitutions;context schema/domain/availability;длявсегоversion/digest/provenance. НормативныеworkflowIDs/закрытыеschemaenums из031/методики извлекаются какнормативныеданные, но не подтверждают executoroperation иневыбираютownerконтракта. В031UNKNOWN07/ОТВ04 отсутствующийauthoritativeкомплект прямооставленнеизвестным. 013draft этого неустраняет. В061analysis47/REQ04/AC03 эторазделениеверно; В03 овыбореисточникаещёнеответ, его вопросныйпакетквалифицируетС2мМ2.

Положительныйконтроль: plan131–135 задаётконкретныебудущиеcommands+expected дляparse/structure/registry. Отрицательныйконтроль: plan136/161 позволяетпредъявитьназванныйфайл/общуюисторию безperrecordответов; потомуэто отдельныйнеустранённыйblocker. Не запускались отсутствующиеfutureverification scripts ине повторялсязакрытыйAC03inventoryтестдля045.

## Единственное место, approvedinput и указатели

- ОТВ01:spec191/log27 выбирает комплектрядом сreader, нетвторойкопиив045; plan13/90/185 фиксируетsrc/runner_core/regulation/. Неутверждённостьплана не делаетэтовыборомновогоownerapprovalвсегоплана.
- В061format.md/4раздела — новоеавторскоепредложениекВ02, не существующийфайл/неapproved045plan. Оно сохраняетдиректориюкомплекта. process185 пока называетopencode-plugin; spec06176/86 требуетадресноесогласованиеиADR, молчаливогоoverrideнет.
- Historical031 всегдаinput,неtarget; REQ/AC/trace запрещено переписыватьпослеворот. current061 и045 толькоpointers. Полнаязадачаобязана реальнообновитьCanon, но собственныйпунктназначенияcurrentприfirstCanontransferостаётсястыкомС2мМ1; здесьневыдаётсяPASS.
- Старуюзапись#22 непереоткрывал/недублировал/несдавал. Задачи/потолки/историю045неменял.

## 013: intent неconsumerAPI

Читается еёотдельноедерево,HEAD7f2b0f6ea2f9ad55258a17eb614ed03b627ce596, а не031snapshot. Source hashes baseline:specf86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376; taskmessage88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9; log434e218c66362a3bccaeb5cecd3f621e4c6817dda4115be80d169cbc19c0f263. Status содержит прежниеmodifiedlog/taskmessage иuntrackedreviews/spec/profile/progress, не наши изменения.

- Spec:1 — черновик; :16–22 полнаязадача минимальныйконтракт→библиотека. Message46–49/log16 прямо фиксируютслово2026-10-09 «Контракт внутри013», не новыйdelta061. Оно ужеестьвapproved031FACT03/REQ32/UNKNOWN08, поэтомуfreshchange безpre/postнедоказуем.
- Spec251–268: step чистыйдетерминированный,оболочкаисполняетнамерения; :376–402 mutable state/идемпотентность/externalexactlyonce отдельно; :438–451 prompt/machine-tail/JSONfixtures intent; :457–512 контрактещёразрабатывается,14предметов,примитивыиодинуровеньoverrides,version/hash,отдельноеownerapprovalДОкода; :697–712 будущиеAC/матрица. Это **не** готовыйversionedregistry/whitelistполныхsignatures031/045.
- Proposeddoc/canon/runner-regulation.md иv1:spec469–475/499–510/953–955 неapprovedAPI,путьневладелеццитата. 013невыбралазаднимчисломформат031expected.steps.
- Log42: «реализация пока не надо делать…», specнеутверждена,контракт/план/код/JSONсценариинесозданы. Нетsrc иsrc/runner_core, gitls-files--srcпустой; кореньосмотрен: .claude,.git,.gitattributes,.github,.gitignore,.opencode,AGENTS.md,CLAUDE.md,doc,LICENSE,LICENSE-APACHE,LICENSE-MIT,opencode-plugin,README.md,scripts. Нельзяизэтоговывести совместимостьилиотсутствиелюбогокодаплагина; этоотсутствиебудущегокаталогакода013.

## Плагин: только база492c166

Оригиналысвоегодерева побайтноравныGitобъектам492c166fbd12e00a6a924efab065f6adb4bd91f6; hashesвfingerprints. Живаякопиянечиталась, другиеversion/localданныенесмешаны.

- journal:1–449,539–626: buildProgress/sessionState/progressLine/logLine,appendFileSync,проверкиформы/истории,rolecheckизindex1865–1875. Дописатьстрокунеозначаетсделатьединицу; overstatedтребуетартефактдляправдивости,непроверяемыйэтойфункцией.
- task-folders1–146: nextLaunchсканируетTask.sessions.launch ижурналыкопий; writeLaunch сначалаlogпотомprogress,непишетmain. Нетoffset/processgroup/starttime вTaskSession:tasks43–62. Это неstate.launches[] runtime.
- tasks222–245: saveTaskвременныйфайл→rename,retryWindows; этоатомарноепересохранениеpluginTaskrecord,неполныйrunnerstatecontract. Core1977–2004 +2134–2138 создаётTaskSession,taskEvent иhost.startTask; index1547–1559 пишетlaunchдостарта. Отдельныйlauncher/idempotentSDKsession неисполнениевсегографаrun_task.
- core358–418/1454–1483,index1796–1810 иREADME322–396/454–481 подтверждаютownerLanguage/answerMode/ручнуюграницу/submitvsdeliver. Онинепроверяютполныйsecondopinion/сходимостьи не даютвнешниесигнатуры.
- СобственнаяpureNodeпробазапустила **только** buildProgress/sessionState/keywordOf настрокахвпамяти,безprogressLine/файлов/сессий/OpenCodeSDK. LowNпонижениеfinalNотвергнуто,startNсохранён; overstated1/2 допускается; surprise-stopотвергнут; gate-stopдопущен; готово: читаетсяkeyword,Готово/готовностьнет. Этоузкоеruntimeevidenceсуществующегожурнала,неPASS013/031validator.

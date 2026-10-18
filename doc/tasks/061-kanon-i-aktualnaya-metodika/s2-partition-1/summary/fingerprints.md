# Собственные fingerprints и сохранность

SHA-256 считается от raw bytes Python, Git inputs получены `subprocess.check_output`, без текстового pipeline. HEAD до/после `492c166fbd12e00a6a924efab065f6adb4bd91f6`, подготовленная ветка review/061-topic-synthesis. Remote latest сейчас не проверялся: pin фиксирован для аудита, будущий driftcontrol отдельный AC.

Семь subjectSHA и оба reportSHA самостоятельно совпали с program/inputs/переданным происхождением, полный перечень в spec-review-2. Повтор identity после создания сводного отчёта снова дал7IDENTICAL, counts6/8/4/38 и теже2reportSHA. Это не hashсамойновойпроверки вместо hashsubject.

## Собственная граница до/после

| Выборка | Момент / область | Итог |
|---|---|---|
| before.json167 | После первоначального чтения, до первой записи отчётов:061/Canon/AGENTS/config/pluginrootTS | Сохранён исходныйmanifest, не перезаписан |
| before-expanded.json295 | Доcoverage/report: весьplugin/.opencode/Canon/AGENTS/061 | after.json295: изменённых0 |
| external-before.json126 | До собственного чтения внешних045/013:109files+6HEAD/status+11immutableGitinputs | external-after126:изменённых0,тотжеманифест |

Публичные относительные имена/rawSHA каждого файла в JSON. СобственноеevidenceSUMMARY исключено целиком, поскольку это NEWвыход; `spec-review-2.md` и только корневые061progress/profile/usage исключены отдельно. Вложенные snapshots, их progress/profile/usage, log061, subject/inputs/program/оба отчёта/evidence включены. Никаких исключений «любое имяprogress.log» нет. Beforeпосле чтения не названbeforeпервогоинструмента; дофиксации менялисьтолькоNEWcheck.pyиразрешённыйprogress.

ManifestSHA — SHA256 от `json.dumps(records,sort_keys=True).encode()`:

```text
before167 12617b5fb75a5c7d69721986a6ae5208b2f72b3cacdf7545e3fdbdffbd8f57e9
before-expanded295 e32c6b340536f7f71bc4320bdc217bdb6b770cc99332bf3f67ea0b2d30aa9521
external-before=after126 04991a1936dac7749d694acd7df7e2ecd14e864f8d1f1ee54331e0b8641f041e
AFTER protected 295 changed 0 []
CONTRACT boundary records 109 differences []
EXTERNAL changes []
```

109boundaryrecords —101045+8013, побайтно равны раннемуCbaseline, который не подменён. MethodologyHEADa449bd2/statusпустой;045HEADb18cc5052b6183d9c15fc1833006f1cb86481a3c/statusuntrackedtaskfolder;013HEAD7f2b0f6ea2f9ad55258a17eb614ed03b627ce596/statusпрежниеmodifiedlog/messageиuntrackedtaskdocs. Эти сведения не объявлены новыми изменениями от061.

ImmutableGitSHA11inputs полностьюперечисленыexternalJSON:7методическихfiles+approved031spec/trace/log/message. Вчастности approvedspec `a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829`; algorithmraw `ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96`, неCRLFhash. Рабочиеbytes7pluginfilesравныraw492c166:7/7. refsне менялись.

## Историческая цепочка и ограничения частей

Сводная сверилакаждыйиз10вложенныхжурналов, пропущенныхраннимC100, сM272baseline:10/10равны. ExactпереченьвprobesП6; исходныеSHAнепереписаны. Во всейMbaselineтолькоlog061отличаетсявновойкопии:этоожидаемыепоследующиеappendинтегратора, не изменениеprotectedсводнойсессией. Не запускаетсячужойcheck.pyсновымexpectedрадиPASS. ПозднийC110нераннийCfingerprint; К2сохранена. HashнеаттестуетtimelycompletionМ4.

Лёгкий `git diff --check` завершилсяexit0безвывода; untrackedNEWMarkdown дополнительно осмотрены собственнойhygieneпробой (BOM/trailing/узкийmachinepathregex). Это не полныйprivacyguard и не егоPASS. Guards/fulltests/heavyкоманды не запускались, пушнепредусмотрен. Субъекты/защищённыеисточники/историясводнойнеисправлялись.

Дословный контроль NEWвыхода: `HYGIENE markdown 9 bad [] python AST OK`.
SHA-256 нового `spec-review-2.md`: `b26425287cb0add502c3c39dd2c50890b9aef4043998cf3df2ac6a23f32574c6`.

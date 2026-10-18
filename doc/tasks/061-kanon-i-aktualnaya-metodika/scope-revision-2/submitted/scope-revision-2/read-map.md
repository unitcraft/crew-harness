# Собственное чтение С1п-7

Это чтение автора, не независимая приёмка. Номера — строки `read`, включая пустые.

| Источник | Фактически прочитано | Усечение |
|---|---|---|
| author-setup/owner-input.md | 1–15 полностью | нет |
| doc/canon/README.md | 1–41 полностью, до остального предметного чтения | нет |
| AGENTS.md | 1–116 полностью | нет |
| doc/canon/process.md | 1–248 полностью | нет |
| doc/canon/decisions/README.md | 1–68 полностью | нет |
| .opencode/crew-harness.json | 1–94 полностью | нет |
| task/message.md | 1–41 полностью | нет |
| owner-gate-decisions.md | 1–65 полностью | нет |
| spec.md до правки | 1–136 полностью | нет |
| analysis.md до правки | 1–69 полностью | нет |
| spec-trace.md до правки | 1–649 полностью | нет |
| method-delta.md до правки | 1–449 полностью | нет |
| scope-revision-1/before/spec-trace.md | 1–645 полностью | нет |
| scope-revision-1/before/method-delta.md | 1–445 полностью | нет |
| spec-review-6.md | 1–78 полностью | нет |
| s2-6/integrator-qualification.md | 1–26 полностью | нет |

`before/git-state.json` прочитан для HEAD/ветки; огромная строка status в выводе read усечена на 2000 символах. Raw status сохранён целиком машиной; он не заявлен как прочитанная история. Снимок `before/manifest.json` охватывает 1105 файлов, включая hidden, существующие untracked и файл `.git` (только bytes/hash, без payload). Исключены только новые outputs этой сессии и три точных root-журнала. Четыре изменяемых документа включены и сохранены raw. Начальная собственная команда: `python doc/tasks/061-kanon-i-aktualnaya-metodika/scope-revision-2/snapshot.py before`; exit 0, `files=1105, allowed_in_before=true`.

HEAD `492c166fbd12e00a6a924efab065f6adb4bd91f6`, ветка `spec/061-canon-fixes-r2`. Существовавшие изменения open-questions/log и многочисленные untracked — вход, не работа автора.

Первичные Git-чтения и дополнительные ссылки перечисляются ниже по мере выполнения. Исторические 013/031/045 не перечитываются: это снятое исследование, а не пропущенная часть активной нормы.

## Дополнено после первичных Git-чтений

Точные фактические ranges/bytes/SHA каждого Gitshow — `git-read-events.jsonl`; сводка и пределы — `source-addendum.md`, пункты3–7. Shell preview не принимается за полный read: managed выводы S (487 wrapped-строк) дочитаны1–260/261–487; R1–277 (421) —1–230/231–421; R278–723 (554) —1–270/271–554. Algorithm (448) —1–230/231–355 и shell356–448. C P(201) —read1–201; C M700–722(89) —read1–50+shell49–89; M653–740(158) —read1–112+shell111–158. O P1135–1190(168) —read1–134+shell134–168. M1–160(185) —read1–135+shell129–185; M1480–1580(182) —read1–140+shell139–182. Q current(167) —read1–120+shell119–167; Q old(110) —read1–50+shell47–110. Diff F01/02/06–14(207) —read1–75+shell73–207; M/S/R diff (70/77/112) —read целиком, длинные строки M дополнительно wrapped. Journal260–360(131) —read1–47+shell47–131. Остальные короткие Gitshow/ADR получены целиком без усечения. Ничего из чужого read-map не засчитано как собственное чтение.

Первый raw status усечён только в отображении одной огромной строки; его полнота как машинного before не зависит от ручного чтения имён каждой прежней сессии. Payload .git не читается/не публикуется; hash+bytes включены в manifest.

Финальные полные diff четырёх документов прочитаны собственно: spec.md.diff1–177 и178–179; analysis.md.diff1–99; spec-trace.md.diff1–400/401–770; method-delta.md.diff1–235. Текстовый diff полон, raw изменения/числастрок/CRLF отдельно вdocument-fingerprints.json. Новыеmethod/traceтаблицы повторно осмотрены целиком в diff; архивные удалённыеблоки не перепутаны с действующим контрактом.

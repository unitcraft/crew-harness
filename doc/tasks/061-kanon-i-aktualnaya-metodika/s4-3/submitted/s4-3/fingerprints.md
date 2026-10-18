# Собственная аттестация сохранности

`before.json` снят первым shellпослеstart, до чтения первичных файлов и проб.
Команда Python: Path('.').rglob('*') / is_file(), read_bytes→len/SHA256 для каждого;
затем эксклюзивно создан s4-3 и записан rawbefore. Никаких payload.gitне сохранено.
Результат:685файлов; .git66bytes/SHA9460bcb4206aeb491cb0017ec6f3711a3e21ee05bd546a13f0f95386b4d35399.
before-git.json содержит собственные HEAD/ветку/полныйstatus. Никаких ожиданий692
иличужого1256 не использовал для подгонкисвоегоnameset.

После предметных проб check_readonly_v2.py сравнил всёдерево с before:
- before685 → after685, защищённых682; отличий0, добавленийвневыходов0, удалений0;
- разрешены только новые plan-review-3.md/s4-3/** и префиксно-проверенные три
  точныхrootprogress/profile/usage. Все триprefixhashсовпали;
- HEAD492c166 и review/061-plan-r3 неизменны, statusбезсобственныхновыхвыходов
  совпал сисходным; изменённыйopen-questions/logбылидо нас и не тронуты;
- preflight684проверен, отличиеcounts — только сам preflight.json, который
  не может содержать собственныйhash. Все684prefixes/hashesсовпадают; различие
  полногоprogresshashвinput-audit объяснено нашимиappend, не потерейистории;
- submitted38: каждыйrawhashсовпадаетсmanifest иprimary; approved4root/frozen
  совпадают с approvedmanifest. Plan404/41036/SHA362d4958… сохранён;
- авторский before1256 и after1256 внутреннесогласованы: namesetодинаков,
  меняетсятолькоплан; beforeplanравенold-plan62906bytes, afterplanравенновому,
  specвобоиходинаков. Это проверкадоказательств автора, не присвоениеегоbefore
  и не повторныйаудитвсех1256файловегоотдельногоавторскогодерева.

Rawmachineданные: before.json, before-git.json, after.json, after-git.json,
input-audit.json, readonly-results.json, readonly.stdout.txt. Gitdatabaseза
.gitфайломнеобследована. Внешниеисточникичиталисьimmutableblobs, нерабочиефайлы;
длянихимеютсяsource-reads.jsonlиprecondition-check.json, не ложныйwholeexternalPASS.

Собственная ошибка первого контроля (`check_readonly.py`, exit1) сохранена:
readonly-first-error.txt; before/expectedнеперегенерировались. Исправленный
скрипт подновымименем только нормализуетлокаторы, повтор exit0; это не findingплана.

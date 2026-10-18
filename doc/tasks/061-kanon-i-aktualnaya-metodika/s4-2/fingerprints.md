# Сохранность и границы измерения

## Собственный ранний снимок

`before.json` создан до предметных записей в новой s4-2, после единственной собственной start. Включены все618ранних существующих файлов дерева, включая hidden, вложенные журналы/историю, Canon/code/config, plan/frozen/approvedinputs, самsetup и `.git` как **файл**. Не обходилась внутренняя Gitdatabase. Исключены только новая s4-2, будущий plan-review-2 и три точных корневых журнала061 progress/profile/usage. Другие вложенные журналы не исключались.

Собственный HEADдо/после: `492c166fbd12e00a6a924efab065f6adb4bd91f6`; ветка `review/061-plan-r2`. Hashиразмер`.git` сохранены без payload. Описание назначения72байта оказалось неточным: собственныйbefore и preflightдают66байт, см.qualification. Никакой ретроисправленный before не создан.

## Версии

`version-check.json`: plan116строк/39374байта/SHA`2b8bd91ae59453104b2c09f02b218261628a86848291ea2b88845e81e0157f9b`, root=frozen. Шесть аналитических частейroot=frozen. CurrentapprovedspecSHA`359819ee6b75d789b94853ac7054742c1c675597e6aee3d05f36ad43abd11c0b`; frozenrawдоотметки`231f86a46022d5e592a2d9b001e8ee00e4ffb180094701f82c79dee88dcc4570`. Отличаются лишь служебные1/127, не REQ/AC/DNC.

`git-object-fingerprints.json` — 25rawGitblobизмерений внешних immutable версий и approved031. BytepipelinePythonнеперекодируетblobs. Этиhashesневыдаютчтение/полноту.

## Внешний before/after

`external-before.json` снят до внешнего чтения. Точныйscope: существующие файлы трёх названных checkout, кроме `.git` **каталогов** и node_modulesкаталогов; `.git`файлы включены. Это не заявление о чтении всего корпуса и не весь внутреннийGitdatabase. Чужие исходные dirty/untrackedстатусы не присвоены автору.

Выполнено: `python doc/tasks/061-kanon-i-aktualnaya-metodika/s4-2/check_preservation.py <method-root> <045-root> <013-root>`; locatorтолькоCLI, вscriptего нет. Expected: для каждого раннего файла тотжеpath/bytes/hash, HEADнеизменён, внешниеstatusтеже; новыхнеразрешённыхфайлов0.

Фактическийstdout, exit0, stderrпуст:
```text
own files 618 changed [] missing [] HEAD equal True status equal see scoped output
method files 78 changed [] missing [] HEAD equal True status equal True
045 files 615 changed [] missing [] HEAD equal True status equal True
013 files 355 changed [] missing [] HEAD equal True status equal True
.git file bytes 66
unexpected new files []
```

`after.json` содержит собственныйstatus целиком (только исходныепути и разрешённыеновыеproof/журналы), branch/HEAD и точныеспискиизменений. Plan/frozen/spec/maps/Canon/code/config/история/внешниепути совпали сраннимbefore. Никакогоавтоматическогооткатаилиочисткинебыло. Будущиеappend-onlyprofile/usageисключенысначала, необходятсяновымисключением.

# Отпечатки входов до/после независимой С2

SHA-256 рассчитаны Python `hashlib.sha256(path.read_bytes()).hexdigest()`, без текстового декодирования/перекодирования. Git-объект 031 читался `subprocess.check_output(['git','show','4b48c50:<path>'])` как bytes. Все команды read-only; Git refs/индекс/источники не менялись.

## Семь неизменных inputs

Первый замер выполнен после старта и первичного чтения README/message/spec/analysis, до предметного сравнения методики/031; входы до него не правились. Повторный — после создания отчёта, read-map/probes/qualification. Обе колонки равны приведённому hash; stdout повторного замера для всех семи — `UNCHANGED`.

| Файл относительно inputs/ | До = после |
|---|---|
| spec.md | f69daa1e55ed0283887ec05d35aa3f3c509d21abed78ad10dfc64167c20f756a |
| analysis.md | 6b688b9676f134f789f05065de466ee8998803e46a8725e0242e78ca2d120132 |
| 031-impact.md | f023b0905ecbc45f81251235430cac32d47114157d2ebb7729d7900354a702c2 |
| log.md | 81805bbe11840baa80d64df34ead97340a3ef2175000c7fd0b033efb2235f834 |
| profile.log | 351135f8992d8d15911eb6f987f6f006a9b203db4ae431680879fd74ca6c9779 |
| progress.log | f4bad707440fb62560317c7a15a0bb35f4ddc043dfd8d704110d96e072561c98 |
| task/message.md | 45354b28004cc46168ef5b4f7c4b4a1070b46ff18981b5238d5648ae13d73727 |

Корневые spec/analysis/impact дерева проверки совпали с этими hashes в первом и повторном замерах. Три замороженных авторских файла в логическом дереве task-061-canon-methodology при повторной сверке также дали `MATCH` с каждой из трёх ожидаемых версий. Начальные hashes авторской версии заданы интегратором; отдельный ранний собственный замер авторского дерева не приписывается.

`s2-sol/launch.md`: до/после 21ce82e8ab183f5c6e7580a947ff36676fd43e5c19c3932c130be9bc92b0b3c2. Не редактировался.

## Read-only 045 — до/после равны

| Файл | SHA-256 |
|---|---|
| spec.md | 685245b64f33424e225e340898399b49084f39b20f66469b58637fe96cc05ed8 |
| plan.md | 150c9826fc1be49a63cbd8754491c88063c9eca02d145519040d1da51c6711e4 |
| plan-review-4.md | ea0d84e953159a18d27b18eb5d8097806478960fe6327749a72afa928c05e6a9 |
| log.md | 8679a884f426e98e997b65977d96ba098d267b6cb9005c9d8a9a98597d84c4b3 |

`git status --short`, одинаковый cwd — папка задачи 045 в её авторском дереве, — до/после ровно `?? ./`. Это локальный scope статуса, не заявление о чистоте всего дерева. Hash-сверка четырёх входов проведена отдельно.

## Read-only 013 — до/после равны

| Файл | SHA-256 |
|---|---|
| spec.md | f86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376 |
| task/message.md | 88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9 |
| log.md | 434e218c66362a3bccaeb5cecd3f621e4c6817dda4115be80d169cbc19c0f263 |

`git status --short` из корня авторского дерева 013 одинаков до/после:

```text
 M doc/tasks/013-runner-core/log.md
 M doc/tasks/013-runner-core/task/message.md
?? doc/tasks/013-runner-core/profile.log
?? doc/tasks/013-runner-core/progress.log
?? doc/tasks/013-runner-core/spec-review-1.md
?? doc/tasks/013-runner-core/spec-review-2.md
?? doc/tasks/013-runner-core/spec-review-3.md
?? doc/tasks/013-runner-core/spec.md
```

Это существовавшие изменения автора; они не отменялись и не объявляются собственными правками. `src`/`src/runner_core` отсутствовали при осмотре.

## Approved 031 и методика

031 spec Git bytes: 177306 байт, 732 строки, SHA-256 a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829 — совпал с заданием. Чтение immutable Git-object, без checkout/fetch/изменения refs. Полная версия объекта — 4b48c50eef1fb46af4f074a80511979b16e515e3.

methodology.md @ a449bd2e218e04384d1d42e0c1bffe892495e298: SHA-256 b404b8d89b659956884fea74f27ed9e317881d4ff35ecf22019d9b40664c6295, 2009 строк. Это совпадающий hash при неверном числе строк в авторской описи. Методический репозиторий только читался по закреплённым объектам; latest remote в этой С2 заново не запрашивался — a449bd2 является закреплённой входной версией, а не обещанием неизменного latest после проверки.

## Контроль собственного отчёта

После записи отчёта Python проверил первые две строки и нумерованные находки:

```text
report numbered findings ['1', '2', '3', '4', '5', '6']
```

Первая строка 6/0/6 согласована с распределением: А 3/0/3 + Б 2/0/2 + собственный процесс 1/0/1. Hash/get config не входят как единственные предметные пробы: пять из шести — пересчёт/контрактные и источниковые проверки содержания.

В начальном status дерева проверки log.md уже modified, предмет/spec/журналы/inputs — untracked. Финальный status отличается добавленным spec-review-1.md и собственными evidence-файлами внутри s2-sol; корневой progress дописывался инструментом. Корневой log агентом не редактировался; утверждение его побайтной неизменности от отдельного раннего hash не делается. Это не замена fingerprints семи immutable inputs.

Последний лёгкий контроль пяти собственных Markdown-файлов: UTF-8, без BOM/хвостовых пробелов/абсолютного drive path — `local_text_check OK` для каждого. Это локальная проверка формы, не полный privacy guard. `read-map rows 45`; `probe sections 6`; сравнение четырёх корневых входов spec/analysis/impact/task-message со snapshots — четыре `True`; `git diff --check exit 0` (неотслеживаемые собственные файлы охвачены отдельным Python-контролем). Итоговый отчёт 29587 байт, SHA-256 8ead97a4a9be526e5e4460bd5afa426cfdbd707f547436083049c14488d4c8bf. Последующие правки затрагивают только эту запись контроля, не отчёт/предмет.

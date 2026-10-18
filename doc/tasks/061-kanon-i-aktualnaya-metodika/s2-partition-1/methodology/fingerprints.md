# Отпечатки и неизменность

Измерение — Python SHA-256 исходных байтов. Ветка до/после `review/061-topic-methodology`, HEAD `492c166fbd12e00a6a924efab065f6adb4bd91f6`. Никаких refs/commit/merge/push не выполнялось.

## Семь subjects до/после

Все7 совпали с `../program.md` и frozen `../inputs/` при первой собственной пробе **до evidence** и при конечной предметной сверке. Первая проба не создаёт снимок вместо входа: inputs подготовлены интегратором и отдельно сравнены побайтно.

| Имя | Байты | SHA-256 raw (до = после = inputs) |
|---|---:|---|
| spec.md | 39482 | a9156e7135f4abbf8d46d585432a2ce3ae6942d7a6f73da3c96f007dcb846b64 |
| analysis.md | 28505 | 56375053b9cb580f48796ba2234f9747741ee9963a20b5854ddee6bd0aff0734 |
| 031-impact.md | 15309 | c79ac11b03a81ec4150175560b299410b687adb92720682e305b392e40d8135c |
| spec-trace.md | 10150 | 5f9bb73dbe9d0bd078878e7ec444253a670ea630ec8ef3fa1273e27002ce647f |
| spec-fixes-1.md | 11411 | fdce445416e0b24fef4f524c95f5c279ef1838aa95d91bc9846aae2ad3b2772b |
| spec-fixes-2.md | 12393 | 2dee3927afe251847e619d78795108c236796303bab1e2836e6ab9e900c2de89 |
| spec-fixes-3.md | 13980 | 24c044576c4f8ab861ace1d2cc3ce5cb4c3e9aabde7937373c7503099f1400a4 |

`baseline.json`:272точных относительных имени/rawSHA; область — существующие файлы061, включая историю/log/program/inputs, плюс AGENTS/Canon/plugin/config; исключены собственное evidence и только разрешённые mutable progress/profile/usage061. Алгоритм выборки целиком в `check.py`, исключения не по basename вложенных снимков. Baseline записана после первичного чтения и **до первой записи предметных отчётов**, не до начала всей сессии; раннюю границу семиsubjects держит первая отдельная проба. Манипуляций protected до baseline не было. Хеш сериализации dict с sort_keys: `2c14f4c87b1a886935e009e669db1d909f2be968a67b3b0461c2ae7f33dbcfb3`. Контроль: `PROTECTED 272 272 CHANGED 0`, exit0. Expected не подменялись.

Чужие незакоммиченные материалы при старте уже присутствовали: log061 modified, остальные предметные/исторические файлы untracked. Они сохранены; свой diff не сравнивается с чистым gitstatus как будто это авторство всехuntracked.

## Источники методики

Raw из `git show a449bd2:<path>`, не рабочаяCRLF-копия. Статус внешнего клона до/после пустой. Точные current/old/ab2commits — read-map/delta; новых refs/fetch не делалось, сегодняшняя remote latest повторно не объявляется установленной этим чтением. Latest на старте — факт постановки, будущая проверка перед внесением обязательна поREQ-06/AC-06.

| Файл | Байты/строки | rawSHA-256 |
|---|---|---|
| README.md | 1861/24 | 0590d3648413073e0f090df02d0613d87b5423ac4ce6548f6e6dbb14fadd1c2f |
| methodology.md | 385080/2009 | b404b8d89b659956884fea74f27ed9e317881d4ff35ecf22019d9b40664c6295 |
| task-algorithm.md | 51475/370 | ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96 |
| task-sessions.md | 58883/416 | 64b221cde012f6e8d05c94fa6a467e4c5ce999bfd8071878caa3e85b8d57214d |
| task-runner.md | 141522/723 | 178fd0f1055bbdd190a4c8d4a5316566ea7be00829f9883cbfb9fde6a2a16a85 |
| completeness-check.md | 47447/52 | 3fd55d79b4a5dc59e87c914db89327e432b96f027ee8250e60de4f24aa2368a8 |
| doc/open-questions.md | 28960/87 | 68b3c3a220795a6fdad7b80b6ecab93c47796dffbecfe40c0a308eabf2d53616 |

Хеши/длины не доказывают глубину чтения; собственные ranges отдельны. Для algorithm отдельно установлен raw/CRLF-контроль П2, вsubject это разные байтовые области.

## Read-only045 и approved031

Три действительно читавшихся файла045:

- spec: `685245b64f33424e225e340898399b49084f39b20f66469b58637fe96cc05ed8`;
- plan: `150c9826fc1be49a63cbd8754491c88063c9eca02d145519040d1da51c6711e4`;
- log: `8679a884f426e98e997b65977d96ba098d267b6cb9005c9d8a9a98597d84c4b3`.

До/после равны; gitstatus до/после ровно `?? doc/tasks/045-runner-registry-jsonc/`. Ранее имеющийся untracked пакет не исправлялся/не добавлялся вindex. Spec/plan SHA совпали с постановкой. Это не полная аттестация045.

Approved031 читался только Git-объектом commit `4b48c50eef1fb46af4f074a80511979b16e515e3`, spec:259/309/540; refsне менялись, объект immutable. Нынешняя часть не заявляет собственный hash/statusbefore/after013 или полный031: они не открывались, это границаС2к.

Единственные свои файловые изменения — новые файлы этого каталога evidence и append-only progress/profile/usage061. `format.md`, `current.md`061 и `spec-review-2.md` не созданы. Стражи/тесты/тяжёлые команды не запускались: изменение productionкода отсутствует, проверка здесь — чтение/лёгкие пробы, а не готовность кpush.

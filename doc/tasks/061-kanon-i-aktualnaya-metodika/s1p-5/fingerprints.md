# Ранние базы, freeze и readonly after

## Собственное дерево

До первой предметной правки:

- `baselinefiles.json`: исходные449 файлов, не переписан.
- `baseline-supplement.json`:459 файлов, дополняет исходный baseline ещё10 путями
  корневой документации/config/служебных каталогов и doc/open-questions; тоже снят до правок.
- Все совпадающие ключи этих двух baselines имели одни байты, старый expected не обновлялся.

`afterfiles.json`: те же459 путей. Изменены ровно шесть разрешённых текущих авторских файлов;
остальные453 совпали. Во всей существовавшей061, включая snapshots/inputs/отчёты/пакеты/программы,
история защищена исходными hashes. Все37 вложенных progress/profile/usage, в том числе snapshot,
сохранились; basename не использовался для исключения вложенного журнала.

Исключения — только новые s1p-5/сдача5/fresh-review-inputs/owner-gate-decisions и три точных
корневых mutable журнала progress/profile/usage. Для существующих шести subjects отклонение от
baseline допускается явно, а не стирается заменой expected. Canon/code/config/AGENTS,
task/message/log и вся прочая существовавшая история сравниваются строго.

Это названная область, не заявление о хешировании каждого файла всей машины/всех репозиториев.
Новые файлы разрешённого scope отдельно перечисляются в папке сессии и финальном privacy scan.

## Внешние before/after

`external-before.json` снят до собственного чтения внешних пакетов, `external-after.json` после.
Старый файл не менялся. Совпали:

- 045:102 файла её текущего авторского пакета, HEAD/status.
- 013:354 файла обследованного дерева, HEAD/status; src=False, src/runner_core=False.
- Методика: HEAD/status локального checkout, identical=True, статус чист.

Методические/approved031 нормативные входы читаются по immutable Git objects, а не текущим
строкам checkout. Основная карта —84 точные byte areas, primary-fingerprints.json до freeze
и primary-at-submit.json совпали и повторно сверены с оригиналами. Включены все изменённые
old/current paths, algorithm, весь15-файловый approved031 пакет, узкий plugin commit,
Canon/config и первичные пакеты/решения.

Все прежние15 raw областей предмета сохранены и проверены отдельно П5; старый plan045 не
подменён новым, обе версии названы. Source hashes подтверждают байты, не смысловую полноту.

Отдельное позднее наблюдение local HEAD78ed758… записано в local-method-observation.json
с пятью дополнительными byte areas и exact hunks. Remote не проверялся, новый pin не принят.
Эти пять контекстов не выданы за уже внесённый/проверенный полный normative delta 061;
перед переносом нужны upstream/delta/повторные ворота по В-01а.

## Побайтная сдача

`submitted/` содержит ровно семь subjects, корневые originals равны им побайтно.
`submitted-sha256.json` — все SHA/размеры, тот же список в fresh-review-inputs.
Spec: `231f86a46022d5e592a2d9b001e8ee00e4ffb180094701f82c79dee88dcc4570`.
Frozen3/spec-review-3 и s1p-4/submitted не изменены. Указатели current061/format/план не создавались.

Команда итоговой сверки:
`python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py final`.
Первый сохранённый результат — probe-final.txt, exit0; окончательный после добавления контекста
и отчётов — probe-final-submit.txt с raw stdout/stderr. Семь hashes и84+5 областей проверяются
по реальным входам, не только наличию строк манифеста.

## Scoped privacy

Только разрешённые новые тексты/шесть изменённых документов, реальные project rules,
без изменения индекса/guards/config. Итоговая команда:
`python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py privacy`;
stdout/stderr/exit — probe-privacy-final.txt и raw outputs. Полные run-all/CI/tests не запускались.

Предел S 30 КБ не менялся: четыре предупреждения по frozen subjects раскрыты в probes/qualification.
Fresh-review-inputs — карта источников, не сокращённая подмена чтения. Все команды завершаются
до done; после него только append-only profile/usage и submit/доклад.

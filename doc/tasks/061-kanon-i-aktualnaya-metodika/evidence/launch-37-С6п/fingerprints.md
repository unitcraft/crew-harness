# Сохранность и fingerprints — запуск 37

- База задания: `492c166fbd12e00a6a924efab065f6adb4bd91f6`; ветка задачи совпадает с назначением.
- Номер/код: launch 37 / С6п-1, сверены с парной строкой плагина и записью запуска.
- Own before: 1674 existing file entries, whole-tree tracked/hidden/untracked и `.git` file bytes/SHA metadata; payload не сохранялся отдельно. Own expected создан до проб. Свои Python-команды запускались с `-B`.
- В текущей E36 оговорке: 59 frozen files, manifest SHA `e23322e97430cdbff3754b77038a3ad2f2ee5e98c217319e6e448f900cd7c235`; файл pycache 2769 bytes SHA `ad873e…` уже был до нашего before и не открывался/не копировался/не удалялся.
- Неисполненный CLI `rg` у предыдущего автора: настоящий `rg` не подтверждён. В текущей проверке не объявляю альтернативный поиск успешным `rg` и не утверждаю будущую единственность текста.
- Dynamic `.opencode/opencode.json` может меняться между состояниями сервиса. Сравнение whole-tree не превращает его автоматическую динамику в обвинение; прочие config не исключаются.
- External clone: только `git -C ... ls-remote/show/diff`, никакой fetch, записи, checkout или cleanup.
- На целевой ветке свежая сетевой выборка не выполнялась; увиденный `origin/main` может устареть и обязан быть перечитан у будущих ворот.

Подробные after counts, protected changes и хеши разрешённых outputs — `after.json`/`manifest.json`; ни один hash не заменяет чтение.

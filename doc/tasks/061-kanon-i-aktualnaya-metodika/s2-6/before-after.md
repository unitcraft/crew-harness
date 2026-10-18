# Заход 6 — собственный before/after

- До предметного чтения: рекурсивная инвентаризация всех файлов дерева, включая hidden и `.git`, только относительный путь, байты, SHA-256; payload не сохранялся в репозитории.
- Исключены: `doc/tasks/061-kanon-i-aktualnaya-metodika/s2-6/**`, `spec-review-6.md`, `progress.log`, `profile.log`, `usage.log`.
- Before: 634 файла. After: 634 файла. Сравнение по пути+bytes+SHA-256: 0 различий.
- HEAD до/после: `492c166fbd12e00a6a924efab065f6adb4bd91f6`. Ветка: `review/061-scope-r6`.
- `git status --short --branch` до/после одинаков: изменены/неотслеживаемы только исходные пользовательские/авторские материалы, включая `doc/open-questions.md`, задачу 061, авторские root docs и journals. Новых изменений защищённых файлов нет.
- Внешние checkout/рабочие деревья 045/013 не сняты до/после; их сохранность не аттестуется.
- Точные root hashes предмета и старой approved spec приведены в `spec-review-6.md`.

# Лёгкие проверки плана и отрицательные сценарии

Плановые пробы для независимо читающей С4; это проверки связности текста плана, не runtime проверки продукта.

Проведённая лёгкая проверка `plan.md` (PowerShell regex/substring; без записи в источники): REQ labels present (7 occurrences including table/header), AC labels present (10), DNC labels present (4), `C01–C60=True`, `D0–D5/DX=True`, `первый перенос любого результата=True`, `current.md=True`, `только после содержательных ворот=True`, `gate_boundary=True`; exact plan size after edits 39,374 bytes. Первичная проверка буквальной фразы `session gates only` и отдельно буквального шаблона `создать current.md` дала False из-за различия формулировок, не пропуска правила; обе границы перепроверены подходящими точными подстроками выше. В план добавлено явное ограничение «session gates only, program gates V1–V13 excluded». Это только lint наличия, не PASS семантики.

1. **Матрица требований:** вручную сверить `plan.md` §3 против утверждённого `spec.md` REQ-01…06, AC-01…08, DNC-01…04; ожидается каждая обязанность связана с шагом, destination и evidence. По `spec-trace.md` A01…A94 проверить адресные диапазоны и особые ограничения. Одного count 6/8/4 недостаточно.
2. **Полнота crosswalk:** пройти C01…C60 по строкам; ожидается указание диапазонов по шагам и per-row обязательство в `coverage.md`; проверять обязательные маршруты C17/C22, запуск/recovery C01–C16, reviewer C29–C50, source/version/registry C51–C60. Неизвестное не превращается в выдуманный контракт.
3. **Порядок current:** мысленно применить разрешённый Canon-first; ожидается current создан одновременно с первым реальным переносом до format. Вариант «ждать format» должен быть запрещён.
4. **Drift:** изменить hypothetical observed upstream commit между проверкой и переносом; expected — остановка, новый delta, повторные ворота, никакой тихой смены pin.
5. **Preservation:** target approved031 commit `4b48…`; expected — immutable forever, только новый destination после В-02.
6. **В-02:** compatibility evaluation unknown/negative; expected — не создавать format, shape question возвращается владельцу; no assumed schemaVersion.
7. **Внешний контракт:** пустой/неизвестный registry signature либо недоступен consumer; expected — NOT VERIFIED/blocker, никакого полного registry/compatibility PASS.
8. **Gate boundary:** session gate остановка без адресованного владельцу вопроса против program gate V1–V13; expected — новая методическая норма охватывает только первое, не подменяет программные ворота.
9. **S4 prerequisites:** предположения о существовании файлов/версии/инструмента; expected — список с точным read-only probe, result и limit; heavy/state-changing checks не выполняются, вопрос/step placement по новой норме.

С3 не запускал общий validator, продуктовый тест, сборку, тяжёлую команду или команду в чужом дереве.

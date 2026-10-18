"""Materialize this reviewer's addressed coverage decisions, not a validator."""
import re
from pathlib import Path

t = Path(__file__).resolve().parent.parent
out = t / 's4-2'
atom_steps = {
    '0': [1,2,3,4,5,6,12,23,24,25,26,27,37,44,45,46,47,51,52,54,58,59,60,61,62,64,65,66,67,68,69,70,71,72,79,81,84,85,86,87,88,89,90,91],
    '1': [7,15,19,20,21,22,28,29,30,31,53,55,56,57,73,74],
    '2': [16,33,34,35,75],
    '3': [8,9,17,18,36,38,39,40,41,42,43,48,49,50,63,76,77,78,92,93],
    '4': [10,11,13,14,32,80,82,83,94],
}
step_details = {
    '0': ('73,85,99,113', 'собственная новая evidence-папка; неизменные входы', 'задание/spec/источники', 'сохранные входы и корректный учёт', 'before/after, read-map, submit', 'утверждение плана; границы назначения сессии'),
    '1': ('22–28,75,93', 'method-delta/coverage; внешние источники read-only', 'old/current Git objects, внешний status', 'точные anchors и честные границы', 'upstream/diff/hash/status', 'drift → повторные ворота'),
    '2': ('34–35,65,77,92', 'process/конкретный раздел или D0 внешний оригинал', 'действующая внешняя норма и override/source', 'норма не отключена provenance; только точное отличие', 'поадресная ручная сверка', 'новое отличие → решение; K1 для шага 2'),
    '3': ('36–37,44–46,63,67,79,94–95', 'crosswalk/пакет В-02; маршрут интегратору 045', 'immutable031, 045, 013', 'три оси; ограничения формы; неизвестность не PASS', 'C-row/source/pairs/signature boundary', 'В-02; отдельный цикл 045'),
    '4': ('38–39,47–50,81,83,96', 'README/process/новый ADR/current; format после В-02', 'согласованный delta и решения', 'current немедленно; approved immutable; контролируемый переход', 'diff/source→destination→evidence', 'все относящиеся ворота до переноса'),
}
rows = ['# Независимая карта обязательств С4-2', '',
        'Это адресная оценка плана, не утверждение будущего результата. Владелец действий — исполнитель 061; решений — владелец; внешних работ — соответствующий интегратор. Итог по каждой строке включает сохранность по шагу 6. Исторические сессионные constraints A02/A05/A58/A65/A83/A86/A91 применены с учётом нынешнего назначения, а не повторяют С1/С2.', '',
        '| Атом и конкретный смысл | Plan lines / step | Destination | Вход | Expected | Evidence | Gate / результат |',
        '|---|---|---|---|---|---|---|']
text = (t/'spec-trace.md').read_text(encoding='utf-8')
for m in re.finditer(r'### A(\d+) / (\d+)\n\n\*\*Один проверяемый атом:\*\* (.+?)\n\n\*\*REQ/AC либо отдельный constraint; точное свидетельство/граница:\*\* (.+?)(?=\n\n)', text):
    i = int(m[1]); step = next(s for s, ids in atom_steps.items() if i in ids)
    lines,dest,inp,expected,evidence,gate = step_details[step]
    if i == 1: gate = 'метаданные, не обязательство'
    if i in [60,61,65,74,85]: gate += '; K2: существующие NEWs3-1 не новые выходы'
    rows.append(f'| A{i:02}: {m[3]} | {lines}; шаг {step} + 6 | {dest} | {inp} | {expected} | {evidence} | {gate} |')

rows += ['', '## Все REQ/AC/DNC', '', '| ID | Plan lines | Исполнимая обязанность / проверенный исход |', '|---|---|---|']
entries = {
 'REQ-01':('34,65,77','Норма/applicability/override/source/provenance разделены, но команда «Внести проектное правило» не ограничена отличием — K1.'),
 'REQ-02':('35,65,77,92','Каждый old/current anchor, отдельный semantic override подзадачи, код/граница; конкретизация картой каждого source, не одним диапазоном.'),
 'REQ-03':('36,63,67,79,94','C01–C60, шесть verdicts с областями, три оси, closed restrictions, пары; внешняя неизвестность не отменяет декларации.'),
 'REQ-04':('37,45,46,67,79,97','Два блокера 045 раздельны; точный маршрут передаётся интегратору, 013 read-only; 061 не создаёт каталог.'),
 'REQ-05':('38,47,81,83,96','Canon-first/current-now; format только после решений; immutable031. Шаг 2 противоречит D0 — K1.'),
 'REQ-06':('39,48,49,75,81,93','Свежая remote проверка, drift stop/delta/gates; old/new/reason/authority в append-only переходе, не массово.'),
 'AC-01':('43,65,75,77,92','Точный mapping source/anchor/disposition/Canon/code boundary/consequence обязателен; K1 касается назначения D0.'),
 'AC-02':('44,63,67,79,94','Per-row поля/type/enum/cardinality/nullability/restrictions либо доказанный gap; независимые оси и классификатор.'),
 'AC-03':('45,67,79,97','Per-anchor/per-DNC остаётся отдельным циклом 045; handoff не выдаётся за уже исправленный план.'),
 'AC-04':('46,75,79,97','Draft013/hash/status/старое решение; отсутствие src не compatibility.'),
 'AC-05':('47,81,83,85,92,96','Source→REQ→destination→actual/evidence; current первый перенос любого результата, immutable031; K2 затрагивает evidence baseline.'),
 'AC-06':('48,75,81,93,112','Remote на момент gate/transfer, drift → новое сравнение и повторные ворота.'),
 'AC-07':('49,14,26,39,81','Pin/метка, old/new/reason, интегратор только внутри утверждённого scope; состоявшиеся ворота — владелец через ссылку на полный первичный ответ.'),
 'AC-08':('50,16,67,79,83,95','Условная shape, separate compatibility, новые тексты/пары/три версии отдельно, отрицательный исход owner gate.'),
 'DNC-01':('18,54,81,83,99','Protected inputs/Canon/config/code/external read-only до разрешения; approved031 навсегда.'),
 'DNC-02':('55,67,79,85,95,97','Unknown/signature/version/runtime не PASS без источника.'),
 'DNC-03':('18,26,56,73,99','Append-only история/pins/серии; исключение existing NEWs3-1 как новых выходов конфликтует с этой границей — K2.'),
 'DNC-04':('18,57,71,85,99,116','Планирование не реализация; git/live/heavy запрещены; будущие сессии отдельно.'),
}
for k,(where,what) in entries.items(): rows.append(f'| {k} | {where} | {what} |')

rows += ['', '## Каждый полевой маршрут', '',
         'Вход каждой строки: её точный method anchor из заголовка C и immutable031 constraints A/B/T/D/P/G/V из 031-impact:15–51, самостоятельно сверенные по оригиналу. Владелец — исполнитель 061, данные/содержание 045 — её отдельный цикл. Expected: три независимые оси, непустые verdicts по части, точные ограничения и причина unknown; Evidence: поатрибутная карта/пары, без runtime PASS. Gate: В-02 для текста/версий/shape; 045 для каталога; неизвестные signatures не замещаются.', '',
         '| Маршрут / точная обязанность | Plan / step | Destination / особый контроль |', '|---|---|---|']
impact = (t/'031-impact.md').read_text(encoding='utf-8')
for m in re.finditer(r'^### C(\d+) (.+)$',impact,re.M):
    n=int(m[1]); extra = 'crosswalk; отдельное consequence для 045'
    if n in [17,22]: extra='crosswalk + новые пары format после В-02; прямые REQ/AC не отменяются grammar ref'
    if n in [29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50]: extra+='; D0 или точный override, не механическое копирование'
    rows.append(f'| C{n:02} {m[2]} | 63,67,79,94; шаг 3 → 5/6 | {extra} |')

rows += ['', '## Каждый fragment карты delta', '',
         'Во всех строках вход — точный old/current anchor заголовка и его применимость, а не одно имя темы. Шаг 2 обязан определить source/disposition/code boundary; шаг 4 переносит только выбранные отличия с current, шаг 6 сверяет каждый actual. Проверка source→REQ→destination→step→check обязательна plan:92. Внешний D0 остаётся оригиналом. Нахождение в реестре практики не выключает норму.', '',
         '| Fragment / source anchor | Disposition / destination | Шаг / evidence / gate |', '|---|---|---|']
delta=(t/'method-delta.md').read_text(encoding='utf-8')
for m in re.finditer(r'^### ((?:F|M|S|R)\d+\w?) (.+)$',delta,re.M):
    key=m[1]
    if key.startswith('F'): disposition='DX для производных/комплекта; применимые оригиналы отдельно ниже'
    elif key.startswith('M'):
        n=int(re.search(r'\d+',key)[0]);disposition='D1 process «Результат и куда он попадает»' if n in [3,4,5,6,16] else ('D5 / D0 process «Роли»/«Режимы ответа»' if n in [2,17] else ('DX история/provenance' if n in [1,19] else 'D0 внешний оригинал; явный override только по источнику'))
    elif key.startswith('S'):
        disposition='D2 process «Задача, сессия, подзадача»' if key=='S05' else ('D1 process «Результат и куда он попадает»' if key in ['S03','S06','S07','S08','S09','S10','S11','S12'] else 'D3 журнал / D0 внешний оригинал')
    else: disposition='D3 process «Журнал хода» / D0 ручная граница; runtime не доказан'
    rows.append(f'| {key} {m[2]} | {disposition} | 65,75,77,81,92; шаги 1/2→4→6; поадресная сверка; новое отличие — новый ADR/ворота |')
rows += ['| Q5 процедура | D4 process «Открытые вопросы», уже принятое 9d391ba | 65,75,77,92; сверка source, не импорт нерешённых Q |',
         '| После a449: M156 gate-question | D0 внешний оригинал; только проектный канал/инструмент при наличии основания | 22,65,75,77; K1 — буквальная команда внесения не разводит это |',
         '| После a449: S234–245 | D0 внешняя С4 п.7 | 22,65,75,77; независимые предпосылки каждой проверки; не новый runtime |',
         '| После a449: P/Q/HTML | DX provenance/вопрос/производное | 22,24,75; нерешённый малый риск не сокращает цикл |', '',
         'Карта прочитана по каждой строке: отсутствие отдельной новой формы для каждого C не признано дефектом — план правильно требует отдельной оценки, не утверждает непроверенную совместимость. Исторические constraints не превращены в новые требования полной задачи.']
(out/'coverage.md').write_text('\n'.join(rows)+'\n',encoding='utf-8')
print('coverage: A=94 REQ=6 AC=8 DNC=4 C=60; адресные строки delta созданы; это опись, не автоматический PASS')

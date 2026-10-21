#!/usr/bin/env python3
"""Takes the rows of the states of the table of the methodology (`task-runner-states.md`, section "Состояния") and writes `src/machine_runner/methodology_rows.tsv`: the state (the Latin name of
the dictionary), the number of the row, the state it leads to ("!" for a row that ends in the end ERRORED, "@prepare_return" for `возврат_подготовки`). The pause is the fragment and is left out.
The rows of the four reviews (the answer rows) are written under the name `ReviewVerdict` (the fork that holds them in the product) in the order of the stages; the rows "сбой" stay under their state.
Run: python extract_rows.py <task-runner-states.md> <names.tsv> <out.tsv>"""
import re
import sys

src, names_path, out_path = sys.argv[1:4]
names = {}
for line in open(names_path, encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if len(p) >= 3 and p[0] == 'state':
        names[p[1]] = p[2]
for extra in (('ИТОГ_ПРОВЕРКИ', 'ReviewVerdict'), ('КОНЕЦ', 'End'), ('ОСТАНОВЛЕНО', 'Halted'), ('ОШИБКА', 'Errored')):
    names.setdefault(*extra)
REVIEWS = ['РАЗБОР_ПРОВЕРКА', 'ПЛАН_ПРОВЕРКА', 'РЕАЛИЗАЦИЯ_ПРОВЕРКА', 'СДАЧА_ПРОВЕРКА']
text = open(src, encoding='utf-8').read()
start = text.index('## Состояния')
end = text.index('## Маршруты')
body = text[start:end]
sections = re.split(r'\n### ', body)[1:]
rows = []
verdict_n = 0
for sec in sections:
    head, _, rest = sec.partition('\n')
    name = head.split(' — ')[0].strip()
    if name == 'ПАУЗА':
        continue
    tbl = []
    for line in rest.split('\n'):
        if not line.startswith('|'):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        tbl.append(cells)
    # the table of the rows: the one whose header ends with "Куда"
    k = None
    for i, cells in enumerate(tbl):
        if cells[-1] == 'Куда' and cells[0] in ('Условие', 'Событие'):
            k = i
            break
    if k is None:
        continue
    n = 0
    for cells in tbl[k + 2:]:
        if cells[0] in ('Вход', 'Выход', 'Событие', 'Условие'):
            break
        n += 1
        target = cells[-1]
        if target == 'ОШИБКА':
            to = '!'
        elif target == 'возврат_подготовки':
            to = '@prepare_return'
        else:
            to = names[target]
        if name in REVIEWS and cells[0].startswith('ответ'):
            verdict_n += 1
            rows.append(('ReviewVerdict', verdict_n, to))
        elif name in REVIEWS:
            rows.append((names[name], 2, to))
        else:
            rows.append((names[name], n, to))
with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
    for r in rows:
        f.write('%s\t%d\t%s\n' % r)
print(len(rows), 'rows')

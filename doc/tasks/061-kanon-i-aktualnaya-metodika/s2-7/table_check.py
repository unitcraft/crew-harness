import pathlib,json
p=pathlib.Path(__file__).parent;t=p.parent
result=[]
for name in ['spec-trace.md','method-delta.md']:
    rows=[]
    for n,l in enumerate((t/name).read_text(encoding='utf-8').splitlines(),1):
        if not l.startswith('|'):continue
        for column,cell in enumerate(l.strip('|').split('|'),1):
            size=len(cell.strip())
            if size>100:rows.append({'line':n,'column':column,'chars':size})
    result.append({'path':name,'cells_above_100':rows})
s=json.dumps(result,ensure_ascii=False,indent=2)
(p/'table-check.json').write_text(s+'\n',encoding='utf-8')
summary=json.dumps([{'path':r['path'],'count':len(r['cells_above_100']),'first':r['cells_above_100'][:2]} for r in result],ensure_ascii=False)
(p/'table-check.stdout.txt').write_text(summary+'\n',encoding='utf-8');print(summary)

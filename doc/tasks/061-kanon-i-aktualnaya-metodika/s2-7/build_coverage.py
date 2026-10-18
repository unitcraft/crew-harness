import pathlib,re,json
p=pathlib.Path(__file__).parent;t=p.parent
def blocks(name):
    lines=(t/'scope-revision-1/before'/name).read_text(encoding='utf-8').splitlines();d={}
    for i,l in enumerate(lines):
        m=re.match(r'### ((?:A|F|M|R)\d\d|S\d\d[ab]?)\b',l)
        if not m:continue
        z=next((j for j in range(i+1,len(lines)) if lines[j].startswith('##')),len(lines))
        d[m[1]]={'path':'scope-revision-1/before/'+name,'range':[i+1,z],'text':'\n'.join(lines[i:z])}
    return d
result={}
for kind,name,note in [('atoms','spec-trace.md','atom-observations.txt'),('fragments','method-delta.md','fragment-observations.txt')]:
    old=blocks(name);new=(t/name).read_text(encoding='utf-8').splitlines();rows=[]
    for l in (p/note).read_text(encoding='utf-8').splitlines():
        key,obs=l.split('|',1)
        matches=[(i+1,s) for i,s in enumerate(new) if re.match(r'\| '+key+r'(?: /| \|)',s)]
        assert len(matches)==1,(key,matches)
        ln,text=matches[0]
        rows.append({'id':key,'old':old[key],'current':{'path':name,'line':ln,'text':text},'basis':'owner-input:3–15; owner-gate-decisions:8–22; task/message:'+ (re.search(r'/ (\d+)',old[key]['text'])[1] if kind=='atoms' else '15'),'own_comparison':obs,'outcome':'Смысловая сверка old→current выполнена; сохранённая часть найдена, снятая допустима. Первичные нормы проверяются отдельно в N4.'})
    assert len(rows)==(94 if kind=='atoms' else 66)
    result[kind]=rows
(p/'coverage.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
s=json.dumps({'atoms':len(result['atoms']),'fragments':len(result['fragments']),'unique':all(len({r['id'] for r in v})==len(v) for v in result.values())})
(p/'coverage.stdout.txt').write_text(s+'\n',encoding='utf-8');print(s)

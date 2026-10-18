import pathlib,json,hashlib,subprocess
p=pathlib.Path(__file__).parent;t=p.parent
result={}
for name in ['spec-trace.md','method-delta.md']:
    a=(t/'scope-revision-1/before'/name).read_text(encoding='utf-8')
    b=(t/'scope-revision-2/before'/name).read_text(encoding='utf-8')
    marker='Статус: чернов'
    result[name]={'old_lines':len(a.splitlines()),'nearest_lines':len(b.splitlines()),'common_body_equal':a[a.index(marker):]==b[b.index(marker):]}
result['root']=[{'path':x,'bytes':len((t/x).read_bytes()),'sha256':hashlib.sha256((t/x).read_bytes()).hexdigest()} for x in ['spec.md','analysis.md','spec-trace.md','method-delta.md','scope-revision-2.md']]
(p/'input-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
s=json.dumps(result,ensure_ascii=False,indent=2);(p/'input-checks.stdout.txt').write_text(s+'\n',encoding='utf-8');print(s)

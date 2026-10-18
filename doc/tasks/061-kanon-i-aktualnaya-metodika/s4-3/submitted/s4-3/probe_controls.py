import json, hashlib, re, subprocess, sys
from pathlib import Path
O=Path(__file__).parent
T=O.parent
F=O/'fixtures'
assert not F.exists(), 'Новый корпус уже занят; перезапись запрещена'
F.mkdir()
def write(p,b):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('xb') as f: f.write(b)
def fp(b): return dict(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
def snap(): return {p.relative_to(F).as_posix():fp(p.read_bytes()) for p in F.rglob('*') if p.is_file()}
seed={'old/before.json':b'{"base":1}\n','old/expected.json':b'{"target":1}\n','old/notes.md':'Первичный вымышленный вход\n'.encode(),'old/nested/progress.log':b'old-prefix\n','occupied-E/before.json':b'occupied\n'}
for n,b in seed.items(): write(F/n,b)
b=snap()
write(O/'fixtures-before.json',(json.dumps(b,indent=2,ensure_ascii=False)+'\n').encode())
actual={}
def changed(a): return sorted(n for n in b.keys()|a.keys() if b.get(n)!=a.get(n))
actual['B-unchanged']=changed(snap())
# Только собственная отрицательная фикстура, никогда не primary old before.
(F/'old/before.json').write_bytes(b'{"base":2}\n')
a=snap()
assert sorted(a)==sorted(b)
assert a['old/before.json']['bytes']==b['old/before.json']['bytes']
actual['B-same-names-mutated-content']=changed(a)
actual['B-occupied']='STOP' if (F/'occupied-E').exists() else 'FRESH'
actual['B-fresh']='STOP' if (F/'fresh-assigned-E').exists() else 'FRESH'
actual['B-exclude-existing']='DENY' if 'old/before.json' in b else 'ALLOW'
actual['B-exclude-new']='DENY' if 'new-output.json' in b else 'ALLOW'
text=(T/'plan.md').read_text(encoding='utf-8')
current='Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть'
def form(s):
    lines=s.splitlines()
    errors=[]
    if len(lines)<2 or not re.fullmatch(r'База: ревизия [0-9a-f]{40}, \d{4}-\d{2}-\d{2}',lines[1]): errors.append('base')
    if not re.search(r'^Ветка: \S+$',s,re.M): errors.append('branch')
    if len(re.findall(r'^\[ \] ',s,re.M))!=22: errors.append('checkbox')
    if len(lines)<3 or lines[2]!=current: errors.append('current-line')
    return errors
cases={'C-original':text,'C-no-base':text.replace(text.splitlines()[1],'База: неизвестна',1),'C-no-branch':re.sub(r'^Ветка: .+$','Ветка:',text,count=1,flags=re.M),'C-no-checkbox':text.replace('[ ] ','',1),'C-no-current-line':text.replace(current,'История',1)}
for name,s in cases.items():
    write(F/(name+'.md'),s.encode('utf-8'))
    actual[name]=form(s)
expected=json.loads((O/'expected-controls.json').read_text(encoding='utf-8'))
results={'same_nameset_before_mutation':sorted(a)==sorted(b),'same_size_mutation':a['old/before.json']['bytes']==b['old/before.json']['bytes'],'cases':{n:dict(expected=expected[n],actual=v,ok=v==expected[n]) for n,v in actual.items()}}
write(O/'control-results.json',(json.dumps(results,ensure_ascii=False,indent=2)+'\n').encode())
for n,r in results['cases'].items(): print(n+': '+json.dumps(r,ensure_ascii=False))
ok=all(r['ok'] for r in results['cases'].values())
print('ИТОГ: групп команд 2, случаев 11, расхождений '+str(sum(not r['ok'] for r in results['cases'].values())))
sys.exit(0 if ok else 1)

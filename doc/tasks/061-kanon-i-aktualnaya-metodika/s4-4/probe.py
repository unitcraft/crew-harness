import sys,re,json,hashlib
from pathlib import Path
E=Path(__file__).parent;F=E/'fixtures';T=E.parent
def new(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('xb') as f:f.write(data)
def snap():return {p.relative_to(F).as_posix():{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(F.rglob('*')) if p.is_file()}
def dump(path,obj):new(path,json.dumps(obj,ensure_ascii=False,indent=2).encode('utf-8'))
def errors(text):
 lines=text.splitlines();result=[]
 if not re.fullmatch(r'База: ревизия [0-9a-f]{40}, \d{4}-\d{2}-\d{2}',lines[1]):result.append('base')
 if not re.search(r'^Ветка: task/061-kanon-i-aktualnaya-metodika$',text,re.M):result.append('branch')
 if not re.search(r'^\[ \] ',text,re.M):result.append('checkbox')
 if lines[0]!='Статус: черновик':result.append('status')
 if lines[2]!='Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть':result.append('current')
 for section in ['План','DoD','Требует утверждения']:
  if '## '+section not in lines:result.append('section:'+section)
 return result
expected={'same_names':True,'changed':['old/expected.json'],'exclusion_existing':'STOP','occupied':'STOP','fresh':'ALLOW','form':{'valid':[],'no-base':['base'],'no-branch':['branch'],'no-checkbox':['checkbox']}}
if sys.argv[1]=='prepare':
 if F.exists() or (E/'fixture-before.json').exists():raise SystemExit('STOP existing fixtures/before')
 for name,data in {'old/before.json':b'{"old":"before"}\n','old/expected.json':b'{"old":"expected"}\n','old/notes.md':'историческое свидетельство\n'.encode(),'occupied-E/before.json':b'{"launch":"old"}\n'}.items():new(F/name,data)
 text=(T/'plan.md').read_text(encoding='utf-8')
 for name,data in {'valid':text,'no-base':re.sub(r'^База:.*$','База: неизвестна',text,flags=re.M),'no-branch':re.sub(r'^Ветка:.*$','',text,flags=re.M),'no-checkbox':text.replace('[ ] ','- ')}.items():new(F/(name+'.md'),data.encode())
 dump(E/'fixture-before.json',snap());dump(E/'expected-probes.json',expected)
 print('PREPARED 8 fixtures; before and expected fixed before run')
elif sys.argv[1]=='run':
 if (E/'probe-actual.json').exists():raise SystemExit('STOP existing actual')
 before=json.loads((E/'fixture-before.json').read_text(encoding='utf-8'));assert snap()==before
 (F/'old/expected.json').write_bytes(b'{"old":"unexpected replacement"}\n')
 after=snap();dump(E/'fixture-after.json',after)
 actual={'same_names':set(before)==set(after),'changed':[p for p in before if before[p]!=after[p]],'exclusion_existing':'STOP' if 'old/before.json' in before else 'ALLOW','occupied':'STOP' if (F/'occupied-E').exists() else 'ALLOW','fresh':'ALLOW' if not (F/'fresh-E').exists() else 'STOP','form':{name:errors((F/(name+'.md')).read_text(encoding='utf-8')) for name in ['valid','no-base','no-branch','no-checkbox']}}
 exp=json.loads((E/'expected-probes.json').read_text(encoding='utf-8'));result={'actual':actual,'expected':exp,'equal':actual==exp,'exit':0 if actual==exp else 1}
 dump(E/'probe-actual.json',result);raw=json.dumps(result,ensure_ascii=False,indent=2);new(E/'probe.stdout.txt',(raw+'\n').encode());print(raw);sys.exit(result['exit'])

import subprocess,json,hashlib,shutil
from pathlib import Path
E=Path(__file__).resolve().parent;T=E.parent;R=Path.cwd();S=E/'submitted'
if S.exists():raise SystemExit('STOP occupied submitted')
p=subprocess.run(['python',str(E.relative_to(R)/'snapshot_after.py'),'final-after.json'],capture_output=True,text=True,encoding='utf-8')
with (E/'final-check.stdout.txt').open('x',encoding='utf-8') as f:f.write(p.stdout)
if p.returncode:raise SystemExit('STOP protected comparison failed')
sources=[T/'plan-review-4.md']+sorted(x for x in E.rglob('*') if x.is_file())
# Все источники зафиксированы до создания submitted, рекурсивной копии нет.
manifest={'scope':'реальный пакет С4-4; root mutable journals не копируются','files':{}}
for src in sources:
 rel=src.relative_to(T);data=src.read_bytes();dest=S/rel
 dest.parent.mkdir(parents=True,exist_ok=True)
 with dest.open('xb') as f:f.write(data)
 manifest['files'][rel.as_posix()]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
for rel,expected in manifest['files'].items():
 b=(S/rel).read_bytes();assert {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}==expected
with (S/'manifest.json').open('x',encoding='utf-8') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
print(json.dumps({'frozen_files':len(manifest['files']),'all_copies_equal':True,'protected_exit':p.returncode,'report_sha256':manifest['files']['plan-review-4.md']['sha256']},ensure_ascii=False,indent=2))

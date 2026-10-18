import json,hashlib,subprocess,shutil
from pathlib import Path
O=Path(__file__).parent
T=O.parent
root=Path.cwd()
relT=T.relative_to(root)
relO=O.relative_to(root)
report=T/'plan-review-3.md'
def fp(b): return dict(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
before=json.loads((O/'before.json').read_text(encoding='utf-8'))
mutable={(relT/n).as_posix() for n in ['progress.log','profile.log','usage.log']}
bad=[]
for n,f in before.items():
    p=Path(n)
    if not p.is_file(): bad.append(n); continue
    b=p.read_bytes()
    if fp(b[:f['bytes']] if n in mutable else b)!=f: bad.append(n)
unexpected=[p.as_posix() for p in root.rglob('*') if p.is_file() and p.relative_to(root).as_posix() not in before and not p.is_relative_to(O) and p!=report]
assert not bad and not unexpected,(bad,unexpected)
assert fp((T/'plan.md').read_bytes())==dict(bytes=41036,sha256='362d4958ff43fa325e92a976dd642b7283954891af44c05d369b66a8ab175314')
status=subprocess.check_output(['git','status','--porcelain=v1','--untracked-files=all']).decode()
state=dict(head=subprocess.check_output(['git','rev-parse','HEAD']).decode().strip(),branch=subprocess.check_output(['git','branch','--show-current']).decode().strip(),status=status)
assert state['head']=='492c166fbd12e00a6a924efab065f6adb4bd91f6'
assert state['branch']=='review/061-plan-r3'
out=dict(before_count=len(before),protected=len(before)-3,changed_protected=bad,unexpected=unexpected,all_three_journal_prefixes_preserved=True,git=state)
(O/'final-readonly.json').open('x',encoding='utf-8').write(json.dumps(out,ensure_ascii=False,indent=2))
dest=O/'submitted'
assert not dest.exists()
files=[T/'plan.md',report]+sorted(p for p in O.rglob('*') if p.is_file())
dest.mkdir()
manifest={}
for p in files:
    n=p.relative_to(T).as_posix()
    q=dest/n
    q.parent.mkdir(parents=True,exist_ok=True)
    with q.open('xb') as f: f.write(p.read_bytes())
    assert q.read_bytes()==p.read_bytes()
    manifest[n]=fp(q.read_bytes())
# Последняя запись в реальный пакет; сам manifest и mutable root journals исключены.
with (dest/'manifest.json').open('x',encoding='utf-8') as f:
    json.dump(dict(scope='План и собственный отчёт/evidence С4-3; без root journals и self-manifest',files=manifest),f,ensure_ascii=False,indent=2)
print(json.dumps(dict(outcome='Заморожено',files=len(manifest),protected_unchanged=True,manifest=fp((dest/'manifest.json').read_bytes())),ensure_ascii=False))

import json, hashlib, subprocess
from pathlib import Path
T=Path(__file__).parent.parent
O=Path(__file__).parent
def fp(p):
    b=p.read_bytes()
    return dict(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
def load(p): return json.loads(p.read_text(encoding='utf-8-sig'))
checks={}
m=load(T/'scope-approval-2026-10-17/approved-manifest.json')
checks['approved4']={n:dict(root=fp(T/n),frozen=fp(T/'scope-approval-2026-10-17/approved'/n),expected=f,ok=fp(T/n)==f==fp(T/'scope-approval-2026-10-17/approved'/n)) for n,f in m.items()}
m=load(T/'plan-scope-1/submitted/manifest.json')['files']
checks['submitted']={n:dict(ok=fp(T/'plan-scope-1/submitted'/n)==f,primary_equal=fp(T/n)==f) for n,f in m.items()}
b=load(T/'plan-scope-1/before.json'); a=load(T/'plan-scope-1/after.json')
ai=a['inventory']
checks['author_internal']={'before_count':len(b),'after_count':len(ai),'removed':sorted(set(b)-set(ai)),'added':sorted(set(ai)-set(b)),'changed':[n for n in b.keys()&ai.keys() if b[n]!=ai[n]],'after_other_fields':{n:v for n,v in a.items() if n!='inventory'}}
p=load(T/'review-setup/integrator-preflight.json')
checks['preflight']={'count':len(p['files']),'mismatch':[f['path'] for f in p['files'] if fp(Path(f['path']))!={k:f[k] for k in ['bytes','sha256']}]}
checks['plan']=dict(**fp(T/'plan.md'),lines=len((T/'plan.md').read_text(encoding='utf-8').splitlines()))
checks['git']={n:dict(exit=(p:=subprocess.run(['git',*args],capture_output=True)).returncode,stdout=p.stdout.decode(),stderr=p.stderr.decode()) for n,args in [('head',['rev-parse','HEAD']),('branch',['branch','--show-current']),('task_ref',['rev-parse','--verify','refs/heads/task/061-kanon-i-aktualnaya-metodika']),('base_date',['show','-s','--format=%H %cs','492c166fbd12e00a6a924efab065f6adb4bd91f6'])]}
text=json.dumps(checks,ensure_ascii=False,indent=2)
(O/'input-audit.json').open('x',encoding='utf-8').write(text)
print(text)

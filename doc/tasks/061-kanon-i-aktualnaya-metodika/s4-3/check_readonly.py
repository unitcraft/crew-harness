import json,hashlib,subprocess
from pathlib import Path
O=Path(__file__).parent
T=O.parent
def load(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def fp(b): return dict(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
before=load(O/'before.json')
own=O.as_posix()+'/'
report=(T/'plan-review-3.md').as_posix()
mutable={(T/n).as_posix() for n in ['progress.log','profile.log','usage.log']}
after={p.as_posix():fp(p.read_bytes()) for p in Path('.').rglob('*') if p.is_file() and not p.as_posix().startswith(own) and p.as_posix()!=report}
changed=[n for n in before if n not in mutable and after.get(n)!=before[n]]
added=sorted(set(after)-set(before))
removed=sorted(set(before)-set(after))
prefix={n:fp(Path(n).read_bytes()[:before[n]['bytes']])==before[n] for n in mutable}
p=load(T/'review-setup/integrator-preflight.json')
preflight={f['path']:f for f in p['files']}
preflight_prefix={n:fp(Path(n).read_bytes()[:f['bytes']])=={k:f[k] for k in ['bytes','sha256']} for n,f in preflight.items()}
ab=load(T/'plan-scope-1/before.json'); aa=load(T/'plan-scope-1/after.json')['inventory']
key=(T/'plan.md').as_posix()
sm=load(T/'plan-scope-1/submitted/manifest.json')['files']
result=dict(before_count=len(before),after_count=len(after),protected_count=len(before)-len(mutable),changed_protected=changed,added_unexpected=added,removed=removed,journal_prefixes=prefix,preflight_count=len(preflight),preflight_prefix_mismatch=[n for n,ok in preflight_prefix.items() if not ok],own_extra_over_preflight=sorted(set(before)-set(preflight)),submitted_count=len(sm),submitted_mismatch=[n for n,f in sm.items() if fp((T/'plan-scope-1/submitted'/n).read_bytes())!=f],author_count=len(ab),author_after_count=len(aa),author_changed=sorted(n for n in ab.keys()&aa.keys() if ab[n]!=aa[n]),author_removed=sorted(set(ab)-set(aa)),author_added=sorted(set(aa)-set(ab)),author_before_plan_matches_old=ab[key]==fp((T/'plan-scope-1/old-plan.md').read_bytes()),author_after_plan_matches_current=aa[key]==fp((T/'plan.md').read_bytes()),author_spec_unchanged=ab[(T/'spec.md').as_posix()]==aa[(T/'spec.md').as_posix()])
state={n:subprocess.check_output(['git',*a]).decode() for n,a in [('head',['rev-parse','HEAD']),('branch',['branch','--show-current']),('status',['status','--porcelain=v1','--untracked-files=all'])]}
old=load(O/'before-git.json')
result['head_unchanged']=state['head']==old['head']
result['branch_unchanged']=state['branch']==old['branch']
def strip_own(s):
    return [line for line in s.splitlines() if '/s4-3/' not in line and not line.endswith('/plan-review-3.md')]
result['status_without_own_unchanged']=strip_own(state['status'])==strip_own(old['status'])
for name,data in [('after.json',after),('after-git.json',state),('readonly-results.json',result)]:
    (O/name).open('x',encoding='utf-8').write(json.dumps(data,ensure_ascii=False,indent=2))
out=json.dumps(result,ensure_ascii=False,indent=2)
(O/'readonly.stdout.txt').open('x',encoding='utf-8').write(out+'\n')
print(out)

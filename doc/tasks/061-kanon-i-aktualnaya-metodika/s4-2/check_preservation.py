"""Compare early snapshots; never refresh expectations or modify sources."""
import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('method')
p.add_argument('registry')
p.add_argument('core')
a=p.parse_args()
out=Path(__file__).resolve().parent
t=out.parent
root=Path.cwd()
def git(r,*args):
    return subprocess.check_output(['git','-C',str(r),*args],text=True).strip()
def sha(p):
    b=p.read_bytes()
    return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def compare(r,before):
    missing=[];changed=[]
    for row in before['files']:
        p=r/row['path']
        if not p.is_file():missing.append(row['path'])
        elif sha(p)!={k:row[k] for k in ['bytes','sha256']}:changed.append(row['path'])
    return {'count':len(before['files']),'changed':changed,'missing':missing,'head_before':before['head'],'head_after':git(r,'rev-parse','HEAD')}
before=json.loads((out/'before.json').read_text(encoding='utf-8'))
ext=json.loads((out/'external-before.json').read_text(encoding='utf-8'))
result={'own':compare(root,before),'external':{}}
for name,r in [('method',Path(a.method)),('045',Path(a.registry)),('013',Path(a.core))]:
    result['external'][name]=compare(r,ext[name])
    current=git(r,'status','--porcelain=v1','--untracked-files=all')
    result['external'][name]['status_equal']=current==ext[name]['status'].strip()
result['own']['git_file']=next(x for x in before['files'] if x['path']=='.git')
result['own']['git_payload_published']=False
result['own']['branch']=git(root,'branch','--show-current')
result['own']['status_after']=git(root,'status','--porcelain=v1','--untracked-files=all')
result['scope']='Own: all early existing project files incl hidden and .git FILE; exclude only s4-2/, future plan-review-2.md, exact root task progress/profile/usage. External: early existing files except .git directories and node_modules directories; .git files included. Git internal databases not traversed.'
result['own']['unapproved_new_paths']=[]
known={x['path'] for x in before['files']}
allowed={str((t/x).relative_to(root)).replace('\\','/') for x in ['plan-review-2.md','progress.log','profile.log','usage.log']}
for base,ds,fs in os.walk(root):
    ds[:]=[d for d in ds if d!='.git' and Path(base)/d!=out]
    for f in fs:
        rel=(Path(base)/f).relative_to(root).as_posix()
        if rel not in known and rel not in allowed:result['own']['unapproved_new_paths'].append(rel)
(out/'after.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
for name,row in [('own',result['own']),*result['external'].items()]:
    print(name,'files',row['count'],'changed',row['changed'],'missing',row['missing'],'HEAD equal',row['head_before']==row['head_after'], 'status equal',row.get('status_equal','see scoped output'))
print('.git file bytes',result['own']['git_file']['bytes'])
print('unexpected new files',result['own']['unapproved_new_paths'])
assert all(not row['changed'] and not row['missing'] and row['head_before']==row['head_after'] for row in [result['own'],*result['external'].values()])
assert not result['own']['unapproved_new_paths']
assert all(row['status_equal'] for row in result['external'].values())

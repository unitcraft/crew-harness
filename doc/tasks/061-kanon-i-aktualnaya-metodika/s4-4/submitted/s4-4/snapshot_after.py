import os,json,hashlib,subprocess,sys
from pathlib import Path
R=Path.cwd();E=Path(__file__).resolve().parent;T=E.parent
def fp(data):return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
before=json.loads((E/'before.json').read_text(encoding='utf-8'));own=E.relative_to(R).as_posix()+'/'
report=(T/'plan-review-4.md').relative_to(R).as_posix();prefixes=set(before['prefixes']);files=[];pref={}
for base,ds,fs in os.walk(R):
 for name in fs:
  p=Path(base)/name;rel=p.relative_to(R).as_posix()
  if rel.startswith(own) or rel==report:continue
  b=p.read_bytes()
  if rel in prefixes:
   start=before['prefixes'][rel];pref[rel]={'initial':start,'current':fp(b),'prefix_equal':fp(b[:start['bytes']])=={'bytes':start['bytes'],'sha256':start['sha256']}}
  else:files.append({'path':rel,**fp(b)})
old={r['path']:{k:v for k,v in r.items() if k!='path'} for r in before['files']};now={r['path']:{k:v for k,v in r.items() if k!='path'} for r in files}
git={key:subprocess.run(['git']+cmd,capture_output=True,text=True).stdout for key,cmd in {'head':['rev-parse','HEAD'],'branch':['branch','--show-current'],'status':['status','--porcelain=v1','--untracked-files=all']}.items()}
def filtered(status):return sorted(line for line in status.splitlines() if not line[3:].startswith(own) and line[3:]!=report)
result={'files':files,'prefixes':pref,'git':git,'comparison':{'before_count':len(old),'after_count':len(now),'changed':[p for p in old if p in now and old[p]!=now[p]],'missing':sorted(set(old)-set(now)),'added':sorted(set(now)-set(old)),'head_equal':before['git']['head']==git['head'],'branch_equal':before['git']['branch']==git['branch'],'status_except_own_equal':filtered(before['git']['status'])==filtered(git['status']),'prefixes_equal':all(x['prefix_equal'] for x in pref.values())}}
target=E/(sys.argv[1] if len(sys.argv)>1 else 'after.json')
with target.open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
print(json.dumps(result['comparison'],ensure_ascii=False,indent=2))
c=result['comparison'];sys.exit(0 if not(c['changed'] or c['missing'] or c['added']) and all(c[x] for x in ['head_equal','branch_equal','status_except_own_equal','prefixes_equal']) else 1)

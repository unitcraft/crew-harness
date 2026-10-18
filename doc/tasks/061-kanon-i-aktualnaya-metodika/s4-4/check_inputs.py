import hashlib,json,subprocess,re
from pathlib import Path
E=Path(__file__).parent;T=E.parent
def fp(b): return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
before=json.loads((T/'plan-scope-1/before.json').read_text())
after=json.loads((T/'plan-scope-1/after.json').read_text())['inventory']
changed=[p for p in before if p in after and before[p]!=after[p]]
result={'author_internal':{'before':len(before),'after':len(after),'changed':changed,'missing':sorted(set(before)-set(after)),'added':sorted(set(after)-set(before)),'spec_unchanged':before[str(T/'spec.md').replace('\\','/')]==after[str(T/'spec.md').replace('\\','/')]},'manifests':{},'commands':[]}
for folder,mfile in [('plan-scope-1/submitted','plan-scope-1/submitted/manifest.json'),('scope-approval-2026-10-17/approved','scope-approval-2026-10-17/approved-manifest.json')]:
 m=json.loads((T/mfile).read_text());m=m.get('files',m); checks=[]
 for p,expected in m.items():
  f=T/folder/p;b=f.read_bytes();checks.append({'path':p,'expected':expected,'actual':fp(b),'equal':fp(b)==expected})
 result['manifests'][folder]=checks
for args in [['git','show','-s','--format=%H %cs','HEAD'],['git','--version'],['python','--version'],['rg','--version'],['git','grep','-n','--','writeLaunch(t,','opencode-plugin/index.ts'],['git','grep','-n','--','progressLine(','opencode-plugin/index.ts']]:
 try:
  p=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace');result['commands'].append({'args':args,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
 except FileNotFoundError:result['commands'].append({'args':args,'exit':None,'error':'executable not found'})
result['launch_pair']={}
for name in ['progress.log','log.md']:
 lines=(T/name).read_text(encoding='utf-8').splitlines();result['launch_pair'][name]=[{'line':i,'text':x} for i,x in enumerate(lines,1) if re.search(r'запуск №33\b',x)]
target=E/'checks.json';assert not target.exists();target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'author_internal':result['author_internal'],'manifest_counts':{k:len(v) for k,v in result['manifests'].items()},'all_manifest_equal':all(c['equal'] for v in result['manifests'].values() for c in v),'commands':result['commands'],'launch_pair':result['launch_pair']},ensure_ascii=False,indent=2))

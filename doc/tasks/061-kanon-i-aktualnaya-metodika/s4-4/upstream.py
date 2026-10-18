import subprocess,json,hashlib,datetime,os
from pathlib import Path
out=Path(__file__).parent; repo=os.environ['METHOD_REPO']
def run(args):
 p=subprocess.run(['git','-C',repo]+args,capture_output=True)
 return {'args':args,'exit':p.returncode,'stdout':p.stdout.decode('utf-8',errors='replace'),'stderr':p.stderr.decode('utf-8',errors='replace')}
remote=run(['ls-remote','https://github.com/unitcraft/ai-dev-methodology','refs/heads/main'])
latest=remote['stdout'].split()[0]
old='f333efa319e445efe029ee6963b477ca8fe3bc1c';cur='a449bd2e218e04384d1d42e0c1bffe892495e298'
obj=run(['cat-file','-e',latest+'^{commit}'])
result={'at':datetime.datetime.now().astimezone().isoformat(),'remote':remote,'object':obj,'latest':latest,'comparisons':[]}
for a,b in [(old,cur),(cur,latest),('0e00954d360036a3a926c12c4a79452faf1c261f',latest)]:
 names=run(['diff','--name-only',a,b]); diff=subprocess.run(['git','-C',repo,'diff','--no-ext-diff',a,b],capture_output=True)
 result['comparisons'].append({'from':a,'to':b,'names':names,'diff_sha256':hashlib.sha256(diff.stdout).hexdigest(),'diff_bytes':len(diff.stdout),'exit':diff.returncode})
result['blobs']=[]
paths=['README.md','methodology.md','task-sessions.md','task-runner.md','task-algorithm.md','completeness-check.md','doc/open-questions.md','task-runner-pseudocode.md','task-runner-meeting-pseudocode.md','task-runner-meeting-states.md','state-machine-spec.md']
for rev in [old,cur,latest]:
 for path in paths:
  p=subprocess.run(['git','-C',repo,'show',rev+':'+path],capture_output=True)
  result['blobs'].append({'revision':rev,'path':path,'exit':p.returncode,'bytes':len(p.stdout),'sha256':hashlib.sha256(p.stdout).hexdigest() if p.returncode==0 else None})
target=out/'upstream.json';assert not target.exists();target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='blobs'},ensure_ascii=False,indent=2))

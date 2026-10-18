import sys, subprocess, hashlib, json, shutil
from pathlib import Path
O=Path(__file__).parent
R=sys.argv[1]
refs=['f333efa319e445efe029ee6963b477ca8fe3bc1c','a449bd2e218e04384d1d42e0c1bffe892495e298','0e00954d360036a3a926c12c4a79452faf1c261f','25bef953cf0cfd7a28c7d4650bab7d7a4731d537']
def git(*a): return subprocess.run(['git','-C',R,*a],capture_output=True)
def fp(b): return dict(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
data={'objects':{},'algorithm':{},'late_paths':{},'blobs':{},'tools':{}}
for r in refs:
    p=git('cat-file','-e',r+'^{commit}')
    data['objects'][r]=dict(exit=p.returncode,stdout=p.stdout.decode(),stderr=p.stderr.decode())
    b=git('show',r+':task-algorithm.md')
    data['algorithm'][r]=dict(exit=b.returncode,**fp(b.stdout))
paths=git('diff','--name-only',refs[1],refs[-1]).stdout.decode().splitlines()
for p in paths+['task-algorithm.md','README.md']:
    b=git('show',refs[-1]+':'+p)
    data['blobs'][p]=dict(exit=b.returncode,**fp(b.stdout))
for old in refs[1:3]:
    b=git('diff','--no-ext-diff','--unified=3',old,refs[-1])
    data['late_paths'][old]=dict(paths=git('diff','--name-only',old,refs[-1]).stdout.decode().splitlines(),**fp(b.stdout))
ab=git('diff','ab2a4efda1d5b16a76f43ac1cd4aa245d5aed9b0',refs[1],'--','task-runner.md')
data['ab2_delta']=dict(exit=ab.returncode,stdout=ab.stdout.decode(),**fp(ab.stdout))
q1=git('show','9d391bad999674c27a52dc5d1e9dae9a61d8c033:doc/open-questions.md').stdout.decode().splitlines()[4]
q2=git('show',refs[1]+':doc/open-questions.md').stdout.decode().splitlines()[4]
data['Q5_equal']=q1==q2
for label,cmd in [('git',['git','--version']),('python',[sys.executable,'--version'])]:
    p=subprocess.run(cmd,capture_output=True)
    data['tools'][label]=dict(exit=p.returncode,stdout=p.stdout.decode(),stderr=p.stderr.decode())
data['tools']['rg_on_PATH']=bool(shutil.which('rg'))
rg=Path.home()/'.cache/opencode/bin/rg.exe'
if rg.is_file():
    p=subprocess.run([str(rg),'--version'],capture_output=True)
    data['tools']['rg_cached']=dict(exit=p.returncode,stdout=p.stdout.decode(),stderr=p.stderr.decode(),**fp(rg.read_bytes()))
data['destinations']={p:Path(p).exists() for p in ['doc/canon/README.md','doc/canon/process.md','doc/canon/decisions/README.md','AGENTS.md','doc/tasks/061-kanon-i-aktualnaya-metodika/current.md','doc/canon/decisions/ADR-0011-canon-update.md']}
text=json.dumps(data,ensure_ascii=False,indent=2)
(O/'precondition-check.json').open('x',encoding='utf-8').write(text)
(O/'precondition.stdout.txt').open('x',encoding='utf-8').write(text+'\n')
print(text)

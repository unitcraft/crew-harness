import sys,pathlib,subprocess,hashlib,json,datetime,re
p=pathlib.Path(__file__).parent;repo=sys.argv[1]
O='f333efa319e445efe029ee6963b477ca8fe3bc1c';C='a449bd2e218e04384d1d42e0c1bffe892495e298';A='ab2a4efda1d5b16a76f43ac1cd4aa245d5aed9b0';Q='9d391bad999674c27a52dc5d1e9dae9a61d8c033'
events=[]
def run(args):
    r=subprocess.run(['git','-C',repo,*args],capture_output=True)
    events.append({'command':['git','-C','<readonly-methodology>',*args],'exit':r.returncode,'bytes':len(r.stdout),'sha256':hashlib.sha256(r.stdout).hexdigest(),'stderr':r.stderr.decode('utf-8')})
    assert r.returncode==0,events[-1]
    return r.stdout
paths=run(['diff','--name-only',O,C]).decode().splitlines()
algs=[run(['show',ref+':task-algorithm.md']) for ref in (O,C,A)]
q1=run(['show',Q+':doc/open-questions.md']).splitlines()[4];q2=run(['show',C+':doc/open-questions.md']).splitlines()[4]
rundiff=run(['diff','--unified=0',A,C,'--','task-runner.md']).decode()
blobs=[]
for ref in (O,C):
    for path in paths:
        b=run(['show',ref+':'+path]);blobs.append({'ref':ref,'path':path,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
remote=['ls-remote','https://github.com/unitcraft/ai-dev-methodology','refs/heads/main']
observed=datetime.datetime.now().astimezone().isoformat()
r=subprocess.run(['git',*remote],capture_output=True)
up={'command':['git',*remote],'observed_at':observed,'exit':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode()}
(p/'upstream.json').write_text(json.dumps(up,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
result={'changed_paths':paths,'algorithm_equal':algs[0]==algs[1]==algs[2],'algorithm_bytes':len(algs[0]),'algorithm_sha256':hashlib.sha256(algs[0]).hexdigest(),'Q5_equal':q1==q2,'ab2_runner_diff':rundiff,'blob_fingerprints':blobs,'events':events}
(p/'source-facts.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
s=json.dumps({k:v for k,v in result.items() if k not in ('events','blob_fingerprints')},ensure_ascii=False,indent=2)+'\n'+json.dumps(up,ensure_ascii=False,indent=2)
(p/'source-facts.stdout.txt').write_text(s+'\n',encoding='utf-8');print(s)

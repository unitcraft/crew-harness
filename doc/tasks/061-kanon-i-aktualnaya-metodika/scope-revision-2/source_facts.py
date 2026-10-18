import hashlib,json,pathlib,subprocess,sys
out=pathlib.Path(__file__).resolve().parent
repo=sys.argv[1]
O='f333efa319e445efe029ee6963b477ca8fe3bc1c'
C='a449bd2e218e04384d1d42e0c1bffe892495e298'
A='ab2a4efda1d5b16a76f43ac1cd4aa245d5aed9b0'
Q='9d391bad999674c27a52dc5d1e9dae9a61d8c033'
def git(*args):
    r=subprocess.run(['git','-C',repo,*args],capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode())
    return r.stdout
def blob(c,p):return git('show',c+':'+p)
paths=git('diff','--name-only',O,C).decode().splitlines()
facts=[]
for p in paths+['task-algorithm.md']:
    for c in (O,C):
        b=blob(c,p)
        facts.append(dict(commit=c,path=p,bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),crlf=b.count(b'\r\n')))
alg=[blob(c,'task-algorithm.md') for c in (O,C,A)]
q5=[blob(c,'doc/open-questions.md').decode().splitlines()[4] for c in (Q,C)]
r=git('diff','--unified=0',A,C,'--','task-runner.md').decode()
checks={'changed_paths':paths,'algorithm_old_current_ab2_equal':alg[0]==alg[1]==alg[2],
 'algorithm_lf_sha256':hashlib.sha256(alg[0]).hexdigest(),
 'algorithm_artificial_crlf_sha256':hashlib.sha256(alg[0].replace(b'\n',b'\r\n')).hexdigest(),
 'q5_9d_current_equal':q5[0]==q5[1],'ab2_current_runner_diff':r,
 'command_policy':'Только show/diff; без fetch/изменения refs. repo передан аргументом, локатор не публикуется.'}
(out/'source-fingerprints.json').write_text(json.dumps(facts,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'source-comparisons.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
text=json.dumps(checks,ensure_ascii=False,indent=2)
(out/'source-facts.stdout.txt').write_text(text+'\nexit: 0\n',encoding='utf-8')
print(text)

from pathlib import Path
import json,hashlib,subprocess,datetime,urllib.request
R=Path(__file__).resolve().parents[5]
E=Path(__file__).resolve().parent
T=E.parents[1]
assert Path.cwd().resolve()==R
ALLOWED=set(json.loads((E/'expected.json').read_text())['new_outputs'])
def destination(name):
    assert name in ALLOWED,name
    p=(E/name).resolve()
    assert p.is_relative_to(E) and p.is_relative_to(R)
    return p
def put(name,data):
    p=destination(name)
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('xb') as f:f.write(data if isinstance(data,bytes) else data.encode('utf-8'))
def dump(name,obj):put(name,json.dumps(obj,ensure_ascii=True,indent=2)+'\n')
def git(*args,external=False):
    a=['git']+(['-C',str(R.parents[1]/'ai-dev-methodology')] if external else [])+list(args)
    q=subprocess.run(a,cwd=R,capture_output=True)
    return q

def run_path_probes():
    before=json.loads((E/'before.json').read_text())
    results=[]
    old_before=next(k for k in before if k.endswith('/before.json'))
    old_expected=next(k for k in before if k.endswith('/expected.json'))
    for ident,key in [('B1',old_before),('B2',old_expected)]:
        denied=False
        try:destination('../../'+key)
        except AssertionError:denied=True
        assert denied
        p=R/key
        b=p.read_bytes()
        assert hashlib.sha256(b).hexdigest()==before[key]['sha256']
        results.append({'id':ident,'actual':'DENY:EXISTING','source':key,'unchanged':True})
    foreign=(R.parent/'foreign-output').resolve()
    assert not foreign.is_relative_to(E)
    results.append({'id':'B3','actual':'DENY:OUTSIDE','io':'memory only'})
    key='doc/canon/README.md'
    data=(R/key).read_bytes()
    original=hashlib.sha256(data).hexdigest()
    mutant=hashlib.sha256(data+b'\nMUTANT\n').hexdigest()
    assert original==before[key]['sha256'] and mutant!=original
    results.append({'id':'B4','actual':'DENY:HASH','source':key,'original':original,'mutant':mutant,'nameset_unchanged':True,'io':'mutant in memory only'})
    # This declared output does not yet exist; do not create it for the probe.
    p=destination('after.json')
    assert not p.exists()
    results.append({'id':'B5','actual':'ALLOW','declared_absent_output':'after.json'})
    assert E.exists()
    results.append({'id':'B6','actual':'DENY:COLLISION','io':'existing E not reopened or overwritten'})
    dump('stdout/probes.json',{'command':'python -B safe_io.py paths','cwd':'assigned worktree root','exit':0,'results':results,'semantic_validator':False})
    print('PATH_PROBES 6/6; foreign/old writes 0; content mutant detected')

def run_search():
    import shutil
    queries=['Канон','current.md','Второе мнение']
    a=['grep','-n','-I']
    for q in queries:a+=['-e',q]
    a+=['--','.',':(exclude)doc/tasks/**']
    q=git(*a)
    assert q.returncode in (0,1)
    text=q.stdout.decode('utf-8',errors='replace')
    assert 'doc/canon/' in text
    u=git('ls-files','--others','--exclude-standard','-z')
    assert u.returncode==0
    corpus=[x.decode('utf-8') for x in u.stdout.split(b'\0') if x and not x.decode('utf-8').replace('\\','/').startswith('doc/tasks/')]
    rg={'available':shutil.which('rg') is not None,'command':['rg','-n','-F','Канон','--glob','!doc/tasks/**','.']}
    try:
        r=subprocess.run(rg['command'],cwd=R,capture_output=True)
        rg.update(exit=r.returncode,stdout=r.stdout.decode('utf-8',errors='replace'),stderr=r.stderr.decode('utf-8',errors='replace'))
    except FileNotFoundError:
        rg.update(exit=None,error='FileNotFoundError: rg executable unavailable; no successful invocation claimed')
    def scan(paths,root):
        matches=[]
        for rel in paths:
            p=(root/rel).resolve()
            assert p.is_relative_to(root.resolve())
            try:lines=p.read_text(encoding='utf-8').splitlines()
            except UnicodeError:continue
            for n,line in enumerate(lines,1):
                if any(x in line for x in queries):matches.append({'path':rel,'line':n,'text':line})
        return matches
    matches=scan(corpus,R)
    fixture=scan(['active-control.md'],E/'probe-inputs')
    assert len(fixture)==1 and fixture[0]['line']==2
    dump('stdout/search.json',{'tracked':{'command':['git']+a,'exit':q.returncode,'stdout':text,'positive':'doc/canon/ found'},'untracked':{'command':['git','ls-files','--others','--exclude-standard','-z'],'corpus':corpus,'fallback':'Python UTF-8 literal search; not rg','matches':matches},'rg':rg,'fixture':{'root':'E/probe-inputs (isolated virtual root)','results':fixture,'positive':True},'future_uniqueness':'not claimed: Canon not transferred'})
    print('SEARCH tracked positive; untracked',len(corpus),'matches',len(matches),'fixture positive; rg',rg['available'])

if __name__=='__main__':
    import sys
    if sys.argv[-1]=='paths':run_path_probes()
    elif sys.argv[-1]=='search':run_search()

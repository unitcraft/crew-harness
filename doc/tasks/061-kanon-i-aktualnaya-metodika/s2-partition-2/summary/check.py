"""One-off synthesis evidence; no product validator or source writes."""
import pathlib, hashlib, json, re, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parents[5]
TASK = ROOT / 'doc/tasks/061-kanon-i-aktualnaya-metodika'
OWN = pathlib.Path(__file__).resolve().parent
CUR = 'a449bd2e218e04384d1d42e0c1bffe892495e298'
OLD = 'f333efa319e445efe029ee6963b477ca8fe3bc1c'
APP = '4b48c50eef1fb46af4f074a80511979b16e515e3'
def sha(b): return hashlib.sha256(b).hexdigest()
def git(root, *args): return subprocess.check_output(['git','-C',str(root),*args])
def blob(root, rev, path): return git(root,'show',rev+':'+path)
def save(name, data):
    p=OWN/name
    if p.exists(): raise SystemExit('refuse overwrite: '+name)
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def external(roots):
    result={}
    for label,root,scope in [('045',pathlib.Path(roots[0]),'doc/tasks/045-runner-registry-jsonc/'),('013',pathlib.Path(roots[1]),'doc/tasks/013-runner-core/')]:
        paths=git(root,'ls-files','-c','-o','--exclude-standard','-z').decode().split('\0')
        result[label]={'head':git(root,'rev-parse','HEAD').decode().strip(),'status':git(root,'status','--porcelain').decode(),'src':(root/'src').exists(),'src_runner_core':(root/'src/runner_core').exists(),'files':{n:sha((root/n).read_bytes()) for n in sorted(set(paths)) if n and (n.startswith(scope) or n.startswith('src/')) and (root/n).is_file()}}
    return result
mode=sys.argv[1]
if mode=='read':
    root,rev,path,ranges=sys.argv[2:6]
    lines=(blob(root,rev,path) if rev!='WORK' else (pathlib.Path(root)/path).read_bytes()).decode('utf-8-sig').splitlines()
    for rr in ranges.split(','):
        a,_,b=rr.partition('-')
        for n in range(int(a),min(int(b or a),len(lines))+1):
            s=lines[n-1]
            for i in range(0,max(1,len(s)),600): print(f'{n}[{i}:{min(i+600,len(s))}]: '+s[i:i+600])
elif mode in ('external-before','external-after'):
    data=external(sys.argv[2:4]); save(mode+'.json',data)
    print('external files='+str({k:len(v['files']) for k,v in data.items()}))
    if mode.endswith('after'):
        before=json.loads((OWN/'external-before.json').read_text(encoding='utf-8'))
        print('external unchanged='+str(data==before)); assert data==before
elif mode=='identity':
    program=(TASK/'s2-partition-2/program.md').read_bytes()
    print('program='+sha(program))
    rows=re.findall(r'\| `([^`]+\.md)` \| `([0-9a-f]{64})`',program.decode()); assert len(rows)==7
    for name,expected in rows:
        raw=(TASK/name).read_bytes(); assert sha(raw)==expected and raw==(TASK/'s2-partition-2/inputs'/name).read_bytes()
        sub=(TASK/'s1p-4/submitted'/name).read_bytes()
        diff=[i for i,(a,b) in enumerate(zip(sub.splitlines(),raw.splitlines()),1) if a!=b]
        assert len(sub.splitlines())==len(raw.splitlines()) and diff==([27,29] if name=='source-inventory.md' else [])
        print(name+' '+sha(raw)+' frozen=equal submitted_changes='+str(diff))
    for part,expected in [('methodology','ebc8a252a7634fbf47225bae32e6d6a4306299b62d5d956c232de1ab07e613ca'),('contract','92f36d21fdd23efd824b850e68dd44ffe2fb43e832404b61b7cd9407d582993a')]:
        actual=sha((TASK/f's2-partition-2/{part}/report.md').read_bytes()); assert actual==expected
        print(part+' report='+actual)
    for folder,pairs in [('methodology',[('protected-before.json','protected-after.json'),('repo-before.json','repo-after.json')]),('contract',[('baseline-before.json','baseline-after.json')])]:
        for a,b in pairs:
            x=json.loads((TASK/f's2-partition-2/{folder}/{a}').read_text(encoding='utf-8')); y=json.loads((TASK/f's2-partition-2/{folder}/{b}').read_text(encoding='utf-8'))
            assert x==y; local=x.get('local',x)
            print(folder+'/'+a+' recorded_equal=True entries='+str(len(local)))
elif mode=='raw':
    meth=pathlib.Path(sys.argv[2]); ext=external(sys.argv[3:5]); inv=(TASK/'source-inventory.md').read_text(encoding='utf-8')
    entries=[(i,blob(meth,CUR,p)) for i,p in enumerate(['README.md','methodology.md','task-algorithm.md','task-sessions.md','task-runner.md','completeness-check.md','doc/open-questions.md'],15)]
    entries += [(i,blob(ROOT,APP,'doc/tasks/031-runner-regulation-in-plugin/'+p)) for i,p in enumerate(['spec.md','spec-trace.md','log.md','task/message.md'],22)]
    entries += [(i,(pathlib.Path(root)/p).read_bytes()) for i,root,p in [(26,sys.argv[3],'doc/tasks/045-runner-registry-jsonc/spec.md'),(27,sys.argv[3],'doc/tasks/045-runner-registry-jsonc/plan.md'),(30,sys.argv[4],'doc/tasks/013-runner-core/spec.md'),(31,sys.argv[4],'doc/tasks/013-runner-core/task/message.md')]]
    for i,b in entries:
        row=next(l for l in inv.splitlines() if l.startswith('| '+str(i)+' |')); assert sha(b) in row
        print('ID'+str(i)+' bytes='+str(len(b))+' sha256='+sha(b)+' match=True')
    raws=[blob(meth,r,'task-algorithm.md') for r in (OLD,CUR,'ab2a4ef')]; assert raws[0]==raws[1]==raws[2]
    print('algorithm LF='+sha(raws[0])+' CRLF='+sha(raws[0].replace(b'\n',b'\r\n'))+' equal_old_current_ab=True')
    q=[blob(meth,r,'doc/open-questions.md').splitlines()[4] for r in (CUR,'9d391ba')]; assert q[0]==q[1]; print('Q5 current=9d391ba')
    print(git(meth,'diff','--unified=0','ab2a4ef',CUR,'--','task-runner.md').decode())
elif mode=='closed':
    s=blob(ROOT,APP,'doc/tasks/031-runner-regulation-in-plugin/spec.md').decode().splitlines()
    assert 'exact four keys' in s[51] and 'kind=meeting' in s[68]
    keys={'tier','effort','reasoning','budget'}
    print('profile: base='+str(len(keys))+'; +family=unknown; -budget=missing')
    print('lens: meeting=legal; agent=illegal; ordinary agent prompt/document=conditional form')
    assert 'availability required/optional' in s[86] and 'owner' in s[94]
    for name,lo,hi,nullable,required,expected in [('exact',1,10,False,True,True),('optional',1,10,False,False,False),('nullable',1,10,True,True,False),('wide',0,10,False,True,False),('narrow',2,8,False,True,True)]:
        actual=required and not nullable and lo>=1 and hi<=10; assert actual==expected
        print('required integer[1,10] <- '+name+': '+str(actual))
    print('local ref: owner required; matching digest alone != registry or API')
    text=(TASK/'spec-trace.md').read_text(encoding='utf-8'); spec=(TASK/'spec.md').read_text(encoding='utf-8')
    for i in [67,68,69,70,71,88,89,90]:
        row=next(l for l in text.splitlines() if l.startswith('| A'+str(i)+' /')); assert 'C-A'+str(i) in row
    for kind,n in [('REQ',6),('AC',8),('DNC',4)]:
        ids=re.findall(r'^'+kind+r'-(\d+)\.',spec,re.M); assert ids==[f'{i:02}' for i in range(1,n+1)]
    print('constraints=8/8; REQ/AC/DNC=6/8/4; these counts are not closure')
elif mode=='cells':
    total=0
    for name in ['method-delta.md','031-impact.md','spec-trace.md','source-inventory.md']:
        cells=[]
        for line in (TASK/name).read_text(encoding='utf-8').splitlines():
            if not line.startswith('|') or re.fullmatch(r'[| :\-]+',line): continue
            tick=False; cell=''; chunks=[]
            for i,ch in enumerate(line):
                if ch=='`': tick=not tick
                if ch=='|' and not tick and (i==0 or line[i-1]!='\\'): chunks.append(cell.strip()); cell=''
                else: cell+=ch
            cells += [len(x) for x in chunks[1:] if x]
        count=sum(n>100 for n in cells); total+=count; print(name+': >100='+str(count)+' max='+str(max(cells)))
    print('total='+str(total)); assert total==133
elif mode=='after':
    before=json.loads((OWN/'protected-before.json').read_text(encoding='utf-8'))
    prefix=TASK.relative_to(ROOT).as_posix()+'/'
    excluded={prefix+x for x in ['progress.log','profile.log','usage.log','spec-review-3.md']}
    now={p.relative_to(ROOT).as_posix():sha(p.read_bytes()) for p in ROOT.rglob('*') if p.is_file() and '.git' not in p.relative_to(ROOT).parts and p.relative_to(ROOT).as_posix() not in excluded and not p.is_relative_to(OWN)}
    save('protected-after.json',now)
    delta=[k for k in sorted(before.keys()|now.keys()) if before.get(k)!=now.get(k)]
    print('protected before='+str(len(before))+' after='+str(len(now))+' changes='+str(len(delta))); print(delta); assert not delta

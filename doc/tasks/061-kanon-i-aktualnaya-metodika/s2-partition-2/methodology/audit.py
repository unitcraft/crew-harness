"""Read-only probes over subjects; writes only this review's new evidence."""
import hashlib, json, pathlib, subprocess, sys, re
ROOT = pathlib.Path(__file__).resolve().parents[5]
TASK = pathlib.Path(__file__).resolve().parents[2]
OWN = pathlib.Path(__file__).resolve().parent
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def protected():
    return {str(p.relative_to(ROOT)).replace('\\','/'): {'sha256':digest(p),'bytes':p.stat().st_size}
            for p in sorted(TASK.rglob('*')) if p.is_file()
            and not p.is_relative_to(OWN)
            and p not in [TASK / x for x in ('progress.log','profile.log','usage.log')]}
def git_bytes(repo, ref, path):
    return subprocess.check_output(['git','-C',str(repo),'show',ref+':'+path])
if sys.argv[1] == 'repo-before':
    names=subprocess.check_output(['git','-C',str(ROOT),'ls-files','--cached','--others','--exclude-standard'],text=True).splitlines()
    data={}
    for name in sorted(set(names)):
        p=ROOT/name
        if p.is_file() and not p.is_relative_to(OWN) and p not in [TASK/x for x in ('progress.log','profile.log','usage.log')]:
            data[name]={'sha256':digest(p),'bytes':p.stat().st_size}
    dest=OWN/'repo-before.json'
    if dest.exists(): raise SystemExit('REFUSE overwrite repo before')
    dest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('repo-before: before any subject evidence beyond snapshot tooling; files='+str(len(data)))
elif sys.argv[1] == 'read':
    repo,ref,path,ranges=sys.argv[2:6]
    lines=git_bytes(repo,ref,path).decode('utf-8').splitlines()
    for rr in ranges.split(','):
        bits=rr.split('-'); a=int(bits[0]); b=int(bits[-1])
        for n in range(a,b+1):
            line=lines[n-1]
            for i in range(0,max(1,len(line)),700): print(f'{n}[{i}:{min(i+700,len(line))}]: {line[i:i+700]}')
elif sys.argv[1] == 'diff':
    repo,path,ranges=sys.argv[2:5]
    lines=subprocess.check_output(['git','-C',repo,'diff','--unified=0','f333efa319e445efe029ee6963b477ca8fe3bc1c','a449bd2e218e04384d1d42e0c1bffe892495e298','--',path]).decode('utf-8').splitlines()
    for rr in ranges.split(','):
        bits=rr.split('-'); a=int(bits[0]); b=min(int(bits[-1]),len(lines))
        for n in range(a,b+1):
            line=lines[n-1]
            for i in range(0,max(1,len(line)),700): print(f'diff{n}[{i}:{min(i+700,len(line))}]: {line[i:i+700]}')
elif sys.argv[1] == 'identity':
    program=(TASK/'s2-partition-2/program.md').read_text(encoding='utf-8')
    subjects=re.findall(r'\| `([^`]+\.md)` \| `([0-9a-f]{64})` \|',program)
    for name,expected in subjects:
        p=TASK/name; frozen=TASK/'s2-partition-2/inputs'/name
        print(f'{name}: bytes={p.stat().st_size} sha256={digest(p)} frozen={p.read_bytes()==frozen.read_bytes()} expected={digest(p)==expected}')
    spec=(TASK/'spec.md').read_text(encoding='utf-8')
    for kind in ['REQ','AC','DNC']:
        ids=re.findall(r'^'+kind+r'-(\d+)\.',spec,re.M)
        print(kind+'='+str(len(ids))+' sequence='+str(ids==[f'{n:02}' for n in range(1,len(ids)+1)]))
    trace=(TASK/'spec-trace.md').read_text(encoding='utf-8')
    atoms=re.findall(r'^\| A(\d+) / (\d+) \|',trace,re.M)
    print(f'atoms={len(atoms)} paragraphs={len(set(x[1] for x in atoms))} not_requirement='+str(len(re.findall(r'^\| A.*\| Не требование:',trace,re.M))))
    inventory=(TASK/'source-inventory.md').read_text(encoding='utf-8')
    ids=re.findall(r'^\| (\d+) \|',inventory,re.M)
    print('sources='+str(len(ids))+' sequence='+str(ids==[str(n) for n in range(1,63)]))
    print('review2='+digest(TASK/'spec-review-2.md'))
    for name,_ in subjects:
        sub=TASK/'s1p-4/submitted'/name
        if sub.exists():
            a=sub.read_bytes(); b=(TASK/name).read_bytes()
            changed=[i for i,(x,y) in enumerate(zip(a.splitlines(),b.splitlines()),1) if x!=y]
            print('submitted '+name+': sha256='+digest(sub)+' changed_lines='+str(changed)+' same_line_count='+str(len(a.splitlines())==len(b.splitlines())))
elif sys.argv[1] == 'hashes':
    repo=pathlib.Path(sys.argv[2]); ref='a449bd2e218e04384d1d42e0c1bffe892495e298'
    inv=(TASK/'source-inventory.md').read_text(encoding='utf-8')
    for ident,path in [(15,'README.md'),(16,'methodology.md'),(17,'task-algorithm.md'),(18,'task-sessions.md'),(19,'task-runner.md'),(20,'completeness-check.md'),(21,'doc/open-questions.md')]:
        raw=git_bytes(repo,ref,path); sha=hashlib.sha256(raw).hexdigest(); row=next(l for l in inv.splitlines() if l.startswith('| '+str(ident)+' |'))
        print(f'ID{ident} {path}: bytes={len(raw)} LF={raw.count(bytes([10]))} CRLF={raw.count(bytes([13,10]))} sha256={sha} inventory_match={sha in row}')
    for ident,path in [(22,'spec.md'),(23,'spec-trace.md'),(24,'log.md'),(25,'task/message.md')]:
        raw=git_bytes(ROOT,'4b48c50eef1fb46af4f074a80511979b16e515e3','doc/tasks/031-runner-regulation-in-plugin/'+path)
        sha=hashlib.sha256(raw).hexdigest(); row=next(l for l in inv.splitlines() if l.startswith('| '+str(ident)+' |'))
        print(f'ID{ident} approved031/{path}: bytes={len(raw)} sha256={sha} inventory_match={sha in row}')
    for ident,base,path in [(26,sys.argv[3],'spec.md'),(27,sys.argv[3],'plan.md'),(30,sys.argv[4],'spec.md'),(31,sys.argv[4],'task/message.md')]:
        p=pathlib.Path(base)/path; row=next(l for l in inv.splitlines() if l.startswith('| '+str(ident)+' |'))
        declared=re.findall(r'(?:SHA|raw)([0-9a-f]{60,})',row)
        print(f'ID{ident}: bytes={p.stat().st_size} sha256={digest(p)} declared={declared} match={digest(p) in row}')
elif sys.argv[1] == 'delta':
    repo=sys.argv[2]; old='f333efa319e445efe029ee6963b477ca8fe3bc1c'; cur='a449bd2e218e04384d1d42e0c1bffe892495e298'; ab='ab2a4efda1d5b16a76f43ac1cd4aa245d5aed9b0'
    paths=subprocess.check_output(['git','-C',repo,'diff','--name-only',old,cur],text=True).splitlines()
    print('changed_paths='+str(len(paths)))
    for path in paths:
        diff=subprocess.check_output(['git','-C',repo,'diff','--unified=0',old,cur,'--',path],text=True)
        hunks=re.findall(r'^@@.*?@@',diff,re.M)
        print(path+': '+str(len(hunks))+' '+ ' '.join(hunks))
    raws=[git_bytes(repo,r,'task-algorithm.md') for r in (old,cur,ab)]
    print('algorithm_old_current_ab_equal='+str(raws[0]==raws[1]==raws[2])+' bytes='+str(len(raws[0]))+' raw='+hashlib.sha256(raws[0]).hexdigest()+' CRLF='+hashlib.sha256(raws[0].replace(b'\n',b'\r\n')).hexdigest())
    for ref in (old,cur):
        line=git_bytes(repo,ref,'task-sessions.md').decode().splitlines()[65]
        print(ref[:7]+' S66 clarification='+str('Если цель уточнена' in line))
    oq=git_bytes(repo,'9d391bad999674c27a52dc5d1e9dae9a61d8c033','doc/open-questions.md').splitlines()[4]
    print('Q5_9d391ba_current_equal='+str(oq==git_bytes(repo,cur,'doc/open-questions.md').splitlines()[4]))
    print('ab2_to_current_runner:')
    print(subprocess.check_output(['git','-C',repo,'diff','--unified=0',ab,cur,'--','task-runner.md'],text=True))
elif sys.argv[1] == 'cells':
    for name in ['method-delta.md','031-impact.md','spec-trace.md','source-inventory.md']:
        cells=[]
        for n,line in enumerate((TASK/name).read_text(encoding='utf-8').splitlines(),1):
            if not line.startswith('|') or re.fullmatch(r'[| :\-]+',line): continue
            chunks=[]; part=''; tick=False
            for i,ch in enumerate(line):
                if ch=='`': tick=not tick
                if ch=='|' and not tick and (i==0 or line[i-1]!='\\'):
                    chunks.append(part.strip()); part=''
                else: part+=ch
            for index,cell in enumerate(chunks[1:],1):
                if cell: cells.append((len(cell),n,index))
        long=[x for x in cells if x[0]>100]
        maximum=max(cells)
        print(f'{name}: cells_gt100={len(long)} max_chars={maximum[0]} line={maximum[1]} column={maximum[2]}')
elif sys.argv[1] == 'repo-after':
    old=json.loads((OWN/'repo-before.json').read_text(encoding='utf-8'))
    names=subprocess.check_output(['git','-C',str(ROOT),'ls-files','--cached','--others','--exclude-standard'],text=True).splitlines()
    new={}
    for name in sorted(set(names)):
        p=ROOT/name
        if p.is_file() and not p.is_relative_to(OWN) and p not in [TASK/x for x in ('progress.log','profile.log','usage.log')]:
            new[name]={'sha256':digest(p),'bytes':p.stat().st_size}
    changes=[k for k in sorted(old.keys()|new.keys()) if old.get(k)!=new.get(k)]
    print(f'repo protected before={len(old)} after={len(new)} changes={len(changes)}')
    print('\n'.join(changes) or 'UNCHANGED')
    (OWN/'repo-after.json').write_text(json.dumps(new,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if sys.argv[1] == 'before':
    out=OWN/'protected-before.json'
    if out.exists(): raise SystemExit('REFUSE overwrite before')
    data=protected(); out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('before: after program, Canon entry and task/message reads; before subject reads and subject evidence; protected files='+str(len(data)))
elif sys.argv[1] == 'after':
    old=json.loads((OWN/'protected-before.json').read_text(encoding='utf-8')); new=protected()
    changes=[k for k in sorted(old.keys()|new.keys()) if old.get(k)!=new.get(k)]
    print('protected before='+str(len(old))+' after='+str(len(new))+' changes='+str(len(changes)))
    print('\n'.join(changes) or 'UNCHANGED')
    (OWN/'protected-after.json').write_text(json.dumps(new,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

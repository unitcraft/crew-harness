"""Read-only probes; writes only this session's new summary evidence."""
from pathlib import Path
import hashlib, json, subprocess, sys, re
ROOT = Path.cwd()
TASK = ROOT / 'doc/tasks/061-kanon-i-aktualnaya-metodika'
OUT = TASK / 's2-partition-1/summary'
def sha(b): return hashlib.sha256(b).hexdigest()
def git(repo, *args): return subprocess.check_output(['git','-C',str(repo),*args])
def snapshot():
    files = list(TASK.rglob('*')) + list((ROOT/'doc/canon').rglob('*'))
    files += [ROOT/'AGENTS.md', ROOT/'.opencode/crew-harness.json']
    files += list((ROOT/'opencode-plugin').rglob('*'))
    files += list((ROOT/'.opencode').rglob('*'))
    result = {}
    for p in sorted(set(files)):
        if not p.is_file() or OUT in p.parents: continue
        if p.parent == TASK and p.name in {'progress.log','profile.log','usage.log','spec-review-2.md'}: continue
        result[p.relative_to(ROOT).as_posix()] = sha(p.read_bytes())
    return result
mode = sys.argv[1]
if mode in ('before','after'):
    s = snapshot()
    if mode == 'before':
        target=OUT/'before.json'
        if target.exists(): target=OUT/'before-expanded.json'
        assert not target.exists()
        target.write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
        print('BEFORE protected',len(s),'manifest',sha(json.dumps(s,sort_keys=True).encode()))
    else:
        old=json.loads((OUT/'before-expanded.json').read_text(encoding='utf-8'))
        changed=[k for k in sorted(set(old)|set(s)) if old.get(k)!=s.get(k)]
        (OUT/'after.json').write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
        print('AFTER protected',len(s),'changed',len(changed),changed)
        assert not changed
elif mode == 'identity':
    program=(TASK/'s2-partition-1/program.md').read_text(encoding='utf-8')
    rows=re.findall(r'\| `([^`]+\.md)` \| `([0-9a-f]{64})`',program)
    for name, expected in rows:
        a=sha((TASK/name).read_bytes()); b=sha((TASK/'s2-partition-1/inputs'/name).read_bytes())
        print(name,a,'IDENTICAL' if a==b==expected else 'MISMATCH'); assert a==b==expected
    for part,expected in [('methodology','0c8e819380ed888c355fd37d40facd758566b8bad21a752e24f2b683e7d8d81f'),('contract','a2eecd72c7544eae3177d48629d5ca7aea9105d604b7b6e389246598facd9d9c')]:
        actual=sha((TASK/'s2-partition-1'/part/'report.md').read_bytes());print(part,actual);assert actual==expected
    text=(TASK/'spec.md').read_text(encoding='utf-8')
    print('COUNTS',*[len(re.findall('^'+x+r'-\d+\.',text,re.M)) for x in ['REQ','AC','DNC']], 'SOURCES',len(re.findall(r'^\d+\. ',text.split('## Опись источников')[1],re.M)))
    print('HEAD',git(ROOT,'rev-parse','HEAD').decode().strip())
elif mode == 'delta':
    repo=Path(sys.argv[2]); old='f333efa319e445efe029ee6963b477ca8fe3bc1c'; new='a449bd2e218e04384d1d42e0c1bffe892495e298'
    print(git(repo,'diff','--name-status',old,new).decode())
    a=git(repo,'show',new+':task-algorithm.md');b=git(repo,'show',old+':task-algorithm.md')
    print('ALGORITHM raw',sha(a),'CRLF',sha(a.replace(b'\n',b'\r\n')),'old_equal',a==b)
    print(git(repo,'diff','--unified=3',old,new,'--','task-sessions.md').decode())
elif mode in ('external-before','external-after'):
    repo,p45,p13=map(Path,sys.argv[2:5]); records={}
    for label,base in [('045',p45),('013',p13/'doc/tasks/013-runner-core')]:
        if not base.exists():
            matches=list((p13/'doc/tasks').glob('013-*')); assert len(matches)==1; base=matches[0]
        for f in sorted(base.rglob('*')):
            if f.is_file():records[label+'/'+f.relative_to(base).as_posix()]=sha(f.read_bytes())
    for r,label in [(repo,'methodology'),(p45,'045'),(p13,'013')]:
        records[label+'/HEAD']=git(r,'rev-parse','HEAD').decode().strip()
        records[label+'/status']=git(r,'status','--short').decode()
    c=json.loads((TASK/'s2-partition-1/contract/baseline.json').read_text())
    diff=[r['boundary']+'/'+r['file'] for r in c if 'boundary'in r and records.get(r['boundary']+'/'+r['file'])!=r['sha256']]
    print('CONTRACT boundary records',sum('boundary'in r for r in c),'differences',diff)
    for rev,label,paths,r in [('a449bd2e218e04384d1d42e0c1bffe892495e298','methodology',['README.md','methodology.md','task-algorithm.md','task-sessions.md','task-runner.md','completeness-check.md','doc/open-questions.md'],repo),('4b48c50eef1fb46af4f074a80511979b16e515e3','031',['spec.md','spec-trace.md','log.md','task/message.md'],ROOT)]:
        for path in paths:records[label+'/git/'+path]=sha(git(r,'show',rev+':'+('doc/tasks/031-runner-regulation-in-plugin/' if label=='031' else '')+path))
    target=OUT/(mode+'.json'); assert not target.exists()
    target.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    print('EXTERNAL',len(records),'manifest',sha(json.dumps(records,sort_keys=True).encode()))
    if mode.endswith('after'):
        old=json.loads((OUT/'external-before.json').read_text(encoding='utf-8'))
        changed=[k for k in sorted(set(old)|set(records)) if old.get(k)!=records.get(k)]
        print('EXTERNAL changes',changed);assert not changed
elif mode == 'baselines':
    m=json.loads((TASK/'s2-partition-1/methodology/baseline.json').read_text())
    c=json.loads((TASK/'s2-partition-1/contract/baseline.json').read_text())
    print('M baseline',type(m).__name__,len(m),'C baseline',type(c).__name__,len(c))
    print('C keys',list(c) if isinstance(c,dict) else 'list')
    historical=[k for k in m if k.startswith('doc/tasks/061-') and Path(k).name in {'progress.log','profile.log','usage.log'}]
    for k in historical: print('HISTORICAL',k,sha((ROOT/k).read_bytes())==m[k],m[k])
    print('HISTORICAL count',len(historical))
    changed=[k for k,v in m.items() if not (ROOT/k).exists() or sha((ROOT/k).read_bytes())!=v]
    print('M baseline differences in synthesis copy',changed)
elif mode == 'hygiene':
    import ast
    ast.parse((OUT/'check.py').read_text(encoding='utf-8'))
    files=sorted(OUT.glob('*.md'))+[TASK/'spec-review-2.md']
    bad=[]
    for f in files:
        raw=f.read_bytes();text=raw.decode('utf-8')
        if raw.startswith(b'\xef\xbb\xbf') or any(x.rstrip()!=x for x in text.splitlines()) or re.search(r'[A-Z]:[/\\]',text):bad.append(f.name)
    print('HYGIENE markdown',len(files),'bad',bad,'python AST OK');assert not bad
    print('REPORT SHA',sha((TASK/'spec-review-2.md').read_bytes()))
elif mode == 'boundaryfacts':
    p13=Path(sys.argv[2])
    print('013 src', (p13/'src').exists(),'runner',(p13/'src/runner_core').exists(),'tracked-src',git(p13,'ls-files','--','src').decode().splitlines())
    names=['journal.ts','task-folders.ts','tasks.ts','core.ts','index.ts','README.md','progress.ts']
    for name in names:
        path='opencode-plugin/'+name;raw=git(ROOT,'show','492c166:'+path)
        print('PLUGIN',name,sha(raw),'raw_equal',raw==(ROOT/path).read_bytes());assert raw==(ROOT/path).read_bytes()
    print('PROPOSED format exists',(ROOT/'src/runner_core/regulation/format.md').exists(),'current061',(TASK/'current.md').exists())
elif mode == 'pairs':
    for label,start,k,final,reason in [('shared',2,2,2,False),('lowN',2,1,2,False),('isolated-overstated',2,1,2,True),('author-finalN',2,1,1,True),('lowered-no-reason',2,1,1,False)]:
        print(label,'startN',start,'k',k,'finalN',final,'old_final_equality',k==final,'current_start_condition',k>=start or reason)
    for label,kind,keys in [('control','meeting',{'tier','effort','reasoning','budget'}),('agent-lens','agent',{'tier','effort','reasoning','budget'}),('extra-family','meeting',{'tier','effort','reasoning','budget','family'})]:
        print(label,'lens_meeting_limit',kind=='meeting','profile_exact4',keys=={'tier','effort','reasoning','budget'})
    print('CONTROLS 5 arithmetic + 3 single-mutation; not full validator/runtime')
elif mode == 'coverage':
    repo=Path(sys.argv[2]); diff=git(repo,'diff','--unified=0','f333efa','a449bd2').decode()
    path=None
    for line in diff.splitlines():
        if line.startswith('+++ b/'):path=line[6:]
        elif line.startswith('@@'):print(path,line.split('@@')[1].strip())
    fm=(TASK/'s2-partition-1/methodology/fragment-map.md').read_text(encoding='utf-8')
    counts=[int(x) for x in re.findall(r'^\| \d+ \|.*?\| (\d+) \|',fm,re.M)]
    matrix=(TASK/'s2-partition-1/contract/matrix.md').read_text(encoding='utf-8')
    rows=[x for x in matrix.splitlines() if x.startswith('| ') and not x.startswith('| Точная')]
    print('ATOMS',len(counts),sum(counts),counts,'MATRIX',len(rows))
    trace=(TASK/'spec-trace.md').read_text(encoding='utf-8').split('## Локаторы')[0]
    print('AUTHOR trace rows',sum(x.startswith('| `') for x in trace.splitlines()))
elif mode == 'anchors':
    repo,rev,path=sys.argv[2:5];lines=git(repo,'show',rev+':'+path).decode().splitlines()
    for item in sys.argv[5].split(','):
        parts=item.split('-');lo=int(parts[0]);hi=int(parts[-1])
        for n in range(lo,hi+1):
            line=lines[n-1]
            for start in range(0,max(1,len(line)),850):print(f'{n}[{start}:{min(start+850,len(line))}]: '+line[start:start+850])
elif mode == 'closed':
    raw=git(ROOT,'show','4b48c50eef1fb46af4f074a80511979b16e515e3:doc/tasks/031-runner-regulation-in-plugin/spec.md').decode().splitlines()
    for n in [19,23,28,52,69,97,259,279,281,309,325,329,500,504,540,568,670]: print(str(n)+': '+raw[n-1])
else: raise SystemExit('unknown probe')

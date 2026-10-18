"""Полный текстовый diff, raw отпечатки и последняя заморозка авторского пакета."""
import difflib,hashlib,json,pathlib,shutil,subprocess,sys
out=pathlib.Path(__file__).resolve().parent
task=out.parent
root=task.parents[2]
names=['spec.md','analysis.md','spec-trace.md','method-delta.md']
expected={
 'spec.md':'d532591dab15272455f13cd5061042aa49795847cb24cd76c3a90e80865b1619',
 'analysis.md':'b4db7e330788bb3f8da230ab8ed40345d8444342d4c1c87dbb909c5801dcfdf6',
 'spec-trace.md':'4007a000c94a81921e3b20148953950094a76162fe5f9898a94b07066b7db9ed',
 'method-delta.md':'6e77dd61ef26e03417004681ad52205d109ac91a6c26116e5685ad562e01a88a'}
def fp(b):return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'crlf':b.count(b'\r\n'),'lf':b.count(b'\n')}
def write(p,obj):p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
mode=sys.argv[1]
if mode=='diff':
    facts={}
    for n in names:
        old=(out/'before'/n).read_bytes();new=(task/n).read_bytes()
        facts[n]={'before':fp(old),'after':fp(new),'expected_before':expected[n],'before_matches':fp(old)['sha256']==expected[n]}
        diff=''.join(difflib.unified_diff([s+'\n' for s in old.decode().splitlines()],[s+'\n' for s in new.decode().splitlines()],fromfile='before/'+n,tofile=n))
        (out/(n+'.diff')).write_text(diff,encoding='utf-8')
    write(out/'document-fingerprints.json',facts)
    print(json.dumps(facts,ensure_ascii=False,indent=2))
    assert all(x['before_matches'] for x in facts.values())
elif mode=='state':
    facts={}
    for args in (['rev-parse','HEAD'],['branch','--show-current'],['status','--porcelain=v1','--untracked-files=all']):
        r=subprocess.run(['git',*args],cwd=root,capture_output=True,text=True,encoding='utf-8')
        facts[' '.join(args)]={'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
    write(out/'after-git-state.json',facts)
    before=json.loads((out/'before/git-state.json').read_text(encoding='utf-8'))
    same=all(facts[k]['stdout']==before[k]['stdout'] for k in ('rev-parse HEAD','branch --show-current'))
    print(json.dumps({'head_branch_unchanged':same,'head':facts['rev-parse HEAD']['stdout'].strip(),'branch':facts['branch --show-current']['stdout'].strip()},ensure_ascii=False))
    assert same
elif mode=='freeze':
    dest=out/'submitted'
    if dest.exists():raise SystemExit('submitted уже существует; перезапись запрещена')
    inputs=[task/n for n in names]+[task/'scope-revision-2.md']
    inputs+=sorted(p for p in out.rglob('*') if p.is_file() and dest not in p.parents)
    manifest={}
    for p in inputs:
        rel=p.relative_to(task)
        b=p.read_bytes()
        target=dest/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(b)
        assert target.read_bytes()==b
        manifest[rel.as_posix()]=fp(b)
    write(dest/'manifest.json',manifest)
    # После manifest — только проверка raw bytes, никаких изменений пакета.
    bad=[rel for rel,info in manifest.items() if fp((dest/rel).read_bytes())!=info or (task/rel).read_bytes()!=(dest/rel).read_bytes()]
    print(json.dumps({'frozen_files':len(manifest),'raw_byte_mismatches':bad,'manifest':'scope-revision-2/submitted/manifest.json'},ensure_ascii=False))
    assert not bad
else:raise SystemExit(mode)

import difflib, hashlib, json, pathlib, sys
E=pathlib.Path(__file__).resolve().parent
T=E.parent
def digest(p):
    b=p.read_bytes()
    return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
if sys.argv[1]=='diff':
    out=E/'old-to-new-plan.diff'
    if out.exists(): raise SystemExit('STOP existing full diff')
    a=(E/'old-plan.md').read_bytes().decode('utf-8').splitlines(keepends=True)
    b=(T/'plan.md').read_bytes().decode('utf-8').splitlines(keepends=True)
    out.write_text(''.join(difflib.unified_diff(a,b,fromfile='old-plan.md',tofile='plan.md')),encoding='utf-8',newline='')
    print(json.dumps({'old':digest(E/'old-plan.md'),'new':digest(T/'plan.md'),'diff':digest(out)},indent=2))
elif sys.argv[1]=='freeze':
    dest=E/'submitted'
    if dest.exists(): raise SystemExit('STOP submitted exists')
    source=[T/'plan.md',T/'plan-scope-1.md']+[p for p in sorted(E.rglob('*')) if p.is_file()]
    copies={}
    dest.mkdir()
    for p in source:
        rel=p.relative_to(T)
        q=dest/rel
        q.parent.mkdir(parents=True,exist_ok=True)
        q.write_bytes(p.read_bytes())
        assert q.read_bytes()==p.read_bytes(),str(rel)
        copies[rel.as_posix()]=digest(p)
    (dest/'manifest.json').write_text(json.dumps({'scope':'raw plan, report and own evidence; excludes self-manifest and mutable root journals','files':copies},ensure_ascii=False,indent=2),encoding='utf-8')
    manifest=json.loads((dest/'manifest.json').read_text(encoding='utf-8'))
    checked=all(digest(dest/path)==facts for path,facts in manifest['files'].items())
    print(json.dumps({'raw_copies':len(copies),'all_bytes_equal':checked,'manifest':digest(dest/'manifest.json')},ensure_ascii=False,indent=2))
    sys.exit(0 if checked else 1)

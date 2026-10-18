"""Собственный raw-снимок дерева; payload .git не сохраняется."""
import hashlib, json, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[4]
task = pathlib.Path('doc/tasks/061-kanon-i-aktualnaya-metodika')
out = root / task / 'scope-revision-2'
allowed = [str(task / n).replace('\\', '/') for n in ('spec.md','analysis.md','spec-trace.md','method-delta.md')]
excluded = {str(task / n).replace('\\', '/') for n in ('progress.log','profile.log','usage.log','scope-revision-2.md')}
def inventory():
    result = {}
    for p in sorted(root.rglob('*')):
        if not p.is_file(): continue
        rel = p.relative_to(root).as_posix()
        if rel in excluded or rel.startswith(task.as_posix() + '/scope-revision-2/'): continue
        b = p.read_bytes()
        result[rel] = {'bytes':len(b), 'sha256':hashlib.sha256(b).hexdigest()}
    return result
mode = sys.argv[1]
if mode == 'before':
    target = out / 'before'
    if target.exists(): raise SystemExit('before уже существует; перезапись запрещена')
    target.mkdir(parents=True)
    data = inventory()
    for rel in allowed: (target / pathlib.Path(rel).name).write_bytes((root / rel).read_bytes())
    (target / 'manifest.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    state = {}
    for args in (['rev-parse','HEAD'],['branch','--show-current'],['status','--porcelain=v1','--untracked-files=all']):
        r = subprocess.run(['git',*args],cwd=root,capture_output=True,text=True,encoding='utf-8')
        state[' '.join(args)] = {'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
    (target / 'git-state.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'files':len(data),'allowed_in_before':all(x in data for x in allowed),'git_file':data.get('.git')},ensure_ascii=False))
elif mode == 'after':
    before = json.loads((out/'before/manifest.json').read_text(encoding='utf-8'))
    after = inventory()
    changed = [x for x in sorted(before.keys()|after.keys()) if before.get(x)!=after.get(x)]
    report = {'files_before':len(before),'files_after':len(after),'changed':changed,'unexpected':[x for x in changed if x not in allowed]}
    (out/'after-manifest.json').write_text(json.dumps(after,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'protected-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(bool(report['unexpected']))
else: raise SystemExit('before | after')

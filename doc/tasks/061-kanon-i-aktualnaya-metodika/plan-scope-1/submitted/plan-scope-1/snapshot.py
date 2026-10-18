import hashlib, json, pathlib, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parents[4]
TASK = ROOT / 'doc/tasks/061-kanon-i-aktualnaya-metodika'
E = TASK / 'plan-scope-1'
def inventory():
    out = {}
    excluded = {TASK / x for x in ('plan-scope-1.md', 'progress.log', 'profile.log', 'usage.log')}
    for p in sorted(ROOT.rglob('*')):
        if not p.is_file() or p in excluded or E in p.parents:
            continue
        b = p.read_bytes()
        out[p.relative_to(ROOT).as_posix()] = {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
    return out
if sys.argv[1] == 'before':
    target = E / 'before.json'
    if target.exists(): raise SystemExit('STOP: before already exists')
    data = inventory()
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    (E / 'old-plan.md').write_bytes((TASK / 'plan.md').read_bytes())
    git = {arg: subprocess.check_output(['git', *args], cwd=ROOT).decode('utf-8') for arg, args in {
        'head': ['rev-parse', 'HEAD'], 'branch': ['branch', '--show-current'], 'status': ['status', '--porcelain=v1', '--untracked-files=all']}.items()}
    (E / 'git-before.json').write_text(json.dumps(git, ensure_ascii=False, indent=2), encoding='utf-8')
    print('before files:', len(data)); print(json.dumps(git, ensure_ascii=False))
elif sys.argv[1] == 'after':
    before = json.loads((E / 'before.json').read_text(encoding='utf-8'))
    after = inventory()
    changed = [k for k in before if before[k] != after.get(k)]
    added = sorted(set(after) - set(before))
    result = {'changed': changed, 'added': added, 'before_count':len(before), 'after_count':len(after)}
    target = E / 'after.json'
    if target.exists(): raise SystemExit('STOP: after already exists')
    target.write_text(json.dumps({'inventory': after, 'comparison': result}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if changed == ['doc/tasks/061-kanon-i-aktualnaya-metodika/plan.md'] and not added else 1)

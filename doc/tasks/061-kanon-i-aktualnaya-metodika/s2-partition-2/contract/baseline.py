"""Read-only source fingerprints; writes only a new evidence file beside this script."""
import hashlib, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[5]
TASK = 'doc/tasks/061-kanon-i-aktualnaya-metodika/'
OUT = TASK + 's2-partition-2/contract/'
MUTABLE = {TASK + x for x in ('progress.log', 'profile.log', 'usage.log')}

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])

def scan():
    paths = sorted(set(git(ROOT, 'ls-files', '-c', '-o', '--exclude-standard', '-z').decode().split('\0')) - {''})
    local = {}
    for name in paths:
        if name in MUTABLE or name.startswith(OUT):
            continue
        p = ROOT / name
        if p.is_file():
            local[name] = hashlib.sha256(p.read_bytes()).hexdigest()
    result = {'local': local, 'external': {}}
    for label, root, scope in (
        ('045', pathlib.Path(sys.argv[2]), 'doc/tasks/045-runner-registry-jsonc'),
        ('013', pathlib.Path(sys.argv[3]), 'doc/tasks/013-runner-core'),
    ):
        names = sorted(set(git(root, 'ls-files', '-c', '-o', '--exclude-standard', '-z').decode().split('\0')) - {''})
        entries = {}
        for name in names:
            if name.startswith(scope + '/') or (label == '013' and name.startswith('src/')):
                p = root / name
                if p.is_file():
                    entries[name] = hashlib.sha256(p.read_bytes()).hexdigest()
        result['external'][label] = {'head': git(root, 'rev-parse', 'HEAD').decode().strip(),
            'status': git(root, 'status', '--porcelain').decode(), 'files': entries,
            'src_runner_core_exists': (root / 'src/runner_core').exists()}
    result['head'] = git(ROOT, 'rev-parse', 'HEAD').decode().strip()
    return result

if __name__ == '__main__':
    mode = sys.argv[1]
    data = scan()
    dest = pathlib.Path(__file__).with_name('baseline-' + mode + '.json')
    if dest.exists():
        raise SystemExit('refuse overwrite')
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('head=' + data['head'])
    print('protected_local=' + str(len(data['local'])))
    print('nested_journals=' + str(sum(p.startswith(TASK) and p not in MUTABLE and p.endswith(('progress.log','profile.log','usage.log')) for p in data['local'])))
    print('external=' + str({k: len(v['files']) for k, v in data['external'].items()}))
    if mode == 'after':
        before = json.loads(dest.with_name('baseline-before.json').read_text(encoding='utf-8'))
        print('unchanged=' + str(before == data))
        for area in ('local', 'external'):
            if before[area] != data[area]:
                print('CHANGED=' + area)

"""Local read-only source locators. Absolute paths are never written to evidence."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parents[4].parent
METHOD = BASE / 'ai-dev-methodology'
W045 = BASE / 'worktrees/task-22-runner-registry-spec'
W013 = BASE / 'worktrees/task-013-runner-core'
PIN = 'a449bd2e218e04384d1d42e0c1bffe892495e298'
OLD = 'f333efa319e445efe029ee6963b477ca8fe3bc1c'
APPROVED = '4b48c50eef1fb46af4f074a80511979b16e515e3'

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])

def baseline():
    out = {}
    for label, root, sub in [('045', W045, 'doc/tasks/045-runner-registry-jsonc'),
                             ('013', W013, '')]:
        files = {}
        for p in (root / sub).rglob('*'):
            if p.is_file() and '.git' not in p.parts and 'node_modules' not in p.parts:
                files[p.relative_to(root).as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
        out[label] = {'files': files, 'head': git(root, 'rev-parse', 'HEAD').decode().strip(),
                      'status': git(root, 'status', '--porcelain').decode('utf-8'),
                      'src': (root / 'src').exists(),
                      'runner_core': (root / 'src/runner_core').exists()}
    out['method'] = {'head': git(METHOD, 'rev-parse', 'HEAD').decode().strip(),
                     'status': git(METHOD, 'status', '--porcelain').decode('utf-8')}
    return out

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    mode = sys.argv[1]
    if mode in ['before', 'after']:
        dest = HERE / f'external-{mode}.json'
        assert not dest.exists()
        obj = baseline()
        dest.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print({k: len(v.get('files', {})) for k, v in obj.items()})
    elif mode == 'method':
        path, start, end = sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
        rev = sys.argv[5] if len(sys.argv) > 5 else PIN
        lines = git(METHOD, 'show', f'{rev}:{path}').decode('utf-8').splitlines()
        print(f'{path}@{rev} total={len(lines)} range={start}-{min(end,len(lines))}')
        for n in range(start, min(end, len(lines)) + 1):
            print(f'{n}: {lines[n-1]}')
    elif mode == '031':
        start, end = int(sys.argv[2]), int(sys.argv[3])
        lines = git(HERE.parents[3], 'show', f'{APPROVED}:doc/tasks/031-runner-regulation-in-plugin/spec.md').decode('utf-8').splitlines()
        for n in range(start, min(end, len(lines)) + 1):
            print(f'{n}: {lines[n-1]}')

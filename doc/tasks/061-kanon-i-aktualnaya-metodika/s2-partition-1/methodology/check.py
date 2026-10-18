"""Лёгкие адресные пробы С2м; не валидатор нормативного содержания."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

p = argparse.ArgumentParser()
p.add_argument('--methodology', required=True)
p.add_argument('--baseline', action='store_true')
a = p.parse_args()
root = Path(__file__).resolve().parents[5]
task = root / 'doc/tasks/061-kanon-i-aktualnaya-metodika'
out = Path(__file__).parent
names = ['spec.md', 'analysis.md', '031-impact.md', 'spec-trace.md',
         'spec-fixes-1.md', 'spec-fixes-2.md', 'spec-fixes-3.md']
sha = lambda b: hashlib.sha256(b).hexdigest()
def git(*args):
    return subprocess.check_output(['git', '-C', a.methodology, *args])

manifest = {}
for f in sorted(root.rglob('*')):
    if not f.is_file() or '.git' in f.parts:
        continue
    rel = f.relative_to(root).as_posix()
    if rel.startswith('doc/tasks/'):
        if not rel.startswith('doc/tasks/061-kanon-i-aktualnaya-metodika/'):
            continue
        if '/s2-partition-1/methodology/' in rel or rel in {
            'doc/tasks/061-kanon-i-aktualnaya-metodika/' + n
            for n in ['progress.log', 'profile.log', 'usage.log']
        }:
            continue
    elif not (rel == 'AGENTS.md' or rel.startswith(('doc/canon/', 'opencode-plugin/', '.opencode/'))):
        continue
    manifest[rel] = sha(f.read_bytes())
if a.baseline:
    (out / 'baseline.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('BASELINE', len(manifest), sha(json.dumps(manifest, sort_keys=True).encode()))
else:
    before = json.loads((out / 'baseline.json').read_text(encoding='utf-8'))
    diff = [k for k in sorted(before.keys() | manifest.keys()) if before.get(k) != manifest.get(k)]
    print('PROTECTED', len(before), len(manifest), 'CHANGED', len(diff))
    for k in diff:
        print(k)
    assert not diff

for n in names:
    b = (task / n).read_bytes()
    frozen = (task / 's2-partition-1/inputs' / n).read_bytes()
    print('SUBJECT', n, len(b), sha(b), 'IDENTICAL' if b == frozen else 'DIFFERENT')
    assert b == frozen
s = (task / 's2-partition-1/inputs/spec.md').read_text(encoding='utf-8')
for kind, count in [('REQ', 6), ('AC', 8), ('DNC', 4)]:
    ids = re.findall(r'^'+kind+r'-(\d+)\.', s, re.M)
    print('COUNT', kind, len(ids), ','.join(ids))
    assert ids == [f'{n:02}' for n in range(1, count+1)]
inventory = re.findall(r'^\d+\. ', s.split('## Опись источников')[1], re.M)
print('INVENTORY', len(inventory))
assert len(inventory) == 38
print('NOT_REQUIREMENT_ROWS', sum('не требование' in line for line in (task / 's2-partition-1/inputs/spec-trace.md').read_text(encoding='utf-8').splitlines() if line.startswith('|')))
changed = git('diff', '--name-only', 'f333efa', 'a449bd2').decode().splitlines()
print('CHANGED_PATHS', len(changed))
for f in changed:
    print(f)
print('ALGORITHM_DIFF_BYTES', len(git('diff', 'f333efa', 'a449bd2', '--', 'task-algorithm.md')))
for f in ['README.md', 'methodology.md', 'task-algorithm.md', 'task-sessions.md', 'task-runner.md', 'completeness-check.md', 'doc/open-questions.md']:
    b = git('show', 'a449bd2:'+f)
    print('SOURCE', f, len(b), len(b.decode().splitlines()), sha(b))
for f in ['src/runner_core/regulation/format.md', 'doc/tasks/061-kanon-i-aktualnaya-metodika/current.md', 'doc/tasks/061-kanon-i-aktualnaya-metodika/spec-review-2.md']:
    print('EXISTS', f, (root/f).exists())

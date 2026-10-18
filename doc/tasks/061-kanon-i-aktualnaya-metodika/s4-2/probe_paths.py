"""One-off read-only path and form probes, not a product reader."""
from pathlib import Path
import hashlib
import re

t = Path(__file__).resolve().parent.parent
p = t / 'plan.md'
plan = p.read_text(encoding='utf-8').splitlines()
names = ['read-map.md','baseline.md','fingerprints.md','preconditions.md','coverage.md','probes.md']
print('P1: шаг0 plan:73; expected=5 существующих выходов, coverage отсутствует')
collisions = 0
for name in names:
    f = t/'NEWs3-1'/name
    exists = f.is_file()
    collisions += exists
    digest = hashlib.sha256(f.read_bytes()).hexdigest() if exists else 'absent'
    print(f'NEWs3-1/{name}: exists={exists} sha256={digest}')
assert collisions == 5
assert not (t/'NEWs3-1/coverage.md').exists()
assert (t/'NEWs3-1/qualification.md').is_file()
print('P1 controls: coverage absent; qualification exists, not step0 output; plan exists=True')
print('P5: literal envelope, not runtime parser; expected отсутствующие поля')
checks = {
    'base_second_line': plan[1].startswith('База: ревизия '),
    'current_third_line': plan[2].startswith('Документ задачи:'),
    'branch_line': any(x.startswith('Ветка: ') for x in plan),
    'checkbox_DoD': any(re.match(r'^(?:- )?\[[ x]\]',x) for x in plan),
    'plan_heading_exact': any(re.match(r'^##? План$',x) for x in plan),
    'approval_heading': any(re.match(r'^##? Требует утверждения$',x) for x in plan),
}
for k,v in checks.items(): print(f'{k}={v}')
assert not any(checks.values())
assert plan[0] == 'Статус: черновик'
assert plan[1].startswith('Документ задачи:')
assert sum(bool(re.match(r'^[0-6]\. \*\*',x)) for x in plan) == 7
print('P5 controls: status=True; human current line2=True; numbered future steps=7')
print('exit=0; sources unchanged; semantic meaning judged manually')

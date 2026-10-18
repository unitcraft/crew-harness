"""Read-only source viewer; locators are supplied only as CLI arguments.

Output chunks are bounded to 900 characters per source line. No source is written.
"""
import argparse
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('root')
p.add_argument('path')
p.add_argument('first', type=int)
p.add_argument('last', type=int)
p.add_argument('--commit')
a = p.parse_args()
if a.commit:
    data = subprocess.check_output(['git', '-C', a.root, 'show', a.commit + ':' + a.path])
else:
    data = (Path(a.root) / a.path).read_bytes()
lines = data.decode('utf-8-sig').splitlines()
print(f'{a.path} @{a.commit or "working-tree"} {a.first}-{min(a.last, len(lines))}/{len(lines)}')
for n in range(a.first, min(a.last, len(lines)) + 1):
    line = lines[n - 1]
    for start in range(0, max(1, len(line)), 900):
        print(f'{n}.{start // 900 + 1}: {line[start:start + 900]}')

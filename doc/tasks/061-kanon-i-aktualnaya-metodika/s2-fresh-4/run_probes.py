import json, subprocess
from pathlib import Path

p = Path('doc/tasks/061-kanon-i-aktualnaya-metodika/s2-fresh-4')
commands = [
    ['python', str(p / 'probe-integrity.py')],
    ['node', str(p / 'probe-progress.mjs')],
    ['node', str(p / 'probe-authority.mjs')],
]
results = []
for n, command in enumerate(commands, 1):
    run = subprocess.run(command, capture_output=True)
    (p / f'probe-{n}.stdout.txt').write_bytes(run.stdout)
    (p / f'probe-{n}.stderr.txt').write_bytes(run.stderr)
    results.append({'command': command, 'exit': run.returncode})
    print(f'Проба {n}: exit={run.returncode}; stdout={len(run.stdout)} bytes; stderr={len(run.stderr)} bytes')
(p / 'probe-exits.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
raise SystemExit(any(x['exit'] != 0 for x in results))

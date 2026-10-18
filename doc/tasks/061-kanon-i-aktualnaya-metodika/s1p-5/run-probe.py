"""Capture one probe's actual stdout/stderr/exit; never changes an input."""
import subprocess
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
mode = sys.argv[1]
result = subprocess.run([sys.executable, str(here/'probes.py'), mode], capture_output=True)
tag = '-' + sys.argv[2] if len(sys.argv)>2 else ''
path = here / f'probe-{mode}{tag}.txt'
assert not path.exists(), path.name
text = (f'command: python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/probes.py {mode}\n'
        + 'stdout:\n' + result.stdout.decode('utf-8',errors='replace')
        + '\nstderr:\n' + result.stderr.decode('utf-8',errors='replace')
        + f'\nexit: {result.returncode}\n')
path.write_text(text,encoding='utf-8')
(here / f'probe-{mode}{tag}.stdout.txt').write_bytes(result.stdout)
(here / f'probe-{mode}{tag}.stderr.txt').write_bytes(result.stderr)
sys.stdout.reconfigure(encoding='utf-8')
print(text)
raise SystemExit(result.returncode)

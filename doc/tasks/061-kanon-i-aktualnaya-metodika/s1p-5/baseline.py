"""Read-only fingerprints; writes only this session's baseline evidence."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
TASK = ROOT / 'doc/tasks/061-kanon-i-aktualnaya-metodika'
OUT = TASK / 's1p-5'
EXCLUDE = {'progress.log', 'profile.log', 'usage.log', 'spec-fixes-5.md',
           'fresh-review-inputs.md', 'owner-gate-decisions.md'}

def collect():
    paths = set()
    for base in [TASK, ROOT / 'doc/canon', ROOT / 'opencode-plugin',
                 ROOT / 'scripts', ROOT / '.opencode', ROOT / '.github', ROOT / '.claude']:
        for p in base.rglob('*'):
            if not p.is_file() or any(x in p.parts for x in ['node_modules', '.git']):
                continue
            rel = p.relative_to(TASK) if p.is_relative_to(TASK) else None
            if rel and (rel.parts[0] == 's1p-5' or str(rel) in EXCLUDE):
                continue
            paths.add(p)
    paths.add(ROOT / 'AGENTS.md')
    paths.update(p for p in ROOT.iterdir() if p.is_file() and p.name != '.git')
    paths.add(ROOT / 'doc/open-questions.md')
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(paths)}

if __name__ == '__main__':
    import sys
    mode = sys.argv[1]
    values = collect()
    target = OUT / ({'before': 'baselinefiles.json', 'supplement': 'baseline-supplement.json',
                     'after': 'afterfiles.json'}[mode])
    if target.exists():
        raise SystemExit('Evidence already exists; refusing overwrite')
    target.write_text(json.dumps(values, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{mode}: {len(values)} file fingerprints')

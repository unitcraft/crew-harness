"""Freeze exactly seven subjects and append reproducible primary-source fingerprints."""
import hashlib
import json
from pathlib import Path
from sources import git, METHOD, W045, W013, PIN, OLD, APPROVED

HERE = Path(__file__).resolve().parent
TASK = HERE.parent
ROOT = HERE.parents[3]
SUBJECTS = ['spec.md', 'analysis.md', '031-impact.md', 'spec-trace.md',
            'method-delta.md', 'source-inventory.md', 'owner-gate-decisions.md']

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def primary():
    result = {}
    paths = git(METHOD, 'diff', '--name-only', OLD, PIN).decode().splitlines()
    for rev in [OLD, PIN]:
        for name in sorted(set(paths + ['task-algorithm.md'])):
            raw = git(METHOD, 'show', rev + ':' + name)
            result[f'method/{rev}/{name}'] = {'sha256': sha(raw), 'bytes': len(raw)}
    for name in git(ROOT, 'ls-tree', '-r', '--name-only', APPROVED,
                    '--', 'doc/tasks/031-runner-regulation-in-plugin/').decode().splitlines():
        raw = git(ROOT, 'show', APPROVED + ':' + name)
        result[f'approved031/{name}'] = {'sha256': sha(raw), 'bytes': len(raw)}
    code = '492c166fbd12e00a6a924efab065f6adb4bd91f6'
    for name in ['journal.ts','task-folders.ts','tasks.ts','core.ts','index.ts','README.md']:
        raw = git(ROOT, 'show', f'{code}:opencode-plugin/{name}')
        result[f'plugin/{code}/{name}'] = {'sha256': sha(raw), 'bytes': len(raw)}
    for name in ['AGENTS.md', 'README.md', 'doc/open-questions.md', '.opencode/crew-harness.json']:
        p = ROOT / name
        if p.exists():
            raw = p.read_bytes()
            result[f'project/{name}'] = {'sha256': sha(raw), 'bytes': len(raw)}
    for p in sorted((ROOT / 'doc/canon').rglob('*.md')):
        raw = p.read_bytes()
        result[f'project/{p.relative_to(ROOT).as_posix()}'] = {'sha256': sha(raw), 'bytes': len(raw)}
    for label, root, folder, names in [
        ('045', W045, 'doc/tasks/045-runner-registry-jsonc',
         ['spec.md','spec-trace.md','plan.md','log.md','plan-review-4.md','current.md']),
        ('013', W013, 'doc/tasks/013-runner-core', ['spec.md','log.md','task/message.md']),
        ('061-primary', ROOT, 'doc/tasks/061-kanon-i-aktualnaya-metodika',
         ['task/message.md','catalog-owner-decision-2026-10-16.md','methodology-catalog-response-2026-10-16.md'])]:
        for name in names:
            raw = (root / folder / name).read_bytes()
            result[f'{label}/{name}'] = {'sha256': sha(raw), 'bytes': len(raw)}
    return result

if __name__ == '__main__':
    import sys
    evidence = primary()
    if '--sources-only' in sys.argv:
        p = HERE / 'primary-fingerprints.json'
        assert not p.exists()
        p.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'primary source areas={len(evidence)}; read-only')
    else:
        dest = HERE / 'submitted'
        assert not dest.exists()
        dest.mkdir()
        manifest = {}
        for name in SUBJECTS:
            raw = (TASK / name).read_bytes()
            (dest / name).write_bytes(raw)
            assert (dest / name).read_bytes() == raw
            manifest[name] = {'sha256': sha(raw), 'bytes': len(raw)}
        (HERE / 'submitted-sha256.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (HERE / 'primary-at-submit.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        text = ['\n### Предмет и побайтные frozen копии\n']
        for name, value in manifest.items():
            text.append(f'- `{name}` = `s1p-5/submitted/{name}`; bytes={value["bytes"]}; SHA-256:')
            text.append(f'  `{value["sha256"]}`\n')
        text.append('\n### Первичные источники: точные байтовые области\n')
        for name, value in evidence.items():
            text.append(f'- `{name}`; bytes={value["bytes"]}; SHA-256:')
            text.append(f'  `{value["sha256"]}`\n')
        with (TASK / 'fresh-review-inputs.md').open('a', encoding='utf-8', newline='\n') as out:
            out.write('\n'.join(text))
        print('frozen subjects=7; byte exact; fingerprints appended')

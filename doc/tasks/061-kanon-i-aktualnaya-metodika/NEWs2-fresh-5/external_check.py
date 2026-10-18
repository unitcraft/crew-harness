"""Read-only repeat of the exact early external scope; arguments are local locators."""
import argparse, hashlib, json, pathlib, subprocess
p = argparse.ArgumentParser()
p.add_argument('root045'); p.add_argument('root013'); p.add_argument('method')
p.add_argument('--output', default='external-after-step4.json')
a = p.parse_args()
out = pathlib.Path(__file__).parent
before = json.loads((out / 'external-before.json').read_text(encoding='utf-8-sig'))
roots = dict(zip(('045', '013', 'method'), (a.root045, a.root013, a.method)))
after = {}
for label, root in roots.items():
    r = pathlib.Path(root)
    scope = r if label == 'method' else r / ('doc/tasks/045-runner-registry-jsonc' if label == '045' else 'doc/tasks/013-runner-core')
    files = {}
    for f in sorted(scope.rglob('*')):
        if not f.is_file() or '.git' in f.relative_to(r).parts:
            continue
        b = f.read_bytes()
        files[f.relative_to(r).as_posix()] = {'sha256': hashlib.sha256(b).hexdigest(), 'bytes': len(b)}
    def git(*args):
        return subprocess.check_output(['git', '-C', str(r), *args]).decode('utf-8')
    after[label] = dict(head=git('rev-parse', 'HEAD').strip(), status=git('status', '--porcelain'),
                        files=files, src_exists=(r/'src').exists(), runner_core_exists=(r/'src/runner_core').exists())
target = out / a.output
target.write_text(json.dumps(after, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
result = {k: {'equal': before[k] == v, 'files': len(v['files']),
              'changed_keys': [x for x in v if before[k].get(x) != v[x]]} for k,v in after.items()}
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if all(v['equal'] for v in result.values()) else 1)

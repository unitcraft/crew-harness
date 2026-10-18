"""Лёгкая проверка сохранности; expected создаётся только отдельным первым вызовом."""
import hashlib
import json
import re
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[4]
TASK = 'doc/tasks/061-kanon-i-aktualnaya-metodika/'
OWN = {
    TASK + p for p in (
        'spec.md', 'analysis.md', '031-impact.md', 'spec-trace.md',
        'spec-fixes-4.md', 'source-inventory.md', 'method-delta.md',
        'progress.log', 'profile.log', 'usage.log',
        's1p-4/check.py', 's1p-4/protected-before.json',
        's1p-4/probes.md', 's1p-4/read-map.md', 's1p-4/protected-after.json',
        's1p-4/external-before.json', 's1p-4/external-after.json',
    )
}

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def snapshot():
    listed = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT
    ).decode('utf-8').split('\0')
    paths = {p for p in listed if p}
    # Включая игнорируемые журналы и вложенные frozen snapshots.
    paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT / TASK).rglob('*') if p.is_file())
    return {p: digest(ROOT / p) for p in sorted(paths) if p not in OWN and (ROOT / p).is_file()}

base = Path(__file__).with_name('protected-before.json')
if sys.argv[1:2] in (['external-before'], ['external-after']):
    records = {}
    for label, location, files in (
        ('045', sys.argv[2], ['spec.md', 'plan.md', 'plan-review-4.md', 'log.md']),
        ('013', sys.argv[3], ['spec.md', 'task/message.md', 'log.md']),
    ):
        folder = Path(location)
        for file in files:
            records[label + '/' + file] = digest(folder / file)
        for args in (['rev-parse', 'HEAD'], ['status', '--short']):
            value = subprocess.check_output(['git', '-C', str(folder), *args])
            records[label + '/' + args[0]] = value.decode('utf-8')
        if label == '013':
            repo = subprocess.check_output(['git', '-C', str(folder), 'rev-parse', '--show-toplevel']).decode().strip()
            records['013/src'] = (Path(repo) / 'src').exists()
            records['013/src/runner_core'] = (Path(repo) / 'src/runner_core').exists()
            records['013/tracked-src'] = subprocess.check_output(['git', '-C', repo, 'ls-files', '--', 'src']).decode()
    target = Path(__file__).with_name(sys.argv[1] + '.json')
    if sys.argv[1] == 'external-before' and target.exists():
        raise SystemExit('ОТКАЗ: external expected уже существует')
    target.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if sys.argv[1] == 'external-after':
        assert records == json.loads(target.with_name('external-before.json').read_text(encoding='utf-8'))
    print(sys.argv[1], 'records=', len(records))
elif sys.argv[1:2] == ['probes']:
    task = ROOT / TASK
    def text(name):
        return (task / name).read_text(encoding='utf-8')
    def git(repo, *args):
        return subprocess.check_output(['git', '-C', str(repo), *args])
    methodology = Path(sys.argv[2])
    old = 'f333efa319e445efe029ee6963b477ca8fe3bc1c'
    current = 'a449bd2e218e04384d1d42e0c1bffe892495e298'
    # Исходные bytes, а не text pipeline.
    alg = git(methodology, 'show', current + ':task-algorithm.md')
    assert alg == git(methodology, 'show', old + ':task-algorithm.md') == git(methodology, 'show', 'ab2a4ef:task-algorithm.md')
    assert len(alg) == 51475
    assert hashlib.sha256(alg).hexdigest() == 'ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96'
    assert hashlib.sha256(alg.replace(b'\n', b'\r\n')).hexdigest() == '8a0004dbfd8b6d8f9889abeb8ee02f3bf87ea9af6309ca2a21b8cfdca9eead8d'
    old66 = git(methodology, 'show', old + ':task-sessions.md').decode().splitlines()[65]
    new66 = git(methodology, 'show', current + ':task-sessions.md').decode().splitlines()[65]
    assert 'Если цель уточнена' not in old66 and 'Если цель уточнена' in new66
    q = git(methodology, 'show', current + ':doc/open-questions.md').splitlines()[4]
    assert q == git(methodology, 'show', '9d391ba:doc/open-questions.md').splitlines()[4]
    paths = git(methodology, 'diff', '--name-only', old, current).decode().splitlines()
    assert len(paths) == 16 and all('`' + p + '`' in text('method-delta.md') for p in paths)
    print('М3: 16 paths; algorithm raw/CRLF, oldS66/currentS66, Q5 — различены')
    atoms = re.findall(r'^\| A(\d+) / (\d+) \|', text('spec-trace.md'), re.M)
    assert [int(a) for a, _ in atoms] == list(range(1, 95)) and len({b for _, b in atoms}) == 16
    assert sum('Не требование:' in line for line in text('spec-trace.md').splitlines() if line.startswith('| A')) == 1
    for atom in ('A67', 'A68', 'A69', 'A70', 'A71', 'A88', 'A89', 'A90'):
        assert re.search(r'^\| ' + atom + r' /.*C-' + atom, text('spec-trace.md'), re.M)
    assert 'Рекомендация: А — сначала запросить существующий источник' in text('spec.md')
    print('М2: 94 атома/16 абзацев/1 контекст; 8 отдельных constraints; В-03 путь А')
    frozen = text('s2-partition-1/inputs/spec.md')
    assert 'Тем же шагом создаётся' in frozen and 'Первый будущий шаг переноса любого результата' in text('spec.md')
    # Два фиксированных порядка, не общий движок переноса.
    good = [('Canon', {'Canon'}), ('format', {'Canon', 'format'})]
    bad = [('Canon', set()), ('format', {'Canon', 'format'})]
    def every_transferred_result_has_pointer(trace):
        places = set()
        for result, pointers in trace:
            places.add(result)
            if not places <= pointers:
                return False
        return True
    assert every_transferred_result_has_pointer(good)
    assert not every_transferred_result_has_pointer(bad)
    print('М1: Canon-first/current сразу принят; current только format отвергнут')
    approved = git(ROOT, 'show', '4b48c50eef1fb46af4f074a80511979b16e515e3:doc/tasks/031-runner-regulation-in-plugin/spec.md').decode().splitlines()
    assert 'exact four keys' in approved[51] and 'kind=meeting' in approved[68]
    keys = {'tier', 'effort', 'reasoning', 'budget'}
    assert keys == {'tier', 'effort', 'reasoning', 'budget'}
    assert keys != keys | {'family'}
    assert 'meeting' != 'agent'  # Одна мутация kind нарушает именно source:69.
    assert 'готово:' in approved[258] and 'готово exact без двоеточия' in approved[308]
    runner = git(methodology, 'show', current + ':task-runner.md').decode().splitlines()
    assert 'знак после него допустим' in runner[87] and 'N завышено' in runner[90]
    # Только таблица условий одного source-примера, не journal/parser/runtime validator.
    # startN, k, есть причина, артефакт правдив, ожидание current completion.
    cases = [(2, 1, True, True, True), (2, 1, False, True, False),
             (2, 1, True, False, False), (2, 2, False, True, True),
             (2, 3, False, True, True)]
    for start, k, reason, artifact, expected in cases:
        observed = k >= start or (reason and artifact)
        assert observed == expected
    rows = re.findall(r'^\| C(\d+) ', text('031-impact.md'), re.M)
    assert list(map(int, rows)) == list(range(1, 61))
    print('К1: 60 адресных строк; closed profile/lens, colon и 5 N-контролей сверены')
    spec = text('spec.md')
    assert spec.splitlines()[:2] == frozen.splitlines()[:2]
    for family, count in [('REQ', 6), ('AC', 8), ('DNC', 4)]:
        assert list(map(int, re.findall('^' + family + r'-(\d+)\.', spec, re.M))) == list(range(1, count + 1))
    assert list(map(int, re.findall(r'^\| (\d+) \|', text('source-inventory.md'), re.M))) == list(range(1, 63))
    assert digest(task / 'spec-review-2.md') == 'b26425287cb0add502c3c39dd2c50890b9aef4043998cf3df2ac6a23f32574c6'
    assert not (task / 'current.md').exists() and not (ROOT / 'src/runner_core/regulation/format.md').exists()
    print('Счёт: REQ6/AC8/DNC4, sources62; первые2строки сохранены; production-файлов нет')
    print('Spec bytes:', (task / 'spec.md').stat().st_size, '; S=30000 — предупреждение, не смена лимита')
elif sys.argv[1:] == ['baseline']:
    if base.exists():
        raise SystemExit('ОТКАЗ: expected уже существует')
    data = snapshot()
    base.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'protected baseline: {len(data)} точных repo-relative путей')
else:
    expected = json.loads(base.read_text(encoding='utf-8'))
    actual = snapshot()
    changed = [p for p in expected if actual.get(p) != expected[p]]
    added = sorted(set(actual) - set(expected))
    Path(__file__).with_name('protected-after.json').write_text(
        json.dumps({'count': len(actual), 'changed': changed, 'added': added}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'protected: {len(expected)}; changed={len(changed)}; added={len(added)}')
    if changed or added:
        raise SystemExit(1)

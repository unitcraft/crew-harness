"""Разовая лёгкая проба адресного исправления; не validator формата/норм."""
from pathlib import Path
import argparse
import hashlib
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--methodology', required=True)
parser.add_argument('--task045', required=True)
parser.add_argument('--task013', required=True)
args = parser.parse_args()
p = Path('doc/tasks/061-kanon-i-aktualnaya-metodika')
names = ['spec.md', 'analysis.md', '031-impact.md', 'spec-trace.md',
         'spec-fixes-1.md', 'spec-fixes-2.md']
texts = {name: (p / name).read_text(encoding='utf-8') for name in names}
old = 'Для 031, только по отдельным воротам: `doc/tasks/031-runner-regulation-in-plugin/spec.md` (REQ/AC и версионирование) и `spec-trace.md` (source/coverage/пары)'
snapshot = p / 's2-sol-r2/inputs/spec.md'
assert old in snapshot.read_text(encoding='utf-8')
assert all(old not in text for text in texts.values())
destination = 'src/runner_core/regulation/format.md'
assert all(destination in text for text in texts.values())
assert not Path(destination).exists()
assert not (p / 'current.md').exists()
assert not (p / 'spec-review-2.md').exists()
assert texts['spec.md'].splitlines()[:2] == [
    'Статус: черновик',
    'Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть',
]
for kind, count in [('REQ', 6), ('AC', 8), ('DNC', 4)]:
    ids = re.findall(r'^' + kind + r'-(\d+)\.', texts['spec.md'], re.M)
    assert ids == [f'{i:02}' for i in range(1, count + 1)]
    print(kind, len(ids))
inventory = texts['spec.md'].split('## Опись источников', 1)[1]
assert len(re.findall(r'^\d+\. ', inventory, re.M)) == 38
print('inventory 38; snapshot rejects old target; roots contain proposed file 6/6')
print('first two lines preserved; format/current/review-2 absent')

def manifest(label, root, files, expected):
    rows = [f'{x.relative_to(root).as_posix()}:{hashlib.sha256(x.read_bytes()).hexdigest()}'
            for x in sorted(files)]
    digest = hashlib.sha256('\n'.join(rows).encode()).hexdigest()
    print(label, len(rows), digest)
    assert digest == expected

mutable = set(names + ['spec-fixes-3.md', 'progress.log', 'profile.log', 'usage.log'])
frozen = [x for x in p.rglob('*') if x.is_file()
          and x.relative_to(p).parts[0] != 's1p-3'
          and x.relative_to(p).as_posix() not in mutable]
manifest('frozen061', p, frozen,
         'c062fa14928f0cdfd97f5ec5880d942ff9484d1af8cb218994a4d2115d6bd8b1')
manifest('canon', Path('.'), [Path('AGENTS.md'), *Path('doc/canon').rglob('*.md')],
         '8e616f1eeffae66e483bc4798e367e583a87d0bb8b4205ce79006cb1830ac600')
for label, root, files, digest in [
    ('045', Path(args.task045), ['spec.md', 'plan.md', 'plan-review-4.md', 'log.md'],
     '154f8e4296d5008c5ab3ee9740c804990b1a072d317e08df2b3b07a55720674e'),
    ('013', Path(args.task013), ['spec.md', 'task/message.md', 'log.md'],
     '8a199135c56e992167773a3fe41a6d703c5130b6e675273c200b42c386f8c6aa'),
]:
    manifest(label, root, [root / name for name in files], digest)
approved = '4b48c50eef1fb46af4f074a80511979b16e515e3'
for repo, rev, path, expected in [
    ('.', approved, 'doc/tasks/031-runner-regulation-in-plugin/spec.md',
     'a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829'),
    ('.', approved, 'doc/tasks/031-runner-regulation-in-plugin/spec-trace.md',
     '8af75b276ea92302bdb41d45a7ca0a34522af0d0e0f5fa129078fa9403166d48'),
    ('.', approved, 'doc/tasks/031-runner-regulation-in-plugin/log.md',
     'de0f724a355bf0e920e22994cd8566f900e1ef67fec1efbb5163aa7e3e693943'),
    ('.', approved, 'doc/tasks/031-runner-regulation-in-plugin/task/message.md',
     'f8cb1bae2cdf41996cf45ee3979d18b053f172424948e8e968b04b7611c8587d'),
    (args.methodology, 'a449bd2e218e04384d1d42e0c1bffe892495e298', 'methodology.md',
     'b404b8d89b659956884fea74f27ed9e317881d4ff35ecf22019d9b40664c6295'),
]:
    raw = subprocess.check_output(['git', '-C', repo, 'show', rev + ':' + path])
    digest = hashlib.sha256(raw).hexdigest()
    assert digest == expected
    print(path, digest)
for name in names:
    raw = (p / name).read_bytes()
    print('root', name, len(raw), hashlib.sha256(raw).hexdigest(),
          'WARNING S>30KB' if len(raw) > 30000 else '')
print('PASS: адресные текстовые контроли и сохранность; смысл проверяется чтением')

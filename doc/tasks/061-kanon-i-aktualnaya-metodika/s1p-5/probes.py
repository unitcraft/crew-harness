"""One-session text regression evidence, not a product validator or runtime test."""
import hashlib
import json
import re
import sys
from pathlib import Path
from sources import git, METHOD, W045, W013, PIN, OLD, APPROVED
from formatting import cells

HERE = Path(__file__).resolve().parent
TASK = HERE.parent
ROOT = HERE.parents[3]
FROZEN = TASK / 's2-partition-2/inputs'
NAMES = ['spec.md','analysis.md','031-impact.md','spec-trace.md','method-delta.md','source-inventory.md']

def read(name):
    return (TASK / name).read_text(encoding='utf-8-sig')

def compact(text):
    return re.sub(r'\s|`', '', text)

def sections(name, pattern):
    text = read(name)
    matches = list(re.finditer(pattern, text, re.M))
    return {m[1]: text[m.start():matches[i+1].start() if i+1 < len(matches) else len(text)]
            for i, m in enumerate(matches)}

def routes():
    text = read('031-impact.md')
    out = {}
    for m in re.finditer(r'^### (C\d{2}) (.+)\n\n\*\*[^\n]+?\*\* (.+)\n\n\*\*[^\n]+?\*\* (.+)', text, re.M):
        out[m[1]] = [m[1] + ' ' + m[2], m[3], m[4]]
    return out

def oldrows(name, prefix):
    result = {}
    for line in (FROZEN / name).read_text(encoding='utf-8').splitlines():
        if re.match(r'^\| ' + prefix, line):
            row = cells(line)
            result[row[0].split()[0]] = row
    return result

def quote_probe():
    quoted = read('owner-gate-decisions.md')
    log = read('log.md').splitlines()
    # Verify the full three policy quotes, not merely matching answer labels.
    for line in quoted.splitlines():
        if not line.startswith('> '):
            continue
        body = line[2:]
        if re.match(r'\d\. ', body):
            original = read('catalog-owner-decision-2026-10-16.md')
            assert '> ' + body in original
        else:
            assert any(body in row for row in log), body
    print('P1: full owner quotes match primary records; catalog points=5')
    spec = read('spec.md')
    required = ['pin закреплён на старте','со старой/новой версией и причиной',
                'для уже состоявшейся приёмки или ворот требуется владелец',
                'версии методики выходят пачкой с меткой',
                'сравнение обновлено и получены повторные ворота',
                'только при положительной отдельной оценке versions/compatibility',
                'иначе вопрос о shape возвращается владельцу',
                'на следующих воротах 045',
                'Unknown остаётся блокером полноты',
                'Старый срок 2026-10-23 снят']
    for phrase in required:
        assert phrase in spec, phrase
    def permits_ready_catalog(path_chosen, contents_approved, complete):
        return path_chosen and contents_approved and complete
    cases = [(True,False,False,False),(True,True,False,False),(True,True,True,True)]
    for chosen, approved, complete, want in cases:
        actual = permits_ready_catalog(chosen, approved, complete)
        assert actual == want
        print(f'P1 path/approval/completeness={chosen}/{approved}/{complete} -> ready={actual}')
    falseclaim = 'Выбор пути означает утверждение каталога'
    assert falseclaim not in spec
    # Text mutation lives only in memory: removing the guard must fail this same check.
    def guard(t):
        return 'Это не утверждение каталога' in t
    assert guard(spec)
    assert not guard(spec.replace('Это не утверждение каталога','Это утверждение каталога'))
    print('P1 mutation path-as-approval: rejected; no source was changed')

def coverage_probe():
    trace = read('spec-trace.md')
    atom_matches = list(re.finditer(r'^### (A\d{2}) / (\d+)\n', trace, re.M))
    assert [m[1] for m in atom_matches] == [f'A{i:02}' for i in range(1,95)]
    anchors = {int(m[2]) for m in atom_matches}
    assert anchors == {3,7,9,11,13,15,17,19,21,23,25,29,31,33,37,41}
    spec = read('spec.md')
    for kind, count in [('REQ',6),('AC',8),('DNC',4)]:
        assert re.findall(r'^'+kind+r'-(\d+)\.', spec, re.M) == [f'{i:02}' for i in range(1,count+1)]
    # Every atom gets its original line, exact current meaning and an auditable destination/procedure.
    destinations = {
        'REQ-01': ('process/Основа; внешняя основа без копии', 'AC-01: disposition/условия/override'),
        'REQ-02': ('README/process и адреса D0-D5/DX', 'AC-01: сверка каждого source anchor и code boundary'),
        'REQ-03': ('src/runner_core/regulation/format.md после содержательных ворот', 'AC-02/08: поля, пары, версии и source coverage'),
        'REQ-04': ('будущая правка плана/каталога 045; сейчас только анализ061', 'AC-03/04: каждый anchor/DNC и read-only013'),
        'REQ-05': ('README/process/новыйADR; format.md отдельно после ворот', 'AC-05: поадресная сверка и current при первом переносе'),
        'REQ-06': ('README/process и append переходящих log', 'AC-06/07: upstream/drift и полномочия перехода')}
    result = []
    for i, m in enumerate(atom_matches):
        end = atom_matches[i+1].start() if i+1 < len(atom_matches) else trace.index('\n\nПеречитаны все',m.end())
        body = trace[m.end():end].strip()
        assert '**Один проверяемый атом:**' in body
        assert '**REQ/AC либо отдельный constraint; точное свидетельство/граница:**' in body
        refs = []
        for group in re.finditer(r'REQ-(\d{2})(?:/(\d{2}))?',body):
            refs.extend('REQ-'+v for v in group.groups() if v)
        dest = [destinations[r] for r in sorted(set(refs))]
        if not dest:
            if m[1] == 'A01':
                assert 'Не требование:' in body
                dest = [('не переносится: метаданные', 'сверка происхождения message:3')]
            elif 'C-' + m[1] in body or 'DNC-' in body:
                dest = [('не переносится как новая норма: constraint исполнения', body.split('**')[-1].strip())]
            else:
                # AC-only atoms refer to the corresponding explicit destination table in trace.
                assert re.search(r'AC-\d{2}',body), m[1]
                dest = [('назначение из раздела результата/адресной карты', body.split('**')[-1].strip())]
        result.append({'atom':m[1], 'message_line':int(m[2]), 'meaning_and_link':body,
                       'destination_and_check':dest})
    target = HERE / 'source-destination-map.json'
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    assert len(routes()) == 60
    delta = read('method-delta.md')
    assert re.findall(r'^### (F\d{2}) ',delta,re.M) == [f'F{i:02}' for i in range(1,17)]
    assert re.findall(r'^### (M\d{2}) ',delta,re.M) == [f'M{i:02}' for i in range(1,20)]
    assert re.findall(r'^### (S\d{2}[ab]?) ',delta,re.M) == ['S01a','S01b']+[f'S{i:02}' for i in range(2,13)]
    assert re.findall(r'^### (R\d{2}) ',delta,re.M) == [f'R{i:02}' for i in range(1,19)]
    for n in ['D0','D1','D2','D3','D4','D5','DX']:
        assert f'**{n}**' in delta
    inventory=read('source-inventory.md')
    assert re.findall(r'^### (\d+)\s*$',inventory,re.M)==[str(i) for i in range(1,63)]
    assert re.findall(r'^ID (\d+) —',inventory,re.M)==['63','64','65','66']
    assert inventory.rstrip().endswith('итого: 66') and 'итого: 66' in spec
    print('P2: atoms94/paragraphs16; REQ6/AC8/DNC4; F16/M19/S13/R18; C60; all links mapped')
    print('P2: count/link audit is not an independent semantic completeness verdict')
    print('P2 inventory: original IDs1-62 retained; new63-66 explicit; total66 matches spec')

def semantic_probe():
    lines = git(ROOT, 'show', APPROVED+':doc/tasks/031-runner-regulation-in-plugin/spec.md').decode().splitlines()
    runner = git(METHOD,'show',PIN+':task-runner.md').decode().splitlines()
    assert 'exact four keys' in lines[51] and 'kind=meeting' in lines[68]
    profile = {'tier','effort','reasoning','budget'}
    print('P3 profile exact4: base=True; +family=False; -budget=False')
    assert len(profile) == 4 and len(profile|{'family'}) != 4
    assert 'availability required/optional' in lines[86]
    for nullable, required, lo, hi, want in [(False,True,1,10,True),(True,True,1,10,False),
                                          (False,False,1,10,False),(False,True,0,10,False)]:
        got = required and not nullable and lo>=1 and hi<=10
        assert got == want
        print(f'P3 integer[1,10] source nullable={nullable} required={required} [{lo},{hi}] -> {got}')
    assert 'готово:' in lines[258] and 'готово exact без двоеточия' in lines[308]
    assert 'готово' in runner[87] and 'знак после него допустим' in runner[87]
    # Truth table for R91, not a parser or an execution result of journal.ts.
    def complete(k,start_n,reason,artifact,starts):
        return starts == 1 and (k >= start_n or (reason and artifact))
    for case in [(1,2,True,True,1,True),(1,2,False,True,1,False),
                 (1,2,True,False,1,False),(2,2,False,True,1,True),
                 (3,2,False,True,1,True),(2,2,False,True,0,False),(2,2,False,True,2,False)]:
        *args,want=case
        got=complete(*args)
        assert got == want
        print(f'P3 completion {args} -> {got}')
    assert 'запуск/документы/state/progress/git/test/delivery'.lower() in lines[324].lower()
    print('P3: runtime values external does not erase REQ27/29 declarative intentions')
    spec = read('spec.md')
    assert 'ЛЮБОГО результата' in spec and 'создаёт `current.md`' in spec
    def transfer_ok(first_canon,current_at_first,format_later):
        return not first_canon or current_at_first
    assert transfer_ok(True,True,True)
    assert not transfer_ok(True,False,True)
    print('P3 Canon-first/current-now/format-later=True; current-only-at-format=False')
    assert 'только при положительной отдельной оценке versions/compatibility' in spec
    print('P3 semantic conflict != shape gap; conditional1.0 != chosen version/compatibility')

def regression_probe():
    cur = routes()
    old = oldrows('031-impact.md',r'C\d{2} ')
    diff = {}
    for k in old:
        assert k in cur
        a,b=compact(''.join(old[k])),compact(''.join(cur[k]))
        if a!=b:
            diff[k]={'old':old[k],'current':cur[k]}
    (HERE/'route-nonspace-diff.json').write_text(json.dumps(diff,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('P4 routes changed beyond whitespace='+','.join(diff))
    assert set(diff) <= {'C36','C55','C58'}, set(diff)
    assert len(old)==len(cur)==60
    for name in NAMES+['owner-gate-decisions.md']:
        text=read(name)
        rows=[l for l in text.splitlines() if l.startswith('|')]
        assert not rows, name
        assert not any(l.rstrip()!=l for l in text.splitlines()), name
        raw=(TASK/name).read_bytes()
        assert not raw.startswith(b'\xef\xbb\xbf')
        print(f'P4 {name}: bytes={len(raw)} table_cells=0 S30000_warning={len(raw)>30000}')
    print('P4 IDs, code examples and whitespace are checked separately from semantic claims')

def raw_probe():
    # Original 15 byte areas: historical plan remains historical; new plan is additional.
    inv=compact(read('source-inventory.md'))
    entries=[]
    for p in ['README.md','methodology.md','task-algorithm.md','task-sessions.md','task-runner.md','completeness-check.md','doc/open-questions.md']:
        entries.append(('method/'+p,git(METHOD,'show',PIN+':'+p)))
    for p in ['spec.md','spec-trace.md','log.md','task/message.md']:
        entries.append(('031/'+p,git(ROOT,'show',APPROVED+':doc/tasks/031-runner-regulation-in-plugin/'+p)))
    entries += [
        ('045/spec.md',(W045/'doc/tasks/045-runner-registry-jsonc/spec.md').read_bytes()),
        ('045/old-plan.md',(W045/'doc/tasks/045-runner-registry-jsonc/s4-4-r2/inputs/plan.md').read_bytes()),
        ('013/spec.md',(W013/'doc/tasks/013-runner-core/spec.md').read_bytes()),
        ('013/task/message.md',(W013/'doc/tasks/013-runner-core/task/message.md').read_bytes())]
    assert len(entries)==15
    for name,raw in entries:
        digest=hashlib.sha256(raw).hexdigest()
        assert digest in inv, (name,digest)
        print(f'P5 {name}: bytes={len(raw)} sha256={digest}')
    new_plan=(W045/'doc/tasks/045-runner-registry-jsonc/plan.md').read_bytes()
    assert hashlib.sha256(new_plan).hexdigest() in inv
    alg=[git(METHOD,'show',r+':task-algorithm.md') for r in [OLD,PIN,'ab2a4ef']]
    assert alg[0]==alg[1]==alg[2]
    assert len(alg[0])==51475
    assert hashlib.sha256(alg[0]).hexdigest()=='ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96'
    assert hashlib.sha256(alg[0].replace(b'\n',b'\r\n')).hexdigest()=='8a0004dbfd8b6d8f9889abeb8ee02f3bf87ea9af6309ca2a21b8cfdca9eead8d'
    q=[git(METHOD,'show',r+':doc/open-questions.md').splitlines()[4] for r in [PIN,'9d391ba']]
    assert q[0]==q[1]
    old_s=git(METHOD,'show',OLD+':task-sessions.md').decode().splitlines()[65]
    new_s=git(METHOD,'show',PIN+':task-sessions.md').decode().splitlines()[65]
    assert 'Если цель уточнена' not in old_s and 'Если цель уточнена' in new_s
    paths=git(METHOD,'diff','--name-only',OLD,PIN).decode().splitlines()
    assert len(paths)==16 and 'task-algorithm.md' not in paths
    abdiff=git(METHOD,'diff','--unified=0','ab2a4ef',PIN,'--','task-runner.md').decode()
    print('P5 original15 raw areas match; current045plan additional; algorithmLF/CRLF/old=current=ab; Q5; S66; paths16')
    print(abdiff)

if __name__=='__main__':
    import runpy
    sys.stdout.reconfigure(encoding='utf-8')
    mode=sys.argv[1]
    {'decisions':quote_probe,'coverage':coverage_probe,'semantics':semantic_probe,
     'regression':regression_probe,'raw':raw_probe,
     'preservation':lambda:runpy.run_path(str(HERE/'map-and-preservation.py'),run_name='__main__'),
     'privacy':lambda:runpy.run_path(str(HERE/'privacy.py'),run_name='__main__'),
     'final':lambda:runpy.run_path(str(HERE/'final-check.py'),run_name='__main__')}[mode]()

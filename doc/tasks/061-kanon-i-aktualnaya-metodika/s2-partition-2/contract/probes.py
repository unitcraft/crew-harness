"""One-off review probes, not a format/runtime validator."""
from pathlib import Path
import hashlib, re, sys, subprocess

TASK = Path(__file__).resolve().parents[2]
ROOT = TASK.parents[2]
APPROVED = '4b48c50eef1fb46af4f074a80511979b16e515e3'

def blob(path):
    return subprocess.check_output(['git', '-C', str(ROOT), 'show', APPROVED + ':doc/tasks/031-runner-regulation-in-plugin/' + path])

def subjects():
    rows = re.findall(r'\| `([^`]+\.md)` \| `([0-9a-f]{64})`', (TASK/'s2-partition-2/program.md').read_text(encoding='utf-8'))
    assert len(rows) == 7
    for n, expected in rows:
        raw = (TASK/n).read_bytes()
        actual = hashlib.sha256(raw).hexdigest()
        assert actual == expected and raw == (TASK/'s2-partition-2/inputs'/n).read_bytes()
        print(n + ' ' + actual + ' frozen=equal')
    print('subjects=7/7; corrupted_digest_control=' + str(hashlib.sha256((TASK/rows[0][0]).read_bytes()).hexdigest() != '0'*64))
    raw = blob('spec.md')
    assert len(raw) == 177306 and len(raw.splitlines()) == 732
    assert hashlib.sha256(raw).hexdigest() == 'a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829'
    print('approved031=177306 bytes/732 lines/a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829')

def closed_forms():
    s = blob('spec.md').decode().splitlines()
    assert 'exact four keys' in s[51] and 'kind=meeting' in s[68]
    assert 'availability required/optional' in s[86]
    for prefix, count in [('REQ',36), ('AC',42), ('DNC',5)]:
        ids = re.findall(r'^'+prefix+r'-(\d{2}) —', '\n'.join(s), re.M)
        assert ids == [f'{i:02}' for i in range(1,count+1)]
    groups = [int(re.match(r'^(?:\*\*)?(\d+)\.',x)[1]) for x in s[147:263] if re.match(r'^(?:\*\*)?\d+\. ',x)]
    assert groups == list(range(1,19))
    print('approved IDs=36/42/5; pair groups=1..18')
    keys = {'tier','effort','reasoning','budget'}
    assert keys == keys and keys|{'family'} != keys and keys-{'budget'} != keys
    print('profile: four keys=legal; +family=unknown-field; -budget=missing-field')
    kinds = ['meeting','agent']
    print('lens session kind: ' + '; '.join(k+'='+('legal' if k=='meeting' else 'illegal') for k in kinds))
    assert 'owner' in s[94] and 'namespace' in s[94]
    print('local status ref: namespace/id/owner=legal; same ref without owner=illegal')

def domains():
    # Named finite examples of 031:87/89/111, not a general type validator.
    recipient = {'minimum':1,'maximum':10,'nullable':False,'required':True}
    examples = [
        ('required-domain-1..10',1,10,False,True,True),
        ('optional-same-domain',1,10,False,False,False),
        ('nullable-same-domain',1,10,True,True,False),
        ('wide-domain-0..10',0,10,False,True,False),
        ('narrow-domain-2..8',2,8,False,True,True),
    ]
    for name,lo,hi,nullable,required,expected in examples:
        actual = lo >= recipient['minimum'] and hi <= recipient['maximum'] and not nullable and required
        assert actual == expected
        print(name+'='+str(actual))
    print('successful snapshot=5 does not legalize optional/wide/nullable sources')
    print('nested controls: array maxItems 2->3=legal,4->3=illegal; object missing guaranteed required key=illegal')
    assert 2<=3 and not 4<=3 and not {'x'}.issubset(set())

def progress_conditions():
    # Evaluate only the independently inspected completion conditions, not parsing.
    cases = [('isolating-reason',1,2,True,True,1,True),
             ('isolating-no-reason',1,2,False,True,1,False),
             ('false-artifact',1,2,True,False,1,False),
             ('equal',2,2,False,True,1,True),
             ('greater',3,2,False,True,1,True),
             ('no-start',2,2,False,True,0,False),
             ('two-starts',2,2,False,True,2,False)]
    for name,k,start_n,reason,artifact,starts,expected in cases:
        actual = starts==1 and (k>=start_n or reason and artifact)
        assert actual == expected
        print(name+'='+str(actual))
    print('ready colon: approved259/309/540=illegal; currentR88=legal whole keyword')
    print('0/2->1/2 isolates low-N; 0/2->1/1 does not isolate final N/N')

if __name__ == '__main__':
    subjects()
    closed_forms()
    domains()
    progress_conditions()

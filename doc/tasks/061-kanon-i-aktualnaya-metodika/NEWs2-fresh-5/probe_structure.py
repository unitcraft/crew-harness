"""Проба1: реальные тексты; отрицательные контроли только в памяти."""
import hashlib, json, pathlib, re
t = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((t/'s1p-5/submitted-sha256.json').read_text(encoding='utf-8-sig'))
def ids(text, prefix):
    return [int(x) for x in re.findall(r'^'+prefix+r'-(\d+)\.', text, re.M)]
s = (t/'spec.md').read_text(encoding='utf-8-sig')
for prefix, n in [('REQ',6),('AC',8),('DNC',4)]:
    got = ids(s,prefix)
    assert got == list(range(1,n+1)), (prefix,got)
    bad = s.replace(prefix+'-01.',prefix+'-99.',1)
    assert ids(bad,prefix) != list(range(1,n+1))
    print(f'{prefix}: input={got}, expected=1..{n}; positive=PASS; mutation 01->99 rejected=PASS')
for name, v in manifest.items():
    b = (t/name).read_bytes(); frozen = (t/'s1p-5/submitted'/name).read_bytes()
    good = lambda x: len(x)==v['bytes'] and hashlib.sha256(x).hexdigest()==v['sha256']
    assert b == frozen and good(b)
    assert not good(b+b'\n')
    print(f'{name}: bytes={len(b)}, root=frozen=manifest; append-LF rejected=PASS')
for name,prefix,n in [('spec-trace.md','A',94),('031-impact.md','C',60)]:
    text = (t/name).read_text(encoding='utf-8-sig')
    got = [int(x) for x in re.findall(r'^### '+prefix+r'(\d+)\b',text,re.M)]
    assert got == list(range(1,n+1)), (name,got)
    assert got[:-1] != list(range(1,n+1))
    print(f'{prefix}: {len(got)} consecutive unique headings; missing-last rejected=PASS')
print('Ограничение: hashes/ID не доказывают смысловую полноту.')

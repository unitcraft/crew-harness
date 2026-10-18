"""Join every normative delta anchor to routes/destinations; check immutable history."""
import hashlib
import json
import re
from pathlib import Path
from baseline import collect
from probes import HERE, ROOT, TASK, NAMES, FROZEN, read, routes, compact

mapping = {
    'M01':[60], 'M02':[54], 'M03':[49], 'M04':[49], 'M05':[49], 'M06':[49],
    'M07':[36], 'M08':[37], 'M09':[38], 'M10':[39], 'M11':[40], 'M12':[41],
    'M13':[42], 'M14':[43], 'M15':[44,45], 'M16':[49], 'M17':[32,33,34,35],
    'M18':[37,50], 'M19':[60],
    'S01a':[46], 'S01b':[47], 'S02':list(range(1,17))+[29], 'S03':[49],
    'S04':[1,2,18], 'S05':[48], 'S06':[49], 'S07':[49], 'S08':[49],
    'S09':[49], 'S10':[49], 'S11':[49], 'S12':[49],
    'R01':[30], 'R02':[1,2,18], 'R03':[26], 'R04':[17,18],
    'R05':[9,10,11,12,15,16], 'R06':[19,20], 'R07':[21,22,23,24],
    'R08':[18,25,26], 'R09':[27,46], 'R10':list(range(1,11)),
    'R11':[33,34], 'R12':[13,20,26], 'R13':[11,12],
    'R14':list(range(1,11))+[13], 'R15':[11,12,14], 'R16':[16],
    'R17':[10,15,16], 'R18':list(range(17,29))}

text=read('method-delta.md')
parts=list(re.finditer(r'^### ((?:M|S|R)\d{2}[ab]?) (.+)\n',text,re.M))
assert set(mapping)=={m[1] for m in parts}
destinations={m[1]:m[0] for m in re.finditer(r'^- \*\*(D[0-5X])\*\*:.+',text,re.M)}
cross=routes()
joined=[]
for i,m in enumerate(parts):
    end=parts[i+1].start() if i+1<len(parts) else text.index('\n\n## Проверка pin',m.end())
    body=text[m.end():end].strip()
    ds=set(re.findall(r'\bD[0-5X]\b',body))
    assert ds, m[1]
    cs=[f'C{n:02}' for n in mapping[m[1]]]
    assert all(c in cross for c in cs)
    joined.append({'anchor':m[1], 'old_current_source':m[2], 'meaning_and_disposition':body,
                   'REQ':['REQ-02','REQ-03'],'AC':['AC-01','AC-02','AC-05','AC-08'],
                   'routes':{c:cross[c] for c in cs},
                   'destinations':{d:destinations[d] for d in sorted(ds)},
                   'check':'Первичный source → точные условия/closed limits → route → destination; unknown не PASS'})
all_routes=[{'route':c, 'source_and_closed_crosswalk':row,
             'REQ':['REQ-03','REQ-04','REQ-05'], 'AC':['AC-02','AC-03','AC-05','AC-08'],
             'destination':'format.md: самодостаточный контракт/версии/пары/покрытие; для unknown signatures — отдельные ворота каталога045',
             'check':'Первичные 031/методика → каждый атрибут и внешняя неизвестность → отдельное утверждение; форма не runtime PASS'}
            for c,row in cross.items()]
(HERE/'norm-route-destination-map.json').write_text(json.dumps({'normative_delta':joined,'all_routes':all_routes},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def normative(doc):
    ms=list(re.finditer(r'^((?:REQ|AC|DNC)-\d{2})\.',doc,re.M))
    return {m[1]:doc[m.start():ms[i+1].start() if i+1<len(ms) else doc.index('\n\n## ',m.end())]
            for i,m in enumerate(ms)}
old=normative((FROZEN/'spec.md').read_text(encoding='utf-8'))
new=normative(read('spec.md'))
assert old.keys()==new.keys()
changed=[k for k in old if compact(old[k])!=compact(new[k])]
print('P6 normative records changed beyond whitespace='+','.join(changed))
assert set(changed)=={'REQ-05','AC-01','AC-02','AC-06','AC-07','AC-08'}
print(f'P6 normative source-route-destination links={len(joined)}; D0-D5/DX retained with conditions')
print(f'P6 full crosswalk source/REQ/AC/destination/check links={len(all_routes)}; unresolved signatures retained')

before=json.loads((HERE/'baseline-supplement.json').read_text(encoding='utf-8'))
original=json.loads((HERE/'baselinefiles.json').read_text(encoding='utf-8'))
assert all(before[k]==v for k,v in original.items())
after=collect()
changed_paths=[k for k in before if before[k]!=after.get(k)]
prefix='doc/tasks/061-kanon-i-aktualnaya-metodika/'
assert set(changed_paths)=={prefix+n for n in NAMES}
nested=[k for k in before if k.startswith(prefix) and k.endswith(('progress.log','profile.log','usage.log'))]
assert all(before[k]==after[k] for k in nested)
print(f'P6 original baseline449 remains a prefix of supplement459; protected unchanged={len(before)-6}')
print(f'P6 exact changed paths=6 allowed subjects; nested immutable journals unchanged={len(nested)}')
assert not (TASK/'plan.md').exists()
assert not (TASK/'current.md').exists()
assert not (ROOT/'src/runner_core/regulation/format.md').exists()
print('P6 no plan061/current061/format; no writes to history, code, Canon or config detected')

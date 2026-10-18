"""Final byte equality checks, performed before progress done."""
import hashlib
import json
from pathlib import Path
from freeze import SUBJECTS, primary
from sources import baseline
from baseline import collect

HERE=Path(__file__).resolve().parent
TASK=HERE.parent
ROOT=HERE.parents[3]
sha=lambda b:hashlib.sha256(b).hexdigest()
before=json.loads((HERE/'baseline-supplement.json').read_text(encoding='utf-8'))
after=json.loads((HERE/'afterfiles.json').read_text(encoding='utf-8'))
allowed={'doc/tasks/061-kanon-i-aktualnaya-metodika/'+n for n in SUBJECTS[:6]}
changed={k for k in before if before[k]!=after.get(k)}
assert changed==allowed
assert set(before)==set(after)
assert collect()==after, 'Late protected input change after recorded afterfiles'
assert len(before)==459
external_before=json.loads((HERE/'external-before.json').read_text(encoding='utf-8'))
external_after=json.loads((HERE/'external-after.json').read_text(encoding='utf-8'))
live_external=baseline()
(HERE/'external-at-final.json').write_text(json.dumps(live_external,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assert live_external==external_after, 'Late external input change after recorded after'
print('Protected files unchanged='+str(len(before)-len(allowed))+'; changed=6 authorized subjects')
for label in ['045','013','method']:
    equal=external_before[label]==external_after[label]
    print(f'External {label}: identical={equal}; files={len(external_before[label].get("files",{}))}')
    if label!='method':
        assert equal, label
    elif not equal:
        print('Observed method checkout drift; immutable comparison pins are unchanged; no remote latest claim')
        print('old HEAD='+external_before[label]['head']+' new HEAD='+external_after[label]['head'])
manifest=json.loads((HERE/'submitted-sha256.json').read_text(encoding='utf-8'))
fresh=(TASK/'fresh-review-inputs.md').read_text(encoding='utf-8')
assert set(manifest)==set(SUBJECTS)
for name,item in manifest.items():
    raw=(TASK/name).read_bytes()
    assert raw==(HERE/'submitted'/name).read_bytes()
    assert sha(raw)==item['sha256'] and len(raw)==item['bytes']
    assert item['sha256'] in fresh
    print(f'Frozen {name}: exact=True bytes={len(raw)} sha256={sha(raw)}')
saved=json.loads((HERE/'primary-at-submit.json').read_text(encoding='utf-8'))
assert saved==primary()
assert saved==json.loads((HERE/'primary-fingerprints.json').read_text(encoding='utf-8'))
print(f'Primary pinned/current byte areas unchanged={len(saved)}; hashes listed in fresh-review-inputs')
observation=json.loads((HERE/'local-method-observation.json').read_text(encoding='utf-8'))
from sources import git, METHOD
assert not observation['remote_checked'] and not observation['adopted_as_pin']
for path,item in observation['files'].items():
    raw=git(METHOD,'show',observation['observed_local_head']+':'+path)
    assert sha(raw)==item['sha256'] and item['sha256'] in fresh
print('Additional local-checkout context=5 byte areas; not remote latest; not a new pin')
print('fresh-review-inputs bytes='+str((TASK/'fresh-review-inputs.md').stat().st_size))
print('spec-review-3 unchanged='+str(sha((TASK/'spec-review-3.md').read_bytes())=='2f9b024cf7c0b570781d4a870e5a2de3ca987b589731eede2177b6ebf3c36e75'))
print('No plan/current/format created; frozen r3 inputs and all existing history retained')

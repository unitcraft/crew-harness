"""Additional actual negative controls for exact closed forms; data only."""
from pathlib import Path

keys={'tier','effort','reasoning','budget'}
def profile_shape(candidate):
    return set(candidate)==keys

cases=[('base',keys,True),('+family',keys|{'family'},False),('-budget',keys-{'budget'},False)]
lines=[]
for label,candidate,want in cases:
    actual=profile_shape(candidate)
    assert actual==want
    lines.append(f'profile {label}: {actual}')
for kind,want in [('meeting',True),('agent',False),('human',False)]:
    actual=kind=='meeting'
    assert actual==want
    lines.append(f'lens.sessionId kind={kind}: {actual}')
text='command: python doc/tasks/061-kanon-i-aktualnaya-metodika/s1p-5/semantic-extra.py\nstdout:\n'+'\n'.join(lines)+'\nstderr:\n\nexit: 0\n'
p=Path(__file__).with_name('probe-semantics-extra.txt')
assert not p.exists()
p.write_text(text,encoding='utf-8')
print(text)

import hashlib, json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 's1p-5/submitted-sha256.json').read_text(encoding='utf-8-sig'))
assert len(manifest) == 7
for name, expected in manifest.items():
    actual = (root / name).read_bytes()
    frozen = (root / 's1p-5/submitted' / name).read_bytes()
    assert actual == frozen
    assert len(actual) == expected['bytes']
    assert hashlib.sha256(actual).hexdigest() == expected['sha256']
    assert hashlib.sha256(actual + b' ').hexdigest() != expected['sha256']
    print(f'{name}: исходный=root=frozen=manifest; мутация +SPACE отвергнута')
print('Проба 1: 7 положительных и 7 отрицательных контролей; без записи входов')

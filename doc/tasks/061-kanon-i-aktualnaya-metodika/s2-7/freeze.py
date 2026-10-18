import pathlib,json,hashlib
p=pathlib.Path(__file__).resolve().parent;t=p.parent;root=p.parents[3]
def fp(path):
    b=path.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
before=json.loads((p/'before.json').read_text(encoding='utf-8'))
bad=[r['path'] for r in before['files'] if not (root/r['path']).is_file() or fp(root/r['path'])!={k:r[k] for k in ['bytes','sha256']}]
subject='a32f27b01103078cdc3041ec704b00cc1a35c026bf7d9d61b169d4c505cadab4'
assert not bad,bad
assert fp(t/'spec.md')['sha256']==subject
assert (t/'spec-review-7.md').read_text(encoding='utf-8').splitlines()[:2]==['Заход 7: существенных 0, поверхностных 1, проб 3','Версия: spec.md SHA-256 '+subject]
manifest=p/'manifest.json'
assert not manifest.exists(),'Пакет уже заморожен'
out={'protected':len(before['files']),'changed':bad,'subject_sha256':subject,'exit':0}
(p/'freeze-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
stdout=json.dumps(out,ensure_ascii=False)+'\n'
(p/'freeze.stdout.txt').write_text(stdout,encoding='utf-8')
files=[t/'spec-review-7.md']+sorted(x for x in p.rglob('*') if x.is_file())
out['manifest_entries']=len(files)
stdout=json.dumps(out,ensure_ascii=False)+'\n'
(p/'freeze.stdout.txt').write_text(stdout,encoding='utf-8')
data={x.relative_to(t).as_posix():fp(x) for x in files}
for x in files:assert fp(x)==data[x.relative_to(t).as_posix()]
manifest.write_text(json.dumps({'kind':'Фактический неизменяемый пакет С2-7; manifest не хеширует себя','files':data},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(stdout.strip())

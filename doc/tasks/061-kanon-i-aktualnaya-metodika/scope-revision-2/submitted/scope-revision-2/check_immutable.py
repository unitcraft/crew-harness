import hashlib,json,pathlib,sys
out=pathlib.Path(__file__).resolve().parent
task=out.parent
checks={
 'scope-revision-1/before/spec.md':'359819ee6b75d789b94853ac7054742c1c675597e6aee3d05f36ad43abd11c0b',
 's1p-5/submitted/spec.md':'231f86a46022d5e592a2d9b001e8ee00e4ffb180094701f82c79dee88dcc4570',
 'spec-review-6.md':'5cb83ebeafa39cdaef8c87cf403de11b7c3b7537cb2027b18977baeb66e18e1b',
 'plan.md':'c34e3a5f55a3364bc2a70bca5de41c8090e3e1a48d63e4e9ce21f4cb56f952be'}
results=[]
for rel,want in checks.items():
    b=(task/rel).read_bytes()
    actual=hashlib.sha256(b).hexdigest()
    results.append({'path':rel,'bytes':len(b),'expected':want,'actual':actual,'ok':actual==want})
payload={'results':results,'exit':int(not all(x['ok'] for x in results))}
(out/'immutable-input-check.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(payload,ensure_ascii=False,indent=2))
sys.exit(payload['exit'])

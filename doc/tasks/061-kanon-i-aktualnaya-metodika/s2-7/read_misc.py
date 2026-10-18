import pathlib,json,subprocess,sys,textwrap,hashlib
p=pathlib.Path(__file__).parent
facts=json.loads((p/'source-facts.json').read_text(encoding='utf-8'))
paths=[x for x in facts['changed_paths'] if x not in ['methodology.md','task-sessions.md','task-runner.md','completeness-check.md','doc/open-questions.md']]
r=subprocess.run(['git','-C',sys.argv[1],'diff','--unified=1','f333efa319e445efe029ee6963b477ca8fe3bc1c','a449bd2e218e04384d1d42e0c1bffe892495e298','--',*paths],capture_output=True)
meta={'paths':paths,'exit':r.returncode,'bytes':len(r.stdout),'sha256':hashlib.sha256(r.stdout).hexdigest()}
(p/'misc-diff-fingerprint.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(meta,ensure_ascii=False))
for i,l in enumerate(r.stdout.decode('utf-8').splitlines(),1):
    for j,s in enumerate(textwrap.wrap(l,160,replace_whitespace=False,drop_whitespace=False) or ['']):print(str(i)+('+' if j else ':')+' '+s)
sys.exit(r.returncode)

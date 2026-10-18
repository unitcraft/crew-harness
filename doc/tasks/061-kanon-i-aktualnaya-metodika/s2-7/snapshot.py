import hashlib,json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[4]
base='doc/tasks/061-kanon-i-aktualnaya-metodika/'
excluded={base+x for x in ('progress.log','profile.log','usage.log','spec-review-7.md')}
rows=[]
for p in sorted(root.rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(root).as_posix()
    if rel.startswith(base+'s2-7/') or rel in excluded: continue
    b=p.read_bytes(); rows.append({'path':rel,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
data={'files':rows,'git':{}}
for name,args in [('head',['rev-parse','HEAD']),('branch',['branch','--show-current']),('status',['status','--porcelain=v1','--untracked-files=all'])]:
    r=subprocess.run(['git',*args],cwd=root,capture_output=True)
    data['git'][name]={'exit':r.returncode,'stdout':r.stdout.decode('utf-8'),'stderr':r.stderr.decode('utf-8')}
out=pathlib.Path(__file__).parent/(sys.argv[1]+'.json')
if out.exists():raise SystemExit('Отказ перезаписать существующий снимок')
out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
s=json.dumps({'files':len(rows),'bytes':sum(x['bytes'] for x in rows),'git_file':next((x for x in rows if x['path']=='.git'),None),'head':data['git']['head'],'branch':data['git']['branch']},ensure_ascii=False)
out.with_suffix('.stdout.txt').write_text(s+'\n',encoding='utf-8')
print(s)

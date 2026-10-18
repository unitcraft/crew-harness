import sys,pathlib,subprocess,hashlib,json,textwrap
out=pathlib.Path(__file__).parent
mode,locator,ref,path,ranges=sys.argv[1:]
if mode in ('git','diff'):
    cmd=['git','-C',locator,'show',ref+':'+path] if mode=='git' else ['git','-C',locator,'diff','--unified=1',*ref.split('..'),'--',path]
    r=subprocess.run(cmd,capture_output=True)
    if r.returncode: print(r.stderr.decode('utf-8'));sys.exit(r.returncode)
    b=r.stdout
else:b=pathlib.Path(locator,path).read_bytes()
lines=b.decode('utf-8-sig').splitlines()
event={'mode':mode,'ref':ref,'path':path,'ranges':ranges,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'lines':len(lines)}
with (out/'read-events.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(event,ensure_ascii=False)+'\n')
print(json.dumps(event,ensure_ascii=False))
for part in ranges.split(','):
    a,z=(1,len(lines)) if part=='all' else tuple(map(int,part.split('-')))
    for n in range(a,min(z,len(lines))+1):
        for j,s in enumerate(textwrap.wrap(lines[n-1],width=160,replace_whitespace=False,drop_whitespace=False) or ['']):print(str(n)+('+' if j else ':')+' '+s)

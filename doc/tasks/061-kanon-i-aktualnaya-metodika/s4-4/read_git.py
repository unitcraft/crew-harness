import subprocess, hashlib, json, sys, textwrap
from pathlib import Path
out=Path(__file__).parent
repo,rev,path,start,end=sys.argv[1:]
p=subprocess.run(['git','-C',repo,'show',rev+':'+path],capture_output=True)
if p.returncode:
    print(p.stderr.decode('utf-8',errors='replace'));sys.exit(p.returncode)
data=p.stdout; lines=data.decode('utf-8').splitlines(); a,b=int(start),int(end)
with (out/'source-reads.jsonl').open('a',encoding='utf-8') as f:
    f.write(json.dumps({'revision':rev,'path':path,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'range':[a,min(b,len(lines))]},ensure_ascii=False)+'\n')
for n,line in enumerate(lines[a-1:b],a):
    chunks=textwrap.wrap(line, width=180,replace_whitespace=False,drop_whitespace=False) or ['']
    for i,chunk in enumerate(chunks): print(f'{n}.{i+1}: {chunk}')

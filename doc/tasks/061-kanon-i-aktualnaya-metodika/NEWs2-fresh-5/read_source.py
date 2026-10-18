import argparse, pathlib, subprocess, json, hashlib
p=argparse.ArgumentParser()
p.add_argument('root'); p.add_argument('path'); p.add_argument('--rev'); p.add_argument('--start',type=int,default=1); p.add_argument('--end',type=int)
a=p.parse_args()
b=subprocess.check_output(['git','-C',a.root,'show',a.rev+':'+a.path]) if a.rev else (pathlib.Path(a.root)/a.path).read_bytes()
lines=b.decode('utf-8-sig').splitlines(); end=min(a.end or len(lines),len(lines))
label=(a.rev or 'worktree')+':'+a.path
print(label,'bytes',len(b),'sha256',hashlib.sha256(b).hexdigest(),'lines',len(lines))
for i in range(a.start-1,end):
 s=lines[i]
 for j in range(0,max(1,len(s)),900): print(f'{i+1}.{j//900+1}: {s[j:j+900]}')
with (pathlib.Path(__file__).parent/'read-events.jsonl').open('a',encoding='utf-8') as f:
 f.write(json.dumps({'source':label,'start':a.start,'end':end,'total':len(lines),'sha256':hashlib.sha256(b).hexdigest()},ensure_ascii=False)+'\n')

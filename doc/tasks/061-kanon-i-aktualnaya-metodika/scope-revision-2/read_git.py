"""Readonly Git reader. В evidence сохраняются хеши и ranges, не копии методики."""
import datetime, hashlib, json, pathlib, subprocess, sys, textwrap
out = pathlib.Path(__file__).resolve().parent
repo, mode, *args = sys.argv[1:]
def git(*a):
    r = subprocess.run(['git','-C',repo,*a],capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode('utf-8',errors='replace'))
    return r.stdout
event = {'mode':mode,'args':args,'at':datetime.datetime.now().astimezone().isoformat()}
if mode == 'read':
    commit,path,start,end = args
    b = git('show',commit+':'+path)
    lines = b.decode('utf-8').splitlines()
    start,end = int(start),min(int(end),len(lines))
    event.update(commit=commit,path=path,start=start,end=end,total=len(lines),bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),crlf=b.count(b'\r\n'))
    print(json.dumps(event,ensure_ascii=False))
    for i in range(start,end+1):
        for j,part in enumerate(textwrap.wrap(lines[i-1],width=160,replace_whitespace=False,drop_whitespace=False) or ['']):
            print(f'{i}.{j+1}: {part}')
elif mode == 'diff':
    b=git('diff','--no-ext-diff','--unified=1',*args)
    event.update(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
    print(b.decode('utf-8'))
elif mode == 'observe':
    b=git('ls-remote','https://github.com/unitcraft/ai-dev-methodology','refs/heads/main')
    event.update(upstream='https://github.com/unitcraft/ai-dev-methodology',ref='refs/heads/main',stdout=b.decode('utf-8'),exit=0)
    (out/'upstream.json').write_text(json.dumps(event,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(event,ensure_ascii=False,indent=2))
else: raise SystemExit(mode)
with (out/'git-read-events.jsonl').open('a',encoding='utf-8') as f: f.write(json.dumps(event,ensure_ascii=False)+'\n')

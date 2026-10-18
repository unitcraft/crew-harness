import sys, subprocess, hashlib, json, datetime, textwrap
from pathlib import Path

OUT = Path(__file__).parent
REPO = sys.argv[1]
mode = sys.argv[2]
def git(*args):
    return subprocess.run(['git', '-C', REPO, *args], capture_output=True)
if mode == 'observe':
    p = git('ls-remote', 'https://github.com/unitcraft/ai-dev-methodology', 'refs/heads/main')
    data = dict(at=datetime.datetime.now().astimezone().isoformat(), command='git ls-remote https://github.com/unitcraft/ai-dev-methodology refs/heads/main', exit=p.returncode, stdout=p.stdout.decode(), stderr=p.stderr.decode())
    (OUT/'upstream.json').open('x', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=2))
    print(json.dumps(data, ensure_ascii=False))
elif mode == 'show':
    ref, name = sys.argv[3:5]
    p = git('show', ref+':'+name)
    assert p.returncode == 0, p.stderr
    lines = p.stdout.decode('utf-8').splitlines()
    a = int(sys.argv[5]) if len(sys.argv)>5 else 1
    b = int(sys.argv[6]) if len(sys.argv)>6 else len(lines)
    event = dict(ref=ref,path=name,bytes=len(p.stdout),sha256=hashlib.sha256(p.stdout).hexdigest(),start=a,end=min(b,len(lines)),lines=len(lines))
    with (OUT/'source-reads.jsonl').open('a',encoding='utf-8') as f: f.write(json.dumps(event,ensure_ascii=False)+'\n')
    print(json.dumps(event, ensure_ascii=False))
    print('\n'.join(f'{i+1}.{j+1}: {part}' for i,s in enumerate(lines) if a<=i+1<=b for j,part in enumerate(textwrap.wrap(s, width=160, replace_whitespace=False, drop_whitespace=False) or [''])))
elif mode == 'diff':
    old,new,label=sys.argv[3:6]
    p=git('diff','--no-ext-diff','--unified=3',old,new,*sys.argv[6:])
    assert p.returncode==0,p.stderr
    text=p.stdout.decode('utf-8')
    meta=dict(old=old,new=new,bytes=len(p.stdout),sha256=hashlib.sha256(p.stdout).hexdigest(),exit=p.returncode,paths=git('diff','--name-only',old,new).stdout.decode().splitlines())
    (OUT/(label+'.json')).open('x',encoding='utf-8').write(json.dumps(meta,ensure_ascii=False,indent=2))
    print(json.dumps(meta,ensure_ascii=False))
    print(text)

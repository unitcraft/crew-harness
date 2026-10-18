import datetime, hashlib, json, pathlib, subprocess, sys, urllib.request
repo = sys.argv[1]
E = pathlib.Path(__file__).resolve().parent
url = 'https://github.com/unitcraft/ai-dev-methodology'
base = 'a449bd2e218e04384d1d42e0c1bffe892495e298'
def git(*args):
    p = subprocess.run(['git',*args],cwd=repo,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    return p.returncode,p.stdout,p.stderr
rc,out,err = git('ls-remote',url,'refs/heads/main')
data = {'moment':datetime.datetime.now().astimezone().isoformat(),'upstream':url,'ref':'refs/heads/main','command':['git','ls-remote',url,'refs/heads/main'],'exit':rc,'stdout':out.decode(),'stderr':err.decode()}
if rc: raise SystemExit('ls-remote failed')
latest = out.decode().split()[0]; data['commit']=latest
data['local_object_exit'] = git('cat-file','-e',latest+'^{commit}')[0]
if data['local_object_exit'] == 0:
    rc,diff,err=git('diff','--no-ext-diff','--unified=3',base,latest)
    data['diff_sha256']=hashlib.sha256(diff).hexdigest()
    data['hunks']=[line for line in diff.decode().splitlines() if line.startswith(('diff --git','@@'))]
    data['diff_exit']=rc
    data['changed_paths']=git('diff','--name-only',base,latest)[1].decode().splitlines()
    data['files']={}
    for name in data['changed_paths']:
        r,b,_=git('show',latest+':'+name)
        data['files'][name]={'exit':r,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
else:
    api = 'https://api.github.com/repos/unitcraft/ai-dev-methodology/compare/'+base+'...'+latest
    with urllib.request.urlopen(api) as r: payload=r.read()
    comparison=json.loads(payload)
    data['comparison_status']=comparison['status']
    data['changed_paths']=[f['filename'] for f in comparison['files']]
    data['files']={}
    patches=[]
    for f in comparison['files']:
        name=f['filename']; raw='https://raw.githubusercontent.com/unitcraft/ai-dev-methodology/'+latest+'/'+name
        with urllib.request.urlopen(raw) as r: b=r.read()
        data['files'][name]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'url':raw}
        patches.append('--- '+name+'\n'+f.get('patch','MISSING PATCH'))
    data['hunks']=[line for patch in patches for line in patch.splitlines() if line.startswith(('--- ','@@'))]
    data['http_compare_sha256']=hashlib.sha256(payload).hexdigest()
    data['http_complete']=len(comparison['files'])<300 and all('patch' in f for f in comparison['files'])
target=E/'upstream.json'
if target.exists(): raise SystemExit('STOP existing observation')
target.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(data,ensure_ascii=False,indent=2))

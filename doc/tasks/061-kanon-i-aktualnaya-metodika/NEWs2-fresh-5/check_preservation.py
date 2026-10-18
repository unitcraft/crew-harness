"""Повтор раннего защищённого scope, включая .git-файл и hidden files."""
import hashlib, json, pathlib, subprocess
root = pathlib.Path.cwd()
task = pathlib.Path('doc/tasks/061-kanon-i-aktualnaya-metodika')
out = root/task/'NEWs2-fresh-5'
before = json.loads((out/'before.json').read_text(encoding='utf-8-sig'))
exact = {str(task/x).replace('\\','/') for x in ('spec-review-5.md','progress.log','profile.log','usage.log')}
def excluded(rel):
    return rel in exact or rel.startswith(task.as_posix()+'/NEWs2-fresh-5/')
files = {}
for f in sorted(root.rglob('*')):
    if not f.is_file(): continue
    rel = f.relative_to(root).as_posix()
    if excluded(rel) or (root/'.git').is_dir() and rel.startswith('.git/'): continue
    b = f.read_bytes()
    files[rel] = dict(sha256=hashlib.sha256(b).hexdigest(),bytes=len(b))
def git(*args):
    return subprocess.check_output(['git',*args]).decode('utf-8')
head = git('rev-parse','HEAD').strip()
after = dict(head=head,status=git('status','--porcelain','--untracked-files=all'),files=files)
(out/'after.json').write_text(json.dumps(after,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
old = before['files']
changed = [k for k in old.keys() & files.keys() if old[k]!=files[k]]
removed = sorted(old.keys()-files.keys()); added=sorted(files.keys()-old.keys())
manifest=json.loads((root/task/'s1p-5/submitted-sha256.json').read_text(encoding='utf-8-sig'))
subject={}
for name,v in manifest.items():
    b=(root/task/name).read_bytes(); f=(root/task/'s1p-5/submitted'/name).read_bytes()
    subject[name]=dict(sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),
                      frozen_equal=b==f,manifest_equal=v==dict(sha256=hashlib.sha256(b).hexdigest(),bytes=len(b)))
plugin={}
for name in ('journal.ts','task-folders.ts','tasks.ts','core.ts','index.ts','README.md','progress.ts'):
    path='opencode-plugin/'+name
    blob=subprocess.check_output(['git','show','492c166fbd12e00a6a924efab065f6adb4bd91f6:'+path])
    work=(root/path).read_bytes()
    plugin[name]=dict(git_bytes=len(blob),git_sha256=hashlib.sha256(blob).hexdigest(),worktree_equal=blob==work)
result=dict(protected_count_before=len(old),protected_count_after=len(files),changed=sorted(changed),removed=removed,
            unexpected_added=added,head_equal=head==before['head'],git_file=files.get('.git'),subject=subject,plugin=plugin,
            proposed_current_exists=(root/task/'current.md').exists(),proposed_format_exists=(root/'src/runner_core/regulation/format.md').exists())
(out/'preservation-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
assert not (changed or removed or added) and result['head_equal']
assert all(x['manifest_equal'] and x['frozen_equal'] for x in subject.values())
assert all(x['worktree_equal'] for x in plugin.values())

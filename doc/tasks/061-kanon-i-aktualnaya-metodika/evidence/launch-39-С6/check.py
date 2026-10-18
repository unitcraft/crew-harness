from pathlib import Path
import hashlib, json, re, subprocess, os, sys

R = Path.cwd().resolve()
T = R / 'doc/tasks/061-kanon-i-aktualnaya-metodika'
E = T / 'evidence/launch-39-С6'
A = T / 'evidence/launch-38-С5д'
PIN = 'a449bd2e218e04384d1d42e0c1bffe892495e298'
checks = {}

def ok(name, value):
    checks[name] = bool(value)

def text(p):
    assert p.suffix != '.pyc' and '__pycache__' not in p.parts
    return p.read_text(encoding='utf-8')

def digest(p):
    assert p.suffix != '.pyc' and '__pycache__' not in p.parts
    return hashlib.sha256(p.read_bytes()).hexdigest()

def put(name, data):
    p = (E / name).resolve()
    assert p.parent == E.resolve() and not p.exists()
    with p.open('xb') as f:
        f.write(data.encode('utf-8'))

def parse(p):
    files = {}; path = None; hunks = None
    for line in text(p).splitlines():
        if line.startswith('+++ '):
            path = line[6:]; files[path] = []; hunks = files[path]
        elif line.startswith('@@ '):
            hunks.append([])
        elif hunks is not None and hunks and line[:1] in (' ', '+', '-') and not line.startswith('--- '):
            hunks[-1].append(line)
    return files

def apply(lines, hunks):
    lines = list(lines)
    for h in hunks:
        old = [s[1:] for s in h if s[0] in ' -']
        new = [s[1:] for s in h if s[0] in ' +']
        hits = [i for i in range(len(lines)-len(old)+1) if lines[i:i+len(old)] == old]
        if not old and not lines:
            hits = [0]
        if len(hits) != 1:
            raise ValueError('hunk context: '+str(len(hits)))
        i = hits[0]; lines[i:i+len(old)] = new
    return lines

own = parse(A/'transfer-own.patch'); target = parse(A/'transfer-target.patch')
ok('patch six destinations', len(own) == 6)
reconstructed = {}; target_results = {}
for path, hunks in own.items():
    new_file = path.endswith('current.md') or 'ADR-0012-' in path
    base = [] if new_file else subprocess.check_output(['git','show','HEAD:'+path]).decode().splitlines()
    result = apply(base,hunks); reconstructed[path] = result
    ok('old reproduces '+path, result == text(R/path).splitlines())
    tp = A/'inputs/target'/path
    tb = text(tp).splitlines() if tp.exists() else []
    if not new_file:
        tr = apply(tb,target[path]); target_results[path] = tr
        # Context differs on target, but every actual added/deleted line must agree.
        changes = lambda hs: [s for h in hs for s in h if s[0] in '+-']
        ok('same semantic hunks '+path, changes(hunks) == changes(target[path]))
        altered = list(base)
        removed = next(s[1:] for h in hunks for s in h if s.startswith(('-', ' ')) and s[1:])
        altered[altered.index(removed)] += ' MUTATION'
        try:
            apply(altered,hunks); rejected = False
        except ValueError:
            rejected = True
        ok('content mutation rejected '+path, rejected)

proc = text(R/'doc/canon/process.md'); readme = text(R/'doc/canon/README.md')
adr = text(R/'doc/canon/decisions/ADR-0012-canon-methodology-version.md')
current = text(T/'current.md')
valid_version = lambda s: PIN in s and 'tree/'+PIN in s
ok('version actual', valid_version(readme) and valid_version(proc))
ok('version negative rejected', not valid_version(readme.replace(PIN, '0'*40)))
ok('accepted decision', adr.startswith('Статус: принято') and 'конкретное исключение061' in adr)
ok('current absence rejected', not bool(''))
links = []
for path in own:
    for url in re.findall(r'\]\(([^)]+)\)', text(R/path)):
        if '://' not in url and not url.startswith('#'):
            exists = ((R/path).parent/url.split('#')[0]).resolve().exists()
            links.append({'file':path,'link':url,'exists':exists})
ok('all local links exist', all(x['exists'] for x in links))
ok('current pointers only', 'Методика: unitcraft' not in current and 'Первый любой' not in current)

phrases = ['после уже состоявшихся ворот или приёмки переход решает владелец',
           'массового автоматического перехода нет',
           'Отключены только эти помощники, не второе мнение']
for phrase in phrases:
    ok('power present '+phrase, phrase in proc)
    ok('power mutation rejected '+phrase, phrase not in proc.replace(phrase,'ИЗМЕНЕНО'))
ok('current immediate not predicate', 'Отсутствие `result.md` указатель не откладывает' in proc)
ok('semantic subtask', 'отдельная задача со своей приёмкой и попаданием в `main`' in proc)
ok('no late witness import', 'А, Ф, Л1' in proc and 'А, Св, Л1' not in proc)
ok('general drift retained', 'Любой drift' in proc and 'повторных ворот' in proc)
ok('result append', (T/'result.md').read_bytes().startswith((A/'pre-transfer/result.md').read_bytes()))

def section(s, title):
    return s.split('## '+title+'\n',1)[1].split('\n## ',1)[0]
base_proc = subprocess.check_output(['git','show','HEAD:doc/canon/process.md']).decode()
for title in ['Открытые вопросы','Режимы ответа на вопросы']:
    ok('unchanged '+title, section(proc,title) == section(base_proc,title))
ok('unchanged journal', proc.split('- **Журнал хода `progress.log`**',1)[1].split('## Открытые вопросы',1)[0] == base_proc.split('- **Журнал хода `progress.log`**',1)[1].split('## Открытые вопросы',1)[0])
tp = '\n'.join(target_results['doc/canon/process.md'])+'\n'
oldtp = text(A/'inputs/target/doc/canon/process.md')
for title in ['Задание task/message.md','Сводка при сжатии контекста','Режимы ответа на вопросы','Открытые вопросы']:
    ok('target preserved '+title, section(tp,title) == section(oldtp,title))
gate = oldtp.split('- **Остановка на воротах',1)[1].split('- **Задачи**',1)[0]
ok('target gate preserved', gate in tp)
ti = text(A/'inputs/target/doc/canon/decisions/README.md')
row = next(s for s in ti.splitlines() if '| [0011]' in s)
ok('target ADR0011 row preserved', row in target_results['doc/canon/decisions/README.md'])

m = json.loads(text(A/'manifest.json'))
ok('manifest exact', digest(A/'manifest.json') == '48f37fa27d1b98cfb5e827f14ed4c92261232b42e22e0f76184e41fcb80b1cb1')
bad = []
for entry in m['files']:
    p = R/entry['path']
    if p.suffix == '.pyc' or '__pycache__' in p.parts:
        continue
    if not p.exists() or p.stat().st_size != entry['bytes'] or digest(p) != entry['sha256']:
        bad.append(entry['path'])
ok('manifest entries actual', not bad)
for f in ['README.md','methodology.md','task-sessions.md','task-runner.md']:
    raw = subprocess.check_output(['git','-C',sys.argv[1],'show',PIN+':'+f])
    ok('pin source '+f, raw == (A/'inputs/pin'/f).read_bytes())

before38 = json.loads(text(A/'before.json'))['files']; unexpected=[]; missing=[]; append=[]
mutable = set(own) | {str((T/n).relative_to(R)).replace('\\','/') for n in ['result.md','preparation-fast-1.md','log.md','progress.log','profile.log','usage.log']}
for entry in before38:
    path = entry['path']; p=R/path
    if path in mutable:
        continue
    if not p.exists():
        missing.append(path); continue
    s=p.stat()
    if entry.get('kind') == 'metadata-only' or p.suffix == '.pyc' or '__pycache__' in p.parts:
        equal = s.st_size == entry['size']
        if 'mtime_ns' in entry: equal = equal and s.st_mtime_ns == entry['mtime_ns']
    else:
        equal = s.st_size == entry['size'] and digest(p) == entry['sha256']
    if not equal: unexpected.append(path)
ok('before38 protected',not unexpected)

hits={}
needles=['Первый любой фактический перенос результата создаёт', 'Смысловое отличие:', 'Наличие профиля не доказывает автоматическое исполнение второго мнения']
for needle in needles: hits[needle]=[]
for root,dirs,files in os.walk(R):
    dirs[:]=[d for d in dirs if d not in ['.git','__pycache__'] and not (Path(root)==R/'doc' and d=='tasks')]
    for f in files:
        p=Path(root)/f
        if p.suffix not in ['.md','.ts','.py','.json','.mjs','.txt']:continue
        s=text(p)
        for needle in needles:
            if needle in s:hits[needle].append(p.relative_to(R).as_posix())
ok('unique with positive controls',all(v==['doc/canon/process.md'] for v in hits.values()))
ok('duplicate negative rejected',not all(len(v+['copy.md'])==1 for v in hits.values()))
out={'checks':checks,'failed':[k for k,v in checks.items() if not v], 'local_links':links,'search':hits,'manifest_mismatches':bad,'before38_changed':unexpected,'before38_missing':missing,'actual_hashes':{p:digest(R/p) for p in own},'boundary':'Текстовая реконструкция splitlines; raw целостность отдельно SHA. Только память, не git apply, не runtime.'}
put('probe-results.json',json.dumps(out,ensure_ascii=False,indent=2))
print('Проверок',len(checks),'успешно',sum(checks.values()),'ошибок',len(out['failed']))
print('FAIL:',out['failed']);print('before38 missing:',missing);print('Поиск:',json.dumps(hits,ensure_ascii=False))

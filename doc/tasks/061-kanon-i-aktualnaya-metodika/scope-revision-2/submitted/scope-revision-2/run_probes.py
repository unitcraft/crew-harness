"""Разовые авторские пробы текста; не validator продукта и не независимая С2."""
import hashlib,json,pathlib,re,sys,traceback
out=pathlib.Path(__file__).resolve().parent
task=out.parent
attempt=1
while (out/f'probe-run-{attempt}.json').exists(): attempt+=1
results=[]
def record(name,expected,actual,details):
    results.append(dict(name=name,expected=expected,actual=actual,ok=expected==actual,details=details))
def active_blocks(text):
    wanted=('REQ','AC','Решённые направления','Результат и куда он попадает')
    parts=re.split(r'(?m)^## ',text)
    return '\n'.join(p for p in parts[1:] if any(p.split('\n',1)[0].startswith(h) for h in wanted))
def removed_obligations(text):
    # Область — действующие REQ/AC/ворота/результат, не архив/DNC/факты.
    # Проверяем не слово «снят», а буквальные назначения контракта и результата.
    return [(i,s) for i,s in enumerate(active_blocks(text).splitlines(),1)
            if re.search(r'format\.md|schemaVersion|regulationVersion|minReaderVersion|каталог проектируется|Сначала в 045|Для новой редакции 031|закрытого контракта 031',s,re.I)]
def atoms(text):
    rows={}
    for s in text.splitlines():
        m=re.match(r'\| (A\d{2}) / (\d+);',s)
        if m: rows[m[1]]=(int(m[2]),[x.strip() for x in s.split('|')[1:-1]])
    return rows
def check_atoms(text,old):
    new=atoms(text)
    issues=[]
    if set(new)!=set(old):issues.append('ID-set')
    for key,(line,_) in old.items():
        if key not in new:continue
        n,fields=new[key]
        if n!=line:issues.append(key+':source')
        if len(fields)!=5 or not all(fields):issues.append(key+':fields')
        elif not re.search('Оставлен|Сужен|Снят',fields[1]) or '→' not in fields[1]:issues.append(key+':disposition')
    return issues
def policy_fields(spec):
    m=re.search(r'(?m)^AC-07\..*',spec)
    s=m.group(0) if m else ''
    required={'pin-tag-or-commit':r'метку или commit','release-batch':r'пачкой с меткой',
      'old-new-reason':r'старой и новой версией и причиной','append-only':r'append-only',
      'integrator-approved-boundary':r'лишь внутри утверждённой задачи',
      'owner-after-gates':r'после уже состоявшихся ворот или приёмки решает владелец',
      'no-mass-auto':r'массового автоматического перехода нет'}
    return [k for k,v in required.items() if not re.search(v,s,re.I)]
try:
    spec=(task/'spec.md').read_text(encoding='utf-8')
    oldspec=(out/'before/spec.md').read_text(encoding='utf-8')
    trace=(task/'spec-trace.md').read_text(encoding='utf-8')
    delta=(task/'method-delta.md').read_text(encoding='utf-8')
    oldtrace=(task/'scope-revision-1/before/spec-trace.md').read_text(encoding='utf-8')
    olddelta=(task/'scope-revision-1/before/method-delta.md').read_text(encoding='utf-8')
    findings=removed_obligations(spec)
    record('P1 новый действующий контракт без снятых назначений',0,len(findings),findings)
    f=removed_obligations(oldspec)
    record('P1 negative: реальный старый spec содержит форматные предписания',True,len(f)>0,f)
    kept=re.findall(r'(?m)^REQ-(\d{2})\.',spec)
    record('P1 positive: REQ ядра действительно существуют',['01','02','05','06'],kept,{'AC':re.findall(r'(?m)^AC-(\d{2})\.',spec),'DNC':re.findall(r'(?m)^DNC-(\d{2})\.',spec)})
    injected=spec.replace('## Результат и куда он попадает','## Результат и куда он попадает\n\nДля новой редакции 031 создать format.md с приёмочными парами.')
    record('P1 negative: повторная инъекция в результат',True,bool(removed_obligations(injected)),removed_obligations(injected))
    old={m.group(1):(int(m.group(2)),None) for m in re.finditer(r'(?m)^### (A\d{2}) / (\d+)',oldtrace)}
    issues=check_atoms(trace,old)
    record('P2 адресная опись каждого исходного атома',[],issues,{'old':len(old),'new':len(atoms(trace)),'note':'Смысл каждой строки вручную проверен в trace/regression; это машинный контроль адресов/полей, не semantic validator.'})
    record('P2 positive: полная политика AC07',[],policy_fields(spec),{'source':'owner-gate-decisions.md:14; spec AC-07; A14'})
    mutant=re.sub(r'после уже состоявшихся ворот или приёмки решает владелец\.','',spec,flags=re.I)
    record('P2 negative: потеря owner-полномочия при неизменных 94 ID',['owner-after-gates'],policy_fields(mutant),{'atoms_unchanged':len(atoms(trace))==94,'mutation':'Только AC07, все ID и count сохранены'})
    ids=re.findall(r'(?m)^### ((?:F|M|R)\d{2}|S\d{2}[ab]?)\b',olddelta)
    mapped=set(re.findall(r'(?m)^\| ((?:F|M|R)\d{2}|S\d{2}[ab]?) \|',delta))
    record('P2 каждый исходный fragment имеет отдельную судьбу',[],sorted(set(ids)-mapped),{'original_fragments':len(ids),'mapped':len(mapped),'manual':'Смысл/сужение/проверка каждой строки отдельно в method-delta'})
    missing=re.sub(r'(?m)^\| M07 \|.*\n','',delta)
    missingmapped=set(re.findall(r'(?m)^\| ((?:F|M|R)\d{2}|S\d{2}[ab]?) \|',missing))
    record('P2 negative: M07 заголовок есть, адресной судьбы нет',['M07'],sorted(set(ids)-missingmapped),{'heading_still_present':'### M07' in missing})
    # P3 — выполненный именованный ручной контроль. Здесь проверяется наличие его
    # индивидуальных записей и маршрутов, не симуляция раннера/разрешение переноса.
    manual=json.loads((out/'manual-scenarios.json').read_text(encoding='utf-8'))
    for case in manual:
        record('P3 '+case['name'],case['expected'],case['actual'],{'input':case['input'],'route':case['route'],'method':'Ручное проведение автором по конкретным абзацам новой редакции, не runtime'})
    # Сохраняются реальные test-only inputs, исходники не меняются.
    test=out/'probe-inputs'
    test.mkdir(exist_ok=True)
    for name,body in [('injected-format-spec.txt',injected),('missing-owner-spec.txt',mutant),('missing-M07-delta.txt',missing)]:
        p=test/name
        if not p.exists():p.write_text(body,encoding='utf-8')
    error=None
except Exception:
    error=traceback.format_exc()
code=1 if error or any(not x['ok'] for x in results) else 0
payload=dict(attempt=attempt,command='python doc/tasks/061-kanon-i-aktualnaya-metodika/scope-revision-2/run_probes.py',results=results,error=error,exit=code)
(out/f'probe-run-{attempt}.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
stdout='\n'.join(f'{"OK" if x["ok"] else "FAIL"}: {x["name"]}; expected={x["expected"]!r}; actual={x["actual"]!r}' for x in results)
stdout+='\n'+(error or '')+f'checks={len(results)} exit={code}\n'
(out/f'probe-run-{attempt}.stdout.txt').write_text(stdout,encoding='utf-8')
print(stdout)
sys.exit(code)

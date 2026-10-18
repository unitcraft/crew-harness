import hashlib, json, pathlib, re, sys
E = pathlib.Path(__file__).resolve().parent
T = E.parent
S = E/'probe-inputs'
def write_new(path, text):
    if path.exists(): raise RuntimeError('STOP: occupied test-only path '+path.relative_to(E).as_posix())
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text,encoding='utf-8')
def snap(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
def shell_errors(text):
    lines=text.splitlines(); errors=[]
    if not lines or lines[0]!='Статус: черновик': errors.append('status')
    if len(lines)<2 or not re.fullmatch(r'База: ревизия [0-9a-f]{40}, \d{4}-\d{2}-\d{2}',lines[1]): errors.append('base')
    if len(lines)<3 or lines[2]!='Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть': errors.append('current')
    for section in ['План','DoD','Требует утверждения']:
        if '## '+section not in lines: errors.append('section:'+section)
    if not re.search(r'^Ветка: task/061-kanon-i-aktualnaya-metodika$',text,re.M): errors.append('branch')
    if not re.search(r'^\[ \] ',text,re.M): errors.append('checkbox')
    return errors
if sys.argv[1]=='prepare':
    if S.exists(): raise SystemExit('STOP fixture directory exists')
    write_new(S/'old/before.json','{"protected":"original-before"}\n')
    write_new(S/'old/expected.json','{"protected":"original-expected"}\n')
    write_new(S/'old/notes.md','старое свидетельство\n')
    write_new(S/'occupied-E/before.json','старый запуск\n')
    plan=(T/'plan.md').read_text(encoding='utf-8')
    write_new(S/'original.md',plan)
    write_new(S/'no-base.md',re.sub(r'^База:.*$', 'База: ревизия неизвестна',plan,flags=re.M))
    write_new(S/'no-branch.md',re.sub(r'^Ветка:.*$', '',plan,flags=re.M))
    write_new(S/'bad-shell.md',plan.replace(plan.splitlines()[2],'нет указателя',1).replace('## DoD','## Готовность').replace('[ ] ','- '))
    print('PREPARED: 8 новых test-only файлов; actual ещё не вычислен')
elif sys.argv[1]=='run':
    target=E/'probe-results.json'
    if target.exists(): raise SystemExit('STOP existing results')
    before=snap(S)
    write_new(E/'probe-before.json',json.dumps(before,ensure_ascii=False,indent=2))
    # Изменяется только собственная фикстура, не старое evidence проекта.
    (S/'old/before.json').write_text('{"protected":"replaced-before"}\n',encoding='utf-8')
    after=snap(S)
    changed=[k for k in before if before[k]!=after[k]]
    occupied=(S/'occupied-E').exists()
    fresh=not (S/'fresh-E').exists()
    errors={name:shell_errors((S/file).read_text(encoding='utf-8')) for name,file in {'original':'original.md','no_base':'no-base.md','no_branch':'no-branch.md','bad_shell':'bad-shell.md'}.items()}
    observations={'P2':{'same_names':set(before)==set(after),'changed':changed,'exclude_existing_before':'отказ' if 'old/before.json' in before else 'допустим','occupied_E':'отказ' if occupied else 'допустим','fresh_E':'допустим' if fresh else 'отказ'},'P4':errors}
    # Ожидания не производятся из actual: они заранее закреплены отдельным файлом.
    expected=json.loads((E/'expected-probes.json').read_text(encoding='utf-8'))
    ok=(observations['P2']['same_names'] and changed==['old/before.json'] and observations['P2']['exclude_existing_before']==expected['P2']['exclude_existing_before'] and observations['P2']['occupied_E']==expected['P2']['occupied_E'] and observations['P2']['fresh_E']==expected['P2']['fresh_E'] and errors==expected['P4'])
    output=json.dumps({'observations':observations,'exit':0 if ok else 1},ensure_ascii=False,indent=2)
    write_new(target,output)
    write_new(E/'probe.stdout.txt',output+'\n')
    print(output)
    sys.exit(0 if ok else 1)

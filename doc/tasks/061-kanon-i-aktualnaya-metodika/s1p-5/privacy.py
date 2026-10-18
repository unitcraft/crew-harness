"""Scoped use of the project's actual privacy rules; no full tree gate."""
import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
TASK=HERE.parent
ROOT=HERE.parents[3]
GUARDS=ROOT/'scripts/guards'
sys.path.insert(0,str(GUARDS/'lib'))

def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj

secret=module('scoped_secret_guard',GUARDS/'guard-secrets.py')
import names
patterns=names.load_names()
files=list(HERE.rglob('*'))+[TASK/n for n in [
    'spec.md','analysis.md','031-impact.md','spec-trace.md','method-delta.md','source-inventory.md',
    'owner-gate-decisions.md','fresh-review-inputs.md','spec-fixes-5.md']]
errors=[]
count=0
for p in files:
    if not p.is_file() or '__pycache__' in p.parts:
        continue
    label=p.relative_to(ROOT).as_posix()
    for number in names.find_names(label,patterns):
        errors.append((label,0,'private-name',number))
    try:
        text=p.read_text(encoding='utf-8-sig')
    except UnicodeDecodeError:
        continue
    count+=1
    for n,line in enumerate(text.splitlines(),1):
        for kind,_ in secret.judge_line(line,True):
            errors.append((label,n,kind))
        for number in names.find_names(line,patterns):
            errors.append((label,n,'private-name',number))
print('Scoped actual privacy rules: files='+str(count)+' errors='+str(len(errors)))
for error in errors:
    print(error)
if errors:
    raise SystemExit(1)

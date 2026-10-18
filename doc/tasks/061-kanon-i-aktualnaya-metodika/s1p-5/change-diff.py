"""Full frozen-r3 -> current diff and an exhaustive non-whitespace anchor ledger."""
import difflib
import json
import re
from pathlib import Path
from probes import FROZEN, HERE, TASK, NAMES, compact, oldrows, read

def current_rows(name, pattern):
    result = {}
    text = read(name)
    for m in re.finditer(pattern, text, re.M):
        result[m[1]] = [m[1]+' '+m[2],m[3],m[4]]
    return result

if __name__ == '__main__':
    diff=[]
    for name in NAMES:
        old=(FROZEN/name).read_text(encoding='utf-8').splitlines(keepends=True)
        new=read(name).splitlines(keepends=True)
        diff.extend(difflib.unified_diff(old,new,fromfile='frozen-r3/'+name,tofile='current/'+name))
    (HERE/'frozen-r3-to-current.diff').write_text(''.join(diff),encoding='utf-8')
    ledger={}
    patterns={
        'spec-trace.md': (r'A\d{2} /',r'^### (A\d{2}) (/ \d+)\n\n\*\*[^\n]+?\*\* (.+)\n\n\*\*[^\n]+?\*\* (.+)'),
        'method-delta.md': (r'(?:F\d{2}|M\d{2}|S\d{2}[ab]?|R\d{2}) ',r'^### ((?:F|M|S|R)\d{2}[ab]?) (.+)\n\n\*\*[^\n]+?\*\* (.+)\n\n\*\*[^\n]+?\*\* (.+)'),
        '031-impact.md': (r'C\d{2} ',r'^### (C\d{2}) (.+)\n\n\*\*[^\n]+?\*\* (.+)\n\n\*\*[^\n]+?\*\* (.+)')}
    for name,(op,cp) in patterns.items():
        old=oldrows(name,op)
        new=current_rows(name,cp)
        changes={}
        assert old.keys()==new.keys(),(name,old.keys()-new.keys(),new.keys()-old.keys())
        for anchor in old:
            if compact(''.join(old[anchor])) != compact(''.join(new[anchor])):
                changes[anchor]={'old':old[anchor],'current':new[anchor]}
        ledger[name]={'anchors':len(old),'nonspace_changes':changes}
        print(name, 'anchors',len(old),'nonspace',','.join(changes))
    (HERE/'anchor-change-ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Full unified diff includes every significant edit, not only layout')

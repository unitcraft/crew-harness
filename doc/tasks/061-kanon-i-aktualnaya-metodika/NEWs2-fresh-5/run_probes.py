"""Лёгкий foreground сбор stdout/stderr/exit трёх собственных проб."""
import json, pathlib, subprocess, sys
p = pathlib.Path(__file__).resolve().parent
commands = [[sys.executable,str(p/'probe_structure.py')],
            ['node',str(p/'probe_progress.mjs')],
            [sys.executable,str(p/'probe_transfer.py')]]
results=[]
for i,cmd in enumerate(commands,1):
    r=subprocess.run(cmd,capture_output=True,encoding='utf-8',env=__import__('os').environ | {'PYTHONIOENCODING':'utf-8'})
    result=dict(probe=i,command=[pathlib.Path(cmd[0]).name,pathlib.Path(cmd[1]).name],
                expected_exit=0,exit=r.returncode,stdout=r.stdout,stderr=r.stderr)
    results.append(result)
    print(json.dumps(result,ensure_ascii=False))
(p/'probe-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
raise SystemExit(0 if all(x['exit']==0 for x in results) else 1)

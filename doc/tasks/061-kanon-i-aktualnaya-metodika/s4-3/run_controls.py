import subprocess,sys,json,datetime
from pathlib import Path
O=Path(__file__).parent
p=subprocess.run([sys.executable,str(O/'probe_controls.py')],capture_output=True)
out=p.stdout.decode('utf-8'); err=p.stderr.decode('utf-8')
(O/'controls.stdout.txt').open('x',encoding='utf-8').write(out)
(O/'controls.stderr.txt').open('x',encoding='utf-8').write(err)
(O/'controls-run.json').open('x',encoding='utf-8').write(json.dumps(dict(command='python <061>/s4-3/probe_controls.py',at=datetime.datetime.now().astimezone().isoformat(),exit=p.returncode,stdout='controls.stdout.txt',stderr='controls.stderr.txt'),ensure_ascii=False,indent=2))
print(out)
print(err)
sys.exit(p.returncode)

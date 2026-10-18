"""Исправление только локаторов собственного контроля, первоначальный код сохранён."""
from pathlib import Path
p=Path(__file__).with_name('check_readonly.py')
code=p.read_text(encoding='utf-8')
code=code.replace('T=O.parent\n', 'T=O.parent.relative_to(Path.cwd())\n')
code=code.replace("own=O.as_posix()+'/'", "own=O.relative_to(Path.cwd()).as_posix()+'/'")
exec(compile(code,'check_readonly_v2 (контроль относительных локаторов)','exec'))

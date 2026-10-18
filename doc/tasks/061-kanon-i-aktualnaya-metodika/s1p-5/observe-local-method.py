"""Record a local checkout observation, not an upstream/pin decision."""
import hashlib
import json
import re
from pathlib import Path
from sources import git, METHOD, PIN

HERE=Path(__file__).resolve().parent
head='78ed75838ef58073153e5343c9483bc462721a31'
paths=git(METHOD,'diff','--name-only',PIN,head).decode().splitlines()
result={'comparison_pin':PIN,'observed_local_head':head,'remote_checked':False,
        'adopted_as_pin':False,'files':{}}
lines=['\n### Дополнительный read-only контекст локального checkout\n',
       f'При проверке происхождения наблюдался локальный HEAD `{head}`; это не проверенный remote latest',
       'и не принятый новый pin. Before/after checkout одинаковы; семипредметная frozen редакция',
       'остаётся сравнением old→a449bd2. Следующие пять областей — контекст самостоятельной оценки',
       'применимости, не утверждённое дополнение к норме. Перед переносом нужны upstream-проверка,',
       'полный delta и повторные ворота по В-01а. Не превращать наблюдение в молчаливый переход.\n']
for path in paths:
    raw=git(METHOD,'show',head+':'+path)
    diff=git(METHOD,'diff','--unified=0',PIN,head,'--',path).decode()
    hunks=re.findall(r'^@@ .+? @@',diff,re.M)
    value={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'hunks':hunks}
    result['files'][path]=value
    lines.extend([f'- `{path}` @ `{head}`; bytes={len(raw)}; SHA-256:',
                  f'  `{value["sha256"]}`; ranges: '+', '.join(hunks)])
lines.extend(['\nДля чтения в исходном Git-объекте: M156 (ворота цикла сессий и вопрос),',
              'S234–245 (п.7 С4: внешние предпосылки, read-only проверки и вопросы исполнителя),',
              'P47–48 (происхождение практики), Q88 (открытый вопрос, не новая короткая ветка),',
              'presentation81 (производное отображение). Task-runner.md и task-algorithm.md',
              'между этими точками не менялись. Это не обещание совместимости или полноты будущего переноса.\n'])
(HERE/'local-method-observation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with (HERE.parent/'fresh-review-inputs.md').open('a',encoding='utf-8',newline='\n') as out:
    out.write('\n'.join(lines))
print('Local checkout context recorded: 5 byte areas; remote_checked=False; adopted_as_pin=False')

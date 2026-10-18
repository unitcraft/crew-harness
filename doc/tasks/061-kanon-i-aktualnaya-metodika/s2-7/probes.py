"""Разовые пробы С2: хранение реально проведённых ручных маршрутов и машинная опись.
Не парсер смысла и не API раннера. actual записан проверяющим после чтения адресов.
"""
import pathlib,json,re,hashlib
p=pathlib.Path(__file__).parent;t=p.parent
cases=[]
def case(group,name,source,input,expected,actual,route):
    cases.append(dict(group=group,name=name,source=source,input=input,expected=expected,actual=actual,route=route))

# Группа1. Контракт следующему автору: проводились реальные маршруты по нынешним четырём файлам.
case('G1','Канон без формата','owner-input:11–15; spec:27–43,65–76; trace:114–125',
     'После будущего утверждения плана перенести README/process/ADR и проверить Канон; не читать031/045/013 заново.',
     'Допустимый scope','Допустимый scope',
     'Из REQ05/06 получил конкретные места и AC05 процедуру; trace перечисляет будущие шаги; снятые ID не являются блокерами. Разрешение реализации этим не получено.')
case('G1','Скрытая новая031','owner-input:13; spec:47,65–82; analysis:9',
     'В DoD перехода добавить обязательную новуюformat.md при прежнейJSONshape и оценкуversions, иначе Канон не готов.',
     'Недопустимый scope','Недопустимый scope',
     'Сопоставил обязательный DoD с явным снятием новойредакции/versions; происхождение из старогоВ02 не возвращает требование.')
case('G1','Только исследование','task/message:9,11,33; owner-input:11; spec:9,31,65',
     'Сдать полную061 одним анализом/delta; Canon не вносить даже после ворот, сославшись наDNC.',
     'Не завершает061','Не завершает061',
     'Прочитал DNC01 как ограничение авторского этапа и сравнил с FACT01/REQ05/результатом: реальное внесение и проверка обязательны.')
case('G1','Пауза не возобновление','owner-input:13; spec:15,47; trace:61',
     'Канон061 принят; автоматически продолжить045/#22 без нового слова владельца.',
     'Запрещено','Запрещено',
     'FACT04 явно говорит до нового слова и неавтоматически; старое исходное затем045 перекрыто ownerсужением.')
case('G1','Честная условнаяAGENTS','spec:31,73; trace:123; AGENTS:115–116',
     'Доказанного воздействия на правилоAGENTS нет; оставить файл, перенести остальные согласованные части.',
     'Допустимо','Допустимо',
     'Условие REQ05 требует и воздействие и отдельное разрешение; отсутствие условной правки не пропуск обязательной поставки.')

# Группа2. Один и тот же ID-count, разные смыслы. Мутанты только в собственных новых inputs.
trace=(t/'spec-trace.md').read_text(encoding='utf-8');method=(t/'method-delta.md').read_text(encoding='utf-8')
line=next(x for x in trace.splitlines() if x.startswith('| A31 /'))
mutation='| A31 / 15; запуск/retry/state.launches | Снят → C-A31 | Весь смысл толькоформатный; внешние обязанности остановить агента/команды и идентифицировать группу не учитывать | О | Число94ID сохранено |'
mut_trace=trace.replace(line,mutation)
line_m=next(x for x in method.splitlines() if x.startswith('| M17 |'))
mut_method=method.replace(line_m,'| M17 | Снят → M17/DX, О | Second opinion не применяется, пока нет runtime; partial и helpers-off достаточны для отмены | Заголовок и строка сохранены |')
(p/'inputs').mkdir(exist_ok=True)
(p/'inputs/trace-A31-mutant.md').write_text(mut_trace,encoding='utf-8')
(p/'inputs/method-M17-mutant.md').write_text(mut_method,encoding='utf-8')
case('G2','MixedA31 сохранён','task/message:15; oldtrace:A31:189–193; trace:45; method:R05/R10/R13–17; C R89,159–160,574,590–608,681',
     'Реальный A31 снимает проектирование данных031, оставляет условия внешнего launch/retry/lifetime и manualoverride.',
     'Сохранён','Сохранён',
     'Прочитал исходнуюстроку15 и старыйconstraint: там не только JSONC. Проследил новыйA31→REQ02→R05/R10/R13–17→D0/D3. Stopall/identity не исчезли, ES не runtime.')
case('G2','MixedA31 утрачен при94ID','task/message:15; owner-input:11–13; inputs/trace-A31-mutant.md:45; C R89,159–160,574,590–608,681',
     'Тот же94ID, но мутантA31 объявляет весь смыслформатным и исключает stopall/identity.',
     'Обнаружена потеря канонической части','Обнаружена потеря канонической части',
     'По старомуA31 и первичномуR89 внешняя/manual обязанность не принадлежит только031; owner снял формат, не эти условия. Новый disposition запрещает их учитывать: ложныйmixedsplit, даже прицелыхID.')
case('G2','M17D0 не off','C M1550; C R232; P45; method:228–232,485; process:245–246; spec:27–29',
     'НастоящийM17 defaulton/явноеowner-off; отсутствие runtime и partial остаются границами evidence.',
     'Сохранён','Сохранён',
     'Проверил defaulton, условияfresh/familyifavailable/facts/log/ref и отдельныйпрофиль; projecthelperoff не назван overrideopinion.')
case('G2','M17DX при66ID','C M1550; P45; spec:27–29; inputs/method-M17-mutant.md:485',
     'Те же66строк mappings и заголовокM17, но мутант выключает opinion по partial/runtime/helperoff.',
     'Обнаружена отмена нормы без полномочия','Обнаружена отмена нормы без полномочия',
     'Сверил названное основание с точнымsource: M1550 отключаетowner, не отсутствие engine; partial о практике. Мутант противоречит REQ01/02 и не имеет новогоownerрешения.')
case('G2','D0 ссылка, не пересказ','process:5–12; C M711–716; method:11,168–220; spec:27,31',
     'Будущий process оставляет внешние M709–718 по ссылке и только точныеprojectотличия с причинами; не импортирует параграфы.',
     'Допустимо','Допустимо',
     'Сверил назначение D0 с действующимprocess и REQ01/05. Условия порога/границы/mixed сохраняются по первичнику; отсутствие копии не отсутствие нормы.')
case('G2','D0 превращён в копию','process:5–12; spec:27,31; method:11',
     'Для доказательства переноса скопировать весьM709–718 вprocess; добавить параллельное определение opinion.',
     'Запрещено','Запрещено',
     'Идентифицировал именно новый дублирующий нормативныйтекст: REQ01 требует не пересказывать, D0 только применение внешнейосновы; числоназначений не легализует дубль.')

# Группа3. Порядок событий и полномочия: независимые последовательности, не grepслов.
case('G3','ПервыйADR, затемprocess','C M541/S192; spec:31,39; trace:122,125',
     'После соответствующих ворот первый перенос только новыйADR+реестр/вход; current сразу сADR. Позжеprocess и пополнениеcurrent.',
     'Допустимый порядок','Допустимый порядок',
     'Провёл два момента: первыйADR уже результат061, потому current в том жеизменении; второйперенос добавляет адресprocess. Само это не завершает прочие результатыREQ05.')
case('G3','Current задержан доresult','C M541/S192; spec:31,39; process:194–197',
     'Сначала толькоREADME, current отсутствует; создать его лишь когда появитсяresult.md или второйпереносprocess.',
     'Нарушение first-current','Нарушение first-current',
     'Применил самыйпервыйперенос кREADME, затем проверилAC05: отдельная фраза прямо исключает ожидание другихизменений. Guardresult-current не предел нормы.')
case('G3','Stableupstream','owner-gate-decisions:22; spec:33,41,43',
     'На воротах и перед внесением тот же immutablecommit, hashes применимыхфайлов записаны; полномочие/прочиеворота выполнены.',
     'Нет блокировки по drift','Нет блокировки по drift',
     'Сравнил обе точки проверки REQ06/AC06: измененияcommit нет, driftветка не срабатывает. Это не автоматическийpin и не самостоятельныйapproval.')
case('G3','Незначимыйdrift','owner-gate-decisions:22; spec:33,41,59',
     'После ворот upstream изменился толькодокументацией; исполнитель считает delta незначимым и переносит без повторныхворот.',
     'Перенос остановлен','Перенос остановлен',
     'Провёл изменениеcommit между двумяточками: REQ06 говорит любойdrift, AC06 требует новоеdelta/повторныеворота до переноса. Решение исполнителя о значимости не исключение.')
case('G3','Владелец после ворот','owner-gate-decisions:14; spec:43; process:218–221',
     'У активнойзадачи уже состоялисьворота; владелец разрешает новыйpin, append-onlyold/new/reason с видом документ/решениевладельца.',
     'Полномочие соблюдено','Полномочие соблюдено',
     'Сверил все поля и ownerпослеворотAC07, старыеlogзаписи не переписаны; конкретныйpin в пробе не выбирался.')
case('G3','Интегратор после приёмки','owner-gate-decisions:14; spec:43; C M154; ADR0010:36–38',
     'Узадачи уже приёмка; интегратор сам делает корректную append-onlyзапись old/new/reason, безownerслова.',
     'Нет полномочия','Нет полномочия',
     'Проверил не только поля записи, но исключениепослеприёмки вAC07. ТаблицаКторешает и recommendations не обходят закрытыеворота.')
case('G3','Наблюдениеlatest не pin','spec:11,21–23,33,59; upstream.json',
     'Из нашегоls-remote6747 сделать вывод новыйpin061утверждён; deltaотa449 не квалифицировать.',
     'Запрещено','Запрещено',
     'Разделил observation/ref/moment от выбораполитики и конкретногоперехода. FACT02/UNKNOWN01/REQ06 не позволяют объявить наблюдениесвежимdelta иливоротами.')

counts={'original_atoms':len(re.findall(r'^\| A\d\d /',trace,re.M)), 'mutant_atoms':len(re.findall(r'^\| A\d\d /',mut_trace,re.M)),
        'original_fragments':len(re.findall(r'^\| (?:F\d\d|M\d\d|S\d\d[ab]?|R\d\d) \|',method,re.M)),
        'mutant_fragments':len(re.findall(r'^\| (?:F\d\d|M\d\d|S\d\d[ab]?|R\d\d) \|',mut_method,re.M))}
for c in cases:
    assert all(c.values())
    c['match']=c['actual']==c['expected']
    print(f"{c['group']} / {c['name']}: expected={c['expected']}; actual={c['actual']}; match={c['match']}")
assert counts==dict(original_atoms=94,mutant_atoms=94,original_fragments=66,mutant_fragments=66),counts
ok=all(c['match'] for c in cases)
result={'kind':'Собственные реально проведённые ручные смысловые маршруты; скрипт только сохраняет и сверяет записи, не исполняет ручное чтение','cases':cases,'id_counts':counts,'groups':3,'controls':len(cases),'exit':0 if ok else 1}
(p/'probes.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
tail=json.dumps({'groups':3,'controls':len(cases),'id_counts':counts,'matched':sum(c['match'] for c in cases),'exit':result['exit']},ensure_ascii=False)
print(tail)
(p/'probes.stdout.txt').write_text('\n'.join(f"{c['group']} / {c['name']}: expected={c['expected']}; actual={c['actual']}; match={c['match']}" for c in cases)+'\n'+tail+'\n',encoding='utf-8')
raise SystemExit(result['exit'])

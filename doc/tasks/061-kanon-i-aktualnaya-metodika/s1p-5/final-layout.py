"""Exact label cleanup and whitespace fixes; no new meaning or identifiers."""
import re
from formatting import SUBJECTS, TASK

labels={
    'Approved031field/type/cardinality/ref':'Approved 031: поле/тип/кратность/ссылка',
    'Approved031 точный маршрут/предел':'Approved 031: точный маршрут/предел',
    'Approved031 field/type/ref/closedlimit':'Approved 031: поле/тип/ссылка/закрытые ограничения',
    'Approved031 field/type/closedlimit':'Approved 031: поле/тип/закрытые ограничения',
    'Вердикт и конкретная external граница → последствие 045':'Вердикт и внешняя граница: следствие для 045',
    'Вердикт → consequence045':'Вердикт и следствие для 045',
    'Вердикт / данные, внешний атрибут →045':'Вердикт, данные и внешняя граница для 045',
    'Вердикт / точная граница →045':'Вердикт и точная граница для 045',
}
spacing={
    'lens69sessionId':'lens 69 sessionId', 'GminimumProbesParam':'G minimumProbesParam',
    'Dsummary':'D summary', 'Pobjectgrammar':'P object grammar', 'A/Bcount':'A/B count',
    'A/Bartifact':'A/B artifact', 'Dresult':'D result', 'Gcounter':'G counter',
    'Dl i teral':'Dl i teral', 'Vcoveragekind':'V coverage kind', 'DproceduralOQ':'D procedural OQ',
    'Dpromptregistry':'D prompt registry', 'maxItems1':'maxItems 1',
    'Punitrule':'P unit rule', 'Punit':'P unit', 'Dsessions':'D sessions',
    'A/Bselector':'A/B selector', 'A/Bsource':'A/B source', 'A/Bpreserve':'A/B preserve',
    'schemaVersionили':'schemaVersion или', 'случаях.045':'случаях. 045',
    'requiredBytypedRef':'requiredBy typedRef', 'readerrefusal':'reader refusal',
    'raw SHA178':'raw SHA 178', 'raw SHA059':'raw SHA 059',
    'raw SHA64':'raw SHA 64', 'raw SHA3fd':'raw SHA 3fd', 'raw SHA68b':'raw SHA 68b',
    'RuntimePASS':'Runtime PASS', 'ApprovedN/N':'Approved N/N', 'sourceRef93':'sourceRef 93',
    'registryvalues':'registry values', '16kinds':'16 kinds', 'неавто bump':'не авто bump',
    'С2и':'С2 и', 'С2по':'С2 по', 'С1считала':'С1 считала',
    'В061/045':'В 061/045', 'С2не':'С2 не', 'С2это':'С2 это',
}
for a,b in spacing.items():
    assert re.sub(r'\s','',a)==re.sub(r'\s','',b)
for name in SUBJECTS:
    p=TASK/name
    text=p.read_text(encoding='utf-8')
    for a,b in labels.items():
        text=text.replace('**'+a+':**','**'+b+':**')
    chunks=re.split(r'(`[^`]*`)',text)
    for i in range(0,len(chunks),2):
        for a,b in spacing.items():
            chunks[i]=chunks[i].replace(a,b)
        chunks[i]=re.sub(r';(?=045\b)','; ',chunks[i])
        chunks[i]=re.sub(r'(?<![0-9a-z])045(?=[«А-Яа-яЁё])','045 ',chunks[i])
        chunks[i]=re.sub(r'(?<=[.!?])045(?=\s|$)',' 045',chunks[i])
    text=''.join(chunks)
    p.write_text(text,encoding='utf-8',newline='\n')
    print(name, 'labels/prose cleaned')

"""Проба3: явная модель текстовых обязательств S40/60/62/70/98/110.
Не программа продукта, не runtime/parser/registry. Проверяет контрсценарии.
"""
import json
def allowed(s):
    if s['drift'] and not s['new_gate']: return False
    if s['first'] and not s['current']: return False
    if s['format'] and not (s['content_gate'] and s['versions_checked']): return False
    if s['edit_approved']: return False
    if s['six_to_013'] and not s['six_gate']: return False
    return True
base = dict(first=True,current=True,format=False,content_gate=False,
            versions_checked=False,drift=False,new_gate=False,
            edit_approved=False,six_to_013=False,six_gate=False)
cases = [
 ('Canon-first, format ждёт',{},True),
 ('Canon-first, current отложен',{'current':False},False),
 ('drift без ворот',{'drift':True},False),
 ('drift повторно согласован',{'drift':True,'new_gate':True},True),
 ('format по одному выбранному месту',{'format':True},False),
 ('format после проверки и ворот',{'format':True,'content_gate':True,'versions_checked':True},True),
 ('approved переписан после ворот',{'format':True,'content_gate':True,'versions_checked':True,'edit_approved':True},False),
 ('путь045 якобы разрешил шесть видов',{'six_to_013':True},False),
 ('шесть видов отдельно утверждены',{'six_to_013':True,'six_gate':True},True),
]
for name, patch, expected in cases:
    data = base | patch
    actual = allowed(data)
    assert actual == expected, name
    print(json.dumps(dict(name=name,input=data,expected=expected,actual=actual),ensure_ascii=False))
print('Ограничение: модель фиксирует прочитанные запреты, не доказывает их машинное исполнение.')

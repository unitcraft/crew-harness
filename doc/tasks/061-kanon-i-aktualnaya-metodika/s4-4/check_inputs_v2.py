from pathlib import Path
# Первая попытка сохранена. Ошибка только в вычислении ключа относительного пути,
# before не переснимается и не меняется.
path=Path(__file__).with_name('check_inputs.py')
source=path.read_text(encoding='utf-8')
source=source.replace("str(T/'spec.md').replace('\\\\','/')", "'doc/tasks/061-kanon-i-aktualnaya-metodika/spec.md'")
exec(compile(source,str(path), 'exec'))

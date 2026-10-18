from pathlib import Path

# Первое измерение не исправляется: три собственных неверных ожидания раскрыты.
# Пять destinations, не шесть; шаблонные ссылки не реальные адреса;
# inputs/pin — нумерованные excerpts, не полные raw blobs (source-index).
p = Path('doc/tasks/061-kanon-i-aktualnaya-metodika/evidence/launch-39-С6/check.py')
s = p.read_text(encoding='utf-8')
s = s.replace("len(own) == 6", "len(own) == 5").replace('patch six destinations', 'patch five destinations')
s = s.replace("'://' not in url and not url.startswith('#')", "'://' not in url and not url.startswith('#') and '<' not in url")
s = s.replace("raw == (A/'inputs/pin'/f).read_bytes()", "all(raw.decode().splitlines()[int(line.split(': ',1)[0])-1] == line.split(': ',1)[1] for line in text(A/'inputs/pin'/f).splitlines())")
s = s.replace("'probe-results.json'", "'probe-results-corrected.json'")
exec(compile(s, 'check.py с тремя явно исправленными ожиданиями', 'exec'))

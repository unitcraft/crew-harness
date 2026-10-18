"""Display exact Git source ranges, wrapping long lines without omission."""
import subprocess, sys
root, rev, path, ranges = sys.argv[1:5]
raw = subprocess.check_output(['git', '-C', root, 'show', rev + ':' + path])
lines = raw.decode('utf-8').splitlines()
for item in ranges.split(','):
    a, _, b = item.partition('-')
    for i in range(int(a), int(b or a) + 1):
        text = lines[i-1]
        if not text:
            print(str(i) + ':')
        for offset in range(0, len(text), 700):
            print(f'{i}[{offset}:{min(offset+700,len(text))}]: ' + text[offset:offset+700])

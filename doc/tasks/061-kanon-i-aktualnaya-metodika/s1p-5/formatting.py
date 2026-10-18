"""Mechanical layout proposals; no identifiers or non-whitespace text are removed."""
import collections
import json
import re
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
TASK = HERE.parent
ROOT = HERE.parents[3]
SUBJECTS = ['spec.md', 'analysis.md', '031-impact.md', 'spec-trace.md',
            'method-delta.md', 'source-inventory.md']

def cells(line):
    parts, current, code = [], '', False
    value = line.strip()[1:-1]
    for pos, char in enumerate(value):
        if char == '`':
            code = not code
        if char == '|' and not code and not value[pos+1:].startswith('null'):
            parts.append(current.strip())
            current = ''
        else:
            current += char
    parts.append(current.strip())
    return parts

def prose(text):
    # Never split inline code, names, hashes or original quoted strings.
    chunks = re.split(r'(`[^`]*`)', text)
    for i in range(0, len(chunks), 2):
        s = chunks[i]
        s = re.sub(r'([А-Яа-яЁё])([A-Za-z0-9])', r'\1 \2', s)
        s = re.sub(r'([A-Za-z0-9])([А-Яа-яЁё])', r'\1 \2', s)
        s = re.sub(r'([,;:])(?=[А-Яа-яЁёA-Za-z])', r'\1 ', s)
        chunks[i] = s
    return ''.join(chunks)

def layout(text):
    out, headers = [], None
    for line in text.splitlines():
        if line.startswith('|') and line.endswith('|'):
            row = cells(line)
            if headers is None:
                headers = row
                continue
            if all(re.fullmatch(r':?-+:?', x) for x in row):
                continue
            assert len(row) == len(headers), (row, headers)
            out.extend(['### ' + row[0], ''])
            for label, value in zip(headers[1:], row[1:]):
                out.extend([f'**{label}:** {value}', ''])
        else:
            headers = None
            out.append(line)
    return prose('\n'.join(out).rstrip() + '\n')

def candidates():
    freq = collections.Counter()
    sources = list((ROOT / 'doc/canon').rglob('*.md'))
    sources += [p for p in (ROOT / 'doc/tasks').rglob('*.md') if TASK not in p.parents]
    from sources import METHOD, git, PIN
    for name in ['methodology.md', 'task-sessions.md', 'task-runner.md', 'task-algorithm.md']:
        freq.update(re.findall(r'[А-Яа-яЁё]+', git(METHOD, 'show', f'{PIN}:{name}').decode('utf-8')))
    for p in sources:
        freq.update(re.findall(r'[А-Яа-яЁё]+', p.read_text(encoding='utf-8-sig')))
    words = {w.lower() for w in freq if len(w) >= 2}
    words.update('не ни по до за из на со во ко но от об то же бы ли и в к с а о у'.split())
    @lru_cache(None)
    def split(token):
        if not token:
            return []
        best = None
        for end in range(1, len(token) + 1):
            word = token[:end]
            if word not in words:
                continue
            tail = split(token[end:])
            if tail is not None:
                result = [word] + tail
                if best is None or len(result) < len(best):
                    best = result
        return best
    proposed = {}
    unknown_all = set()
    for name in SUBJECTS:
        text = layout((TASK / name).read_text(encoding='utf-8-sig'))
        tokens = sorted(set(re.findall(r'[А-Яа-яЁё]{7,}', re.sub(r'`[^`]*`', '', text))))
        unknown = [t for t in tokens if t.lower() not in words]
        for token in unknown:
            pieces = split(token.lower())
            if pieces and len(pieces) > 1:
                start, new = 0, []
                for piece in pieces:
                    new.append(token[start:start+len(piece)])
                    start += len(piece)
                proposed[token] = ' '.join(new)
            else:
                unknown_all.add(token)
    (HERE / 'spacing-proposed.json').write_text(json.dumps(proposed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for token, result in sorted(proposed.items()):
        print(token, '=>', result)
    print('UNRESOLVED')
    for token in sorted(unknown_all):
        print(token)

if __name__ == '__main__':
    import sys
    if '--apply' not in sys.argv:
        candidates()
    else:
        proposed = json.loads((HERE / 'spacing-proposed.json').read_text(encoding='utf-8'))
        decision = json.loads((HERE / 'spacing-decisions.json').read_text(encoding='utf-8'))
        mapping = {k: v for k, v in proposed.items() if k not in decision['reject'].split()}
        mapping.update(decision['override'])
        for old, new in mapping.items():
            assert re.sub(r'\s', '', old) == re.sub(r'\s', '', new), (old, new)
        for name in SUBJECTS:
            p = TASK / name
            old = p.read_text(encoding='utf-8-sig')
            new = layout(old)
            chunks = re.split(r'(`[^`]*`)', new)
            for i in range(0, len(chunks), 2):
                chunks[i] = re.sub(r'[А-Яа-яЁё]+', lambda m: mapping.get(m[0], m[0]), chunks[i])
            new = ''.join(chunks)
            p.write_text(new, encoding='utf-8', newline='\n')
            print(f'{name}: {len(old.encode())} -> {len(new.encode())} bytes')

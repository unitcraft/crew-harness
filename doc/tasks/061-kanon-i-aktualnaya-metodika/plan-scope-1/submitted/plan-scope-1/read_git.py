import hashlib, json, os, pathlib, subprocess, sys, textwrap
E = pathlib.Path(__file__).resolve().parent
repo, rev, path, start, end = sys.argv[1:]
b = subprocess.check_output(['git', 'show', rev + ':' + path], cwd=repo)
lines = b.decode('utf-8').splitlines()
record = {'source':'unitcraft/ai-dev-methodology' if 'methodology' in repo else 'project', 'revision':rev, 'path':path, 'bytes':len(b), 'sha256':hashlib.sha256(b).hexdigest(), 'range':[int(start),int(end)], 'total_lines':len(lines)}
with (E / 'source-reads.jsonl').open('a',encoding='utf-8') as f: f.write(json.dumps(record,ensure_ascii=False)+'\n')
print(json.dumps(record,ensure_ascii=False))
for n in range(int(start), min(int(end),len(lines))+1):
    for part in textwrap.wrap(lines[n-1],width=160,replace_whitespace=False) or ['']:
        print(str(n)+': '+part)

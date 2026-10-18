import argparse, subprocess
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('path');p.add_argument('--repo');p.add_argument('--rev');p.add_argument('--start',type=int,default=1);p.add_argument('--end',type=int,default=100000)
a=p.parse_args()
b=subprocess.check_output(['git','-C',a.repo,'show',a.rev+':'+a.path]) if a.rev else Path(a.path).read_bytes()
ls=b.decode('utf-8-sig').splitlines()
for i in range(a.start,min(a.end,len(ls))+1):
 s=ls[i-1]
 for j in range(0,max(1,len(s)),900):print(f'{i}[{j}:{min(j+900,len(s))}]: {s[j:j+900]}')
print(f'END range {a.start}-{min(a.end,len(ls))}; total {len(ls)} lines; {len(b)} bytes')

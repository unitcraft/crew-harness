import pathlib,json,hashlib,sys
p=pathlib.Path(__file__).resolve().parent;t=p.parent;root=p.parents[3];base=t.relative_to(root).as_posix()+'/'
load=lambda path:json.loads(path.read_text(encoding='utf-8-sig'))
def fp(path):
    b=path.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def match(path,expected):return path.is_file() and fp(path)=={k:expected[k] for k in ['bytes','sha256']}
b=load(p/'before.json');a=load(p/'after.json')
bm={r['path']:r for r in b['files']};am={r['path']:r for r in a['files']}
changed=[x for x in bm if x not in am or bm[x]!=am[x]];added=sorted(set(am)-set(bm))
pre=load(t/'review-setup/integrator-preflight.json')['files'];journal={base+x for x in ['progress.log','profile.log','usage.log']}
precheck=[{'path':r['path'],'excluded_root_journal':r['path'] in journal,'match':match(root/r['path'],r) if r['path'] not in journal else None} for r in pre]
sub=t/'scope-revision-2/submitted';manifest=load(sub/'manifest.json')
frozen=[{'path':path,'frozen_match':match(sub/path,expected),'source_match':match(t/path,expected)} for path,expected in manifest.items()]
author_before=load(t/'scope-revision-2/before/manifest.json');author_after=load(t/'scope-revision-2/after-manifest.json')
ac=[x for x in author_before if author_before[x]!=author_after.get(x)]
expected_changes=[base+x for x in ['analysis.md','method-delta.md','spec-trace.md','spec.md']]
author_locator=pathlib.Path(sys.argv[1])
author_actual=[{'path':path,'matches_author_after':match(author_locator/path,expected)} for path,expected in author_after.items()]
git_same={k:b['git'][k]==a['git'][k] for k in ['head','branch']}
old_status=b['git']['status']['stdout'].splitlines();new_status=a['git']['status']['stdout'].splitlines()
own=[base+'s2-7/',base+'spec-review-7.md']
status_existing_same=[s for s in new_status if not any(s[3:].replace('\\','/').startswith(x) for x in own)]==[s for s in old_status if not any(s[3:].replace('\\','/').startswith(x) for x in own)]
ok=not changed and not added and all(git_same.values()) and status_existing_same and all(r['match'] is not False for r in precheck) and all(r['frozen_match'] and r['source_match'] for r in frozen) and sorted(ac)==sorted(expected_changes) and len(author_before)==len(author_after)==1105 and all(r['matches_author_after'] for r in author_actual)
result={'own_before_count':len(bm),'own_after_count':len(am),'changed':changed,'added':added,'git_same':git_same,'status_existing_same':status_existing_same,'preflight_count':len(pre),'preflight_check':precheck,'submitted_count':len(manifest),'submitted_check':frozen,'author_claim_comparison':{'before_count':len(author_before),'after_count':len(author_after),'changed':ac,'unchanged':len(author_before)-len(ac)},'author_readonly_actual':author_actual,'exit':0 if ok else 1}
(p/'protected-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
summary={k:v for k,v in result.items() if k not in ['preflight_check','submitted_check','author_readonly_actual']}
summary['preflight_bad']=[r for r in precheck if r['match'] is False];summary['submitted_bad']=[r for r in frozen if not (r['frozen_match'] and r['source_match'])];summary['author_actual_bad']=[r for r in author_actual if not r['matches_author_after']]
s=json.dumps(summary,ensure_ascii=False,indent=2);(p/'protected-audit.stdout.txt').write_text(s+'\n',encoding='utf-8');print(s)
raise SystemExit(result['exit'])

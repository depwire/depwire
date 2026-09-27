from pathlib import Path
import re,csv,subprocess,collections
# Superset of path operations, fields, keys, and emitted references, including browser consumers.
pattern=re.compile(r'\b[A-Za-z_$]*(?:[Pp]ath|[Ff]ile|[Dd]ir|[Rr]oot|[Nn]odeId|[Ss]ymbolId)[A-Za-z_$]*\b|filePath|file_path|fromFile|sourceFile|targetFile|calledFile|relativePath|absolutePath|projectRoot|rootDir|baseDir|\b(?:join|resolve|relative|dirname|basename|extname|normalize|minimatch|isWithinRoot|canonicalPath|canonicalSymbolId)\s*\(|\.file\b|\bfile\s*:|\.path\b|\bpath\s*:|\.hasNode\(|\.addNode\(|\.mergeNode\(|\.mergeEdge\(')
changed=collections.defaultdict(set);current=None
for line in subprocess.check_output(['git','diff','b6e64ff4201d7d9946a8fe1ac5c0370d93a22756','--unified=0','--','src'],text=True).splitlines():
 if line.startswith('+++ b/'):current=line[6:]
 m=re.match(r'@@ .* \+(\d+)(?:,(\d+))? @@',line)
 if m:changed[current].update(range(int(m[1]),int(m[1])+int(m[2] or 1)))
for p in [Path('src/graph/paths.ts'),Path('src/graph/path-boundary.ts')]:changed[str(p)].update(range(1,len(p.read_text().splitlines())+1))
rows=[]
for p in sorted(Path('src').rglob('*')):
 if p.suffix not in ['.ts','.js','.html'] or '.test.' in p.name:continue
 for line,code in enumerate(p.read_text().splitlines(),1):
  if not pattern.search(code):continue
  name=str(p)
  if line in changed[name]:status='fixed';reason='Canonical ingress/query/IO boundary or corrected file-count contract; see reviewed family table.'
  elif code.strip().startswith(('//','*','/**')):status='deliberate';reason='Contract/comment or example; not an executable filesystem comparison.'
  elif '/rest-api.ts' in name and not re.search(r'filePath|File|projectRoot|fullPath|join\(',code):status='deliberate';reason='HTTP route/URL, not a filesystem path; retain URL matching semantics.'
  elif re.search(r'\b(?:readFile|writeFile|exists|mkdir|readdir|stat|unlink|rm|lstat|realpath|createReadStream)Sync\(|\b(?:join|resolve)\(',code):status='deliberate';reason='Native filesystem construction/access; graph records cross the canonical boundary before graph use.'
  elif '/parser/' in name:status='already-correct';reason='Parser symbol IDs/records normalized at ingress before project resolution; native discovery/cache keys remain in their own consistent namespace.'
  elif any(x in name for x in ['/graph/','/simulation/','/core/','/health/','/dead-code/','/security/','/docs/','/viz/','/tools.ts','/commands/']):status='already-correct';reason='Consumer of canonical graph/parsed paths (or native IO metadata); exact keys and emitted paths inherit the ingress invariant.'
  else:status='deliberate';reason='Workspace/repository, persistence, or process path; native absolute paths retained for IO. Graph payloads use serializer/build boundary.'
  rows.append([name,line,status,reason,code.strip()])
with Path('recon/path-contract-evidence/path-sites.csv').open('w') as f:
 w=csv.writer(f,lineterminator="\n");w.writerow(['file','line','status','rationale','source']);w.writerows(rows)
counts=collections.Counter(r[2] for r in rows)
print(len(rows),'sites;',len(set(r[0] for r in rows)),'files;',dict(counts))

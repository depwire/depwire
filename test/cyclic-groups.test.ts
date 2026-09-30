import { describe, it, expect } from 'vitest';
import { DirectedGraph } from 'graphology';
import { analyzeCyclicGroups, compareCyclicGroups, compareCanonical, scoreCyclicGroups } from '../src/graph/cyclic-groups.js';
import { calculateHealthScore, getHealthTrend } from '../src/health/index.js';
import { formatCyclicGroups } from '../src/docs/cyclic-groups.js';
import { checkArchitecture } from '../src/security/checks/architecture.js';
import { verifyChange } from '../src/core/verify-change.js';
import { SimulationEngine } from '../src/simulation/engine.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function graph(n:number, edges:number[][]) {
  const g = new DirectedGraph();
  for (let i=0;i<n;i++) g.addNode(String(i),{filePath:`file-${String(i).padStart(3,'0')}.ts`,name:`f${i}`,kind:'function'});
  for (const [a,b] of edges) g.addEdge(String(a),String(b),{kind:'imports',line:1});
  return g;
}
const ring = (n:number) => Array.from({length:n},(_,i)=>[i,(i+1)%n]);
function measured(g:DirectedGraph) { const r=analyzeCyclicGroups(g); if(r.status!=='analyzed') throw Error(r.reason); return r; }

describe('cyclic dependency groups contract',()=>{
  const fixtures = [
    {name:'bidirected triangle',n:3,edges:[[0,1],[1,0],[1,2],[2,1],[0,2],[2,0]],groups:1,files:3,largest:3,score:19},
    {name:'layered DAG',n:100,edges:Array.from({length:90},(_,i)=>[i,i+10]),groups:0,files:0,largest:0,score:100},
    {name:'188-file dense tangle plus isolates',n:1000,edges:Array.from({length:188},(_,i)=>Array.from({length:188},(_,j)=>[i,j]).filter(e=>e[0]!==e[1])).flat(),groups:1,files:188,largest:188,score:35},
    {name:'94 independent pairs plus isolates',n:1000,edges:Array.from({length:94},(_,i)=>[[2*i,2*i+1],[2*i+1,2*i]]).flat(),groups:94,files:188,largest:2,score:55},
    {name:'100-file single long cycle',n:100,edges:ring(100),groups:1,files:100,largest:100,score:2},
  ];
  for(const f of fixtures) it(`${f.name}: G=${f.groups}, C=${f.files}, L=${f.largest}, score=${f.score}`,()=>{
    const r=measured(graph(f.n,f.edges));
    expect([r.groupCount,r.cyclicFileCount,r.largestGroupSize,r.score]).toEqual([f.groups,f.files,f.largest,f.score]);
    expect(r.cyclicFileRatio).toBe(f.files/f.n);
  });
  it('merges 2 groups to 1 without freeing files (84→82); reverse is a split',()=>{
    const a=graph(100,[[0,1],[1,0],[2,3],[3,2],[1,2]]); const b=a.copy();b.addEdge('3','0',{kind:'imports'});
    const merge=compareCyclicGroups(a,b);expect(merge.status).toBe('compared');if(merge.status!=='compared')throw Error(merge.reason);
    expect([merge.before.score,merge.after.score]).toEqual([84,82]);
    expect(merge.before.cyclicFileCount).toBe(4);expect(merge.after.cyclicFileCount).toBe(4);
    expect(merge.groupsMerged).toHaveLength(1);expect(merge.groupsEliminated).toEqual([]);expect(merge.freedFiles).toEqual([]);expect(merge.newlyCyclicFiles).toEqual([]);
    const split=compareCyclicGroups(b,a);if(split.status!=='compared')throw Error(split.reason);
    expect(split.groupsSplit).toHaveLength(1);expect(split.groupsEliminated).toEqual([]);expect(split.freedFiles).toEqual([]);
  });
  it('reports a chord as internal edge change, not a newly formed group',()=>{
    const a=graph(4,ring(3)); const b=a.copy(); b.addEdge('0','2',{kind:'calls'});
    const diff=compareCyclicGroups(a,b);if(diff.status!=='compared')throw Error(diff.reason);
    expect(diff.internalEdgesChanged).toHaveLength(1);expect(diff.internalEdgesChanged[0].addedFileEdges).toEqual([['file-000.ts','file-002.ts']]);expect(diff.groupsFormed).toEqual([]);
  });
  it('distinguishes newly cyclic, freed, added and deleted files',()=>{
    const a=graph(5,[[0,1],[1,0]]);const b=graph(5,[[1,2],[2,1]]);b.dropNode('0');b.addNode('5',{filePath:'added.ts'});b.addEdge('5','1',{kind:'calls'});b.addEdge('1','5',{kind:'calls'});
    const d=compareCyclicGroups(a,b);if(d.status!=='compared')throw Error(d.reason);
    expect(d.newlyCyclicFiles).toEqual(['file-002.ts']);expect(d.addedCyclicFiles).toEqual(['added.ts']);expect(d.removedCyclicFiles).toEqual(['file-000.ts']);expect(d.freedFiles).toEqual([]);
    const clean=graph(5,[]);const freed=compareCyclicGroups(a,clean);if(freed.status!=='compared')throw Error(freed.reason);expect(freed.freedFiles).toEqual(['file-000.ts','file-001.ts']);
  });
  it('applies explicit rename identities without fabricated transitions',()=>{
    const a=graph(3,[[0,1],[1,0]]);const b=a.copy();b.setNodeAttribute('0','filePath','renamed.ts');
    const d=compareCyclicGroups(a,b,{renames:{'file-000.ts':'renamed.ts'}});if(d.status!=='compared')throw Error(d.reason);
    expect(d.newlyCyclicFiles).toEqual([]);expect(d.addedCyclicFiles).toEqual([]);expect(d.removedCyclicFiles).toEqual([]);expect(d.membershipsChanged).toEqual([]);expect(d.internalEdgesChanged).toEqual([]);
  });
  it('retains legacy import targets, but excludes ordinary type references',()=>{
    const g=graph(3,[[0,1]]);g.addEdge('1','2',{kind:'references-type',typeOnlyImport:true,originalImportTarget:'0'});
    expect(measured(g).cyclicFileCount).toBe(2);expect(measured(g).groups[0].witness.edges.some(e=>e.normalizedTypeOnlyImport)).toBe(true);
    const b=analyzeCyclicGroups(g,{edgeView:'value-dependencies-v1'});expect(b.status==='analyzed'&&b.groupCount).toBe(0);
    g.setEdgeAttribute(g.edge('1','2'),'typeOnlyFallback',true);expect(measured(g).groupCount).toBe(0);
  });
  it('canonicalizes membership and shortest witness under reversed node and edge insertion',()=>{
    const g=graph(5,[[0,2],[2,0],[0,1],[1,0],[1,2],[2,1]]);const reversed=new DirectedGraph();
    for(const id of g.nodes().reverse())reversed.addNode(id,g.getNodeAttributes(id));
    for(const id of g.edges().reverse())reversed.addEdge(g.source(id),g.target(id),g.getEdgeAttributes(id));
    expect(JSON.stringify(measured(g))).toBe(JSON.stringify(measured(reversed)));
    expect(measured(g).groups[0].witness.files).toEqual(['file-000.ts','file-001.ts','file-000.ts']);
    expect(compareCanonical('\uE000','😀')).toBeLessThan(0);
  });
  it('rejects unknown edge kinds and missing paths, and never scores an empty graph as clean',()=>{
    const g=graph(2,[[0,1]]);g.setEdgeAttribute(g.edges()[0],'kind','unexpected');expect(analyzeCyclicGroups(g).status).toBe('unavailable');
    g.clearEdges();g.removeNodeAttribute('0','filePath');expect(analyzeCyclicGroups(g).status).toBe('unavailable');
    expect(analyzeCyclicGroups(new DirectedGraph())).toMatchObject({status:'no_graph_files',score:null});
    expect(compareCyclicGroups(graph(2,[]),graph(2,[]),{sourceCoverage:'partial'}).status).toBe('not_comparable');
  });
  it('uses the same metric in health, docs, security and simulation; suppresses legacy trend delta',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'cyclic-contract-'));try{
      const g=graph(4,[[0,1],[1,0]]);g.setNodeAttribute('0','filePath','auth.ts');
      mkdirSync(join(dir,'.depwire'));writeFileSync(join(dir,'.depwire','health-history.json'),JSON.stringify([{timestamp:'old',score:100,grade:'A',dimensions:[]}]));
      const h=calculateHealthScore(g,dir);expect(h.cyclicGroups).toEqual(measured(g));expect(h.dimensions[2].metrics.cyclicFileCount).toBe(2);
      expect(getHealthTrend(dir,h.overall)).toContain('no improvement or regression delta');
      expect(formatCyclicGroups(g,10)).toContain('1 cyclic dependency groups; 2/4 files');
      const security=await checkArchitecture([],dir,g);expect(security.filter(f=>f.title==='Cyclic dependency group involving auth/crypto')).toHaveLength(1);
      const sim=new SimulationEngine(g).simulate({type:'delete',target:'auth.ts'});expect(sim.diff.cyclicGroupChanges.status).toBe('compared');
      if(sim.diff.cyclicGroupChanges.status==='compared'){expect(sim.diff.cyclicGroupChanges.removedCyclicFiles).toEqual(['auth.ts']);expect(sim.diff.cyclicGroupChanges.freedFiles).toEqual(['file-001.ts']);}
      expect(JSON.stringify(h)).not.toContain('"cycles":');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('verify-change exposes unavailable topology instead of certifying an export-only comparison',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'verify-cyclic-'));
    try {
      writeFileSync(join(dir,'file-000.ts'),'export function f0() {}');
      const g=graph(2,[]);g.setNodeAttribute('0','exported',true);
      const result=await verifyChange({file_path:'file-000.ts',new_content:'export function f0() { return 1; }'},{graph:g,projectRoot:dir});
      expect(result.broken_imports).toEqual([]);
      expect(result.cyclicGroupChanges.status).toBe('not_comparable');
      expect(result.safe).toBe(false);expect(result.risk_level).toBe('medium');
      expect(result.warnings.join(' ')).toContain('fully resolved after-graph');
      expect(result).not.toHaveProperty('new_circular_dependencies');
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
  it('never rewards added edges on a fixed file set',()=>{
    expect(scoreCyclicGroups(100,4,4)).toBeLessThan(scoreCyclicGroups(100,4,2)!);
    expect(scoreCyclicGroups(10000,2,2)).toBe(99);
  });
});

import type { DirectedGraph } from 'graphology';
import { analyzeCyclicGroups } from '../graph/cyclic-groups.js';

export function formatCyclicGroups(graph: DirectedGraph, limit: number): string {
  const result = analyzeCyclicGroups(graph);
  if (result.status !== 'analyzed') return `Cyclic dependency groups unavailable: ${result.reason}\n\n`;
  let output = `${result.groupCount} cyclic dependency groups; ${result.cyclicFileCount}/${result.graphFileCount} files (${(100*result.cyclicFileRatio).toFixed(2)}%); largest group: ${result.largestGroupSize} files.\n\nEdge view: ${result.edgeView}. Witnesses illustrate a dependency loop; they are not exhaustive cycle counts.\n\n`;
  for (const group of result.groups.slice(0,limit)) {
    output += `**Group (${group.size} files):** ${group.files.map(f => `\`${f}\``).join(', ')}\n\n`;
    output += `Witness: ${group.witness.files.map(f => `\`${f}\``).join(' → ')}\n\n`;
    for (const edge of group.witness.edges) output += `- ${edge.sourceSymbol} → ${edge.targetSymbol} (${edge.kind}${edge.normalizedTypeOnlyImport ? '; legacy type-import normalization' : ''})\n`;
    output += '\n';
  }
  if (result.groupCount > limit) output += `${result.groupCount-limit} additional groups omitted from this summary.\n\n`;
  return output;
}

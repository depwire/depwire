/**
 * Renderers for the service graph: text table, Mermaid, DOT, JSON.
 */

import type { ServiceGraph } from './types.js';

export function renderText(graph: ServiceGraph): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`Depwire service graph — ${graph.rootPath}`);
  lines.push('═'.repeat(70));
  lines.push(`Services:    ${graph.stats.serviceCount}`);
  lines.push(`Edges:       ${graph.stats.edgeCount}`);
  lines.push(`  REST:        ${graph.stats.restEdges}`);
  lines.push(`  Kafka:       ${graph.stats.kafkaEdges}`);
  lines.push(`  RabbitMQ:    ${graph.stats.rabbitmqEdges}`);
  lines.push(`  SQS:         ${graph.stats.sqsEdges}`);
  lines.push(`  Kinesis:     ${graph.stats.kinesisEdges}`);
  const streamBinding = graph.edges.filter(e => e.kind === 'stream-binding').length;
  lines.push(`  Stream:      ${streamBinding}`);
  lines.push(`Unresolved:  ${graph.unresolved.length}  (outbound calls with no matching listener)`);
  lines.push(`Time:        ${graph.stats.detectionTimeMs}ms`);
  lines.push('');

  // Per-service summary
  lines.push('Services');
  lines.push('─'.repeat(70));
  const colWidth = Math.max(...graph.services.map(s => s.name.length), 10);
  for (const svc of [...graph.services].sort((a, b) => a.name.localeCompare(b.name))) {
    const inbound = svc.channels.filter(c => c.direction === 'inbound').length;
    const outbound = svc.channels.filter(c => c.direction === 'outbound').length;
    lines.push(
      `  ${svc.name.padEnd(colWidth)}  files: ${String(svc.filesScanned).padStart(4)}  in: ${String(inbound).padStart(3)}  out: ${String(outbound).padStart(3)}`,
    );
  }
  lines.push('');

  // Edges grouped by source service
  lines.push('Service Edges');
  lines.push('─'.repeat(70));
  const grouped = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    const list = grouped.get(edge.source) ?? [];
    list.push(edge);
    grouped.set(edge.source, list);
  }
  for (const source of [...grouped.keys()].sort()) {
    lines.push('');
    lines.push(`▶ ${source}`);
    for (const edge of grouped.get(source)!.sort((a, b) => a.target.localeCompare(b.target))) {
      const tag = edge.kind.toUpperCase().padEnd(8);
      const method = edge.httpMethod ? `[${edge.httpMethod}] ` : '';
      const conf = edge.confidence === 'low' ? ' (low confidence)' : '';
      lines.push(`    └─ ${tag} ${method}${edge.identifier} → ${edge.target}${conf}`);
      if (edge.sites.length > 0) {
        const first = edge.sites[0];
        lines.push(`         from ${first.filePath}:${first.line}${edge.sites.length > 1 ? ` (+${edge.sites.length - 1} more sites)` : ''}`);
      }
    }
  }

  if (graph.unresolved.length > 0) {
    lines.push('');
    lines.push('Unresolved outbound channels (no matching inbound listener)');
    lines.push('─'.repeat(70));
    const byService = new Map<string, typeof graph.unresolved>();
    for (const u of graph.unresolved) {
      const list = byService.get(u.serviceName) ?? [];
      list.push(u);
      byService.set(u.serviceName, list);
    }
    for (const svc of [...byService.keys()].sort()) {
      lines.push('');
      lines.push(`▶ ${svc}`);
      for (const u of byService.get(svc)!.slice(0, 20)) {
        const tag = u.kind.toUpperCase().padEnd(8);
        const method = u.httpMethod ? `[${u.httpMethod}] ` : '';
        lines.push(`    · ${tag} ${method}${u.identifier}`);
        lines.push(`         from ${u.filePath}:${u.line}`);
      }
      const total = byService.get(svc)!.length;
      if (total > 20) lines.push(`    · ... ${total - 20} more`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function renderMermaid(graph: ServiceGraph): string {
  const lines: string[] = ['flowchart LR'];
  // Node declarations
  for (const svc of graph.services) {
    const id = sanitizeMermaidId(svc.name);
    lines.push(`  ${id}["${svc.name}"]`);
  }
  // Edges (deduped per source/target/kind)
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${edge.source}|${edge.target}|${edge.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sourceId = sanitizeMermaidId(edge.source);
    const targetId = sanitizeMermaidId(edge.target);
    const label = labelForKind(edge.kind, edge.httpMethod);
    lines.push(`  ${sourceId} -- "${label}" --> ${targetId}`);
  }
  return lines.join('\n');
}

export function renderDot(graph: ServiceGraph): string {
  const lines: string[] = ['digraph services {', '  rankdir=LR;', '  node [shape=box, style=rounded];'];
  for (const svc of graph.services) {
    lines.push(`  "${svc.name}";`);
  }
  for (const edge of graph.edges) {
    const label = labelForKind(edge.kind, edge.httpMethod);
    lines.push(`  "${edge.source}" -> "${edge.target}" [label="${label}"];`);
  }
  lines.push('}');
  return lines.join('\n');
}

function sanitizeMermaidId(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

function labelForKind(kind: string, httpMethod?: string): string {
  if (kind === 'rest') return httpMethod ? `REST ${httpMethod}` : 'REST';
  return kind;
}

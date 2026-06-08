/**
 * Self-contained HTML renderer for the service graph.
 *
 * Embeds the graph data inline and uses the vis-network library (loaded from a
 * CDN) to render an interactive force-directed diagram. No build step needed
 * for the viewer — open the file in any browser.
 */

import type { ServiceGraph } from './types.js';

const KIND_COLORS: Record<string, string> = {
  rest: '#00d4aa',
  kafka: '#f0a500',
  rabbitmq: '#ff6b35',
  sqs: '#7c4dff',
  kinesis: '#39c2d7',
  'stream-binding': '#9c27b0',
};

export function renderHtml(graph: ServiceGraph): string {
  const visData = toVisData(graph);
  const json = JSON.stringify(visData);
  const stats = graph.stats;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Depwire — service graph</title>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    :root {
      --bg: #0a0e0d;
      --panel: #11201a;
      --panel-border: #1f3a30;
      --text: #d6efe5;
      --text-dim: #8aa599;
      --accent: #00d4aa;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 18px; border-bottom: 1px solid var(--panel-border);
      background: var(--panel);
    }
    header h1 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: 0.4px; }
    header h1 .accent { color: var(--accent); }
    header .stats { font-size: 12px; color: var(--text-dim); }
    header .stats span { margin-left: 16px; }
    header .stats span b { color: var(--text); font-weight: 600; }
    main { display: flex; height: calc(100vh - 50px); }
    #network { flex: 1; background: var(--bg); }
    aside {
      width: 320px; padding: 14px 16px; overflow-y: auto;
      border-left: 1px solid var(--panel-border); background: var(--panel);
      font-size: 12px;
    }
    aside h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-dim); }
    aside section { margin-bottom: 18px; }
    aside .legend-row { display: flex; align-items: center; margin-bottom: 6px; }
    aside .legend-row .swatch { width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
    aside .filters label { display: flex; align-items: center; cursor: pointer; padding: 4px 0; }
    aside .filters input { margin-right: 8px; accent-color: var(--accent); }
    aside .selection { font-size: 12px; line-height: 1.5; }
    aside .selection .empty { color: var(--text-dim); }
    aside .selection .row { padding: 6px 0; border-bottom: 1px dashed var(--panel-border); }
    aside .selection .row:last-child { border-bottom: 0; }
    aside .selection .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; margin-right: 6px; color: #001; font-weight: 600; }
    aside .selection .file { color: var(--text-dim); font-size: 11px; }
    aside footer { color: var(--text-dim); font-size: 10px; margin-top: 16px; line-height: 1.5; }
  </style>
</head>
<body>
  <header>
    <h1><span class="accent">Depwire</span> service graph</h1>
    <div class="stats">
      <span>services <b>${stats.serviceCount}</b></span>
      <span>edges <b>${stats.edgeCount}</b></span>
      <span>REST <b>${stats.restEdges}</b></span>
      <span>Kafka <b>${stats.kafkaEdges}</b></span>
      <span>RabbitMQ <b>${stats.rabbitmqEdges}</b></span>
      <span>SQS <b>${stats.sqsEdges}</b></span>
      <span>unresolved <b>${graph.unresolved.length}</b></span>
    </div>
  </header>
  <main>
    <div id="network"></div>
    <aside>
      <section>
        <h2>Legend</h2>
        ${Object.entries(KIND_COLORS).map(([k, c]) => `
          <div class="legend-row"><span class="swatch" style="background:${c}"></span>${k}</div>
        `).join('')}
      </section>
      <section class="filters">
        <h2>Channel filters</h2>
        ${Object.keys(KIND_COLORS).map(k => `
          <label><input type="checkbox" value="${k}" checked />${k}</label>
        `).join('')}
      </section>
      <section>
        <h2>Selection</h2>
        <div class="selection" id="selection"><span class="empty">Click a node or edge.</span></div>
      </section>
      <footer>
        Deterministic graph built from source.<br>
        Click a node to highlight its neighbors. Drag to rearrange.
      </footer>
    </aside>
  </main>

  <script>
    const data = ${json};
    const KIND_COLORS = ${JSON.stringify(KIND_COLORS)};

    const visNodes = new vis.DataSet(data.nodes);
    const visEdges = new vis.DataSet(data.edges);

    const container = document.getElementById('network');
    const network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, {
      autoResize: true,
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -55, springLength: 140, avoidOverlap: 0.6 },
        stabilization: { iterations: 200 },
      },
      interaction: { hover: true, multiselect: true, navigationButtons: true, keyboard: true },
      nodes: {
        shape: 'box',
        margin: { top: 10, right: 14, bottom: 10, left: 14 },
        color: { background: '#11201a', border: '#1f3a30', highlight: { background: '#1c3329', border: '#00d4aa' } },
        font: { color: '#d6efe5', face: 'ui-sans-serif', size: 14 },
        borderWidth: 1,
      },
      edges: {
        arrows: 'to',
        smooth: { type: 'dynamic' },
        font: { color: '#8aa599', size: 11, strokeWidth: 0, align: 'top' },
      },
    });

    // Selection panel
    const selectionEl = document.getElementById('selection');
    function renderSelection(payload) {
      if (!payload) {
        selectionEl.innerHTML = '<span class="empty">Click a node or edge.</span>';
        return;
      }
      selectionEl.innerHTML = payload;
    }

    network.on('selectNode', params => {
      const id = params.nodes[0];
      const node = data.nodes.find(n => n.id === id);
      if (!node) return;
      const incoming = data.edges.filter(e => e.to === id);
      const outgoing = data.edges.filter(e => e.from === id);
      renderSelection(\`
        <div class="row"><b>\${node.label}</b></div>
        <div class="row"><b>incoming</b> (\${incoming.length})\${incoming.map(formatEdgeRow).join('')}</div>
        <div class="row"><b>outgoing</b> (\${outgoing.length})\${outgoing.map(formatEdgeRow).join('')}</div>
      \`);
    });
    network.on('selectEdge', params => {
      if (params.nodes.length > 0) return;
      const id = params.edges[0];
      const edge = data.edges.find(e => e.id === id);
      if (!edge) return;
      renderSelection(\`
        <div class="row"><b>\${edge.from}</b> → <b>\${edge.to}</b></div>
        <div class="row"><span class="badge" style="background:\${KIND_COLORS[edge.kind] || '#888'}">\${edge.kind}\${edge.method ? ' ' + edge.method : ''}</span>\${edge.identifier}</div>
        \${(edge.sites || []).map(s => '<div class="file">' + s + '</div>').join('')}
      \`);
    });
    network.on('deselectNode', () => renderSelection(null));
    network.on('deselectEdge', () => renderSelection(null));

    function formatEdgeRow(edge) {
      const color = KIND_COLORS[edge.kind] || '#888';
      const peer = edge.from === edge._self ? edge.to : edge.from;
      return \`<div class="row"><span class="badge" style="background:\${color}">\${edge.kind}</span>\${edge.from} → \${edge.to}<div class="file">\${edge.identifier}</div></div>\`;
    }

    // Filters
    document.querySelectorAll('.filters input').forEach(el => {
      el.addEventListener('change', () => {
        const enabled = new Set([...document.querySelectorAll('.filters input:checked')].map(i => i.value));
        const visible = data.edges.filter(e => enabled.has(e.kind));
        visEdges.clear();
        visEdges.add(visible);
      });
    });
  </script>
</body>
</html>`;
}

interface VisNode { id: string; label: string; }
interface VisEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  color?: { color: string };
  kind: string;
  method?: string;
  identifier: string;
  sites: string[];
}

function toVisData(graph: ServiceGraph): { nodes: VisNode[]; edges: VisEdge[] } {
  const nodes: VisNode[] = graph.services.map(s => ({ id: s.name, label: s.name }));
  // Add synthetic "external:<...>" nodes referenced by edges but not in services.
  const knownIds = new Set(nodes.map(n => n.id));
  for (const e of graph.edges) {
    if (e.source.startsWith('external-') && !knownIds.has(e.source)) {
      knownIds.add(e.source);
      nodes.push({ id: e.source, label: e.source.replace(/^external-[^:]+:/, '⇡ ') });
    }
  }
  const edges: VisEdge[] = graph.edges.map((e, idx) => ({
    id: 'e' + idx,
    from: e.source,
    to: e.target,
    label: e.kind === 'rest' ? `REST ${e.httpMethod ?? ''}`.trim() : e.kind,
    color: { color: KIND_COLORS[e.kind] ?? '#888' },
    kind: e.kind,
    method: e.httpMethod,
    identifier: e.identifier,
    sites: e.sites.slice(0, 5).map(s => `${s.filePath}:${s.line}`),
  }));
  return { nodes, edges };
}

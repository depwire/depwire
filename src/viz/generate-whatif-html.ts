import type { VizData } from './types.js';
import type { SimulationResult } from '../simulation/engine.js';

export function generateWhatIfHtml(
  currentVizData: VizData,
  simulatedVizData: VizData,
  simulationResult: SimulationResult,
  operation: string,
  target: string
): string {
  const { healthDelta, diff } = simulationResult;

  const deltaSign = healthDelta.delta >= 0 ? '+' : '';
  const deltaLabel =
    healthDelta.delta === 0
      ? 'unchanged'
      : healthDelta.improved
        ? `${deltaSign}${healthDelta.delta} \u2713 improved`
        : `${healthDelta.delta} \u2717 degraded`;
  const deltaColor = healthDelta.delta === 0 ? '#fbbf24' : healthDelta.improved ? '#4ade80' : '#f87171';

  const opBadge = operation !== 'none'
    ? `<span style="background:${deltaColor};color:#000;padding:4px 12px;border-radius:4px;font-weight:700;font-size:13px;text-transform:uppercase;margin-left:12px;">${operation} ${target}</span>`
    : '';

  const brokenImportsHtml = diff.brokenImports.length > 0
    ? `<details style="margin-top:16px;background:#16213e;border:1px solid #2a2a4a;border-radius:8px;padding:12px 16px;">
        <summary style="cursor:pointer;color:#f87171;font-weight:600;font-size:14px;">Broken Imports (${diff.brokenImports.length})</summary>
        <ul style="margin:8px 0 0 16px;padding:0;list-style:none;">
          ${diff.brokenImports.map(bi => `<li style="color:#e0e0e0;font-size:13px;padding:4px 0;font-family:monospace;">${bi.file} \u2192 <span style="color:#f87171;">${bi.importedSymbol}</span></li>`).join('')}
        </ul>
      </details>`
    : '';

  const currentDataJson = JSON.stringify(currentVizData);
  const simulatedDataJson = JSON.stringify(simulatedVizData);

  // Build a set of removed edge file pairs for the right diagram to highlight
  const removedFilePairs = diff.removedEdges.map(e => ({
    source: e.source.split('::')[0],
    target: e.target.split('::')[0],
  }));
  const removedFilePairsJson = JSON.stringify(removedFilePairs);

  // Build affected files set and broken imports file set for ghost+red highlighting
  const affectedFilesJson = JSON.stringify(diff.affectedNodes);
  const brokenImportFilesJson = JSON.stringify(diff.brokenImports.map(bi => bi.file));

  // Stats bar values
  const brokenCount = diff.brokenImports.length;
  const affectedCount = diff.affectedNodes.length;
  const healthDeltaVal = healthDelta.delta;

  // Risk level
  let riskLevel: string;
  let riskColor: string;
  if (brokenCount > 10 || affectedCount > 20) {
    riskLevel = 'High';
    riskColor = '#ef4444';
  } else if (brokenCount > 3 || affectedCount > 5) {
    riskLevel = 'Medium';
    riskColor = '#fbbf24';
  } else {
    riskLevel = 'Low';
    riskColor = '#4ade80';
  }

  const brokenColor = brokenCount > 0 ? '#ef4444' : '#4ade80';
  const affectedColor = affectedCount > 0 ? '#ef4444' : '#4ade80';
  const healthDeltaColor = healthDeltaVal < 0 ? '#ef4444' : healthDeltaVal > 0 ? '#4ade80' : '#6b7280';
  const healthDeltaStr = healthDeltaVal > 0 ? `+${healthDeltaVal}` : healthDeltaVal === 0 ? '0' : `${healthDeltaVal}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Depwire — What If Simulation</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    body { overflow: auto; height: auto; }
    .whatif-header {
      background: #16213e;
      border-bottom: 1px solid #2a2a4a;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .whatif-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      background: linear-gradient(135deg, #4a9eff, #7c3aed);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .stats-bar {
      background: #0f1729;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      padding: 12px 24px;
      margin: 16px 24px;
      display: flex;
      align-items: center;
      gap: 28px;
      flex-wrap: wrap;
    }
    .stats-bar .stat {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: #a0a0a0;
    }
    .stats-bar .stat-val {
      font-weight: 700;
      font-size: 18px;
    }
    .stats-bar .risk-badge {
      padding: 4px 14px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      color: #000;
    }
    .panels {
      display: flex;
      flex-direction: row;
      gap: 0;
      width: 100%;
      height: calc(100vh - 220px);
      min-height: 400px;
    }
    .panel {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #2a2a4a;
      overflow: hidden;
      position: relative;
    }
    .panel:last-child { border-right: none; }
    .panel-label {
      background: #16213e;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      color: #a0a0a0;
      border-bottom: 1px solid #2a2a4a;
      display: flex;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .panel-diagram {
      flex: 1;
      overflow: hidden;
      position: relative;
    }
    .panel-diagram svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .broken-section {
      padding: 0 24px 24px;
    }
  </style>
</head>
<body>
  <div class="whatif-header">
    <h1>depwire — What If Simulation</h1>
    ${opBadge}
  </div>

  <div class="stats-bar">
    <div class="stat">Broken Imports: <span class="stat-val" style="color:${brokenColor}">${brokenCount}</span></div>
    <div class="stat">Affected Files: <span class="stat-val" style="color:${affectedColor}">${affectedCount}</span></div>
    <div class="stat">Health Score Delta: <span class="stat-val" style="color:${healthDeltaColor}">${healthDeltaStr}</span></div>
    <div class="stat"><span class="risk-badge" style="background:${riskColor}">${riskLevel} Risk</span></div>
  </div>

  <div class="panels">
    <div class="panel">
      <div class="panel-label">
        <span>Current State</span>
        <span>${currentVizData.stats.totalFiles} files</span>
      </div>
      <div class="panel-diagram" id="arc-diagram-current">
        <svg id="svg-current"></svg>
      </div>
      <div class="tooltip" id="tooltip-current"></div>
    </div>
    <div class="panel">
      <div class="panel-label">
        <span>After Simulation</span>
        <span>${simulatedVizData.stats.totalFiles} files</span>
      </div>
      <div class="panel-diagram" id="arc-diagram-simulated">
        <svg id="svg-simulated"></svg>
      </div>
      <div class="tooltip" id="tooltip-simulated"></div>
    </div>
  </div>

  <div class="broken-section">
    ${brokenImportsHtml}
  </div>

  <script>window.__depwireWhatIf = true;</script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
  <script src="/arc.js"></script>
  <script>
    const currentData = ${currentDataJson};
    const simulatedData = ${simulatedDataJson};
    const removedFilePairs = ${removedFilePairsJson};
    const affectedFiles = new Set(${affectedFilesJson});
    const brokenImportFiles = new Set(${brokenImportFilesJson});

    // Inject broken arcs and ghost files into the simulated data
    // so they render on the right diagram and can be colored red
    if (removedFilePairs.length > 0) {
      // Deduplicate removed edges to file-level arcs
      const brokenArcMap = new Map();
      const ghostFiles = new Set();
      const existingFiles = new Set(simulatedData.files.map(f => f.path));

      for (const pair of removedFilePairs) {
        const key = pair.source + '::' + pair.target;
        if (brokenArcMap.has(key)) {
          brokenArcMap.get(key).edgeCount++;
        } else {
          brokenArcMap.set(key, {
            sourceFile: pair.source,
            targetFile: pair.target,
            edgeCount: 1,
            edgeKinds: ['imports'],
            broken: true,
          });
        }
        // Track files that don't exist in simulated data (deleted files)
        if (!existingFiles.has(pair.source)) ghostFiles.add(pair.source);
        if (!existingFiles.has(pair.target)) ghostFiles.add(pair.target);
      }

      // Add ghost file bars for deleted files
      for (const gf of ghostFiles) {
        simulatedData.files.push({
          path: gf,
          directory: gf.includes('/') ? gf.substring(0, gf.lastIndexOf('/')) : '.',
          symbolCount: 0,
          incomingCount: 0,
          outgoingCount: 0,
          ghost: true,
        });
      }

      // Re-sort files so ghost files are in correct position
      simulatedData.files.sort((a, b) => {
        if (a.directory !== b.directory) return a.directory.localeCompare(b.directory);
        return a.path.localeCompare(b.path);
      });

      // Add broken arcs to simulated data
      for (const arc of brokenArcMap.values()) {
        simulatedData.arcs.push(arc);
      }
    }

    // Mark affected arcs in simulated data
    simulatedData.arcs.forEach(arc => {
      if (affectedFiles.has(arc.sourceFile) || affectedFiles.has(arc.targetFile)) {
        arc.affected = true;
      }
    });

    // Mark affected file bars in simulated data
    simulatedData.files.forEach(file => {
      if (affectedFiles.has(file.path)) {
        file.affected = true;
      }
    });

    const left = window.createArcDiagram('arc-diagram-current', 'svg-current', 'tooltip-current', currentData);
    const right = window.createArcDiagram('arc-diagram-simulated', 'svg-simulated', 'tooltip-simulated', simulatedData);

    left.render();
    right.render();

    function applyGhostRedStyling() {
      const simContainer = d3.select('#arc-diagram-simulated');
      const hasAffected = affectedFiles.size > 0;

      if (!hasAffected) return;

      // --- SVG filter for red glow on affected nodes ---
      let defs = d3.select('#svg-simulated').select('defs');
      if (defs.empty()) {
        defs = d3.select('#svg-simulated').insert('defs', ':first-child');
      }
      if (defs.select('#red-glow').empty()) {
        const filter = defs.append('filter').attr('id', 'red-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
        filter.append('feDropShadow').attr('dx', 0).attr('dy', 0).attr('stdDeviation', 4).attr('flood-color', '#ef4444').attr('flood-opacity', 0.8);
      }

      // --- Edges ---
      simContainer.selectAll('.arc').each(function(d) {
        const el = d3.select(this);
        if (d.broken) {
          // Broken import edges: dashed red, thicker
          el.attr('stroke', '#ef4444')
            .attr('stroke-opacity', 1.0)
            .attr('stroke-width', 3.0)
            .attr('stroke-dasharray', '6,3')
            .style('filter', null);
        } else if (d.affected) {
          // Affected edges: solid red
          el.attr('stroke', '#ef4444')
            .attr('stroke-opacity', 1.0)
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', null)
            .style('filter', null);
        } else {
          // Non-affected edges: ghost
          el.attr('stroke-opacity', 0.08);
        }
      });

      // --- Node bars ---
      simContainer.selectAll('.file-bar').each(function(d) {
        const el = d3.select(this);
        if (d.affected || d.ghost) {
          // Affected / ghost nodes: glowing red
          el.attr('fill', '#ef4444')
            .attr('opacity', 1.0)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2)
            .style('filter', 'url(#red-glow)');
        } else {
          // Non-affected nodes: ghost
          el.attr('opacity', 0.15);
        }
      });
    }

    applyGhostRedStyling();

    window.addEventListener('resize', () => {
      left.render();
      right.render();
      applyGhostRedStyling();
    });
  </script>
</body>
</html>`;
}

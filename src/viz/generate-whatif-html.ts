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
    .health-banner {
      background: #0f1729;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      padding: 16px 24px;
      margin: 16px 24px;
      display: flex;
      align-items: center;
      gap: 32px;
      flex-wrap: wrap;
    }
    .health-score {
      font-size: 22px;
      font-weight: 700;
    }
    .health-stat {
      font-size: 14px;
      color: #a0a0a0;
    }
    .health-stat strong {
      color: #e0e0e0;
      font-size: 18px;
    }
    .panels {
      display: flex;
      flex-direction: row;
      gap: 0;
      width: 100%;
      height: calc(100vh - 180px);
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
    .broken-arc {
      stroke: #ef4444 !important;
      stroke-opacity: 1.0 !important;
      stroke-width: 2px !important;
      filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.6));
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

  <div class="health-banner">
    <div class="health-score" style="color:${deltaColor}">
      Health Score: ${healthDelta.before} \u2192 ${healthDelta.after}
      <span style="font-size:16px;margin-left:8px;">(${deltaLabel})</span>
    </div>
    <div class="health-stat"><strong>${diff.affectedNodes.length}</strong> Affected Nodes</div>
    <div class="health-stat"><strong>${diff.brokenImports.length}</strong> Broken Imports</div>
    <div class="health-stat"><strong>${diff.removedEdges.length}</strong> Removed Edges</div>
  </div>

  <div class="panels">
    <div class="panel">
      <div class="panel-label">
        <span>Current</span>
        <span>${currentVizData.stats.totalFiles} files</span>
      </div>
      <div class="panel-diagram" id="arc-diagram-current">
        <svg id="svg-current"></svg>
      </div>
      <div class="tooltip" id="tooltip-current"></div>
    </div>
    <div class="panel">
      <div class="panel-label">
        <span>After ${operation !== 'none' ? operation.toUpperCase() : '—'}</span>
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

    const left = window.createArcDiagram('arc-diagram-current', 'svg-current', 'tooltip-current', currentData);
    const right = window.createArcDiagram('arc-diagram-simulated', 'svg-simulated', 'tooltip-simulated', simulatedData);

    left.render();
    right.render();

    // Highlight broken (removed) arcs in red on the RIGHT diagram only
    if (removedFilePairs.length > 0) {
      const brokenSet = new Set(removedFilePairs.map(p => p.source + '::' + p.target));
      d3.select('#arc-diagram-simulated').selectAll('.arc')
        .filter(d => brokenSet.has(d.sourceFile + '::' + d.targetFile) || brokenSet.has(d.targetFile + '::' + d.sourceFile))
        .classed('broken-arc', true);
    }

    window.addEventListener('resize', () => {
      left.render();
      right.render();
    });
  </script>
</body>
</html>`;
}

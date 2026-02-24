import type { VizData } from './types.js';

export interface ArcDiagramOptions {
  highlight?: string;
  maxFiles?: number;
  width?: number;
  height?: number;
}

export function generateArcDiagramHTML(
  vizData: VizData,
  options: ArcDiagramOptions = {}
): string {
  const {
    highlight = '',
    maxFiles = 0,
    width = 1200,
    height = 600,
  } = options;

  // Filter to top N most connected files if maxFiles is set
  let files = [...vizData.files];
  if (maxFiles > 0 && files.length > maxFiles) {
    files = files
      .sort((a, b) => (b.incomingCount + b.outgoingCount) - (a.incomingCount + a.outgoingCount))
      .slice(0, maxFiles);
    
    const filePathSet = new Set(files.map(f => f.path));
    vizData = {
      ...vizData,
      files,
      arcs: vizData.arcs.filter(arc => 
        filePathSet.has(arc.sourceFile) && filePathSet.has(arc.targetFile)
      ),
    };
  }

  // Embed graph data as JSON
  const graphDataJSON = JSON.stringify({
    files: vizData.files.map(f => f.path),
    arcs: vizData.arcs.map(a => ({
      source: a.sourceFile,
      target: a.targetFile,
      count: a.edgeCount,
    })),
    highlight,
    stats: vizData.stats,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Depwire Arc Diagram</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a1a;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow: hidden;
    }
    #container {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #header {
      padding: 16px;
      background: #1a1a2e;
      border-bottom: 1px solid #2a2a4a;
    }
    #header h2 {
      font-size: 18px;
      font-weight: 600;
      color: #4a9eff;
      margin-bottom: 8px;
    }
    #stats {
      display: flex;
      gap: 20px;
      font-size: 13px;
      color: #888;
    }
    #canvas-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    #tooltip {
      position: absolute;
      background: #16213e;
      border: 1px solid #4a9eff;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      pointer-events: none;
      display: none;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="header">
      <h2>Depwire Arc Diagram</h2>
      <div id="stats"></div>
    </div>
    <div id="canvas-container">
      <canvas id="canvas"></canvas>
      <div id="tooltip"></div>
    </div>
  </div>
  
  <script>
    const graphData = ${graphDataJSON};
    
    // Setup canvas
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const tooltip = document.getElementById('tooltip');
    const container = document.getElementById('canvas-container');
    
    // Update stats
    document.getElementById('stats').innerHTML = \`
      <span><strong>\${graphData.stats.totalFiles}</strong> files</span>
      <span><strong>\${graphData.stats.totalSymbols}</strong> symbols</span>
      <span><strong>\${graphData.stats.totalCrossFileEdges}</strong> cross-file edges</span>
    \`;
    
    let hoveredArc = null;
    
    function resize() {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      render();
    }
    
    function render() {
      const w = canvas.width;
      const h = canvas.height;
      
      // Clear
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, w, h);
      
      if (graphData.files.length === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No graph data', w / 2, h / 2);
        return;
      }
      
      const fileCount = graphData.files.length;
      const barHeight = 40;
      const baseline = h - barHeight - 20;
      const fileWidth = Math.max(40, Math.min(w / fileCount, 120));
      const totalWidth = fileWidth * fileCount;
      const offsetX = (w - totalWidth) / 2;
      
      // Store file positions for hit detection
      const filePositions = {};
      graphData.files.forEach((file, i) => {
        const x = offsetX + i * fileWidth;
        filePositions[file] = { x: x + fileWidth / 2, idx: i };
      });
      
      // Draw arcs
      const arcData = [];
      graphData.arcs.forEach(arc => {
        const src = filePositions[arc.source];
        const tgt = filePositions[arc.target];
        if (!src || !tgt) return;
        if (src.idx === tgt.idx) return; // Skip same-file
        
        const x1 = src.x;
        const x2 = tgt.x;
        const distance = Math.abs(tgt.idx - src.idx);
        const maxDist = fileCount - 1;
        
        // Rainbow color based on distance
        const hue = (distance / maxDist) * 280;
        const isHovered = hoveredArc && 
          hoveredArc.source === arc.source && 
          hoveredArc.target === arc.target;
        const alpha = isHovered ? 0.9 : 0.6;
        const width = isHovered ? 2.5 : 1.5;
        
        arcData.push({ arc, x1, x2, distance, hue, alpha, width });
      });
      
      // Sort by distance (draw long arcs first)
      arcData.sort((a, b) => b.distance - a.distance);
      
      // Draw arcs
      arcData.forEach(({ arc, x1, x2, hue, alpha, width }) => {
        const midX = (x1 + x2) / 2;
        const radius = Math.abs(x2 - x1) / 2;
        const arcHeight = baseline - radius * 0.8;
        
        ctx.beginPath();
        ctx.moveTo(x1, baseline);
        ctx.quadraticCurveTo(midX, arcHeight, x2, baseline);
        ctx.strokeStyle = \`hsla(\${hue}, 80%, 60%, \${alpha})\`;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.stroke();
      });
      
      // Draw file bars
      ctx.font = '10px monospace';
      graphData.files.forEach((file, i) => {
        const x = offsetX + i * fileWidth;
        const isHighlighted = graphData.highlight && file.includes(graphData.highlight);
        
        // Bar background
        ctx.fillStyle = isHighlighted ? '#2a3a5a' : (i % 2 === 0 ? '#1a1a3e' : '#1a1a2e');
        ctx.fillRect(x, baseline, fileWidth, barHeight);
        
        // Bar border
        if (isHighlighted) {
          ctx.strokeStyle = '#4a9eff';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, baseline, fileWidth, barHeight);
        }
        
        // File label (truncated)
        const label = file.split('/').pop() || file;
        const truncated = label.length > 12 ? label.slice(0, 10) + '..' : label;
        
        ctx.save();
        ctx.translate(x + fileWidth / 2, baseline + barHeight - 8);
        ctx.rotate(-Math.PI / 6);
        ctx.fillStyle = isHighlighted ? '#4a9eff' : '#888';
        ctx.textAlign = 'left';
        ctx.fillText(truncated, 0, 0);
        ctx.restore();
      });
    }
    
    // Mouse interaction
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const w = canvas.width;
      const h = canvas.height;
      const barHeight = 40;
      const baseline = h - barHeight - 20;
      const fileCount = graphData.files.length;
      const fileWidth = Math.max(40, Math.min(w / fileCount, 120));
      const totalWidth = fileWidth * fileCount;
      const offsetX = (w - totalWidth) / 2;
      
      // Check if hovering over an arc
      let foundArc = null;
      const filePositions = {};
      graphData.files.forEach((file, i) => {
        const x = offsetX + i * fileWidth;
        filePositions[file] = { x: x + fileWidth / 2, idx: i };
      });
      
      for (const arc of graphData.arcs) {
        const src = filePositions[arc.source];
        const tgt = filePositions[arc.target];
        if (!src || !tgt || src.idx === tgt.idx) continue;
        
        const x1 = src.x;
        const x2 = tgt.x;
        const midX = (x1 + x2) / 2;
        const radius = Math.abs(x2 - x1) / 2;
        const arcHeight = baseline - radius * 0.8;
        
        // Check if mouse is near the arc (simplified hit detection)
        const distToMid = Math.abs(mouseX - midX);
        const expectedY = arcHeight + Math.sqrt(Math.max(0, radius * radius - distToMid * distToMid));
        
        if (distToMid < radius && Math.abs(mouseY - expectedY) < 10) {
          foundArc = arc;
          break;
        }
      }
      
      if (foundArc && foundArc !== hoveredArc) {
        hoveredArc = foundArc;
        tooltip.innerHTML = \`
          <strong>\${foundArc.source.split('/').pop()}</strong> →
          <strong>\${foundArc.target.split('/').pop()}</strong><br>
          <span style="color: #888">\${foundArc.count} edge(s)</span>
        \`;
        tooltip.style.display = 'block';
        tooltip.style.left = e.clientX + 15 + 'px';
        tooltip.style.top = e.clientY + 15 + 'px';
        render();
      } else if (!foundArc && hoveredArc) {
        hoveredArc = null;
        tooltip.style.display = 'none';
        render();
      }
      
      if (foundArc) {
        tooltip.style.left = e.clientX + 15 + 'px';
        tooltip.style.top = e.clientY + 15 + 'px';
      }
    });
    
    canvas.addEventListener('mouseleave', () => {
      if (hoveredArc) {
        hoveredArc = null;
        tooltip.style.display = 'none';
        render();
      }
    });
    
    // Initial render
    resize();
    window.addEventListener('resize', resize);
  </script>
</body>
</html>`;
}

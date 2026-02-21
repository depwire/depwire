// Arc Diagram Renderer using D3.js
let graphData = null;
let svg = null;
let g = null;
let filePositions = new Map();
let selectedFile = null;
let selectedArc = null;

async function init() {
  try {
    const response = await fetch('/api/graph');
    graphData = await response.json();
    
    // Update header
    document.getElementById('projectName').textContent = graphData.projectName;
    document.getElementById('stats').innerHTML = `
      <div class="stat-item"><span class="stat-label">Files:</span> <span class="stat-value">${graphData.stats.totalFiles}</span></div>
      <div class="stat-item"><span class="stat-label">Symbols:</span> <span class="stat-value">${graphData.stats.totalSymbols}</span></div>
      <div class="stat-item"><span class="stat-label">Edges:</span> <span class="stat-value">${graphData.stats.totalCrossFileEdges}</span></div>
    `;
    
    // Render diagram
    renderArcDiagram();
    
    // Setup interactions
    setupSearch();
    setupExport();
    
    // Handle window resize
    window.addEventListener('resize', () => {
      renderArcDiagram();
    });
    
  } catch (error) {
    console.error('Failed to load graph data:', error);
    document.getElementById('detailPanel').querySelector('.detail-content').innerHTML = 
      '<p style="color: #ff4a4a;">Failed to load graph data. Please check the console.</p>';
  }
}

function renderArcDiagram() {
  const container = document.querySelector('.diagram-container');
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  // Clear existing SVG
  d3.select('#diagram').selectAll('*').remove();
  
  svg = d3.select('#diagram')
    .attr('width', width)
    .attr('height', height);
  
  g = svg.append('g');
  
  // Add zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.5, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
  
  svg.call(zoom);
  
  // Layout calculations
  const margin = { top: 60, right: 40, bottom: 120, left: 40 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const baseline = margin.top + plotHeight;
  
  // Calculate file bar positions
  const totalSymbols = d3.sum(graphData.files, d => d.symbolCount);
  const minBarWidth = 4;
  const gap = 2;
  
  let x = margin.left;
  filePositions.clear();
  
  graphData.files.forEach(file => {
    const barWidth = Math.max(minBarWidth, (file.symbolCount / totalSymbols) * plotWidth * 0.8);
    filePositions.set(file.path, {
      x: x + barWidth / 2,
      width: barWidth,
      file: file
    });
    x += barWidth + gap;
  });
  
  // Get directory colors
  const directories = [...new Set(graphData.files.map(f => f.directory))];
  const colorScale = d3.scaleOrdinal()
    .domain(directories)
    .range(['#4a9eff', '#7c3aed', '#ec4899', '#f59e0b', '#10b981', '#06b6d4']);
  
  // Calculate max distance for color scaling
  const positions = Array.from(filePositions.values());
  const maxDistance = d3.max(graphData.arcs, arc => {
    const sourcePos = filePositions.get(arc.sourceFile);
    const targetPos = filePositions.get(arc.targetFile);
    if (!sourcePos || !targetPos) return 0;
    return Math.abs(targetPos.x - sourcePos.x);
  });
  
  // Draw arcs
  const arcs = g.selectAll('.arc')
    .data(graphData.arcs)
    .enter()
    .append('path')
    .attr('class', 'arc')
    .attr('d', d => {
      const sourcePos = filePositions.get(d.sourceFile);
      const targetPos = filePositions.get(d.targetFile);
      if (!sourcePos || !targetPos) return null;
      
      const x1 = sourcePos.x;
      const x2 = targetPos.x;
      const distance = Math.abs(x2 - x1);
      const height = distance * 0.4;
      const midX = (x1 + x2) / 2;
      
      return `M ${x1} ${baseline} Q ${midX} ${baseline - height} ${x2} ${baseline}`;
    })
    .attr('stroke', d => {
      const sourcePos = filePositions.get(d.sourceFile);
      const targetPos = filePositions.get(d.targetFile);
      if (!sourcePos || !targetPos) return '#4a9eff';
      
      const distance = Math.abs(targetPos.x - sourcePos.x);
      const t = distance / maxDistance;
      return d3.interpolateRainbow(t);
    })
    .attr('stroke-width', d => Math.min(4, 1 + Math.log(d.edgeCount)))
    .on('mouseover', handleArcHover)
    .on('mouseout', handleArcOut)
    .on('click', handleArcClick);
  
  // Draw file bars
  const bars = g.selectAll('.file-bar')
    .data(graphData.files)
    .enter()
    .append('rect')
    .attr('class', 'file-bar')
    .attr('x', d => {
      const pos = filePositions.get(d.path);
      return pos.x - pos.width / 2;
    })
    .attr('y', baseline)
    .attr('width', d => filePositions.get(d.path).width)
    .attr('height', 8)
    .attr('fill', d => colorScale(d.directory))
    .on('mouseover', handleBarHover)
    .on('mouseout', handleBarOut)
    .on('click', handleBarClick);
  
  // Draw file labels
  const labels = g.selectAll('.file-label')
    .data(graphData.files)
    .enter()
    .append('text')
    .attr('class', 'file-label')
    .attr('x', d => filePositions.get(d.path).x)
    .attr('y', baseline + 20)
    .attr('transform', d => `rotate(-45, ${filePositions.get(d.path).x}, ${baseline + 20})`)
    .attr('text-anchor', 'end')
    .text(d => d.path.split('/').pop());
  
  // Reset view button
  svg.append('text')
    .attr('x', 10)
    .attr('y', 20)
    .attr('fill', '#4a9eff')
    .attr('font-size', '12px')
    .attr('cursor', 'pointer')
    .text('↺ Reset View')
    .on('click', () => {
      svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity);
      clearSelection();
    });
}

function handleArcHover(event, d) {
  if (selectedArc) return;
  
  // Highlight arc
  d3.select(event.currentTarget).classed('highlighted', true);
  
  // Dim other arcs
  d3.selectAll('.arc').filter(arc => arc !== d).classed('dimmed', true);
  
  // Highlight connected file bars
  d3.selectAll('.file-bar')
    .filter(f => f.path === d.sourceFile || f.path === d.targetFile)
    .classed('highlighted', true);
  
  d3.selectAll('.file-bar')
    .filter(f => f.path !== d.sourceFile && f.path !== d.targetFile)
    .classed('dimmed', true);
  
  // Show tooltip
  showTooltip(event, `
    <div class="tooltip-line"><strong>${d.sourceFile}</strong> → <strong>${d.targetFile}</strong></div>
    <div class="tooltip-line"><span class="tooltip-label">Edges:</span> ${d.edgeCount}</div>
    <div class="tooltip-line"><span class="tooltip-label">Types:</span> ${d.edgeKinds.join(', ')}</div>
  `);
  
  // Update detail panel
  updateDetailPanel(`
    <p class="detail-title">Arc: ${d.sourceFile} → ${d.targetFile}</p>
    <p class="detail-info"><span class="detail-label">Edge count:</span> ${d.edgeCount}</p>
    <p class="detail-info"><span class="detail-label">Edge types:</span> ${d.edgeKinds.join(', ')}</p>
  `);
}

function handleArcOut(event, d) {
  if (selectedArc) return;
  
  d3.select(event.currentTarget).classed('highlighted', false);
  d3.selectAll('.arc').classed('dimmed', false);
  d3.selectAll('.file-bar').classed('highlighted', false).classed('dimmed', false);
  
  hideTooltip();
  resetDetailPanel();
}

function handleArcClick(event, d) {
  event.stopPropagation();
  
  if (selectedArc === d) {
    // Deselect
    selectedArc = null;
    handleArcOut(event, d);
  } else {
    // Select
    selectedArc = d;
    selectedFile = null;
    
    d3.selectAll('.arc').classed('highlighted', false).classed('dimmed', false);
    d3.select(event.currentTarget).classed('highlighted', true);
    d3.selectAll('.arc').filter(arc => arc !== d).classed('dimmed', true);
    
    d3.selectAll('.file-bar')
      .classed('highlighted', false)
      .classed('dimmed', false)
      .filter(f => f.path === d.sourceFile || f.path === d.targetFile)
      .classed('highlighted', true);
    
    d3.selectAll('.file-bar')
      .filter(f => f.path !== d.sourceFile && f.path !== d.targetFile)
      .classed('dimmed', true);
  }
}

function handleBarHover(event, d) {
  if (selectedFile) return;
  
  // Highlight bar
  d3.select(event.currentTarget).classed('highlighted', true);
  
  // Highlight connected arcs
  const connectedArcs = graphData.arcs.filter(arc => 
    arc.sourceFile === d.path || arc.targetFile === d.path
  );
  
  d3.selectAll('.arc')
    .classed('highlighted', arc => connectedArcs.includes(arc))
    .classed('dimmed', arc => !connectedArcs.includes(arc));
  
  // Dim other bars
  d3.selectAll('.file-bar').filter(f => f !== d).classed('dimmed', true);
  
  // Show tooltip
  showTooltip(event, `
    <div class="tooltip-line"><strong>${d.path}</strong></div>
    <div class="tooltip-line"><span class="tooltip-label">Symbols:</span> ${d.symbolCount}</div>
    <div class="tooltip-line"><span class="tooltip-label">Incoming:</span> ${d.incomingCount} connections</div>
    <div class="tooltip-line"><span class="tooltip-label">Outgoing:</span> ${d.outgoingCount} connections</div>
  `);
  
  // Update detail panel
  updateDetailPanel(`
    <p class="detail-title">File: ${d.path}</p>
    <p class="detail-info"><span class="detail-label">Directory:</span> ${d.directory}</p>
    <p class="detail-info"><span class="detail-label">Symbols:</span> ${d.symbolCount}</p>
    <p class="detail-info"><span class="detail-label">Incoming connections:</span> ${d.incomingCount}</p>
    <p class="detail-info"><span class="detail-label">Outgoing connections:</span> ${d.outgoingCount}</p>
  `);
}

function handleBarOut(event, d) {
  if (selectedFile) return;
  
  d3.select(event.currentTarget).classed('highlighted', false);
  d3.selectAll('.arc').classed('highlighted', false).classed('dimmed', false);
  d3.selectAll('.file-bar').classed('dimmed', false);
  
  hideTooltip();
  resetDetailPanel();
}

function handleBarClick(event, d) {
  event.stopPropagation();
  
  if (selectedFile === d) {
    // Deselect
    selectedFile = null;
    handleBarOut(event, d);
  } else {
    // Select
    selectedFile = d;
    selectedArc = null;
    
    const connectedArcs = graphData.arcs.filter(arc => 
      arc.sourceFile === d.path || arc.targetFile === d.path
    );
    
    d3.selectAll('.arc')
      .classed('highlighted', arc => connectedArcs.includes(arc))
      .classed('dimmed', arc => !connectedArcs.includes(arc));
    
    d3.selectAll('.file-bar')
      .classed('highlighted', f => f === d)
      .classed('dimmed', f => f !== d);
  }
}

function showTooltip(event, content) {
  const tooltip = document.getElementById('tooltip');
  tooltip.innerHTML = content;
  tooltip.style.left = (event.pageX + 10) + 'px';
  tooltip.style.top = (event.pageY + 10) + 'px';
  tooltip.classList.add('show');
  
  // Update position on mouse move
  d3.select('body').on('mousemove.tooltip', (e) => {
    tooltip.style.left = (e.pageX + 10) + 'px';
    tooltip.style.top = (e.pageY + 10) + 'px';
  });
}

function hideTooltip() {
  document.getElementById('tooltip').classList.remove('show');
  d3.select('body').on('mousemove.tooltip', null);
}

function updateDetailPanel(content) {
  document.getElementById('detailPanel').querySelector('.detail-content').innerHTML = content;
}

function resetDetailPanel() {
  updateDetailPanel('<p class="detail-hint">Hover over arcs or files to see connection details</p>');
}

function clearSelection() {
  selectedFile = null;
  selectedArc = null;
  d3.selectAll('.arc').classed('highlighted', false).classed('dimmed', false);
  d3.selectAll('.file-bar').classed('highlighted', false).classed('dimmed', false);
  resetDetailPanel();
}

function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      clearSelection();
      return;
    }
    
    // Find matching files
    const matchingFiles = graphData.files.filter(f => 
      f.path.toLowerCase().includes(query)
    );
    
    if (matchingFiles.length === 0) {
      clearSelection();
      return;
    }
    
    // Highlight matching files and their arcs
    const matchingPaths = new Set(matchingFiles.map(f => f.path));
    
    d3.selectAll('.file-bar')
      .classed('highlighted', f => matchingPaths.has(f.path))
      .classed('dimmed', f => !matchingPaths.has(f.path));
    
    const connectedArcs = graphData.arcs.filter(arc =>
      matchingPaths.has(arc.sourceFile) || matchingPaths.has(arc.targetFile)
    );
    
    d3.selectAll('.arc')
      .classed('highlighted', arc => connectedArcs.includes(arc))
      .classed('dimmed', arc => !connectedArcs.includes(arc));
    
    // Update detail panel
    updateDetailPanel(`
      <p class="detail-title">Search Results: ${matchingFiles.length} file(s)</p>
      ${matchingFiles.slice(0, 10).map(f => `<p class="detail-info">${f.path}</p>`).join('')}
      ${matchingFiles.length > 10 ? '<p class="detail-info">...</p>' : ''}
    `);
  });
  
  // Clear on Escape
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      clearSelection();
    }
  });
}

function setupExport() {
  const exportButton = document.getElementById('exportButton');
  const exportMenu = document.getElementById('exportMenu');
  const exportSvg = document.getElementById('exportSvg');
  const exportPng = document.getElementById('exportPng');
  
  exportButton.addEventListener('click', () => {
    exportMenu.classList.toggle('show');
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.export-dropdown')) {
      exportMenu.classList.remove('show');
    }
  });
  
  exportSvg.addEventListener('click', () => {
    exportToSVG();
    exportMenu.classList.remove('show');
  });
  
  exportPng.addEventListener('click', () => {
    exportToPNG();
    exportMenu.classList.remove('show');
  });
}

function exportToSVG() {
  const svgElement = document.getElementById('diagram');
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `codegraph-${graphData.projectName}.svg`;
  link.click();
  
  URL.revokeObjectURL(url);
}

function exportToPNG() {
  const svgElement = document.getElementById('diagram');
  const svgString = new XMLSerializer().serializeToString(svgElement);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const img = new Image();
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  img.onload = () => {
    canvas.width = svgElement.clientWidth;
    canvas.height = svgElement.clientHeight;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    
    canvas.toBlob((blob) => {
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `codegraph-${graphData.projectName}.png`;
      link.click();
      
      URL.revokeObjectURL(pngUrl);
      URL.revokeObjectURL(url);
    });
  };
  
  img.src = url;
}

// Clear selection on clicking background
d3.select('body').on('click', () => {
  if (!event.target.closest('.arc') && !event.target.closest('.file-bar')) {
    clearSelection();
  }
});

// Initialize on page load
init();

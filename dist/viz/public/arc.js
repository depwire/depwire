// Arc Diagram Renderer using D3.js

// ── Factory function for creating isolated arc diagram instances ──
window.createArcDiagram = function(containerId, svgId, tooltipId, data) {
  let _data = data;
  let _svg = null;
  let _g = null;
  let _filePositions = new Map();
  let _selectedFile = null;
  let _selectedArc = null;

  function _showTooltip(event, content) {
    const el = document.getElementById(tooltipId);
    if (!el) return;
    el.innerHTML = content;
    el.style.left = (event.pageX + 10) + 'px';
    el.style.top = (event.pageY + 10) + 'px';
    el.classList.add('show');
  }

  function _hideTooltip() {
    const el = document.getElementById(tooltipId);
    if (!el) return;
    el.classList.remove('show');
  }

  function _clearSelection() {
    _selectedFile = null;
    _selectedArc = null;
    const ctr = d3.select('#' + containerId);
    ctr.selectAll('.arc').classed('highlighted', false).classed('dimmed', false);
    ctr.selectAll('.file-bar').classed('highlighted', false).classed('dimmed', false);
  }

  function render() {
    const container = document.getElementById(containerId);
    if (!container || !_data) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    _filePositions.clear();
    _selectedFile = null;
    _selectedArc = null;

    const svgEl = d3.select('#' + svgId);
    svgEl.selectAll('*').remove();
    _svg = svgEl.attr('width', width).attr('height', height);
    _g = _svg.append('g');

    const zoom = d3.zoom().scaleExtent([0.5, 4]).on('zoom', (event) => {
      _g.attr('transform', event.transform);
    });
    _svg.call(zoom);

    const margin = { top: 60, right: 40, bottom: 120, left: 40 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const baseline = margin.top + plotHeight;

    const totalSymbols = d3.sum(_data.files, d => d.symbolCount);
    const minBarWidth = 4;
    const gap = 2;
    let x = margin.left;

    _data.files.forEach(file => {
      const barWidth = Math.max(minBarWidth, (file.symbolCount / totalSymbols) * plotWidth * 0.8);
      _filePositions.set(file.path, { x: x + barWidth / 2, width: barWidth, file: file });
      x += barWidth + gap;
    });

    const directories = [...new Set(_data.files.map(f => f.directory))];
    const colorScale = d3.scaleOrdinal().domain(directories)
      .range(['#4a9eff', '#7c3aed', '#ec4899', '#f59e0b', '#10b981', '#06b6d4']);

    const maxDistance = d3.max(_data.arcs, arc => {
      const s = _filePositions.get(arc.sourceFile);
      const t = _filePositions.get(arc.targetFile);
      return (s && t) ? Math.abs(t.x - s.x) : 0;
    }) || 1;

    const ctr = d3.select('#' + containerId);

    _g.selectAll('.arc').data(_data.arcs).enter().append('path')
      .attr('class', 'arc')
      .attr('d', d => {
        const s = _filePositions.get(d.sourceFile);
        const t = _filePositions.get(d.targetFile);
        if (!s || !t) return null;
        const x1 = s.x, x2 = t.x, dist = Math.abs(x2 - x1), midX = (x1 + x2) / 2;
        return `M ${x1} ${baseline} Q ${midX} ${baseline - dist * 0.4} ${x2} ${baseline}`;
      })
      .attr('stroke', d => {
        const s = _filePositions.get(d.sourceFile);
        const t = _filePositions.get(d.targetFile);
        if (!s || !t) return '#4a9eff';
        return d3.interpolateRainbow(Math.abs(t.x - s.x) / maxDistance);
      })
      .attr('stroke-width', d => Math.min(4, 1 + Math.log(d.edgeCount)))
      .on('mouseover', function(event, d) {
        if (_selectedArc) return;
        d3.select(this).classed('highlighted', true);
        ctr.selectAll('.arc').filter(a => a !== d).classed('dimmed', true);
        ctr.selectAll('.file-bar').each(function(f) {
          const match = f.path === d.sourceFile || f.path === d.targetFile;
          d3.select(this).classed('highlighted', match).classed('dimmed', !match);
        });
        _showTooltip(event, `<div class="tooltip-line"><strong>${d.sourceFile}</strong> → <strong>${d.targetFile}</strong></div><div class="tooltip-line"><span class="tooltip-label">Edges:</span> ${d.edgeCount}</div>`);
      })
      .on('mouseout', function() {
        if (_selectedArc) return;
        d3.select(this).classed('highlighted', false);
        ctr.selectAll('.arc').classed('dimmed', false);
        ctr.selectAll('.file-bar').classed('highlighted', false).classed('dimmed', false);
        _hideTooltip();
      })
      .on('click', function(event, d) {
        event.stopPropagation();
        if (_selectedArc === d) { _selectedArc = null; ctr.selectAll('.arc,.file-bar').classed('highlighted', false).classed('dimmed', false); _hideTooltip(); return; }
        _selectedArc = d; _selectedFile = null;
        ctr.selectAll('.arc').classed('highlighted', false).classed('dimmed', true);
        d3.select(this).classed('highlighted', true).classed('dimmed', false);
        ctr.selectAll('.file-bar').each(function(f) {
          const match = f.path === d.sourceFile || f.path === d.targetFile;
          d3.select(this).classed('highlighted', match).classed('dimmed', !match);
        });
      });

    _g.selectAll('.file-bar').data(_data.files).enter().append('rect')
      .attr('class', 'file-bar')
      .attr('x', d => { const p = _filePositions.get(d.path); return p.x - p.width / 2; })
      .attr('y', baseline).attr('width', d => _filePositions.get(d.path).width).attr('height', 8)
      .attr('fill', d => colorScale(d.directory))
      .on('mouseover', function(event, d) {
        if (_selectedFile) return;
        d3.select(this).classed('highlighted', true);
        const connected = _data.arcs.filter(a => a.sourceFile === d.path || a.targetFile === d.path);
        ctr.selectAll('.arc').classed('highlighted', a => connected.includes(a)).classed('dimmed', a => !connected.includes(a));
        ctr.selectAll('.file-bar').filter(f => f !== d).classed('dimmed', true);
        _showTooltip(event, `<div class="tooltip-line"><strong>${d.path}</strong></div><div class="tooltip-line"><span class="tooltip-label">Symbols:</span> ${d.symbolCount} | In: ${d.incomingCount} | Out: ${d.outgoingCount}</div>`);
      })
      .on('mouseout', function() {
        if (_selectedFile) return;
        d3.select(this).classed('highlighted', false);
        ctr.selectAll('.arc').classed('highlighted', false).classed('dimmed', false);
        ctr.selectAll('.file-bar').classed('dimmed', false);
        _hideTooltip();
      })
      .on('click', function(event, d) {
        event.stopPropagation();
        if (_selectedFile === d) { _selectedFile = null; ctr.selectAll('.arc,.file-bar').classed('highlighted', false).classed('dimmed', false); return; }
        _selectedFile = d; _selectedArc = null;
        const connected = _data.arcs.filter(a => a.sourceFile === d.path || a.targetFile === d.path);
        ctr.selectAll('.arc').classed('highlighted', a => connected.includes(a)).classed('dimmed', a => !connected.includes(a));
        ctr.selectAll('.file-bar').classed('highlighted', f => f === d).classed('dimmed', f => f !== d);
      });

    _g.selectAll('.file-label').data(_data.files).enter().append('text')
      .attr('class', 'file-label')
      .attr('x', d => _filePositions.get(d.path).x)
      .attr('y', baseline + 20)
      .attr('transform', d => `rotate(-45, ${_filePositions.get(d.path).x}, ${baseline + 20})`)
      .attr('text-anchor', 'end')
      .text(d => d.path.split('/').pop());

    _svg.append('text').attr('x', 10).attr('y', 20).attr('fill', '#4a9eff')
      .attr('font-size', '12px').attr('cursor', 'pointer').text('↺ Reset View')
      .on('click', () => { _svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity); _clearSelection(); });
  }

  return { render };
};

// ── Legacy global state and functions (used by depwire viz) ──
let graphData = null;
let svg = null;
let g = null;
let filePositions = new Map();
let selectedFile = null;
let selectedArc = null;
let ws = null;

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
    
    // Setup interactions (not in whatif mode)
    if (!window.__depwireWhatIf) {
      setupSearch();
      setupExport();
    }
    
    // Setup WebSocket for live updates (not in whatif mode)
    if (!window.__depwireWhatIf) {
      setupWebSocket();
    }
    
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

function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected — live updates enabled');
    showNotification('Live updates enabled', 'success');
  };
  
  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'refresh') {
      console.log('Graph updated — refreshing visualization...');
      showNotification('Graph updated', 'info');
      
      // Re-fetch graph data
      try {
        const response = await fetch('/api/graph');
        graphData = await response.json();
        
        // Update header stats
        document.getElementById('stats').innerHTML = `
          <div class="stat-item"><span class="stat-label">Files:</span> <span class="stat-value">${graphData.stats.totalFiles}</span></div>
          <div class="stat-item"><span class="stat-label">Symbols:</span> <span class="stat-value">${graphData.stats.totalSymbols}</span></div>
          <div class="stat-item"><span class="stat-label">Edges:</span> <span class="stat-value">${graphData.stats.totalCrossFileEdges}</span></div>
        `;
        
        // Re-render diagram
        renderArcDiagram();
      } catch (error) {
        console.error('Failed to refresh graph data:', error);
        showNotification('Failed to refresh', 'error');
      }
    }
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected — attempting reconnect in 3s...');
    showNotification('Connection lost — reconnecting...', 'warning');
    setTimeout(() => {
      setupWebSocket();
    }, 3000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Fade in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Fade out and remove
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

function renderArcDiagram() {
  const container = document.querySelector('.diagram-container');
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  // Reset state
  filePositions.clear();
  selectedFile = null;
  selectedArc = null;
  
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
  link.download = `depwire-${graphData.projectName}.svg`;
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
      link.download = `depwire-${graphData.projectName}.png`;
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

// Initialize on page load — only if NOT in What If context
if (!window.__depwireWhatIf) {
  init();
}

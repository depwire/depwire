let temporalData = null;
let currentIndex = 0;
let isPlaying = false;
let playSpeed = 1;
let playInterval = null;
let svg = null;
let g = null;
let filePositions = new Map();

async function init() {
  try {
    const response = await fetch('/api/data');
    temporalData = await response.json();

    document.getElementById('projectName').textContent = temporalData.projectName;
    document.getElementById('snapshotCount').textContent = temporalData.snapshots.length;

    setupTimeline();
    renderSnapshot(0);
    setupControls();
    setupSearch();

    window.addEventListener('resize', () => {
      renderSnapshot(currentIndex);
    });
  } catch (error) {
    console.error('Failed to load temporal data:', error);
  }
}

function setupTimeline() {
  const rail = document.getElementById('timelineRail');
  const scrubber = document.getElementById('timelineScrubber');
  const dots = document.getElementById('timelineDots');

  temporalData.timeline.forEach((item, index) => {
    const dot = document.createElement('div');
    dot.className = 'timeline-dot';
    dot.style.left = `${(index / (temporalData.timeline.length - 1)) * 100}%`;
    dot.title = `${item.shortHash}: ${item.message}`;
    dot.addEventListener('click', () => {
      goToSnapshot(index);
    });
    dots.appendChild(dot);
  });

  let isDragging = false;

  scrubber.addEventListener('mousedown', () => {
    isDragging = true;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const rect = rail.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const progress = x / rect.width;
    const index = Math.round(progress * (temporalData.snapshots.length - 1));

    goToSnapshot(index);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  rail.addEventListener('click', (e) => {
    if (e.target === scrubber) return;

    const rect = rail.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = x / rect.width;
    const index = Math.round(progress * (temporalData.snapshots.length - 1));

    goToSnapshot(index);
  });
}

function setupControls() {
  const playBtn = document.getElementById('playBtn');

  playBtn.addEventListener('click', () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  });

  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      playSpeed = parseFloat(btn.dataset.speed);

      if (isPlaying) {
        pausePlayback();
        startPlayback();
      }
    });
  });
}

function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  let searchTimeout = null;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = e.target.value.trim().toLowerCase();
      highlightSearchResults(query);
    }, 300);
  });
}

function highlightSearchResults(query) {
  if (!query) {
    d3.selectAll('.file-bar').classed('search-match', false).classed('search-dim', false);
    return;
  }

  d3.selectAll('.file-bar').each(function (d) {
    const matches = d.path.toLowerCase().includes(query);
    d3.select(this).classed('search-match', matches).classed('search-dim', !matches);
  });
}

function startPlayback() {
  isPlaying = true;
  document.getElementById('playBtn').innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="4" height="12"/>
      <rect x="9" y="2" width="4" height="12"/>
    </svg>
  `;

  const interval = 2000 / playSpeed;

  playInterval = setInterval(() => {
    if (currentIndex < temporalData.snapshots.length - 1) {
      goToSnapshot(currentIndex + 1);
    } else {
      pausePlayback();
    }
  }, interval);
}

function pausePlayback() {
  isPlaying = false;
  clearInterval(playInterval);
  document.getElementById('playBtn').innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 2v12l10-6L3 2z"/>
    </svg>
  `;
}

function goToSnapshot(index) {
  currentIndex = Math.max(0, Math.min(index, temporalData.snapshots.length - 1));
  renderSnapshot(currentIndex);
  updateTimeline();
}

function updateTimeline() {
  const progress = currentIndex / (temporalData.snapshots.length - 1);
  document.getElementById('timelineProgress').style.width = `${progress * 100}%`;
  document.getElementById('timelineScrubber').style.left = `${progress * 100}%`;

  const snapshot = temporalData.snapshots[currentIndex];
  const timeline = temporalData.timeline[currentIndex];

  document.getElementById('currentCommit').textContent = timeline.shortHash;
  document.getElementById('currentDate').textContent = new Date(timeline.date).toLocaleDateString();

  document.querySelectorAll('.timeline-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === currentIndex);
  });
}

function renderSnapshot(index) {
  const snapshot = temporalData.snapshots[index];

  updateDetails(snapshot);
  renderArcDiagram(snapshot);
  updateChart();
}

function updateDetails(snapshot) {
  document.getElementById('detailCommit').textContent = snapshot.commitHash.substring(0, 8);
  document.getElementById('detailDate').textContent = new Date(snapshot.commitDate).toLocaleDateString();
  document.getElementById('detailMessage').textContent = snapshot.commitMessage;
  document.getElementById('detailAuthor').textContent = snapshot.commitAuthor;

  document.getElementById('statFiles').textContent = snapshot.stats.totalFiles;
  document.getElementById('statSymbols').textContent = snapshot.stats.totalSymbols;
  document.getElementById('statEdges').textContent = snapshot.stats.totalEdges;

  if (snapshot.diff) {
    updateDelta('deltaFiles', snapshot.diff.statsChange.files);
    updateDelta('deltaSymbols', snapshot.diff.statsChange.symbols);
    updateDelta('deltaEdges', snapshot.diff.statsChange.edges);
  } else {
    document.getElementById('deltaFiles').textContent = '';
    document.getElementById('deltaSymbols').textContent = '';
    document.getElementById('deltaEdges').textContent = '';
  }
}

function updateDelta(elementId, value) {
  const elem = document.getElementById(elementId);
  if (value > 0) {
    elem.textContent = `+${value}`;
    elem.className = 'stat-delta positive';
  } else if (value < 0) {
    elem.textContent = value;
    elem.className = 'stat-delta negative';
  } else {
    elem.textContent = '';
    elem.className = 'stat-delta';
  }
}

function renderArcDiagram(snapshot) {
  const container = document.querySelector('.diagram-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  filePositions.clear();

  d3.select('#diagram').selectAll('*').remove();

  svg = d3.select('#diagram').attr('width', width).attr('height', height);

  g = svg.append('g');

  const zoom = d3.zoom().scaleExtent([0.5, 4]).on('zoom', (event) => {
    g.attr('transform', event.transform);
  });

  svg.call(zoom);

  const margin = { top: 40, right: 40, bottom: 60, left: 40 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const baseline = height - margin.bottom;

  const totalSymbols = d3.sum(snapshot.files, (d) => d.symbols);
  const minBarWidth = 4;
  const gap = 2;

  let x = margin.left;
  filePositions.clear();

  snapshot.files.forEach((file) => {
    const barWidth = Math.max(minBarWidth, (file.symbols / totalSymbols) * plotWidth * 0.8);
    filePositions.set(file.path, {
      x: x + barWidth / 2,
      width: barWidth,
      file: file,
    });
    x += barWidth + gap;
  });

  const positions = Array.from(filePositions.values());
  const maxDistance = d3.max(snapshot.arcs, (arc) => {
    const sourcePos = filePositions.get(arc.source);
    const targetPos = filePositions.get(arc.target);
    if (!sourcePos || !targetPos) return 0;
    return Math.abs(targetPos.x - sourcePos.x);
  });

  const addedFiles = new Set(snapshot.diff?.addedFiles || []);
  const removedFiles = new Set(snapshot.diff?.removedFiles || []);

  const arcs = g
    .selectAll('.arc')
    .data(snapshot.arcs)
    .enter()
    .append('path')
    .attr('class', 'arc')
    .attr('d', (d) => {
      const sourcePos = filePositions.get(d.source);
      const targetPos = filePositions.get(d.target);
      if (!sourcePos || !targetPos) return null;

      const x1 = sourcePos.x;
      const x2 = targetPos.x;
      const distance = Math.abs(x2 - x1);
      const arcHeight = Math.min(plotHeight * 0.8, distance * 0.6);
      const midX = (x1 + x2) / 2;

      return `M ${x1},${baseline} Q ${midX},${baseline - arcHeight} ${x2},${baseline}`;
    })
    .attr('stroke', (d) => {
      const sourcePos = filePositions.get(d.source);
      const targetPos = filePositions.get(d.target);
      if (!sourcePos || !targetPos) return '#00E5FF';

      const distance = Math.abs(targetPos.x - sourcePos.x);
      const ratio = distance / maxDistance;

      if (ratio < 0.2) return '#10b981';
      if (ratio < 0.5) return '#00E5FF';
      return '#7c3aed';
    })
    .attr('stroke-width', (d) => Math.min(3, 0.5 + Math.log(d.weight + 1)))
    .attr('fill', 'none')
    .attr('opacity', 0.6);

  const bars = g
    .selectAll('.file-bar')
    .data(snapshot.files)
    .enter()
    .append('rect')
    .attr('class', 'file-bar')
    .attr('x', (d) => filePositions.get(d.path).x - filePositions.get(d.path).width / 2)
    .attr('y', baseline - 10)
    .attr('width', (d) => filePositions.get(d.path).width)
    .attr('height', 20)
    .attr('fill', (d) => {
      if (addedFiles.has(d.path)) return '#22C55E';
      if (removedFiles.has(d.path)) return '#EF4444';
      return '#00E5FF';
    })
    .attr('rx', 2)
    .style('cursor', 'pointer')
    .on('mouseenter', function (event, d) {
      d3.select(this).attr('fill', '#ffffff');

      highlightConnections(d.path);

      showTooltip(event, d);
    })
    .on('mouseleave', function (event, d) {
      d3.select(this).attr('fill', (d) => {
        if (addedFiles.has(d.path)) return '#22C55E';
        if (removedFiles.has(d.path)) return '#EF4444';
        return '#00E5FF';
      });

      clearHighlight();
      hideTooltip();
    });

  if (addedFiles.size > 0 || removedFiles.size > 0) {
    setTimeout(() => {
      bars.attr('fill', (d) => {
        if (addedFiles.has(d.path) || removedFiles.has(d.path)) return '#00E5FF';
        return '#00E5FF';
      });
    }, 1000);
  }
}

function highlightConnections(filePath) {
  d3.selectAll('.arc').attr('opacity', (d) => {
    if (d.source === filePath || d.target === filePath) {
      return 1;
    }
    return 0.1;
  });

  d3.selectAll('.file-bar').attr('opacity', (d) => {
    if (d.path === filePath) return 1;

    const snapshot = temporalData.snapshots[currentIndex];
    const connected = snapshot.arcs.some(
      (arc) =>
        (arc.source === filePath && arc.target === d.path) ||
        (arc.target === filePath && arc.source === d.path)
    );

    return connected ? 1 : 0.2;
  });
}

function clearHighlight() {
  d3.selectAll('.arc').attr('opacity', 0.6);
  d3.selectAll('.file-bar').attr('opacity', 1);
}

function showTooltip(event, file) {
  const tooltip = d3.select('body').append('div').attr('class', 'tooltip').style('opacity', 0);

  const snapshot = temporalData.snapshots[currentIndex];
  const connections = snapshot.arcs.filter((arc) => arc.source === file.path || arc.target === file.path).length;

  tooltip
    .html(
      `
      <strong>${file.path}</strong><br/>
      Symbols: ${file.symbols}<br/>
      Connections: ${connections}
    `
    )
    .style('left', event.pageX + 10 + 'px')
    .style('top', event.pageY - 28 + 'px')
    .transition()
    .duration(200)
    .style('opacity', 0.95);
}

function hideTooltip() {
  d3.selectAll('.tooltip').remove();
}

function updateChart() {
  const canvas = document.getElementById('evolutionChart');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const snapshots = temporalData.snapshots.slice(0, currentIndex + 1);
  if (snapshots.length === 0) return;

  const maxFiles = d3.max(snapshots, (d) => d.stats.totalFiles);
  const maxSymbols = d3.max(snapshots, (d) => d.stats.totalSymbols);
  const maxEdges = d3.max(snapshots, (d) => d.stats.totalEdges);

  const padding = 30;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const xScale = (i) => padding + (i / (snapshots.length - 1)) * chartWidth;
  const yScaleFiles = (v) => height - padding - (v / maxFiles) * chartHeight;
  const yScaleSymbols = (v) => height - padding - (v / maxSymbols) * chartHeight;
  const yScaleEdges = (v) => height - padding - (v / maxEdges) * chartHeight;

  ctx.strokeStyle = '#4a9eff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  snapshots.forEach((s, i) => {
    const x = xScale(i);
    const y = yScaleFiles(s.stats.totalFiles);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.beginPath();
  snapshots.forEach((s, i) => {
    const x = xScale(i);
    const y = yScaleSymbols(s.stats.totalSymbols);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = 2;
  ctx.beginPath();
  snapshots.forEach((s, i) => {
    const x = xScale(i);
    const y = yScaleEdges(s.stats.totalEdges);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = '#ff4a4a';
  ctx.lineWidth = 2;
  const markerX = xScale(currentIndex);
  ctx.beginPath();
  ctx.moveTo(markerX, padding);
  ctx.lineTo(markerX, height - padding);
  ctx.stroke();
}

init();

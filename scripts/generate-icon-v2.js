#!/usr/bin/env node

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const size = 512;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// Background
ctx.fillStyle = '#1a1a2e';
ctx.fillRect(0, 0, size, size);

// Define colors for nodes and arcs
const colors = {
  cyan: '#4a9eff',
  green: '#00d4aa',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

// Node positions (bottom of icon, evenly spaced)
const nodeY = 420;
const nodes = [
  { x: 100, y: nodeY, color: colors.cyan, size: 16 },
  { x: 200, y: nodeY, color: colors.green, size: 14 },
  { x: 312, y: nodeY, color: colors.purple, size: 16 },
  { x: 412, y: nodeY, color: colors.pink, size: 14 },
];

// Draw arcs connecting nodes
const arcs = [
  { from: 0, to: 2, color: colors.cyan, width: 3, height: 140 },
  { from: 1, to: 3, color: colors.green, width: 2.5, height: 100 },
  { from: 0, to: 3, color: colors.purple, width: 2, height: 180 },
];

// Draw arcs (bezier curves)
arcs.forEach(arc => {
  const start = nodes[arc.from];
  const end = nodes[arc.to];
  const midX = (start.x + end.x) / 2;
  const controlY = start.y - arc.height;
  
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.quadraticCurveTo(midX, controlY, end.x, end.y);
  ctx.strokeStyle = arc.color;
  ctx.lineWidth = arc.width;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1.0;
});

// Draw gradient glow effect on arcs
ctx.globalCompositeOperation = 'screen';
arcs.forEach(arc => {
  const start = nodes[arc.from];
  const end = nodes[arc.to];
  const midX = (start.x + end.x) / 2;
  const controlY = start.y - arc.height;
  
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.quadraticCurveTo(midX, controlY, end.x, end.y);
  ctx.strokeStyle = arc.color;
  ctx.lineWidth = arc.width + 4;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.2;
  ctx.stroke();
});
ctx.globalCompositeOperation = 'source-over';

// Draw nodes (circles)
nodes.forEach(node => {
  // Outer glow
  const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.size + 8);
  gradient.addColorStop(0, node.color);
  gradient.addColorStop(1, 'transparent');
  
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.size + 8, 0, Math.PI * 2);
  ctx.fill();
  
  // Solid circle
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = node.color;
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
  ctx.fill();
  
  // Inner highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(node.x - 4, node.y - 4, node.size / 3, 0, Math.PI * 2);
  ctx.fill();
});

// Add subtle text label at bottom
ctx.fillStyle = '#4a9eff';
ctx.font = 'bold 42px -apple-system, system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.globalAlpha = 0.9;
ctx.fillText('CodeGraph', size / 2, 470);

// Export as PNG
const buffer = canvas.toBuffer('image/png');
const outputPath = join(__dirname, '..', 'icon.png');
writeFileSync(outputPath, buffer);

console.log('✅ Generated icon.png (512x512)');
console.log(`   Path: ${outputPath}`);
console.log(`   Size: ${(buffer.length / 1024).toFixed(1)} KB`);

import { DirectedGraph } from 'graphology';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { header, timestamp, formatNumber, unorderedList, code, table } from './templates.js';

/**
 * Generate STATUS.md - TODO/FIXME inventory
 */
export function generateStatus(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('Project Status');
  output += 'TODO/FIXME/HACK inventory showing what\'s implemented vs pending.\n\n';
  
  // 1. Status Summary
  output += header('Status Summary', 2);
  output += generateStatusSummary(projectRoot, graph);
  
  // 2. TODOs by File
  output += header('TODOs by File', 2);
  output += generateTodosByFile(projectRoot, graph);
  
  // 3. FIXMEs (Urgent)
  output += header('FIXMEs (Urgent)', 2);
  output += generateFixmes(projectRoot, graph);
  
  // 4. HACKs (Technical Debt)
  output += header('HACKs (Technical Debt)', 2);
  output += generateHacks(projectRoot, graph);
  
  // 5. Priority Matrix
  output += header('Priority Matrix', 2);
  output += generatePriorityMatrix(projectRoot, graph);
  
  // 6. Deprecated Items
  output += header('Deprecated Items', 2);
  output += generateDeprecated(projectRoot, graph);
  
  // 7. Implementation Completeness
  output += header('Implementation Completeness', 2);
  output += generateCompleteness(projectRoot, graph);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

interface Comment {
  type: 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'NOTE' | 'OPTIMIZE' | 'DEPRECATED';
  file: string;
  line: number;
  text: string;
}

function extractComments(projectRoot: string, filePath: string): Comment[] {
  const comments: Comment[] = [];
  
  const resolvedRoot = resolve(projectRoot);
  const fullPath = resolve(resolvedRoot, filePath);
  
  if (!fullPath.startsWith(resolvedRoot)) {
    return comments;
  }
  // Check if file exists and is readable
  if (!existsSync(fullPath)) {
    return comments;
  }
  
  try {
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    
    const patterns = [
      { type: 'TODO' as const, regex: /(?:\/\/|#|\/\*)\s*TODO:?\s*(.+)/i },
      { type: 'FIXME' as const, regex: /(?:\/\/|#|\/\*)\s*FIXME:?\s*(.+)/i },
      { type: 'HACK' as const, regex: /(?:\/\/|#|\/\*)\s*HACK:?\s*(.+)/i },
      { type: 'XXX' as const, regex: /(?:\/\/|#|\/\*)\s*XXX:?\s*(.+)/i },
      { type: 'NOTE' as const, regex: /(?:\/\/|#|\/\*)\s*NOTE:?\s*(.+)/i },
      { type: 'OPTIMIZE' as const, regex: /(?:\/\/|#|\/\*)\s*OPTIMIZE:?\s*(.+)/i },
      { type: 'DEPRECATED' as const, regex: /(?:\/\/|#|\/\*)\s*DEPRECATED:?\s*(.+)/i },
    ];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of patterns) {
        const match = line.match(pattern.regex);
        if (match) {
          comments.push({
            type: pattern.type,
            file: filePath,
            line: i + 1,
            text: match[1].trim().replace(/\*\/.*$/, '').trim(),
          });
          break; // Only match one type per line
        }
      }
    }
  } catch (err) {
    // Skip files that can't be read
    return comments;
  }
  
  return comments;
}

function getAllComments(projectRoot: string, graph: DirectedGraph): Comment[] {
  const allComments: Comment[] = [];
  
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  
  for (const file of files) {
    const comments = extractComments(projectRoot, file);
    allComments.push(...comments);
  }
  
  return allComments;
}

function generateStatusSummary(projectRoot: string, graph: DirectedGraph): string {
  const comments = getAllComments(projectRoot, graph);
  
  const counts = {
    TODO: 0,
    FIXME: 0,
    HACK: 0,
    XXX: 0,
    NOTE: 0,
    OPTIMIZE: 0,
    DEPRECATED: 0,
  };
  
  for (const comment of comments) {
    counts[comment.type]++;
  }
  
  let output = '';
  
  output += `- **Total TODOs:** ${formatNumber(counts.TODO)}\n`;
  output += `- **Total FIXMEs:** ${formatNumber(counts.FIXME)}\n`;
  output += `- **Total HACKs:** ${formatNumber(counts.HACK)}\n`;
  
  if (counts.XXX > 0) {
    output += `- **Total XXXs:** ${formatNumber(counts.XXX)}\n`;
  }
  if (counts.NOTE > 0) {
    output += `- **Total NOTEs:** ${formatNumber(counts.NOTE)}\n`;
  }
  if (counts.OPTIMIZE > 0) {
    output += `- **Total OPTIMIZEs:** ${formatNumber(counts.OPTIMIZE)}\n`;
  }
  if (counts.DEPRECATED > 0) {
    output += `- **Total DEPRECATEDs:** ${formatNumber(counts.DEPRECATED)}\n`;
  }
  
  output += '\n';
  return output;
}

function generateTodosByFile(projectRoot: string, graph: DirectedGraph): string {
  const comments = getAllComments(projectRoot, graph);
  const todos = comments.filter(c => c.type === 'TODO');
  
  if (todos.length === 0) {
    return '✅ No TODOs found.\n\n';
  }
  
  // Group by file
  const fileGroups = new Map<string, Comment[]>();
  
  for (const todo of todos) {
    if (!fileGroups.has(todo.file)) {
      fileGroups.set(todo.file, []);
    }
    fileGroups.get(todo.file)!.push(todo);
  }
  
  let output = `Found ${todos.length} TODO${todos.length === 1 ? '' : 's'} across ${fileGroups.size} file${fileGroups.size === 1 ? '' : 's'}:\n\n`;
  
  // Sort by file path
  const sortedFiles = Array.from(fileGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  for (const [file, fileTodos] of sortedFiles) {
    output += header(file, 3);
    
    const items = fileTodos.map(t => `[ ] TODO: ${t.text} (line ${t.line})`);
    output += unorderedList(items);
  }
  
  return output;
}

function generateFixmes(projectRoot: string, graph: DirectedGraph): string {
  const comments = getAllComments(projectRoot, graph);
  const fixmes = comments.filter(c => c.type === 'FIXME');
  
  if (fixmes.length === 0) {
    return '✅ No FIXMEs found.\n\n';
  }
  
  let output = `⚠️ Found ${fixmes.length} FIXME${fixmes.length === 1 ? '' : 's'} (known broken or urgent issues):\n\n`;
  
  // Sort by file path
  fixmes.sort((a, b) => a.file.localeCompare(b.file));
  
  const items = fixmes.map(f => {
    return `[ ] FIXME: ${f.text} (${code(f.file)}:${f.line})`;
  });
  
  output += unorderedList(items);
  
  return output;
}

function generateHacks(projectRoot: string, graph: DirectedGraph): string {
  const comments = getAllComments(projectRoot, graph);
  const hacks = comments.filter(c => c.type === 'HACK');
  
  if (hacks.length === 0) {
    return '✅ No HACKs found.\n\n';
  }
  
  let output = `Found ${hacks.length} HACK${hacks.length === 1 ? '' : 's'} (technical debt - works but needs proper implementation):\n\n`;
  
  // Sort by file path
  hacks.sort((a, b) => a.file.localeCompare(b.file));
  
  const items = hacks.map(h => {
    return `[ ] HACK: ${h.text} (${code(h.file)}:${h.line})`;
  });
  
  output += unorderedList(items);
  
  return output;
}

function generatePriorityMatrix(projectRoot: string, graph: DirectedGraph): string {
  const comments = getAllComments(projectRoot, graph);
  
  // Get file connection counts
  const fileConnections = new Map<string, number>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      fileConnections.set(sourceAttrs.filePath, (fileConnections.get(sourceAttrs.filePath) || 0) + 1);
      fileConnections.set(targetAttrs.filePath, (fileConnections.get(targetAttrs.filePath) || 0) + 1);
    }
  });
  
  interface PriorityItem {
    comment: Comment;
    connections: number;
    priority: string;
  }
  
  const items: PriorityItem[] = [];
  
  for (const comment of comments) {
    if (comment.type === 'TODO' || comment.type === 'FIXME' || comment.type === 'HACK') {
      const connections = fileConnections.get(comment.file) || 0;
      
      let priority = 'Low';
      let priorityScore = 1;
      
      if (comment.type === 'FIXME') {
        if (connections > 10) {
          priority = '🔴 Critical';
          priorityScore = 4;
        } else if (connections > 5) {
          priority = '🟡 High';
          priorityScore = 3;
        } else {
          priority = '🟢 Medium';
          priorityScore = 2;
        }
      } else if (comment.type === 'TODO') {
        if (connections > 10) {
          priority = '🟡 High';
          priorityScore = 3;
        } else if (connections > 5) {
          priority = '🟢 Medium';
          priorityScore = 2;
        } else {
          priority = '⚪ Low';
          priorityScore = 1;
        }
      } else if (comment.type === 'HACK') {
        if (connections > 10) {
          priority = '🟡 High';
          priorityScore = 3;
        } else {
          priority = '🟢 Medium';
          priorityScore = 2;
        }
      }
      
      items.push({
        comment,
        connections,
        priority,
      });
    }
  }
  
  if (items.length === 0) {
    return 'No items to prioritize.\n\n';
  }
  
  // Sort by priority (critical -> high -> medium -> low)
  items.sort((a, b) => {
    const priorityOrder = { '🔴 Critical': 4, '🟡 High': 3, '🟢 Medium': 2, '⚪ Low': 1 };
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
    
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    
    return b.connections - a.connections;
  });
  
  let output = 'Items prioritized by type and file connections:\n\n';
  
  const headers = ['Type', 'File', 'Line', 'Connections', 'Priority'];
  const rows = items.slice(0, 20).map(item => [
    item.comment.type,
    `\`${item.comment.file}\``,
    item.comment.line.toString(),
    formatNumber(item.connections),
    item.priority,
  ]);
  
  output += table(headers, rows);
  
  if (items.length > 20) {
    output += `... and ${items.length - 20} more items.\n\n`;
  }
  
  return output;
}

function generateDeprecated(projectRoot: string, graph: DirectedGraph): string {
  const comments = getAllComments(projectRoot, graph);
  const deprecated = comments.filter(c => c.type === 'DEPRECATED');
  
  if (deprecated.length === 0) {
    return '✅ No deprecated items found.\n\n';
  }
  
  let output = `Found ${deprecated.length} deprecated item${deprecated.length === 1 ? '' : 's'}:\n\n`;
  
  // Sort by file path
  deprecated.sort((a, b) => a.file.localeCompare(b.file));
  
  const items = deprecated.map(d => {
    return `DEPRECATED: ${d.text} (${code(d.file)}:${d.line})`;
  });
  
  output += unorderedList(items);
  
  return output;
}

function generateCompleteness(projectRoot: string, graph: DirectedGraph): string {
  const comments = getAllComments(projectRoot, graph);
  
  // Count TODOs per file
  const fileTodos = new Map<string, number>();
  const fileSymbols = new Map<string, number>();
  
  for (const comment of comments) {
    if (comment.type === 'TODO') {
      fileTodos.set(comment.file, (fileTodos.get(comment.file) || 0) + 1);
    }
  }
  
  // Count symbols per file
  graph.forEachNode((node, attrs) => {
    fileSymbols.set(attrs.filePath, (fileSymbols.get(attrs.filePath) || 0) + 1);
  });
  
  // Get all files
  const allFiles = new Set<string>();
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  
  // Categorize files
  const inProgress: string[] = [];
  const complete: string[] = [];
  
  for (const file of allFiles) {
    const todoCount = fileTodos.get(file) || 0;
    const symbolCount = fileSymbols.get(file) || 0;
    
    if (symbolCount === 0) continue; // Skip empty files
    
    const todoRatio = todoCount / symbolCount;
    
    if (todoRatio > 0.1) {
      // More than 10% TODOs relative to symbols
      inProgress.push(file);
    } else if (todoCount === 0) {
      complete.push(file);
    }
  }
  
  let output = '';
  
  const totalFiles = allFiles.size;
  const completePercent = totalFiles > 0 ? ((complete.length / totalFiles) * 100).toFixed(1) : '0.0';
  
  output += `- **Complete files (no TODOs):** ${formatNumber(complete.length)} (${completePercent}%)\n`;
  output += `- **In-progress files (many TODOs):** ${formatNumber(inProgress.length)}\n\n`;
  
  if (inProgress.length > 0) {
    output += '**Files in progress (high TODO ratio):**\n\n';
    const items = inProgress.slice(0, 10).map(f => {
      const todoCount = fileTodos.get(f) || 0;
      return `${code(f)} (${todoCount} TODOs)`;
    });
    output += unorderedList(items);
    
    if (inProgress.length > 10) {
      output += `... and ${inProgress.length - 10} more.\n\n`;
    }
  }
  
  // Directory completeness
  const dirTodos = new Map<string, number>();
  const dirFiles = new Map<string, number>();
  
  for (const file of allFiles) {
    const dir = file.split('/')[0];
    dirFiles.set(dir, (dirFiles.get(dir) || 0) + 1);
    
    const todoCount = fileTodos.get(file) || 0;
    if (todoCount > 0) {
      dirTodos.set(dir, (dirTodos.get(dir) || 0) + 1);
    }
  }
  
  if (dirFiles.size > 1) {
    output += '**Completeness by directory:**\n\n';
    
    const sortedDirs = Array.from(dirFiles.entries()).sort((a, b) => b[1] - a[1]);
    
    for (const [dir, fileCount] of sortedDirs) {
      const todosInDir = dirTodos.get(dir) || 0;
      const completeInDir = fileCount - todosInDir;
      const percent = ((completeInDir / fileCount) * 100).toFixed(1);
      
      output += `- **${dir}/**: ${completeInDir}/${fileCount} files complete (${percent}%)\n`;
    }
    
    output += '\n';
  }
  
  return output;
}

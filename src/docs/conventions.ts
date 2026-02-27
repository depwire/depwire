import { DirectedGraph } from 'graphology';
import { basename, extname } from 'path';
import { SymbolKind } from '../parser/types.js';
import { header, timestamp, table, formatNumber, formatPercent, unorderedList } from './templates.js';

/**
 * Generate CONVENTIONS.md
 */
export function generateConventions(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('Code Conventions');
  output += 'Auto-detected coding patterns and conventions in this codebase.\n\n';
  
  // 1. File Organization
  output += header('File Organization', 2);
  output += generateFileOrganization(graph);
  
  // 2. Naming Patterns
  output += header('Naming Patterns', 2);
  output += generateNamingPatterns(graph);
  
  // 3. Import Style
  output += header('Import Style', 2);
  output += generateImportStyle(graph);
  
  // 4. Export Patterns
  output += header('Export Patterns', 2);
  output += generateExportPatterns(graph);
  
  // 5. Symbol Distribution
  output += header('Symbol Distribution', 2);
  output += generateSymbolDistribution(graph);
  
  // 6. Detected Design Patterns
  output += header('Detected Design Patterns', 2);
  output += generateDesignPatterns(graph);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

function generateFileOrganization(graph: DirectedGraph): string {
  const files = new Set<string>();
  let barrelFileCount = 0;
  let testFileCount = 0;
  let totalLines = 0;
  const fileSizes: number[] = [];
  
  graph.forEachNode((node, attrs) => {
    if (!files.has(attrs.filePath)) {
      files.add(attrs.filePath);
      
      const fileName = basename(attrs.filePath);
      
      // Detect barrel files (index.ts, index.js)
      if (fileName === 'index.ts' || fileName === 'index.js' || fileName === 'index.tsx' || fileName === 'index.jsx') {
        barrelFileCount++;
      }
      
      // Detect test files
      if (fileName.includes('.test.') || fileName.includes('.spec.') || attrs.filePath.includes('__tests__')) {
        testFileCount++;
      }
      
      // Approximate file size from line numbers
      const maxLine = getMaxLineNumber(graph, attrs.filePath);
      if (maxLine > 0) {
        fileSizes.push(maxLine);
        totalLines += maxLine;
      }
    }
  });
  
  const avgFileSize = fileSizes.length > 0 ? Math.round(totalLines / fileSizes.length) : 0;
  const medianFileSize = fileSizes.length > 0 ? getMedian(fileSizes) : 0;
  
  let output = '';
  output += `- **Total Files:** ${formatNumber(files.size)}\n`;
  output += `- **Barrel Files (index.*):** ${formatNumber(barrelFileCount)} (${formatPercent(barrelFileCount, files.size)})\n`;
  output += `- **Test Files:** ${formatNumber(testFileCount)} (${formatPercent(testFileCount, files.size)})\n`;
  
  if (avgFileSize > 0) {
    output += `- **Average File Size:** ${formatNumber(avgFileSize)} lines\n`;
    output += `- **Median File Size:** ${formatNumber(medianFileSize)} lines\n`;
  }
  
  output += '\n';
  return output;
}

function getMaxLineNumber(graph: DirectedGraph, filePath: string): number {
  let maxLine = 0;
  graph.forEachNode((node, attrs) => {
    if (attrs.filePath === filePath) {
      maxLine = Math.max(maxLine, attrs.endLine);
    }
  });
  return maxLine;
}

function getMedian(numbers: number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function generateNamingPatterns(graph: DirectedGraph): string {
  const patterns = {
    files: { camelCase: 0, PascalCase: 0, kebabCase: 0, snakeCase: 0, total: 0 },
    functions: { camelCase: 0, PascalCase: 0, snakeCase: 0, total: 0 },
    classes: { PascalCase: 0, other: 0, total: 0 },
    interfaces: { IPrefixed: 0, PascalCase: 0, other: 0, total: 0 },
    constants: { UPPER_SNAKE: 0, other: 0, total: 0 },
    types: { PascalCase: 0, camelCase: 0, other: 0, total: 0 },
  };
  
  const files = new Set<string>();
  
  // Analyze file names
  graph.forEachNode((node, attrs) => {
    if (!files.has(attrs.filePath)) {
      files.add(attrs.filePath);
      const fileName = basename(attrs.filePath, extname(attrs.filePath));
      
      if (isCamelCase(fileName)) patterns.files.camelCase++;
      else if (isPascalCase(fileName)) patterns.files.PascalCase++;
      else if (isKebabCase(fileName)) patterns.files.kebabCase++;
      else if (isSnakeCase(fileName)) patterns.files.snakeCase++;
      
      patterns.files.total++;
    }
    
    // Analyze symbol names
    const name = attrs.name;
    const kind = attrs.kind;
    
    if (kind === 'function' || kind === 'method') {
      if (isCamelCase(name)) patterns.functions.camelCase++;
      else if (isPascalCase(name)) patterns.functions.PascalCase++;
      else if (isSnakeCase(name)) patterns.functions.snakeCase++;
      patterns.functions.total++;
    } else if (kind === 'class') {
      if (isPascalCase(name)) patterns.classes.PascalCase++;
      else patterns.classes.other++;
      patterns.classes.total++;
    } else if (kind === 'interface') {
      if (name.startsWith('I') && isPascalCase(name.slice(1))) patterns.interfaces.IPrefixed++;
      else if (isPascalCase(name)) patterns.interfaces.PascalCase++;
      else patterns.interfaces.other++;
      patterns.interfaces.total++;
    } else if (kind === 'constant') {
      if (isUpperSnakeCase(name)) patterns.constants.UPPER_SNAKE++;
      else patterns.constants.other++;
      patterns.constants.total++;
    } else if (kind === 'type_alias') {
      if (isPascalCase(name)) patterns.types.PascalCase++;
      else if (isCamelCase(name)) patterns.types.camelCase++;
      else patterns.types.other++;
      patterns.types.total++;
    }
  });
  
  let output = '';
  
  // File naming
  if (patterns.files.total > 0) {
    output += '**File Naming:**\n\n';
    if (patterns.files.kebabCase > 0) {
      output += `- kebab-case: ${formatPercent(patterns.files.kebabCase, patterns.files.total)}\n`;
    }
    if (patterns.files.camelCase > 0) {
      output += `- camelCase: ${formatPercent(patterns.files.camelCase, patterns.files.total)}\n`;
    }
    if (patterns.files.PascalCase > 0) {
      output += `- PascalCase: ${formatPercent(patterns.files.PascalCase, patterns.files.total)}\n`;
    }
    if (patterns.files.snakeCase > 0) {
      output += `- snake_case: ${formatPercent(patterns.files.snakeCase, patterns.files.total)}\n`;
    }
    output += '\n';
  }
  
  // Function naming
  if (patterns.functions.total > 0) {
    output += '**Function Naming:**\n\n';
    if (patterns.functions.camelCase > 0) {
      output += `- camelCase: ${formatPercent(patterns.functions.camelCase, patterns.functions.total)}\n`;
    }
    if (patterns.functions.snakeCase > 0) {
      output += `- snake_case: ${formatPercent(patterns.functions.snakeCase, patterns.functions.total)}\n`;
    }
    if (patterns.functions.PascalCase > 0) {
      output += `- PascalCase: ${formatPercent(patterns.functions.PascalCase, patterns.functions.total)}\n`;
    }
    output += '\n';
  }
  
  // Class naming
  if (patterns.classes.total > 0) {
    output += '**Class Naming:**\n\n';
    output += `- PascalCase: ${formatPercent(patterns.classes.PascalCase, patterns.classes.total)}\n`;
    if (patterns.classes.other > 0) {
      output += `- Other: ${formatPercent(patterns.classes.other, patterns.classes.total)}\n`;
    }
    output += '\n';
  }
  
  // Interface naming
  if (patterns.interfaces.total > 0) {
    output += '**Interface Naming:**\n\n';
    if (patterns.interfaces.IPrefixed > 0) {
      output += `- I-prefix (IPerson): ${formatPercent(patterns.interfaces.IPrefixed, patterns.interfaces.total)}\n`;
    }
    if (patterns.interfaces.PascalCase > 0) {
      output += `- PascalCase (Person): ${formatPercent(patterns.interfaces.PascalCase, patterns.interfaces.total)}\n`;
    }
    if (patterns.interfaces.other > 0) {
      output += `- Other: ${formatPercent(patterns.interfaces.other, patterns.interfaces.total)}\n`;
    }
    output += '\n';
  }
  
  // Type naming
  if (patterns.types.total > 0) {
    output += '**Type Naming:**\n\n';
    if (patterns.types.PascalCase > 0) {
      output += `- PascalCase: ${formatPercent(patterns.types.PascalCase, patterns.types.total)}\n`;
    }
    if (patterns.types.camelCase > 0) {
      output += `- camelCase: ${formatPercent(patterns.types.camelCase, patterns.types.total)}\n`;
    }
    if (patterns.types.other > 0) {
      output += `- Other: ${formatPercent(patterns.types.other, patterns.types.total)}\n`;
    }
    output += '\n';
  }
  
  // Constant naming
  if (patterns.constants.total > 0) {
    output += '**Constant Naming:**\n\n';
    output += `- UPPER_SNAKE_CASE: ${formatPercent(patterns.constants.UPPER_SNAKE, patterns.constants.total)}\n`;
    if (patterns.constants.other > 0) {
      output += `- Other: ${formatPercent(patterns.constants.other, patterns.constants.total)}\n`;
    }
    output += '\n';
  }
  
  return output;
}

function generateImportStyle(graph: DirectedGraph): string {
  let barrelImportCount = 0;
  let pathAliasCount = 0;
  let totalImports = 0;
  let namedExportCount = 0;
  let defaultExportCount = 0;
  
  // Count import patterns
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath && attrs.kind === 'imports') {
      totalImports++;
      
      // Detect barrel imports (imports from index files)
      if (targetAttrs.filePath.endsWith('/index.ts') || targetAttrs.filePath.endsWith('/index.js')) {
        barrelImportCount++;
      }
      
      // Detect path alias (@/ or similar)
      if (targetAttrs.filePath.startsWith('@/') || targetAttrs.filePath.startsWith('~/')  || targetAttrs.filePath.startsWith('src/')) {
        pathAliasCount++;
      }
    }
  });
  
  // Count exports
  graph.forEachNode((node, attrs) => {
    if (attrs.exported) {
      if (attrs.name === 'default') {
        defaultExportCount++;
      } else {
        namedExportCount++;
      }
    }
  });
  
  let output = '';
  
  if (totalImports > 0) {
    output += `- **Total Cross-File Imports:** ${formatNumber(totalImports)}\n`;
    
    if (barrelImportCount > 0) {
      output += `- **Barrel Imports (from index files):** ${formatPercent(barrelImportCount, totalImports)}\n`;
    }
    
    if (pathAliasCount > 0) {
      output += `- **Path Alias Usage (@/ or ~/):** ${formatPercent(pathAliasCount, totalImports)}\n`;
    }
  }
  
  output += '\n';
  return output;
}

function generateExportPatterns(graph: DirectedGraph): string {
  let namedExportCount = 0;
  let defaultExportCount = 0;
  let reExportCount = 0;
  
  graph.forEachNode((node, attrs) => {
    if (attrs.exported) {
      if (attrs.name === 'default') {
        defaultExportCount++;
      } else {
        namedExportCount++;
      }
    }
    
    if (attrs.kind === 'export') {
      reExportCount++;
    }
  });
  
  const totalExports = namedExportCount + defaultExportCount;
  
  let output = '';
  
  if (totalExports > 0) {
    output += `- **Named Exports:** ${formatNumber(namedExportCount)} (${formatPercent(namedExportCount, totalExports)})\n`;
    output += `- **Default Exports:** ${formatNumber(defaultExportCount)} (${formatPercent(defaultExportCount, totalExports)})\n`;
    
    if (reExportCount > 0) {
      output += `- **Re-exports:** ${formatNumber(reExportCount)}\n`;
    }
  }
  
  output += '\n';
  return output;
}

function generateSymbolDistribution(graph: DirectedGraph): string {
  const symbolCounts: Record<SymbolKind, number> = {
    function: 0,
    class: 0,
    variable: 0,
    constant: 0,
    type_alias: 0,
    interface: 0,
    enum: 0,
    import: 0,
    export: 0,
    method: 0,
    property: 0,
    decorator: 0,
    module: 0,
  };
  
  graph.forEachNode((node, attrs) => {
    symbolCounts[attrs.kind]++;
  });
  
  const total = graph.order;
  
  const rows: string[][] = [];
  
  for (const [kind, count] of Object.entries(symbolCounts)) {
    if (count > 0) {
      rows.push([kind, formatNumber(count), formatPercent(count, total)]);
    }
  }
  
  // Sort by count descending
  rows.sort((a, b) => parseInt(b[1].replace(/,/g, '')) - parseInt(a[1].replace(/,/g, '')));
  
  return table(['Symbol Kind', 'Count', 'Percentage'], rows);
}

function generateDesignPatterns(graph: DirectedGraph): string {
  const patterns = {
    service: 0,
    factory: 0,
    hook: 0,
    middleware: 0,
    controller: 0,
    repository: 0,
    handler: 0,
  };
  
  graph.forEachNode((node, attrs) => {
    const name = attrs.name;
    const file = attrs.filePath.toLowerCase();
    
    // Service pattern
    if (attrs.kind === 'class' && name.endsWith('Service')) {
      patterns.service++;
    }
    
    // Factory pattern
    if (attrs.kind === 'function' && name.startsWith('create')) {
      patterns.factory++;
    }
    
    // Hook pattern (React)
    if (attrs.kind === 'function' && name.startsWith('use') && name.length > 3) {
      patterns.hook++;
    }
    
    // Middleware pattern
    if (file.includes('middleware')) {
      patterns.middleware++;
    }
    
    // Controller pattern
    if ((attrs.kind === 'class' || attrs.kind === 'function') && name.endsWith('Controller')) {
      patterns.controller++;
    }
    
    // Repository pattern
    if ((attrs.kind === 'class' || attrs.kind === 'function') && name.endsWith('Repository')) {
      patterns.repository++;
    }
    
    // Handler pattern
    if ((attrs.kind === 'class' || attrs.kind === 'function') && name.endsWith('Handler')) {
      patterns.handler++;
    }
  });
  
  const detected = Object.entries(patterns).filter(([, count]) => count > 0);
  
  if (detected.length === 0) {
    return 'No common design patterns detected.\n\n';
  }
  
  let output = '';
  
  for (const [pattern, count] of detected) {
    const description = getPatternDescription(pattern);
    output += `- **${capitalizeFirst(pattern)} Pattern:** ${count} occurrences — ${description}\n`;
  }
  
  output += '\n';
  return output;
}

function getPatternDescription(pattern: string): string {
  switch (pattern) {
    case 'service':
      return 'Classes ending in "Service"';
    case 'factory':
      return 'Functions starting with "create"';
    case 'hook':
      return 'Functions starting with "use" (React hooks)';
    case 'middleware':
      return 'Files in middleware directories';
    case 'controller':
      return 'Controllers for handling requests';
    case 'repository':
      return 'Data access layer pattern';
    case 'handler':
      return 'Event/request handlers';
    default:
      return '';
  }
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Naming convention detection helpers
function isCamelCase(name: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name);
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

function isKebabCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

function isSnakeCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
}

function isUpperSnakeCase(name: string): boolean {
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name);
}

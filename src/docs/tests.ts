import { DirectedGraph } from 'graphology';
import { basename, dirname } from 'path';
import { header, timestamp, formatNumber, formatPercent, unorderedList, code, table } from './templates.js';

/**
 * Generate TESTS.md - test file analysis
 */
export function generateTests(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('Test Analysis');
  output += 'Test file inventory and coverage mapping.\n\n';
  
  // 1. Test File Inventory
  output += header('Test File Inventory', 2);
  output += generateTestFileInventory(graph);
  
  // 2. Test-to-Source Mapping
  output += header('Test-to-Source Mapping', 2);
  output += generateTestToSourceMapping(graph);
  
  // 3. Untested Files
  output += header('Untested Files', 2);
  output += generateUntestedFiles(graph);
  
  // 4. Test Coverage Map
  output += header('Test Coverage Map', 2);
  output += generateTestCoverageMap(graph);
  
  // 5. Test Statistics
  output += header('Test Statistics', 2);
  output += generateTestStatistics(graph);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

function isTestFile(filePath: string): boolean {
  const fileName = basename(filePath).toLowerCase();
  const dirPath = dirname(filePath).toLowerCase();
  
  // Check directory names
  if (dirPath.includes('test') || dirPath.includes('spec') || dirPath.includes('__tests__')) {
    return true;
  }
  
  // Check file name patterns
  if (fileName.includes('.test.') || fileName.includes('.spec.') || 
      fileName.includes('_test.') || fileName.includes('_spec.')) {
    return true;
  }
  
  return false;
}

interface TestFileInfo {
  filePath: string;
  language: string;
  symbolCount: number;
  functionCount: number;
}

function getTestFiles(graph: DirectedGraph): TestFileInfo[] {
  const testFiles = new Map<string, TestFileInfo>();
  
  graph.forEachNode((node, attrs) => {
    if (isTestFile(attrs.filePath)) {
      if (!testFiles.has(attrs.filePath)) {
        testFiles.set(attrs.filePath, {
          filePath: attrs.filePath,
          language: getLanguageFromPath(attrs.filePath),
          symbolCount: 0,
          functionCount: 0,
        });
      }
      
      const info = testFiles.get(attrs.filePath)!;
      info.symbolCount++;
      
      if (attrs.kind === 'function' || attrs.kind === 'method') {
        info.functionCount++;
      }
    }
  });
  
  return Array.from(testFiles.values());
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.toLowerCase();
  if (ext.endsWith('.ts') || ext.endsWith('.tsx')) return 'TypeScript';
  if (ext.endsWith('.js') || ext.endsWith('.jsx') || ext.endsWith('.mjs') || ext.endsWith('.cjs')) return 'JavaScript';
  if (ext.endsWith('.py')) return 'Python';
  if (ext.endsWith('.go')) return 'Go';
  return 'Other';
}

function generateTestFileInventory(graph: DirectedGraph): string {
  const testFiles = getTestFiles(graph);
  
  if (testFiles.length === 0) {
    return 'No test files detected.\n\n';
  }
  
  let output = `Found ${testFiles.length} test file${testFiles.length === 1 ? '' : 's'}:\n\n`;
  
  // Sort by file path
  testFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
  
  const headers = ['Test File', 'Language', 'Symbols', 'Functions'];
  const rows = testFiles.map(t => [
    `\`${t.filePath}\``,
    t.language,
    formatNumber(t.symbolCount),
    formatNumber(t.functionCount),
  ]);
  
  output += table(headers, rows);
  
  return output;
}

function matchTestToSource(testFile: string): string | null {
  const testFileName = basename(testFile);
  const testDir = dirname(testFile);
  
  // Remove test suffixes
  let sourceFileName = testFileName
    .replace(/\.test\./g, '.')
    .replace(/\.spec\./g, '.')
    .replace(/_test\./g, '.')
    .replace(/_spec\./g, '.');
  
  // Build possible source paths
  const possiblePaths: string[] = [];
  
  // Same directory
  possiblePaths.push(testDir + '/' + sourceFileName);
  
  // Parent directory (if test is in test/ or __tests__)
  if (testDir.endsWith('/test') || testDir.endsWith('/tests') || testDir.endsWith('/__tests__')) {
    const parentDir = dirname(testDir);
    possiblePaths.push(parentDir + '/' + sourceFileName);
  }
  
  // Sibling src/ directory
  if (testDir.includes('test')) {
    const srcDir = testDir.replace(/test[s]?/g, 'src');
    possiblePaths.push(srcDir + '/' + sourceFileName);
  }
  
  // For now, return the most likely path (first non-test path)
  for (const path of possiblePaths) {
    if (!isTestFile(path)) {
      return path;
    }
  }
  
  return null;
}

function generateTestToSourceMapping(graph: DirectedGraph): string {
  const testFiles = getTestFiles(graph);
  
  if (testFiles.length === 0) {
    return 'No test files detected.\n\n';
  }
  
  // Get all source files
  const allFiles = new Set<string>();
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  
  let output = '';
  let mappedCount = 0;
  
  const mappings: Array<{ test: string; source: string | null }> = [];
  
  for (const testFile of testFiles) {
    const sourceFile = matchTestToSource(testFile.filePath);
    
    // Verify source file exists in the project
    const exists = sourceFile && allFiles.has(sourceFile);
    
    mappings.push({
      test: testFile.filePath,
      source: exists ? sourceFile : null,
    });
    
    if (exists) {
      mappedCount++;
    }
  }
  
  output += `Matched ${mappedCount} of ${testFiles.length} test files to source files:\n\n`;
  
  for (const mapping of mappings) {
    if (mapping.source) {
      output += `- ${code(mapping.source)} ← ${code(mapping.test)}\n`;
    }
  }
  
  output += '\n';
  
  // Show unmapped test files
  const unmapped = mappings.filter(m => !m.source);
  if (unmapped.length > 0) {
    output += `**Unmapped test files (${unmapped.length}):**\n\n`;
    output += unorderedList(unmapped.map(m => code(m.test)));
  }
  
  return output;
}

function generateUntestedFiles(graph: DirectedGraph): string {
  const testFiles = getTestFiles(graph);
  
  // Get all source files
  const sourceFiles: string[] = [];
  const allFiles = new Set<string>();
  
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  
  for (const file of allFiles) {
    if (!isTestFile(file)) {
      sourceFiles.push(file);
    }
  }
  
  if (sourceFiles.length === 0) {
    return 'No source files detected.\n\n';
  }
  
  // Build set of tested files
  const testedFiles = new Set<string>();
  for (const testFile of testFiles) {
    const sourceFile = matchTestToSource(testFile.filePath);
    if (sourceFile && allFiles.has(sourceFile)) {
      testedFiles.add(sourceFile);
    }
  }
  
  // Find untested files
  const untested = sourceFiles.filter(f => !testedFiles.has(f));
  
  if (untested.length === 0) {
    return '✅ All source files have matching test files.\n\n';
  }
  
  // Get connection count for each file to prioritize
  const fileConnections = new Map<string, number>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      fileConnections.set(sourceAttrs.filePath, (fileConnections.get(sourceAttrs.filePath) || 0) + 1);
      fileConnections.set(targetAttrs.filePath, (fileConnections.get(targetAttrs.filePath) || 0) + 1);
    }
  });
  
  // Sort untested files by connection count (high to low)
  const untestedWithConnections = untested.map(f => ({
    filePath: f,
    connections: fileConnections.get(f) || 0,
  })).sort((a, b) => b.connections - a.connections);
  
  let output = `⚠️ Found ${untested.length} source file${untested.length === 1 ? '' : 's'} without matching test files:\n\n`;
  
  const headers = ['File', 'Connections', 'Priority'];
  const rows = untestedWithConnections.slice(0, 20).map(f => {
    const priority = f.connections > 10 ? '🔴 High' : f.connections > 5 ? '🟡 Medium' : '🟢 Low';
    return [
      `\`${f.filePath}\``,
      formatNumber(f.connections),
      priority,
    ];
  });
  
  output += table(headers, rows);
  
  if (untested.length > 20) {
    output += `... and ${untested.length - 20} more.\n\n`;
  }
  
  return output;
}

function generateTestCoverageMap(graph: DirectedGraph): string {
  const testFiles = getTestFiles(graph);
  
  // Get all source files
  const allFiles = new Set<string>();
  const sourceFiles: string[] = [];
  
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  
  for (const file of allFiles) {
    if (!isTestFile(file)) {
      sourceFiles.push(file);
    }
  }
  
  if (sourceFiles.length === 0) {
    return 'No source files detected.\n\n';
  }
  
  // Build mapping
  const mappings: Array<{
    sourceFile: string;
    hasTest: boolean;
    testFile: string | null;
    symbolCount: number;
  }> = [];
  
  const testedFiles = new Map<string, string>();
  for (const testFile of testFiles) {
    const sourceFile = matchTestToSource(testFile.filePath);
    if (sourceFile && allFiles.has(sourceFile)) {
      testedFiles.set(sourceFile, testFile.filePath);
    }
  }
  
  // Count symbols per file
  const fileSymbols = new Map<string, number>();
  graph.forEachNode((node, attrs) => {
    fileSymbols.set(attrs.filePath, (fileSymbols.get(attrs.filePath) || 0) + 1);
  });
  
  for (const sourceFile of sourceFiles) {
    const testFile = testedFiles.get(sourceFile);
    mappings.push({
      sourceFile,
      hasTest: !!testFile,
      testFile: testFile || null,
      symbolCount: fileSymbols.get(sourceFile) || 0,
    });
  }
  
  // Sort by source file path
  mappings.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
  
  const headers = ['Source File', 'Has Test?', 'Test File', 'Symbols'];
  const rows = mappings.slice(0, 30).map(m => [
    `\`${m.sourceFile}\``,
    m.hasTest ? '✅' : '❌',
    m.testFile ? `\`${basename(m.testFile)}\`` : '-',
    formatNumber(m.symbolCount),
  ]);
  
  let output = table(headers, rows);
  
  if (mappings.length > 30) {
    output += `... and ${mappings.length - 30} more files.\n\n`;
  }
  
  return output;
}

function generateTestStatistics(graph: DirectedGraph): string {
  const testFiles = getTestFiles(graph);
  
  // Get all source files
  const allFiles = new Set<string>();
  const sourceFiles: string[] = [];
  
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  
  for (const file of allFiles) {
    if (!isTestFile(file)) {
      sourceFiles.push(file);
    }
  }
  
  // Count tested files
  const testedFiles = new Set<string>();
  for (const testFile of testFiles) {
    const sourceFile = matchTestToSource(testFile.filePath);
    if (sourceFile && allFiles.has(sourceFile)) {
      testedFiles.add(sourceFile);
    }
  }
  
  let output = '';
  
  output += `- **Total test files:** ${formatNumber(testFiles.length)}\n`;
  output += `- **Total source files:** ${formatNumber(sourceFiles.length)}\n`;
  output += `- **Source files with tests:** ${formatNumber(testedFiles.size)} (${formatPercent(testedFiles.size, sourceFiles.length)})\n`;
  output += `- **Source files without tests:** ${formatNumber(sourceFiles.length - testedFiles.size)} (${formatPercent(sourceFiles.length - testedFiles.size, sourceFiles.length)})\n`;
  
  // Directory breakdown
  const dirTestCoverage = new Map<string, { total: number; tested: number }>();
  
  for (const sourceFile of sourceFiles) {
    const dir = dirname(sourceFile).split('/')[0];
    if (!dirTestCoverage.has(dir)) {
      dirTestCoverage.set(dir, { total: 0, tested: 0 });
    }
    dirTestCoverage.get(dir)!.total++;
    if (testedFiles.has(sourceFile)) {
      dirTestCoverage.get(dir)!.tested++;
    }
  }
  
  if (dirTestCoverage.size > 1) {
    output += '\n**Coverage by directory:**\n\n';
    
    const sortedDirs = Array.from(dirTestCoverage.entries())
      .sort((a, b) => b[1].total - a[1].total);
    
    for (const [dir, coverage] of sortedDirs) {
      const percent = formatPercent(coverage.tested, coverage.total);
      output += `- **${dir}/**: ${coverage.tested}/${coverage.total} files (${percent})\n`;
    }
  }
  
  output += '\n';
  return output;
}

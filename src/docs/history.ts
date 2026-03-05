import { DirectedGraph } from 'graphology';
import { dirname } from 'path';
import { execSync } from 'child_process';
import { header, timestamp, formatNumber, unorderedList, code, table } from './templates.js';

/**
 * Generate HISTORY.md - git history + graph analysis
 */
export function generateHistory(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('Development History');
  output += 'Git history combined with graph analysis showing feature evolution.\n\n';
  
  // Check if git is available
  const hasGit = isGitAvailable(projectRoot);
  
  if (!hasGit) {
    output += '⚠️ **Git history not available.** This project is not a git repository or git is not installed.\n\n';
    output += 'Showing graph-based analysis only:\n\n';
  }
  
  // 1. Development Timeline
  if (hasGit) {
    output += header('Development Timeline', 2);
    output += generateDevelopmentTimeline(projectRoot);
  }
  
  // 2. File Change Frequency (Churn)
  if (hasGit) {
    output += header('File Change Frequency (Churn)', 2);
    output += generateFileChurn(projectRoot, graph);
  }
  
  // 3. Feature Timeline
  if (hasGit) {
    output += header('Feature Timeline', 2);
    output += generateFeatureTimeline(projectRoot);
  }
  
  // 4. File Age Analysis
  if (hasGit) {
    output += header('File Age Analysis', 2);
    output += generateFileAgeAnalysis(projectRoot, graph);
  }
  
  // 5. Authors / Contributors
  if (hasGit) {
    output += header('Contributors', 2);
    output += generateContributors(projectRoot);
  }
  
  // 6. Graph-Based Feature Detection (always available)
  output += header('Feature Clusters (Graph-Based)', 2);
  output += generateFeatureClusters(graph);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

function isGitAvailable(projectRoot: string): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function executeGitCommand(projectRoot: string, command: string): string {
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
    }).trim();
  } catch {
    return '';
  }
}

function generateDevelopmentTimeline(projectRoot: string): string {
  const log = executeGitCommand(projectRoot, 'git log --format="%ai" --all --no-merges');
  
  if (!log) {
    return 'Unable to retrieve git log.\n\n';
  }
  
  const dates = log.split('\n').filter(d => d.length > 0);
  
  if (dates.length === 0) {
    return 'No commits found.\n\n';
  }
  
  const firstCommit = new Date(dates[dates.length - 1]);
  const lastCommit = new Date(dates[0]);
  
  const ageInDays = Math.floor((lastCommit.getTime() - firstCommit.getTime()) / (1000 * 60 * 60 * 24));
  const ageInMonths = Math.floor(ageInDays / 30);
  
  let output = '';
  
  output += `- **First commit:** ${firstCommit.toISOString().split('T')[0]}\n`;
  output += `- **Last commit:** ${lastCommit.toISOString().split('T')[0]}\n`;
  output += `- **Project age:** ${ageInMonths} months (${ageInDays} days)\n`;
  output += `- **Total commits:** ${formatNumber(dates.length)}\n`;
  
  // Calculate activity level (commits per month)
  const commitsPerMonth = ageInMonths > 0 ? (dates.length / ageInMonths).toFixed(1) : dates.length.toString();
  output += `- **Average activity:** ${commitsPerMonth} commits/month\n`;
  
  output += '\n';
  return output;
}

function generateFileChurn(projectRoot: string, graph: DirectedGraph): string {
  const churnOutput = executeGitCommand(
    projectRoot,
    'git log --all --name-only --format="" | sort | uniq -c | sort -rn | head -20'
  );
  
  if (!churnOutput) {
    return 'Unable to retrieve file churn data.\n\n';
  }
  
  const lines = churnOutput.split('\n').filter(l => l.trim().length > 0);
  
  if (lines.length === 0) {
    return 'No file churn data available.\n\n';
  }
  
  // Parse churn data
  const churnData: Array<{ file: string; changes: number }> = [];
  
  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const changes = parseInt(match[1], 10);
      const file = match[2].trim();
      
      // Skip empty or invalid files
      if (file && file.length > 0 && !file.startsWith('.')) {
        churnData.push({ file, changes });
      }
    }
  }
  
  if (churnData.length === 0) {
    return 'No valid file churn data.\n\n';
  }
  
  // Get connection counts from graph
  const fileConnections = new Map<string, number>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      fileConnections.set(sourceAttrs.filePath, (fileConnections.get(sourceAttrs.filePath) || 0) + 1);
      fileConnections.set(targetAttrs.filePath, (fileConnections.get(targetAttrs.filePath) || 0) + 1);
    }
  });
  
  let output = 'Top 20 most-changed files:\n\n';
  
  const headers = ['File', 'Changes', 'Connections', 'Risk'];
  const rows = churnData.slice(0, 20).map(item => {
    const connections = fileConnections.get(item.file) || 0;
    
    let risk = '🟢 Low';
    if (item.changes > 50 && connections > 10) {
      risk = '🔴 High';
    } else if (item.changes > 20 && connections > 5) {
      risk = '🟡 Medium';
    } else if (item.changes > 50 || connections > 10) {
      risk = '🟡 Medium';
    }
    
    return [
      `\`${item.file}\``,
      formatNumber(item.changes),
      formatNumber(connections),
      risk,
    ];
  });
  
  output += table(headers, rows);
  
  output += '**Risk levels:**\n\n';
  output += '- 🔴 High churn + high connections = risky hotspot (break often, affect many)\n';
  output += '- 🟡 High churn + low connections = actively developed but isolated\n';
  output += '- 🟢 Low churn + high connections = stable foundation\n\n';
  
  return output;
}

function generateFeatureTimeline(projectRoot: string): string {
  const log = executeGitCommand(projectRoot, 'git log --oneline --all --no-merges');
  
  if (!log) {
    return 'Unable to retrieve commit log.\n\n';
  }
  
  const commits = log.split('\n').filter(c => c.length > 0);
  
  if (commits.length === 0) {
    return 'No commits found.\n\n';
  }
  
  // Categorize commits
  const categories = {
    features: 0,
    fixes: 0,
    refactors: 0,
    other: 0,
  };
  
  const featureKeywords = ['feat', 'add', 'new', 'implement', 'create'];
  const fixKeywords = ['fix', 'bug', 'patch', 'resolve'];
  const refactorKeywords = ['refactor', 'cleanup', 'restructure', 'improve'];
  
  for (const commit of commits) {
    const messageLower = commit.toLowerCase();
    
    if (featureKeywords.some(kw => messageLower.includes(kw))) {
      categories.features++;
    } else if (fixKeywords.some(kw => messageLower.includes(kw))) {
      categories.fixes++;
    } else if (refactorKeywords.some(kw => messageLower.includes(kw))) {
      categories.refactors++;
    } else {
      categories.other++;
    }
  }
  
  let output = 'Commit breakdown by type:\n\n';
  
  output += `- **Features:** ${formatNumber(categories.features)} commits (${((categories.features / commits.length) * 100).toFixed(1)}%)\n`;
  output += `- **Bug fixes:** ${formatNumber(categories.fixes)} commits (${((categories.fixes / commits.length) * 100).toFixed(1)}%)\n`;
  output += `- **Refactors:** ${formatNumber(categories.refactors)} commits (${((categories.refactors / commits.length) * 100).toFixed(1)}%)\n`;
  output += `- **Other:** ${formatNumber(categories.other)} commits (${((categories.other / commits.length) * 100).toFixed(1)}%)\n`;
  
  output += '\n';
  return output;
}

function generateFileAgeAnalysis(projectRoot: string, graph: DirectedGraph): string {
  // Get files from graph
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  
  if (files.size === 0) {
    return 'No files to analyze.\n\n';
  }
  
  // Get creation date for key files (sample up to 20 files)
  const fileAges: Array<{ file: string; date: Date }> = [];
  const sampleFiles = Array.from(files).slice(0, 20);
  
  for (const file of sampleFiles) {
    const dateStr = executeGitCommand(
      projectRoot,
      `git log --format="%ai" --diff-filter=A -- "${file}" | tail -1`
    );
    
    if (dateStr) {
      fileAges.push({
        file,
        date: new Date(dateStr),
      });
    }
  }
  
  if (fileAges.length === 0) {
    return 'Unable to determine file ages.\n\n';
  }
  
  // Sort by date ascending (oldest first)
  fileAges.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  let output = '';
  
  output += '**Oldest files (foundation):**\n\n';
  const oldest = fileAges.slice(0, 5);
  output += unorderedList(oldest.map(f => {
    return `${code(f.file)} — added ${f.date.toISOString().split('T')[0]}`;
  }));
  
  output += '**Newest files (recent features):**\n\n';
  const newest = fileAges.slice(-5).reverse();
  output += unorderedList(newest.map(f => {
    return `${code(f.file)} — added ${f.date.toISOString().split('T')[0]}`;
  }));
  
  return output;
}

function generateContributors(projectRoot: string): string {
  const contributors = executeGitCommand(projectRoot, 'git shortlog -sn --all');
  
  if (!contributors) {
    return 'Unable to retrieve contributor data.\n\n';
  }
  
  const lines = contributors.split('\n').filter(l => l.trim().length > 0);
  
  if (lines.length === 0) {
    return 'No contributors found.\n\n';
  }
  
  let output = `Found ${lines.length} contributor${lines.length === 1 ? '' : 's'}:\n\n`;
  
  const headers = ['Contributor', 'Commits', 'Percentage'];
  
  // Parse contributor data
  const contributorData: Array<{ name: string; commits: number }> = [];
  let totalCommits = 0;
  
  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const commits = parseInt(match[1], 10);
      const name = match[2].trim();
      contributorData.push({ name, commits });
      totalCommits += commits;
    }
  }
  
  const rows = contributorData.slice(0, 10).map(c => [
    c.name,
    formatNumber(c.commits),
    `${((c.commits / totalCommits) * 100).toFixed(1)}%`,
  ]);
  
  output += table(headers, rows);
  
  if (contributorData.length > 10) {
    output += `... and ${contributorData.length - 10} more contributors.\n\n`;
  }
  
  return output;
}

function generateFeatureClusters(graph: DirectedGraph): string {
  // Detect clusters of tightly connected files
  const dirFiles = new Map<string, Set<string>>();
  const fileEdges = new Map<string, Set<string>>();
  
  // Collect files per directory
  graph.forEachNode((node, attrs) => {
    const dir = dirname(attrs.filePath);
    if (!dirFiles.has(dir)) {
      dirFiles.set(dir, new Set());
    }
    dirFiles.get(dir)!.add(attrs.filePath);
  });
  
  // Build file-to-file edges
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    
    if (sourceFile !== targetFile) {
      if (!fileEdges.has(sourceFile)) {
        fileEdges.set(sourceFile, new Set());
      }
      fileEdges.get(sourceFile)!.add(targetFile);
    }
  });
  
  interface Cluster {
    name: string;
    files: string[];
    internalEdges: number;
  }
  
  const clusters: Cluster[] = [];
  
  // For each directory, check if files are interconnected
  for (const [dir, files] of dirFiles.entries()) {
    if (dir === '.' || files.size < 2) continue;
    
    const fileArray = Array.from(files);
    let internalEdgeCount = 0;
    
    // Count edges between files in the same directory
    for (const file of fileArray) {
      const targets = fileEdges.get(file);
      if (targets) {
        for (const target of targets) {
          if (files.has(target)) {
            internalEdgeCount++;
          }
        }
      }
    }
    
    // If files in this directory have at least 2 mutual edges, it's a cluster
    if (internalEdgeCount >= 2) {
      const clusterName = inferClusterName(fileArray, dir);
      clusters.push({
        name: clusterName,
        files: fileArray,
        internalEdges: internalEdgeCount,
      });
    }
  }
  
  if (clusters.length === 0) {
    return 'No distinct feature clusters detected.\n\n';
  }
  
  // Sort by internal edge count descending
  clusters.sort((a, b) => b.internalEdges - a.internalEdges);
  
  let output = `Detected ${clusters.length} feature cluster${clusters.length === 1 ? '' : 's'} (tightly-connected file groups):\n\n`;
  
  for (const cluster of clusters.slice(0, 10)) {
    output += `**${cluster.name}** (${cluster.files.length} files, ${cluster.internalEdges} internal connections):\n\n`;
    const items = cluster.files.slice(0, 5).map(f => code(f));
    output += unorderedList(items);
    
    if (cluster.files.length > 5) {
      output += `... and ${cluster.files.length - 5} more files.\n\n`;
    }
  }
  
  return output;
}

function inferClusterName(files: string[], dir: string): string {
  // Extract common words from file names
  const words = new Map<string, number>();
  
  for (const file of files) {
    const fileName = file.toLowerCase();
    const parts = fileName.split(/[\/\-\_\.]/).filter(p => p.length > 3);
    
    for (const part of parts) {
      words.set(part, (words.get(part) || 0) + 1);
    }
  }
  
  // Find most common word
  const sortedWords = Array.from(words.entries()).sort((a, b) => b[1] - a[1]);
  
  if (sortedWords.length > 0 && sortedWords[0][1] > 1) {
    return capitalizeFirst(sortedWords[0][0]);
  }
  
  // Fallback: use directory name
  const dirName = dir.split('/').pop() || 'Core';
  return capitalizeFirst(dirName);
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

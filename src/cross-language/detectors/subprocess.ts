import { readFileSync } from 'fs';
import { join, resolve, basename } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { CrossLanguageEdge } from '../types.js';

const SCRIPT_EXTENSIONS = ['.py', '.js', '.ts', '.go', '.rs'];

function getLanguage(filePath: string): string {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return 'javascript';
  if (filePath.endsWith('.py')) return 'python';
  if (filePath.endsWith('.go')) return 'go';
  if (filePath.endsWith('.rs')) return 'rust';
  return 'unknown';
}

interface SubprocessCall {
  file: string;
  line: number;
  command: string;
  calledFile: string; // extracted filename
}

function extractFilenameFromArgs(args: string): string | null {
  // Look for arguments ending in known script extensions
  const tokens = args.split(/[\s,'"[\]]+/).filter(Boolean);
  for (const token of tokens) {
    for (const ext of SCRIPT_EXTENSIONS) {
      if (token.endsWith(ext)) {
        return token;
      }
    }
  }
  return null;
}

function extractSubprocessCalls(source: string, filePath: string): SubprocessCall[] {
  const calls: SubprocessCall[] = [];
  const lines = source.split('\n');
  const lang = getLanguage(filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (lang === 'typescript' || lang === 'javascript') {
      // execSync('python scripts/analyze.py --input data.json')
      // exec('python3 process.py')
      const execMatch = line.match(/(?:execSync|exec)\s*\(\s*(['"`])([^'"`]+)\1/);
      if (execMatch) {
        const command = execMatch[2];
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }

      // execSync with template literal
      if (!execMatch) {
        const execTemplateMatch = line.match(/(?:execSync|exec)\s*\(\s*`([^`]+)`/);
        if (execTemplateMatch) {
          const command = execTemplateMatch[1].replace(/\$\{[^}]*\}/g, '');
          const calledFile = extractFilenameFromArgs(command);
          if (calledFile) {
            calls.push({ file: filePath, line: i + 1, command: execTemplateMatch[1], calledFile });
          }
        }
      }

      // spawn('python', ['scripts/analyze.py'])
      // spawnSync('node', ['worker.js'])
      const spawnMatch = line.match(/(?:spawn|spawnSync)\s*\(\s*['"](\w+)['"]\s*,\s*\[([^\]]*)\]/);
      if (spawnMatch) {
        const command = `${spawnMatch[1]} ${spawnMatch[2]}`;
        const calledFile = extractFilenameFromArgs(spawnMatch[2]);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }
    }

    if (lang === 'python') {
      // subprocess.run(['node', 'index.js'])
      // subprocess.Popen(['go', 'run', 'main.go'])
      const subprocessMatch = line.match(/subprocess\s*\.\s*(?:run|call|Popen|check_output|check_call)\s*\(\s*\[([^\]]*)\]/);
      if (subprocessMatch) {
        const command = subprocessMatch[1];
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }

      // os.system('node server.js')
      const osMatch = line.match(/os\s*\.\s*system\s*\(\s*['"]([^'"]+)['"]/);
      if (osMatch) {
        const command = osMatch[1];
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }

      // subprocess.run with string arg
      const subprocessStrMatch = line.match(/subprocess\s*\.\s*(?:run|call|Popen|check_output|check_call)\s*\(\s*['"]([^'"]+)['"]/);
      if (subprocessStrMatch) {
        const command = subprocessStrMatch[1];
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }
    }

    if (lang === 'go') {
      // exec.Command('python3', 'scripts/analyze.py')
      const goMatch = line.match(/exec\s*\.\s*Command\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"/);
      if (goMatch) {
        const command = `${goMatch[1]} ${goMatch[2]}`;
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }
    }
  }

  return calls;
}

export function detectSubprocessEdges(
  files: ParsedFile[],
  projectRoot: string
): CrossLanguageEdge[] {
  const edges: CrossLanguageEdge[] = [];

  // Build a set of known file paths for resolution
  const knownFiles = new Set(files.map(f => f.filePath));
  // Also build a map from basename to full paths for fuzzy matching
  const basenameMap = new Map<string, string[]>();
  for (const f of files) {
    const base = basename(f.filePath);
    if (!basenameMap.has(base)) basenameMap.set(base, []);
    basenameMap.get(base)!.push(f.filePath);
  }

  for (const file of files) {
    const fullPath = join(projectRoot, file.filePath);
    if (!resolve(fullPath).startsWith(resolve(projectRoot))) continue;

    let source: string;
    try {
      source = readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const calls = extractSubprocessCalls(source, file.filePath);

    for (const call of calls) {
      let targetFile: string | null = null;
      let confidence: 'high' | 'medium' = 'high';

      // Try exact match first
      if (knownFiles.has(call.calledFile)) {
        targetFile = call.calledFile;
        confidence = 'high';
      } else {
        // Try basename match
        const base = basename(call.calledFile);
        const candidates = basenameMap.get(base);
        if (candidates && candidates.length > 0) {
          // Check if any candidate path contains the called file path
          const exactCandidate = candidates.find(c => c.endsWith(call.calledFile));
          if (exactCandidate) {
            targetFile = exactCandidate;
            confidence = 'high';
          } else {
            targetFile = candidates[0];
            confidence = 'medium';
          }
        }
      }

      // Only emit if target exists in graph
      if (!targetFile) continue;
      // Skip same-file
      if (targetFile === call.file) continue;

      edges.push({
        sourceFile: call.file,
        targetFile,
        edgeType: 'subprocess',
        confidence,
        sourceLanguage: getLanguage(call.file),
        targetLanguage: getLanguage(targetFile),
        sourceLine: call.line,
        metadata: {
          command: call.command,
          calledFile: call.calledFile,
        },
      });
    }
  }

  return edges;
}

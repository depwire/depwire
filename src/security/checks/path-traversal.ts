import { readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding, Severity } from '../types.js';

const SKIP_DIRS = ['node_modules/', 'dist/', '.git/', '.wrangler/', 'src/security/checks/'];
const USER_INPUT_VARS = /(?:req\.|params|query|body|input|path|dir|subdirectory|file|userInput|fileName|filePath)/i;

interface PathPattern {
  regex: RegExp;
  title: string;
  description: string;
  suggestedFix: string;
}

const PATTERNS: PathPattern[] = [
  {
    regex: /path\.join\s*\(\s*(?:__dirname|root|base|projectRoot)[^)]*,/,
    title: 'Potential path traversal via path.join',
    description: 'path.join called with a root directory and a variable that may contain user input — without resolve() containment check.',
    suggestedFix: 'Use path.resolve() and verify the result starts with the expected root: if (!resolved.startsWith(root)) throw new Error("path traversal")',
  },
  {
    regex: /readFileSync\s*\([^)]*(?:input|user|path|dir|file|query|params|body|req\.)/i,
    title: 'readFileSync with potentially user-controlled path',
    description: 'readFileSync called with a variable that may originate from user input.',
    suggestedFix: 'Validate and sanitize the file path. Use path.resolve() and verify it starts with the expected root directory.',
  },
  {
    regex: /writeFileSync\s*\([^)]*(?:input|user|path|dir|file|query|params|body|req\.)/i,
    title: 'writeFileSync with potentially user-controlled path',
    description: 'writeFileSync called with a variable that may originate from user input.',
    suggestedFix: 'Validate and sanitize the file path. Use path.resolve() and verify it starts with the expected root directory.',
  },
  {
    regex: /createReadStream\s*\([^)]*(?:input|user|path|dir|file|query|params|body|req\.)/i,
    title: 'createReadStream with potentially user-controlled path',
    description: 'createReadStream called with a path that may originate from user input.',
    suggestedFix: 'Validate and sanitize the file path before creating the stream.',
  },
];

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(d => filePath.includes(d));
}

function isRouteOrTool(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.includes('route') || lower.includes('api/') || lower.includes('mcp/') || lower.includes('handler') || lower.includes('controller');
}

export async function checkPathTraversal(
  files: ParsedFile[],
  projectRoot: string
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  try {
    for (const file of files) {
      if (shouldSkip(file.filePath)) continue;

      let content: string;
      try {
        content = readFileSync(join(projectRoot, file.filePath), 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const inRouteOrTool = isRouteOrTool(file.filePath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) continue;

        for (const pattern of PATTERNS) {
          if (pattern.regex.test(line)) {
            // Check if user input variable is involved
            if (!USER_INPUT_VARS.test(line)) continue;

            // Check for containment (resolve + startsWith check nearby)
            const nearbyLines = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join('\n');
            if (nearbyLines.includes('startsWith') && nearbyLines.includes('resolve')) continue;

            const severity: Severity = inRouteOrTool ? 'high' : 'medium';

            findings.push({
              id: '',
              severity,
              vulnerabilityClass: 'path-traversal',
              file: file.filePath,
              line: i + 1,
              title: pattern.title,
              description: pattern.description,
              attackScenario: 'An attacker could use ../ sequences to traverse outside the intended directory and read or write arbitrary files on the server.',
              suggestedFix: pattern.suggestedFix,
            });
          }
        }
      }
    }
  } catch {
    // Don't crash the entire scan
  }

  return findings;
}

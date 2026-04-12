import { readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding } from '../types.js';

const SKIP_DIRS = ['node_modules/', 'dist/', '.git/', '.wrangler/', 'src/security/checks/'];

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(d => filePath.includes(d));
}

export async function checkInputValidation(
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
      const fullContent = content;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) continue;

        // CORS wildcard
        if (/cors\s*\(\s*\{\s*origin\s*:\s*['"]\*['"]/.test(line) || /Access-Control-Allow-Origin.*\*/.test(line)) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'input-validation',
            file: file.filePath,
            line: i + 1,
            title: 'CORS wildcard origin',
            description: 'CORS is configured to allow all origins (*), which permits any website to make requests to this API.',
            attackScenario: 'An attacker could create a malicious website that makes authenticated requests to this API using the victim\'s cookies.',
            suggestedFix: 'Restrict CORS origin to specific trusted domains instead of using wildcard.',
          });
        }

        // No body size limit — detect express.json() without limit
        if (/express\.json\s*\(\s*\)/.test(line)) {
          if (!/limit/.test(line)) {
            findings.push({
              id: '',
              severity: 'medium',
              vulnerabilityClass: 'input-validation',
              file: file.filePath,
              line: i + 1,
              title: 'No body size limit on JSON parser',
              description: 'express.json() used without a size limit — the server may be vulnerable to large payload attacks.',
              attackScenario: 'An attacker could send extremely large JSON payloads to exhaust server memory (denial of service).',
              suggestedFix: 'Set a body size limit: express.json({ limit: "1mb" })',
            });
          }
        }

        // No UUID validation on resource endpoints
        if (/req\.params\.id/.test(line)) {
          const nearbyLines = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join('\n');
          if (!/(?:isValidUUID|uuid|^[0-9a-f-]{36}|validate|isValid|parseInt)/.test(nearbyLines)) {
            findings.push({
              id: '',
              severity: 'medium',
              vulnerabilityClass: 'input-validation',
              file: file.filePath,
              line: i + 1,
              title: 'req.params.id used without validation',
              description: 'A route parameter (req.params.id) is used without apparent validation — could allow injection or invalid lookups.',
              attackScenario: 'An attacker could pass malformed IDs to trigger unexpected behavior or SQL/NoSQL injection.',
              suggestedFix: 'Validate req.params.id against expected format (e.g., UUID regex or parseInt) before use.',
            });
          }
        }

        // Missing length validation on stored user input
        if (/(?:INSERT|db\.put|db\.create|\.save\(|\.insert\()/.test(line) && /req\.body/.test(line)) {
          const nearbyLines = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 3)).join('\n');
          if (!/\.length/.test(nearbyLines)) {
            findings.push({
              id: '',
              severity: 'low',
              vulnerabilityClass: 'input-validation',
              file: file.filePath,
              line: i + 1,
              title: 'User input stored without length validation',
              description: 'User input from req.body is stored to a database without apparent length validation.',
              attackScenario: 'An attacker could store extremely long strings to waste storage or cause display issues.',
              suggestedFix: 'Add length validation before storing user input: if (input.length > MAX_LENGTH) return res.status(400)...',
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

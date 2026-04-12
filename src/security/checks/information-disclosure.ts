import { readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding } from '../types.js';

const SKIP_DIRS = ['node_modules/', 'dist/', '.git/', '.wrangler/', 'src/security/checks/'];

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(d => filePath.includes(d));
}

export async function checkInformationDisclosure(
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

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) continue;

        // Stack traces in API responses
        if (/res\.(?:json|send)\s*\(\s*\{[^}]*err\.stack/.test(line) ||
            /res\.(?:json|send)\s*\(\s*\{[^}]*stack\s*:/.test(line)) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'information-disclosure',
            file: file.filePath,
            line: i + 1,
            title: 'Stack trace in API response',
            description: 'Error stack trace is included in an API response — exposes internal code paths and dependencies.',
            attackScenario: 'An attacker could use stack traces to map internal code structure, identify frameworks, and find vulnerable code paths.',
            suggestedFix: 'Log stack traces to stderr and return a generic error message to clients: res.json({ error: "Internal server error" })',
          });
        }

        // Env var enumeration
        if (/console\.(?:log|error|warn)\s*\(\s*process\.env\s*\)/.test(line) ||
            /Object\.keys\s*\(\s*process\.env\s*\)/.test(line)) {
          findings.push({
            id: '',
            severity: 'low',
            vulnerabilityClass: 'information-disclosure',
            file: file.filePath,
            line: i + 1,
            title: 'Environment variable enumeration',
            description: 'Entire process.env object is logged or enumerated — may expose secrets in log output.',
            attackScenario: 'An attacker with log access could see all environment variables including API keys and database credentials.',
            suggestedFix: 'Only log specific environment variable names (not values) when needed for debugging.',
          });
        }

        // Token in error message
        if (/`[^`]*(?:clone|fetch|pull|push)[^`]*\$\{.*(?:url|token|key|auth).*\}`/i.test(line)) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'information-disclosure',
            file: file.filePath,
            line: i + 1,
            title: 'Potential credential in error/log message',
            description: 'A URL or token may be interpolated into an error or log message — could expose credentials.',
            attackScenario: 'An attacker with log access could extract credentials from logged URLs containing embedded tokens.',
            suggestedFix: 'Sanitize URLs before logging: strip query parameters and embedded credentials.',
          });
        }

        // Debug logs with sensitive values
        if (/console\.(?:log|debug|info)\s*\(.*(?:token|password|secret|key|auth|credential)/i.test(line)) {
          // Skip lines that are just logging the variable name
          if (!/['"].*(?:token|password|secret|key|auth).*['"]/.test(line)) {
            findings.push({
              id: '',
              severity: 'low',
              vulnerabilityClass: 'information-disclosure',
              file: file.filePath,
              line: i + 1,
              title: 'Debug log may contain sensitive value',
              description: 'A console.log statement references a variable with a sensitive name (token, password, secret, key, auth).',
              attackScenario: 'An attacker with log access could extract sensitive values from debug output.',
              suggestedFix: 'Remove debug logging of sensitive values, or use a structured logger that redacts sensitive fields.',
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

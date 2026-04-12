import { readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding } from '../types.js';

const SKIP_DIRS = ['node_modules/', 'dist/', '.git/', '.wrangler/', 'src/security/checks/'];

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(d => filePath.includes(d));
}

function isAuthRelatedFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return /(?:auth|session|token|jwt|oauth|login|passport)/.test(lower);
}

export async function checkAuth(
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
      const isAuthFile = isAuthRelatedFile(file.filePath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) continue;

        // Fail-open catch blocks
        if (/catch\s*\([^)]*\)\s*\{/.test(line)) {
          const catchBlock = lines.slice(i, Math.min(lines.length, i + 5)).join('\n');
          if (/(?:next\s*\(|return\s+true|resolve\s*\(\s*true\s*\))/.test(catchBlock)) {
            findings.push({
              id: '',
              severity: 'medium',
              vulnerabilityClass: 'auth',
              file: file.filePath,
              line: i + 1,
              title: 'Fail-open catch block may bypass authentication',
              description: 'A catch block that calls next(), returns true, or resolves true could bypass auth checks when an error occurs.',
              attackScenario: 'An attacker could trigger an error condition (e.g., malformed token) to bypass authentication.',
              suggestedFix: 'Ensure catch blocks deny access by default. Return false, call next(err), or throw.',
            });
          }
        }

        // Token in URL query parameter
        if (/[?&](?:token|session|key|auth)=/.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'auth',
            file: file.filePath,
            line: i + 1,
            title: 'Credential in URL query parameter',
            description: 'Token, session, or auth key passed as a URL query parameter.',
            attackScenario: 'URL query parameters are logged in server access logs, browser history, and referrer headers — exposing credentials.',
            suggestedFix: 'Send credentials in Authorization headers or secure HTTP-only cookies instead.',
          });
        }

        // Math.random in auth-related files
        if (/Math\.random\(\)/.test(line) && isAuthFile) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'auth',
            file: file.filePath,
            line: i + 1,
            title: 'Math.random() used in auth-related file',
            description: 'Math.random() is not cryptographically secure and should not be used for tokens, session IDs, or any security value.',
            attackScenario: 'An attacker could predict Math.random() output and forge tokens or session IDs.',
            suggestedFix: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive values.',
          });
        }

        // Missing JWT expiry — check for jwt.verify without expiresIn nearby
        if (/jwt\.verify\s*\(/.test(line)) {
          const nearbyLines = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 11)).join('\n');
          if (!/(?:expiresIn|exp\s*:|maxAge)/.test(nearbyLines)) {
            findings.push({
              id: '',
              severity: 'medium',
              vulnerabilityClass: 'auth',
              file: file.filePath,
              line: i + 1,
              title: 'JWT verification without expiry check',
              description: 'jwt.verify called without expiresIn or exp option nearby — tokens may never expire.',
              attackScenario: 'A stolen JWT could be used indefinitely if it has no expiration.',
              suggestedFix: 'Set expiresIn when signing and verify exp claim during verification.',
            });
          }
        }

        // OAuth state not cleared
        if (/state.*cookie/i.test(line)) {
          const nearbyLines = lines.slice(i, Math.min(lines.length, i + 10)).join('\n');
          if (!/(?:maxAge.*0|clearCookie|delete.*state)/i.test(nearbyLines)) {
            findings.push({
              id: '',
              severity: 'low',
              vulnerabilityClass: 'auth',
              file: file.filePath,
              line: i + 1,
              title: 'OAuth state cookie not cleared after use',
              description: 'OAuth state parameter stored in cookie may not be cleared after consumption.',
              attackScenario: 'A stale state cookie could be replayed in a CSRF attack against the OAuth flow.',
              suggestedFix: 'Clear the state cookie immediately after successful validation.',
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

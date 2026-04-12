import { readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding } from '../types.js';

const SKIP_DIRS = ['node_modules/', 'dist/', '.git/', '.wrangler/', 'src/security/checks/'];

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(d => filePath.includes(d));
}

function isFrontendFile(filePath: string): boolean {
  return /\.(?:tsx|jsx|html)$/.test(filePath);
}

export async function checkFrontend(
  files: ParsedFile[],
  projectRoot: string
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  try {
    for (const file of files) {
      if (shouldSkip(file.filePath)) continue;
      if (!isFrontendFile(file.filePath)) continue;

      let content: string;
      try {
        content = readFileSync(join(projectRoot, file.filePath), 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('{/*')) continue;

        // dangerouslySetInnerHTML
        if (/dangerouslySetInnerHTML/.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'frontend-xss',
            file: file.filePath,
            line: i + 1,
            title: 'dangerouslySetInnerHTML usage',
            description: 'dangerouslySetInnerHTML renders raw HTML — bypasses React\'s XSS protections.',
            attackScenario: 'An attacker could inject malicious HTML/JavaScript if user input reaches dangerouslySetInnerHTML.',
            suggestedFix: 'Sanitize HTML with DOMPurify before rendering, or use React components instead of raw HTML.',
          });
        }

        // innerHTML assignment
        if (/\.innerHTML\s*=/.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'frontend-xss',
            file: file.filePath,
            line: i + 1,
            title: 'innerHTML assignment',
            description: 'Direct innerHTML assignment renders raw HTML without sanitization.',
            attackScenario: 'An attacker could inject malicious scripts through user-controlled content assigned to innerHTML.',
            suggestedFix: 'Use textContent for plain text, or sanitize with DOMPurify before setting innerHTML.',
          });
        }

        // document.write
        if (/document\.write\s*\(/.test(line)) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'frontend-xss',
            file: file.filePath,
            line: i + 1,
            title: 'document.write() usage',
            description: 'document.write() can introduce XSS vulnerabilities and degrades performance.',
            attackScenario: 'An attacker could inject scripts through user input that reaches document.write().',
            suggestedFix: 'Use DOM manipulation methods (createElement, appendChild) instead of document.write().',
          });
        }

        // Missing noopener on target="_blank"
        if (/target\s*=\s*["']_blank["']/.test(line)) {
          const fullLine = line;
          if (!/rel\s*=\s*["'][^"']*noopener[^"']*["']/.test(fullLine)) {
            findings.push({
              id: '',
              severity: 'low',
              vulnerabilityClass: 'frontend-xss',
              file: file.filePath,
              line: i + 1,
              title: 'Missing rel="noopener" on target="_blank"',
              description: 'Links with target="_blank" without rel="noopener noreferrer" give the opened page access to window.opener.',
              attackScenario: 'The opened page could use window.opener to redirect the original page to a phishing site.',
              suggestedFix: 'Add rel="noopener noreferrer" to all links with target="_blank".',
            });
          }
        }

        // Sensitive data in localStorage/sessionStorage
        if (/(?:localStorage|sessionStorage)\.setItem\s*\([^)]*(?:token|password|secret|key|auth)/i.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'frontend-xss',
            file: file.filePath,
            line: i + 1,
            title: 'Sensitive data stored in browser storage',
            description: 'A sensitive value (token, password, secret, key, auth) is stored in localStorage or sessionStorage.',
            attackScenario: 'Any XSS vulnerability would allow an attacker to read all localStorage/sessionStorage data, including sensitive tokens.',
            suggestedFix: 'Use secure HTTP-only cookies for sensitive tokens instead of browser storage.',
          });
        }
      }
    }
  } catch {
    // Don't crash the entire scan
  }

  return findings;
}

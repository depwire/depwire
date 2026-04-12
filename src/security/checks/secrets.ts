import { readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding, Severity } from '../types.js';

const SKIP_DIRS = ['node_modules/', 'dist/', '.git/', '.wrangler/', 'src/security/checks/'];
const TEST_PATTERNS = ['test', 'spec', 'fixture', 'mock', '__tests__', '__mocks__', '.example', '.sample'];

interface SecretPattern {
  pattern: RegExp;
  title: string;
  severity: Severity;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // API Keys
  { pattern: /sk-[a-zA-Z0-9]{32,}/, title: 'OpenAI API Key', severity: 'critical' },
  { pattern: /AKIA[0-9A-Z]{16}/, title: 'AWS Access Key', severity: 'critical' },
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, title: 'Stripe Live Key', severity: 'critical' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, title: 'GitHub Personal Token', severity: 'critical' },
  { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, title: 'Private Key', severity: 'critical' },

  // Hardcoded passwords/secrets
  { pattern: /password\s*=\s*['"][^'"]{4,}['"]/, title: 'Hardcoded Password', severity: 'high' },
  { pattern: /secret\s*=\s*['"][^'"]{4,}['"]/, title: 'Hardcoded Secret', severity: 'high' },
  { pattern: /salt\s*=\s*['"][^'"]{4,}['"]/, title: 'Hardcoded Salt', severity: 'high' },
  { pattern: /api_key\s*=\s*['"][^'"]{4,}['"]/, title: 'Hardcoded API Key', severity: 'high' },
  { pattern: /token\s*=\s*['"][^'"]{8,}['"]/, title: 'Hardcoded Token', severity: 'high' },

  // Weak but not critical
  { pattern: /Math\.random\(\).*(?:token|session|id|key|secret)/i, title: 'Math.random() for Security Value', severity: 'high' },
];

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(d => filePath.includes(d));
}

function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return TEST_PATTERNS.some(p => lower.includes(p));
}

export async function checkSecrets(
  files: ParsedFile[],
  projectRoot: string
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  try {
    for (const file of files) {
      if (shouldSkip(file.filePath) || isTestFile(file.filePath)) continue;

      let content: string;
      try {
        content = readFileSync(join(projectRoot, file.filePath), 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comment lines
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#') || line.trimStart().startsWith('*')) {
          continue;
        }

        for (const sp of SECRET_PATTERNS) {
          if (sp.pattern.test(line)) {
            findings.push({
              id: '',
              severity: sp.severity,
              vulnerabilityClass: 'secrets',
              file: file.filePath,
              line: i + 1,
              title: sp.title,
              description: `Potential ${sp.title.toLowerCase()} detected in source code.`,
              attackScenario: 'An attacker with source code access could extract credentials and use them to access external services or escalate privileges.',
              suggestedFix: 'Move secrets to environment variables or a secrets manager. Never commit secrets to source control.',
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

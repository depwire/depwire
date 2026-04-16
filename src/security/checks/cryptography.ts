import { readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding, Severity } from '../types.js';

const SKIP_DIRS = ['node_modules/', 'dist/', '.git/', '.wrangler/', 'src/security/checks/'];

const USER_INPUT_NAMES = /(?:input|user|name|path|query|param|request|body|args|url)/i;

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(d => filePath.includes(d));
}

function isAuthOrCryptoFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return /(?:auth|password|crypto|hash|session|token|jwt)/.test(lower);
}

export async function checkCryptography(
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
      const isCryptoFile = isAuthOrCryptoFile(file.filePath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) continue;

        // Weak hash algorithms
        if (/createHash\s*\(\s*['"]md5['"]\s*\)/.test(line) || /hashlib\.md5\s*\(/.test(line) || /MessageDigest\.getInstance\s*\(\s*["']MD5["']\s*\)/.test(line)) {
          findings.push({
            id: '',
            severity: isCryptoFile ? 'high' : 'medium',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Weak hash algorithm: MD5',
            description: 'MD5 is cryptographically broken — collisions can be generated in seconds.',
            attackScenario: 'An attacker could generate MD5 collisions to bypass integrity checks or forge password hashes.',
            suggestedFix: 'Use SHA-256 or SHA-3 for integrity checks. Use bcrypt, scrypt, or argon2 for password hashing.',
          });
        }

        if (/createHash\s*\(\s*['"]sha1['"]\s*\)/.test(line) || /hashlib\.sha1\s*\(/.test(line) || /MessageDigest\.getInstance\s*\(\s*["']SHA-?1["']\s*\)/.test(line)) {
          findings.push({
            id: '',
            severity: isCryptoFile ? 'high' : 'medium',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Weak hash algorithm: SHA-1',
            description: 'SHA-1 has known collision attacks (SHAttered) — should not be used for security purposes.',
            attackScenario: 'An attacker could generate SHA-1 collisions to bypass integrity checks.',
            suggestedFix: 'Use SHA-256 or SHA-3 for integrity checks. Use bcrypt, scrypt, or argon2 for password hashing.',
          });
        }

        // Java weak cipher: DES
        if (/Cipher\.getInstance\s*\(\s*["']DES/.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Weak cipher algorithm: DES',
            description: 'DES uses a 56-bit key and can be brute-forced in hours.',
            attackScenario: 'An attacker could brute-force DES-encrypted data to reveal plaintext.',
            suggestedFix: 'Use AES-256 with GCM mode: Cipher.getInstance("AES/GCM/NoPadding")',
          });
        }

        // Java log injection
        if (/(?:log|logger|LOG)\s*\.\s*(?:info|debug|warn|error|trace)\s*\([^)]*\+/.test(line)) {
          if (USER_INPUT_NAMES.test(line)) {
            findings.push({
              id: '',
              severity: 'medium',
              vulnerabilityClass: 'cryptography',
              file: file.filePath,
              line: i + 1,
              title: 'Potential log injection',
              description: 'User-controlled input concatenated directly into log output.',
              attackScenario: 'An attacker could inject newlines or control characters to forge log entries or hide malicious activity.',
              suggestedFix: 'Use parameterized logging: log.info("User: {}", userInput) instead of string concatenation.',
            });
          }
        }

        // Math.random in crypto-related files
        if (/Math\.random\(\)/.test(line) && isCryptoFile) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Math.random() in cryptography-related file',
            description: 'Math.random() is not cryptographically secure — its output can be predicted.',
            attackScenario: 'An attacker could predict Math.random() values to forge tokens, nonces, or other security-critical random values.',
            suggestedFix: 'Use crypto.randomBytes() or crypto.getRandomValues() for cryptographic purposes.',
          });
        }

        // Missing HTTPS (not localhost or 127.)
        if (/(?:fetch|axios\.(?:get|post|put|delete|patch)|http\.request)\s*\(\s*['"]http:\/\/(?!(?:localhost|127\.))/i.test(line)) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'HTTP used instead of HTTPS',
            description: 'An HTTP (not HTTPS) URL is used for an external request — data is transmitted unencrypted.',
            attackScenario: 'An attacker on the network path could intercept, read, or modify data in transit (man-in-the-middle).',
            suggestedFix: 'Use HTTPS for all external requests to ensure data confidentiality and integrity.',
          });
        }

        // Hardcoded salt in pbkdf2
        if (/pbkdf2/.test(line) && /['"][a-zA-Z0-9+/=]{8,}['"]/.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Hardcoded salt in key derivation',
            description: 'A hardcoded salt is used with PBKDF2 — all users share the same salt.',
            attackScenario: 'An attacker could precompute rainbow tables with the known salt to crack all passwords at once.',
            suggestedFix: 'Generate a unique random salt per user using crypto.randomBytes(16).',
          });
        }
      }
    }
  } catch {
    // Don't crash the entire scan
  }

  return findings;
}

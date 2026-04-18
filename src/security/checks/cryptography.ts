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

        // C++ weak random: rand() for security-sensitive operations
        if (/\brand\s*\(\s*\)/.test(line) && isCryptoFile) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Weak random: rand() in security context',
            description: 'rand() is not cryptographically secure — its output can be predicted.',
            attackScenario: 'An attacker could predict rand() values to forge tokens or bypass security checks.',
            suggestedFix: 'Use std::random_device or platform-specific CSPRNG (e.g., /dev/urandom, BCryptGenRandom).',
          });
        }

        // C++ hardcoded credentials
        if (/(?:const\s+(?:char|std::string)\s*\*?\s*(?:password|secret|api_key|apiKey|token)\s*=\s*["'])/i.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Hardcoded credentials in C++ source',
            description: 'A password, secret, or API key is hardcoded as a string literal.',
            attackScenario: 'An attacker with access to the binary or source could extract the credential.',
            suggestedFix: 'Load credentials from environment variables or a secure vault at runtime.',
          });
        }

        // Kotlin hardcoded credentials
        if (/(?:val|var)\s+(?:password|secret|apiKey|api_key|token)\s*=\s*["']/i.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Hardcoded credentials in Kotlin source',
            description: 'A password, secret, or API key is hardcoded as a string literal.',
            attackScenario: 'An attacker with access to the binary or source could extract the credential.',
            suggestedFix: 'Load credentials from environment variables or a secure vault at runtime.',
          });
        }

        // Kotlin insecure random
        if (/\bRandom\s*\(\s*\)/.test(line) && isCryptoFile) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Insecure random in Kotlin security context',
            description: 'kotlin.random.Random() is not cryptographically secure — its output can be predicted.',
            attackScenario: 'An attacker could predict random values to forge tokens or bypass security checks.',
            suggestedFix: 'Use java.security.SecureRandom for cryptographic purposes.',
          });
        }

        // Kotlin not-null assertion abuse near security code
        if (/!!\s*\./.test(line) && isCryptoFile) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Not-null assertion (!!) in security-sensitive Kotlin code',
            description: 'The !! operator can throw NullPointerException, potentially bypassing security checks.',
            attackScenario: 'An attacker could trigger a null value to cause an exception that bypasses validation logic.',
            suggestedFix: 'Use safe calls (?.) with proper null handling instead of !! assertions.',
          });
        }

        // Kotlin hardcoded HTTP URL
        if (/(?:val|var)\s+\w*[Uu]rl\w*\s*=\s*["']http:\/\/(?!(?:localhost|127\.))/.test(line)) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Hardcoded HTTP URL in Kotlin source',
            description: 'An HTTP (not HTTPS) URL is hardcoded — data is transmitted unencrypted.',
            attackScenario: 'An attacker on the network path could intercept, read, or modify data in transit.',
            suggestedFix: 'Use HTTPS for all external URLs to ensure data confidentiality and integrity.',
          });
        }

        // PHP weak crypto patterns
        if (/\bmd5\s*\(/.test(line) && /password|passwd|pass|pwd/i.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'PHP md5() used for password hashing',
            description: 'md5() is cryptographically broken and should never be used for password hashing.',
            attackScenario: 'An attacker could crack MD5 password hashes in seconds using rainbow tables or GPU brute force.',
            suggestedFix: 'Use password_hash() with PASSWORD_BCRYPT or PASSWORD_ARGON2ID.',
          });
        }

        if (/\bsha1\s*\(/.test(line) && /password|passwd|pass|pwd/i.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'PHP sha1() used for password hashing',
            description: 'SHA-1 has known collision attacks and should not be used for password hashing.',
            attackScenario: 'An attacker could crack SHA-1 password hashes using precomputed tables.',
            suggestedFix: 'Use password_hash() with PASSWORD_BCRYPT or PASSWORD_ARGON2ID.',
          });
        }

        if (/\bcrypt\s*\(\s*[^,]+,\s*['"][\$]?[12a-zA-Z]{0,3}['"]/.test(line)) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'PHP crypt() with potentially weak salt',
            description: 'crypt() with a short or weak salt may use DES or MD5 algorithm.',
            attackScenario: 'An attacker could crack weakly-salted crypt() hashes using brute force.',
            suggestedFix: 'Use password_hash() instead of crypt(). It automatically uses a strong algorithm and salt.',
          });
        }

        if (/\bmcrypt_/.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'PHP deprecated mcrypt_* function',
            description: 'mcrypt extension was deprecated in PHP 7.1 and removed in PHP 7.2. It has known vulnerabilities.',
            attackScenario: 'An attacker could exploit known weaknesses in mcrypt implementations.',
            suggestedFix: 'Use openssl_encrypt()/openssl_decrypt() or the sodium extension (sodium_crypto_*).',
          });
        }

        if (/\b(?:rand|mt_rand)\s*\(/.test(line) && isCryptoFile) {
          findings.push({
            id: '',
            severity: 'medium',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'PHP rand()/mt_rand() in security context',
            description: 'rand() and mt_rand() are not cryptographically secure — their output can be predicted.',
            attackScenario: 'An attacker could predict random values to forge tokens or bypass security checks.',
            suggestedFix: 'Use random_bytes() or random_int() for cryptographic purposes.',
          });
        }

        // PHP hardcoded credentials
        if (/\$(?:password|secret|api_?key|token)\s*=\s*['"][^'"]{4,}['"]/i.test(line)) {
          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'cryptography',
            file: file.filePath,
            line: i + 1,
            title: 'Hardcoded credentials in PHP source',
            description: 'A password, secret, or API key is hardcoded as a string literal.',
            attackScenario: 'An attacker with access to the source could extract the credential.',
            suggestedFix: 'Load credentials from environment variables using getenv() or $_ENV.',
          });
        }
      }
    }
  } catch {
    // Don't crash the entire scan
  }

  return findings;
}

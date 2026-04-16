import { readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding, Severity } from '../types.js';

const SKIP_DIRS = ['node_modules/', 'dist/', '.git/', '.wrangler/', 'src/security/checks/'];
const TEST_PATTERNS = ['test', 'spec', 'fixture', 'mock', '__tests__', '__mocks__'];

interface InjectionPattern {
  regex: RegExp;
  title: string;
  vulnClass: 'shell-injection' | 'code-injection';
  baseSeverity: Severity;
  description: string;
  attackScenario: string;
  suggestedFix: string;
}

const USER_INPUT_NAMES = /(?:input|user|name|path|query|branch|hash|cmd|command|req\.|params|body|args|url|dir|file|subdirectory)/i;

const PATTERNS: InjectionPattern[] = [
  {
    regex: /execSync\s*\(\s*`[^`]*\$\{/,
    title: 'Shell Injection via execSync template literal',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'execSync called with a template literal containing interpolated values — potential RCE.',
    attackScenario: 'An attacker could inject shell metacharacters through the interpolated variable to execute arbitrary commands.',
    suggestedFix: 'Use execFileSync with an argument array instead of string interpolation, or validate input with a strict allowlist regex.',
  },
  {
    regex: /exec\s*\(\s*`[^`]*\$\{/,
    title: 'Shell Injection via exec template literal',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'exec called with a template literal containing interpolated values — potential RCE.',
    attackScenario: 'An attacker could inject shell metacharacters through the interpolated variable.',
    suggestedFix: 'Use execFile with an argument array instead of string interpolation.',
  },
  {
    regex: /spawn\s*\([^)]*,\s*\[[^\]]*(?:input|user|path|query|cmd|command|args|req\.|params|body)/i,
    title: 'Potentially unsafe spawn with user-controlled arguments',
    vulnClass: 'shell-injection',
    baseSeverity: 'medium',
    description: 'spawn called with arguments that may originate from user input.',
    attackScenario: 'An attacker could inject malicious arguments to the spawned process.',
    suggestedFix: 'Validate all arguments against a strict allowlist before passing to spawn.',
  },
  {
    regex: /subprocess\.run\s*\([^)]*shell\s*=\s*True/,
    title: 'Python shell=True in subprocess.run',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'subprocess.run called with shell=True — command string is executed through the shell.',
    attackScenario: 'An attacker could inject shell metacharacters if user input reaches the command string.',
    suggestedFix: 'Use shell=False (default) and pass arguments as a list.',
  },
  {
    regex: /os\.system\s*\(/,
    title: 'Python os.system() call',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'os.system() executes a command string through the shell.',
    attackScenario: 'An attacker could inject shell metacharacters if user input reaches the command string.',
    suggestedFix: 'Use subprocess.run with shell=False and pass arguments as a list.',
  },
  {
    regex: /eval\s*\(/,
    title: 'eval() usage detected',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'eval() executes arbitrary code from a string.',
    attackScenario: 'An attacker could inject malicious code if user input reaches eval().',
    suggestedFix: 'Remove eval() and use safe alternatives (JSON.parse for data, specific parsers for expressions).',
  },
  {
    regex: /new\s+Function\s*\(/,
    title: 'new Function() constructor',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'new Function() creates a function from a string — equivalent to eval().',
    attackScenario: 'An attacker could inject malicious code if user input reaches the Function constructor.',
    suggestedFix: 'Remove new Function() and use a safe alternative.',
  },
  {
    regex: /fmt\.Sprintf\s*\([^)]*(?:SELECT|INSERT|UPDATE|DELETE)/i,
    title: 'Go SQL injection via fmt.Sprintf',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'SQL query built using fmt.Sprintf — vulnerable to SQL injection.',
    attackScenario: 'An attacker could inject SQL through interpolated values to read or modify database data.',
    suggestedFix: 'Use parameterized queries with ? or $1 placeholders instead of string formatting.',
  },
  {
    regex: /db\.Query\s*\(\s*fmt\.Sprintf/,
    title: 'Go SQL injection via db.Query with fmt.Sprintf',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Database query built using fmt.Sprintf directly passed to db.Query.',
    attackScenario: 'An attacker could inject SQL through interpolated values.',
    suggestedFix: 'Use parameterized queries: db.Query("SELECT ... WHERE id = ?", id)',
  },
  // Java-specific injection patterns
  {
    regex: /(?:executeQuery|executeUpdate|execute)\s*\(\s*["']?\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*["']?\s*\+/i,
    title: 'Java SQL injection via string concatenation',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'SQL query built using string concatenation — vulnerable to SQL injection.',
    attackScenario: 'An attacker could inject SQL through concatenated user input to read, modify, or delete database data.',
    suggestedFix: 'Use PreparedStatement with parameterized queries: preparedStatement.setString(1, userInput)',
  },
  {
    regex: /Runtime\.getRuntime\(\)\.exec\s*\(/,
    title: 'Java command injection via Runtime.exec',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'Runtime.exec() executes a system command — vulnerable if user input reaches the argument.',
    attackScenario: 'An attacker could inject shell metacharacters to execute arbitrary commands on the server.',
    suggestedFix: 'Use ProcessBuilder with an argument array. Validate all input against a strict allowlist.',
  },
  {
    regex: /new\s+ProcessBuilder\s*\([^)]*(?:input|user|param|query|request|body|arg)/i,
    title: 'Java command injection via ProcessBuilder with user input',
    vulnClass: 'shell-injection',
    baseSeverity: 'medium',
    description: 'ProcessBuilder called with arguments that may originate from user input.',
    attackScenario: 'An attacker could inject malicious arguments to the spawned process.',
    suggestedFix: 'Validate all arguments against a strict allowlist before passing to ProcessBuilder.',
  },
  {
    regex: /new\s+ObjectInputStream\s*\(/,
    title: 'Java insecure deserialization via ObjectInputStream',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'ObjectInputStream.readObject() deserializes arbitrary Java objects — potential RCE.',
    attackScenario: 'An attacker could craft a malicious serialized object to achieve remote code execution.',
    suggestedFix: 'Use a whitelist-based ObjectInputFilter, or switch to JSON/Protobuf for data exchange.',
  },
  {
    regex: /DocumentBuilderFactory\.newInstance\(\)/,
    title: 'Java XML External Entity (XXE) risk',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'DocumentBuilderFactory without FEATURE_SECURE_PROCESSING may allow XXE attacks.',
    attackScenario: 'An attacker could inject external entity references in XML to read server files or perform SSRF.',
    suggestedFix: 'Set FEATURE_SECURE_PROCESSING and disable external DTDs/entities: factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)',
  },
  {
    regex: /\.csrf\(\)\s*\.\s*disable\(\)/,
    title: 'Spring Security CSRF protection disabled',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'CSRF protection has been explicitly disabled in Spring Security configuration.',
    attackScenario: 'An attacker could forge cross-site requests to perform actions on behalf of authenticated users.',
    suggestedFix: 'Only disable CSRF for stateless APIs using JWT. Keep CSRF enabled for session-based authentication.',
  },
  {
    regex: /\.permitAll\(\).*(?:admin|manage|delete|config|setting)/i,
    title: 'Spring Security permitAll on sensitive path',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'permitAll() applied to a path that appears security-sensitive.',
    attackScenario: 'An attacker could access administrative or destructive endpoints without authentication.',
    suggestedFix: 'Use .hasRole("ADMIN") or .authenticated() for sensitive endpoints.',
  },
  // C++ injection patterns
  {
    regex: /\b(?:strcpy|strcat|sprintf|gets)\s*\(/,
    title: 'C++ buffer overflow risk: unsafe string function',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'Unsafe C string functions (strcpy, strcat, sprintf, gets) with no bounds checking — buffer overflow risk.',
    attackScenario: 'An attacker could provide oversized input to overflow the buffer, enabling arbitrary code execution.',
    suggestedFix: 'Use bounded alternatives: strncpy, strncat, snprintf, or C++ std::string.',
  },
  {
    regex: /printf\s*\(\s*(?!")[a-zA-Z_]\w*/,
    title: 'C++ format string vulnerability',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'printf called with a variable as the format string — format string attack risk.',
    attackScenario: 'An attacker could inject format specifiers (%x, %n) to read/write arbitrary memory.',
    suggestedFix: 'Always use a literal format string: printf("%s", userInput).',
  },
  {
    regex: /\bsystem\s*\(\s*(?!")[a-zA-Z_]\w*/,
    title: 'C++ command injection via system()',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'system() called with a variable argument — potential command injection.',
    attackScenario: 'An attacker could inject shell metacharacters to execute arbitrary commands.',
    suggestedFix: 'Avoid system(). Use execvp with an argument array, or validate input with a strict allowlist.',
  },
  {
    regex: /\bpopen\s*\(\s*(?!")[a-zA-Z_]\w*/,
    title: 'C++ command injection via popen()',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'popen() called with a variable argument — potential command injection.',
    attackScenario: 'An attacker could inject shell metacharacters to execute arbitrary commands.',
    suggestedFix: 'Avoid popen(). Use pipe/fork/exec with argument arrays instead.',
  },
];

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(d => filePath.includes(d));
}

function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return TEST_PATTERNS.some(p => lower.includes(p));
}

export async function checkInjection(
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

        // Skip comment lines and security-reviewed lines
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#') || line.trimStart().startsWith('*')) {
          continue;
        }
        if (line.includes('depwire-security-reviewed')) continue;

        for (const pattern of PATTERNS) {
          if (pattern.regex.test(line)) {
            // Check if interpolated value looks like user input for severity elevation
            let severity = pattern.baseSeverity;
            if (severity === 'medium' && USER_INPUT_NAMES.test(line)) {
              severity = 'high';
            }

            findings.push({
              id: '',
              severity,
              vulnerabilityClass: pattern.vulnClass,
              file: file.filePath,
              line: i + 1,
              title: pattern.title,
              description: pattern.description,
              attackScenario: pattern.attackScenario,
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

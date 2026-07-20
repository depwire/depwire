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
  // Python cursor.execute SQL injection (only flag when building SQL unsafely)
  {
    regex: /cursor\s*\.\s*execute\s*\(\s*f["']/,
    title: 'Python SQL injection via cursor.execute with f-string',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'cursor.execute() called with an f-string — user input interpolated directly into SQL.',
    attackScenario: 'An attacker could inject SQL through interpolated variables to read, modify, or delete database data.',
    suggestedFix: 'Use parameterized queries: cursor.execute("SELECT ... WHERE id = %s", (user_id,))',
  },
  {
    regex: /cursor\s*\.\s*execute\s*\(\s*["'].*["']\s*\+/,
    title: 'Python SQL injection via cursor.execute with string concatenation',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'cursor.execute() called with string concatenation — vulnerable to SQL injection.',
    attackScenario: 'An attacker could inject SQL through concatenated user input to read, modify, or delete database data.',
    suggestedFix: 'Use parameterized queries: cursor.execute("SELECT ... WHERE id = %s", (user_id,))',
  },
  {
    regex: /cursor\s*\.\s*execute\s*\(\s*["'][^"']*%s[^"']*["']\s*%\s/,
    title: 'Python SQL injection via cursor.execute with % formatting',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'cursor.execute() called with Python %-formatting for SQL — vulnerable to SQL injection.',
    attackScenario: 'An attacker could inject SQL through the formatted values.',
    suggestedFix: 'Use parameterized queries: cursor.execute("SELECT ... WHERE id = %s", (user_id,)) — pass params as the second argument, not via % operator.',
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
  // Kotlin injection patterns
  {
    regex: /["']SELECT\b[^"']*\$(?:\{|\w)/,
    title: 'Kotlin SQL injection via string template',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'SQL query built using Kotlin string templates — vulnerable to SQL injection.',
    attackScenario: 'An attacker could inject SQL through interpolated variables to read, modify, or delete database data.',
    suggestedFix: 'Use parameterized queries with PreparedStatement or your ORM\'s query builder.',
  },
  {
    regex: /["'](?:INSERT|UPDATE|DELETE)\b[^"']*\$(?:\{|\w)/,
    title: 'Kotlin SQL injection via string template',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'SQL mutation query built using Kotlin string templates — vulnerable to SQL injection.',
    attackScenario: 'An attacker could inject SQL through interpolated variables.',
    suggestedFix: 'Use parameterized queries with PreparedStatement or your ORM\'s query builder.',
  },
  {
    regex: /Runtime\.getRuntime\(\)\.exec\s*\(/,
    title: 'Kotlin/Java command injection via Runtime.exec',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'Runtime.exec() executes a system command — vulnerable if user input reaches the argument.',
    attackScenario: 'An attacker could inject shell metacharacters to execute arbitrary commands on the server.',
    suggestedFix: 'Use ProcessBuilder with an argument array. Validate all input against a strict allowlist.',
  },
  {
    regex: /\.csrf\(\)\s*\.?\s*disable\(\)/,
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
  // PHP injection patterns
  {
    regex: /\$wpdb\s*->\s*query\s*\(\s*["'][^"']*\$|.*\$wpdb\s*->\s*query\s*\(\s*[^"']*\.\s*\$/,
    title: 'PHP SQL injection via $wpdb->query with string concatenation',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'WordPress $wpdb->query() called with direct variable interpolation — vulnerable to SQL injection.',
    attackScenario: 'An attacker could inject SQL through unescaped user input to read, modify, or delete database data.',
    suggestedFix: 'Use $wpdb->prepare() with placeholders: $wpdb->query($wpdb->prepare("SELECT * FROM table WHERE id = %d", $id))',
  },
  {
    regex: /\beval\s*\(\s*\$/,
    title: 'PHP eval() with variable input',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'eval() executes arbitrary PHP code from a variable — potential RCE.',
    attackScenario: 'An attacker could inject malicious PHP code if user input reaches eval().',
    suggestedFix: 'Remove eval() entirely. Use safe alternatives like json_decode() for data or specific parsers.',
  },
  {
    regex: /\b(?:system|exec|shell_exec|passthru)\s*\(\s*\$/,
    title: 'PHP command injection via system/exec/shell_exec/passthru',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'Shell command execution with a variable argument — potential command injection.',
    attackScenario: 'An attacker could inject shell metacharacters to execute arbitrary commands on the server.',
    suggestedFix: 'Use escapeshellarg() and escapeshellcmd() to sanitize input, or avoid shell commands entirely.',
  },
  {
    regex: /preg_replace\s*\(\s*['"]\/[^'"]*\/e['"]/,
    title: 'PHP preg_replace with /e modifier (code execution)',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'preg_replace() with the /e modifier evaluates the replacement as PHP code — deprecated and dangerous.',
    attackScenario: 'An attacker could inject PHP code through the matched string to achieve remote code execution.',
    suggestedFix: 'Use preg_replace_callback() instead of the /e modifier.',
  },
  {
    regex: /\bunserialize\s*\(\s*\$(?:_GET|_POST|_REQUEST|_COOKIE)/,
    title: 'PHP insecure deserialization of user input',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'unserialize() called on user-controlled superglobal input — potential RCE via PHP object injection.',
    attackScenario: 'An attacker could craft a malicious serialized PHP object to achieve remote code execution.',
    suggestedFix: 'Use json_decode() instead of unserialize() for user input. If unserialize is necessary, use the allowed_classes option.',
  },
  {
    regex: /\bextract\s*\(\s*\$(?:_GET|_POST|_REQUEST)/,
    title: 'PHP extract() on superglobal input',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'extract() on $_GET/$_POST/$_REQUEST overwrites local variables — can bypass security checks.',
    attackScenario: 'An attacker could set arbitrary variables by crafting request parameters, potentially overwriting auth flags or config values.',
    suggestedFix: 'Avoid extract() on user input. Access superglobals directly or use a whitelist of expected keys.',
  },
  // Swift injection patterns
  {
    regex: /["'](?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*\\\(/,
    title: 'Swift SQL injection via string interpolation',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'SQL query built using Swift string interpolation — vulnerable to SQL injection.',
    attackScenario: 'An attacker could inject SQL through interpolated variables to read, modify, or delete database data.',
    suggestedFix: 'Use parameterized queries with your database library (e.g., Fluent ORM, SQLite.swift bindings).',
  },
  {
    regex: /Process\s*\(\s*\)/,
    title: 'Swift command injection via Process class',
    vulnClass: 'shell-injection',
    baseSeverity: 'medium',
    description: 'Process() class executes external commands — vulnerable if user input reaches arguments.',
    attackScenario: 'An attacker could inject shell metacharacters to execute arbitrary commands on the server.',
    suggestedFix: 'Validate all arguments against a strict allowlist before passing to Process. Avoid shell execution.',
  },
  {
    regex: /Unsafe(?:Raw|Mutable|Buffer)?Pointer/,
    title: 'Swift unsafe pointer usage',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'Unsafe pointer usage bypasses Swift memory safety — potential for memory corruption.',
    attackScenario: 'An attacker could exploit unsafe pointer operations to corrupt memory or execute arbitrary code.',
    suggestedFix: 'Prefer safe Swift alternatives. If unsafe pointers are necessary, validate all bounds and lifetimes.',
  },
  {
    regex: /UserDefaults\s*\.\s*(?:standard\s*\.\s*)?set\s*\([^)]*(?:password|secret|token|apiKey|api_key)/i,
    title: 'Swift sensitive data in UserDefaults (unencrypted)',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Sensitive data stored in UserDefaults without encryption — easily accessible on jailbroken devices.',
    attackScenario: 'An attacker with device access could read UserDefaults plist to extract credentials.',
    suggestedFix: 'Use Keychain Services for storing sensitive data. Never store passwords or tokens in UserDefaults.',
  },
  // Mojo injection patterns
  {
    regex: /\bPointer\s*\[\s*\w+\s*\]/,
    title: 'Mojo unsafe Pointer[T] usage',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'Mojo Pointer[T] bypasses memory safety — potential for memory corruption or buffer overflow.',
    attackScenario: 'An attacker could exploit unsafe pointer operations to corrupt memory or execute arbitrary code.',
    suggestedFix: 'Use safe Mojo abstractions (SIMD, Tensor) instead of raw pointers where possible. Validate bounds.',
  },
  {
    regex: /\bDTypePointer\b/,
    title: 'Mojo unsafe DTypePointer usage',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'DTypePointer provides raw memory access without bounds checking.',
    attackScenario: 'An attacker could exploit unvalidated pointer operations for buffer overflow or memory corruption.',
    suggestedFix: 'Use Tensor or SIMD types with bounds checking instead of raw DTypePointer.',
  },
  {
    regex: /from\s+python\s+import.*\beval\b/,
    title: 'Mojo Python interop: eval() imported',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Python eval() imported via Mojo Python interop — can execute arbitrary code.',
    attackScenario: 'An attacker could inject malicious code strings executed through the Python bridge.',
    suggestedFix: 'Avoid importing eval. Use safe parsing alternatives or validate all input strictly.',
  },
  {
    regex: /\b__get_address_as_lvalue\b/,
    title: 'Mojo uninitialized memory access pattern',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'Low-level memory access without initialization — potential for use of uninitialized data.',
    attackScenario: 'An attacker could exploit uninitialized memory to leak data or corrupt program state.',
    suggestedFix: 'Always initialize memory before use. Use safe constructors and value semantics.',
  },
  {
    regex: /SIMD\s*\[[^\]]*\]\s*\.\s*(?:store|load)\s*\(/,
    title: 'Mojo SIMD store/load without bounds check',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'SIMD store/load operations without explicit bounds checking — buffer overflow risk.',
    attackScenario: 'An attacker could trigger out-of-bounds SIMD operations to corrupt memory.',
    suggestedFix: 'Validate buffer size against SIMD width before store/load operations.',
  },
  // Ruby injection patterns
  {
    regex: /(?:where|find_by_sql|execute)\s*\(\s*["'][^"']*#\{/,
    title: 'Ruby string interpolation in database query method',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Database query built with string interpolation — values are not parameterized.',
    attackScenario: 'An attacker could manipulate interpolated values to alter query logic.',
    suggestedFix: 'Use parameterized queries: Model.where("column = ?", value) or ActiveRecord query interface.',
  },
  {
    regex: /`[^`]*#\{/,
    title: 'Ruby backtick command with string interpolation',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'Backtick command execution with interpolated values — potential for unintended command execution.',
    attackScenario: 'An attacker could inject shell metacharacters through the interpolated variable.',
    suggestedFix: 'Use Open3.capture3 with separate arguments instead of backtick interpolation.',
  },
  {
    regex: /\b(?:system|exec)\s*\(\s*["'][^"']*#\{/,
    title: 'Ruby system/exec with string interpolation',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'system() or exec() called with interpolated string — potential for unintended command execution.',
    attackScenario: 'An attacker could inject shell metacharacters through the interpolated variable.',
    suggestedFix: 'Use system() with separate arguments: system("cmd", arg1, arg2) instead of string interpolation.',
  },
  {
    regex: /%x\{[^}]*#\{/,
    title: 'Ruby %x{} command with string interpolation',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: '%x{} command execution with interpolated values — potential for unintended command execution.',
    attackScenario: 'An attacker could inject shell metacharacters through the interpolated variable.',
    suggestedFix: 'Use Open3.capture3 with separate arguments instead of %x{} interpolation.',
  },
  {
    regex: /\beval\s*\(\s*(?!['"])/,
    title: 'Ruby eval() with dynamic input',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'eval() executes arbitrary Ruby code from a variable — potential for unintended code execution.',
    attackScenario: 'An attacker could inject malicious code if user input reaches eval().',
    suggestedFix: 'Remove eval() and use safe alternatives (JSON.parse for data, specific parsers for expressions).',
  },
  {
    regex: /\b(?:instance_eval|class_eval)\s*\(\s*(?!['"])/,
    title: 'Ruby instance_eval/class_eval with dynamic input',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'instance_eval/class_eval executes code in object context — dangerous with dynamic input.',
    attackScenario: 'An attacker could inject code that executes with elevated privileges in the object context.',
    suggestedFix: 'Use instance_exec with a block instead of string evaluation.',
  },
  {
    regex: /\b(?:send|public_send)\s*\(\s*(?:params|request|input|user)/i,
    title: 'Ruby send/public_send with user-controlled method name',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'send() called with user-controlled method name — could invoke unintended methods.',
    attackScenario: 'An attacker could call arbitrary methods on the receiver by controlling the method name.',
    suggestedFix: 'Validate the method name against a strict allowlist before passing to send().',
  },
  {
    regex: /File\.(?:read|write|delete|open)\s*\(\s*(?:params|request|input|user)/i,
    title: 'Ruby file operation with user-controlled path',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'File operation with user-controlled path — potential for unintended file access.',
    attackScenario: 'An attacker could traverse directories to access or modify arbitrary files.',
    suggestedFix: 'Validate and sanitize file paths. Use File.expand_path and check against an allowed directory.',
  },
  {
    regex: /YAML\.load\s*\(\s*(?!.*safe)/i,
    title: 'Ruby YAML.load with potentially unsafe input',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'YAML.load can instantiate arbitrary Ruby objects — potential for unintended code execution.',
    attackScenario: 'An attacker could craft a YAML payload that instantiates dangerous objects during deserialization.',
    suggestedFix: 'Use YAML.safe_load instead of YAML.load to restrict allowed classes.',
  },
  {
    regex: /Marshal\.load\s*\(/,
    title: 'Ruby Marshal.load with potentially unsafe data',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Marshal.load deserializes arbitrary Ruby objects — potential for unintended code execution.',
    attackScenario: 'An attacker could craft a marshaled payload that executes code during deserialization.',
    suggestedFix: 'Use JSON.parse or MessagePack for data exchange. Never Marshal.load untrusted data.',
  },
  {
    regex: /ERB\.new\s*\(\s*(?:params|request|input|user)/i,
    title: 'Ruby ERB template with user-controlled input',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'ERB template created from user input — potential for unintended code execution via template injection.',
    attackScenario: 'An attacker could inject ERB tags to execute arbitrary Ruby code on the server.',
    suggestedFix: 'Never pass user input directly to ERB.new. Use parameterized templates with safe escaping.',
  },
  // Dart injection patterns
  {
    regex: /(?:rawQuery|rawInsert|rawUpdate|rawDelete)\s*\(\s*['"`].*\$/,
    title: 'Dart database query with string interpolation',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Database query constructed with string interpolation — potential for unintended query modification.',
    attackScenario: 'An attacker could modify the query via interpolated variables to access or modify data.',
    suggestedFix: 'Use parameterized queries with positional arguments instead of string interpolation.',
  },
  {
    regex: /Process\s*\.\s*(?:run|start|runSync)\s*\(/,
    title: 'Dart process execution',
    vulnClass: 'shell-injection',
    baseSeverity: 'medium',
    description: 'System process execution — verify arguments are validated before use.',
    attackScenario: 'An attacker could inject unexpected arguments if user input reaches process arguments.',
    suggestedFix: 'Validate all process arguments against a strict allowlist. Avoid passing user input directly.',
  },
  {
    regex: /import\s+['"]dart:mirrors['"]/,
    title: 'Dart runtime reflection usage',
    vulnClass: 'code-injection',
    baseSeverity: 'low',
    description: 'dart:mirrors import — deprecated and unavailable in AOT-compiled code.',
    attackScenario: 'Mirror-based reflection can invoke arbitrary methods at runtime if not properly constrained.',
    suggestedFix: 'Remove dart:mirrors usage. Use code generation (build_runner) for reflection-like features.',
  },
  {
    regex: /(?:File|Directory)\s*\(\s*(?:\$|.*\+\s*(?:request|input|params|user|query))/i,
    title: 'Dart file operation with dynamic path',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'File system operation with dynamically constructed path — verify path validation.',
    attackScenario: 'An attacker could access unintended files by controlling parts of the file path.',
    suggestedFix: 'Validate and canonicalize paths. Ensure the resolved path stays within the intended directory.',
  },
  {
    regex: /jsonDecode\s*\(\s*(?:response|body|data|input|request)/,
    title: 'Dart JSON decoding of external input',
    vulnClass: 'input-validation',
    baseSeverity: 'low',
    description: 'JSON decoding of external input without schema validation — consider adding type checks.',
    attackScenario: 'Unexpected JSON structure could cause runtime errors or logic issues.',
    suggestedFix: 'Add type validation after jsonDecode. Consider using json_serializable for typed deserialization.',
  },
  {
    regex: /JavascriptChannel\s*\(\s*name\s*:/,
    title: 'Dart WebView JavaScript channel',
    vulnClass: 'input-validation',
    baseSeverity: 'medium',
    description: 'WebView JavaScript channel — verify message origin and content validation.',
    attackScenario: 'Malicious web content could send unexpected messages through the JavaScript channel.',
    suggestedFix: 'Validate message origin and content. Apply strict input validation on received messages.',
  },
  {
    regex: /SharedPreferences.*(?:setString|setInt)\s*\(\s*['"](?:token|password|secret|key|api_key|auth)/i,
    title: 'Dart sensitive data in unencrypted storage',
    vulnClass: 'information-disclosure',
    baseSeverity: 'medium',
    description: 'Sensitive value stored in unencrypted SharedPreferences — consider encrypted storage.',
    attackScenario: 'Device backup or root access could expose stored sensitive values.',
    suggestedFix: 'Use flutter_secure_storage or encrypted_shared_preferences for sensitive data.',
  },
  // R patterns
  {
    regex: /(?:dbGetQuery|dbSendQuery|dbExecute)\s*\([^,]+,\s*paste0?\s*\(/,
    title: 'R database query with string concatenation',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Database query constructed via paste/paste0 — potential for unintended query modification.',
    attackScenario: 'An attacker could modify the query by controlling concatenated variables.',
    suggestedFix: 'Use parameterized queries with DBI::dbGetQuery(con, sql, params=list(...)) or glue_sql().',
  },
  {
    regex: /(?:system|system2|shell)\s*\(\s*paste0?\s*\(/,
    title: 'R system command with string concatenation',
    vulnClass: 'shell-injection',
    baseSeverity: 'high',
    description: 'System command constructed via string concatenation — potential for unintended command execution.',
    attackScenario: 'An attacker could inject shell metacharacters through concatenated variables.',
    suggestedFix: 'Use system2() with separate command and args parameters. Validate all inputs with a strict allowlist.',
  },
  {
    regex: /eval\s*\(\s*parse\s*\(\s*text\s*=/,
    title: 'R dynamic code evaluation via eval(parse(text=...))',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Dynamic code evaluation from text — potential for unintended code execution.',
    attackScenario: 'An attacker could inject R code if the text value is user-controlled.',
    suggestedFix: 'Avoid eval(parse(text=...)). Use switch statements, match.arg(), or lookup tables instead.',
  },
  {
    regex: /(?:readRDS|unserialize)\s*\(\s*(?:input|url|con|request|user|upload)/i,
    title: 'R deserialization of untrusted data',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Deserialization of potentially untrusted data — R objects can contain executable closures.',
    attackScenario: 'An attacker could craft a malicious RDS file containing harmful closures.',
    suggestedFix: 'Validate the source of RDS files. Prefer JSON or CSV for untrusted data exchange.',
  },
  {
    regex: /file\.path\s*\(\s*.*(?:input\$|params|request|user|query)/i,
    title: 'R file path with user-controlled component',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'File path constructed with user-controlled input — verify path validation.',
    attackScenario: 'An attacker could access unintended files by controlling parts of the file path.',
    suggestedFix: 'Validate and normalize file paths. Ensure resolved path stays within the intended directory.',
  },
  {
    regex: /(?:dbGetQuery|dbExecute|system|system2)\s*\([^)]*input\$/,
    title: 'R Shiny input used directly in sensitive operation',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Shiny user input passed directly to a sensitive operation without validation.',
    attackScenario: 'An attacker could provide crafted input through the Shiny UI to execute unintended operations.',
    suggestedFix: 'Validate and sanitize all input$ values before use in database queries or system calls.',
  },
  {
    regex: /HTML\s*\(\s*(?:input\$|paste0?\s*\(.*input\$)/,
    title: 'R Shiny HTML rendering with user input',
    vulnClass: 'code-injection',
    baseSeverity: 'medium',
    description: 'User input rendered as raw HTML in Shiny without escaping — potential for content manipulation.',
    attackScenario: 'An attacker could inject HTML/script content through the Shiny input.',
    suggestedFix: 'Use htmltools::htmlEscape() on user input before passing to HTML(). Or use textOutput() instead.',
  },
  {
    regex: /reticulate::py_run_string\s*\(\s*paste0?\s*\(/,
    title: 'R reticulate with dynamically constructed Python code',
    vulnClass: 'code-injection',
    baseSeverity: 'high',
    description: 'Python code constructed via string concatenation passed to reticulate — potential for unintended execution.',
    attackScenario: 'An attacker could inject Python code through concatenated R variables.',
    suggestedFix: 'Use reticulate::py_run_file() with static scripts, or pass data via r_to_py() instead of string building.',
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

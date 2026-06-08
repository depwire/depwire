/**
 * REST detector — finds Spring Boot inbound routes and Java HTTP-client outbound calls.
 *
 * Inbound (already partly handled by depwire's existing rest-api detector, but reproduced
 * here so we own the metadata shape and apply class-level prefix resolution per service):
 *   - @GetMapping / @PostMapping / @PutMapping / @DeleteMapping / @PatchMapping
 *   - @RequestMapping(value = "/x", method = RequestMethod.GET)
 *   - JAX-RS @Path / @GET / @POST / ...
 *
 * Outbound:
 *   - RestTemplate.exchange / getForObject / postForObject / put / delete / ...
 *   - WebClient.get().uri(...).retrieve() chain
 *   - @FeignClient(name = "service-x", url = "...") interfaces with @RequestMapping
 *
 * Spring property placeholders are resolved against the per-service PropertyResolver.
 */

import type { Channel } from '../types.js';
import type { SourceFile } from '../file-walker.js';
import type { PropertyResolver } from '../property-resolver.js';
import { ExpressionResolver, extractCallArguments } from './expression-resolver.js';

const HTTP_METHOD_ANNOTATIONS = ['Get', 'Post', 'Put', 'Delete', 'Patch'] as const;

export function detectRestChannels(
  serviceName: string,
  files: SourceFile[],
  resolver: PropertyResolver,
): Channel[] {
  const channels: Channel[] = [];
  const exprResolver = new ExpressionResolver(resolver, files);
  for (const file of files) {
    detectInbound(serviceName, file, channels);
    detectOutbound(serviceName, file, resolver, exprResolver, channels);
  }
  return channels;
}

// ---------------- inbound ----------------

function detectInbound(
  serviceName: string,
  file: SourceFile,
  out: Channel[],
): void {
  const lines = file.content.split(/\r?\n/);
  const classPrefix = findClassRequestMappingPrefix(file.content);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // @GetMapping("/path") / @PostMapping("/path") / etc.
    for (const method of HTTP_METHOD_ANNOTATIONS) {
      const re = new RegExp(`@${method}Mapping\\s*\\(\\s*(?:value\\s*=\\s*|path\\s*=\\s*)?["']([^"']+)["']`);
      const m = line.match(re);
      if (m) {
        out.push({
          serviceName,
          kind: 'rest',
          direction: 'inbound',
          identifier: normalizePath(joinPath(classPrefix, m[1])),
          httpMethod: method.toUpperCase(),
          filePath: file.relativePath,
          line: i + 1,
          confidence: 'high',
          metadata: { framework: 'spring-mvc', annotation: `@${method}Mapping` },
        });
      }

      // @GetMapping (no path) → maps to class prefix
      if (new RegExp(`@${method}Mapping\\s*$`).test(line)) {
        if (classPrefix) {
          out.push({
            serviceName,
            kind: 'rest',
            direction: 'inbound',
            identifier: normalizePath(classPrefix),
            httpMethod: method.toUpperCase(),
            filePath: file.relativePath,
            line: i + 1,
            confidence: 'medium',
            metadata: { framework: 'spring-mvc', annotation: `@${method}Mapping` },
          });
        }
      }
    }

    // @RequestMapping(value = "/path", method = RequestMethod.GET)
    const reqM = line.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/);
    if (reqM) {
      const methodMatch = line.match(/method\s*=\s*RequestMethod\.(GET|POST|PUT|DELETE|PATCH)/);
      const httpMethod = methodMatch ? methodMatch[1] : 'ANY';
      // Skip class-level @RequestMapping (it's the prefix itself); detect by absence of method= and class context.
      // Heuristic: if next non-empty line starts with "public class" or "@Controller" was nearby, skip.
      if (!isLikelyClassLevel(lines, i)) {
        out.push({
          serviceName,
          kind: 'rest',
          direction: 'inbound',
          identifier: normalizePath(joinPath(classPrefix, reqM[1])),
          httpMethod,
          filePath: file.relativePath,
          line: i + 1,
          confidence: 'high',
          metadata: { framework: 'spring-mvc', annotation: '@RequestMapping' },
        });
      }
    }

    // JAX-RS: @Path("/x") class with @GET/@POST methods. Use class-level @Path.
    const jaxClass = line.match(/^\s*@Path\s*\(\s*["']([^"']+)["']\s*\)\s*$/);
    if (jaxClass && i + 1 < lines.length && /(public|abstract)\s+(?:class|interface)/.test(lines[i + 1] ?? '')) {
      // record class-level @Path? Simpler: rely on method-level detection scanning below.
    }
    const jaxMethod = line.match(/^\s*@(GET|POST|PUT|DELETE|PATCH)\s*$/);
    if (jaxMethod) {
      // Look ahead a few lines for @Path("/sub") on the method
      let methodPath = '';
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        const pm = lines[j].match(/@Path\s*\(\s*["']([^"']+)["']/);
        if (pm) { methodPath = pm[1]; break; }
      }
      const jaxClassPath = findClassPathPrefix(file.content);
      const id = normalizePath(joinPath(jaxClassPath, methodPath));
      if (id) {
        out.push({
          serviceName,
          kind: 'rest',
          direction: 'inbound',
          identifier: id,
          httpMethod: jaxMethod[1],
          filePath: file.relativePath,
          line: i + 1,
          confidence: 'high',
          metadata: { framework: 'jax-rs', annotation: `@${jaxMethod[1]}` },
        });
      }
    }
  }
}

function findClassRequestMappingPrefix(source: string): string {
  // Look for class-level @RequestMapping("/foo") immediately above a class declaration.
  const m = source.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["'][^)]*\)\s*(?:\r?\n[^\n]*)*?(?:public|abstract)?\s*class/);
  if (m) {
    let p = m[1];
    if (!p.startsWith('/')) p = '/' + p;
    if (p.endsWith('/') && p.length > 1) p = p.slice(0, -1);
    return p;
  }
  return '';
}

function findClassPathPrefix(source: string): string {
  const m = source.match(/@Path\s*\(\s*["']([^"']+)["']\s*\)\s*(?:\r?\n[^\n]*)*?(?:public|abstract)?\s*class/);
  if (m) {
    let p = m[1];
    if (!p.startsWith('/')) p = '/' + p;
    if (p.endsWith('/') && p.length > 1) p = p.slice(0, -1);
    return p;
  }
  return '';
}

function isLikelyClassLevel(lines: string[], i: number): boolean {
  // Look ahead 3 lines for "class" or "interface" declaration.
  for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
    if (/\b(class|interface)\s+\w+/.test(lines[j])) return true;
  }
  return false;
}

// ---------------- outbound ----------------

function detectOutbound(
  serviceName: string,
  file: SourceFile,
  resolver: PropertyResolver,
  exprResolver: ExpressionResolver,
  out: Channel[],
): void {
  // Pre-collect SpEL maps and local assignments so identifiers like `url`,
  // computed at runtime from `urlPrefix + id + "/" + flag`, resolve correctly.
  const spelMaps = exprResolver.collectSpelMapsForFile(file.content);
  const locals = exprResolver.collectLocalAssignments(file.content, spelMaps);

  // Configuration of all REST-client call patterns we recognize. Each pattern
  // captures the HTTP method and the URL/URI argument as the first call argument.
  const patterns: Array<{
    re: RegExp;
    methodFrom: 'group' | 'name';
    methodMap?: Record<string, string>;
    methodGroup?: number;
  }> = [
    // RestTemplate.exchange(url, HttpMethod.X, ...)
    {
      re: /\b\w*[Rr]estTemplate\b\s*\.\s*exchange\s*\(/g,
      methodFrom: 'name',
      methodMap: { exchange: 'ANY' },
    },
    // RestTemplate.<methodForObject>(url, ...) shortcuts
    {
      re: /\b\w*[Rr]estTemplate\b\s*\.\s*(getForObject|getForEntity|postForObject|postForEntity|postForLocation|put|delete|patchForObject)\s*\(/g,
      methodFrom: 'group',
      methodGroup: 1,
      methodMap: REST_TEMPLATE_METHOD_MAP,
    },
    // WebClient.<method>().uri(url)
    {
      re: /\b\w*[Ww]ebClient\b\s*\.\s*(get|post|put|delete|patch)\s*\(\s*\)\s*\.\s*uri\s*\(/g,
      methodFrom: 'group',
      methodGroup: 1,
      methodMap: { get: 'GET', post: 'POST', put: 'PUT', delete: 'DELETE', patch: 'PATCH' },
    },
    // WebClient.method(HttpMethod.X).uri(url)
    {
      re: /\b\w*[Ww]ebClient\b\s*\.\s*method\s*\(\s*HttpMethod\.(GET|POST|PUT|DELETE|PATCH)\s*\)\s*\.\s*uri\s*\(/g,
      methodFrom: 'group',
      methodGroup: 1,
    },
    // bss-web-services-invoker (Charter standard wrapper)
    {
      re: /\bweb[Ss]ervices?[Ii]nvoker\b\s*\.\s*(get|post|put|delete|patch|invoke)\s*\(/g,
      methodFrom: 'group',
      methodGroup: 1,
      methodMap: { get: 'GET', post: 'POST', put: 'PUT', delete: 'DELETE', patch: 'PATCH', invoke: 'ANY' },
    },
  ];

  for (const pat of patterns) {
    let match;
    while ((match = pat.re.exec(file.content)) !== null) {
      const offset = match.index + match[0].length;
      const args = extractCallArguments(file.content, offset);
      if (args.length === 0) continue;

      // Method resolution.
      let httpMethod: string;
      if (pat.methodFrom === 'group' && pat.methodGroup !== undefined) {
        const captured = match[pat.methodGroup];
        httpMethod = pat.methodMap?.[captured] ?? captured.toUpperCase();
      } else {
        // For exchange, look at the second argument: HttpMethod.X
        const secondArg = args[1] ?? '';
        const m = secondArg.match(/HttpMethod\.(GET|POST|PUT|DELETE|PATCH)/);
        httpMethod = m?.[1] ?? 'ANY';
      }

      const lineNo = file.content.slice(0, match.index).split(/\r?\n/).length;
      const urlExpr = args[0];

      // Resolve the URL expression. Use the shared ExpressionResolver so that
      // string-concatenation, local variables, @Value fields, and class-static
      // constants are all handled consistently across detectors.
      const resolved = resolveUrlExpression(urlExpr, file.content, exprResolver, locals, spelMaps);
      if (!resolved) continue;

      for (const url of toArray(resolved)) {
        emitOutbound(out, serviceName, file, lineNo, urlExpr, url, httpMethod);
      }
    }
  }

  detectFeignClients(serviceName, file, resolver, out);
}

const REST_TEMPLATE_METHOD_MAP: Record<string, string> = {
  getForObject: 'GET',
  getForEntity: 'GET',
  postForObject: 'POST',
  postForEntity: 'POST',
  postForLocation: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patchForObject: 'PATCH',
  exchange: 'ANY',
};

function emitOutbound(
  out: Channel[],
  serviceName: string,
  file: SourceFile,
  line: number,
  rawExpr: string,
  resolvedUrl: string,
  httpMethod: string,
): void {
  // A resolved URL may be a full URL, an absolute path, or a partially-
  // resolved string with leftover ${unresolved} placeholders. Extract both
  // the path and the host (if present) so the matcher can use either.
  const { path, host } = splitUrl(resolvedUrl);
  const identifier = path ? normalizePath(path) : resolvedUrl;
  if (!path && !host) return;

  out.push({
    serviceName,
    kind: 'rest',
    direction: 'outbound',
    identifier,
    httpMethod,
    filePath: file.relativePath,
    line,
    rawValue: rawExpr.trim(),
    confidence: resolvedUrl.includes('${') ? 'low' : 'high',
    metadata: {
      framework: 'rest-client',
      resolvedUrl,
      ...(host ? { targetHost: host } : {}),
    },
  });
}

/**
 * Resolve a URL expression that may include string concatenation and runtime
 * variables. For concatenation, we resolve each piece individually and stitch
 * the result together. Identifier pieces that cannot be resolved are kept as
 * `${name}` markers so that the resolved string still encodes the structure
 * (and the matcher can extract the path prefix).
 */
function resolveUrlExpression(
  expr: string,
  fileContent: string,
  exprResolver: ExpressionResolver,
  locals: Map<string, string | string[]>,
  spelMaps: Map<string, Map<string, string>>,
): string | string[] | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  // First try the shared resolver — handles literals, identifiers backed by
  // local assignments, @Value fields, and constants.
  const direct = exprResolver.resolve(trimmed, fileContent, locals, spelMaps);
  if (direct !== null) return direct;

  // Fall back to manual concatenation handling for `"a" + foo + "/b"` etc.
  if (trimmed.includes('+')) {
    const parts = splitConcat(trimmed);
    const resolvedParts: string[] = [];
    for (const part of parts) {
      const r = exprResolver.resolve(part, fileContent, locals, spelMaps);
      if (Array.isArray(r)) {
        // Pick the first deterministic candidate for the prefix; concat with
        // multi-value expansion would be excessive. The matcher operates on
        // the URL prefix anyway.
        resolvedParts.push(r[0] ?? `\${${part}}`);
      } else if (typeof r === 'string') {
        resolvedParts.push(r);
      } else {
        // Use a placeholder marker so we preserve URL structure.
        resolvedParts.push(`\${${part}}`);
      }
    }
    return resolvedParts.join('');
  }

  return null;
}

/**
 * Split a Java string-concatenation expression on `+`, respecting paren depth
 * and quoted strings. `"a/" + (foo + bar) + "/x"` → `["\"a/\"", "(foo + bar)", "\"/x\""]`.
 */
function splitConcat(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote: string | null = null;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (inQuote) {
      if (ch === '\\') { i++; continue; }
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") inQuote = ch;
    else if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    else if (ch === '+' && depth === 0) {
      parts.push(expr.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(expr.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * Split a URL into path + host. Both are returned when the URL is a full
 * `http(s)://host/path` form; only `path` is returned for absolute paths;
 * only `host` is returned when no path is present.
 */
function splitUrl(url: string): { path: string | null; host: string | null } {
  const httpMatch = url.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/);
  if (httpMatch) {
    return {
      host: stripPort(httpMatch[1]),
      path: httpMatch[2] ? httpMatch[2].split(/[?#]/)[0] : null,
    };
  }
  if (url.startsWith('/')) return { host: null, path: url.split(/[?#]/)[0] };
  return { host: null, path: null };
}

function stripPort(host: string): string {
  const i = host.indexOf(':');
  return i === -1 ? host : host.slice(0, i);
}

function toArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

// ---------------- Feign ----------------

function detectFeignClients(
  serviceName: string,
  file: SourceFile,
  resolver: PropertyResolver,
  out: Channel[],
): void {
  const content = file.content;
  // Find @FeignClient annotations with their associated interface and methods.
  // A Feign client = one interface, possibly several @GetMapping/@PostMapping methods.

  const feignAnnotation = /@FeignClient\s*\(([^)]*)\)/g;
  let fc;
  while ((fc = feignAnnotation.exec(content)) !== null) {
    const annoArgs = fc[1];
    const nameMatch = annoArgs.match(/name\s*=\s*["']([^"']+)["']/);
    const valueMatch = annoArgs.match(/value\s*=\s*["']([^"']+)["']/);
    const urlMatch = annoArgs.match(/url\s*=\s*["']([^"']+)["']/);
    const pathMatch = annoArgs.match(/path\s*=\s*["']([^"']+)["']/);

    const targetName = (nameMatch?.[1] || valueMatch?.[1] || '').trim();
    const baseUrl = urlMatch ? resolver.resolve(urlMatch[1]) : '';
    const basePath = pathMatch ? resolver.resolve(pathMatch[1]) : '';

    // Find the interface declaration that immediately follows.
    const tail = content.slice(fc.index);
    const ifaceMatch = tail.match(/(?:public\s+)?interface\s+(\w+)\s*\{([\s\S]*?)\n\}/);
    if (!ifaceMatch) continue;

    const body = ifaceMatch[2];
    const lines = body.split(/\r?\n/);
    let methodOffset = content.slice(0, fc.index + ifaceMatch.index!).split(/\r?\n/).length;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const method of HTTP_METHOD_ANNOTATIONS) {
        const m = line.match(
          new RegExp(`@${method}Mapping\\s*\\(\\s*(?:value\\s*=\\s*|path\\s*=\\s*)?["']([^"']+)["']`),
        );
        if (m) {
          const path = joinPath(joinPath(basePath, ''), m[1]);
          out.push({
            serviceName,
            kind: 'rest',
            direction: 'outbound',
            identifier: normalizePath(path),
            httpMethod: method.toUpperCase(),
            filePath: file.relativePath,
            line: methodOffset + i + 1,
            rawValue: line.trim(),
            confidence: 'high',
            metadata: {
              framework: 'feign',
              targetService: targetName,
              baseUrl: baseUrl,
            },
          });
        }
      }
      // @RequestMapping
      const rm = line.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/);
      if (rm) {
        const httpMethodMatch = line.match(/method\s*=\s*RequestMethod\.(GET|POST|PUT|DELETE|PATCH)/);
        const path = joinPath(joinPath(basePath, ''), rm[1]);
        out.push({
          serviceName,
          kind: 'rest',
          direction: 'outbound',
          identifier: normalizePath(path),
          httpMethod: httpMethodMatch ? httpMethodMatch[1] : 'ANY',
          filePath: file.relativePath,
          line: methodOffset + i + 1,
          rawValue: line.trim(),
          confidence: 'high',
          metadata: {
            framework: 'feign',
            targetService: targetName,
            baseUrl: baseUrl,
          },
        });
      }
    }
  }
}

// ---------------- helpers ----------------

function joinPath(prefix: string, suffix: string): string {
  if (!prefix) return suffix.startsWith('/') ? suffix : '/' + suffix;
  if (!suffix) return prefix;
  const a = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const b = suffix.startsWith('/') ? suffix : '/' + suffix;
  return a + b;
}

/**
 * Normalize URI templates and trailing slashes for cross-service matching.
 * "/api/users/{id}" → "/api/users/__PARAM__"
 */
function normalizePath(path: string): string {
  let p = path.split(/[?#]/)[0];
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  p = p.replace(/\{[^}]+\}/g, '__PARAM__');
  p = p.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '__PARAM__');
  return p;
}

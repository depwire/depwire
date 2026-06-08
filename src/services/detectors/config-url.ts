/**
 * Configured-URL detector.
 *
 * Some service-to-service references are not made through a recognized HTTP
 * client call (`restTemplate.exchange(...)`, `webClient.get()...`). Instead a
 * service holds a URL in configuration and uses it to build a string — for
 * example, embedding a callback URL, deep link, webhook target, or redirect
 * into outbound payload/message data that is later acted on by another system
 * or a human (clicking a link, a browser redirect, an async callback).
 *
 * Because the URL is only ever concatenated into a string and never passed to
 * an HTTP-client method, the REST-client detector cannot see it. This detector
 * instead scans each service's OWN resolved configuration for URL-valued
 * properties and emits an outbound REST channel for the URL's path, so the
 * cross-service matcher can link it to the route that owns it (by host and/or
 * path, including any gateway/ingress prefix).
 *
 * Fully framework-agnostic: it works off resolved Spring property values, so
 * any `*.url`, `*.endpoint`, `*Prefix`, callback/webhook/redirect property that
 * resolves to an http(s) URL or an absolute path is considered. The result is
 * tagged with framework "configured-url" and medium confidence so consumers
 * can distinguish it from direct HTTP-client calls.
 *
 * Deterministic: the URL value comes straight from config; matching is host /
 * path based. No LLM, no guessing about runtime behavior beyond "this
 * configured URL targets that service's route".
 */

import type { Channel } from '../types.js';
import type { SourceFile } from '../file-walker.js';
import type { PropertyResolver } from '../property-resolver.js';

const HTTP_METHOD_HINT = /(get|post|put|delete|patch)/i;

export function detectConfiguredUrlChannels(
  serviceName: string,
  files: SourceFile[],
  resolver: PropertyResolver,
): Channel[] {
  const out: Channel[] = [];
  const urlValues = resolver.ownUrlValues();
  if (urlValues.length === 0) return out;

  for (const { key, value } of urlValues) {
    if (!isLikelyServiceUrl(key, value)) continue;

    const path = extractPath(value);
    if (!path) continue;
    if (path === '/' || path.length < 2) continue;

    const host = extractHost(value);
    // For a bare absolute path (no host) we only trust it when the key clearly
    // names a URL/endpoint/callback — otherwise it's likely a local path or
    // servlet context-path, not a cross-service reference.
    if (!host && !keyLooksLikeUrl(key)) continue;

    const site = findUsageSite(key, files);

    out.push({
      serviceName,
      kind: 'rest',
      direction: 'outbound',
      identifier: normalizePath(path),
      httpMethod: inferMethod(key) ?? 'ANY',
      filePath: site?.filePath ?? '(config)',
      line: site?.line ?? 1,
      enclosingMethod: site?.method,
      enclosingClass: site?.cls,
      rawValue: `${key}=${value}`,
      confidence: 'medium',
      metadata: {
        framework: 'configured-url',
        propertyKey: key,
        resolvedUrl: value,
        ...(host ? { targetHost: host } : {}),
      },
    });
  }

  return out;
}

/** Property-key tokens that indicate the value is a service URL/endpoint. */
const URL_KEY_HINT = /(url|uri|endpoint|host|callback|webhook|redirect|link|prefix|base-?path|api)\b/i;

/** File-system / non-HTTP indicators that should be excluded. */
const FILE_VALUE_HINT = /\.(jks|p12|pem|crt|cer|key|conf|config|properties|ya?ml|json|xml|jceks|truststore|keystore|log|jar|war)$/i;
const FILE_KEY_HINT = /(location|path|dir|directory|file|truststore|keystore|krb5|jaas|context-path|contextpath|servlet)/i;

/**
 * Decide whether a (key, resolved value) pair is a plausible cross-service
 * URL reference, as opposed to a filesystem path, certificate location,
 * servlet context-path, or other non-HTTP config.
 */
function isLikelyServiceUrl(key: string, value: string): boolean {
  // Full http(s) URL → always a network reference.
  if (/^https?:\/\//i.test(value)) return true;

  // Absolute path: exclude obvious filesystem locations.
  if (value.startsWith('/')) {
    if (FILE_VALUE_HINT.test(value)) return false;
    if (FILE_KEY_HINT.test(key)) return false;
    // Common non-route absolute paths to ignore.
    if (/^\/(app|opt|etc|var|tmp|home|usr|mnt|data)\b/i.test(value)) return false;
    return true;
  }
  return false;
}

function keyLooksLikeUrl(key: string): boolean {
  return URL_KEY_HINT.test(key) && !FILE_KEY_HINT.test(key);
}

function inferMethod(key: string): string | undefined {
  const m = key.match(HTTP_METHOD_HINT);
  return m ? m[1].toUpperCase() : undefined;
}

function extractHost(url: string): string | null {
  const m = url.match(/^https?:\/\/([^/?#:]+)/);
  return m ? m[1] : null;
}

function extractPath(url: string): string | null {
  const httpMatch = url.match(/^https?:\/\/[^/?#]+(\/[^?#]*)/);
  if (httpMatch) return stripTrailing(httpMatch[1]);
  if (url.startsWith('/')) return stripTrailing(url.split(/[?#]/)[0]);
  return null;
}

function stripTrailing(p: string): string {
  let s = p.split(/[?#]/)[0];
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function normalizePath(path: string): string {
  let p = path.split(/[?#]/)[0];
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  p = p.replace(/\{[^}]+\}/g, '__PARAM__').replace(/:[A-Za-z_]\w*/g, '__PARAM__');
  return p;
}

/**
 * Find the first source site that references the config key (via @Value or a
 * getter named after it). Best-effort, for traceability in flow output.
 */
function findUsageSite(
  key: string,
  files: SourceFile[],
): { filePath: string; line: number; method?: string; cls?: string } | undefined {
  // The Java field is usually @Value("${key}") and exposed via getXxx().
  const valueRe = new RegExp(`@Value\\s*\\(\\s*["']\\$\\{${escapeRe(key)}[^}]*\\}["']`);
  for (const f of files) {
    const idx = f.content.search(valueRe);
    if (idx !== -1) {
      const line = f.content.slice(0, idx).split(/\r?\n/).length;
      const cls = f.content.slice(0, idx).match(/(?:class|interface)\s+(\w+)[^{]*$/)?.[1]
        ?? lastClassBefore(f.content, idx);
      return { filePath: f.relativePath, line, cls };
    }
  }
  return undefined;
}

function lastClassBefore(source: string, offset: number): string | undefined {
  const re = /\b(?:class|interface|enum|record)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  let name: string | undefined;
  while ((m = re.exec(source)) !== null) {
    if (m.index > offset) break;
    name = m[1];
  }
  return name;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

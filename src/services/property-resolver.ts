/**
 * Spring property resolver — reads application.yml / application.properties
 * (and optional external config repo files) and resolves ${placeholder} tokens
 * against the discovered key/value map.
 *
 * Deterministic. No LLM.
 *
 * For external config repos that hold per-environment overrides for the same
 * key (e.g. UCC's `ucc-hub-apps-configurations` has 10+ files defining
 * `spring.cloud.stream.bindings.kafkaBasedJobConsumer-in-0.destination`), the
 * resolver collects ALL distinct values seen and exposes them via getAll().
 * resolve() / get() return the first value for back-compat.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

export class PropertyResolver {
  /** First value seen for each key (used by resolve/get). */
  public props: Map<string, string> = new Map();
  /** All distinct values seen for each key, across env files. */
  private allValues: Map<string, Set<string>> = new Map();
  /** Properties that came from the service's own config files only. */
  private ownProps: Map<string, string> = new Map();

  /**
   * Load every Spring config file under a service root and (optionally) an
   * external config repo (e.g. ucc-hub-apps-configurations).
   *
   * If `serviceName` is provided, files in external config repos that match
   * `<serviceName>*.{yml,yaml,properties}` are loaded with high priority. Files
   * for other services are still loaded to populate the value space (helps with
   * stream binding destination matching across services).
   */
  /**
   * Load every Spring config file under a service root and (optionally) an
   * external config repo (e.g. ucc-hub-apps-configurations).
   *
   * If `serviceName` is provided, files in external config repos that match
   * `<serviceName>*.{yml,yaml,properties}` are loaded with high priority. Files
   * for other services are still loaded to populate the value space (helps with
   * stream binding destination matching across services).
   *
   * If `profiles` is provided (e.g. ["prod"]), only profile-specific config
   * files matching one of those profiles are loaded from the external config
   * repo. Service-bundled `application.yml` / `application.properties` files
   * are always loaded regardless. This dramatically reduces env-fanout noise
   * when the user only cares about one environment.
   */
  load(
    serviceRoot: string,
    externalConfigRoots: string[] = [],
    serviceName?: string,
    profiles?: string[],
  ): void {
    const candidates = [
      'src/main/resources',
      'src/main/resources/config',
      'config',
    ];
    for (const rel of candidates) {
      const dir = join(serviceRoot, rel);
      if (existsSync(dir)) this.loadDirectory(dir, 0, undefined, true);
    }

    for (const ext of externalConfigRoots) {
      if (!existsSync(ext)) continue;
      // First pass: per-service files (high priority, marked as "own").
      // Apply the profile filter when provided.
      if (serviceName) {
        const filter = (file: string) =>
          fileMatchesService(file, serviceName)
          && (profiles ? fileMatchesProfile(file, profiles) : true);
        this.loadDirectory(ext, 0, filter, true);
      }
      // Second pass: everything else (populates allValues but won't override props).
      // Apply the same profile filter if set, so other-service configs from
      // wrong environments don't leak into the all-values map.
      const secondFilter = profiles
        ? (file: string) => fileMatchesProfile(file, profiles)
        : undefined;
      this.loadDirectory(ext, 0, secondFilter, false);
    }
  }

  /**
   * Resolve all ${...} placeholders in `value` using the loaded property map.
   * Falls back to the placeholder default value if any (`${foo:default}`).
   * Unknown placeholders are kept as-is.
   */
  resolve(value: string): string {
    if (!value) return value;
    let result = value;
    let safety = 5;
    while (result.includes('${') && safety-- > 0) {
      const next = result.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
        const [key, ...rest] = expr.split(':');
        const fallback = rest.length > 0 ? rest.join(':') : undefined;
        const lookup = this.props.get(key.trim());
        if (lookup !== undefined) return lookup;
        if (fallback !== undefined) return fallback;
        return _match; // keep placeholder
      });
      if (next === result) break;
      result = next;
    }
    return result;
  }

  /** Direct lookup. Returns the first value seen for this key. */
  get(key: string): string | undefined {
    return this.props.get(key);
  }

  /** Look up only properties from the service's own config files. */
  getOwn(key: string): string | undefined {
    return this.ownProps.get(key);
  }

  /**
   * Return all own-config (key, resolved-value) pairs whose value looks like a
   * URL or absolute path. Used by the configured-URL cross-service detector to
   * find URLs that point at another service's route even when the URL is never
   * passed to an HTTP client (e.g. embedded into message data).
   */
  ownUrlValues(): Array<{ key: string; value: string }> {
    const out: Array<{ key: string; value: string }> = [];
    for (const [k, v] of this.ownProps) {
      const resolved = this.resolve(v);
      if (/^https?:\/\//.test(resolved) || /^\/[A-Za-z0-9]/.test(resolved)) {
        out.push({ key: k, value: resolved });
      }
    }
    return out;
  }

  /** All distinct values seen for this key across all loaded config files. */
  getAll(key: string): string[] {
    const set = this.allValues.get(key);
    return set ? [...set] : [];
  }

  size(): number {
    return this.props.size;
  }

  /** Return all keys that match a regex (used by stream binding indexer). */
  keysMatching(pattern: RegExp): string[] {
    const keys: string[] = [];
    for (const k of this.props.keys()) {
      if (pattern.test(k)) keys.push(k);
    }
    return keys;
  }

  /** Return only own-config keys that match a regex. */
  ownKeysMatching(pattern: RegExp): string[] {
    const keys: string[] = [];
    for (const k of this.ownProps.keys()) {
      if (pattern.test(k)) keys.push(k);
    }
    return keys;
  }

  // -------------- internals --------------

  private loadDirectory(
    dir: string,
    depth = 0,
    fileFilter?: (file: string) => boolean,
    isOwn = false,
  ): void {
    if (depth > 4) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      let stats;
      try {
        stats = statSync(path);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        this.loadDirectory(path, depth + 1, fileFilter, isOwn);
        continue;
      }
      if (fileFilter && !fileFilter(entry)) continue;
      if (entry.endsWith('.yml') || entry.endsWith('.yaml')) {
        this.loadYaml(path, isOwn);
      } else if (entry.endsWith('.properties')) {
        this.loadProperties(path, isOwn);
      }
    }
  }

  private record(key: string, value: string, isOwn: boolean): void {
    if (!this.props.has(key)) this.props.set(key, value);
    if (isOwn && !this.ownProps.has(key)) this.ownProps.set(key, value);
    let set = this.allValues.get(key);
    if (!set) {
      set = new Set();
      this.allValues.set(key, set);
    }
    set.add(value);
  }

  private loadProperties(file: string, isOwn: boolean): void {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      return;
    }
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      // Strip any leading `=`/whitespace from the value to defensively handle
      // typos like `key==value` that some config files contain.
      const value = trimmed.slice(eq + 1).replace(/^[=\s]+/, '').trim();
      this.record(key, value, isOwn);
    }
  }

  /**
   * Minimal YAML flattener — handles the subset of YAML used in Spring
   * application.yml files: mappings with indentation, scalar strings, no anchors.
   * Lists are skipped.
   */
  private loadYaml(file: string, isOwn: boolean): void {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      return;
    }

    const lines = content.split(/\r?\n/);
    const stack: Array<{ indent: number; key: string }> = [];

    for (const raw of lines) {
      const stripped = raw.replace(/\t/g, '  ');
      const noComment = stripped.replace(/\s+#.*$/, '');
      if (!noComment.trim()) continue;
      if (noComment.trim().startsWith('---')) {
        stack.length = 0;
        continue;
      }
      if (/^\s*-/.test(noComment)) continue;

      const indent = noComment.match(/^ */)?.[0].length ?? 0;
      const colonIdx = noComment.indexOf(':');
      if (colonIdx === -1) continue;

      const key = noComment.slice(indent, colonIdx).trim();
      let value = noComment.slice(colonIdx + 1).trim();

      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const parentKey = stack.length > 0
        ? stack[stack.length - 1].key + '.' + key
        : key;

      if (value === '' || value === '|' || value === '>' || value === '|-' || value === '>-') {
        stack.push({ indent, key: parentKey });
      } else {
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        this.record(parentKey, value, isOwn);
      }
    }
  }
}

/**
 * Match files in an external config repo to a service name.
 *
 * Spring Cloud Config convention: `<application-name>-<profile>.{yml,properties}`.
 * In practice, repos often use shortened, prefixed, or abbreviated application
 * names (e.g. "billing-service" → files named "billing-*.properties" or
 * "myorg-billing-svc-*.properties").
 *
 * Generic strategy:
 *   1. Tokenize both names on `[-_./]+`.
 *   2. Filter out very short tokens (< 3 chars).
 *   3. Match if every significant service token has a token in the filename
 *      that *starts with* the service token, or vice versa (prefix-overlap).
 *      This handles common abbreviations (`ingestion` ↔ `ing`,
 *      `service` ↔ `svc` is too short to require a match).
 *
 * No domain-specific prefix stripping.
 */
function fileMatchesService(file: string, serviceName: string): boolean {
  const f = basename(file).toLowerCase();
  const fileTokens = tokenize(f);
  const svcTokens = tokenize(serviceName).filter(t => t.length >= 3);
  if (svcTokens.length === 0) return false;

  // Whole-name substring match (strongest signal).
  if (f.includes(serviceName.toLowerCase())) return true;

  // Every significant service token must overlap-match some file token.
  const allOverlap = svcTokens.every(s => fileTokens.some(t => prefixOverlap(s, t)));
  if (allOverlap) return true;

  // Try contiguous suffix-of-tokens (shortened name pattern, e.g.
  // "myorg-billing-api" matched by "billing-api-*.properties").
  const half = Math.max(2, Math.ceil(svcTokens.length / 2));
  for (let start = 0; start + half <= svcTokens.length; start++) {
    const slice = svcTokens.slice(start);
    if (slice.every(s => fileTokens.some(t => prefixOverlap(s, t)))) return true;
  }
  return false;
}

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\.(yml|yaml|properties)$/, '')
    .split(/[-_./]+/)
    .filter(Boolean);
}

/**
 * Generic Spring profile filter for external config files.
 *
 * Spring Cloud Config naming convention:
 *   `<application-name>-<profile>.{yml,properties}`
 *
 * A file matches a target profile when one of its dash-separated tokens equals
 * (or starts with) the profile name. This is intentionally permissive so that
 * common variants like "prod1", "prod2", "eks-prod1", "primary-prod",
 * "messagequeue-eks-prod2" all match `prod`.
 *
 * Files with no recognizable profile token (e.g. `application.properties`
 * shipped inside a service jar, which is profile-agnostic) are NOT filtered
 * here; they are always loaded by the caller via the in-tree resource scan.
 */
function fileMatchesProfile(file: string, profiles: string[]): boolean {
  const f = basename(file).toLowerCase();
  const tokens = tokenize(f);
  if (tokens.length === 0) return false;
  const targets = profiles.map(p => p.toLowerCase());
  return tokens.some(t => targets.some(p => t === p || t.startsWith(p)));
}

/**
 * Two tokens "overlap" if one is a prefix of the other and the shorter token
 * is at least 3 characters long. This catches common abbreviation patterns
 * like `ingestion` ↔ `ing`, `notification` ↔ `notif`, `management` ↔ `mgmt`
 * without hand-coding an abbreviation table.
 *
 * Note: `mgmt` is not a prefix of `management` (`mgmt` vs `manag…`), so this
 * specific abbreviation is not matched. Such purely contracted forms are rare
 * and can be handled by adding the long form as an alias in service naming.
 */
function prefixOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return longer.startsWith(shorter);
}

/**
 * Generic Java expression resolver for messaging detectors.
 *
 * Resolves a Java expression (passed as the first argument to a publish call)
 * to one or more concrete destination strings. Handles:
 *
 *   - String literals
 *   - @Value("${prop}") String fields
 *   - Class-static String constants:  ClassName.CONSTANT  or  CONSTANT
 *   - Local final String / String assignments in the same file
 *   - Maps annotated with @Value("#{${propName}}") Map<String,String>:
 *       fieldMap.get("KEY")        →  one value
 *       fieldMap.get(expr + "TAIL") →  values for keys ending in "TAIL"
 *       fieldMap.get(<dynamic>)    →  all map values (deterministic over-approx)
 *   - Getter chains:  beanRef.getXxxMapping().get(...)
 *       The bean's class is found project-wide and its `xxxMapping` field is
 *       resolved as if it were directly referenced.
 *
 * No LLM. All resolution is structural and deterministic. When the analysis
 * cannot resolve an expression, it returns null rather than guessing.
 */

import type { PropertyResolver } from '../property-resolver.js';
import type { SourceFile } from '../file-walker.js';

export class ExpressionResolver {
  private resolver: PropertyResolver;
  /** All source files in the current service, indexed by class simple name. */
  private classIndex: Map<string, SourceFile> = new Map();
  /** Project-wide constant table:  "ClassName.NAME" → value. */
  private constants: Map<string, string> = new Map();
  /** Bare constant names ("NAME" → value) — used when import is implicit. */
  private bareConstants: Map<string, string> = new Map();

  constructor(resolver: PropertyResolver, files: SourceFile[]) {
    this.resolver = resolver;
    for (const file of files) {
      this.indexClasses(file);
      this.indexConstants(file);
    }
  }

  /**
   * Resolve `expr` in the context of `fileContent` and any local variable
   * assignments already collected for the file. Returns:
   *   - a single string  → resolved to one destination
   *   - an array of strings → resolved to a finite set of candidates
   *   - null → could not resolve
   */
  resolve(
    expr: string,
    fileContent: string,
    locals: Map<string, string | string[]> = new Map(),
    spelMaps: Map<string, Map<string, string>> = new Map(),
  ): string | string[] | null {
    const trimmed = expr.trim();
    if (!trimmed) return null;

    // String literal
    const lit = trimmed.match(/^["']([^"']+)["']$/);
    if (lit) return this.resolver.resolve(lit[1]);

    // String concatenation: "a" + foo + "/b"  (top-level + only).
    // We resolve every part individually; identifier parts that cannot be
    // resolved are kept as ${name} markers so the URL/queue structure is
    // preserved for downstream matching.
    if (containsTopLevelConcat(trimmed)) {
      const parts = splitTopLevelConcat(trimmed);
      const out: string[] = [];
      for (const p of parts) {
        const r = this.resolve(p, fileContent, locals, spelMaps);
        if (Array.isArray(r)) {
          out.push(r[0] ?? `\${${p}}`);
        } else if (typeof r === 'string') {
          out.push(r);
        } else {
          out.push(`\${${p}}`);
        }
      }
      return out.join('');
    }

    // Static constant: ClassName.CONSTANT_NAME
    const dotConst = trimmed.match(/^([A-Z]\w*)\.([A-Z][A-Z0-9_]+)$/);
    if (dotConst) {
      const key = `${dotConst[1]}.${dotConst[2]}`;
      const v = this.constants.get(key);
      if (v !== undefined) return v;
    }

    // Bare constant: CONSTANT_NAME (statically imported or same class)
    const bareConst = trimmed.match(/^([A-Z][A-Z0-9_]+)$/);
    if (bareConst) {
      const v = this.bareConstants.get(bareConst[1]);
      if (v !== undefined) return v;
    }

    // mapField.get(...)  OR  bean.getMapField().get(...)
    const mapGet = trimmed.match(/^([\w.()]+)\s*\.\s*get\s*\((.*)\)$/s);
    if (mapGet) {
      const lhs = mapGet[1];
      const argExpr = mapGet[2].trim();
      const map = this.resolveMapReference(lhs, fileContent, spelMaps);
      if (!map) return null;

      // Literal key
      const keyLit = argExpr.match(/^["']([A-Z0-9_]+)["']$/);
      if (keyLit) return map.get(keyLit[1]) ?? null;

      // Concatenation that ends in a literal — try suffix-match on map keys
      const tailLit = argExpr.match(/["']([A-Z0-9_]+)["']\s*$/);
      if (tailLit) {
        const suffix = tailLit[1];
        const matching = [...map.entries()]
          .filter(([k]) => k.endsWith(suffix))
          .map(([, v]) => v);
        if (matching.length > 0) return matching;
      }

      // Dynamic key: deterministic over-approximation = all map values.
      return [...new Set(map.values())];
    }

    // Plain identifier
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      const local = locals.get(trimmed);
      if (local !== undefined) return local;

      // Local `String foo = "bar"` or `final String foo = "bar"`
      const finalAssign = fileContent.match(
        new RegExp(`(?:final\\s+)?String\\s+${trimmed}\\s*=\\s*"([^"]+)"`),
      );
      if (finalAssign) return this.resolver.resolve(finalAssign[1]);

      // @Value("${prop}") String foo
      const vm = fileContent.match(
        new RegExp(`@Value\\s*\\(\\s*["']\\$\\{([^}]+)\\}["']\\s*\\)\\s*[^;]*?\\b${trimmed}\\b`, 's'),
      );
      if (vm) {
        const propKey = vm[1].split(':')[0].trim();
        const def = vm[1].includes(':') ? vm[1].split(':').slice(1).join(':') : undefined;
        const val = this.resolver.get(propKey);
        if (val !== undefined) return this.resolver.resolve(val);
        if (def !== undefined) return this.resolver.resolve(def);
      }
    }

    // String getter chain: `beanField.getFooBar()` returning a String backed by
    // either an @Value field or a member field. Resolves via:
    //   1. Locate the bean's class via the field type in this file.
    //   2. Open the bean class file and look for `@Value(...) String fooBar;`
    //      or any direct `String fooBar` whose value can be resolved.
    const stringGetter = trimmed.match(/^(\w+)\s*\.\s*get(\w+)\s*\(\s*\)$/);
    if (stringGetter) {
      const v = this.resolveStringGetter(stringGetter[1], stringGetter[2], fileContent);
      if (v !== null) return v;
    }

    // String.format("template/%s/%d", a, b) — extract the template; the
    // %-tokens become param placeholders so the matcher's URI-template
    // wildcard logic still works.
    const formatCall = trimmed.match(/^String\s*\.\s*format\s*\(/);
    if (formatCall) {
      const innerArgs = extractCallArguments(trimmed, formatCall[0].length);
      if (innerArgs.length >= 1) {
        const tpl = this.resolve(innerArgs[0], fileContent, locals, spelMaps);
        if (typeof tpl === 'string') {
          return tpl.replace(/%[sdfboxhc]/g, '__PARAM__');
        }
      }
    }

    // <stringGetter>.replace("a", "b") — pass-through to the LHS, then apply
    // the literal replacement on each candidate. Used by some services that
    // build URLs by replacing tokens in a template.
    const replaceCall = trimmed.match(/^(.+)\.replace\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']*)["']\s*\)$/s);
    if (replaceCall) {
      const lhs = this.resolve(replaceCall[1], fileContent, locals, spelMaps);
      if (typeof lhs === 'string') {
        return lhs.split(replaceCall[2]).join(replaceCall[3]);
      }
      if (Array.isArray(lhs)) {
        return lhs.map(v => v.split(replaceCall[2]).join(replaceCall[3]));
      }
    }

    return null;
  }

  /**
   * Walk the file for `String <name> = <expr>;` assignments and follow
   * chains across passes until convergence.
   */
  collectLocalAssignments(
    fileContent: string,
    spelMaps: Map<string, Map<string, string>>,
  ): Map<string, string | string[]> {
    const out = new Map<string, string | string[]>();
    // Accumulate ALL values assigned to a variable, including the initial
    // `String x = ...;` declaration AND later reassignments `x = ...;`
    // (common when a binding/queue/topic name is conditionally switched).
    // For publish-site resolution we want the union of all possible values.
    const accum = new Map<string, Set<string>>();

    const add = (name: string, val: string | string[] | null) => {
      if (val === null) return;
      const set = accum.get(name) ?? new Set<string>();
      for (const v of Array.isArray(val) ? val : [val]) set.add(v);
      accum.set(name, set);
    };

    for (let pass = 0; pass < 5; pass++) {
      const before = JSON.stringify([...accum].map(([k, v]) => [k, [...v].sort()]));

      // Declarations: `String x = expr;` / `final String x = expr;`
      const declRe = /\b(?:final\s+)?String\s+(\w+)\s*=\s*([^;]+);/g;
      let m;
      while ((m = declRe.exec(fileContent)) !== null) {
        add(m[1], this.resolve(m[2].trim(), fileContent, snapshot(accum), spelMaps));
      }

      // Reassignments: `x = expr;` (identifier on the LHS, not a declaration,
      // not `==`/`>=`/`<=`/`!=`). Only track names we already know are String
      // variables (declared above) to avoid noise.
      const reassignRe = /(?:^|[;{}\s])(\w+)\s*=\s*([^;=][^;]*);/g;
      while ((m = reassignRe.exec(fileContent)) !== null) {
        const name = m[1];
        if (!accum.has(name)) continue; // only known String vars
        add(name, this.resolve(m[2].trim(), fileContent, snapshot(accum), spelMaps));
      }

      const after = JSON.stringify([...accum].map(([k, v]) => [k, [...v].sort()]));
      if (after === before) break;
    }

    for (const [k, set] of accum) {
      const arr = [...set];
      out.set(k, arr.length === 1 ? arr[0] : arr);
    }
    return out;
  }

  /**
   * Find every `@Value("#{${propName}}") Map<String,String> fieldName;` in a
   * file, resolve `propName` to its SpEL map literal, and return a
   * {fieldName → {key → value}} table.
   *
   * Also resolves the same kind of fields project-wide for getter chains.
   */
  collectSpelMapsForFile(fileContent: string): Map<string, Map<string, string>> {
    const out = new Map<string, Map<string, string>>();
    const re = /@Value\s*\(\s*["']#\{\$\{([^}]+)\}\}["']\s*\)\s*[^;]*?\bMap\s*<[^>]+>\s+(\w+)\s*;/g;
    let m;
    while ((m = re.exec(fileContent)) !== null) {
      const propName = m[1].trim();
      const fieldName = m[2];
      const raw = this.resolver.get(propName);
      if (!raw) continue;
      const parsed = parseSpelMap(raw);
      if (parsed.size > 0) out.set(fieldName, parsed);
    }
    return out;
  }

  // ----------- internals -----------

  /**
   * Resolve a map reference of the form `fieldName` or `bean.getFooBar()` (or
   * a chain like `bean.getCfg().getMapField()`). Returns the matching key→value
   * table or null if it can't be located.
   */
  private resolveMapReference(
    expr: string,
    fileContent: string,
    spelMapsLocal: Map<string, Map<string, string>>,
  ): Map<string, string> | null {
    const trimmed = expr.trim();

    // Plain field name → use file's own SpEL map.
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      return spelMapsLocal.get(trimmed) ?? null;
    }

    // Getter chain: bean.getFoo()  /  bean.getFoo().getBar()
    // We support a single hop: `<beanField>.<getter>()`.
    const getterChain = trimmed.match(/^(\w+)\s*\.\s*get(\w+)\s*\(\s*\)$/);
    if (getterChain) {
      const beanField = getterChain[1];
      const getterField = lowerFirst(getterChain[2]);

      // Find the bean's class — look for "<Type> <beanField>;" or
      // "@Autowired <Type> <beanField>;" in the current file.
      const typeMatch = fileContent.match(
        new RegExp(`(?:@Autowired\\s+)?(?:private|public|protected)?\\s*([A-Z]\\w+)\\s+${beanField}\\s*;`),
      );
      if (!typeMatch) return null;
      const beanClass = typeMatch[1];

      const beanFile = this.classIndex.get(beanClass);
      if (!beanFile) return null;

      const beanSpelMaps = this.collectSpelMapsForFile(beanFile.content);
      return beanSpelMaps.get(getterField) ?? null;
    }

    return null;
  }

  /**
   * Resolve a `bean.getFooBar()` call returning a String. Looks up the bean
   * field's type in the current file, then opens the bean's class file and
   * searches for an @Value("${prop}") String fooBar; declaration (or a direct
   * String assignment, or a @ConfigurationProperties prefix-mapped field).
   * Returns null if it can't be resolved.
   */
  private resolveStringGetter(
    beanField: string,
    capitalizedField: string,
    fileContent: string,
  ): string | string[] | null {
    const fieldName = lowerFirst(capitalizedField);

    // Locate bean field type.
    const typeMatch = fileContent.match(
      new RegExp(`(?:@Autowired\\s+)?(?:private|public|protected)?\\s*(?:final\\s+)?([A-Z]\\w+)\\s+${beanField}\\s*[;=]`),
    );
    if (!typeMatch) return null;
    const beanClass = typeMatch[1];

    const beanFile = this.classIndex.get(beanClass);
    if (!beanFile) return null;

    // @Value("${prop}") String fieldName;  (any modifiers / generics between)
    const vm = beanFile.content.match(
      new RegExp(`@Value\\s*\\(\\s*["']\\$\\{([^}]+)\\}["']\\s*\\)\\s*[^;]*?\\bString\\s+${fieldName}\\b`, 's'),
    );
    if (vm) {
      const propKey = vm[1].split(':')[0].trim();
      const def = vm[1].includes(':') ? vm[1].split(':').slice(1).join(':') : undefined;
      const val = this.resolver.get(propKey);
      if (val !== undefined) return this.resolver.resolve(val);
      if (def !== undefined) return this.resolver.resolve(def);
    }

    // String constant in the bean: `static final String fieldName = "...";`
    const constMatch = beanFile.content.match(
      new RegExp(`static\\s+final\\s+String\\s+${fieldName}\\s*=\\s*"([^"]+)"`),
    );
    if (constMatch) return this.resolver.resolve(constMatch[1]);

    // @ConfigurationProperties(prefix = "x.y") class — generic Spring pattern
    // where each plain field maps to `<prefix>.<field>` (also accepts kebab-case
    // and snake_case variants of the field name per the Spring spec).
    const prefixMatch = beanFile.content.match(
      /@ConfigurationProperties\s*\(\s*(?:value\s*=\s*|prefix\s*=\s*)?["']([^"']+)["']/,
    );
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      // Confirm the field exists in the bean as a String (so we don't pick up
      // unrelated names by coincidence).
      const fieldRe = new RegExp(`\\bString\\s+${fieldName}\\b`);
      if (fieldRe.test(beanFile.content)) {
        const variants = nameVariants(fieldName).map(v => `${prefix}.${v}`);
        for (const key of variants) {
          const v = this.resolver.get(key);
          if (v !== undefined) return this.resolver.resolve(v);
        }
      }
    }

    return null;
  }

  private indexClasses(file: SourceFile): void {
    const re = /\b(?:public\s+|abstract\s+|final\s+)*(?:class|interface|record)\s+([A-Z]\w*)/g;
    let m;
    while ((m = re.exec(file.content)) !== null) {
      if (!this.classIndex.has(m[1])) this.classIndex.set(m[1], file);
    }
  }

  private indexConstants(file: SourceFile): void {
    const className = file.content.match(/\b(?:class|interface)\s+([A-Z]\w*)/)?.[1];
    if (!className) return;

    // 1. Class constants: `public static final String NAME = "value";`
    const re = /\bstatic\s+final\s+String\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"\s*;/g;
    let m;
    while ((m = re.exec(file.content)) !== null) {
      const key = `${className}.${m[1]}`;
      this.constants.set(key, this.resolver.resolve(m[2]));
      if (!this.bareConstants.has(m[1])) {
        this.bareConstants.set(m[1], this.resolver.resolve(m[2]));
      }
    }

    // 2. Interface constants: `String NAME = "value";` (implicitly static final
    //    inside an interface — Java omits the modifiers). Only do this when the
    //    declaring type is an interface to avoid matching local variables.
    if (/\binterface\s+[A-Z]\w*/.test(file.content)) {
      const ifaceRe = /(?:^|\n)\s*(?:public\s+)?String\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"\s*;/g;
      while ((m = ifaceRe.exec(file.content)) !== null) {
        const key = `${className}.${m[1]}`;
        if (!this.constants.has(key)) this.constants.set(key, this.resolver.resolve(m[2]));
        if (!this.bareConstants.has(m[1])) {
          this.bareConstants.set(m[1], this.resolver.resolve(m[2]));
        }
      }
    }
  }
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}

/** Convert the accumulating Set-based assignment map into the plain map form
 *  that resolve() expects, for use during the fixpoint passes. */
function snapshot(accum: Map<string, Set<string>>): Map<string, string | string[]> {
  const out = new Map<string, string | string[]>();
  for (const [k, set] of accum) {
    const arr = [...set];
    out.set(k, arr.length === 1 ? arr[0] : arr);
  }
  return out;
}

/**
 * Spring binds property-key segments to Java field names by stripping
 * separators and matching case-insensitively. From a single field name we emit
 * the camelCase, kebab-case, and snake_case variants for property lookup.
 *   ingestionApiEndpoint  →  ingestionApiEndpoint, ingestion-api-endpoint, ingestion_api_endpoint
 */
function nameVariants(field: string): string[] {
  const kebab = field.replace(/([A-Z])/g, '-$1').replace(/^-/, '').toLowerCase();
  const snake = kebab.replace(/-/g, '_');
  return [...new Set([field, kebab, snake])];
}

function parseSpelMap(spel: string): Map<string, string> {
  const out = new Map<string, string>();
  let body = spel.trim();
  if (body.startsWith('${') && body.endsWith('}')) body = body.slice(2, -1);
  if (body.startsWith('{') && body.endsWith('}')) body = body.slice(1, -1);

  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  let inQuote: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") inQuote = ch;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      entries.push(body.slice(start, i));
      start = i + 1;
    }
  }
  entries.push(body.slice(start));

  for (const entry of entries) {
    // Accept `KEY: 'value'`, `'KEY': "value"`, `"KEY":"value"`.
    const m = entry.trim().match(/^['"]?([A-Za-z0-9_-]+)['"]?\s*:\s*['"]?([^'"]*)['"]?\s*$/);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/**
 * Extract the comma-separated arguments of a call starting just after the
 * opening parenthesis. Handles nested parens, braces, brackets, and quoted
 * strings. Lambdas and complex expressions are returned as a single argument.
 */
export function extractCallArguments(source: string, offsetAfterOpenParen: number): string[] {
  const args: string[] = [];
  let depth = 1;
  let start = offsetAfterOpenParen;
  let inQuote: string | null = null;
  for (let i = offsetAfterOpenParen; i < source.length; i++) {
    const ch = source[i];
    if (inQuote) {
      if (ch === '\\') { i++; continue; }
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        args.push(source.slice(start, i).trim());
        return args;
      }
      continue;
    }
    if (ch === ',' && depth === 1) {
      args.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  return args;
}

/** True if the expression has a top-level `+` operator (outside quotes/parens). */
function containsTopLevelConcat(expr: string): boolean {
  let depth = 0;
  let inQuote: string | null = null;
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
    else if (ch === '+' && depth === 0) return true;
  }
  return false;
}

/** Split a concatenation expression at top-level `+` operators. */
function splitTopLevelConcat(expr: string): string[] {
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

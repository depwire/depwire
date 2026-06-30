import { basename } from 'path';
import { ParsedFile, LanguageParser } from './types.js';

/**
 * A reference extracted from an Angular HTML template that could map to a
 * user-defined project symbol (a component selector, a structural/attribute
 * directive, or a pipe). Standard HTML tags, DOM events, component @Input/
 * @Output bindings and Angular built-ins are intentionally NOT surfaced here
 * because they never resolve to a project symbol — surfacing them would only
 * add noise to the dependency graph.
 */
export interface TemplateReference {
  type: 'component' | 'directive' | 'pipe';
  name: string; // e.g. 'app-user-branch', 'appHighlight', 'translate'
  line: number;
}

/**
 * Standard HTML elements — never treated as Angular component selectors.
 * (Custom Angular selectors are required to contain a hyphen, so this list is
 *  belt-and-suspenders, but it documents intent and guards odd inputs.)
 */
const HTML_TAG_DENYLIST = new Set<string>([
  'div', 'span', 'button', 'input', 'form', 'table', 'tr', 'td',
  'th', 'thead', 'tbody', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'li', 'ol', 'img', 'label', 'select', 'option', 'textarea',
  'nav', 'section', 'header', 'footer', 'main', 'article',
]);

/**
 * Angular built-in directives / pipes. These are framework-provided, not
 * user-defined, so they are filtered out of the surfaced references (they
 * would always resolve to an `external::` marker that gets dropped anyway).
 */
const ANGULAR_BUILTIN_DENYLIST = new Set<string>([
  'ngIf', 'ngFor', 'ngSwitch', 'ngClass', 'ngStyle', 'ngModel',
  'ngSubmit', 'routerLink', 'async', 'json', 'date', 'currency',
  'percent', 'uppercase', 'lowercase', 'slice', 'keyvalue',
]);

/**
 * Parse an Angular HTML template and extract references to user-definable
 * symbols: custom component selectors, custom structural/attribute directives,
 * and pipes. Standard HTML tags and Angular built-ins are filtered out.
 *
 * Implementation note: this uses targeted line-based regex extraction rather
 * than a full tree-sitter HTML grammar. Angular template syntax is regular
 * enough that this is reliable for the symbols we care about, and it avoids
 * adding a new native grammar dependency.
 */
export function parseHtmlTemplate(
  content: string,
  filePath: string
): { filePath: string; references: TemplateReference[] } {
  const references: TemplateReference[] = [];
  const seen = new Set<string>(); // dedupe on `${type}:${name}`

  const add = (type: TemplateReference['type'], name: string, line: number) => {
    const key = `${type}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push({ type, name, line });
  };

  const lines = content.split(/\r?\n/);

  // Custom element / component selectors: a tag containing at least one hyphen
  // (e.g. <app-user-branch>). The hyphen requirement excludes all standard
  // HTML elements, so div/span/button/etc. are never matched here.
  const componentRe = /<([a-z][a-z0-9]*-[a-z0-9-]*)\b/g;
  // Structural directives: *ngFor, *appCustom, etc.
  const structuralRe = /\*([a-zA-Z][a-zA-Z0-9]*)/g;
  // Pipes inside interpolations / bindings: `| translate`. Negative look-behind /
  // look-ahead exclude the logical OR operator (`||`).
  const pipeRe = /(?<!\|)\|(?!\|)\s*([a-zA-Z][a-zA-Z0-9]*)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    let m: RegExpExecArray | null;

    componentRe.lastIndex = 0;
    while ((m = componentRe.exec(line)) !== null) {
      const name = m[1];
      if (HTML_TAG_DENYLIST.has(name)) continue;
      add('component', name, lineNo);
    }

    structuralRe.lastIndex = 0;
    while ((m = structuralRe.exec(line)) !== null) {
      const name = m[1];
      if (ANGULAR_BUILTIN_DENYLIST.has(name)) continue;
      add('directive', name, lineNo);
    }

    pipeRe.lastIndex = 0;
    while ((m = pipeRe.exec(line)) !== null) {
      const name = m[1];
      if (ANGULAR_BUILTIN_DENYLIST.has(name)) continue;
      add('pipe', name, lineNo);
    }
  }

  return { filePath, references };
}

/**
 * LanguageParser entry for `.html` files. Produces a single `__template__`
 * pseudo-node per template so the file becomes a real graph node (instead of
 * "file not found"), and stashes the extracted references on its metadata.
 *
 * The actual `uses` edges (template -> component class, and template ->
 * referenced selectors/pipes/directives) are emitted later by the
 * component/template pairing pass in parser/index.ts, which has the
 * cross-file context needed to resolve Angular selectors to component classes.
 */
export function parseHtmlFile(
  filePath: string,
  content: string,
  _projectRoot: string
): ParsedFile {
  const { references } = parseHtmlTemplate(content, filePath);
  const lineCount = content.length === 0 ? 1 : content.split(/\r?\n/).length;

  return {
    filePath,
    symbols: [
      {
        id: `${filePath}::__template__`,
        name: basename(filePath),
        kind: 'template',
        filePath,
        startLine: 1,
        endLine: lineCount,
        exported: false,
        metadata: { references },
      },
    ],
    edges: [],
  };
}

export const htmlParser: LanguageParser = {
  name: 'html',
  extensions: ['.html'],
  parseFile: parseHtmlFile,
};

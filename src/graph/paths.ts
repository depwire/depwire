/** Canonical graph paths. Pure JS: also used by Workers-only graph/tools exports.
 * Files and the path prefix of symbol IDs use POSIX separators, relative to the
 * graph's project root. Filesystem IO keeps native absolute paths separately.
 * Case is preserved: case folding would merge distinct files on POSIX systems.
 */
function clean(value: string): string {
  const text = value.replace(/\\/g, '/');
  const prefix = text.startsWith('//') ? '//' : text.startsWith('/') ? '/' : '';
  const parts: string[] = [];
  for (const part of text.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length && parts.at(-1) !== '..' && !parts.at(-1)!.endsWith(':')) parts.pop();
    else if (part !== '..' || !prefix) parts.push(part);
  }
  return prefix + parts.join('/');
}

export function canonicalPath(value: string, projectRoot = ''): string {
  const path = clean(value);
  const root = clean(projectRoot);
  if (root && path === root) return '';
  const absolute = /^(?:\/|[A-Za-z]:\/)/.test(path);
  if (!absolute || !root) return path;
  const windows = /^[A-Za-z]:/.test(path) || path.startsWith('//');
  const equal = (a: string, b: string) => windows ? a.toLowerCase() === b.toLowerCase() : a === b;
  const fileParts = path.split('/');
  const rootParts = root === '/' ? [''] : root.split('/');
  if (!equal(fileParts[0], rootParts[0])) throw new Error(`Path is outside project volume: ${value}`);
  let common = 0;
  while (common < fileParts.length && common < rootParts.length && equal(fileParts[common], rootParts[common])) common++;
  return [...rootParts.slice(common).map(() => '..'), ...fileParts.slice(common)].join('/');
}

export function canonicalSymbolId(id: string, projectRoot = ''): string {
  const separator = id.indexOf('::');
  return separator < 0 ? id : canonicalPath(id.slice(0, separator), projectRoot) + id.slice(separator);
}

export function normalizePath(value: string | undefined): string | undefined {
  return value === undefined ? undefined : canonicalPath(value);
}

/** Lexical containment for already-resolved filesystem paths; not a symlink check. */
export function isWithinRoot(value: string, root: string): boolean {
  try {
    const path = canonicalPath(value, root);
    return path !== '..' && !path.startsWith('../') && !/^(?:\/|[A-Za-z]:)/.test(path);
  } catch { return false; }
}

import type { Node } from 'web-tree-sitter';
import type { ParsedFile, SyntaxErrors } from './types.js';

interface SyntaxIssue extends SyntaxErrors { index: number }
export interface SyntaxRecovery { start: number; end: number; issues: SyntaxIssue[] }

/** Collect actual ERROR/MISSING nodes; never mistake recovery elsewhere for a clean file. */
export function collectSyntaxIssues(root: Node, file: string, source: string, mapIndex = (index: number) => index): SyntaxIssue[] {
  if (!root.hasError) return [];
  const issues: SyntaxIssue[] = [];
  const visit = (node: Node) => {
    if (node.type === 'ERROR' || node.isMissing) {
      const index = mapIndex(node.startIndex);
      const text = node.text || `<missing ${node.type}>`;
      issues.push({ hasError: true, file, line: source.slice(0, index).split('\n').length,
        text: text.length > 160 ? text.slice(0, 157) + '...' : text, index });
      return;
    }
    for (const child of node.children) if (child.hasError || child.isMissing) visit(child);
  };
  visit(root);
  return issues;
}

/** Enumerable diagnostics survive canonicalization and cache storage (contract §3).
 * Only verify-change interprets these fields.
 * Recovered fragments replace only their own original diagnostics. */
export function withSyntaxErrors(result: ParsedFile, root: Node, source: string, recoveries: SyntaxRecovery[] = []): ParsedFile {
  const original = collectSyntaxIssues(root, result.filePath, source)
    .filter(issue => !recoveries.some(r => issue.index >= r.start && issue.index < r.end));
  result.syntaxCheck = 'checked';
  result.syntaxErrors = [...original, ...recoveries.flatMap(r => r.issues)]
    .sort((a, b) => a.index - b.index).map(({ index: _index, ...issue }) => issue);
  return result;
}

/** No grammar check ran; null must never masquerade as a checked-clean array. */
export function withSyntaxNotApplicable(result: ParsedFile): ParsedFile {
  return Object.assign(result, { syntaxCheck: 'not_applicable' as const, syntaxErrors: null });
}

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

/** Additive, non-enumerable diagnostics preserve every existing serialized consumer
 * output/cache shape. Only verify-change reads this property (contract §Limitations).
 * Recovered fragments replace only their own original diagnostics. */
export function withSyntaxErrors(result: ParsedFile, root: Node, source: string, recoveries: SyntaxRecovery[] = []): ParsedFile {
  const original = collectSyntaxIssues(root, result.filePath, source)
    .filter(issue => !recoveries.some(r => issue.index >= r.start && issue.index < r.end));
  const first = [...original, ...recoveries.flatMap(r => r.issues)].sort((a, b) => a.index - b.index)[0];
  if (first) {
    const { index: _index, ...syntaxErrors } = first;
    Object.defineProperty(result, 'syntaxErrors', { value: syntaxErrors, enumerable: false });
  }
  return result;
}

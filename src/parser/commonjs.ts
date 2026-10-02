/** CommonJS syntax recognition shared by the JavaScript and TypeScript walkers. */
export function isModuleExports(node: Parser.SyntaxNode, text: (node: Parser.SyntaxNode) => string): boolean {
  if (node.type !== 'member_expression') return false;
  const object = node.childForFieldName('object');
  const property = node.childForFieldName('property');
  return !!object && !!property && text(object) === 'module' && text(property) === 'exports';
}

export function commonJSExportTarget(node: Parser.SyntaxNode, text: (node: Parser.SyntaxNode) => string): { kind: 'direct' | 'property' | 'computed'; name?: string } | null {
  if (isModuleExports(node, text)) return { kind: 'direct' };
  if (node.type === 'member_expression') {
    const object = node.childForFieldName('object');
    const property = node.childForFieldName('property');
    if (object && property && (isModuleExports(object, text) || text(object) === 'exports')) return { kind: 'property', name: text(property) };
  }
  if (node.type === 'subscript_expression') {
    const object = node.childForFieldName('object');
    if (object && (isModuleExports(object, text) || text(object) === 'exports')) return { kind: 'computed' };
  }
  return null;
}

export function hasConditionalAncestor(node: Parser.SyntaxNode): boolean {
  let ancestor: Parser.SyntaxNode | null = node.parent;
  while (ancestor && ancestor.type !== 'program' && ancestor.type !== 'function_declaration' && ancestor.type !== 'function_expression') {
    if (ancestor.type === 'if_statement' || ancestor.type === 'ternary_expression') return true;
    ancestor = ancestor.parent;
  }
  return false;
}

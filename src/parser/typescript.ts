import { getParser } from './wasm-init.js';
import { SymbolNode, SymbolEdge, ParsedFile, SymbolKind, EdgeKind, LanguageParser, UnresolvedImport, UnresolvedCall, UnresolvedCallReason, UnresolvedTypeRef, UnresolvedTypeRefReason, PendingSuperCall, PendingNamespaceCall } from './types.js';
import { resolveImportPath, classifyUnresolvedImport } from './resolver.js';

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  imports: Map<string, string>; // Map<importedName, resolvedSymbolId>
  externalImports: Map<string, string>; // Map<importedName, moduleSpecifier> for node_modules / unresolved imports
  typeFallbackImports: Set<string>; // type-only bindings resolved by the root-source workspace fallback
  declaredSymbolIds: Set<string>; // every symbol id declared so far, used to resolve calls to nested/scoped functions
  declaredSymbols: Map<string, SymbolNode[]>; // declarations by id; call resolution also needs value/kind evidence
  // Buffered call edges waiting for forward-reference resolution. `scopedOnly` marks calls
  // whose target must match a real declared symbol at some scope level (this./super. member
  // calls) -- these get NO edge (recorded unresolved instead) if no level matches. Bare calls
  // and constructors are also buffered until a real value declaration supports the edge.
  unresolvedCallEdges: Array<{source: string, functionName: string, line: number, scopeChain: string[], callKind: 'call' | 'new', scopedOnly?: boolean, receiverKind?: 'this' | 'super'}>;
  unresolvedImports: UnresolvedImport[]; // imports/re-exports that did not resolve, classified by reason
  unresolvedCalls: UnresolvedCall[]; // member-expression calls whose receiver could not be resolved without guessing
  unresolvedTypeRefs: UnresolvedTypeRef[];
  pendingTypeRefs: Array<{ source: string; typeName: string; qualifier?: string; line: number; heritage?: boolean }>;
  pendingSuperCalls: PendingSuperCall[];
  pendingNamespaceCalls: PendingNamespaceCall[];
  ambientDepth: number;
  wildcardReExports: string[]; // resolved target files this file wildcard-re-exports from (`export * from`)
}

export function parseTypeScriptFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const languageType = filePath.endsWith('.tsx') ? 'tsx' : 'typescript';
  const parser = getParser(languageType);
  // Use explicit buffer size for large files (tree-sitter default is too small)
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  
  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    imports: new Map(),
    externalImports: new Map(),
    typeFallbackImports: new Set(),
    declaredSymbolIds: new Set(),
    declaredSymbols: new Map(),
    unresolvedCallEdges: [],
    unresolvedImports: [],
    unresolvedCalls: [],
    unresolvedTypeRefs: [],
    pendingTypeRefs: [],
    pendingSuperCalls: [],
    pendingNamespaceCalls: [],
    ambientDepth: 0,
    wildcardReExports: [],
  };
  
  walkNode(tree.rootNode, context);
  
  // Resolve all buffered call edges now that all symbols have been declared
  resolveUnresolvedCallEdges(context);
  resolvePendingTypeReferences(context);
  
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
    unresolvedImports: context.unresolvedImports,
    unresolvedCalls: context.unresolvedCalls,
    pendingSuperCalls: context.pendingSuperCalls,
    pendingNamespaceCalls: context.pendingNamespaceCalls,
    unresolvedTypeRefs: context.unresolvedTypeRefs,
    wildcardReExports: context.wildcardReExports,
  };
}

function walkNode(node: any, context: Context): void {
  // Process current node. `processNode` returns `true` when it has taken
  // full responsibility for traversing its own subtree (e.g. function and
  // class bodies are walked explicitly, with scope pushed/popped around
  // them) — in that case the generic recursion below must NOT also walk
  // those children, or every nested symbol gets visited twice: once with
  // the correct scope, and once after the scope has already been popped,
  // producing duplicate/colliding symbol ids.
  const handledChildren = processNode(node, context);
  if (handledChildren) return;
  
  // Recursively process children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode(child, context);
    }
  }
}

function processNode(node: Parser.SyntaxNode, context: Context): boolean {
  const type = node.type;
  
  switch (type) {
    case 'function_declaration':
      processFunctionDeclaration(node, context);
      return true;
    case 'class_declaration':
    case 'abstract_class_declaration':
      // tree-sitter-typescript emits a distinct node type for
      // `export abstract class X {}` -- same shape (name/body fields,
      // class_heritage child) as class_declaration, so the same handler
      // applies directly. Missing this meant every abstract class (View,
      // Relation, and any other `abstract class` in a TS codebase) produced
      // no SymbolNode at all -- invisible to any importer, any call site,
      // any dead-code check.
      processClassDeclaration(node, context);
      return true;
    case 'variable_declaration':
    case 'lexical_declaration':
      processVariableDeclaration(node, context);
      return true;
    case 'type_alias_declaration':
      processTypeAliasDeclaration(node, context);
      break;
    case 'interface_declaration':
      processInterfaceDeclaration(node, context);
      break;
    case 'enum_declaration':
      processEnumDeclaration(node, context);
      break;
    case 'internal_module':
    case 'module':
      processNamespaceDeclaration(node, context);
      return true;
    case 'ambient_declaration':
      processAmbientDeclaration(node, context);
      return true;
    case 'function_signature':
      processFunctionSignature(node, context);
      return true;
    case 'import_statement':
      processImportStatement(node, context);
      break;
    case 'export_statement':
      processExportStatement(node, context);
      break;
    case 'call_expression':
      processCallExpression(node, context);
      break;
    case 'new_expression':
      processNewExpression(node, context);
      break;
    case 'as_expression':
    case 'satisfies_expression':
      processTypeExpression(node, context);
      break;
  }
  return false;
}

function processFunctionDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const localName = nameNode.text;
  const qualifiedName = qualifyName(localName, context);
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const scope = context.currentScope.length > 0 ? context.currentScope.join('.') : undefined;
  
  const symbolId = `${context.filePath}::${qualifiedName}`;
  
  pushSymbol(context, {
    id: symbolId,
    name: localName,
    kind: 'function',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
    scope,
    ...ambientMetadata(context),
  });

  collectCallableTypeReferences(node, symbolId, context);
  
  // Enter function scope for processing nested calls
  context.currentScope.push(localName);
  
  // Walk default parameter values (e.g. `function f(x = init())`) — the
  // outer generic recursion no longer reaches these now that this
  // function owns its entire subtree.
  const params = node.childForFieldName('parameters');
  if (params) {
    walkNode(params, context);
  }
  
  // Process function body
  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }
  
  context.currentScope.pop();
}

function recordUnresolvedTypeRef(
  context: Context,
  typeName: string,
  reason: UnresolvedTypeRefReason,
): void {
  context.unresolvedTypeRefs.push({ fromFile: context.filePath, typeName, reason });
}

function collectTypeNames(
  node: Parser.SyntaxNode | null,
  out: Array<{ name: string; qualifier?: string; line: number }>,
): void {
  if (!node) return;
  if (node.type === 'member_expression') {
    out.push({ name: node.text, line: node.startPosition.row + 1 });
    return;
  }
  if (node.type === 'nested_type_identifier') {
    out.push({ name: node.text, line: node.startPosition.row + 1 });
    return;
  }
  if (node.type === 'type_identifier') {
    out.push({ name: node.text, line: node.startPosition.row + 1 });
    return;
  }
  // A heritage clause uses an ordinary identifier rather than type_identifier.
  if (
    node.type === 'identifier'
    && (node.parent?.type === 'extends_type_clause' || node.parent?.type === 'extends_clause')
  ) {
    out.push({ name: node.text, line: node.startPosition.row + 1 });
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    collectTypeNames(node.namedChild(i), out);
  }
}

function queueTypeReferences(
  typeNode: Parser.SyntaxNode | null,
  source: string,
  context: Context,
  heritage = false,
): void {
  const names: Array<{ name: string; qualifier?: string; line: number }> = [];
  collectTypeNames(typeNode, names);
  for (const { name, qualifier, line } of names) {
    context.pendingTypeRefs.push({ source, typeName: name, qualifier, line, heritage });
  }
}

function collectParameterTypeReferences(
  params: Parser.SyntaxNode | null,
  source: string,
  context: Context,
): void {
  if (!params) return;
  for (let i = 0; i < params.namedChildCount; i++) {
    const param = params.namedChild(i);
    queueTypeReferences(param.childForFieldName('type'), source, context);
  }
}

function collectCallableTypeReferences(
  node: Parser.SyntaxNode,
  source: string,
  context: Context,
): void {
  collectParameterTypeReferences(node.childForFieldName('parameters'), source, context);
  queueTypeReferences(node.childForFieldName('return_type'), source, context);
}

function processTypeExpression(node: Parser.SyntaxNode, context: Context): void {
  const source = getCurrentSymbolId(context) ?? `${context.filePath}::__file__`;
  queueTypeReferences(node.childForFieldName('type') ?? node.lastNamedChild, source, context);
}

function resolvePendingTypeReferences(context: Context): void {
  for (const pending of context.pendingTypeRefs) {
    if (pending.qualifier) {
      const qualifierTarget = context.imports.get(pending.qualifier);
      if (qualifierTarget) {
        const targetFile = qualifierTarget.slice(0, qualifierTarget.lastIndexOf('::'));
        context.edges.push({
          source: pending.source,
          target: `${targetFile}::${pending.typeName}`,
          kind: 'references-type',
          filePath: context.filePath,
          line: pending.line,
          ...(pending.heritage ? { typeContext: 'heritage' } : {}),
        });
        continue;
      }
      if (context.externalImports.has(pending.qualifier)) {
        recordUnresolvedTypeRef(context, `${pending.qualifier}.${pending.typeName}`, 'external-type');
        continue;
      }
    }
    const imported = resolveQualifiedImportTarget(pending.typeName, context);
    if (imported) {
      context.edges.push({
        source: pending.source,
        target: imported,
        kind: 'references-type',
        filePath: context.filePath,
        line: pending.line,
        ...(pending.heritage ? { typeContext: 'heritage' } : {}),
      });
      continue;
    }
    const rootTypeName = pending.typeName.split('.')[0];
    if (context.externalImports.has(rootTypeName) || context.typeFallbackImports.has(rootTypeName)) {
      recordUnresolvedTypeRef(context, pending.typeName, 'external-type');
      continue;
    }

    // Keep the local-name candidate until the project-wide resolver has the
    // complete symbol/re-export index. It will prove the target or classify it.
    context.edges.push({
      source: pending.source,
      target: `${context.filePath}::${pending.typeName}`,
      kind: 'references-type',
      filePath: context.filePath,
      line: pending.line,
      ...(pending.heritage ? { typeContext: 'heritage' } : {}),
    });
  }
}

const PRIMITIVE_TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'void', 'unknown', 'never',
  'object', 'symbol', 'bigint', 'null', 'undefined', 'true', 'false', 'this',
]);

/**
 * Resolve a type name to a graph node id.
 * - Imported from another local file -> that file's symbol id (via context.imports)
 * - Imported from node_modules / ambient -> "external::<Type>" marker
 * - Otherwise assume a same-file symbol.
 */
function resolveTypeTarget(typeName: string, context: Context): string {
  const rootTypeName = typeName.split('.')[0];
  if (context.typeFallbackImports.has(rootTypeName)) return `external::${typeName}`;
  const localImport = resolveQualifiedImportTarget(typeName, context);
  if (localImport) return localImport;
  if (context.externalImports.has(rootTypeName)) return `external::${typeName}`;
  return `${context.filePath}::${typeName}`;
}

function resolveQualifiedImportTarget(name: string, context: Context): string | undefined {
  const [root, ...suffixParts] = name.split('.');
  const imported = context.imports.get(root);
  if (!imported) return undefined;
  if (suffixParts.length === 0) return imported;
  const suffix = suffixParts.join('.');
  return imported.endsWith('::__file__')
    ? `${imported.slice(0, -'__file__'.length)}${suffix}`
    : `${imported}.${suffix}`;
}

/** Extract the base type identifier from a type or type_annotation node. */
function extractBaseTypeName(typeNode: Parser.SyntaxNode | null): string | null {
  if (!typeNode) return null;
  switch (typeNode.type) {
    case 'type_annotation':
    case 'opting_type_annotation':
      return extractBaseTypeName(typeNode.namedChild(0));
    case 'type_identifier':
    case 'identifier':
      return typeNode.text;
    case 'generic_type':
      return extractBaseTypeName(typeNode.childForFieldName('name'));
    case 'nested_type_identifier':
      return typeNode.lastNamedChild ? typeNode.lastNamedChild.text : null;
    default:
      return null;
  }
}

/** Emit a single 'injects' edge for a discovered dependency type. */
function emitInjectEdge(
  typeNode: Parser.SyntaxNode | null,
  classId: string,
  context: Context,
  line: number,
  seen: Set<string>
): void {
  const typeName = extractBaseTypeName(typeNode);
  if (!typeName || PRIMITIVE_TYPES.has(typeName)) return;
  const targetId = resolveTypeTarget(typeName, context);
  if (seen.has(targetId)) return;
  seen.add(targetId);
  context.edges.push({
    source: classId,
    target: targetId,
    kind: 'injects',
    filePath: context.filePath,
    line,
  });
}

/**
 * Parse constructor parameters and typed class fields into 'injects' edges
 * sourced from the class node — this surfaces Angular service dependencies
 * (constructor(private svc: FooService)) in get_dependencies.
 */
function processClassDependencyInjection(
  node: Parser.SyntaxNode,
  classId: string,
  context: Context
): void {
  const body = node.childForFieldName('body');
  if (!body) return;
  const seen = new Set<string>();

  for (let i = 0; i < body.childCount; i++) {
    const member = body.child(i);
    if (!member) continue;

    // Constructor parameter injection
    if (member.type === 'method_definition') {
      const nameNode = member.childForFieldName('name');
      if (nameNode && nameNode.text === 'constructor') {
        const params = member.childForFieldName('parameters');
        if (params) {
          for (let p = 0; p < params.childCount; p++) {
            const param = params.child(p);
            if (!param) continue;
            if (param.type === 'required_parameter' || param.type === 'optional_parameter') {
              const typeAnno = param.childForFieldName('type');
              emitInjectEdge(typeAnno, classId, context, param.startPosition.row + 1, seen);
            }
          }
        }
      }
    }

    // Field injection: typed class properties (private svc: FooService;)
    if (member.type === 'public_field_definition' || member.type === 'field_definition') {
      const typeAnno = member.childForFieldName('type');
      emitInjectEdge(typeAnno, classId, context, member.startPosition.row + 1, seen);
    }
  }
}

/**
 * Extract the `selector` string from an Angular @Component({ ... }) decorator
 * attached to a class declaration, e.g. `selector: 'app-user-branch'`.
 * Returns null when the class has no @Component decorator or no selector.
 */
function extractAngularSelector(classNode: Parser.SyntaxNode): string | null {
  // Decorators may be direct children of the class node, or siblings under an
  // export_statement wrapper — scan both.
  const decorators: Parser.SyntaxNode[] = [];
  const collect = (n: Parser.SyntaxNode | null) => {
    if (!n) return;
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c && c.type === 'decorator') decorators.push(c);
    }
  };
  collect(classNode);
  collect(classNode.parent);

  for (const dec of decorators) {
    if (!/@Component\b/.test(dec.text)) continue;
    const selector = findSelectorString(dec);
    if (selector) return selector;
  }
  return null;
}

/** Recursively find a `selector: '<value>'` pair and return its string value. */
function findSelectorString(node: Parser.SyntaxNode): string | null {
  if (node.type === 'pair') {
    const key = node.childForFieldName('key');
    const keyText = key ? key.text.replace(/['"]/g, '') : '';
    if (keyText === 'selector') {
      const value = node.childForFieldName('value');
      if (value && (value.type === 'string' || value.type === 'template_string')) {
        return value.text.slice(1, -1);
      }
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      const found = findSelectorString(child);
      if (found) return found;
    }
  }
  return null;
}

function processClassDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const parentScope = context.currentScope.length > 0 ? context.currentScope.join('.') : undefined;
  const qualifiedName = qualifyName(name, context);
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  
  const symbolId = `${context.filePath}::${qualifiedName}`;
  
  // Angular: capture the @Component({ selector: '...' }) value so the HTML
  // template pairing pass can resolve template tags back to this class.
  const angularSelector = extractAngularSelector(node);
  
  pushSymbol(context, {
    id: symbolId,
    name: nameNode.text,
    kind: 'class',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
    ...(parentScope ? { scope: parentScope } : {}),
    ...((angularSelector || context.ambientDepth > 0) ? { metadata: {
      ...(angularSelector ? { angularSelector } : {}),
      ...(context.ambientDepth > 0 ? { ambient: true } : {}),
    } } : {}),
  });
  
  // Process extends clause
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'class_heritage') {
      const extendsClause = child.childForFieldName('extends');
      if (extendsClause) {
        for (let j = 0; j < extendsClause.childCount; j++) {
          const typeNode = extendsClause.child(j);
          if (typeNode && typeNode.type === 'identifier') {
            const targetName = typeNode.text;
            // Resolve through imports so imported base classes point to their
            // real defining file instead of an assumed local symbol.
            const targetId = resolveTypeTarget(targetName, context);
            
            context.edges.push({
              source: symbolId,
              target: targetId,
              kind: 'extends',
              filePath: context.filePath,
              line: typeNode.startPosition.row + 1,
            });
          }
        }
      }
      const grammarExtendsClause = findChildByType(child, 'extends_clause');
      if (grammarExtendsClause && !extendsClause) {
        const value = grammarExtendsClause.childForFieldName('value') ?? grammarExtendsClause.lastNamedChild;
        if (value) {
          context.edges.push({
            source: symbolId,
            target: resolveTypeTarget(value.text, context),
            kind: 'extends',
            filePath: context.filePath,
            line: value.startPosition.row + 1,
          });
        }
      }
      
      // Process implements clause
      const implementsClause = child.childForFieldName('implements');
      if (implementsClause) {
        for (let j = 0; j < implementsClause.childCount; j++) {
          const typeNode = implementsClause.child(j);
          if (typeNode && typeNode.type === 'type_identifier') {
            const targetName = typeNode.text;
            // Resolve through imports (e.g. OnInit from '@angular/core')
            // instead of always assuming a local symbol.
            const targetId = resolveTypeTarget(targetName, context);
            
            context.edges.push({
              source: symbolId,
              target: targetId,
              kind: 'implements',
              filePath: context.filePath,
              line: typeNode.startPosition.row + 1,
            });
            queueTypeReferences(typeNode, symbolId, context, true);
          }
        }
      }
      const grammarImplementsClause = findChildByType(child, 'implements_clause');
      if (grammarImplementsClause && !implementsClause) {
        queueTypeReferences(grammarImplementsClause, symbolId, context, true);
      }
    }
  }
  
  // Process constructor + field dependency injection (Angular services, etc.)
  processClassDependencyInjection(node, symbolId, context);
  
  // Enter class scope for processing methods
  context.currentScope.push(name);
  
  // Process class body
  const body = node.childForFieldName('body');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child) {
        if (child.type === 'method_definition') {
          processMethodDefinition(child, context);
        } else if (child.type === 'public_field_definition' || child.type === 'field_definition') {
          processPropertyDefinition(child, context);
        }
      }
    }
    
    // Now that class_declaration owns its entire subtree (the outer generic
    // recursion no longer descends into it), explicitly walk anything the
    // member-by-member loop above doesn't already reach: field initializer
    // values (e.g. `foo = bar();`) and decorator argument lists on members
    // and on the class itself — both previously discovered incidentally by
    // the generic recursion.
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;
      
      if (child.type === 'public_field_definition' || child.type === 'field_definition') {
        const value = child.childForFieldName('value');
        if (value) {
          walkNode(value, context);
        }
      }
      
      for (let j = 0; j < child.childCount; j++) {
        const maybeDecorator = child.child(j);
        if (maybeDecorator && maybeDecorator.type === 'decorator') {
          walkNode(maybeDecorator, context);
        }
      }
    }
  }
  
  // Class-level decorators (e.g. @Component({...})) may live as direct
  // children of the class node, or as siblings under an export_statement
  // wrapper — walk both so decorator argument call expressions are reached.
  const classLevelDecorators: Parser.SyntaxNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'decorator') classLevelDecorators.push(child);
  }
  if (node.parent) {
    for (let i = 0; i < node.parent.childCount; i++) {
      const sibling = node.parent.child(i);
      if (sibling && sibling.type === 'decorator') classLevelDecorators.push(sibling);
    }
  }
  for (const decorator of classLevelDecorators) {
    walkNode(decorator, context);
  }
  
  context.currentScope.pop();
}

function qualifyName(localName: string, context: Context): string {
  return context.currentScope.length > 0
    ? `${context.currentScope.join('.')}.${localName}`
    : localName;
}

function ambientMetadata(context: Context): { metadata: { ambient: true } } | Record<string, never> {
  return context.ambientDepth > 0 ? { metadata: { ambient: true } } : {};
}

function processAmbientDeclaration(node: Parser.SyntaxNode, context: Context): void {
  context.ambientDepth++;
  for (let i = 0; i < node.namedChildCount; i++) {
    walkNode(node.namedChild(i), context);
  }
  context.ambientDepth--;
}

function processNamespaceDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name') ?? node.namedChild(0);
  if (!nameNode) return;
  const parts = nameNode.text.replace(/^['"]|['"]$/g, '').split('.');
  const parentScope = context.currentScope.join('.');
  const qualified = parentScope ? `${parentScope}.${parts.join('.')}` : parts.join('.');
  const symbolId = `${context.filePath}::${qualified}`;
  const mergedDeclaration = context.declaredSymbols.get(symbolId)?.[0];
  if (mergedDeclaration) {
    // TypeScript permits declaration merging (`class Outer {}` plus
    // `namespace Outer {}`). Preserve one graph id and flag its namespace
    // facet instead of creating a cross-kind duplicate node.
    mergedDeclaration.exported ||= isExported(node);
    mergedDeclaration.metadata = {
      ...mergedDeclaration.metadata,
      namespace: true,
      ...(context.ambientDepth > 0 ? { ambient: true } : {}),
    };
  } else {
    pushSymbol(context, {
      id: symbolId,
      name: qualified,
      kind: 'module',
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: isExported(node),
      ...(parentScope ? { scope: parentScope } : {}),
      ...ambientMetadata(context),
    });
  }

  context.currentScope.push(...parts);
  const body = node.childForFieldName('body') ?? findChildByType(node, 'statement_block');
  if (body) walkNode(body, context);
  context.currentScope.splice(context.currentScope.length - parts.length, parts.length);
}

function processFunctionSignature(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const symbolId = `${context.filePath}::${qualifyName(nameNode.text, context)}`;
  pushSymbol(context, {
    id: symbolId,
    name: nameNode.text,
    kind: 'function',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: isExported(node),
    ...(context.currentScope.length > 0 ? { scope: context.currentScope.join('.') } : {}),
    metadata: { ambient: true },
  });
  collectCallableTypeReferences(node, symbolId, context);
}

function processMethodDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const className = context.currentScope.join('.');
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  
  const symbolId = `${context.filePath}::${className}.${name}`;
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'method',
    filePath: context.filePath,
    startLine,
    endLine,
    exported: false,
    scope: className,
    ...ambientMetadata(context),
  });

  collectCallableTypeReferences(node, symbolId, context);
  
  // Enter method scope
  context.currentScope.push(name);
  
  // Process method body
  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }
  
  context.currentScope.pop();
}

function processPropertyDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const className = context.currentScope.join('.');
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  
  const symbolId = `${context.filePath}::${className}.${name}`;
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'property',
    filePath: context.filePath,
    startLine,
    endLine,
    exported: false,
    scope: className,
    ...ambientMetadata(context),
  });
  queueTypeReferences(node.childForFieldName('type'), symbolId, context);
}

function processVariableDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Look for variable_declarator children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'variable_declarator') {
      const nameNode = child.childForFieldName('name');
      if (!nameNode) continue;
      
      const name = nameNode.text;
      // Pass the declaration node itself, not its parent — isExported now
      // stops at scope boundaries (e.g. statement_block), so ascending from
      // the declaration correctly finds `export const x = ...` while never
      // escaping the enclosing function body for a local declaration.
      const exported = isExported(node);
      const startLine = child.startPosition.row + 1;
      const endLine = child.endPosition.row + 1;
      const scope = context.currentScope.length > 0 ? context.currentScope.join('.') : undefined;
      
      // Check if it's an arrow function
      const value = child.childForFieldName('value');
      const kind: SymbolKind = (value && value.type === 'arrow_function') ? 'function' : 'variable';
      
      const symbolId = `${context.filePath}::${scope ? scope + '.' : ''}${name}`;
      
      pushSymbol(context, {
        id: symbolId,
        name,
        kind,
        filePath: context.filePath,
        startLine,
        endLine,
        exported,
        scope,
        ...ambientMetadata(context),
      });
      queueTypeReferences(child.childForFieldName('type'), symbolId, context);
      
      // If it's an arrow function, process its body with the declared name
      // pushed as scope. Otherwise (e.g. `const x = foo();`), still walk the
      // initializer — with the scope unchanged — so call expressions inside
      // non-arrow initializers keep producing `calls` edges now that this
      // function owns its entire subtree (the outer generic recursion no
      // longer reaches it).
      if (value) {
        if (kind === 'function') {
          collectCallableTypeReferences(value, symbolId, context);
          context.currentScope.push(name);
          walkNode(value, context);
          context.currentScope.pop();
        } else {
          walkNode(value, context);
        }
      }
    }
  }
}

function processTypeAliasDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  
  const scope = context.currentScope.length > 0 ? context.currentScope.join('.') : undefined;
  const symbolId = `${context.filePath}::${qualifyName(name, context)}`;
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'type_alias',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
    ...(scope ? { scope } : {}),
    ...ambientMetadata(context),
  });

  const value = node.childForFieldName('value');
  if (value) {
    queueTypeReferences(value, symbolId, context);
  } else {
    // tree-sitter versions differ on whether the alias RHS is named `value`.
    // Scan named children after the declaration name/type parameters.
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child.id !== nameNode.id && child.type !== 'type_parameters') {
        queueTypeReferences(child, symbolId, context);
      }
    }
  }
}

function processInterfaceDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  
  const scope = context.currentScope.length > 0 ? context.currentScope.join('.') : undefined;
  const symbolId = `${context.filePath}::${qualifyName(name, context)}`;
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'interface',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
    ...(scope ? { scope } : {}),
    ...ambientMetadata(context),
  });

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child.type === 'extends_type_clause') {
      queueTypeReferences(child, symbolId, context, true);
    } else if (child.type === 'object_type' || child.type === 'interface_body') {
      for (let j = 0; j < child.namedChildCount; j++) {
        const member = child.namedChild(j);
        queueTypeReferences(member.childForFieldName('type'), symbolId, context);
        if (member.type === 'method_signature' || member.type === 'call_signature') {
          collectCallableTypeReferences(member, symbolId, context);
        }
      }
    }
  }
}

function processEnumDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  
  const scope = context.currentScope.length > 0 ? context.currentScope.join('.') : undefined;
  const symbolId = `${context.filePath}::${qualifyName(name, context)}`;
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'enum',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
    ...(scope ? { scope } : {}),
    ...ambientMetadata(context),
  });
}

interface ImportBinding {
  importedName: string; // the name as exported by the source module
  localName: string;    // the name bound in this file's scope
  typeOnly: boolean;
}

function processImportStatement(node: Parser.SyntaxNode, context: Context): void {
  // Get the import source
  const source = node.childForFieldName('source');
  if (!source) return;
  
  const importPath = source.text.slice(1, -1); // Remove quotes
  const resolvedPath = resolveImportPath(importPath, context.filePath, context.projectRoot);
  const typeResolvedPath = resolvedPath ?? resolveImportPath(
    importPath,
    context.filePath,
    context.projectRoot,
    { allowPackageRootSource: true },
  );
  
  // Locate the clause by node type rather than positional index — `import
  // type { ... }` shifts every subsequent child by one slot because `type`
  // occupies index 1, so `node.child(1)` would grab the `type` keyword
  // instead of the `import_clause`.
  const importClause = findChildByType(node, 'import_clause');
  if (!importClause) return;
  
  const importBindings: ImportBinding[] = [];
  const statementTypeOnly = node.text.trimStart().startsWith('import type');
  
  // Handle named imports (including `import { type A, B } from ...`)
  const namedImports = findChildByType(importClause, 'named_imports');
  if (namedImports) {
    for (let i = 0; i < namedImports.childCount; i++) {
      const child = namedImports.child(i);
      if (child && child.type === 'import_specifier') {
        // Use the named fields rather than first-identifier scanning so
        // aliased imports (`alpha as beta`) register the local binding
        // `beta`, not the first identifier encountered (`alpha`).
        const nameNode = child.childForFieldName('name');
        const aliasNode = child.childForFieldName('alias');
        if (!nameNode) continue;
        const importedName = nameNode.text;
        const localName = aliasNode ? aliasNode.text : importedName;
        importBindings.push({
          importedName,
          localName,
          typeOnly: statementTypeOnly || hasDirectToken(child, 'type'),
        });
      }
    }
  }
  
  // Handle default import
  const identifier = findChildByType(importClause, 'identifier');
  if (identifier) {
    importBindings.push({
      importedName: identifier.text,
      localName: identifier.text,
      typeOnly: statementTypeOnly,
    });
  }
  
  // Handle namespace import (import * as X). Track it separately from named
  // imports: `import * as X from 'mod'` binds X to the WHOLE module object,
  // not to a symbol literally named X declared inside mod. Treating it like
  // a named import (target `${resolvedPath}::X`) meant the edge pointed at
  // a symbol name that only ever matched by coincidence -- mod almost never
  // declares something named after whatever the importer happened to call
  // the local alias, so this always produced a target the graph doesn't
  // actually declare. It targets the file-level pseudo-node instead,
  // consistent with how whole-file/side-effect imports are already
  // represented elsewhere.
  const namespaceImportNames = new Set<string>();
  const namespaceImport = findChildByType(importClause, 'namespace_import');
  if (namespaceImport) {
    const alias = findChildByType(namespaceImport, 'identifier');
    if (alias) {
      namespaceImportNames.add(alias.text);
    }
  }
  
  // Create edges per binding. Type-only bindings may use the same workspace
  // resolver with the package-root source fallback enabled; value imports
  // retain the existing resolution behavior so this feature stays additive.
  const currentSymbolId = getCurrentSymbolId(context);
  let hasUnresolvedBinding = false;
  for (const { importedName, localName, typeOnly } of importBindings) {
    const bindingPath = resolvedPath ?? (typeOnly ? typeResolvedPath : null);
    if (!bindingPath) {
      hasUnresolvedBinding = true;
      if (!context.externalImports.has(localName)) context.externalImports.set(localName, importPath);
      continue;
    }
    const targetId = `${bindingPath}::${importedName}`;
    context.imports.set(localName, targetId);
    if (!resolvedPath && typeOnly) context.typeFallbackImports.add(localName);
    context.edges.push({
      source: currentSymbolId || `${context.filePath}::__file__`,
      target: targetId,
      kind: typeOnly ? 'references-type' : 'imports',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
      ...(typeOnly ? { typeOnlyImport: true } : {}),
      ...(typeOnly ? { originalImportTarget: targetId } : {}),
      ...(!resolvedPath && typeOnly ? { typeOnlyFallback: true } : {}),
    });
  }

  for (const alias of namespaceImportNames) {
    const bindingPath = resolvedPath ?? (statementTypeOnly ? typeResolvedPath : null);
    if (!bindingPath) {
      hasUnresolvedBinding = true;
      context.externalImports.set(alias, importPath);
      continue;
    }
    const targetId = `${bindingPath}::__file__`;
    context.imports.set(alias, targetId);
    if (!resolvedPath && statementTypeOnly) context.typeFallbackImports.add(alias);
    context.edges.push({
      source: currentSymbolId || `${context.filePath}::__file__`,
      target: targetId,
      kind: statementTypeOnly ? 'references-type' : 'imports',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
      ...(statementTypeOnly ? { typeOnlyImport: true } : {}),
      ...(statementTypeOnly ? { originalImportTarget: targetId } : {}),
      ...(!resolvedPath && statementTypeOnly ? { typeOnlyFallback: true } : {}),
    });
  }

  if (hasUnresolvedBinding) {
    const reason = classifyUnresolvedImport(importPath, context.filePath, context.projectRoot);
    context.unresolvedImports.push({ fromFile: context.filePath, specifier: importPath, reason });
  }
}

function processExportStatement(node: Parser.SyntaxNode, context: Context): void {
  // Handle re-exports: export { X } from './module'
  const source = node.childForFieldName('source');
  if (source) {
    const importPath = source.text.slice(1, -1);
    const resolvedPath = resolveImportPath(importPath, context.filePath, context.projectRoot);
    
    // Locate the clause by node type — `export type { ... } from` shifts the
    // export_clause by one slot, same issue as Bug 1 for imports.
    const exportClause = findChildByType(node, 'export_clause');
    // `export * from './x'` has a bare `*` token child and no export_clause,
    // no namespace_export. `export * as ns from './x'` has a namespace_export
    // child instead. Both are wildcard re-exports for chain-following
    // purposes -- `ns.something` still ultimately resolves through the same
    // barrel, so both are recorded as wildcard candidates.
    const namespaceExport = findChildByType(node, 'namespace_export');
    const isWildcard = !exportClause && (namespaceExport !== null || hasWildcardToken(node));

    if (exportClause && resolvedPath) {
      const exportedNames: Array<{ localName: string; sourceName: string }> = [];
      
      for (let i = 0; i < exportClause.childCount; i++) {
        const child = exportClause.child(i);
        if (child && child.type === 'export_specifier') {
          // Use the named fields rather than first-identifier scanning, same
          // fix as the import side: `export { X as Y } from '...'` must
          // register the LOCAL name Y (what importers of THIS file use),
          // while resolving the edge against the SOURCE module's real name
          // X. Grabbing the first identifier unconditionally returns X for
          // both, so an aliased re-export's local symbol was created under
          // the wrong name entirely (present in the graph, just as the
          // original name instead of the alias) -- any importer asking for
          // the alias found nothing declared.
          const nameNode = child.childForFieldName('name');
          const aliasNode = child.childForFieldName('alias');
          if (nameNode) {
            exportedNames.push({ sourceName: nameNode.text, localName: aliasNode ? aliasNode.text : nameNode.text });
          }
        }
      }
      
      const currentSymbolId = getCurrentSymbolId(context);
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      
      for (const { localName, sourceName } of exportedNames) {
        // Create a symbol node for the re-exported symbol, under the LOCAL
        // (possibly aliased) name -- that's the name other files import.
        const symbolId = `${context.filePath}::${localName}`;
        pushSymbol(context, {
          id: symbolId,
          name: localName,
          kind: 'export',
          filePath: context.filePath,
          startLine,
          endLine,
          exported: true,
        });
        
        // Create an edge from this re-export to the original symbol, under
        // the SOURCE module's real (un-aliased) name.
        const targetId = `${resolvedPath}::${sourceName}`;
        context.edges.push({
          source: symbolId,
          target: targetId,
          kind: 'imports',
          filePath: context.filePath,
          line: startLine,
        });
      }
    } else if (exportClause && !resolvedPath) {
      const reason = classifyUnresolvedImport(importPath, context.filePath, context.projectRoot);
      context.unresolvedImports.push({ fromFile: context.filePath, specifier: importPath, reason });
    } else if (isWildcard) {
      if (resolvedPath) {
        context.wildcardReExports.push(resolvedPath);
      } else {
        const reason = classifyUnresolvedImport(importPath, context.filePath, context.projectRoot);
        context.unresolvedImports.push({ fromFile: context.filePath, specifier: importPath, reason });
      }
    }
  }
}

function hasWildcardToken(node: Parser.SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === '*') return true;
  }
  return false;
}

function hasDirectToken(node: Parser.SyntaxNode, type: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i)?.type === type) return true;
  }
  return false;
}


function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;

  const currentSymbolId = getCurrentSymbolId(context);
  if (!currentSymbolId) return;

  if (functionNode.type === 'identifier') {
    // Bare identifier call, e.g. `foo()`. A name match is not enough: parameters,
    // destructured locals, and external imports can shadow a same-named graph symbol.
    const functionName = functionNode.text;

    if (hasUnmodeledLexicalBinding(node, functionName)) {
      recordUnresolvedCall(context, functionName, 'local-binding-not-modeled');
      return;
    }

    // Check if this function is imported
    if (context.typeFallbackImports.has(functionName)) {
      recordUnresolvedCall(context, functionName, 'unresolved-import-callee');
      return;
    }

    if (context.imports.has(functionName)) {
      const targetId = context.imports.get(functionName)!;
      context.edges.push({
        source: currentSymbolId,
        target: targetId,
        kind: 'calls',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
      });
      return;
    }

    if (context.externalImports.has(functionName)) {
      recordUnresolvedCall(context, functionName, 'unresolved-import-callee');
      return;
    }

    // Try to resolve immediately if the target is already declared
    const targetId = resolveLocalCallTarget(functionName, context);
    if (isSupportedLocalCallTarget(targetId, 'call', context)) {
      // Target already declared, resolve immediately
      context.edges.push({
        source: currentSymbolId,
        target: targetId,
        kind: 'calls',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
      });
    } else {
      // Forward reference - buffer for later resolution with current scope chain
      context.unresolvedCallEdges.push({
        source: currentSymbolId,
        functionName,
        line: node.startPosition.row + 1,
        scopeChain: [...context.currentScope],
        callKind: 'call',
      });
    }
    return;
  }

  if (functionNode.type === 'member_expression') {
    const object = functionNode.childForFieldName('object');
    const property = functionNode.childForFieldName('property');
    if (!property) return;
    const functionName = property.text;
    const line = node.startPosition.row + 1;

    if (object?.type === 'super') {
      const declaringClass = findEnclosingClassId(context);
      if (declaringClass) {
        context.pendingSuperCalls.push({
          source: currentSymbolId,
          declaringClass,
          methodName: functionName,
          line,
        });
      } else {
        recordUnresolvedCall(context, `super.${functionName}`, 'receiver-not-local');
      }
      return;
    }

    if (object?.type === 'this') {
      // The receiver IS known -- it's the enclosing class instance (or its base class).
      // Always buffer: a sibling member declared LATER in the class body must not be
      // mistaken for "not local" just because it hasn't been parsed yet. Resolution
      // (match vs. no edge) happens once in resolveUnresolvedCallEdges, after every
      // symbol in the file is declared -- see resolveScopedCallTarget.
      context.unresolvedCallEdges.push({
        source: currentSymbolId,
        functionName,
        line,
        scopeChain: [...context.currentScope],
        callKind: 'call',
        scopedOnly: true,
        receiverKind: 'this',
      });
      return;
    }

    const qualifiedName = functionNode.text;
    const rootName = qualifiedName.split('.')[0];
    const importedTarget = resolveQualifiedImportTarget(qualifiedName, context);
    const localNamespace = context.declaredSymbols.get(`${context.filePath}::${rootName}`)
      ?.some((declaration) => declaration.kind === 'module' || declaration.metadata?.namespace === true);
    if (importedTarget || localNamespace) {
      if (hasUnmodeledLexicalBinding(node, rootName)) {
        recordUnresolvedCall(context, qualifiedName, 'local-binding-not-modeled');
        return;
      }
      if (context.externalImports.has(rootName)) {
        recordUnresolvedCall(context, qualifiedName, 'unresolved-import-callee');
        return;
      }
      const targetId = importedTarget ?? resolveLocalCallTarget(qualifiedName, context);
      if (importedTarget) {
        const importedRoot = context.imports.get(rootName)!;
        const namespaceRoot = importedRoot.endsWith('::__file__')
          ? `${importedRoot.slice(0, -'__file__'.length)}${qualifiedName.split('.')[1]}`
          : importedRoot;
        context.pendingNamespaceCalls.push({
          source: currentSymbolId,
          namespaceRoot,
          target: targetId,
          callee: qualifiedName,
          line,
        });
      } else if (isSupportedLocalCallTarget(targetId, 'call', context)) {
        context.edges.push({
          source: currentSymbolId,
          target: targetId,
          kind: 'calls',
          filePath: context.filePath,
          line,
        });
      } else {
        context.unresolvedCallEdges.push({
          source: currentSymbolId,
          functionName: qualifiedName,
          line,
          scopeChain: [...context.currentScope],
          callKind: 'call',
        });
      }
      return;
    }

    // Any other receiver (identifier, chain expression, call result, etc.) --
    // unresolvable without a type checker. Do not guess; record instead.
    const receiverText = object ? object.text : '?';
    recordUnresolvedCall(context, `${receiverText}.${functionName}`, 'unresolvable-receiver');
    return;
  }
}

function recordUnresolvedCall(context: Context, callee: string, reason: UnresolvedCallReason): void {
  context.unresolvedCalls.push({ fromFile: context.filePath, callee, reason });
}

function processNewExpression(node: Parser.SyntaxNode, context: Context): void {
  const classNode = node.childForFieldName('constructor');
  if (!classNode || classNode.type !== 'identifier') return;
  
  const className = classNode.text;
  const currentSymbolId = getCurrentSymbolId(context);
  
  if (currentSymbolId) {
    if (hasUnmodeledLexicalBinding(node, className)) {
      recordUnresolvedCall(context, className, 'local-binding-not-modeled');
      return;
    }

    if (context.typeFallbackImports.has(className)) {
      recordUnresolvedCall(context, className, 'unresolved-import-callee');
      return;
    }

    if (context.imports.has(className)) {
      context.edges.push({
        source: currentSymbolId,
        target: context.imports.get(className)!,
        kind: 'calls',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
      });
      return;
    }

    if (context.externalImports.has(className)) {
      recordUnresolvedCall(context, className, 'unresolved-import-callee');
      return;
    }

    const targetId = resolveLocalCallTarget(className, context);
    if (isSupportedLocalCallTarget(targetId, 'new', context)) {
      context.edges.push({
        source: currentSymbolId,
        target: targetId,
        kind: 'calls',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
      });
      return;
    }

    context.unresolvedCallEdges.push({
      source: currentSymbolId,
      functionName: className,
      line: node.startPosition.row + 1,
      scopeChain: [...context.currentScope],
      callKind: 'new',
    });
  }
}

function collectBindingNames(pattern: Parser.SyntaxNode | null, names: Set<string>): void {
  if (!pattern) return;
  if (pattern.type === 'identifier' || pattern.type === 'shorthand_property_identifier_pattern') {
    names.add(pattern.text);
    return;
  }
  if (pattern.type === 'pair_pattern') {
    collectBindingNames(pattern.childForFieldName('value'), names);
    return;
  }
  if (pattern.type === 'assignment_pattern') {
    collectBindingNames(pattern.childForFieldName('left'), names);
    return;
  }
  for (let i = 0; i < pattern.namedChildCount; i++) {
    collectBindingNames(pattern.namedChild(i), names);
  }
}

function parameterBindsName(parameters: Parser.SyntaxNode | null, name: string): boolean {
  if (!parameters) return false;
  const names = new Set<string>();
  if (parameters.type === 'identifier') {
    names.add(parameters.text);
  } else {
    for (let i = 0; i < parameters.namedChildCount; i++) {
      const parameter = parameters.namedChild(i);
      collectBindingNames(
        parameter.childForFieldName('pattern') ?? parameter.childForFieldName('name'),
        names,
      );
    }
  }
  return names.has(name);
}

function declarationHasUnmodeledBinding(node: Parser.SyntaxNode, name: string): boolean {
  if (node.type !== 'lexical_declaration' && node.type !== 'variable_declaration') return false;
  for (let i = 0; i < node.namedChildCount; i++) {
    const declarator = node.namedChild(i);
    if (declarator.type !== 'variable_declarator') continue;
    const pattern = declarator.childForFieldName('name');
    if (!pattern || pattern.type === 'identifier') continue;
    const names = new Set<string>();
    collectBindingNames(pattern, names);
    if (names.has(name)) return true;
  }
  return false;
}

// Parameters, catch bindings, and destructured locals currently have no
// SymbolNode. If one shadows a graph symbol, resolving by name alone creates
// a confident but false edge. Inspect the lexical evidence at the call site
// and decline to guess instead.
function hasUnmodeledLexicalBinding(node: Parser.SyntaxNode, name: string): boolean {
  let child: Parser.SyntaxNode = node;
  let parent = node.parent;
  while (parent) {
    if (
      parent.type === 'method_definition'
      || parent.type === 'function_declaration'
      || parent.type === 'function_expression'
      || parent.type === 'generator_function'
      || parent.type === 'generator_function_declaration'
    ) {
      if (parameterBindsName(parent.childForFieldName('parameters'), name)) return true;
    } else if (parent.type === 'arrow_function') {
      if (
        parameterBindsName(
          parent.childForFieldName('parameters') ?? parent.childForFieldName('parameter'),
          name,
        )
      ) return true;
    } else if (parent.type === 'catch_clause') {
      const names = new Set<string>();
      collectBindingNames(parent.childForFieldName('parameter'), names);
      if (names.has(name)) return true;
    }

    if (parent.type === 'statement_block' || parent.type === 'program') {
      for (let i = 0; i < parent.namedChildCount; i++) {
        const sibling = parent.namedChild(i);
        if (sibling.id === child.id) break;
        if (declarationHasUnmodeledBinding(sibling, name)) return true;
      }
    }

    child = parent;
    parent = parent.parent;
  }
  return false;
}

const SCOPE_BOUNDARIES = new Set([
  'statement_block',
  'class_body',
  'arrow_function',
  'function_expression',
  'generator_function',
  'generator_function_declaration',
]);

function isExported(node: Parser.SyntaxNode | null): boolean {
  if (!node) return false;
  
  // Check if the node itself is an export
  if (node.type === 'export_statement') return true;
  
  // Check if any child is 'export' keyword
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'export') return true;
  }
  
  const parent = node.parent;
  if (!parent) return false;
  if (SCOPE_BOUNDARIES.has(parent.type)) return false; // never escape a scope
  return isExported(parent);
}

function findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      return child;
    }
  }
  return null;
}

function getCurrentSymbolId(context: Context): string | null {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope.join('.')}`;
}

function findEnclosingClassId(context: Context): string | null {
  for (let i = context.currentScope.length; i >= 1; i--) {
    const candidate = `${context.filePath}::${context.currentScope.slice(0, i).join('.')}`;
    if (context.declaredSymbols.get(candidate)?.some((symbol) => symbol.kind === 'class')) {
      return candidate;
    }
  }
  return null;
}

// Records a symbol and tracks its id so nested/scoped functions (e.g. a
// recursive helper declared inside another function) can still be resolved
// as call targets — see resolveLocalCallTarget.
function pushSymbol(context: Context, symbol: SymbolNode): void {
  context.symbols.push(symbol);
  context.declaredSymbolIds.add(symbol.id);
  const declarations = context.declaredSymbols.get(symbol.id) ?? [];
  declarations.push(symbol);
  context.declaredSymbols.set(symbol.id, declarations);
}

function isSupportedLocalCallTarget(
  targetId: string,
  callKind: 'call' | 'new',
  context: Context,
): boolean {
  const declarations = context.declaredSymbols.get(targetId) ?? [];
  const supportedKinds: ReadonlySet<SymbolKind> = callKind === 'new'
    ? new Set<SymbolKind>(['class', 'function', 'variable'])
    : new Set<SymbolKind>(['function', 'variable', 'class']);
  return declarations.some((declaration) => supportedKinds.has(declaration.kind));
}

function unsupportedLocalCallReason(
  targetId: string,
  context: Context,
): UnresolvedCallReason {
  const declarations = context.declaredSymbols.get(targetId) ?? [];
  return declarations.some((declaration) => declaration.kind === 'method' || declaration.kind === 'property')
    ? 'receiver-required'
    : 'no-local-target';
}

// Resolves a call to `functionName` against the current scope chain,
// innermost first, so a nested function (e.g. `dfs` declared inside
// `calculateCircularDepsScore`) resolves to its own scoped id rather than a
// non-existent flat `${file}::functionName` id. Falls back to the flat id
// (existing behavior) when no scoped declaration matches, e.g. for
// top-level or not-yet-analyzed functions.
function resolveLocalCallTarget(functionName: string, context: Context): string {
  const scope = context.currentScope;
  for (let i = scope.length; i >= 0; i--) {
    const candidateId =
      i > 0
        ? `${context.filePath}::${scope.slice(0, i).join('.')}.${functionName}`
        : `${context.filePath}::${functionName}`;
    if (context.declaredSymbolIds.has(candidateId)) {
      return candidateId;
    }
  }
  return `${context.filePath}::${functionName}`;
}

// Same scope-chain walk as resolveLocalCallTarget, but for this./super. member calls:
// the receiver is known (the enclosing instance), so a match must be a real declared
// member at SOME class/function scope level. The bare `${file}::functionName` guess
// (i === 0, no scope qualifier at all) is excluded -- that would mean "this refers to
// a module-level function," which is never true, and is exactly the wrong-edge shape
// #14 identified. Returns null (no edge) when nothing at any qualified level matches.
function resolveScopedCallTarget(functionName: string, context: Context): string | null {
  const scope = context.currentScope;
  for (let i = scope.length; i >= 1; i--) {
    const candidateId = `${context.filePath}::${scope.slice(0, i).join('.')}.${functionName}`;
    if (context.declaredSymbolIds.has(candidateId)) {
      return candidateId;
    }
  }
  return null;
}

// Resolves all buffered call edges after the entire file has been parsed.
// This handles forward references where a function calls another function
// that is declared later in the file.
function resolveUnresolvedCallEdges(context: Context): void {
  for (const unresolved of context.unresolvedCallEdges) {
    // Temporarily set the scope chain to what it was when the call was made
    const savedScope = context.currentScope;
    context.currentScope = unresolved.scopeChain;

    if (unresolved.scopedOnly) {
      // this./super. member call, buffered because its target wasn't declared yet at
      // call time. Now that every symbol in the file is known, resolve for real -- if
      // nothing matches, record unresolved instead of guessing (no flat fallback here).
      const targetId = resolveScopedCallTarget(unresolved.functionName, context);
      context.currentScope = savedScope;
      if (targetId !== null) {
        context.edges.push({
          source: unresolved.source,
          target: targetId,
          kind: 'calls',
          filePath: context.filePath,
          line: unresolved.line,
        });
      } else {
        context.unresolvedCalls.push({
          fromFile: context.filePath,
          callee: `${unresolved.receiverKind ?? 'this'}.${unresolved.functionName}`,
          reason: 'receiver-not-local',
        });
      }
      continue;
    }

    // Resolve the target using the captured scope chain
    const targetId = resolveLocalCallTarget(unresolved.functionName, context);

    // Restore the original scope
    context.currentScope = savedScope;

    if (isSupportedLocalCallTarget(targetId, unresolved.callKind, context)) {
      context.edges.push({
        source: unresolved.source,
        target: targetId,
        kind: 'calls',
        filePath: context.filePath,
        line: unresolved.line,
      });
    } else {
      context.unresolvedCalls.push({
        fromFile: context.filePath,
        callee: unresolved.functionName,
        reason: unsupportedLocalCallReason(targetId, context),
      });
    }
  }
  
  // Clear the buffer
  context.unresolvedCallEdges = [];
}

// Export as LanguageParser interface
export const typescriptParser: LanguageParser = {
  name: 'typescript',
  extensions: ['.ts', '.tsx'],
  parseFile: parseTypeScriptFile
};

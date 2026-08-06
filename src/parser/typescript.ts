import { getParser } from './wasm-init.js';
import { SymbolNode, SymbolEdge, ParsedFile, SymbolKind, EdgeKind, LanguageParser } from './types.js';
import { resolveImportPath } from './resolver.js';

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  imports: Map<string, string>; // Map<importedName, resolvedSymbolId>
  externalImports: Map<string, string>; // Map<importedName, moduleSpecifier> for node_modules / unresolved imports
  declaredSymbolIds: Set<string>; // every symbol id declared so far, used to resolve calls to nested/scoped functions
  unresolvedCallEdges: Array<{source: string, functionName: string, line: number, scopeChain: string[]}>; // buffered call edges waiting for forward-reference resolution
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
    declaredSymbolIds: new Set(),
    unresolvedCallEdges: [],
  };
  
  walkNode(tree.rootNode, context);
  
  // Resolve all buffered call edges now that all symbols have been declared
  resolveUnresolvedCallEdges(context);
  
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
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
  }
  return false;
}

function processFunctionDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const scope = context.currentScope.length > 0 ? context.currentScope.join('.') : undefined;
  
  const symbolId = `${context.filePath}::${scope ? scope + '.' : ''}${name}`;
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'function',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
    scope,
  });
  
  // Enter function scope for processing nested calls
  context.currentScope.push(name);
  
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
  const localImport = context.imports.get(typeName);
  if (localImport) return localImport;
  if (context.externalImports.has(typeName)) return `external::${typeName}`;
  return `${context.filePath}::${typeName}`;
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
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  
  const symbolId = `${context.filePath}::${name}`;
  
  // Angular: capture the @Component({ selector: '...' }) value so the HTML
  // template pairing pass can resolve template tags back to this class.
  const angularSelector = extractAngularSelector(node);
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
    ...(angularSelector ? { metadata: { angularSelector } } : {}),
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
          }
        }
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

function processMethodDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const className = context.currentScope[context.currentScope.length - 1];
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
  });
  
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
  const className = context.currentScope[context.currentScope.length - 1];
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
  });
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
      });
      
      // If it's an arrow function, process its body with the declared name
      // pushed as scope. Otherwise (e.g. `const x = foo();`), still walk the
      // initializer — with the scope unchanged — so call expressions inside
      // non-arrow initializers keep producing `calls` edges now that this
      // function owns its entire subtree (the outer generic recursion no
      // longer reaches it).
      if (value) {
        if (kind === 'function') {
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
  
  const symbolId = `${context.filePath}::${name}`;
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'type_alias',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
  });
}

function processInterfaceDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  
  const symbolId = `${context.filePath}::${name}`;
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'interface',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
  });
}

function processEnumDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  
  const symbolId = `${context.filePath}::${name}`;
  
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: 'enum',
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
  });
}

interface ImportBinding {
  importedName: string; // the name as exported by the source module
  localName: string;    // the name bound in this file's scope
}

function processImportStatement(node: Parser.SyntaxNode, context: Context): void {
  // Get the import source
  const source = node.childForFieldName('source');
  if (!source) return;
  
  const importPath = source.text.slice(1, -1); // Remove quotes
  const resolvedPath = resolveImportPath(importPath, context.filePath, context.projectRoot);
  
  // Locate the clause by node type rather than positional index — `import
  // type { ... }` shifts every subsequent child by one slot because `type`
  // occupies index 1, so `node.child(1)` would grab the `type` keyword
  // instead of the `import_clause`.
  const importClause = findChildByType(node, 'import_clause');
  if (!importClause) return;
  
  const importBindings: ImportBinding[] = [];
  
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
        importBindings.push({ importedName, localName });
      }
    }
  }
  
  // Handle default import
  const identifier = findChildByType(importClause, 'identifier');
  if (identifier) {
    importBindings.push({ importedName: identifier.text, localName: identifier.text });
  }
  
  // Handle namespace import (import * as X)
  const namespaceImport = findChildByType(importClause, 'namespace_import');
  if (namespaceImport) {
    const alias = findChildByType(namespaceImport, 'identifier');
    if (alias) {
      importBindings.push({ importedName: alias.text, localName: alias.text });
    }
  }
  
  // Create edges for each imported symbol
  if (resolvedPath) {
    const currentSymbolId = getCurrentSymbolId(context);
    
    for (const { importedName, localName } of importBindings) {
      const targetId = `${resolvedPath}::${importedName}`;
      
      // Track the import for later call resolution, keyed by the local
      // binding so calls to `beta()` resolve correctly for `alpha as beta`.
      context.imports.set(localName, targetId);
      
      context.edges.push({
        source: currentSymbolId || `${context.filePath}::__file__`,
        target: targetId,
        kind: 'imports',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
      });
    }
  } else {
    // Unresolved (node_modules / ambient) — remember the local names so
    // dependency injection resolution can mark them as external rather
    // than local.
    for (const { localName } of importBindings) {
      if (!context.externalImports.has(localName)) {
        context.externalImports.set(localName, importPath);
      }
    }
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
    if (exportClause && resolvedPath) {
      const exportedNames: string[] = [];
      
      for (let i = 0; i < exportClause.childCount; i++) {
        const child = exportClause.child(i);
        if (child && child.type === 'export_specifier') {
          // export_specifier contains an identifier child
          const identifier = findChildByType(child, 'identifier');
          if (identifier) {
            exportedNames.push(identifier.text);
          }
        }
      }
      
      const currentSymbolId = getCurrentSymbolId(context);
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      
      for (const exportedName of exportedNames) {
        // Create a symbol node for the re-exported symbol
        const symbolId = `${context.filePath}::${exportedName}`;
        pushSymbol(context, {
          id: symbolId,
          name: exportedName,
          kind: 'export',
          filePath: context.filePath,
          startLine,
          endLine,
          exported: true,
        });
        
        // Create an edge from this re-export to the original symbol
        const targetId = `${resolvedPath}::${exportedName}`;
        context.edges.push({
          source: symbolId,
          target: targetId,
          kind: 'imports',
          filePath: context.filePath,
          line: startLine,
        });
      }
    }
  }
}

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;
  
  let functionName: string | null = null;
  
  if (functionNode.type === 'identifier') {
    functionName = functionNode.text;
  } else if (functionNode.type === 'member_expression') {
    // Handle this.method() or object.method()
    const property = functionNode.childForFieldName('property');
    if (property) {
      functionName = property.text;
    }
  }
  
  if (functionName) {
    const currentSymbolId = getCurrentSymbolId(context);
    if (currentSymbolId) {
      // Check if this function is imported
      if (context.imports.has(functionName)) {
        const targetId = context.imports.get(functionName)!;
        context.edges.push({
          source: currentSymbolId,
          target: targetId,
          kind: 'calls',
          filePath: context.filePath,
          line: node.startPosition.row + 1,
        });
      } else {
        // Try to resolve immediately if the target is already declared
        const targetId = resolveLocalCallTarget(functionName, context);
        if (context.declaredSymbolIds.has(targetId)) {
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
          });
        }
      }
    }
  }
}

function processNewExpression(node: Parser.SyntaxNode, context: Context): void {
  // Get the class being instantiated
  const classNode = node.child(1);
  if (!classNode || classNode.type !== 'identifier') return;
  
  const className = classNode.text;
  const currentSymbolId = getCurrentSymbolId(context);
  
  if (currentSymbolId) {
    const targetId = resolveLocalCallTarget(className, context);
    
    context.edges.push({
      source: currentSymbolId,
      target: targetId,
      kind: 'calls',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
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

// Records a symbol and tracks its id so nested/scoped functions (e.g. a
// recursive helper declared inside another function) can still be resolved
// as call targets — see resolveLocalCallTarget.
function pushSymbol(context: Context, symbol: SymbolNode): void {
  context.symbols.push(symbol);
  context.declaredSymbolIds.add(symbol.id);
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

// Resolves all buffered call edges after the entire file has been parsed.
// This handles forward references where a function calls another function
// that is declared later in the file.
function resolveUnresolvedCallEdges(context: Context): void {
  for (const unresolved of context.unresolvedCallEdges) {
    // Temporarily set the scope chain to what it was when the call was made
    const savedScope = context.currentScope;
    context.currentScope = unresolved.scopeChain;
    
    // Resolve the target using the captured scope chain
    const targetId = resolveLocalCallTarget(unresolved.functionName, context);
    
    // Restore the original scope
    context.currentScope = savedScope;
    
    // Add the resolved edge
    context.edges.push({
      source: unresolved.source,
      target: targetId,
      kind: 'calls',
      filePath: context.filePath,
      line: unresolved.line,
    });
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

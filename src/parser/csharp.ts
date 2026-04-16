import { getParser } from './wasm-init.js';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { dirname, join, extname, resolve, basename } from 'path';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  currentClass: string | null;
  currentNamespace: string | null;
  imports: Map<string, string>; // Map<importedName, resolvedSymbolId>
  isCsproj: boolean;
}

export function parseCSharpFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Handle .csproj files as XML — extract ProjectReference and PackageReference edges
  if (filePath.endsWith('.csproj')) {
    return parseCsprojFile(filePath, sourceCode, projectRoot);
  }

  const parser = getParser('c_sharp');
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });

  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentNamespace: null,
    imports: new Map(),
    isCsproj: false,
  };

  walkNode(tree.rootNode, context);

  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

function walkNode(node: Parser.SyntaxNode, context: Context): void {
  processNode(node, context);

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode(child, context);
    }
  }
}

function processNode(node: Parser.SyntaxNode, context: Context): void {
  switch (node.type) {
    case 'namespace_declaration':
      processNamespaceDeclaration(node, context);
      break;
    case 'file_scoped_namespace_declaration':
      processFileScopedNamespace(node, context);
      break;
    case 'class_declaration':
      processClassDeclaration(node, context);
      break;
    case 'interface_declaration':
      processInterfaceDeclaration(node, context);
      break;
    case 'struct_declaration':
      processStructDeclaration(node, context);
      break;
    case 'enum_declaration':
      processEnumDeclaration(node, context);
      break;
    case 'record_declaration':
      processRecordDeclaration(node, context);
      break;
    case 'delegate_declaration':
      processDelegateDeclaration(node, context);
      break;
    case 'method_declaration':
      processMethodDeclaration(node, context);
      break;
    case 'constructor_declaration':
      processConstructorDeclaration(node, context);
      break;
    case 'property_declaration':
      processPropertyDeclaration(node, context);
      break;
    case 'event_field_declaration':
      processEventFieldDeclaration(node, context);
      break;
    case 'indexer_declaration':
      processIndexerDeclaration(node, context);
      break;
    case 'using_directive':
      processUsingDirective(node, context);
      break;
    case 'global_statement':
      processGlobalStatement(node, context);
      break;
    case 'invocation_expression':
      processCallExpression(node, context);
      break;
  }
}

// ─── Namespace ────────────────────────────────────────────────

function processNamespaceDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'module',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });

  const oldNamespace = context.currentNamespace;
  context.currentNamespace = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentNamespace = oldNamespace;
}

function processFileScopedNamespace(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'module',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });

  // File-scoped namespace: everything after the declaration is in this namespace
  context.currentNamespace = name;
  // Don't push to currentScope — children are siblings, not nested
}

// ─── Types ────────────────────────────────────────────────────

function processClassDeclaration(node: Parser.SyntaxNode, context: Context): void {
  processTypeDeclaration(node, context, 'class');
}

function processInterfaceDeclaration(node: Parser.SyntaxNode, context: Context): void {
  processTypeDeclaration(node, context, 'interface');
}

function processStructDeclaration(node: Parser.SyntaxNode, context: Context): void {
  processTypeDeclaration(node, context, 'class'); // struct → class kind
}

function processRecordDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // record / record struct / record class — all map to 'class'
  processTypeDeclaration(node, context, 'class');
}

function processTypeDeclaration(
  node: Parser.SyntaxNode,
  context: Context,
  kind: 'class' | 'interface'
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  // Strip generic type parameters: Repository<T> → Repository
  let name = nodeText(nameNode, context);
  const angleBracketIdx = name.indexOf('<');
  if (angleBracketIdx > 0) {
    name = name.substring(0, angleBracketIdx);
  }

  const exported = hasModifier(node, context, 'public') || hasModifier(node, context, 'internal');
  const scope = context.currentClass || undefined;
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });

  // Process base types (inheritance / implementation)
  const baseList = findChildByType(node, 'base_list');
  if (baseList) {
    for (let i = 0; i < baseList.childCount; i++) {
      const child = baseList.child(i);
      if (!child) continue;
      // base_list children are typically simple_base_type or generic_name etc.
      // We look for identifiers or generic_name nodes
      if (child.type === 'simple_base_type' || child.type === 'identifier' || child.type === 'generic_name' || child.type === 'qualified_name') {
        let baseName = extractBaseTypeName(child, context);
        if (baseName) {
          const baseId = resolveSymbol(baseName, context);
          if (baseId) {
            // Interfaces start with 'I' convention — use 'implements'
            const edgeKind = baseName.startsWith('I') && baseName.length > 1 && baseName[1] === baseName[1].toUpperCase()
              ? 'implements' as const
              : 'inherits' as const;
            context.edges.push({
              source: symbolId,
              target: baseId,
              kind: edgeKind,
              filePath: context.filePath,
              line: child.startPosition.row + 1,
            });
          }
        }
      }
    }
  }

  // Enter class scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

function processEnumDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const exported = hasModifier(node, context, 'public') || hasModifier(node, context, 'internal');
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'enum',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });

  // Extract enum members
  const body = findChildByType(node, 'enum_member_declaration_list');
  if (body) {
    const members = findChildrenByType(body, 'enum_member_declaration');
    for (const member of members) {
      const memberNameNode = member.childForFieldName('name');
      if (!memberNameNode) continue;
      const memberName = nodeText(memberNameNode, context);
      const memberId = `${context.filePath}::${name}.${memberName}`;

      context.symbols.push({
        id: memberId,
        name: memberName,
        kind: 'constant',
        filePath: context.filePath,
        startLine: member.startPosition.row + 1,
        endLine: member.endPosition.row + 1,
        exported,
        scope: name,
      });
    }
  }
}

function processDelegateDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  let name = nodeText(nameNode, context);
  const angleBracketIdx = name.indexOf('<');
  if (angleBracketIdx > 0) name = name.substring(0, angleBracketIdx);

  const exported = hasModifier(node, context, 'public') || hasModifier(node, context, 'internal');
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'type_alias',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });
}

// ─── Members ──────────────────────────────────────────────────

function processMethodDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const exported = hasModifier(node, context, 'public');
  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? 'method' : 'function',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });

  // Enter method scope
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);

  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

function processConstructorDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const exported = hasModifier(node, context, 'public');
  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'method',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });

  // Enter constructor scope
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);

  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

function processPropertyDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const exported = hasModifier(node, context, 'public');
  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'property',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });
}

function processEventFieldDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // event EventHandler OnClick;
  const varDecl = findChildByType(node, 'variable_declaration');
  if (!varDecl) return;

  const declarator = findChildByType(varDecl, 'variable_declarator');
  if (!declarator) return;

  const nameNode = declarator.childForFieldName('name') || findChildByType(declarator, 'identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const exported = hasModifier(node, context, 'public');
  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'property',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });
}

function processIndexerDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const exported = hasModifier(node, context, 'public');
  const scope = context.currentClass || undefined;
  const name = 'this[]';
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'property',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });
}

// ─── Imports ──────────────────────────────────────────────────

function processUsingDirective(node: Parser.SyntaxNode, context: Context): void {
  // using System.Collections.Generic;
  // using static System.Math;
  // global using System.Text.Json;
  // using Json = System.Text.Json;

  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);

  // Check if this is a project-internal namespace reference
  // We create a file-level import edge for local namespaces
  const resolvedPath = resolveCSharpNamespace(name, context.filePath, context.projectRoot);

  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    const targetId = `${resolvedPath}::__file__`;

    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: 'imports',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
}

// ─── Top-level statements ─────────────────────────────────────

function processGlobalStatement(node: Parser.SyntaxNode, context: Context): void {
  // C# 9+ top-level statements — mark as entry point
  const symbolId = `${context.filePath}::__toplevel__`;

  // Only add once per file
  if (context.symbols.find(s => s.id === symbolId)) return;

  context.symbols.push({
    id: symbolId,
    name: '__toplevel__',
    kind: 'function',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });
}

// ─── Calls ────────────────────────────────────────────────────

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;

  let calleeName: string | null = null;

  if (functionNode.type === 'identifier') {
    calleeName = nodeText(functionNode, context);
  } else if (functionNode.type === 'member_access_expression') {
    const nameNode = functionNode.childForFieldName('name');
    if (nameNode) {
      calleeName = nodeText(nameNode, context);
    }
  }

  if (!calleeName) return;

  // Skip common BCL methods
  const builtins = ['ToString', 'Equals', 'GetHashCode', 'GetType', 'Console', 'Write', 'WriteLine', 'Format', 'Parse', 'TryParse'];
  if (builtins.includes(calleeName)) return;

  const callerId = getCurrentSymbolId(context);
  if (!callerId) return;

  const calleeId = resolveSymbol(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: 'calls',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
}

// ─── .csproj XML parsing ──────────────────────────────────────

function parseCsprojFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const lines = sourceCode.split('\n');

  // Create a file-level symbol for the project
  const projectName = basename(filePath, '.csproj');
  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: 'module',
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true,
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // ProjectReference: <ProjectReference Include="../MyLib/MyLib.csproj"/>
    const projectRefMatch = line.match(/<ProjectReference\s+Include\s*=\s*"([^"]+)"/);
    if (projectRefMatch) {
      const refPath = projectRefMatch[1];
      // Resolve relative to the .csproj file's directory
      const csprojDir = dirname(join(projectRoot, filePath));
      const resolvedRef = resolve(csprojDir, refPath);
      const relativeRef = resolvedRef.startsWith(projectRoot + '/')
        ? resolvedRef.substring(projectRoot.length + 1)
        : null;

      if (relativeRef && existsSync(resolvedRef)) {
        edges.push({
          source: `${filePath}::__file__`,
          target: `${relativeRef}::__file__`,
          kind: 'imports',
          filePath,
          line: lineNum,
        });
      }
    }

    // PackageReference: <PackageReference Include="Newtonsoft.Json" Version="13.0.1"/>
    const packageRefMatch = line.match(/<PackageReference\s+Include\s*=\s*"([^"]+)"/);
    if (packageRefMatch) {
      const packageName = packageRefMatch[1];
      const versionMatch = line.match(/Version\s*=\s*"([^"]+)"/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      symbols.push({
        id: `${filePath}::pkg:${packageName}`,
        name: `${packageName}@${version}`,
        kind: 'import',
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false,
      });
    }
  }

  return { filePath, symbols, edges };
}

// ─── Helpers ──────────────────────────────────────────────────

function resolveCSharpNamespace(
  namespace: string,
  currentFile: string,
  projectRoot: string
): string | null {
  // Try to find a .cs file whose content declares this namespace
  // Simple heuristic: convert namespace to directory path and look for .cs files
  const namespacePath = namespace.replace(/\./g, '/');
  const candidates = [
    join(projectRoot, namespacePath),
    join(projectRoot, 'src', namespacePath),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const stats = statSync(candidate);
        if (stats.isDirectory()) {
          const csFiles = readdirSync(candidate).filter((f: string) => f.endsWith('.cs'));
          if (csFiles.length > 0) {
            // Return the first .cs file as representative
            const fullPath = join(candidate, csFiles[0]);
            return fullPath.substring(projectRoot.length + 1);
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return null;
}

function resolveSymbol(name: string, context: Context): string | null {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }

  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find(s => s.id === currentFileId)) {
    return currentFileId;
  }

  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find(s => s.id === classMethodId)) {
      return classMethodId;
    }
  }

  return null;
}

function hasModifier(node: Parser.SyntaxNode, context: Context, modifier: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'modifier' && nodeText(child, context) === modifier) {
      return true;
    }
  }
  // Default: if no explicit access modifier, treat as internal (exported within assembly)
  if (modifier === 'internal') {
    const hasExplicitAccess = ['public', 'private', 'protected', 'internal'].some(m => {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === 'modifier' && nodeText(child, context) === m) return true;
      }
      return false;
    });
    return !hasExplicitAccess; // No explicit modifier = internal by default in C#
  }
  return false;
}

function extractBaseTypeName(node: Parser.SyntaxNode, context: Context): string | null {
  const text = nodeText(node, context).trim();
  if (!text || text === ':' || text === ',') return null;

  // Strip generic parameters: IRepository<T> → IRepository
  const angleBracketIdx = text.indexOf('<');
  const name = angleBracketIdx > 0 ? text.substring(0, angleBracketIdx) : text;

  // Strip qualified name prefix: System.Collections.Generic.IList → IList
  const dotIdx = name.lastIndexOf('.');
  return dotIdx >= 0 ? name.substring(dotIdx + 1) : name;
}

function findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

function findChildrenByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  const results: Parser.SyntaxNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) results.push(child);
  }
  return results;
}

function nodeText(node: Parser.SyntaxNode, context: Context): string {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}

function getCurrentSymbolId(context: Context): string | null {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}

// Export as LanguageParser interface
export const csharpParser: LanguageParser = {
  name: 'csharp',
  extensions: ['.cs', '.csx', '.csproj'],
  parseFile: parseCSharpFile,
};

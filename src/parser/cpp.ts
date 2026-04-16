import { getParser } from './wasm-init.js';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { dirname, join, relative, basename, extname } from 'path';
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
  imports: Map<string, string>;
  isBuildFile: boolean;
}

export function parseCppFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Handle CMakeLists.txt
  if (basename(filePath) === 'CMakeLists.txt') {
    return parseCMakeLists(filePath, sourceCode, projectRoot);
  }

  // Handle conanfile.txt
  if (basename(filePath) === 'conanfile.txt') {
    return parseConanfileTxt(filePath, sourceCode, projectRoot);
  }

  // Handle vcpkg.json
  if (basename(filePath) === 'vcpkg.json') {
    return parseVcpkgJson(filePath, sourceCode, projectRoot);
  }

  const parser = getParser('cpp');
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
    isBuildFile: false,
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
    case 'namespace_definition':
      processNamespaceDefinition(node, context);
      break;
    case 'class_specifier':
      processClassSpecifier(node, context);
      break;
    case 'struct_specifier':
      processStructSpecifier(node, context);
      break;
    case 'union_specifier':
      processUnionSpecifier(node, context);
      break;
    case 'enum_specifier':
      processEnumSpecifier(node, context);
      break;
    case 'function_definition':
      processFunctionDefinition(node, context);
      break;
    case 'declaration':
      processDeclaration(node, context);
      break;
    case 'alias_declaration':
      processAliasDeclaration(node, context);
      break;
    case 'type_definition':
      processTypeDefinition(node, context);
      break;
    case 'preproc_include':
      processIncludeDirective(node, context);
      break;
    case 'preproc_def':
    case 'preproc_function_def':
      processMacroDefinition(node, context);
      break;
    case 'template_declaration':
      processTemplateDeclaration(node, context);
      break;
    case 'call_expression':
      processCallExpression(node, context);
      break;
    case 'static_assert_declaration':
      processStaticAssert(node, context);
      break;
  }
}

// ─── Namespace ────────────────────────────────────────────────

function processNamespaceDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  // Anonymous namespace — skip naming but still walk body
  const name = nameNode ? nodeText(nameNode, context) : '<anonymous>';

  if (name !== '<anonymous>') {
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
  }

  const oldNamespace = context.currentNamespace;
  context.currentNamespace = name !== '<anonymous>' ? name : oldNamespace;
  if (name !== '<anonymous>') context.currentScope.push(name);

  const body = node.childForFieldName('body') || findChildByType(node, 'declaration_list');
  if (body) {
    walkNode(body, context);
  }

  if (name !== '<anonymous>') context.currentScope.pop();
  context.currentNamespace = oldNamespace;
}

// ─── Types ────────────────────────────────────────────────────

function processClassSpecifier(node: Parser.SyntaxNode, context: Context): void {
  processTypeSpecifier(node, context, 'class');
}

function processStructSpecifier(node: Parser.SyntaxNode, context: Context): void {
  processTypeSpecifier(node, context, 'class');
}

function processUnionSpecifier(node: Parser.SyntaxNode, context: Context): void {
  processTypeSpecifier(node, context, 'class');
}

function processTypeSpecifier(
  node: Parser.SyntaxNode,
  context: Context,
  kind: 'class' | 'interface'
): void {
  let nameNode = node.childForFieldName('name');
  let name: string | null = null;

  if (nameNode) {
    name = nodeText(nameNode, context);
    // Strip template parameters: Vector<T> → Vector
    const angleBracketIdx = name.indexOf('<');
    if (angleBracketIdx > 0) {
      name = name.substring(0, angleBracketIdx);
    }
  }

  // If no name, check if this is a typedef: typedef struct { ... } Name;
  if (!name) {
    const parent = node.parent;
    if (parent && parent.type === 'type_definition') {
      const typedefDecl = parent.childForFieldName('declarator');
      if (typedefDecl) {
        name = extractIdentifierFromDeclarator(typedefDecl, context);
      }
    }
  }

  if (!name) return;

  const exported = true; // In C++ headers, types are generally exported
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

  // Process base classes
  const baseClause = findChildByType(node, 'base_class_clause');
  if (baseClause) {
    processBaseClassClause(baseClause, symbolId, context);
  }

  // Enter class scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = node.childForFieldName('body') || findChildByType(node, 'field_declaration_list');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

function processBaseClassClause(node: Parser.SyntaxNode, sourceId: string, context: Context): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    // Look for type identifiers in base class specifiers
    if (child.type === 'base_class_specifier' || child.type === 'type_identifier' ||
        child.type === 'qualified_identifier' || child.type === 'template_type') {
      const baseName = extractTypeName(child, context);
      if (baseName) {
        const baseId = resolveSymbol(baseName, context);
        if (baseId) {
          context.edges.push({
            source: sourceId,
            target: baseId,
            kind: 'inherits',
            filePath: context.filePath,
            line: child.startPosition.row + 1,
          });
        }
      }
    }
  }
}

function processEnumSpecifier(node: Parser.SyntaxNode, context: Context): void {
  let nameNode = node.childForFieldName('name');
  let name: string | null = null;

  if (nameNode) {
    name = nodeText(nameNode, context);
  }

  // If no name, check for typedef
  if (!name) {
    const parent = node.parent;
    if (parent && parent.type === 'type_definition') {
      const typedefDecl = parent.childForFieldName('declarator');
      if (typedefDecl) {
        name = extractIdentifierFromDeclarator(typedefDecl, context);
      }
    }
  }

  if (!name) return;

  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'enum',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });

  // Extract enum constants from enumerator_list
  const body = node.childForFieldName('body') || findChildByType(node, 'enumerator_list');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child && child.type === 'enumerator') {
        const constNameNode = child.childForFieldName('name');
        if (!constNameNode) continue;
        const constName = nodeText(constNameNode, context);
        const constId = `${context.filePath}::${name}.${constName}`;

        context.symbols.push({
          id: constId,
          name: constName,
          kind: 'constant',
          filePath: context.filePath,
          startLine: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
          exported: true,
          scope: name,
        });
      }
    }
  }
}

// ─── Functions ────────────────────────────────────────────────

function processFunctionDefinition(node: Parser.SyntaxNode, context: Context): void {
  const declarator = node.childForFieldName('declarator');
  if (!declarator) return;

  const nameNode = extractFunctionName(declarator);
  if (!nameNode) return;

  let name = nodeText(nameNode, context);

  // Handle operator overloads: operator+, operator==, etc.
  if (name === 'operator') {
    // Grab the operator symbol that follows
    const fullText = nodeText(declarator, context);
    const opMatch = fullText.match(/operator\s*([^\s(]+)/);
    if (opMatch) {
      name = `operator${opMatch[1]}`;
    }
  }

  // Handle destructor: ~ClassName
  const fullDeclText = nodeText(declarator, context);
  if (fullDeclText.includes('~')) {
    const tildeMatch = fullDeclText.match(/~\s*(\w+)/);
    if (tildeMatch) {
      name = `~${tildeMatch[1]}`;
    }
  }

  // Detect constructor: function name matches current class
  const isConstructor = context.currentClass !== null && name === context.currentClass;
  const isDestructor = name.startsWith('~');

  const isStatic = hasStorageClass(node, 'static', context);
  const exported = !isStatic;
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

  // Enter function scope
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);

  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

// ─── Declarations ─────────────────────────────────────────────

function processDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Inside a class body — handle field declarations
  if (context.currentClass) {
    processFieldDeclaration(node, context);
    return;
  }

  // Top-level declarations — global variables, function declarations
  const parent = node.parent;
  if (!parent || (parent.type !== 'translation_unit' && parent.type !== 'declaration_list')) {
    return;
  }

  const declarator = node.childForFieldName('declarator');
  if (!declarator) return;

  // Check if this is a function declaration (has function_declarator)
  if (containsType(declarator, 'function_declarator')) {
    // This is a function prototype — skip, will be handled by function_definition
    return;
  }

  const name = extractIdentifierFromDeclarator(declarator, context);
  if (!name) return;

  const isStatic = hasStorageClass(node, 'static', context);
  const isConst = nodeText(node, context).includes('const');
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: isConst ? 'constant' : 'variable',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: !isStatic,
  });
}

function processFieldDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const declarator = node.childForFieldName('declarator');
  if (!declarator) return;

  // Skip function declarations inside classes (prototypes)
  if (containsType(declarator, 'function_declarator')) {
    // This is a member function declaration — create a method symbol
    const fnName = extractFunctionName(declarator);
    if (fnName) {
      let name = nodeText(fnName, context);
      const scope = context.currentClass || undefined;
      const symbolId = scope
        ? `${context.filePath}::${scope}.${name}`
        : `${context.filePath}::${name}`;

      // Don't duplicate if already processed by function_definition
      if (!context.symbols.find(s => s.id === symbolId)) {
        const exported = !hasAccessSpecifier(node, 'private', context);
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
      }
    }
    return;
  }

  const name = extractIdentifierFromDeclarator(declarator, context);
  if (!name) return;

  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  const isConst = nodeText(node, context).includes('const');
  const isStatic = nodeText(node, context).includes('static');

  context.symbols.push({
    id: symbolId,
    name,
    kind: isConst && isStatic ? 'constant' : 'property',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: !hasAccessSpecifier(node, 'private', context),
    scope,
  });
}

function processAliasDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // using MyVec = std::vector<int>;
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'type_alias',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });
}

function processTypeDefinition(node: Parser.SyntaxNode, context: Context): void {
  const typeNode = node.childForFieldName('type');
  if (!typeNode) return;

  // struct/enum/union typedef handled in their own processors
  if (typeNode.type === 'struct_specifier' || typeNode.type === 'enum_specifier' || typeNode.type === 'union_specifier') {
    return;
  }

  const declarator = node.childForFieldName('declarator');
  if (!declarator) return;

  const name = extractIdentifierFromDeclarator(declarator, context);
  if (!name) return;

  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'type_alias',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });
}

function processTemplateDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // template<typename T> class/struct/function
  // The inner declaration is already a class_specifier, struct_specifier, or function_definition
  // which will be picked up by processNode. No special handling needed here
  // since walkNode will visit the children.
}

function processStaticAssert(node: Parser.SyntaxNode, context: Context): void {
  const symbolId = `${context.filePath}::static_assert:${node.startPosition.row + 1}`;

  context.symbols.push({
    id: symbolId,
    name: 'static_assert',
    kind: 'constant',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: false,
  });
}

function processMacroDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const kind = node.type === 'preproc_function_def' ? 'function' : 'constant';

  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });
}

// ─── Includes / Imports ───────────────────────────────────────

function processIncludeDirective(node: Parser.SyntaxNode, context: Context): void {
  const pathNode = node.childForFieldName('path');
  if (!pathNode) return;

  const pathText = nodeText(pathNode, context);
  const isLocalInclude = pathText.startsWith('"') && pathText.endsWith('"');

  if (!isLocalInclude) {
    // System include — record as import symbol but no file edge
    const includeName = pathText.replace(/[<>"]/g, '');
    const symbolId = `${context.filePath}::include:${includeName}`;
    context.symbols.push({
      id: symbolId,
      name: includeName,
      kind: 'import',
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false,
    });
    return;
  }

  const includePath = pathText.slice(1, -1);
  const resolvedFiles = resolveIncludePath(includePath, context.filePath, context.projectRoot);

  if (resolvedFiles.length === 0) return;

  const sourceId = `${context.filePath}::__file__`;

  for (const targetPath of resolvedFiles) {
    const targetId = `${targetPath}::__file__`;

    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: 'imports',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
}

// ─── Calls ────────────────────────────────────────────────────

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  if (context.currentScope.length === 0) return;

  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;

  let calleeName: string | null = null;

  if (functionNode.type === 'identifier') {
    calleeName = nodeText(functionNode, context);
  } else if (functionNode.type === 'field_expression' || functionNode.type === 'qualified_identifier') {
    // obj.method() or Namespace::func()
    const nameNode = functionNode.childForFieldName('name') || functionNode.childForFieldName('field');
    if (nameNode) {
      calleeName = nodeText(nameNode, context);
    }
  } else if (functionNode.type === 'template_function') {
    const nameNode = functionNode.childForFieldName('name');
    if (nameNode) {
      calleeName = nodeText(nameNode, context);
    }
  }

  if (!calleeName) return;

  // Skip common standard library functions
  const builtins = new Set([
    'printf', 'scanf', 'malloc', 'free', 'memcpy', 'strlen', 'strcmp', 'strcpy', 'strcat',
    'cout', 'cin', 'cerr', 'endl', 'make_shared', 'make_unique', 'make_pair', 'make_tuple',
    'move', 'forward', 'swap', 'begin', 'end', 'size', 'empty', 'push_back', 'emplace_back',
    'insert', 'erase', 'find', 'sort', 'transform', 'for_each', 'accumulate',
    'static_cast', 'dynamic_cast', 'reinterpret_cast', 'const_cast',
  ]);
  if (builtins.has(calleeName)) return;

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

// ─── CMakeLists.txt parsing ──────────────────────────────────

function parseCMakeLists(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const lines = sourceCode.split('\n');

  const projectName = basename(dirname(join(projectRoot, filePath)));
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
    const line = lines[i].trim();
    const lineNum = i + 1;

    // find_package(OpenCV REQUIRED)
    const findPkgMatch = line.match(/find_package\s*\(\s*(\w+)/i);
    if (findPkgMatch) {
      symbols.push({
        id: `${filePath}::dep:${findPkgMatch[1]}`,
        name: findPkgMatch[1],
        kind: 'import',
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false,
      });
    }

    // target_link_libraries(myapp PRIVATE mylib anotherlib)
    const linkLibsMatch = line.match(/target_link_libraries\s*\(\s*\w+\s+(?:PRIVATE|PUBLIC|INTERFACE)?\s*(.*)\)/i);
    if (linkLibsMatch) {
      const libs = linkLibsMatch[1].trim().split(/\s+/).filter(l => l && !['PRIVATE', 'PUBLIC', 'INTERFACE'].includes(l));
      for (const lib of libs) {
        symbols.push({
          id: `${filePath}::dep:${lib}`,
          name: lib,
          kind: 'import',
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          exported: false,
        });
      }
    }

    // add_subdirectory(src/mylib)
    const addSubdirMatch = line.match(/add_subdirectory\s*\(\s*([^\s)]+)/i);
    if (addSubdirMatch) {
      const subdir = addSubdirMatch[1];
      const cmakeDir = dirname(join(projectRoot, filePath));
      const subdirCMake = join(relative(projectRoot, cmakeDir), subdir, 'CMakeLists.txt');
      if (existsSync(join(projectRoot, subdirCMake))) {
        edges.push({
          source: `${filePath}::__file__`,
          target: `${subdirCMake}::__file__`,
          kind: 'imports',
          filePath,
          line: lineNum,
        });
      }
    }

    // project(MyProject VERSION 1.0)
    const projectMatch = line.match(/project\s*\(\s*(\w+)/i);
    if (projectMatch) {
      symbols.push({
        id: `${filePath}::project:${projectMatch[1]}`,
        name: projectMatch[1],
        kind: 'module',
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true,
      });
    }
  }

  return { filePath, symbols, edges };
}

// ─── conanfile.txt parsing ───────────────────────────────────

function parseConanfileTxt(
  filePath: string,
  sourceCode: string,
  _projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];
  const lines = sourceCode.split('\n');
  let inRequires = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    if (line === '[requires]') {
      inRequires = true;
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      inRequires = false;
      continue;
    }

    if (inRequires && line.length > 0) {
      // fmt/10.1.1 or boost/1.83.0
      symbols.push({
        id: `${filePath}::dep:${line}`,
        name: line,
        kind: 'import',
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false,
      });
    }
  }

  return { filePath, symbols, edges: [] };
}

// ─── vcpkg.json parsing ─────────────────────────────────────

function parseVcpkgJson(
  filePath: string,
  sourceCode: string,
  _projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];

  try {
    const vcpkg = JSON.parse(sourceCode);
    if (vcpkg.dependencies && Array.isArray(vcpkg.dependencies)) {
      for (let i = 0; i < vcpkg.dependencies.length; i++) {
        const dep = vcpkg.dependencies[i];
        const name = typeof dep === 'string' ? dep : dep.name || '';
        if (name) {
          symbols.push({
            id: `${filePath}::dep:${name}`,
            name,
            kind: 'import',
            filePath,
            startLine: 1,
            endLine: 1,
            exported: false,
          });
        }
      }
    }
  } catch {
    // Invalid JSON — ignore
  }

  return { filePath, symbols, edges: [] };
}

// ─── Helpers ──────────────────────────────────────────────────

function resolveIncludePath(includePath: string, currentFile: string, projectRoot: string): string[] {
  const currentFileAbs = join(projectRoot, currentFile);
  const currentDir = dirname(currentFileAbs);

  const possibleFiles = [
    join(currentDir, includePath),
    join(projectRoot, includePath),
    join(projectRoot, 'include', includePath),
    join(projectRoot, 'src', includePath),
  ];

  const resolvedFiles: string[] = [];

  for (const absPath of possibleFiles) {
    if (existsSync(absPath)) {
      const relPath = relative(projectRoot, absPath);
      if (!resolvedFiles.includes(relPath)) {
        resolvedFiles.push(relPath);
      }
    }
  }

  return resolvedFiles;
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

function hasStorageClass(node: Parser.SyntaxNode, className: string, context: Context): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'storage_class_specifier') {
      if (nodeText(child, context) === className) {
        return true;
      }
    }
  }
  return false;
}

function hasAccessSpecifier(node: Parser.SyntaxNode, specifier: string, context: Context): boolean {
  // Walk back through siblings to find the most recent access_specifier
  const parent = node.parent;
  if (!parent) return false;

  let lastAccess = '';
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (!child) continue;
    if (child.type === 'access_specifier') {
      lastAccess = nodeText(child, context).replace(':', '').trim();
    }
    if (child === node) break;
  }

  return lastAccess === specifier;
}

function extractFunctionName(declarator: Parser.SyntaxNode): Parser.SyntaxNode | null {
  if (declarator.type === 'identifier') {
    return declarator;
  }

  if (declarator.type === 'function_declarator') {
    const innerDeclarator = declarator.childForFieldName('declarator');
    if (innerDeclarator) {
      return extractFunctionName(innerDeclarator);
    }
  }

  if (declarator.type === 'pointer_declarator' || declarator.type === 'reference_declarator') {
    const innerDeclarator = declarator.childForFieldName('declarator');
    if (innerDeclarator) {
      return extractFunctionName(innerDeclarator);
    }
  }

  if (declarator.type === 'qualified_identifier' || declarator.type === 'template_function') {
    const nameNode = declarator.childForFieldName('name');
    if (nameNode) {
      return extractFunctionName(nameNode);
    }
  }

  if (declarator.type === 'destructor_name') {
    return declarator;
  }

  if (declarator.type === 'operator_name') {
    return declarator;
  }

  for (let i = 0; i < declarator.childCount; i++) {
    const child = declarator.child(i);
    if (child && child.type === 'identifier') {
      return child;
    }
  }

  return null;
}

function extractIdentifierFromDeclarator(declarator: Parser.SyntaxNode, context: Context): string | null {
  if (declarator.type === 'identifier') {
    return nodeText(declarator, context);
  }

  if (declarator.type === 'type_identifier') {
    return nodeText(declarator, context);
  }

  const identifierNode = findChildByType(declarator, 'identifier');
  if (identifierNode) {
    return nodeText(identifierNode, context);
  }

  const typeIdNode = findChildByType(declarator, 'type_identifier');
  if (typeIdNode) {
    return nodeText(typeIdNode, context);
  }

  for (let i = 0; i < declarator.childCount; i++) {
    const child = declarator.child(i);
    if (child) {
      const name = extractIdentifierFromDeclarator(child, context);
      if (name) return name;
    }
  }

  return null;
}

function extractTypeName(node: Parser.SyntaxNode, context: Context): string | null {
  const text = nodeText(node, context).trim();
  if (!text || text === ':' || text === ',') return null;

  // Strip access specifier: public Base → Base
  const accessStripped = text.replace(/^(?:public|protected|private|virtual)\s+/g, '');

  // Strip template parameters: vector<int> → vector
  const angleBracketIdx = accessStripped.indexOf('<');
  const name = angleBracketIdx > 0 ? accessStripped.substring(0, angleBracketIdx) : accessStripped;

  // Strip namespace prefix: std::vector → vector
  const colonIdx = name.lastIndexOf('::');
  return colonIdx >= 0 ? name.substring(colonIdx + 2) : name;
}

function containsType(node: Parser.SyntaxNode, type: string): boolean {
  if (node.type === type) return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && containsType(child, type)) return true;
  }
  return false;
}

function findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

function nodeText(node: Parser.SyntaxNode, context: Context): string {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}

function getCurrentSymbolId(context: Context): string | null {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}

// Export as LanguageParser interface
export const cppParser: LanguageParser = {
  name: 'cpp',
  extensions: [
    '.cpp', '.cc', '.cxx', '.c++',
    '.hpp', '.hh', '.hxx', '.h++',
    '.inl', '.ipp',
    'CMakeLists.txt', 'conanfile.txt', 'vcpkg.json',
  ],
  parseFile: parseCppFile,
};

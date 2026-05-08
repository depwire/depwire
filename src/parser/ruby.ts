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
  currentModule: string | null;
  imports: Map<string, string>;
  isGemfile: boolean;
}

export function parseRubyFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Handle Gemfile (dependency manifest)
  if (basename(filePath) === 'Gemfile') {
    return parseGemfile(filePath, sourceCode, projectRoot);
  }

  const parser = getParser('ruby');
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });

  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentModule: null,
    imports: new Map(),
    isGemfile: false,
  };

  walkNode(tree.rootNode, context);

  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

function walkNode(node: Parser.SyntaxNode, context: Context): void {
  const handled = processNode(node, context);

  if (handled) return;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode(child, context);
    }
  }
}

function processNode(node: Parser.SyntaxNode, context: Context): boolean {
  switch (node.type) {
    case 'class':
      processClassDeclaration(node, context);
      return true;
    case 'module':
      processModuleDeclaration(node, context);
      return true;
    case 'method':
      processMethodDeclaration(node, context);
      return true;
    case 'singleton_method':
      processSingletonMethod(node, context);
      return true;
    case 'assignment':
      processAssignment(node, context);
      return false;
    case 'call':
    case 'method_call':
      processCallExpression(node, context);
      return false;
    case 'command':
      processCommand(node, context);
      return false;
    case 'command_call':
      processCommandCall(node, context);
      return false;
    case 'constant':
      return false;
    case 'block':
    case 'do_block':
      return false;
    case 'lambda':
      processLambda(node, context);
      return false;
    default:
      return false;
  }
}

// ─── Classes ──────────────────────────────────────────────────

function processClassDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'constant') || findChildByType(node, 'scope_resolution');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });

  // Process superclass inheritance
  const superclassNode = findChildByType(node, 'superclass');
  if (superclassNode) {
    const superName = nodeText(superclassNode, context).replace(/^\s*<\s*/, '').trim();
    if (superName) {
      const baseId = resolveSymbol(superName, context);
      if (baseId) {
        context.edges.push({
          source: symbolId,
          target: baseId,
          kind: 'implements',
          filePath: context.filePath,
          line: node.startPosition.row + 1,
        });
      }
    }
  }

  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'body_statement');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

// ─── Modules ──────────────────────────────────────────────────

function processModuleDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'constant') || findChildByType(node, 'scope_resolution');
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

  const oldModule = context.currentModule;
  const oldClass = context.currentClass;
  context.currentModule = name;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'body_statement');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentModule = oldModule;
  context.currentClass = oldClass;
}

// ─── Methods ──────────────────────────────────────────────────

function processMethodDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
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
    exported: true,
    scope,
  });

  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);

  const body = findChildByType(node, 'body_statement');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

function processSingletonMethod(node: Parser.SyntaxNode, context: Context): void {
  // def self.method_name
  const nameNode = node.childCount > 2 ? node.child(node.childCount - 2) : null;
  let name = '';
  
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'identifier') {
      name = nodeText(child, context);
    }
  }

  if (!name) return;

  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.self.${name}`
    : `${context.filePath}::self.${name}`;

  context.symbols.push({
    id: symbolId,
    name: `self.${name}`,
    kind: 'method',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope,
  });

  const scopeName = scope ? `${scope}.self.${name}` : `self.${name}`;
  context.currentScope.push(scopeName);

  const body = findChildByType(node, 'body_statement');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

// ─── Assignments ──────────────────────────────────────────────

function processAssignment(node: Parser.SyntaxNode, context: Context): void {
  const left = node.child(0);
  if (!left) return;

  const text = nodeText(left, context);
  const scope = context.currentClass || undefined;

  // Constants (UPPER_CASE)
  if (left.type === 'constant') {
    const symbolId = scope
      ? `${context.filePath}::${scope}.${text}`
      : `${context.filePath}::${text}`;

    context.symbols.push({
      id: symbolId,
      name: text,
      kind: 'constant',
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: true,
      scope,
    });
  }

  // Instance variables (@var)
  if (left.type === 'instance_variable') {
    const symbolId = scope
      ? `${context.filePath}::${scope}.${text}`
      : `${context.filePath}::${text}`;

    context.symbols.push({
      id: symbolId,
      name: text,
      kind: 'property',
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false,
      scope,
    });
  }

  // Class variables (@@var)
  if (left.type === 'class_variable') {
    const symbolId = scope
      ? `${context.filePath}::${scope}.${text}`
      : `${context.filePath}::${text}`;

    context.symbols.push({
      id: symbolId,
      name: text,
      kind: 'property',
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false,
      scope,
    });
  }
}

// ─── Calls & Commands ─────────────────────────────────────────

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  const text = nodeText(node, context);
  const line = node.startPosition.row + 1;

  // Handle require/require_relative
  const requireMatch = text.match(/^require(?:_relative)?\s*\(?['"]([^'"]+)['"]\)?/);
  if (requireMatch) {
    processRequire(requireMatch[1], text.startsWith('require_relative'), context, line);
    return;
  }

  // Handle include/extend/prepend (mixin edges)
  const mixinMatch = text.match(/^(?:include|extend|prepend)\s+([A-Z]\w*(?:::\w+)*)/);
  if (mixinMatch) {
    processMixin(mixinMatch[1], context, line);
    return;
  }

  // Handle attr_accessor, attr_reader, attr_writer
  const attrMatch = text.match(/^attr_(accessor|reader|writer)\s+(.+)/);
  if (attrMatch) {
    processAttrAccessor(attrMatch[2], context, line);
    return;
  }

  // General method calls — create edges
  if (context.currentScope.length > 0) {
    const firstChild = node.child(0);
    let calleeName: string | null = null;

    if (firstChild && firstChild.type === 'identifier') {
      calleeName = nodeText(firstChild, context);
    }

    if (calleeName && !isBuiltin(calleeName)) {
      const callerId = getCurrentSymbolId(context);
      if (callerId) {
        const calleeId = resolveSymbol(calleeName, context);
        if (calleeId) {
          context.edges.push({
            source: callerId,
            target: calleeId,
            kind: 'calls',
            filePath: context.filePath,
            line,
          });
        }
      }
    }
  }
}

function processCommand(node: Parser.SyntaxNode, context: Context): void {
  const text = nodeText(node, context).trim();
  const line = node.startPosition.row + 1;

  // require/require_relative
  const requireMatch = text.match(/^require(?:_relative)?\s+['"]([^'"]+)['"]/);
  if (requireMatch) {
    processRequire(requireMatch[1], text.startsWith('require_relative'), context, line);
    return;
  }

  // include/extend/prepend
  const mixinMatch = text.match(/^(?:include|extend|prepend)\s+([A-Z]\w*(?:::\w+)*)/);
  if (mixinMatch) {
    processMixin(mixinMatch[1], context, line);
    return;
  }

  // attr_accessor/reader/writer
  const attrMatch = text.match(/^attr_(accessor|reader|writer)\s+(.+)/);
  if (attrMatch) {
    processAttrAccessor(attrMatch[2], context, line);
    return;
  }
}

function processCommandCall(node: Parser.SyntaxNode, context: Context): void {
  // Handle Struct.new, OpenStruct.new etc.
  const text = nodeText(node, context).trim();
  
  if (/Struct\.new/.test(text) || /OpenStruct\.new/.test(text)) {
    // Try to detect assignment: MyStruct = Struct.new(...)
    const parent = node.parent;
    if (parent && parent.type === 'assignment') {
      const left = parent.child(0);
      if (left && left.type === 'constant') {
        const name = nodeText(left, context);
        const symbolId = `${context.filePath}::${name}`;
        context.symbols.push({
          id: symbolId,
          name,
          kind: 'class',
          filePath: context.filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: true,
        });
      }
    }
  }
}

function processLambda(node: Parser.SyntaxNode, context: Context): void {
  // Lambda: -> { } or lambda { }
  // Check if assigned to a constant or variable
  const parent = node.parent;
  if (parent && parent.type === 'assignment') {
    const left = parent.child(0);
    if (left) {
      const name = nodeText(left, context);
      const scope = context.currentClass || undefined;
      const symbolId = scope
        ? `${context.filePath}::${scope}.${name}`
        : `${context.filePath}::${name}`;

      context.symbols.push({
        id: symbolId,
        name,
        kind: 'function',
        filePath: context.filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        exported: true,
        scope,
      });
    }
  }
}

// ─── Require / Include helpers ────────────────────────────────

function processRequire(path: string, isRelative: boolean, context: Context, line: number): void {
  const resolvedPath = resolveRubyRequire(path, isRelative, context.filePath, context.projectRoot);

  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    const targetId = `${resolvedPath}::__file__`;

    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: 'imports',
      filePath: context.filePath,
      line,
    });
  }

  // Create import symbol for tracking
  const symbolId = `${context.filePath}::require:${path}`;
  context.symbols.push({
    id: symbolId,
    name: path,
    kind: 'import',
    filePath: context.filePath,
    startLine: line,
    endLine: line,
    exported: false,
  });
}

function processMixin(moduleName: string, context: Context, line: number): void {
  const scope = context.currentClass || undefined;
  const sourceId = scope
    ? `${context.filePath}::${scope}`
    : `${context.filePath}::__file__`;

  const targetId = resolveSymbol(moduleName, context);
  if (targetId) {
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: 'implements',
      filePath: context.filePath,
      line,
    });
  }
}

function processAttrAccessor(args: string, context: Context, line: number): void {
  const scope = context.currentClass || undefined;
  // Parse :name, :other_name
  const symbols = args.match(/:\w+/g);
  if (!symbols) return;

  for (const sym of symbols) {
    const name = sym.slice(1); // remove leading :
    const symbolId = scope
      ? `${context.filePath}::${scope}.${name}`
      : `${context.filePath}::${name}`;

    context.symbols.push({
      id: symbolId,
      name,
      kind: 'property',
      filePath: context.filePath,
      startLine: line,
      endLine: line,
      exported: true,
      scope,
    });
  }
}

// ─── Gemfile parsing ──────────────────────────────────────────

function parseGemfile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const lines = sourceCode.split('\n');

  symbols.push({
    id: `${filePath}::Gemfile`,
    name: 'Gemfile',
    kind: 'module',
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true,
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // gem 'name' or gem "name"
    const gemMatch = line.match(/^\s*gem\s+['"]([^'"]+)['"]/);
    if (gemMatch) {
      const gemName = gemMatch[1];
      symbols.push({
        id: `${filePath}::gem:${gemName}`,
        name: gemName,
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

function resolveRubyRequire(
  requirePath: string,
  isRelative: boolean,
  currentFile: string,
  projectRoot: string
): string | null {
  const extensions = ['.rb', ''];

  if (isRelative) {
    const dir = dirname(join(projectRoot, currentFile));
    for (const ext of extensions) {
      const candidate = join(dir, requirePath + ext);
      if (existsSync(candidate)) {
        const rel = candidate.replace(projectRoot + '/', '');
        return rel;
      }
    }
  } else {
    // Try lib/, app/, and root
    const searchRoots = ['lib', 'app', 'app/models', 'app/controllers', 'app/services', ''];
    for (const root of searchRoots) {
      for (const ext of extensions) {
        const candidate = root
          ? join(projectRoot, root, requirePath + ext)
          : join(projectRoot, requirePath + ext);
        if (existsSync(candidate)) {
          const rel = candidate.replace(projectRoot + '/', '');
          return rel;
        }
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

function isBuiltin(name: string): boolean {
  const builtins = new Set([
    'puts', 'print', 'p', 'pp', 'warn', 'raise', 'fail',
    'require', 'require_relative', 'include', 'extend', 'prepend',
    'attr_accessor', 'attr_reader', 'attr_writer',
    'private', 'protected', 'public',
    'new', 'initialize', 'super', 'self',
    'map', 'each', 'select', 'reject', 'reduce', 'collect',
    'find', 'detect', 'any?', 'all?', 'none?', 'count',
    'freeze', 'dup', 'clone', 'nil?', 'is_a?', 'kind_of?',
    'respond_to?', 'send', 'class', 'object_id',
    'to_s', 'to_i', 'to_f', 'to_a', 'to_h',
    'lambda', 'proc', 'block_given?', 'yield',
  ]);
  return builtins.has(name);
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
export const rubyParser: LanguageParser = {
  name: 'ruby',
  extensions: ['.rb', '.rake', '.gemspec', 'Gemfile'],
  parseFile: parseRubyFile,
};

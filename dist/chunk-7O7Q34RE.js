// src/parser/index.ts
import { readFileSync as readFileSync2 } from "fs";
import { join as join3 } from "path";

// src/utils/files.ts
import { readdirSync, statSync, existsSync, lstatSync } from "fs";
import { join, relative } from "path";
function scanDirectory(rootDir, baseDir = rootDir) {
  const files = [];
  try {
    const entries = readdirSync(baseDir);
    for (const entry of entries) {
      const fullPath = join(baseDir, entry);
      if (entry.startsWith(".")) {
        continue;
      }
      if (entry === "node_modules" || entry === "dist" || entry === "build") {
        continue;
      }
      try {
        const stats2 = lstatSync(fullPath);
        if (stats2.isSymbolicLink()) {
          continue;
        }
      } catch (err) {
        continue;
      }
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        files.push(...scanDirectory(rootDir, fullPath));
      } else if (stats.isFile()) {
        if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".d.ts")) {
          files.push(relative(rootDir, fullPath));
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${baseDir}:`, err);
  }
  return files;
}
function fileExists(filePath) {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

// src/parser/typescript.ts
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

// src/parser/resolver.ts
import { join as join2, dirname, resolve, relative as relative2 } from "path";
import { readFileSync } from "fs";
var tsconfigCache = /* @__PURE__ */ new Map();
function loadTsConfig(projectRoot) {
  if (tsconfigCache.has(projectRoot)) {
    return tsconfigCache.get(projectRoot);
  }
  let config = {};
  let currentDir = projectRoot;
  while (currentDir !== dirname(currentDir)) {
    const tsconfigPath = join2(currentDir, "tsconfig.json");
    try {
      const raw = readFileSync(tsconfigPath, "utf-8");
      const stripped = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/,\s*([\]}])/g, "$1");
      const parsed = JSON.parse(stripped);
      if (parsed.compilerOptions) {
        config.baseUrl = parsed.compilerOptions.baseUrl;
        config.paths = parsed.compilerOptions.paths;
        if (config.baseUrl) {
          config.baseUrl = resolve(currentDir, config.baseUrl);
        }
      }
      break;
    } catch (err) {
      currentDir = dirname(currentDir);
    }
  }
  tsconfigCache.set(projectRoot, config);
  return config;
}
function expandPathAlias(importPath, tsconfig) {
  if (!tsconfig.paths) return null;
  for (const [pattern, mappings] of Object.entries(tsconfig.paths)) {
    const patternRegex = new RegExp(
      "^" + pattern.replace(/\*/g, "(.*)") + "$"
    );
    const match = importPath.match(patternRegex);
    if (match) {
      const captured = match[1] || "";
      for (const mapping of mappings) {
        const expanded = mapping.replace(/\*/g, captured);
        const baseUrl = tsconfig.baseUrl || ".";
        return join2(baseUrl, expanded);
      }
    }
  }
  return null;
}
function tryResolve(basePath, projectRoot) {
  const candidates = [];
  if (basePath.endsWith(".js")) {
    candidates.push(basePath.replace(/\.js$/, ".ts"));
    candidates.push(basePath.replace(/\.js$/, ".tsx"));
    candidates.push(basePath);
  } else if (basePath.endsWith(".jsx")) {
    candidates.push(basePath.replace(/\.jsx$/, ".tsx"));
    candidates.push(basePath);
  } else if (basePath.endsWith(".ts") || basePath.endsWith(".tsx")) {
    candidates.push(basePath);
  } else {
    candidates.push(basePath + ".ts");
    candidates.push(basePath + ".tsx");
    candidates.push(join2(basePath, "index.ts"));
    candidates.push(join2(basePath, "index.tsx"));
    candidates.push(basePath);
  }
  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return relative2(projectRoot, candidate);
    }
  }
  return null;
}
function resolveImportPath(importPath, fromFile, projectRoot) {
  const tsconfig = loadTsConfig(projectRoot);
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    const expanded = expandPathAlias(importPath, tsconfig);
    if (expanded) {
      return tryResolve(expanded, projectRoot);
    }
    return null;
  }
  const fromDir = dirname(join2(projectRoot, fromFile));
  let resolvedPath;
  if (importPath.startsWith(".")) {
    resolvedPath = resolve(fromDir, importPath);
  } else {
    resolvedPath = resolve(projectRoot, importPath.substring(1));
  }
  return tryResolve(resolvedPath, projectRoot);
}

// src/parser/typescript.ts
var tsParser = new Parser();
tsParser.setLanguage(TypeScript.typescript);
var tsxParser = new Parser();
tsxParser.setLanguage(TypeScript.tsx);
function parseTypeScriptFile(filePath, sourceCode, projectRoot) {
  const parser = filePath.endsWith(".tsx") ? tsxParser : tsParser;
  const tree = parser.parse(sourceCode);
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    imports: /* @__PURE__ */ new Map()
  };
  walkNode(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode(node, context) {
  processNode(node, context);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode(child, context);
    }
  }
}
function processNode(node, context) {
  const type = node.type;
  switch (type) {
    case "function_declaration":
      processFunctionDeclaration(node, context);
      break;
    case "class_declaration":
      processClassDeclaration(node, context);
      break;
    case "variable_declaration":
    case "lexical_declaration":
      processVariableDeclaration(node, context);
      break;
    case "type_alias_declaration":
      processTypeAliasDeclaration(node, context);
      break;
    case "interface_declaration":
      processInterfaceDeclaration(node, context);
      break;
    case "enum_declaration":
      processEnumDeclaration(node, context);
      break;
    case "import_statement":
      processImportStatement(node, context);
      break;
    case "export_statement":
      processExportStatement(node, context);
      break;
    case "call_expression":
      processCallExpression(node, context);
      break;
    case "new_expression":
      processNewExpression(node, context);
      break;
  }
}
function processFunctionDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const scope = context.currentScope.length > 0 ? context.currentScope.join(".") : void 0;
  const symbolId = `${context.filePath}::${scope ? scope + "." : ""}${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "function",
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
    scope
  });
  context.currentScope.push(name);
  const body = node.childForFieldName("body");
  if (body) {
    walkNode(body, context);
  }
  context.currentScope.pop();
}
function processClassDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine,
    endLine,
    exported
  });
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "class_heritage") {
      const extendsClause = child.childForFieldName("extends");
      if (extendsClause) {
        for (let j = 0; j < extendsClause.childCount; j++) {
          const typeNode = extendsClause.child(j);
          if (typeNode && typeNode.type === "identifier") {
            const targetName = typeNode.text;
            const targetId = `${context.filePath}::${targetName}`;
            context.edges.push({
              source: symbolId,
              target: targetId,
              kind: "extends",
              filePath: context.filePath,
              line: typeNode.startPosition.row + 1
            });
          }
        }
      }
      const implementsClause = child.childForFieldName("implements");
      if (implementsClause) {
        for (let j = 0; j < implementsClause.childCount; j++) {
          const typeNode = implementsClause.child(j);
          if (typeNode && typeNode.type === "type_identifier") {
            const targetName = typeNode.text;
            const targetId = `${context.filePath}::${targetName}`;
            context.edges.push({
              source: symbolId,
              target: targetId,
              kind: "implements",
              filePath: context.filePath,
              line: typeNode.startPosition.row + 1
            });
          }
        }
      }
    }
  }
  context.currentScope.push(name);
  const body = node.childForFieldName("body");
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child) {
        if (child.type === "method_definition") {
          processMethodDefinition(child, context);
        } else if (child.type === "public_field_definition" || child.type === "field_definition") {
          processPropertyDefinition(child, context);
        }
      }
    }
  }
  context.currentScope.pop();
}
function processMethodDefinition(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nameNode.text;
  const className = context.currentScope[context.currentScope.length - 1];
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const symbolId = `${context.filePath}::${className}.${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine,
    endLine,
    exported: false,
    scope: className
  });
  context.currentScope.push(name);
  const body = node.childForFieldName("body");
  if (body) {
    walkNode(body, context);
  }
  context.currentScope.pop();
}
function processPropertyDefinition(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nameNode.text;
  const className = context.currentScope[context.currentScope.length - 1];
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const symbolId = `${context.filePath}::${className}.${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "property",
    filePath: context.filePath,
    startLine,
    endLine,
    exported: false,
    scope: className
  });
}
function processVariableDeclaration(node, context) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "variable_declarator") {
      const nameNode = child.childForFieldName("name");
      if (!nameNode) continue;
      const name = nameNode.text;
      const exported = isExported(node.parent);
      const startLine = child.startPosition.row + 1;
      const endLine = child.endPosition.row + 1;
      const scope = context.currentScope.length > 0 ? context.currentScope.join(".") : void 0;
      const value = child.childForFieldName("value");
      const kind = value && value.type === "arrow_function" ? "function" : "variable";
      const symbolId = `${context.filePath}::${scope ? scope + "." : ""}${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind,
        filePath: context.filePath,
        startLine,
        endLine,
        exported,
        scope
      });
      if (kind === "function" && value) {
        context.currentScope.push(name);
        walkNode(value, context);
        context.currentScope.pop();
      }
    }
  }
}
function processTypeAliasDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "type_alias",
    filePath: context.filePath,
    startLine,
    endLine,
    exported
  });
}
function processInterfaceDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "interface",
    filePath: context.filePath,
    startLine,
    endLine,
    exported
  });
}
function processEnumDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "enum",
    filePath: context.filePath,
    startLine,
    endLine,
    exported
  });
}
function processImportStatement(node, context) {
  const source = node.childForFieldName("source");
  if (!source) return;
  const importPath = source.text.slice(1, -1);
  const resolvedPath = resolveImportPath(importPath, context.filePath, context.projectRoot);
  const importClause = node.child(1);
  if (!importClause) return;
  const importedNames = [];
  const namedImports = findChildByType(importClause, "named_imports");
  if (namedImports) {
    for (let i = 0; i < namedImports.childCount; i++) {
      const child = namedImports.child(i);
      if (child && child.type === "import_specifier") {
        const identifier2 = findChildByType(child, "identifier");
        if (identifier2) {
          importedNames.push(identifier2.text);
        }
      }
    }
  }
  const identifier = findChildByType(importClause, "identifier");
  if (identifier) {
    importedNames.push(identifier.text);
  }
  const namespaceImport = findChildByType(importClause, "namespace_import");
  if (namespaceImport) {
    const alias = findChildByType(namespaceImport, "identifier");
    if (alias) {
      importedNames.push(alias.text);
    }
  }
  if (resolvedPath) {
    const currentSymbolId = getCurrentSymbolId(context);
    for (const importedName of importedNames) {
      const targetId = `${resolvedPath}::${importedName}`;
      context.imports.set(importedName, targetId);
      context.edges.push({
        source: currentSymbolId || `${context.filePath}::__file__`,
        target: targetId,
        kind: "imports",
        filePath: context.filePath,
        line: node.startPosition.row + 1
      });
    }
  }
}
function processExportStatement(node, context) {
  const source = node.childForFieldName("source");
  if (source) {
    const importPath = source.text.slice(1, -1);
    const resolvedPath = resolveImportPath(importPath, context.filePath, context.projectRoot);
    const exportClause = node.child(1);
    if (exportClause && resolvedPath) {
      const exportedNames = [];
      for (let i = 0; i < exportClause.childCount; i++) {
        const child = exportClause.child(i);
        if (child && child.type === "export_specifier") {
          const identifier = findChildByType(child, "identifier");
          if (identifier) {
            exportedNames.push(identifier.text);
          }
        }
      }
      const currentSymbolId = getCurrentSymbolId(context);
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      for (const exportedName of exportedNames) {
        const symbolId = `${context.filePath}::${exportedName}`;
        context.symbols.push({
          id: symbolId,
          name: exportedName,
          kind: "export",
          filePath: context.filePath,
          startLine,
          endLine,
          exported: true
        });
        const targetId = `${resolvedPath}::${exportedName}`;
        context.edges.push({
          source: symbolId,
          target: targetId,
          kind: "imports",
          filePath: context.filePath,
          line: startLine
        });
      }
    }
  }
}
function processCallExpression(node, context) {
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return;
  let functionName = null;
  if (functionNode.type === "identifier") {
    functionName = functionNode.text;
  } else if (functionNode.type === "member_expression") {
    const property = functionNode.childForFieldName("property");
    if (property) {
      functionName = property.text;
    }
  }
  if (functionName) {
    const currentSymbolId = getCurrentSymbolId(context);
    if (currentSymbolId) {
      let targetId;
      if (context.imports.has(functionName)) {
        targetId = context.imports.get(functionName);
      } else {
        targetId = `${context.filePath}::${functionName}`;
      }
      context.edges.push({
        source: currentSymbolId,
        target: targetId,
        kind: "calls",
        filePath: context.filePath,
        line: node.startPosition.row + 1
      });
    }
  }
}
function processNewExpression(node, context) {
  const classNode = node.child(1);
  if (!classNode || classNode.type !== "identifier") return;
  const className = classNode.text;
  const currentSymbolId = getCurrentSymbolId(context);
  if (currentSymbolId) {
    const targetId = `${context.filePath}::${className}`;
    context.edges.push({
      source: currentSymbolId,
      target: targetId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function isExported(node) {
  if (!node) return false;
  if (node.type === "export_statement") return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "export") return true;
  }
  return isExported(node.parent);
}
function findChildByType(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      return child;
    }
  }
  return null;
}
function getCurrentSymbolId(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope.join(".")}`;
}

// src/parser/index.ts
function parseProject(projectRoot) {
  const files = scanDirectory(projectRoot);
  const parsedFiles = [];
  for (const file of files) {
    try {
      const fullPath = join3(projectRoot, file);
      const sourceCode = readFileSync2(fullPath, "utf-8");
      const parsed = parseTypeScriptFile(file, sourceCode, projectRoot);
      parsedFiles.push(parsed);
    } catch (err) {
      console.error(`Error parsing file ${file}:`, err);
    }
  }
  return parsedFiles;
}

// src/graph/index.ts
import { DirectedGraph } from "graphology";
function buildGraph(parsedFiles) {
  const graph = new DirectedGraph();
  for (const file of parsedFiles) {
    for (const symbol of file.symbols) {
      if (!graph.hasNode(symbol.id)) {
        graph.addNode(symbol.id, {
          name: symbol.name,
          kind: symbol.kind,
          filePath: symbol.filePath,
          startLine: symbol.startLine,
          endLine: symbol.endLine,
          exported: symbol.exported,
          scope: symbol.scope
        });
      }
    }
  }
  const fileNodes = /* @__PURE__ */ new Set();
  for (const file of parsedFiles) {
    for (const edge of file.edges) {
      if (edge.source.endsWith("::__file__") && !fileNodes.has(edge.source)) {
        fileNodes.add(edge.source);
        const filePath = edge.source.replace("::__file__", "");
        graph.addNode(edge.source, {
          name: "__file__",
          kind: "import",
          filePath,
          startLine: 1,
          endLine: 1,
          exported: false
        });
      }
    }
  }
  for (const file of parsedFiles) {
    for (const edge of file.edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.mergeEdge(edge.source, edge.target, {
          kind: edge.kind,
          filePath: edge.filePath,
          line: edge.line
        });
      }
    }
  }
  return graph;
}

// src/graph/queries.ts
function getDependencies(graph, symbolId) {
  if (!graph.hasNode(symbolId)) return [];
  const dependencies = [];
  const neighbors = graph.outNeighbors(symbolId);
  for (const neighborId of neighbors) {
    const attrs = graph.getNodeAttributes(neighborId);
    dependencies.push({
      id: neighborId,
      name: attrs.name,
      kind: attrs.kind,
      filePath: attrs.filePath,
      startLine: attrs.startLine,
      endLine: attrs.endLine,
      exported: attrs.exported,
      scope: attrs.scope
    });
  }
  return dependencies;
}
function getDependents(graph, symbolId) {
  if (!graph.hasNode(symbolId)) return [];
  const dependents = [];
  const neighbors = graph.inNeighbors(symbolId);
  for (const neighborId of neighbors) {
    const attrs = graph.getNodeAttributes(neighborId);
    dependents.push({
      id: neighborId,
      name: attrs.name,
      kind: attrs.kind,
      filePath: attrs.filePath,
      startLine: attrs.startLine,
      endLine: attrs.endLine,
      exported: attrs.exported,
      scope: attrs.scope
    });
  }
  return dependents;
}
function getImpact(graph, symbolId) {
  if (!graph.hasNode(symbolId)) {
    return {
      directDependents: [],
      transitiveDependents: [],
      affectedFiles: []
    };
  }
  const directDependents = getDependents(graph, symbolId);
  const visited = /* @__PURE__ */ new Set([symbolId]);
  const queue = [symbolId];
  const allDependents = [];
  const fileSet = /* @__PURE__ */ new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = graph.inNeighbors(current);
    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
        const attrs = graph.getNodeAttributes(neighborId);
        allDependents.push({
          id: neighborId,
          name: attrs.name,
          kind: attrs.kind,
          filePath: attrs.filePath,
          startLine: attrs.startLine,
          endLine: attrs.endLine,
          exported: attrs.exported,
          scope: attrs.scope
        });
        fileSet.add(attrs.filePath);
      }
    }
  }
  return {
    directDependents,
    transitiveDependents: allDependents,
    affectedFiles: Array.from(fileSet).sort()
  };
}
function getCrossFileEdges(graph) {
  const crossFileEdges = [];
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      crossFileEdges.push({
        source,
        target,
        sourceFile: sourceAttrs.filePath,
        targetFile: targetAttrs.filePath,
        kind: attrs.kind
      });
    }
  });
  return crossFileEdges;
}
function getFileSummary(graph) {
  const fileMap = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    if (!fileMap.has(attrs.filePath)) {
      fileMap.set(attrs.filePath, {
        symbolCount: 0,
        incomingRefs: /* @__PURE__ */ new Set(),
        outgoingRefs: /* @__PURE__ */ new Set()
      });
    }
    fileMap.get(attrs.filePath).symbolCount++;
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceFile = fileMap.get(sourceAttrs.filePath);
      const targetFile = fileMap.get(targetAttrs.filePath);
      if (sourceFile) {
        sourceFile.outgoingRefs.add(targetAttrs.filePath);
      }
      if (targetFile) {
        targetFile.incomingRefs.add(sourceAttrs.filePath);
      }
    }
  });
  const result = [];
  for (const [filePath, data] of fileMap.entries()) {
    result.push({
      filePath,
      symbolCount: data.symbolCount,
      incomingRefs: data.incomingRefs.size,
      outgoingRefs: data.outgoingRefs.size
    });
  }
  return result.sort((a, b) => a.filePath.localeCompare(b.filePath));
}
function searchSymbols(graph, query) {
  const queryLower = query.toLowerCase();
  const results = [];
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.name.toLowerCase().includes(queryLower)) {
      results.push({
        id: nodeId,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        exported: attrs.exported,
        scope: attrs.scope
      });
    }
  });
  return results;
}
function getArchitectureSummary(graph) {
  const fileSummary = getFileSummary(graph);
  const fileSet = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    fileSet.add(attrs.filePath);
  });
  const fileConnections = fileSummary.map((f) => ({
    filePath: f.filePath,
    connections: f.incomingRefs + f.outgoingRefs
  }));
  fileConnections.sort((a, b) => b.connections - a.connections);
  const orphanFiles = fileSummary.filter((f) => f.incomingRefs === 0 && f.outgoingRefs === 0).map((f) => f.filePath);
  return {
    fileCount: fileSet.size,
    symbolCount: graph.order,
    edgeCount: graph.size,
    mostConnectedFiles: fileConnections.slice(0, 5),
    orphanFiles
  };
}

// src/watcher.ts
import chokidar from "chokidar";
function watchProject(projectRoot, callbacks) {
  console.error(`[Watcher] Creating watcher for: ${projectRoot}`);
  const watcher = chokidar.watch(projectRoot, {
    ignored: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/.*"
      // Hidden files and directories
    ],
    ignoreInitial: true,
    // Don't fire events for existing files
    persistent: true,
    followSymlinks: false,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      // Wait 300ms after last change before firing
      pollInterval: 100
    }
  });
  console.error("[Watcher] Attaching event listeners...");
  watcher.on("change", (absolutePath) => {
    if (!absolutePath.endsWith(".ts") && !absolutePath.endsWith(".tsx")) return;
    const relativePath = absolutePath.replace(projectRoot + "/", "");
    console.error(`[Watcher] Change event: ${relativePath}`);
    callbacks.onFileChanged(relativePath);
  });
  watcher.on("add", (absolutePath) => {
    if (!absolutePath.endsWith(".ts") && !absolutePath.endsWith(".tsx")) return;
    const relativePath = absolutePath.replace(projectRoot + "/", "");
    console.error(`[Watcher] Add event: ${relativePath}`);
    callbacks.onFileAdded(relativePath);
  });
  watcher.on("unlink", (absolutePath) => {
    if (!absolutePath.endsWith(".ts") && !absolutePath.endsWith(".tsx")) return;
    const relativePath = absolutePath.replace(projectRoot + "/", "");
    console.error(`[Watcher] Unlink event: ${relativePath}`);
    callbacks.onFileDeleted(relativePath);
  });
  watcher.on("error", (error) => {
    console.error("[Watcher] Error:", error);
  });
  watcher.on("ready", () => {
    console.error("[Watcher] Ready \u2014 watching for changes");
    const watched = watcher.getWatched();
    const dirs = Object.keys(watched);
    let tsFileCount = 0;
    for (const dir of dirs) {
      const files = watched[dir];
      tsFileCount += files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx")).length;
    }
    console.error(`[Watcher] Watching ${tsFileCount} TypeScript files in ${dirs.length} directories`);
  });
  watcher.on("all", (event, path) => {
    console.error(`[Watcher] ALL event: ${event} ${path}`);
  });
  return watcher;
}

// src/mcp/state.ts
function createEmptyState() {
  return {
    graph: null,
    projectRoot: null,
    projectName: null,
    watcher: null
  };
}
function isProjectLoaded(state) {
  return state.graph !== null && state.projectRoot !== null;
}

// src/graph/updater.ts
import { join as join4 } from "path";
function removeFileFromGraph(graph, filePath) {
  const nodesToRemove = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.filePath === filePath) {
      nodesToRemove.push(node);
    }
  });
  nodesToRemove.forEach((node) => {
    try {
      graph.dropNode(node);
    } catch (error) {
    }
  });
}
function addFileToGraph(graph, parsedFile) {
  for (const symbol of parsedFile.symbols) {
    const nodeId = `${parsedFile.filePath}::${symbol.name}`;
    try {
      graph.addNode(nodeId, {
        name: symbol.name,
        kind: symbol.kind,
        filePath: parsedFile.filePath,
        startLine: symbol.location.startLine,
        endLine: symbol.location.endLine,
        exported: symbol.exported,
        scope: symbol.scope
      });
    } catch (error) {
    }
  }
  for (const edge of parsedFile.edges) {
    try {
      graph.mergeEdge(edge.source, edge.target, {
        kind: edge.kind,
        sourceFile: edge.sourceFile,
        targetFile: edge.targetFile
      });
    } catch (error) {
    }
  }
}
async function updateFileInGraph(graph, projectRoot, relativeFilePath) {
  removeFileFromGraph(graph, relativeFilePath);
  const absolutePath = join4(projectRoot, relativeFilePath);
  try {
    const parsedFile = parseTypeScriptFile(absolutePath, relativeFilePath);
    addFileToGraph(graph, parsedFile);
  } catch (error) {
    console.error(`Failed to parse file ${relativeFilePath}:`, error);
  }
}

// src/mcp/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/mcp/tools.ts
import { dirname as dirname2 } from "path";

// src/mcp/connect.ts
import simpleGit from "simple-git";
import { existsSync as existsSync2 } from "fs";
import { join as join5, basename } from "path";
import { tmpdir } from "os";
async function connectToRepo(source, subdirectory, state) {
  try {
    let projectRoot;
    let projectName;
    const isGitHub = source.startsWith("https://github.com/") || source.startsWith("git@github.com:");
    if (isGitHub) {
      const match = source.match(/[\/:]([^\/]+?)(?:\.git)?$/);
      if (!match) {
        return {
          error: "Invalid GitHub URL",
          message: "Could not parse repository name from URL"
        };
      }
      projectName = match[1];
      const reposDir = join5(tmpdir(), "codegraph-repos");
      const cloneDir = join5(reposDir, projectName);
      console.error(`Connecting to GitHub repo: ${source}`);
      const git = simpleGit();
      if (existsSync2(cloneDir)) {
        console.error(`Repo already cloned at ${cloneDir}, pulling latest changes...`);
        try {
          await git.cwd(cloneDir).pull();
        } catch (error) {
          console.error(`Pull failed, using existing clone: ${error}`);
        }
      } else {
        console.error(`Cloning ${source} to ${cloneDir}...`);
        try {
          await git.clone(source, cloneDir, ["--depth", "1"]);
        } catch (error) {
          return {
            error: "Failed to clone repository",
            message: `Git clone failed: ${error}. Ensure git is installed and the URL is correct.`
          };
        }
      }
      projectRoot = subdirectory ? join5(cloneDir, subdirectory) : cloneDir;
    } else {
      if (!existsSync2(source)) {
        return {
          error: "Directory not found",
          message: `Directory does not exist: ${source}`
        };
      }
      projectRoot = subdirectory ? join5(source, subdirectory) : source;
      projectName = basename(projectRoot);
    }
    if (!existsSync2(projectRoot)) {
      return {
        error: "Project root not found",
        message: `Directory does not exist: ${projectRoot}`
      };
    }
    console.error(`Parsing project at ${projectRoot}...`);
    if (state.watcher) {
      console.error("Stopping previous file watcher...");
      await state.watcher.close();
      state.watcher = null;
    }
    const parsedFiles = await parseProject(projectRoot);
    if (parsedFiles.length === 0) {
      return {
        error: "No TypeScript files found",
        message: `No .ts or .tsx files found in ${projectRoot}`
      };
    }
    const graph = buildGraph(parsedFiles);
    state.graph = graph;
    state.projectRoot = projectRoot;
    state.projectName = projectName;
    console.error(`Parsed ${parsedFiles.length} files`);
    console.error("Starting file watcher...");
    state.watcher = watchProject(projectRoot, {
      onFileChanged: async (filePath) => {
        console.error(`File changed: ${filePath}`);
        try {
          await updateFileInGraph(state.graph, projectRoot, filePath);
          console.error(`Graph updated for ${filePath}`);
        } catch (error) {
          console.error(`Failed to update graph for ${filePath}: ${error}`);
        }
      },
      onFileAdded: async (filePath) => {
        console.error(`File added: ${filePath}`);
        try {
          await updateFileInGraph(state.graph, projectRoot, filePath);
          console.error(`Graph updated for ${filePath}`);
        } catch (error) {
          console.error(`Failed to update graph for ${filePath}: ${error}`);
        }
      },
      onFileDeleted: (filePath) => {
        console.error(`File deleted: ${filePath}`);
        try {
          const fileNodes = state.graph.filterNodes(
            (node, attrs) => attrs.filePath === filePath
          );
          fileNodes.forEach((node) => state.graph.dropNode(node));
          console.error(`Removed ${filePath} from graph`);
        } catch (error) {
          console.error(`Failed to remove ${filePath} from graph: ${error}`);
        }
      }
    });
    const summary = getArchitectureSummary(graph);
    const mostConnected = summary.mostConnectedFiles.slice(0, 3);
    return {
      connected: true,
      projectRoot,
      projectName,
      stats: {
        files: summary.totalFiles,
        symbols: summary.totalSymbols,
        edges: summary.totalEdges,
        crossFileEdges: summary.crossFileEdges
      },
      mostConnectedFiles: mostConnected.map((f) => ({
        path: f.filePath,
        connections: f.incomingCount + f.outgoingCount
      })),
      summary: `Connected to ${projectName}. Found ${summary.totalFiles} files with ${summary.totalSymbols} symbols and ${summary.crossFileEdges} cross-file edges.`
    };
  } catch (error) {
    console.error("Error in connectToRepo:", error);
    return {
      error: "Connection failed",
      message: String(error)
    };
  }
}

// src/mcp/tools.ts
function getToolsList() {
  return [
    {
      name: "connect_repo",
      description: "Connect CodeGraph to a codebase for analysis. Accepts a local directory path or a GitHub repository URL. If a GitHub URL is provided, the repo will be cloned automatically. This replaces the currently loaded project.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Local directory path (e.g., '/Users/me/project') or GitHub URL (e.g., 'https://github.com/vercel/next.js')"
          },
          subdirectory: {
            type: "string",
            description: "Subdirectory within the repo to analyze (optional, e.g., 'packages/core/src')"
          }
        },
        required: ["source"]
      }
    },
    {
      name: "get_symbol_info",
      description: "Look up detailed information about a symbol (function, class, variable, type, etc.) by name. Returns file location, type, line numbers, and export status.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The symbol name to look up (e.g., 'UserService', 'handleAuth')"
          }
        },
        required: ["name"]
      }
    },
    {
      name: "get_dependencies",
      description: "Get all symbols that a given symbol depends on (what does this symbol use/import/call?).",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name or ID to analyze"
          }
        },
        required: ["symbol"]
      }
    },
    {
      name: "get_dependents",
      description: "Get all symbols that depend on a given symbol (what uses this symbol?).",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name or ID to analyze"
          }
        },
        required: ["symbol"]
      }
    },
    {
      name: "impact_analysis",
      description: "Analyze what would break if a symbol is changed, renamed, or removed. Shows direct dependents, transitive dependents (chain reaction), and all affected files. Use this before making changes to understand the blast radius.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "The symbol name or ID to analyze"
          }
        },
        required: ["symbol"]
      }
    },
    {
      name: "get_file_context",
      description: "Get complete context about a file \u2014 all symbols defined in it, all imports, all exports, and all files that import from it.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Relative file path (e.g., 'services/UserService.ts')"
          }
        },
        required: ["filePath"]
      }
    },
    {
      name: "search_symbols",
      description: "Search for symbols by name across the entire codebase. Supports partial matching.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (case-insensitive substring match)"
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default: 20)"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "get_architecture_summary",
      description: "Get a high-level overview of the project's architecture \u2014 file count, symbol count, most connected files, dependency hotspots, and orphan files.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "list_files",
      description: "List all files in the project with basic stats.",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Filter to a specific subdirectory (optional)"
          }
        }
      }
    }
  ];
}
async function handleToolCall(name, args, state) {
  try {
    let result;
    if (name === "connect_repo") {
      result = await connectToRepo(args.source, args.subdirectory, state);
    } else if (name === "get_architecture_summary") {
      if (!isProjectLoaded(state)) {
        result = {
          status: "no_project",
          message: "No project loaded. Use connect_repo to analyze a codebase."
        };
      } else {
        result = handleGetArchitectureSummary(state.graph);
      }
    } else {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        const graph = state.graph;
        switch (name) {
          case "get_symbol_info":
            result = handleGetSymbolInfo(args.name, graph);
            break;
          case "get_dependencies":
            result = handleGetDependencies(args.symbol, graph);
            break;
          case "get_dependents":
            result = handleGetDependents(args.symbol, graph);
            break;
          case "impact_analysis":
            result = handleImpactAnalysis(args.symbol, graph);
            break;
          case "get_file_context":
            result = handleGetFileContext(args.filePath, graph);
            break;
          case "search_symbols":
            result = handleSearchSymbols(args.query, args.limit || 20, graph);
            break;
          case "list_files":
            result = handleListFiles(args.directory, graph);
            break;
          default:
            result = { error: `Unknown tool: ${name}` };
        }
      }
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error("Error handling tool call:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: String(error) }, null, 2)
        }
      ]
    };
  }
}
function handleGetSymbolInfo(name, graph) {
  const matches = searchSymbols(graph, name);
  const exactMatches = matches.filter((m) => m.name.toLowerCase() === name.toLowerCase());
  const results = exactMatches.length > 0 ? exactMatches : matches.slice(0, 10);
  return {
    matches: results.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      filePath: m.filePath,
      startLine: m.startLine,
      endLine: m.endLine,
      exported: m.exported,
      scope: m.scope
    })),
    count: results.length
  };
}
function handleGetDependencies(symbol, graph) {
  const matches = searchSymbols(graph, symbol);
  if (matches.length === 0) {
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: "Try using search_symbols to find available symbols"
    };
  }
  const target = matches[0];
  const deps = getDependencies(graph, target.id);
  const grouped = {};
  graph.forEachOutEdge(target.id, (edge, attrs, source, targetNode) => {
    const kind = attrs.kind;
    if (!grouped[kind]) {
      grouped[kind] = [];
    }
    const targetAttrs = graph.getNodeAttributes(targetNode);
    grouped[kind].push({
      name: targetAttrs.name,
      filePath: targetAttrs.filePath,
      kind: targetAttrs.kind
    });
  });
  const totalCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  return {
    symbol: `${target.filePath}::${target.name}`,
    dependencies: grouped,
    totalCount
  };
}
function handleGetDependents(symbol, graph) {
  const matches = searchSymbols(graph, symbol);
  if (matches.length === 0) {
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: "Try using search_symbols to find available symbols"
    };
  }
  const target = matches[0];
  const deps = getDependents(graph, target.id);
  const grouped = {};
  graph.forEachInEdge(target.id, (edge, attrs, source, targetNode) => {
    const kind = attrs.kind;
    if (!grouped[kind]) {
      grouped[kind] = [];
    }
    const sourceAttrs = graph.getNodeAttributes(source);
    grouped[kind].push({
      name: sourceAttrs.name,
      filePath: sourceAttrs.filePath,
      kind: sourceAttrs.kind
    });
  });
  const totalCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  return {
    symbol: `${target.filePath}::${target.name}`,
    dependents: grouped,
    totalCount
  };
}
function handleImpactAnalysis(symbol, graph) {
  const matches = searchSymbols(graph, symbol);
  if (matches.length === 0) {
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: "Try using search_symbols to find available symbols"
    };
  }
  const target = matches[0];
  const impact = getImpact(graph, target.id);
  const directWithKinds = impact.directDependents.map((dep) => {
    let relationship = "unknown";
    graph.forEachEdge(dep.id, target.id, (edge, attrs) => {
      relationship = attrs.kind;
    });
    return {
      name: dep.name,
      filePath: dep.filePath,
      kind: dep.kind,
      relationship
    };
  });
  const transitiveFormatted = impact.transitiveDependents.filter((dep) => !impact.directDependents.some((d) => d.id === dep.id)).map((dep) => ({
    name: dep.name,
    filePath: dep.filePath,
    kind: dep.kind
  }));
  const summary = `Changing ${target.name} would directly affect ${impact.directDependents.length} symbol(s) and transitively affect ${transitiveFormatted.length} more, across ${impact.affectedFiles.length} file(s).`;
  return {
    symbol: {
      name: target.name,
      filePath: target.filePath,
      kind: target.kind
    },
    impact: {
      directDependents: directWithKinds,
      transitiveDependents: transitiveFormatted,
      affectedFiles: impact.affectedFiles,
      summary
    }
  };
}
function handleGetFileContext(filePath, graph) {
  const fileSymbols = [];
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) {
      fileSymbols.push({
        name: attrs.name,
        kind: attrs.kind,
        exported: attrs.exported,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        scope: attrs.scope
      });
    }
  });
  if (fileSymbols.length === 0) {
    return {
      error: `File '${filePath}' not found`,
      suggestion: "Use list_files to see available files"
    };
  }
  const importsMap = /* @__PURE__ */ new Map();
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) {
      graph.forEachOutEdge(nodeId, (edge, edgeAttrs, source, target) => {
        const targetAttrs = graph.getNodeAttributes(target);
        if (targetAttrs.filePath !== filePath) {
          if (!importsMap.has(targetAttrs.filePath)) {
            importsMap.set(targetAttrs.filePath, /* @__PURE__ */ new Set());
          }
          importsMap.get(targetAttrs.filePath).add(targetAttrs.name);
        }
      });
    }
  });
  const imports = Array.from(importsMap.entries()).map(([file, symbols]) => ({
    from: file,
    symbols: Array.from(symbols)
  }));
  const importedByMap = /* @__PURE__ */ new Map();
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) {
      graph.forEachInEdge(nodeId, (edge, edgeAttrs, source, target) => {
        const sourceAttrs = graph.getNodeAttributes(source);
        if (sourceAttrs.filePath !== filePath) {
          if (!importedByMap.has(sourceAttrs.filePath)) {
            importedByMap.set(sourceAttrs.filePath, /* @__PURE__ */ new Set());
          }
          importedByMap.get(sourceAttrs.filePath).add(attrs.name);
        }
      });
    }
  });
  const importedBy = Array.from(importedByMap.entries()).map(([file, symbols]) => ({
    file,
    symbols: Array.from(symbols)
  }));
  const summary = `${filePath} defines ${fileSymbols.length} symbol(s), imports from ${imports.length} file(s), and is imported by ${importedBy.length} file(s).`;
  return {
    filePath,
    symbols: fileSymbols,
    imports,
    importedBy,
    summary
  };
}
function handleSearchSymbols(query, limit, graph) {
  const results = searchSymbols(graph, query);
  const queryLower = query.toLowerCase();
  results.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    if (aName === queryLower && bName !== queryLower) return -1;
    if (bName === queryLower && aName !== queryLower) return 1;
    const aStarts = aName.startsWith(queryLower);
    const bStarts = bName.startsWith(queryLower);
    if (aStarts && !bStarts) return -1;
    if (bStarts && !aStarts) return 1;
    return aName.localeCompare(bName);
  });
  const showing = Math.min(limit, results.length);
  return {
    query,
    results: results.slice(0, limit).map((r) => ({
      name: r.name,
      kind: r.kind,
      filePath: r.filePath,
      exported: r.exported,
      scope: r.scope
    })),
    totalMatches: results.length,
    showing
  };
}
function handleGetArchitectureSummary(graph) {
  const summary = getArchitectureSummary(graph);
  const fileSummary = getFileSummary(graph);
  const dirMap = /* @__PURE__ */ new Map();
  fileSummary.forEach((f) => {
    const dir = f.filePath.includes("/") ? dirname2(f.filePath) : ".";
    if (!dirMap.has(dir)) {
      dirMap.set(dir, { fileCount: 0, symbolCount: 0 });
    }
    const entry = dirMap.get(dir);
    entry.fileCount++;
    entry.symbolCount += f.symbolCount;
  });
  const directories = Array.from(dirMap.entries()).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.symbolCount - a.symbolCount);
  const summaryText = `Project has ${summary.fileCount} files with ${summary.symbolCount} symbols and ${summary.edgeCount} edges. The most connected file is ${summary.mostConnectedFiles[0]?.filePath || "N/A"} with ${summary.mostConnectedFiles[0]?.connections || 0} connections.`;
  return {
    overview: {
      totalFiles: summary.fileCount,
      totalSymbols: summary.symbolCount,
      totalEdges: summary.edgeCount
    },
    mostConnectedFiles: summary.mostConnectedFiles.slice(0, 10),
    directories: directories.slice(0, 10),
    orphanFiles: summary.orphanFiles,
    summary: summaryText
  };
}
function handleListFiles(directory, graph) {
  const fileSummary = getFileSummary(graph);
  let filtered = fileSummary;
  if (directory) {
    filtered = fileSummary.filter((f) => f.filePath.startsWith(directory));
  }
  const files = filtered.map((f) => ({
    path: f.filePath,
    symbolCount: f.symbolCount,
    connections: f.incomingRefs + f.outgoingRefs
  }));
  return {
    files,
    totalFiles: files.length
  };
}

// src/mcp/server.ts
async function startMcpServer(state) {
  const server = new Server(
    {
      name: "codegraph",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getToolsList()
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await handleToolCall(name, args || {}, state);
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CodeGraph MCP server started");
  if (state.projectRoot) {
    console.error(`Project: ${state.projectRoot}`);
  } else {
    console.error("No project loaded. Use connect_repo to connect to a codebase.");
  }
}

export {
  parseProject,
  buildGraph,
  getImpact,
  getCrossFileEdges,
  getFileSummary,
  searchSymbols,
  getArchitectureSummary,
  watchProject,
  createEmptyState,
  updateFileInGraph,
  startMcpServer
};

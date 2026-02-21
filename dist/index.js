#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";
import { resolve as resolve2 } from "path";
import { writeFileSync, readFileSync as readFileSync3, existsSync as existsSync2 } from "fs";

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

// src/graph/serializer.ts
import { DirectedGraph as DirectedGraph2 } from "graphology";
function exportToJSON(graph, projectRoot) {
  const nodes = [];
  const edges = [];
  const fileSet = /* @__PURE__ */ new Set();
  graph.forEachNode((nodeId, attrs) => {
    nodes.push({
      id: nodeId,
      name: attrs.name,
      kind: attrs.kind,
      filePath: attrs.filePath,
      startLine: attrs.startLine,
      endLine: attrs.endLine,
      exported: attrs.exported,
      scope: attrs.scope
    });
    fileSet.add(attrs.filePath);
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    edges.push({
      source,
      target,
      kind: attrs.kind,
      filePath: attrs.filePath,
      line: attrs.line
    });
  });
  return {
    projectRoot,
    files: Array.from(fileSet).sort(),
    nodes,
    edges,
    metadata: {
      parsedAt: (/* @__PURE__ */ new Date()).toISOString(),
      fileCount: fileSet.size,
      nodeCount: nodes.length,
      edgeCount: edges.length
    }
  };
}
function importFromJSON(json) {
  const graph = new DirectedGraph2();
  for (const node of json.nodes) {
    graph.addNode(node.id, {
      name: node.name,
      kind: node.kind,
      filePath: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      exported: node.exported,
      scope: node.scope
    });
  }
  for (const edge of json.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.mergeEdge(edge.source, edge.target, {
        kind: edge.kind,
        filePath: edge.filePath,
        line: edge.line
      });
    }
  }
  return graph;
}

// src/graph/queries.ts
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

// src/index.ts
var program = new Command();
program.name("codegraph").description("Code cross-reference graph builder for TypeScript projects").version("0.1.0");
program.command("parse").description("Parse a TypeScript project and build dependency graph").argument("<directory>", "Project directory to parse").option("-o, --output <path>", "Output JSON file path", "codegraph-output.json").option("--pretty", "Pretty-print JSON output").option("--stats", "Print summary statistics").action(async (directory, options) => {
  const startTime = Date.now();
  try {
    const projectRoot = resolve2(directory);
    console.log(`Parsing project: ${projectRoot}`);
    const parsedFiles = parseProject(projectRoot);
    console.log(`Parsed ${parsedFiles.length} files`);
    const graph = buildGraph(parsedFiles);
    const projectGraph = exportToJSON(graph, projectRoot);
    const json = options.pretty ? JSON.stringify(projectGraph, null, 2) : JSON.stringify(projectGraph);
    writeFileSync(options.output, json, "utf-8");
    console.log(`Graph exported to: ${options.output}`);
    if (options.stats) {
      const elapsed = Date.now() - startTime;
      const summary = getArchitectureSummary(graph);
      console.log("\n=== Project Statistics ===");
      console.log(`Files: ${summary.fileCount}`);
      console.log(`Symbols: ${summary.symbolCount}`);
      console.log(`Edges: ${summary.edgeCount}`);
      console.log(`Time: ${elapsed}ms`);
      if (summary.mostConnectedFiles.length > 0) {
        console.log("\nMost Connected Files:");
        for (const file of summary.mostConnectedFiles.slice(0, 5)) {
          console.log(`  ${file.filePath} (${file.connections} connections)`);
        }
      }
      if (summary.orphanFiles.length > 0) {
        console.log(`
Orphan Files (no cross-references): ${summary.orphanFiles.length}`);
      }
    }
  } catch (err) {
    console.error("Error parsing project:", err);
    process.exit(1);
  }
});
program.command("query").description("Query impact analysis for a symbol").argument("<directory>", "Project directory").argument("<symbol-name>", "Symbol name to query").action(async (directory, symbolName) => {
  try {
    const projectRoot = resolve2(directory);
    const cacheFile = "codegraph-output.json";
    let graph;
    if (existsSync2(cacheFile)) {
      console.log("Loading from cache...");
      const json = JSON.parse(readFileSync3(cacheFile, "utf-8"));
      graph = importFromJSON(json);
    } else {
      console.log("Parsing project...");
      const parsedFiles = parseProject(projectRoot);
      graph = buildGraph(parsedFiles);
    }
    const matches = searchSymbols(graph, symbolName);
    if (matches.length === 0) {
      console.log(`No symbols found matching: ${symbolName}`);
      return;
    }
    if (matches.length > 1) {
      console.log(`Found ${matches.length} symbols matching "${symbolName}":`);
      for (const match of matches) {
        console.log(`  - ${match.name} (${match.kind}) in ${match.filePath}:${match.startLine}`);
      }
      console.log("\nShowing impact for all matches...\n");
    }
    for (const match of matches) {
      console.log(`=== Impact Analysis: ${match.name} (${match.kind}) ===`);
      console.log(`Location: ${match.filePath}:${match.startLine}-${match.endLine}`);
      const impact = getImpact(graph, match.id);
      console.log(`
Direct Dependents: ${impact.directDependents.length}`);
      for (const dep of impact.directDependents) {
        console.log(`  - ${dep.name} (${dep.kind}) in ${dep.filePath}:${dep.startLine}`);
      }
      console.log(`
Total Transitive Dependents: ${impact.transitiveDependents.length}`);
      console.log(`Affected Files: ${impact.affectedFiles.length}`);
      for (const file of impact.affectedFiles) {
        console.log(`  - ${file}`);
      }
      console.log("");
    }
  } catch (err) {
    console.error("Error querying symbol:", err);
    process.exit(1);
  }
});
program.parse();

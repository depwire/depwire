// src/utils/files.ts
import { readdirSync, statSync, existsSync, lstatSync, realpathSync } from "fs";
import { join, relative } from "path";
import os from "os";
function scanDirectory(rootDir, baseDir = rootDir) {
  const files = [];
  try {
    const entries = readdirSync(baseDir);
    for (const entry of entries) {
      const fullPath = join(baseDir, entry);
      if (entry.startsWith(".")) {
        continue;
      }
      if (entry === "node_modules" || entry === "vendor" || entry === "dist" || entry === "build" || entry === ".dart_tool" || entry === ".Rproj.user" || entry === "packrat") {
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
        const isTypeScript = (entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".d.ts");
        const isJavaScript = entry.endsWith(".js") || entry.endsWith(".jsx") || entry.endsWith(".mjs") || entry.endsWith(".cjs");
        const isPython = entry.endsWith(".py");
        const isGo = entry.endsWith(".go") && !entry.endsWith("_test.go");
        const isRust = entry.endsWith(".rs");
        const isC = entry.endsWith(".c");
        const isCpp = entry.endsWith(".cpp") || entry.endsWith(".cc") || entry.endsWith(".cxx") || entry.endsWith(".c++") || entry.endsWith(".hpp") || entry.endsWith(".hh") || entry.endsWith(".hxx") || entry.endsWith(".h++") || entry.endsWith(".h") || entry.endsWith(".inl") || entry.endsWith(".ipp");
        const isCSharp = entry.endsWith(".cs") || entry.endsWith(".csx") || entry.endsWith(".csproj");
        const isJava = entry.endsWith(".java") || entry === "pom.xml" || entry === "build.gradle" || entry === "build.gradle.kts";
        const isKotlin = entry.endsWith(".kt") || entry.endsWith(".kts") || entry === "settings.gradle.kts" || entry === "settings.gradle";
        const isPhp = entry.endsWith(".php");
        const isSwift = entry.endsWith(".swift");
        const isMojo = entry.endsWith(".mojo") || entry.endsWith(".\u{1F525}");
        const isRuby = entry.endsWith(".rb") || entry.endsWith(".rake") || entry.endsWith(".gemspec") || entry.endsWith(".ru") || entry === "Gemfile";
        const isDart = entry.endsWith(".dart") || entry === "pubspec.yaml" || entry === "pubspec.lock";
        const isR = entry.endsWith(".R") || entry.endsWith(".r") || entry.endsWith(".Rmd") || entry.endsWith(".rmd") || entry === "DESCRIPTION" || entry === "NAMESPACE" || entry === "renv.lock";
        const isCppBuild = entry === "CMakeLists.txt" || entry === "conanfile.txt" || entry === "vcpkg.json";
        const isHtml = entry.endsWith(".html");
        if (isTypeScript || isJavaScript || isPython || isGo || isRust || isC || isCpp || isCSharp || isJava || isKotlin || isPhp || isSwift || isMojo || isRuby || isDart || isR || isCppBuild || isHtml) {
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
function findProjectRoot(startDir = process.cwd()) {
  startDir = realpathSync(startDir);
  const projectMarkers = [
    "package.json",
    // Node.js
    "tsconfig.json",
    // TypeScript
    "go.mod",
    // Go
    "Cargo.toml",
    // Rust
    "pyproject.toml",
    // Python (modern)
    "setup.py",
    // Python (legacy)
    "Makefile",
    // C/C++ (make-based)
    "CMakeLists.txt",
    // C/C++ (cmake-based)
    "configure.ac",
    // C/C++ (autotools)
    "pom.xml",
    // Java (Maven)
    "build.gradle",
    // Java (Gradle)
    "build.gradle.kts",
    // Kotlin (Gradle KTS)
    "composer.json",
    // PHP
    "Package.swift",
    // Swift (SPM)
    "mojoproject.toml",
    // Mojo
    "Gemfile",
    // Ruby (Bundler)
    "pubspec.yaml",
    // Dart/Flutter
    "DESCRIPTION",
    // R package
    "renv.lock",
    // R (renv)
    ".git"
    // Any git repo
  ];
  const blocklist = ["Library", "System", "Applications", "usr", "bin", "etc", "var", "private"];
  let currentDir = startDir;
  const rootDir = "/";
  const maxDepth = 10;
  let depth = 0;
  const home = os.homedir();
  while (currentDir !== rootDir && depth < maxDepth) {
    const dirName = currentDir.split("/").pop();
    if (dirName && blocklist.includes(dirName)) {
      console.warn(`\u26A0\uFE0F  Skipping blocked directory: ${dirName}`);
      break;
    }
    for (const marker of projectMarkers) {
      const markerPath = join(currentDir, marker);
      if (existsSync(markerPath)) {
        return currentDir;
      }
    }
    const parentDir = join(currentDir, "..");
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
    depth++;
  }
  console.warn(`\u26A0\uFE0F  No project root found within ${maxDepth} levels. Using current directory: ${startDir}`);
  return startDir;
}

// src/parser/cache.ts
import { createRequire } from "module";
import { createHash } from "crypto";
import { existsSync as existsSync2, mkdirSync, openSync, readSync, closeSync, statSync as statSync2, rmSync } from "fs";
import { join as join2 } from "path";
var Database = null;
try {
  const nodeRequire = createRequire(import.meta.url);
  Database = nodeRequire("better-sqlite3");
} catch {
}
var HASH_BYTES = 4096;
function cacheDir(projectRoot) {
  return join2(projectRoot, ".depwire");
}
function cacheDbPath(projectRoot) {
  return join2(cacheDir(projectRoot), "cache.db");
}
function hashFileHead(absPath) {
  const buffer = Buffer.alloc(HASH_BYTES);
  let fd;
  try {
    fd = openSync(absPath, "r");
    const bytesRead = readSync(fd, buffer, 0, HASH_BYTES, 0);
    return createHash("sha256").update(buffer.subarray(0, bytesRead)).digest("hex");
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function openCache(projectRoot) {
  if (!Database) return null;
  const dir = cacheDir(projectRoot);
  if (!existsSync2(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(cacheDbPath(projectRoot));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_cache (
      file_path TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      parsed_data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}
function getCachedFiles(db, projectRoot, relativePaths) {
  const result = /* @__PURE__ */ new Map();
  if (!db) return result;
  const select = db.prepare(
    "SELECT mtime, size, content_hash, parsed_data FROM file_cache WHERE file_path = ?"
  );
  for (const relPath of relativePaths) {
    const row = select.get(relPath);
    if (!row) continue;
    const absPath = join2(projectRoot, relPath);
    let stats;
    try {
      stats = statSync2(absPath);
    } catch {
      continue;
    }
    const size = stats.size;
    if (size !== row.size) continue;
    const mtime = Math.floor(stats.mtimeMs);
    if (mtime !== row.mtime) {
      let hash;
      try {
        hash = hashFileHead(absPath);
      } catch {
        continue;
      }
      if (hash !== row.content_hash) continue;
    }
    try {
      result.set(relPath, JSON.parse(row.parsed_data));
    } catch {
      continue;
    }
  }
  return result;
}
function updateCache(db, projectRoot, parsedFiles) {
  if (!db) return;
  const upsert = db.prepare(
    `INSERT INTO file_cache (file_path, mtime, size, content_hash, parsed_data)
     VALUES (@file_path, @mtime, @size, @content_hash, @parsed_data)
     ON CONFLICT(file_path) DO UPDATE SET
       mtime = excluded.mtime,
       size = excluded.size,
       content_hash = excluded.content_hash,
       parsed_data = excluded.parsed_data`
  );
  const writeAll = db.transaction((files) => {
    for (const file of files) {
      const absPath = join2(projectRoot, file.filePath);
      let stats;
      try {
        stats = statSync2(absPath);
      } catch {
        continue;
      }
      let contentHash;
      try {
        contentHash = hashFileHead(absPath);
      } catch {
        continue;
      }
      upsert.run({
        file_path: file.filePath,
        mtime: Math.floor(stats.mtimeMs),
        size: stats.size,
        content_hash: contentHash,
        parsed_data: JSON.stringify(file)
      });
    }
  });
  writeAll(parsedFiles);
}
function getCacheStats(db) {
  if (!db) return { totalFiles: 0, cacheSize: 0 };
  const row = db.prepare("SELECT COUNT(*) AS count FROM file_cache").get();
  const totalFiles = row?.count ?? 0;
  let cacheSize = 0;
  try {
    cacheSize = statSync2(db.name).size;
  } catch {
    cacheSize = 0;
  }
  return { totalFiles, cacheSize };
}
function clearCache(projectRoot) {
  if (!Database) return;
  const base = cacheDbPath(projectRoot);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    rmSync(base + suffix, { force: true });
  }
}

// src/parser/index.ts
import { readFileSync as readFileSync14, statSync as statSync10 } from "fs";
import { readFile } from "fs/promises";
import { join as join20, resolve as resolve13 } from "path";

// src/parser/detect.ts
import { extname as extname12, basename as basename12 } from "path";

// src/parser/wasm-init.ts
import { Parser, Language } from "web-tree-sitter";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync as existsSync3 } from "fs";
var initialized = false;
var languages = /* @__PURE__ */ new Map();
function isWebpackBundled() {
  return typeof __webpack_require__ !== "undefined";
}
function resolveThisDir() {
  if (isWebpackBundled()) {
    return __dirname;
  }
  return path.dirname(fileURLToPath(import.meta.url));
}
async function initParser() {
  if (initialized) return;
  if (isWebpackBundled()) {
    const dir = resolveThisDir();
    await Parser.init({
      locateFile(scriptName) {
        return path.join(dir, scriptName);
      }
    });
  } else {
    await Parser.init();
  }
  const thisDir = resolveThisDir();
  let grammarsDir = path.join(thisDir, "parser", "grammars");
  if (!existsSync3(grammarsDir)) {
    grammarsDir = path.join(path.dirname(thisDir), "parser", "grammars");
  }
  if (!existsSync3(grammarsDir)) {
    grammarsDir = path.join(thisDir, "grammars");
  }
  const grammarFiles = {
    "typescript": "tree-sitter-typescript.wasm",
    "tsx": "tree-sitter-tsx.wasm",
    "javascript": "tree-sitter-javascript.wasm",
    "python": "tree-sitter-python.wasm",
    "go": "tree-sitter-go.wasm",
    "rust": "tree-sitter-rust.wasm",
    "c": "tree-sitter-c.wasm",
    "c_sharp": "tree-sitter-c_sharp.wasm",
    "java": "tree-sitter-java.wasm",
    "cpp": "tree-sitter-cpp.wasm",
    "kotlin": "tree-sitter-kotlin.wasm",
    "php": "tree-sitter-php.wasm",
    "swift": "tree-sitter-swift.wasm",
    "ruby": "tree-sitter-ruby.wasm"
  };
  for (const [name, file] of Object.entries(grammarFiles)) {
    const wasmPath = path.join(grammarsDir, file);
    const lang = await Language.load(wasmPath);
    languages.set(name, lang);
  }
  initialized = true;
}
function getParser(language) {
  if (!initialized) {
    throw new Error("Parser not initialized. Call initParser() first.");
  }
  const lang = languages.get(language);
  if (!lang) {
    throw new Error(`Language '${language}' not loaded.`);
  }
  const parser = new Parser();
  parser.setLanguage(lang);
  return parser;
}

// src/parser/resolver.ts
import { join as join3, dirname, resolve, relative as relative2 } from "path";
import { readFileSync } from "fs";
var tsconfigCache = /* @__PURE__ */ new Map();
function loadTsConfig(projectRoot) {
  if (tsconfigCache.has(projectRoot)) {
    return tsconfigCache.get(projectRoot);
  }
  let config = {};
  let currentDir = projectRoot;
  while (currentDir !== dirname(currentDir)) {
    const tsconfigPath = join3(currentDir, "tsconfig.json");
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
        return join3(baseUrl, expanded);
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
    candidates.push(join3(basePath, "index.ts"));
    candidates.push(join3(basePath, "index.tsx"));
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
  const fromDir = dirname(join3(projectRoot, fromFile));
  let resolvedPath;
  if (importPath.startsWith(".")) {
    resolvedPath = resolve(fromDir, importPath);
  } else {
    resolvedPath = resolve(projectRoot, importPath.substring(1));
  }
  return tryResolve(resolvedPath, projectRoot);
}

// src/parser/typescript.ts
function parseTypeScriptFile(filePath, sourceCode, projectRoot) {
  const languageType = filePath.endsWith(".tsx") ? "tsx" : "typescript";
  const parser = getParser(languageType);
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    imports: /* @__PURE__ */ new Map(),
    externalImports: /* @__PURE__ */ new Map(),
    declaredSymbolIds: /* @__PURE__ */ new Set(),
    unresolvedCallEdges: []
  };
  walkNode(tree.rootNode, context);
  resolveUnresolvedCallEdges(context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode(node, context) {
  const handledChildren = processNode(node, context);
  if (handledChildren) return;
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
      return true;
    case "class_declaration":
      processClassDeclaration(node, context);
      return true;
    case "variable_declaration":
    case "lexical_declaration":
      processVariableDeclaration(node, context);
      return true;
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
  return false;
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
  pushSymbol(context, {
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
  const params = node.childForFieldName("parameters");
  if (params) {
    walkNode(params, context);
  }
  const body = node.childForFieldName("body");
  if (body) {
    walkNode(body, context);
  }
  context.currentScope.pop();
}
var PRIMITIVE_TYPES = /* @__PURE__ */ new Set([
  "string",
  "number",
  "boolean",
  "any",
  "void",
  "unknown",
  "never",
  "object",
  "symbol",
  "bigint",
  "null",
  "undefined",
  "true",
  "false",
  "this"
]);
function resolveTypeTarget(typeName, context) {
  const localImport = context.imports.get(typeName);
  if (localImport) return localImport;
  if (context.externalImports.has(typeName)) return `external::${typeName}`;
  return `${context.filePath}::${typeName}`;
}
function extractBaseTypeName(typeNode) {
  if (!typeNode) return null;
  switch (typeNode.type) {
    case "type_annotation":
    case "opting_type_annotation":
      return extractBaseTypeName(typeNode.namedChild(0));
    case "type_identifier":
    case "identifier":
      return typeNode.text;
    case "generic_type":
      return extractBaseTypeName(typeNode.childForFieldName("name"));
    case "nested_type_identifier":
      return typeNode.lastNamedChild ? typeNode.lastNamedChild.text : null;
    default:
      return null;
  }
}
function emitInjectEdge(typeNode, classId, context, line, seen) {
  const typeName = extractBaseTypeName(typeNode);
  if (!typeName || PRIMITIVE_TYPES.has(typeName)) return;
  const targetId = resolveTypeTarget(typeName, context);
  if (seen.has(targetId)) return;
  seen.add(targetId);
  context.edges.push({
    source: classId,
    target: targetId,
    kind: "injects",
    filePath: context.filePath,
    line
  });
}
function processClassDependencyInjection(node, classId, context) {
  const body = node.childForFieldName("body");
  if (!body) return;
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < body.childCount; i++) {
    const member = body.child(i);
    if (!member) continue;
    if (member.type === "method_definition") {
      const nameNode = member.childForFieldName("name");
      if (nameNode && nameNode.text === "constructor") {
        const params = member.childForFieldName("parameters");
        if (params) {
          for (let p = 0; p < params.childCount; p++) {
            const param = params.child(p);
            if (!param) continue;
            if (param.type === "required_parameter" || param.type === "optional_parameter") {
              const typeAnno = param.childForFieldName("type");
              emitInjectEdge(typeAnno, classId, context, param.startPosition.row + 1, seen);
            }
          }
        }
      }
    }
    if (member.type === "public_field_definition" || member.type === "field_definition") {
      const typeAnno = member.childForFieldName("type");
      emitInjectEdge(typeAnno, classId, context, member.startPosition.row + 1, seen);
    }
  }
}
function extractAngularSelector(classNode) {
  const decorators = [];
  const collect = (n) => {
    if (!n) return;
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c && c.type === "decorator") decorators.push(c);
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
function findSelectorString(node) {
  if (node.type === "pair") {
    const key = node.childForFieldName("key");
    const keyText = key ? key.text.replace(/['"]/g, "") : "";
    if (keyText === "selector") {
      const value = node.childForFieldName("value");
      if (value && (value.type === "string" || value.type === "template_string")) {
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
function processClassDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const symbolId = `${context.filePath}::${name}`;
  const angularSelector = extractAngularSelector(node);
  pushSymbol(context, {
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine,
    endLine,
    exported,
    ...angularSelector ? { metadata: { angularSelector } } : {}
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
            const targetId = resolveTypeTarget(targetName, context);
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
            const targetId = resolveTypeTarget(targetName, context);
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
  processClassDependencyInjection(node, symbolId, context);
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
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;
      if (child.type === "public_field_definition" || child.type === "field_definition") {
        const value = child.childForFieldName("value");
        if (value) {
          walkNode(value, context);
        }
      }
      for (let j = 0; j < child.childCount; j++) {
        const maybeDecorator = child.child(j);
        if (maybeDecorator && maybeDecorator.type === "decorator") {
          walkNode(maybeDecorator, context);
        }
      }
    }
  }
  const classLevelDecorators = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "decorator") classLevelDecorators.push(child);
  }
  if (node.parent) {
    for (let i = 0; i < node.parent.childCount; i++) {
      const sibling = node.parent.child(i);
      if (sibling && sibling.type === "decorator") classLevelDecorators.push(sibling);
    }
  }
  for (const decorator of classLevelDecorators) {
    walkNode(decorator, context);
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
  pushSymbol(context, {
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
  pushSymbol(context, {
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
      const exported = isExported(node);
      const startLine = child.startPosition.row + 1;
      const endLine = child.endPosition.row + 1;
      const scope = context.currentScope.length > 0 ? context.currentScope.join(".") : void 0;
      const value = child.childForFieldName("value");
      const kind = value && value.type === "arrow_function" ? "function" : "variable";
      const symbolId = `${context.filePath}::${scope ? scope + "." : ""}${name}`;
      pushSymbol(context, {
        id: symbolId,
        name,
        kind,
        filePath: context.filePath,
        startLine,
        endLine,
        exported,
        scope
      });
      if (value) {
        if (kind === "function") {
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
function processTypeAliasDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nameNode.text;
  const exported = isExported(node);
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const symbolId = `${context.filePath}::${name}`;
  pushSymbol(context, {
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
  pushSymbol(context, {
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
  pushSymbol(context, {
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
  const importClause = findChildByType(node, "import_clause");
  if (!importClause) return;
  const importBindings = [];
  const namedImports = findChildByType(importClause, "named_imports");
  if (namedImports) {
    for (let i = 0; i < namedImports.childCount; i++) {
      const child = namedImports.child(i);
      if (child && child.type === "import_specifier") {
        const nameNode = child.childForFieldName("name");
        const aliasNode = child.childForFieldName("alias");
        if (!nameNode) continue;
        const importedName = nameNode.text;
        const localName = aliasNode ? aliasNode.text : importedName;
        importBindings.push({ importedName, localName });
      }
    }
  }
  const identifier = findChildByType(importClause, "identifier");
  if (identifier) {
    importBindings.push({ importedName: identifier.text, localName: identifier.text });
  }
  const namespaceImport = findChildByType(importClause, "namespace_import");
  if (namespaceImport) {
    const alias = findChildByType(namespaceImport, "identifier");
    if (alias) {
      importBindings.push({ importedName: alias.text, localName: alias.text });
    }
  }
  if (resolvedPath) {
    const currentSymbolId = getCurrentSymbolId(context);
    for (const { importedName, localName } of importBindings) {
      const targetId = `${resolvedPath}::${importedName}`;
      context.imports.set(localName, targetId);
      context.edges.push({
        source: currentSymbolId || `${context.filePath}::__file__`,
        target: targetId,
        kind: "imports",
        filePath: context.filePath,
        line: node.startPosition.row + 1
      });
    }
  } else {
    for (const { localName } of importBindings) {
      if (!context.externalImports.has(localName)) {
        context.externalImports.set(localName, importPath);
      }
    }
  }
}
function processExportStatement(node, context) {
  const source = node.childForFieldName("source");
  if (source) {
    const importPath = source.text.slice(1, -1);
    const resolvedPath = resolveImportPath(importPath, context.filePath, context.projectRoot);
    const exportClause = findChildByType(node, "export_clause");
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
        pushSymbol(context, {
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
      if (context.imports.has(functionName)) {
        const targetId = context.imports.get(functionName);
        context.edges.push({
          source: currentSymbolId,
          target: targetId,
          kind: "calls",
          filePath: context.filePath,
          line: node.startPosition.row + 1
        });
      } else {
        const targetId = resolveLocalCallTarget(functionName, context);
        if (context.declaredSymbolIds.has(targetId)) {
          context.edges.push({
            source: currentSymbolId,
            target: targetId,
            kind: "calls",
            filePath: context.filePath,
            line: node.startPosition.row + 1
          });
        } else {
          context.unresolvedCallEdges.push({
            source: currentSymbolId,
            functionName,
            line: node.startPosition.row + 1,
            scopeChain: [...context.currentScope]
          });
        }
      }
    }
  }
}
function processNewExpression(node, context) {
  const classNode = node.child(1);
  if (!classNode || classNode.type !== "identifier") return;
  const className = classNode.text;
  const currentSymbolId = getCurrentSymbolId(context);
  if (currentSymbolId) {
    const targetId = resolveLocalCallTarget(className, context);
    context.edges.push({
      source: currentSymbolId,
      target: targetId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
var SCOPE_BOUNDARIES = /* @__PURE__ */ new Set([
  "statement_block",
  "class_body",
  "arrow_function",
  "function_expression",
  "generator_function",
  "generator_function_declaration"
]);
function isExported(node) {
  if (!node) return false;
  if (node.type === "export_statement") return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "export") return true;
  }
  const parent = node.parent;
  if (!parent) return false;
  if (SCOPE_BOUNDARIES.has(parent.type)) return false;
  return isExported(parent);
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
function pushSymbol(context, symbol) {
  context.symbols.push(symbol);
  context.declaredSymbolIds.add(symbol.id);
}
function resolveLocalCallTarget(functionName, context) {
  const scope = context.currentScope;
  for (let i = scope.length; i >= 0; i--) {
    const candidateId = i > 0 ? `${context.filePath}::${scope.slice(0, i).join(".")}.${functionName}` : `${context.filePath}::${functionName}`;
    if (context.declaredSymbolIds.has(candidateId)) {
      return candidateId;
    }
  }
  return `${context.filePath}::${functionName}`;
}
function resolveUnresolvedCallEdges(context) {
  for (const unresolved of context.unresolvedCallEdges) {
    const savedScope = context.currentScope;
    context.currentScope = unresolved.scopeChain;
    const targetId = resolveLocalCallTarget(unresolved.functionName, context);
    context.currentScope = savedScope;
    context.edges.push({
      source: unresolved.source,
      target: targetId,
      kind: "calls",
      filePath: context.filePath,
      line: unresolved.line
    });
  }
  context.unresolvedCallEdges = [];
}
var typescriptParser = {
  name: "typescript",
  extensions: [".ts", ".tsx"],
  parseFile: parseTypeScriptFile
};

// src/parser/python.ts
import { dirname as dirname2, join as join4 } from "path";
import { existsSync as existsSync4 } from "fs";
function parsePythonFile(filePath, sourceCode, projectRoot) {
  const parser = getParser("python");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    imports: /* @__PURE__ */ new Map()
  };
  walkNode2(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode2(node, context) {
  const handledChildren = processNode2(node, context);
  if (handledChildren) return;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode2(child, context);
    }
  }
}
function processNode2(node, context) {
  const type = node.type;
  switch (type) {
    case "function_definition":
      processFunctionDefinition(node, context);
      return true;
    case "class_definition":
      processClassDefinition(node, context);
      return true;
    case "expression_statement":
      processExpressionStatement(node, context);
      return false;
    case "import_statement":
      processImportStatement2(node, context);
      return false;
    case "import_from_statement":
      processImportFromStatement(node, context);
      return false;
    case "decorated_definition":
      processDecoratedDefinition(node, context);
      return true;
    case "call":
      processCallExpression2(node, context);
      return false;
    default:
      return false;
  }
}
function processFunctionDefinition(node, context) {
  const nameNode = findChildByType2(node, "identifier");
  if (!nameNode) return;
  const name = nodeText(nameNode, context);
  const isAsync = node.text.startsWith("async ");
  const kind = context.currentClass ? "method" : "function";
  const scope = context.currentClass || void 0;
  const exported = context.currentScope.length === 0 && !context.currentClass;
  const symbolId = `${context.filePath}::${scope ? scope + "." : ""}${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  context.currentScope.push(name);
  const parameters = findChildByType2(node, "parameters");
  if (parameters) {
    walkNode2(parameters, context);
  }
  const body = findChildByType2(node, "block");
  if (body) {
    walkNode2(body, context);
  }
  context.currentScope.pop();
}
function processClassDefinition(node, context) {
  const nameNode = findChildByType2(node, "identifier");
  if (!nameNode) return;
  const name = nodeText(nameNode, context);
  const exported = context.currentScope.length === 0;
  const outerScope = context.currentClass || void 0;
  const symbolId = `${context.filePath}::${outerScope ? outerScope + "." : ""}${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope: outerScope
  });
  const argumentList = findChildByType2(node, "argument_list");
  if (argumentList) {
    for (let i = 0; i < argumentList.childCount; i++) {
      const arg = argumentList.child(i);
      if (arg && (arg.type === "identifier" || arg.type === "attribute")) {
        const baseName = nodeText(arg, context);
        const baseId = resolveSymbol(baseName, context);
        if (baseId) {
          context.edges.push({
            source: symbolId,
            target: baseId,
            kind: "inherits",
            filePath: context.filePath,
            line: arg.startPosition.row + 1
          });
        }
      }
    }
    walkNode2(argumentList, context);
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType2(node, "block");
  if (body) {
    walkNode2(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processExpressionStatement(node, context) {
  if (context.currentScope.length > 0) return;
  const assignment = findChildByType2(node, "assignment");
  if (!assignment) return;
  const left = assignment.child(0);
  if (!left || left.type !== "identifier") return;
  const name = nodeText(left, context);
  const isConstant = name === name.toUpperCase() && name.length > 1;
  const kind = isConstant ? "constant" : "variable";
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
    // Module-level variables are exported
  });
}
function processImportStatement2(node, context) {
  const dottedName = findChildByType2(node, "dotted_name");
  const identifier = findChildByType2(node, "identifier");
  const moduleName = dottedName ? nodeText(dottedName, context) : identifier ? nodeText(identifier, context) : null;
  if (!moduleName) return;
  const aliasedImport = findChildByType2(node, "aliased_import");
  let importedName = moduleName;
  if (aliasedImport) {
    const asNode = aliasedImport.childForFieldName("alias");
    if (asNode) {
      importedName = nodeText(asNode, context);
    }
  }
  const resolvedPath = resolveImportPath2(moduleName, context.filePath, context.projectRoot);
  if (resolvedPath) {
    const targetId = `${resolvedPath}::__module__`;
    const sourceId = `${context.filePath}::__file__`;
    context.imports.set(importedName, targetId);
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processImportFromStatement(node, context) {
  const moduleNode = node.childForFieldName("module_name");
  if (!moduleNode) return;
  const moduleName = nodeText(moduleNode, context);
  const importedNames = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "dotted_name" || child.type === "identifier") {
      const prevSibling = node.child(i - 1);
      if (prevSibling && prevSibling.text === "import") {
        importedNames.push(nodeText(child, context));
      }
    }
    if (child.type === "aliased_import") {
      const nameNode = child.childForFieldName("name");
      if (nameNode) {
        importedNames.push(nodeText(nameNode, context));
      }
    }
  }
  const resolvedPath = resolveImportPath2(moduleName, context.filePath, context.projectRoot);
  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    for (const importedName of importedNames) {
      if (importedName === "*") continue;
      const targetId = `${resolvedPath}::${importedName}`;
      context.imports.set(importedName, targetId);
      context.edges.push({
        source: sourceId,
        target: targetId,
        kind: "imports",
        filePath: context.filePath,
        line: node.startPosition.row + 1
      });
    }
  }
}
function processDecoratedDefinition(node, context) {
  const decoratorNodes = [];
  const decorators = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "decorator") {
      decoratorNodes.push(child);
      const decoratorName = extractDecoratorName(child, context);
      if (decoratorName) {
        decorators.push(decoratorName);
      }
    }
  }
  for (const decoratorNode of decoratorNodes) {
    walkNode2(decoratorNode, context);
  }
  const definition = findChildByType2(node, "function_definition") || findChildByType2(node, "class_definition");
  if (definition) {
    processNode2(definition, context);
    const nameNode = findChildByType2(definition, "identifier");
    if (nameNode) {
      const targetName = nodeText(nameNode, context);
      const targetScope = context.currentClass || void 0;
      const targetId = `${context.filePath}::${targetScope ? targetScope + "." : ""}${targetName}`;
      for (const decoratorName of decorators) {
        const decoratorId = resolveSymbol(decoratorName, context);
        if (decoratorId) {
          context.edges.push({
            source: decoratorId,
            target: targetId,
            kind: "decorates",
            filePath: context.filePath,
            line: node.startPosition.row + 1
          });
        }
      }
    }
  }
}
function processCallExpression2(node, context) {
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return;
  let calleeName;
  if (functionNode.type === "identifier") {
    calleeName = nodeText(functionNode, context);
  } else if (functionNode.type === "attribute") {
    const attrNode = functionNode.childForFieldName("attribute");
    if (!attrNode) return;
    calleeName = nodeText(attrNode, context);
  } else {
    return;
  }
  const builtins = ["print", "len", "str", "int", "float", "list", "dict", "set", "tuple", "range", "enumerate", "zip", "map", "filter", "open", "type", "isinstance", "hasattr", "getattr", "setattr"];
  if (builtins.includes(calleeName)) return;
  const callerId = getCurrentSymbolId2(context);
  if (!callerId) return;
  const calleeId = resolveSymbol(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function resolveImportPath2(moduleName, currentFile, projectRoot) {
  if (moduleName.startsWith(".")) {
    const currentDir = dirname2(join4(projectRoot, currentFile));
    let level = 0;
    while (moduleName[level] === ".") level++;
    let targetDir = currentDir;
    for (let i = 0; i < level - 1; i++) {
      targetDir = dirname2(targetDir);
    }
    const relativeModule = moduleName.substring(level);
    if (relativeModule) {
      const modulePath2 = relativeModule.replace(/\./g, "/");
      const candidates2 = [
        join4(targetDir, `${modulePath2}.py`),
        join4(targetDir, modulePath2, "__init__.py")
      ];
      for (const candidate of candidates2) {
        if (existsSync4(candidate)) {
          return candidate.substring(projectRoot.length + 1);
        }
      }
    } else {
      const initPath = join4(targetDir, "__init__.py");
      if (existsSync4(initPath)) {
        return initPath.substring(projectRoot.length + 1);
      }
    }
    return null;
  }
  const modulePath = moduleName.replace(/\./g, "/");
  const candidates = [
    join4(projectRoot, `${modulePath}.py`),
    join4(projectRoot, modulePath, "__init__.py")
  ];
  for (const candidate of candidates) {
    if (existsSync4(candidate)) {
      return candidate.substring(projectRoot.length + 1);
    }
  }
  return null;
}
function resolveSymbol(name, context) {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  const currentFileId = `${context.filePath}::${name}`;
  const symbol = context.symbols.find((s) => s.id === currentFileId);
  if (symbol) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    const classMethod = context.symbols.find((s) => s.id === classMethodId);
    if (classMethod) {
      return classMethodId;
    }
  }
  return null;
}
function extractDecoratorName(node, context) {
  const identifier = findChildByType2(node, "identifier");
  const attribute = findChildByType2(node, "attribute");
  if (attribute) {
    return nodeText(attribute, context);
  } else if (identifier) {
    return nodeText(identifier, context);
  }
  return null;
}
function findChildByType2(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      return child;
    }
  }
  return null;
}
function nodeText(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId2(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope.join(".")}`;
}
var pythonParser = {
  name: "python",
  extensions: [".py"],
  parseFile: parsePythonFile
};

// src/parser/javascript.ts
import { existsSync as existsSync5 } from "fs";
import { join as join5, dirname as dirname3, extname as extname2 } from "path";
function parseJavaScriptFile(filePath, sourceCode, projectRoot) {
  const parser = getParser("javascript");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    imports: /* @__PURE__ */ new Map(),
    isJSX: filePath.endsWith(".jsx")
  };
  walkNode3(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode3(node, context) {
  processNode3(node, context);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode3(child, context);
    }
  }
}
function processNode3(node, context) {
  const type = node.type;
  switch (type) {
    case "function_declaration":
      processFunctionDeclaration2(node, context);
      break;
    case "function":
      processFunctionExpression(node, context);
      break;
    case "class_declaration":
      processClassDeclaration2(node, context);
      break;
    case "method_definition":
      processMethodDefinition2(node, context);
      break;
    case "lexical_declaration":
    case "variable_declaration":
      processVariableDeclaration2(node, context);
      break;
    case "import_statement":
      processImportStatement3(node, context);
      break;
    case "export_statement":
      processExportStatement2(node, context);
      break;
    case "call_expression":
      processCallExpression3(node, context);
      break;
    case "new_expression":
      processNewExpression2(node, context);
      break;
    case "jsx_element":
    case "jsx_self_closing_element":
      if (context.isJSX) {
        processJSXElement(node, context);
      }
      break;
  }
}
function processFunctionDeclaration2(node, context) {
  const nameNode = findChildByType3(node, "identifier");
  if (!nameNode) return;
  const name = nodeText2(nameNode, context);
  const exported = isExported2(node.parent);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
  context.currentScope.push(name);
  const body = findChildByType3(node, "statement_block");
  if (body) {
    walkNode3(body, context);
  }
  context.currentScope.pop();
}
function processFunctionExpression(node, context) {
  if (node.parent && node.parent.type === "variable_declarator") {
    const nameNode = node.parent.childForFieldName("name");
    if (nameNode && nameNode.type === "identifier") {
      const name = nodeText2(nameNode, context);
      const exported = isExported2(node.parent.parent?.parent || null);
      const symbolId = `${context.filePath}::${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "function",
        filePath: context.filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        exported
      });
      context.currentScope.push(name);
      const body = findChildByType3(node, "statement_block");
      if (body) {
        walkNode3(body, context);
      }
      context.currentScope.pop();
    }
  }
}
function processClassDeclaration2(node, context) {
  const nameNode = findChildByType3(node, "identifier");
  if (!nameNode) return;
  const name = nodeText2(nameNode, context);
  const exported = isExported2(node.parent);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
  const heritage = node.childForFieldName("heritage");
  if (heritage) {
    for (let i = 0; i < heritage.childCount; i++) {
      const child = heritage.child(i);
      if (child && child.type === "extends_clause") {
        const baseClass = findChildByType3(child, "identifier");
        if (baseClass) {
          const baseName = nodeText2(baseClass, context);
          const baseId = resolveSymbol2(baseName, context);
          if (baseId) {
            context.edges.push({
              source: symbolId,
              target: baseId,
              kind: "extends",
              filePath: context.filePath,
              line: child.startPosition.row + 1
            });
          }
        }
      }
    }
  }
  context.currentScope.push(name);
  const body = findChildByType3(node, "class_body");
  if (body) {
    walkNode3(body, context);
  }
  context.currentScope.pop();
}
function processMethodDefinition2(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText2(nameNode, context);
  const scope = context.currentScope.length > 0 ? context.currentScope[context.currentScope.length - 1] : void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: false,
    scope
  });
  context.currentScope.push(name);
  const body = findChildByType3(node, "statement_block");
  if (body) {
    walkNode3(body, context);
  }
  context.currentScope.pop();
}
function processVariableDeclaration2(node, context) {
  const declarators = node.children.filter((c) => c.type === "variable_declarator");
  for (const declarator of declarators) {
    const nameNode = declarator.childForFieldName("name");
    const valueNode = declarator.childForFieldName("value");
    if (!nameNode) continue;
    if (valueNode && valueNode.type === "call_expression") {
      const functionNode = valueNode.childForFieldName("function");
      if (functionNode && nodeText2(functionNode, context) === "require") {
        processRequireCall(declarator, valueNode, context);
        continue;
      }
    }
    if (context.currentScope.length === 0) {
      const name = extractIdentifierName(nameNode, context);
      if (name) {
        const exported = isExported2(node.parent);
        const symbolId = `${context.filePath}::${name}`;
        context.symbols.push({
          id: symbolId,
          name,
          kind: "variable",
          filePath: context.filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported
        });
      }
    }
  }
}
function processRequireCall(declarator, callNode, context) {
  const nameNode = declarator.childForFieldName("name");
  const args = callNode.childForFieldName("arguments");
  if (!args) return;
  const stringArg = findChildByType3(args, "string");
  if (!stringArg) return;
  const modulePath = nodeText2(stringArg, context).slice(1, -1);
  const resolvedPath = resolveJavaScriptImport(modulePath, context.filePath, context.projectRoot);
  if (!resolvedPath) return;
  if (nameNode) {
    if (nameNode.type === "identifier") {
      const name = nodeText2(nameNode, context);
      const targetId = `${resolvedPath}::${name}`;
      const sourceId = `${context.filePath}::__file__`;
      context.imports.set(name, targetId);
      context.edges.push({
        source: sourceId,
        target: targetId,
        kind: "imports",
        filePath: context.filePath,
        line: callNode.startPosition.row + 1
      });
    } else if (nameNode.type === "object_pattern") {
      const properties = nameNode.children.filter((c) => c.type === "pair_pattern" || c.type === "shorthand_property_identifier_pattern");
      for (const prop of properties) {
        let importedName;
        if (prop.type === "shorthand_property_identifier_pattern") {
          importedName = nodeText2(prop, context);
        } else {
          const keyNode = prop.childForFieldName("key");
          if (keyNode) {
            importedName = nodeText2(keyNode, context);
          } else {
            continue;
          }
        }
        const targetId = `${resolvedPath}::${importedName}`;
        const sourceId = `${context.filePath}::__file__`;
        context.imports.set(importedName, targetId);
        context.edges.push({
          source: sourceId,
          target: targetId,
          kind: "imports",
          filePath: context.filePath,
          line: callNode.startPosition.row + 1
        });
      }
    }
  }
}
function processImportStatement3(node, context) {
  const source = node.childForFieldName("source");
  if (!source) return;
  const importPath = nodeText2(source, context).slice(1, -1);
  const resolvedPath = resolveJavaScriptImport(importPath, context.filePath, context.projectRoot);
  if (!resolvedPath) return;
  const importClause = findChildByType3(node, "import_clause");
  if (!importClause) {
    return;
  }
  const namedImports = findChildByType3(importClause, "named_imports");
  const defaultImport = findChildByType3(importClause, "identifier");
  const namespaceImport = findChildByType3(importClause, "namespace_import");
  const sourceId = `${context.filePath}::__file__`;
  if (defaultImport) {
    const name = nodeText2(defaultImport, context);
    const targetId = `${resolvedPath}::default`;
    context.imports.set(name, targetId);
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
  if (namedImports) {
    const specifiers = namedImports.children.filter((c) => c.type === "import_specifier");
    for (const specifier of specifiers) {
      const nameNode = specifier.childForFieldName("name");
      const aliasNode = specifier.childForFieldName("alias");
      if (nameNode) {
        const importedName = nodeText2(nameNode, context);
        const localName = aliasNode ? nodeText2(aliasNode, context) : importedName;
        const targetId = `${resolvedPath}::${importedName}`;
        context.imports.set(localName, targetId);
        context.edges.push({
          source: sourceId,
          target: targetId,
          kind: "imports",
          filePath: context.filePath,
          line: node.startPosition.row + 1
        });
      }
    }
  }
  if (namespaceImport) {
    const aliasNode = findChildByType3(namespaceImport, "identifier");
    if (aliasNode) {
      const localName = nodeText2(aliasNode, context);
      const targetId = `${resolvedPath}::*`;
      context.imports.set(localName, targetId);
      context.edges.push({
        source: sourceId,
        target: targetId,
        kind: "imports",
        filePath: context.filePath,
        line: node.startPosition.row + 1
      });
    }
  }
}
function processExportStatement2(node, context) {
  const declaration = findChildByType3(node, "lexical_declaration") || findChildByType3(node, "variable_declaration") || findChildByType3(node, "function_declaration") || findChildByType3(node, "class_declaration");
  if (declaration) {
    processNode3(declaration, context);
  }
}
function processCallExpression3(node, context) {
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return;
  let calleeName = null;
  if (functionNode.type === "identifier") {
    calleeName = nodeText2(functionNode, context);
  } else if (functionNode.type === "member_expression") {
    const property = functionNode.childForFieldName("property");
    if (property) {
      calleeName = nodeText2(property, context);
    }
  }
  if (!calleeName) return;
  const builtins = ["console", "require", "setTimeout", "setInterval", "parseInt", "parseFloat", "JSON", "Object", "Array", "String", "Number", "Boolean"];
  if (builtins.includes(calleeName)) return;
  const callerId = getCurrentSymbolId3(context);
  if (!callerId) return;
  const calleeId = resolveSymbol2(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processNewExpression2(node, context) {
  const constructorNode = findChildByType3(node, "identifier");
  if (!constructorNode) return;
  const className = nodeText2(constructorNode, context);
  const callerId = getCurrentSymbolId3(context);
  if (!callerId) return;
  const classId = resolveSymbol2(className, context);
  if (classId) {
    context.edges.push({
      source: callerId,
      target: classId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processJSXElement(node, context) {
  let tagName = null;
  if (node.type === "jsx_self_closing_element") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      tagName = nodeText2(nameNode, context);
    }
  } else if (node.type === "jsx_element") {
    const openingElement = findChildByType3(node, "jsx_opening_element");
    if (openingElement) {
      const nameNode = openingElement.childForFieldName("name");
      if (nameNode) {
        tagName = nodeText2(nameNode, context);
      }
    }
  }
  if (!tagName) return;
  if (!/^[A-Z]/.test(tagName)) return;
  const callerId = getCurrentSymbolId3(context);
  if (!callerId) return;
  const componentId = resolveSymbol2(tagName, context);
  if (componentId) {
    context.edges.push({
      source: callerId,
      target: componentId,
      kind: "references",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function resolveJavaScriptImport(importPath, currentFile, projectRoot) {
  if (importPath.startsWith(".")) {
    const currentDir = dirname3(join5(projectRoot, currentFile));
    const targetPath = join5(currentDir, importPath);
    const extensions = [".js", ".jsx", ".mjs", ".cjs"];
    const indexFiles = ["index.js", "index.jsx", "index.mjs"];
    if (extname2(importPath)) {
      const fullPath = targetPath;
      if (existsSync5(fullPath)) {
        return fullPath.substring(projectRoot.length + 1);
      }
      return null;
    }
    for (const ext of extensions) {
      const candidate = `${targetPath}${ext}`;
      if (existsSync5(candidate)) {
        return candidate.substring(projectRoot.length + 1);
      }
    }
    for (const indexFile of indexFiles) {
      const candidate = join5(targetPath, indexFile);
      if (existsSync5(candidate)) {
        return candidate.substring(projectRoot.length + 1);
      }
    }
    return null;
  }
  return null;
}
function resolveSymbol2(name, context) {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  const currentFileId = `${context.filePath}::${name}`;
  const symbol = context.symbols.find((s) => s.id === currentFileId);
  if (symbol) {
    return currentFileId;
  }
  if (context.currentScope.length > 0) {
    const scopedId = `${context.filePath}::${context.currentScope.join(".")}.${name}`;
    const scopedSymbol = context.symbols.find((s) => s.id === scopedId);
    if (scopedSymbol) {
      return scopedId;
    }
  }
  return null;
}
function isExported2(node) {
  if (!node) return false;
  let current = node;
  while (current) {
    if (current.type === "export_statement") {
      return true;
    }
    current = current.parent;
  }
  return false;
}
function extractIdentifierName(node, context) {
  if (node.type === "identifier") {
    return nodeText2(node, context);
  } else if (node.type === "object_pattern") {
    const properties = node.children.filter((c) => c.type === "shorthand_property_identifier_pattern");
    if (properties.length > 0) {
      return nodeText2(properties[0], context);
    }
  }
  return null;
}
function findChildByType3(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      return child;
    }
  }
  return null;
}
function nodeText2(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId3(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope.join(".")}`;
}
var javascriptParser = {
  name: "javascript",
  extensions: [".js", ".jsx", ".mjs", ".cjs"],
  parseFile: parseJavaScriptFile
};

// src/parser/go.ts
import { existsSync as existsSync6, readFileSync as readFileSync2, readdirSync as readdirSync2 } from "fs";
import { join as join6, dirname as dirname4, resolve as resolve2 } from "path";
function parseGoFile(filePath, sourceCode, projectRoot) {
  const parser = getParser("go");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const moduleName = readGoModuleName(projectRoot);
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    packageName: "",
    imports: /* @__PURE__ */ new Map(),
    moduleName
  };
  extractPackageName(tree.rootNode, context);
  walkNode4(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function extractPackageName(node, context) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "package_clause") {
      const pkgIdentifier = findChildByType4(child, "package_identifier");
      if (pkgIdentifier) {
        context.packageName = nodeText3(pkgIdentifier, context);
      }
      break;
    }
  }
}
function walkNode4(node, context) {
  processNode4(node, context);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode4(child, context);
    }
  }
}
function processNode4(node, context) {
  const type = node.type;
  switch (type) {
    case "function_declaration":
      processFunctionDeclaration3(node, context);
      break;
    case "method_declaration":
      processMethodDeclaration(node, context);
      break;
    case "type_declaration":
      processTypeDeclaration(node, context);
      break;
    case "const_declaration":
      processConstDeclaration(node, context);
      break;
    case "var_declaration":
      processVarDeclaration(node, context);
      break;
    case "import_declaration":
      processImportDeclaration(node, context);
      break;
    case "call_expression":
      processCallExpression4(node, context);
      break;
  }
}
function processFunctionDeclaration3(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText3(nameNode, context);
  const exported = isExported3(name);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
  context.currentScope.push(name);
  const body = node.childForFieldName("body");
  if (body) {
    walkNode4(body, context);
  }
  context.currentScope.pop();
}
function processMethodDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  const receiverNode = node.childForFieldName("receiver");
  if (!nameNode || !receiverNode) return;
  const name = nodeText3(nameNode, context);
  const receiverType = extractReceiverType(receiverNode, context);
  if (!receiverType) return;
  const exported = isExported3(name);
  const symbolId = `${context.filePath}::${receiverType}.${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope: receiverType
  });
  context.currentScope.push(`${receiverType}.${name}`);
  const body = node.childForFieldName("body");
  if (body) {
    walkNode4(body, context);
  }
  context.currentScope.pop();
}
function processTypeDeclaration(node, context) {
  const typeSpecs = findChildrenByType(node, "type_spec");
  for (const typeSpec of typeSpecs) {
    const nameNode = typeSpec.childForFieldName("name");
    const typeNode = typeSpec.childForFieldName("type");
    if (!nameNode || !typeNode) continue;
    const name = nodeText3(nameNode, context);
    const exported = isExported3(name);
    let kind = "type_alias";
    if (typeNode.type === "struct_type") {
      kind = "class";
      const fieldList = findChildByType4(typeNode, "field_declaration_list");
      if (fieldList) {
        for (let i = 0; i < fieldList.childCount; i++) {
          const field = fieldList.child(i);
          if (field && field.type === "field_declaration") {
            const fieldName = field.childForFieldName("name");
            const fieldType = field.childForFieldName("type");
            if (!fieldName && fieldType) {
              const embeddedTypeName = extractTypeName(fieldType, context);
              if (embeddedTypeName) {
                const embeddedId = resolveSymbol3(embeddedTypeName, context);
                if (embeddedId) {
                  const symbolId2 = `${context.filePath}::${name}`;
                  context.edges.push({
                    source: symbolId2,
                    target: embeddedId,
                    kind: "inherits",
                    filePath: context.filePath,
                    line: field.startPosition.row + 1
                  });
                }
              }
            }
          }
        }
      }
    } else if (typeNode.type === "interface_type") {
      kind = "interface";
    }
    const symbolId = `${context.filePath}::${name}`;
    context.symbols.push({
      id: symbolId,
      name,
      kind,
      filePath: context.filePath,
      startLine: typeSpec.startPosition.row + 1,
      endLine: typeSpec.endPosition.row + 1,
      exported
    });
  }
}
function processConstDeclaration(node, context) {
  const constSpecs = findChildrenByType(node, "const_spec");
  for (const constSpec of constSpecs) {
    const nameNode = constSpec.childForFieldName("name");
    if (!nameNode) continue;
    const names = extractIdentifierNames(nameNode, context);
    for (const name of names) {
      const exported = isExported3(name);
      const symbolId = `${context.filePath}::${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "constant",
        filePath: context.filePath,
        startLine: constSpec.startPosition.row + 1,
        endLine: constSpec.endPosition.row + 1,
        exported
      });
    }
  }
}
function processVarDeclaration(node, context) {
  if (context.currentScope.length > 0) return;
  const varSpecs = findChildrenByType(node, "var_spec");
  for (const varSpec of varSpecs) {
    const nameNode = varSpec.childForFieldName("name");
    if (!nameNode) continue;
    const names = extractIdentifierNames(nameNode, context);
    for (const name of names) {
      const exported = isExported3(name);
      const symbolId = `${context.filePath}::${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "variable",
        filePath: context.filePath,
        startLine: varSpec.startPosition.row + 1,
        endLine: varSpec.endPosition.row + 1,
        exported
      });
    }
  }
}
function processImportDeclaration(node, context) {
  let importSpecs = [];
  const importSpecList = findChildByType4(node, "import_spec_list");
  if (importSpecList) {
    importSpecs = findChildrenByType(importSpecList, "import_spec");
  } else {
    importSpecs = findChildrenByType(node, "import_spec");
  }
  for (const importSpec of importSpecs) {
    const pathNode = importSpec.childForFieldName("path");
    if (!pathNode) continue;
    const importPath = nodeText3(pathNode, context).slice(1, -1);
    const nameNode = importSpec.childForFieldName("name");
    let alias = "";
    if (nameNode) {
      alias = nodeText3(nameNode, context);
    } else {
      const segments = importPath.split("/");
      alias = segments[segments.length - 1];
    }
    context.imports.set(alias, importPath);
    const resolvedFiles = resolveGoImport(importPath, context.projectRoot, context.moduleName);
    if (resolvedFiles.length > 0) {
      const sourceId = `${context.filePath}::__file__`;
      for (const targetFile of resolvedFiles) {
        const targetId = `${targetFile}::__file__`;
        context.edges.push({
          source: sourceId,
          target: targetId,
          kind: "imports",
          filePath: context.filePath,
          line: importSpec.startPosition.row + 1
        });
      }
    }
  }
}
function processCallExpression4(node, context) {
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return;
  let calleeName = null;
  if (functionNode.type === "identifier") {
    calleeName = nodeText3(functionNode, context);
  } else if (functionNode.type === "selector_expression") {
    const field = functionNode.childForFieldName("field");
    if (field) {
      calleeName = nodeText3(field, context);
    }
  }
  if (!calleeName) return;
  const builtins = ["make", "len", "cap", "append", "copy", "delete", "panic", "recover", "print", "println", "new"];
  if (builtins.includes(calleeName)) return;
  const callerId = getCurrentSymbolId4(context);
  if (!callerId) return;
  const calleeId = resolveSymbol3(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function readGoModuleName(projectRoot) {
  let currentDir = projectRoot;
  for (let i = 0; i < 5; i++) {
    const goModPath = resolve2(currentDir, "go.mod");
    if (existsSync6(goModPath)) {
      try {
        const content = readFileSync2(goModPath, "utf-8");
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("module ")) {
            return trimmed.substring(7).trim();
          }
        }
      } catch (error) {
        console.error(`Error reading go.mod: ${error}`);
      }
    }
    const parentDir = dirname4(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}
function resolveGoImport(importPath, projectRoot, moduleName) {
  if (!importPath.includes(".") && !importPath.includes("/")) {
    return [];
  }
  if (moduleName && importPath.startsWith(moduleName)) {
    const relativePath = importPath.substring(moduleName.length + 1);
    const packageDir2 = join6(projectRoot, relativePath);
    return findGoFilesInDir(packageDir2, projectRoot);
  }
  const segments = importPath.split("/");
  const packageDir = join6(projectRoot, ...segments);
  if (existsSync6(packageDir)) {
    return findGoFilesInDir(packageDir, projectRoot);
  }
  return [];
}
function findGoFilesInDir(dir, projectRoot) {
  if (!existsSync6(dir)) return [];
  try {
    const files = readdirSync2(dir);
    const goFiles = files.filter((f) => f.endsWith(".go") && !f.endsWith("_test.go"));
    return goFiles.map((f) => {
      const fullPath = join6(dir, f);
      return fullPath.substring(projectRoot.length + 1);
    });
  } catch (error) {
    console.error(`[findGoFilesInDir] Error:`, error);
    return [];
  }
}
function isExported3(name) {
  return name.length > 0 && name[0] === name[0].toUpperCase();
}
function extractReceiverType(receiverNode, context) {
  const paramDecl = findChildByType4(receiverNode, "parameter_declaration");
  if (!paramDecl) return null;
  const typeNode = paramDecl.childForFieldName("type");
  if (!typeNode) return null;
  return extractTypeName(typeNode, context);
}
function extractTypeName(typeNode, context) {
  if (typeNode.type === "pointer_type") {
    for (let i = 0; i < typeNode.childCount; i++) {
      const child = typeNode.child(i);
      if (child && child.type === "type_identifier") {
        return nodeText3(child, context);
      }
    }
    return null;
  } else if (typeNode.type === "type_identifier") {
    return nodeText3(typeNode, context);
  }
  return null;
}
function extractIdentifierNames(node, context) {
  if (node.type === "identifier") {
    return [nodeText3(node, context)];
  } else if (node.type === "identifier_list") {
    const names = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === "identifier") {
        names.push(nodeText3(child, context));
      }
    }
    return names;
  }
  return [];
}
function resolveSymbol3(name, context) {
  const currentFileId = `${context.filePath}::${name}`;
  const symbol = context.symbols.find((s) => s.id === currentFileId);
  if (symbol) {
    return currentFileId;
  }
  if (context.currentScope.length > 0) {
    for (let i = context.currentScope.length - 1; i >= 0; i--) {
      const scopedId = `${context.filePath}::${context.currentScope[i]}.${name}`;
      const scopedSymbol = context.symbols.find((s) => s.id === scopedId);
      if (scopedSymbol) {
        return scopedId;
      }
    }
  }
  return null;
}
function findChildByType4(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      return child;
    }
  }
  return null;
}
function findChildrenByType(node, type) {
  const results = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      results.push(child);
    }
  }
  return results;
}
function nodeText3(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId4(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
var goParser = {
  name: "go",
  extensions: [".go"],
  parseFile: parseGoFile
};

// src/parser/rust.ts
import { existsSync as existsSync7 } from "fs";
import { join as join7, dirname as dirname5, relative as relative3 } from "path";
function parseRustFile(filePath, sourceCode, projectRoot) {
  const parser = getParser("rust");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentModule: []
  };
  walkNode5(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode5(node, context) {
  processNode5(node, context);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode5(child, context);
    }
  }
}
function processNode5(node, context) {
  const type = node.type;
  switch (type) {
    case "function_item":
      processFunctionItem(node, context);
      break;
    case "struct_item":
      processStructItem(node, context);
      break;
    case "enum_item":
      processEnumItem(node, context);
      break;
    case "trait_item":
      processTraitItem(node, context);
      break;
    case "impl_item":
      processImplItem(node, context);
      break;
    case "const_item":
      processConstItem(node, context);
      break;
    case "type_item":
      processTypeItem(node, context);
      break;
    case "use_declaration":
      processUseDeclaration(node, context);
      break;
    case "mod_item":
      processModItem(node, context);
      break;
    case "call_expression":
      processCallExpression5(node, context);
      break;
  }
}
function processFunctionItem(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText4(nameNode, context);
  const exported = hasVisibility(node, "pub");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
  context.currentScope.push(name);
  const body = node.childForFieldName("body");
  if (body) {
    walkNode5(body, context);
  }
  context.currentScope.pop();
}
function processStructItem(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText4(nameNode, context);
  const exported = hasVisibility(node, "pub");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    // Consistent with other parsers
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
}
function processEnumItem(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText4(nameNode, context);
  const exported = hasVisibility(node, "pub");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "enum",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
}
function processTraitItem(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText4(nameNode, context);
  const exported = hasVisibility(node, "pub");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "interface",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
}
function processImplItem(node, context) {
  const typeNode = node.childForFieldName("type");
  if (!typeNode) return;
  const typeName = extractTypeName2(typeNode, context);
  if (!typeName) return;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "function_item") {
      const nameNode = child.childForFieldName("name");
      if (!nameNode) continue;
      const name = nodeText4(nameNode, context);
      const exported = hasVisibility(child, "pub");
      const symbolId = `${context.filePath}::${typeName}.${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "method",
        filePath: context.filePath,
        startLine: child.startPosition.row + 1,
        endLine: child.endPosition.row + 1,
        exported,
        scope: typeName
      });
      context.currentScope.push(`${typeName}.${name}`);
      const body = child.childForFieldName("body");
      if (body) {
        walkNode5(body, context);
      }
      context.currentScope.pop();
    }
  }
}
function processConstItem(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText4(nameNode, context);
  const exported = hasVisibility(node, "pub");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "constant",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
}
function processTypeItem(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText4(nameNode, context);
  const exported = hasVisibility(node, "pub");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "type_alias",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
}
function processUseDeclaration(node, context) {
  let pathNode = findChildByType5(node, "scoped_identifier");
  if (!pathNode) {
    pathNode = findChildByType5(node, "identifier");
  }
  if (!pathNode) {
    pathNode = findChildByType5(node, "use_as_clause");
    if (pathNode) {
      pathNode = pathNode.childForFieldName("path");
    }
  }
  if (!pathNode) {
    return;
  }
  let pathText = nodeText4(pathNode, context);
  if (!pathText.startsWith("crate::") && !pathText.startsWith("super::") && !pathText.startsWith("self::")) {
    return;
  }
  const segments = pathText.split("::");
  if (segments.length > 1) {
    segments.pop();
    pathText = segments.join("::");
  }
  const resolvedFiles = resolveRustImport(pathText, context);
  if (resolvedFiles.length === 0) return;
  const sourceId = `${context.filePath}::__file__`;
  for (const targetFile of resolvedFiles) {
    const targetId = `${targetFile}::__file__`;
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processModItem(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText4(nameNode, context);
  const body = node.childForFieldName("body");
  if (!body) {
    const resolvedFiles = resolveModuleFile(name, context);
    if (resolvedFiles.length > 0) {
      const sourceId = `${context.filePath}::__file__`;
      for (const targetFile of resolvedFiles) {
        const targetId = `${targetFile}::__file__`;
        context.edges.push({
          source: sourceId,
          target: targetId,
          kind: "imports",
          filePath: context.filePath,
          line: node.startPosition.row + 1
        });
      }
    }
  }
  const exported = hasVisibility(node, "pub");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "module",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
}
function processCallExpression5(node, context) {
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return;
  const calleeName = extractCalleeNameFromNode(functionNode, context);
  if (!calleeName) return;
  const builtins = ["println!", "print!", "eprintln!", "eprint!", "format!", "panic!", "assert!", "assert_eq!", "assert_ne!", "vec!"];
  if (builtins.includes(calleeName)) return;
  const callerId = getCurrentSymbolId5(context);
  if (!callerId) return;
  const calleeId = resolveSymbol4(calleeName, context);
  if (!calleeId) return;
  context.edges.push({
    source: callerId,
    target: calleeId,
    kind: "calls",
    filePath: context.filePath,
    line: node.startPosition.row + 1
  });
}
function resolveRustImport(importPath, context) {
  if (importPath.startsWith("crate::")) {
    const relativePath = importPath.replace("crate::", "").replace(/::/g, "/");
    const possibleFiles = [
      join7(context.projectRoot, "src", `${relativePath}.rs`),
      join7(context.projectRoot, "src", relativePath, "mod.rs")
    ];
    return possibleFiles.filter((f) => existsSync7(f)).map((f) => relative3(context.projectRoot, f));
  }
  if (importPath.startsWith("super::")) {
    const currentFileAbs = join7(context.projectRoot, context.filePath);
    const currentDir = dirname5(currentFileAbs);
    const parentDir = dirname5(currentDir);
    const relativePath = importPath.replace("super::", "").replace(/::/g, "/");
    const possibleFiles = [
      join7(parentDir, `${relativePath}.rs`),
      join7(parentDir, relativePath, "mod.rs")
    ];
    return possibleFiles.filter((f) => existsSync7(f)).map((f) => relative3(context.projectRoot, f));
  }
  if (importPath.startsWith("self::")) {
    const currentFileAbs = join7(context.projectRoot, context.filePath);
    const currentDir = dirname5(currentFileAbs);
    const relativePath = importPath.replace("self::", "").replace(/::/g, "/");
    const possibleFiles = [
      join7(currentDir, `${relativePath}.rs`),
      join7(currentDir, relativePath, "mod.rs")
    ];
    return possibleFiles.filter((f) => existsSync7(f)).map((f) => relative3(context.projectRoot, f));
  }
  return [];
}
function resolveModuleFile(moduleName, context) {
  const currentFileAbs = join7(context.projectRoot, context.filePath);
  const currentDir = dirname5(currentFileAbs);
  const possibleFiles = [
    join7(currentDir, `${moduleName}.rs`),
    join7(currentDir, moduleName, "mod.rs")
  ];
  return possibleFiles.filter((f) => existsSync7(f)).map((f) => relative3(context.projectRoot, f));
}
function hasVisibility(node, visibility) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "visibility_modifier") {
      const text = nodeText4(child, { sourceCode: node.text });
      return text === visibility;
    }
  }
  return false;
}
function extractTypeName2(typeNode, context) {
  if (typeNode.type === "type_identifier") {
    return nodeText4(typeNode, context);
  }
  if (typeNode.type === "generic_type") {
    const typeId = findChildByType5(typeNode, "type_identifier");
    if (typeId) {
      return nodeText4(typeId, context);
    }
  }
  for (let i = 0; i < typeNode.childCount; i++) {
    const child = typeNode.child(i);
    if (child && child.type === "type_identifier") {
      return nodeText4(child, context);
    }
  }
  return null;
}
function extractCalleeNameFromNode(functionNode, context) {
  if (functionNode.type === "identifier") {
    return nodeText4(functionNode, context);
  }
  if (functionNode.type === "field_expression") {
    const field = functionNode.childForFieldName("field");
    if (field) {
      return nodeText4(field, context);
    }
  }
  if (functionNode.type === "scoped_identifier") {
    const name = functionNode.childForFieldName("name");
    if (name) {
      return nodeText4(name, context);
    }
  }
  return null;
}
function resolveSymbol4(name, context) {
  const currentFileId = context.filePath;
  const symbol = context.symbols.find((s) => s.name === name && s.filePath === currentFileId);
  if (symbol) {
    return symbol.id;
  }
  if (context.currentScope.length > 0) {
    for (let i = context.currentScope.length - 1; i >= 0; i--) {
      const scopedId = `${currentFileId}::${context.currentScope[i]}.${name}`;
      const scopedSymbol = context.symbols.find((s) => s.id === scopedId);
      if (scopedSymbol) {
        return scopedId;
      }
    }
  }
  return null;
}
function findChildByType5(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      return child;
    }
  }
  return null;
}
function nodeText4(node, context) {
  return context.sourceCode.slice(node.startIndex, node.endIndex);
}
function getCurrentSymbolId5(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope.join(".")}`;
}
var rustParser = {
  language: "rust",
  extensions: [".rs"],
  parseFile: parseRustFile
};

// src/parser/c.ts
import { existsSync as existsSync8 } from "fs";
import { join as join8, dirname as dirname6, relative as relative4 } from "path";
function parseCFile(filePath, sourceCode, projectRoot) {
  const parser = getParser("c");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: []
  };
  walkNode6(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode6(node, context) {
  processNode6(node, context);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode6(child, context);
    }
  }
}
function processNode6(node, context) {
  const type = node.type;
  switch (type) {
    case "function_definition":
      processFunctionDefinition2(node, context);
      break;
    case "struct_specifier":
      processStructSpecifier(node, context);
      break;
    case "enum_specifier":
      processEnumSpecifier(node, context);
      break;
    case "type_definition":
      processTypeDefinition(node, context);
      break;
    case "declaration":
      processDeclaration(node, context);
      break;
    case "preproc_def":
    case "preproc_function_def":
      processMacroDefinition(node, context);
      break;
    case "preproc_include":
      processIncludeDirective(node, context);
      break;
    case "call_expression":
      processCallExpression6(node, context);
      break;
  }
}
function processFunctionDefinition2(node, context) {
  const declarator = node.childForFieldName("declarator");
  if (!declarator) return;
  const nameNode = extractFunctionName(declarator);
  if (!nameNode) return;
  const name = nodeText5(nameNode, context);
  const exported = !hasStorageClass(node, "static", context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
  context.currentScope.push(name);
  const body = node.childForFieldName("body");
  if (body) {
    walkNode6(body, context);
  }
  context.currentScope.pop();
}
function processStructSpecifier(node, context) {
  const parent = node.parent;
  let name = null;
  if (parent && parent.type === "type_definition") {
    const typedefName = parent.childForFieldName("declarator");
    if (typedefName) {
      name = extractIdentifierFromDeclarator(typedefName, context);
    }
  }
  if (!name) {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      name = nodeText5(nameNode, context);
    }
  }
  if (!name) return;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processEnumSpecifier(node, context) {
  const parent = node.parent;
  let name = null;
  if (parent && parent.type === "type_definition") {
    const typedefName = parent.childForFieldName("declarator");
    if (typedefName) {
      name = extractIdentifierFromDeclarator(typedefName, context);
    }
  }
  if (!name) {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      name = nodeText5(nameNode, context);
    }
  }
  if (!name) return;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "enum",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processTypeDefinition(node, context) {
  const typeNode = node.childForFieldName("type");
  if (!typeNode) return;
  if (typeNode.type === "struct_specifier" || typeNode.type === "enum_specifier") {
    return;
  }
  const declarator = node.childForFieldName("declarator");
  if (!declarator) return;
  const name = extractIdentifierFromDeclarator(declarator, context);
  if (!name) return;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "type_alias",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processDeclaration(node, context) {
  if (context.currentScope.length > 0) {
    return;
  }
  const parent = node.parent;
  if (!parent || parent.type !== "translation_unit") {
    return;
  }
  const hasStatic = hasStorageClass(node, "static", context);
  const declarator = node.childForFieldName("declarator");
  if (!declarator) return;
  const name = extractIdentifierFromDeclarator(declarator, context);
  if (!name) return;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "variable",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: !hasStatic
  });
}
function processMacroDefinition(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText5(nameNode, context);
  const kind = node.type === "preproc_function_def" ? "function" : "constant";
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processIncludeDirective(node, context) {
  const pathNode = node.childForFieldName("path");
  if (!pathNode) return;
  const pathText = nodeText5(pathNode, context);
  const isLocalInclude = pathText.startsWith('"') && pathText.endsWith('"');
  if (!isLocalInclude) {
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
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processCallExpression6(node, context) {
  if (context.currentScope.length === 0) return;
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return;
  const calleeName = nodeText5(functionNode, context);
  const builtins = /* @__PURE__ */ new Set(["printf", "scanf", "malloc", "free", "memcpy", "strlen", "strcmp", "strcpy", "strcat"]);
  if (builtins.has(calleeName)) return;
  const callerId = getCurrentSymbolId6(context);
  if (!callerId) return;
  const calleeId = resolveSymbol5(calleeName, context);
  if (!calleeId) return;
  context.edges.push({
    source: callerId,
    target: calleeId,
    kind: "calls",
    filePath: context.filePath,
    line: node.startPosition.row + 1
  });
}
function resolveIncludePath(includePath, currentFile, projectRoot) {
  const currentFileAbs = join8(projectRoot, currentFile);
  const currentDir = dirname6(currentFileAbs);
  const possibleFiles = [
    join8(currentDir, includePath),
    join8(projectRoot, includePath)
  ];
  const resolvedFiles = [];
  for (const absPath of possibleFiles) {
    if (existsSync8(absPath)) {
      const relPath = relative4(projectRoot, absPath);
      resolvedFiles.push(relPath);
    }
  }
  return resolvedFiles;
}
function hasStorageClass(node, className, context) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "storage_class_specifier") {
      const text = nodeText5(child, context);
      if (text === className) {
        return true;
      }
    }
  }
  let parent = node.parent;
  while (parent) {
    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      if (child && child.type === "storage_class_specifier") {
        const text = nodeText5(child, context);
        if (text === className) {
          return true;
        }
      }
    }
    parent = parent.parent;
  }
  return false;
}
function extractFunctionName(declarator) {
  if (declarator.type === "identifier") {
    return declarator;
  }
  if (declarator.type === "function_declarator") {
    const innerDeclarator = declarator.childForFieldName("declarator");
    if (innerDeclarator) {
      return extractFunctionName(innerDeclarator);
    }
  }
  if (declarator.type === "pointer_declarator") {
    const innerDeclarator = declarator.childForFieldName("declarator");
    if (innerDeclarator) {
      return extractFunctionName(innerDeclarator);
    }
  }
  for (let i = 0; i < declarator.childCount; i++) {
    const child = declarator.child(i);
    if (child && child.type === "identifier") {
      return child;
    }
  }
  return null;
}
function extractIdentifierFromDeclarator(declarator, context) {
  if (declarator.type === "identifier") {
    return nodeText5(declarator, context);
  }
  if (declarator.type === "type_identifier") {
    return nodeText5(declarator, context);
  }
  const identifierNode = findChildByType6(declarator, "identifier");
  if (identifierNode) {
    return nodeText5(identifierNode, context);
  }
  const typeIdNode = findChildByType6(declarator, "type_identifier");
  if (typeIdNode) {
    return nodeText5(typeIdNode, context);
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
function resolveSymbol5(name, context) {
  const currentFileId = `${context.filePath}::__file__`;
  const symbol = context.symbols.find(
    (s) => s.name === name && (s.filePath === context.filePath || s.exported)
  );
  if (symbol) {
    return symbol.id;
  }
  for (let i = context.currentScope.length - 1; i >= 0; i--) {
    const scopedId = `${context.filePath}::${context.currentScope.slice(0, i + 1).join("::")}::${name}`;
    const scopedSymbol = context.symbols.find((s) => s.id === scopedId);
    if (scopedSymbol) {
      return scopedSymbol.id;
    }
  }
  return null;
}
function findChildByType6(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      return child;
    }
  }
  return null;
}
function nodeText5(node, context) {
  return context.sourceCode.slice(node.startIndex, node.endIndex);
}
function getCurrentSymbolId6(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope.join("::")}`;
}
var cParser = {
  name: "c",
  extensions: [".c"],
  parseFile: parseCFile
};

// src/parser/csharp.ts
import { dirname as dirname7, join as join9, resolve as resolve3, basename } from "path";
import { existsSync as existsSync9, readdirSync as readdirSync5, statSync as statSync3 } from "fs";
function parseCSharpFile(filePath, sourceCode, projectRoot) {
  if (filePath.endsWith(".csproj")) {
    return parseCsprojFile(filePath, sourceCode, projectRoot);
  }
  const parser = getParser("c_sharp");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentNamespace: null,
    imports: /* @__PURE__ */ new Map(),
    isCsproj: false
  };
  walkNode7(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode7(node, context) {
  const handledChildren = processNode7(node, context);
  if (handledChildren) return;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode7(child, context);
    }
  }
}
function processNode7(node, context) {
  switch (node.type) {
    case "namespace_declaration":
      processNamespaceDeclaration(node, context);
      return true;
    case "file_scoped_namespace_declaration":
      processFileScopedNamespace(node, context);
      return false;
    case "class_declaration":
      processClassDeclaration3(node, context);
      return true;
    case "interface_declaration":
      processInterfaceDeclaration2(node, context);
      return true;
    case "struct_declaration":
      processStructDeclaration(node, context);
      return true;
    case "enum_declaration":
      processEnumDeclaration2(node, context);
      return false;
    case "record_declaration":
      processRecordDeclaration(node, context);
      return true;
    case "delegate_declaration":
      processDelegateDeclaration(node, context);
      return false;
    case "method_declaration":
      processMethodDeclaration2(node, context);
      return true;
    case "constructor_declaration":
      processConstructorDeclaration(node, context);
      return true;
    case "property_declaration":
      processPropertyDeclaration(node, context);
      return false;
    case "event_field_declaration":
      processEventFieldDeclaration(node, context);
      return false;
    case "indexer_declaration":
      processIndexerDeclaration(node, context);
      return false;
    case "using_directive":
      processUsingDirective(node, context);
      return false;
    case "global_statement":
      processGlobalStatement(node, context);
      return false;
    case "invocation_expression":
      processCallExpression7(node, context);
      return false;
    default:
      return false;
  }
}
function processNamespaceDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText6(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "module",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
  const oldNamespace = context.currentNamespace;
  context.currentNamespace = name;
  context.currentScope.push(name);
  const body = findChildByType7(node, "declaration_list");
  if (body) {
    walkNode7(body, context);
  }
  context.currentScope.pop();
  context.currentNamespace = oldNamespace;
}
function processFileScopedNamespace(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText6(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "module",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
  context.currentNamespace = name;
}
function processClassDeclaration3(node, context) {
  processTypeDeclaration2(node, context, "class");
}
function processInterfaceDeclaration2(node, context) {
  processTypeDeclaration2(node, context, "interface");
}
function processStructDeclaration(node, context) {
  processTypeDeclaration2(node, context, "class");
}
function processRecordDeclaration(node, context) {
  processTypeDeclaration2(node, context, "class");
}
function processTypeDeclaration2(node, context, kind) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  let name = nodeText6(nameNode, context);
  const angleBracketIdx = name.indexOf("<");
  if (angleBracketIdx > 0) {
    name = name.substring(0, angleBracketIdx);
  }
  const exported = hasModifier(node, context, "public") || hasModifier(node, context, "internal");
  const scope = context.currentClass || void 0;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const baseList = findChildByType7(node, "base_list");
  if (baseList) {
    for (let i = 0; i < baseList.childCount; i++) {
      const child = baseList.child(i);
      if (!child) continue;
      if (child.type === "simple_base_type" || child.type === "identifier" || child.type === "generic_name" || child.type === "qualified_name") {
        let baseName = extractBaseTypeName2(child, context);
        if (baseName) {
          const baseId = resolveSymbol6(baseName, context);
          if (baseId) {
            const edgeKind = baseName.startsWith("I") && baseName.length > 1 && baseName[1] === baseName[1].toUpperCase() ? "implements" : "inherits";
            context.edges.push({
              source: symbolId,
              target: baseId,
              kind: edgeKind,
              filePath: context.filePath,
              line: child.startPosition.row + 1
            });
          }
        }
      }
    }
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType7(node, "declaration_list");
  if (body) {
    walkNode7(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processEnumDeclaration2(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText6(nameNode, context);
  const exported = hasModifier(node, context, "public") || hasModifier(node, context, "internal");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "enum",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
  const body = findChildByType7(node, "enum_member_declaration_list");
  if (body) {
    const members = findChildrenByType2(body, "enum_member_declaration");
    for (const member of members) {
      const memberNameNode = member.childForFieldName("name");
      if (!memberNameNode) continue;
      const memberName = nodeText6(memberNameNode, context);
      const memberId = `${context.filePath}::${name}.${memberName}`;
      context.symbols.push({
        id: memberId,
        name: memberName,
        kind: "constant",
        filePath: context.filePath,
        startLine: member.startPosition.row + 1,
        endLine: member.endPosition.row + 1,
        exported,
        scope: name
      });
    }
  }
}
function processDelegateDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  let name = nodeText6(nameNode, context);
  const angleBracketIdx = name.indexOf("<");
  if (angleBracketIdx > 0) name = name.substring(0, angleBracketIdx);
  const exported = hasModifier(node, context, "public") || hasModifier(node, context, "internal");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "type_alias",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
}
function processMethodDeclaration2(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText6(nameNode, context);
  const exported = hasModifier(node, context, "public");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? "method" : "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const parameterList = node.childForFieldName("parameters");
  if (parameterList) {
    walkNode7(parameterList, context);
  }
  const body = node.childForFieldName("body");
  if (body) {
    walkNode7(body, context);
  }
  context.currentScope.pop();
}
function processConstructorDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText6(nameNode, context);
  const exported = hasModifier(node, context, "public");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const parameterList = node.childForFieldName("parameters");
  if (parameterList) {
    walkNode7(parameterList, context);
  }
  const body = node.childForFieldName("body");
  if (body) {
    walkNode7(body, context);
  }
  context.currentScope.pop();
}
function processPropertyDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText6(nameNode, context);
  const exported = hasModifier(node, context, "public");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "property",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
}
function processEventFieldDeclaration(node, context) {
  const varDecl = findChildByType7(node, "variable_declaration");
  if (!varDecl) return;
  const declarator = findChildByType7(varDecl, "variable_declarator");
  if (!declarator) return;
  const nameNode = declarator.childForFieldName("name") || findChildByType7(declarator, "identifier");
  if (!nameNode) return;
  const name = nodeText6(nameNode, context);
  const exported = hasModifier(node, context, "public");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "property",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
}
function processIndexerDeclaration(node, context) {
  const exported = hasModifier(node, context, "public");
  const scope = context.currentClass || void 0;
  const name = "this[]";
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "property",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
}
function processUsingDirective(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText6(nameNode, context);
  const resolvedPath = resolveCSharpNamespace(name, context.filePath, context.projectRoot);
  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    const targetId = `${resolvedPath}::__file__`;
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processGlobalStatement(node, context) {
  const symbolId = `${context.filePath}::__toplevel__`;
  if (context.symbols.find((s) => s.id === symbolId)) return;
  context.symbols.push({
    id: symbolId,
    name: "__toplevel__",
    kind: "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processCallExpression7(node, context) {
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return;
  let calleeName = null;
  if (functionNode.type === "identifier") {
    calleeName = nodeText6(functionNode, context);
  } else if (functionNode.type === "member_access_expression") {
    const nameNode = functionNode.childForFieldName("name");
    if (nameNode) {
      calleeName = nodeText6(nameNode, context);
    }
  }
  if (!calleeName) return;
  const builtins = ["ToString", "Equals", "GetHashCode", "GetType", "Console", "Write", "WriteLine", "Format", "Parse", "TryParse"];
  if (builtins.includes(calleeName)) return;
  const callerId = getCurrentSymbolId7(context);
  if (!callerId) return;
  const calleeId = resolveSymbol6(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function parseCsprojFile(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  const projectName = basename(filePath, ".csproj");
  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const projectRefMatch = line.match(/<ProjectReference\s+Include\s*=\s*"([^"]+)"/);
    if (projectRefMatch) {
      const refPath = projectRefMatch[1];
      const csprojDir = dirname7(join9(projectRoot, filePath));
      const resolvedRef = resolve3(csprojDir, refPath);
      const relativeRef = resolvedRef.startsWith(projectRoot + "/") ? resolvedRef.substring(projectRoot.length + 1) : null;
      if (relativeRef && existsSync9(resolvedRef)) {
        edges.push({
          source: `${filePath}::__file__`,
          target: `${relativeRef}::__file__`,
          kind: "imports",
          filePath,
          line: lineNum
        });
      }
    }
    const packageRefMatch = line.match(/<PackageReference\s+Include\s*=\s*"([^"]+)"/);
    if (packageRefMatch) {
      const packageName = packageRefMatch[1];
      const versionMatch = line.match(/Version\s*=\s*"([^"]+)"/);
      const version = versionMatch ? versionMatch[1] : "unknown";
      symbols.push({
        id: `${filePath}::pkg:${packageName}`,
        name: `${packageName}@${version}`,
        kind: "import",
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false
      });
    }
  }
  return { filePath, symbols, edges };
}
function resolveCSharpNamespace(namespace, currentFile, projectRoot) {
  const namespacePath = namespace.replace(/\./g, "/");
  const candidates = [
    join9(projectRoot, namespacePath),
    join9(projectRoot, "src", namespacePath)
  ];
  for (const candidate of candidates) {
    if (existsSync9(candidate)) {
      try {
        const stats = statSync3(candidate);
        if (stats.isDirectory()) {
          const csFiles = readdirSync5(candidate).filter((f) => f.endsWith(".cs"));
          if (csFiles.length > 0) {
            const fullPath = join9(candidate, csFiles[0]);
            return fullPath.substring(projectRoot.length + 1);
          }
        }
      } catch {
      }
    }
  }
  return null;
}
function resolveSymbol6(name, context) {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find((s) => s.id === currentFileId)) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find((s) => s.id === classMethodId)) {
      return classMethodId;
    }
  }
  return null;
}
function hasModifier(node, context, modifier) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "modifier" && nodeText6(child, context) === modifier) {
      return true;
    }
  }
  if (modifier === "internal") {
    const hasExplicitAccess = ["public", "private", "protected", "internal"].some((m) => {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === "modifier" && nodeText6(child, context) === m) return true;
      }
      return false;
    });
    return !hasExplicitAccess;
  }
  return false;
}
function extractBaseTypeName2(node, context) {
  const text = nodeText6(node, context).trim();
  if (!text || text === ":" || text === ",") return null;
  const angleBracketIdx = text.indexOf("<");
  const name = angleBracketIdx > 0 ? text.substring(0, angleBracketIdx) : text;
  const dotIdx = name.lastIndexOf(".");
  return dotIdx >= 0 ? name.substring(dotIdx + 1) : name;
}
function findChildByType7(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}
function findChildrenByType2(node, type) {
  const results = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) results.push(child);
  }
  return results;
}
function nodeText6(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId7(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
var csharpParser = {
  name: "csharp",
  extensions: [".cs", ".csx", ".csproj"],
  parseFile: parseCSharpFile
};

// src/parser/java.ts
import { dirname as dirname8, join as join10, resolve as resolve4, basename as basename2 } from "path";
import { existsSync as existsSync10, readdirSync as readdirSync6, statSync as statSync4 } from "fs";
var moduleSourceRoots = [];
var verifiedRootSet = /* @__PURE__ */ new Set();
function setModuleSourceRoots(roots, verified) {
  moduleSourceRoots = roots;
  verifiedRootSet = verified;
}
function resetModuleSourceRoots() {
  moduleSourceRoots = [];
  verifiedRootSet = /* @__PURE__ */ new Set();
}
function parseJavaFile(filePath, sourceCode, projectRoot) {
  if (filePath.endsWith("pom.xml")) {
    return parsePomXml(filePath, sourceCode, projectRoot);
  }
  if (filePath.endsWith("build.gradle") || filePath.endsWith("build.gradle.kts")) {
    return parseGradleBuild(filePath, sourceCode, projectRoot);
  }
  const parser = getParser("java");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentPackage: null,
    imports: /* @__PURE__ */ new Map(),
    isBuildFile: false
  };
  walkNode8(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode8(node, context) {
  const handledChildren = processNode8(node, context);
  if (handledChildren) return;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode8(child, context);
    }
  }
}
function processNode8(node, context) {
  switch (node.type) {
    case "package_declaration":
      processPackageDeclaration(node, context);
      return false;
    case "import_declaration":
      processImportDeclaration2(node, context);
      return false;
    case "class_declaration":
      processClassDeclaration4(node, context);
      return true;
    case "interface_declaration":
      processInterfaceDeclaration3(node, context);
      return true;
    case "enum_declaration":
      processEnumDeclaration3(node, context);
      return true;
    case "annotation_type_declaration":
      processAnnotationTypeDeclaration(node, context);
      return true;
    case "record_declaration":
      processRecordDeclaration2(node, context);
      return true;
    case "method_declaration":
      processMethodDeclaration3(node, context);
      return true;
    case "constructor_declaration":
      processConstructorDeclaration2(node, context);
      return true;
    case "field_declaration":
      processFieldDeclaration(node, context);
      return false;
    case "constant_declaration":
      processConstantDeclaration(node, context);
      return false;
    case "annotation_type_element_declaration":
      processAnnotationElement(node, context);
      return false;
    case "method_invocation":
      processCallExpression8(node, context);
      return false;
    case "object_creation_expression":
      return processObjectCreation(node, context);
    case "lambda_expression":
      processLambdaExpression(node, context);
      return false;
    default:
      return false;
  }
}
function processPackageDeclaration(node, context) {
  const scopedIdent = findDescendantByTypes(node, ["scoped_identifier", "identifier"]);
  if (!scopedIdent) return;
  const name = nodeText7(scopedIdent, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "module",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
  context.currentPackage = name;
}
function processImportDeclaration2(node, context) {
  const text = nodeText7(node, context).trim();
  const isStatic = text.includes("import static");
  const isWildcard = text.includes(".*");
  const scopedIdent = findDescendantByTypes(node, ["scoped_identifier", "identifier"]);
  if (!scopedIdent) return;
  let importPath = nodeText7(scopedIdent, context);
  const asterisk = findChildByType8(node, "asterisk");
  if (asterisk) {
    importPath = importPath + ".*";
  }
  const resolvedPath = resolveJavaImport(importPath, context.filePath, context.projectRoot);
  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    const targetId = `${resolvedPath}::__file__`;
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
    const parts = importPath.split(".");
    if (!isWildcard) {
      const simpleName = parts[parts.length - 1];
      context.imports.set(simpleName, `${resolvedPath}::${simpleName}`);
    }
  }
  const symbolId = `${context.filePath}::import:${importPath}`;
  context.symbols.push({
    id: symbolId,
    name: importPath,
    kind: "import",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: false
  });
}
function processClassDeclaration4(node, context) {
  processTypeDeclaration3(node, context, "class");
}
function processInterfaceDeclaration3(node, context) {
  processTypeDeclaration3(node, context, "interface");
}
function processRecordDeclaration2(node, context) {
  processTypeDeclaration3(node, context, "class");
}
function processAnnotationTypeDeclaration(node, context) {
  processTypeDeclaration3(node, context, "interface");
}
function processTypeDeclaration3(node, context, kind) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  let name = nodeText7(nameNode, context);
  const angleBracketIdx = name.indexOf("<");
  if (angleBracketIdx > 0) {
    name = name.substring(0, angleBracketIdx);
  }
  const exported = hasModifier2(node, context, "public");
  const scope = context.currentClass || void 0;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const superclass = node.childForFieldName("superclass");
  if (superclass) {
    let baseName = extractTypeName3(superclass, context);
    if (baseName) {
      const baseId = resolveSymbol7(baseName, context);
      if (baseId) {
        context.edges.push({
          source: symbolId,
          target: baseId,
          kind: "inherits",
          filePath: context.filePath,
          line: superclass.startPosition.row + 1
        });
      }
    }
  }
  const interfaces = node.childForFieldName("interfaces");
  if (interfaces) {
    processInterfaceList(interfaces, symbolId, context);
  }
  const extendsInterfaces = node.childForFieldName("extends_interfaces") || findChildByType8(node, "extends_interfaces");
  if (extendsInterfaces) {
    processInterfaceList(extendsInterfaces, symbolId, context);
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = node.childForFieldName("body") || findChildByType8(node, "class_body") || findChildByType8(node, "interface_body") || findChildByType8(node, "enum_body") || findChildByType8(node, "annotation_type_body") || findChildByType8(node, "record_declaration_body");
  if (body) {
    walkNode8(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processInterfaceList(node, sourceId, context) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "type_identifier" || child.type === "generic_type" || child.type === "scoped_type_identifier") {
      const baseName = extractTypeName3(child, context);
      if (baseName) {
        const baseId = resolveSymbol7(baseName, context);
        if (baseId) {
          context.edges.push({
            source: sourceId,
            target: baseId,
            kind: "implements",
            filePath: context.filePath,
            line: child.startPosition.row + 1
          });
        }
      }
    }
  }
}
function processEnumDeclaration3(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText7(nameNode, context);
  const exported = hasModifier2(node, context, "public");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "enum",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
  const body = node.childForFieldName("body") || findChildByType8(node, "enum_body");
  if (body) {
    const constants = findChildrenByType3(body, "enum_constant");
    for (const constant of constants) {
      const constNameNode = constant.childForFieldName("name");
      if (!constNameNode) continue;
      const constName = nodeText7(constNameNode, context);
      const constId = `${context.filePath}::${name}.${constName}`;
      context.symbols.push({
        id: constId,
        name: constName,
        kind: "constant",
        filePath: context.filePath,
        startLine: constant.startPosition.row + 1,
        endLine: constant.endPosition.row + 1,
        exported,
        scope: name
      });
    }
    const oldClass = context.currentClass;
    context.currentClass = name;
    context.currentScope.push(name);
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child && child.type !== "enum_constant") {
        walkNode8(child, context);
      }
    }
    context.currentScope.pop();
    context.currentClass = oldClass;
  }
}
function processMethodDeclaration3(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText7(nameNode, context);
  const exported = hasModifier2(node, context, "public");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? "method" : "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const body = node.childForFieldName("body");
  if (body) {
    walkNode8(body, context);
  }
  context.currentScope.pop();
}
function processConstructorDeclaration2(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText7(nameNode, context);
  const exported = hasModifier2(node, context, "public");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const body = node.childForFieldName("body");
  if (body) {
    walkNode8(body, context);
  }
  context.currentScope.pop();
}
function processFieldDeclaration(node, context) {
  const declarator = findDescendantByTypes(node, ["variable_declarator"]);
  if (!declarator) return;
  const nameNode = declarator.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText7(nameNode, context);
  const exported = hasModifier2(node, context, "public");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  const isConstant = hasModifier2(node, context, "static") && hasModifier2(node, context, "final");
  context.symbols.push({
    id: symbolId,
    name,
    kind: isConstant ? "constant" : "property",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
}
function processConstantDeclaration(node, context) {
  const declarator = findDescendantByTypes(node, ["variable_declarator"]);
  if (!declarator) return;
  const nameNode = declarator.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText7(nameNode, context);
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "constant",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    // Interface constants are always public
    scope
  });
}
function processAnnotationElement(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText7(nameNode, context);
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope
  });
}
function processCallExpression8(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const calleeName = nodeText7(nameNode, context);
  const builtins = [
    "toString",
    "equals",
    "hashCode",
    "getClass",
    "println",
    "printf",
    "format",
    "parseInt",
    "valueOf",
    "length",
    "size",
    "get",
    "set",
    "add",
    "remove",
    "contains",
    "isEmpty",
    "stream",
    "collect",
    "map",
    "filter",
    "forEach",
    "of",
    "orElse",
    "orElseThrow",
    "isPresent",
    "ifPresent",
    "close",
    "flush",
    "write",
    "read"
  ];
  if (builtins.includes(calleeName)) return;
  const callerId = getCurrentSymbolId8(context);
  if (!callerId) return;
  const calleeId = resolveSymbol7(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processObjectCreation(node, context) {
  const typeNode = node.childForFieldName("type");
  if (!typeNode) return false;
  const typeName = extractTypeName3(typeNode, context);
  if (!typeName) return false;
  const callerId = getCurrentSymbolId8(context);
  if (!callerId) return false;
  const targetId = resolveSymbol7(typeName, context);
  if (targetId) {
    context.edges.push({
      source: callerId,
      target: targetId,
      kind: "references",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
  const classBody = findChildByType8(node, "class_body");
  if (classBody) {
    const anonName = `<anonymous:${typeName}>`;
    const anonId = `${context.filePath}::${anonName}:${node.startPosition.row + 1}`;
    context.symbols.push({
      id: anonId,
      name: anonName,
      kind: "class",
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false,
      scope: context.currentClass || void 0
    });
    const argumentList = findChildByType8(node, "argument_list");
    if (argumentList) {
      walkNode8(argumentList, context);
    }
    const oldClass = context.currentClass;
    context.currentClass = anonName;
    context.currentScope.push(anonName);
    walkNode8(classBody, context);
    context.currentScope.pop();
    context.currentClass = oldClass;
    return true;
  }
  return false;
}
function processLambdaExpression(node, context) {
  const parent = node.parent;
  if (!parent) return;
  if (parent.type === "variable_declarator") {
    const nameNode = parent.childForFieldName("name");
    if (nameNode) {
      const name = nodeText7(nameNode, context);
      const scope = context.currentClass || void 0;
      const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "function",
        filePath: context.filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        exported: false,
        scope
      });
    }
  }
}
function parsePomXml(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  const projectName = basename2(dirname8(join10(projectRoot, filePath)));
  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  let inDependency = false;
  let groupId = "";
  let artifactId = "";
  let version = "";
  let depStartLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    if (/<dependency>/.test(line)) {
      inDependency = true;
      groupId = "";
      artifactId = "";
      version = "";
      depStartLine = lineNum;
    }
    if (inDependency) {
      const gMatch = line.match(/<groupId>([^<]+)<\/groupId>/);
      if (gMatch) groupId = gMatch[1];
      const aMatch = line.match(/<artifactId>([^<]+)<\/artifactId>/);
      if (aMatch) artifactId = aMatch[1];
      const vMatch = line.match(/<version>([^<]+)<\/version>/);
      if (vMatch) version = vMatch[1];
    }
    if (/<\/dependency>/.test(line) && inDependency) {
      inDependency = false;
      if (groupId && artifactId) {
        const depName = `${groupId}:${artifactId}`;
        const displayVersion = version || "managed";
        symbols.push({
          id: `${filePath}::dep:${depName}`,
          name: `${depName}@${displayVersion}`,
          kind: "import",
          filePath,
          startLine: depStartLine,
          endLine: lineNum,
          exported: false
        });
      }
    }
    const moduleMatch = line.match(/<module>([^<]+)<\/module>/);
    if (moduleMatch) {
      const modulePath = moduleMatch[1];
      const pomDir = dirname8(join10(projectRoot, filePath));
      const resolvedModule = resolve4(pomDir, modulePath);
      const relativeModule = resolvedModule.startsWith(projectRoot + "/") ? resolvedModule.substring(projectRoot.length + 1) : null;
      if (relativeModule) {
        const modulePom = join10(relativeModule, "pom.xml");
        if (existsSync10(join10(projectRoot, modulePom))) {
          edges.push({
            source: `${filePath}::__file__`,
            target: `${modulePom}::__file__`,
            kind: "imports",
            filePath,
            line: lineNum
          });
        }
      }
    }
  }
  return { filePath, symbols, edges };
}
function parseGradleBuild(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  const projectName = basename2(dirname8(join10(projectRoot, filePath)));
  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    const depMatch = line.match(
      /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|annotationProcessor)\s*[\(]?\s*['"]([^'"]+)['"]\s*[\)]?/
    );
    if (depMatch) {
      const depCoord = depMatch[1];
      if (!depCoord.startsWith(":")) {
        symbols.push({
          id: `${filePath}::dep:${depCoord}`,
          name: depCoord,
          kind: "import",
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          exported: false
        });
      }
    }
    const projectMatch = line.match(/project\s*\(\s*['":]+([^'")\s]+)['"]*\s*\)/);
    if (projectMatch) {
      const moduleName = projectMatch[1].replace(/^:/, "");
      const candidates = [
        join10(moduleName, "build.gradle"),
        join10(moduleName, "build.gradle.kts")
      ];
      for (const candidate of candidates) {
        if (existsSync10(join10(projectRoot, candidate))) {
          edges.push({
            source: `${filePath}::__file__`,
            target: `${candidate}::__file__`,
            kind: "imports",
            filePath,
            line: lineNum
          });
          break;
        }
      }
    }
  }
  return { filePath, symbols, edges };
}
function resolveJavaImport(importPath, currentFile, projectRoot) {
  const cleanPath2 = importPath.replace(/\.\*$/, "");
  const javaPath = cleanPath2.replace(/\./g, "/") + ".java";
  const hardcodedRoots = [
    "",
    "src/main/java",
    "src/test/java",
    "src",
    "app/src/main/java"
  ];
  const sourceRoots = [...moduleSourceRoots, ...hardcodedRoots];
  for (const root of sourceRoots) {
    const candidate = root ? join10(root, javaPath) : javaPath;
    const fullPath = join10(projectRoot, candidate);
    const rootAbsolute = root ? join10(projectRoot, root) : projectRoot;
    const isVerifiedRoot = verifiedRootSet.has(rootAbsolute);
    if (isVerifiedRoot || !root || hardcodedRoots.includes(root)) {
      if (existsSync10(fullPath)) {
        return candidate;
      }
    }
  }
  if (importPath.endsWith(".*")) {
    const packagePath = cleanPath2.replace(/\./g, "/");
    for (const root of sourceRoots) {
      const candidate = root ? join10(root, packagePath) : packagePath;
      const fullPath = join10(projectRoot, candidate);
      if (existsSync10(fullPath)) {
        try {
          const stats = statSync4(fullPath);
          if (stats.isDirectory()) {
            const javaFiles = readdirSync6(fullPath).filter((f) => f.endsWith(".java"));
            if (javaFiles.length > 0) {
              return join10(candidate, javaFiles[0]);
            }
          }
        } catch {
        }
      }
    }
  }
  return null;
}
function resolveSymbol7(name, context) {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find((s) => s.id === currentFileId)) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find((s) => s.id === classMethodId)) {
      return classMethodId;
    }
  }
  return null;
}
function hasModifier2(node, context, modifier) {
  const modifiers = node.childForFieldName("modifiers") || findChildByType8(node, "modifiers");
  if (modifiers) {
    for (let i = 0; i < modifiers.childCount; i++) {
      const child = modifiers.child(i);
      if (child && nodeText7(child, context) === modifier) {
        return true;
      }
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === modifier) {
      return true;
    }
  }
  return false;
}
function extractTypeName3(node, context) {
  const text = nodeText7(node, context).trim();
  if (!text) return null;
  const angleBracketIdx = text.indexOf("<");
  const name = angleBracketIdx > 0 ? text.substring(0, angleBracketIdx) : text;
  const dotIdx = name.lastIndexOf(".");
  return dotIdx >= 0 ? name.substring(dotIdx + 1) : name;
}
function findChildByType8(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}
function findChildrenByType3(node, type) {
  const results = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) results.push(child);
  }
  return results;
}
function findDescendantByTypes(node, types) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (types.includes(child.type)) return child;
    const found = findDescendantByTypes(child, types);
    if (found) return found;
  }
  return null;
}
function nodeText7(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId8(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
var javaParser = {
  name: "java",
  extensions: [".java", "pom.xml", "build.gradle", "build.gradle.kts"],
  parseFile: parseJavaFile
};

// src/parser/cpp.ts
import { dirname as dirname9, join as join11, relative as relative5, basename as basename3 } from "path";
import { existsSync as existsSync11 } from "fs";
function parseCppFile(filePath, sourceCode, projectRoot) {
  if (basename3(filePath) === "CMakeLists.txt") {
    return parseCMakeLists(filePath, sourceCode, projectRoot);
  }
  if (basename3(filePath) === "conanfile.txt") {
    return parseConanfileTxt(filePath, sourceCode, projectRoot);
  }
  if (basename3(filePath) === "vcpkg.json") {
    return parseVcpkgJson(filePath, sourceCode, projectRoot);
  }
  const parser = getParser("cpp");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentNamespace: null,
    imports: /* @__PURE__ */ new Map(),
    isBuildFile: false
  };
  walkNode9(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode9(node, context) {
  const handledChildren = processNode9(node, context);
  if (handledChildren) return;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode9(child, context);
    }
  }
}
function processNode9(node, context) {
  switch (node.type) {
    case "namespace_definition":
      processNamespaceDefinition(node, context);
      return true;
    case "class_specifier":
      processClassSpecifier(node, context);
      return true;
    case "struct_specifier":
      processStructSpecifier2(node, context);
      return true;
    case "union_specifier":
      processUnionSpecifier(node, context);
      return true;
    case "enum_specifier":
      processEnumSpecifier2(node, context);
      return false;
    case "function_definition":
      processFunctionDefinition3(node, context);
      return true;
    case "declaration":
      processDeclaration2(node, context);
      return false;
    case "alias_declaration":
      processAliasDeclaration(node, context);
      return false;
    case "type_definition":
      processTypeDefinition2(node, context);
      return false;
    case "preproc_include":
      processIncludeDirective2(node, context);
      return false;
    case "preproc_def":
    case "preproc_function_def":
      processMacroDefinition2(node, context);
      return false;
    case "template_declaration":
      processTemplateDeclaration(node, context);
      return false;
    case "call_expression":
      processCallExpression9(node, context);
      return false;
    case "static_assert_declaration":
      processStaticAssert(node, context);
      return false;
    default:
      return false;
  }
}
function processNamespaceDefinition(node, context) {
  const nameNode = node.childForFieldName("name");
  const name = nameNode ? nodeText8(nameNode, context) : "<anonymous>";
  if (name !== "<anonymous>") {
    const symbolId = `${context.filePath}::${name}`;
    context.symbols.push({
      id: symbolId,
      name,
      kind: "module",
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: true
    });
  }
  const oldNamespace = context.currentNamespace;
  context.currentNamespace = name !== "<anonymous>" ? name : oldNamespace;
  if (name !== "<anonymous>") context.currentScope.push(name);
  const body = node.childForFieldName("body") || findChildByType9(node, "declaration_list");
  if (body) {
    walkNode9(body, context);
  }
  if (name !== "<anonymous>") context.currentScope.pop();
  context.currentNamespace = oldNamespace;
}
function processClassSpecifier(node, context) {
  processTypeSpecifier(node, context, "class");
}
function processStructSpecifier2(node, context) {
  processTypeSpecifier(node, context, "class");
}
function processUnionSpecifier(node, context) {
  processTypeSpecifier(node, context, "class");
}
function processTypeSpecifier(node, context, kind) {
  let nameNode = node.childForFieldName("name");
  let name = null;
  if (nameNode) {
    name = nodeText8(nameNode, context);
    const angleBracketIdx = name.indexOf("<");
    if (angleBracketIdx > 0) {
      name = name.substring(0, angleBracketIdx);
    }
  }
  if (!name) {
    const parent = node.parent;
    if (parent && parent.type === "type_definition") {
      const typedefDecl = parent.childForFieldName("declarator");
      if (typedefDecl) {
        name = extractIdentifierFromDeclarator2(typedefDecl, context);
      }
    }
  }
  if (!name) return;
  const exported = true;
  const scope = context.currentClass || void 0;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const baseClause = findChildByType9(node, "base_class_clause");
  if (baseClause) {
    processBaseClassClause(baseClause, symbolId, context);
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = node.childForFieldName("body") || findChildByType9(node, "field_declaration_list");
  if (body) {
    walkNode9(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processBaseClassClause(node, sourceId, context) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "base_class_specifier" || child.type === "type_identifier" || child.type === "qualified_identifier" || child.type === "template_type") {
      const baseName = extractTypeName4(child, context);
      if (baseName) {
        const baseId = resolveSymbol8(baseName, context);
        if (baseId) {
          context.edges.push({
            source: sourceId,
            target: baseId,
            kind: "inherits",
            filePath: context.filePath,
            line: child.startPosition.row + 1
          });
        }
      }
    }
  }
}
function processEnumSpecifier2(node, context) {
  let nameNode = node.childForFieldName("name");
  let name = null;
  if (nameNode) {
    name = nodeText8(nameNode, context);
  }
  if (!name) {
    const parent = node.parent;
    if (parent && parent.type === "type_definition") {
      const typedefDecl = parent.childForFieldName("declarator");
      if (typedefDecl) {
        name = extractIdentifierFromDeclarator2(typedefDecl, context);
      }
    }
  }
  if (!name) return;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "enum",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
  const body = node.childForFieldName("body") || findChildByType9(node, "enumerator_list");
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child && child.type === "enumerator") {
        const constNameNode = child.childForFieldName("name");
        if (!constNameNode) continue;
        const constName = nodeText8(constNameNode, context);
        const constId = `${context.filePath}::${name}.${constName}`;
        context.symbols.push({
          id: constId,
          name: constName,
          kind: "constant",
          filePath: context.filePath,
          startLine: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
          exported: true,
          scope: name
        });
      }
    }
  }
}
function processFunctionDefinition3(node, context) {
  const declarator = node.childForFieldName("declarator");
  if (!declarator) return;
  const nameNode = extractFunctionName2(declarator);
  if (!nameNode) return;
  let name = nodeText8(nameNode, context);
  if (name === "operator") {
    const fullText = nodeText8(declarator, context);
    const opMatch = fullText.match(/operator\s*([^\s(]+)/);
    if (opMatch) {
      name = `operator${opMatch[1]}`;
    }
  }
  const fullDeclText = nodeText8(declarator, context);
  if (fullDeclText.includes("~")) {
    const tildeMatch = fullDeclText.match(/~\s*(\w+)/);
    if (tildeMatch) {
      name = `~${tildeMatch[1]}`;
    }
  }
  const isConstructor = context.currentClass !== null && name === context.currentClass;
  const isDestructor = name.startsWith("~");
  const isStatic = hasStorageClass2(node, "static", context);
  const exported = !isStatic;
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? "method" : "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const parameterList = findChildByType9(declarator, "parameter_list");
  if (parameterList) {
    walkNode9(parameterList, context);
  }
  const body = node.childForFieldName("body");
  if (body) {
    walkNode9(body, context);
  }
  context.currentScope.pop();
}
function processDeclaration2(node, context) {
  if (context.currentClass) {
    processFieldDeclaration2(node, context);
    return;
  }
  const parent = node.parent;
  if (!parent || parent.type !== "translation_unit" && parent.type !== "declaration_list") {
    return;
  }
  const declarator = node.childForFieldName("declarator");
  if (!declarator) return;
  if (containsType(declarator, "function_declarator")) {
    return;
  }
  const name = extractIdentifierFromDeclarator2(declarator, context);
  if (!name) return;
  const isStatic = hasStorageClass2(node, "static", context);
  const isConst = nodeText8(node, context).includes("const");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: isConst ? "constant" : "variable",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: !isStatic
  });
}
function processFieldDeclaration2(node, context) {
  const declarator = node.childForFieldName("declarator");
  if (!declarator) return;
  if (containsType(declarator, "function_declarator")) {
    const fnName = extractFunctionName2(declarator);
    if (fnName) {
      let name2 = nodeText8(fnName, context);
      const scope2 = context.currentClass || void 0;
      const symbolId2 = scope2 ? `${context.filePath}::${scope2}.${name2}` : `${context.filePath}::${name2}`;
      if (!context.symbols.find((s) => s.id === symbolId2)) {
        const exported = !hasAccessSpecifier(node, "private", context);
        context.symbols.push({
          id: symbolId2,
          name: name2,
          kind: "method",
          filePath: context.filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
          scope: scope2
        });
      }
    }
    return;
  }
  const name = extractIdentifierFromDeclarator2(declarator, context);
  if (!name) return;
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  const isConst = nodeText8(node, context).includes("const");
  const isStatic = nodeText8(node, context).includes("static");
  context.symbols.push({
    id: symbolId,
    name,
    kind: isConst && isStatic ? "constant" : "property",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: !hasAccessSpecifier(node, "private", context),
    scope
  });
}
function processAliasDeclaration(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText8(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "type_alias",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processTypeDefinition2(node, context) {
  const typeNode = node.childForFieldName("type");
  if (!typeNode) return;
  if (typeNode.type === "struct_specifier" || typeNode.type === "enum_specifier" || typeNode.type === "union_specifier") {
    return;
  }
  const declarator = node.childForFieldName("declarator");
  if (!declarator) return;
  const name = extractIdentifierFromDeclarator2(declarator, context);
  if (!name) return;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "type_alias",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processTemplateDeclaration(node, context) {
}
function processStaticAssert(node, context) {
  const symbolId = `${context.filePath}::static_assert:${node.startPosition.row + 1}`;
  context.symbols.push({
    id: symbolId,
    name: "static_assert",
    kind: "constant",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: false
  });
}
function processMacroDefinition2(node, context) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = nodeText8(nameNode, context);
  const kind = node.type === "preproc_function_def" ? "function" : "constant";
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processIncludeDirective2(node, context) {
  const pathNode = node.childForFieldName("path");
  if (!pathNode) return;
  const pathText = nodeText8(pathNode, context);
  const isLocalInclude = pathText.startsWith('"') && pathText.endsWith('"');
  if (!isLocalInclude) {
    const includeName = pathText.replace(/[<>"]/g, "");
    const symbolId = `${context.filePath}::include:${includeName}`;
    context.symbols.push({
      id: symbolId,
      name: includeName,
      kind: "import",
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false
    });
    return;
  }
  const includePath = pathText.slice(1, -1);
  const resolvedFiles = resolveIncludePath2(includePath, context.filePath, context.projectRoot);
  if (resolvedFiles.length === 0) return;
  const sourceId = `${context.filePath}::__file__`;
  for (const targetPath of resolvedFiles) {
    const targetId = `${targetPath}::__file__`;
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processCallExpression9(node, context) {
  if (context.currentScope.length === 0) return;
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return;
  let calleeName = null;
  if (functionNode.type === "identifier") {
    calleeName = nodeText8(functionNode, context);
  } else if (functionNode.type === "field_expression" || functionNode.type === "qualified_identifier") {
    const nameNode = functionNode.childForFieldName("name") || functionNode.childForFieldName("field");
    if (nameNode) {
      calleeName = nodeText8(nameNode, context);
    }
  } else if (functionNode.type === "template_function") {
    const nameNode = functionNode.childForFieldName("name");
    if (nameNode) {
      calleeName = nodeText8(nameNode, context);
    }
  }
  if (!calleeName) return;
  const builtins = /* @__PURE__ */ new Set([
    "printf",
    "scanf",
    "malloc",
    "free",
    "memcpy",
    "strlen",
    "strcmp",
    "strcpy",
    "strcat",
    "cout",
    "cin",
    "cerr",
    "endl",
    "make_shared",
    "make_unique",
    "make_pair",
    "make_tuple",
    "move",
    "forward",
    "swap",
    "begin",
    "end",
    "size",
    "empty",
    "push_back",
    "emplace_back",
    "insert",
    "erase",
    "find",
    "sort",
    "transform",
    "for_each",
    "accumulate",
    "static_cast",
    "dynamic_cast",
    "reinterpret_cast",
    "const_cast"
  ]);
  if (builtins.has(calleeName)) return;
  const callerId = getCurrentSymbolId9(context);
  if (!callerId) return;
  const calleeId = resolveSymbol8(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function parseCMakeLists(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  const projectName = basename3(dirname9(join11(projectRoot, filePath)));
  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    const findPkgMatch = line.match(/find_package\s*\(\s*(\w+)/i);
    if (findPkgMatch) {
      symbols.push({
        id: `${filePath}::dep:${findPkgMatch[1]}`,
        name: findPkgMatch[1],
        kind: "import",
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false
      });
    }
    const linkLibsMatch = line.match(/target_link_libraries\s*\(\s*\w+\s+(?:PRIVATE|PUBLIC|INTERFACE)?\s*(.*)\)/i);
    if (linkLibsMatch) {
      const libs = linkLibsMatch[1].trim().split(/\s+/).filter((l) => l && !["PRIVATE", "PUBLIC", "INTERFACE"].includes(l));
      for (const lib of libs) {
        symbols.push({
          id: `${filePath}::dep:${lib}`,
          name: lib,
          kind: "import",
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          exported: false
        });
      }
    }
    const addSubdirMatch = line.match(/add_subdirectory\s*\(\s*([^\s)]+)/i);
    if (addSubdirMatch) {
      const subdir = addSubdirMatch[1];
      const cmakeDir = dirname9(join11(projectRoot, filePath));
      const subdirCMake = join11(relative5(projectRoot, cmakeDir), subdir, "CMakeLists.txt");
      if (existsSync11(join11(projectRoot, subdirCMake))) {
        edges.push({
          source: `${filePath}::__file__`,
          target: `${subdirCMake}::__file__`,
          kind: "imports",
          filePath,
          line: lineNum
        });
      }
    }
    const projectMatch = line.match(/project\s*\(\s*(\w+)/i);
    if (projectMatch) {
      symbols.push({
        id: `${filePath}::project:${projectMatch[1]}`,
        name: projectMatch[1],
        kind: "module",
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true
      });
    }
  }
  return { filePath, symbols, edges };
}
function parseConanfileTxt(filePath, sourceCode, _projectRoot) {
  const symbols = [];
  const lines = sourceCode.split("\n");
  let inRequires = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    if (line === "[requires]") {
      inRequires = true;
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      inRequires = false;
      continue;
    }
    if (inRequires && line.length > 0) {
      symbols.push({
        id: `${filePath}::dep:${line}`,
        name: line,
        kind: "import",
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false
      });
    }
  }
  return { filePath, symbols, edges: [] };
}
function parseVcpkgJson(filePath, sourceCode, _projectRoot) {
  const symbols = [];
  try {
    const vcpkg = JSON.parse(sourceCode);
    if (vcpkg.dependencies && Array.isArray(vcpkg.dependencies)) {
      for (let i = 0; i < vcpkg.dependencies.length; i++) {
        const dep = vcpkg.dependencies[i];
        const name = typeof dep === "string" ? dep : dep.name || "";
        if (name) {
          symbols.push({
            id: `${filePath}::dep:${name}`,
            name,
            kind: "import",
            filePath,
            startLine: 1,
            endLine: 1,
            exported: false
          });
        }
      }
    }
  } catch {
  }
  return { filePath, symbols, edges: [] };
}
function resolveIncludePath2(includePath, currentFile, projectRoot) {
  const currentFileAbs = join11(projectRoot, currentFile);
  const currentDir = dirname9(currentFileAbs);
  const possibleFiles = [
    join11(currentDir, includePath),
    join11(projectRoot, includePath),
    join11(projectRoot, "include", includePath),
    join11(projectRoot, "src", includePath)
  ];
  const resolvedFiles = [];
  for (const absPath of possibleFiles) {
    if (existsSync11(absPath)) {
      const relPath = relative5(projectRoot, absPath);
      if (!resolvedFiles.includes(relPath)) {
        resolvedFiles.push(relPath);
      }
    }
  }
  return resolvedFiles;
}
function resolveSymbol8(name, context) {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find((s) => s.id === currentFileId)) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find((s) => s.id === classMethodId)) {
      return classMethodId;
    }
  }
  return null;
}
function hasStorageClass2(node, className, context) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "storage_class_specifier") {
      if (nodeText8(child, context) === className) {
        return true;
      }
    }
  }
  return false;
}
function hasAccessSpecifier(node, specifier, context) {
  const parent = node.parent;
  if (!parent) return false;
  let lastAccess = "";
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (!child) continue;
    if (child.type === "access_specifier") {
      lastAccess = nodeText8(child, context).replace(":", "").trim();
    }
    if (child === node) break;
  }
  return lastAccess === specifier;
}
function extractFunctionName2(declarator) {
  if (declarator.type === "identifier") {
    return declarator;
  }
  if (declarator.type === "function_declarator") {
    const innerDeclarator = declarator.childForFieldName("declarator");
    if (innerDeclarator) {
      return extractFunctionName2(innerDeclarator);
    }
  }
  if (declarator.type === "pointer_declarator" || declarator.type === "reference_declarator") {
    const innerDeclarator = declarator.childForFieldName("declarator");
    if (innerDeclarator) {
      return extractFunctionName2(innerDeclarator);
    }
  }
  if (declarator.type === "qualified_identifier" || declarator.type === "template_function") {
    const nameNode = declarator.childForFieldName("name");
    if (nameNode) {
      return extractFunctionName2(nameNode);
    }
  }
  if (declarator.type === "destructor_name") {
    return declarator;
  }
  if (declarator.type === "operator_name") {
    return declarator;
  }
  for (let i = 0; i < declarator.childCount; i++) {
    const child = declarator.child(i);
    if (child && child.type === "identifier") {
      return child;
    }
  }
  return null;
}
function extractIdentifierFromDeclarator2(declarator, context) {
  if (declarator.type === "identifier") {
    return nodeText8(declarator, context);
  }
  if (declarator.type === "type_identifier") {
    return nodeText8(declarator, context);
  }
  const identifierNode = findChildByType9(declarator, "identifier");
  if (identifierNode) {
    return nodeText8(identifierNode, context);
  }
  const typeIdNode = findChildByType9(declarator, "type_identifier");
  if (typeIdNode) {
    return nodeText8(typeIdNode, context);
  }
  for (let i = 0; i < declarator.childCount; i++) {
    const child = declarator.child(i);
    if (child) {
      const name = extractIdentifierFromDeclarator2(child, context);
      if (name) return name;
    }
  }
  return null;
}
function extractTypeName4(node, context) {
  const text = nodeText8(node, context).trim();
  if (!text || text === ":" || text === ",") return null;
  const accessStripped = text.replace(/^(?:public|protected|private|virtual)\s+/g, "");
  const angleBracketIdx = accessStripped.indexOf("<");
  const name = angleBracketIdx > 0 ? accessStripped.substring(0, angleBracketIdx) : accessStripped;
  const colonIdx = name.lastIndexOf("::");
  return colonIdx >= 0 ? name.substring(colonIdx + 2) : name;
}
function containsType(node, type) {
  if (node.type === type) return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && containsType(child, type)) return true;
  }
  return false;
}
function findChildByType9(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}
function nodeText8(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId9(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
var cppParser = {
  name: "cpp",
  extensions: [
    ".cpp",
    ".cc",
    ".cxx",
    ".c++",
    ".hpp",
    ".hh",
    ".hxx",
    ".h++",
    ".inl",
    ".ipp",
    "CMakeLists.txt",
    "conanfile.txt",
    "vcpkg.json"
  ],
  parseFile: parseCppFile
};

// src/parser/kotlin.ts
import { dirname as dirname10, join as join12, basename as basename4 } from "path";
import { existsSync as existsSync12, readdirSync as readdirSync8, statSync as statSync6 } from "fs";
var moduleSourceRoots2 = [];
var verifiedRootSet2 = /* @__PURE__ */ new Set();
function setModuleSourceRoots2(roots, verified) {
  moduleSourceRoots2 = roots;
  verifiedRootSet2 = verified;
}
function resetModuleSourceRoots2() {
  moduleSourceRoots2 = [];
  verifiedRootSet2 = /* @__PURE__ */ new Set();
}
function parseKotlinFile(filePath, sourceCode, projectRoot) {
  if (filePath.endsWith("build.gradle.kts")) {
    return parseGradleBuild2(filePath, sourceCode, projectRoot);
  }
  if (filePath.endsWith("build.gradle")) {
    return parseGradleBuild2(filePath, sourceCode, projectRoot);
  }
  if (filePath.endsWith("settings.gradle.kts") || filePath.endsWith("settings.gradle")) {
    return parseSettingsGradle(filePath, sourceCode, projectRoot);
  }
  const parser = getParser("kotlin");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentPackage: null,
    imports: /* @__PURE__ */ new Map(),
    isBuildFile: false,
    isScriptFile: filePath.endsWith(".kts")
  };
  walkNode10(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode10(node, context) {
  processNode10(node, context);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode10(child, context);
    }
  }
}
function processNode10(node, context) {
  switch (node.type) {
    case "package_header":
      processPackageHeader(node, context);
      break;
    case "import_header":
      processImportHeader(node, context);
      break;
    case "class_declaration":
      processClassDeclaration5(node, context);
      break;
    case "object_declaration":
      processObjectDeclaration(node, context);
      break;
    case "companion_object":
      processCompanionObject(node, context);
      break;
    case "function_declaration":
      processFunctionDeclaration4(node, context);
      break;
    case "property_declaration":
      processPropertyDeclaration2(node, context);
      break;
    case "secondary_constructor":
      processSecondaryConstructor(node, context);
      break;
    case "type_alias":
      processTypeAlias(node, context);
      break;
    case "call_expression":
      processCallExpression10(node, context);
      break;
    case "navigation_expression":
      processNavigationExpression(node, context);
      break;
  }
}
function processPackageHeader(node, context) {
  const ident = findDescendantByTypes2(node, ["identifier"]);
  if (!ident) return;
  const name = nodeText9(ident, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "module",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
  context.currentPackage = name;
}
function processImportHeader(node, context) {
  const ident = findDescendantByTypes2(node, ["identifier"]);
  if (!ident) return;
  let importPath = nodeText9(ident, context);
  const text = nodeText9(node, context).trim();
  const isWildcard = text.endsWith(".*");
  if (isWildcard && !importPath.endsWith(".*")) {
    importPath = importPath + ".*";
  }
  const aliasMatch = text.match(/\bas\s+(\w+)/);
  const alias = aliasMatch ? aliasMatch[1] : null;
  const resolvedPath = resolveKotlinImport(importPath, context.filePath, context.projectRoot);
  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    const targetId = `${resolvedPath}::__file__`;
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
    const parts = importPath.replace(/\.\*$/, "").split(".");
    if (!isWildcard) {
      const simpleName = alias || parts[parts.length - 1];
      context.imports.set(simpleName, `${resolvedPath}::${parts[parts.length - 1]}`);
    }
  }
  const symbolId = `${context.filePath}::import:${importPath}`;
  context.symbols.push({
    id: symbolId,
    name: importPath,
    kind: "import",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: false
  });
}
function processClassDeclaration5(node, context) {
  const nameNode = findChildByType10(node, "type_identifier");
  if (!nameNode) return;
  let name = nodeText9(nameNode, context);
  const angleBracketIdx = name.indexOf("<");
  if (angleBracketIdx > 0) {
    name = name.substring(0, angleBracketIdx);
  }
  const text = nodeText9(node, context);
  const modifiers = getModifiers(node, context);
  let kind = "class";
  if (text.match(/\binterface\b/) && !text.match(/\bfun\s+interface\b/)) {
    kind = "interface";
  } else if (text.match(/\benum\s+class\b/)) {
    kind = "enum";
  } else if (text.match(/\bannotation\s+class\b/)) {
    kind = "interface";
  }
  const exported = modifiers.includes("public") || modifiers.includes("internal") || !modifiers.includes("private") && !modifiers.includes("protected");
  const scope = context.currentClass || void 0;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const delegationSpecifiers = findChildByType10(node, "delegation_specifiers");
  if (delegationSpecifiers) {
    processDelegationSpecifiers(delegationSpecifiers, symbolId, context);
  }
  if (kind === "enum") {
    processEnumEntries(node, name, context);
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType10(node, "class_body") || findChildByType10(node, "enum_class_body");
  if (body) {
    walkNode10(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processObjectDeclaration(node, context) {
  const nameNode = findChildByType10(node, "type_identifier");
  if (!nameNode) return;
  const name = nodeText9(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes("private");
  const scope = context.currentClass || void 0;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    // Objects are singletons, map to class
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const delegationSpecifiers = findChildByType10(node, "delegation_specifiers");
  if (delegationSpecifiers) {
    processDelegationSpecifiers(delegationSpecifiers, symbolId, context);
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType10(node, "class_body");
  if (body) {
    walkNode10(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processCompanionObject(node, context) {
  const nameNode = findChildByType10(node, "type_identifier");
  const name = nameNode ? nodeText9(nameNode, context) : "Companion";
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope
  });
  const oldClass = context.currentClass;
  context.currentClass = scope ? `${scope}.${name}` : name;
  context.currentScope.push(context.currentClass);
  const body = findChildByType10(node, "class_body");
  if (body) {
    walkNode10(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processDelegationSpecifiers(node, sourceId, context) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const typeName = extractTypeName5(child, context);
    if (typeName) {
      const baseId = resolveSymbol9(typeName, context);
      if (baseId) {
        const edgeKind = typeName.startsWith("I") && typeName.length > 1 && typeName[1] === typeName[1].toUpperCase() ? "implements" : "inherits";
        context.edges.push({
          source: sourceId,
          target: baseId,
          kind: edgeKind,
          filePath: context.filePath,
          line: child.startPosition.row + 1
        });
      }
    }
  }
}
function processEnumEntries(node, enumName, context) {
  const body = findChildByType10(node, "enum_class_body");
  if (!body) return;
  const entries = findChildrenByType4(body, "enum_entry");
  for (const entry of entries) {
    const nameNode = findChildByType10(entry, "simple_identifier");
    if (!nameNode) continue;
    const constName = nodeText9(nameNode, context);
    const constId = `${context.filePath}::${enumName}.${constName}`;
    context.symbols.push({
      id: constId,
      name: constName,
      kind: "constant",
      filePath: context.filePath,
      startLine: entry.startPosition.row + 1,
      endLine: entry.endPosition.row + 1,
      exported: true,
      scope: enumName
    });
  }
}
function processFunctionDeclaration4(node, context) {
  const nameNode = findChildByType10(node, "simple_identifier");
  if (!nameNode) return;
  const name = nodeText9(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes("private");
  const scope = context.currentClass || void 0;
  const text = nodeText9(node, context);
  const isExtension = text.match(/fun\s+[\w.<>, ]+\./) !== null;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? "method" : "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const body = findChildByType10(node, "function_body");
  if (body) {
    walkNode10(body, context);
  }
  context.currentScope.pop();
}
function processPropertyDeclaration2(node, context) {
  const varDecl = findChildByType10(node, "variable_declaration");
  if (!varDecl) return;
  const nameNode = findChildByType10(varDecl, "simple_identifier");
  if (!nameNode) return;
  const name = nodeText9(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes("private");
  const scope = context.currentClass || void 0;
  const text = nodeText9(node, context);
  const isConst = modifiers.includes("const") || text.match(/\bval\b/) !== null && text.match(/\bconst\b/) !== null;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: isConst ? "constant" : "property",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
}
function processSecondaryConstructor(node, context) {
  const scope = context.currentClass || void 0;
  if (!scope) return;
  const name = "constructor";
  const symbolId = `${context.filePath}::${scope}.${name}:${node.startPosition.row + 1}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope
  });
  const scopeName = `${scope}.${name}`;
  context.currentScope.push(scopeName);
  const body = findChildByType10(node, "function_body");
  if (body) {
    walkNode10(body, context);
  }
  context.currentScope.pop();
}
function processTypeAlias(node, context) {
  const nameNode = findChildByType10(node, "type_identifier");
  if (!nameNode) return;
  const name = nodeText9(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "type_alias",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processCallExpression10(node, context) {
  if (context.currentScope.length === 0) return;
  const firstChild = node.child(0);
  if (!firstChild) return;
  let calleeName = null;
  if (firstChild.type === "simple_identifier") {
    calleeName = nodeText9(firstChild, context);
  } else if (firstChild.type === "navigation_expression") {
    const suffix = findChildByType10(firstChild, "navigation_suffix");
    if (suffix) {
      const ident = findChildByType10(suffix, "simple_identifier");
      if (ident) calleeName = nodeText9(ident, context);
    }
    if (!calleeName) {
      for (let i = firstChild.childCount - 1; i >= 0; i--) {
        const child = firstChild.child(i);
        if (child && child.type === "simple_identifier") {
          calleeName = nodeText9(child, context);
          break;
        }
      }
    }
  }
  if (!calleeName) return;
  const builtins = /* @__PURE__ */ new Set([
    "println",
    "print",
    "toString",
    "equals",
    "hashCode",
    "let",
    "apply",
    "also",
    "run",
    "with",
    "takeIf",
    "takeUnless",
    "repeat",
    "require",
    "check",
    "error",
    "TODO",
    "listOf",
    "mapOf",
    "setOf",
    "arrayOf",
    "mutableListOf",
    "mutableMapOf",
    "mutableSetOf",
    "emptyList",
    "emptyMap",
    "emptySet",
    "to",
    "Pair",
    "Triple",
    "lazy",
    "synchronized",
    "map",
    "filter",
    "forEach",
    "flatMap",
    "fold",
    "reduce",
    "any",
    "all",
    "none",
    "find",
    "first",
    "last",
    "count",
    "sum",
    "average",
    "sortedBy",
    "groupBy",
    "associate",
    "zip",
    "joinToString",
    "getOrDefault",
    "getOrElse",
    "getOrPut",
    "contains",
    "containsKey",
    "add",
    "remove",
    "clear",
    "size",
    "isEmpty",
    "isNotEmpty"
  ]);
  if (builtins.has(calleeName)) return;
  const callerId = getCurrentSymbolId10(context);
  if (!callerId) return;
  const calleeId = resolveSymbol9(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processNavigationExpression(node, context) {
}
function parseGradleBuild2(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  const projectName = basename4(dirname10(join12(projectRoot, filePath)));
  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    const depMatch = line.match(
      /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|kapt|ksp|annotationProcessor)\s*[\(]?\s*['"]([^'"]+)['"]\s*[\)]?/
    );
    if (depMatch) {
      const depCoord = depMatch[1];
      if (!depCoord.startsWith(":")) {
        symbols.push({
          id: `${filePath}::dep:${depCoord}`,
          name: depCoord,
          kind: "import",
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          exported: false
        });
      }
    }
    const projectMatch = line.match(/project\s*\(\s*['":]+([^'")\s]+)['"]*\s*\)/);
    if (projectMatch) {
      const moduleName = projectMatch[1].replace(/^:/, "");
      const candidates = [
        join12(moduleName, "build.gradle.kts"),
        join12(moduleName, "build.gradle")
      ];
      for (const candidate of candidates) {
        if (existsSync12(join12(projectRoot, candidate))) {
          edges.push({
            source: `${filePath}::__file__`,
            target: `${candidate}::__file__`,
            kind: "imports",
            filePath,
            line: lineNum
          });
          break;
        }
      }
    }
  }
  return { filePath, symbols, edges };
}
function parseSettingsGradle(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  symbols.push({
    id: `${filePath}::settings`,
    name: "settings",
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    const includeMatches = line.matchAll(/['"]:([^'"]+)['"]/g);
    for (const match of includeMatches) {
      const moduleName = match[1];
      const candidates = [
        join12(moduleName, "build.gradle.kts"),
        join12(moduleName, "build.gradle")
      ];
      for (const candidate of candidates) {
        if (existsSync12(join12(projectRoot, candidate))) {
          edges.push({
            source: `${filePath}::__file__`,
            target: `${candidate}::__file__`,
            kind: "imports",
            filePath,
            line: lineNum
          });
          break;
        }
      }
    }
  }
  return { filePath, symbols, edges };
}
function resolveKotlinImport(importPath, currentFile, projectRoot) {
  const cleanPath2 = importPath.replace(/\.\*$/, "");
  const parts = cleanPath2.split(".");
  const className = parts[parts.length - 1];
  const packagePath = parts.slice(0, -1).join("/");
  const hardcodedRoots = [
    "",
    "src/main/kotlin",
    "src/main/java",
    // Kotlin can live in java source dirs
    "src/test/kotlin",
    "src/test/java",
    "src",
    "app/src/main/kotlin",
    "app/src/main/java"
  ];
  const sourceRoots = [...moduleSourceRoots2, ...hardcodedRoots];
  for (const root of sourceRoots) {
    for (const ext of [".kt", ".java"]) {
      const filePath = packagePath ? join12(packagePath, className + ext) : className + ext;
      const candidate = root ? join12(root, filePath) : filePath;
      const fullPath = join12(projectRoot, candidate);
      const rootAbsolute = root ? join12(projectRoot, root) : projectRoot;
      const isVerifiedRoot = verifiedRootSet2.has(rootAbsolute);
      if (isVerifiedRoot || !root || hardcodedRoots.includes(root)) {
        if (existsSync12(fullPath)) {
          return candidate;
        }
      }
    }
  }
  if (importPath.endsWith(".*")) {
    const dirPath = cleanPath2.replace(/\./g, "/");
    for (const root of sourceRoots) {
      const candidate = root ? join12(root, dirPath) : dirPath;
      const fullPath = join12(projectRoot, candidate);
      if (existsSync12(fullPath)) {
        try {
          const stats = statSync6(fullPath);
          if (stats.isDirectory()) {
            const ktFiles = readdirSync8(fullPath).filter((f) => f.endsWith(".kt"));
            if (ktFiles.length > 0) {
              return join12(candidate, ktFiles[0]);
            }
          }
        } catch {
        }
      }
    }
  }
  return null;
}
function resolveSymbol9(name, context) {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find((s) => s.id === currentFileId)) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find((s) => s.id === classMethodId)) {
      return classMethodId;
    }
  }
  return null;
}
function getModifiers(node, context) {
  const modifiers = [];
  const modList = findChildByType10(node, "modifiers");
  if (modList) {
    for (let i = 0; i < modList.childCount; i++) {
      const child = modList.child(i);
      if (child) {
        const text = nodeText9(child, context).trim();
        if (text) modifiers.push(text);
      }
    }
  }
  return modifiers;
}
function extractTypeName5(node, context) {
  const text = nodeText9(node, context).trim();
  if (!text || text === "," || text === ":") return null;
  let name = text;
  const angleBracketIdx = name.indexOf("<");
  if (angleBracketIdx > 0) name = name.substring(0, angleBracketIdx);
  const parenIdx = name.indexOf("(");
  if (parenIdx > 0) name = name.substring(0, parenIdx);
  const dotIdx = name.lastIndexOf(".");
  name = dotIdx >= 0 ? name.substring(dotIdx + 1) : name;
  return name.trim() || null;
}
function findChildByType10(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}
function findChildrenByType4(node, type) {
  const results = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) results.push(child);
  }
  return results;
}
function findDescendantByTypes2(node, types) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (types.includes(child.type)) return child;
    const found = findDescendantByTypes2(child, types);
    if (found) return found;
  }
  return null;
}
function nodeText9(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId10(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
var kotlinParser = {
  name: "kotlin",
  extensions: [".kt", ".kts", "build.gradle.kts", "settings.gradle.kts", "settings.gradle"],
  parseFile: parseKotlinFile
};

// src/parser/php.ts
import { dirname as dirname11, join as join13 } from "path";
import { existsSync as existsSync13 } from "fs";
function parsePhpFile(filePath, sourceCode, projectRoot) {
  const parser = getParser("php");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentNamespace: null,
    imports: /* @__PURE__ */ new Map()
  };
  walkNode11(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
var SCOPE_TYPES = /* @__PURE__ */ new Set([
  "class_declaration",
  "interface_declaration",
  "trait_declaration",
  "enum_declaration",
  "function_definition",
  "method_declaration"
]);
function walkNode11(node, context) {
  processNode11(node, context);
  if (SCOPE_TYPES.has(node.type)) return;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode11(child, context);
    }
  }
}
function processNode11(node, context) {
  switch (node.type) {
    case "namespace_definition":
      processNamespaceDefinition2(node, context);
      break;
    case "namespace_use_declaration":
      processUseDeclaration2(node, context);
      break;
    case "class_declaration":
      processClassDeclaration6(node, context);
      break;
    case "interface_declaration":
      processInterfaceDeclaration4(node, context);
      break;
    case "trait_declaration":
      processTraitDeclaration(node, context);
      break;
    case "enum_declaration":
      processEnumDeclaration4(node, context);
      break;
    case "function_definition":
      processFunctionDefinition4(node, context);
      break;
    case "method_declaration":
      processMethodDeclaration4(node, context);
      break;
    case "property_declaration":
      processPropertyDeclaration3(node, context);
      break;
    case "const_declaration":
      processConstDeclaration2(node, context);
      break;
    case "function_call_expression":
      processCallExpression11(node, context);
      break;
    case "member_call_expression":
      processMemberCallExpression(node, context);
      break;
    case "scoped_call_expression":
      processScopedCallExpression(node, context);
      break;
    case "include_expression":
    case "include_once_expression":
    case "require_expression":
    case "require_once_expression":
      processIncludeRequire(node, context);
      break;
  }
}
function processNamespaceDefinition2(node, context) {
  const nameNode = findChildByType11(node, "namespace_name");
  if (!nameNode) return;
  const name = nodeText10(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "module",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
  context.currentNamespace = name;
}
function processUseDeclaration2(node, context) {
  const clauses = findChildrenByType5(node, "namespace_use_clause");
  for (const clause of clauses) {
    const nameNode = findChildByType11(clause, "namespace_name") || findChildByType11(clause, "qualified_name");
    if (!nameNode) continue;
    const importPath = nodeText10(nameNode, context);
    const aliasNode = findChildByType11(clause, "namespace_aliasing_clause");
    const alias = aliasNode ? nodeText10(findChildByType11(aliasNode, "name") || aliasNode, context).trim() : null;
    const parts = importPath.split("\\");
    const simpleName = alias || parts[parts.length - 1];
    const resolvedPath = resolvePhpImport(importPath, context.filePath, context.projectRoot);
    if (resolvedPath) {
      const sourceId = `${context.filePath}::__file__`;
      const targetId = `${resolvedPath}::__file__`;
      context.edges.push({
        source: sourceId,
        target: targetId,
        kind: "imports",
        filePath: context.filePath,
        line: node.startPosition.row + 1
      });
      context.imports.set(simpleName, `${resolvedPath}::${parts[parts.length - 1]}`);
    }
    const symbolId = `${context.filePath}::import:${importPath}`;
    context.symbols.push({
      id: symbolId,
      name: importPath,
      kind: "import",
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false
    });
  }
}
function processClassDeclaration6(node, context) {
  const nameNode = findChildByType11(node, "name");
  if (!nameNode) return;
  const name = nodeText10(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  const text = nodeText10(node, context);
  const isAbstract = text.trimStart().startsWith("abstract");
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope: context.currentClass || void 0
  });
  const baseClause = findChildByType11(node, "base_clause");
  if (baseClause) {
    const baseName = extractQualifiedName(baseClause, context);
    if (baseName) {
      const baseId = resolveSymbol10(baseName, context);
      if (baseId) {
        context.edges.push({
          source: symbolId,
          target: baseId,
          kind: "inherits",
          filePath: context.filePath,
          line: node.startPosition.row + 1
        });
      }
    }
  }
  const interfaceClause = findChildByType11(node, "class_interface_clause");
  if (interfaceClause) {
    const names = findChildrenByType5(interfaceClause, "name");
    const qualifiedNames = findChildrenByType5(interfaceClause, "qualified_name");
    for (const n of [...names, ...qualifiedNames]) {
      const ifaceName = nodeText10(n, context).trim();
      if (ifaceName && ifaceName !== ",") {
        const ifaceId = resolveSymbol10(ifaceName, context);
        if (ifaceId) {
          context.edges.push({
            source: symbolId,
            target: ifaceId,
            kind: "implements",
            filePath: context.filePath,
            line: node.startPosition.row + 1
          });
        }
      }
    }
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType11(node, "declaration_list");
  if (body) {
    walkNode11(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processInterfaceDeclaration4(node, context) {
  const nameNode = findChildByType11(node, "name");
  if (!nameNode) return;
  const name = nodeText10(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "interface",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope: context.currentClass || void 0
  });
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType11(node, "declaration_list");
  if (body) {
    walkNode11(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processTraitDeclaration(node, context) {
  const nameNode = findChildByType11(node, "name");
  if (!nameNode) return;
  const name = nodeText10(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    // Traits map to class kind
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope: context.currentClass || void 0
  });
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType11(node, "declaration_list");
  if (body) {
    walkNode11(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processEnumDeclaration4(node, context) {
  const nameNode = findChildByType11(node, "name");
  if (!nameNode) return;
  const name = nodeText10(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "enum",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType11(node, "declaration_list");
  if (body) {
    walkNode11(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processFunctionDefinition4(node, context) {
  const nameNode = findChildByType11(node, "name");
  if (!nameNode) return;
  const name = nodeText10(nameNode, context);
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const body = findChildByType11(node, "compound_statement");
  if (body) {
    walkNode11(body, context);
  }
  context.currentScope.pop();
}
function processMethodDeclaration4(node, context) {
  const nameNode = findChildByType11(node, "name");
  if (!nameNode) return;
  const name = nodeText10(nameNode, context);
  const modifiers = getModifiers2(node, context);
  const exported = !modifiers.includes("private");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const body = findChildByType11(node, "compound_statement");
  if (body) {
    walkNode11(body, context);
  }
  context.currentScope.pop();
}
function processPropertyDeclaration3(node, context) {
  const varNode = findDescendantByTypes3(node, ["variable_name"]);
  if (!varNode) return;
  const name = nodeText10(varNode, context).replace(/^\$/, "");
  const modifiers = getModifiers2(node, context);
  const exported = !modifiers.includes("private");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "property",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
}
function processConstDeclaration2(node, context) {
  const elements = findChildrenByType5(node, "const_element");
  for (const elem of elements) {
    const nameNode = findChildByType11(elem, "name");
    if (!nameNode) continue;
    const name = nodeText10(nameNode, context);
    const scope = context.currentClass || void 0;
    const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
    context.symbols.push({
      id: symbolId,
      name,
      kind: "constant",
      filePath: context.filePath,
      startLine: elem.startPosition.row + 1,
      endLine: elem.endPosition.row + 1,
      exported: true,
      scope
    });
  }
}
function processCallExpression11(node, context) {
  if (context.currentScope.length === 0) return;
  const firstChild = node.child(0);
  if (!firstChild) return;
  let calleeName = null;
  if (firstChild.type === "name") {
    calleeName = nodeText10(firstChild, context);
  } else if (firstChild.type === "qualified_name") {
    const parts = nodeText10(firstChild, context).split("\\");
    calleeName = parts[parts.length - 1];
  }
  if (!calleeName) return;
  const builtins = /* @__PURE__ */ new Set([
    "echo",
    "print",
    "var_dump",
    "print_r",
    "isset",
    "unset",
    "empty",
    "array",
    "list",
    "count",
    "strlen",
    "strpos",
    "substr",
    "explode",
    "implode",
    "array_map",
    "array_filter",
    "array_merge",
    "array_push",
    "array_pop",
    "array_shift",
    "array_unshift",
    "array_keys",
    "array_values",
    "in_array",
    "json_encode",
    "json_decode",
    "sprintf",
    "printf",
    "is_array",
    "is_string",
    "is_int",
    "is_null",
    "is_bool",
    "intval",
    "floatval",
    "strval",
    "boolval",
    "trim",
    "ltrim",
    "rtrim",
    "strtolower",
    "strtoupper",
    "str_replace",
    "preg_match",
    "preg_replace",
    "file_exists",
    "is_file",
    "is_dir",
    "dirname",
    "basename",
    "date",
    "time",
    "strtotime",
    "compact",
    "extract",
    "defined",
    "define",
    "class_exists",
    "function_exists",
    "throw",
    "die",
    "exit"
  ]);
  if (builtins.has(calleeName)) return;
  const callerId = getCurrentSymbolId11(context);
  if (!callerId) return;
  const calleeId = resolveSymbol10(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processMemberCallExpression(node, context) {
}
function processScopedCallExpression(node, context) {
}
function processIncludeRequire(node, context) {
  const text = nodeText10(node, context);
  const pathMatch = text.match(/['"]([^'"]+)['"]/);
  if (!pathMatch) return;
  const includePath = pathMatch[1];
  const resolvedPath = resolvePhpInclude(includePath, context.filePath, context.projectRoot);
  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    const targetId = `${resolvedPath}::__file__`;
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function resolvePhpImport(importPath, currentFile, projectRoot) {
  const parts = importPath.split("\\");
  const filePath = parts.join("/") + ".php";
  const sourceRoots = [
    "",
    "src",
    "app",
    "lib",
    "includes",
    "wp-content/plugins",
    "wp-content/themes"
  ];
  for (const root of sourceRoots) {
    const candidate = root ? join13(root, filePath) : filePath;
    const fullPath = join13(projectRoot, candidate);
    if (existsSync13(fullPath)) {
      return candidate;
    }
    const loweredParts = [...parts];
    loweredParts[0] = loweredParts[0].toLowerCase();
    const loweredFilePath = loweredParts.join("/") + ".php";
    const loweredCandidate = root ? join13(root, loweredFilePath) : loweredFilePath;
    const loweredFullPath = join13(projectRoot, loweredCandidate);
    if (existsSync13(loweredFullPath)) {
      return loweredCandidate;
    }
  }
  return null;
}
function resolvePhpInclude(includePath, currentFile, projectRoot) {
  const currentDir = dirname11(join13(projectRoot, currentFile));
  const relativePath = join13(currentDir, includePath);
  const relativeToRoot = relativePath.replace(projectRoot + "/", "");
  if (existsSync13(relativePath)) {
    return relativeToRoot;
  }
  const fromRoot = join13(projectRoot, includePath);
  if (existsSync13(fromRoot)) {
    return includePath;
  }
  return null;
}
function resolveSymbol10(name, context) {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find((s) => s.id === currentFileId)) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find((s) => s.id === classMethodId)) {
      return classMethodId;
    }
  }
  return null;
}
function getModifiers2(node, context) {
  const modifiers = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const type = child.type;
    if (type === "visibility_modifier" || type === "static_modifier" || type === "abstract_modifier" || type === "final_modifier" || type === "readonly_modifier") {
      modifiers.push(nodeText10(child, context).trim());
    }
  }
  return modifiers;
}
function extractQualifiedName(node, context) {
  const nameNode = findDescendantByTypes3(node, ["name", "qualified_name", "namespace_name"]);
  if (!nameNode) return null;
  const text = nodeText10(nameNode, context).trim();
  if (!text) return null;
  const parts = text.split("\\");
  return parts[parts.length - 1];
}
function findChildByType11(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}
function findChildrenByType5(node, type) {
  const results = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) results.push(child);
  }
  return results;
}
function findDescendantByTypes3(node, types) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (types.includes(child.type)) return child;
    const found = findDescendantByTypes3(child, types);
    if (found) return found;
  }
  return null;
}
function nodeText10(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId11(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
var phpParser = {
  name: "php",
  extensions: [".php"],
  parseFile: parsePhpFile
};

// src/parser/swift.ts
import { dirname as dirname12, join as join14, basename as basename6 } from "path";
import { existsSync as existsSync14, readdirSync as readdirSync10, statSync as statSync8 } from "fs";
function parseSwiftFile(filePath, sourceCode, projectRoot) {
  if (filePath.endsWith("Package.swift")) {
    return parsePackageSwift(filePath, sourceCode, projectRoot);
  }
  const parser = getParser("swift");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentModule: null,
    imports: /* @__PURE__ */ new Map(),
    isPackageFile: false
  };
  walkNode12(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode12(node, context) {
  const handled = processNode12(node, context);
  if (handled) return;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode12(child, context);
    }
  }
}
function processNode12(node, context) {
  switch (node.type) {
    case "import_declaration":
      processImportDeclaration3(node, context);
      return false;
    case "class_declaration":
      processClassDeclaration7(node, context);
      return true;
    // handles its own children
    case "protocol_declaration":
      processProtocolDeclaration(node, context);
      return true;
    // handles its own children
    case "function_declaration":
      processFunctionDeclaration5(node, context);
      return true;
    // handles its own children
    case "init_declaration":
      processInitDeclaration(node, context);
      return true;
    case "deinit_declaration":
      processDeinitDeclaration(node, context);
      return true;
    case "property_declaration":
    case "variable_declaration":
      processPropertyDeclaration4(node, context);
      return false;
    case "typealias_declaration":
      processTypealiasDeclaration(node, context);
      return false;
    case "associatedtype_declaration":
      processAssociatedTypeDeclaration(node, context);
      return false;
    case "call_expression":
      processCallExpression12(node, context);
      return false;
    default:
      return false;
  }
}
function processImportDeclaration3(node, context) {
  const text = nodeText11(node, context).trim();
  const match = text.match(/^import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?(.+)$/);
  if (!match) return;
  const importPath = match[1].trim();
  const resolvedPath = resolveSwiftImport(importPath, context.filePath, context.projectRoot);
  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    const targetId = `${resolvedPath}::__file__`;
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
    const parts = importPath.split(".");
    const simpleName = parts[parts.length - 1];
    context.imports.set(simpleName, `${resolvedPath}::${simpleName}`);
  }
  const symbolId = `${context.filePath}::import:${importPath}`;
  context.symbols.push({
    id: symbolId,
    name: importPath,
    kind: "import",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: false
  });
}
function processClassDeclaration7(node, context) {
  let keyword = "class";
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && ["class", "struct", "actor", "enum", "extension"].includes(child.type)) {
      keyword = child.type;
      break;
    }
  }
  if (keyword === "extension") {
    const typeNode = findChildByType12(node, "user_type") || findChildByType12(node, "type_identifier");
    const extName = typeNode ? nodeText11(typeNode, context).trim() : "Unknown";
    const name2 = `${extName}+ext`;
    const symbolId2 = `${context.filePath}::${name2}`;
    context.symbols.push({
      id: symbolId2,
      name: name2,
      kind: "class",
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: true
    });
    const oldClass2 = context.currentClass;
    context.currentClass = extName;
    context.currentScope.push(extName);
    const body2 = findChildByType12(node, "class_body");
    if (body2) {
      walkNode12(body2, context);
    }
    context.currentScope.pop();
    context.currentClass = oldClass2;
    return;
  }
  const nameNode = findChildByType12(node, "type_identifier") || findChildByType12(node, "simple_identifier");
  if (!nameNode) return;
  const name = nodeText11(nameNode, context);
  const modifiers = getModifiers3(node, context);
  const exported = !modifiers.includes("private") && !modifiers.includes("fileprivate");
  const scope = context.currentClass || void 0;
  const symbolId = `${context.filePath}::${name}`;
  let kind = "class";
  if (keyword === "enum") kind = "enum";
  else if (keyword === "struct" || keyword === "actor") kind = "class";
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  processInheritance(node, symbolId, context);
  if (keyword === "enum") {
    processEnumCases(node, name, context);
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType12(node, "class_body");
  if (body) {
    walkNode12(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processProtocolDeclaration(node, context) {
  const nameNode = findChildByType12(node, "type_identifier") || findChildByType12(node, "simple_identifier");
  if (!nameNode) return;
  const name = nodeText11(nameNode, context);
  const modifiers = getModifiers3(node, context);
  const exported = !modifiers.includes("private") && !modifiers.includes("fileprivate");
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "interface",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported
  });
  processInheritance(node, symbolId, context);
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType12(node, "protocol_body");
  if (body) {
    walkNode12(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processFunctionDeclaration5(node, context) {
  const nameNode = findChildByType12(node, "simple_identifier");
  if (!nameNode) return;
  const name = nodeText11(nameNode, context);
  const modifiers = getModifiers3(node, context);
  const exported = !modifiers.includes("private") && !modifiers.includes("fileprivate");
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? "method" : "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const body = findChildByType12(node, "function_body") || findChildByType12(node, "code_block");
  if (body) {
    walkNode12(body, context);
  }
  context.currentScope.pop();
}
function processInitDeclaration(node, context) {
  const scope = context.currentClass || void 0;
  if (!scope) return;
  const name = "init";
  const symbolId = `${context.filePath}::${scope}.${name}:${node.startPosition.row + 1}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope
  });
  const scopeName = `${scope}.${name}`;
  context.currentScope.push(scopeName);
  const body = findChildByType12(node, "function_body") || findChildByType12(node, "code_block");
  if (body) {
    walkNode12(body, context);
  }
  context.currentScope.pop();
}
function processDeinitDeclaration(node, context) {
  const scope = context.currentClass || void 0;
  if (!scope) return;
  const name = "deinit";
  const symbolId = `${context.filePath}::${scope}.${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope
  });
}
function processPropertyDeclaration4(node, context) {
  const nameNode = findChildByType12(node, "simple_identifier") || findChildByType12(node, "pattern");
  if (!nameNode) return;
  const name = nodeText11(nameNode, context).trim();
  if (!name || name.includes(" ")) return;
  const modifiers = getModifiers3(node, context);
  const exported = !modifiers.includes("private") && !modifiers.includes("fileprivate");
  const scope = context.currentClass || void 0;
  const text = nodeText11(node, context);
  const isConst = text.trimStart().startsWith("let");
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: isConst ? "constant" : "property",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope
  });
}
function processTypealiasDeclaration(node, context) {
  const nameNode = findChildByType12(node, "type_identifier") || findChildByType12(node, "simple_identifier");
  if (!nameNode) return;
  const name = nodeText11(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "type_alias",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
}
function processAssociatedTypeDeclaration(node, context) {
  const nameNode = findChildByType12(node, "type_identifier") || findChildByType12(node, "simple_identifier");
  if (!nameNode) return;
  const name = nodeText11(nameNode, context);
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "type_alias",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope
  });
}
function processCallExpression12(node, context) {
  if (context.currentScope.length === 0) return;
  const firstChild = node.child(0);
  if (!firstChild) return;
  let calleeName = null;
  if (firstChild.type === "simple_identifier") {
    calleeName = nodeText11(firstChild, context);
  } else if (firstChild.type === "navigation_expression" || firstChild.type === "member_access") {
    for (let i = firstChild.childCount - 1; i >= 0; i--) {
      const child = firstChild.child(i);
      if (child && (child.type === "simple_identifier" || child.type === "navigation_suffix")) {
        calleeName = nodeText11(child, context).replace(/^\./, "");
        break;
      }
    }
  }
  if (!calleeName) return;
  const builtins = /* @__PURE__ */ new Set([
    "print",
    "debugPrint",
    "dump",
    "fatalError",
    "precondition",
    "assert",
    "preconditionFailure",
    "assertionFailure",
    "map",
    "filter",
    "reduce",
    "forEach",
    "flatMap",
    "compactMap",
    "sorted",
    "contains",
    "first",
    "last",
    "count",
    "isEmpty",
    "append",
    "remove",
    "insert",
    "removeAll",
    "String",
    "Int",
    "Double",
    "Float",
    "Bool",
    "Array",
    "Dictionary",
    "Set",
    "DispatchQueue",
    "Task",
    "withCheckedContinuation",
    "withCheckedThrowingContinuation"
  ]);
  if (builtins.has(calleeName)) return;
  const callerId = getCurrentSymbolId12(context);
  if (!callerId) return;
  const calleeId = resolveSymbol11(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: "calls",
      filePath: context.filePath,
      line: node.startPosition.row + 1
    });
  }
}
function processInheritance(node, sourceId, context) {
  const inheritanceClause = findChildByType12(node, "inheritance_specifier") || findChildByType12(node, "type_inheritance_clause");
  if (!inheritanceClause) return;
  const text = nodeText11(node, context);
  const colonMatch = text.match(/:\s*([^{]+)/);
  if (!colonMatch) return;
  const types = colonMatch[1].split(",").map((t) => t.trim().split("<")[0].trim());
  for (const typeName of types) {
    if (!typeName || typeName.includes("{") || typeName.includes("where")) break;
    const baseId = resolveSymbol11(typeName, context);
    if (baseId) {
      context.edges.push({
        source: sourceId,
        target: baseId,
        kind: "implements",
        filePath: context.filePath,
        line: node.startPosition.row + 1
      });
    }
  }
}
function processEnumCases(node, enumName, context) {
  const text = nodeText11(node, context);
  const caseMatches = text.matchAll(/\bcase\s+(\w+)/g);
  for (const match of caseMatches) {
    const caseName = match[1];
    if (caseName === enumName) continue;
    const constId = `${context.filePath}::${enumName}.${caseName}`;
    context.symbols.push({
      id: constId,
      name: caseName,
      kind: "constant",
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: true,
      scope: enumName
    });
  }
}
function parsePackageSwift(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  const nameMatch = sourceCode.match(/name\s*:\s*["']([^"']+)["']/);
  const packageName = nameMatch ? nameMatch[1] : basename6(dirname12(join14(projectRoot, filePath)));
  symbols.push({
    id: `${filePath}::${packageName}`,
    name: packageName,
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    const depMatch = line.match(/\.package\s*\(\s*(?:url\s*:\s*)?["']([^"']+)["']/);
    if (depMatch) {
      const depUrl = depMatch[1];
      const depName = depUrl.split("/").pop()?.replace(/\.git$/, "") || depUrl;
      symbols.push({
        id: `${filePath}::dep:${depName}`,
        name: depName,
        kind: "import",
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false
      });
    }
    const targetMatch = line.match(/\.(?:target|executableTarget|testTarget)\s*\(\s*name\s*:\s*["']([^"']+)["']/);
    if (targetMatch) {
      symbols.push({
        id: `${filePath}::target:${targetMatch[1]}`,
        name: targetMatch[1],
        kind: "module",
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true
      });
    }
  }
  return { filePath, symbols, edges };
}
function resolveSwiftImport(importPath, currentFile, projectRoot) {
  const parts = importPath.split(".");
  const moduleName = parts[0];
  const sourceRoots = [
    "",
    "Sources",
    `Sources/${moduleName}`,
    "src",
    `src/${moduleName}`
  ];
  for (const root of sourceRoots) {
    const candidate = root ? join14(root, moduleName + ".swift") : moduleName + ".swift";
    const fullPath = join14(projectRoot, candidate);
    if (existsSync14(fullPath)) {
      return candidate;
    }
  }
  for (const root of sourceRoots) {
    const dirCandidate = root || moduleName;
    const fullDir = join14(projectRoot, dirCandidate);
    if (existsSync14(fullDir)) {
      try {
        const stats = statSync8(fullDir);
        if (stats.isDirectory()) {
          const swiftFiles = readdirSync10(fullDir).filter((f) => f.endsWith(".swift"));
          if (swiftFiles.length > 0) {
            return join14(dirCandidate, swiftFiles[0]);
          }
        }
      } catch {
      }
    }
  }
  return null;
}
function resolveSymbol11(name, context) {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find((s) => s.id === currentFileId)) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find((s) => s.id === classMethodId)) {
      return classMethodId;
    }
  }
  return null;
}
function getModifiers3(node, context) {
  const modifiers = [];
  const modList = findChildByType12(node, "modifiers") || findChildByType12(node, "modifier");
  if (modList) {
    for (let i = 0; i < modList.childCount; i++) {
      const child = modList.child(i);
      if (child) {
        const text2 = nodeText11(child, context).trim();
        if (text2) modifiers.push(text2);
      }
    }
  }
  const text = nodeText11(node, context);
  if (text.match(/\bprivate\b/)) modifiers.push("private");
  if (text.match(/\bfileprivate\b/)) modifiers.push("fileprivate");
  if (text.match(/\binternal\b/)) modifiers.push("internal");
  if (text.match(/\bpublic\b/)) modifiers.push("public");
  if (text.match(/\bopen\b/)) modifiers.push("open");
  return modifiers;
}
function findChildByType12(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}
function nodeText11(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId12(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
var swiftParser = {
  name: "swift",
  extensions: [".swift", "Package.swift"],
  parseFile: parseSwiftFile
};

// src/parser/mojo.ts
import { dirname as dirname13, join as join15, basename as basename7 } from "path";
function parseMojoFile(filePath, sourceCode, projectRoot) {
  if (filePath.endsWith("mojoproject.toml")) {
    return parseMojoProject(filePath, sourceCode, projectRoot);
  }
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    imports: /* @__PURE__ */ new Map()
  };
  const lines = sourceCode.split("\n");
  parseLines(lines, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function parseLines(lines, context) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    const lineNum = i + 1;
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }
    if (trimmed.startsWith("@")) {
      i++;
      continue;
    }
    if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
      processImport(trimmed, lineNum, context);
      i++;
      continue;
    }
    const fnMatch = trimmed.match(/^fn\s+(\w+)\s*[\[(]/);
    if (fnMatch) {
      const name = fnMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addFunction(name, lineNum, endLine, context);
      i = endLine;
      continue;
    }
    const defMatch = trimmed.match(/^def\s+(\w+)\s*[\[(]/);
    if (defMatch) {
      const name = defMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addFunction(name, lineNum, endLine, context);
      i = endLine;
      continue;
    }
    const structMatch = trimmed.match(/^struct\s+(\w+)/);
    if (structMatch) {
      const name = structMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addType(name, "class", lineNum, endLine, context);
      parseStructBody(lines, i + 1, endLine, indent, name, context);
      i = endLine;
      continue;
    }
    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) {
      const name = classMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addType(name, "class", lineNum, endLine, context);
      parseStructBody(lines, i + 1, endLine, indent, name, context);
      i = endLine;
      continue;
    }
    const traitMatch = trimmed.match(/^trait\s+(\w+)/);
    if (traitMatch) {
      const name = traitMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addType(name, "interface", lineNum, endLine, context);
      parseStructBody(lines, i + 1, endLine, indent, name, context);
      i = endLine;
      continue;
    }
    const aliasMatch = trimmed.match(/^alias\s+(\w+)\s*[=:]/);
    if (aliasMatch) {
      const name = aliasMatch[1];
      context.symbols.push({
        id: `${context.filePath}::${name}`,
        name,
        kind: "type_alias",
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true
      });
      i++;
      continue;
    }
    const varMatch = trimmed.match(/^(var|let)\s+(\w+)/);
    if (varMatch && indent === 0) {
      const name = varMatch[2];
      const kind = varMatch[1] === "let" ? "constant" : "var";
      context.symbols.push({
        id: `${context.filePath}::${name}`,
        name,
        kind,
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true
      });
      i++;
      continue;
    }
    processCallsInLine(trimmed, lineNum, context);
    i++;
  }
}
function processImport(line, lineNum, context) {
  let importName = null;
  const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
  if (fromMatch) {
    const module = fromMatch[1];
    const symbols = fromMatch[2].split(",").map((s) => s.trim());
    importName = module;
    for (const sym of symbols) {
      const cleanSym = sym.split(" as ")[0].trim();
      if (cleanSym && cleanSym !== "*") {
        context.imports.set(cleanSym, `${module}::${cleanSym}`);
      }
    }
  } else {
    const importMatch = line.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/);
    if (importMatch) {
      importName = importMatch[1];
      const alias = importMatch[2] || importMatch[1].split(".").pop();
      context.imports.set(alias, `${importMatch[1]}::__module__`);
    }
  }
  if (importName) {
    context.symbols.push({
      id: `${context.filePath}::import:${importName}`,
      name: importName,
      kind: "import",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: false
    });
  }
}
function addFunction(name, startLine, endLine, context) {
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? "method" : "function",
    filePath: context.filePath,
    startLine,
    endLine,
    exported: true,
    scope
  });
}
function addType(name, kind, startLine, endLine, context) {
  context.symbols.push({
    id: `${context.filePath}::${name}`,
    name,
    kind,
    filePath: context.filePath,
    startLine,
    endLine,
    exported: true
  });
}
function parseStructBody(lines, start, end, baseIndent, className, context) {
  const oldClass = context.currentClass;
  context.currentClass = className;
  let i = start;
  while (i < end && i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    const lineNum = i + 1;
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("@")) {
      i++;
      continue;
    }
    if (indent <= baseIndent) break;
    const fnMatch = trimmed.match(/^(fn|def)\s+(\w+)\s*[\[(]/);
    if (fnMatch) {
      const name = fnMatch[2];
      const fnEnd = findBlockEnd(lines, i, indent);
      addFunction(name, lineNum, fnEnd, context);
      i = fnEnd;
      continue;
    }
    const varMatch = trimmed.match(/^(var|let)\s+(\w+)/);
    if (varMatch) {
      const name = varMatch[2];
      context.symbols.push({
        id: `${context.filePath}::${className}.${name}`,
        name,
        kind: "property",
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true,
        scope: className
      });
      i++;
      continue;
    }
    const aliasMatch = trimmed.match(/^alias\s+(\w+)\s*[=:]/);
    if (aliasMatch) {
      const name = aliasMatch[1];
      context.symbols.push({
        id: `${context.filePath}::${className}.${name}`,
        name,
        kind: "type_alias",
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true,
        scope: className
      });
      i++;
      continue;
    }
    i++;
  }
  context.currentClass = oldClass;
}
function processCallsInLine(line, lineNum, context) {
  const callRegex = /\b(\w+)\s*(?:\[[^\]]*\]\s*)?\(/g;
  let match;
  const builtins = /* @__PURE__ */ new Set([
    "print",
    "len",
    "range",
    "int",
    "str",
    "float",
    "bool",
    "type",
    "if",
    "elif",
    "while",
    "for",
    "return",
    "raise",
    "assert",
    "fn",
    "def",
    "struct",
    "class",
    "trait",
    "alias",
    "var",
    "let",
    "from",
    "import",
    "inout",
    "owned",
    "borrowed"
  ]);
  while ((match = callRegex.exec(line)) !== null) {
    const name = match[1];
    if (builtins.has(name)) continue;
    if (name.startsWith("_") && name !== "__init__") continue;
    if (context.currentScope.length > 0 || context.currentClass) {
      const callerId = context.currentClass ? `${context.filePath}::${context.currentClass}` : `${context.filePath}::__file__`;
      const targetId = context.imports.get(name) || `${context.filePath}::${name}`;
      context.edges.push({
        source: callerId,
        target: targetId,
        kind: "calls",
        filePath: context.filePath,
        line: lineNum
      });
    }
  }
}
function findBlockEnd(lines, startIdx, baseIndent) {
  let i = startIdx + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= baseIndent) {
      return i;
    }
    i++;
  }
  return i;
}
function parseMojoProject(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  let projectName = basename7(dirname13(join15(projectRoot, filePath)));
  const nameMatch = sourceCode.match(/name\s*=\s*["']([^"']+)["']/);
  if (nameMatch) {
    projectName = nameMatch[1];
  }
  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const depMatch = line.match(/^(\w[\w-]*)\s*=\s*["']([^"']+)["']/);
    if (depMatch) {
      symbols.push({
        id: `${filePath}::dep:${depMatch[1]}`,
        name: depMatch[1],
        kind: "import",
        filePath,
        startLine: i + 1,
        endLine: i + 1,
        exported: false
      });
    }
  }
  return { filePath, symbols, edges };
}
var mojoParser = {
  name: "mojo",
  extensions: [".mojo", ".\u{1F525}", "mojoproject.toml"],
  parseFile: parseMojoFile
};

// src/parser/ruby.ts
import { dirname as dirname14, join as join16, basename as basename8 } from "path";
import { existsSync as existsSync15 } from "fs";
function parseRubyFile(filePath, sourceCode, projectRoot) {
  if (basename8(filePath) === "Gemfile") {
    return parseGemfile(filePath, sourceCode, projectRoot);
  }
  const parser = getParser("ruby");
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentModule: null,
    imports: /* @__PURE__ */ new Map(),
    isGemfile: false
  };
  walkNode13(tree.rootNode, context);
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function walkNode13(node, context) {
  const handled = processNode13(node, context);
  if (handled) return;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode13(child, context);
    }
  }
}
function processNode13(node, context) {
  switch (node.type) {
    case "class":
      processClassDeclaration8(node, context);
      return true;
    case "module":
      processModuleDeclaration(node, context);
      return true;
    case "method":
      processMethodDeclaration5(node, context);
      return true;
    case "singleton_method":
      processSingletonMethod(node, context);
      return true;
    case "assignment":
      processAssignment(node, context);
      return false;
    case "call":
    case "method_call":
      processCallExpression13(node, context);
      return false;
    case "command":
      processCommand(node, context);
      return false;
    case "command_call":
      processCommandCall(node, context);
      return false;
    case "constant":
      return false;
    case "block":
    case "do_block":
      return false;
    case "lambda":
      processLambda(node, context);
      return false;
    default:
      return false;
  }
}
function processClassDeclaration8(node, context) {
  const nameNode = findChildByType13(node, "constant") || findChildByType13(node, "scope_resolution");
  if (!nameNode) return;
  const name = nodeText12(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
  const superclassNode = findChildByType13(node, "superclass");
  if (superclassNode) {
    const superName = nodeText12(superclassNode, context).replace(/^\s*<\s*/, "").trim();
    if (superName) {
      const baseId = resolveSymbol12(superName, context);
      if (baseId) {
        context.edges.push({
          source: symbolId,
          target: baseId,
          kind: "implements",
          filePath: context.filePath,
          line: node.startPosition.row + 1
        });
      }
    }
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType13(node, "body_statement");
  if (body) {
    walkNode13(body, context);
  }
  context.currentScope.pop();
  context.currentClass = oldClass;
}
function processModuleDeclaration(node, context) {
  const nameNode = findChildByType13(node, "constant") || findChildByType13(node, "scope_resolution");
  if (!nameNode) return;
  const name = nodeText12(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "module",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true
  });
  const oldModule = context.currentModule;
  const oldClass = context.currentClass;
  context.currentModule = name;
  context.currentClass = name;
  context.currentScope.push(name);
  const body = findChildByType13(node, "body_statement");
  if (body) {
    walkNode13(body, context);
  }
  context.currentScope.pop();
  context.currentModule = oldModule;
  context.currentClass = oldClass;
}
function processMethodDeclaration5(node, context) {
  const nameNode = findChildByType13(node, "identifier");
  if (!nameNode) return;
  const name = nodeText12(nameNode, context);
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? "method" : "function",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope
  });
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);
  const body = findChildByType13(node, "body_statement");
  if (body) {
    walkNode13(body, context);
  }
  context.currentScope.pop();
}
function processSingletonMethod(node, context) {
  const nameNode = node.childCount > 2 ? node.child(node.childCount - 2) : null;
  let name = "";
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "identifier") {
      name = nodeText12(child, context);
    }
  }
  if (!name) return;
  const scope = context.currentClass || void 0;
  const symbolId = scope ? `${context.filePath}::${scope}.self.${name}` : `${context.filePath}::self.${name}`;
  context.symbols.push({
    id: symbolId,
    name: `self.${name}`,
    kind: "method",
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope
  });
  const scopeName = scope ? `${scope}.self.${name}` : `self.${name}`;
  context.currentScope.push(scopeName);
  const body = findChildByType13(node, "body_statement");
  if (body) {
    walkNode13(body, context);
  }
  context.currentScope.pop();
}
function processAssignment(node, context) {
  const left = node.child(0);
  if (!left) return;
  const text = nodeText12(left, context);
  const scope = context.currentClass || void 0;
  if (left.type === "constant") {
    const symbolId = scope ? `${context.filePath}::${scope}.${text}` : `${context.filePath}::${text}`;
    context.symbols.push({
      id: symbolId,
      name: text,
      kind: "constant",
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: true,
      scope
    });
  }
  if (left.type === "instance_variable") {
    const symbolId = scope ? `${context.filePath}::${scope}.${text}` : `${context.filePath}::${text}`;
    context.symbols.push({
      id: symbolId,
      name: text,
      kind: "property",
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false,
      scope
    });
  }
  if (left.type === "class_variable") {
    const symbolId = scope ? `${context.filePath}::${scope}.${text}` : `${context.filePath}::${text}`;
    context.symbols.push({
      id: symbolId,
      name: text,
      kind: "property",
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false,
      scope
    });
  }
}
function processCallExpression13(node, context) {
  const text = nodeText12(node, context);
  const line = node.startPosition.row + 1;
  const requireMatch = text.match(/^require(?:_relative)?\s*\(?['"]([^'"]+)['"]\)?/);
  if (requireMatch) {
    processRequire(requireMatch[1], text.startsWith("require_relative"), context, line);
    return;
  }
  const mixinMatch = text.match(/^(?:include|extend|prepend)\s+([A-Z]\w*(?:::\w+)*)/);
  if (mixinMatch) {
    processMixin(mixinMatch[1], context, line);
    return;
  }
  const attrMatch = text.match(/^attr_(accessor|reader|writer)\s+(.+)/);
  if (attrMatch) {
    processAttrAccessor(attrMatch[2], context, line);
    return;
  }
  if (context.currentScope.length > 0) {
    const firstChild = node.child(0);
    let calleeName = null;
    if (firstChild && firstChild.type === "identifier") {
      calleeName = nodeText12(firstChild, context);
    }
    if (calleeName && !isBuiltin(calleeName)) {
      const callerId = getCurrentSymbolId13(context);
      if (callerId) {
        const calleeId = resolveSymbol12(calleeName, context);
        if (calleeId) {
          context.edges.push({
            source: callerId,
            target: calleeId,
            kind: "calls",
            filePath: context.filePath,
            line
          });
        }
      }
    }
  }
}
function processCommand(node, context) {
  const text = nodeText12(node, context).trim();
  const line = node.startPosition.row + 1;
  const requireMatch = text.match(/^require(?:_relative)?\s+['"]([^'"]+)['"]/);
  if (requireMatch) {
    processRequire(requireMatch[1], text.startsWith("require_relative"), context, line);
    return;
  }
  const mixinMatch = text.match(/^(?:include|extend|prepend)\s+([A-Z]\w*(?:::\w+)*)/);
  if (mixinMatch) {
    processMixin(mixinMatch[1], context, line);
    return;
  }
  const attrMatch = text.match(/^attr_(accessor|reader|writer)\s+(.+)/);
  if (attrMatch) {
    processAttrAccessor(attrMatch[2], context, line);
    return;
  }
}
function processCommandCall(node, context) {
  const text = nodeText12(node, context).trim();
  if (/Struct\.new/.test(text) || /OpenStruct\.new/.test(text)) {
    const parent = node.parent;
    if (parent && parent.type === "assignment") {
      const left = parent.child(0);
      if (left && left.type === "constant") {
        const name = nodeText12(left, context);
        const symbolId = `${context.filePath}::${name}`;
        context.symbols.push({
          id: symbolId,
          name,
          kind: "class",
          filePath: context.filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: true
        });
      }
    }
  }
}
function processLambda(node, context) {
  const parent = node.parent;
  if (parent && parent.type === "assignment") {
    const left = parent.child(0);
    if (left) {
      const name = nodeText12(left, context);
      const scope = context.currentClass || void 0;
      const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "function",
        filePath: context.filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        exported: true,
        scope
      });
    }
  }
}
function processRequire(path6, isRelative, context, line) {
  const resolvedPath = resolveRubyRequire(path6, isRelative, context.filePath, context.projectRoot);
  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    const targetId = `${resolvedPath}::__file__`;
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "imports",
      filePath: context.filePath,
      line
    });
  }
  const symbolId = `${context.filePath}::require:${path6}`;
  context.symbols.push({
    id: symbolId,
    name: path6,
    kind: "import",
    filePath: context.filePath,
    startLine: line,
    endLine: line,
    exported: false
  });
}
function processMixin(moduleName, context, line) {
  const scope = context.currentClass || void 0;
  const sourceId = scope ? `${context.filePath}::${scope}` : `${context.filePath}::__file__`;
  const targetId = resolveSymbol12(moduleName, context);
  if (targetId) {
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: "implements",
      filePath: context.filePath,
      line
    });
  }
}
function processAttrAccessor(args, context, line) {
  const scope = context.currentClass || void 0;
  const symbols = args.match(/:\w+/g);
  if (!symbols) return;
  for (const sym of symbols) {
    const name = sym.slice(1);
    const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
    context.symbols.push({
      id: symbolId,
      name,
      kind: "property",
      filePath: context.filePath,
      startLine: line,
      endLine: line,
      exported: true,
      scope
    });
  }
}
function parseGemfile(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  symbols.push({
    id: `${filePath}::Gemfile`,
    name: "Gemfile",
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    const gemMatch = line.match(/^\s*gem\s+['"]([^'"]+)['"]/);
    if (gemMatch) {
      const gemName = gemMatch[1];
      symbols.push({
        id: `${filePath}::gem:${gemName}`,
        name: gemName,
        kind: "import",
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false
      });
    }
  }
  return { filePath, symbols, edges };
}
function resolveRubyRequire(requirePath, isRelative, currentFile, projectRoot) {
  const extensions = [".rb", ""];
  if (isRelative) {
    const dir = dirname14(join16(projectRoot, currentFile));
    for (const ext of extensions) {
      const candidate = join16(dir, requirePath + ext);
      if (existsSync15(candidate)) {
        const rel = candidate.replace(projectRoot + "/", "");
        return rel;
      }
    }
  } else {
    const searchRoots = ["lib", "app", "app/models", "app/controllers", "app/services", ""];
    for (const root of searchRoots) {
      for (const ext of extensions) {
        const candidate = root ? join16(projectRoot, root, requirePath + ext) : join16(projectRoot, requirePath + ext);
        if (existsSync15(candidate)) {
          const rel = candidate.replace(projectRoot + "/", "");
          return rel;
        }
      }
    }
  }
  return null;
}
function resolveSymbol12(name, context) {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find((s) => s.id === currentFileId)) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find((s) => s.id === classMethodId)) {
      return classMethodId;
    }
  }
  return null;
}
function isBuiltin(name) {
  const builtins = /* @__PURE__ */ new Set([
    "puts",
    "print",
    "p",
    "pp",
    "warn",
    "raise",
    "fail",
    "require",
    "require_relative",
    "include",
    "extend",
    "prepend",
    "attr_accessor",
    "attr_reader",
    "attr_writer",
    "private",
    "protected",
    "public",
    "new",
    "initialize",
    "super",
    "self",
    "map",
    "each",
    "select",
    "reject",
    "reduce",
    "collect",
    "find",
    "detect",
    "any?",
    "all?",
    "none?",
    "count",
    "freeze",
    "dup",
    "clone",
    "nil?",
    "is_a?",
    "kind_of?",
    "respond_to?",
    "send",
    "class",
    "object_id",
    "to_s",
    "to_i",
    "to_f",
    "to_a",
    "to_h",
    "lambda",
    "proc",
    "block_given?",
    "yield"
  ]);
  return builtins.has(name);
}
function findChildByType13(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}
function nodeText12(node, context) {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}
function getCurrentSymbolId13(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
var rubyParser = {
  name: "ruby",
  extensions: [".rb", ".rake", ".gemspec", "Gemfile"],
  parseFile: parseRubyFile
};

// src/parser/dart.ts
import { dirname as dirname15, join as join17, basename as basename9 } from "path";
import { existsSync as existsSync16 } from "fs";
function parseDartFile(filePath, sourceCode, projectRoot) {
  if (basename9(filePath) === "pubspec.yaml") {
    return parsePubspec(filePath, sourceCode, projectRoot);
  }
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    imports: /* @__PURE__ */ new Map()
  };
  const lines = sourceCode.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("///")) {
      continue;
    }
    processDirectives(trimmed, lineNum, context);
    processClassDeclaration9(trimmed, lineNum, context, lines, i);
    processMixinDeclaration(trimmed, lineNum, context, lines, i);
    processExtensionDeclaration(trimmed, lineNum, context, lines, i);
    processEnumDeclaration5(trimmed, lineNum, context, lines, i);
    processFunctionDeclaration6(trimmed, lineNum, context);
    processTopLevelVariable(trimmed, lineNum, context);
    processCallEdges(trimmed, lineNum, context);
    processTypedef(trimmed, lineNum, context);
  }
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function processDirectives(line, lineNum, context) {
  const importMatch = line.match(/^import\s+['"]([^'"]+)['"]\s*(?:as\s+(\w+))?\s*(?:show|hide)?/);
  if (importMatch) {
    const importPath = importMatch[1];
    const alias = importMatch[2];
    const symbolId = `${context.filePath}::import:${importPath}`;
    context.symbols.push({
      id: symbolId,
      name: importPath,
      kind: "import",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: false
    });
    if (!importPath.startsWith("package:") && !importPath.startsWith("dart:")) {
      const resolvedPath = resolveDartImport(importPath, context.filePath, context.projectRoot);
      if (resolvedPath) {
        context.edges.push({
          source: `${context.filePath}::__file__`,
          target: `${resolvedPath}::__file__`,
          kind: "imports",
          filePath: context.filePath,
          line: lineNum
        });
      }
    }
    if (alias) {
      context.imports.set(alias, importPath);
    }
    return;
  }
  const exportMatch = line.match(/^export\s+['"]([^'"]+)['"]/);
  if (exportMatch) {
    const exportPath = exportMatch[1];
    context.symbols.push({
      id: `${context.filePath}::export:${exportPath}`,
      name: exportPath,
      kind: "import",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true
    });
    if (!exportPath.startsWith("package:") && !exportPath.startsWith("dart:")) {
      const resolvedPath = resolveDartImport(exportPath, context.filePath, context.projectRoot);
      if (resolvedPath) {
        context.edges.push({
          source: `${context.filePath}::__file__`,
          target: `${resolvedPath}::__file__`,
          kind: "imports",
          filePath: context.filePath,
          line: lineNum
        });
      }
    }
    return;
  }
  const partMatch = line.match(/^part\s+['"]([^'"]+)['"]/);
  if (partMatch) {
    const partPath = partMatch[1];
    context.symbols.push({
      id: `${context.filePath}::part:${partPath}`,
      name: partPath,
      kind: "import",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: false
    });
    const resolvedPath = resolveDartImport(partPath, context.filePath, context.projectRoot);
    if (resolvedPath) {
      context.edges.push({
        source: `${context.filePath}::__file__`,
        target: `${resolvedPath}::__file__`,
        kind: "imports",
        filePath: context.filePath,
        line: lineNum
      });
    }
    return;
  }
  const partOfMatch = line.match(/^part\s+of\s+(?:['"]([^'"]+)['"]|(\w+))/);
  if (partOfMatch) {
    const partOfTarget = partOfMatch[1] || partOfMatch[2];
    context.symbols.push({
      id: `${context.filePath}::partOf:${partOfTarget}`,
      name: partOfTarget,
      kind: "import",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: false
    });
    return;
  }
  const libraryMatch = line.match(/^library\s+(\w[\w.]*)\s*;/);
  if (libraryMatch) {
    context.symbols.push({
      id: `${context.filePath}::library:${libraryMatch[1]}`,
      name: libraryMatch[1],
      kind: "module",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true
    });
    return;
  }
}
function processClassDeclaration9(line, lineNum, context, lines, idx) {
  const classMatch = line.match(
    /^(?:abstract\s+|sealed\s+|base\s+|final\s+|interface\s+)*class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+(\w+))?(?:\s+with\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?/
  );
  if (!classMatch) return;
  const name = classMatch[1];
  const superclass = classMatch[2];
  const mixins = classMatch[3];
  const interfaces = classMatch[4];
  const symbolId = `${context.filePath}::${name}`;
  const endLine = findBlockEnd2(lines, idx);
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine: lineNum,
    endLine: endLine + 1,
    exported: !name.startsWith("_")
  });
  if (superclass) {
    const targetId = resolveSymbol13(superclass, context);
    if (targetId) {
      context.edges.push({
        source: symbolId,
        target: targetId,
        kind: "implements",
        filePath: context.filePath,
        line: lineNum
      });
    }
  }
  if (mixins) {
    const mixinNames = mixins.split(",").map((m) => m.trim()).filter(Boolean);
    for (const m of mixinNames) {
      const cleanName = m.replace(/<[^>]*>/, "").trim();
      if (cleanName) {
        const targetId = resolveSymbol13(cleanName, context);
        if (targetId) {
          context.edges.push({
            source: symbolId,
            target: targetId,
            kind: "implements",
            filePath: context.filePath,
            line: lineNum
          });
        }
      }
    }
  }
  if (interfaces) {
    const ifaceNames = interfaces.split(",").map((m) => m.trim()).filter(Boolean);
    for (const iface of ifaceNames) {
      const cleanName = iface.replace(/<[^>]*>/, "").trim();
      if (cleanName) {
        const targetId = resolveSymbol13(cleanName, context);
        if (targetId) {
          context.edges.push({
            source: symbolId,
            target: targetId,
            kind: "implements",
            filePath: context.filePath,
            line: lineNum
          });
        }
      }
    }
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  processClassBody(lines, idx, endLine, context);
  context.currentClass = oldClass;
}
function processMixinDeclaration(line, lineNum, context, lines, idx) {
  const mixinMatch = line.match(/^mixin\s+(\w+)(?:<[^>]*>)?(?:\s+on\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?/);
  if (!mixinMatch) return;
  if (/^mixin\s+class\s/.test(line)) return;
  const name = mixinMatch[1];
  const onConstraints = mixinMatch[2];
  const symbolId = `${context.filePath}::${name}`;
  const endLine = findBlockEnd2(lines, idx);
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine: lineNum,
    endLine: endLine + 1,
    exported: !name.startsWith("_")
  });
  if (onConstraints) {
    const constraints = onConstraints.split(",").map((c) => c.trim()).filter(Boolean);
    for (const c of constraints) {
      const cleanName = c.replace(/<[^>]*>/, "").trim();
      if (cleanName) {
        const targetId = resolveSymbol13(cleanName, context);
        if (targetId) {
          context.edges.push({
            source: symbolId,
            target: targetId,
            kind: "implements",
            filePath: context.filePath,
            line: lineNum
          });
        }
      }
    }
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  processClassBody(lines, idx, endLine, context);
  context.currentClass = oldClass;
}
function processExtensionDeclaration(line, lineNum, context, lines, idx) {
  const extMatch = line.match(/^extension\s+(\w+)(?:<[^>]*>)?\s+on\s+(\w+)/);
  if (!extMatch) return;
  const name = extMatch[1];
  const onType = extMatch[2];
  const symbolId = `${context.filePath}::${name}`;
  const endLine = findBlockEnd2(lines, idx);
  context.symbols.push({
    id: symbolId,
    name,
    kind: "class",
    filePath: context.filePath,
    startLine: lineNum,
    endLine: endLine + 1,
    exported: !name.startsWith("_")
  });
  const targetId = resolveSymbol13(onType, context);
  if (targetId) {
    context.edges.push({
      source: symbolId,
      target: targetId,
      kind: "implements",
      filePath: context.filePath,
      line: lineNum
    });
  }
  const oldClass = context.currentClass;
  context.currentClass = name;
  processClassBody(lines, idx, endLine, context);
  context.currentClass = oldClass;
}
function processEnumDeclaration5(line, lineNum, context, lines, idx) {
  const enumMatch = line.match(/^enum\s+(\w+)(?:<[^>]*>)?(?:\s+with\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?/);
  if (!enumMatch) return;
  const name = enumMatch[1];
  const symbolId = `${context.filePath}::${name}`;
  const endLine = findBlockEnd2(lines, idx);
  context.symbols.push({
    id: symbolId,
    name,
    kind: "enum",
    filePath: context.filePath,
    startLine: lineNum,
    endLine: endLine + 1,
    exported: !name.startsWith("_")
  });
}
function processFunctionDeclaration6(line, lineNum, context) {
  const funcMatch = line.match(
    /^(?:(?:static|external|abstract)\s+)*(?:[\w<>,?\s]+\s+)?(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:async\s*\*?|sync\s*\*?)?\s*(?:\{|=>|;)/
  );
  if (!funcMatch) return;
  const name = funcMatch[1];
  if (["if", "for", "while", "switch", "catch", "return", "class", "enum", "mixin", "extension", "import", "export", "part", "library", "typedef"].includes(name)) {
    return;
  }
  if (context.currentClass) return;
  const symbolId = `${context.filePath}::${name}`;
  context.symbols.push({
    id: symbolId,
    name,
    kind: "function",
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: !name.startsWith("_")
  });
}
function processTopLevelVariable(line, lineNum, context) {
  if (context.currentClass) return;
  const varMatch = line.match(/^(?:const|final|late\s+final|late)\s+(?:[\w<>,?\s]+\s+)?(\w+)\s*=/);
  if (varMatch) {
    const name = varMatch[1];
    if (["if", "for", "while", "return"].includes(name)) return;
    context.symbols.push({
      id: `${context.filePath}::${name}`,
      name,
      kind: "constant",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: !name.startsWith("_")
    });
  }
}
function processTypedef(line, lineNum, context) {
  const typedefMatch = line.match(/^typedef\s+(\w+)(?:<[^>]*>)?\s*=/);
  if (typedefMatch) {
    const name = typedefMatch[1];
    context.symbols.push({
      id: `${context.filePath}::${name}`,
      name,
      kind: "type",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: !name.startsWith("_")
    });
    return;
  }
  const oldTypedefMatch = line.match(/^typedef\s+\w[\w<>,?\s]*\s+(\w+)\s*\(/);
  if (oldTypedefMatch) {
    const name = oldTypedefMatch[1];
    context.symbols.push({
      id: `${context.filePath}::${name}`,
      name,
      kind: "type",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: !name.startsWith("_")
    });
  }
}
function processCallEdges(line, lineNum, context) {
  if (context.currentScope.length === 0) return;
  const callPattern = /\b([A-Z]\w+)\s*\(/g;
  let match;
  while ((match = callPattern.exec(line)) !== null) {
    const callee = match[1];
    if (isBuiltin2(callee)) continue;
    const callerId = getCurrentSymbolId14(context);
    if (!callerId) continue;
    const calleeId = resolveSymbol13(callee, context);
    if (calleeId) {
      context.edges.push({
        source: callerId,
        target: calleeId,
        kind: "calls",
        filePath: context.filePath,
        line: lineNum
      });
    }
  }
}
function processClassBody(lines, startIdx, endIdx, context) {
  for (let i = startIdx + 1; i <= endIdx && i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    if (!line || line.startsWith("//") || line.startsWith("///") || line.startsWith("*")) continue;
    const ctorMatch = line.match(
      new RegExp(`^(?:const\\s+)?${context.currentClass}(?:\\.([\\w]+))?\\s*\\(`)
    );
    if (ctorMatch) {
      const namedCtor = ctorMatch[1];
      const name = namedCtor ? `${context.currentClass}.${namedCtor}` : context.currentClass;
      const symbolId = `${context.filePath}::${context.currentClass}.${namedCtor || "constructor"}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "method",
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith("_"),
        scope: context.currentClass || void 0
      });
      continue;
    }
    const factoryMatch = line.match(
      new RegExp(`^factory\\s+${context.currentClass}(?:\\.(\\w+))?\\s*\\(`)
    );
    if (factoryMatch) {
      const namedFactory = factoryMatch[1];
      const name = namedFactory ? `${context.currentClass}.${namedFactory}` : `${context.currentClass}.factory`;
      const symbolId = `${context.filePath}::${context.currentClass}.${namedFactory || "factory"}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "method",
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith("_"),
        scope: context.currentClass || void 0
      });
      continue;
    }
    const methodMatch = line.match(
      /^(?:(?:static|@override|@protected|@visibleForTesting)\s+)*(?:[\w<>,?\s]+\s+)?(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:async\s*\*?|sync\s*\*?)?\s*(?:\{|=>|;)/
    );
    if (methodMatch) {
      const name = methodMatch[1];
      if (["if", "for", "while", "switch", "catch", "return", "class", "super"].includes(name)) continue;
      const symbolId = `${context.filePath}::${context.currentClass}.${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "method",
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith("_"),
        scope: context.currentClass || void 0
      });
      continue;
    }
    const getSetMatch = line.match(/^(?:static\s+)?(?:[\w<>,?\s]+\s+)?(?:get|set)\s+(\w+)/);
    if (getSetMatch) {
      const name = getSetMatch[1];
      const symbolId = `${context.filePath}::${context.currentClass}.${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "property",
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith("_"),
        scope: context.currentClass || void 0
      });
      continue;
    }
    const fieldMatch = line.match(/^(?:(?:static|final|const|late)\s+)+(?:[\w<>,?\s]+\s+)?(\w+)\s*[;=]/);
    if (fieldMatch) {
      const name = fieldMatch[1];
      if (["if", "for", "while", "return"].includes(name)) continue;
      const symbolId = `${context.filePath}::${context.currentClass}.${name}`;
      context.symbols.push({
        id: symbolId,
        name,
        kind: "property",
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith("_"),
        scope: context.currentClass || void 0
      });
    }
  }
}
function parsePubspec(filePath, sourceCode, projectRoot) {
  const symbols = [];
  const edges = [];
  const lines = sourceCode.split("\n");
  const nameMatch = sourceCode.match(/^name:\s*(\w+)/m);
  const projectName = nameMatch ? nameMatch[1] : "pubspec";
  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: "module",
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true
  });
  let inDependencies = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    if (/^(?:dependencies|dev_dependencies|dependency_overrides)\s*:/.test(line)) {
      inDependencies = true;
      continue;
    }
    if (inDependencies && /^\S/.test(line)) {
      inDependencies = false;
    }
    if (inDependencies) {
      const depMatch = line.match(/^\s{2}(\w[\w_-]*):/);
      if (depMatch) {
        symbols.push({
          id: `${filePath}::dep:${depMatch[1]}`,
          name: depMatch[1],
          kind: "import",
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          exported: false
        });
      }
    }
  }
  return { filePath, symbols, edges };
}
function resolveDartImport(importPath, currentFile, projectRoot) {
  const dir = dirname15(join17(projectRoot, currentFile));
  const candidate = join17(dir, importPath);
  if (existsSync16(candidate)) {
    return candidate.replace(projectRoot + "/", "");
  }
  const libCandidate = join17(projectRoot, "lib", importPath);
  if (existsSync16(libCandidate)) {
    return libCandidate.replace(projectRoot + "/", "");
  }
  return null;
}
function resolveSymbol13(name, context) {
  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find((s) => s.id === currentFileId)) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find((s) => s.id === classMethodId)) {
      return classMethodId;
    }
  }
  return null;
}
function findBlockEnd2(lines, startIdx) {
  let braceCount = 0;
  let foundOpen = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") {
        braceCount++;
        foundOpen = true;
      }
      if (ch === "}") {
        braceCount--;
      }
      if (foundOpen && braceCount === 0) return i;
    }
  }
  return Math.min(startIdx + 50, lines.length - 1);
}
function getCurrentSymbolId14(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
function isBuiltin2(name) {
  const builtins = /* @__PURE__ */ new Set([
    "String",
    "int",
    "double",
    "bool",
    "List",
    "Map",
    "Set",
    "Future",
    "Stream",
    "Object",
    "dynamic",
    "void",
    "Null",
    "Type",
    "Symbol",
    "Function",
    "Iterable",
    "Iterator",
    "Duration",
    "DateTime",
    "RegExp",
    "Error",
    "Exception",
    "Override",
    "Deprecated"
  ]);
  return builtins.has(name);
}
var dartParser = {
  name: "dart",
  extensions: [".dart", "pubspec.yaml"],
  parseFile: parseDartFile
};

// src/parser/r.ts
import { dirname as dirname16, join as join18 } from "path";
import { existsSync as existsSync17 } from "fs";
function parseRFile(filePath, sourceCode, projectRoot) {
  const context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    imports: /* @__PURE__ */ new Map()
  };
  const isRmd = filePath.endsWith(".Rmd") || filePath.endsWith(".rmd");
  const codeToparse = isRmd ? extractRmdChunks(sourceCode) : sourceCode;
  const lines = codeToparse.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    processLibraryStatements(trimmed, lineNum, context);
    processSourceStatements(trimmed, lineNum, context);
    processS4Definitions(trimmed, lineNum, context);
    processR6Definitions(trimmed, lineNum, context);
    processLeftAssignFunction(trimmed, lineNum, context);
    processRightAssignFunction(trimmed, lineNum, context);
    processAnonymousFunction(trimmed, lineNum, context);
    processNamespaceAccess(trimmed, lineNum, context);
    processCallEdges2(trimmed, lineNum, context);
  }
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges
  };
}
function extractRmdChunks(source) {
  const lines = source.split("\n");
  const result = [];
  let inChunk = false;
  for (const line of lines) {
    if (!inChunk && /^```\{r/.test(line.trim())) {
      inChunk = true;
      result.push("");
    } else if (inChunk && /^```\s*$/.test(line.trim())) {
      inChunk = false;
      result.push("");
    } else if (inChunk) {
      result.push(line);
    } else {
      result.push("");
    }
  }
  return result.join("\n");
}
function processLibraryStatements(line, lineNum, context) {
  const libMatch = line.match(/^(?:library|require)\s*\(\s*["']?([\w.]+)["']?/);
  if (!libMatch) return;
  const pkgName = libMatch[1];
  const symbolId = `${context.filePath}::import:${pkgName}`;
  context.symbols.push({
    id: symbolId,
    name: pkgName,
    kind: "import",
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: false
  });
  context.imports.set(pkgName, pkgName);
}
function processSourceStatements(line, lineNum, context) {
  const sourceMatch = line.match(/^source\s*\(\s*["']([^'"]+)["']/);
  if (!sourceMatch) return;
  const sourcePath = sourceMatch[1];
  const symbolId = `${context.filePath}::source:${sourcePath}`;
  context.symbols.push({
    id: symbolId,
    name: sourcePath,
    kind: "import",
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: false
  });
  const resolvedPath = resolveRSource(sourcePath, context.filePath, context.projectRoot);
  if (resolvedPath) {
    context.edges.push({
      source: `${context.filePath}::__file__`,
      target: `${resolvedPath}::__file__`,
      kind: "imports",
      filePath: context.filePath,
      line: lineNum
    });
  }
}
function processS4Definitions(line, lineNum, context) {
  const setClassMatch = line.match(/^(?:\w+\s*(?:<-|=)\s*)?setClass\s*\(\s*["'](\w[\w.]*)["']/);
  if (setClassMatch) {
    const name = setClassMatch[1];
    const symbolId = `${context.filePath}::${name}`;
    context.symbols.push({
      id: symbolId,
      name,
      kind: "class",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true
    });
    return;
  }
  const setGenericMatch = line.match(/^(?:\w+\s*(?:<-|=)\s*)?setGeneric\s*\(\s*["'](\w[\w.]*)["']/);
  if (setGenericMatch) {
    const name = setGenericMatch[1];
    const symbolId = `${context.filePath}::${name}`;
    context.symbols.push({
      id: symbolId,
      name,
      kind: "function",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true
    });
    return;
  }
  const setMethodMatch = line.match(/^(?:\w+\s*(?:<-|=)\s*)?setMethod\s*\(\s*["'](\w[\w.]*)["']\s*,\s*["'](\w[\w.]*)["']/);
  if (setMethodMatch) {
    const genericName = setMethodMatch[1];
    const className = setMethodMatch[2];
    const name = `${genericName}.${className}`;
    const symbolId = `${context.filePath}::${name}`;
    context.symbols.push({
      id: symbolId,
      name,
      kind: "method",
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true,
      scope: className
    });
    const classId = `${context.filePath}::${className}`;
    if (context.symbols.find((s) => s.id === classId)) {
      context.edges.push({
        source: symbolId,
        target: classId,
        kind: "references",
        filePath: context.filePath,
        line: lineNum
      });
    }
    return;
  }
}
function processR6Definitions(line, lineNum, context) {
  const r6Match = line.match(/^(\w[\w.]*)\s*(?:<-|=)\s*(?:R6::)?R6Class\s*\(\s*(?:["'](\w[\w.]*)["'])?/);
  if (!r6Match) return;
  const assignedName = r6Match[1];
  const className = r6Match[2] || assignedName;
  const symbolId = `${context.filePath}::${className}`;
  context.symbols.push({
    id: symbolId,
    name: className,
    kind: "class",
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: !assignedName.startsWith(".")
  });
}
function processLeftAssignFunction(line, lineNum, context) {
  const funcMatch = line.match(
    /^`?([A-Za-z._][A-Za-z0-9._]*(?:\.[A-Za-z][A-Za-z0-9._]*)*|[+\-*\/^!<>=&|]+\.[A-Za-z][A-Za-z0-9._]*)`?\s*(?:<-|=)\s*(?:function|\\\()/
  );
  if (!funcMatch) return;
  const rawName = funcMatch[1];
  registerFunction(rawName, lineNum, context);
}
function processRightAssignFunction(line, lineNum, context) {
  const rightMatch = line.match(
    /(?:function|\\\()\s*\([^)]*\).*->\s*`?([A-Za-z._][A-Za-z0-9._]*)`?\s*$/
  );
  if (!rightMatch) return;
  const rawName = rightMatch[1];
  registerFunction(rawName, lineNum, context);
}
function processAnonymousFunction(line, lineNum, context) {
  if (/(?:<-|=)\s*(?:function|\\\()/.test(line)) return;
  if (/(?:function|\\\().*->/.test(line)) return;
  const anonMatch = line.match(/(?:function|\\\()\s*\([^)]*\)/);
  if (!anonMatch) return;
  const symbolId = `${context.filePath}::__anon__:${lineNum}`;
  context.symbols.push({
    id: symbolId,
    name: `<anonymous:${lineNum}>`,
    kind: "function",
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: false
  });
}
function processNamespaceAccess(line, lineNum, context) {
  const nsPattern = /\b([\w.]+):::([\w.]+)\b|\b([\w.]+)::([\w.]+)\b/g;
  let match;
  while ((match = nsPattern.exec(line)) !== null) {
    const pkg = match[1] || match[3];
    const fn = match[2] || match[4];
    if (/(?:R6Class|setClass|setGeneric|setMethod)/.test(fn)) continue;
    const targetId = `${pkg}::${fn}`;
    const callerId = getCurrentSymbolId15(context);
    if (!context.imports.has(pkg)) {
      context.imports.set(pkg, pkg);
      context.symbols.push({
        id: `${context.filePath}::import:${pkg}`,
        name: pkg,
        kind: "import",
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false
      });
    }
    if (callerId) {
      context.edges.push({
        source: callerId,
        target: targetId,
        kind: "calls",
        filePath: context.filePath,
        line: lineNum
      });
    }
  }
}
function processCallEdges2(line, lineNum, context) {
  if (context.currentScope.length === 0) return;
  const callPattern = /\b([A-Za-z._][A-Za-z0-9._]*)\s*\(/g;
  let match;
  while ((match = callPattern.exec(line)) !== null) {
    const callee = match[1];
    if (isRBuiltin(callee)) continue;
    if (new RegExp(`[\\w.]+:::?${callee}\\s*\\(`).test(line)) continue;
    const callerId = getCurrentSymbolId15(context);
    if (!callerId) continue;
    const calleeId = resolveSymbol14(callee, context);
    if (calleeId) {
      context.edges.push({
        source: callerId,
        target: calleeId,
        kind: "calls",
        filePath: context.filePath,
        line: lineNum
      });
    }
  }
}
function registerFunction(rawName, lineNum, context) {
  const symbolId = `${context.filePath}::${rawName}`;
  const operatorOverloadMatch = rawName.match(/^([+\-*\/^!<>=&|]+)\.(.+)$/);
  const s3DotIdx = !operatorOverloadMatch ? rawName.indexOf(".") : -1;
  const isS3Method = s3DotIdx > 0;
  const isOperatorOverload = operatorOverloadMatch !== null;
  let kind = "function";
  let scope;
  if (isOperatorOverload) {
    scope = operatorOverloadMatch[2];
    kind = "method";
  } else if (isS3Method) {
    scope = rawName.slice(s3DotIdx + 1);
    kind = "method";
  }
  context.symbols.push({
    id: symbolId,
    name: rawName,
    kind,
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: !rawName.startsWith("."),
    ...scope !== void 0 ? { scope } : {}
  });
  context.currentScope.push(rawName);
}
function resolveRSource(sourcePath, currentFile, projectRoot) {
  const dir = dirname16(join18(projectRoot, currentFile));
  const candidate = join18(dir, sourcePath);
  if (existsSync17(candidate)) {
    return candidate.replace(projectRoot + "/", "");
  }
  const rootCandidate = join18(projectRoot, sourcePath);
  if (existsSync17(rootCandidate)) {
    return rootCandidate.replace(projectRoot + "/", "");
  }
  return null;
}
function resolveSymbol14(name, context) {
  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find((s) => s.id === currentFileId)) {
    return currentFileId;
  }
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find((s) => s.id === classMethodId)) {
      return classMethodId;
    }
  }
  return null;
}
function getCurrentSymbolId15(context) {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}
function isRBuiltin(name) {
  const builtins = /* @__PURE__ */ new Set([
    // Core language
    "c",
    "list",
    "vector",
    "matrix",
    "array",
    "data.frame",
    "tibble",
    "function",
    "return",
    "if",
    "else",
    "for",
    "while",
    "repeat",
    "break",
    "next",
    "TRUE",
    "FALSE",
    "NULL",
    "NA",
    "Inf",
    "NaN",
    // Common base functions
    "print",
    "cat",
    "message",
    "warning",
    "stop",
    "tryCatch",
    "try",
    "paste",
    "paste0",
    "sprintf",
    "format",
    "formatC",
    "length",
    "nrow",
    "ncol",
    "dim",
    "names",
    "colnames",
    "rownames",
    "str",
    "summary",
    "head",
    "tail",
    "class",
    "inherits",
    "is",
    "as",
    "lapply",
    "sapply",
    "vapply",
    "tapply",
    "mapply",
    "Map",
    "Reduce",
    "Filter",
    "apply",
    "rapply",
    "which",
    "any",
    "all",
    "sum",
    "prod",
    "min",
    "max",
    "range",
    "mean",
    "median",
    "var",
    "sd",
    "cor",
    "cov",
    "seq",
    "seq_len",
    "seq_along",
    "rep",
    "rev",
    "sort",
    "order",
    "rank",
    "match",
    "pmatch",
    "charmatch",
    "%in%",
    "unique",
    "duplicated",
    "table",
    "tabulate",
    "merge",
    "rbind",
    "cbind",
    "subset",
    "which",
    "grep",
    "grepl",
    "sub",
    "gsub",
    "regexpr",
    "regmatches",
    "strsplit",
    "toupper",
    "tolower",
    "trimws",
    "nchar",
    "substr",
    "substring",
    "is.na",
    "is.null",
    "is.numeric",
    "is.character",
    "is.logical",
    "is.list",
    "is.data.frame",
    "is.vector",
    "is.matrix",
    "is.array",
    "is.factor",
    "as.numeric",
    "as.character",
    "as.logical",
    "as.integer",
    "as.factor",
    "as.data.frame",
    "as.list",
    "as.vector",
    "as.matrix",
    "numeric",
    "character",
    "logical",
    "integer",
    "complex",
    "Sys.time",
    "Sys.Date",
    "Sys.getenv",
    "Sys.setenv",
    "file.exists",
    "readLines",
    "writeLines",
    "readRDS",
    "saveRDS",
    "read.csv",
    "write.csv",
    "read.table",
    "write.table",
    "setwd",
    "getwd",
    "list.files",
    "dir",
    "library",
    "require",
    "source",
    "install.packages",
    "setClass",
    "setGeneric",
    "setMethod",
    "new",
    "R6Class",
    "environment",
    "new.env",
    "parent.env",
    "local",
    "eval",
    "parse",
    "quote",
    "bquote",
    "substitute",
    "deparse",
    "trunc",
    "round",
    "floor",
    "ceiling",
    "abs",
    "sqrt",
    "exp",
    "log",
    "log2",
    "log10",
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "atan2"
  ]);
  return builtins.has(name);
}
var rParser = {
  name: "r",
  extensions: [".R", ".r", ".Rmd", ".rmd"],
  parseFile: parseRFile
};

// src/parser/html.ts
import { basename as basename11 } from "path";
var HTML_TAG_DENYLIST = /* @__PURE__ */ new Set([
  "div",
  "span",
  "button",
  "input",
  "form",
  "table",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
  "a",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "li",
  "ol",
  "img",
  "label",
  "select",
  "option",
  "textarea",
  "nav",
  "section",
  "header",
  "footer",
  "main",
  "article"
]);
var ANGULAR_BUILTIN_DENYLIST = /* @__PURE__ */ new Set([
  "ngIf",
  "ngFor",
  "ngSwitch",
  "ngClass",
  "ngStyle",
  "ngModel",
  "ngSubmit",
  "routerLink",
  "async",
  "json",
  "date",
  "currency",
  "percent",
  "uppercase",
  "lowercase",
  "slice",
  "keyvalue"
]);
function parseHtmlTemplate(content, filePath) {
  const references = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (type, name, line) => {
    const key = `${type}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push({ type, name, line });
  };
  const lines = content.split(/\r?\n/);
  const componentRe = /<([a-z][a-z0-9]*-[a-z0-9-]*)\b/g;
  const structuralRe = /\*([a-zA-Z][a-zA-Z0-9]*)/g;
  const pipeRe = /(?<!\|)\|(?!\|)\s*([a-zA-Z][a-zA-Z0-9]*)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    let m;
    componentRe.lastIndex = 0;
    while ((m = componentRe.exec(line)) !== null) {
      const name = m[1];
      if (HTML_TAG_DENYLIST.has(name)) continue;
      add("component", name, lineNo);
    }
    structuralRe.lastIndex = 0;
    while ((m = structuralRe.exec(line)) !== null) {
      const name = m[1];
      if (ANGULAR_BUILTIN_DENYLIST.has(name)) continue;
      add("directive", name, lineNo);
    }
    pipeRe.lastIndex = 0;
    while ((m = pipeRe.exec(line)) !== null) {
      const name = m[1];
      if (ANGULAR_BUILTIN_DENYLIST.has(name)) continue;
      add("pipe", name, lineNo);
    }
  }
  return { filePath, references };
}
function parseHtmlFile(filePath, content, _projectRoot) {
  const { references } = parseHtmlTemplate(content, filePath);
  const lineCount = content.length === 0 ? 1 : content.split(/\r?\n/).length;
  return {
    filePath,
    symbols: [
      {
        id: `${filePath}::__template__`,
        name: basename11(filePath),
        kind: "template",
        filePath,
        startLine: 1,
        endLine: lineCount,
        exported: false,
        metadata: { references }
      }
    ],
    edges: []
  };
}
var htmlParser = {
  name: "html",
  extensions: [".html"],
  parseFile: parseHtmlFile
};

// src/parser/detect.ts
var parsers = [
  typescriptParser,
  pythonParser,
  javascriptParser,
  goParser,
  rustParser,
  cParser,
  csharpParser,
  javaParser,
  cppParser,
  kotlinParser,
  phpParser,
  swiftParser,
  mojoParser,
  rubyParser,
  dartParser,
  rParser,
  htmlParser
];
var CPP_KEYWORDS = /\b(?:class|namespace|template|public:|private:|protected:|virtual|nullptr|constexpr|auto\s+\w+\s*=|using\s+\w+\s*=|static_cast|dynamic_cast|reinterpret_cast|const_cast|noexcept|override|final|decltype|concept|requires|co_await|co_yield|co_return|std::)\b/;
function getParserForFile(filePath, content) {
  const ext = extname12(filePath).toLowerCase();
  const fileName = basename12(filePath);
  if (ext === ".h" && content) {
    if (CPP_KEYWORDS.test(content)) {
      return cppParser;
    }
    return cParser;
  }
  if (ext === ".h") {
    return cParser;
  }
  return parsers.find((p) => p.extensions.includes(ext) || p.extensions.includes(fileName)) || null;
}
function getSupportedExtensions() {
  return parsers.flatMap((p) => p.extensions);
}

// src/parser/index.ts
import { minimatch } from "minimatch";

// src/parser/jvm-modules.ts
import { join as join19, resolve as resolve12, dirname as dirname17 } from "path";
import { existsSync as existsSync18, readFileSync as readFileSync13 } from "fs";
var MAX_RECURSION_DEPTH = 10;
function discoverJvmModuleRoots(projectRoot) {
  const roots = [];
  const verifiedRootSet3 = /* @__PURE__ */ new Set();
  const rootPom = join19(projectRoot, "pom.xml");
  if (existsSync18(rootPom)) {
    const mavenModules = discoverMavenModules(projectRoot, "pom.xml", /* @__PURE__ */ new Set(), 0);
    for (const modulePath of mavenModules) {
      addSourceRootsForModule(projectRoot, modulePath, roots, verifiedRootSet3, "java");
    }
  }
  const gradleModules = discoverGradleModules(projectRoot);
  for (const modulePath of gradleModules) {
    addSourceRootsForModule(projectRoot, modulePath, roots, verifiedRootSet3, "kotlin");
  }
  return { roots, verifiedRootSet: verifiedRootSet3 };
}
function discoverMavenModules(projectRoot, pomRelativePath, visited, depth) {
  if (depth > MAX_RECURSION_DEPTH) return [];
  const normalizedPath = resolve12(projectRoot, pomRelativePath);
  if (visited.has(normalizedPath)) return [];
  visited.add(normalizedPath);
  let content;
  try {
    content = readFileSync13(normalizedPath, "utf-8");
  } catch {
    return [];
  }
  const modules = [];
  const pomDir = dirname17(pomRelativePath);
  const moduleRegex = /<module>([^<]+)<\/module>/g;
  let match;
  while ((match = moduleRegex.exec(content)) !== null) {
    const moduleName = match[1].trim();
    const modulePath = pomDir === "." ? moduleName : join19(pomDir, moduleName);
    if (existsSync18(join19(projectRoot, modulePath))) {
      modules.push(modulePath);
      const childPom = join19(modulePath, "pom.xml");
      if (existsSync18(join19(projectRoot, childPom))) {
        const childModules = discoverMavenModules(projectRoot, childPom, visited, depth + 1);
        modules.push(...childModules);
      }
    }
  }
  return modules;
}
function discoverGradleModules(projectRoot) {
  const settingsFiles = ["settings.gradle.kts", "settings.gradle"];
  let settingsContent = null;
  for (const settingsFile of settingsFiles) {
    const fullPath = join19(projectRoot, settingsFile);
    if (existsSync18(fullPath)) {
      try {
        settingsContent = readFileSync13(fullPath, "utf-8");
      } catch {
        continue;
      }
      break;
    }
  }
  if (!settingsContent) return [];
  const modules = [];
  const includeRegex = /['"]:?([^'"]+)['"]/g;
  let match;
  while ((match = includeRegex.exec(settingsContent)) !== null) {
    const moduleName = match[1];
    const modulePath = moduleName.replace(/:/g, "/");
    if (existsSync18(join19(projectRoot, modulePath))) {
      modules.push(modulePath);
    }
  }
  return modules;
}
function addSourceRootsForModule(projectRoot, modulePath, roots, verifiedRootSet3, primaryLanguage) {
  const suffixes = [
    "src/main/java",
    "src/main/kotlin",
    "src/test/java",
    "src/test/kotlin",
    "src",
    // Non-standard but common (e.g., google/guice uses core/src/)
    "test"
    // Non-standard test root (e.g., google/guice uses core/test/)
  ];
  for (const suffix of suffixes) {
    const relativeRoot = join19(modulePath, suffix);
    const absoluteRoot = join19(projectRoot, relativeRoot);
    if (existsSync18(absoluteRoot)) {
      if (!verifiedRootSet3.has(absoluteRoot)) {
        roots.push(relativeRoot);
        verifiedRootSet3.add(absoluteRoot);
      }
    }
  }
}

// src/parser/index.ts
var MAX_FILE_SIZE = 1e6;
function shouldParseFile(fullPath) {
  try {
    const stats = statSync10(fullPath);
    if (stats.size > MAX_FILE_SIZE) {
      console.error(`[Parser] Skipping ${fullPath} \u2014 file too large (${(stats.size / 1024).toFixed(0)}KB)`);
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}
async function parseProject(projectRoot, options) {
  await initParser();
  resetModuleSourceRoots();
  resetModuleSourceRoots2();
  const jvmModules = discoverJvmModuleRoots(projectRoot);
  if (jvmModules.roots.length > 0) {
    setModuleSourceRoots(jvmModules.roots, jvmModules.verifiedRootSet);
    setModuleSourceRoots2(jvmModules.roots, jvmModules.verifiedRootSet);
    if (options?.verbose) {
      console.error(`[Parser] Discovered ${jvmModules.roots.length} JVM module source roots`);
    }
  }
  const files = scanDirectory(projectRoot);
  const parsedFiles = [];
  let skippedFiles = 0;
  let errorFiles = 0;
  const useCache = options?.useCache !== false;
  let cacheDb = null;
  let cachedMap = /* @__PURE__ */ new Map();
  const newlyParsed = [];
  if (useCache) {
    try {
      cacheDb = openCache(projectRoot);
    } catch (err) {
      console.error(`[Parser] Cache disabled (open failed): ${err instanceof Error ? err.message : err}`);
      cacheDb = null;
    }
    if (cacheDb) {
      cachedMap = getCachedFiles(cacheDb, projectRoot, files);
    } else {
      console.error("[Parser] Cache unavailable \u2014 full parse mode");
    }
  }
  for (const file of files) {
    try {
      const fullPath = join20(projectRoot, file);
      if (!resolve13(fullPath).startsWith(resolve13(projectRoot))) {
        skippedFiles++;
        continue;
      }
      if (options?.exclude) {
        const shouldExclude2 = options.exclude.some(
          (pattern) => minimatch(file, pattern, { matchBase: true })
        );
        if (shouldExclude2) {
          if (options.verbose) {
            console.error(`[Parser] Excluded: ${file}`);
          }
          skippedFiles++;
          continue;
        }
      }
      if (!shouldParseFile(fullPath)) {
        skippedFiles++;
        continue;
      }
      const cached = cachedMap.get(file);
      if (cached) {
        parsedFiles.push(cached);
        continue;
      }
      if (options?.verbose) {
        console.error(`[Parser] Parsing: ${file}`);
      }
      const sourceCode = readFileSync14(fullPath, "utf-8");
      const parser = getParserForFile(file, sourceCode);
      if (!parser) {
        console.error(`No parser found for file: ${file}`);
        skippedFiles++;
        continue;
      }
      const parsed = parser.parseFile(file, sourceCode, projectRoot);
      parsedFiles.push(parsed);
      newlyParsed.push(parsed);
    } catch (err) {
      errorFiles++;
      console.error(`Error parsing file ${file}:`, err instanceof Error ? err.message : err);
    }
  }
  if (cacheDb) {
    try {
      updateCache(cacheDb, projectRoot, newlyParsed);
    } catch (err) {
      console.error(`[Parser] Cache update failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      try {
        cacheDb.close();
      } catch {
      }
    }
    console.error(`[Parser] Cache: ${parsedFiles.length - newlyParsed.length} hits, ${newlyParsed.length} files re-parsed`);
  }
  pairTemplatesWithComponents(parsedFiles);
  if (options?.verbose || errorFiles > 0) {
    console.error(`
[Parser] Summary:`);
    console.error(`  Parsed: ${parsedFiles.length} files`);
    if (skippedFiles > 0) {
      console.error(`  Skipped: ${skippedFiles} files`);
    }
    if (errorFiles > 0) {
      console.error(`  Errors: ${errorFiles} files`);
    }
  }
  return parsedFiles;
}
function pairTemplatesWithComponents(parsedFiles) {
  const selectorIndex = /* @__PURE__ */ new Map();
  for (const file of parsedFiles) {
    for (const symbol of file.symbols) {
      const selector = symbol.metadata?.angularSelector;
      if (typeof selector === "string" && selector.length > 0) {
        for (const part of selector.split(",")) {
          const key = part.trim();
          if (key && !selectorIndex.has(key)) {
            selectorIndex.set(key, symbol.id);
          }
        }
      }
    }
  }
  const byPath = /* @__PURE__ */ new Map();
  for (const file of parsedFiles) byPath.set(file.filePath, file);
  for (const file of parsedFiles) {
    if (!/\.component\.html$/.test(file.filePath)) continue;
    const templateSymbol = file.symbols.find((s) => s.id.endsWith("::__template__"));
    if (!templateSymbol) continue;
    const templateId = templateSymbol.id;
    const tsPath = file.filePath.replace(/\.component\.html$/, ".component.ts");
    const tsFile = byPath.get(tsPath);
    if (tsFile) {
      const classSymbol = tsFile.symbols.find((s) => s.kind === "class" && s.metadata?.angularSelector) || tsFile.symbols.find((s) => s.kind === "class" && s.exported) || tsFile.symbols.find((s) => s.kind === "class");
      if (classSymbol) {
        file.edges.push({
          source: templateId,
          target: classSymbol.id,
          kind: "uses",
          filePath: file.filePath,
          line: 1
        });
      }
    }
    const references = templateSymbol.metadata?.references ?? [];
    for (const ref of references) {
      const target = selectorIndex.get(ref.name) ?? `external::${ref.name}`;
      file.edges.push({
        source: templateId,
        target,
        kind: "uses",
        filePath: file.filePath,
        line: ref.line
      });
    }
  }
}
function findOutputJson(projectRoot) {
  return [
    join20(projectRoot, ".depwire", "depwire-output.json"),
    join20(projectRoot, "depwire-output.json")
  ];
}
async function loadParsedFilesFromJson(jsonPath) {
  try {
    const content = await readFile(jsonPath, "utf-8");
    const data = JSON.parse(content);
    if (Array.isArray(data?.nodes) && Array.isArray(data?.edges)) {
      const files = reconstructParsedFiles(
        data.nodes,
        data.edges
      );
      return files.length > 0 ? files : null;
    }
    if (Array.isArray(data)) {
      const files = data;
      if (files.length > 0 && Array.isArray(files[0]?.symbols)) {
        return files;
      }
      return null;
    }
    if (Array.isArray(data?.files) && Array.isArray(data.files[0]?.symbols)) {
      const files = data.files;
      return files.length > 0 ? files : null;
    }
    return null;
  } catch {
    return null;
  }
}
function reconstructParsedFiles(nodes, edges) {
  const byPath = /* @__PURE__ */ new Map();
  const ensure = (filePath) => {
    let file = byPath.get(filePath);
    if (!file) {
      file = { filePath, symbols: [], edges: [] };
      byPath.set(filePath, file);
    }
    return file;
  };
  for (const node of nodes) {
    if (!node || typeof node.filePath !== "string") continue;
    if (typeof node.id === "string" && node.id.endsWith("::__file__")) continue;
    ensure(node.filePath).symbols.push(node);
  }
  for (const edge of edges) {
    if (!edge || typeof edge.filePath !== "string") continue;
    ensure(edge.filePath).edges.push(edge);
  }
  return Array.from(byPath.values());
}

// src/cross-language/detectors/rest-api.ts
import { readFileSync as readFileSync15 } from "fs";
import { join as join21, resolve as resolve14 } from "path";
function getLanguage(filePath) {
  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) return "javascript";
  if (filePath.endsWith(".py")) return "python";
  if (filePath.endsWith(".go")) return "go";
  if (filePath.endsWith(".cs") || filePath.endsWith(".csx")) return "csharp";
  if (filePath.endsWith(".java")) return "java";
  if (filePath.endsWith(".kt") || filePath.endsWith(".kts")) return "kotlin";
  if (filePath.endsWith(".php")) return "php";
  if (filePath.endsWith(".swift")) return "swift";
  if (filePath.endsWith(".rb") || filePath.endsWith(".rake") || filePath.endsWith(".ru") || filePath.endsWith(".gemspec")) return "ruby";
  if (filePath.endsWith(".dart")) return "dart";
  if (filePath.endsWith(".mojo") || filePath.endsWith(".\u{1F525}")) return "mojo";
  if (filePath.endsWith(".cpp") || filePath.endsWith(".cc") || filePath.endsWith(".cxx") || filePath.endsWith(".c++") || filePath.endsWith(".hpp") || filePath.endsWith(".hh") || filePath.endsWith(".hxx") || filePath.endsWith(".h++") || filePath.endsWith(".h") || filePath.endsWith(".inl") || filePath.endsWith(".ipp")) return "cpp";
  return "unknown";
}
function normalizePath(routePath) {
  return routePath.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, "__PARAM__").replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, "__PARAM__");
}
function stripTrailingSlash(p) {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}
function extractHttpCalls(source, filePath) {
  const calls = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fetchMatch = line.match(/fetch\s*\(\s*(['"`])([^'"`]+)\1/);
    if (fetchMatch) {
      const path6 = fetchMatch[2];
      if (isLocalApiPath(path6)) {
        const methodMatch = line.match(/method\s*:\s*['"](\w+)['"]/);
        const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
        calls.push({ method, path: cleanPath(path6), file: filePath, line: i + 1 });
      }
    }
    if (!fetchMatch) {
      const fetchTemplateMatch = line.match(/fetch\s*\(\s*`([^`]+)`/);
      if (fetchTemplateMatch) {
        const path6 = fetchTemplateMatch[1];
        if (isLocalApiPath(path6)) {
          const methodMatch = line.match(/method\s*:\s*['"](\w+)['"]/);
          const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
          calls.push({ method, path: cleanPath(path6), file: filePath, line: i + 1 });
        }
      }
    }
    const axiosMatch = line.match(/axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]+)\2/i);
    if (axiosMatch) {
      const path6 = axiosMatch[3];
      if (isLocalApiPath(path6)) {
        calls.push({ method: axiosMatch[1].toUpperCase(), path: cleanPath(path6), file: filePath, line: i + 1 });
      }
    }
    if (!axiosMatch) {
      const axiosTemplateMatch = line.match(/axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*`([^`]+)`/i);
      if (axiosTemplateMatch) {
        const path6 = axiosTemplateMatch[2];
        if (isLocalApiPath(path6)) {
          calls.push({ method: axiosTemplateMatch[1].toUpperCase(), path: cleanPath(path6), file: filePath, line: i + 1 });
        }
      }
    }
    const genericMatch = line.match(/\w+\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]+)\2/i);
    if (genericMatch && !line.match(/axios/) && !line.match(/app\s*\./) && !line.match(/router\s*\./) && !line.match(/r\s*\./)) {
      const path6 = genericMatch[3];
      if (isLocalApiPath(path6)) {
        calls.push({ method: genericMatch[1].toUpperCase(), path: cleanPath(path6), file: filePath, line: i + 1 });
      }
    }
  }
  return calls;
}
function isLocalApiPath(path6) {
  if (path6.startsWith("http://") || path6.startsWith("https://")) return false;
  return path6.startsWith("/") || path6.includes("/api/");
}
function cleanPath(path6) {
  let cleaned = path6.replace(/\$\{[^}]*\}/g, "");
  cleaned = stripTrailingSlash(cleaned);
  return cleaned;
}
function extractRouteDefinitions(source, filePath) {
  const routes = [];
  const lines = source.split("\n");
  const lang = getLanguage(filePath);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lang === "typescript" || lang === "javascript") {
      const expressMatch = line.match(/(?:app|router)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]+)\2/i);
      if (expressMatch) {
        const path6 = expressMatch[3];
        if (path6.startsWith("/")) {
          routes.push({
            method: expressMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
    }
    if (lang === "python") {
      const pythonMatch = line.match(/@(?:app|router)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(['"])([^'"]+)\2/i);
      if (pythonMatch) {
        const path6 = pythonMatch[3];
        if (path6.startsWith("/")) {
          routes.push({
            method: pythonMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const flaskMatch = line.match(/@(?:app|blueprint|router)\s*\.\s*route\s*\(\s*(['"])([^'"]+)\1/);
      if (flaskMatch) {
        const path6 = flaskMatch[2];
        if (path6.startsWith("/")) {
          const methodsMatch = line.match(/methods\s*=\s*\[([^\]]+)\]/);
          const methods = methodsMatch ? methodsMatch[1].match(/['"](\w+)['"]/g)?.map((m) => m.replace(/['"]/g, "").toUpperCase()) || ["GET"] : ["GET"];
          for (const method of methods) {
            routes.push({
              method,
              path: path6,
              normalizedPath: normalizePath(path6),
              file: filePath,
              line: i + 1
            });
          }
        }
      }
    }
    if (lang === "go") {
      const goMatch = line.match(/(?:r|router|group)\s*\.\s*(GET|POST|PUT|DELETE|PATCH)\s*\(\s*"([^"]+)"/);
      if (goMatch) {
        const path6 = goMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: goMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
    }
    if (lang === "csharp") {
      const attrMatch = line.match(/\[\s*Http(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]+)"\s*\)\s*\]/);
      if (attrMatch) {
        routes.push({
          method: attrMatch[1].toUpperCase(),
          path: attrMatch[2],
          normalizedPath: normalizePath(attrMatch[2]),
          file: filePath,
          line: i + 1
        });
      }
      const routeAttrMatch = line.match(/\[\s*Route\s*\(\s*"([^"]+)"\s*\)\s*\]/);
      if (routeAttrMatch) {
        let routePath = routeAttrMatch[1];
        if (routePath.includes("[controller]")) {
          const classMatch = source.match(/class\s+(\w+?)Controller\s/);
          if (classMatch) {
            routePath = routePath.replace("[controller]", classMatch[1].toLowerCase());
          }
        }
        if (!routePath.startsWith("/")) routePath = "/" + routePath;
        routes.push({
          method: "ANY",
          path: routePath,
          normalizedPath: normalizePath(routePath),
          file: filePath,
          line: i + 1
        });
      }
      const minimalMatch = line.match(/app\s*\.\s*Map(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]+)"/);
      if (minimalMatch) {
        const path6 = minimalMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: minimalMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
    }
    if (lang === "java") {
      const springMethodMatch = line.match(/@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
      if (springMethodMatch) {
        const method = springMethodMatch[1].toUpperCase();
        let path6 = springMethodMatch[2];
        const classPrefix = findClassLevelPrefix(source);
        if (classPrefix) path6 = classPrefix + path6;
        if (!path6.startsWith("/")) path6 = "/" + path6;
        routes.push({
          method,
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      if (!springMethodMatch) {
        const springNoPathMatch = line.match(/@(Get|Post|Put|Delete|Patch)Mapping\s*$/);
        if (springNoPathMatch) {
          const method = springNoPathMatch[1].toUpperCase();
          const classPrefix = findClassLevelPrefix(source);
          if (classPrefix) {
            routes.push({
              method,
              path: classPrefix,
              normalizedPath: normalizePath(classPrefix),
              file: filePath,
              line: i + 1
            });
          }
        }
      }
      const requestMappingMatch = line.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
      if (requestMappingMatch) {
        let path6 = requestMappingMatch[1];
        if (!path6.startsWith("/")) path6 = "/" + path6;
        const methodMatch = line.match(/method\s*=\s*RequestMethod\.(\w+)/);
        const method = methodMatch ? methodMatch[1].toUpperCase() : "ANY";
        routes.push({
          method,
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const jaxPathMatch = line.match(/@Path\s*\(\s*["']([^"']+)["']\s*\)/);
      if (jaxPathMatch) {
        let path6 = jaxPathMatch[1];
        if (!path6.startsWith("/")) path6 = "/" + path6;
        const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
        const prevLine = i > 0 ? lines[i - 1] : "";
        const jaxMethodMatch = (nextLine + prevLine).match(/@(GET|POST|PUT|DELETE|PATCH)/);
        const method = jaxMethodMatch ? jaxMethodMatch[1] : "ANY";
        routes.push({
          method,
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const webFluxMatch = line.match(/(?:route|andRoute)\s*\(\s*(GET|POST|PUT|DELETE|PATCH)\s*\(\s*["']([^"']+)["']\s*\)/);
      if (webFluxMatch) {
        const path6 = webFluxMatch[2].startsWith("/") ? webFluxMatch[2] : "/" + webFluxMatch[2];
        routes.push({
          method: webFluxMatch[1].toUpperCase(),
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
    }
    if (lang === "kotlin") {
      const springMethodMatch = line.match(/@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
      if (springMethodMatch) {
        const method = springMethodMatch[1].toUpperCase();
        let path6 = springMethodMatch[2];
        const classPrefix = findClassLevelPrefix(source);
        if (classPrefix) path6 = classPrefix + path6;
        if (!path6.startsWith("/")) path6 = "/" + path6;
        routes.push({
          method,
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      if (!springMethodMatch) {
        const springNoPathMatch = line.match(/@(Get|Post|Put|Delete|Patch)Mapping\s*$/);
        if (springNoPathMatch) {
          const method = springNoPathMatch[1].toUpperCase();
          const classPrefix = findClassLevelPrefix(source);
          if (classPrefix) {
            routes.push({
              method,
              path: classPrefix,
              normalizedPath: normalizePath(classPrefix),
              file: filePath,
              line: i + 1
            });
          }
        }
      }
      const requestMappingMatch = line.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*(?:\[)?\s*)?["']([^"']+)["']/);
      if (requestMappingMatch) {
        let path6 = requestMappingMatch[1];
        if (!path6.startsWith("/")) path6 = "/" + path6;
        const methodMatch = line.match(/method\s*=\s*\[?\s*RequestMethod\.(\w+)/);
        const method = methodMatch ? methodMatch[1].toUpperCase() : "ANY";
        routes.push({
          method,
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const ktorMatch = line.match(/\b(get|post|put|delete|patch|head|options)\s*\(\s*["']([^"']+)["']\s*\)/);
      if (ktorMatch) {
        const path6 = ktorMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: ktorMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const ktorRouteMatch = line.match(/\broute\s*\(\s*["']([^"']+)["']\s*\)/);
      if (ktorRouteMatch) {
        const path6 = ktorRouteMatch[1];
        if (path6.startsWith("/")) {
          routes.push({
            method: "ANY",
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const resourceMatch = line.match(/@Resource\s*\(\s*["']([^"']+)["']\s*\)/);
      if (resourceMatch) {
        const path6 = resourceMatch[1];
        if (path6.startsWith("/")) {
          routes.push({
            method: "ANY",
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const http4kMatch = line.match(/["']([^"']+)["']\s*bind\s*(GET|POST|PUT|DELETE|PATCH)/);
      if (http4kMatch) {
        const path6 = http4kMatch[1];
        if (path6.startsWith("/")) {
          routes.push({
            method: http4kMatch[2].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const retrofitMatch = line.match(/@(GET|POST|PUT|DELETE|PATCH|HEAD)\s*\(\s*["']([^"']+)["']\s*\)/);
      if (retrofitMatch) {
        let path6 = retrofitMatch[2];
        if (!path6.startsWith("/")) path6 = "/" + path6;
      }
    }
    if (lang === "php") {
      const laravelRouteMatch = line.match(/Route\s*::\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (laravelRouteMatch) {
        const path6 = laravelRouteMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: laravelRouteMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const symfonyRouteMatch = line.match(/#\[Route\s*\(\s*['"]([^'"]+)['"]/);
      if (symfonyRouteMatch) {
        const path6 = symfonyRouteMatch[1];
        if (path6.startsWith("/")) {
          const methodsMatch = line.match(/methods\s*:\s*\[([^\]]+)\]/);
          const methods = methodsMatch ? methodsMatch[1].match(/['"](\w+)['"]/g)?.map((m) => m.replace(/['"]/g, "").toUpperCase()) || ["ANY"] : ["ANY"];
          for (const method of methods) {
            routes.push({
              method,
              path: path6,
              normalizedPath: normalizePath(path6),
              file: filePath,
              line: i + 1
            });
          }
        }
      }
      const slimMatch = line.match(/\$(?:app|group)\s*->\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (slimMatch) {
        const path6 = slimMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: slimMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const wpRestMatch = line.match(/register_rest_route\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/);
      if (wpRestMatch) {
        const namespace = wpRestMatch[1];
        let path6 = wpRestMatch[2];
        if (!path6.startsWith("/")) path6 = "/" + path6;
        const fullPath = `/wp-json/${namespace}${path6}`;
        const methodMatch = line.match(/methods\s*['"=>\s]+['"](\w+)['"]/i);
        const method = methodMatch ? methodMatch[1].toUpperCase() : "ANY";
        routes.push({
          method,
          path: fullPath,
          normalizedPath: normalizePath(fullPath),
          file: filePath,
          line: i + 1
        });
      }
    }
    if (lang === "swift") {
      const vaporMatch = line.match(/(?:app|router|routes)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/i);
      if (vaporMatch) {
        let path6 = vaporMatch[2];
        if (!path6.startsWith("/")) path6 = "/" + path6;
        routes.push({
          method: vaporMatch[1].toUpperCase(),
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const hbMatch = line.match(/router\s*\.\s*(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/i);
      if (hbMatch && !vaporMatch) {
        let path6 = hbMatch[2];
        if (!path6.startsWith("/")) path6 = "/" + path6;
        routes.push({
          method: hbMatch[1].toUpperCase(),
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const perfectMatch = line.match(/routes\s*\.\s*add\s*\([^)]*uri\s*:\s*["']([^"']+)["']/);
      if (perfectMatch) {
        const path6 = perfectMatch[1].startsWith("/") ? perfectMatch[1] : "/" + perfectMatch[1];
        const methodMatch = line.match(/method\s*:\s*\.(\w+)/);
        const method = methodMatch ? methodMatch[1].toUpperCase() : "ANY";
        routes.push({
          method,
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
    }
    if (lang === "mojo") {
      const pythonMatch = line.match(/@(?:app|router)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(['"])([^'"]+)\2/i);
      if (pythonMatch) {
        const path6 = pythonMatch[3];
        if (path6.startsWith("/")) {
          routes.push({
            method: pythonMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const mojoHttpMatch = line.match(/(?:server|app)\s*\.\s*(?:route|handle)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]?(GET|POST|PUT|DELETE|PATCH)['"]?/i);
      if (mojoHttpMatch) {
        const path6 = mojoHttpMatch[1];
        if (path6.startsWith("/")) {
          routes.push({
            method: mojoHttpMatch[2].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
    }
    if (lang === "ruby") {
      const railsRouteMatch = line.match(/^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/);
      if (railsRouteMatch) {
        const path6 = railsRouteMatch[2].startsWith("/") ? railsRouteMatch[2] : "/" + railsRouteMatch[2];
        routes.push({
          method: railsRouteMatch[1].toUpperCase(),
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const sinatraMatch = line.match(/^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]\s+do/);
      if (sinatraMatch && !railsRouteMatch) {
        const path6 = sinatraMatch[2].startsWith("/") ? sinatraMatch[2] : "/" + sinatraMatch[2];
        routes.push({
          method: sinatraMatch[1].toUpperCase(),
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const resourcesMatch = line.match(/^\s*resources?\s+:(\w+)/);
      if (resourcesMatch) {
        const resourcePath = "/" + resourcesMatch[1];
        routes.push({
          method: "ANY",
          path: resourcePath,
          normalizedPath: normalizePath(resourcePath),
          file: filePath,
          line: i + 1
        });
      }
      const rackMatch = line.match(/^\s*map\s+['"]([^'"]+)['"]/);
      if (rackMatch) {
        const path6 = rackMatch[1].startsWith("/") ? rackMatch[1] : "/" + rackMatch[1];
        routes.push({
          method: "ANY",
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const grapeMatch = line.match(/^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/);
      if (grapeMatch && !railsRouteMatch) {
        const path6 = grapeMatch[2].startsWith("/") ? grapeMatch[2] : "/" + grapeMatch[2];
        routes.push({
          method: grapeMatch[1].toUpperCase(),
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
    }
    if (lang === "dart") {
      const shelfMatch = line.match(/(?:router|app)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (shelfMatch) {
        const path6 = shelfMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: shelfMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const conduitMatch = line.match(/router\s*\.\s*route\s*\(\s*['"]([^'"]+)['"]/);
      if (conduitMatch) {
        const path6 = conduitMatch[1].startsWith("/") ? conduitMatch[1] : "/" + conduitMatch[1];
        routes.push({
          method: "ANY",
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const angelMatch = line.match(/app\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (angelMatch && !shelfMatch) {
        const path6 = angelMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: angelMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const serverpodMatch = line.match(/class\s+(\w+)\s+extends\s+Endpoint/);
      if (serverpodMatch) {
        const endpointName = serverpodMatch[1].toLowerCase().replace(/endpoint$/, "");
        const path6 = "/" + endpointName;
        routes.push({
          method: "ANY",
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
    }
    if (lang === "r") {
      const plumberMatch = line.match(/^#\*\s*@(get|post|put|delete|patch|head)\s+(\/\S*)/i);
      if (plumberMatch) {
        const path6 = plumberMatch[2];
        routes.push({
          method: plumberMatch[1].toUpperCase(),
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const restrserveMatch = line.match(/\w+\$add_(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (restrserveMatch) {
        const path6 = restrserveMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: restrserveMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const beakrMatch = line.match(/http(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"]([^'"]+)['"]/i);
      if (beakrMatch) {
        const path6 = beakrMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: beakrMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const shinyServerMatch = line.match(/server\s*<-\s*function\s*\(\s*input\s*,\s*output/);
      if (shinyServerMatch) {
        routes.push({
          method: "ANY",
          path: "/shiny",
          normalizedPath: normalizePath("/shiny"),
          file: filePath,
          line: i + 1
        });
      }
    }
    if (lang === "cpp") {
      const crowMatch = line.match(/CROW_ROUTE\s*\(\s*\w+\s*,\s*"([^"]+)"/);
      if (crowMatch) {
        const path6 = crowMatch[1];
        if (path6.startsWith("/")) {
          const methodsMatch = line.match(/methods\s*\(\s*"([^"]+)"_method/);
          const method = methodsMatch ? methodsMatch[1].toUpperCase() : "ANY";
          routes.push({
            method,
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const drogonMatch = line.match(/ADD_METHOD_TO\s*\(\s*[^,]+,\s*"([^"]+)"\s*,\s*(\w+)/);
      if (drogonMatch) {
        const path6 = drogonMatch[1].startsWith("/") ? drogonMatch[1] : "/" + drogonMatch[1];
        routes.push({
          method: drogonMatch[2].toUpperCase(),
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const pathAddMatch = line.match(/PATH_ADD\s*\(\s*"([^"]+)"\s*,\s*(\w+)/);
      if (pathAddMatch) {
        const path6 = pathAddMatch[1].startsWith("/") ? pathAddMatch[1] : "/" + pathAddMatch[1];
        routes.push({
          method: pathAddMatch[2].toUpperCase(),
          path: path6,
          normalizedPath: normalizePath(path6),
          file: filePath,
          line: i + 1
        });
      }
      const pistacheMatch = line.match(/router\s*\.\s*(get|post|put|del|patch)\s*\(\s*"([^"]+)"/i);
      if (pistacheMatch) {
        const method = pistacheMatch[1].toUpperCase() === "DEL" ? "DELETE" : pistacheMatch[1].toUpperCase();
        const path6 = pistacheMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method,
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
      const httplibMatch = line.match(/(?:svr|server)\s*\.\s*(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]+)"/);
      if (httplibMatch) {
        const path6 = httplibMatch[2];
        if (path6.startsWith("/")) {
          routes.push({
            method: httplibMatch[1].toUpperCase(),
            path: path6,
            normalizedPath: normalizePath(path6),
            file: filePath,
            line: i + 1
          });
        }
      }
    }
  }
  return routes;
}
function findClassLevelPrefix(source) {
  const match = source.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
  if (match) {
    let path6 = match[1];
    if (!path6.startsWith("/")) path6 = "/" + path6;
    if (path6.endsWith("/") && path6.length > 1) path6 = path6.slice(0, -1);
    return path6;
  }
  return null;
}
function matchPaths(callPath, routeNormalized) {
  const normalizedCall = normalizePath(stripTrailingSlash(callPath));
  const normalizedRoute = stripTrailingSlash(routeNormalized);
  if (normalizedCall === normalizedRoute) return true;
  if (normalizedRoute.startsWith(normalizedCall) && normalizedRoute[normalizedCall.length] === "/") return true;
  const callParts = normalizedCall.split("/");
  const routeParts = normalizedRoute.split("/");
  if (callParts.length <= routeParts.length) {
    let match = true;
    for (let i = 0; i < callParts.length; i++) {
      if (routeParts[i] === "__PARAM__") continue;
      if (callParts[i] !== routeParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}
function getConfidence(callPath, callMethod, routePath, routeMethod) {
  const normalizedCall = normalizePath(stripTrailingSlash(callPath));
  const normalizedRoute = normalizePath(stripTrailingSlash(routePath));
  const exactPath = normalizedCall === normalizedRoute;
  const methodMatch = callMethod === routeMethod || routeMethod === "ANY";
  if (exactPath && methodMatch) return "high";
  if (exactPath) return "medium";
  if (methodMatch) return "medium";
  return "low";
}
function detectRestApiEdges(files, projectRoot) {
  const edges = [];
  const allCalls = [];
  const allRoutes = [];
  for (const file of files) {
    const fullPath = join21(projectRoot, file.filePath);
    if (!resolve14(fullPath).startsWith(resolve14(projectRoot))) continue;
    let source;
    try {
      source = readFileSync15(fullPath, "utf-8");
    } catch {
      continue;
    }
    const lang = getLanguage(file.filePath);
    if (lang === "typescript" || lang === "javascript") {
      allCalls.push(...extractHttpCalls(source, file.filePath));
    }
    if (lang === "kotlin") {
      const kotlinLines = source.split("\n");
      for (let i = 0; i < kotlinLines.length; i++) {
        const line = kotlinLines[i];
        const retrofitMatch = line.match(/@(GET|POST|PUT|DELETE|PATCH|HEAD)\s*\(\s*["']([^"']+)["']\s*\)/);
        if (retrofitMatch) {
          let path6 = retrofitMatch[2];
          if (!path6.startsWith("/")) path6 = "/" + path6;
          allCalls.push({ method: retrofitMatch[1].toUpperCase(), path: path6, file: file.filePath, line: i + 1 });
        }
      }
    }
    if (lang === "swift") {
      const swiftLines = source.split("\n");
      for (let i = 0; i < swiftLines.length; i++) {
        const line = swiftLines[i];
        const urlMatch = line.match(/URL\s*\(\s*string\s*:\s*["']([^"']+)["']/);
        if (urlMatch) {
          const path6 = urlMatch[1];
          if (isLocalApiPath(path6)) {
            const methodMatch = line.match(/httpMethod\s*=\s*["'](\w+)["']/);
            const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
            allCalls.push({ method, path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
        const afMatch = line.match(/AF\s*\.\s*(?:request|upload|download)\s*\(\s*["']([^"']+)["']/);
        if (afMatch) {
          const path6 = afMatch[1];
          if (isLocalApiPath(path6)) {
            const methodMatch = line.match(/method\s*:\s*\.(\w+)/);
            const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
            allCalls.push({ method, path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
      }
    }
    if (lang === "php") {
      const phpLines = source.split("\n");
      for (let i = 0; i < phpLines.length; i++) {
        const line = phpLines[i];
        const guzzleMatch = line.match(/\$\w+\s*->\s*(get|post|put|delete|patch|request)\s*\(\s*['"]([^'"]+)['"]/i);
        if (guzzleMatch) {
          let method = guzzleMatch[1].toUpperCase();
          let path6 = guzzleMatch[2];
          if (method === "REQUEST") {
            const reqMethodMatch = line.match(/request\s*\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]+)['"]/i);
            if (reqMethodMatch) {
              method = reqMethodMatch[1].toUpperCase();
              path6 = reqMethodMatch[2];
            }
          }
          if (isLocalApiPath(path6)) {
            allCalls.push({ method, path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
        const fgcMatch = line.match(/file_get_contents\s*\(\s*['"]([^'"]+)['"]/);
        if (fgcMatch) {
          const path6 = fgcMatch[1];
          if (isLocalApiPath(path6)) {
            allCalls.push({ method: "GET", path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
      }
    }
    if (lang === "ruby") {
      const rubyLines = source.split("\n");
      for (let i = 0; i < rubyLines.length; i++) {
        const line = rubyLines[i];
        const faradayMatch = line.match(/\w+\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
        if (faradayMatch) {
          const path6 = faradayMatch[2];
          if (isLocalApiPath(path6)) {
            allCalls.push({ method: faradayMatch[1].toUpperCase(), path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
        const netHttpMatch = line.match(/Net::HTTP\s*\.\s*(get|post_form|post)\s*\(/i);
        if (netHttpMatch) {
          const uriMatch = line.match(/['"]([^'"]+)['"]/);
          if (uriMatch && isLocalApiPath(uriMatch[1])) {
            const method = netHttpMatch[1].toUpperCase().replace("POST_FORM", "POST");
            allCalls.push({ method, path: cleanPath(uriMatch[1]), file: file.filePath, line: i + 1 });
          }
        }
        const httpartyMatch = line.match(/(?:HTTParty|self)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
        if (httpartyMatch) {
          const path6 = httpartyMatch[2];
          if (isLocalApiPath(path6)) {
            allCalls.push({ method: httpartyMatch[1].toUpperCase(), path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
      }
    }
    if (lang === "dart") {
      const dartLines = source.split("\n");
      for (let i = 0; i < dartLines.length; i++) {
        const line = dartLines[i];
        const httpMatch = line.match(/http\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(?:Uri\.parse\s*\(\s*)?['"]([^'"]+)['"]/i);
        if (httpMatch) {
          const path6 = httpMatch[2];
          if (isLocalApiPath(path6)) {
            allCalls.push({ method: httpMatch[1].toUpperCase(), path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
        const dioMatch = line.match(/(?:dio|_dio|client)\s*\.\s*(get|post|put|delete|patch|request)\s*\(\s*['"]([^'"]+)['"]/i);
        if (dioMatch) {
          const path6 = dioMatch[2];
          if (isLocalApiPath(path6)) {
            allCalls.push({ method: dioMatch[1].toUpperCase(), path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
        const annotationMatch = line.match(/@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:path\s*:\s*)?['"]([^'"]+)['"]/);
        if (annotationMatch) {
          let path6 = annotationMatch[2];
          if (!path6.startsWith("/")) path6 = "/" + path6;
          allCalls.push({ method: annotationMatch[1].toUpperCase(), path: path6, file: file.filePath, line: i + 1 });
        }
        const retrofitMatch = line.match(/@(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"]([^'"]+)['"]/);
        if (retrofitMatch && !annotationMatch) {
          let path6 = retrofitMatch[2];
          if (!path6.startsWith("/")) path6 = "/" + path6;
          allCalls.push({ method: retrofitMatch[1].toUpperCase(), path: path6, file: file.filePath, line: i + 1 });
        }
      }
    }
    if (lang === "r") {
      const rLines = source.split("\n");
      for (let i = 0; i < rLines.length; i++) {
        const line = rLines[i];
        const httrMatch = line.match(/(?:httr::)?(GET|POST|PUT|DELETE|PATCH|HEAD)\s*\(\s*['"]([^'"]+)['"]/);
        if (httrMatch) {
          const path6 = httrMatch[2];
          if (isLocalApiPath(path6)) {
            allCalls.push({ method: httrMatch[1].toUpperCase(), path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
        const httr2Match = line.match(/(?:httr2::)?request\s*\(\s*['"]([^'"]+)['"]/);
        if (httr2Match) {
          const path6 = httr2Match[1];
          if (isLocalApiPath(path6)) {
            const methodMatch = line.match(/req_method\s*\(\s*['"](\w+)['"]/);
            const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
            allCalls.push({ method, path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
        const curlMatch = line.match(/curl_fetch_(?:memory|disk)\s*\(\s*['"]([^'"]+)['"]/);
        if (curlMatch) {
          const path6 = curlMatch[1];
          if (isLocalApiPath(path6)) {
            allCalls.push({ method: "GET", path: cleanPath(path6), file: file.filePath, line: i + 1 });
          }
        }
      }
    }
    allRoutes.push(...extractRouteDefinitions(source, file.filePath));
  }
  for (const call of allCalls) {
    for (const route of allRoutes) {
      if (call.file === route.file) continue;
      if (matchPaths(call.path, route.normalizedPath)) {
        const confidence = getConfidence(call.path, call.method, route.path, route.method);
        edges.push({
          sourceFile: call.file,
          targetFile: route.file,
          edgeType: "rest-api",
          confidence,
          sourceLanguage: getLanguage(call.file),
          targetLanguage: getLanguage(route.file),
          sourceLine: call.line,
          targetLine: route.line,
          metadata: {
            httpMethod: call.method,
            path: call.path
          }
        });
      }
    }
  }
  return edges;
}

// src/cross-language/detectors/subprocess.ts
import { readFileSync as readFileSync16 } from "fs";
import { join as join22, resolve as resolve15, basename as basename13 } from "path";
var SCRIPT_EXTENSIONS = [".py", ".js", ".ts", ".go", ".rs"];
function getLanguage2(filePath) {
  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) return "javascript";
  if (filePath.endsWith(".py")) return "python";
  if (filePath.endsWith(".go")) return "go";
  if (filePath.endsWith(".rs")) return "rust";
  return "unknown";
}
function extractFilenameFromArgs(args) {
  const tokens = args.split(/[\s,'"[\]]+/).filter(Boolean);
  for (const token of tokens) {
    for (const ext of SCRIPT_EXTENSIONS) {
      if (token.endsWith(ext)) {
        return token;
      }
    }
  }
  return null;
}
function extractSubprocessCalls(source, filePath) {
  const calls = [];
  const lines = source.split("\n");
  const lang = getLanguage2(filePath);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lang === "typescript" || lang === "javascript") {
      const execMatch = line.match(/(?:execSync|exec)\s*\(\s*(['"`])([^'"`]+)\1/);
      if (execMatch) {
        const command = execMatch[2];
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }
      if (!execMatch) {
        const execTemplateMatch = line.match(/(?:execSync|exec)\s*\(\s*`([^`]+)`/);
        if (execTemplateMatch) {
          const command = execTemplateMatch[1].replace(/\$\{[^}]*\}/g, "");
          const calledFile = extractFilenameFromArgs(command);
          if (calledFile) {
            calls.push({ file: filePath, line: i + 1, command: execTemplateMatch[1], calledFile });
          }
        }
      }
      const spawnMatch = line.match(/(?:spawn|spawnSync)\s*\(\s*['"](\w+)['"]\s*,\s*\[([^\]]*)\]/);
      if (spawnMatch) {
        const command = `${spawnMatch[1]} ${spawnMatch[2]}`;
        const calledFile = extractFilenameFromArgs(spawnMatch[2]);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }
    }
    if (lang === "python") {
      const subprocessMatch = line.match(/subprocess\s*\.\s*(?:run|call|Popen|check_output|check_call)\s*\(\s*\[([^\]]*)\]/);
      if (subprocessMatch) {
        const command = subprocessMatch[1];
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }
      const osMatch = line.match(/os\s*\.\s*system\s*\(\s*['"]([^'"]+)['"]/);
      if (osMatch) {
        const command = osMatch[1];
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }
      const subprocessStrMatch = line.match(/subprocess\s*\.\s*(?:run|call|Popen|check_output|check_call)\s*\(\s*['"]([^'"]+)['"]/);
      if (subprocessStrMatch) {
        const command = subprocessStrMatch[1];
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }
    }
    if (lang === "go") {
      const goMatch = line.match(/exec\s*\.\s*Command\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"/);
      if (goMatch) {
        const command = `${goMatch[1]} ${goMatch[2]}`;
        const calledFile = extractFilenameFromArgs(command);
        if (calledFile) {
          calls.push({ file: filePath, line: i + 1, command, calledFile });
        }
      }
    }
  }
  return calls;
}
function detectSubprocessEdges(files, projectRoot) {
  const edges = [];
  const knownFiles = new Set(files.map((f) => f.filePath));
  const basenameMap = /* @__PURE__ */ new Map();
  for (const f of files) {
    const base = basename13(f.filePath);
    if (!basenameMap.has(base)) basenameMap.set(base, []);
    basenameMap.get(base).push(f.filePath);
  }
  for (const file of files) {
    const fullPath = join22(projectRoot, file.filePath);
    if (!resolve15(fullPath).startsWith(resolve15(projectRoot))) continue;
    let source;
    try {
      source = readFileSync16(fullPath, "utf-8");
    } catch {
      continue;
    }
    const calls = extractSubprocessCalls(source, file.filePath);
    for (const call of calls) {
      let targetFile = null;
      let confidence = "high";
      if (knownFiles.has(call.calledFile)) {
        targetFile = call.calledFile;
        confidence = "high";
      } else {
        const base = basename13(call.calledFile);
        const candidates = basenameMap.get(base);
        if (candidates && candidates.length > 0) {
          const exactCandidate = candidates.find((c) => c.endsWith(call.calledFile));
          if (exactCandidate) {
            targetFile = exactCandidate;
            confidence = "high";
          } else {
            targetFile = candidates[0];
            confidence = "medium";
          }
        }
      }
      if (!targetFile) continue;
      if (targetFile === call.file) continue;
      edges.push({
        sourceFile: call.file,
        targetFile,
        edgeType: "subprocess",
        confidence,
        sourceLanguage: getLanguage2(call.file),
        targetLanguage: getLanguage2(targetFile),
        sourceLine: call.line,
        metadata: {
          command: call.command,
          calledFile: call.calledFile
        }
      });
    }
  }
  return edges;
}

// src/cross-language/index.ts
function detectCrossLanguageEdges(files, projectRoot, graph) {
  const startTime = Date.now();
  const restApiEdges = detectRestApiEdges(files, projectRoot);
  const subprocessEdges = detectSubprocessEdges(files, projectRoot);
  const allEdges = [...restApiEdges, ...subprocessEdges];
  for (const edge of allEdges) {
    const sourceNodeId = `${edge.sourceFile}::__file__`;
    const targetNodeId = `${edge.targetFile}::__file__`;
    if (!graph.hasNode(sourceNodeId)) {
      let hasSourceFile = false;
      graph.forEachNode((_nodeId, attrs) => {
        if (attrs.filePath === edge.sourceFile) hasSourceFile = true;
      });
      if (!hasSourceFile) continue;
      graph.addNode(sourceNodeId, {
        name: "__file__",
        kind: "import",
        filePath: edge.sourceFile,
        startLine: 1,
        endLine: 1,
        exported: false
      });
    }
    if (!graph.hasNode(targetNodeId)) {
      let hasTargetFile = false;
      graph.forEachNode((_nodeId, attrs) => {
        if (attrs.filePath === edge.targetFile) hasTargetFile = true;
      });
      if (!hasTargetFile) continue;
      graph.addNode(targetNodeId, {
        name: "__file__",
        kind: "import",
        filePath: edge.targetFile,
        startLine: 1,
        endLine: 1,
        exported: false
      });
    }
    graph.mergeEdge(sourceNodeId, targetNodeId, {
      kind: edge.edgeType,
      filePath: edge.sourceFile,
      line: edge.sourceLine || 1,
      crossLanguage: true,
      confidence: edge.confidence,
      edgeType: edge.edgeType,
      httpMethod: edge.metadata.httpMethod,
      path: edge.metadata.path,
      command: edge.metadata.command,
      calledFile: edge.metadata.calledFile
    });
  }
  const detectionTimeMs = Date.now() - startTime;
  return {
    edges: allEdges,
    stats: {
      restApiEdges: restApiEdges.length,
      subprocessEdges: subprocessEdges.length,
      filesAnalyzed: files.length,
      detectionTimeMs
    }
  };
}

// src/graph/index.ts
import { DirectedGraph } from "graphology";
function buildGraph(parsedFiles, projectRoot) {
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
      if (edge.target.endsWith("::__file__") && !fileNodes.has(edge.target)) {
        fileNodes.add(edge.target);
        const filePath = edge.target.replace("::__file__", "");
        graph.addNode(edge.target, {
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
  if (projectRoot) {
    const result = detectCrossLanguageEdges(parsedFiles, projectRoot, graph);
    if (result.stats.restApiEdges > 0 || result.stats.subprocessEdges > 0) {
      console.error(`Cross-language edges: ${result.stats.restApiEdges} rest-api, ${result.stats.subprocessEdges} subprocess detected`);
    }
  }
  return graph;
}

// src/core/exclusions.ts
function isExcludedFromOrphanReporting(filePath, options) {
  const includeFixtures = options?.includeFixtures ?? false;
  if (includeFixtures) {
    return false;
  }
  if (filePath.includes("/fixtures/") || filePath.includes("/__fixtures__/")) {
    return true;
  }
  if (filePath.endsWith(".html")) {
    return true;
  }
  if (isTestFile(filePath)) {
    return true;
  }
  return false;
}
function isTestFile(filePath) {
  if (filePath.includes("/test/") || filePath.includes("/tests/")) {
    return true;
  }
  const filename = filePath.split("/").pop() || "";
  if (filename.endsWith(".test.ts") || filename.endsWith(".test.js")) {
    return true;
  }
  if (filename.endsWith(".spec.ts") || filename.endsWith(".spec.js")) {
    return true;
  }
  if (filename.includes(".test.") || filename.includes(".spec.")) {
    return true;
  }
  return false;
}

// src/graph/queries.ts
import { relative as relative6 } from "path";
function findSymbols(graph, query) {
  if (query.includes("::")) {
    if (graph.hasNode(query)) {
      const attrs = graph.getNodeAttributes(query);
      return [{
        id: query,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        exported: attrs.exported,
        scope: attrs.scope,
        dependentCount: graph.inDegree(query)
      }];
    }
  }
  const queryLower = query.toLowerCase();
  const results = [];
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.name.toLowerCase() === queryLower) {
      results.push({
        id: nodeId,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        exported: attrs.exported,
        scope: attrs.scope,
        dependentCount: graph.inDegree(nodeId)
      });
    }
  });
  results.sort((a, b) => b.dependentCount - a.dependentCount);
  return results;
}
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
        kind: attrs.kind,
        crossLanguage: attrs.crossLanguage || false,
        edgeType: attrs.edgeType
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
var TEST_PATH_SEGMENTS = /[/\\](tests?|__tests__|spec)[/\\]/i;
var TEST_FILE_PATTERNS = /\.(test|spec)\.[jt]sx?$|_test\.(go|py)$|^test_.*\.py$/i;
function isTestFile2(filePath) {
  return TEST_PATH_SEGMENTS.test(filePath) || TEST_FILE_PATTERNS.test(filePath);
}
function getAffectedFiles(graph, targetFilePath, options = {}) {
  const maxDepth = options.maxDepth ?? 5;
  const seedNodes = [];
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === targetFilePath) {
      seedNodes.push(nodeId);
    }
  });
  if (seedNodes.length === 0) return { affected: [], testFiles: [], totalCount: 0 };
  const visited = new Set(seedNodes);
  const fileMap = /* @__PURE__ */ new Map();
  let queue = seedNodes.map((n) => ({ nodeId: n, depth: 0 }));
  while (queue.length > 0) {
    const next = [];
    for (const { nodeId, depth } of queue) {
      if (depth >= maxDepth) continue;
      for (const neighborId of graph.inNeighbors(nodeId)) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const attrs = graph.getNodeAttributes(neighborId);
        const srcAttrs = graph.getNodeAttributes(nodeId);
        const newDepth = depth + 1;
        if (!fileMap.has(attrs.filePath) || fileMap.get(attrs.filePath).depth > newDepth) {
          const relation = newDepth === 1 ? "direct" : `indirect \u2014 depth ${newDepth}`;
          fileMap.set(attrs.filePath, {
            depth: newDepth,
            reason: `${relation} \u2014 imports ${srcAttrs.name} from ${srcAttrs.filePath}`
          });
        }
        next.push({ nodeId: neighborId, depth: newDepth });
      }
    }
    queue = next;
  }
  fileMap.delete(targetFilePath);
  const affected = Array.from(fileMap.entries()).map(([filePath, info]) => ({
    filePath,
    depth: info.depth,
    reason: info.reason,
    isTest: isTestFile2(filePath)
  })).sort((a, b) => a.depth - b.depth || a.filePath.localeCompare(b.filePath));
  const testFiles = affected.filter((f) => f.isTest);
  return { affected, testFiles, totalCount: affected.length };
}
function getArchitectureSummary(graph, projectRoot, includeFixtures = false) {
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
  const orphanFiles = fileSummary.filter((f) => {
    if (f.incomingRefs !== 0 || f.outgoingRefs !== 0) return false;
    if (projectRoot && !includeFixtures) {
      const relativePath = relative6(projectRoot, f.filePath);
      if (isExcludedFromOrphanReporting(relativePath, { includeFixtures })) {
        return false;
      }
    }
    return true;
  }).map((f) => f.filePath);
  return {
    fileCount: fileSet.size,
    symbolCount: graph.order,
    edgeCount: graph.size,
    mostConnectedFiles: fileConnections.slice(0, 5),
    orphanFiles
  };
}

// src/health/metrics.ts
import { dirname as dirname18 } from "path";
function scoreToGrade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
function calculateCouplingScore(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  if (files.size === 0) {
    return {
      name: "Coupling",
      score: 100,
      weight: 0.25,
      grade: "A",
      details: "No files to analyze",
      metrics: { avgConnections: 0, maxConnections: 0, crossDirCoupling: 0 }
    };
  }
  const fileConnections = /* @__PURE__ */ new Map();
  let crossDirEdges = 0;
  let totalEdges = 0;
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      totalEdges++;
      fileConnections.set(sourceAttrs.filePath, (fileConnections.get(sourceAttrs.filePath) || 0) + 1);
      fileConnections.set(targetAttrs.filePath, (fileConnections.get(targetAttrs.filePath) || 0) + 1);
      const sourceDir = dirname18(sourceAttrs.filePath).split("/")[0];
      const targetDir = dirname18(targetAttrs.filePath).split("/")[0];
      if (sourceDir !== targetDir) {
        crossDirEdges++;
      }
    }
  });
  const avgConnections = totalEdges / files.size;
  const maxConnections = Math.max(...Array.from(fileConnections.values()), 0);
  const crossDirCoupling = totalEdges > 0 ? crossDirEdges / totalEdges : 0;
  let score = 100;
  if (avgConnections <= 3) {
    score = 100;
  } else if (avgConnections <= 6) {
    score = 80;
  } else if (avgConnections <= 10) {
    score = 60;
  } else if (avgConnections <= 15) {
    score = 40;
  } else {
    score = 20;
  }
  if (maxConnections > avgConnections * 3) {
    score -= 10;
  }
  if (crossDirCoupling > 0.7) {
    score -= 10;
  }
  score = Math.max(0, Math.min(100, score));
  return {
    name: "Coupling",
    score,
    weight: 0.25,
    grade: scoreToGrade(score),
    details: `Average ${avgConnections.toFixed(1)} connections per file, max ${maxConnections}, ${(crossDirCoupling * 100).toFixed(0)}% cross-directory`,
    metrics: {
      avgConnections: parseFloat(avgConnections.toFixed(2)),
      maxConnections,
      crossDirCoupling: parseFloat((crossDirCoupling * 100).toFixed(1))
    }
  };
}
function calculateCohesionScore(graph) {
  const dirEdges = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceDir = dirname18(sourceAttrs.filePath);
      const targetDir = dirname18(targetAttrs.filePath);
      if (!dirEdges.has(sourceDir)) {
        dirEdges.set(sourceDir, { internal: 0, total: 0 });
      }
      const stats = dirEdges.get(sourceDir);
      stats.total++;
      if (sourceDir === targetDir) {
        stats.internal++;
      }
    }
  });
  if (dirEdges.size === 0) {
    return {
      name: "Cohesion",
      score: 100,
      weight: 0.2,
      grade: "A",
      details: "No inter-file dependencies",
      metrics: { avgInternalRatio: 1, directories: 0 }
    };
  }
  let totalRatio = 0;
  for (const stats of dirEdges.values()) {
    if (stats.total > 0) {
      totalRatio += stats.internal / stats.total;
    }
  }
  const avgInternalRatio = totalRatio / dirEdges.size;
  let score = 100;
  if (avgInternalRatio >= 0.7) {
    score = 100;
  } else if (avgInternalRatio >= 0.5) {
    score = 80;
  } else if (avgInternalRatio >= 0.3) {
    score = 60;
  } else if (avgInternalRatio >= 0.1) {
    score = 40;
  } else {
    score = 20;
  }
  return {
    name: "Cohesion",
    score,
    weight: 0.2,
    grade: scoreToGrade(score),
    details: `Average ${(avgInternalRatio * 100).toFixed(0)}% internal dependencies per directory`,
    metrics: {
      avgInternalRatio: parseFloat((avgInternalRatio * 100).toFixed(1)),
      directories: dirEdges.size
    }
  };
}
function calculateCircularDepsScore(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  if (files.size === 0) {
    return {
      name: "Circular Dependencies",
      score: 100,
      weight: 0.2,
      grade: "A",
      details: "No files to analyze",
      metrics: { cycles: 0, cyclesPer100: 0 }
    };
  }
  const fileGraph = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      if (!fileGraph.has(sourceFile)) {
        fileGraph.set(sourceFile, /* @__PURE__ */ new Set());
      }
      fileGraph.get(sourceFile).add(targetFile);
    }
  });
  const visited = /* @__PURE__ */ new Set();
  const recStack = /* @__PURE__ */ new Set();
  const cycles = [];
  function dfs(node, path6) {
    if (recStack.has(node)) {
      const cycleStart = path6.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push(path6.slice(cycleStart));
      }
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    recStack.add(node);
    path6.push(node);
    const neighbors = fileGraph.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path6]);
      }
    }
    recStack.delete(node);
  }
  for (const node of fileGraph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }
  const uniqueCycles = /* @__PURE__ */ new Set();
  for (const cycle of cycles) {
    const sorted = [...cycle].sort().join(",");
    uniqueCycles.add(sorted);
  }
  const cycleCount = uniqueCycles.size;
  const cyclesPer100 = cycleCount / files.size * 100;
  let score = 100;
  if (cycleCount === 0) {
    score = 100;
  } else if (cyclesPer100 <= 1) {
    score = 80;
  } else if (cyclesPer100 <= 5) {
    score = 60;
  } else if (cyclesPer100 <= 15) {
    score = 40;
  } else {
    score = 20;
  }
  return {
    name: "Circular Dependencies",
    score,
    weight: 0.2,
    grade: scoreToGrade(score),
    details: cycleCount === 0 ? "No circular dependencies detected" : `${cycleCount} circular dependency cycle${cycleCount === 1 ? "" : "s"} detected`,
    metrics: { cycles: cycleCount, cyclesPer100: parseFloat(cyclesPer100.toFixed(1)) }
  };
}
function calculateGodFilesScore(graph) {
  const files = /* @__PURE__ */ new Set();
  const fileConnections = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  if (files.size === 0) {
    return {
      name: "God Files",
      score: 100,
      weight: 0.15,
      grade: "A",
      details: "No files to analyze",
      metrics: { godFiles: 0, threshold: 0, godFilesPer100: 0 }
    };
  }
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      fileConnections.set(sourceFile, (fileConnections.get(sourceFile) || 0) + 1);
      fileConnections.set(targetFile, (fileConnections.get(targetFile) || 0) + 1);
    }
  });
  const connections = Array.from(fileConnections.values());
  const avgConnections = connections.length > 0 ? connections.reduce((a, b) => a + b, 0) / connections.length : 0;
  const godThreshold = avgConnections * 3;
  const godFiles = connections.filter((c) => c > godThreshold).length;
  const godFilesPer100 = godFiles / files.size * 100;
  let score = 100;
  if (godFiles === 0) {
    score = 100;
  } else if (godFilesPer100 <= 3) {
    score = 80;
  } else if (godFilesPer100 <= 6) {
    score = 60;
  } else if (godFilesPer100 <= 10) {
    score = 40;
  } else {
    score = 20;
  }
  return {
    name: "God Files",
    score,
    weight: 0.15,
    grade: scoreToGrade(score),
    details: godFiles === 0 ? "No god files detected" : `${godFiles} god file${godFiles === 1 ? "" : "s"} (>${godThreshold.toFixed(0)} connections)`,
    metrics: {
      godFiles,
      threshold: parseFloat(godThreshold.toFixed(1)),
      godFilesPer100: parseFloat(godFilesPer100.toFixed(1))
    }
  };
}
function calculateOrphansScore(graph) {
  const files = /* @__PURE__ */ new Set();
  const connectedFiles = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      connectedFiles.add(sourceFile);
      connectedFiles.add(targetFile);
    }
  });
  let deadSymbolCount = 0;
  const relevantExportedKinds = /* @__PURE__ */ new Set([
    "function",
    "class",
    "interface",
    "type",
    "type_alias",
    "enum",
    "const",
    "constant",
    "let",
    "var",
    "variable"
  ]);
  graph.forEachNode((node, attrs) => {
    if (!attrs.exported) return;
    if (!relevantExportedKinds.has(attrs.kind)) return;
    if (graph.inDegree(node) === 0) {
      deadSymbolCount++;
    }
  });
  return calculateOrphansScoreFromMetrics(graph, files, connectedFiles, deadSymbolCount);
}
function calculateOrphansScoreFromMetrics(graph, files, connectedFiles, deadSymbolCount) {
  let orphanCount = 0;
  for (const file of files) {
    if (!connectedFiles.has(file)) orphanCount++;
  }
  const orphanPercent = files.size > 0 ? orphanCount / files.size * 100 : 0;
  const deadCodePercent = graph.order > 0 ? deadSymbolCount / graph.order * 100 : 0;
  let deadScore;
  if (deadCodePercent === 0) {
    deadScore = 100;
  } else if (deadCodePercent <= 2) {
    deadScore = 95 - deadCodePercent * 2.5;
  } else if (deadCodePercent <= 5) {
    deadScore = 89 - (deadCodePercent - 2) * 3;
  } else if (deadCodePercent <= 10) {
    deadScore = 79 - (deadCodePercent - 5) * 2;
  } else if (deadCodePercent <= 20) {
    deadScore = 69 - (deadCodePercent - 10) * 2;
  } else {
    deadScore = Math.max(0, 49 - (deadCodePercent - 20) * 1);
  }
  let orphanScore;
  if (orphanPercent === 0) {
    orphanScore = 100;
  } else if (orphanPercent <= 5) {
    orphanScore = 90;
  } else if (orphanPercent <= 10) {
    orphanScore = 70;
  } else if (orphanPercent <= 20) {
    orphanScore = 50;
  } else {
    orphanScore = 30;
  }
  const score = Math.round(deadScore * 0.6 + orphanScore * 0.4);
  return {
    name: "Orphans & Dead Code",
    score,
    weight: 0.1,
    grade: scoreToGrade(score),
    details: `${orphanCount} orphan file${orphanCount === 1 ? "" : "s"} (${orphanPercent.toFixed(0)}%), ${deadSymbolCount} dead symbols (${deadCodePercent.toFixed(1)}%)`,
    metrics: {
      orphans: orphanCount,
      orphanPercentage: parseFloat(orphanPercent.toFixed(1)),
      deadSymbols: deadSymbolCount,
      deadCodePercentage: parseFloat(deadCodePercent.toFixed(1))
    }
  };
}
function calculateDepthScore(graph) {
  const fileGraph = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      if (!fileGraph.has(sourceFile)) {
        fileGraph.set(sourceFile, /* @__PURE__ */ new Set());
      }
      fileGraph.get(sourceFile).add(targetFile);
    }
  });
  function findLongestPath(start) {
    const visited = /* @__PURE__ */ new Set();
    let maxDepth2 = 0;
    function dfs(node, depth) {
      if (visited.has(node)) {
        return;
      }
      visited.add(node);
      maxDepth2 = Math.max(maxDepth2, depth);
      const neighbors = fileGraph.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          dfs(neighbor, depth + 1);
        }
      }
      visited.delete(node);
    }
    dfs(start, 0);
    return maxDepth2;
  }
  let maxDepth = 0;
  for (const node of fileGraph.keys()) {
    const depth = findLongestPath(node);
    maxDepth = Math.max(maxDepth, depth);
  }
  let score = 100;
  if (maxDepth <= 4) {
    score = 100;
  } else if (maxDepth <= 6) {
    score = 80;
  } else if (maxDepth <= 8) {
    score = 60;
  } else if (maxDepth <= 12) {
    score = 40;
  } else {
    score = 20;
  }
  return {
    name: "Dependency Depth",
    score,
    weight: 0.1,
    grade: scoreToGrade(score),
    details: `Maximum dependency chain: ${maxDepth} level${maxDepth === 1 ? "" : "s"}`,
    metrics: { maxDepth }
  };
}

// src/health/workspace-metrics.ts
import { relative as relative7, resolve as resolve16 } from "path";

// src/dead-code/detector.ts
import path2 from "path";
import { readFileSync as readFileSync17, existsSync as existsSync19 } from "fs";
function isFunnelDebugEnabled(debug) {
  return debug || process.env.DEPWIRE_DEBUG_FUNNEL === "1";
}
function newFunnelStats() {
  return {
    totalNodesExamined: 0,
    passedNameCheck: 0,
    passedFileCheck: 0,
    passedRelevantKind: 0,
    rejectedByKind: {},
    passedExportedCheck: 0,
    passedInDegreeZero: 0,
    survivedExclusion: 0,
    exclusionByReason: {}
  };
}
function logFunnelStats(funnel, label = "dead-code funnel") {
  console.error(`
\u{1F52C} Debug: ${label}`);
  console.error(`  1. Total nodes examined:        ${funnel.totalNodesExamined}`);
  console.error(`  2. Passed name check:           ${funnel.passedNameCheck}`);
  console.error(`  3. Passed file check:           ${funnel.passedFileCheck}`);
  console.error(`  4. Passed relevant-kind check:  ${funnel.passedRelevantKind}`);
  const rejected = Object.entries(funnel.rejectedByKind).sort((a, b) => b[1] - a[1]);
  if (rejected.length > 0) {
    console.error(`     Rejected by kind:`);
    for (const [kind, count] of rejected) {
      console.error(`       - ${kind || "(no kind)"}: ${count}`);
    }
  }
  console.error(`  5. Passed exported check:       ${funnel.passedExportedCheck}`);
  console.error(`  6. Passed inDegree===0 check:   ${funnel.passedInDegreeZero}`);
  console.error(`  7. Survived shouldExclude:      ${funnel.survivedExclusion}`);
  const exclusions = Object.entries(funnel.exclusionByReason).sort((a, b) => b[1] - a[1]);
  if (exclusions.length > 0) {
    console.error(`     Excluded by reason:`);
    for (const [reason, count] of exclusions) {
      console.error(`       - ${reason}: ${count}`);
    }
  }
}
function findDeadSymbols(graph, projectRoot, includeTests = false, debug = false, includeFixtures = false) {
  const deadSymbols = [];
  const context = { graph, projectRoot };
  const funnelEnabled = isFunnelDebugEnabled(debug);
  const funnel = funnelEnabled ? newFunnelStats() : void 0;
  const stats = {
    total: 0,
    excludedByTestFile: 0,
    excludedByEntryPoint: 0,
    excludedByConfigFile: 0,
    excludedByTypeDeclaration: 0,
    excludedByDefaultExport: 0,
    excludedByFrameworkDir: 0
  };
  const packageEntryPoints = getPackageEntryPoints(projectRoot);
  if (debug) {
    console.log("\n\u{1F50D} Debug: Graph Structure");
    console.log(`Total nodes in graph: ${graph.order}`);
    console.log(`Total edges in graph: ${graph.size}`);
    let nodesWithZeroInDegree = 0;
    let nodesWithZeroOutDegree = 0;
    graph.forEachNode((node) => {
      if (graph.inDegree(node) === 0) nodesWithZeroInDegree++;
      if (graph.outDegree(node) === 0) nodesWithZeroOutDegree++;
    });
    console.log(`Nodes with inDegree=0: ${nodesWithZeroInDegree}`);
    console.log(`Nodes with outDegree=0: ${nodesWithZeroOutDegree}`);
    if (nodesWithZeroInDegree <= 10) {
      console.log("\nSample nodes with inDegree=0:");
      let count = 0;
      graph.forEachNode((node) => {
        if (graph.inDegree(node) === 0 && count < 10) {
          const attrs = graph.getNodeAttributes(node);
          const filePath = attrs.file || attrs.filePath || "unknown";
          console.log(`  - ${attrs.name} (${attrs.kind}) in ${path2.relative(projectRoot, path2.resolve(projectRoot, filePath))}`);
          count++;
        }
      });
    }
  }
  for (const node of graph.nodes()) {
    const attrs = graph.getNodeAttributes(node);
    if (funnel) funnel.totalNodesExamined++;
    if (!attrs.name) continue;
    if (funnel) funnel.passedNameCheck++;
    if (!attrs.file && !attrs.filePath) {
      if (debug) {
        console.log(`Skipping node ${attrs.name} - no file attribute`);
      }
      continue;
    }
    if (funnel) funnel.passedFileCheck++;
    const filePath = attrs.file || attrs.filePath;
    if (!isRelevantForDeadCodeDetection(attrs)) {
      if (funnel) {
        const kind = attrs.kind || "(no kind)";
        funnel.rejectedByKind[kind] = (funnel.rejectedByKind[kind] || 0) + 1;
      }
      continue;
    }
    if (funnel) {
      funnel.passedRelevantKind++;
      funnel.passedExportedCheck++;
    }
    const inDegree = graph.inDegree(node);
    if (inDegree === 0) {
      if (funnel) funnel.passedInDegreeZero++;
      stats.total++;
      const exclusionReason = shouldExclude(attrs, context, includeTests, packageEntryPoints, includeFixtures);
      if (exclusionReason) {
        switch (exclusionReason) {
          case "test":
            stats.excludedByTestFile++;
            break;
          case "entry":
            stats.excludedByEntryPoint++;
            break;
          case "config":
            stats.excludedByConfigFile++;
            break;
          case "types":
            stats.excludedByTypeDeclaration++;
            break;
          case "default":
            stats.excludedByDefaultExport++;
            break;
          case "framework":
            stats.excludedByFrameworkDir++;
            break;
        }
        if (funnel) {
          funnel.exclusionByReason[exclusionReason] = (funnel.exclusionByReason[exclusionReason] || 0) + 1;
        }
        continue;
      }
      if (funnel) funnel.survivedExclusion++;
      deadSymbols.push({
        name: attrs.name,
        kind: attrs.kind || "unknown",
        file: filePath,
        line: attrs.startLine || 0,
        exported: attrs.exported || false,
        dependents: 0,
        confidence: "high",
        reason: "Zero dependents"
      });
    }
  }
  if (debug) {
    console.log("\n\u{1F50D} Debug: Exclusion Statistics");
    console.log(`Total symbols with 0 incoming edges: ${stats.total}`);
    console.log(`Excluded by test file: ${stats.excludedByTestFile}`);
    console.log(`Excluded by entry point: ${stats.excludedByEntryPoint}`);
    console.log(`Excluded by config file: ${stats.excludedByConfigFile}`);
    console.log(`Excluded by type declaration: ${stats.excludedByTypeDeclaration}`);
    console.log(`Excluded by default export: ${stats.excludedByDefaultExport}`);
    console.log(`Excluded by framework dir: ${stats.excludedByFrameworkDir}`);
    console.log(`Remaining dead symbols: ${deadSymbols.length}
`);
  }
  if (funnel) {
    logFunnelStats(funnel);
  }
  return { symbols: deadSymbols, stats, funnel };
}
function isRelevantForDeadCodeDetection(attrs) {
  const kind = attrs.kind;
  const relevantKinds = [
    "function",
    "class",
    "interface",
    "type",
    "type_alias",
    "enum",
    "const",
    "constant",
    "let",
    "var",
    "variable",
    "method",
    "property"
  ];
  if (!relevantKinds.includes(kind)) {
    return false;
  }
  if (kind === "const" || kind === "let" || kind === "var" || kind === "variable") {
    return attrs.exported === true;
  }
  return true;
}
function getPackageEntryPoints(projectRoot) {
  const entryPoints = /* @__PURE__ */ new Set();
  const resolvedRoot = path2.resolve(projectRoot);
  const packageJsonPath = path2.resolve(resolvedRoot, "package.json");
  if (!packageJsonPath.startsWith(resolvedRoot) || !existsSync19(packageJsonPath)) {
    return entryPoints;
  }
  try {
    const packageJson = JSON.parse(readFileSync17(packageJsonPath, "utf-8"));
    if (packageJson.main) {
      entryPoints.add(path2.resolve(projectRoot, packageJson.main));
    }
    if (packageJson.module) {
      entryPoints.add(path2.resolve(projectRoot, packageJson.module));
    }
    if (packageJson.exports) {
      const addExports = (exp) => {
        if (typeof exp === "string") {
          entryPoints.add(path2.resolve(projectRoot, exp));
        } else if (typeof exp === "object") {
          for (const key in exp) {
            if (typeof exp[key] === "string") {
              entryPoints.add(path2.resolve(projectRoot, exp[key]));
            } else if (typeof exp[key] === "object") {
              addExports(exp[key]);
            }
          }
        }
      };
      addExports(packageJson.exports);
    }
  } catch (e) {
  }
  return entryPoints;
}
function shouldExclude(attrs, context, includeTests, packageEntryPoints, includeFixtures = false) {
  const filePath = attrs.file || attrs.filePath;
  if (!filePath) {
    return null;
  }
  const absoluteFilePath = path2.resolve(context.projectRoot, filePath);
  const relativePath = path2.relative(context.projectRoot, absoluteFilePath);
  if (!includeTests && isTestFile3(relativePath)) {
    return "test";
  }
  if (isExcludedFromOrphanReporting(relativePath, { includeFixtures })) {
    return "test";
  }
  if (isRealPackageEntryPoint(absoluteFilePath, packageEntryPoints)) {
    return "entry";
  }
  if (isConfigFile(relativePath)) {
    return "config";
  }
  if (isTypeDeclarationFile(relativePath)) {
    return "types";
  }
  if (attrs.kind === "default") {
    return "default";
  }
  if (isFrameworkAutoLoadedFile(relativePath)) {
    return "framework";
  }
  if (isCppExcluded(attrs)) {
    return "framework";
  }
  if (isKotlinExcluded(attrs)) {
    return "framework";
  }
  if (isPhpExcluded(attrs)) {
    return "framework";
  }
  if (isSwiftExcluded(attrs)) {
    return "framework";
  }
  if (isMojoExcluded(attrs)) {
    return "framework";
  }
  if (isRubyExcluded(attrs)) {
    return "framework";
  }
  if (isDartExcluded(attrs)) {
    return "framework";
  }
  if (isRExcluded(attrs)) {
    return "framework";
  }
  return null;
}
function isRealPackageEntryPoint(filePath, packageEntryPoints) {
  const normalizedPath = path2.normalize(filePath);
  for (const entryPoint of packageEntryPoints) {
    const normalizedEntry = path2.normalize(entryPoint);
    if (normalizedPath === normalizedEntry || normalizedPath === normalizedEntry.replace(/\.(js|ts)$/, ".ts") || normalizedPath === normalizedEntry.replace(/\.(js|ts)$/, ".js")) {
      return true;
    }
  }
  return false;
}
function isTestFile3(filePath) {
  return filePath.includes("__tests__/") || filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("/test/") || filePath.includes("/tests/");
}
function isConfigFile(filePath) {
  return filePath.includes(".config.") || filePath.includes("config/") || filePath.includes("vite.config") || filePath.includes("rollup.config") || filePath.includes("webpack.config");
}
function isTypeDeclarationFile(filePath) {
  return filePath.endsWith(".d.ts");
}
function isFrameworkAutoLoadedFile(filePath) {
  return filePath.includes("/pages/") || filePath.includes("/routes/") || filePath.includes("/middleware/") || filePath.includes("/commands/") || filePath.includes("/api/") || filePath.includes("/app/") || filePath.includes("/Controllers/") || filePath.includes("/Hubs/") || filePath.includes("/Migrations/") || // Java / Spring / Jakarta
  filePath.includes("/controller/") || filePath.includes("/controllers/") || filePath.includes("/service/") || filePath.includes("/repository/") || filePath.includes("/config/") || filePath.includes("/configuration/");
}
function isCppExcluded(attrs) {
  const filePath = attrs.file || attrs.filePath || "";
  const name = attrs.name || "";
  const kind = attrs.kind || "";
  if (/\.(?:h|hpp|hh|hxx|h\+\+|inl|ipp)$/.test(filePath)) {
    return true;
  }
  if (name === "main") return true;
  if (name.startsWith("operator")) return true;
  if (name.startsWith("~")) return true;
  if (kind === "constant" && /\.(?:h|hpp)$/.test(filePath)) return true;
  return false;
}
function isKotlinExcluded(attrs) {
  const filePath = attrs.file || attrs.filePath || "";
  const name = attrs.name || "";
  if (!filePath.endsWith(".kt") && !filePath.endsWith(".kts")) return false;
  if (name === "main") return true;
  const androidLifecycle = [
    "onCreate",
    "onStart",
    "onResume",
    "onPause",
    "onStop",
    "onDestroy",
    "onCreateView",
    "onViewCreated",
    "onDestroyView",
    "onSaveInstanceState",
    "onRestoreInstanceState",
    "onActivityResult",
    "onRequestPermissionsResult",
    "onConfigurationChanged",
    "onNewIntent"
  ];
  if (androidLifecycle.includes(name)) return true;
  if (["readObject", "writeObject", "readResolve", "writeReplace"].includes(name)) return true;
  if (name.startsWith("operator")) return true;
  return false;
}
function isPhpExcluded(attrs) {
  const filePath = attrs.file || attrs.filePath || "";
  const name = attrs.name || "";
  if (!filePath.endsWith(".php")) return false;
  const magicMethods = [
    "__construct",
    "__destruct",
    "__call",
    "__callStatic",
    "__get",
    "__set",
    "__isset",
    "__unset",
    "__sleep",
    "__wakeup",
    "__serialize",
    "__unserialize",
    "__toString",
    "__invoke",
    "__set_state",
    "__clone",
    "__debugInfo"
  ];
  if (magicMethods.includes(name)) return true;
  const wpHooks = [
    "init",
    "admin_init",
    "wp_enqueue_scripts",
    "admin_enqueue_scripts",
    "widgets_init",
    "register_activation_hook",
    "register_deactivation_hook",
    "add_action",
    "add_filter",
    "activate",
    "deactivate"
  ];
  if (wpHooks.includes(name)) return true;
  const laravelMethods = [
    "register",
    "boot",
    "handle",
    "authorize",
    "rules",
    "messages",
    "prepareForValidation",
    "failed",
    "broadcastOn",
    "broadcastAs",
    "broadcastWith"
  ];
  if (laravelMethods.includes(name)) return true;
  const symfonyMethods = [
    "__invoke",
    "getSubscribedEvents",
    "getSubscribedServices",
    "configureOptions",
    "buildForm",
    "load",
    "getConfigTreeBuilder"
  ];
  if (symfonyMethods.includes(name)) return true;
  if (name.startsWith("test") || name === "setUp" || name === "tearDown" || name === "setUpBeforeClass" || name === "tearDownAfterClass") return true;
  return false;
}
function isSwiftExcluded(attrs) {
  const filePath = attrs.file || attrs.filePath || "";
  const name = attrs.name || "";
  if (!filePath.endsWith(".swift")) return false;
  if (name === "main") return true;
  const appLifecycle = [
    "application",
    "applicationDidFinishLaunching",
    "applicationWillTerminate",
    "applicationDidBecomeActive",
    "applicationWillResignActive",
    "applicationDidEnterBackground",
    "applicationWillEnterForeground",
    "scene",
    "sceneDidDisconnect",
    "sceneDidBecomeActive",
    "sceneWillResignActive",
    "sceneWillEnterForeground",
    "sceneDidEnterBackground"
  ];
  if (appLifecycle.includes(name)) return true;
  if (name === "body" || name === "previews") return true;
  const protocolMethods = [
    "hash",
    "encode",
    "init",
    "deinit",
    "tableView",
    "collectionView",
    "numberOfSections",
    "numberOfRowsInSection",
    "cellForRowAt",
    "didSelectRowAt"
  ];
  if (protocolMethods.includes(name)) return true;
  if (["encode", "decode", "init(from:)"].includes(name)) return true;
  if (name.startsWith("test") || name === "setUp" || name === "tearDown" || name === "setUpWithError" || name === "tearDownWithError") return true;
  return false;
}
function isMojoExcluded(attrs) {
  const filePath = attrs.file || attrs.filePath || "";
  const name = attrs.name || "";
  if (!filePath.endsWith(".mojo") && !filePath.endsWith(".\u{1F525}")) return false;
  const lifecycleMethods = [
    "__init__",
    "__copyinit__",
    "__moveinit__",
    "__del__",
    "__enter__",
    "__exit__"
  ];
  if (lifecycleMethods.includes(name)) return true;
  const traitMethods = [
    "__str__",
    "__repr__",
    "__len__",
    "__getitem__",
    "__setitem__",
    "__eq__",
    "__ne__",
    "__lt__",
    "__le__",
    "__gt__",
    "__ge__",
    "__add__",
    "__sub__",
    "__mul__",
    "__truediv__",
    "__floordiv__",
    "__hash__",
    "__bool__",
    "__int__",
    "__float__",
    "__iter__",
    "__next__",
    "__contains__"
  ];
  if (traitMethods.includes(name)) return true;
  if (name.startsWith("__mlir_") || name.startsWith("_mlir_")) return true;
  if (name === "main") return true;
  return false;
}
function isRubyExcluded(attrs) {
  const filePath = attrs.file || attrs.filePath || "";
  const name = attrs.name || "";
  if (!filePath.endsWith(".rb") && !filePath.endsWith(".rake") && !filePath.endsWith(".gemspec")) return false;
  const railsCallbacks = [
    "before_action",
    "after_action",
    "around_action",
    "before_filter",
    "after_filter",
    "around_filter"
  ];
  if (railsCallbacks.includes(name)) return true;
  const arCallbacks = [
    "before_save",
    "after_save",
    "before_create",
    "after_create",
    "before_update",
    "after_update",
    "before_destroy",
    "after_destroy",
    "before_validation",
    "after_validation",
    "after_commit",
    "after_rollback",
    "after_initialize",
    "after_find"
  ];
  if (arCallbacks.includes(name)) return true;
  if (filePath.endsWith(".rake") || name === "task") return true;
  if (["it", "describe", "context", "specify", "subject", "let", "let!", "before", "after"].includes(name)) return true;
  if (name.startsWith("test_")) return true;
  if (name === "included" || name === "class_methods") return true;
  if (name === "initialize") return true;
  if (name === "method_missing" || name === "respond_to_missing?") return true;
  if (name === "concern" || name === "concerning") return true;
  const policyMethods = ["index?", "show?", "create?", "new?", "update?", "edit?", "destroy?"];
  if (policyMethods.includes(name)) return true;
  const deviseMethods = ["authenticate!", "valid?", "authenticate_user!", "current_user"];
  if (deviseMethods.includes(name)) return true;
  if (name === "main") return true;
  return false;
}
function isDartExcluded(attrs) {
  const filePath = attrs.file || attrs.filePath || "";
  const name = attrs.name || "";
  if (!filePath.endsWith(".dart")) return false;
  if (name === "main") return true;
  const widgetLifecycle = [
    "initState",
    "dispose",
    "build",
    "didChangeDependencies",
    "didUpdateWidget",
    "deactivate",
    "reassemble",
    "setState",
    "createState"
  ];
  if (widgetLifecycle.includes(name)) return true;
  if (["toString", "hashCode", "operator==", "noSuchMethod"].includes(name)) return true;
  if (["fromJson", "toJson", "fromMap", "toMap", "copyWith"].includes(name)) return true;
  if (["test", "testWidgets", "group", "setUp", "tearDown", "setUpAll", "tearDownAll"].includes(name)) return true;
  const riverpodPatterns = [
    "Provider",
    "StateProvider",
    "FutureProvider",
    "StreamProvider",
    "StateNotifierProvider",
    "ChangeNotifierProvider",
    "NotifierProvider",
    "AsyncNotifierProvider"
  ];
  if (riverpodPatterns.some((p) => name.includes(p))) return true;
  if (name.startsWith("mapEventToState") || name.startsWith("on")) return true;
  if (["onInit", "onReady", "onClose", "dependencies"].includes(name)) return true;
  const frameworkMethods = [
    "paint",
    "shouldRepaint",
    "shouldRebuild",
    "performLayout",
    "hitTest",
    "debugFillProperties",
    "toDiagnosticsNode"
  ];
  if (frameworkMethods.includes(name)) return true;
  return false;
}
function isRExcluded(attrs) {
  const filePath = attrs.file || attrs.filePath || "";
  const name = attrs.name || "";
  const isRFile = filePath.endsWith(".R") || filePath.endsWith(".r") || filePath.endsWith(".Rmd") || filePath.endsWith(".rmd");
  if (!isRFile) return false;
  if (["ui", "server", "shinyApp", "shinyUI", "shinyServer", "runApp"].includes(name)) return true;
  if (name === "pr" || name === "plumber") return true;
  if (["initialize", "finalize", "print", "clone", "format"].includes(name)) return true;
  if (name.includes(".") && !name.startsWith(".")) {
    const parts = name.split(".");
    if (parts.length >= 2 && parts[0].length > 0) return true;
  }
  if (name.startsWith("setMethod") || name.startsWith("setGeneric") || name.startsWith("setClass")) return true;
  if (filePath.includes("tests/testthat/") || filePath.includes("tests\\testthat\\")) return true;
  if (["test_that", "describe", "it", "context", "setup", "teardown"].includes(name)) return true;
  if (name.startsWith("expect_")) return true;
  if (name === "setup" && filePath.endsWith(".Rmd")) return true;
  if ([".onLoad", ".onAttach", ".onUnload", ".onDetach", ".First", ".Last"].includes(name)) return true;
  const operatorPrefixes = ["+.", "-.", "*.", "/.", "^.", "==.", "<.", ">.", "&.", "|.", "!.", "[.", "[[.", "$."];
  if (operatorPrefixes.some((op) => name.startsWith(op))) return true;
  return false;
}

// src/health/workspace-metrics.ts
function calculateWorkspaceOrphansScore(graph, projectRoot, includeFixtures = false) {
  const files = /* @__PURE__ */ new Set();
  const connectedFiles = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    if (!includeFixtures) {
      const relativePath = relative7(projectRoot, resolve16(projectRoot, attrs.filePath));
      if (isExcludedFromOrphanReporting(relativePath, { includeFixtures })) return;
    }
    files.add(attrs.filePath);
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      connectedFiles.add(sourceFile);
      connectedFiles.add(targetFile);
    }
  });
  const result = findDeadSymbols(graph, projectRoot, false, false, includeFixtures);
  return calculateOrphansScoreFromMetrics(
    graph,
    files,
    connectedFiles,
    result.symbols.length
  );
}

// src/health/index.ts
import { readFileSync as readFileSync18, writeFileSync, existsSync as existsSync20, mkdirSync as mkdirSync2 } from "fs";
import { dirname as dirname19, resolve as resolve17 } from "path";
function calculateHealthScore(graph, projectRoot) {
  if (graph.order === 0) {
    return {
      status: "no_parseable_files",
      overall: NaN,
      grade: "N/A",
      dimensions: [],
      summary: "No parseable files found. Nothing was analyzed, so no health score is reported.",
      recommendations: [],
      projectStats: {
        files: 0,
        symbols: 0,
        edges: 0,
        languages: {}
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message: "No parseable files found. Nothing was analyzed, so no health score is reported.",
      supportedExtensions: getSupportedExtensions()
    };
  }
  const coupling = calculateCouplingScore(graph);
  const cohesion = calculateCohesionScore(graph);
  const circular = calculateCircularDepsScore(graph);
  const godFiles = calculateGodFilesScore(graph);
  const orphans = calculateWorkspaceOrphansScore(graph, projectRoot);
  const depth = calculateDepthScore(graph);
  const dimensions = [coupling, cohesion, circular, godFiles, orphans, depth];
  const overall = Math.round(
    dimensions.reduce((sum, dim) => sum + dim.score * dim.weight, 0)
  );
  const files = /* @__PURE__ */ new Set();
  const languages2 = {};
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
    const ext = attrs.filePath.toLowerCase();
    let lang;
    if (ext.endsWith(".ts") || ext.endsWith(".tsx")) {
      lang = "TypeScript";
    } else if (ext.endsWith(".js") || ext.endsWith(".jsx") || ext.endsWith(".mjs") || ext.endsWith(".cjs")) {
      lang = "JavaScript";
    } else if (ext.endsWith(".py")) {
      lang = "Python";
    } else if (ext.endsWith(".go")) {
      lang = "Go";
    } else {
      lang = "Other";
    }
    languages2[lang] = (languages2[lang] || 0) + 1;
  });
  const grade = scoreToGrade(overall);
  let summary = `Project health score is ${overall}/100 (Grade: ${grade}). `;
  if (overall >= 90) {
    summary += "Excellent architecture with minimal issues.";
  } else if (overall >= 80) {
    summary += "Good architecture with some areas for improvement.";
  } else if (overall >= 70) {
    summary += "Moderate architecture quality. Consider refactoring high-risk areas.";
  } else if (overall >= 60) {
    summary += "Architecture needs improvement. Multiple issues detected.";
  } else {
    summary += "Poor architecture quality. Significant refactoring recommended.";
  }
  const recommendations = [];
  if (coupling.score < 70) {
    recommendations.push(`High coupling detected: Average ${coupling.metrics.avgConnections} connections per file. Consider breaking down large modules.`);
  }
  if (cohesion.score < 70) {
    recommendations.push(`Low cohesion: Only ${cohesion.metrics.avgInternalRatio}% internal dependencies. Reorganize files by feature or domain.`);
  }
  if (circular.score < 80 && typeof circular.metrics.cycles === "number" && circular.metrics.cycles > 0) {
    recommendations.push(`${circular.metrics.cycles} circular dependency cycle${circular.metrics.cycles === 1 ? "" : "s"} detected (${Number(circular.metrics.cyclesPer100).toFixed(1)} per 100 files). Break cycles by introducing interfaces or extracting shared code.`);
  }
  if (godFiles.score < 80 && typeof godFiles.metrics.godFiles === "number" && godFiles.metrics.godFiles > 0) {
    recommendations.push(`${godFiles.metrics.godFiles} god file${godFiles.metrics.godFiles === 1 ? "" : "s"} detected with >${godFiles.metrics.threshold} connections (${Number(godFiles.metrics.godFilesPer100).toFixed(1)} per 100 files). Split into smaller, focused modules.`);
  }
  if (orphans.score < 80 && typeof orphans.metrics.orphans === "number" && orphans.metrics.orphans > 0) {
    recommendations.push(`${orphans.metrics.orphans} orphan file${orphans.metrics.orphans === 1 ? "" : "s"} detected. Verify they're needed or remove dead code.`);
  }
  if (depth.score < 80 && typeof depth.metrics.maxDepth === "number") {
    recommendations.push(`Maximum dependency depth is ${depth.metrics.maxDepth} levels. Consider flattening the deepest chains.`);
  }
  if (recommendations.length === 0) {
    recommendations.push("No critical issues detected. Maintain current architecture quality.");
  }
  const report = {
    status: "scored",
    overall,
    grade,
    dimensions,
    summary,
    recommendations,
    projectStats: {
      files: files.size,
      symbols: graph.order,
      edges: graph.size,
      languages: languages2
    },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  saveHealthHistory(projectRoot, report);
  return report;
}
function getHealthTrend(projectRoot, currentScore) {
  const history = loadHealthHistory(projectRoot);
  if (history.length < 2) {
    return null;
  }
  const previous = history[history.length - 2];
  const delta = currentScore - previous.score;
  if (delta > 0) {
    return `\u2191 +${delta}`;
  } else if (delta < 0) {
    return `\u2193 ${delta}`;
  } else {
    return "\u2192 0";
  }
}
function saveHealthHistory(projectRoot, report) {
  const resolvedRoot = resolve17(projectRoot);
  const historyFile = resolve17(resolvedRoot, ".depwire", "health-history.json");
  if (!historyFile.startsWith(resolvedRoot)) {
    return;
  }
  const entry = {
    timestamp: report.timestamp,
    score: report.overall,
    grade: report.grade,
    dimensions: report.dimensions.map((d) => ({
      name: d.name,
      score: d.score,
      grade: d.grade
    }))
  };
  let history = [];
  if (existsSync20(historyFile)) {
    try {
      if (!historyFile.startsWith(resolvedRoot)) return;
      const content = readFileSync18(historyFile, "utf-8");
      history = JSON.parse(content);
    } catch {
    }
  }
  history.push(entry);
  if (history.length > 50) {
    history = history.slice(-50);
  }
  mkdirSync2(dirname19(historyFile), { recursive: true });
  if (!historyFile.startsWith(resolvedRoot)) return;
  writeFileSync(historyFile, JSON.stringify(history, null, 2), "utf-8");
}
function loadHealthHistory(projectRoot) {
  const resolvedRoot = resolve17(projectRoot);
  const historyFile = resolve17(resolvedRoot, ".depwire", "health-history.json");
  if (!historyFile.startsWith(resolvedRoot) || !existsSync20(historyFile)) {
    return [];
  }
  try {
    if (!historyFile.startsWith(resolvedRoot)) return [];
    const content = readFileSync18(historyFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// src/dead-code/classifier.ts
import path3 from "path";
function classifyDeadSymbols(symbols, graph) {
  return symbols.map((symbol) => {
    const confidence = calculateConfidence(symbol, graph);
    const reason = generateReason(symbol, confidence);
    return {
      ...symbol,
      confidence,
      reason
    };
  });
}
function calculateConfidence(symbol, graph) {
  if (!symbol.exported && symbol.dependents === 0) {
    return "high";
  }
  if (symbol.exported && symbol.dependents === 0 && !isBarrelFile(symbol.file)) {
    return "high";
  }
  if (symbol.exported && symbol.dependents === 0 && isBarrelFile(symbol.file)) {
    return "medium";
  }
  const dependents = getSymbolDependents(symbol, graph);
  if (dependents.length === 1 && isTestFile4(dependents[0])) {
    return "medium";
  }
  if (symbol.exported && isPackageEntryPoint(symbol.file)) {
    return "low";
  }
  if ((symbol.kind === "interface" || symbol.kind === "type") && symbol.dependents === 0) {
    return "low";
  }
  if (isLikelyDynamicUsage(symbol)) {
    return "low";
  }
  return "medium";
}
function generateReason(symbol, confidence) {
  if (!symbol.exported && symbol.dependents === 0) {
    return "Not exported, zero references";
  }
  if (symbol.exported && symbol.dependents === 0 && !isBarrelFile(symbol.file)) {
    return "Exported, zero dependents";
  }
  if (symbol.exported && symbol.dependents === 0 && isBarrelFile(symbol.file)) {
    return "Exported from barrel file, zero dependents (might be used externally)";
  }
  if (confidence === "medium") {
    return "Low usage, might be dead";
  }
  if (confidence === "low") {
    if (symbol.kind === "interface" || symbol.kind === "type") {
      return "Type with zero dependents (might be used via import type)";
    }
    if (isPackageEntryPoint(symbol.file)) {
      return "Exported from package entry point (might be public API)";
    }
    if (isLikelyDynamicUsage(symbol)) {
      return "In dynamic-use pattern directory (might be auto-loaded)";
    }
  }
  return "Potentially unused";
}
function isBarrelFile(filePath) {
  const basename17 = path3.basename(filePath);
  return basename17 === "index.ts" || basename17 === "index.js";
}
function isTestFile4(filePath) {
  return filePath.includes("__tests__/") || filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("/test/") || filePath.includes("/tests/");
}
function isPackageEntryPoint(filePath) {
  return filePath.includes("/src/index.") || filePath.includes("/lib/index.") || filePath.endsWith("/index.ts") || filePath.endsWith("/index.js");
}
function isLikelyDynamicUsage(symbol) {
  const filePath = symbol.file;
  return filePath.includes("/routes/") || filePath.includes("/pages/") || filePath.includes("/middleware/") || filePath.includes("/commands/") || filePath.includes("/handlers/") || filePath.includes("/api/");
}
function getSymbolDependents(symbol, graph) {
  const dependents = [];
  for (const node of graph.nodes()) {
    const attrs = graph.getNodeAttributes(node);
    if (attrs.file === symbol.file && attrs.name === symbol.name) {
      const inNeighbors = graph.inNeighbors(node);
      for (const neighbor of inNeighbors) {
        const neighborAttrs = graph.getNodeAttributes(neighbor);
        if (neighborAttrs.file) {
          dependents.push(neighborAttrs.file);
        }
      }
      break;
    }
  }
  return dependents;
}

// src/dead-code/display.ts
import chalk from "chalk";
import path4 from "path";
function displayDeadCodeReport(report, options, projectRoot) {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(chalk.cyan.bold("\n\u{1F50D} Dead Code Analysis\n"));
  const { high, medium, low } = report.byConfidence;
  console.log(
    `Found ${chalk.yellow.bold(report.deadSymbols)} potentially dead symbols (${chalk.red(high)} high, ${chalk.yellow(medium)} medium, ${chalk.gray(low)} low confidence)
`
  );
  const symbolsByConfidence = groupByConfidence(report.symbols);
  if (symbolsByConfidence.high.length > 0) {
    displayConfidenceGroup("HIGH", symbolsByConfidence.high, options.verbose, projectRoot);
  }
  if (symbolsByConfidence.medium.length > 0) {
    displayConfidenceGroup("MEDIUM", symbolsByConfidence.medium, options.verbose, projectRoot);
  }
  if (symbolsByConfidence.low.length > 0) {
    displayConfidenceGroup("LOW", symbolsByConfidence.low, options.verbose, projectRoot);
  }
  if (options.stats) {
    displayStats(report);
  }
}
function groupByConfidence(symbols) {
  return symbols.reduce(
    (acc, symbol) => {
      acc[symbol.confidence].push(symbol);
      return acc;
    },
    { high: [], medium: [], low: [] }
  );
}
function displayConfidenceGroup(level, symbols, verbose, projectRoot) {
  const emoji = level === "HIGH" ? "\u{1F534}" : level === "MEDIUM" ? "\u{1F7E1}" : "\u26AA";
  const color = level === "HIGH" ? chalk.red : level === "MEDIUM" ? chalk.yellow : chalk.gray;
  console.log(
    color.bold(`
${emoji} ${level} CONFIDENCE `) + chalk.gray(`(${level === "HIGH" ? "definitely" : level === "MEDIUM" ? "probably" : "might be"} dead)`)
  );
  if (verbose) {
    const headers = ["Symbol", "Kind", "File", "Reason"];
    const rows = symbols.map((symbol) => {
      const relativePath = path4.relative(projectRoot, symbol.file);
      return [
        chalk.bold(symbol.name),
        symbol.kind,
        `${relativePath}:${symbol.line}`,
        symbol.reason
      ];
    });
    displayTable(headers, rows);
  } else {
    symbols.forEach((symbol) => {
      const relativePath = path4.relative(projectRoot, symbol.file);
      console.log(`  ${relativePath} :: ${symbol.name}`);
    });
  }
}
function displayTable(headers, rows) {
  if (rows.length === 0) return;
  const columnWidths = headers.map((header2, i) => {
    const maxRowWidth = Math.max(...rows.map((row) => stripAnsi(row[i]).length));
    return Math.max(header2.length, maxRowWidth);
  });
  const separator = "\u250C" + columnWidths.map((w) => "\u2500".repeat(w + 2)).join("\u252C") + "\u2510";
  const headerRow = "\u2502 " + headers.map((h, i) => h.padEnd(columnWidths[i])).join(" \u2502 ") + " \u2502";
  const divider = "\u251C" + columnWidths.map((w) => "\u2500".repeat(w + 2)).join("\u253C") + "\u2524";
  const footer = "\u2514" + columnWidths.map((w) => "\u2500".repeat(w + 2)).join("\u2534") + "\u2518";
  console.log(separator);
  console.log(headerRow);
  console.log(divider);
  for (const row of rows) {
    const formattedRow = "\u2502 " + row.map((cell, i) => {
      const stripped = stripAnsi(cell);
      const padding = columnWidths[i] - stripped.length;
      return cell + " ".repeat(padding);
    }).join(" \u2502 ") + " \u2502";
    console.log(formattedRow);
  }
  console.log(footer);
}
function displayStats(report) {
  console.log(chalk.cyan.bold("\n\u{1F4CA} Summary\n"));
  console.log(`  Total symbols analyzed: ${chalk.bold((report.totalSymbols ?? 0).toLocaleString())}`);
  console.log(`  Potentially dead: ${chalk.yellow.bold(report.deadSymbols ?? 0)} (${(report.deadPercentage ?? 0).toFixed(1)}%)`);
  console.log(
    `  By confidence: ${chalk.red(report.byConfidence?.high ?? 0)} high, ${chalk.yellow(report.byConfidence?.medium ?? 0)} medium, ${chalk.gray(report.byConfidence?.low ?? 0)} low`
  );
  const estimatedLines = (report.deadSymbols ?? 0) * 18;
  console.log(`  Estimated dead code: ${chalk.gray(`~${estimatedLines.toLocaleString()} lines`)}
`);
}
function stripAnsi(str) {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );
}

// src/dead-code/index.ts
function analyzeDeadCode(graph, projectRoot, options = {}) {
  const opts = {
    confidence: options.confidence || "medium",
    includeTests: options.includeTests || false,
    verbose: options.verbose || false,
    stats: options.stats || false,
    json: options.json || false,
    debug: options.debug || false
  };
  const { symbols: rawDeadSymbols } = findDeadSymbols(
    graph,
    projectRoot,
    opts.includeTests,
    opts.debug
  );
  const classifiedSymbols = classifyDeadSymbols(rawDeadSymbols, graph);
  const filteredSymbols = filterByConfidence(classifiedSymbols, opts.confidence);
  if (opts.debug || process.env.DEPWIRE_DEBUG_FUNNEL === "1") {
    console.error(`  8. Survived confidence filter:  ${filteredSymbols.length} (of ${classifiedSymbols.length} classified, min confidence = "${opts.confidence}")`);
  }
  const totalSymbols = graph.order;
  const byConfidence = {
    high: classifiedSymbols.filter((s) => s.confidence === "high").length,
    medium: classifiedSymbols.filter((s) => s.confidence === "medium").length,
    low: classifiedSymbols.filter((s) => s.confidence === "low").length
  };
  const report = {
    totalSymbols,
    deadSymbols: filteredSymbols.length,
    deadPercentage: filteredSymbols.length / totalSymbols * 100,
    byConfidence,
    symbols: filteredSymbols
  };
  if (!opts.json) {
    displayDeadCodeReport(report, opts, projectRoot);
  }
  return report;
}
function filterByConfidence(symbols, minConfidence) {
  const confidenceLevels = { high: 3, medium: 2, low: 1 };
  const minLevel = confidenceLevels[minConfidence];
  return symbols.filter(
    (s) => confidenceLevels[s.confidence] >= minLevel
  );
}

// src/docs/generator.ts
import { writeFileSync as writeFileSync3, mkdirSync as mkdirSync3, existsSync as existsSync23 } from "fs";
import { join as join26 } from "path";

// src/docs/architecture.ts
import { dirname as dirname20 } from "path";

// src/docs/templates.ts
function header(text, level = 1) {
  return `${"#".repeat(level)} ${text}

`;
}
function code(text) {
  return `\`${text}\``;
}
function codeBlock(code3, lang = "") {
  return `\`\`\`${lang}
${code3}
\`\`\`

`;
}
function unorderedList(items) {
  return items.map((item) => `- ${item}`).join("\n") + "\n\n";
}
function orderedList(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n") + "\n\n";
}
function table(headers, rows) {
  const headerRow = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return `${headerRow}
${separator}
${dataRows}

`;
}
function blockquote(text) {
  return `> ${text}

`;
}
function timestamp(version, date, fileCount, symbolCount) {
  return blockquote(`Auto-generated by Depwire ${version} on ${date} | ${fileCount.toLocaleString()} files, ${symbolCount.toLocaleString()} symbols`);
}
function formatNumber(n) {
  return (n ?? 0).toLocaleString();
}
function formatPercent(value, total) {
  if (total === 0) return "0.0%";
  return `${(value / total * 100).toFixed(1)}%`;
}
function impactEmoji(count) {
  if (count >= 20) return "\u{1F534}";
  if (count >= 10) return "\u{1F7E1}";
  if (count >= 5) return "\u{1F7E2}";
  return "\u26AA";
}

// src/docs/architecture.ts
function generateArchitecture(graph, projectRoot, version, parseTime) {
  const startTime = Date.now();
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  output += timestamp(version, now, getFileCount(graph), graph.order);
  output += header("Architecture Overview");
  output += header("Project Summary", 2);
  output += generateProjectSummary(graph, parseTime);
  output += header("Module Structure", 2);
  output += generateModuleStructure(graph);
  output += header("Entry Points", 2);
  output += generateEntryPoints(graph);
  output += header("Hub Files", 2);
  output += generateHubFiles(graph);
  output += header("Layer Analysis", 2);
  output += generateLayerAnalysis(graph);
  output += header("Circular Dependencies", 2);
  output += generateCircularDependencies(graph);
  return output;
}
function getFileCount(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function getLanguageStats(graph) {
  const stats = {};
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    if (!files.has(attrs.filePath)) {
      files.add(attrs.filePath);
      const ext = attrs.filePath.toLowerCase();
      let lang;
      if (ext.endsWith(".ts") || ext.endsWith(".tsx")) {
        lang = "TypeScript";
      } else if (ext.endsWith(".py")) {
        lang = "Python";
      } else if (ext.endsWith(".js") || ext.endsWith(".jsx") || ext.endsWith(".mjs") || ext.endsWith(".cjs")) {
        lang = "JavaScript";
      } else if (ext.endsWith(".go")) {
        lang = "Go";
      } else {
        lang = "Other";
      }
      stats[lang] = (stats[lang] || 0) + 1;
    }
  });
  return stats;
}
function generateProjectSummary(graph, parseTime) {
  const fileCount = getFileCount(graph);
  const symbolCount = graph.order;
  const edgeCount = graph.size;
  const languages2 = getLanguageStats(graph);
  let output = "";
  output += `- **Total Files:** ${formatNumber(fileCount)}
`;
  output += `- **Total Symbols:** ${formatNumber(symbolCount)}
`;
  output += `- **Total Edges:** ${formatNumber(edgeCount)}
`;
  output += `- **Parse Time:** ${parseTime.toFixed(1)}s
`;
  if (Object.keys(languages2).length > 1) {
    output += "\n**Languages:**\n\n";
    const totalFiles = fileCount;
    for (const [lang, count] of Object.entries(languages2).sort((a, b) => b[1] - a[1])) {
      output += `- ${lang}: ${count} files (${formatPercent(count, totalFiles)})
`;
    }
  }
  output += "\n";
  return output;
}
function generateModuleStructure(graph) {
  const dirStats = getDirectoryStats(graph);
  if (dirStats.length === 0) {
    return "No module structure detected (single file or flat structure).\n\n";
  }
  const headers = ["Directory", "Files", "Symbols", "Connections", "Role"];
  const rows = dirStats.slice(0, 15).map((dir) => [
    `\`${dir.name}\``,
    formatNumber(dir.fileCount),
    formatNumber(dir.symbolCount),
    formatNumber(dir.connectionCount),
    dir.role
  ]);
  return table(headers, rows);
}
function getDirectoryStats(graph) {
  const dirMap = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    const dir = dirname20(attrs.filePath);
    if (dir === ".") return;
    if (!dirMap.has(dir)) {
      dirMap.set(dir, {
        name: dir,
        fileCount: 0,
        symbolCount: 0,
        connectionCount: 0,
        role: "",
        typeCount: 0,
        functionCount: 0,
        outboundEdges: 0,
        inboundEdges: 0
      });
    }
    const dirStat = dirMap.get(dir);
    dirStat.symbolCount++;
    if (attrs.kind === "interface" || attrs.kind === "type_alias") {
      dirStat.typeCount++;
    } else if (attrs.kind === "function" || attrs.kind === "method") {
      dirStat.functionCount++;
    }
  });
  const filesPerDir = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    const dir = dirname20(attrs.filePath);
    if (!filesPerDir.has(dir)) {
      filesPerDir.set(dir, /* @__PURE__ */ new Set());
    }
    filesPerDir.get(dir).add(attrs.filePath);
  });
  filesPerDir.forEach((files, dir) => {
    if (dirMap.has(dir)) {
      dirMap.get(dir).fileCount = files.size;
    }
  });
  const dirEdges = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    const sourceDir = dirname20(sourceAttrs.filePath);
    const targetDir = dirname20(targetAttrs.filePath);
    if (sourceDir !== targetDir) {
      if (!dirEdges.has(sourceDir)) {
        dirEdges.set(sourceDir, { in: 0, out: 0 });
      }
      if (!dirEdges.has(targetDir)) {
        dirEdges.set(targetDir, { in: 0, out: 0 });
      }
      dirEdges.get(sourceDir).out++;
      dirEdges.get(targetDir).in++;
    }
  });
  dirEdges.forEach((edges, dir) => {
    if (dirMap.has(dir)) {
      const stat = dirMap.get(dir);
      stat.inboundEdges = edges.in;
      stat.outboundEdges = edges.out;
      stat.connectionCount = edges.in + edges.out;
    }
  });
  dirMap.forEach((dir) => {
    const typeRatio = dir.symbolCount > 0 ? dir.typeCount / dir.symbolCount : 0;
    const outboundRatio = dir.connectionCount > 0 ? dir.outboundEdges / dir.connectionCount : 0;
    const inboundRatio = dir.connectionCount > 0 ? dir.inboundEdges / dir.connectionCount : 0;
    if (typeRatio > 0.7) {
      dir.role = "Type definitions";
    } else if (outboundRatio > 0.7) {
      dir.role = "Orchestration / Entry points";
    } else if (inboundRatio > 0.7) {
      dir.role = "Shared utilities / Foundation";
    } else {
      dir.role = "Core logic";
    }
  });
  return Array.from(dirMap.values()).sort((a, b) => b.symbolCount - a.symbolCount);
}
function generateEntryPoints(graph) {
  const fileStats = getFileStats(graph);
  const entryPoints = fileStats.filter((f) => f.outgoingRefs > 0).map((f) => ({
    ...f,
    ratio: f.incomingRefs === 0 ? Infinity : f.outgoingRefs / (f.incomingRefs + 1)
  })).sort((a, b) => b.ratio - a.ratio).slice(0, 5);
  if (entryPoints.length === 0) {
    return "No clear entry points detected.\n\n";
  }
  const headers = ["File", "Outgoing", "Incoming", "Ratio"];
  const rows = entryPoints.map((f) => [
    `\`${f.filePath}\``,
    formatNumber(f.outgoingRefs),
    formatNumber(f.incomingRefs),
    f.ratio === Infinity ? "\u221E" : f.ratio.toFixed(1)
  ]);
  return table(headers, rows);
}
function generateHubFiles(graph) {
  const fileStats = getFileStats(graph);
  const hubFiles = fileStats.sort((a, b) => b.incomingRefs - a.incomingRefs).slice(0, 10);
  if (hubFiles.length === 0 || hubFiles[0].incomingRefs === 0) {
    return "No hub files detected.\n\n";
  }
  const headers = ["File", "Dependents", "Symbols"];
  const rows = hubFiles.map((f) => [
    `\`${f.filePath}\``,
    formatNumber(f.incomingRefs),
    formatNumber(f.symbolCount)
  ]);
  return table(headers, rows);
}
function getFileStats(graph) {
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
  return result;
}
function generateLayerAnalysis(graph) {
  const dirStats = getDirectoryStats(graph);
  if (dirStats.length === 0) {
    return "No layered architecture detected (flat or single-file project).\n\n";
  }
  const foundation = dirStats.filter((d) => d.inboundEdges > d.outboundEdges * 2);
  const orchestration = dirStats.filter((d) => d.outboundEdges > d.inboundEdges * 2);
  const core = dirStats.filter((d) => !foundation.includes(d) && !orchestration.includes(d));
  let output = "";
  if (foundation.length > 0) {
    output += "**Foundation Layer** (mostly imported by others):\n\n";
    output += unorderedList(foundation.map((d) => `\`${d.name}\` \u2014 ${d.role}`));
  }
  if (core.length > 0) {
    output += "**Core Layer** (balanced dependencies):\n\n";
    output += unorderedList(core.map((d) => `\`${d.name}\` \u2014 ${d.role}`));
  }
  if (orchestration.length > 0) {
    output += "**Orchestration Layer** (mostly imports from others):\n\n";
    output += unorderedList(orchestration.map((d) => `\`${d.name}\` \u2014 ${d.role}`));
  }
  return output;
}
function generateCircularDependencies(graph) {
  const cycles = detectCycles(graph);
  if (cycles.length === 0) {
    return "\u2705 No circular dependencies detected.\n\n";
  }
  let output = `\u26A0\uFE0F Found ${cycles.length} circular ${cycles.length === 1 ? "dependency" : "dependencies"}:

`;
  for (let i = 0; i < Math.min(cycles.length, 10); i++) {
    const cycle = cycles[i];
    output += `**Cycle ${i + 1}:**

`;
    output += codeBlock(cycle.path.join(" \u2192\n"), "");
    output += `**Suggested fix:** ${cycle.suggestion}

`;
  }
  if (cycles.length > 10) {
    output += `... and ${cycles.length - 10} more cycles.

`;
  }
  return output;
}
function detectCycles(graph) {
  const cycles = [];
  const visited = /* @__PURE__ */ new Set();
  const recStack = /* @__PURE__ */ new Set();
  const pathStack = [];
  const fileGraph = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      if (!fileGraph.has(sourceFile)) {
        fileGraph.set(sourceFile, /* @__PURE__ */ new Set());
      }
      fileGraph.get(sourceFile).add(targetFile);
    }
  });
  function dfs(file) {
    visited.add(file);
    recStack.add(file);
    pathStack.push(file);
    const neighbors = fileGraph.get(file);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          const cycleStart = pathStack.indexOf(neighbor);
          const cyclePath = pathStack.slice(cycleStart);
          cyclePath.push(neighbor);
          cycles.push({
            path: cyclePath,
            suggestion: "Extract shared types/interfaces to a common file"
          });
          return true;
        }
      }
    }
    recStack.delete(file);
    pathStack.pop();
    return false;
  }
  for (const file of fileGraph.keys()) {
    if (!visited.has(file)) {
      dfs(file);
      recStack.clear();
      pathStack.length = 0;
    }
  }
  return cycles;
}

// src/docs/conventions.ts
import { basename as basename14, extname as extname13 } from "path";
function generateConventions(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount2(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("Code Conventions");
  output += "Auto-detected coding patterns and conventions in this codebase.\n\n";
  output += header("File Organization", 2);
  output += generateFileOrganization(graph);
  output += header("Naming Patterns", 2);
  output += generateNamingPatterns(graph);
  output += header("Import Style", 2);
  output += generateImportStyle(graph);
  output += header("Export Patterns", 2);
  output += generateExportPatterns(graph);
  output += header("Symbol Distribution", 2);
  output += generateSymbolDistribution(graph);
  output += header("Detected Design Patterns", 2);
  output += generateDesignPatterns(graph);
  return output;
}
function getFileCount2(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function generateFileOrganization(graph) {
  const files = /* @__PURE__ */ new Set();
  let barrelFileCount = 0;
  let testFileCount = 0;
  let totalLines = 0;
  const fileSizes = [];
  graph.forEachNode((node, attrs) => {
    if (!files.has(attrs.filePath)) {
      files.add(attrs.filePath);
      const fileName = basename14(attrs.filePath);
      if (fileName === "index.ts" || fileName === "index.js" || fileName === "index.tsx" || fileName === "index.jsx") {
        barrelFileCount++;
      }
      if (fileName.includes(".test.") || fileName.includes(".spec.") || attrs.filePath.includes("__tests__")) {
        testFileCount++;
      }
      const maxLine = getMaxLineNumber(graph, attrs.filePath);
      if (maxLine > 0) {
        fileSizes.push(maxLine);
        totalLines += maxLine;
      }
    }
  });
  const avgFileSize = fileSizes.length > 0 ? Math.round(totalLines / fileSizes.length) : 0;
  const medianFileSize = fileSizes.length > 0 ? getMedian(fileSizes) : 0;
  let output = "";
  output += `- **Total Files:** ${formatNumber(files.size)}
`;
  output += `- **Barrel Files (index.*):** ${formatNumber(barrelFileCount)} (${formatPercent(barrelFileCount, files.size)})
`;
  output += `- **Test Files:** ${formatNumber(testFileCount)} (${formatPercent(testFileCount, files.size)})
`;
  if (avgFileSize > 0) {
    output += `- **Average File Size:** ${formatNumber(avgFileSize)} lines
`;
    output += `- **Median File Size:** ${formatNumber(medianFileSize)} lines
`;
  }
  output += "\n";
  return output;
}
function getMaxLineNumber(graph, filePath) {
  let maxLine = 0;
  graph.forEachNode((node, attrs) => {
    if (attrs.filePath === filePath) {
      maxLine = Math.max(maxLine, attrs.endLine);
    }
  });
  return maxLine;
}
function getMedian(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}
function generateNamingPatterns(graph) {
  const patterns = {
    files: { camelCase: 0, PascalCase: 0, kebabCase: 0, snakeCase: 0, total: 0 },
    functions: { camelCase: 0, PascalCase: 0, snakeCase: 0, total: 0 },
    classes: { PascalCase: 0, other: 0, total: 0 },
    interfaces: { IPrefixed: 0, PascalCase: 0, other: 0, total: 0 },
    constants: { UPPER_SNAKE: 0, other: 0, total: 0 },
    types: { PascalCase: 0, camelCase: 0, other: 0, total: 0 }
  };
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    if (!files.has(attrs.filePath)) {
      files.add(attrs.filePath);
      const fileName = basename14(attrs.filePath, extname13(attrs.filePath));
      if (isCamelCase(fileName)) patterns.files.camelCase++;
      else if (isPascalCase(fileName)) patterns.files.PascalCase++;
      else if (isKebabCase(fileName)) patterns.files.kebabCase++;
      else if (isSnakeCase(fileName)) patterns.files.snakeCase++;
      patterns.files.total++;
    }
    const name = attrs.name;
    const kind = attrs.kind;
    if (kind === "function" || kind === "method") {
      if (isCamelCase(name)) patterns.functions.camelCase++;
      else if (isPascalCase(name)) patterns.functions.PascalCase++;
      else if (isSnakeCase(name)) patterns.functions.snakeCase++;
      patterns.functions.total++;
    } else if (kind === "class") {
      if (isPascalCase(name)) patterns.classes.PascalCase++;
      else patterns.classes.other++;
      patterns.classes.total++;
    } else if (kind === "interface") {
      if (name.startsWith("I") && isPascalCase(name.slice(1))) patterns.interfaces.IPrefixed++;
      else if (isPascalCase(name)) patterns.interfaces.PascalCase++;
      else patterns.interfaces.other++;
      patterns.interfaces.total++;
    } else if (kind === "constant") {
      if (isUpperSnakeCase(name)) patterns.constants.UPPER_SNAKE++;
      else patterns.constants.other++;
      patterns.constants.total++;
    } else if (kind === "type_alias") {
      if (isPascalCase(name)) patterns.types.PascalCase++;
      else if (isCamelCase(name)) patterns.types.camelCase++;
      else patterns.types.other++;
      patterns.types.total++;
    }
  });
  let output = "";
  if (patterns.files.total > 0) {
    output += "**File Naming:**\n\n";
    if (patterns.files.kebabCase > 0) {
      output += `- kebab-case: ${formatPercent(patterns.files.kebabCase, patterns.files.total)}
`;
    }
    if (patterns.files.camelCase > 0) {
      output += `- camelCase: ${formatPercent(patterns.files.camelCase, patterns.files.total)}
`;
    }
    if (patterns.files.PascalCase > 0) {
      output += `- PascalCase: ${formatPercent(patterns.files.PascalCase, patterns.files.total)}
`;
    }
    if (patterns.files.snakeCase > 0) {
      output += `- snake_case: ${formatPercent(patterns.files.snakeCase, patterns.files.total)}
`;
    }
    output += "\n";
  }
  if (patterns.functions.total > 0) {
    output += "**Function Naming:**\n\n";
    if (patterns.functions.camelCase > 0) {
      output += `- camelCase: ${formatPercent(patterns.functions.camelCase, patterns.functions.total)}
`;
    }
    if (patterns.functions.snakeCase > 0) {
      output += `- snake_case: ${formatPercent(patterns.functions.snakeCase, patterns.functions.total)}
`;
    }
    if (patterns.functions.PascalCase > 0) {
      output += `- PascalCase: ${formatPercent(patterns.functions.PascalCase, patterns.functions.total)}
`;
    }
    output += "\n";
  }
  if (patterns.classes.total > 0) {
    output += "**Class Naming:**\n\n";
    output += `- PascalCase: ${formatPercent(patterns.classes.PascalCase, patterns.classes.total)}
`;
    if (patterns.classes.other > 0) {
      output += `- Other: ${formatPercent(patterns.classes.other, patterns.classes.total)}
`;
    }
    output += "\n";
  }
  if (patterns.interfaces.total > 0) {
    output += "**Interface Naming:**\n\n";
    if (patterns.interfaces.IPrefixed > 0) {
      output += `- I-prefix (IPerson): ${formatPercent(patterns.interfaces.IPrefixed, patterns.interfaces.total)}
`;
    }
    if (patterns.interfaces.PascalCase > 0) {
      output += `- PascalCase (Person): ${formatPercent(patterns.interfaces.PascalCase, patterns.interfaces.total)}
`;
    }
    if (patterns.interfaces.other > 0) {
      output += `- Other: ${formatPercent(patterns.interfaces.other, patterns.interfaces.total)}
`;
    }
    output += "\n";
  }
  if (patterns.types.total > 0) {
    output += "**Type Naming:**\n\n";
    if (patterns.types.PascalCase > 0) {
      output += `- PascalCase: ${formatPercent(patterns.types.PascalCase, patterns.types.total)}
`;
    }
    if (patterns.types.camelCase > 0) {
      output += `- camelCase: ${formatPercent(patterns.types.camelCase, patterns.types.total)}
`;
    }
    if (patterns.types.other > 0) {
      output += `- Other: ${formatPercent(patterns.types.other, patterns.types.total)}
`;
    }
    output += "\n";
  }
  if (patterns.constants.total > 0) {
    output += "**Constant Naming:**\n\n";
    output += `- UPPER_SNAKE_CASE: ${formatPercent(patterns.constants.UPPER_SNAKE, patterns.constants.total)}
`;
    if (patterns.constants.other > 0) {
      output += `- Other: ${formatPercent(patterns.constants.other, patterns.constants.total)}
`;
    }
    output += "\n";
  }
  return output;
}
function generateImportStyle(graph) {
  let barrelImportCount = 0;
  let pathAliasCount = 0;
  let totalImports = 0;
  let namedExportCount = 0;
  let defaultExportCount = 0;
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath && attrs.kind === "imports") {
      totalImports++;
      if (targetAttrs.filePath.endsWith("/index.ts") || targetAttrs.filePath.endsWith("/index.js")) {
        barrelImportCount++;
      }
      if (targetAttrs.filePath.startsWith("@/") || targetAttrs.filePath.startsWith("~/") || targetAttrs.filePath.startsWith("src/")) {
        pathAliasCount++;
      }
    }
  });
  graph.forEachNode((node, attrs) => {
    if (attrs.exported) {
      if (attrs.name === "default") {
        defaultExportCount++;
      } else {
        namedExportCount++;
      }
    }
  });
  let output = "";
  if (totalImports > 0) {
    output += `- **Total Cross-File Imports:** ${formatNumber(totalImports)}
`;
    if (barrelImportCount > 0) {
      output += `- **Barrel Imports (from index files):** ${formatPercent(barrelImportCount, totalImports)}
`;
    }
    if (pathAliasCount > 0) {
      output += `- **Path Alias Usage (@/ or ~/):** ${formatPercent(pathAliasCount, totalImports)}
`;
    }
  }
  output += "\n";
  return output;
}
function generateExportPatterns(graph) {
  let namedExportCount = 0;
  let defaultExportCount = 0;
  let reExportCount = 0;
  graph.forEachNode((node, attrs) => {
    if (attrs.exported) {
      if (attrs.name === "default") {
        defaultExportCount++;
      } else {
        namedExportCount++;
      }
    }
    if (attrs.kind === "export") {
      reExportCount++;
    }
  });
  const totalExports = namedExportCount + defaultExportCount;
  let output = "";
  if (totalExports > 0) {
    output += `- **Named Exports:** ${formatNumber(namedExportCount)} (${formatPercent(namedExportCount, totalExports)})
`;
    output += `- **Default Exports:** ${formatNumber(defaultExportCount)} (${formatPercent(defaultExportCount, totalExports)})
`;
    if (reExportCount > 0) {
      output += `- **Re-exports:** ${formatNumber(reExportCount)}
`;
    }
  }
  output += "\n";
  return output;
}
function generateSymbolDistribution(graph) {
  const symbolCounts = {
    function: 0,
    class: 0,
    variable: 0,
    constant: 0,
    type_alias: 0,
    interface: 0,
    enum: 0,
    import: 0,
    export: 0,
    method: 0,
    property: 0,
    decorator: 0,
    module: 0,
    template: 0
  };
  graph.forEachNode((node, attrs) => {
    symbolCounts[attrs.kind]++;
  });
  const total = graph.order;
  const rows = [];
  for (const [kind, count] of Object.entries(symbolCounts)) {
    if (count > 0) {
      rows.push([kind, formatNumber(count), formatPercent(count, total)]);
    }
  }
  rows.sort((a, b) => parseInt(b[1].replace(/,/g, "")) - parseInt(a[1].replace(/,/g, "")));
  return table(["Symbol Kind", "Count", "Percentage"], rows);
}
function generateDesignPatterns(graph) {
  const patterns = {
    service: 0,
    factory: 0,
    hook: 0,
    middleware: 0,
    controller: 0,
    repository: 0,
    handler: 0
  };
  graph.forEachNode((node, attrs) => {
    const name = attrs.name;
    const file = attrs.filePath.toLowerCase();
    if (attrs.kind === "class" && name.endsWith("Service")) {
      patterns.service++;
    }
    if (attrs.kind === "function" && name.startsWith("create")) {
      patterns.factory++;
    }
    if (attrs.kind === "function" && name.startsWith("use") && name.length > 3) {
      patterns.hook++;
    }
    if (file.includes("middleware")) {
      patterns.middleware++;
    }
    if ((attrs.kind === "class" || attrs.kind === "function") && name.endsWith("Controller")) {
      patterns.controller++;
    }
    if ((attrs.kind === "class" || attrs.kind === "function") && name.endsWith("Repository")) {
      patterns.repository++;
    }
    if ((attrs.kind === "class" || attrs.kind === "function") && name.endsWith("Handler")) {
      patterns.handler++;
    }
  });
  const detected = Object.entries(patterns).filter(([, count]) => count > 0);
  if (detected.length === 0) {
    return "No common design patterns detected.\n\n";
  }
  let output = "";
  for (const [pattern, count] of detected) {
    const description = getPatternDescription(pattern);
    output += `- **${capitalizeFirst(pattern)} Pattern:** ${count} occurrences \u2014 ${description}
`;
  }
  output += "\n";
  return output;
}
function getPatternDescription(pattern) {
  switch (pattern) {
    case "service":
      return 'Classes ending in "Service"';
    case "factory":
      return 'Functions starting with "create"';
    case "hook":
      return 'Functions starting with "use" (React hooks)';
    case "middleware":
      return "Files in middleware directories";
    case "controller":
      return "Controllers for handling requests";
    case "repository":
      return "Data access layer pattern";
    case "handler":
      return "Event/request handlers";
    default:
      return "";
  }
}
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function isCamelCase(name) {
  return /^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name);
}
function isPascalCase(name) {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}
function isKebabCase(name) {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}
function isSnakeCase(name) {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
}
function isUpperSnakeCase(name) {
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name);
}

// src/docs/dependencies.ts
function generateDependencies(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount3(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("Dependency Map");
  output += "Complete dependency mapping showing what connects to what.\n\n";
  output += header("Module Dependency Matrix", 2);
  output += generateModuleDependencyMatrix(graph);
  output += header("High-Impact Symbols", 2);
  output += generateHighImpactSymbols(graph);
  output += header("Isolated Files", 2);
  output += generateIsolatedFiles(graph);
  output += header("Most Connected File Pairs", 2);
  output += generateConnectedFilePairs(graph);
  output += header("Longest Dependency Chains", 2);
  output += generateDependencyChains(graph);
  output += header("Circular Dependencies (Detailed)", 2);
  output += generateCircularDependenciesDetailed(graph);
  return output;
}
function getFileCount3(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function generateModuleDependencyMatrix(graph) {
  const dirEdges = /* @__PURE__ */ new Map();
  const allDirs = /* @__PURE__ */ new Set();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceDir = getTopLevelDir(sourceAttrs.filePath);
      const targetDir = getTopLevelDir(targetAttrs.filePath);
      if (sourceDir && targetDir && sourceDir !== targetDir) {
        allDirs.add(sourceDir);
        allDirs.add(targetDir);
        if (!dirEdges.has(sourceDir)) {
          dirEdges.set(sourceDir, /* @__PURE__ */ new Map());
        }
        const targetMap = dirEdges.get(sourceDir);
        targetMap.set(targetDir, (targetMap.get(targetDir) || 0) + 1);
      }
    }
  });
  if (allDirs.size === 0) {
    return "No module structure detected (flat or single-directory project).\n\n";
  }
  const dirTotalEdges = /* @__PURE__ */ new Map();
  for (const [sourceDir, targets] of dirEdges.entries()) {
    let total = 0;
    for (const count of targets.values()) {
      total += count;
    }
    dirTotalEdges.set(sourceDir, total);
  }
  const sortedDirs = Array.from(allDirs).sort((a, b) => (dirTotalEdges.get(b) || 0) - (dirTotalEdges.get(a) || 0)).slice(0, 15);
  if (sortedDirs.length === 0) {
    return "No cross-module dependencies detected.\n\n";
  }
  const headers = ["From / To", ...sortedDirs];
  const rows = [];
  for (const sourceDir of sortedDirs) {
    const row = [sourceDir];
    for (const targetDir of sortedDirs) {
      if (sourceDir === targetDir) {
        row.push("-");
      } else {
        const count = dirEdges.get(sourceDir)?.get(targetDir) || 0;
        row.push(count > 0 ? count.toString() : "\u2717");
      }
    }
    rows.push(row);
  }
  return table(headers, rows);
}
function getTopLevelDir(filePath) {
  const parts = filePath.split("/");
  if (parts.length < 2) {
    return null;
  }
  if (parts[0] === "src" && parts.length >= 3) {
    return `${parts[0]}/${parts[1]}`;
  }
  if (parts[0] === "src" && parts.length === 2) {
    return null;
  }
  const firstDir = parts[0];
  if (firstDir.includes("test") || firstDir.includes("fixture") || firstDir.includes("example") || firstDir.includes("__tests__") || firstDir === "node_modules" || firstDir === "dist" || firstDir === "build") {
    return null;
  }
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}
function generateHighImpactSymbols(graph) {
  const symbolImpact = [];
  graph.forEachNode((node, attrs) => {
    const inDegree = graph.inDegree(node);
    if (inDegree > 0 && attrs.name !== "__file__") {
      symbolImpact.push({
        name: attrs.name,
        filePath: attrs.filePath,
        kind: attrs.kind,
        dependentCount: inDegree
      });
    }
  });
  symbolImpact.sort((a, b) => b.dependentCount - a.dependentCount);
  const top = symbolImpact.slice(0, 15);
  if (top.length === 0) {
    return "No high-impact symbols detected.\n\n";
  }
  const headers = ["Symbol", "File", "Kind", "Dependents", "Impact"];
  const rows = top.map((s) => {
    const impact = s.dependentCount >= 20 ? `${impactEmoji(s.dependentCount)} Critical` : s.dependentCount >= 10 ? `${impactEmoji(s.dependentCount)} High` : s.dependentCount >= 5 ? `${impactEmoji(s.dependentCount)} Medium` : `${impactEmoji(s.dependentCount)} Low`;
    return [
      `\`${s.name}\``,
      `\`${s.filePath}\``,
      s.kind,
      formatNumber(s.dependentCount),
      impact
    ];
  });
  return table(headers, rows);
}
function generateIsolatedFiles(graph) {
  const fileConnections = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    if (!fileConnections.has(attrs.filePath)) {
      fileConnections.set(attrs.filePath, { incoming: 0, outgoing: 0 });
    }
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceConn = fileConnections.get(sourceAttrs.filePath);
      const targetConn = fileConnections.get(targetAttrs.filePath);
      if (sourceConn) sourceConn.outgoing++;
      if (targetConn) targetConn.incoming++;
    }
  });
  const isolated = [];
  for (const [file, conn] of fileConnections.entries()) {
    if (conn.incoming === 0) {
      isolated.push(file);
    }
  }
  if (isolated.length === 0) {
    return "No isolated files detected. All files are connected.\n\n";
  }
  let output = `Found ${isolated.length} file${isolated.length === 1 ? "" : "s"} with no incoming dependencies:

`;
  if (isolated.length <= 20) {
    output += unorderedList(isolated.map((f) => `\`${f}\``));
  } else {
    output += unorderedList(isolated.slice(0, 20).map((f) => `\`${f}\``));
    output += `... and ${isolated.length - 20} more.

`;
  }
  output += "These files could be entry points, standalone scripts, or dead code.\n\n";
  return output;
}
function generateConnectedFilePairs(graph) {
  const filePairEdges = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const pair = [sourceAttrs.filePath, targetAttrs.filePath].sort().join(" <-> ");
      filePairEdges.set(pair, (filePairEdges.get(pair) || 0) + 1);
    }
  });
  const pairs = Array.from(filePairEdges.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (pairs.length === 0) {
    return "No cross-file dependencies detected.\n\n";
  }
  const headers = ["File 1", "File 2", "Edges"];
  const rows = pairs.map(([pair, count]) => {
    const [file1, file2] = pair.split(" <-> ");
    return [`\`${file1}\``, `\`${file2}\``, formatNumber(count)];
  });
  return table(headers, rows);
}
function generateDependencyChains(graph) {
  const chains = findLongestPaths(graph, 5);
  if (chains.length === 0) {
    return "No significant dependency chains detected.\n\n";
  }
  let output = "";
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];
    output += `**Chain ${i + 1}** (${chain.length} files):

`;
    output += codeBlock(chain.join(" \u2192\n"), "");
  }
  return output;
}
function findLongestPaths(graph, limit) {
  const fileGraph = /* @__PURE__ */ new Map();
  const fileInDegree = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      if (!fileGraph.has(sourceFile)) {
        fileGraph.set(sourceFile, /* @__PURE__ */ new Set());
      }
      fileGraph.get(sourceFile).add(targetFile);
      fileInDegree.set(targetFile, (fileInDegree.get(targetFile) || 0) + 1);
      if (!fileInDegree.has(sourceFile)) {
        fileInDegree.set(sourceFile, 0);
      }
    }
  });
  const roots = [];
  for (const [file, inDegree] of fileInDegree.entries()) {
    if (inDegree === 0) {
      roots.push(file);
    }
  }
  const allPaths = [];
  const visited = /* @__PURE__ */ new Set();
  function dfs(file, path6) {
    visited.add(file);
    path6.push(file);
    const neighbors = fileGraph.get(file);
    if (!neighbors || neighbors.size === 0) {
      allPaths.push([...path6]);
    } else {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, path6);
        }
      }
    }
    path6.pop();
    visited.delete(file);
  }
  for (const root of roots.slice(0, 10)) {
    dfs(root, []);
  }
  allPaths.sort((a, b) => b.length - a.length);
  return allPaths.slice(0, limit);
}
function generateCircularDependenciesDetailed(graph) {
  const cycles = detectCyclesDetailed(graph);
  if (cycles.length === 0) {
    return "\u2705 No circular dependencies detected.\n\n";
  }
  let output = `\u26A0\uFE0F Found ${cycles.length} circular ${cycles.length === 1 ? "dependency" : "dependencies"}:

`;
  for (let i = 0; i < Math.min(cycles.length, 5); i++) {
    const cycle = cycles[i];
    output += `**Cycle ${i + 1}:**

`;
    output += codeBlock(cycle.files.join(" \u2192\n") + " \u2192 " + cycle.files[0], "");
    if (cycle.symbols.length > 0) {
      output += "**Symbols involved:**\n\n";
      output += unorderedList(cycle.symbols.map((s) => `\`${s.name}\` (${s.kind}) at \`${s.filePath}:${s.line}\``));
    }
    output += `**Suggested fix:** ${cycle.suggestion}

`;
  }
  if (cycles.length > 5) {
    output += `... and ${cycles.length - 5} more cycles.

`;
  }
  return output;
}
function detectCyclesDetailed(graph) {
  const cycles = [];
  const visited = /* @__PURE__ */ new Set();
  const recStack = /* @__PURE__ */ new Set();
  const pathStack = [];
  const fileGraph = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    const sourceFile = sourceAttrs.filePath;
    const targetFile = targetAttrs.filePath;
    if (sourceFile !== targetFile) {
      if (!fileGraph.has(sourceFile)) {
        fileGraph.set(sourceFile, /* @__PURE__ */ new Map());
      }
      const targetMap = fileGraph.get(sourceFile);
      if (!targetMap.has(targetFile)) {
        targetMap.set(targetFile, []);
      }
      targetMap.get(targetFile).push({
        symbolName: targetAttrs.name,
        symbolKind: targetAttrs.kind,
        line: attrs.line || sourceAttrs.startLine
      });
    }
  });
  function dfs(file) {
    visited.add(file);
    recStack.add(file);
    pathStack.push(file);
    const neighbors = fileGraph.get(file);
    if (neighbors) {
      for (const [neighbor, symbols] of neighbors.entries()) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          const cycleStart = pathStack.indexOf(neighbor);
          const cyclePath = pathStack.slice(cycleStart);
          const cycleSymbols = [];
          for (let i = 0; i < cyclePath.length; i++) {
            const currentFile = cyclePath[i];
            const nextFile = cyclePath[(i + 1) % cyclePath.length];
            const edgeSymbols = fileGraph.get(currentFile)?.get(nextFile) || [];
            for (const sym of edgeSymbols.slice(0, 3)) {
              cycleSymbols.push({
                name: sym.symbolName,
                kind: sym.symbolKind,
                filePath: currentFile,
                line: sym.line
              });
            }
          }
          cycles.push({
            files: cyclePath,
            symbols: cycleSymbols,
            suggestion: "Extract shared types/interfaces to a common file"
          });
          return true;
        }
      }
    }
    recStack.delete(file);
    pathStack.pop();
    return false;
  }
  for (const file of fileGraph.keys()) {
    if (!visited.has(file)) {
      dfs(file);
      recStack.clear();
      pathStack.length = 0;
    }
  }
  return cycles;
}

// src/docs/onboarding.ts
import { dirname as dirname21 } from "path";
function generateOnboarding(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount4(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("Onboarding Guide");
  output += "A guide for developers new to this codebase.\n\n";
  output += header("Quick Orientation", 2);
  output += generateQuickOrientation(graph);
  output += header("Where to Start Reading", 2);
  output += generateReadingOrder(graph);
  output += header("Module Map", 2);
  output += generateModuleMap(graph);
  output += header("Key Concepts", 2);
  output += generateKeyConcepts(graph);
  output += header("High-Impact Files", 2);
  output += generateHighImpactWarning(graph);
  output += header("Using Depwire with This Project", 2);
  output += generateDepwireUsage(projectRoot);
  return output;
}
function getFileCount4(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function getLanguageStats2(graph) {
  const stats = {};
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    if (!files.has(attrs.filePath)) {
      files.add(attrs.filePath);
      const ext = attrs.filePath.toLowerCase();
      let lang;
      if (ext.endsWith(".ts") || ext.endsWith(".tsx")) {
        lang = "TypeScript";
      } else if (ext.endsWith(".py")) {
        lang = "Python";
      } else if (ext.endsWith(".js") || ext.endsWith(".jsx") || ext.endsWith(".mjs") || ext.endsWith(".cjs")) {
        lang = "JavaScript";
      } else if (ext.endsWith(".go")) {
        lang = "Go";
      } else {
        lang = "Other";
      }
      stats[lang] = (stats[lang] || 0) + 1;
    }
  });
  return stats;
}
function generateQuickOrientation(graph) {
  const fileCount = getFileCount4(graph);
  const languages2 = getLanguageStats2(graph);
  const primaryLang = Object.entries(languages2).sort((a, b) => b[1] - a[1])[0];
  const dirs = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    const dir = dirname21(attrs.filePath);
    if (dir !== ".") {
      const topLevel = dir.split("/")[0];
      dirs.add(topLevel);
    }
  });
  const mainAreas = Array.from(dirs).sort().join(", ");
  let output = "";
  if (primaryLang) {
    output += `This is a **${primaryLang[0]}** project with **${fileCount} files** and **${graph.order} symbols**. `;
  } else {
    output += `This project has **${fileCount} files** and **${graph.order} symbols**. `;
  }
  if (dirs.size > 0) {
    output += `The main areas are: ${mainAreas}.`;
  } else {
    output += "The project has a flat file structure.";
  }
  output += "\n\n";
  return output;
}
function generateReadingOrder(graph) {
  const fileStats = getFileStatsWithDeps(graph);
  if (fileStats.length === 0) {
    return "No files to analyze.\n\n";
  }
  const foundation = fileStats.filter((f) => f.incomingRefs > 0 && f.incomingRefs >= f.outgoingRefs * 2).sort((a, b) => b.incomingRefs - a.incomingRefs).slice(0, 3);
  const core = fileStats.filter((f) => !foundation.includes(f)).filter((f) => f.incomingRefs > 0 && f.outgoingRefs > 0).filter((f) => {
    const ratio = f.incomingRefs / (f.outgoingRefs + 0.1);
    return ratio > 0.3 && ratio < 3;
  }).sort((a, b) => b.incomingRefs + b.outgoingRefs - (a.incomingRefs + a.outgoingRefs)).slice(0, 5);
  const orchestration = fileStats.filter((f) => !foundation.includes(f) && !core.includes(f)).filter((f) => f.outgoingRefs > 0 && f.outgoingRefs >= f.incomingRefs * 2).sort((a, b) => b.outgoingRefs - a.outgoingRefs).slice(0, 3);
  if (foundation.length === 0 && core.length === 0 && orchestration.length === 0) {
    return "No clear reading order detected. Start with any file.\n\n";
  }
  let output = "Recommended reading order for understanding the codebase:\n\n";
  if (foundation.length > 0) {
    output += "**Foundation** (start here \u2014 these are building blocks):\n\n";
    output += orderedList(foundation.map((f) => `${code(f.filePath)} \u2014 Shared foundation (${f.incomingRefs} dependents)`));
  }
  if (core.length > 0) {
    output += "**Core Logic** (read these next):\n\n";
    output += orderedList(core.map((f) => `${code(f.filePath)} \u2014 Core logic (${f.symbolCount} symbols)`));
  }
  if (orchestration.length > 0) {
    output += "**Entry Points** (read these last to see how it all fits together):\n\n";
    output += orderedList(orchestration.map((f) => `${code(f.filePath)} \u2014 Entry point (imports from ${f.outgoingRefs} files)`));
  }
  return output;
}
function getFileStatsWithDeps(graph) {
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
  return result;
}
function generateModuleMap(graph) {
  const dirStats = getDirectoryStats2(graph);
  if (dirStats.length === 0) {
    return "Flat file structure (no subdirectories).\n\n";
  }
  let output = "";
  for (const dir of dirStats) {
    const description = inferDirectoryDescription(dir, graph);
    output += `- ${code(dir.name)} \u2014 ${description}
`;
  }
  output += "\n";
  return output;
}
function getDirectoryStats2(graph) {
  const dirMap = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    const dir = dirname21(attrs.filePath);
    if (dir === ".") return;
    if (!dirMap.has(dir)) {
      dirMap.set(dir, {
        name: dir,
        fileCount: 0,
        symbolCount: 0,
        inboundEdges: 0,
        outboundEdges: 0
      });
    }
    dirMap.get(dir).symbolCount++;
  });
  const filesPerDir = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    const dir = dirname21(attrs.filePath);
    if (!filesPerDir.has(dir)) {
      filesPerDir.set(dir, /* @__PURE__ */ new Set());
    }
    filesPerDir.get(dir).add(attrs.filePath);
  });
  filesPerDir.forEach((files, dir) => {
    if (dirMap.has(dir)) {
      dirMap.get(dir).fileCount = files.size;
    }
  });
  const dirEdges = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    const sourceDir = dirname21(sourceAttrs.filePath);
    const targetDir = dirname21(targetAttrs.filePath);
    if (sourceDir !== targetDir) {
      if (!dirEdges.has(sourceDir)) {
        dirEdges.set(sourceDir, { in: 0, out: 0 });
      }
      if (!dirEdges.has(targetDir)) {
        dirEdges.set(targetDir, { in: 0, out: 0 });
      }
      dirEdges.get(sourceDir).out++;
      dirEdges.get(targetDir).in++;
    }
  });
  dirEdges.forEach((edges, dir) => {
    if (dirMap.has(dir)) {
      const stat = dirMap.get(dir);
      stat.inboundEdges = edges.in;
      stat.outboundEdges = edges.out;
    }
  });
  return Array.from(dirMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}
function inferDirectoryDescription(dir, graph) {
  const name = dir.name.toLowerCase();
  if (name.includes("types") || name.includes("interfaces")) {
    return "Type definitions and interfaces";
  }
  if (name.includes("utils") || name.includes("helpers")) {
    return "Utility functions and helpers";
  }
  if (name.includes("services")) {
    return "Business logic and services";
  }
  if (name.includes("components")) {
    return "UI components";
  }
  if (name.includes("api") || name.includes("routes")) {
    return "API routes and endpoints";
  }
  if (name.includes("models") || name.includes("entities")) {
    return "Data models and entities";
  }
  if (name.includes("config")) {
    return "Configuration files";
  }
  if (name.includes("test")) {
    return "Test files";
  }
  const totalEdges = dir.inboundEdges + dir.outboundEdges;
  if (totalEdges === 0) {
    return "Isolated module";
  }
  const inboundRatio = dir.inboundEdges / totalEdges;
  if (inboundRatio > 0.7) {
    return "Shared foundation \u2014 heavily imported by other modules";
  } else if (inboundRatio < 0.3) {
    return "Orchestration \u2014 imports from many other modules";
  } else {
    return `Core logic \u2014 ${dir.fileCount} files, ${dir.symbolCount} symbols`;
  }
}
function generateKeyConcepts(graph) {
  const clusters = detectClusters(graph);
  if (clusters.length === 0) {
    return "No distinct concept clusters detected.\n\n";
  }
  let output = "The codebase is organized around these key concepts:\n\n";
  for (const cluster of clusters.slice(0, 5)) {
    output += `- **${cluster.name}** \u2014 ${cluster.files.length} tightly-connected files: `;
    output += cluster.files.slice(0, 3).map((f) => code(f)).join(", ");
    if (cluster.files.length > 3) {
      output += `, and ${cluster.files.length - 3} more`;
    }
    output += "\n";
  }
  output += "\n";
  return output;
}
function detectClusters(graph) {
  const dirFiles = /* @__PURE__ */ new Map();
  const fileEdges = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    const dir = dirname21(attrs.filePath);
    if (!dirFiles.has(dir)) {
      dirFiles.set(dir, /* @__PURE__ */ new Set());
    }
    dirFiles.get(dir).add(attrs.filePath);
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      if (!fileEdges.has(sourceFile)) {
        fileEdges.set(sourceFile, /* @__PURE__ */ new Set());
      }
      fileEdges.get(sourceFile).add(targetFile);
    }
  });
  const clusters = [];
  for (const [dir, files] of dirFiles.entries()) {
    if (dir === "." || files.size < 2) continue;
    const fileArray = Array.from(files);
    let internalEdgeCount = 0;
    for (const file of fileArray) {
      const targets = fileEdges.get(file);
      if (targets) {
        for (const target of targets) {
          if (files.has(target)) {
            internalEdgeCount++;
          }
        }
      }
    }
    if (internalEdgeCount >= 2) {
      const clusterName = inferClusterName(fileArray);
      clusters.push({
        name: clusterName,
        files: fileArray
      });
    }
  }
  return clusters.sort((a, b) => b.files.length - a.files.length);
}
function inferClusterName(files) {
  const words = /* @__PURE__ */ new Map();
  for (const file of files) {
    const fileName = file.toLowerCase();
    const parts = fileName.split(/[\/\-\_\.]/).filter((p) => p.length > 3);
    for (const part of parts) {
      words.set(part, (words.get(part) || 0) + 1);
    }
  }
  const sortedWords = Array.from(words.entries()).sort((a, b) => b[1] - a[1]);
  if (sortedWords.length > 0 && sortedWords[0][1] > 1) {
    return capitalizeFirst2(sortedWords[0][0]);
  }
  const commonDir = dirname21(files[0]);
  if (files.every((f) => dirname21(f) === commonDir)) {
    return capitalizeFirst2(commonDir.split("/").pop() || "Core");
  }
  return "Core";
}
function capitalizeFirst2(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function generateHighImpactWarning(graph) {
  const highImpactFiles = [];
  const fileInDegree = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      fileInDegree.set(targetFile, (fileInDegree.get(targetFile) || 0) + 1);
    }
  });
  for (const [file, count] of fileInDegree.entries()) {
    if (count >= 5) {
      highImpactFiles.push({ file, dependents: count });
    }
  }
  highImpactFiles.sort((a, b) => b.dependents - a.dependents);
  if (highImpactFiles.length === 0) {
    return "No high-impact files detected. Changes should be relatively isolated.\n\n";
  }
  let output = "\u26A0\uFE0F **Before modifying these files, check the blast radius:**\n\n";
  const topFiles = highImpactFiles.slice(0, 5);
  for (const { file, dependents } of topFiles) {
    output += `- ${code(file)} \u2014 ${dependents} dependent files (run \`depwire impact_analysis ${file}\`)
`;
  }
  output += "\n";
  return output;
}
function generateDepwireUsage(projectRoot) {
  let output = "Use Depwire to explore this codebase:\n\n";
  output += "**Visualize the dependency graph:**\n\n";
  output += "```bash\n";
  output += "depwire viz .\n";
  output += "```\n\n";
  output += "**Connect to AI coding tools (MCP):**\n\n";
  output += "```bash\n";
  output += "depwire mcp .\n";
  output += "```\n\n";
  output += "**Analyze impact of changes:**\n\n";
  output += "```bash\n";
  output += "depwire query . <symbol-name>\n";
  output += "```\n\n";
  output += "**Update documentation:**\n\n";
  output += "```bash\n";
  output += "depwire docs . --update\n";
  output += "```\n\n";
  return output;
}

// src/docs/files.ts
import { dirname as dirname22, basename as basename15, relative as relative9 } from "path";
function generateFiles(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount5(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("File Catalog");
  output += "Complete catalog of every file in the project with key metrics.\n\n";
  output += header("File Summary", 2);
  output += generateFileSummaryTable(graph);
  output += header("Directory Breakdown", 2);
  output += generateDirectoryBreakdown(graph);
  output += header("File Size Distribution", 2);
  output += generateFileSizeDistribution(graph);
  output += header("Orphan Files", 2);
  output += generateOrphanFiles(graph, projectRoot);
  output += header("Hub Files", 2);
  output += generateHubFiles2(graph);
  return output;
}
function getFileCount5(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function getFileStats2(graph) {
  const fileMap = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    if (!fileMap.has(attrs.filePath)) {
      fileMap.set(attrs.filePath, {
        filePath: attrs.filePath,
        language: getLanguageFromPath(attrs.filePath),
        symbolCount: 0,
        importCount: 0,
        exportedSymbolCount: 0,
        incomingConnections: 0,
        outgoingConnections: 0,
        totalConnections: 0,
        maxLine: 0
      });
    }
    const stats = fileMap.get(attrs.filePath);
    stats.symbolCount++;
    if (attrs.exported && attrs.name !== "default") {
      stats.exportedSymbolCount++;
    }
    if (attrs.kind === "import") {
      stats.importCount++;
    }
    if (attrs.endLine > stats.maxLine) {
      stats.maxLine = attrs.endLine;
    }
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceStats = fileMap.get(sourceAttrs.filePath);
      const targetStats = fileMap.get(targetAttrs.filePath);
      if (sourceStats) {
        sourceStats.outgoingConnections++;
      }
      if (targetStats) {
        targetStats.incomingConnections++;
      }
    }
  });
  fileMap.forEach((stats) => {
    stats.totalConnections = stats.incomingConnections + stats.outgoingConnections;
  });
  return Array.from(fileMap.values());
}
function getLanguageFromPath(filePath) {
  const ext = filePath.toLowerCase();
  if (ext.endsWith(".ts") || ext.endsWith(".tsx")) return "TypeScript";
  if (ext.endsWith(".js") || ext.endsWith(".jsx") || ext.endsWith(".mjs") || ext.endsWith(".cjs")) return "JavaScript";
  if (ext.endsWith(".py")) return "Python";
  if (ext.endsWith(".go")) return "Go";
  return "Other";
}
function generateFileSummaryTable(graph) {
  const fileStats = getFileStats2(graph);
  if (fileStats.length === 0) {
    return "No files detected.\n\n";
  }
  fileStats.sort((a, b) => a.filePath.localeCompare(b.filePath));
  const headers = ["File", "Language", "Symbols", "Imports", "Exports", "Connections", "Lines"];
  const rows = fileStats.map((f) => [
    `\`${f.filePath}\``,
    f.language,
    formatNumber(f.symbolCount),
    formatNumber(f.importCount),
    formatNumber(f.exportedSymbolCount),
    formatNumber(f.totalConnections),
    formatNumber(f.maxLine)
  ]);
  return table(headers, rows);
}
function generateDirectoryBreakdown(graph) {
  const fileStats = getFileStats2(graph);
  const dirMap = /* @__PURE__ */ new Map();
  for (const file of fileStats) {
    const dir = dirname22(file.filePath);
    const topDir = dir === "." ? "." : dir.split("/")[0];
    if (!dirMap.has(topDir)) {
      dirMap.set(topDir, {
        fileCount: 0,
        symbolCount: 0,
        mostConnectedFile: "",
        maxConnections: 0
      });
    }
    const dirStats = dirMap.get(topDir);
    dirStats.fileCount++;
    dirStats.symbolCount += file.symbolCount;
    if (file.totalConnections > dirStats.maxConnections) {
      dirStats.maxConnections = file.totalConnections;
      dirStats.mostConnectedFile = basename15(file.filePath);
    }
  }
  if (dirMap.size === 0) {
    return "No directories detected.\n\n";
  }
  let output = "";
  const sortedDirs = Array.from(dirMap.entries()).sort((a, b) => b[1].fileCount - a[1].fileCount);
  for (const [dir, stats] of sortedDirs) {
    output += `**${dir === "." ? "Root" : dir}/**

`;
    output += `- **Files:** ${formatNumber(stats.fileCount)}
`;
    output += `- **Symbols:** ${formatNumber(stats.symbolCount)}
`;
    output += `- **Most Connected:** \`${stats.mostConnectedFile}\` (${formatNumber(stats.maxConnections)} connections)

`;
  }
  return output;
}
function generateFileSizeDistribution(graph) {
  const fileStats = getFileStats2(graph);
  if (fileStats.length === 0) {
    return "No files detected.\n\n";
  }
  const bySymbols = [...fileStats].sort((a, b) => b.symbolCount - a.symbolCount);
  let output = "";
  output += "**Largest Files (by symbol count):**\n\n";
  const largest = bySymbols.slice(0, 10);
  const headers1 = ["File", "Symbols", "Lines"];
  const rows1 = largest.map((f) => [
    `\`${f.filePath}\``,
    formatNumber(f.symbolCount),
    formatNumber(f.maxLine)
  ]);
  output += table(headers1, rows1);
  if (bySymbols.length > 10) {
    output += "**Smallest Files (by symbol count):**\n\n";
    const smallest = bySymbols.slice(-10).reverse();
    const headers2 = ["File", "Symbols", "Lines"];
    const rows2 = smallest.map((f) => [
      `\`${f.filePath}\``,
      formatNumber(f.symbolCount),
      formatNumber(f.maxLine)
    ]);
    output += table(headers2, rows2);
  }
  const avgSymbols = Math.round(fileStats.reduce((sum, f) => sum + f.symbolCount, 0) / fileStats.length);
  const avgLines = Math.round(fileStats.reduce((sum, f) => sum + f.maxLine, 0) / fileStats.length);
  output += `**Average File Size:**

`;
  output += `- Symbols per file: ${formatNumber(avgSymbols)}
`;
  output += `- Lines per file: ${formatNumber(avgLines)}

`;
  return output;
}
function generateOrphanFiles(graph, projectRoot) {
  const fileStats = getFileStats2(graph);
  const orphans = fileStats.filter((f) => {
    if (f.totalConnections !== 0) return false;
    const relativePath = relative9(projectRoot, f.filePath);
    if (isExcludedFromOrphanReporting(relativePath)) return false;
    return true;
  });
  if (orphans.length === 0) {
    return "\u2705 No orphan files detected. All files are connected.\n\n";
  }
  let output = `Found ${orphans.length} file${orphans.length === 1 ? "" : "s"} with zero connections:

`;
  output += unorderedList(orphans.map((f) => `\`${f.filePath}\` (${f.symbolCount} symbols)`));
  output += "These files may be entry points, standalone scripts, or dead code.\n\n";
  return output;
}
function generateHubFiles2(graph) {
  const fileStats = getFileStats2(graph);
  const hubs = fileStats.filter((f) => f.totalConnections > 0).sort((a, b) => b.totalConnections - a.totalConnections).slice(0, 10);
  if (hubs.length === 0) {
    return "No hub files detected.\n\n";
  }
  let output = "Files with the most connections (changing these breaks the most things):\n\n";
  const headers = ["File", "Total Connections", "Incoming", "Outgoing", "Symbols"];
  const rows = hubs.map((f) => [
    `\`${f.filePath}\``,
    formatNumber(f.totalConnections),
    formatNumber(f.incomingConnections),
    formatNumber(f.outgoingConnections),
    formatNumber(f.symbolCount)
  ]);
  output += table(headers, rows);
  return output;
}

// src/docs/api-surface.ts
function generateApiSurface(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount6(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("API Surface");
  output += "Every exported symbol in the project \u2014 the public API.\n\n";
  output += header("Exports by File", 2);
  output += generateExportsByFile(graph);
  output += header("Exports by Kind", 2);
  output += generateExportsByKind(graph);
  output += header("Most-Used Exports", 2);
  output += generateMostUsedExports(graph);
  output += header("Unused Exports", 2);
  output += generateUnusedExports(graph);
  output += header("Re-exports / Barrel Files", 2);
  output += generateReExports(graph);
  return output;
}
function getFileCount6(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function getExportedSymbols(graph) {
  const exports = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.exported && attrs.name !== "__file__") {
      const dependentCount = graph.inDegree(node);
      exports.push({
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        line: attrs.startLine,
        dependentCount
      });
    }
  });
  return exports;
}
function generateExportsByFile(graph) {
  const exports = getExportedSymbols(graph);
  if (exports.length === 0) {
    return "No exported symbols detected.\n\n";
  }
  const fileExports = /* @__PURE__ */ new Map();
  for (const exp of exports) {
    if (!fileExports.has(exp.filePath)) {
      fileExports.set(exp.filePath, []);
    }
    fileExports.get(exp.filePath).push(exp);
  }
  const sortedFiles = Array.from(fileExports.entries()).sort((a, b) => b[1].length - a[1].length);
  let output = "";
  for (const [filePath, fileExports2] of sortedFiles) {
    output += header(filePath, 3);
    const sorted = fileExports2.sort((a, b) => b.dependentCount - a.dependentCount);
    const items = sorted.map((exp) => {
      const depInfo = exp.dependentCount > 0 ? ` \u2014 ${formatNumber(exp.dependentCount)} dependents` : "";
      return `${code(exp.name)} (${exp.kind}, line ${exp.line})${depInfo}`;
    });
    output += unorderedList(items);
  }
  return output;
}
function generateExportsByKind(graph) {
  const exports = getExportedSymbols(graph);
  if (exports.length === 0) {
    return "No exported symbols detected.\n\n";
  }
  const kindGroups = /* @__PURE__ */ new Map();
  for (const exp of exports) {
    if (!kindGroups.has(exp.kind)) {
      kindGroups.set(exp.kind, []);
    }
    kindGroups.get(exp.kind).push(exp);
  }
  let output = "";
  const sortedKinds = Array.from(kindGroups.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [kind, kindExports] of sortedKinds) {
    if (kind === "import" || kind === "export") continue;
    output += `**${capitalizeKind(kind)}s (${kindExports.length}):**

`;
    const sorted = kindExports.sort((a, b) => b.dependentCount - a.dependentCount).slice(0, 20);
    const items = sorted.map((exp) => {
      return `${code(exp.name)} \u2014 ${code(exp.filePath)}:${exp.line}`;
    });
    output += unorderedList(items);
  }
  return output;
}
function capitalizeKind(kind) {
  const map = {
    function: "Function",
    class: "Class",
    variable: "Variable",
    constant: "Constant",
    type_alias: "Type",
    interface: "Interface",
    enum: "Enum",
    import: "Import",
    export: "Export",
    method: "Method",
    property: "Property",
    decorator: "Decorator",
    module: "Module",
    template: "Template"
  };
  return map[kind] || kind;
}
function generateMostUsedExports(graph) {
  const exports = getExportedSymbols(graph);
  if (exports.length === 0) {
    return "No exported symbols detected.\n\n";
  }
  const sorted = exports.filter((exp) => exp.dependentCount > 0).sort((a, b) => b.dependentCount - a.dependentCount).slice(0, 20);
  if (sorted.length === 0) {
    return "No exports with dependents detected.\n\n";
  }
  let output = "Top 20 exports by dependent count \u2014 these are the most critical symbols:\n\n";
  const items = sorted.map((exp) => {
    return `${code(exp.name)} (${exp.kind}) \u2014 ${formatNumber(exp.dependentCount)} dependents \u2014 ${code(exp.filePath)}:${exp.line}`;
  });
  output += unorderedList(items);
  return output;
}
function generateUnusedExports(graph) {
  const exports = getExportedSymbols(graph);
  if (exports.length === 0) {
    return "No exported symbols detected.\n\n";
  }
  const unused = exports.filter((exp) => exp.dependentCount === 0 && exp.kind !== "export");
  if (unused.length === 0) {
    return "\u2705 No unused exports detected. All exports are used.\n\n";
  }
  let output = `Found ${unused.length} exported symbol${unused.length === 1 ? "" : "s"} with zero dependents:

`;
  const fileGroups = /* @__PURE__ */ new Map();
  for (const exp of unused) {
    if (!fileGroups.has(exp.filePath)) {
      fileGroups.set(exp.filePath, []);
    }
    fileGroups.get(exp.filePath).push(exp);
  }
  for (const [filePath, fileExports] of fileGroups.entries()) {
    output += `**${filePath}:**

`;
    const items = fileExports.map((exp) => `${code(exp.name)} (${exp.kind}, line ${exp.line})`);
    output += unorderedList(items);
  }
  output += "These symbols may be part of the intended public API but are not currently used, or they may be dead code.\n\n";
  return output;
}
function generateReExports(graph) {
  const fileStats = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    if (!fileStats.has(attrs.filePath)) {
      fileStats.set(attrs.filePath, {
        exportCount: 0,
        reExportCount: 0,
        reExportSources: /* @__PURE__ */ new Set()
      });
    }
    const stats = fileStats.get(attrs.filePath);
    if (attrs.exported) {
      stats.exportCount++;
    }
    if (attrs.kind === "export") {
      stats.reExportCount++;
    }
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.kind === "export" && sourceAttrs.filePath !== targetAttrs.filePath) {
      const stats = fileStats.get(sourceAttrs.filePath);
      if (stats) {
        stats.reExportSources.add(targetAttrs.filePath);
      }
    }
  });
  const barrels = [];
  for (const [filePath, stats] of fileStats.entries()) {
    if (stats.reExportCount > 0 && stats.reExportCount >= stats.exportCount * 0.5) {
      barrels.push({
        filePath,
        exportCount: stats.exportCount,
        reExportCount: stats.reExportCount,
        sources: Array.from(stats.reExportSources)
      });
    }
  }
  if (barrels.length === 0) {
    return "No barrel files detected.\n\n";
  }
  let output = `Found ${barrels.length} barrel file${barrels.length === 1 ? "" : "s"} (files that primarily re-export from other files):

`;
  for (const barrel of barrels) {
    output += header(barrel.filePath, 3);
    output += `- **Total exports:** ${formatNumber(barrel.exportCount)}
`;
    output += `- **Re-exports:** ${formatNumber(barrel.reExportCount)}
`;
    if (barrel.sources.length > 0) {
      output += `- **Sources:**

`;
      output += unorderedList(barrel.sources.map((s) => code(s)));
    } else {
      output += "\n";
    }
  }
  return output;
}

// src/docs/errors.ts
function generateErrors(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount7(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("Error Handling Analysis");
  output += "Analysis of error handling patterns and error-prone areas in the codebase.\n\n";
  output += header("Error-Related Symbols", 2);
  output += generateErrorRelatedSymbols(graph);
  output += header("Custom Error Classes", 2);
  output += generateCustomErrorClasses(graph);
  output += header("Error-Prone Files", 2);
  output += generateErrorProneFiles(graph);
  output += header("Detected Patterns", 2);
  output += generateErrorHandlingPatterns(graph);
  output += header("Recommendations", 2);
  output += generateRecommendations(graph);
  return output;
}
function getFileCount7(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function getErrorRelatedSymbols(graph) {
  const errorKeywords = [
    "error",
    "err",
    "exception",
    "throw",
    "fail",
    "invalid",
    "not_found",
    "notfound",
    "unauthorized",
    "forbidden",
    "timeout",
    "retry",
    "catch",
    "try"
  ];
  const symbols = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.name === "__file__") return;
    const nameLower = attrs.name.toLowerCase();
    for (const keyword of errorKeywords) {
      if (nameLower.includes(keyword)) {
        let category = "error_handling";
        if (nameLower.includes("retry") || nameLower.includes("timeout")) {
          category = "retry_timeout";
        } else if (nameLower.includes("invalid") || nameLower.includes("validate")) {
          category = "validation";
        } else if (nameLower.includes("unauthorized") || nameLower.includes("forbidden")) {
          category = "auth_error";
        } else if (nameLower.includes("notfound") || nameLower.includes("not_found")) {
          category = "not_found";
        }
        symbols.push({
          name: attrs.name,
          kind: attrs.kind,
          filePath: attrs.filePath,
          line: attrs.startLine,
          category
        });
        break;
      }
    }
  });
  return symbols;
}
function generateErrorRelatedSymbols(graph) {
  const symbols = getErrorRelatedSymbols(graph);
  if (symbols.length === 0) {
    return "No error-related symbols detected.\n\n";
  }
  let output = `Found ${symbols.length} error-related symbol${symbols.length === 1 ? "" : "s"}:

`;
  const categories = /* @__PURE__ */ new Map();
  for (const sym of symbols) {
    if (!categories.has(sym.category)) {
      categories.set(sym.category, []);
    }
    categories.get(sym.category).push(sym);
  }
  for (const [category, syms] of categories.entries()) {
    output += `**${formatCategory(category)} (${syms.length}):**

`;
    const items = syms.slice(0, 10).map((s) => {
      return `${code(s.name)} (${s.kind}) \u2014 ${code(s.filePath)}:${s.line}`;
    });
    output += unorderedList(items);
    if (syms.length > 10) {
      output += `... and ${syms.length - 10} more.

`;
    }
  }
  return output;
}
function formatCategory(category) {
  const map = {
    "error_handling": "Error Handling",
    "retry_timeout": "Retry / Timeout",
    "validation": "Validation",
    "auth_error": "Authentication Errors",
    "not_found": "Not Found Errors"
  };
  return map[category] || category;
}
function generateCustomErrorClasses(graph) {
  const errorClasses = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.kind === "class") {
      const nameLower = attrs.name.toLowerCase();
      if (nameLower.includes("error") || nameLower.includes("exception")) {
        errorClasses.push({
          name: attrs.name,
          filePath: attrs.filePath,
          line: attrs.startLine
        });
      }
    }
  });
  if (errorClasses.length === 0) {
    return "No custom error classes detected.\n\n";
  }
  let output = `Found ${errorClasses.length} custom error class${errorClasses.length === 1 ? "" : "es"}:

`;
  const items = errorClasses.map((c) => {
    return `${code(c.name)} \u2014 ${code(c.filePath)}:${c.line}`;
  });
  output += unorderedList(items);
  return output;
}
function generateErrorProneFiles(graph) {
  const fileStats = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    if (!fileStats.has(attrs.filePath)) {
      fileStats.set(attrs.filePath, {
        connectionCount: 0,
        errorSymbolCount: 0,
        symbolCount: 0
      });
    }
    fileStats.get(attrs.filePath).symbolCount++;
  });
  const errorSymbols = getErrorRelatedSymbols(graph);
  for (const sym of errorSymbols) {
    const stats = fileStats.get(sym.filePath);
    if (stats) {
      stats.errorSymbolCount++;
    }
  }
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceStats = fileStats.get(sourceAttrs.filePath);
      const targetStats = fileStats.get(targetAttrs.filePath);
      if (sourceStats) sourceStats.connectionCount++;
      if (targetStats) targetStats.connectionCount++;
    }
  });
  const errorProneFiles = [];
  for (const [filePath, stats] of fileStats.entries()) {
    if (stats.connectionCount > 5) {
      const riskScore = stats.connectionCount * (1 + stats.errorSymbolCount * 0.5);
      errorProneFiles.push({
        filePath,
        connectionCount: stats.connectionCount,
        errorSymbolCount: stats.errorSymbolCount,
        riskScore
      });
    }
  }
  errorProneFiles.sort((a, b) => b.riskScore - a.riskScore);
  if (errorProneFiles.length === 0) {
    return "No high-risk files detected.\n\n";
  }
  let output = "Files with high complexity and error-related code (riskiest to modify):\n\n";
  const headers = ["File", "Connections", "Error Symbols", "Risk Score"];
  const rows = errorProneFiles.slice(0, 15).map((f) => [
    `\`${f.filePath}\``,
    formatNumber(f.connectionCount),
    formatNumber(f.errorSymbolCount),
    f.riskScore.toFixed(1)
  ]);
  output += table(headers, rows);
  return output;
}
function generateErrorHandlingPatterns(graph) {
  const patterns = {
    custom_errors: 0,
    retry: 0,
    timeout: 0,
    validation: 0,
    guard: 0
  };
  graph.forEachNode((node, attrs) => {
    const nameLower = attrs.name.toLowerCase();
    if (attrs.kind === "class" && (nameLower.includes("error") || nameLower.includes("exception"))) {
      patterns.custom_errors++;
    }
    if (nameLower.includes("retry") || nameLower.includes("attempt")) {
      patterns.retry++;
    }
    if (nameLower.includes("timeout")) {
      patterns.timeout++;
    }
    if (nameLower.includes("validate") || nameLower.includes("validator") || nameLower.includes("check")) {
      patterns.validation++;
    }
    if (nameLower.includes("guard") || nameLower.startsWith("is") || nameLower.startsWith("has")) {
      patterns.guard++;
    }
  });
  const detectedPatterns = Object.entries(patterns).filter(([, count]) => count > 0);
  if (detectedPatterns.length === 0) {
    return "No error handling patterns detected.\n\n";
  }
  let output = "";
  for (const [pattern, count] of detectedPatterns) {
    const description = getPatternDescription2(pattern);
    output += `- **${formatPatternName(pattern)}:** ${count} occurrences \u2014 ${description}
`;
  }
  output += "\n";
  return output;
}
function formatPatternName(pattern) {
  const map = {
    custom_errors: "Custom Error Hierarchy",
    retry: "Retry Pattern",
    timeout: "Timeout Handling",
    validation: "Input Validation",
    guard: "Guard Clauses"
  };
  return map[pattern] || pattern;
}
function getPatternDescription2(pattern) {
  const map = {
    custom_errors: "Custom error classes for domain-specific exceptions",
    retry: "Retry logic for transient failures",
    timeout: "Timeout handling for long-running operations",
    validation: "Input validation to prevent errors",
    guard: "Guard clauses to check preconditions"
  };
  return map[pattern] || "";
}
function generateRecommendations(graph) {
  const recommendations = [];
  const fileStats = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    if (!fileStats.has(attrs.filePath)) {
      fileStats.set(attrs.filePath, {
        connectionCount: 0,
        errorSymbolCount: 0
      });
    }
  });
  const errorSymbols = getErrorRelatedSymbols(graph);
  for (const sym of errorSymbols) {
    const stats = fileStats.get(sym.filePath);
    if (stats) {
      stats.errorSymbolCount++;
    }
  }
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceStats = fileStats.get(sourceAttrs.filePath);
      const targetStats = fileStats.get(targetAttrs.filePath);
      if (sourceStats) sourceStats.connectionCount++;
      if (targetStats) targetStats.connectionCount++;
    }
  });
  const needsErrorHandling = [];
  for (const [filePath, stats] of fileStats.entries()) {
    if (stats.connectionCount > 10 && stats.errorSymbolCount === 0) {
      needsErrorHandling.push(filePath);
    }
  }
  if (needsErrorHandling.length > 0) {
    recommendations.push(`**Add error handling to high-connection files:** ${needsErrorHandling.slice(0, 5).map((f) => code(f)).join(", ")}`);
  }
  const errorClasses = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.kind === "class") {
      const nameLower = attrs.name.toLowerCase();
      if (nameLower.includes("error") || nameLower.includes("exception")) {
        const dependents = graph.inDegree(node);
        if (dependents === 0) {
          errorClasses.push(attrs.name);
        }
      }
    }
  });
  if (errorClasses.length > 0) {
    recommendations.push(`**Unused error classes detected:** ${errorClasses.slice(0, 5).map((c) => code(c)).join(", ")} \u2014 Consider removing or documenting why they exist`);
  }
  if (recommendations.length === 0) {
    return "\u2705 No specific recommendations. Error handling appears well-distributed.\n\n";
  }
  return unorderedList(recommendations);
}

// src/docs/tests.ts
import { basename as basename16, dirname as dirname23 } from "path";
function generateTests(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount8(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("Test Analysis");
  output += "Test file inventory and coverage mapping.\n\n";
  output += header("Test File Inventory", 2);
  output += generateTestFileInventory(graph);
  output += header("Test-to-Source Mapping", 2);
  output += generateTestToSourceMapping(graph);
  output += header("Untested Files", 2);
  output += generateUntestedFiles(graph);
  output += header("Test Coverage Map", 2);
  output += generateTestCoverageMap(graph);
  output += header("Test Statistics", 2);
  output += generateTestStatistics(graph);
  return output;
}
function getFileCount8(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function isTestFile5(filePath) {
  const fileName = basename16(filePath).toLowerCase();
  const dirPath = dirname23(filePath).toLowerCase();
  if (dirPath.includes("test") || dirPath.includes("spec") || dirPath.includes("__tests__")) {
    return true;
  }
  if (fileName.includes(".test.") || fileName.includes(".spec.") || fileName.includes("_test.") || fileName.includes("_spec.")) {
    return true;
  }
  return false;
}
function getTestFiles(graph) {
  const testFiles = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    if (isTestFile5(attrs.filePath)) {
      if (!testFiles.has(attrs.filePath)) {
        testFiles.set(attrs.filePath, {
          filePath: attrs.filePath,
          language: getLanguageFromPath2(attrs.filePath),
          symbolCount: 0,
          functionCount: 0
        });
      }
      const info = testFiles.get(attrs.filePath);
      info.symbolCount++;
      if (attrs.kind === "function" || attrs.kind === "method") {
        info.functionCount++;
      }
    }
  });
  return Array.from(testFiles.values());
}
function getLanguageFromPath2(filePath) {
  const ext = filePath.toLowerCase();
  if (ext.endsWith(".ts") || ext.endsWith(".tsx")) return "TypeScript";
  if (ext.endsWith(".js") || ext.endsWith(".jsx") || ext.endsWith(".mjs") || ext.endsWith(".cjs")) return "JavaScript";
  if (ext.endsWith(".py")) return "Python";
  if (ext.endsWith(".go")) return "Go";
  return "Other";
}
function generateTestFileInventory(graph) {
  const testFiles = getTestFiles(graph);
  if (testFiles.length === 0) {
    return "No test files detected.\n\n";
  }
  let output = `Found ${testFiles.length} test file${testFiles.length === 1 ? "" : "s"}:

`;
  testFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
  const headers = ["Test File", "Language", "Symbols", "Functions"];
  const rows = testFiles.map((t) => [
    `\`${t.filePath}\``,
    t.language,
    formatNumber(t.symbolCount),
    formatNumber(t.functionCount)
  ]);
  output += table(headers, rows);
  return output;
}
function matchTestToSource(testFile) {
  const testFileName = basename16(testFile);
  const testDir = dirname23(testFile);
  let sourceFileName = testFileName.replace(/\.test\./g, ".").replace(/\.spec\./g, ".").replace(/_test\./g, ".").replace(/_spec\./g, ".");
  const possiblePaths = [];
  possiblePaths.push(testDir + "/" + sourceFileName);
  if (testDir.endsWith("/test") || testDir.endsWith("/tests") || testDir.endsWith("/__tests__")) {
    const parentDir = dirname23(testDir);
    possiblePaths.push(parentDir + "/" + sourceFileName);
  }
  if (testDir.includes("test")) {
    const srcDir = testDir.replace(/test[s]?/g, "src");
    possiblePaths.push(srcDir + "/" + sourceFileName);
  }
  for (const path6 of possiblePaths) {
    if (!isTestFile5(path6)) {
      return path6;
    }
  }
  return null;
}
function generateTestToSourceMapping(graph) {
  const testFiles = getTestFiles(graph);
  if (testFiles.length === 0) {
    return "No test files detected.\n\n";
  }
  const allFiles = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  let output = "";
  let mappedCount = 0;
  const mappings = [];
  for (const testFile of testFiles) {
    const sourceFile = matchTestToSource(testFile.filePath);
    const exists = sourceFile && allFiles.has(sourceFile);
    mappings.push({
      test: testFile.filePath,
      source: exists ? sourceFile : null
    });
    if (exists) {
      mappedCount++;
    }
  }
  output += `Matched ${mappedCount} of ${testFiles.length} test files to source files:

`;
  for (const mapping of mappings) {
    if (mapping.source) {
      output += `- ${code(mapping.source)} \u2190 ${code(mapping.test)}
`;
    }
  }
  output += "\n";
  const unmapped = mappings.filter((m) => !m.source);
  if (unmapped.length > 0) {
    output += `**Unmapped test files (${unmapped.length}):**

`;
    output += unorderedList(unmapped.map((m) => code(m.test)));
  }
  return output;
}
function generateUntestedFiles(graph) {
  const testFiles = getTestFiles(graph);
  const sourceFiles = [];
  const allFiles = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  for (const file of allFiles) {
    if (!isTestFile5(file)) {
      sourceFiles.push(file);
    }
  }
  if (sourceFiles.length === 0) {
    return "No source files detected.\n\n";
  }
  const testedFiles = /* @__PURE__ */ new Set();
  for (const testFile of testFiles) {
    const sourceFile = matchTestToSource(testFile.filePath);
    if (sourceFile && allFiles.has(sourceFile)) {
      testedFiles.add(sourceFile);
    }
  }
  const untested = sourceFiles.filter((f) => !testedFiles.has(f));
  if (untested.length === 0) {
    return "\u2705 All source files have matching test files.\n\n";
  }
  const fileConnections = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      fileConnections.set(sourceAttrs.filePath, (fileConnections.get(sourceAttrs.filePath) || 0) + 1);
      fileConnections.set(targetAttrs.filePath, (fileConnections.get(targetAttrs.filePath) || 0) + 1);
    }
  });
  const untestedWithConnections = untested.map((f) => ({
    filePath: f,
    connections: fileConnections.get(f) || 0
  })).sort((a, b) => b.connections - a.connections);
  let output = `\u26A0\uFE0F Found ${untested.length} source file${untested.length === 1 ? "" : "s"} without matching test files:

`;
  const headers = ["File", "Connections", "Priority"];
  const rows = untestedWithConnections.slice(0, 20).map((f) => {
    const priority = f.connections > 10 ? "\u{1F534} High" : f.connections > 5 ? "\u{1F7E1} Medium" : "\u{1F7E2} Low";
    return [
      `\`${f.filePath}\``,
      formatNumber(f.connections),
      priority
    ];
  });
  output += table(headers, rows);
  if (untested.length > 20) {
    output += `... and ${untested.length - 20} more.

`;
  }
  return output;
}
function generateTestCoverageMap(graph) {
  const testFiles = getTestFiles(graph);
  const allFiles = /* @__PURE__ */ new Set();
  const sourceFiles = [];
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  for (const file of allFiles) {
    if (!isTestFile5(file)) {
      sourceFiles.push(file);
    }
  }
  if (sourceFiles.length === 0) {
    return "No source files detected.\n\n";
  }
  const mappings = [];
  const testedFiles = /* @__PURE__ */ new Map();
  for (const testFile of testFiles) {
    const sourceFile = matchTestToSource(testFile.filePath);
    if (sourceFile && allFiles.has(sourceFile)) {
      testedFiles.set(sourceFile, testFile.filePath);
    }
  }
  const fileSymbols = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    fileSymbols.set(attrs.filePath, (fileSymbols.get(attrs.filePath) || 0) + 1);
  });
  for (const sourceFile of sourceFiles) {
    const testFile = testedFiles.get(sourceFile);
    mappings.push({
      sourceFile,
      hasTest: !!testFile,
      testFile: testFile || null,
      symbolCount: fileSymbols.get(sourceFile) || 0
    });
  }
  mappings.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
  const headers = ["Source File", "Has Test?", "Test File", "Symbols"];
  const rows = mappings.slice(0, 30).map((m) => [
    `\`${m.sourceFile}\``,
    m.hasTest ? "\u2705" : "\u274C",
    m.testFile ? `\`${basename16(m.testFile)}\`` : "-",
    formatNumber(m.symbolCount)
  ]);
  let output = table(headers, rows);
  if (mappings.length > 30) {
    output += `... and ${mappings.length - 30} more files.

`;
  }
  return output;
}
function generateTestStatistics(graph) {
  const testFiles = getTestFiles(graph);
  const allFiles = /* @__PURE__ */ new Set();
  const sourceFiles = [];
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  for (const file of allFiles) {
    if (!isTestFile5(file)) {
      sourceFiles.push(file);
    }
  }
  const testedFiles = /* @__PURE__ */ new Set();
  for (const testFile of testFiles) {
    const sourceFile = matchTestToSource(testFile.filePath);
    if (sourceFile && allFiles.has(sourceFile)) {
      testedFiles.add(sourceFile);
    }
  }
  let output = "";
  output += `- **Total test files:** ${formatNumber(testFiles.length)}
`;
  output += `- **Total source files:** ${formatNumber(sourceFiles.length)}
`;
  output += `- **Source files with tests:** ${formatNumber(testedFiles.size)} (${formatPercent(testedFiles.size, sourceFiles.length)})
`;
  output += `- **Source files without tests:** ${formatNumber(sourceFiles.length - testedFiles.size)} (${formatPercent(sourceFiles.length - testedFiles.size, sourceFiles.length)})
`;
  const dirTestCoverage = /* @__PURE__ */ new Map();
  for (const sourceFile of sourceFiles) {
    const dir = dirname23(sourceFile).split("/")[0];
    if (!dirTestCoverage.has(dir)) {
      dirTestCoverage.set(dir, { total: 0, tested: 0 });
    }
    dirTestCoverage.get(dir).total++;
    if (testedFiles.has(sourceFile)) {
      dirTestCoverage.get(dir).tested++;
    }
  }
  if (dirTestCoverage.size > 1) {
    output += "\n**Coverage by directory:**\n\n";
    const sortedDirs = Array.from(dirTestCoverage.entries()).sort((a, b) => b[1].total - a[1].total);
    for (const [dir, coverage] of sortedDirs) {
      const percent = formatPercent(coverage.tested, coverage.total);
      output += `- **${dir}/**: ${coverage.tested}/${coverage.total} files (${percent})
`;
    }
  }
  output += "\n";
  return output;
}

// src/docs/history.ts
import { dirname as dirname24 } from "path";
import { execSync } from "child_process";
function generateHistory(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount9(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("Development History");
  output += "Git history combined with graph analysis showing feature evolution.\n\n";
  const hasGit = isGitAvailable(projectRoot);
  if (!hasGit) {
    output += "\u26A0\uFE0F **Git history not available.** This project is not a git repository or git is not installed.\n\n";
    output += "Showing graph-based analysis only:\n\n";
  }
  if (hasGit) {
    output += header("Development Timeline", 2);
    output += generateDevelopmentTimeline(projectRoot);
  }
  if (hasGit) {
    output += header("File Change Frequency (Churn)", 2);
    output += generateFileChurn(projectRoot, graph);
  }
  if (hasGit) {
    output += header("Feature Timeline", 2);
    output += generateFeatureTimeline(projectRoot);
  }
  if (hasGit) {
    output += header("File Age Analysis", 2);
    output += generateFileAgeAnalysis(projectRoot, graph);
  }
  if (hasGit) {
    output += header("Contributors", 2);
    output += generateContributors(projectRoot);
  }
  output += header("Feature Clusters (Graph-Based)", 2);
  output += generateFeatureClusters(graph);
  return output;
}
function getFileCount9(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function isGitAvailable(projectRoot) {
  try {
    execSync("git rev-parse --git-dir", {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 5e3,
      stdio: "pipe"
    });
    return true;
  } catch {
    return false;
  }
}
function executeGitCommand(projectRoot, command) {
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 1e4,
      stdio: "pipe"
    }).trim();
  } catch {
    return "";
  }
}
function generateDevelopmentTimeline(projectRoot) {
  const log = executeGitCommand(projectRoot, 'git log --format="%ai" --all --no-merges');
  if (!log) {
    return "Unable to retrieve git log.\n\n";
  }
  const dates = log.split("\n").filter((d) => d.length > 0);
  if (dates.length === 0) {
    return "No commits found.\n\n";
  }
  const firstCommit = new Date(dates[dates.length - 1]);
  const lastCommit = new Date(dates[0]);
  const ageInDays = Math.floor((lastCommit.getTime() - firstCommit.getTime()) / (1e3 * 60 * 60 * 24));
  const ageInMonths = Math.floor(ageInDays / 30);
  let output = "";
  output += `- **First commit:** ${firstCommit.toISOString().split("T")[0]}
`;
  output += `- **Last commit:** ${lastCommit.toISOString().split("T")[0]}
`;
  output += `- **Project age:** ${ageInMonths} months (${ageInDays} days)
`;
  output += `- **Total commits:** ${formatNumber(dates.length)}
`;
  const commitsPerMonth = ageInMonths > 0 ? (dates.length / ageInMonths).toFixed(1) : dates.length.toString();
  output += `- **Average activity:** ${commitsPerMonth} commits/month
`;
  output += "\n";
  return output;
}
function generateFileChurn(projectRoot, graph) {
  const churnOutput = executeGitCommand(
    projectRoot,
    'git log --all --name-only --format="" | sort | uniq -c | sort -rn | head -20'
  );
  if (!churnOutput) {
    return "Unable to retrieve file churn data.\n\n";
  }
  const lines = churnOutput.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return "No file churn data available.\n\n";
  }
  const churnData = [];
  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const changes = parseInt(match[1], 10);
      const file = match[2].trim();
      if (file && file.length > 0 && !file.startsWith(".")) {
        churnData.push({ file, changes });
      }
    }
  }
  if (churnData.length === 0) {
    return "No valid file churn data.\n\n";
  }
  const fileConnections = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      fileConnections.set(sourceAttrs.filePath, (fileConnections.get(sourceAttrs.filePath) || 0) + 1);
      fileConnections.set(targetAttrs.filePath, (fileConnections.get(targetAttrs.filePath) || 0) + 1);
    }
  });
  let output = "Top 20 most-changed files:\n\n";
  const headers = ["File", "Changes", "Connections", "Risk"];
  const rows = churnData.slice(0, 20).map((item) => {
    const connections = fileConnections.get(item.file) || 0;
    let risk = "\u{1F7E2} Low";
    if (item.changes > 50 && connections > 10) {
      risk = "\u{1F534} High";
    } else if (item.changes > 20 && connections > 5) {
      risk = "\u{1F7E1} Medium";
    } else if (item.changes > 50 || connections > 10) {
      risk = "\u{1F7E1} Medium";
    }
    return [
      `\`${item.file}\``,
      formatNumber(item.changes),
      formatNumber(connections),
      risk
    ];
  });
  output += table(headers, rows);
  output += "**Risk levels:**\n\n";
  output += "- \u{1F534} High churn + high connections = risky hotspot (break often, affect many)\n";
  output += "- \u{1F7E1} High churn + low connections = actively developed but isolated\n";
  output += "- \u{1F7E2} Low churn + high connections = stable foundation\n\n";
  return output;
}
function generateFeatureTimeline(projectRoot) {
  const log = executeGitCommand(projectRoot, "git log --oneline --all --no-merges");
  if (!log) {
    return "Unable to retrieve commit log.\n\n";
  }
  const commits = log.split("\n").filter((c) => c.length > 0);
  if (commits.length === 0) {
    return "No commits found.\n\n";
  }
  const categories = {
    features: 0,
    fixes: 0,
    refactors: 0,
    other: 0
  };
  const featureKeywords = ["feat", "add", "new", "implement", "create"];
  const fixKeywords = ["fix", "bug", "patch", "resolve"];
  const refactorKeywords = ["refactor", "cleanup", "restructure", "improve"];
  for (const commit of commits) {
    const messageLower = commit.toLowerCase();
    if (featureKeywords.some((kw) => messageLower.includes(kw))) {
      categories.features++;
    } else if (fixKeywords.some((kw) => messageLower.includes(kw))) {
      categories.fixes++;
    } else if (refactorKeywords.some((kw) => messageLower.includes(kw))) {
      categories.refactors++;
    } else {
      categories.other++;
    }
  }
  let output = "Commit breakdown by type:\n\n";
  output += `- **Features:** ${formatNumber(categories.features)} commits (${(categories.features / commits.length * 100).toFixed(1)}%)
`;
  output += `- **Bug fixes:** ${formatNumber(categories.fixes)} commits (${(categories.fixes / commits.length * 100).toFixed(1)}%)
`;
  output += `- **Refactors:** ${formatNumber(categories.refactors)} commits (${(categories.refactors / commits.length * 100).toFixed(1)}%)
`;
  output += `- **Other:** ${formatNumber(categories.other)} commits (${(categories.other / commits.length * 100).toFixed(1)}%)
`;
  output += "\n";
  return output;
}
function generateFileAgeAnalysis(projectRoot, graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  if (files.size === 0) {
    return "No files to analyze.\n\n";
  }
  const fileAges = [];
  const sampleFiles = Array.from(files).slice(0, 20);
  for (const file of sampleFiles) {
    const dateStr = executeGitCommand(
      projectRoot,
      `git log --format="%ai" --diff-filter=A -- "${file}" | tail -1`
    );
    if (dateStr) {
      fileAges.push({
        file,
        date: new Date(dateStr)
      });
    }
  }
  if (fileAges.length === 0) {
    return "Unable to determine file ages.\n\n";
  }
  fileAges.sort((a, b) => a.date.getTime() - b.date.getTime());
  let output = "";
  output += "**Oldest files (foundation):**\n\n";
  const oldest = fileAges.slice(0, 5);
  output += unorderedList(oldest.map((f) => {
    return `${code(f.file)} \u2014 added ${f.date.toISOString().split("T")[0]}`;
  }));
  output += "**Newest files (recent features):**\n\n";
  const newest = fileAges.slice(-5).reverse();
  output += unorderedList(newest.map((f) => {
    return `${code(f.file)} \u2014 added ${f.date.toISOString().split("T")[0]}`;
  }));
  return output;
}
function generateContributors(projectRoot) {
  const contributors = executeGitCommand(projectRoot, "git shortlog -sn --all");
  if (!contributors) {
    return "Unable to retrieve contributor data.\n\n";
  }
  const lines = contributors.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return "No contributors found.\n\n";
  }
  let output = `Found ${lines.length} contributor${lines.length === 1 ? "" : "s"}:

`;
  const headers = ["Contributor", "Commits", "Percentage"];
  const contributorData = [];
  let totalCommits = 0;
  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const commits = parseInt(match[1], 10);
      const name = match[2].trim();
      contributorData.push({ name, commits });
      totalCommits += commits;
    }
  }
  const rows = contributorData.slice(0, 10).map((c) => [
    c.name,
    formatNumber(c.commits),
    `${(c.commits / totalCommits * 100).toFixed(1)}%`
  ]);
  output += table(headers, rows);
  if (contributorData.length > 10) {
    output += `... and ${contributorData.length - 10} more contributors.

`;
  }
  return output;
}
function generateFeatureClusters(graph) {
  const dirFiles = /* @__PURE__ */ new Map();
  const fileEdges = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    const dir = dirname24(attrs.filePath);
    if (!dirFiles.has(dir)) {
      dirFiles.set(dir, /* @__PURE__ */ new Set());
    }
    dirFiles.get(dir).add(attrs.filePath);
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile !== targetFile) {
      if (!fileEdges.has(sourceFile)) {
        fileEdges.set(sourceFile, /* @__PURE__ */ new Set());
      }
      fileEdges.get(sourceFile).add(targetFile);
    }
  });
  const clusters = [];
  for (const [dir, files] of dirFiles.entries()) {
    if (dir === "." || files.size < 2) continue;
    const fileArray = Array.from(files);
    let internalEdgeCount = 0;
    for (const file of fileArray) {
      const targets = fileEdges.get(file);
      if (targets) {
        for (const target of targets) {
          if (files.has(target)) {
            internalEdgeCount++;
          }
        }
      }
    }
    if (internalEdgeCount >= 2) {
      const clusterName = inferClusterName2(fileArray, dir);
      clusters.push({
        name: clusterName,
        files: fileArray,
        internalEdges: internalEdgeCount
      });
    }
  }
  if (clusters.length === 0) {
    return "No distinct feature clusters detected.\n\n";
  }
  clusters.sort((a, b) => b.internalEdges - a.internalEdges);
  let output = `Detected ${clusters.length} feature cluster${clusters.length === 1 ? "" : "s"} (tightly-connected file groups):

`;
  for (const cluster of clusters.slice(0, 10)) {
    output += `**${cluster.name}** (${cluster.files.length} files, ${cluster.internalEdges} internal connections):

`;
    const items = cluster.files.slice(0, 5).map((f) => code(f));
    output += unorderedList(items);
    if (cluster.files.length > 5) {
      output += `... and ${cluster.files.length - 5} more files.

`;
    }
  }
  return output;
}
function inferClusterName2(files, dir) {
  const words = /* @__PURE__ */ new Map();
  for (const file of files) {
    const fileName = file.toLowerCase();
    const parts = fileName.split(/[\/\-\_\.]/).filter((p) => p.length > 3);
    for (const part of parts) {
      words.set(part, (words.get(part) || 0) + 1);
    }
  }
  const sortedWords = Array.from(words.entries()).sort((a, b) => b[1] - a[1]);
  if (sortedWords.length > 0 && sortedWords[0][1] > 1) {
    return capitalizeFirst3(sortedWords[0][0]);
  }
  const dirName = dir.split("/").pop() || "Core";
  return capitalizeFirst3(dirName);
}
function capitalizeFirst3(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// src/docs/current.ts
import { dirname as dirname25 } from "path";
function generateCurrent(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount10(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("Complete Codebase Snapshot");
  output += "> **Note:** This is a complete snapshot of the entire codebase. For a high-level overview, see ARCHITECTURE.md.\n\n";
  output += header("Project Overview", 2);
  output += generateProjectOverview(graph);
  output += header("Complete File Index", 2);
  output += generateCompleteFileIndex(graph);
  output += header("Complete Symbol Index", 2);
  output += generateCompleteSymbolIndex(graph);
  output += header("Complete Edge List", 2);
  output += generateCompleteEdgeList(graph);
  output += header("Connection Matrix", 2);
  output += generateConnectionMatrix(graph);
  return output;
}
function getFileCount10(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function getLanguageStats3(graph) {
  const stats = {};
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    if (!files.has(attrs.filePath)) {
      files.add(attrs.filePath);
      const ext = attrs.filePath.toLowerCase();
      let lang;
      if (ext.endsWith(".ts") || ext.endsWith(".tsx")) {
        lang = "TypeScript";
      } else if (ext.endsWith(".py")) {
        lang = "Python";
      } else if (ext.endsWith(".js") || ext.endsWith(".jsx") || ext.endsWith(".mjs") || ext.endsWith(".cjs")) {
        lang = "JavaScript";
      } else if (ext.endsWith(".go")) {
        lang = "Go";
      } else {
        lang = "Other";
      }
      stats[lang] = (stats[lang] || 0) + 1;
    }
  });
  return stats;
}
function generateProjectOverview(graph) {
  const fileCount = getFileCount10(graph);
  const symbolCount = graph.order;
  const edgeCount = graph.size;
  const languages2 = getLanguageStats3(graph);
  let output = "";
  output += `- **Total files:** ${formatNumber(fileCount)}
`;
  output += `- **Total symbols:** ${formatNumber(symbolCount)}
`;
  output += `- **Total edges:** ${formatNumber(edgeCount)}
`;
  if (Object.keys(languages2).length > 0) {
    output += "\n**Language breakdown:**\n\n";
    for (const [lang, count] of Object.entries(languages2).sort((a, b) => b[1] - a[1])) {
      output += `- ${lang}: ${count} files
`;
    }
  }
  output += "\n";
  return output;
}
function getFileInfo(graph) {
  const fileMap = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    if (!fileMap.has(attrs.filePath)) {
      fileMap.set(attrs.filePath, {
        filePath: attrs.filePath,
        language: getLanguageFromPath3(attrs.filePath),
        symbols: [],
        importsFrom: [],
        importedBy: [],
        incomingEdges: 0,
        outgoingEdges: 0
      });
    }
    const info = fileMap.get(attrs.filePath);
    if (attrs.name !== "__file__") {
      info.symbols.push({
        name: attrs.name,
        kind: attrs.kind,
        line: attrs.startLine
      });
    }
  });
  const fileEdges = /* @__PURE__ */ new Map();
  const fileEdgesReverse = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      if (!fileEdges.has(sourceAttrs.filePath)) {
        fileEdges.set(sourceAttrs.filePath, /* @__PURE__ */ new Set());
      }
      fileEdges.get(sourceAttrs.filePath).add(targetAttrs.filePath);
      if (!fileEdgesReverse.has(targetAttrs.filePath)) {
        fileEdgesReverse.set(targetAttrs.filePath, /* @__PURE__ */ new Set());
      }
      fileEdgesReverse.get(targetAttrs.filePath).add(sourceAttrs.filePath);
    }
  });
  for (const [filePath, info] of fileMap.entries()) {
    const importsFrom = fileEdges.get(filePath);
    const importedBy = fileEdgesReverse.get(filePath);
    info.importsFrom = importsFrom ? Array.from(importsFrom) : [];
    info.importedBy = importedBy ? Array.from(importedBy) : [];
    info.outgoingEdges = info.importsFrom.length;
    info.incomingEdges = info.importedBy.length;
  }
  return Array.from(fileMap.values());
}
function getLanguageFromPath3(filePath) {
  const ext = filePath.toLowerCase();
  if (ext.endsWith(".ts") || ext.endsWith(".tsx")) return "TypeScript";
  if (ext.endsWith(".js") || ext.endsWith(".jsx") || ext.endsWith(".mjs") || ext.endsWith(".cjs")) return "JavaScript";
  if (ext.endsWith(".py")) return "Python";
  if (ext.endsWith(".go")) return "Go";
  return "Other";
}
function generateCompleteFileIndex(graph) {
  const fileInfos = getFileInfo(graph);
  if (fileInfos.length === 0) {
    return "No files detected.\n\n";
  }
  fileInfos.sort((a, b) => a.filePath.localeCompare(b.filePath));
  const dirGroups = /* @__PURE__ */ new Map();
  for (const info of fileInfos) {
    const dir = dirname25(info.filePath);
    const topDir = dir === "." ? "root" : dir.split("/")[0];
    if (!dirGroups.has(topDir)) {
      dirGroups.set(topDir, []);
    }
    dirGroups.get(topDir).push(info);
  }
  let output = "";
  for (const [dir, files] of Array.from(dirGroups.entries()).sort()) {
    output += header(dir === "root" ? "Root Directory" : `${dir}/`, 3);
    for (const file of files) {
      output += header(file.filePath, 4);
      output += `- **Language:** ${file.language}
`;
      output += `- **Symbols (${file.symbols.length}):** `;
      if (file.symbols.length === 0) {
        output += "None\n";
      } else if (file.symbols.length <= 10) {
        output += file.symbols.map((s) => s.name).join(", ") + "\n";
      } else {
        output += file.symbols.slice(0, 10).map((s) => s.name).join(", ");
        output += `, ... and ${file.symbols.length - 10} more
`;
      }
      if (file.importsFrom.length > 0) {
        output += `- **Imports from (${file.importsFrom.length}):** `;
        if (file.importsFrom.length <= 5) {
          output += file.importsFrom.map((f) => code(f)).join(", ") + "\n";
        } else {
          output += file.importsFrom.slice(0, 5).map((f) => code(f)).join(", ");
          output += `, ... and ${file.importsFrom.length - 5} more
`;
        }
      }
      if (file.importedBy.length > 0) {
        output += `- **Imported by (${file.importedBy.length}):** `;
        if (file.importedBy.length <= 5) {
          output += file.importedBy.map((f) => code(f)).join(", ") + "\n";
        } else {
          output += file.importedBy.slice(0, 5).map((f) => code(f)).join(", ");
          output += `, ... and ${file.importedBy.length - 5} more
`;
        }
      }
      output += `- **Connections:** ${file.incomingEdges} inbound, ${file.outgoingEdges} outbound

`;
    }
  }
  return output;
}
function generateCompleteSymbolIndex(graph) {
  const symbolsByKind = /* @__PURE__ */ new Map();
  graph.forEachNode((node, attrs) => {
    if (attrs.name === "__file__") return;
    if (!symbolsByKind.has(attrs.kind)) {
      symbolsByKind.set(attrs.kind, []);
    }
    symbolsByKind.get(attrs.kind).push({
      name: attrs.name,
      filePath: attrs.filePath,
      line: attrs.startLine
    });
  });
  if (symbolsByKind.size === 0) {
    return "No symbols detected.\n\n";
  }
  let output = "";
  const sortedKinds = Array.from(symbolsByKind.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [kind, symbols] of sortedKinds) {
    output += header(`${capitalizeKind2(kind)}s (${symbols.length})`, 3);
    const sorted = symbols.sort((a, b) => a.name.localeCompare(b.name));
    const limit = 100;
    const items = sorted.slice(0, limit).map((s) => {
      return `${code(s.name)} \u2014 ${code(s.filePath)}:${s.line}`;
    });
    output += unorderedList(items);
    if (symbols.length > limit) {
      output += `... and ${symbols.length - limit} more.

`;
    }
  }
  return output;
}
function capitalizeKind2(kind) {
  const map = {
    function: "Function",
    class: "Class",
    variable: "Variable",
    constant: "Constant",
    type_alias: "Type",
    interface: "Interface",
    enum: "Enum",
    import: "Import",
    export: "Export",
    method: "Method",
    property: "Property",
    decorator: "Decorator",
    module: "Module",
    template: "Template"
  };
  return map[kind] || kind;
}
function generateCompleteEdgeList(graph) {
  const fileEdges = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      if (!fileEdges.has(sourceAttrs.filePath)) {
        fileEdges.set(sourceAttrs.filePath, []);
      }
      const edgeDesc = `${sourceAttrs.filePath} \u2192 ${targetAttrs.filePath}`;
      if (!fileEdges.get(sourceAttrs.filePath).includes(edgeDesc)) {
        fileEdges.get(sourceAttrs.filePath).push(edgeDesc);
      }
    }
  });
  if (fileEdges.size === 0) {
    return "No cross-file edges detected.\n\n";
  }
  let output = `Total cross-file edges: ${graph.size}

`;
  const sortedEdges = Array.from(fileEdges.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const limit = 50;
  for (const [sourceFile, edges] of sortedEdges.slice(0, limit)) {
    output += header(sourceFile, 3);
    output += unorderedList(edges.map((e) => e.replace(`${sourceFile} \u2192 `, "")));
  }
  if (sortedEdges.length > limit) {
    output += `... and ${sortedEdges.length - limit} more source files with edges.

`;
  }
  return output;
}
function generateConnectionMatrix(graph) {
  const dirEdges = /* @__PURE__ */ new Map();
  const allDirs = /* @__PURE__ */ new Set();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceDir = getTopLevelDir2(sourceAttrs.filePath);
      const targetDir = getTopLevelDir2(targetAttrs.filePath);
      if (sourceDir && targetDir) {
        allDirs.add(sourceDir);
        allDirs.add(targetDir);
        if (!dirEdges.has(sourceDir)) {
          dirEdges.set(sourceDir, /* @__PURE__ */ new Map());
        }
        const targetMap = dirEdges.get(sourceDir);
        targetMap.set(targetDir, (targetMap.get(targetDir) || 0) + 1);
      }
    }
  });
  if (allDirs.size === 0) {
    return "No directory structure detected.\n\n";
  }
  const sortedDirs = Array.from(allDirs).sort();
  let output = "Compact matrix showing which directories depend on which:\n\n";
  output += codeBlock(buildMatrixString(sortedDirs, dirEdges), "");
  return output;
}
function buildMatrixString(dirs, edges) {
  if (dirs.length === 0) return "No directories";
  let result = "           ";
  for (const dir of dirs) {
    result += dir.padEnd(10, " ").substring(0, 10);
  }
  result += "\n";
  for (const sourceDir of dirs) {
    result += sourceDir.padEnd(10, " ").substring(0, 10) + " ";
    for (const targetDir of dirs) {
      if (sourceDir === targetDir) {
        result += "-         ";
      } else {
        const count = edges.get(sourceDir)?.get(targetDir) || 0;
        if (count > 0) {
          result += "\u2192         ";
        } else {
          const reverseCount = edges.get(targetDir)?.get(sourceDir) || 0;
          if (reverseCount > 0) {
            result += "\u2190         ";
          } else {
            result += "          ";
          }
        }
      }
    }
    result += "\n";
  }
  return result;
}
function getTopLevelDir2(filePath) {
  const parts = filePath.split("/");
  if (parts.length < 2) {
    return null;
  }
  if (parts[0] === "src" && parts.length >= 2) {
    return parts.length >= 3 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  const firstDir = parts[0];
  if (firstDir.includes("test") || firstDir.includes("__tests__") || firstDir === "node_modules" || firstDir === "dist" || firstDir === "build") {
    return null;
  }
  return parts[0];
}

// src/docs/status.ts
import { readFileSync as readFileSync19, existsSync as existsSync21 } from "fs";
import { resolve as resolve18 } from "path";
function generateStatus(graph, projectRoot, version) {
  let output = "";
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount11(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("Project Status");
  output += "TODO/FIXME/HACK inventory showing what's implemented vs pending.\n\n";
  output += header("Status Summary", 2);
  output += generateStatusSummary(projectRoot, graph);
  output += header("TODOs by File", 2);
  output += generateTodosByFile(projectRoot, graph);
  output += header("FIXMEs (Urgent)", 2);
  output += generateFixmes(projectRoot, graph);
  output += header("HACKs (Technical Debt)", 2);
  output += generateHacks(projectRoot, graph);
  output += header("Priority Matrix", 2);
  output += generatePriorityMatrix(projectRoot, graph);
  output += header("Deprecated Items", 2);
  output += generateDeprecated(projectRoot, graph);
  output += header("Implementation Completeness", 2);
  output += generateCompleteness(projectRoot, graph);
  return output;
}
function getFileCount11(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function extractComments(projectRoot, filePath) {
  const comments = [];
  const resolvedRoot = resolve18(projectRoot);
  const fullPath = resolve18(resolvedRoot, filePath);
  if (!fullPath.startsWith(resolvedRoot)) {
    return comments;
  }
  if (!existsSync21(fullPath)) {
    return comments;
  }
  try {
    const content = readFileSync19(fullPath, "utf-8");
    const lines = content.split("\n");
    const patterns = [
      { type: "TODO", regex: /(?:\/\/|#|\/\*)\s*TODO:?\s*(.+)/i },
      { type: "FIXME", regex: /(?:\/\/|#|\/\*)\s*FIXME:?\s*(.+)/i },
      { type: "HACK", regex: /(?:\/\/|#|\/\*)\s*HACK:?\s*(.+)/i },
      { type: "XXX", regex: /(?:\/\/|#|\/\*)\s*XXX:?\s*(.+)/i },
      { type: "NOTE", regex: /(?:\/\/|#|\/\*)\s*NOTE:?\s*(.+)/i },
      { type: "OPTIMIZE", regex: /(?:\/\/|#|\/\*)\s*OPTIMIZE:?\s*(.+)/i },
      { type: "DEPRECATED", regex: /(?:\/\/|#|\/\*)\s*DEPRECATED:?\s*(.+)/i }
    ];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        const match = line.match(pattern.regex);
        if (match) {
          comments.push({
            type: pattern.type,
            file: filePath,
            line: i + 1,
            text: match[1].trim().replace(/\*\/.*$/, "").trim()
          });
          break;
        }
      }
    }
  } catch (err) {
    return comments;
  }
  return comments;
}
function getAllComments(projectRoot, graph) {
  const allComments = [];
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  for (const file of files) {
    const comments = extractComments(projectRoot, file);
    allComments.push(...comments);
  }
  return allComments;
}
function generateStatusSummary(projectRoot, graph) {
  const comments = getAllComments(projectRoot, graph);
  const counts = {
    TODO: 0,
    FIXME: 0,
    HACK: 0,
    XXX: 0,
    NOTE: 0,
    OPTIMIZE: 0,
    DEPRECATED: 0
  };
  for (const comment of comments) {
    counts[comment.type]++;
  }
  let output = "";
  output += `- **Total TODOs:** ${formatNumber(counts.TODO)}
`;
  output += `- **Total FIXMEs:** ${formatNumber(counts.FIXME)}
`;
  output += `- **Total HACKs:** ${formatNumber(counts.HACK)}
`;
  if (counts.XXX > 0) {
    output += `- **Total XXXs:** ${formatNumber(counts.XXX)}
`;
  }
  if (counts.NOTE > 0) {
    output += `- **Total NOTEs:** ${formatNumber(counts.NOTE)}
`;
  }
  if (counts.OPTIMIZE > 0) {
    output += `- **Total OPTIMIZEs:** ${formatNumber(counts.OPTIMIZE)}
`;
  }
  if (counts.DEPRECATED > 0) {
    output += `- **Total DEPRECATEDs:** ${formatNumber(counts.DEPRECATED)}
`;
  }
  output += "\n";
  return output;
}
function generateTodosByFile(projectRoot, graph) {
  const comments = getAllComments(projectRoot, graph);
  const todos = comments.filter((c) => c.type === "TODO");
  if (todos.length === 0) {
    return "\u2705 No TODOs found.\n\n";
  }
  const fileGroups = /* @__PURE__ */ new Map();
  for (const todo of todos) {
    if (!fileGroups.has(todo.file)) {
      fileGroups.set(todo.file, []);
    }
    fileGroups.get(todo.file).push(todo);
  }
  let output = `Found ${todos.length} TODO${todos.length === 1 ? "" : "s"} across ${fileGroups.size} file${fileGroups.size === 1 ? "" : "s"}:

`;
  const sortedFiles = Array.from(fileGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [file, fileTodos] of sortedFiles) {
    output += header(file, 3);
    const items = fileTodos.map((t) => `[ ] TODO: ${t.text} (line ${t.line})`);
    output += unorderedList(items);
  }
  return output;
}
function generateFixmes(projectRoot, graph) {
  const comments = getAllComments(projectRoot, graph);
  const fixmes = comments.filter((c) => c.type === "FIXME");
  if (fixmes.length === 0) {
    return "\u2705 No FIXMEs found.\n\n";
  }
  let output = `\u26A0\uFE0F Found ${fixmes.length} FIXME${fixmes.length === 1 ? "" : "s"} (known broken or urgent issues):

`;
  fixmes.sort((a, b) => a.file.localeCompare(b.file));
  const items = fixmes.map((f) => {
    return `[ ] FIXME: ${f.text} (${code(f.file)}:${f.line})`;
  });
  output += unorderedList(items);
  return output;
}
function generateHacks(projectRoot, graph) {
  const comments = getAllComments(projectRoot, graph);
  const hacks = comments.filter((c) => c.type === "HACK");
  if (hacks.length === 0) {
    return "\u2705 No HACKs found.\n\n";
  }
  let output = `Found ${hacks.length} HACK${hacks.length === 1 ? "" : "s"} (technical debt - works but needs proper implementation):

`;
  hacks.sort((a, b) => a.file.localeCompare(b.file));
  const items = hacks.map((h) => {
    return `[ ] HACK: ${h.text} (${code(h.file)}:${h.line})`;
  });
  output += unorderedList(items);
  return output;
}
function generatePriorityMatrix(projectRoot, graph) {
  const comments = getAllComments(projectRoot, graph);
  const fileConnections = /* @__PURE__ */ new Map();
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      fileConnections.set(sourceAttrs.filePath, (fileConnections.get(sourceAttrs.filePath) || 0) + 1);
      fileConnections.set(targetAttrs.filePath, (fileConnections.get(targetAttrs.filePath) || 0) + 1);
    }
  });
  const items = [];
  for (const comment of comments) {
    if (comment.type === "TODO" || comment.type === "FIXME" || comment.type === "HACK") {
      const connections = fileConnections.get(comment.file) || 0;
      let priority = "Low";
      let priorityScore = 1;
      if (comment.type === "FIXME") {
        if (connections > 10) {
          priority = "\u{1F534} Critical";
          priorityScore = 4;
        } else if (connections > 5) {
          priority = "\u{1F7E1} High";
          priorityScore = 3;
        } else {
          priority = "\u{1F7E2} Medium";
          priorityScore = 2;
        }
      } else if (comment.type === "TODO") {
        if (connections > 10) {
          priority = "\u{1F7E1} High";
          priorityScore = 3;
        } else if (connections > 5) {
          priority = "\u{1F7E2} Medium";
          priorityScore = 2;
        } else {
          priority = "\u26AA Low";
          priorityScore = 1;
        }
      } else if (comment.type === "HACK") {
        if (connections > 10) {
          priority = "\u{1F7E1} High";
          priorityScore = 3;
        } else {
          priority = "\u{1F7E2} Medium";
          priorityScore = 2;
        }
      }
      items.push({
        comment,
        connections,
        priority
      });
    }
  }
  if (items.length === 0) {
    return "No items to prioritize.\n\n";
  }
  items.sort((a, b) => {
    const priorityOrder = { "\u{1F534} Critical": 4, "\u{1F7E1} High": 3, "\u{1F7E2} Medium": 2, "\u26AA Low": 1 };
    const aPriority = priorityOrder[a.priority] || 0;
    const bPriority = priorityOrder[b.priority] || 0;
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    return b.connections - a.connections;
  });
  let output = "Items prioritized by type and file connections:\n\n";
  const headers = ["Type", "File", "Line", "Connections", "Priority"];
  const rows = items.slice(0, 20).map((item) => [
    item.comment.type,
    `\`${item.comment.file}\``,
    item.comment.line.toString(),
    formatNumber(item.connections),
    item.priority
  ]);
  output += table(headers, rows);
  if (items.length > 20) {
    output += `... and ${items.length - 20} more items.

`;
  }
  return output;
}
function generateDeprecated(projectRoot, graph) {
  const comments = getAllComments(projectRoot, graph);
  const deprecated = comments.filter((c) => c.type === "DEPRECATED");
  if (deprecated.length === 0) {
    return "\u2705 No deprecated items found.\n\n";
  }
  let output = `Found ${deprecated.length} deprecated item${deprecated.length === 1 ? "" : "s"}:

`;
  deprecated.sort((a, b) => a.file.localeCompare(b.file));
  const items = deprecated.map((d) => {
    return `DEPRECATED: ${d.text} (${code(d.file)}:${d.line})`;
  });
  output += unorderedList(items);
  return output;
}
function generateCompleteness(projectRoot, graph) {
  const comments = getAllComments(projectRoot, graph);
  const fileTodos = /* @__PURE__ */ new Map();
  const fileSymbols = /* @__PURE__ */ new Map();
  for (const comment of comments) {
    if (comment.type === "TODO") {
      fileTodos.set(comment.file, (fileTodos.get(comment.file) || 0) + 1);
    }
  }
  graph.forEachNode((node, attrs) => {
    fileSymbols.set(attrs.filePath, (fileSymbols.get(attrs.filePath) || 0) + 1);
  });
  const allFiles = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    allFiles.add(attrs.filePath);
  });
  const inProgress = [];
  const complete = [];
  for (const file of allFiles) {
    const todoCount = fileTodos.get(file) || 0;
    const symbolCount = fileSymbols.get(file) || 0;
    if (symbolCount === 0) continue;
    const todoRatio = todoCount / symbolCount;
    if (todoRatio > 0.1) {
      inProgress.push(file);
    } else if (todoCount === 0) {
      complete.push(file);
    }
  }
  let output = "";
  const totalFiles = allFiles.size;
  const completePercent = totalFiles > 0 ? (complete.length / totalFiles * 100).toFixed(1) : "0.0";
  output += `- **Complete files (no TODOs):** ${formatNumber(complete.length)} (${completePercent}%)
`;
  output += `- **In-progress files (many TODOs):** ${formatNumber(inProgress.length)}

`;
  if (inProgress.length > 0) {
    output += "**Files in progress (high TODO ratio):**\n\n";
    const items = inProgress.slice(0, 10).map((f) => {
      const todoCount = fileTodos.get(f) || 0;
      return `${code(f)} (${todoCount} TODOs)`;
    });
    output += unorderedList(items);
    if (inProgress.length > 10) {
      output += `... and ${inProgress.length - 10} more.

`;
    }
  }
  const dirTodos = /* @__PURE__ */ new Map();
  const dirFiles = /* @__PURE__ */ new Map();
  for (const file of allFiles) {
    const dir = file.split("/")[0];
    dirFiles.set(dir, (dirFiles.get(dir) || 0) + 1);
    const todoCount = fileTodos.get(file) || 0;
    if (todoCount > 0) {
      dirTodos.set(dir, (dirTodos.get(dir) || 0) + 1);
    }
  }
  if (dirFiles.size > 1) {
    output += "**Completeness by directory:**\n\n";
    const sortedDirs = Array.from(dirFiles.entries()).sort((a, b) => b[1] - a[1]);
    for (const [dir, fileCount] of sortedDirs) {
      const todosInDir = dirTodos.get(dir) || 0;
      const completeInDir = fileCount - todosInDir;
      const percent = (completeInDir / fileCount * 100).toFixed(1);
      output += `- **${dir}/**: ${completeInDir}/${fileCount} files complete (${percent}%)
`;
    }
    output += "\n";
  }
  return output;
}

// src/docs/health.ts
function generateHealth(graph, projectRoot, version) {
  let output = "";
  const report = calculateHealthScore(graph, projectRoot);
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fileCount = getFileCount12(graph);
  output += timestamp(version, now, fileCount, graph.order);
  output += header("Dependency Health Score");
  output += "Analysis of dependency architecture quality across 6 dimensions.\n\n";
  output += header("Overall Score", 2);
  output += generateOverallScore(report);
  output += header("Dimension Breakdown", 2);
  output += generateDimensionsBreakdown(report.dimensions);
  output += header("Recommendations", 2);
  output += generateRecommendations2(report.recommendations);
  output += header("Historical Trend", 2);
  output += generateHistoricalTrend(projectRoot, report);
  output += header("Detailed Metrics", 2);
  output += generateDetailedMetrics(report.dimensions);
  return output;
}
function getFileCount12(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
function generateOverallScore(report) {
  let output = "";
  const gradeEmoji = {
    "A": "\u{1F7E2}",
    "B": "\u{1F535}",
    "C": "\u{1F7E1}",
    "D": "\u{1F7E0}",
    "F": "\u{1F534}"
  };
  output += `**Score:** ${report.overall}/100

`;
  output += `**Grade:** ${gradeEmoji[report.grade]} ${report.grade}

`;
  output += `**Summary:** ${report.summary}

`;
  output += `**Project Statistics:**

`;
  output += `- Files: ${formatNumber(report.projectStats.files)}
`;
  output += `- Symbols: ${formatNumber(report.projectStats.symbols)}
`;
  output += `- Edges: ${formatNumber(report.projectStats.edges)}
`;
  const langs = Object.entries(report.projectStats.languages).sort((a, b) => b[1] - a[1]).map(([lang, count]) => `${lang} (${count})`).join(", ");
  output += `- Languages: ${langs}

`;
  return output;
}
function generateDimensionsBreakdown(dimensions) {
  let output = "";
  const headers = ["Dimension", "Score", "Grade", "Weight", "Details"];
  const rows = dimensions.map((d) => [
    d.name,
    `${d.score}/100`,
    d.grade,
    `${(d.weight * 100).toFixed(0)}%`,
    d.details
  ]);
  output += table(headers, rows);
  return output;
}
function generateRecommendations2(recommendations) {
  if (recommendations.length === 0) {
    return "\u2705 No critical issues detected.\n\n";
  }
  return unorderedList(recommendations);
}
function generateHistoricalTrend(projectRoot, currentReport) {
  const history = loadHealthHistory(projectRoot);
  if (history.length < 2) {
    return "No historical data available. Run `depwire health` regularly to track trends.\n\n";
  }
  let output = `Showing last ${Math.min(history.length, 10)} health checks:

`;
  const headers = ["Date", "Score", "Grade", "Trend"];
  const recent = history.slice(-10);
  const rows = recent.map((entry, idx) => {
    let trend = "\u2014";
    if (idx > 0) {
      const prev = recent[idx - 1];
      const delta = entry.score - prev.score;
      if (delta > 0) {
        trend = `\u2191 +${delta}`;
      } else if (delta < 0) {
        trend = `\u2193 ${delta}`;
      } else {
        trend = "\u2192 0";
      }
    }
    return [
      entry.timestamp.split("T")[0],
      entry.score.toString(),
      entry.grade,
      trend
    ];
  });
  output += table(headers, rows);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const totalDelta = last.score - first.score;
  output += `
**Trend:** `;
  if (totalDelta > 0) {
    output += `\u{1F4C8} Improved by ${totalDelta} points over ${recent.length} checks

`;
  } else if (totalDelta < 0) {
    output += `\u{1F4C9} Declined by ${Math.abs(totalDelta)} points over ${recent.length} checks

`;
  } else {
    output += `\u{1F4CA} Stable at ${last.score} points over ${recent.length} checks

`;
  }
  return output;
}
function generateDetailedMetrics(dimensions) {
  let output = "";
  for (const dim of dimensions) {
    output += header(dim.name, 3);
    output += `**Score:** ${dim.score}/100 (${dim.grade})

`;
    output += `**Details:** ${dim.details}

`;
    if (Object.keys(dim.metrics).length > 0) {
      output += `**Metrics:**

`;
      for (const [key, value] of Object.entries(dim.metrics)) {
        output += `- ${key}: ${typeof value === "number" ? formatNumber(value) : value}
`;
      }
      output += "\n";
    }
  }
  return output;
}

// src/docs/dead-code.ts
import path5 from "path";
function generateDeadCode(graph, projectRoot, projectName) {
  const report = analyzeDeadCode(graph, projectRoot, {
    confidence: "low",
    includeTests: false,
    verbose: true,
    stats: true,
    json: true
  });
  let output = "";
  output += header(`${projectName} - Dead Code Analysis`, 1);
  const version = process.env.npm_package_version || "0.9.7";
  const date = (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const fileCount = graph.order;
  const symbolCount = report.totalSymbols;
  output += timestamp(version, date, fileCount, symbolCount);
  output += "\n";
  output += header("Summary", 2);
  if (report.deadSymbols === 0) {
    output += "\u2705 **No dead code detected!**\n\n";
    output += "All symbols in this codebase have at least one dependent. This indicates:\n\n";
    output += "- Clean architecture with no orphaned functions or unused exports\n";
    output += "- Active codebase with well-maintained dependencies\n";
    output += "- Or very few symbols (small project)\n\n";
    output += `Total symbols analyzed: **${formatNumber(report.totalSymbols ?? 0)}**

`;
    output += "---\n\n";
    output += "_This document was auto-generated by Depwire._\n";
    return output;
  }
  output += `Total symbols analyzed: **${formatNumber(report.totalSymbols ?? 0)}**

`;
  output += `Potentially dead symbols: **${formatNumber(report.deadSymbols ?? 0)}** (${(report.deadPercentage ?? 0).toFixed(1)}%)

`;
  output += `- \u{1F534} High confidence (definitely dead): **${report.byConfidence?.high ?? 0}**
`;
  output += `- \u{1F7E1} Medium confidence (probably dead): **${report.byConfidence?.medium ?? 0}**
`;
  output += `- \u26AA Low confidence (might be dead): **${report.byConfidence?.low ?? 0}**

`;
  const estimatedLines = (report.deadSymbols ?? 0) * 18;
  output += `Estimated dead code: **~${formatNumber(estimatedLines)} lines**

`;
  const symbolsByConfidence = groupByConfidence2(report.symbols);
  if (symbolsByConfidence.high.length > 0) {
    output += generateConfidenceSection(
      "High Confidence",
      "definitely dead",
      symbolsByConfidence.high,
      projectRoot
    );
  }
  if (symbolsByConfidence.medium.length > 0) {
    output += generateConfidenceSection(
      "Medium Confidence",
      "probably dead",
      symbolsByConfidence.medium,
      projectRoot
    );
  }
  if (symbolsByConfidence.low.length > 0) {
    output += generateConfidenceSection(
      "Low Confidence",
      "might be dead",
      symbolsByConfidence.low,
      projectRoot
    );
  }
  output += "\n---\n\n";
  output += "_This document was auto-generated by Depwire. It reflects the current state of the codebase and should be reviewed before taking action._\n";
  return output;
}
function groupByConfidence2(symbols) {
  return symbols.reduce(
    (acc, symbol) => {
      acc[symbol.confidence].push(symbol);
      return acc;
    },
    { high: [], medium: [], low: [] }
  );
}
function generateConfidenceSection(title, description, symbols, projectRoot) {
  let output = "";
  output += header(`${title} (${description})`, 2);
  output += `Found **${symbols.length}** symbol${symbols.length === 1 ? "" : "s"}.

`;
  const headers = ["Symbol", "Kind", "File", "Exported", "Reason"];
  const rows = symbols.map((s) => {
    const relativePath = path5.relative(projectRoot, s.file);
    return [
      code(s.name),
      s.kind,
      `${relativePath}:${s.line}`,
      s.exported ? "Yes" : "No",
      s.reason
    ];
  });
  output += table(headers, rows);
  output += "\n";
  return output;
}

// src/docs/metadata.ts
import { existsSync as existsSync22, readFileSync as readFileSync20, writeFileSync as writeFileSync2 } from "fs";
import { resolve as resolve19 } from "path";
function loadMetadata(outputDir) {
  const resolvedDir = resolve19(outputDir);
  const metadataPath = resolve19(resolvedDir, "metadata.json");
  if (!metadataPath.startsWith(resolvedDir) || !existsSync22(metadataPath)) {
    return null;
  }
  try {
    const content = readFileSync20(metadataPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Failed to load metadata:", err);
    return null;
  }
}
function saveMetadata(outputDir, metadata) {
  const resolvedDir = resolve19(outputDir);
  const metadataPath = resolve19(resolvedDir, "metadata.json");
  if (!metadataPath.startsWith(resolvedDir)) {
    throw new Error(`Path traversal attempt blocked: ${metadataPath}`);
  }
  writeFileSync2(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
}
function createMetadata(version, projectPath, fileCount, symbolCount, edgeCount, docTypes) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const documents = {};
  for (const docType of docTypes) {
    const fileName = docType === "architecture" ? "ARCHITECTURE.md" : docType === "conventions" ? "CONVENTIONS.md" : docType === "dependencies" ? "DEPENDENCIES.md" : docType === "onboarding" ? "ONBOARDING.md" : docType === "files" ? "FILES.md" : docType === "api_surface" ? "API_SURFACE.md" : docType === "errors" ? "ERRORS.md" : docType === "tests" ? "TESTS.md" : docType === "history" ? "HISTORY.md" : docType === "current" ? "CURRENT.md" : docType === "status" ? "STATUS.md" : docType === "health" ? "HEALTH.md" : `${docType.toUpperCase()}.md`;
    documents[docType] = {
      generated_at: now,
      file: fileName
    };
  }
  return {
    version,
    generated_at: now,
    project_path: projectPath,
    file_count: fileCount,
    symbol_count: symbolCount,
    edge_count: edgeCount,
    documents
  };
}
function updateMetadata(existing, docTypes, fileCount, symbolCount, edgeCount) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const docType of docTypes) {
    if (existing.documents[docType]) {
      existing.documents[docType].generated_at = now;
    }
  }
  existing.file_count = fileCount;
  existing.symbol_count = symbolCount;
  existing.edge_count = edgeCount;
  existing.generated_at = now;
  return existing;
}

// src/docs/generator.ts
async function generateDocs(graph, projectRoot, version, parseTime, options) {
  const startTime = Date.now();
  const generated = [];
  const errors = [];
  try {
    if (!existsSync23(options.outputDir)) {
      mkdirSync3(options.outputDir, { recursive: true });
      if (options.verbose) {
        console.log(`Created output directory: ${options.outputDir}`);
      }
    }
    let docsToGenerate = options.include;
    if (options.update && options.only) {
      docsToGenerate = options.only;
    }
    if (docsToGenerate.includes("all")) {
      docsToGenerate = [
        "architecture",
        "conventions",
        "dependencies",
        "onboarding",
        "files",
        "api_surface",
        "errors",
        "tests",
        "history",
        "current",
        "status",
        "health",
        "dead_code"
      ];
    }
    let metadata = null;
    if (options.update) {
      metadata = loadMetadata(options.outputDir);
    }
    const fileCount = getFileCount13(graph);
    const symbolCount = graph.order;
    const edgeCount = graph.size;
    if (options.format === "markdown") {
      if (docsToGenerate.includes("architecture")) {
        try {
          if (options.verbose) console.log("Generating ARCHITECTURE.md...");
          const content = generateArchitecture(graph, projectRoot, version, parseTime);
          const filePath = join26(options.outputDir, "ARCHITECTURE.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("ARCHITECTURE.md");
        } catch (err) {
          errors.push(`Failed to generate ARCHITECTURE.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("conventions")) {
        try {
          if (options.verbose) console.log("Generating CONVENTIONS.md...");
          const content = generateConventions(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "CONVENTIONS.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("CONVENTIONS.md");
        } catch (err) {
          errors.push(`Failed to generate CONVENTIONS.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("dependencies")) {
        try {
          if (options.verbose) console.log("Generating DEPENDENCIES.md...");
          const content = generateDependencies(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "DEPENDENCIES.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("DEPENDENCIES.md");
        } catch (err) {
          errors.push(`Failed to generate DEPENDENCIES.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("onboarding")) {
        try {
          if (options.verbose) console.log("Generating ONBOARDING.md...");
          const content = generateOnboarding(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "ONBOARDING.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("ONBOARDING.md");
        } catch (err) {
          errors.push(`Failed to generate ONBOARDING.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("files")) {
        try {
          if (options.verbose) console.log("Generating FILES.md...");
          const content = generateFiles(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "FILES.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("FILES.md");
        } catch (err) {
          errors.push(`Failed to generate FILES.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("api_surface")) {
        try {
          if (options.verbose) console.log("Generating API_SURFACE.md...");
          const content = generateApiSurface(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "API_SURFACE.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("API_SURFACE.md");
        } catch (err) {
          errors.push(`Failed to generate API_SURFACE.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("errors")) {
        try {
          if (options.verbose) console.log("Generating ERRORS.md...");
          const content = generateErrors(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "ERRORS.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("ERRORS.md");
        } catch (err) {
          errors.push(`Failed to generate ERRORS.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("tests")) {
        try {
          if (options.verbose) console.log("Generating TESTS.md...");
          const content = generateTests(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "TESTS.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("TESTS.md");
        } catch (err) {
          errors.push(`Failed to generate TESTS.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("history")) {
        try {
          if (options.verbose) console.log("Generating HISTORY.md...");
          const content = generateHistory(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "HISTORY.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("HISTORY.md");
        } catch (err) {
          errors.push(`Failed to generate HISTORY.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("current")) {
        try {
          if (options.verbose) console.log("Generating CURRENT.md...");
          const content = generateCurrent(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "CURRENT.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("CURRENT.md");
        } catch (err) {
          errors.push(`Failed to generate CURRENT.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("status")) {
        try {
          if (options.verbose) console.log("Generating STATUS.md...");
          const content = generateStatus(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "STATUS.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("STATUS.md");
        } catch (err) {
          errors.push(`Failed to generate STATUS.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("health")) {
        try {
          if (options.verbose) console.log("Generating HEALTH.md...");
          const content = generateHealth(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "HEALTH.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("HEALTH.md");
        } catch (err) {
          errors.push(`Failed to generate HEALTH.md: ${err}`);
        }
      }
      if (docsToGenerate.includes("dead_code")) {
        try {
          if (options.verbose) console.log("Generating DEAD_CODE.md...");
          const content = generateDeadCode(graph, projectRoot, version);
          const filePath = join26(options.outputDir, "DEAD_CODE.md");
          writeFileSync3(filePath, content, "utf-8");
          generated.push("DEAD_CODE.md");
        } catch (err) {
          errors.push(`Failed to generate DEAD_CODE.md: ${err}`);
        }
      }
    } else if (options.format === "json") {
      errors.push("JSON format not yet supported");
    }
    if (metadata && options.update) {
      metadata = updateMetadata(metadata, docsToGenerate, fileCount, symbolCount, edgeCount);
    } else {
      metadata = createMetadata(version, projectRoot, fileCount, symbolCount, edgeCount, docsToGenerate);
    }
    saveMetadata(options.outputDir, metadata);
    if (options.verbose) console.log("Saved metadata.json");
    const totalTime = Date.now() - startTime;
    return {
      success: errors.length === 0,
      generated,
      errors,
      stats: options.stats ? {
        totalTime,
        filesGenerated: generated.length
      } : void 0
    };
  } catch (err) {
    return {
      success: false,
      generated,
      errors: [`Fatal error: ${err}`]
    };
  }
}
function getFileCount13(graph) {
  const files = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

// src/simulation/engine.ts
import { dirname as dirname26, join as join27 } from "path";
function normalizePath2(p) {
  return p.replace(/^\.\//, "").replace(/\/+$/, "");
}
function fileMatch(nodeFilePath, target) {
  const a = normalizePath2(nodeFilePath);
  const b = normalizePath2(target);
  return a === b || a.endsWith("/" + b) || b.endsWith("/" + a);
}
var SimulationEngine = class {
  original;
  constructor(graph) {
    this.original = graph;
  }
  simulate(action) {
    const clone = this.original.copy();
    const brokenImports = [];
    switch (action.type) {
      case "move":
        this.applyMove(clone, action.target, action.destination, brokenImports);
        break;
      case "delete":
        this.applyDelete(clone, action.target, brokenImports);
        break;
      case "rename":
        this.applyRename(clone, action.target, action.newName, brokenImports);
        break;
      case "split":
        this.applySplit(clone, action.target, action.newFile, action.symbols, brokenImports);
        break;
      case "merge":
        this.applyMerge(clone, action.target, action.source, brokenImports);
        break;
    }
    const diff = this.computeDiff(this.original, clone, brokenImports);
    const beforeHealth = this.computeHealthScore(this.original);
    const afterHealth = this.computeHealthScore(clone);
    const dimensionChanges = beforeHealth.dimensions.map((bd, i) => {
      const ad = afterHealth.dimensions[i];
      return {
        name: bd.name,
        before: bd.score,
        after: ad ? ad.score : bd.score,
        delta: (ad ? ad.score : bd.score) - bd.score
      };
    });
    const healthDelta = {
      before: beforeHealth.score,
      after: afterHealth.score,
      delta: afterHealth.score - beforeHealth.score,
      improved: afterHealth.score > beforeHealth.score,
      dimensionChanges
    };
    return {
      action,
      originalGraph: {
        nodeCount: this.original.order,
        edgeCount: this.original.size,
        healthScore: beforeHealth.score
      },
      simulatedGraph: {
        nodeCount: clone.order,
        edgeCount: clone.size,
        healthScore: afterHealth.score
      },
      diff,
      healthDelta,
      simulatedGraphInstance: clone
    };
  }
  // ── Action implementations ─────────────────────────────────────
  applyMove(clone, target, destination, brokenImports) {
    const normalizedTarget = normalizePath2(target);
    const normalizedDest = normalizePath2(destination);
    const nodesToMove = clone.filterNodes(
      (_node, attrs) => fileMatch(attrs.filePath, target)
    );
    if (nodesToMove.length === 0) return;
    for (const oldId of nodesToMove) {
      const attrs = clone.getNodeAttributes(oldId);
      const symbolName = oldId.includes("::") ? oldId.split("::").slice(1).join("::") : attrs.name;
      const newId = `${normalizedDest}::${symbolName}`;
      clone.forEachInEdge(oldId, (edge, edgeAttrs, source) => {
        const sourceAttrs = clone.getNodeAttributes(source);
        if (!fileMatch(sourceAttrs.filePath, target)) {
          brokenImports.push({
            file: sourceAttrs.filePath,
            importedSymbol: attrs.name,
            reason: `imports ${attrs.name} from ${target} (path would break)`
          });
        }
      });
      if (!clone.hasNode(newId)) {
        clone.addNode(newId, { ...attrs, filePath: normalizedDest });
      }
      clone.forEachInEdge(oldId, (edge, edgeAttrs, source) => {
        const newSource = nodesToMove.includes(source) ? `${normalizedDest}::${source.includes("::") ? source.split("::").slice(1).join("::") : clone.getNodeAttributes(source).name}` : source;
        if (clone.hasNode(newSource) && clone.hasNode(newId)) {
          clone.mergeEdge(newSource, newId, edgeAttrs);
        }
      });
      clone.forEachOutEdge(oldId, (edge, edgeAttrs, _source, outTarget) => {
        const newTarget = nodesToMove.includes(outTarget) ? `${normalizedDest}::${outTarget.includes("::") ? outTarget.split("::").slice(1).join("::") : clone.getNodeAttributes(outTarget).name}` : outTarget;
        if (clone.hasNode(newId) && clone.hasNode(newTarget)) {
          clone.mergeEdge(newId, newTarget, edgeAttrs);
        }
      });
      clone.dropNode(oldId);
    }
  }
  applyDelete(clone, target, brokenImports) {
    const nodesToDelete = clone.filterNodes(
      (_node, attrs) => fileMatch(attrs.filePath, target)
    );
    for (const nodeId of nodesToDelete) {
      const attrs = clone.getNodeAttributes(nodeId);
      clone.forEachInEdge(nodeId, (_edge, _edgeAttrs, source) => {
        const sourceAttrs = clone.getNodeAttributes(source);
        if (!fileMatch(sourceAttrs.filePath, target)) {
          brokenImports.push({
            file: sourceAttrs.filePath,
            importedSymbol: attrs.name,
            reason: `imports ${attrs.name} from ${target} (file deleted)`
          });
        }
      });
    }
    for (const nodeId of nodesToDelete) {
      clone.dropNode(nodeId);
    }
  }
  applyRename(clone, target, newName, brokenImports) {
    const destination = join27(dirname26(target), newName);
    this.applyMove(clone, target, destination, brokenImports);
  }
  applySplit(clone, target, newFile, symbols, brokenImports) {
    const normalizedNewFile = normalizePath2(newFile);
    const nodesToSplit = clone.filterNodes((_node, attrs) => {
      return fileMatch(attrs.filePath, target) && symbols.includes(attrs.name);
    });
    if (nodesToSplit.length === 0) return;
    for (const oldId of nodesToSplit) {
      const attrs = clone.getNodeAttributes(oldId);
      const symbolName = oldId.includes("::") ? oldId.split("::").slice(1).join("::") : attrs.name;
      const newId = `${normalizedNewFile}::${symbolName}`;
      clone.forEachInEdge(oldId, (_edge, _edgeAttrs, source) => {
        const sourceAttrs = clone.getNodeAttributes(source);
        if (!fileMatch(sourceAttrs.filePath, target) && !fileMatch(sourceAttrs.filePath, newFile)) {
          brokenImports.push({
            file: sourceAttrs.filePath,
            importedSymbol: attrs.name,
            reason: `imports ${attrs.name} from ${target} (symbol moved to ${newFile})`
          });
        }
      });
      if (!clone.hasNode(newId)) {
        clone.addNode(newId, { ...attrs, filePath: normalizedNewFile });
      }
      clone.forEachInEdge(oldId, (_edge, edgeAttrs, source) => {
        if (clone.hasNode(source) && clone.hasNode(newId)) {
          clone.mergeEdge(source, newId, edgeAttrs);
        }
      });
      clone.forEachOutEdge(oldId, (_edge, edgeAttrs, _source, outTarget) => {
        if (clone.hasNode(newId) && clone.hasNode(outTarget)) {
          clone.mergeEdge(newId, outTarget, edgeAttrs);
        }
      });
      clone.dropNode(oldId);
    }
  }
  applyMerge(clone, target, source, brokenImports) {
    const normalizedTarget = normalizePath2(target);
    const sourceNodes = clone.filterNodes(
      (_node, attrs) => fileMatch(attrs.filePath, source)
    );
    const targetNodes = clone.filterNodes(
      (_node, attrs) => fileMatch(attrs.filePath, target)
    );
    const targetSymbols = new Set(
      targetNodes.map((n) => clone.getNodeAttributes(n).name)
    );
    for (const nodeId of sourceNodes) {
      const name = clone.getNodeAttributes(nodeId).name;
      if (name !== "__file__" && targetSymbols.has(name)) {
        throw new Error(
          `Merge conflict: symbol "${name}" exists in both ${target} and ${source}`
        );
      }
    }
    for (const oldId of sourceNodes) {
      const attrs = clone.getNodeAttributes(oldId);
      const symbolName = oldId.includes("::") ? oldId.split("::").slice(1).join("::") : attrs.name;
      const newId = `${normalizedTarget}::${symbolName}`;
      clone.forEachInEdge(oldId, (_edge, _edgeAttrs, inSource) => {
        const srcAttrs = clone.getNodeAttributes(inSource);
        if (!fileMatch(srcAttrs.filePath, source) && !fileMatch(srcAttrs.filePath, target)) {
          brokenImports.push({
            file: srcAttrs.filePath,
            importedSymbol: attrs.name,
            reason: `imports ${attrs.name} from ${source} (merged into ${target})`
          });
        }
      });
      if (!clone.hasNode(newId)) {
        clone.addNode(newId, { ...attrs, filePath: normalizedTarget });
      }
      clone.forEachInEdge(oldId, (_edge, edgeAttrs, inSource) => {
        const resolvedSource = sourceNodes.includes(inSource) ? `${normalizedTarget}::${inSource.includes("::") ? inSource.split("::").slice(1).join("::") : clone.getNodeAttributes(inSource).name}` : inSource;
        if (clone.hasNode(resolvedSource) && clone.hasNode(newId)) {
          clone.mergeEdge(resolvedSource, newId, edgeAttrs);
        }
      });
      clone.forEachOutEdge(oldId, (_edge, edgeAttrs, _s, outTarget) => {
        const resolvedTarget = sourceNodes.includes(outTarget) ? `${normalizedTarget}::${outTarget.includes("::") ? outTarget.split("::").slice(1).join("::") : clone.getNodeAttributes(outTarget).name}` : outTarget;
        if (clone.hasNode(newId) && clone.hasNode(resolvedTarget)) {
          clone.mergeEdge(newId, resolvedTarget, edgeAttrs);
        }
      });
      clone.dropNode(oldId);
    }
  }
  // ── Diff computation ───────────────────────────────────────────
  computeDiff(original, simulated, brokenImports) {
    const originalEdges = this.collectEdges(original);
    const simulatedEdges = this.collectEdges(simulated);
    const originalKeys = new Set(originalEdges.map((e) => this.edgeKey(e)));
    const simulatedKeys = new Set(simulatedEdges.map((e) => this.edgeKey(e)));
    const addedEdges = simulatedEdges.filter((e) => !originalKeys.has(this.edgeKey(e)));
    const removedEdges = originalEdges.filter((e) => !simulatedKeys.has(this.edgeKey(e)));
    const affectedNodeSet = /* @__PURE__ */ new Set();
    for (const e of [...addedEdges, ...removedEdges]) {
      affectedNodeSet.add(e.source);
      affectedNodeSet.add(e.target);
    }
    const originalCycles = this.detectCycles(original);
    const simulatedCycles = this.detectCycles(simulated);
    const originalCycleKeys = new Set(originalCycles.map((c) => [...c].sort().join(",")));
    const simulatedCycleKeys = new Set(simulatedCycles.map((c) => [...c].sort().join(",")));
    const circularDepsIntroduced = simulatedCycles.filter(
      (c) => !originalCycleKeys.has([...c].sort().join(","))
    );
    const circularDepsResolved = originalCycles.filter(
      (c) => !simulatedCycleKeys.has([...c].sort().join(","))
    );
    return {
      addedEdges,
      removedEdges,
      affectedNodes: Array.from(affectedNodeSet),
      brokenImports,
      circularDepsIntroduced,
      circularDepsResolved
    };
  }
  collectEdges(graph) {
    const edges = [];
    graph.forEachEdge((_edge, attrs, source, target) => {
      edges.push({ source, target, kind: attrs.kind });
    });
    return edges;
  }
  edgeKey(e) {
    return `${e.source}|${e.target}|${e.kind || ""}`;
  }
  // ── Cycle detection (adapted from src/health/metrics.ts) ───────
  detectCycles(graph) {
    const fileGraph = /* @__PURE__ */ new Map();
    graph.forEachEdge((_edge, _attrs, source, target) => {
      const sourceFile = graph.getNodeAttributes(source).filePath;
      const targetFile = graph.getNodeAttributes(target).filePath;
      if (sourceFile !== targetFile) {
        if (!fileGraph.has(sourceFile)) {
          fileGraph.set(sourceFile, /* @__PURE__ */ new Set());
        }
        fileGraph.get(sourceFile).add(targetFile);
      }
    });
    const visited = /* @__PURE__ */ new Set();
    const recStack = /* @__PURE__ */ new Set();
    const cycles = [];
    const dfs = (node, path6) => {
      if (recStack.has(node)) {
        const cycleStart = path6.indexOf(node);
        if (cycleStart >= 0) {
          cycles.push(path6.slice(cycleStart));
        }
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      recStack.add(node);
      path6.push(node);
      const neighbors = fileGraph.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          dfs(neighbor, [...path6]);
        }
      }
      recStack.delete(node);
    };
    for (const node of fileGraph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }
    const unique = /* @__PURE__ */ new Map();
    for (const cycle of cycles) {
      const key = [...cycle].sort().join(",");
      if (!unique.has(key)) {
        unique.set(key, cycle);
      }
    }
    return Array.from(unique.values());
  }
  // ── Health score (side-effect free) ────────────────────────────
  computeHealthScore(graph) {
    const dimensions = [
      calculateCouplingScore(graph),
      calculateCohesionScore(graph),
      calculateCircularDepsScore(graph),
      calculateGodFilesScore(graph),
      calculateOrphansScore(graph),
      calculateDepthScore(graph)
    ];
    const score = Math.round(
      dimensions.reduce((sum, dim) => sum + dim.score * dim.weight, 0)
    );
    return { score, dimensions };
  }
};

// src/security/scanner.ts
import { existsSync as existsSync25 } from "fs";
import { join as join37 } from "path";

// src/security/checks/dependencies.ts
import { execSync as execSync2 } from "child_process";
import { existsSync as existsSync24, readFileSync as readFileSync21, readdirSync as readdirSync12 } from "fs";
import { join as join28 } from "path";
function cvssToSeverity(score) {
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}
async function checkDependencies(_files, projectRoot) {
  const findings = [];
  try {
    if (existsSync24(join28(projectRoot, "package.json"))) {
      findings.push(...checkNpmAudit(projectRoot));
      findings.push(...checkPackageJsonPatterns(projectRoot));
      findings.push(...checkPostinstallScripts(projectRoot));
    }
    if (existsSync24(join28(projectRoot, "requirements.txt")) || existsSync24(join28(projectRoot, "pyproject.toml"))) {
      findings.push(...checkPipAudit(projectRoot));
    }
    if (existsSync24(join28(projectRoot, "Cargo.toml"))) {
      findings.push(...checkCargoAudit(projectRoot));
    }
    if (existsSync24(join28(projectRoot, "go.mod"))) {
      findings.push(...checkGoVerify(projectRoot));
    }
  } catch (err) {
    findings.push({
      id: "",
      severity: "info",
      vulnerabilityClass: "dependency-cve",
      file: "package.json",
      title: "Dependency audit error",
      description: `Dependency audit encountered an error: ${String(err)}`,
      attackScenario: "N/A",
      suggestedFix: "Ensure audit tools are installed and try again."
    });
  }
  return findings;
}
function checkNpmAudit(projectRoot) {
  const findings = [];
  try {
    const output = execSync2("npm audit --json", {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 3e4,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const audit = JSON.parse(output);
    const vulnerabilities = audit.vulnerabilities || {};
    for (const [name, vuln] of Object.entries(vulnerabilities)) {
      const severity = vuln.severity === "critical" ? "critical" : vuln.severity === "high" ? "high" : vuln.severity === "moderate" ? "medium" : "low";
      findings.push({
        id: "",
        severity,
        vulnerabilityClass: "dependency-cve",
        file: "package.json",
        title: `Vulnerable dependency: ${name}`,
        description: `${name}@${vuln.range || "unknown"} has a known ${vuln.severity} vulnerability. ${vuln.title || ""}`.trim(),
        attackScenario: `An attacker could exploit the known vulnerability in ${name} to compromise the application.`,
        suggestedFix: vuln.fixAvailable ? `Update ${name} to a patched version.` : `No fix currently available. Consider replacing ${name}.`
      });
    }
  } catch (err) {
    if (err.stdout) {
      try {
        const audit = JSON.parse(err.stdout);
        const vulnerabilities = audit.vulnerabilities || {};
        for (const [name, vuln] of Object.entries(vulnerabilities)) {
          const severity = vuln.severity === "critical" ? "critical" : vuln.severity === "high" ? "high" : vuln.severity === "moderate" ? "medium" : "low";
          findings.push({
            id: "",
            severity,
            vulnerabilityClass: "dependency-cve",
            file: "package.json",
            title: `Vulnerable dependency: ${name}`,
            description: `${name}@${vuln.range || "unknown"} has a known ${vuln.severity} vulnerability.`,
            attackScenario: `An attacker could exploit the known vulnerability in ${name}.`,
            suggestedFix: vuln.fixAvailable ? `Update ${name} to a patched version.` : `No fix currently available.`
          });
        }
      } catch {
        findings.push({
          id: "",
          severity: "info",
          vulnerabilityClass: "dependency-cve",
          file: "package.json",
          title: "npm audit unavailable",
          description: "Could not parse npm audit output.",
          attackScenario: "N/A",
          suggestedFix: "Run npm audit manually to check for vulnerabilities."
        });
      }
    } else {
      findings.push({
        id: "",
        severity: "info",
        vulnerabilityClass: "dependency-cve",
        file: "package.json",
        title: "npm audit unavailable",
        description: "npm audit command failed or is not available.",
        attackScenario: "N/A",
        suggestedFix: "Ensure npm is installed and run npm audit manually."
      });
    }
  }
  return findings;
}
function checkPackageJsonPatterns(projectRoot) {
  const findings = [];
  try {
    const pkgPath = join28(projectRoot, "package.json");
    const pkg = JSON.parse(readFileSync21(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(allDeps)) {
      if (version.startsWith("^") || version.startsWith("~")) {
        findings.push({
          id: "",
          severity: "info",
          vulnerabilityClass: "supply-chain",
          file: "package.json",
          title: `Flexible version range: ${name}@${version}`,
          description: `${name} uses a ${version.startsWith("^") ? "caret" : "tilde"} version range which allows automatic minor/patch updates.`,
          attackScenario: "A compromised patch release could be automatically installed.",
          suggestedFix: `Pin to an exact version or use a lockfile to ensure reproducible builds.`
        });
      }
    }
  } catch {
  }
  return findings;
}
function checkPostinstallScripts(projectRoot) {
  const findings = [];
  const nodeModules = join28(projectRoot, "node_modules");
  if (!existsSync24(nodeModules)) return findings;
  try {
    const topLevelDeps = readdirSync12(nodeModules).filter((d) => !d.startsWith("."));
    for (const dep of topLevelDeps) {
      const depPkgPath = join28(nodeModules, dep, "package.json");
      if (!existsSync24(depPkgPath)) continue;
      try {
        const depPkg = JSON.parse(readFileSync21(depPkgPath, "utf-8"));
        const scripts = depPkg.scripts || {};
        if (scripts.postinstall || scripts.preinstall || scripts.install) {
          const scriptName = scripts.postinstall ? "postinstall" : scripts.preinstall ? "preinstall" : "install";
          const scriptContent = scripts[scriptName];
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "supply-chain",
            file: `node_modules/${dep}/package.json`,
            title: `Supply chain risk: ${dep} has ${scriptName} script`,
            description: `The dependency ${dep} runs a ${scriptName} script on install: "${scriptContent}".`,
            attackScenario: `A compromised version of ${dep} could execute arbitrary code during npm install via its ${scriptName} script.`,
            suggestedFix: `Review the ${scriptName} script. Consider using --ignore-scripts or switching to a dependency without lifecycle scripts.`
          });
        }
      } catch {
      }
    }
  } catch {
  }
  return findings;
}
function checkPipAudit(projectRoot) {
  const findings = [];
  try {
    const output = execSync2("pip audit --format json", {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 3e4,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const audit = JSON.parse(output);
    for (const vuln of audit.vulnerabilities || []) {
      findings.push({
        id: "",
        severity: cvssToSeverity(vuln.cvss?.score || 5),
        vulnerabilityClass: "dependency-cve",
        file: existsSync24(join28(projectRoot, "requirements.txt")) ? "requirements.txt" : "pyproject.toml",
        title: `Vulnerable Python dependency: ${vuln.name}`,
        description: `${vuln.name}@${vuln.version} \u2014 ${vuln.id}: ${vuln.description || "Known vulnerability"}`,
        attackScenario: `An attacker could exploit the vulnerability in ${vuln.name}.`,
        suggestedFix: vuln.fix_versions?.length ? `Update to version ${vuln.fix_versions.join(" or ")}.` : "No fix available."
      });
    }
  } catch {
    findings.push({
      id: "",
      severity: "info",
      vulnerabilityClass: "dependency-cve",
      file: "requirements.txt",
      title: "pip audit unavailable",
      description: "pip audit command failed or is not installed.",
      attackScenario: "N/A",
      suggestedFix: "Install pip-audit: pip install pip-audit"
    });
  }
  return findings;
}
function checkCargoAudit(projectRoot) {
  const findings = [];
  try {
    const output = execSync2("cargo audit --json", {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 3e4,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const audit = JSON.parse(output);
    for (const advisory of audit.vulnerabilities?.list || []) {
      const a = advisory.advisory || {};
      findings.push({
        id: "",
        severity: cvssToSeverity(a.cvss?.score || 5),
        vulnerabilityClass: "dependency-cve",
        file: "Cargo.toml",
        title: `Vulnerable Rust crate: ${a.package || "unknown"}`,
        description: `${a.id || "RUSTSEC"}: ${a.title || "Known vulnerability"}`,
        attackScenario: `An attacker could exploit the vulnerability in the crate.`,
        suggestedFix: a.patched_versions?.length ? `Update to a patched version.` : "No fix available."
      });
    }
  } catch {
    findings.push({
      id: "",
      severity: "info",
      vulnerabilityClass: "dependency-cve",
      file: "Cargo.toml",
      title: "cargo audit unavailable",
      description: "cargo audit command failed or is not installed.",
      attackScenario: "N/A",
      suggestedFix: "Install cargo-audit: cargo install cargo-audit"
    });
  }
  return findings;
}
function checkGoVerify(projectRoot) {
  const findings = [];
  try {
    execSync2("go mod verify", {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 3e4,
      stdio: ["pipe", "pipe", "pipe"]
    });
  } catch (err) {
    const output = err.stdout || err.stderr || "";
    if (output.includes("SECURITY")) {
      findings.push({
        id: "",
        severity: "high",
        vulnerabilityClass: "dependency-cve",
        file: "go.mod",
        title: "Go module verification failed",
        description: `go mod verify reported issues: ${output.substring(0, 200)}`,
        attackScenario: "Tampered modules could contain malicious code.",
        suggestedFix: "Run go mod verify and resolve integrity issues."
      });
    } else {
      findings.push({
        id: "",
        severity: "info",
        vulnerabilityClass: "dependency-cve",
        file: "go.mod",
        title: "go mod verify unavailable",
        description: "go mod verify command failed.",
        attackScenario: "N/A",
        suggestedFix: "Ensure Go is installed and run go mod verify manually."
      });
    }
  }
  return findings;
}

// src/security/checks/injection.ts
import { readFileSync as readFileSync22 } from "fs";
import { join as join29 } from "path";
var SKIP_DIRS = ["node_modules/", "dist/", ".git/", ".wrangler/", "src/security/checks/"];
var TEST_PATTERNS = ["test", "spec", "fixture", "mock", "__tests__", "__mocks__"];
var USER_INPUT_NAMES = /(?:input|user|name|path|query|branch|hash|cmd|command|req\.|params|body|args|url|dir|file|subdirectory)/i;
var PATTERNS = [
  {
    regex: /execSync\s*\(\s*`[^`]*\$\{/,
    title: "Shell Injection via execSync template literal",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "execSync called with a template literal containing interpolated values \u2014 potential RCE.",
    attackScenario: "An attacker could inject shell metacharacters through the interpolated variable to execute arbitrary commands.",
    suggestedFix: "Use execFileSync with an argument array instead of string interpolation, or validate input with a strict allowlist regex."
  },
  {
    regex: /exec\s*\(\s*`[^`]*\$\{/,
    title: "Shell Injection via exec template literal",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "exec called with a template literal containing interpolated values \u2014 potential RCE.",
    attackScenario: "An attacker could inject shell metacharacters through the interpolated variable.",
    suggestedFix: "Use execFile with an argument array instead of string interpolation."
  },
  {
    regex: /spawn\s*\([^)]*,\s*\[[^\]]*(?:input|user|path|query|cmd|command|args|req\.|params|body)/i,
    title: "Potentially unsafe spawn with user-controlled arguments",
    vulnClass: "shell-injection",
    baseSeverity: "medium",
    description: "spawn called with arguments that may originate from user input.",
    attackScenario: "An attacker could inject malicious arguments to the spawned process.",
    suggestedFix: "Validate all arguments against a strict allowlist before passing to spawn."
  },
  {
    regex: /subprocess\.run\s*\([^)]*shell\s*=\s*True/,
    title: "Python shell=True in subprocess.run",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "subprocess.run called with shell=True \u2014 command string is executed through the shell.",
    attackScenario: "An attacker could inject shell metacharacters if user input reaches the command string.",
    suggestedFix: "Use shell=False (default) and pass arguments as a list."
  },
  {
    regex: /os\.system\s*\(/,
    title: "Python os.system() call",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "os.system() executes a command string through the shell.",
    attackScenario: "An attacker could inject shell metacharacters if user input reaches the command string.",
    suggestedFix: "Use subprocess.run with shell=False and pass arguments as a list."
  },
  // Python cursor.execute SQL injection (only flag when building SQL unsafely)
  {
    regex: /cursor\s*\.\s*execute\s*\(\s*f["']/,
    title: "Python SQL injection via cursor.execute with f-string",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "cursor.execute() called with an f-string \u2014 user input interpolated directly into SQL.",
    attackScenario: "An attacker could inject SQL through interpolated variables to read, modify, or delete database data.",
    suggestedFix: 'Use parameterized queries: cursor.execute("SELECT ... WHERE id = %s", (user_id,))'
  },
  {
    regex: /cursor\s*\.\s*execute\s*\(\s*["'].*["']\s*\+/,
    title: "Python SQL injection via cursor.execute with string concatenation",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "cursor.execute() called with string concatenation \u2014 vulnerable to SQL injection.",
    attackScenario: "An attacker could inject SQL through concatenated user input to read, modify, or delete database data.",
    suggestedFix: 'Use parameterized queries: cursor.execute("SELECT ... WHERE id = %s", (user_id,))'
  },
  {
    regex: /cursor\s*\.\s*execute\s*\(\s*["'][^"']*%s[^"']*["']\s*%\s/,
    title: "Python SQL injection via cursor.execute with % formatting",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "cursor.execute() called with Python %-formatting for SQL \u2014 vulnerable to SQL injection.",
    attackScenario: "An attacker could inject SQL through the formatted values.",
    suggestedFix: 'Use parameterized queries: cursor.execute("SELECT ... WHERE id = %s", (user_id,)) \u2014 pass params as the second argument, not via % operator.'
  },
  {
    regex: /eval\s*\(/,
    title: "eval() usage detected",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "eval() executes arbitrary code from a string.",
    attackScenario: "An attacker could inject malicious code if user input reaches eval().",
    suggestedFix: "Remove eval() and use safe alternatives (JSON.parse for data, specific parsers for expressions)."
  },
  {
    regex: /new\s+Function\s*\(/,
    title: "new Function() constructor",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "new Function() creates a function from a string \u2014 equivalent to eval().",
    attackScenario: "An attacker could inject malicious code if user input reaches the Function constructor.",
    suggestedFix: "Remove new Function() and use a safe alternative."
  },
  {
    regex: /fmt\.Sprintf\s*\([^)]*(?:SELECT|INSERT|UPDATE|DELETE)/i,
    title: "Go SQL injection via fmt.Sprintf",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "SQL query built using fmt.Sprintf \u2014 vulnerable to SQL injection.",
    attackScenario: "An attacker could inject SQL through interpolated values to read or modify database data.",
    suggestedFix: "Use parameterized queries with ? or $1 placeholders instead of string formatting."
  },
  {
    regex: /db\.Query\s*\(\s*fmt\.Sprintf/,
    title: "Go SQL injection via db.Query with fmt.Sprintf",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Database query built using fmt.Sprintf directly passed to db.Query.",
    attackScenario: "An attacker could inject SQL through interpolated values.",
    suggestedFix: 'Use parameterized queries: db.Query("SELECT ... WHERE id = ?", id)'
  },
  // Java-specific injection patterns
  {
    regex: /(?:executeQuery|executeUpdate|execute)\s*\(\s*["']?\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*["']?\s*\+/i,
    title: "Java SQL injection via string concatenation",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "SQL query built using string concatenation \u2014 vulnerable to SQL injection.",
    attackScenario: "An attacker could inject SQL through concatenated user input to read, modify, or delete database data.",
    suggestedFix: "Use PreparedStatement with parameterized queries: preparedStatement.setString(1, userInput)"
  },
  {
    regex: /Runtime\.getRuntime\(\)\.exec\s*\(/,
    title: "Java command injection via Runtime.exec",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "Runtime.exec() executes a system command \u2014 vulnerable if user input reaches the argument.",
    attackScenario: "An attacker could inject shell metacharacters to execute arbitrary commands on the server.",
    suggestedFix: "Use ProcessBuilder with an argument array. Validate all input against a strict allowlist."
  },
  {
    regex: /new\s+ProcessBuilder\s*\([^)]*(?:input|user|param|query|request|body|arg)/i,
    title: "Java command injection via ProcessBuilder with user input",
    vulnClass: "shell-injection",
    baseSeverity: "medium",
    description: "ProcessBuilder called with arguments that may originate from user input.",
    attackScenario: "An attacker could inject malicious arguments to the spawned process.",
    suggestedFix: "Validate all arguments against a strict allowlist before passing to ProcessBuilder."
  },
  {
    regex: /new\s+ObjectInputStream\s*\(/,
    title: "Java insecure deserialization via ObjectInputStream",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "ObjectInputStream.readObject() deserializes arbitrary Java objects \u2014 potential RCE.",
    attackScenario: "An attacker could craft a malicious serialized object to achieve remote code execution.",
    suggestedFix: "Use a whitelist-based ObjectInputFilter, or switch to JSON/Protobuf for data exchange."
  },
  {
    regex: /DocumentBuilderFactory\.newInstance\(\)/,
    title: "Java XML External Entity (XXE) risk",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "DocumentBuilderFactory without FEATURE_SECURE_PROCESSING may allow XXE attacks.",
    attackScenario: "An attacker could inject external entity references in XML to read server files or perform SSRF.",
    suggestedFix: "Set FEATURE_SECURE_PROCESSING and disable external DTDs/entities: factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)"
  },
  {
    regex: /\.csrf\(\)\s*\.\s*disable\(\)/,
    title: "Spring Security CSRF protection disabled",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "CSRF protection has been explicitly disabled in Spring Security configuration.",
    attackScenario: "An attacker could forge cross-site requests to perform actions on behalf of authenticated users.",
    suggestedFix: "Only disable CSRF for stateless APIs using JWT. Keep CSRF enabled for session-based authentication."
  },
  {
    regex: /\.permitAll\(\).*(?:admin|manage|delete|config|setting)/i,
    title: "Spring Security permitAll on sensitive path",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "permitAll() applied to a path that appears security-sensitive.",
    attackScenario: "An attacker could access administrative or destructive endpoints without authentication.",
    suggestedFix: 'Use .hasRole("ADMIN") or .authenticated() for sensitive endpoints.'
  },
  // C++ injection patterns
  {
    regex: /\b(?:strcpy|strcat|sprintf|gets)\s*\(/,
    title: "C++ buffer overflow risk: unsafe string function",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "Unsafe C string functions (strcpy, strcat, sprintf, gets) with no bounds checking \u2014 buffer overflow risk.",
    attackScenario: "An attacker could provide oversized input to overflow the buffer, enabling arbitrary code execution.",
    suggestedFix: "Use bounded alternatives: strncpy, strncat, snprintf, or C++ std::string."
  },
  {
    regex: /printf\s*\(\s*(?!")[a-zA-Z_]\w*/,
    title: "C++ format string vulnerability",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "printf called with a variable as the format string \u2014 format string attack risk.",
    attackScenario: "An attacker could inject format specifiers (%x, %n) to read/write arbitrary memory.",
    suggestedFix: 'Always use a literal format string: printf("%s", userInput).'
  },
  {
    regex: /\bsystem\s*\(\s*(?!")[a-zA-Z_]\w*/,
    title: "C++ command injection via system()",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "system() called with a variable argument \u2014 potential command injection.",
    attackScenario: "An attacker could inject shell metacharacters to execute arbitrary commands.",
    suggestedFix: "Avoid system(). Use execvp with an argument array, or validate input with a strict allowlist."
  },
  {
    regex: /\bpopen\s*\(\s*(?!")[a-zA-Z_]\w*/,
    title: "C++ command injection via popen()",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "popen() called with a variable argument \u2014 potential command injection.",
    attackScenario: "An attacker could inject shell metacharacters to execute arbitrary commands.",
    suggestedFix: "Avoid popen(). Use pipe/fork/exec with argument arrays instead."
  },
  // Kotlin injection patterns
  {
    regex: /["']SELECT\b[^"']*\$(?:\{|\w)/,
    title: "Kotlin SQL injection via string template",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "SQL query built using Kotlin string templates \u2014 vulnerable to SQL injection.",
    attackScenario: "An attacker could inject SQL through interpolated variables to read, modify, or delete database data.",
    suggestedFix: "Use parameterized queries with PreparedStatement or your ORM's query builder."
  },
  {
    regex: /["'](?:INSERT|UPDATE|DELETE)\b[^"']*\$(?:\{|\w)/,
    title: "Kotlin SQL injection via string template",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "SQL mutation query built using Kotlin string templates \u2014 vulnerable to SQL injection.",
    attackScenario: "An attacker could inject SQL through interpolated variables.",
    suggestedFix: "Use parameterized queries with PreparedStatement or your ORM's query builder."
  },
  {
    regex: /Runtime\.getRuntime\(\)\.exec\s*\(/,
    title: "Kotlin/Java command injection via Runtime.exec",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "Runtime.exec() executes a system command \u2014 vulnerable if user input reaches the argument.",
    attackScenario: "An attacker could inject shell metacharacters to execute arbitrary commands on the server.",
    suggestedFix: "Use ProcessBuilder with an argument array. Validate all input against a strict allowlist."
  },
  {
    regex: /\.csrf\(\)\s*\.?\s*disable\(\)/,
    title: "Spring Security CSRF protection disabled",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "CSRF protection has been explicitly disabled in Spring Security configuration.",
    attackScenario: "An attacker could forge cross-site requests to perform actions on behalf of authenticated users.",
    suggestedFix: "Only disable CSRF for stateless APIs using JWT. Keep CSRF enabled for session-based authentication."
  },
  {
    regex: /\.permitAll\(\).*(?:admin|manage|delete|config|setting)/i,
    title: "Spring Security permitAll on sensitive path",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "permitAll() applied to a path that appears security-sensitive.",
    attackScenario: "An attacker could access administrative or destructive endpoints without authentication.",
    suggestedFix: 'Use .hasRole("ADMIN") or .authenticated() for sensitive endpoints.'
  },
  // PHP injection patterns
  {
    regex: /\$wpdb\s*->\s*query\s*\(\s*["'][^"']*\$|.*\$wpdb\s*->\s*query\s*\(\s*[^"']*\.\s*\$/,
    title: "PHP SQL injection via $wpdb->query with string concatenation",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "WordPress $wpdb->query() called with direct variable interpolation \u2014 vulnerable to SQL injection.",
    attackScenario: "An attacker could inject SQL through unescaped user input to read, modify, or delete database data.",
    suggestedFix: 'Use $wpdb->prepare() with placeholders: $wpdb->query($wpdb->prepare("SELECT * FROM table WHERE id = %d", $id))'
  },
  {
    regex: /\beval\s*\(\s*\$/,
    title: "PHP eval() with variable input",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "eval() executes arbitrary PHP code from a variable \u2014 potential RCE.",
    attackScenario: "An attacker could inject malicious PHP code if user input reaches eval().",
    suggestedFix: "Remove eval() entirely. Use safe alternatives like json_decode() for data or specific parsers."
  },
  {
    regex: /\b(?:system|exec|shell_exec|passthru)\s*\(\s*\$/,
    title: "PHP command injection via system/exec/shell_exec/passthru",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "Shell command execution with a variable argument \u2014 potential command injection.",
    attackScenario: "An attacker could inject shell metacharacters to execute arbitrary commands on the server.",
    suggestedFix: "Use escapeshellarg() and escapeshellcmd() to sanitize input, or avoid shell commands entirely."
  },
  {
    regex: /preg_replace\s*\(\s*['"]\/[^'"]*\/e['"]/,
    title: "PHP preg_replace with /e modifier (code execution)",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "preg_replace() with the /e modifier evaluates the replacement as PHP code \u2014 deprecated and dangerous.",
    attackScenario: "An attacker could inject PHP code through the matched string to achieve remote code execution.",
    suggestedFix: "Use preg_replace_callback() instead of the /e modifier."
  },
  {
    regex: /\bunserialize\s*\(\s*\$(?:_GET|_POST|_REQUEST|_COOKIE)/,
    title: "PHP insecure deserialization of user input",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "unserialize() called on user-controlled superglobal input \u2014 potential RCE via PHP object injection.",
    attackScenario: "An attacker could craft a malicious serialized PHP object to achieve remote code execution.",
    suggestedFix: "Use json_decode() instead of unserialize() for user input. If unserialize is necessary, use the allowed_classes option."
  },
  {
    regex: /\bextract\s*\(\s*\$(?:_GET|_POST|_REQUEST)/,
    title: "PHP extract() on superglobal input",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "extract() on $_GET/$_POST/$_REQUEST overwrites local variables \u2014 can bypass security checks.",
    attackScenario: "An attacker could set arbitrary variables by crafting request parameters, potentially overwriting auth flags or config values.",
    suggestedFix: "Avoid extract() on user input. Access superglobals directly or use a whitelist of expected keys."
  },
  // Swift injection patterns
  {
    regex: /["'](?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*\\\(/,
    title: "Swift SQL injection via string interpolation",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "SQL query built using Swift string interpolation \u2014 vulnerable to SQL injection.",
    attackScenario: "An attacker could inject SQL through interpolated variables to read, modify, or delete database data.",
    suggestedFix: "Use parameterized queries with your database library (e.g., Fluent ORM, SQLite.swift bindings)."
  },
  {
    regex: /Process\s*\(\s*\)/,
    title: "Swift command injection via Process class",
    vulnClass: "shell-injection",
    baseSeverity: "medium",
    description: "Process() class executes external commands \u2014 vulnerable if user input reaches arguments.",
    attackScenario: "An attacker could inject shell metacharacters to execute arbitrary commands on the server.",
    suggestedFix: "Validate all arguments against a strict allowlist before passing to Process. Avoid shell execution."
  },
  {
    regex: /Unsafe(?:Raw|Mutable|Buffer)?Pointer/,
    title: "Swift unsafe pointer usage",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "Unsafe pointer usage bypasses Swift memory safety \u2014 potential for memory corruption.",
    attackScenario: "An attacker could exploit unsafe pointer operations to corrupt memory or execute arbitrary code.",
    suggestedFix: "Prefer safe Swift alternatives. If unsafe pointers are necessary, validate all bounds and lifetimes."
  },
  {
    regex: /UserDefaults\s*\.\s*(?:standard\s*\.\s*)?set\s*\([^)]*(?:password|secret|token|apiKey|api_key)/i,
    title: "Swift sensitive data in UserDefaults (unencrypted)",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Sensitive data stored in UserDefaults without encryption \u2014 easily accessible on jailbroken devices.",
    attackScenario: "An attacker with device access could read UserDefaults plist to extract credentials.",
    suggestedFix: "Use Keychain Services for storing sensitive data. Never store passwords or tokens in UserDefaults."
  },
  // Mojo injection patterns
  {
    regex: /\bPointer\s*\[\s*\w+\s*\]/,
    title: "Mojo unsafe Pointer[T] usage",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "Mojo Pointer[T] bypasses memory safety \u2014 potential for memory corruption or buffer overflow.",
    attackScenario: "An attacker could exploit unsafe pointer operations to corrupt memory or execute arbitrary code.",
    suggestedFix: "Use safe Mojo abstractions (SIMD, Tensor) instead of raw pointers where possible. Validate bounds."
  },
  {
    regex: /\bDTypePointer\b/,
    title: "Mojo unsafe DTypePointer usage",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "DTypePointer provides raw memory access without bounds checking.",
    attackScenario: "An attacker could exploit unvalidated pointer operations for buffer overflow or memory corruption.",
    suggestedFix: "Use Tensor or SIMD types with bounds checking instead of raw DTypePointer."
  },
  {
    regex: /from\s+python\s+import.*\beval\b/,
    title: "Mojo Python interop: eval() imported",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Python eval() imported via Mojo Python interop \u2014 can execute arbitrary code.",
    attackScenario: "An attacker could inject malicious code strings executed through the Python bridge.",
    suggestedFix: "Avoid importing eval. Use safe parsing alternatives or validate all input strictly."
  },
  {
    regex: /\b__get_address_as_lvalue\b/,
    title: "Mojo uninitialized memory access pattern",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "Low-level memory access without initialization \u2014 potential for use of uninitialized data.",
    attackScenario: "An attacker could exploit uninitialized memory to leak data or corrupt program state.",
    suggestedFix: "Always initialize memory before use. Use safe constructors and value semantics."
  },
  {
    regex: /SIMD\s*\[[^\]]*\]\s*\.\s*(?:store|load)\s*\(/,
    title: "Mojo SIMD store/load without bounds check",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "SIMD store/load operations without explicit bounds checking \u2014 buffer overflow risk.",
    attackScenario: "An attacker could trigger out-of-bounds SIMD operations to corrupt memory.",
    suggestedFix: "Validate buffer size against SIMD width before store/load operations."
  },
  // Ruby injection patterns
  {
    regex: /(?:where|find_by_sql|execute)\s*\(\s*["'][^"']*#\{/,
    title: "Ruby string interpolation in database query method",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Database query built with string interpolation \u2014 values are not parameterized.",
    attackScenario: "An attacker could manipulate interpolated values to alter query logic.",
    suggestedFix: 'Use parameterized queries: Model.where("column = ?", value) or ActiveRecord query interface.'
  },
  {
    regex: /`[^`]*#\{/,
    title: "Ruby backtick command with string interpolation",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "Backtick command execution with interpolated values \u2014 potential for unintended command execution.",
    attackScenario: "An attacker could inject shell metacharacters through the interpolated variable.",
    suggestedFix: "Use Open3.capture3 with separate arguments instead of backtick interpolation."
  },
  {
    regex: /\b(?:system|exec)\s*\(\s*["'][^"']*#\{/,
    title: "Ruby system/exec with string interpolation",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "system() or exec() called with interpolated string \u2014 potential for unintended command execution.",
    attackScenario: "An attacker could inject shell metacharacters through the interpolated variable.",
    suggestedFix: 'Use system() with separate arguments: system("cmd", arg1, arg2) instead of string interpolation.'
  },
  {
    regex: /%x\{[^}]*#\{/,
    title: "Ruby %x{} command with string interpolation",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "%x{} command execution with interpolated values \u2014 potential for unintended command execution.",
    attackScenario: "An attacker could inject shell metacharacters through the interpolated variable.",
    suggestedFix: "Use Open3.capture3 with separate arguments instead of %x{} interpolation."
  },
  {
    regex: /\beval\s*\(\s*(?!['"])/,
    title: "Ruby eval() with dynamic input",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "eval() executes arbitrary Ruby code from a variable \u2014 potential for unintended code execution.",
    attackScenario: "An attacker could inject malicious code if user input reaches eval().",
    suggestedFix: "Remove eval() and use safe alternatives (JSON.parse for data, specific parsers for expressions)."
  },
  {
    regex: /\b(?:instance_eval|class_eval)\s*\(\s*(?!['"])/,
    title: "Ruby instance_eval/class_eval with dynamic input",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "instance_eval/class_eval executes code in object context \u2014 dangerous with dynamic input.",
    attackScenario: "An attacker could inject code that executes with elevated privileges in the object context.",
    suggestedFix: "Use instance_exec with a block instead of string evaluation."
  },
  {
    regex: /\b(?:send|public_send)\s*\(\s*(?:params|request|input|user)/i,
    title: "Ruby send/public_send with user-controlled method name",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "send() called with user-controlled method name \u2014 could invoke unintended methods.",
    attackScenario: "An attacker could call arbitrary methods on the receiver by controlling the method name.",
    suggestedFix: "Validate the method name against a strict allowlist before passing to send()."
  },
  {
    regex: /File\.(?:read|write|delete|open)\s*\(\s*(?:params|request|input|user)/i,
    title: "Ruby file operation with user-controlled path",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "File operation with user-controlled path \u2014 potential for unintended file access.",
    attackScenario: "An attacker could traverse directories to access or modify arbitrary files.",
    suggestedFix: "Validate and sanitize file paths. Use File.expand_path and check against an allowed directory."
  },
  {
    regex: /YAML\.load\s*\(\s*(?!.*safe)/i,
    title: "Ruby YAML.load with potentially unsafe input",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "YAML.load can instantiate arbitrary Ruby objects \u2014 potential for unintended code execution.",
    attackScenario: "An attacker could craft a YAML payload that instantiates dangerous objects during deserialization.",
    suggestedFix: "Use YAML.safe_load instead of YAML.load to restrict allowed classes."
  },
  {
    regex: /Marshal\.load\s*\(/,
    title: "Ruby Marshal.load with potentially unsafe data",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Marshal.load deserializes arbitrary Ruby objects \u2014 potential for unintended code execution.",
    attackScenario: "An attacker could craft a marshaled payload that executes code during deserialization.",
    suggestedFix: "Use JSON.parse or MessagePack for data exchange. Never Marshal.load untrusted data."
  },
  {
    regex: /ERB\.new\s*\(\s*(?:params|request|input|user)/i,
    title: "Ruby ERB template with user-controlled input",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "ERB template created from user input \u2014 potential for unintended code execution via template injection.",
    attackScenario: "An attacker could inject ERB tags to execute arbitrary Ruby code on the server.",
    suggestedFix: "Never pass user input directly to ERB.new. Use parameterized templates with safe escaping."
  },
  // Dart injection patterns
  {
    regex: /(?:rawQuery|rawInsert|rawUpdate|rawDelete)\s*\(\s*['"`].*\$/,
    title: "Dart database query with string interpolation",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Database query constructed with string interpolation \u2014 potential for unintended query modification.",
    attackScenario: "An attacker could modify the query via interpolated variables to access or modify data.",
    suggestedFix: "Use parameterized queries with positional arguments instead of string interpolation."
  },
  {
    regex: /Process\s*\.\s*(?:run|start|runSync)\s*\(/,
    title: "Dart process execution",
    vulnClass: "shell-injection",
    baseSeverity: "medium",
    description: "System process execution \u2014 verify arguments are validated before use.",
    attackScenario: "An attacker could inject unexpected arguments if user input reaches process arguments.",
    suggestedFix: "Validate all process arguments against a strict allowlist. Avoid passing user input directly."
  },
  {
    regex: /import\s+['"]dart:mirrors['"]/,
    title: "Dart runtime reflection usage",
    vulnClass: "code-injection",
    baseSeverity: "low",
    description: "dart:mirrors import \u2014 deprecated and unavailable in AOT-compiled code.",
    attackScenario: "Mirror-based reflection can invoke arbitrary methods at runtime if not properly constrained.",
    suggestedFix: "Remove dart:mirrors usage. Use code generation (build_runner) for reflection-like features."
  },
  {
    regex: /(?:File|Directory)\s*\(\s*(?:\$|.*\+\s*(?:request|input|params|user|query))/i,
    title: "Dart file operation with dynamic path",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "File system operation with dynamically constructed path \u2014 verify path validation.",
    attackScenario: "An attacker could access unintended files by controlling parts of the file path.",
    suggestedFix: "Validate and canonicalize paths. Ensure the resolved path stays within the intended directory."
  },
  {
    regex: /jsonDecode\s*\(\s*(?:response|body|data|input|request)/,
    title: "Dart JSON decoding of external input",
    vulnClass: "input-validation",
    baseSeverity: "low",
    description: "JSON decoding of external input without schema validation \u2014 consider adding type checks.",
    attackScenario: "Unexpected JSON structure could cause runtime errors or logic issues.",
    suggestedFix: "Add type validation after jsonDecode. Consider using json_serializable for typed deserialization."
  },
  {
    regex: /JavascriptChannel\s*\(\s*name\s*:/,
    title: "Dart WebView JavaScript channel",
    vulnClass: "input-validation",
    baseSeverity: "medium",
    description: "WebView JavaScript channel \u2014 verify message origin and content validation.",
    attackScenario: "Malicious web content could send unexpected messages through the JavaScript channel.",
    suggestedFix: "Validate message origin and content. Apply strict input validation on received messages."
  },
  {
    regex: /SharedPreferences.*(?:setString|setInt)\s*\(\s*['"](?:token|password|secret|key|api_key|auth)/i,
    title: "Dart sensitive data in unencrypted storage",
    vulnClass: "information-disclosure",
    baseSeverity: "medium",
    description: "Sensitive value stored in unencrypted SharedPreferences \u2014 consider encrypted storage.",
    attackScenario: "Device backup or root access could expose stored sensitive values.",
    suggestedFix: "Use flutter_secure_storage or encrypted_shared_preferences for sensitive data."
  },
  // R patterns
  {
    regex: /(?:dbGetQuery|dbSendQuery|dbExecute)\s*\([^,]+,\s*paste0?\s*\(/,
    title: "R database query with string concatenation",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Database query constructed via paste/paste0 \u2014 potential for unintended query modification.",
    attackScenario: "An attacker could modify the query by controlling concatenated variables.",
    suggestedFix: "Use parameterized queries with DBI::dbGetQuery(con, sql, params=list(...)) or glue_sql()."
  },
  {
    regex: /(?:system|system2|shell)\s*\(\s*paste0?\s*\(/,
    title: "R system command with string concatenation",
    vulnClass: "shell-injection",
    baseSeverity: "high",
    description: "System command constructed via string concatenation \u2014 potential for unintended command execution.",
    attackScenario: "An attacker could inject shell metacharacters through concatenated variables.",
    suggestedFix: "Use system2() with separate command and args parameters. Validate all inputs with a strict allowlist."
  },
  {
    regex: /eval\s*\(\s*parse\s*\(\s*text\s*=/,
    title: "R dynamic code evaluation via eval(parse(text=...))",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Dynamic code evaluation from text \u2014 potential for unintended code execution.",
    attackScenario: "An attacker could inject R code if the text value is user-controlled.",
    suggestedFix: "Avoid eval(parse(text=...)). Use switch statements, match.arg(), or lookup tables instead."
  },
  {
    regex: /(?:readRDS|unserialize)\s*\(\s*(?:input|url|con|request|user|upload)/i,
    title: "R deserialization of untrusted data",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Deserialization of potentially untrusted data \u2014 R objects can contain executable closures.",
    attackScenario: "An attacker could craft a malicious RDS file containing harmful closures.",
    suggestedFix: "Validate the source of RDS files. Prefer JSON or CSV for untrusted data exchange."
  },
  {
    regex: /file\.path\s*\(\s*.*(?:input\$|params|request|user|query)/i,
    title: "R file path with user-controlled component",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "File path constructed with user-controlled input \u2014 verify path validation.",
    attackScenario: "An attacker could access unintended files by controlling parts of the file path.",
    suggestedFix: "Validate and normalize file paths. Ensure resolved path stays within the intended directory."
  },
  {
    regex: /(?:dbGetQuery|dbExecute|system|system2)\s*\([^)]*input\$/,
    title: "R Shiny input used directly in sensitive operation",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Shiny user input passed directly to a sensitive operation without validation.",
    attackScenario: "An attacker could provide crafted input through the Shiny UI to execute unintended operations.",
    suggestedFix: "Validate and sanitize all input$ values before use in database queries or system calls."
  },
  {
    regex: /HTML\s*\(\s*(?:input\$|paste0?\s*\(.*input\$)/,
    title: "R Shiny HTML rendering with user input",
    vulnClass: "code-injection",
    baseSeverity: "medium",
    description: "User input rendered as raw HTML in Shiny without escaping \u2014 potential for content manipulation.",
    attackScenario: "An attacker could inject HTML/script content through the Shiny input.",
    suggestedFix: "Use htmltools::htmlEscape() on user input before passing to HTML(). Or use textOutput() instead."
  },
  {
    regex: /reticulate::py_run_string\s*\(\s*paste0?\s*\(/,
    title: "R reticulate with dynamically constructed Python code",
    vulnClass: "code-injection",
    baseSeverity: "high",
    description: "Python code constructed via string concatenation passed to reticulate \u2014 potential for unintended execution.",
    attackScenario: "An attacker could inject Python code through concatenated R variables.",
    suggestedFix: "Use reticulate::py_run_file() with static scripts, or pass data via r_to_py() instead of string building."
  }
];
function shouldSkip(filePath) {
  return SKIP_DIRS.some((d) => filePath.includes(d));
}
function isTestFile6(filePath) {
  const lower = filePath.toLowerCase();
  return TEST_PATTERNS.some((p) => lower.includes(p));
}
async function checkInjection(files, projectRoot) {
  const findings = [];
  try {
    for (const file of files) {
      if (shouldSkip(file.filePath) || isTestFile6(file.filePath)) continue;
      let content;
      try {
        content = readFileSync22(join29(projectRoot, file.filePath), "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#") || line.trimStart().startsWith("*")) {
          continue;
        }
        if (line.includes("depwire-security-reviewed")) continue;
        for (const pattern of PATTERNS) {
          if (pattern.regex.test(line)) {
            let severity = pattern.baseSeverity;
            if (severity === "medium" && USER_INPUT_NAMES.test(line)) {
              severity = "high";
            }
            findings.push({
              id: "",
              severity,
              vulnerabilityClass: pattern.vulnClass,
              file: file.filePath,
              line: i + 1,
              title: pattern.title,
              description: pattern.description,
              attackScenario: pattern.attackScenario,
              suggestedFix: pattern.suggestedFix
            });
          }
        }
      }
    }
  } catch {
  }
  return findings;
}

// src/security/checks/secrets.ts
import { readFileSync as readFileSync23 } from "fs";
import { join as join30 } from "path";
var SKIP_DIRS2 = ["node_modules/", "dist/", ".git/", ".wrangler/", "src/security/checks/"];
var TEST_PATTERNS2 = ["test", "spec", "fixture", "mock", "__tests__", "__mocks__", ".example", ".sample"];
var SECRET_PATTERNS = [
  // API Keys
  { pattern: /sk-[a-zA-Z0-9]{32,}/, title: "OpenAI API Key", severity: "critical" },
  { pattern: /AKIA[0-9A-Z]{16}/, title: "AWS Access Key", severity: "critical" },
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, title: "Stripe Live Key", severity: "critical" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, title: "GitHub Personal Token", severity: "critical" },
  { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, title: "Private Key", severity: "critical" },
  // Hardcoded passwords/secrets
  { pattern: /password\s*=\s*['"][^'"]{4,}['"]/, title: "Hardcoded Password", severity: "high" },
  { pattern: /secret\s*=\s*['"][^'"]{4,}['"]/, title: "Hardcoded Secret", severity: "high" },
  { pattern: /salt\s*=\s*['"][^'"]{4,}['"]/, title: "Hardcoded Salt", severity: "high" },
  { pattern: /api_key\s*=\s*['"][^'"]{4,}['"]/, title: "Hardcoded API Key", severity: "high" },
  { pattern: /token\s*=\s*['"][^'"]{8,}['"]/, title: "Hardcoded Token", severity: "high" },
  // Weak but not critical
  { pattern: /Math\.random\(\).*(?:token|session|id|key|secret)/i, title: "Math.random() for Security Value", severity: "high" }
];
function shouldSkip2(filePath) {
  return SKIP_DIRS2.some((d) => filePath.includes(d));
}
function isTestFile7(filePath) {
  const lower = filePath.toLowerCase();
  return TEST_PATTERNS2.some((p) => lower.includes(p));
}
async function checkSecrets(files, projectRoot) {
  const findings = [];
  try {
    for (const file of files) {
      if (shouldSkip2(file.filePath) || isTestFile7(file.filePath)) continue;
      let content;
      try {
        content = readFileSync23(join30(projectRoot, file.filePath), "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#") || line.trimStart().startsWith("*")) {
          continue;
        }
        for (const sp of SECRET_PATTERNS) {
          if (sp.pattern.test(line)) {
            findings.push({
              id: "",
              severity: sp.severity,
              vulnerabilityClass: "secrets",
              file: file.filePath,
              line: i + 1,
              title: sp.title,
              description: `Potential ${sp.title.toLowerCase()} detected in source code.`,
              attackScenario: "An attacker with source code access could extract credentials and use them to access external services or escalate privileges.",
              suggestedFix: "Move secrets to environment variables or a secrets manager. Never commit secrets to source control."
            });
          }
        }
      }
    }
  } catch {
  }
  return findings;
}

// src/security/checks/path-traversal.ts
import { readFileSync as readFileSync24 } from "fs";
import { join as join31 } from "path";
var SKIP_DIRS3 = ["node_modules/", "dist/", ".git/", ".wrangler/", "src/security/checks/"];
var USER_INPUT_VARS = /(?:req\.|params|query|body|input|path|dir|subdirectory|file|userInput|fileName|filePath)/i;
var PATTERNS2 = [
  {
    regex: /path\.join\s*\(\s*(?:__dirname|root|base|projectRoot)[^)]*,/,
    title: "Potential path traversal via path.join",
    description: "path.join called with a root directory and a variable that may contain user input \u2014 without resolve() containment check.",
    suggestedFix: 'Use path.resolve() and verify the result starts with the expected root: if (!resolved.startsWith(root)) throw new Error("path traversal")'
  },
  {
    regex: /readFileSync\s*\([^)]*(?:input|user|path|dir|file|query|params|body|req\.)/i,
    title: "readFileSync with potentially user-controlled path",
    description: "readFileSync called with a variable that may originate from user input.",
    suggestedFix: "Validate and sanitize the file path. Use path.resolve() and verify it starts with the expected root directory."
  },
  {
    regex: /writeFileSync\s*\([^)]*(?:input|user|path|dir|file|query|params|body|req\.)/i,
    title: "writeFileSync with potentially user-controlled path",
    description: "writeFileSync called with a variable that may originate from user input.",
    suggestedFix: "Validate and sanitize the file path. Use path.resolve() and verify it starts with the expected root directory."
  },
  {
    regex: /createReadStream\s*\([^)]*(?:input|user|path|dir|file|query|params|body|req\.)/i,
    title: "createReadStream with potentially user-controlled path",
    description: "createReadStream called with a path that may originate from user input.",
    suggestedFix: "Validate and sanitize the file path before creating the stream."
  }
];
function shouldSkip3(filePath) {
  if (SKIP_DIRS3.some((d) => filePath.includes(d))) return true;
  if (filePath.includes("wasm-init")) return true;
  return false;
}
function isRouteOrTool(filePath) {
  const lower = filePath.toLowerCase();
  return lower.includes("route") || lower.includes("api/") || lower.includes("mcp/") || lower.includes("handler") || lower.includes("controller");
}
var SAFE_OUTPUT_PATTERNS = /(?:output|outPath|outFile|dest|target|docPath).*\.(?:md|json|html|ts|js)['"]|['"][^'"]+\.(?:md|json|html|ts|js)['"]/;
var SAFE_DIRNAME_ARGS = /(?:grammar|wasm|wasmPath|wasmFile|grammars)/i;
async function checkPathTraversal(files, projectRoot) {
  const findings = [];
  try {
    for (const file of files) {
      if (shouldSkip3(file.filePath)) continue;
      let content;
      try {
        content = readFileSync24(join31(projectRoot, file.filePath), "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      const inRouteOrTool = isRouteOrTool(file.filePath);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) continue;
        for (const pattern of PATTERNS2) {
          if (pattern.regex.test(line)) {
            if (!USER_INPUT_VARS.test(line)) continue;
            if (/writeFileSync/.test(line) && SAFE_OUTPUT_PATTERNS.test(line)) continue;
            if (/(?:writeFileSync|readFileSync)/.test(line)) {
              const context = lines.slice(Math.max(0, i - 2), i + 1).join("\n");
              if (SAFE_OUTPUT_PATTERNS.test(context)) continue;
            }
            if (/__dirname/.test(line) && SAFE_DIRNAME_ARGS.test(line)) continue;
            const nearbyLines = lines.slice(Math.max(0, i - 15), Math.min(lines.length, i + 4)).join("\n");
            if (nearbyLines.includes("startsWith") && /resolve/.test(nearbyLines)) continue;
            const severity = inRouteOrTool ? "high" : "medium";
            findings.push({
              id: "",
              severity,
              vulnerabilityClass: "path-traversal",
              file: file.filePath,
              line: i + 1,
              title: pattern.title,
              description: pattern.description,
              attackScenario: "An attacker could use ../ sequences to traverse outside the intended directory and read or write arbitrary files on the server.",
              suggestedFix: pattern.suggestedFix
            });
          }
        }
      }
    }
  } catch {
  }
  return findings;
}

// src/security/checks/auth.ts
import { readFileSync as readFileSync25 } from "fs";
import { join as join32 } from "path";
var SKIP_DIRS4 = ["node_modules/", "dist/", ".git/", ".wrangler/", "src/security/checks/"];
function shouldSkip4(filePath) {
  return SKIP_DIRS4.some((d) => filePath.includes(d));
}
function isAuthRelatedFile(filePath) {
  const lower = filePath.toLowerCase();
  return /(?:auth|session|token|jwt|oauth|login|passport)/.test(lower);
}
async function checkAuth(files, projectRoot) {
  const findings = [];
  try {
    for (const file of files) {
      if (shouldSkip4(file.filePath)) continue;
      let content;
      try {
        content = readFileSync25(join32(projectRoot, file.filePath), "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      const isAuthFile = isAuthRelatedFile(file.filePath);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) continue;
        if (/catch\s*\([^)]*\)\s*\{/.test(line)) {
          const catchBlock = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
          if (/(?:next\s*\(|return\s+true|resolve\s*\(\s*true\s*\))/.test(catchBlock)) {
            findings.push({
              id: "",
              severity: "medium",
              vulnerabilityClass: "auth",
              file: file.filePath,
              line: i + 1,
              title: "Fail-open catch block may bypass authentication",
              description: "A catch block that calls next(), returns true, or resolves true could bypass auth checks when an error occurs.",
              attackScenario: "An attacker could trigger an error condition (e.g., malformed token) to bypass authentication.",
              suggestedFix: "Ensure catch blocks deny access by default. Return false, call next(err), or throw."
            });
          }
        }
        if (/[?&](?:token|session|key|auth)=/.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "auth",
            file: file.filePath,
            line: i + 1,
            title: "Credential in URL query parameter",
            description: "Token, session, or auth key passed as a URL query parameter.",
            attackScenario: "URL query parameters are logged in server access logs, browser history, and referrer headers \u2014 exposing credentials.",
            suggestedFix: "Send credentials in Authorization headers or secure HTTP-only cookies instead."
          });
        }
        if (/Math\.random\(\)/.test(line) && isAuthFile) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "auth",
            file: file.filePath,
            line: i + 1,
            title: "Math.random() used in auth-related file",
            description: "Math.random() is not cryptographically secure and should not be used for tokens, session IDs, or any security value.",
            attackScenario: "An attacker could predict Math.random() output and forge tokens or session IDs.",
            suggestedFix: "Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive values."
          });
        }
        if (/jwt\.verify\s*\(/.test(line)) {
          const nearbyLines = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 11)).join("\n");
          if (!/(?:expiresIn|exp\s*:|maxAge)/.test(nearbyLines)) {
            findings.push({
              id: "",
              severity: "medium",
              vulnerabilityClass: "auth",
              file: file.filePath,
              line: i + 1,
              title: "JWT verification without expiry check",
              description: "jwt.verify called without expiresIn or exp option nearby \u2014 tokens may never expire.",
              attackScenario: "A stolen JWT could be used indefinitely if it has no expiration.",
              suggestedFix: "Set expiresIn when signing and verify exp claim during verification."
            });
          }
        }
        if (/state.*cookie/i.test(line)) {
          const nearbyLines = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
          if (!/(?:maxAge.*0|clearCookie|delete.*state)/i.test(nearbyLines)) {
            findings.push({
              id: "",
              severity: "low",
              vulnerabilityClass: "auth",
              file: file.filePath,
              line: i + 1,
              title: "OAuth state cookie not cleared after use",
              description: "OAuth state parameter stored in cookie may not be cleared after consumption.",
              attackScenario: "A stale state cookie could be replayed in a CSRF attack against the OAuth flow.",
              suggestedFix: "Clear the state cookie immediately after successful validation."
            });
          }
        }
      }
    }
  } catch {
  }
  return findings;
}

// src/security/checks/input-validation.ts
import { readFileSync as readFileSync26 } from "fs";
import { join as join33 } from "path";
var SKIP_DIRS5 = ["node_modules/", "dist/", ".git/", ".wrangler/", "src/security/checks/"];
function shouldSkip5(filePath) {
  return SKIP_DIRS5.some((d) => filePath.includes(d));
}
async function checkInputValidation(files, projectRoot) {
  const findings = [];
  try {
    for (const file of files) {
      if (shouldSkip5(file.filePath)) continue;
      let content;
      try {
        content = readFileSync26(join33(projectRoot, file.filePath), "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      const fullContent = content;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) continue;
        if (/cors\s*\(\s*\{\s*origin\s*:\s*['"]\*['"]/.test(line) || /Access-Control-Allow-Origin.*\*/.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "input-validation",
            file: file.filePath,
            line: i + 1,
            title: "CORS wildcard origin",
            description: "CORS is configured to allow all origins (*), which permits any website to make requests to this API.",
            attackScenario: "An attacker could create a malicious website that makes authenticated requests to this API using the victim's cookies.",
            suggestedFix: "Restrict CORS origin to specific trusted domains instead of using wildcard."
          });
        }
        if (/express\.json\s*\(\s*\)/.test(line)) {
          if (!/limit/.test(line)) {
            findings.push({
              id: "",
              severity: "medium",
              vulnerabilityClass: "input-validation",
              file: file.filePath,
              line: i + 1,
              title: "No body size limit on JSON parser",
              description: "express.json() used without a size limit \u2014 the server may be vulnerable to large payload attacks.",
              attackScenario: "An attacker could send extremely large JSON payloads to exhaust server memory (denial of service).",
              suggestedFix: 'Set a body size limit: express.json({ limit: "1mb" })'
            });
          }
        }
        if (/req\.params\.id/.test(line)) {
          const nearbyLines = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join("\n");
          if (!/(?:isValidUUID|uuid|^[0-9a-f-]{36}|validate|isValid|parseInt)/.test(nearbyLines)) {
            findings.push({
              id: "",
              severity: "medium",
              vulnerabilityClass: "input-validation",
              file: file.filePath,
              line: i + 1,
              title: "req.params.id used without validation",
              description: "A route parameter (req.params.id) is used without apparent validation \u2014 could allow injection or invalid lookups.",
              attackScenario: "An attacker could pass malformed IDs to trigger unexpected behavior or SQL/NoSQL injection.",
              suggestedFix: "Validate req.params.id against expected format (e.g., UUID regex or parseInt) before use."
            });
          }
        }
        if (/(?:INSERT|db\.put|db\.create|\.save\(|\.insert\()/.test(line) && /req\.body/.test(line)) {
          const nearbyLines = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 3)).join("\n");
          if (!/\.length/.test(nearbyLines)) {
            findings.push({
              id: "",
              severity: "low",
              vulnerabilityClass: "input-validation",
              file: file.filePath,
              line: i + 1,
              title: "User input stored without length validation",
              description: "User input from req.body is stored to a database without apparent length validation.",
              attackScenario: "An attacker could store extremely long strings to waste storage or cause display issues.",
              suggestedFix: "Add length validation before storing user input: if (input.length > MAX_LENGTH) return res.status(400)..."
            });
          }
        }
      }
    }
  } catch {
  }
  return findings;
}

// src/security/checks/information-disclosure.ts
import { readFileSync as readFileSync27 } from "fs";
import { join as join34 } from "path";
var SKIP_DIRS6 = ["node_modules/", "dist/", ".git/", ".wrangler/", "src/security/checks/"];
function shouldSkip6(filePath) {
  return SKIP_DIRS6.some((d) => filePath.includes(d));
}
async function checkInformationDisclosure(files, projectRoot) {
  const findings = [];
  try {
    for (const file of files) {
      if (shouldSkip6(file.filePath)) continue;
      let content;
      try {
        content = readFileSync27(join34(projectRoot, file.filePath), "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) continue;
        if (/res\.(?:json|send)\s*\(\s*\{[^}]*err\.stack/.test(line) || /res\.(?:json|send)\s*\(\s*\{[^}]*stack\s*:/.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "information-disclosure",
            file: file.filePath,
            line: i + 1,
            title: "Stack trace in API response",
            description: "Error stack trace is included in an API response \u2014 exposes internal code paths and dependencies.",
            attackScenario: "An attacker could use stack traces to map internal code structure, identify frameworks, and find vulnerable code paths.",
            suggestedFix: 'Log stack traces to stderr and return a generic error message to clients: res.json({ error: "Internal server error" })'
          });
        }
        if (/console\.(?:log|error|warn)\s*\(\s*process\.env\s*\)/.test(line) || /Object\.keys\s*\(\s*process\.env\s*\)/.test(line)) {
          findings.push({
            id: "",
            severity: "low",
            vulnerabilityClass: "information-disclosure",
            file: file.filePath,
            line: i + 1,
            title: "Environment variable enumeration",
            description: "Entire process.env object is logged or enumerated \u2014 may expose secrets in log output.",
            attackScenario: "An attacker with log access could see all environment variables including API keys and database credentials.",
            suggestedFix: "Only log specific environment variable names (not values) when needed for debugging."
          });
        }
        if (/`[^`]*(?:clone|fetch|pull|push)[^`]*\$\{.*(?:url|token|key|auth).*\}`/i.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "information-disclosure",
            file: file.filePath,
            line: i + 1,
            title: "Potential credential in error/log message",
            description: "A URL or token may be interpolated into an error or log message \u2014 could expose credentials.",
            attackScenario: "An attacker with log access could extract credentials from logged URLs containing embedded tokens.",
            suggestedFix: "Sanitize URLs before logging: strip query parameters and embedded credentials."
          });
        }
        if (/console\.(?:log|debug|info)\s*\(.*(?:token|password|secret|key|auth|credential)/i.test(line)) {
          if (!/['"].*(?:token|password|secret|key|auth).*['"]/.test(line)) {
            findings.push({
              id: "",
              severity: "low",
              vulnerabilityClass: "information-disclosure",
              file: file.filePath,
              line: i + 1,
              title: "Debug log may contain sensitive value",
              description: "A console.log statement references a variable with a sensitive name (token, password, secret, key, auth).",
              attackScenario: "An attacker with log access could extract sensitive values from debug output.",
              suggestedFix: "Remove debug logging of sensitive values, or use a structured logger that redacts sensitive fields."
            });
          }
        }
      }
    }
  } catch {
  }
  return findings;
}

// src/security/checks/cryptography.ts
import { readFileSync as readFileSync28 } from "fs";
import { join as join35 } from "path";
var SKIP_DIRS7 = ["node_modules/", "dist/", ".git/", ".wrangler/", "src/security/checks/"];
var USER_INPUT_NAMES2 = /(?:input|user|name|path|query|param|request|body|args|url)/i;
function shouldSkip7(filePath) {
  return SKIP_DIRS7.some((d) => filePath.includes(d));
}
function isAuthOrCryptoFile(filePath) {
  const lower = filePath.toLowerCase();
  return /(?:auth|password|crypto|hash|session|token|jwt)/.test(lower);
}
async function checkCryptography(files, projectRoot) {
  const findings = [];
  try {
    for (const file of files) {
      if (shouldSkip7(file.filePath)) continue;
      let content;
      try {
        content = readFileSync28(join35(projectRoot, file.filePath), "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      const isCryptoFile = isAuthOrCryptoFile(file.filePath);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) continue;
        if (/createHash\s*\(\s*['"]md5['"]\s*\)/.test(line) || /hashlib\.md5\s*\(/.test(line) || /MessageDigest\.getInstance\s*\(\s*["']MD5["']\s*\)/.test(line)) {
          findings.push({
            id: "",
            severity: isCryptoFile ? "high" : "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak hash algorithm: MD5",
            description: "MD5 is cryptographically broken \u2014 collisions can be generated in seconds.",
            attackScenario: "An attacker could generate MD5 collisions to bypass integrity checks or forge password hashes.",
            suggestedFix: "Use SHA-256 or SHA-3 for integrity checks. Use bcrypt, scrypt, or argon2 for password hashing."
          });
        }
        if (/createHash\s*\(\s*['"]sha1['"]\s*\)/.test(line) || /hashlib\.sha1\s*\(/.test(line) || /MessageDigest\.getInstance\s*\(\s*["']SHA-?1["']\s*\)/.test(line)) {
          findings.push({
            id: "",
            severity: isCryptoFile ? "high" : "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak hash algorithm: SHA-1",
            description: "SHA-1 has known collision attacks (SHAttered) \u2014 should not be used for security purposes.",
            attackScenario: "An attacker could generate SHA-1 collisions to bypass integrity checks.",
            suggestedFix: "Use SHA-256 or SHA-3 for integrity checks. Use bcrypt, scrypt, or argon2 for password hashing."
          });
        }
        if (/Cipher\.getInstance\s*\(\s*["']DES/.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak cipher algorithm: DES",
            description: "DES uses a 56-bit key and can be brute-forced in hours.",
            attackScenario: "An attacker could brute-force DES-encrypted data to reveal plaintext.",
            suggestedFix: 'Use AES-256 with GCM mode: Cipher.getInstance("AES/GCM/NoPadding")'
          });
        }
        if (/(?:log|logger|LOG)\s*\.\s*(?:info|debug|warn|error|trace)\s*\([^)]*\+/.test(line)) {
          if (USER_INPUT_NAMES2.test(line)) {
            findings.push({
              id: "",
              severity: "medium",
              vulnerabilityClass: "cryptography",
              file: file.filePath,
              line: i + 1,
              title: "Potential log injection",
              description: "User-controlled input concatenated directly into log output.",
              attackScenario: "An attacker could inject newlines or control characters to forge log entries or hide malicious activity.",
              suggestedFix: 'Use parameterized logging: log.info("User: {}", userInput) instead of string concatenation.'
            });
          }
        }
        if (/Math\.random\(\)/.test(line) && isCryptoFile) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Math.random() in cryptography-related file",
            description: "Math.random() is not cryptographically secure \u2014 its output can be predicted.",
            attackScenario: "An attacker could predict Math.random() values to forge tokens, nonces, or other security-critical random values.",
            suggestedFix: "Use crypto.randomBytes() or crypto.getRandomValues() for cryptographic purposes."
          });
        }
        if (/(?:fetch|axios\.(?:get|post|put|delete|patch)|http\.request)\s*\(\s*['"]http:\/\/(?!(?:localhost|127\.))/i.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "HTTP used instead of HTTPS",
            description: "An HTTP (not HTTPS) URL is used for an external request \u2014 data is transmitted unencrypted.",
            attackScenario: "An attacker on the network path could intercept, read, or modify data in transit (man-in-the-middle).",
            suggestedFix: "Use HTTPS for all external requests to ensure data confidentiality and integrity."
          });
        }
        if (/pbkdf2/.test(line) && /['"][a-zA-Z0-9+/=]{8,}['"]/.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded salt in key derivation",
            description: "A hardcoded salt is used with PBKDF2 \u2014 all users share the same salt.",
            attackScenario: "An attacker could precompute rainbow tables with the known salt to crack all passwords at once.",
            suggestedFix: "Generate a unique random salt per user using crypto.randomBytes(16)."
          });
        }
        if (/\brand\s*\(\s*\)/.test(line) && isCryptoFile) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak random: rand() in security context",
            description: "rand() is not cryptographically secure \u2014 its output can be predicted.",
            attackScenario: "An attacker could predict rand() values to forge tokens or bypass security checks.",
            suggestedFix: "Use std::random_device or platform-specific CSPRNG (e.g., /dev/urandom, BCryptGenRandom)."
          });
        }
        if (/(?:const\s+(?:char|std::string)\s*\*?\s*(?:password|secret|api_key|apiKey|token)\s*=\s*["'])/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded credentials in C++ source",
            description: "A password, secret, or API key is hardcoded as a string literal.",
            attackScenario: "An attacker with access to the binary or source could extract the credential.",
            suggestedFix: "Load credentials from environment variables or a secure vault at runtime."
          });
        }
        if (/(?:val|var)\s+(?:password|secret|apiKey|api_key|token)\s*=\s*["']/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded credentials in Kotlin source",
            description: "A password, secret, or API key is hardcoded as a string literal.",
            attackScenario: "An attacker with access to the binary or source could extract the credential.",
            suggestedFix: "Load credentials from environment variables or a secure vault at runtime."
          });
        }
        if (/\bRandom\s*\(\s*\)/.test(line) && isCryptoFile) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Insecure random in Kotlin security context",
            description: "kotlin.random.Random() is not cryptographically secure \u2014 its output can be predicted.",
            attackScenario: "An attacker could predict random values to forge tokens or bypass security checks.",
            suggestedFix: "Use java.security.SecureRandom for cryptographic purposes."
          });
        }
        if (/!!\s*\./.test(line) && isCryptoFile) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Not-null assertion (!!) in security-sensitive Kotlin code",
            description: "The !! operator can throw NullPointerException, potentially bypassing security checks.",
            attackScenario: "An attacker could trigger a null value to cause an exception that bypasses validation logic.",
            suggestedFix: "Use safe calls (?.) with proper null handling instead of !! assertions."
          });
        }
        if (/(?:val|var)\s+\w*[Uu]rl\w*\s*=\s*["']http:\/\/(?!(?:localhost|127\.))/.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded HTTP URL in Kotlin source",
            description: "An HTTP (not HTTPS) URL is hardcoded \u2014 data is transmitted unencrypted.",
            attackScenario: "An attacker on the network path could intercept, read, or modify data in transit.",
            suggestedFix: "Use HTTPS for all external URLs to ensure data confidentiality and integrity."
          });
        }
        if (/\bmd5\s*\(/.test(line) && /password|passwd|pass|pwd/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "PHP md5() used for password hashing",
            description: "md5() is cryptographically broken and should never be used for password hashing.",
            attackScenario: "An attacker could crack MD5 password hashes in seconds using rainbow tables or GPU brute force.",
            suggestedFix: "Use password_hash() with PASSWORD_BCRYPT or PASSWORD_ARGON2ID."
          });
        }
        if (/\bsha1\s*\(/.test(line) && /password|passwd|pass|pwd/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "PHP sha1() used for password hashing",
            description: "SHA-1 has known collision attacks and should not be used for password hashing.",
            attackScenario: "An attacker could crack SHA-1 password hashes using precomputed tables.",
            suggestedFix: "Use password_hash() with PASSWORD_BCRYPT or PASSWORD_ARGON2ID."
          });
        }
        if (/\bcrypt\s*\(\s*[^,]+,\s*['"][\$]?[12a-zA-Z]{0,3}['"]/.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "PHP crypt() with potentially weak salt",
            description: "crypt() with a short or weak salt may use DES or MD5 algorithm.",
            attackScenario: "An attacker could crack weakly-salted crypt() hashes using brute force.",
            suggestedFix: "Use password_hash() instead of crypt(). It automatically uses a strong algorithm and salt."
          });
        }
        if (/\bmcrypt_/.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "PHP deprecated mcrypt_* function",
            description: "mcrypt extension was deprecated in PHP 7.1 and removed in PHP 7.2. It has known vulnerabilities.",
            attackScenario: "An attacker could exploit known weaknesses in mcrypt implementations.",
            suggestedFix: "Use openssl_encrypt()/openssl_decrypt() or the sodium extension (sodium_crypto_*)."
          });
        }
        if (/\b(?:rand|mt_rand)\s*\(/.test(line) && isCryptoFile) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "PHP rand()/mt_rand() in security context",
            description: "rand() and mt_rand() are not cryptographically secure \u2014 their output can be predicted.",
            attackScenario: "An attacker could predict random values to forge tokens or bypass security checks.",
            suggestedFix: "Use random_bytes() or random_int() for cryptographic purposes."
          });
        }
        if (/\$(?:password|secret|api_?key|token)\s*=\s*['"][^'"]{4,}['"]/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded credentials in PHP source",
            description: "A password, secret, or API key is hardcoded as a string literal.",
            attackScenario: "An attacker with access to the source could extract the credential.",
            suggestedFix: "Load credentials from environment variables using getenv() or $_ENV."
          });
        }
        if (/\bCC_MD5\b/.test(line) || /Insecure\s*\.\s*MD5/.test(line)) {
          findings.push({
            id: "",
            severity: isCryptoFile ? "high" : "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak hash algorithm: MD5 in Swift",
            description: "MD5 is cryptographically broken \u2014 collisions can be generated in seconds.",
            attackScenario: "An attacker could generate MD5 collisions to bypass integrity checks or forge hashes.",
            suggestedFix: "Use SHA256 from CryptoKit: SHA256.hash(data: data)"
          });
        }
        if (/\bCC_SHA1\b/.test(line) || /Insecure\s*\.\s*SHA1/.test(line)) {
          findings.push({
            id: "",
            severity: isCryptoFile ? "high" : "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak hash algorithm: SHA-1 in Swift",
            description: "SHA-1 has known collision attacks \u2014 should not be used for security purposes.",
            attackScenario: "An attacker could generate SHA-1 collisions to bypass integrity checks.",
            suggestedFix: "Use SHA256 from CryptoKit: SHA256.hash(data: data)"
          });
        }
        if (/(?:let|var)\s+(?:password|secret|apiKey|api_key|token)\s*(?::\s*String\s*)?=\s*["']/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded credentials in Swift source",
            description: "A password, secret, or API key is hardcoded as a string literal.",
            attackScenario: "An attacker with access to the binary or source could extract the credential.",
            suggestedFix: "Load credentials from Keychain, environment variables, or a secure configuration service."
          });
        }
        if (/\barc4random\b/.test(line) && isCryptoFile) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "arc4random in Swift security context",
            description: "arc4random is not suitable for cryptographic key generation.",
            attackScenario: "An attacker could predict random values if used for cryptographic purposes.",
            suggestedFix: "Use SecRandomCopyBytes or SystemRandomNumberGenerator for security-sensitive randomness."
          });
        }
        if (/allowsArbitraryLoads\s*:\s*true/.test(line) || /NSAllowsArbitraryLoads.*true/.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Swift App Transport Security disabled",
            description: "allowsArbitraryLoads is set to true \u2014 all HTTP traffic is permitted without encryption.",
            attackScenario: "An attacker on the network path could intercept, read, or modify data in transit.",
            suggestedFix: "Remove allowsArbitraryLoads or set to false. Add specific exceptions only for domains that require HTTP."
          });
        }
        if (/(?:let|var)\s+\w*[Uu]rl\w*\s*=\s*["']http:\/\/(?!(?:localhost|127\.))/.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded HTTP URL in Swift source",
            description: "An HTTP (not HTTPS) URL is hardcoded \u2014 data is transmitted unencrypted.",
            attackScenario: "An attacker on the network path could intercept, read, or modify data in transit.",
            suggestedFix: "Use HTTPS for all external URLs to ensure data confidentiality and integrity."
          });
        }
        if (/from\s+python\s+import\s+random/.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Mojo weak random via Python random module",
            description: "Python random module imported via Mojo interop \u2014 not cryptographically secure.",
            attackScenario: "An attacker could predict random values to forge tokens or bypass security checks.",
            suggestedFix: "Use Python secrets module through interop, or implement CSPRNG natively in Mojo."
          });
        }
        if (/\balias\s+(?:key|secret|password|token|api_key)\s*[=:]\s*["'][^"']{4,}["']/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded credentials in Mojo alias declaration",
            description: "A secret, key, or password is hardcoded in a compile-time alias \u2014 visible in source.",
            attackScenario: "An attacker with access to source or compiled binary could extract the credential.",
            suggestedFix: "Load credentials from environment variables at runtime instead of alias declarations."
          });
        }
        if (/from\s+python\s+import\s+hashlib/.test(line)) {
          if (isCryptoFile) {
            findings.push({
              id: "",
              severity: "medium",
              vulnerabilityClass: "cryptography",
              file: file.filePath,
              line: i + 1,
              title: "Mojo Python hashlib imported in security context",
              description: "Python hashlib imported via interop \u2014 ensure only strong algorithms (SHA-256+) are used.",
              attackScenario: "If MD5 or SHA-1 from hashlib is used, an attacker could exploit weak hash collisions.",
              suggestedFix: "Only use hashlib.sha256() or stronger. Avoid md5() and sha1() for security purposes."
            });
          }
        }
        if (/Digest::MD5/.test(line)) {
          findings.push({
            id: "",
            severity: isCryptoFile ? "high" : "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak hash algorithm: MD5 in Ruby",
            description: "MD5 is cryptographically broken \u2014 collisions can be generated in seconds.",
            attackScenario: "An attacker could generate MD5 collisions to bypass integrity checks or forge hashes.",
            suggestedFix: "Use Digest::SHA256 or bcrypt for password hashing."
          });
        }
        if (/Digest::SHA1/.test(line)) {
          findings.push({
            id: "",
            severity: isCryptoFile ? "high" : "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak hash algorithm: SHA-1 in Ruby",
            description: "SHA-1 has known collision attacks \u2014 should not be used for security purposes.",
            attackScenario: "An attacker could generate SHA-1 collisions to bypass integrity checks.",
            suggestedFix: "Use Digest::SHA256 or stronger for integrity checks."
          });
        }
        if (/\brand\s*\(/.test(line) && isCryptoFile) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak random: rand() in Ruby security context",
            description: "rand() is not cryptographically secure \u2014 its output can be predicted.",
            attackScenario: "An attacker could predict rand() values to forge tokens or bypass security checks.",
            suggestedFix: "Use SecureRandom.hex, SecureRandom.uuid, or SecureRandom.random_bytes for cryptographic purposes."
          });
        }
        if (/(?:password|secret|api_key|token)\s*=\s*['"][^'"]{4,}['"]/i.test(line)) {
          if (file.filePath.endsWith(".rb")) {
            findings.push({
              id: "",
              severity: "high",
              vulnerabilityClass: "cryptography",
              file: file.filePath,
              line: i + 1,
              title: "Hardcoded credentials in Ruby source",
              description: "A password, secret, or API key is hardcoded as a string literal.",
              attackScenario: "An attacker with access to the source could extract the credential.",
              suggestedFix: 'Load credentials from environment variables using ENV["KEY"] or Rails credentials.'
            });
          }
        }
        if (/verify_mode\s*=\s*OpenSSL::SSL::VERIFY_NONE/.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Ruby SSL verification disabled",
            description: "SSL certificate verification is disabled \u2014 connections are not authenticated.",
            attackScenario: "An attacker on the network could intercept and modify traffic without detection.",
            suggestedFix: "Use OpenSSL::SSL::VERIFY_PEER to verify server certificates."
          });
        }
        if (/OpenSSL::Cipher\s*\.\s*new\s*\(\s*['"](?:DES|RC4)/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak cipher algorithm in Ruby",
            description: "DES/RC4 ciphers are cryptographically weak and can be broken with modern hardware.",
            attackScenario: "An attacker could brute-force or exploit weaknesses in DES/RC4 to decrypt data.",
            suggestedFix: 'Use OpenSSL::Cipher.new("aes-256-gcm") for authenticated encryption.'
          });
        }
        if (file.filePath.endsWith(".dart") && /(?:md5|sha1)\s*\.convert/.test(line) && /password|passwd|credential|secret/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak hash algorithm for credentials in Dart",
            description: "MD5/SHA1 should not be used for credential hashing \u2014 fast hashes are easily brute-forced.",
            attackScenario: "An attacker could crack hashed credentials using precomputed tables or GPU acceleration.",
            suggestedFix: "Use bcrypt, argon2, or scrypt via pointycastle or cryptography packages."
          });
        }
        if (file.filePath.endsWith(".dart") && /\bRandom\s*\(\s*\)/.test(line) && isCryptoFile) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Insecure random number generator in Dart",
            description: "Random() is not cryptographically secure \u2014 its output can be predicted.",
            attackScenario: "An attacker could predict Random() values to forge tokens or session identifiers.",
            suggestedFix: "Use Random.secure() for cryptographic randomness."
          });
        }
        if (file.filePath.endsWith(".dart") && /(?:password|secret|apiKey|token)\s*=\s*['"][^'"]{4,}['"]/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded credentials in Dart source",
            description: "A sensitive value is hardcoded as a string literal in source code.",
            attackScenario: "An attacker with access to the source or compiled binary could extract the credential.",
            suggestedFix: "Load credentials from environment variables or a secure configuration service."
          });
        }
        if (file.filePath.endsWith(".dart") && /badCertificateCallback.*(?:=>|return)\s*true/.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Dart SSL certificate validation disabled",
            description: "badCertificateCallback always returns true \u2014 server certificates are not validated.",
            attackScenario: "An attacker on the network could intercept and modify encrypted traffic.",
            suggestedFix: "Implement proper certificate pinning or remove the badCertificateCallback override."
          });
        }
        if (file.filePath.endsWith(".dart") && /['"]http:\/\/(?!localhost|127\.0\.0\.1|10\.)/.test(line) && !line.includes("// depwire-security-reviewed")) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Insecure HTTP connection in Dart",
            description: "HTTP used instead of HTTPS for non-local connection \u2014 traffic is unencrypted.",
            attackScenario: "An attacker on the network could read or modify data in transit.",
            suggestedFix: "Use HTTPS for all non-local connections."
          });
        }
        if (file.filePath.endsWith(".dart") && /SharedPreferences/.test(line) && /(?:token|password|secret|key|auth)/i.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Sensitive data in unencrypted Dart local storage",
            description: "Sensitive values stored in SharedPreferences without encryption.",
            attackScenario: "Device backup extraction or root access could expose stored sensitive values.",
            suggestedFix: "Use flutter_secure_storage for sensitive data that needs local persistence."
          });
        }
        const isRFile = file.filePath.endsWith(".R") || file.filePath.endsWith(".r") || file.filePath.endsWith(".Rmd") || file.filePath.endsWith(".rmd");
        if (isRFile && /digest\s*\(.*algo\s*=\s*['"](?:md5|sha1)['"]/.test(line) && /(?:password|credential|token|secret|auth)/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Weak hash algorithm for credential handling in R",
            description: "MD5 or SHA-1 used for credential-related hashing \u2014 these are considered weak.",
            attackScenario: "An attacker could compute hash collisions or reverse hashes using precomputed tables.",
            suggestedFix: 'Use digest(..., algo="sha256") or bcrypt/argon2 via the sodium package for credentials.'
          });
        }
        if (isRFile && /(?:runif|sample|rnorm)\s*\(/.test(line) && /(?:token|key|secret|password|session|nonce|salt)/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Non-cryptographic RNG used for security value in R",
            description: "runif()/sample() are not cryptographically secure \u2014 output can be predicted.",
            attackScenario: "An attacker could predict the generated values to forge tokens or identifiers.",
            suggestedFix: "Use openssl::rand_bytes() or sodium::random() for cryptographically secure random values."
          });
        }
        if (isRFile && /(?:password|secret|api_key|token|auth_token)\s*(?:<-|=)\s*['"][^'"]{4,}['"]/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Hardcoded credentials in R source",
            description: "A sensitive value is hardcoded as a string literal in source code.",
            attackScenario: "An attacker with access to the source could extract the credential.",
            suggestedFix: "Load credentials from environment variables via Sys.getenv() or a .Renviron file."
          });
        }
        if (isRFile && /(?:ssl_verifypeer\s*=\s*(?:FALSE|0)|ssl\.verifypeer\s*=\s*(?:FALSE|0)|verify\s*=\s*FALSE)/.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "SSL verification disabled in R",
            description: "SSL peer verification is disabled \u2014 server certificates are not validated.",
            attackScenario: "An attacker on the network could intercept and modify encrypted traffic.",
            suggestedFix: "Remove ssl_verifypeer=FALSE. Ensure proper SSL certificates are configured."
          });
        }
        if (isRFile && /['"]http:\/\/(?!localhost|127\.0\.0\.1|10\.)/.test(line) && !line.includes("# depwire-security-reviewed")) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Insecure HTTP connection in R",
            description: "HTTP used instead of HTTPS for non-local connection \u2014 traffic is unencrypted.",
            attackScenario: "An attacker on the network could read or modify data in transit.",
            suggestedFix: "Use HTTPS for all non-local connections."
          });
        }
        if (isRFile && /saveRDS\s*\(/.test(line) && /(?:password|secret|token|key|credential|auth)/i.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "cryptography",
            file: file.filePath,
            line: i + 1,
            title: "Sensitive data stored in unencrypted RDS file",
            description: "Sensitive values saved to a plain RDS file without encryption.",
            attackScenario: "Anyone with file access could read the deserialized sensitive data.",
            suggestedFix: "Use the cyphr or sodium package to encrypt sensitive data before saving."
          });
        }
      }
    }
  } catch {
  }
  return findings;
}

// src/security/checks/frontend.ts
import { readFileSync as readFileSync29 } from "fs";
import { join as join36 } from "path";
var SKIP_DIRS8 = ["node_modules/", "dist/", ".git/", ".wrangler/", "src/security/checks/"];
function shouldSkip8(filePath) {
  return SKIP_DIRS8.some((d) => filePath.includes(d));
}
function isFrontendFile(filePath) {
  return /\.(?:tsx|jsx|html)$/.test(filePath);
}
async function checkFrontend(files, projectRoot) {
  const findings = [];
  try {
    for (const file of files) {
      if (shouldSkip8(file.filePath)) continue;
      if (!isFrontendFile(file.filePath)) continue;
      let content;
      try {
        content = readFileSync29(join36(projectRoot, file.filePath), "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("{/*")) continue;
        if (/dangerouslySetInnerHTML/.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "frontend-xss",
            file: file.filePath,
            line: i + 1,
            title: "dangerouslySetInnerHTML usage",
            description: "dangerouslySetInnerHTML renders raw HTML \u2014 bypasses React's XSS protections.",
            attackScenario: "An attacker could inject malicious HTML/JavaScript if user input reaches dangerouslySetInnerHTML.",
            suggestedFix: "Sanitize HTML with DOMPurify before rendering, or use React components instead of raw HTML."
          });
        }
        if (/\.innerHTML\s*=/.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "frontend-xss",
            file: file.filePath,
            line: i + 1,
            title: "innerHTML assignment",
            description: "Direct innerHTML assignment renders raw HTML without sanitization.",
            attackScenario: "An attacker could inject malicious scripts through user-controlled content assigned to innerHTML.",
            suggestedFix: "Use textContent for plain text, or sanitize with DOMPurify before setting innerHTML."
          });
        }
        if (/document\.write\s*\(/.test(line)) {
          findings.push({
            id: "",
            severity: "medium",
            vulnerabilityClass: "frontend-xss",
            file: file.filePath,
            line: i + 1,
            title: "document.write() usage",
            description: "document.write() can introduce XSS vulnerabilities and degrades performance.",
            attackScenario: "An attacker could inject scripts through user input that reaches document.write().",
            suggestedFix: "Use DOM manipulation methods (createElement, appendChild) instead of document.write()."
          });
        }
        if (/target\s*=\s*["']_blank["']/.test(line)) {
          const fullLine = line;
          if (!/rel\s*=\s*["'][^"']*noopener[^"']*["']/.test(fullLine)) {
            findings.push({
              id: "",
              severity: "low",
              vulnerabilityClass: "frontend-xss",
              file: file.filePath,
              line: i + 1,
              title: 'Missing rel="noopener" on target="_blank"',
              description: 'Links with target="_blank" without rel="noopener noreferrer" give the opened page access to window.opener.',
              attackScenario: "The opened page could use window.opener to redirect the original page to a phishing site.",
              suggestedFix: 'Add rel="noopener noreferrer" to all links with target="_blank".'
            });
          }
        }
        if (/(?:localStorage|sessionStorage)\.setItem\s*\([^)]*(?:token|password|secret|key|auth)/i.test(line)) {
          findings.push({
            id: "",
            severity: "high",
            vulnerabilityClass: "frontend-xss",
            file: file.filePath,
            line: i + 1,
            title: "Sensitive data stored in browser storage",
            description: "A sensitive value (token, password, secret, key, auth) is stored in localStorage or sessionStorage.",
            attackScenario: "Any XSS vulnerability would allow an attacker to read all localStorage/sessionStorage data, including sensitive tokens.",
            suggestedFix: "Use secure HTTP-only cookies for sensitive tokens instead of browser storage."
          });
        }
      }
    }
  } catch {
  }
  return findings;
}

// src/security/checks/architecture.ts
var AUTH_KEYWORDS = /(?:auth|token|session|jwt|oauth|login|passport|credential)/i;
var DATA_KEYWORDS = /(?:query|insert|fetch|get|find|select|update|delete|save|create|put|remove)/i;
var DB_IMPORT_KEYWORDS = /(?:db|database|prisma|mongoose|d1|sql|knex|sequelize|typeorm|drizzle)/i;
var CRYPTO_KEYWORDS = /(?:auth|crypto|token|session|jwt|password|hash)/i;
function isSecurityFile(filePath) {
  return CRYPTO_KEYWORDS.test(filePath.toLowerCase());
}
function isRouteFile(filePath) {
  const lower = filePath.toLowerCase();
  return /(?:routes?\/|api\/|handler|controller|endpoint)/.test(lower);
}
async function checkArchitecture(files, projectRoot, graph) {
  const findings = [];
  try {
    findings.push(...checkGodFilesWithAuthAndData(graph));
    findings.push(...checkCircularAuthDeps(graph));
    findings.push(...checkDirectDbFromRoutes(graph));
    findings.push(...checkDeadAuthCode(graph));
    findings.push(...checkUnauthHighFanIn(graph));
  } catch {
  }
  return findings;
}
function checkGodFilesWithAuthAndData(graph) {
  const findings = [];
  const fileConnections = /* @__PURE__ */ new Map();
  const fileSymbolNames = /* @__PURE__ */ new Map();
  graph.forEachNode((_node, attrs) => {
    const fp = attrs.filePath;
    if (!fileSymbolNames.has(fp)) fileSymbolNames.set(fp, []);
    fileSymbolNames.get(fp).push(attrs.name);
  });
  graph.forEachEdge((_edge, _attrs, source, target) => {
    const sf = graph.getNodeAttributes(source).filePath;
    const tf = graph.getNodeAttributes(target).filePath;
    if (sf !== tf) {
      fileConnections.set(sf, (fileConnections.get(sf) || 0) + 1);
      fileConnections.set(tf, (fileConnections.get(tf) || 0) + 1);
    }
  });
  const connections = Array.from(fileConnections.values());
  const avg = connections.length > 0 ? connections.reduce((a, b) => a + b, 0) / connections.length : 0;
  const godThreshold = avg * 3;
  for (const [filePath, count] of fileConnections.entries()) {
    if (count <= godThreshold) continue;
    const symbols = fileSymbolNames.get(filePath) || [];
    const hasAuth = symbols.some((s) => AUTH_KEYWORDS.test(s));
    const hasData = symbols.some((s) => DATA_KEYWORDS.test(s));
    if (hasAuth && hasData) {
      findings.push({
        id: "",
        severity: "medium",
        vulnerabilityClass: "architecture",
        file: filePath,
        title: "God file mixes auth and data access logic",
        description: `${filePath} has ${count} connections and contains both auth-related and data-access symbols. This violates separation of concerns and makes security auditing difficult.`,
        attackScenario: "A bug in data access logic could inadvertently bypass auth checks when auth and data are tightly coupled in a single file.",
        suggestedFix: "Split auth logic and data access into separate modules with a clear service layer boundary."
      });
    }
  }
  return findings;
}
function checkCircularAuthDeps(graph) {
  const findings = [];
  const fileGraph = /* @__PURE__ */ new Map();
  graph.forEachEdge((_edge, _attrs, source, target) => {
    const sf = graph.getNodeAttributes(source).filePath;
    const tf = graph.getNodeAttributes(target).filePath;
    if (sf !== tf) {
      if (!fileGraph.has(sf)) fileGraph.set(sf, /* @__PURE__ */ new Set());
      fileGraph.get(sf).add(tf);
    }
  });
  const visited = /* @__PURE__ */ new Set();
  const recStack = /* @__PURE__ */ new Set();
  const cycles = [];
  function dfs(node, path6) {
    if (recStack.has(node)) {
      const cycleStart = path6.indexOf(node);
      if (cycleStart >= 0) cycles.push(path6.slice(cycleStart));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    recStack.add(node);
    path6.push(node);
    const neighbors = fileGraph.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path6]);
      }
    }
    recStack.delete(node);
  }
  for (const node of fileGraph.keys()) {
    if (!visited.has(node)) dfs(node, []);
  }
  const seen = /* @__PURE__ */ new Set();
  for (const cycle of cycles) {
    const key = [...cycle].sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const hasSecurityFile = cycle.some((f) => isSecurityFile(f));
    if (hasSecurityFile) {
      findings.push({
        id: "",
        severity: "high",
        vulnerabilityClass: "architecture",
        file: cycle[0],
        title: "Circular dependency in auth/crypto module",
        description: `Circular dependency detected involving security-critical files: ${cycle.join(" \u2192 ")}`,
        attackScenario: "Circular dependencies in auth modules can lead to initialization order bugs where auth checks are bypassed during startup.",
        suggestedFix: "Break the circular dependency by extracting shared types/interfaces into a separate module."
      });
    }
  }
  return findings;
}
function checkDirectDbFromRoutes(graph) {
  const findings = [];
  const fileImports = /* @__PURE__ */ new Map();
  graph.forEachEdge((_edge, attrs, source, target) => {
    const sf = graph.getNodeAttributes(source).filePath;
    const tf = graph.getNodeAttributes(target).filePath;
    if (sf !== tf) {
      if (!fileImports.has(sf)) fileImports.set(sf, /* @__PURE__ */ new Set());
      fileImports.get(sf).add(tf);
    }
  });
  for (const [filePath, imports] of fileImports.entries()) {
    if (!isRouteFile(filePath)) continue;
    for (const importedFile of imports) {
      const importedName = importedFile.toLowerCase();
      if (DB_IMPORT_KEYWORDS.test(importedName)) {
        findings.push({
          id: "",
          severity: "medium",
          vulnerabilityClass: "architecture",
          file: filePath,
          title: "Direct DB access from route handler",
          description: `Route file ${filePath} imports directly from ${importedFile} (database client) without a service layer.`,
          attackScenario: "Direct DB access from routes makes it harder to enforce consistent authorization, validation, and audit logging.",
          suggestedFix: "Introduce a service layer between routes and database access for consistent security checks."
        });
      }
    }
  }
  return findings;
}
var SKIP_FILE_PATTERNS = ["test/", "tests/", "test/fixtures/", "__tests__/", "fixtures/", "spec/"];
function checkDeadAuthCode(graph) {
  const findings = [];
  const seen = /* @__PURE__ */ new Set();
  graph.forEachNode((node, attrs) => {
    if (!attrs.exported) return;
    if (!isSecurityFile(attrs.filePath)) return;
    const lowerPath = attrs.filePath.toLowerCase();
    if (SKIP_FILE_PATTERNS.some((p) => lowerPath.includes(p))) return;
    if (!attrs.name || attrs.name.length < 4) return;
    const SKIP_NAMES = /* @__PURE__ */ new Set(["line", "lines", "content", "findings", "result", "results", "data", "options", "args", "config", "error", "catchBlock", "nearbyLines", "isCryptoFile", "isAuthFile", "isAuthRelatedFile"]);
    if (SKIP_NAMES.has(attrs.name)) return;
    if (graph.inDegree(node) === 0) {
      const dedupKey = `${attrs.filePath}:${attrs.startLine}:${attrs.name}`;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);
      findings.push({
        id: "",
        severity: "info",
        vulnerabilityClass: "architecture",
        file: attrs.filePath,
        line: attrs.startLine,
        symbol: attrs.name,
        title: `Dead exported function in security file: ${attrs.name}`,
        description: `${attrs.name} in ${attrs.filePath} is exported but has zero dependents \u2014 may indicate an orphaned auth path.`,
        attackScenario: "Dead auth code may indicate incomplete security migration, leaving old vulnerable code paths accessible.",
        suggestedFix: "Review and remove dead auth code, or verify it is intentionally unused (e.g., SDK export)."
      });
    }
  });
  return findings;
}
function checkUnauthHighFanIn(graph) {
  const findings = [];
  const fileIncoming = /* @__PURE__ */ new Map();
  const fileImportedModules = /* @__PURE__ */ new Map();
  graph.forEachEdge((_edge, _attrs, source, target) => {
    const sf = graph.getNodeAttributes(source).filePath;
    const tf = graph.getNodeAttributes(target).filePath;
    if (sf !== tf) {
      fileIncoming.set(tf, (fileIncoming.get(tf) || 0) + 1);
      if (!fileImportedModules.has(sf)) fileImportedModules.set(sf, /* @__PURE__ */ new Set());
      fileImportedModules.get(sf).add(tf);
    }
  });
  for (const [filePath, count] of fileIncoming.entries()) {
    if (!isRouteFile(filePath)) continue;
    const imports = fileImportedModules.get(filePath) || /* @__PURE__ */ new Set();
    const hasAuthImport = Array.from(imports).some((imp) => AUTH_KEYWORDS.test(imp.toLowerCase()));
    if (hasAuthImport) continue;
    let severity;
    if (count > 10) severity = "high";
    else if (count > 5) severity = "medium";
    else if (count > 0) severity = "low";
    else continue;
    findings.push({
      id: "",
      severity,
      vulnerabilityClass: "architecture",
      file: filePath,
      title: `Unauthenticated route with high fan-in (${count})`,
      description: `${filePath} appears to be a route file with ${count} incoming references but imports no auth middleware.`,
      attackScenario: "A route without authentication that is widely depended upon could expose sensitive functionality to unauthorized users.",
      suggestedFix: "Add authentication middleware to this route or verify it is intentionally public."
    });
  }
  return findings;
}

// src/security/graph-aware.ts
var MCP_PATTERN = /(?:mcp\/|mcp-|\.mcp\.)/i;
var ROUTE_PATTERN = /(?:routes?\/|api\/|handler|controller|endpoint|server)/i;
var CLI_PATTERN = /(?:commands?\/|cli\/|bin\/)/i;
var AUTH_PATTERN = /(?:auth|session|token|jwt|oauth|login|passport|middleware)/i;
function classifyEntryPoint(filePath) {
  if (MCP_PATTERN.test(filePath)) return "mcp-tool";
  if (ROUTE_PATTERN.test(filePath)) return "http-route";
  if (CLI_PATTERN.test(filePath)) return "cli-command";
  return null;
}
function isUnauthenticatedRoute(filePath, graph) {
  if (!ROUTE_PATTERN.test(filePath)) return false;
  const routeNodes = [];
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) routeNodes.push(nodeId);
  });
  for (const nodeId of routeNodes) {
    const outNeighbors = graph.outNeighbors(nodeId);
    for (const neighbor of outNeighbors) {
      const neighborAttrs = graph.getNodeAttributes(neighbor);
      if (AUTH_PATTERN.test(neighborAttrs.filePath) || AUTH_PATTERN.test(neighborAttrs.name)) {
        return false;
      }
    }
  }
  return true;
}
function findReachableEntryPoints(filePath, graph) {
  const entryPoints = [];
  const visited = /* @__PURE__ */ new Set();
  const queue = [];
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) {
      queue.push(nodeId);
      visited.add(nodeId);
    }
  });
  while (queue.length > 0) {
    const current = queue.shift();
    const dependents = graph.inNeighbors(current);
    for (const dep of dependents) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      queue.push(dep);
      const attrs = graph.getNodeAttributes(dep);
      const epType = classifyEntryPoint(attrs.filePath);
      if (epType && !entryPoints.some((ep) => ep.filePath === attrs.filePath)) {
        entryPoints.push({ filePath: attrs.filePath, type: epType });
      }
    }
  }
  return entryPoints;
}
function elevateByReachability(finding, graph, _projectRoot) {
  try {
    const entryPoints = findReachableEntryPoints(finding.file, graph);
    if (entryPoints.length === 0) return finding;
    const mcpEntryPoints = entryPoints.filter((ep) => ep.type === "mcp-tool");
    const httpEntryPoints = entryPoints.filter((ep) => ep.type === "http-route");
    const cliEntryPoints = entryPoints.filter((ep) => ep.type === "cli-command");
    let newSeverity = finding.severity;
    let elevationReason = "";
    if (finding.severity === "high") {
      const unauthRoutes = httpEntryPoints.filter((ep) => isUnauthenticatedRoute(ep.filePath, graph));
      if (unauthRoutes.length > 0) {
        newSeverity = "critical";
        elevationReason = `reachable from unauthenticated HTTP route: ${unauthRoutes[0].filePath}`;
      }
    }
    if (finding.severity === "medium" && httpEntryPoints.length > 0) {
      newSeverity = "high";
      elevationReason = `reachable from HTTP route: ${httpEntryPoints[0].filePath}`;
    }
    if (finding.severity === "medium" && mcpEntryPoints.length > 0) {
      if (newSeverity === "medium") {
        newSeverity = "high";
        elevationReason = `reachable from MCP tool: ${mcpEntryPoints[0].filePath}`;
      }
    }
    if (finding.severity === "low" && entryPoints.length > 0) {
      newSeverity = "medium";
      elevationReason = `reachable from ${entryPoints.length} external entry point(s)`;
    }
    const allEntryPointPaths = entryPoints.map((ep) => `${ep.type}: ${ep.filePath}`);
    return {
      ...finding,
      severity: newSeverity,
      graphReachability: {
        entryPoints: allEntryPointPaths,
        reachableFrom: entryPoints.length,
        elevatedBy: elevationReason
      }
    };
  } catch {
    return finding;
  }
}

// src/security/scanner.ts
var SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];
async function scanSecurity(projectRoot, graph, options = {}) {
  const startTime = Date.now();
  const parsedFiles = await parseProject(projectRoot);
  const filteredFiles = options.target ? parsedFiles.filter((f) => f.filePath === options.target || f.filePath.endsWith(options.target)) : parsedFiles;
  const hasFrontendFiles = filteredFiles.some((f) => /\.(?:tsx|jsx|html)$/.test(f.filePath));
  const checkResults = await Promise.all([
    // Skip dependency checks for single-file scans — they are repo-wide by nature
    options.target ? Promise.resolve([]) : checkDependencies(filteredFiles, projectRoot),
    checkInjection(filteredFiles, projectRoot),
    checkSecrets(filteredFiles, projectRoot),
    checkPathTraversal(filteredFiles, projectRoot),
    checkAuth(filteredFiles, projectRoot),
    checkInputValidation(filteredFiles, projectRoot),
    checkInformationDisclosure(filteredFiles, projectRoot),
    checkCryptography(filteredFiles, projectRoot),
    hasFrontendFiles ? checkFrontend(filteredFiles, projectRoot) : Promise.resolve([]),
    checkArchitecture(filteredFiles, projectRoot, graph)
  ]);
  let findings = checkResults.flat();
  if (options.classes && options.classes.length > 0) {
    const allowedClasses = new Set(options.classes);
    findings = findings.filter((f) => allowedClasses.has(f.vulnerabilityClass));
  }
  if (options.graphAware !== false) {
    findings = findings.map((f) => elevateByReachability(f, graph, projectRoot));
  }
  findings.sort((a, b) => {
    return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  });
  findings.forEach((f, i) => {
    f.id = `SEC-${String(i + 1).padStart(3, "0")}`;
  });
  const summary = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length,
    total: findings.length
  };
  const depFindings = checkResults[0];
  const hasDeps = depFindings.length > 0;
  return {
    scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
    projectRoot,
    filesScanned: filteredFiles.length,
    findings,
    summary,
    dependencyAudit: {
      ran: hasDeps,
      packageManager: hasDeps ? detectPackageManager(projectRoot) : null,
      rawOutput: ""
    }
  };
}
function detectPackageManager(projectRoot) {
  if (existsSync25(join37(projectRoot, "package.json"))) return "npm";
  if (existsSync25(join37(projectRoot, "requirements.txt"))) return "pip";
  if (existsSync25(join37(projectRoot, "pyproject.toml"))) return "pip";
  if (existsSync25(join37(projectRoot, "Cargo.toml"))) return "cargo";
  if (existsSync25(join37(projectRoot, "go.mod"))) return "go";
  if (existsSync25(join37(projectRoot, "pom.xml"))) return "maven";
  if (existsSync25(join37(projectRoot, "build.gradle")) || existsSync25(join37(projectRoot, "build.gradle.kts"))) return "gradle";
  return "unknown";
}

export {
  findProjectRoot,
  initParser,
  parseTypeScriptFile,
  getParserForFile,
  getCacheStats,
  clearCache,
  parseProject,
  findOutputJson,
  loadParsedFilesFromJson,
  detectCrossLanguageEdges,
  buildGraph,
  findSymbols,
  getDependencies,
  getDependents,
  getImpact,
  getCrossFileEdges,
  getFileSummary,
  searchSymbols,
  getAffectedFiles,
  getArchitectureSummary,
  calculateHealthScore,
  getHealthTrend,
  analyzeDeadCode,
  loadMetadata,
  generateDocs,
  SimulationEngine,
  scanSecurity
};

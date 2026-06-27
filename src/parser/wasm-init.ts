// src/parser/wasm-init.ts
import { Parser, Language } from 'web-tree-sitter';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

let initialized = false;
const languages: Map<string, Language> = new Map();

/**
 * Detect whether we're running inside a webpack bundle.
 * Webpack defines __webpack_require__ on the module scope.
 */
function isWebpackBundled(): boolean {
  // @ts-ignore — only exists in webpack bundles
  return typeof __webpack_require__ !== 'undefined';
}

/**
 * Resolve the directory of this file, working in both:
 * - Native ESM (CLI usage): import.meta.url is a real file:// URL
 * - Webpack-bundled (VSCode extension): __dirname is set by webpack
 */
function resolveThisDir(): string {
  // Webpack-bundled context: __dirname points to dist/
  // @ts-ignore — __dirname may not exist in pure ESM but webpack provides it
  if (typeof __dirname !== 'undefined') {
    // @ts-ignore
    return __dirname;
  }

  // Native ESM context: import.meta.url is a real file:// URL
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Initialize web-tree-sitter and load all language grammars.
 * Must be called once before any parsing.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;

  const thisDir = resolveThisDir();

  if (isWebpackBundled()) {
    // In a webpack bundle (VSCode extension), import.meta.url is emulated
    // and may produce invalid file URLs on Windows. Override locateFile
    // to use __dirname which webpack sets to the dist/ output directory.
    await Parser.init({
      locateFile(scriptName: string) {
        return path.join(thisDir, scriptName);
      }
    });
  } else {
    // Native ESM (CLI): let web-tree-sitter resolve its own WASM
    // using its own import.meta.url — this works correctly.
    await Parser.init();
  }

  // Try multiple possible locations for the grammars directory
  let grammarsDir = path.join(thisDir, 'parser', 'grammars');
  if (!existsSync(grammarsDir)) {
    // Might be in a sibling "parser" directory
    grammarsDir = path.join(path.dirname(thisDir), 'parser', 'grammars');
  }
  if (!existsSync(grammarsDir)) {
    // Last resort: same directory as this file
    grammarsDir = path.join(thisDir, 'grammars');
  }

  // Load all language grammars
  const grammarFiles = {
    'typescript': 'tree-sitter-typescript.wasm',
    'tsx': 'tree-sitter-tsx.wasm',
    'javascript': 'tree-sitter-javascript.wasm',
    'python': 'tree-sitter-python.wasm',
    'go': 'tree-sitter-go.wasm',
    'rust': 'tree-sitter-rust.wasm',
    'c': 'tree-sitter-c.wasm',
    'c_sharp': 'tree-sitter-c_sharp.wasm',
    'java': 'tree-sitter-java.wasm',
    'cpp': 'tree-sitter-cpp.wasm',
    'kotlin': 'tree-sitter-kotlin.wasm',
    'php': 'tree-sitter-php.wasm',
    'swift': 'tree-sitter-swift.wasm',
    'ruby': 'tree-sitter-ruby.wasm',
    // Note: Mojo uses a pattern-based parser (no tree-sitter-mojo WASM available)
    // Note: Dart uses a pattern-based parser (no tree-sitter-dart WASM available)
    // Note: R uses a pattern-based parser (tree-sitter-r on npm is a security placeholder, not a real grammar)
  };

  for (const [name, file] of Object.entries(grammarFiles)) {
    const wasmPath = path.join(grammarsDir, file);
    const lang = await Language.load(wasmPath);
    languages.set(name, lang);
  }

  initialized = true;
}

/**
 * Get a parser instance configured for a specific language.
 */
export function getParser(language: 'typescript' | 'tsx' | 'javascript' | 'python' | 'go' | 'rust' | 'c' | 'c_sharp' | 'java' | 'cpp' | 'kotlin' | 'php' | 'swift' | 'ruby'): Parser {
  if (!initialized) {
    throw new Error('Parser not initialized. Call initParser() first.');
  }

  const lang = languages.get(language);
  if (!lang) {
    throw new Error(`Language '${language}' not loaded.`);
  }

  const parser = new Parser();
  parser.setLanguage(lang);
  return parser;
}

/**
 * Check if the parser system has been initialized.
 */
export function isInitialized(): boolean {
  return initialized;
}

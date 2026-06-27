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
 * NOTE: Do NOT use __dirname for this check — vitest/jest also define __dirname.
 */
function isWebpackBundled(): boolean {
  // @ts-ignore — __webpack_require__ only exists in webpack bundles
  return typeof __webpack_require__ !== 'undefined';
}

/**
 * Resolve the directory of this file.
 * - Webpack bundle: __dirname points to dist/
 * - Native ESM / vitest: use import.meta.url
 */
function resolveThisDir(): string {
  if (isWebpackBundled()) {
    // @ts-ignore
    return __dirname;
  }
  // Native ESM: import.meta.url is a real file:// URL.
  // In webpack bundles, this branch is dead code — isWebpackBundled()
  // returns true, so __dirname is used instead.
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Initialize web-tree-sitter and load all language grammars.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;

  if (isWebpackBundled()) {
    // Webpack bundle: override locateFile so web-tree-sitter uses the
    // actual dist/ directory (via __dirname), not import.meta.url which
    // webpack bakes in as the build machine's literal path.
    const dir = resolveThisDir();
    await Parser.init({
      locateFile(scriptName: string) {
        return path.join(dir, scriptName);
      }
    });
  } else {
    // Native ESM (CLI / tests): let web-tree-sitter find its own WASM
    // via its own import.meta.url — works correctly in real Node ESM.
    await Parser.init();
  }

  // Locate grammar WASM files
  const thisDir = resolveThisDir();
  let grammarsDir = path.join(thisDir, 'parser', 'grammars');
  if (!existsSync(grammarsDir)) {
    grammarsDir = path.join(path.dirname(thisDir), 'parser', 'grammars');
  }
  if (!existsSync(grammarsDir)) {
    grammarsDir = path.join(thisDir, 'grammars');
  }

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
  };

  for (const [name, file] of Object.entries(grammarFiles)) {
    const wasmPath = path.join(grammarsDir, file);
    const lang = await Language.load(wasmPath);
    languages.set(name, lang);
  }

  initialized = true;
}

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

export function isInitialized(): boolean {
  return initialized;
}

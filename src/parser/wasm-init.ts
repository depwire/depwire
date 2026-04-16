// src/parser/wasm-init.ts
import { Parser, Language } from 'web-tree-sitter';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

let initialized = false;
const languages: Map<string, Language> = new Map();

/**
 * Initialize web-tree-sitter and load all language grammars.
 * Must be called once before any parsing.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;

  await Parser.init();

  // Resolve the path to the grammars directory
  // This needs to work both in development (src/) and production (dist/)
  // In development: src/parser/wasm-init.ts -> src/parser/grammars/
  // In production:  dist/chunk-xxx.js -> dist/parser/grammars/
  // But since the code is bundled, we need to find where the grammars actually are
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  
  // Try multiple possible locations for the grammars directory
  let grammarsDir = path.join(__dirname, 'parser', 'grammars');
  if (!existsSync(grammarsDir)) {
    // Might be in a sibling "parser" directory
    grammarsDir = path.join(path.dirname(__dirname), 'parser', 'grammars');
  }
  if (!existsSync(grammarsDir)) {
    // Last resort: same directory as this file
    grammarsDir = path.join(__dirname, 'grammars');
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
export function getParser(language: 'typescript' | 'tsx' | 'javascript' | 'python' | 'go' | 'rust' | 'c' | 'c_sharp' | 'java' | 'cpp'): Parser {
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

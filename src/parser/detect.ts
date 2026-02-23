import { extname } from 'path';
import { LanguageParser } from './types.js';
import { typescriptParser } from './typescript.js';
import { pythonParser } from './python.js';
import { javascriptParser } from './javascript.js';
import { goParser } from './go.js';

const parsers: LanguageParser[] = [
  typescriptParser,
  pythonParser,
  javascriptParser,
  goParser,
];

export function getParserForFile(filePath: string): LanguageParser | null {
  const ext = extname(filePath).toLowerCase();
  return parsers.find(p => p.extensions.includes(ext)) || null;
}

export function getSupportedExtensions(): string[] {
  return parsers.flatMap(p => p.extensions);
}

export function getAllParsers(): LanguageParser[] {
  return parsers;
}

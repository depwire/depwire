import { extname, basename } from 'path';
import { LanguageParser } from './types.js';
import { typescriptParser } from './typescript.js';
import { pythonParser } from './python.js';
import { javascriptParser } from './javascript.js';
import { goParser } from './go.js';
import { rustParser } from './rust.js';
import { cParser } from './c.js';
import { csharpParser } from './csharp.js';
import { javaParser } from './java.js';

const parsers: LanguageParser[] = [
  typescriptParser,
  pythonParser,
  javascriptParser,
  goParser,
  rustParser,
  cParser,
  csharpParser,
  javaParser,
];

export function getParserForFile(filePath: string): LanguageParser | null {
  const ext = extname(filePath).toLowerCase();
  const fileName = basename(filePath);
  return parsers.find(p => p.extensions.includes(ext) || p.extensions.includes(fileName)) || null;
}

export function getSupportedExtensions(): string[] {
  return parsers.flatMap(p => p.extensions);
}

export function getAllParsers(): LanguageParser[] {
  return parsers;
}

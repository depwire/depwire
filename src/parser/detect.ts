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
import { cppParser } from './cpp.js';
import { kotlinParser } from './kotlin.js';
import { phpParser } from './php.js';

const parsers: LanguageParser[] = [
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
];

// C++ keywords that distinguish .h files as C++ rather than C
const CPP_KEYWORDS = /\b(?:class|namespace|template|public:|private:|protected:|virtual|nullptr|constexpr|auto\s+\w+\s*=|using\s+\w+\s*=|static_cast|dynamic_cast|reinterpret_cast|const_cast|noexcept|override|final|decltype|concept|requires|co_await|co_yield|co_return|std::)\b/;

export function getParserForFile(filePath: string, content?: string): LanguageParser | null {
  const ext = extname(filePath).toLowerCase();
  const fileName = basename(filePath);

  // Disambiguate .h files: check for C++ keywords
  if (ext === '.h' && content) {
    if (CPP_KEYWORDS.test(content)) {
      return cppParser;
    }
    return cParser;
  }

  // .h without content — default to C parser (backward compatible)
  if (ext === '.h') {
    return cParser;
  }

  return parsers.find(p => p.extensions.includes(ext) || p.extensions.includes(fileName)) || null;
}

export function getSupportedExtensions(): string[] {
  return parsers.flatMap(p => p.extensions);
}

export function getAllParsers(): LanguageParser[] {
  return parsers;
}

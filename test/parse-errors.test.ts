import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

vi.mock('../src/parser/detect.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/parser/detect.js')>();
  return {
    ...original,
    getParserForFile(filePath: string, content?: string) {
      if (filePath.endsWith('unparseable.ts')) {
        return {
          language: 'typescript',
          extensions: ['.ts'],
          parseFile() {
            throw new Error('deliberate parser exception for malformed fixture');
          },
        };
      }
      return original.getParserForFile(filePath, content);
    },
  };
});

import { parseProject } from '../src/parser/index.js';

describe('parseProject errorFiles', () => {
  it('reports parser failures without dropping them from honest totals', async () => {
    const fixtureRoot = resolve(import.meta.dirname, 'fixtures/parse-errors');
    const result = await parseProject(fixtureRoot, { useCache: false });

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('valid.ts');
    expect(result.errorFiles).toEqual([
      {
        path: 'unparseable.ts',
        reason: expect.stringContaining('deliberate parser exception'),
      },
    ]);
    expect(result.length + result.errorFiles.length).toBe(2);
  });
});

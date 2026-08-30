import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

vi.mock('../src/parser/wasm-init.js', () => ({
  initParser: vi.fn().mockRejectedValue(new Error('deliberate grammar load failure')),
}));

import { parseProject } from '../src/parser/index.js';

describe('parseProject grammar initialization failures', () => {
  it('returns every affected file with a reason instead of rejecting silently', async () => {
    const fixtureRoot = resolve(import.meta.dirname, 'fixtures/parse-errors');
    const result = await parseProject(fixtureRoot, { useCache: false });

    expect(result).toHaveLength(0);
    expect(result.errorFiles).toHaveLength(2);
    expect(result.errorFiles.map(error => error.path).sort()).toEqual(['unparseable.ts', 'valid.ts']);
    expect(result.errorFiles.every(error => error.reason.includes('deliberate grammar load failure'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
const fixture = resolve(import.meta.dirname, 'fixtures/reexport-emit');

describe('implicit type re-export emit boundary', () => {
  for (const mode of ['esnext', 'commonjs', 'verbatim'] as const) {
    it(`checks type-only named and default targets under ${mode}`, () => {
      const out = mkdtempSync(join(tmpdir(), 'depwire-implicit-type-'));
      try {
        const result = spawnSync(process.execPath, [tsc, '--module', mode === 'commonjs' ? 'commonjs' : 'esnext',
          '--target', 'es2022', '--skipLibCheck', '--outDir', out,
          ...(mode === 'verbatim' ? ['--verbatimModuleSyntax', 'true'] : []),
          ...['types_only', 'named_implicit_type', 'default_type_target', 'default_implicit_type',
            'x', 'mixed_implicit_type'].map(form => join(fixture, `${form}.ts`))], { encoding: 'utf8' });
        const named = readFileSync(join(out, 'named_implicit_type.js'), 'utf8');
        const defaultType = readFileSync(join(out, 'default_implicit_type.js'), 'utf8');
        const mixed = readFileSync(join(out, 'mixed_implicit_type.js'), 'utf8');
        if (mode === 'verbatim') {
          expect(result.status).not.toBe(0);
          expect(result.stdout).toContain('TS1205');
          expect(named).toContain("from './types_only'");
          expect(defaultType).toContain("from './default_type_target'");
        } else {
          expect(result.status).toBe(0);
          expect(named).not.toContain('types_only');
          expect(defaultType).not.toContain('default_type_target');
        }
        expect(mixed).toMatch(mode === 'commonjs' ? /require\("\.\/x"\)/ : /from '\.\/x'/);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    });
  }
});

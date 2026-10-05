import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
const fixture = resolve(import.meta.dirname, 'fixtures/reexport-emit');
const forms = ['star', 'namespace', 'named', 'inline_type_only', 'mixed',
  'keyword_type_only', 'keyword_type_star', 'keyword_type_namespace', 'default', 'side_effect'] as const;
const expected = {
  esnext: {
    star: "export * from './x';", namespace: "export * as ns from './x';",
    named: "export { a } from './x';", inline_type_only: 'export {};',
    mixed: "export { a } from './x';", keyword_type_only: 'export {};',
    keyword_type_star: 'export {};', keyword_type_namespace: 'export {};',
    default: "export { default } from './x';", side_effect: "import './x';",
  },
  commonjs: {
    star: '__exportStar(require("./x"), exports);', namespace: 'exports.ns = require("./x");',
    named: 'require("./x")', inline_type_only: 'no-target-load',
    mixed: 'require("./x")', keyword_type_only: 'no-target-load',
    keyword_type_star: 'no-target-load', keyword_type_namespace: 'no-target-load',
    default: 'require("./x")', side_effect: 'require("./x");',
  },
  verbatim: {
    star: "export * from './x';", namespace: "export * as ns from './x';",
    named: "export { a } from './x';", inline_type_only: "export {} from './x';",
    mixed: "export { a } from './x';", keyword_type_only: 'export {};',
    keyword_type_star: 'export {};', keyword_type_namespace: 'export {};',
    default: "export { default } from './x';", side_effect: "import './x';",
  },
};

function compile(mode: keyof typeof expected): Record<string, string> {
  const out = mkdtempSync(join(tmpdir(), `depwire-reexport-${mode}-`));
  try {
    const inputs = [...forms, 'x'].map(file => join(fixture, `${file}.ts`));
    execFileSync(process.execPath, [tsc, '--module', mode === 'commonjs' ? 'commonjs' : 'esnext',
      '--target', 'es2022', '--skipLibCheck', '--outDir', out,
      ...(mode === 'verbatim' ? ['--verbatimModuleSyntax', 'true'] : []), ...inputs],
    { encoding: 'utf8' });
    return Object.fromEntries(forms.map(form => [form, readFileSync(join(out, `${form}.js`), 'utf8')]));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe('TypeScript compiler module-load oracle', () => {
  for (const mode of ['esnext', 'commonjs', 'verbatim'] as const) {
    it(`records the actual tsc emit for all eight forms under ${mode}`, () => {
      const output = compile(mode);
      for (const form of forms) {
        const marker = expected[mode][form];
        if (marker === 'no-target-load') expect(output[form], form).not.toContain('require("./x")');
        else expect(output[form], form).toContain(marker);
      }
    });
  }
});

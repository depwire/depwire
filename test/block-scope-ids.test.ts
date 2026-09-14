import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { parseTypeScriptFile } from '../src/parser/typescript.js';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/block-scope-ids');

describe('lexical block-scoped symbol ids', () => {
  it.each(['scopes.ts', 'scopes.js'])('splits sibling declarations and retargets each call in %s', async (filePath) => {
    const parsed = await parseProject(fixtureDir, { useCache: false });
    const file = parsed.find((entry) => entry.filePath === filePath)!;
    const values = file.symbols.filter((symbol) => symbol.name === 'value');

    expect(values.map((symbol) => symbol.id)).toEqual([
      `${filePath}::choose.$b0.value`,
      `${filePath}::choose.$b1.value`,
      `${filePath}::choose.$b2.$b0.value`,
    ]);

    const callsByLine = file.edges
      .filter((edge) => edge.kind === 'calls' && edge.target.endsWith('.value'))
      .map((edge) => [edge.line, edge.target]);
    expect(callsByLine).toEqual([
      [4, `${filePath}::choose.$b0.value`],
      [9, `${filePath}::choose.$b1.value`],
      [14, `${filePath}::choose.$b2.$b0.value`],
    ]);
  });

  it('is deterministic and ignores unrelated non-block statements', async () => {
    const source = `export function run(flag: boolean) {
  if (flag) { const result = 1; }
  if (!flag) { const result = 2; }
}`;
    const first = parseTypeScriptFile('stable.ts', source, fixtureDir);
    const second = parseTypeScriptFile('stable.ts', source, fixtureDir);
    const withUnrelatedStatement = parseTypeScriptFile(
      'stable.ts',
      source.replace('{\n', '{\n  console.log(flag);\n'),
      fixtureDir,
    );
    const ids = (file: typeof first) => file.symbols.map((symbol) => symbol.id);

    expect(ids(second)).toEqual(ids(first));
    expect(ids(withUnrelatedStatement)).toEqual(ids(first));
    expect(ids(first).filter((id) => id.endsWith('.result'))).toEqual([
      'stable.ts::run.$b0.result',
      'stable.ts::run.$b1.result',
    ]);
  });
});

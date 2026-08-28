import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { resolveSuperCalls } from '../src/parser/super-calls.js';
import { buildGraph } from '../src/graph/index.js';
import { exportToJSON, importFromJSON } from '../src/graph/serializer.js';
import { getImpact } from '../src/graph/queries.js';
import type { EdgeKind, ParsedFile } from '../src/parser/types.js';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/member-call-resolution');

describe('inheritance edge kind compatibility', () => {
  it('emits inherits and loads a current-main extends payload without changing impact or resolved super calls', async () => {
    const parsed = await parseProject(fixtureDir, { useCache: false });
    const freshGraph = buildGraph(parsed);
    const freshPayload = exportToJSON(freshGraph, fixtureDir);

    expect(freshPayload.edges.filter((edge) => edge.kind === 'inherits')).not.toHaveLength(0);
    expect(freshPayload.edges.filter((edge) => edge.kind === 'extends')).toHaveLength(0);

    // Current main wrote the same graph with `extends`. Preserve that payload
    // verbatim on load: compatibility belongs in consumers, not serialization.
    const currentMainPayload = structuredClone(freshPayload);
    for (const edge of currentMainPayload.edges) {
      if (edge.kind === 'inherits') edge.kind = 'extends';
    }
    const loadedOldGraph = importFromJSON(currentMainPayload);

    expect(getImpact(loadedOldGraph, 'sample.ts::Base.helper'))
      .toEqual(getImpact(freshGraph, 'sample.ts::Base.helper'));
    expect(loadedOldGraph.hasEdge('sample.ts::Derived.other', 'sample.ts::Base.helper')).toBe(true);
    expect(freshGraph.hasEdge('sample.ts::Derived.other', 'sample.ts::Base.helper')).toBe(true);
    expect(exportToJSON(loadedOldGraph, fixtureDir).edges)
      .toContainEqual(expect.objectContaining({ kind: 'extends' }));
  });

  it.each(['inherits', 'extends'] satisfies EdgeKind[])(
    'resolves buffered super calls through %s inheritance edges',
    (inheritanceKind) => {
      const parsed: ParsedFile = {
        filePath: 'sample.ts',
        symbols: [
          { id: 'sample.ts::Base', name: 'Base', kind: 'class', filePath: 'sample.ts', startLine: 1, endLine: 3, exported: true },
          { id: 'sample.ts::Base.helper', name: 'helper', kind: 'method', filePath: 'sample.ts', startLine: 2, endLine: 2, exported: false },
          { id: 'sample.ts::Derived', name: 'Derived', kind: 'class', filePath: 'sample.ts', startLine: 4, endLine: 7, exported: true },
          { id: 'sample.ts::Derived.run', name: 'run', kind: 'method', filePath: 'sample.ts', startLine: 5, endLine: 6, exported: false },
        ],
        edges: [{ source: 'sample.ts::Derived', target: 'sample.ts::Base', kind: inheritanceKind, filePath: 'sample.ts', line: 4 }],
        pendingSuperCalls: [{ source: 'sample.ts::Derived.run', declaringClass: 'sample.ts::Derived', methodName: 'helper', line: 6 }],
      };

      expect(resolveSuperCalls([parsed])).toEqual({ resolved: 1, unresolved: 0 });
      expect(parsed.edges).toContainEqual(expect.objectContaining({
        kind: 'calls',
        source: 'sample.ts::Derived.run',
        target: 'sample.ts::Base.helper',
      }));
    },
  );
});

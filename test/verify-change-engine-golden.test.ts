import { expect, it, vi } from 'vitest';
// Graphology seeds its global instance IDs from a random byte. The pre-edit
// capture used random byte 254 (second fixture's cloned graph ID is geid_256).
// Fix that seed BEFORE importing Graphology; no output fields are stripped.
vi.hoisted(() => { vi.spyOn(Math, 'random').mockReturnValue(254 / 256); });
import { readFileSync } from 'node:fs';
import { SimulationEngine } from '../src/simulation/engine.js';
import { simulationActions, simulationFixture } from './verify-change-simulation-fixture.js';
it('default simulation output is byte-identical to pre-edit 8b654da golden', () => {
  // Captured before engine.ts was edited, when git diff 8b654da --
  // src/simulation/engine.ts was empty, using the same six fixtures.
  const golden: string[] = JSON.parse(readFileSync(new URL('./fixtures/verify-change-engine-8b654da.json', import.meta.url), 'utf8'));
  const actual = simulationActions.map(action => JSON.stringify(new SimulationEngine(simulationFixture()).simulate(action)));
  expect(actual).toEqual(golden);
  vi.restoreAllMocks();
});

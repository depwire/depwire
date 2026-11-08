/**
 * verify_change — MCP tool wrapper.
 * Delegates to the shared core logic in src/core/verify-change.ts.
 */

import { parseVerifyProject } from '../../core/verify-change-project.js';
import type { DepwireState } from '../state.js';
import { verifyChange, verifyChangeError, type VerifyChangeInput, type VerifyChangeOutput } from '../../core/verify-change.js';

export type { VerifyChangeInput, VerifyChangeOutput };

export async function handleVerifyChange(
  args: VerifyChangeInput,
  state: DepwireState
): Promise<VerifyChangeOutput> {
  try {
    if (!state.graph || !state.projectRoot) return verifyChangeError('MCP project', 'No project loaded; use connect_repo first');
    const { sourceCoverage, unparsedFiles } = await parseVerifyProject(state.projectRoot);
    return await verifyChange(args, { graph: state.graph, projectRoot: state.projectRoot, sourceCoverage, unparsedFiles });
  } catch (error) { return verifyChangeError('MCP verify_change', error); }
}

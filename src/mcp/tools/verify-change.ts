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
    const { parsed, sourceCoverage, unparsedFiles, skippedFiles } = await parseVerifyProject(state.projectRoot, { exclude: args.exclude });
    return await verifyChange(args, { graph: state.graph, projectRoot: state.projectRoot, sourceCoverage, unparsedFiles, parsedFiles: parsed, skippedFiles });
  } catch (error) { return verifyChangeError('MCP verify_change', error); }
}

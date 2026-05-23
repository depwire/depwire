/**
 * verify_change — MCP tool wrapper.
 * Delegates to the shared core logic in src/core/verify-change.ts.
 */

import type { DepwireState } from '../state.js';
import { verifyChange, type VerifyChangeInput, type VerifyChangeOutput } from '../../core/verify-change.js';

export type { VerifyChangeInput, VerifyChangeOutput };

export async function handleVerifyChange(
  args: VerifyChangeInput,
  state: DepwireState
): Promise<VerifyChangeOutput> {
  return verifyChange(args, {
    graph: state.graph!,
    projectRoot: state.projectRoot!,
  });
}

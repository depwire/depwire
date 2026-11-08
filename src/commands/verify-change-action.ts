import { verifyChangeError } from '../core/verify-change.js';
import { renderVerifyChange, verifyChangeCommand, type VerifyChangeOptions } from './verify-change.js';

/** Commander boundary: recon/VERIFY-CHANGE-VERDICT-CONTRACT.md §5.
 * Preserve command rejections; normalize only at the CLI transport boundary. */
export async function runVerifyChangeAction(directory: string | undefined, options: VerifyChangeOptions): Promise<void> {
  try { await verifyChangeCommand(directory || '.', options); }
  catch (error) {
    renderVerifyChange(verifyChangeError('CLI input/project analysis', error), options);
    process.exit(1);
  }
}

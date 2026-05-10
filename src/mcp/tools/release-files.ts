/**
 * release_files — Release a previously made file claim.
 * Appends a release event to claims.jsonl (append-only).
 */

import { existsSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import type { DepwireState } from '../state.js';

interface ReleaseFilesInput {
  claim_id: string;
  session_id: string;
}

interface ReleaseFilesOutput {
  success: boolean;
  released_files: string[];
  error?: string;
}

interface ClaimRecord {
  claim_id: string;
  session_id: string;
  file_paths: string[];
  reason?: string;
  claimed_at: string;
  expires_at: string;
  released: boolean;
}

export function handleReleaseFiles(
  args: ReleaseFilesInput,
  state: DepwireState
): ReleaseFilesOutput {
  const projectRoot = state.projectRoot!;
  const claimsFile = join(projectRoot, '.depwire', 'claims.jsonl');
  
  if (!existsSync(claimsFile)) {
    return { success: false, released_files: [], error: 'Claim not found' };
  }
  
  const content = readFileSync(claimsFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  // Find the claim (latest state)
  let foundClaim: ClaimRecord | null = null;
  for (const line of lines) {
    try {
      const record: ClaimRecord = JSON.parse(line);
      if (record.claim_id === args.claim_id) {
        foundClaim = record;
      }
    } catch {
      // Skip malformed lines
    }
  }
  
  if (!foundClaim) {
    return { success: false, released_files: [], error: 'Claim not found' };
  }
  
  if (foundClaim.session_id !== args.session_id) {
    return { success: false, released_files: [], error: 'Session ID does not match the original claim' };
  }
  
  if (foundClaim.released) {
    return { success: false, released_files: [], error: 'Claim already released' };
  }
  
  // Append release event
  const releaseRecord: ClaimRecord = {
    ...foundClaim,
    released: true,
  };
  
  appendFileSync(claimsFile, JSON.stringify(releaseRecord) + '\n');
  
  return {
    success: true,
    released_files: foundClaim.file_paths,
  };
}

/**
 * get_active_claims — Query who is currently working on what.
 * Reads .depwire/claims.jsonl and returns active (non-released, non-expired) claims.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DepwireState } from '../state.js';

interface GetActiveClaimsInput {
  filter_by_session?: string;
  filter_by_file?: string;
  include_expired?: boolean;
}

interface ActiveClaim {
  claim_id: string;
  session_id: string;
  file_paths: string[];
  reason?: string;
  claimed_at: string;
  expires_at: string;
  is_expired: boolean;
}

interface GetActiveClaimsOutput {
  active_claims: ActiveClaim[];
  total: number;
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

export function handleGetActiveClaims(
  args: GetActiveClaimsInput,
  state: DepwireState
): GetActiveClaimsOutput {
  const projectRoot = state.projectRoot!;
  const claimsFile = join(projectRoot, '.depwire', 'claims.jsonl');
  
  if (!existsSync(claimsFile)) {
    return { active_claims: [], total: 0 };
  }
  
  const content = readFileSync(claimsFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  // Build map of claim_id -> latest state
  const claimMap = new Map<string, ClaimRecord>();
  for (const line of lines) {
    try {
      const record: ClaimRecord = JSON.parse(line);
      claimMap.set(record.claim_id, record);
    } catch {
      // Skip malformed lines
    }
  }
  
  const now = new Date();
  let claims: ActiveClaim[] = [];
  
  for (const record of claimMap.values()) {
    // Skip released
    if (record.released) continue;
    
    const isExpired = new Date(record.expires_at) <= now;
    
    // Skip expired unless include_expired
    if (isExpired && !args.include_expired) continue;
    
    // Apply filters
    if (args.filter_by_session && record.session_id !== args.filter_by_session) continue;
    if (args.filter_by_file && !record.file_paths.includes(args.filter_by_file)) continue;
    
    claims.push({
      claim_id: record.claim_id,
      session_id: record.session_id,
      file_paths: record.file_paths,
      reason: record.reason,
      claimed_at: record.claimed_at,
      expires_at: record.expires_at,
      is_expired: isExpired,
    });
  }
  
  return { active_claims: claims, total: claims.length };
}

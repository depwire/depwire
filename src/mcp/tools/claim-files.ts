/**
 * claim_files — Multi-agent coordination tool.
 * An MCP client declares intent to modify files so other clients
 * can see the claim and avoid conflicts.
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { DepwireState } from '../state.js';

interface ClaimFilesInput {
  session_id: string;
  file_paths: string[];
  reason?: string;
  ttl_minutes?: number;
  depwire_action_token?: string;
}

interface ClaimConflict {
  file: string;
  claimed_by_session: string;
  claimed_at: string;
  expires_at: string;
  reason?: string;
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

interface ClaimFilesOutput {
  success: boolean;
  claim_id: string;
  claimed_files: string[];
  conflicts: ClaimConflict[];
  expires_at: string;
}

function ensureDepwireDir(projectRoot: string): string {
  const dir = join(projectRoot, '.depwire');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getClaimsFilePath(projectRoot: string): string {
  const dir = ensureDepwireDir(projectRoot);
  return join(dir, 'claims.jsonl');
}

function readClaims(filePath: string): ClaimRecord[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const records: ClaimRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }
  return records;
}

function getActiveClaims(records: ClaimRecord[], now: Date): ClaimRecord[] {
  // Build a map of claim_id -> latest state
  const claimMap = new Map<string, ClaimRecord>();
  for (const record of records) {
    claimMap.set(record.claim_id, record);
  }
  
  // Filter: not released, not expired
  return Array.from(claimMap.values()).filter(claim => {
    if (claim.released) return false;
    if (new Date(claim.expires_at) <= now) return false;
    return true;
  });
}

export function handleClaimFiles(
  args: ClaimFilesInput,
  state: DepwireState
): ClaimFilesOutput {
  const projectRoot = state.projectRoot!;
  const claimsFile = getClaimsFilePath(projectRoot);
  const now = new Date();
  
  // Validate TTL
  const ttlMinutes = Math.min(Math.max(args.ttl_minutes || 30, 1), 240);
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  
  // Read existing claims
  const allRecords = readClaims(claimsFile);
  const activeClaims = getActiveClaims(allRecords, now);
  
  // Check for conflicts
  const conflicts: ClaimConflict[] = [];
  for (const filePath of args.file_paths) {
    for (const claim of activeClaims) {
      if (claim.session_id === args.session_id) continue; // Same session can re-claim
      if (claim.file_paths.includes(filePath)) {
        conflicts.push({
          file: filePath,
          claimed_by_session: claim.session_id,
          claimed_at: claim.claimed_at,
          expires_at: claim.expires_at,
          reason: claim.reason,
        });
      }
    }
  }
  
  if (conflicts.length > 0) {
    return {
      success: false,
      claim_id: '',
      claimed_files: [],
      conflicts,
      expires_at: '',
    };
  }
  
  // Create claim
  const claimId = randomUUID();
  const record: ClaimRecord = {
    claim_id: claimId,
    session_id: args.session_id,
    file_paths: args.file_paths,
    reason: args.reason,
    claimed_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    released: false,
  };
  
  // Append to file
  appendFileSync(claimsFile, JSON.stringify(record) + '\n');
  
  return {
    success: true,
    claim_id: claimId,
    claimed_files: args.file_paths,
    conflicts: [],
    expires_at: expiresAt.toISOString(),
  };
}

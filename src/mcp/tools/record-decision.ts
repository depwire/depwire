/**
 * record_decision — Save a structured decision for future reference.
 * Appends to .depwire/decisions.jsonl (append-only).
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { DepwireState } from '../state.js';

interface RecordDecisionInput {
  session_id: string;
  context: string;
  options_considered: string[];
  decision: string;
  reasoning: string;
  files_affected?: string[];
  tags?: string[];
  agent_identity_token?: string;
}

interface RecordDecisionOutput {
  success: boolean;
  decision_id: string;
  recorded_at: string;
}

function ensureDepwireDir(projectRoot: string): string {
  const dir = join(projectRoot, '.depwire');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function handleRecordDecision(
  args: RecordDecisionInput,
  state: DepwireState
): RecordDecisionOutput {
  const projectRoot = state.projectRoot!;
  const dir = ensureDepwireDir(projectRoot);
  const decisionsFile = join(dir, 'decisions.jsonl');
  
  const decisionId = randomUUID();
  const now = new Date().toISOString();
  
  const record = {
    decision_id: decisionId,
    session_id: args.session_id,
    timestamp: now,
    context: args.context,
    options_considered: args.options_considered,
    decision: args.decision,
    reasoning: args.reasoning,
    files_affected: args.files_affected || [],
    tags: args.tags || [],
  };
  
  appendFileSync(decisionsFile, JSON.stringify(record) + '\n');
  
  return {
    success: true,
    decision_id: decisionId,
    recorded_at: now,
  };
}

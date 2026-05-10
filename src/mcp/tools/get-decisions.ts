/**
 * get_decisions — Retrieve past decisions matching a query.
 * Reads .depwire/decisions.jsonl and applies filters.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DepwireState } from '../state.js';

interface GetDecisionsInput {
  query?: string;
  filter_by_session?: string;
  filter_by_file?: string;
  filter_by_tag?: string;
  limit?: number;
  since?: string;
}

interface DecisionRecord {
  decision_id: string;
  session_id: string;
  timestamp: string;
  context: string;
  options_considered: string[];
  decision: string;
  reasoning: string;
  files_affected: string[];
  tags: string[];
}

interface GetDecisionsOutput {
  decisions: DecisionRecord[];
  total_matched: number;
  returned: number;
}

export function handleGetDecisions(
  args: GetDecisionsInput,
  state: DepwireState
): GetDecisionsOutput {
  const projectRoot = state.projectRoot!;
  const decisionsFile = join(projectRoot, '.depwire', 'decisions.jsonl');
  
  if (!existsSync(decisionsFile)) {
    return { decisions: [], total_matched: 0, returned: 0 };
  }
  
  const content = readFileSync(decisionsFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  let records: DecisionRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }
  
  // Apply filters
  if (args.filter_by_session) {
    records = records.filter(r => r.session_id === args.filter_by_session);
  }
  
  if (args.filter_by_file) {
    records = records.filter(r => r.files_affected.includes(args.filter_by_file!));
  }
  
  if (args.filter_by_tag) {
    records = records.filter(r => r.tags.includes(args.filter_by_tag!));
  }
  
  if (args.since) {
    const sinceDate = new Date(args.since);
    records = records.filter(r => new Date(r.timestamp) >= sinceDate);
  }
  
  if (args.query) {
    const q = args.query.toLowerCase();
    records = records.filter(r => {
      const searchText = `${r.context} ${r.decision} ${r.reasoning}`.toLowerCase();
      return searchText.includes(q);
    });
  }
  
  // Sort by timestamp descending
  records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  const totalMatched = records.length;
  const limit = Math.min(Math.max(args.limit || 20, 1), 100);
  const returned = records.slice(0, limit);
  
  return {
    decisions: returned,
    total_matched: totalMatched,
    returned: returned.length,
  };
}

// Wire types matching crates/gitfix/src/mcp/server.rs.

export interface UnresolvedConflict {
  conflict_id: string;
  file: string;
  kind: string;
  ours_oid: string;
  theirs_oid: string;
  base_oid: string;
  target_oid: string;
  ours_source: string;
  theirs_source: string;
}

// Fix #7: widen the union to cover all values the gfix server can emit.
// Previously only 'mergiraf' | 'text' | 'rerere' were typed; the server can
// return 'ours', 'theirs', 'take-target', 'manual', and 'ai-suggestion' as
// well. Existing `if (entry.via === 'rerere')` guards remain correct.
export type ResolvedVia =
  | 'mergiraf'
  | 'text'
  | 'rerere'
  | 'ours'
  | 'theirs'
  | 'take-target'
  | 'manual'
  | 'ai-suggestion';

export interface ResolvedEntry {
  file: string;
  via: ResolvedVia;
  ours_oid: string;
  theirs_oid: string;
  base_oid: string;
  target_oid: string;
  ours_source: string;
  theirs_source: string;
}

export interface MergePlan {
  merge_id: string;
  target_branch: string;
  sources: string[];
  resolved: ResolvedEntry[];
  unresolved: UnresolvedConflict[];
}

export type MergePreviewResponse = MergePlan;

export interface DecisionLogEntry {
  conflict_id: string;
  file: string;
  kind: string;
  actor: string;
  at: string;
}

export interface MergeStatusResponse {
  plan: MergePlan;
  decisions: DecisionLogEntry[];
}

export interface ConflictSide {
  content?: string;
  oid: string;
  content_encoding_error?: string;
  source?: string;
  exists?: boolean;
}

export interface AiSuggestion {
  proposed: string;
  confidence: number;
  rationale: string;
  model: string;
  source: string;
  generated_at: string;
}

export interface ConflictGetResponse {
  merge_id: string;
  conflict_id: string;
  was_resolved: boolean;
  file: string;
  kind: string;
  ours: ConflictSide;
  theirs: ConflictSide;
  base: ConflictSide;
  target: ConflictSide;
  ai_suggestion: AiSuggestion | null;
  ai_suggestion_unavailable_reason?: string;
}

export type ResolutionDecision =
  | { kind: 'ours' }
  | { kind: 'theirs' }
  | { kind: 'take-target' }
  | { kind: 'mergiraf' }
  | { kind: 'ai-suggestion' }
  | { kind: 'manual'; text: string };

export interface ConflictResolveResponse {
  merge_id: string;
  conflict_id: string;
  resolved: boolean;
  via: string;
  remaining_unresolved: number;
}

export interface AuditMetadata {
  merge_id: string;
  target_branch: string;
  sources: string[];
  strategy: string;
  substrate: string;
  started_at: string;
  applied_at?: string;
  commit_oid?: string;
}

export interface AuditEnvelope {
  metadata: AuditMetadata;
  plan: MergePlan;
  decisions: DecisionLogEntry[];
}

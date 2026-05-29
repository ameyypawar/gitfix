/**
 * Shared helpers for constructing AuditEnvelope values from MergeStatusResponse data.
 */

import type { AuditEnvelope, MergeStatusResponse } from './types';

/**
 * Build an AuditEnvelope from a gfix_merge_status response.
 *
 * Fields not yet emitted by the MCP server (applied_at, commit_oid) are left
 * undefined so callers degrade gracefully when the server is older.
 */
export function envelopeFromStatus(status: MergeStatusResponse): AuditEnvelope {
  return {
    metadata: {
      merge_id: status.plan.merge_id,
      target_branch: status.plan.target_branch,
      sources: status.plan.sources,
      strategy: 'gitfix',
      substrate: 'libgit2',
      started_at: status.decisions[0]?.at ?? new Date().toISOString(),
    },
    plan: status.plan,
    decisions: status.decisions,
  };
}

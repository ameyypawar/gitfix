import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import { AuditPanel } from '../ui/audit-webview';
import type { AuditEnvelope } from '../mcp/types';

export function registerAuditRefCommand(
  getClient: () => GfixMcpClient | undefined,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.showAuditRef', async () => {
      const client = getClient();
      const state = getState();
      if (!client || !state.hasMerge || !state.repoPath || !tree.mergeId) {
        vscode.window.showInformationMessage('gitfix: no active merge.');
        return;
      }
      const status = await client.mergeStatus({
        repo_path: state.repoPath,
        merge_id: tree.mergeId,
      });
      // Compose audit envelope from merge_status data.
      // Fields that gfix_merge_status does not yet expose (applied_at, commit_oid)
      // are left undefined so the Webview degrades gracefully.
      const audit: AuditEnvelope = {
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
      AuditPanel.showOrUpdate(audit, context);
    }),
  ];
}

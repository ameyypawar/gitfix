import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import { AuditPanel } from '../ui/audit-webview';
import { AuditListPanel } from '../ui/audit-list-webview';
import { envelopeFromStatus } from '../mcp/audit-utils';
import { MergeRootItem } from '../ui/conflict-item';

export function registerAuditRefCommand(
  getClient: () => GfixMcpClient | undefined,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.showAuditRef', async (item?: MergeRootItem) => {
      const client = getClient();
      const state = getState();
      const repoPath = item?.repoPath ?? state.repoPath;
      const mergeId = (repoPath ? tree.mergeIdForRepo(repoPath) : undefined)
        ?? item?.plan?.merge_id
        ?? tree.mergeId;
      if (!client || !repoPath || !mergeId) {
        vscode.window.showInformationMessage(vscode.l10n.t('gitfix: no active merge.'));
        return;
      }
      const status = await client.mergeStatus({
        repo_path: repoPath,
        merge_id: mergeId,
      });
      AuditPanel.showOrUpdate(envelopeFromStatus(status), context);
    }),

    vscode.commands.registerCommand('gitfix.listAuditRefs', async () => {
      const client = getClient();
      if (!client) {
        vscode.window.showErrorMessage(
          vscode.l10n.t('gitfix: MCP server not available. Install gfix or set gitfix.gfixPath.'),
        );
        return;
      }
      // Resolve repo path — works even when no merge is active.
      const state = getState();
      const repoPath = state.repoPath ?? tree.currentRepoPath;
      if (!repoPath) {
        vscode.window.showWarningMessage(vscode.l10n.t('gitfix: no workspace folder detected.'));
        return;
      }
      await AuditListPanel.showForRepo(repoPath, client, context);
    }),
  ];
}

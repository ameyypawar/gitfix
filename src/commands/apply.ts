import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import { readSettings } from '../config/strategy-settings';
import { log } from '../log';

export function registerApplyCommand(
  getClient: () => GfixMcpClient | undefined,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.applyMerge', async () => {
      const client = getClient();
      const state = getState();
      if (!client || !state.repoPath || !tree.mergeId) {
        vscode.window.showWarningMessage(vscode.l10n.t('gitfix: no active merge.'));
        return;
      }
      const plan = tree.currentPlan;
      if (plan && plan.unresolved.length > 0) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('gitfix: {0} unresolved conflict(s). Resolve them before applying.', plan.unresolved.length),
        );
        return;
      }
      const targetBranch = plan?.target_branch ?? '';
      // Read protected branches from settings (per-repo TOML override applied).
      const settings = readSettings(state.repoPath);
      const needsConfirm = settings.protectedBranches.includes(targetBranch);
      if (needsConfirm) {
        const choice = await vscode.window.showWarningMessage(
          vscode.l10n.t("Apply merge to protected branch '{0}'?", targetBranch),
          { modal: true, detail: vscode.l10n.t('This will create a merge commit on {0}.', targetBranch) },
          'Apply',
        );
        if (choice !== 'Apply') return;
      }
      try {
        const result = await client.mergeApply({
          repo_path: state.repoPath,
          merge_id: tree.mergeId,
          auto_approve: needsConfirm, // server requires this for main
        });
        vscode.window.showInformationMessage(
          vscode.l10n.t('gitfix: merge applied as {0}', result.commit_oid.slice(0, 12)),
        );
        await tree.refresh(state.repoPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`merge_apply failed: ${msg}`);
        vscode.window.showErrorMessage(`gitfix: ${msg}`);
      }
    }),
  ];
}

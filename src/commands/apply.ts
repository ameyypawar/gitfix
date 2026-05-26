import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import { log } from '../log';

const PROTECTED = new Set(['main', 'master', 'develop', 'release']);

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
        vscode.window.showWarningMessage('gitfix: no active merge.');
        return;
      }
      const plan = tree.currentPlan;
      if (plan && plan.unresolved.length > 0) {
        vscode.window.showWarningMessage(
          `gitfix: ${plan.unresolved.length} unresolved conflict(s). Resolve them before applying.`,
        );
        return;
      }
      const targetBranch = plan?.target_branch ?? '';
      const needsConfirm = PROTECTED.has(targetBranch);
      if (needsConfirm) {
        const choice = await vscode.window.showWarningMessage(
          `Apply merge to protected branch '${targetBranch}'?`,
          { modal: true, detail: 'This will create a merge commit on ' + targetBranch + '.' },
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
          `gitfix: merge applied as ${result.commit_oid.slice(0, 12)}`,
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

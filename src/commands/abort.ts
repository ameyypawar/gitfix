import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import type { MultiRepoState } from '../workspace/multi-folder';
import { resolveTargetRepo } from '../workspace/multi-folder';
import { log } from '../log';

export function registerAbortCommand(
  getClient: () => GfixMcpClient | undefined,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
  getMultiState?: () => MultiRepoState,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.abortMerge', async () => {
      const client = getClient();
      if (!client) {
        vscode.window.showWarningMessage(vscode.l10n.t('gitfix: no active merge.'));
        return;
      }

      // Multi-repo: resolve which repo this command targets.
      let repoPath: string | undefined;
      let mergeId: string | undefined;
      if (getMultiState) {
        const multi = getMultiState();
        repoPath = resolveTargetRepo(multi, vscode.window.activeTextEditor?.document.uri);
        if (!repoPath && multi.active.size > 1) {
          const picked = await vscode.window.showQuickPick(
            [...multi.active.keys()].map((p) => ({ label: p, repoPath: p })),
            { placeHolder: vscode.l10n.t('Multiple active merges — select the repo to abort') },
          );
          repoPath = picked?.repoPath;
        }
        if (repoPath) mergeId = tree.mergeIdForRepo(repoPath);
      }
      // Legacy fallback
      if (!repoPath || !mergeId) {
        const state = getState();
        repoPath = state.repoPath;
        mergeId = tree.mergeId;
      }

      if (!repoPath || !mergeId) {
        vscode.window.showWarningMessage(vscode.l10n.t('gitfix: no active merge.'));
        return;
      }

      const abortLbl = vscode.l10n.t('Abort');
      const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t('Discard all merge progress?'),
        // eslint-disable-next-line max-len
        { modal: true, detail: vscode.l10n.t('This cannot be undone.') },
        abortLbl,
      );
      if (choice !== abortLbl) return;
      try {
        await client.mergeAbort({
          repo_path: repoPath,
          merge_id: mergeId,
        });
        vscode.window.showInformationMessage(vscode.l10n.t('gitfix: merge aborted.'));
        await tree.refresh(repoPath);
      } catch (err) {
        log(`merge_abort failed: ${err instanceof Error ? err.message : String(err)}`);
        vscode.window.showErrorMessage(vscode.l10n.t('gitfix: {0}', err instanceof Error ? err.message : String(err)));
      }
    }),
  ];
}

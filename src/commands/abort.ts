import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import { log } from '../log';

export function registerAbortCommand(
  getClient: () => GfixMcpClient | undefined,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.abortMerge', async () => {
      const client = getClient();
      const state = getState();
      if (!client || !state.repoPath || !tree.mergeId) {
        vscode.window.showWarningMessage('gitfix: no active merge.');
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        'Discard all merge progress?',
        { modal: true, detail: 'This cannot be undone.' },
        'Abort',
      );
      if (choice !== 'Abort') return;
      try {
        await client.mergeAbort({
          repo_path: state.repoPath,
          merge_id: tree.mergeId,
        });
        vscode.window.showInformationMessage('gitfix: merge aborted.');
        await tree.refresh(state.repoPath);
      } catch (err) {
        log(`merge_abort failed: ${err instanceof Error ? err.message : String(err)}`);
        vscode.window.showErrorMessage(`gitfix: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  ];
}

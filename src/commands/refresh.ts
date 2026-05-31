import * as vscode from 'vscode';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MultiRepoState } from '../workspace/multi-folder';

export function registerRefreshCommand(
  tree: ConflictTreeProvider,
  getMultiState: () => MultiRepoState,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.refresh', async () => {
      const multi = getMultiState();
      if (multi.anyActive) {
        await tree.refreshAll(multi);
      } else {
        tree.clear();
      }
    }),
  ];
}

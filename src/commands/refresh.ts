import * as vscode from 'vscode';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';

export function registerRefreshCommand(
  tree: ConflictTreeProvider,
  getState: () => MergeState,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.refresh', async () => {
      const state = getState();
      if (state.hasMerge && state.repoPath) {
        await tree.refresh(state.repoPath);
      } else {
        tree.clear();
      }
    }),
  ];
}

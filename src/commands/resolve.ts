import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import { ConflictItem } from '../ui/conflict-item';
import type { MergeState } from '../git/detect';
import type { ResolutionDecision } from '../mcp/types';
import { log } from '../log';

export function registerResolveCommands(
  client: GfixMcpClient,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      'gitfix.openFile',
      async (item?: ConflictItem) => {
        const target = item ?? pickFirst(tree);
        if (!target) return;
        const uri = vscode.Uri.file(`${target.repoPath}/${target.conflict.file}`);
        await vscode.window.showTextDocument(uri);
      },
    ),
    vscode.commands.registerCommand(
      'gitfix.resolveOurs',
      (item?: ConflictItem) => resolve(client, tree, getState, item, { kind: 'ours' }),
    ),
    vscode.commands.registerCommand(
      'gitfix.resolveTheirs',
      (item?: ConflictItem) =>
        resolve(client, tree, getState, item, { kind: 'theirs' }),
    ),
    vscode.commands.registerCommand(
      'gitfix.resolveMergiraf',
      (item?: ConflictItem) =>
        resolve(client, tree, getState, item, { kind: 'mergiraf' }),
    ),
  ];
}

function pickFirst(tree: ConflictTreeProvider): ConflictItem | undefined {
  // The tree exposes findUnresolved by id; for command-palette invocation we
  // don't currently surface a picker — that lands in Phase 2. Return undefined
  // so the command no-ops if invoked without a tree-item argument.
  void tree;
  return undefined;
}

async function resolve(
  client: GfixMcpClient,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
  item: ConflictItem | undefined,
  decision: ResolutionDecision,
): Promise<void> {
  if (!item) {
    vscode.window.showWarningMessage(
      'gitfix: right-click a conflict in the tree to resolve.',
    );
    return;
  }
  const state = getState();
  if (!state.hasMerge || !state.repoPath || !tree.mergeId) {
    vscode.window.showErrorMessage('gitfix: no active merge.');
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `gitfix: resolving ${item.conflict.file} (${decision.kind})…`,
        cancellable: false,
      },
      async () => {
        const result = await client.conflictResolve({
          repo_path: state.repoPath!,
          merge_id: tree.mergeId!,
          conflict_id: item.conflict.conflict_id,
          resolution: decision,
        });
        log(
          `resolved ${item.conflict.conflict_id} via ${result.via}; ${result.remaining_unresolved} remaining`,
        );
      },
    );
    await tree.refresh(state.repoPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`resolve failed: ${msg}`);
    vscode.window.showErrorMessage(`gitfix: ${msg}`);
  }
}

import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import { ConflictItem } from '../ui/conflict-item';
import type { MergeState } from '../git/detect';
import type { ResolutionDecision } from '../mcp/types';
import { log } from '../log';

export function registerResolveCommands(
  getClient: () => GfixMcpClient | undefined,
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
      (item?: ConflictItem) => resolve(getClient, tree, getState, item, { kind: 'ours' }),
    ),
    vscode.commands.registerCommand(
      'gitfix.resolveTheirs',
      (item?: ConflictItem) =>
        resolve(getClient, tree, getState, item, { kind: 'theirs' }),
    ),
    vscode.commands.registerCommand(
      'gitfix.resolveMergiraf',
      (item?: ConflictItem) =>
        resolve(getClient, tree, getState, item, { kind: 'mergiraf' }),
    ),
    vscode.commands.registerCommand(
      'gitfix.resolveTakeTarget',
      (item?: ConflictItem) =>
        resolve(getClient, tree, getState, item, { kind: 'take-target' }),
    ),
    vscode.commands.registerCommand(
      'gitfix.resolveBatchMergiraf',
      async (_first: ConflictItem | undefined, all?: ConflictItem[]) => {
        const items = all && all.length > 0 ? all : (_first ? [_first] : []);
        if (items.length === 0) {
          vscode.window.showWarningMessage(vscode.l10n.t('gitfix: select one or more conflicts.'));
          return;
        }
        const client = getClient();
        const state = getState();
        if (!client || !state.repoPath || !tree.mergeId) return;
        try {
          const result = await client.conflictResolveBatch({
            repo_path: state.repoPath,
            merge_id: tree.mergeId,
            decisions: items.map((it) => ({
              conflict_id: it.conflict.conflict_id,
              resolution: { kind: 'mergiraf' },
            })),
          });
          vscode.window.showInformationMessage(
            `gitfix: resolved ${result.resolved}, failed ${result.failed}, remaining ${result.remaining_unresolved}.`,
          );
          await tree.refresh(state.repoPath);
        } catch (err) {
          vscode.window.showErrorMessage(`gitfix: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
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
  getClient: () => GfixMcpClient | undefined,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
  item: ConflictItem | undefined,
  decision: ResolutionDecision,
): Promise<void> {
  const client = getClient();
  if (!client) {
    vscode.window.showErrorMessage(
      vscode.l10n.t('gitfix: MCP server not available. Install gfix or set gitfix.gfixPath.'),
    );
    return;
  }
  if (!item) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('gitfix: right-click a conflict in the tree to resolve.'),
    );
    return;
  }
  const state = getState();
  if (!state.hasMerge || !state.repoPath || !tree.mergeId) {
    vscode.window.showErrorMessage(vscode.l10n.t('gitfix: no active merge.'));
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

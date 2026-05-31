import * as vscode from 'vscode';
import * as path from 'node:path';
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
        if (!item) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('gitfix: right-click a conflict in the tree to open its file.'),
          );
          return;
        }
        const uri = vscode.Uri.file(path.join(item.repoPath, item.conflict.file));
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
        if (!client) return;

        // Group items by repo so each batch call targets a single repo.
        // For the common case (one repo) this is a single call; for multi-repo
        // selections it issues one call per repo (fixes #28: used tree.mergeId
        // which was first-repo-wins regardless of the selected items).
        const byRepo = new Map<string, ConflictItem[]>();
        for (const it of items) {
          const list = byRepo.get(it.repoPath) ?? [];
          list.push(it);
          byRepo.set(it.repoPath, list);
        }

        for (const [repoPath, repoItems] of byRepo) {
          const mergeId = tree.mergeIdForRepo(repoPath);
          if (!mergeId) continue;
          try {
            const result = await client.conflictResolveBatch({
              repo_path: repoPath,
              merge_id: mergeId,
              decisions: repoItems.map((it) => ({
                conflict_id: it.conflict.conflict_id,
                resolution: { kind: 'mergiraf' },
              })),
            });
            vscode.window.showInformationMessage(vscode.l10n.t('gitfix: resolved {0}, failed {1}, remaining {2}.', result.resolved, result.failed, result.remaining_unresolved));
            await tree.refresh(repoPath);
          } catch (err) {
            vscode.window.showErrorMessage(vscode.l10n.t('gitfix: {0}', err instanceof Error ? err.message : String(err)));
          }
        }
      },
    ),
  ];
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

  // Multi-repo correctness (#28): for tree-item-invoked resolve commands, the
  // ConflictItem carries its own repoPath — use that to look up the correct
  // merge_id rather than defaulting to tree.mergeId (first-repo-wins).
  const repoPath = item.repoPath;
  const mergeId = tree.mergeIdForRepo(repoPath);
  if (!mergeId) {
    // Fallback: check legacy single-repo state
    const state = getState();
    if (!state.hasMerge || !state.repoPath || !tree.mergeId) {
      vscode.window.showErrorMessage(vscode.l10n.t('gitfix: no active merge.'));
      return;
    }
  }

  const effectiveMergeId = mergeId ?? tree.mergeId!;
  const effectiveRepoPath = mergeId ? repoPath : getState().repoPath!;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('gitfix: resolving {0} ({1})…', item.conflict.file, decision.kind),
        cancellable: false,
      },
      async () => {
        const result = await client.conflictResolve({
          repo_path: effectiveRepoPath,
          merge_id: effectiveMergeId,
          conflict_id: item.conflict.conflict_id,
          resolution: decision,
        });
        log(
          `resolved ${item.conflict.conflict_id} via ${result.via}; ${result.remaining_unresolved} remaining`,
        );
      },
    );
    await tree.refresh(effectiveRepoPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`resolve failed: ${msg}`);
    vscode.window.showErrorMessage(vscode.l10n.t('gitfix: {0}', msg));
  }
}

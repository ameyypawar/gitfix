import * as vscode from 'vscode';
import * as path from 'node:path';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import type { MultiRepoState } from '../workspace/multi-folder';
import { resolveTargetRepo } from '../workspace/multi-folder';
import type { ResolutionDecision } from '../mcp/types';
import { log } from '../log';

export function registerCodeLensCommands(
  getClient: () => GfixMcpClient | undefined,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
  getMultiState?: () => MultiRepoState,
): vscode.Disposable[] {
  /**
   * Resolve the conflict for a given URI + lineIndex.
   *
   * Fix #9 (partial): when a file has multiple unresolved conflicts, use
   * lineIndex to disambiguate. If lineIndex is unavailable or no conflict
   * matches within the ±2-line tolerance (the gfix MCP wire type does not yet
   * include first_line — tracked upstream as a follow-up), fall back to a
   * quick-pick so the user can select the intended conflict manually.
   *
   * Fix #28: use the URI to determine the repo path, then look up the correct
   * merge_id via mergeIdForRepo instead of the first-repo-wins tree.mergeId.
   */
  async function pickConflict(
    uri: vscode.Uri,
    lineIndex: number,
    state: ReturnType<typeof getState>,
  ): Promise<import('../mcp/types').UnresolvedConflict | undefined> {
    if (!state.repoPath) return undefined;
    const relPath = path.relative(state.repoPath, uri.fsPath);
    const all = tree.findAllUnresolvedByFile(relPath);
    if (all.length === 0) {
      vscode.window.showWarningMessage(vscode.l10n.t('gitfix: no unresolved conflict tracked for {0}. Refresh the tree.', relPath));
      return undefined;
    }
    if (all.length === 1) return all[0];
    // Multiple conflicts in the same file — try to match by lineIndex if the
    // gfix wire type ever includes first_line; for now fall through to quick-pick.
    // TODO: when gfix#XX adds first_line to UnresolvedConflict, enable the
    //       match below and remove the quick-pick path.
    //
    // const byLine = all.find((c) => 'first_line' in c &&
    //   Math.abs((c as any).first_line - lineIndex) <= 2);
    // if (byLine) return byLine;
    void lineIndex; // TODO(#9): use lineIndex once gfix exposes conflict first_line in the wire type; quick-pick fallback handles selection today.
    const picked = await vscode.window.showQuickPick(
      all.map((c) => ({
        label: `conflict_id: ${c.conflict_id}`,
        description: `${relPath} — kind: ${c.kind}`,
        conflict: c,
      })),
      { placeHolder: vscode.l10n.t('Multiple conflicts in this file — select one to resolve') },
    );
    return picked?.conflict;
  }

  /** Resolve the repo path from the document URI, using multi-state when available. */
  function resolveRepoForUri(uri: vscode.Uri): string | undefined {
    if (getMultiState) {
      const multi = getMultiState();
      return resolveTargetRepo(multi, uri);
    }
    return getState().repoPath;
  }

  const handler = (kind: 'ours' | 'theirs' | 'mergiraf') =>
    async (uri: vscode.Uri, lineIndex: number) => {
      const client = getClient();
      if (!client) {
        vscode.window.showErrorMessage(vscode.l10n.t('gitfix: MCP server not available.'));
        return;
      }
      const repoPath = resolveRepoForUri(uri);
      const mergeId = repoPath ? tree.mergeIdForRepo(repoPath) : tree.mergeId;
      const state = getState();
      if (!state.hasMerge || !repoPath || !mergeId) {
        vscode.window.showWarningMessage(vscode.l10n.t('gitfix: no active merge.'));
        return;
      }
      const conflict = await pickConflict(uri, lineIndex, { ...state, repoPath });
      if (!conflict) {
        return;
      }
      const decision: ResolutionDecision = { kind };
      try {
        await client.conflictResolve({
          repo_path: repoPath,
          merge_id: mergeId,
          conflict_id: conflict.conflict_id,
          resolution: decision,
        });
        await tree.refresh(repoPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`codelens resolve failed: ${msg}`);
        vscode.window.showErrorMessage(vscode.l10n.t('gitfix: {0}', msg));
      }
    };

  return [
    vscode.commands.registerCommand('gitfix.codelens.takeOurs', handler('ours')),
    vscode.commands.registerCommand('gitfix.codelens.takeTheirs', handler('theirs')),
    vscode.commands.registerCommand('gitfix.codelens.runMergiraf', handler('mergiraf')),
    vscode.commands.registerCommand('gitfix.codelens.resolveWithAi', async (uri: vscode.Uri, lineIndex: number) => {
      // Two-step: 1) call conflict_get with include_ai_suggestion=true to cache the suggestion,
      // 2) then call conflict_resolve with kind='ai-suggestion'. Per the gfix MCP contract,
      // 'ai-suggestion' is rejected unless a prior conflict_get cached one.
      const client = getClient();
      const state = getState();
      const repoPath = resolveRepoForUri(uri);
      const mergeId = repoPath ? tree.mergeIdForRepo(repoPath) : tree.mergeId;
      if (!client || !repoPath || !mergeId) return;
      const conflict = await pickConflict(uri, lineIndex, { ...state, repoPath });
      if (!conflict) return;
      const ac = new AbortController();
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('gitfix: requesting AI suggestion...'),
            // #44: allow the user to cancel a long-running AI resolve.
            cancellable: true,
          },
          async (_progress, token) => {
            const sub = token.onCancellationRequested(() => ac.abort());
            try {
              const got = await client.conflictGet({
                repo_path: repoPath,
                merge_id: mergeId,
                conflict_id: conflict.conflict_id,
                include_ai_suggestion: true,
                signal: ac.signal,
              });
              // Respect cancellation after the potentially slow conflict_get call.
              if (token.isCancellationRequested) return;
              if (!got.ai_suggestion) {
                throw new Error(got.ai_suggestion_unavailable_reason ?? 'no suggestion produced');
              }
              await client.conflictResolve({
                repo_path: repoPath,
                merge_id: mergeId,
                conflict_id: conflict.conflict_id,
                resolution: { kind: 'ai-suggestion' },
                signal: ac.signal,
              });
              if (token.isCancellationRequested) return;
              await tree.refresh(repoPath);
            } finally {
              sub.dispose();
            }
          },
        );
      } catch (err) {
        // Swallow abort silently — user cancelled, no error toast needed.
        // The MCP SDK wraps signal abort as McpError(-32001) when signal.reason
        // is undefined (the default for ac.abort() with no argument).
        if (err instanceof McpError && err.code === -32001 && ac.signal.aborted) {
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        log(`codelens resolveWithAi failed: ${msg}`);
        vscode.window.showErrorMessage(vscode.l10n.t('gitfix: {0}', msg));
      }
    }),
  ];
}

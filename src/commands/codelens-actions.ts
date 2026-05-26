import * as vscode from 'vscode';
import * as path from 'node:path';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import type { ResolutionDecision } from '../mcp/types';
import { log } from '../log';

export function registerCodeLensCommands(
  getClient: () => GfixMcpClient | undefined,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
): vscode.Disposable[] {
  const handler = (kind: ResolutionDecision['kind']) =>
    async (uri: vscode.Uri, _line: number) => {
      const client = getClient();
      if (!client) {
        vscode.window.showErrorMessage('gitfix: MCP server not available.');
        return;
      }
      const state = getState();
      if (!state.hasMerge || !state.repoPath || !tree.mergeId) {
        vscode.window.showWarningMessage('gitfix: no active merge.');
        return;
      }
      const relPath = path.relative(state.repoPath, uri.fsPath);
      const conflict = tree.findUnresolvedByFile(relPath);
      if (!conflict) {
        vscode.window.showWarningMessage(
          `gitfix: no unresolved conflict tracked for ${relPath}. Refresh the tree.`,
        );
        return;
      }
      const decision: ResolutionDecision =
        kind === 'manual' ? { kind: 'manual', text: '' } : { kind };
      try {
        await client.conflictResolve({
          repo_path: state.repoPath,
          merge_id: tree.mergeId,
          conflict_id: conflict.conflict_id,
          resolution: decision,
        });
        await tree.refresh(state.repoPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`codelens resolve failed: ${msg}`);
        vscode.window.showErrorMessage(`gitfix: ${msg}`);
      }
    };

  return [
    vscode.commands.registerCommand('gitfix.codelens.takeOurs', handler('ours')),
    vscode.commands.registerCommand('gitfix.codelens.takeTheirs', handler('theirs')),
    vscode.commands.registerCommand('gitfix.codelens.runMergiraf', handler('mergiraf')),
    vscode.commands.registerCommand('gitfix.codelens.resolveWithAi', async (uri: vscode.Uri, _line: number) => {
      // Two-step: 1) call conflict_get with include_ai_suggestion=true to cache the suggestion,
      // 2) then call conflict_resolve with kind='ai-suggestion'. Per the gfix MCP contract,
      // 'ai-suggestion' is rejected unless a prior conflict_get cached one.
      const client = getClient();
      const state = getState();
      if (!client || !state.repoPath || !tree.mergeId) return;
      const relPath = path.relative(state.repoPath, uri.fsPath);
      const conflict = tree.findUnresolvedByFile(relPath);
      if (!conflict) return;
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'gitfix: requesting AI suggestion...' },
          async () => {
            const got = await client.conflictGet({
              repo_path: state.repoPath!,
              merge_id: tree.mergeId!,
              conflict_id: conflict.conflict_id,
              include_ai_suggestion: true,
            });
            if (!got.ai_suggestion) {
              throw new Error(got.ai_suggestion_unavailable_reason ?? 'no suggestion produced');
            }
            await client.conflictResolve({
              repo_path: state.repoPath!,
              merge_id: tree.mergeId!,
              conflict_id: conflict.conflict_id,
              resolution: { kind: 'ai-suggestion' },
            });
            await tree.refresh(state.repoPath!);
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`codelens resolveWithAi failed: ${msg}`);
        vscode.window.showErrorMessage(`gitfix: ${msg}`);
      }
    }),
  ];
}

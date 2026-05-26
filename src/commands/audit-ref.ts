import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import { log, showOutputChannel } from '../log';

export function registerAuditRefCommand(
  getClient: () => GfixMcpClient | undefined,
  _tree: ConflictTreeProvider,
  getState: () => MergeState,
  _context: vscode.ExtensionContext,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.showAuditRef', async () => {
      const client = getClient();
      if (!client) {
        vscode.window.showErrorMessage(
          'gitfix: MCP server not available. Install gfix or set gitfix.gfixPath.',
        );
        return;
      }
      const state = getState();
      if (!state.hasMerge || !state.repoPath) {
        vscode.window.showInformationMessage('gitfix: no active merge.');
        return;
      }
      // Phase 1 stub retained until Commit 3 replaces with AuditPanel Webview.
      try {
        const status = await client.mergeStatus({
          repo_path: state.repoPath,
          merge_id: '', // intentionally invalid; server returns the active merge id in error
        });
        log(JSON.stringify(status, null, 2));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`mergeStatus probe: ${msg}`);
      }
      showOutputChannel();
    }),
  ];
}

import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import type { MergeState } from '../git/detect';
import { log, showOutputChannel } from '../log';

export function registerAuditRefCommand(
  getClient: () => GfixMcpClient | undefined,
  getState: () => MergeState,
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
      // Phase 1: just request status and dump to the output channel.
      // Phase 2 replaces this with a Webview detail panel.
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

import * as vscode from 'vscode';
import { GfixMcpClient } from './mcp/client';
import { ConflictTreeProvider } from './ui/conflict-tree';
import { StatusBar } from './ui/status-bar';
import { registerResolveCommands } from './commands/resolve';
import { registerRefreshCommand } from './commands/refresh';
import { registerAuditRefCommand } from './commands/audit-ref';
import { registerApplyCommand } from './commands/apply';
import { registerAbortCommand } from './commands/abort';
import { registerCodeLensCommands } from './commands/codelens-actions';
import { ConflictCodeLensProvider } from './ui/codelens-provider';
import { installSamplingHost } from './ai/sampling-host';
import { checkBYOK, registerByokOnboardingCommand } from './ai/byok-onboarding';
import { MergeStateDetector } from './git/detect';
import { ConflictItem } from './ui/conflict-item';
import { log, showOutputChannel } from './log';

let mcpClient: GfixMcpClient | undefined;
let detector: MergeStateDetector | undefined;
let treeProvider: ConflictTreeProvider | undefined;
let statusBar: StatusBar | undefined;

function getMcpClient(): GfixMcpClient | undefined {
  return mcpClient;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('gitfix extension activating');

  const config = vscode.workspace.getConfiguration('gitfix');
  const gfixPath = config.get<string>('gfixPath', 'gfix');

  // 1. Tree + status bar — register early so the UI is responsive even before MCP boots.
  treeProvider = new ConflictTreeProvider();
  const treeView = vscode.window.createTreeView('gitfix.conflicts', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    canSelectMany: true,
  });
  context.subscriptions.push(treeView);

  // Selection listener: update gitfix:conflictHasTakeTarget context key when a conflict
  // item with target_oid !== ours_oid is selected (enables "Take Target" context menu entry).
  context.subscriptions.push(
    treeView.onDidChangeSelection((e) => {
      const sel = e.selection[0];
      const show =
        sel instanceof ConflictItem &&
        sel.conflict.target_oid !== sel.conflict.ours_oid;
      vscode.commands.executeCommand('setContext', 'gitfix:conflictHasTakeTarget', show);
    }),
  );

  statusBar = new StatusBar();
  context.subscriptions.push(statusBar);

  // 2. CodeLens provider — register early, responds to merge state changes below.
  const codeLensProvider = new ConflictCodeLensProvider();
  context.subscriptions.push(codeLensProvider);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
  );

  // 3. Register commands FIRST so they are always present regardless of MCP state.
  // Commands guard on getMcpClient() at invoke time and surface a helpful error
  // when the MCP server is unavailable.
  context.subscriptions.push(
    ...registerResolveCommands(getMcpClient, treeProvider, () => detector!.currentState()),
    ...registerRefreshCommand(treeProvider, () => detector!.currentState()),
    ...registerAuditRefCommand(getMcpClient, treeProvider, () => detector!.currentState(), context),
    ...registerApplyCommand(getMcpClient, treeProvider, () => detector!.currentState()),
    ...registerAbortCommand(getMcpClient, treeProvider, () => detector!.currentState()),
    ...registerCodeLensCommands(getMcpClient, treeProvider, () => detector!.currentState()),
    ...registerByokOnboardingCommand(),
  );

  // 4. Boot MCP client (async; failure is non-fatal — commands will show an error at
  // invoke time instead of leaving the extension entirely unregistered).
  // Check BYOK before starting so we can pass enableByok to the subprocess.
  const byokStatus = checkBYOK();
  try {
    mcpClient = new GfixMcpClient(gfixPath);
    await mcpClient.start({ enableByok: byokStatus.configured });
    log(`MCP client connected to ${gfixPath}`);
    treeProvider.setClient(mcpClient);

    // 4a. Install vscode.lm sampling host and surface AI availability to CodeLens.
    const provider = config.get<'host' | 'byok' | 'none'>('aiProvider', 'host');
    let aiAvailable = false;
    if (provider !== 'none') {
      const raw = mcpClient.getRawClient();
      if (raw && provider === 'host') {
        const host = await installSamplingHost(raw);
        aiAvailable = host.available;
        if (!host.available && !byokStatus.configured) {
          vscode.window.showInformationMessage(
            'gitfix: no AI provider available. Configure one to enable "Resolve with AI".',
            'Configure',
          ).then((c) => {
            if (c === 'Configure') vscode.commands.executeCommand('gitfix.configureAiProvider');
          });
        } else if (!host.available && byokStatus.configured) {
          aiAvailable = true; // gfix subprocess handles BYOK transparently
        }
      } else if (provider === 'byok') {
        aiAvailable = byokStatus.configured;
      }
    }
    codeLensProvider.setAiAvailable(aiAvailable);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`MCP startup failed: ${msg}`);
    vscode.window
      .showErrorMessage(
        `gitfix: failed to start gfix MCP server (${msg}). Install gfix or set gitfix.gfixPath.`,
        'Open install guide',
        'Show logs',
      )
      .then((choice) => {
        if (choice === 'Open install guide') {
          vscode.env.openExternal(vscode.Uri.parse('https://gfix.space'));
        } else if (choice === 'Show logs') {
          showOutputChannel();
        }
      });
    // DO NOT return — the extension stays activated with commands available.
  }

  // 5. Detect merge state and refresh tree on changes.
  detector = new MergeStateDetector(async (state) => {
    log(`merge state changed: hasMerge=${state.hasMerge} repo=${state.repoPath ?? '(none)'}`);
    await vscode.commands.executeCommand('setContext', 'gitfix:hasMerge', state.hasMerge);
    codeLensProvider.setMergeActive(state.hasMerge);
    if (state.hasMerge && state.repoPath && mcpClient) {
      await treeProvider!.refresh(state.repoPath);
      statusBar!.update(treeProvider!.conflictCount);
    } else {
      treeProvider!.clear();
      statusBar!.update(0);
    }
  });
  context.subscriptions.push(detector);
  await detector.start();

  // 6. Watch settings changes for gfixPath restart.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('gitfix.gfixPath')) {
        vscode.window
          .showInformationMessage(
            'gitfix.gfixPath changed. Reload window to apply.',
            'Reload',
          )
          .then((c) => {
            if (c === 'Reload') {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
      }
    }),
  );

  log('gitfix extension activated');
}

export async function deactivate(): Promise<void> {
  log('gitfix extension deactivating');
  try {
    await detector?.dispose();
    await mcpClient?.stop();
  } catch (err) {
    log(`deactivate error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

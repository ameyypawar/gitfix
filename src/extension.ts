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
import { GitfixTelemetry } from './telemetry/reporter';
import { semverGte } from './util/semver';
import { log, showOutputChannel } from './log';

/** Minimum gfix CLI version required for full functionality. */
const REQUIRED_GFIX_MIN = '0.1.0-alpha.3';

/** Check the installed gfix binary version against the floor. */
async function gfixVersionOk(gfixPath: string): Promise<{ ok: boolean; actual: string }> {
  try {
    // Use execFile instead of exec to avoid shell injection: gfixPath is
    // passed as the executable directly, never interpolated into a shell string.
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const runFile = promisify(execFile);
    const { stdout } = await runFile(gfixPath, ['--version'], { timeout: 5000 });
    const m = stdout.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
    const actual = m?.[1] ?? 'unknown';
    return { ok: semverGte(actual, REQUIRED_GFIX_MIN), actual };
  } catch {
    return { ok: false, actual: 'not-found' };
  }
}

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

  // 3. Telemetry — init early (before commands) so events during boot are captured.
  const telemetry = new GitfixTelemetry(context.extension.packageJSON.version as string);
  telemetry.init(context);

  // 3a. First-run telemetry consent toast (one-shot via globalState).
  const CONSENT_KEY = 'gitfix.telemetry.consentShown';
  if (!context.globalState.get(CONSENT_KEY)) {
    context.globalState.update(CONSENT_KEY, true);
    vscode.window.showInformationMessage(
      vscode.l10n.t('gitfix can send anonymized usage events to help us improve. Off by default. You can opt in any time in Settings.'),
      vscode.l10n.t('Enable'),
      vscode.l10n.t('Not now'),
    ).then((c) => {
      if (c === vscode.l10n.t('Enable')) {
        vscode.workspace.getConfiguration('gitfix').update('telemetry.enabled', true, vscode.ConfigurationTarget.Global);
      }
    });
  }

  // Lazy getter that safely handles the activation window before detector is
  // initialized: returns a no-merge sentinel rather than throwing on `detector!`.
  function getDetectorState(): import('./git/detect').MergeState {
    return detector?.currentState() ?? { hasMerge: false, repoPath: undefined };
  }

  // Multi-repo state getter — used by apply/abort/codelens to resolve the
  // correct target repo via active editor position or QuickPick.
  function getMultiState(): import('./workspace/multi-folder').MultiRepoState {
    return detector?.currentMultiState() ?? { active: new Map(), anyActive: false };
  }

  // 4. Register commands FIRST so they are always present regardless of MCP state.
  // Commands guard on getMcpClient() at invoke time and surface a helpful error
  // when the MCP server is unavailable.
  context.subscriptions.push(
    ...registerResolveCommands(getMcpClient, treeProvider, getDetectorState),
    ...registerRefreshCommand(treeProvider, getDetectorState),
    ...registerAuditRefCommand(getMcpClient, treeProvider, getDetectorState, context),
    ...registerApplyCommand(getMcpClient, treeProvider, getDetectorState, getMultiState),
    ...registerAbortCommand(getMcpClient, treeProvider, getDetectorState, getMultiState),
    ...registerCodeLensCommands(getMcpClient, treeProvider, getDetectorState, getMultiState),
    ...registerByokOnboardingCommand(),
    // Walkthrough command — opens the built-in walkthrough panel.
    vscode.commands.registerCommand('gitfix.openWalkthrough', () => {
      vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        'ameyypawar.gitfix#gitfix.getStarted',
      );
    }),
  );

  // 4. Boot MCP client (async; failure is non-fatal — commands will show an error at
  // invoke time instead of leaving the extension entirely unregistered).
  // Check BYOK before starting so we can pass enableByok to the subprocess.
  const byokStatus = checkBYOK();
  try {
    mcpClient = new GfixMcpClient(gfixPath);
    await mcpClient.start({ enableByok: byokStatus.configured });
    log(`MCP client connected to ${gfixPath}`);

    // Check gfix CLI version floor (non-blocking warning only).
    const { ok: versionOk, actual: actualVersion } = await gfixVersionOk(gfixPath);
    if (!versionOk && actualVersion !== 'not-found') {
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          'gitfix needs gfix {0} or newer (you have {1}). Update for best results.',
          REQUIRED_GFIX_MIN,
          actualVersion,
        ),
        'Update gfix',
      ).then((c) => {
        if (c === 'Update gfix') {
          vscode.env.openExternal(vscode.Uri.parse('https://gfix.space/install'));
        }
      });
    }
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
            vscode.l10n.t('gitfix: no AI provider available. Configure one to enable "Resolve with AI".'),
            vscode.l10n.t('Configure'),
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
    telemetry.send('extension.activated', {
      lmAvailable: aiAvailable ? 'true' : 'false',
      byokConfigured: byokStatus.configured ? 'true' : 'false',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`MCP startup failed: ${msg}`);
    telemetry.send('extension.error', { errorClass: (err as Error)?.constructor?.name ?? 'Error', command: 'activate' });
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
  detector = new MergeStateDetector(async (multiState) => {
    log(`merge state changed: anyActive=${multiState.anyActive} repos=${[...multiState.active.keys()].join(', ') || '(none)'}`);
    await vscode.commands.executeCommand('setContext', 'gitfix:hasMerge', multiState.anyActive);
    codeLensProvider.setMergeActive(multiState.anyActive);
    if (multiState.anyActive && mcpClient) {
      await treeProvider!.refreshAll(multiState);
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

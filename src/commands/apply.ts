import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import { ConflictTreeProvider } from '../ui/conflict-tree';
import type { MergeState } from '../git/detect';
import type { MultiRepoState } from '../workspace/multi-folder';
import { readSettings } from '../config/strategy-settings';
import { resolveTargetRepo } from '../workspace/multi-folder';
import { log } from '../log';

export function registerApplyCommand(
  getClient: () => GfixMcpClient | undefined,
  tree: ConflictTreeProvider,
  getState: () => MergeState,
  getMultiState?: () => MultiRepoState,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.applyMerge', async () => {
      const client = getClient();
      if (!client) {
        vscode.window.showWarningMessage(vscode.l10n.t('gitfix: no active merge.'));
        return;
      }

      // Multi-repo: resolve which repo this command targets.
      // If getMultiState is provided, use resolveTargetRepo to pick the correct
      // repo based on active editor position. Falls back to legacy getState()
      // for single-repo workspaces or when multi-state is unavailable.
      let repoPath: string | undefined;
      let mergeId: string | undefined;
      if (getMultiState) {
        const multi = getMultiState();
        repoPath = resolveTargetRepo(multi, vscode.window.activeTextEditor?.document.uri);
        if (!repoPath && multi.active.size > 1) {
          // Ambiguous: multiple repos merging, no editor hint — show a QuickPick.
          const picked = await vscode.window.showQuickPick(
            [...multi.active.keys()].map((p) => ({ label: p, repoPath: p })),
            { placeHolder: vscode.l10n.t('Multiple active merges — select the repo to apply') },
          );
          repoPath = picked?.repoPath;
        }
        if (repoPath) mergeId = tree.mergeIdForRepo(repoPath);
      }
      // Legacy fallback
      if (!repoPath || !mergeId) {
        const state = getState();
        repoPath = state.repoPath;
        mergeId = tree.mergeId;
      }

      if (!repoPath || !mergeId) {
        vscode.window.showWarningMessage(vscode.l10n.t('gitfix: no active merge.'));
        return;
      }

      const plan = tree.planForRepo(repoPath);
      if (plan && plan.unresolved.length > 0) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('gitfix: {0} unresolved conflict(s). Resolve them before applying.', plan.unresolved.length),
        );
        return;
      }
      const targetBranch = plan?.target_branch ?? '';
      // Read protected branches from settings (per-repo TOML override applied).
      const settings = readSettings(repoPath);
      // `isProtected` is true when the target branch is in the protected list.
      // For protected branches we require explicit user confirmation before calling
      // mergeApply — and then pass auto_approve=true to tell gfix the user confirmed.
      // For non-protected branches the user confirmation step is skipped, and we
      // omit auto_approve (undefined) so gfix uses its own default (false).
      // This fixes #37: the previous variable was named `needsConfirm` but its value
      // was passed directly as auto_approve, inverting the intended semantics
      // (needsConfirm=true meant "user still needs to confirm" not "approved").
      const isProtected = settings.protectedBranches.includes(targetBranch);
      if (isProtected) {
        const applyLbl = vscode.l10n.t('Apply');
        const choice = await vscode.window.showWarningMessage(
          vscode.l10n.t("Apply merge to protected branch '{0}'?", targetBranch),
          { modal: true, detail: vscode.l10n.t('This will create a merge commit on {0}.', targetBranch) },
          applyLbl,
        );
        if (choice !== applyLbl) return;
      }
      try {
        const result = await client.mergeApply({
          repo_path: repoPath,
          merge_id: mergeId,
          // gfix requires auto_approve=true when applying to a protected branch —
          // we've just obtained explicit user confirmation via the modal above.
          // For non-protected branches, omit the field (undefined) and let gfix decide.
          auto_approve: isProtected ? true : undefined,
        });
        vscode.window.showInformationMessage(
          vscode.l10n.t('gitfix: merge applied as {0}', result.commit_oid.slice(0, 12)),
        );
        await tree.refresh(repoPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`merge_apply failed: ${msg}`);
        vscode.window.showErrorMessage(vscode.l10n.t('gitfix: {0}', msg));
      }
    }),
  ];
}

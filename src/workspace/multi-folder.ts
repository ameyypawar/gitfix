import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface MergeState {
  hasMerge: boolean;
  repoPath: string;
}

export interface MultiRepoState {
  /** repoPath -> MergeState for folders with an active merge. */
  active: Map<string, MergeState>;
  /** True if ANY folder has an active merge. Drives gitfix:hasMerge context key. */
  anyActive: boolean;
}

export async function scanWorkspaceFolders(): Promise<MultiRepoState> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const active = new Map<string, MergeState>();
  for (const f of folders) {
    const mergeHead = path.join(f.uri.fsPath, '.git', 'MERGE_HEAD');
    try {
      await fs.promises.access(mergeHead);
      active.set(f.uri.fsPath, { hasMerge: true, repoPath: f.uri.fsPath });
    } catch {
      // File does not exist — no active merge in this folder.
    }
  }
  return { active, anyActive: active.size > 0 };
}

/** Resolves which repo a command targets, given a selection or the active editor. */
export function resolveTargetRepo(
  state: MultiRepoState,
  hint?: { repoPath?: string } | vscode.Uri,
): string | undefined {
  if (hint instanceof vscode.Uri) {
    for (const [repoPath] of state.active) {
      if (hint.fsPath.startsWith(repoPath + path.sep)) return repoPath;
    }
  } else if (hint?.repoPath && state.active.has(hint.repoPath)) {
    return hint.repoPath;
  }
  // Active editor fallback
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active) {
    for (const [repoPath] of state.active) {
      if (active.fsPath.startsWith(repoPath + path.sep)) return repoPath;
    }
  }
  // Single active merge — unambiguous
  if (state.active.size === 1) return [...state.active.keys()][0];
  return undefined;
}

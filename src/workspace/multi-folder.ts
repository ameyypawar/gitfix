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

/**
 * Resolve the real gitdir for a repo root, following the `gitdir: <path>` pointer
 * when `.git` is a file (git worktree). Returns the resolved gitdir path, or
 * undefined if `.git` is absent or malformed (fail-closed — never throws).
 */
async function resolveGitdir(repoPath: string): Promise<string | undefined> {
  const dotGit = path.join(repoPath, '.git');
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(dotGit);
  } catch {
    return undefined;
  }
  if (stat.isDirectory()) {
    return dotGit;
  }
  if (stat.isFile()) {
    // Worktree: `.git` file contains `gitdir: <path>`
    try {
      const raw = await fs.promises.readFile(dotGit, 'utf8');
      const m = raw.match(/^gitdir:\s*(.+)$/m);
      if (!m) { return undefined; }
      const ptr = m[1].trim();
      // Resolve relative paths against the repo root; absolute paths are used as-is.
      return path.isAbsolute(ptr) ? ptr : path.resolve(repoPath, ptr);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Returns true when MERGE_HEAD exists under the given gitdir. */
async function hasMergeHead(gitdir: string): Promise<boolean> {
  try {
    await fs.promises.access(path.join(gitdir, 'MERGE_HEAD'));
    return true;
  } catch {
    return false;
  }
}

export async function scanWorkspaceFolders(): Promise<MultiRepoState> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const active = new Map<string, MergeState>();

  for (const f of folders) {
    const folderPath = f.uri.fsPath;

    // --- Top-level repo in workspace folder ---
    const gitdir = await resolveGitdir(folderPath);
    if (gitdir && await hasMergeHead(gitdir)) {
      active.set(folderPath, { hasMerge: true, repoPath: folderPath });
    }

    // --- One-level-deep nested repos (monorepo pattern) ---
    // Skip node_modules and dotdirs; cap at one level for perf.
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) { continue; }
      if (entry.name.startsWith('.') || entry.name === 'node_modules') { continue; }
      const subPath = path.join(folderPath, entry.name);
      // Don't re-check the top-level path already covered above.
      if (active.has(subPath)) { continue; }
      const subGitdir = await resolveGitdir(subPath);
      if (subGitdir && await hasMergeHead(subGitdir)) {
        active.set(subPath, { hasMerge: true, repoPath: subPath });
      }
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

/** Absolute fsPaths of all open workspace folders, for GITFIX_ALLOWED_ROOTS. */
export function getAllowedRoots(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
}

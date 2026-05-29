import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../log';
import { scanWorkspaceFolders } from '../workspace/multi-folder';
import type { MultiRepoState } from '../workspace/multi-folder';

/** Single-folder merge state (kept for backward compat with command handlers). */
export interface MergeState {
  hasMerge: boolean;
  repoPath?: string;
}

type Listener = (state: MultiRepoState) => void | Promise<void>;

export class MergeStateDetector implements vscode.Disposable {
  private fsWatcher?: vscode.FileSystemWatcher;
  private gitDisposables: vscode.Disposable[] = [];
  private last: MultiRepoState = { active: new Map(), anyActive: false };

  constructor(private listener: Listener) {}

  async start(): Promise<void> {
    // 1. vscode.git API — fastest detection via repository state events.
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (gitExt) {
      if (!gitExt.isActive) {
        await gitExt.activate();
      }
      const gitApi = gitExt.exports.getAPI(1);
      const wireRepo = (repo: { rootUri: vscode.Uri; state: { onDidChange: vscode.Event<void> } }) => {
        this.gitDisposables.push(repo.state.onDidChange(() => this.recompute()));
      };
      gitApi.repositories.forEach(wireRepo);
      const addSub = gitApi.onDidOpenRepository?.(wireRepo);
      if (addSub) {
        this.gitDisposables.push(addSub);
      }
    } else {
      log('vscode.git extension unavailable; falling back to filesystem polling');
    }

    // 2. Filesystem watcher on MERGE_HEAD as a belt-and-braces fallback.
    this.fsWatcher = vscode.workspace.createFileSystemWatcher('**/.git/MERGE_HEAD');
    this.fsWatcher.onDidCreate(() => this.recompute());
    this.fsWatcher.onDidDelete(() => this.recompute());

    await this.recompute();
  }

  /** Returns the current multi-repo state snapshot. */
  currentMultiState(): MultiRepoState {
    return this.last;
  }

  /**
   * Legacy single-repo state accessor. Returns the first active repo or a
   * no-merge state. Used by command handlers that don't yet distinguish repos.
   */
  currentState(): MergeState {
    if (!this.last.anyActive) return { hasMerge: false };
    const first = [...this.last.active.values()][0];
    return { hasMerge: true, repoPath: first.repoPath };
  }

  private async recompute(): Promise<void> {
    const next = scanWorkspaceFolders();
    // Compare by size and key set to detect changes.
    const changed =
      next.anyActive !== this.last.anyActive ||
      next.active.size !== this.last.active.size ||
      [...next.active.keys()].some((k) => !this.last.active.has(k));
    this.last = next;
    if (changed) {
      await this.listener(next);
    }
  }

  dispose(): void {
    this.fsWatcher?.dispose();
    for (const d of this.gitDisposables) d.dispose();
    this.gitDisposables = [];
  }
}

/**
 * Read the merge head OID from `.git/MERGE_HEAD`. Returns the first OID
 * (octopus merges have multiple lines — v0.2 returns the first source only).
 * Returns undefined when no merge is in progress or the file is unreadable.
 */
export function getMergeHeadOid(repoPath: string): string | undefined {
  const mergeHeadPath = path.join(repoPath, '.git', 'MERGE_HEAD');
  try {
    const raw = fs.readFileSync(mergeHeadPath, 'utf8');
    const first = raw.split('\n')[0]?.trim();
    return first && first.length > 0 ? first : undefined;
  } catch {
    return undefined;
  }
}

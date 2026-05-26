import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../log';

export interface MergeState {
  hasMerge: boolean;
  repoPath?: string;
}

type Listener = (state: MergeState) => void | Promise<void>;

export class MergeStateDetector implements vscode.Disposable {
  private fsWatcher?: vscode.FileSystemWatcher;
  private gitDisposable?: vscode.Disposable;
  private last: MergeState = { hasMerge: false };

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
        const sub = repo.state.onDidChange(() => this.recompute());
        this.gitDisposable = vscode.Disposable.from(this.gitDisposable ?? new vscode.Disposable(() => {}), sub);
      };
      gitApi.repositories.forEach(wireRepo);
      const addSub = gitApi.onDidOpenRepository?.(wireRepo);
      if (addSub) {
        this.gitDisposable = vscode.Disposable.from(this.gitDisposable ?? new vscode.Disposable(() => {}), addSub);
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

  currentState(): MergeState {
    return this.last;
  }

  private async recompute(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    let next: MergeState = { hasMerge: false };
    for (const folder of folders) {
      const mergeHead = path.join(folder.uri.fsPath, '.git', 'MERGE_HEAD');
      if (fs.existsSync(mergeHead)) {
        next = { hasMerge: true, repoPath: folder.uri.fsPath };
        break;
      }
    }
    const changed =
      next.hasMerge !== this.last.hasMerge || next.repoPath !== this.last.repoPath;
    this.last = next;
    if (changed) {
      await this.listener(next);
    }
  }

  dispose(): void {
    this.fsWatcher?.dispose();
    this.gitDisposable?.dispose();
  }
}

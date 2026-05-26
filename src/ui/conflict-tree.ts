import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import type { MergePlan, UnresolvedConflict } from '../mcp/types';
import { ConflictItem, MergeRootItem } from './conflict-item';
import { log } from '../log';

type Node = MergeRootItem | ConflictItem;

export class ConflictTreeProvider implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  private client?: GfixMcpClient;
  private currentPlan?: MergePlan;
  private currentRepo?: string;

  setClient(client: GfixMcpClient): void {
    this.client = client;
  }

  get conflictCount(): number {
    return this.currentPlan?.unresolved.length ?? 0;
  }

  get currentRepoPath(): string | undefined {
    return this.currentRepo;
  }

  get mergeId(): string | undefined {
    return this.currentPlan?.merge_id;
  }

  clear(): void {
    this.currentPlan = undefined;
    this.currentRepo = undefined;
    this.emitter.fire();
  }

  async refresh(repoPath: string): Promise<void> {
    if (!this.client) {
      return;
    }
    this.currentRepo = repoPath;

    try {
      // Inspect git state to find a merge target and sources.
      const gitExt = vscode.extensions.getExtension('vscode.git');
      const gitApi = gitExt?.exports?.getAPI(1);
      const repo = gitApi?.repositories?.find(
        (r: { rootUri: vscode.Uri }) => r.rootUri.fsPath === repoPath,
      );
      const target = repo?.state.HEAD?.name ?? 'HEAD';

      // MERGE_HEAD short hash is the source; if more than one (octopus) join with comma.
      const mergeHead: string | undefined = repo?.state.mergeHeadShortHash;
      if (!mergeHead) {
        this.currentPlan = undefined;
        this.emitter.fire();
        return;
      }

      this.currentPlan = await this.client.mergePreview({
        repo_path: repoPath,
        target,
        sources: [mergeHead],
      });
    } catch (err) {
      log(`tree refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      vscode.window.showErrorMessage(
        `gitfix: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.currentPlan = undefined;
    }
    this.emitter.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Node): Node[] {
    if (!this.currentPlan) {
      return [];
    }
    if (!element) {
      return [new MergeRootItem(this.currentPlan)];
    }
    if (element instanceof MergeRootItem) {
      return this.currentPlan.unresolved.map(
        (u) => new ConflictItem(u, this.currentRepo!),
      );
    }
    return [];
  }

  findUnresolved(conflictId: string): UnresolvedConflict | undefined {
    return this.currentPlan?.unresolved.find((u) => u.conflict_id === conflictId);
  }
}

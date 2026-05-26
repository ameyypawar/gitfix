import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import type { MergePlan, MergeStatusResponse, UnresolvedConflict } from '../mcp/types';
import { ConflictItem, MergeRootItem, ResolvedGroupItem, ResolvedItem } from './conflict-item';
import { getMergeHeadOid } from '../git/detect';
import { log } from '../log';

type Node = MergeRootItem | ConflictItem | ResolvedGroupItem | ResolvedItem;

export class ConflictTreeProvider implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  private client?: GfixMcpClient;
  private currentPlanData?: MergePlan;
  private currentRepo?: string;

  setClient(client: GfixMcpClient): void {
    this.client = client;
  }

  get conflictCount(): number {
    return this.currentPlanData?.unresolved.length ?? 0;
  }

  get currentRepoPath(): string | undefined {
    return this.currentRepo;
  }

  get mergeId(): string | undefined {
    return this.currentPlanData?.merge_id;
  }

  get currentPlan(): MergePlan | undefined {
    return this.currentPlanData;
  }

  clear(): void {
    this.currentPlanData = undefined;
    this.currentRepo = undefined;
    this.emitter.fire();
  }

  async refresh(repoPath: string): Promise<void> {
    if (!this.client) {
      return;
    }
    this.currentRepo = repoPath;

    try {
      // If we already have a merge_id from a prior mergePreview call, query
      // status rather than re-initializing — mergePreview is the init op per
      // the gfix MCP contract; re-running it risks clobbering resolution
      // progress. (P1-4)
      if (this.currentPlanData?.merge_id) {
        const status: MergeStatusResponse = await this.client.mergeStatus({
          repo_path: repoPath,
          merge_id: this.currentPlanData.merge_id,
        });
        this.currentPlanData = status.plan;
        this.emitter.fire();
        return;
      }

      // First-time refresh: inspect git state for target and source(s).
      const gitExt = vscode.extensions.getExtension('vscode.git');
      const gitApi = gitExt?.exports?.getAPI(1);
      const repo = gitApi?.repositories?.find(
        (r: { rootUri: vscode.Uri }) => r.rootUri.fsPath === repoPath,
      );
      const target = repo?.state.HEAD?.name ?? 'HEAD';

      // Read MERGE_HEAD directly off disk. (P0-1: the vscode.git API has no
      // mergeHeadShortHash field — the previous code was reading undefined.)
      const mergeHead = getMergeHeadOid(repoPath);
      if (!mergeHead) {
        this.currentPlanData = undefined;
        this.emitter.fire();
        return;
      }

      this.currentPlanData = await this.client.mergePreview({
        repo_path: repoPath,
        target,
        sources: [mergeHead],
      });
    } catch (err) {
      log(`tree refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      vscode.window.showErrorMessage(
        `gitfix: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.currentPlanData = undefined;
    }
    this.emitter.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Node): Node[] {
    if (!this.currentPlanData) return [];
    if (!element) return [new MergeRootItem(this.currentPlanData)];
    if (element instanceof MergeRootItem) {
      const children: Node[] = this.currentPlanData.unresolved.map(
        (u) => new ConflictItem(u, this.currentRepo!),
      );
      if (this.currentPlanData.resolved.length > 0) {
        children.push(new ResolvedGroupItem(this.currentPlanData.resolved));
      }
      return children;
    }
    if (element instanceof ResolvedGroupItem) {
      return element.resolved.map((r) => new ResolvedItem(r));
    }
    return [];
  }

  findUnresolved(conflictId: string): UnresolvedConflict | undefined {
    return this.currentPlanData?.unresolved.find((u) => u.conflict_id === conflictId);
  }

  findUnresolvedByFile(file: string): UnresolvedConflict | undefined {
    return this.currentPlanData?.unresolved.find((u) => u.file === file);
  }
}

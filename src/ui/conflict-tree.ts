import * as vscode from 'vscode';
import { GfixMcpClient } from '../mcp/client';
import type { MergePlan, MergeStatusResponse, UnresolvedConflict } from '../mcp/types';
import { ConflictItem, MergeRootItem, ResolvedGroupItem, ResolvedItem } from './conflict-item';
import { getMergeHeadOid } from '../git/detect';
import type { MultiRepoState } from '../workspace/multi-folder';
import { log } from '../log';

type Node = MergeRootItem | ConflictItem | ResolvedGroupItem | ResolvedItem;

export class ConflictTreeProvider implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  private client?: GfixMcpClient;
  /** Per-repo plan map: repoPath -> MergePlan */
  private plans = new Map<string, MergePlan>();

  setClient(client: GfixMcpClient): void {
    this.client = client;
  }

  get conflictCount(): number {
    let total = 0;
    for (const plan of this.plans.values()) total += plan.unresolved.length;
    return total;
  }

  /** Returns the first active repo path (legacy compat for single-repo commands). */
  get currentRepoPath(): string | undefined {
    return this.plans.size > 0 ? [...this.plans.keys()][0] : undefined;
  }

  /**
   * Returns the merge_id for the first active repo.
   * @deprecated Use mergeIdForRepo(repoPath) for multi-repo correctness.
   * Retained for single-repo callers and backward compat; new callers must pass
   * a specific repoPath.
   */
  get mergeId(): string | undefined {
    return this.plans.size > 0 ? [...this.plans.values()][0]?.merge_id : undefined;
  }

  /**
   * Returns the plan for the first active repo.
   * @deprecated Use planForRepo(repoPath) for multi-repo correctness.
   */
  get currentPlan(): MergePlan | undefined {
    return this.plans.size > 0 ? [...this.plans.values()][0] : undefined;
  }

  /** Returns the merge_id for a specific repo path. */
  mergeIdForRepo(repoPath: string): string | undefined {
    return this.plans.get(repoPath)?.merge_id;
  }

  /** Returns the plan for a specific repo path. */
  planForRepo(repoPath: string): MergePlan | undefined {
    return this.plans.get(repoPath);
  }

  clear(): void {
    this.plans.clear();
    this.emitter.fire();
  }

  /** Refresh all repos in a multi-repo state. Drops plans for inactive folders. */
  async refreshAll(state: MultiRepoState): Promise<void> {
    // Drop plans for folders no longer in merge state.
    for (const k of [...this.plans.keys()]) {
      if (!state.active.has(k)) this.plans.delete(k);
    }
    for (const repoPath of state.active.keys()) {
      await this.refreshRepo(repoPath);
    }
    this.emitter.fire();
  }

  async refresh(repoPath: string): Promise<void> {
    await this.refreshRepo(repoPath);
    this.emitter.fire();
  }

  private async refreshRepo(repoPath: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const existing = this.plans.get(repoPath);

      // If we already have a merge_id, query status to avoid re-initializing.
      // mergePreview is the init op per the gfix MCP contract; re-running it
      // risks clobbering resolution progress.
      if (existing?.merge_id) {
        const status: MergeStatusResponse = await this.client.mergeStatus({
          repo_path: repoPath,
          merge_id: existing.merge_id,
        });
        this.plans.set(repoPath, status.plan);
        return;
      }

      // First-time refresh: inspect git state for target and source(s).
      const gitExt = vscode.extensions.getExtension('vscode.git');
      const gitApi = gitExt?.exports?.getAPI(1);
      const repo = gitApi?.repositories?.find(
        (r: { rootUri: vscode.Uri }) => r.rootUri.fsPath === repoPath,
      );
      const target = repo?.state.HEAD?.name ?? 'HEAD';

      // Read MERGE_HEAD directly off disk.
      const mergeHead = getMergeHeadOid(repoPath);
      if (!mergeHead) {
        this.plans.delete(repoPath);
        return;
      }

      const plan = await this.client.mergePreview({
        repo_path: repoPath,
        target,
        sources: [mergeHead],
      });
      this.plans.set(repoPath, plan);
    } catch (err) {
      log(`tree refresh failed for ${repoPath}: ${err instanceof Error ? err.message : String(err)}`);
      vscode.window.showErrorMessage(
        `gitfix: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.plans.delete(repoPath);
    }
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Node): Node[] {
    if (!element) {
      // Top level: one MergeRootItem per active repo.
      const totalActive = this.plans.size;
      return [...this.plans.entries()].map(
        ([repoPath, plan]) => new MergeRootItem(plan, repoPath, totalActive),
      );
    }
    if (element instanceof MergeRootItem) {
      const plan = this.plans.get(element.repoPath);
      if (!plan) return [];
      const children: Node[] = plan.unresolved.map(
        (u) => new ConflictItem(u, element.repoPath),
      );
      if (plan.resolved.length > 0) {
        children.push(new ResolvedGroupItem(plan.resolved, element.repoPath));
      }
      return children;
    }
    if (element instanceof ResolvedGroupItem) {
      return element.resolved.map((r) => new ResolvedItem(r));
    }
    return [];
  }

  findUnresolved(conflictId: string): UnresolvedConflict | undefined {
    for (const plan of this.plans.values()) {
      const found = plan.unresolved.find((u) => u.conflict_id === conflictId);
      if (found) return found;
    }
    return undefined;
  }

  findUnresolvedByFile(file: string): UnresolvedConflict | undefined {
    for (const plan of this.plans.values()) {
      const found = plan.unresolved.find((u) => u.file === file);
      if (found) return found;
    }
    return undefined;
  }

  /** Return ALL unresolved conflicts matching the given relative file path. */
  findAllUnresolvedByFile(file: string): UnresolvedConflict[] {
    const results: UnresolvedConflict[] = [];
    for (const plan of this.plans.values()) {
      for (const u of plan.unresolved) {
        if (u.file === file) results.push(u);
      }
    }
    return results;
  }

  /** Find unresolved conflict by relative file path within a specific repo. */
  findUnresolvedByFileInRepo(repoPath: string, file: string): UnresolvedConflict | undefined {
    return this.plans.get(repoPath)?.unresolved.find((u) => u.file === file);
  }

  /** All active repo paths. */
  activeRepoPaths(): string[] {
    return [...this.plans.keys()];
  }
}

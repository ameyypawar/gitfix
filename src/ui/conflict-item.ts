import * as vscode from 'vscode';
import * as path from 'node:path';
import type { MergePlan, ResolvedEntry, UnresolvedConflict } from '../mcp/types';

export class MergeRootItem extends vscode.TreeItem {
  constructor(
    public readonly plan: MergePlan,
    public readonly repoPath: string,
    totalActive: number,
  ) {
    const folderName = path.basename(repoPath);
    const label =
      totalActive > 1
        ? `${folderName} — Merge into ${plan.target_branch} (${plan.unresolved.length} unresolved)`
        : `Merge into ${plan.target_branch} (${plan.unresolved.length} unresolved)`;
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'merge';
    this.iconPath = new vscode.ThemeIcon('git-merge');
    const rerereCount = plan.resolved.filter((r) => r.via === 'rerere').length;
    const breakdown =
      rerereCount > 0
        ? `${plan.resolved.length} auto (${rerereCount} ↻) · ${plan.unresolved.length} unresolved`
        : `${plan.resolved.length} auto · ${plan.unresolved.length} unresolved`;
    this.description = breakdown;
    this.tooltip =
      `merge_id: ${plan.merge_id}\n` +
      `sources: ${plan.sources.join(', ')}\n` +
      `auto-resolved: ${plan.resolved.length} (rerere replay: ${rerereCount})`;
  }
}

export class ResolvedGroupItem extends vscode.TreeItem {
  constructor(
    public readonly resolved: ResolvedEntry[],
    public readonly repoPath: string,
  ) {
    super(`Auto-resolved (${resolved.length})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'resolvedGroup';
    this.iconPath = new vscode.ThemeIcon('check');
  }
}

export class ResolvedItem extends vscode.TreeItem {
  constructor(public readonly entry: ResolvedEntry) {
    super(entry.file, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'resolvedFile';
    this.iconPath = new vscode.ThemeIcon('check');
    this.description = entry.via === 'rerere' ? `${entry.via} ↻` : entry.via;
    this.tooltip =
      `via: ${entry.via}\n` +
      `ours (${entry.ours_source}): ${entry.ours_oid.slice(0, 8)}\n` +
      `theirs (${entry.theirs_source}): ${entry.theirs_oid.slice(0, 8)}`;
  }
}

export class ConflictItem extends vscode.TreeItem {
  constructor(
    public readonly conflict: UnresolvedConflict,
    public readonly repoPath: string,
  ) {
    super(conflict.file, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'conflict';
    this.iconPath = new vscode.ThemeIcon(
      'warning',
      new vscode.ThemeColor('list.warningForeground'),
    );
    this.tooltip = [
      `conflict_id: ${conflict.conflict_id}`,
      `kind: ${conflict.kind}`,
      `ours (${conflict.ours_source}): ${conflict.ours_oid.slice(0, 8)}`,
      `theirs (${conflict.theirs_source}): ${conflict.theirs_oid.slice(0, 8)}`,
    ].join('\n');
    this.description = conflict.kind;
    this.command = {
      command: 'gitfix.openFile',
      title: 'Open',
      arguments: [this],
    };
  }
}

import * as vscode from 'vscode';
import type { MergePlan, UnresolvedConflict } from '../mcp/types';

export class MergeRootItem extends vscode.TreeItem {
  constructor(public readonly plan: MergePlan) {
    super(
      `Merge into ${plan.target_branch} (${plan.unresolved.length} unresolved)`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    this.contextValue = 'merge';
    this.iconPath = new vscode.ThemeIcon('git-merge');
    this.tooltip = `merge_id: ${plan.merge_id}\nsources: ${plan.sources.join(', ')}\nresolved deterministically: ${plan.resolved.length}`;
    this.description = `${plan.resolved.length} auto-resolved`;
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

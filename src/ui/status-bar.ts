import * as vscode from 'vscode';

export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    // Left aligned; high priority so it sits near the git-branch indicator.
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.command = 'gitfix.refresh';
    this.update(0);
  }

  update(count: number): void {
    if (count === 0) {
      this.item.hide();
      return;
    }
    this.item.text = `$(git-merge) ${count} conflict${count === 1 ? '' : 's'}`;
    this.item.tooltip = 'gitfix — click to refresh';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}

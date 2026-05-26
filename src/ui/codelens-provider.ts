import * as vscode from 'vscode';

/**
 * Lazy-rendered CodeLens above every git conflict marker block.
 *
 * Triggers on save / open of any text document inside a workspace folder that
 * contains `.git/MERGE_HEAD`. We deliberately do NOT re-scan on every keystroke
 * (vscode invokes `provideCodeLenses` lazily already, but we additionally avoid
 * any disk IO inside provideCodeLenses — the merge-state check is hot-path).
 */
export class ConflictCodeLensProvider implements vscode.CodeLensProvider {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  /**
   * Set by the extension when merge state changes. The provider re-fires
   * onDidChangeCodeLenses whenever this flips so vscode rebuilds lenses.
   */
  private hasActiveMerge = false;

  /** Set by the AI host once vscode.lm is known to have at least one model. */
  private aiAvailable = false;

  setMergeActive(active: boolean): void {
    if (this.hasActiveMerge !== active) {
      this.hasActiveMerge = active;
      this.emitter.fire();
    }
  }

  setAiAvailable(available: boolean): void {
    if (this.aiAvailable !== available) {
      this.aiAvailable = available;
      this.emitter.fire();
    }
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('gitfix');
    if (!config.get<boolean>('codeLens.enabled', true)) return [];
    if (!this.hasActiveMerge) return [];
    if (document.uri.scheme !== 'file') return [];

    const text = document.getText();
    const lenses: vscode.CodeLens[] = [];

    // Match canonical 7-char markers AND the rare Git Brand variant (`<<<<<<` 6+).
    // We anchor to start-of-line to avoid matching inline tokens in docs.
    // Note: we tolerate trailing label text (`<<<<<<< HEAD`, `<<<<<<< theirs`).
    const startRe = /^(<{6,8})( .*)?$/gm;
    let match: RegExpExecArray | null;
    while ((match = startRe.exec(text)) !== null) {
      if (token.isCancellationRequested) return lenses;
      const lineIndex = document.positionAt(match.index).line;
      const range = new vscode.Range(lineIndex, 0, lineIndex, 0);

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(arrow-left) Take Ours',
          command: 'gitfix.codelens.takeOurs',
          arguments: [document.uri, lineIndex],
        }),
        new vscode.CodeLens(range, {
          title: '$(arrow-right) Take Theirs',
          command: 'gitfix.codelens.takeTheirs',
          arguments: [document.uri, lineIndex],
        }),
        new vscode.CodeLens(range, {
          title: '$(wand) Resolve with Mergiraf',
          command: 'gitfix.codelens.runMergiraf',
          arguments: [document.uri, lineIndex],
        }),
      );

      if (this.aiAvailable) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: '$(sparkle) Resolve with AI',
            command: 'gitfix.codelens.resolveWithAi',
            arguments: [document.uri, lineIndex],
          }),
        );
      }
    }

    return lenses;
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

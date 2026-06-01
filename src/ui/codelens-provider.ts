import * as vscode from 'vscode';

/**
 * Regex that matches a git conflict start marker at the beginning of a line.
 * Handles 6-, 7-, and 8-character forms, with an optional trailing label.
 *
 * IMPORTANT: this regex has the `/g` flag and is shared across calls.
 * Always reset `CONFLICT_START_RE.lastIndex = 0` before entering the exec loop.
 */
export const CONFLICT_START_RE = /^(<{6,8})( .*)?$/gm;

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

  /**
   * Cache keyed by document URI + version so getText() and the regex scan are
   * not repeated when VS Code calls provideCodeLenses for the same document
   * version multiple times (e.g. from multiple language features requesting
   * lenses on the same pass).
   */
  private cache = new Map<string, vscode.CodeLens[]>();

  setMergeActive(active: boolean): void {
    if (this.hasActiveMerge !== active) {
      this.hasActiveMerge = active;
      if (!active) {
        this.cache.clear();
      }
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

    const cacheKey = `${document.uri.toString()}@${document.version}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const text = document.getText();
    const lenses: vscode.CodeLens[] = [];

    // Match canonical 7-char markers AND the rare Git Brand variant (`<<<<<<` 6+).
    // We anchor to start-of-line to avoid matching inline tokens in docs.
    // Note: we tolerate trailing label text (`<<<<<<< HEAD`, `<<<<<<< theirs`).
    // Reset lastIndex: CONFLICT_START_RE is a shared module-level regex with /g flag.
    CONFLICT_START_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CONFLICT_START_RE.exec(text)) !== null) {
      if (token.isCancellationRequested) return lenses;
      const lineIndex = document.positionAt(match.index).line;
      const range = new vscode.Range(lineIndex, 0, lineIndex, 0);

      lenses.push(
        new vscode.CodeLens(range, {
          title: vscode.l10n.t('$(arrow-left) Take Ours'),
          command: 'gitfix.codelens.takeOurs',
          arguments: [document.uri, lineIndex],
        }),
        new vscode.CodeLens(range, {
          title: vscode.l10n.t('$(arrow-right) Take Theirs'),
          command: 'gitfix.codelens.takeTheirs',
          arguments: [document.uri, lineIndex],
        }),
        new vscode.CodeLens(range, {
          title: vscode.l10n.t('$(wand) Resolve with Mergiraf'),
          command: 'gitfix.codelens.runMergiraf',
          arguments: [document.uri, lineIndex],
        }),
      );

      if (this.aiAvailable) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: vscode.l10n.t('$(sparkle) Resolve with AI'),
            command: 'gitfix.codelens.resolveWithAi',
            arguments: [document.uri, lineIndex],
          }),
        );
      }
    }

    this.cache.set(cacheKey, lenses);
    return lenses;
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

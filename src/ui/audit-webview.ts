import * as vscode from 'vscode';
import type { AuditEnvelope } from '../mcp/types';

export class AuditPanel {
  private static instance: AuditPanel | undefined;
  private panel: vscode.WebviewPanel;

  static showOrUpdate(audit: AuditEnvelope, context: vscode.ExtensionContext): AuditPanel {
    if (AuditPanel.instance) {
      AuditPanel.instance.update(audit);
      AuditPanel.instance.panel.reveal();
      return AuditPanel.instance;
    }
    const panel = vscode.window.createWebviewPanel(
      'gitfix.audit',
      'gitfix Audit',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    const instance = new AuditPanel(panel, audit);
    AuditPanel.instance = instance;
    panel.onDidDispose(() => {
      AuditPanel.instance = undefined;
    });
    context.subscriptions.push(panel);
    return instance;
  }

  private constructor(panel: vscode.WebviewPanel, audit: AuditEnvelope) {
    this.panel = panel;
    this.update(audit);

    panel.webview.onDidReceiveMessage((msg: { type: string; payload?: unknown }) => {
      if (msg.type === 'copyShareCmd') {
        const cmd = `git push origin refs/gitfix/audit/${audit.metadata.merge_id}`;
        vscode.env.clipboard.writeText(cmd).then(() => {
          vscode.window.showInformationMessage(`Copied: ${cmd}`);
        });
      }
    });
  }

  update(audit: AuditEnvelope): void {
    this.panel.webview.html = this.render(audit);
  }

  private render(a: AuditEnvelope): string {
    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
      );
    const rows = a.decisions
      .map(
        (d) => `
          <tr>
            <td><code>${esc(d.file)}</code></td>
            <td>${esc(d.kind)}</td>
            <td>${esc(d.actor)}</td>
            <td>${esc(d.at)}</td>
          </tr>`,
      )
      .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
  h1, h2 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  th { font-weight: 600; color: var(--vscode-descriptionForeground); }
  code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px; }
  .meta { display: grid; grid-template-columns: max-content 1fr; column-gap: 12px; row-gap: 4px; }
  .meta dt { color: var(--vscode-descriptionForeground); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 6px 12px; border-radius: 2px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
  <h1>Merge ${esc(a.metadata.merge_id)}</h1>
  <dl class="meta">
    <dt>Target</dt><dd><code>${esc(a.metadata.target_branch)}</code></dd>
    <dt>Sources</dt><dd>${a.metadata.sources.map((s) => `<code>${esc(s)}</code>`).join(', ')}</dd>
    <dt>Strategy</dt><dd>${esc(a.metadata.strategy)}</dd>
    <dt>Substrate</dt><dd>${esc(a.metadata.substrate)}</dd>
    <dt>Started</dt><dd>${esc(a.metadata.started_at)}</dd>
    ${a.metadata.applied_at ? `<dt>Applied</dt><dd>${esc(a.metadata.applied_at)}</dd>` : ''}
    ${a.metadata.commit_oid ? `<dt>Commit</dt><dd><code>${esc(a.metadata.commit_oid)}</code></dd>` : ''}
  </dl>

  <h2>Resolved (${a.plan.resolved.length})</h2>
  <table>
    <thead><tr><th>File</th><th>Via</th><th>Ours</th><th>Theirs</th></tr></thead>
    <tbody>
      ${a.plan.resolved
        .map(
          (r) => `<tr>
            <td><code>${esc(r.file)}</code></td>
            <td>${esc(r.via)}${r.via === 'rerere' ? ' &#8635;' : ''}</td>
            <td><code>${esc(r.ours_oid.slice(0, 8))}</code></td>
            <td><code>${esc(r.theirs_oid.slice(0, 8))}</code></td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>

  <h2>Decisions (${a.decisions.length})</h2>
  <table>
    <thead><tr><th>File</th><th>Kind</th><th>Actor</th><th>At</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <p style="margin-top: 16px;">
    <button onclick="vscode.postMessage({type:'copyShareCmd'})">Copy git command to share this audit</button>
  </p>
<script>
  const vscode = acquireVsCodeApi();
</script>
</body>
</html>`;
  }
}

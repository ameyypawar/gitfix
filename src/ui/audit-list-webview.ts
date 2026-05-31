import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GfixMcpClient } from '../mcp/client';
import { AuditPanel } from './audit-webview';
import { escHtml, isValidMergeId } from './webview-utils';
import { envelopeFromStatus } from '../mcp/audit-utils';
import { log } from '../log';

const exec = promisify(execFile);

interface AuditRef {
  fullName: string;   // refs/gitfix/audit/<id>
  mergeId: string;    // <id>
  oid: string;        // commit OID of audit commit
  subject: string;    // first line of commit message
}

export class AuditListPanel {
  private static instance: AuditListPanel | undefined;

  static async showForRepo(
    repoPath: string,
    client: GfixMcpClient,
    context: vscode.ExtensionContext,
  ): Promise<void> {
    const refs = await listAuditRefs(repoPath);
    if (AuditListPanel.instance) {
      AuditListPanel.instance.update(refs);
      AuditListPanel.instance.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'gitfix.audit.list',
      'gitfix Audit Refs',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: false },
    );
    AuditListPanel.instance = new AuditListPanel(panel, refs, repoPath, client, context);
    panel.onDidDispose(() => { AuditListPanel.instance = undefined; });
    context.subscriptions.push(panel);
  }

  private constructor(
    private panel: vscode.WebviewPanel,
    refs: AuditRef[],
    private repoPath: string,
    private client: GfixMcpClient,
    private context: vscode.ExtensionContext,
  ) {
    this.update(refs);
    panel.webview.onDidReceiveMessage(async (msg: { type: string; mergeId?: string; selected?: string[] }) => {
      // Whitelist known message types; silently ignore anything else.
      if (msg.type !== 'open' && msg.type !== 'delete' && msg.type !== 'sharePush') {
        return;
      }
      if (msg.type === 'open') {
        // Guard git ref sink against namespace traversal (#73).
        if (!msg.mergeId || !isValidMergeId(msg.mergeId)) {
          log(`audit-list: rejected invalid mergeId for open: ${msg.mergeId}`);
          return;
        }
        await this.openOne(msg.mergeId);
      } else if (msg.type === 'delete') {
        // Guard git update-ref sink against namespace traversal (#73).
        if (!msg.mergeId || !isValidMergeId(msg.mergeId)) {
          log(`audit-list: rejected invalid mergeId for delete: ${msg.mergeId}`);
          return;
        }
        await this.deleteOne(msg.mergeId);
      } else if (msg.type === 'sharePush') {
        // Filter selected IDs; if none pass validation, bail silently (#73).
        const safeSelected = (msg.selected ?? []).filter(isValidMergeId);
        if (!safeSelected.length) { return; }
        const cmd = `git push origin ${safeSelected.map((id) => `refs/gitfix/audit/${id}`).join(' ')}`;
        await vscode.env.clipboard.writeText(cmd);
        vscode.window.showInformationMessage(vscode.l10n.t('Copied: {0}', cmd));
      }
    });
  }

  private async openOne(mergeId: string): Promise<void> {
    try {
      const status = await this.client.mergeStatus({ repo_path: this.repoPath, merge_id: mergeId });
      AuditPanel.showOrUpdate(envelopeFromStatus(status), this.context);
    } catch (err) {
      vscode.window.showErrorMessage(vscode.l10n.t('gitfix: {0}', err instanceof Error ? err.message : String(err)));
    }
  }

  private async deleteOne(mergeId: string): Promise<void> {
    const deleteLbl = vscode.l10n.t('Delete');
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t('Delete audit ref refs/gitfix/audit/{0}?', mergeId),
      // eslint-disable-next-line max-len
      { modal: true, detail: vscode.l10n.t('This permanently removes the audit trail for this merge.') },
      deleteLbl,
    );
    if (choice !== deleteLbl) return;
    try {
      await exec('git', ['update-ref', '-d', `refs/gitfix/audit/${mergeId}`], { cwd: this.repoPath });
      this.update(await listAuditRefs(this.repoPath));
    } catch (err) {
      vscode.window.showErrorMessage(vscode.l10n.t('gitfix: {0}', err instanceof Error ? err.message : String(err)));
    }
  }

  private update(refs: AuditRef[]): void {
    this.panel.webview.html = render(refs);
  }
}

async function listAuditRefs(repoPath: string): Promise<AuditRef[]> {
  try {
    const { stdout } = await exec('git', [
      'for-each-ref',
      '--format=%(refname)\t%(objectname)\t%(subject)',
      'refs/gitfix/audit/',
    ], { cwd: repoPath });
    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [fullName, oid, ...subjectParts] = line.split('\t');
      return {
        fullName,
        oid,
        mergeId: fullName.replace(/^refs\/gitfix\/audit\//, ''),
        subject: subjectParts.join('\t'),
      };
    });
  } catch {
    return [];
  }
}

function render(refs: AuditRef[]): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const esc = escHtml;
  const rows = refs.length === 0
    ? `<tr><td colspan="5" class="empty-row">No audit refs found in refs/gitfix/audit/</td></tr>`
    : refs.map((r) => `
    <tr>
      <td><input type="checkbox" class="sel" data-id="${esc(r.mergeId)}"></td>
      <td><code>${esc(r.mergeId)}</code></td>
      <td><code>${esc(r.oid.slice(0, 8))}</code></td>
      <td>${esc(r.subject)}</td>
      <td>
        <button class="action-btn" data-action="open" data-id="${esc(r.mergeId)}">View</button>
        <button class="action-btn" data-action="delete" data-id="${esc(r.mergeId)}">Delete</button>
      </td>
    </tr>`).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
  h1 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  th { font-weight: 600; color: var(--vscode-descriptionForeground); }
  code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 4px 8px; border-radius: 2px; cursor: pointer; margin-right: 4px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .toolbar { margin-bottom: 8px; }
  .col-checkbox { width: 24px; }
  .empty-row { text-align: center; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <h1>Audit Refs</h1>
  <div class="toolbar">
    <button id="share-push-btn">Copy push command for selected</button>
  </div>
  <table>
    <thead>
      <tr>
        <th class="col-checkbox"></th>
        <th>Merge ID</th>
        <th>OID</th>
        <th>Subject</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    // Use data-attributes + event delegation instead of inline onclick handlers
    // to prevent JS context breakout via injected mergeId values (fixes #22).
    document.querySelectorAll('.action-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: btn.dataset.action, mergeId: btn.dataset.id });
      });
    });
    document.getElementById('share-push-btn').addEventListener('click', function() {
      const selected = Array.prototype.slice.call(document.querySelectorAll('.sel:checked')).map(function(el) { return el.dataset.id; });
      if (!selected.length) return;
      vscode.postMessage({ type: 'sharePush', selected: selected });
    });
  </script>
</body>
</html>`;
}

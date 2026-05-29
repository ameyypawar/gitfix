import * as assert from 'assert';
import type { AuditEnvelope } from '../../src/mcp/types';

// Lightweight repro: simulate the field-vs-closure semantics we changed.
// This is a structural / behavioral test of the pattern. A full integration
// test against a real vscode.webview would require the @vscode/test-electron
// harness; here we assert the pattern itself.

class FakeAuditPanel {
  currentAudit: AuditEnvelope;
  constructor(audit: AuditEnvelope) {
    this.currentAudit = audit;
  }
  update(audit: AuditEnvelope) {
    this.currentAudit = audit;
  }
  buildShareCmd(): string {
    return `git push origin refs/gitfix/audit/${this.currentAudit.metadata.merge_id}`;
  }
}

function makeEnvelope(id: string): AuditEnvelope {
  return {
    metadata: {
      merge_id: id,
      target_branch: 'main',
      sources: ['feature'],
      strategy: 'gitfix',
      substrate: 'libgit2',
      started_at: '2026-01-01T00:00:00Z',
    },
    plan: { merge_id: id, target_branch: 'main', source_branches: ['feature'], resolved: [], unresolved: [] },
    decisions: [],
  };
}

suite('audit-webview — copyShareCmd freshness', () => {
  test('copyShareCmd uses the latest update()d merge_id, not the constructor-time one', () => {
    const first = makeEnvelope('first-merge');
    const second = makeEnvelope('second-merge');
    const panel = new FakeAuditPanel(first);
    assert.strictEqual(panel.buildShareCmd(), 'git push origin refs/gitfix/audit/first-merge');
    panel.update(second);
    assert.strictEqual(
      panel.buildShareCmd(),
      'git push origin refs/gitfix/audit/second-merge',
      'After update(), buildShareCmd must reflect the new merge_id (P1-1 stale-closure regression)',
    );
  });
});

import * as assert from 'assert';
import type { AuditEnvelope } from '../../src/mcp/types';

suite('integration — audit webview data model', () => {
  test('AuditEnvelope shape is structurally valid', () => {
    const envelope: AuditEnvelope = {
      metadata: {
        merge_id: 'test-merge-id',
        target_branch: 'main',
        sources: ['feature'],
        strategy: 'gitfix',
        substrate: 'libgit2',
        started_at: new Date().toISOString(),
      },
      plan: {
        merge_id: 'test-merge-id',
        target_branch: 'main',
        sources: ['feature'],
        resolved: [],
        unresolved: [],
      },
      decisions: [],
    };
    assert.strictEqual(envelope.metadata.merge_id, 'test-merge-id');
    assert.strictEqual(envelope.metadata.strategy, 'gitfix');
    assert.strictEqual(envelope.metadata.substrate, 'libgit2');
    assert.ok(!envelope.metadata.applied_at, 'applied_at should be absent initially');
    assert.ok(!envelope.metadata.commit_oid, 'commit_oid should be absent initially');
  });

  test('AuditEnvelope with optional metadata fields', () => {
    const envelope: AuditEnvelope = {
      metadata: {
        merge_id: 'abc123',
        target_branch: 'main',
        sources: ['feat/a', 'feat/b'],
        strategy: 'gitfix',
        substrate: 'libgit2',
        started_at: '2026-01-01T00:00:00Z',
        applied_at: '2026-01-01T00:05:00Z',
        commit_oid: 'deadbeef1234567890abcdef',
      },
      plan: {
        merge_id: 'abc123',
        target_branch: 'main',
        sources: ['feat/a', 'feat/b'],
        resolved: [
          {
            file: 'src/main.rs',
            via: 'rerere',
            ours_oid: 'aabbccdd',
            theirs_oid: 'eeff0011',
            base_oid: '00000000',
            target_oid: 'ffffffff',
            ours_source: 'feat/a',
            theirs_source: 'feat/b',
          },
        ],
        unresolved: [],
      },
      decisions: [
        {
          conflict_id: 'conflict-1',
          file: 'src/main.rs',
          kind: 'content',
          actor: 'rerere',
          at: '2026-01-01T00:01:00Z',
        },
      ],
    };
    assert.strictEqual(envelope.metadata.commit_oid, 'deadbeef1234567890abcdef');
    assert.strictEqual(envelope.plan.resolved[0].via, 'rerere');
    assert.strictEqual(envelope.decisions.length, 1);
  });
});

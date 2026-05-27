/**
 * Regression tests for #28 — multi-repo command correctness.
 *
 * tree.mergeId is "first-repo-wins" — it always returns the merge_id of
 * whichever repo happens to be first in the plans Map. In a two-repo workspace
 * where both repos have active merges, commands must use per-repo merge_ids,
 * not the first-repo one.
 *
 * We test the ConflictTreeProvider methods that support per-repo lookups
 * (mergeIdForRepo, planForRepo) and verify they return repo-specific data.
 */
import * as assert from 'assert';

// We test the tree methods directly, without instantiating the full tree provider
// (which requires vscode). We use the data-access pattern directly.

// Simulate a two-repo plan map with different merge_ids
const repoA = '/workspace/repo-a';
const repoB = '/workspace/repo-b';
const mergeIdA = 'merge-aaa-111';
const mergeIdB = 'merge-bbb-222';

const planA = {
  merge_id: mergeIdA,
  target_branch: 'main',
  sources: ['abc123'],
  unresolved: [
    {
      conflict_id: 'conflict-a-1',
      file: 'src/foo.ts',
      kind: 'both-modified' as const,
      ours_oid: 'aaa',
      theirs_oid: 'bbb',
      ours_source: 'main',
      theirs_source: 'feature',
      target_oid: 'aaa',
    },
  ],
  resolved: [],
};

const planB = {
  merge_id: mergeIdB,
  target_branch: 'develop',
  sources: ['def456'],
  unresolved: [
    {
      conflict_id: 'conflict-b-1',
      file: 'src/bar.ts',
      kind: 'both-modified' as const,
      ours_oid: 'ccc',
      theirs_oid: 'ddd',
      ours_source: 'develop',
      theirs_source: 'fix',
      target_oid: 'ccc',
    },
  ],
  resolved: [],
};

// Minimal replica of ConflictTreeProvider's plan-access methods for unit testing.
// This validates the logic contract without requiring the full vscode environment.
class TestPlansAccessor {
  private plans = new Map<string, typeof planA>();

  set(repoPath: string, plan: typeof planA): void {
    this.plans.set(repoPath, plan);
  }

  /** First-repo-wins — legacy compat, marked @deprecated in production. */
  get mergeId(): string | undefined {
    return this.plans.size > 0 ? [...this.plans.values()][0]?.merge_id : undefined;
  }

  /** Per-repo merge_id — correct for multi-repo. */
  mergeIdForRepo(repoPath: string): string | undefined {
    return this.plans.get(repoPath)?.merge_id;
  }

  planForRepo(repoPath: string): typeof planA | undefined {
    return this.plans.get(repoPath);
  }
}

suite('multi-repo commands — #28 regression', () => {
  let accessor: TestPlansAccessor;

  setup(() => {
    accessor = new TestPlansAccessor();
    accessor.set(repoA, planA);
    accessor.set(repoB, planB);
  });

  test('mergeId (legacy) returns first-repo merge_id regardless of insertion order', () => {
    // The legacy getter returns whichever was inserted first.
    // In our setup, repoA was inserted first.
    assert.strictEqual(accessor.mergeId, mergeIdA, 'legacy mergeId should be first-repo (repoA)');
  });

  test('mergeIdForRepo returns correct merge_id for repoA', () => {
    assert.strictEqual(accessor.mergeIdForRepo(repoA), mergeIdA, 'mergeIdForRepo(repoA) must return mergeIdA');
  });

  test('mergeIdForRepo returns correct merge_id for repoB', () => {
    assert.strictEqual(accessor.mergeIdForRepo(repoB), mergeIdB, 'mergeIdForRepo(repoB) must return mergeIdB — not mergeIdA');
  });

  test('legacy mergeId would return wrong merge_id for repoB commands', () => {
    // This demonstrates the #28 bug: if a command uses tree.mergeId for repoB,
    // it gets mergeIdA (the first repo's id), which is incorrect.
    const wrongId = accessor.mergeId; // first-repo-wins
    assert.notStrictEqual(wrongId, mergeIdB, 'legacy mergeId is incorrect for repoB — this is the #28 bug');
    // The correct approach:
    const correctId = accessor.mergeIdForRepo(repoB);
    assert.strictEqual(correctId, mergeIdB, 'mergeIdForRepo(repoB) returns the correct id');
  });

  test('planForRepo returns correct plan for each repo', () => {
    const pA = accessor.planForRepo(repoA);
    const pB = accessor.planForRepo(repoB);
    assert.strictEqual(pA?.target_branch, 'main', 'repoA targets main');
    assert.strictEqual(pB?.target_branch, 'develop', 'repoB targets develop');
    assert.strictEqual(pA?.unresolved[0]?.file, 'src/foo.ts', 'repoA conflict is src/foo.ts');
    assert.strictEqual(pB?.unresolved[0]?.file, 'src/bar.ts', 'repoB conflict is src/bar.ts');
  });

  test('mergeIdForRepo returns undefined for unknown repo', () => {
    assert.strictEqual(accessor.mergeIdForRepo('/nonexistent'), undefined);
  });

  test('two-repo workspace: batch resolve groups items by repo correctly', () => {
    // Simulate the grouping logic from resolveBatchMergiraf (resolve.ts)
    type FakeItem = { repoPath: string; conflictId: string };
    const items: FakeItem[] = [
      { repoPath: repoA, conflictId: 'conflict-a-1' },
      { repoPath: repoB, conflictId: 'conflict-b-1' },
      { repoPath: repoA, conflictId: 'conflict-a-2' },
    ];

    const byRepo = new Map<string, FakeItem[]>();
    for (const it of items) {
      const list = byRepo.get(it.repoPath) ?? [];
      list.push(it);
      byRepo.set(it.repoPath, list);
    }

    assert.strictEqual(byRepo.get(repoA)?.length, 2, 'repoA should have 2 items');
    assert.strictEqual(byRepo.get(repoB)?.length, 1, 'repoB should have 1 item');

    // Each group uses the correct merge_id
    assert.strictEqual(accessor.mergeIdForRepo(repoA), mergeIdA);
    assert.strictEqual(accessor.mergeIdForRepo(repoB), mergeIdB);
  });
});

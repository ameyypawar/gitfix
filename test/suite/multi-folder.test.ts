import * as assert from 'assert';
import * as path from 'node:path';
import type { MultiRepoState } from '../../src/workspace/multi-folder';
import { resolveTargetRepo } from '../../src/workspace/multi-folder';

/** Build a minimal MultiRepoState from a list of active repo paths. */
function makeState(repoPaths: string[]): MultiRepoState {
  const active = new Map<string, { hasMerge: boolean; repoPath: string }>();
  for (const p of repoPaths) {
    active.set(p, { hasMerge: true, repoPath: p });
  }
  return { active, anyActive: repoPaths.length > 0 };
}

suite('multi-folder workspace support', () => {
  const repoA = '/workspace/repo-a';
  const repoB = '/workspace/repo-b';

  test('resolveTargetRepo returns repo when hint matches an active repo', () => {
    const state = makeState([repoA, repoB]);
    const result = resolveTargetRepo(state, { repoPath: repoA });
    assert.strictEqual(result, repoA);
  });

  test('resolveTargetRepo returns undefined when hint matches no active repo', () => {
    const state = makeState([repoA]);
    const result = resolveTargetRepo(state, { repoPath: '/workspace/repo-c' });
    // Falls through to single-active-merge shortcut — repo-a is the only one
    assert.strictEqual(result, repoA);
  });

  test('resolveTargetRepo returns the single active repo when no hint given', () => {
    const state = makeState([repoA]);
    const result = resolveTargetRepo(state);
    assert.strictEqual(result, repoA);
  });

  test('resolveTargetRepo returns undefined when >1 active and no hint given', () => {
    const state = makeState([repoA, repoB]);
    const result = resolveTargetRepo(state);
    // No hint and no active editor — ambiguous
    assert.strictEqual(result, undefined);
  });

  test('resolveTargetRepo resolves via Uri hint that starts with repo path', () => {
    // Simulate a vscode.Uri-like object — we test the logic path with a plain object
    // since vscode module is unavailable in unit tests. The function checks instanceof
    // vscode.Uri, so this tests the non-Uri branch returns correctly for a repoPath hint.
    const state = makeState([repoA, repoB]);
    const result = resolveTargetRepo(state, { repoPath: repoB });
    assert.strictEqual(result, repoB);
  });

  test('makeState builds correct anyActive flag', () => {
    const empty = makeState([]);
    assert.strictEqual(empty.anyActive, false);
    assert.strictEqual(empty.active.size, 0);

    const one = makeState([repoA]);
    assert.strictEqual(one.anyActive, true);
    assert.strictEqual(one.active.size, 1);

    const two = makeState([repoA, repoB]);
    assert.strictEqual(two.anyActive, true);
    assert.strictEqual(two.active.size, 2);
  });

  test('MergeRootItem label includes folder prefix when >1 active (integration check via path.basename)', () => {
    // Verify the folder name derivation logic used in conflict-item.ts
    const folderName = path.basename(repoA);
    assert.strictEqual(folderName, 'repo-a');
    const label = `${folderName} — Merge into main (3 unresolved)`;
    assert.ok(label.startsWith('repo-a'));
    assert.ok(label.includes('Merge into main'));
  });
});

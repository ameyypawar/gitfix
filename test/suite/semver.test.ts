import * as assert from 'assert';
import { semverGte } from '../../src/util/semver';

suite('semver — semverGte', () => {
  test('equal stable versions', () => {
    assert.strictEqual(semverGte('1.0.0', '1.0.0'), true);
    assert.strictEqual(semverGte('0.1.0', '0.1.0'), true);
  });

  test('newer major beats older', () => {
    assert.strictEqual(semverGte('2.0.0', '1.9.9'), true);
    assert.strictEqual(semverGte('1.0.0', '2.0.0'), false);
  });

  test('newer minor beats older', () => {
    assert.strictEqual(semverGte('0.2.0', '0.1.9'), true);
    assert.strictEqual(semverGte('0.1.0', '0.2.0'), false);
  });

  test('newer patch beats older', () => {
    assert.strictEqual(semverGte('0.1.1', '0.1.0'), true);
    assert.strictEqual(semverGte('0.1.0', '0.1.1'), false);
  });

  test('stable beats pre-release of same numeric base', () => {
    assert.strictEqual(semverGte('0.1.0', '0.1.0-alpha.3'), true);
    assert.strictEqual(semverGte('0.1.0-alpha.3', '0.1.0'), false);
  });

  test('pre-release revision ordering (gfix floor check case)', () => {
    // 0.1.0-alpha.3 >= 0.1.0-alpha.3
    assert.strictEqual(semverGte('0.1.0-alpha.3', '0.1.0-alpha.3'), true);
    // 0.1.0-alpha.3 >= 0.1.0-alpha.2
    assert.strictEqual(semverGte('0.1.0-alpha.3', '0.1.0-alpha.2'), true);
    // 0.1.0-alpha.2 < 0.1.0-alpha.3
    assert.strictEqual(semverGte('0.1.0-alpha.2', '0.1.0-alpha.3'), false);
    // 0.1.0-alpha.10 >= 0.1.0-alpha.3 (numeric, not lexicographic)
    assert.strictEqual(semverGte('0.1.0-alpha.10', '0.1.0-alpha.3'), true);
  });

  test('pre-release tag comparison (alpha vs beta)', () => {
    // beta > alpha alphabetically
    assert.strictEqual(semverGte('0.1.0-beta.1', '0.1.0-alpha.3'), true);
    assert.strictEqual(semverGte('0.1.0-alpha.3', '0.1.0-beta.1'), false);
  });

  test('unparseable version returns false', () => {
    assert.strictEqual(semverGte('unknown', '0.1.0-alpha.3'), false);
    assert.strictEqual(semverGte('0.1.0-alpha.3', 'not-found'), false);
    assert.strictEqual(semverGte('', '0.1.0'), false);
  });

  test('numeric base beats any pre-release across higher minor', () => {
    // 0.2.0-alpha.1 > 0.1.9 (minor wins before pre-release check)
    assert.strictEqual(semverGte('0.2.0-alpha.1', '0.1.9'), true);
  });
});

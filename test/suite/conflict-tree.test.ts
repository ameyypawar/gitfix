import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getMergeHeadOid } from '../../src/git/detect';

suite('git/detect — getMergeHeadOid', () => {
  let tmpDir: string;
  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfix-detect-test-'));
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
  });
  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns trimmed OID from .git/MERGE_HEAD', () => {
    const oid = 'deadbeefcafef00d1234567890abcdef12345678';
    fs.writeFileSync(path.join(tmpDir, '.git', 'MERGE_HEAD'), oid + '\n');
    assert.strictEqual(getMergeHeadOid(tmpDir), oid);
  });

  test('returns the first OID for octopus merges (multi-line)', () => {
    const oids = [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ];
    fs.writeFileSync(path.join(tmpDir, '.git', 'MERGE_HEAD'), oids.join('\n') + '\n');
    assert.strictEqual(getMergeHeadOid(tmpDir), oids[0]);
  });

  test('returns undefined when MERGE_HEAD does not exist', () => {
    assert.strictEqual(getMergeHeadOid(tmpDir), undefined);
  });

  test('returns undefined when MERGE_HEAD is empty', () => {
    fs.writeFileSync(path.join(tmpDir, '.git', 'MERGE_HEAD'), '');
    assert.strictEqual(getMergeHeadOid(tmpDir), undefined);
  });

  test('returns undefined when MERGE_HEAD is whitespace only', () => {
    fs.writeFileSync(path.join(tmpDir, '.git', 'MERGE_HEAD'), '\n\n');
    assert.strictEqual(getMergeHeadOid(tmpDir), undefined);
  });
});

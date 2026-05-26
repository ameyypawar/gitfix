import * as assert from 'assert';
import * as fs from 'node:fs';
import { setupSimpleMergeFixture } from './harness';

suite('integration — happy path', () => {
  let tmpDir: string | undefined;

  teardown(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  test('setupSimpleMergeFixture creates a repo with a conflict', async () => {
    tmpDir = await setupSimpleMergeFixture();
    assert.ok(fs.existsSync(tmpDir), 'tmp dir should exist');
    const mergeHead = `${tmpDir}/.git/MERGE_HEAD`;
    assert.ok(
      fs.existsSync(mergeHead),
      'MERGE_HEAD should exist after a conflicting git merge',
    );
    const readme = fs.readFileSync(`${tmpDir}/README.md`, 'utf8');
    assert.ok(
      readme.includes('<<<<<<<'),
      'README.md should contain conflict markers',
    );
  });
});

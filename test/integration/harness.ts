import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export async function setupSimpleMergeFixture(): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfix-int-'));
  cp.execSync('git init -b main', { cwd: tmp });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'base\n');
  cp.execSync('git add . && git -c user.email=t@t -c user.name=t commit -m base', { cwd: tmp, shell: '/bin/sh' });
  cp.execSync('git checkout -b feature', { cwd: tmp });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'feature\n');
  cp.execSync('git -c user.email=t@t -c user.name=t commit -am feature', { cwd: tmp });
  cp.execSync('git checkout main', { cwd: tmp });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'main-update\n');
  cp.execSync('git -c user.email=t@t -c user.name=t commit -am main-update', { cwd: tmp });
  try {
    cp.execSync('git merge feature --no-edit', { cwd: tmp });
  } catch {
    // Expected to fail with a conflict.
  }
  return tmp;
}

/**
 * Poll for an in-progress merge by waiting for the workspace's `.git/MERGE_HEAD`
 * to exist. This is the same signal the production MergeStateDetector uses and
 * does not depend on any internal VS Code commands.
 */
export async function waitForMergeHead(repoPath: string, timeoutMs = 5000): Promise<void> {
  const mergeHead = path.join(repoPath, '.git', 'MERGE_HEAD');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(mergeHead)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`.git/MERGE_HEAD never appeared at ${mergeHead}`);
}

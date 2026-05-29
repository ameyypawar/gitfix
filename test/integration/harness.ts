import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Explicit git identity environment variables.
 *
 * GitHub Actions CI (and other clean CI environments) sets GIT_AUTHOR_NAME and
 * GIT_COMMITTER_NAME to empty strings. Because environment variables take
 * precedence over both `git -c` flags and local repo config, this causes every
 * `git commit` in the fixture to fail with "empty ident name not allowed".
 *
 * The fix: propagate the full process environment but override the four
 * GIT_AUTHOR_* and GIT_COMMITTER_* variables with deterministic non-empty values.
 * These values are used only in the disposable temp-repo fixture; they have no
 * effect on the host repo.
 */
const GIT_IDENTITY_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'gitfix-test',
  GIT_AUTHOR_EMAIL: 'gitfix-test@localhost',
  GIT_COMMITTER_NAME: 'gitfix-test',
  GIT_COMMITTER_EMAIL: 'gitfix-test@localhost',
};

export interface MergeFixture {
  /** Absolute path to the temporary git repository. */
  repoPath: string;
  /** Name of the source branch being merged (the branch that conflicts with main). */
  sourceBranch: string;
}

export async function setupSimpleMergeFixture(): Promise<MergeFixture> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfix-int-'));
  const sourceBranch = 'feature';

  cp.execSync('git init -b main', { cwd: tmp, env: GIT_IDENTITY_ENV });

  // Also write identity into the repo's local config so tools that read
  // .git/config (e.g. gfix) see a valid author even if they bypass env vars.
  cp.execSync('git config user.email gitfix-test@localhost', { cwd: tmp, env: GIT_IDENTITY_ENV });
  cp.execSync('git config user.name gitfix-test', { cwd: tmp, env: GIT_IDENTITY_ENV });

  // Base commit on main.
  fs.writeFileSync(path.join(tmp, 'README.md'), 'base\n');
  cp.execSync('git add .', { cwd: tmp, env: GIT_IDENTITY_ENV });
  cp.execSync('git commit -m base', { cwd: tmp, env: GIT_IDENTITY_ENV });

  // Feature branch: changes the same line as main will change, guaranteeing a
  // content conflict (not a trivial auto-merge).
  cp.execSync(`git checkout -b ${sourceBranch}`, { cwd: tmp, env: GIT_IDENTITY_ENV });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'feature\n');
  cp.execSync('git commit -am feature', { cwd: tmp, env: GIT_IDENTITY_ENV });

  // Main branch: independently changes the same line.
  cp.execSync('git checkout main', { cwd: tmp, env: GIT_IDENTITY_ENV });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'main-update\n');
  cp.execSync('git commit -am main-update', { cwd: tmp, env: GIT_IDENTITY_ENV });

  try {
    cp.execSync(`git merge ${sourceBranch} --no-edit`, { cwd: tmp, env: GIT_IDENTITY_ENV });
  } catch {
    // Expected to fail with a conflict.
  }
  return { repoPath: tmp, sourceBranch };
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

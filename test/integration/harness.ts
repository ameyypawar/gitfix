import * as vscode from 'vscode';
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

export async function waitForMergeContext(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ctx = await vscode.commands.executeCommand('getContext', 'gitfix:hasMerge');
    if (ctx) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('gitfix:hasMerge never set');
}

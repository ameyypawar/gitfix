#!/usr/bin/env node
/**
 * setup.js — Cross-platform port of setup.sh.
 * Creates a temporary git repo with a merge conflict in README.md.
 *
 * Usage: node setup.js [dest-dir]
 * If dest-dir is omitted, a random temp directory is created.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dest = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'gitfix-fixture-'));
console.log(`Creating fixture at ${dest}`);

const git = (args, cwd) => execFileSync('git', args, { cwd: cwd ?? dest, stdio: 'pipe', encoding: 'utf8' });

fs.mkdirSync(dest, { recursive: true });

git(['init', '-b', 'main'], dest);
git(['config', 'user.email', 'test@example.com']);
git(['config', 'user.name', 'Test User']);

fs.writeFileSync(path.join(dest, 'README.md'), 'base\n');
git(['add', 'README.md']);
git(['commit', '-m', 'base']);

git(['checkout', '-b', 'feature']);
fs.writeFileSync(path.join(dest, 'README.md'), 'feature\n');
git(['commit', '-am', 'feature change']);

git(['checkout', 'main']);
fs.writeFileSync(path.join(dest, 'README.md'), 'main-update\n');
git(['commit', '-am', 'main update']);

try {
  git(['merge', 'feature', '--no-edit']);
} catch {
  // Expected to fail with a conflict in README.md
}

console.log(`Fixture ready at ${dest}`);
console.log('README.md should have conflict markers');
process.stdout.write(dest + '\n');

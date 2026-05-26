#!/usr/bin/env node
/**
 * check-l10n.js — Scan src/**\/\*.ts for user-facing 'gitfix: ' string literals
 * that are NOT wrapped in vscode.l10n.t() calls. Fails the lint if any are found.
 *
 * Usage: node scripts/check-l10n.js
 */

const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.resolve(__dirname, '..', 'src');
const violations = [];

/**
 * Walk a directory recursively, collecting .ts files.
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  const results = [];
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walk(fullPath));
    } else if (name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk(srcDir);

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    // Match lines containing 'gitfix: ' string literals that are NOT inside l10n.t(
    // Strategy: look for showErrorMessage/showWarningMessage/showInformationMessage
    // calls with a raw string starting with 'gitfix: ' or "gitfix: " NOT preceded by l10n.t(
    const rawStringRe = /(?<!l10n\.t\()['"]gitfix:\s/g;
    if (rawStringRe.test(line)) {
      violations.push(`${file}:${idx + 1}: raw 'gitfix: ' string literal outside l10n.t()\n  ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error(`[check-l10n] ${violations.length} violation(s) found:\n`);
  for (const v of violations) {
    console.error(`  ${v}\n`);
  }
  process.exit(1);
} else {
  console.log(`[check-l10n] OK — no raw 'gitfix: ' strings found outside l10n.t() (${files.length} files scanned).`);
}

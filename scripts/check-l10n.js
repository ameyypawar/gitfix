#!/usr/bin/env node
/**
 * check-l10n.js — Scan src/**\/*.ts for user-facing 'gitfix: ' string literals
 * that are NOT wrapped in vscode.l10n.t() calls. Fails the lint if any are found.
 *
 * Scans whole-file content (not line-by-line) so multi-line l10n.t(
 *   'gitfix: ...'
 * ) calls are correctly recognised as wrapped and not flagged.
 *
 * Usage: node scripts/check-l10n.js
 */

'use strict';

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

/**
 * Return the 1-based line number for a character offset within text.
 * @param {string} text
 * @param {number} offset
 * @returns {number}
 */
function lineAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

// Regex to find any quote-delimited 'gitfix: ' or "gitfix: " occurrence.
// Declared once at module scope; use matchAll with a fresh string each time
// so there is no per-call regex allocation and no .lastIndex state issue.
const RAW_STRING_RE = /(['"])gitfix:\s/g;

// Regex to detect l10n.t( immediately before the quote, allowing only
// whitespace and newlines between the closing paren and the opening quote.
// This covers both the single-line form (l10n.t('gitfix: ...')) and the
// multi-line form (l10n.t(\n  'gitfix: ...')).
const PRECEDED_BY_L10N_RE = /l10n\.t\(\s*$/;

const files = walk(srcDir);

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');

  for (const match of text.matchAll(RAW_STRING_RE)) {
    const offset = match.index;
    // Look at the text immediately preceding the matched quote character.
    // We only need to look back far enough to fit "l10n.t(" plus optional
    // whitespace; 32 characters is a generous window.
    const lookback = text.slice(Math.max(0, offset - 32), offset);
    if (!PRECEDED_BY_L10N_RE.test(lookback)) {
      const lineNum = lineAt(text, offset);
      // Extract the source line for context in the error message.
      const lineText = text.split('\n')[lineNum - 1] ?? '';
      violations.push(
        `${file}:${lineNum}: raw 'gitfix: ' string literal outside l10n.t()\n  ${lineText.trim()}`,
      );
    }
  }
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

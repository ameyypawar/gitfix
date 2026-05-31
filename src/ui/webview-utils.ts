/**
 * Shared utilities for gitfix webview panels.
 */

/**
 * Escape a string for safe insertion into HTML attribute values and text nodes.
 * Covers the five characters that must be entity-encoded in HTML contexts.
 */
export function escHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/**
 * Validate a gitfix merge ID before use in git ref paths.
 * Accepts only alphanumeric, dot, underscore, and hyphen; no ".." traversal sequences;
 * max 128 chars. Guards against git ref-namespace traversal (#73).
 */
export function isValidMergeId(s: string): boolean {
  return (
    typeof s === 'string' &&
    s.length > 0 &&
    s.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) &&
    !s.includes('..')
  );
}

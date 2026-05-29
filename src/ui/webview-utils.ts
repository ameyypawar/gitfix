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

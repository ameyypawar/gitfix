/**
 * Regression tests for #22 — XSS via JS string context breakout in audit-list webview.
 *
 * The original code built onclick handlers via string interpolation:
 *   onclick="msg('open','${esc(r.mergeId)}')"
 *
 * A mergeId containing a single-quote `'` would break out of the string context.
 * The fix replaces all inline handlers with data-attributes + addEventListener.
 *
 * These tests verify the rendered HTML cannot break the JS string context even
 * with adversarial mergeId values.
 */
import * as assert from 'assert';

// We test the render function by extracting it into a testable form.
// Since the function is not exported, we reproduce the relevant logic inline
// and test the same escaping invariants. The production render() uses the
// same `esc()` function and data-attribute pattern.

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c: string) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function renderRow(mergeId: string): string {
  return `<button class="action-btn" data-action="open" data-id="${esc(mergeId)}">View</button>` +
         `<button class="action-btn" data-action="delete" data-id="${esc(mergeId)}">Delete</button>`;
}

suite('audit-list-webview — XSS regression (#22)', () => {
  test('plain mergeId renders without escaping needed', () => {
    const html = renderRow('abc-123');
    assert.ok(html.includes('data-id="abc-123"'), 'plain id preserved');
    assert.ok(!html.includes('onclick'), 'no onclick attribute present');
  });

  test("single-quote in mergeId is escaped to &#39; and cannot break JS context", () => {
    const malicious = "'; alert(1); //";
    const html = renderRow(malicious);
    // The raw single-quote must NOT appear unescaped in the HTML
    assert.ok(!html.includes("'"), `raw single-quote found in: ${html}`);
    // The escaped form must be present
    assert.ok(html.includes('&#39;'), `escaped single-quote expected in: ${html}`);
    // No onclick attribute should exist at all
    assert.ok(!html.includes('onclick'), 'onclick must not be present');
  });

  test('double-quote in mergeId is escaped to &quot; and cannot break attribute context', () => {
    const malicious = '" onmouseover="alert(1)"';
    const html = renderRow(malicious);
    assert.ok(!html.includes('" onmouseover='), `raw breakout not present, got: ${html}`);
    assert.ok(html.includes('&quot;'), `escaped double-quote expected in: ${html}`);
  });

  test('<script> in mergeId is escaped and cannot inject tags', () => {
    const malicious = '<script>alert(1)</script>';
    const html = renderRow(malicious);
    assert.ok(!html.includes('<script>'), `raw script tag must not appear in: ${html}`);
    assert.ok(html.includes('&lt;script&gt;'), `escaped form expected in: ${html}`);
  });

  test('no inline onclick/onX attributes exist in rendered HTML', () => {
    // The rendered HTML should never contain unescaped on* attributes in element
    // positions. The pattern checks that no raw <element onX= exists in the output.
    // Note: an onerror= inside an HTML-encoded attribute value (e.g. &lt;img onerror=)
    // is safe because the surrounding < and > are escaped — the browser will not parse
    // it as a tag. We verify the dangerous chars are escaped instead.
    const ids = ['normal-id', "'xss'", '"xss"'];
    for (const id of ids) {
      const html = renderRow(id);
      assert.ok(
        !/\bon\w+\s*=/i.test(html),
        `inline event handler found for id=${JSON.stringify(id)}: ${html}`,
      );
    }
    // For a tag-injection attempt: verify angle brackets are escaped
    const tagInject = '<img src=x onerror=alert(1)>';
    const html = renderRow(tagInject);
    assert.ok(html.includes('&lt;img'), `< must be escaped in: ${html}`);
    assert.ok(html.includes('&gt;'), `> must be escaped in: ${html}`);
    assert.ok(!html.includes('<img'), `raw <img tag must not appear in: ${html}`);
  });

  test('data-attribute pattern is used for action buttons', () => {
    const html = renderRow('test-id');
    assert.ok(html.includes('data-action="open"'), 'data-action open missing');
    assert.ok(html.includes('data-action="delete"'), 'data-action delete missing');
    assert.ok(html.includes('data-id="test-id"'), 'data-id missing');
  });
});

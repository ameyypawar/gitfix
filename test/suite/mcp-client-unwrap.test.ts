import * as assert from 'assert';
import { unwrapStructuredContent } from '../../src/mcp/unwrap';

suite('mcp/unwrap — unwrapStructuredContent', () => {
  test('returns structuredContent when isError is false and content present', () => {
    const res = {
      isError: false,
      content: [{ type: 'text', text: 'ignored' }],
      structuredContent: { foo: 42 },
    } as any;
    assert.deepStrictEqual(unwrapStructuredContent<{ foo: number }>(res, 'gitfix_test'), { foo: 42 });
  });

  test('throws with content[0].text when isError is true', () => {
    const res = {
      isError: true,
      content: [{ type: 'text', text: 'merge already applied' }],
    } as any;
    assert.throws(
      () => unwrapStructuredContent(res, 'gitfix_merge_apply'),
      /gitfix_merge_apply: merge already applied/,
    );
  });

  test('throws when structuredContent is undefined even if isError is false', () => {
    const res = {
      isError: false,
      content: [{ type: 'text', text: 'tool returned no data' }],
    } as any;
    assert.throws(
      () => unwrapStructuredContent(res, 'gitfix_merge_status'),
      /gitfix_merge_status: tool returned no data/,
    );
  });

  test('throws with a generic message when isError is true and content is empty', () => {
    const res = { isError: true, content: [] } as any;
    assert.throws(
      () => unwrapStructuredContent(res, 'gitfix_x'),
      /gitfix_x: unknown tool error/,
    );
  });
});

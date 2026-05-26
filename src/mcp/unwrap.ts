import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Extract the structuredContent from an MCP CallToolResult, throwing with
 * the tool's text error if it returned an error or omitted structured data.
 * Without this, callers doing `.structuredContent as Foo` silently cast
 * undefined → Foo and the first property access blows up with TypeError
 * instead of the actual gfix error message.
 */
export function unwrapStructuredContent<T>(res: CallToolResult, toolName: string): T {
  if (res.isError) {
    const text =
      Array.isArray(res.content) && res.content[0] && 'text' in res.content[0]
        ? (res.content[0] as { text: string }).text
        : 'unknown tool error';
    throw new Error(`${toolName}: ${text}`);
  }
  if (res.structuredContent === undefined) {
    const text =
      Array.isArray(res.content) && res.content[0] && 'text' in res.content[0]
        ? (res.content[0] as { text: string }).text
        : 'no structured content';
    throw new Error(`${toolName}: ${text}`);
  }
  return res.structuredContent as T;
}

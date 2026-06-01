import * as assert from 'assert';
import { sanitize } from '../../src/telemetry/reporter';

/**
 * Tests for GitfixTelemetry in src/telemetry/reporter.ts.
 *
 * We test the sanitize logic and the enabled/disabled behavior indirectly by
 * verifying the send() method is a no-op when disabled (no exceptions, no
 * output-channel side effects observable in unit tests without a real VS Code env).
 */

suite('telemetry — sanitize + send behavior', () => {
  test('sanitize strips values containing forward slashes (file paths)', () => {
    const result = sanitize({ cmd: 'applyMerge', path: '/home/user/repo' });
    assert.ok(!('path' in result), 'path with / should be stripped');
    assert.strictEqual(result.cmd, 'applyMerge');
  });

  test('sanitize strips values containing backslashes (Windows paths)', () => {
    const result = sanitize({ cmd: 'resolve', winPath: 'C:\\Users\\repo' });
    assert.ok(!('winPath' in result), 'Windows path should be stripped');
    assert.strictEqual(result.cmd, 'resolve');
  });

  test('sanitize strips values containing @ (email addresses)', () => {
    const result = sanitize({ event: 'activated', email: 'user@example.com' });
    assert.ok(!('email' in result), 'email should be stripped');
    assert.strictEqual(result.event, 'activated');
  });

  test('sanitize strips values longer than 64 characters', () => {
    const longVal = 'a'.repeat(65);
    const result = sanitize({ strategy: 'auto', longKey: longVal });
    assert.ok(!('longKey' in result), 'long value should be stripped');
    assert.strictEqual(result.strategy, 'auto');
  });

  test('sanitize passes safe short values unchanged', () => {
    const input = { strategy: 'mergiraf', via: 'ours', lmAvailable: 'true' };
    const result = sanitize(input);
    assert.deepStrictEqual(result, input);
  });

  test('sanitize passes a value of exactly 64 characters', () => {
    const val = 'a'.repeat(64);
    const result = sanitize({ key: val });
    assert.strictEqual(result.key, val);
  });

  test('sanitize strips values containing control characters (newline, carriage return)', () => {
    const result = sanitize({ safe: 'ok', withLF: 'line\ninjection', withCR: 'line\rinjection' });
    assert.ok(!('withLF' in result), 'value with \\n should be stripped');
    assert.ok(!('withCR' in result), 'value with \\r should be stripped');
    assert.strictEqual(result.safe, 'ok');
  });

  test('sanitize drops values starting with sk-ant- (Anthropic API key prefix)', () => {
    const result = sanitize({ key: 'sk-ant-abc123' });
    assert.ok(!('key' in result), 'sk-ant- prefixed value should be dropped');
  });

  test('sanitize drops values starting with sk- (generic secret prefix)', () => {
    const result = sanitize({ key: 'sk-abc123' });
    assert.ok(!('key' in result), 'sk- prefixed value should be dropped');
  });

  test('sanitize drops values starting with ghp_ (GitHub PAT prefix)', () => {
    const result = sanitize({ key: 'ghp_abc' });
    assert.ok(!('key' in result), 'ghp_ prefixed value should be dropped');
  });

  test('sanitize drops values starting with github_pat_ prefix', () => {
    const result = sanitize({ key: 'github_pat_xxx' });
    assert.ok(!('key' in result), 'github_pat_ prefixed value should be dropped');
  });

  test('sanitize drops value with U+2215 DIVISION SLASH confusable (non-ASCII reject)', () => {
    // U+2215 is not folded by NFKC — the non-ASCII reject catches it.
    const result = sanitize({ key: 'a∕b' });
    assert.ok(!('key' in result), 'U+2215 division slash confusable should be dropped');
  });

  test('sanitize drops value with U+FF0F FULLWIDTH SOLIDUS confusable (non-ASCII reject)', () => {
    const result = sanitize({ key: 'a／b' });
    assert.ok(!('key' in result), 'U+FF0F fullwidth solidus confusable should be dropped');
  });

  test('sanitize passes safe short values unchanged (regression: passthrough still green)', () => {
    const input = { strategy: 'ai', via: 'theirs', lmAvailable: 'true' };
    const result = sanitize(input);
    assert.deepStrictEqual(result, input);
  });

  test('telemetry disabled by default — send is no-op (no exception thrown)', () => {
    // We cannot easily check the VS Code configuration in a unit test without
    // a real workspace, but we can verify the module loads cleanly and the
    // GitfixTelemetry constructor accepts a version string.
    const { GitfixTelemetry } = require('../../src/telemetry/reporter');
    const t = new GitfixTelemetry('1.0.0-rc.1');
    // send() should not throw even when enabled=false (not initialized)
    assert.doesNotThrow(() => {
      t.send('extension.activated', { lmAvailable: 'false' });
    });
  });
});

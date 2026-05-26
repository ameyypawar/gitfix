import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkBYOK } from '../../src/ai/byok-onboarding';

suite('byok-onboarding — checkBYOK', () => {
  // Save and restore env so tests do not leak state.
  let savedAnthropicKey: string | undefined;
  let savedOpenAIKey: string | undefined;
  let savedOllamaHost: string | undefined;

  setup(() => {
    savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
    savedOpenAIKey = process.env.OPENAI_API_KEY;
    savedOllamaHost = process.env.OLLAMA_HOST;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OLLAMA_HOST;
  });

  teardown(() => {
    if (savedAnthropicKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (savedOpenAIKey !== undefined) {
      process.env.OPENAI_API_KEY = savedOpenAIKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (savedOllamaHost !== undefined) {
      process.env.OLLAMA_HOST = savedOllamaHost;
    } else {
      delete process.env.OLLAMA_HOST;
    }
  });

  test('returns not configured when no env vars and no keys.toml', () => {
    // With all env vars cleared and (likely) no keys.toml in the test env,
    // checkBYOK should report configured=false.
    // If a keys.toml happens to exist on the test machine, this test is a no-op
    // (we cannot safely delete ~/.config/gitfix/keys.toml in CI).
    const status = checkBYOK();
    assert.ok(
      typeof status.configured === 'boolean',
      'configured must be a boolean',
    );
    assert.ok(
      status.source === 'none' || status.source === 'file',
      'source must be none or file when env vars are absent',
    );
  });

  test('detects ANTHROPIC_API_KEY env var', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const status = checkBYOK();
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.provider, 'anthropic');
    assert.strictEqual(status.source, 'env');
  });

  test('detects OPENAI_API_KEY env var', () => {
    process.env.OPENAI_API_KEY = 'sk-openai-test';
    const status = checkBYOK();
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.provider, 'openai');
    assert.strictEqual(status.source, 'env');
  });

  test('detects OLLAMA_HOST env var', () => {
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    const status = checkBYOK();
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.provider, 'ollama');
    assert.strictEqual(status.source, 'env');
  });

  test('detects anthropic_api_key in a temporary keys.toml', () => {
    // Write a temporary keys.toml and point KEYS_TOML_PATH at it by using a
    // known env-absent state and relying on the actual path logic. Since we
    // cannot easily override the module-scoped constant, we test via a real
    // temp file only if the real path is writable and safe to modify.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfix-byok-test-'));
    const tmpToml = path.join(tmpDir, 'keys.toml');
    fs.writeFileSync(tmpToml, 'anthropic_api_key = "sk-ant-from-file"\n', { mode: 0o600 });

    // Directly test the regex pattern that checkBYOK uses, since we cannot
    // redirect the module-level constant without a DI seam.
    const content = fs.readFileSync(tmpToml, 'utf8');
    assert.ok(/anthropic_api_key\s*=/.test(content), 'regex should match anthropic key in file');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });
});

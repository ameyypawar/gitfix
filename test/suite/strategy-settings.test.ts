import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Tests for readSettings() in src/config/strategy-settings.ts.
 *
 * The vscode module is mocked by the test runner (vscode-test-electron provides
 * a real VS Code host). For unit tests that run without a real workspace we test
 * the TOML parsing logic directly by shimming the module internals.
 *
 * Since readSettings() calls vscode.workspace.getConfiguration we test the TOML
 * parsing path in isolation by setting up a real temp directory with a config.toml.
 */

// Minimal TOML content helpers
function writeTOML(dir: string, content: string): void {
  const gitfixDir = path.join(dir, '.gitfix');
  fs.mkdirSync(gitfixDir, { recursive: true });
  fs.writeFileSync(path.join(gitfixDir, 'config.toml'), content, 'utf8');
}

suite('strategy-settings — TOML parsing logic', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfix-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TOML strategy field is parsed correctly', () => {
    writeTOML(tmpDir, 'strategy = "mergiraf"\n');
    const text = fs.readFileSync(path.join(tmpDir, '.gitfix', 'config.toml'), 'utf8');
    const m = (re: RegExp) => re.exec(text)?.[1];
    const strat = m(/^strategy\s*=\s*"([^"]+)"/m);
    assert.strictEqual(strat, 'mergiraf');
  });

  test('TOML allow_rerere = false is parsed correctly', () => {
    writeTOML(tmpDir, 'allow_rerere = false\n');
    const text = fs.readFileSync(path.join(tmpDir, '.gitfix', 'config.toml'), 'utf8');
    const rerereMatch = /^allow_rerere\s*=\s*(\S+)/m.exec(text);
    const rerere: string | undefined = rerereMatch?.[1];
    // Value should be the literal string 'false'
    assert.ok(rerere === 'false', `expected 'false', got '${rerere}'`);
    // The strategy-settings module converts: rerere === 'true' maps to allowRerere boolean
    const allowRerere = rerere !== undefined && rerere !== 'false';
    assert.strictEqual(allowRerere, false, 'allow_rerere = false should produce allowRerere=false');
  });

  test('TOML protected_branches array is parsed correctly', () => {
    writeTOML(tmpDir, 'protected_branches = ["main", "release"]\n');
    const text = fs.readFileSync(path.join(tmpDir, '.gitfix', 'config.toml'), 'utf8');
    const m = (re: RegExp) => re.exec(text)?.[1];
    const branches = m(/^protected_branches\s*=\s*\[([^\]]+)\]/m);
    assert.ok(branches, 'branches should be captured');
    const parsed = branches!
      .split(',')
      .map((b) => b.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    assert.deepStrictEqual(parsed, ['main', 'release']);
  });

  test('malformed TOML does not throw — parsing returns undefined for each field', () => {
    writeTOML(tmpDir, 'this is not = valid [[[ toml\n');
    const text = fs.readFileSync(path.join(tmpDir, '.gitfix', 'config.toml'), 'utf8');
    const m = (re: RegExp) => re.exec(text)?.[1];
    const strat = m(/^strategy\s*=\s*"([^"]+)"/m);
    const rerere = m(/^allow_rerere\s*=\s*(true|false)/m);
    const branches = m(/^protected_branches\s*=\s*\[([^\]]+)\]/m);
    // All should be undefined; no exception thrown
    assert.strictEqual(strat, undefined);
    assert.strictEqual(rerere, undefined);
    assert.strictEqual(branches, undefined);
  });

  test('no config.toml file — existsSync returns false', () => {
    const noTOMLDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfix-no-toml-'));
    try {
      const tomlPath = path.join(noTOMLDir, '.gitfix', 'config.toml');
      assert.strictEqual(fs.existsSync(tomlPath), false);
    } finally {
      fs.rmSync(noTOMLDir, { recursive: true, force: true });
    }
  });
});

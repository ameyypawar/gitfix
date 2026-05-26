import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

suite('manifest — commands declared vs registered', () => {
  test('every gitfix.* command registered in src/ is declared in package.json', () => {
    const root = path.resolve(__dirname, '..', '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const declared = new Set<string>(
      pkg.contributes.commands.map((c: { command: string }) => c.command),
    );

    // Scan src/ recursively for registerCommand('gitfix.xxx', ...) call sites.
    const registered = new Set<string>();
    const srcDir = path.join(root, 'src');
    function walk(dir: string): void {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if (p.endsWith('.ts')) {
          const text = fs.readFileSync(p, 'utf8');
          const re = /registerCommand\(\s*['"](gitfix\.[a-zA-Z0-9._-]+)['"]/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) registered.add(m[1]);
        }
      }
    }
    walk(srcDir);

    const missing = [...registered].filter((c) => !declared.has(c));
    assert.deepStrictEqual(
      missing,
      [],
      `registered but not declared in package.json contributes.commands: ${missing.join(', ')}`,
    );

    // Inverse direction: a declared command should also be registered.
    // (Loose: we tolerate "declared in palette but registered in extension activation
    // dynamically" — but the only legitimate case in this codebase is none, so flag any.)
    const orphans = [...declared].filter((c) => !registered.has(c));
    assert.deepStrictEqual(
      orphans,
      [],
      `declared in package.json but never registered: ${orphans.join(', ')}`,
    );
  });
});

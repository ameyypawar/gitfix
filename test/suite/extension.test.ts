import * as assert from 'assert';
import { commands, extensions } from 'vscode';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../../package.json') as Record<string, unknown>;

suite('gitfix extension', () => {
  test('gitfix.refresh command is registered', async () => {
    const ext = extensions.getExtension('ameyypawar.gitfix');
    assert.ok(ext, 'extension ameyypawar.gitfix should be present in the test host');
    await ext!.activate(); // resolves only after activate() returns — all commands registered

    const all = await commands.getCommands(true);
    assert.ok(
      all.includes('gitfix.refresh'),
      'gitfix.refresh should be registered after activation',
    );
  });

  test('resolve commands are registered', async () => {
    const ext = extensions.getExtension('ameyypawar.gitfix');
    assert.ok(ext, 'extension ameyypawar.gitfix should be present in the test host');
    await ext!.activate();

    const all = await commands.getCommands(true);
    for (const id of ['gitfix.resolveOurs', 'gitfix.resolveTheirs', 'gitfix.resolveMergiraf']) {
      assert.ok(all.includes(id), `${id} should be registered after activation`);
    }
  });

  // Trusted-host regression: commands registered outside the trust gate must be
  // present even before workspace trust is evaluated (#103).
  test('apply/abort/configureAiProvider commands are registered unconditionally', async () => {
    const ext = extensions.getExtension('ameyypawar.gitfix');
    assert.ok(ext, 'extension ameyypawar.gitfix should be present in the test host');
    await ext!.activate();

    const all = await commands.getCommands(true);
    for (const id of ['gitfix.applyMerge', 'gitfix.abortMerge', 'gitfix.configureAiProvider']) {
      assert.ok(all.includes(id), `${id} should be registered regardless of workspace trust`);
    }
  });

  test('package.json capabilities.untrustedWorkspaces.supported is limited', () => {
    const caps = pkg['capabilities'] as { untrustedWorkspaces?: { supported?: string } } | undefined;
    assert.ok(caps, 'capabilities key must exist in package.json');
    assert.strictEqual(
      caps.untrustedWorkspaces?.supported,
      'limited',
      'untrustedWorkspaces.supported must be "limited"',
    );
  });
});

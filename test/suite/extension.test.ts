import * as assert from 'assert';
import { commands, extensions } from 'vscode';

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
});

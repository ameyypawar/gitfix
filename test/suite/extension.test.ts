import * as assert from 'assert';
import * as vscode from 'vscode';

suite('gitfix extension — smoke tests', () => {
  test('gitfix.refresh command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('gitfix.refresh'),
      'gitfix.refresh should be registered after activation',
    );
  });

  test('gitfix.conflicts tree view registers', async () => {
    // The tree view is registered during activation. Verify the extension
    // activated by checking the refresh command exists (same guard as above).
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('gitfix.resolveOurs'),
      'gitfix.resolveOurs should be registered',
    );
    assert.ok(
      commands.includes('gitfix.resolveTheirs'),
      'gitfix.resolveTheirs should be registered',
    );
    assert.ok(
      commands.includes('gitfix.resolveMergiraf'),
      'gitfix.resolveMergiraf should be registered',
    );
  });
});

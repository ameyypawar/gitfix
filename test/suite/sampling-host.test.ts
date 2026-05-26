import * as assert from 'assert';
import { installSamplingHost } from '../../src/ai/sampling-host';

suite('sampling-host', () => {
  test('reports unavailable when vscode.lm has no models', async () => {
    // In the test electron host, vscode.lm.selectChatModels returns [] unless
    // Copilot (or another LM provider) is installed in the test environment.
    // We pass a fake client that accepts setRequestHandler without error.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeClient: any = { setRequestHandler: () => {} };
    const result = await installSamplingHost(fakeClient);
    assert.strictEqual(result.available, false);
  });
});

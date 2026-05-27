import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { log } from '../log';

const KEYS_TOML_PATH = path.join(
  os.homedir(),
  '.config',
  'gitfix',
  'keys.toml',
);

export interface BYOKStatus {
  configured: boolean;
  provider?: 'anthropic' | 'openai' | 'ollama';
  source: 'env' | 'file' | 'none';
}

export function checkBYOK(): BYOKStatus {
  if (process.env.ANTHROPIC_API_KEY) return { configured: true, provider: 'anthropic', source: 'env' };
  if (process.env.OPENAI_API_KEY) return { configured: true, provider: 'openai', source: 'env' };
  if (process.env.OLLAMA_HOST) return { configured: true, provider: 'ollama', source: 'env' };
  if (fs.existsSync(KEYS_TOML_PATH)) {
    try {
      const text = fs.readFileSync(KEYS_TOML_PATH, 'utf8');
      if (/anthropic_api_key\s*=/.test(text)) return { configured: true, provider: 'anthropic', source: 'file' };
      if (/openai_api_key\s*=/.test(text)) return { configured: true, provider: 'openai', source: 'file' };
      if (/ollama_host\s*=/.test(text)) return { configured: true, provider: 'ollama', source: 'file' };
    } catch (err) {
      log(`keys.toml read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { configured: false, source: 'none' };
}

export function registerByokOnboardingCommand(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitfix.configureAiProvider', async () => {
      const provider = await vscode.window.showQuickPick(
        [
          { label: 'Anthropic (Claude)', value: 'anthropic' as const, detail: 'Recommended. Best results on conflict resolution.' },
          { label: 'OpenAI (GPT)', value: 'openai' as const, detail: undefined },
          { label: 'Ollama (local)', value: 'ollama' as const, detail: 'No network calls; needs a local server running.' },
        ],
        { placeHolder: 'Choose an AI provider for gitfix BYO-key fallback' },
      );
      if (!provider) return;

      if (provider.value === 'ollama') {
        const host = await vscode.window.showInputBox({
          prompt: 'Ollama host URL',
          value: process.env.OLLAMA_HOST ?? 'http://localhost:11434',
        });
        if (!host) return;
        await ensureKeysToml({ ollama_host: host });
      } else {
        const key = await vscode.window.showInputBox({
          prompt: `${provider.value === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key`,
          password: true,
          ignoreFocusOut: true,
        });
        if (!key) return;
        await ensureKeysToml(
          provider.value === 'anthropic'
            ? { anthropic_api_key: key }
            : { openai_api_key: key },
        );
      }

      vscode.window.showInformationMessage(
        `gitfix: ${provider.label} configured. The gfix subprocess will pick this up on the next merge — restart VS Code or reload the window now.`,
        'Reload',
      ).then((c) => {
        if (c === 'Reload') vscode.commands.executeCommand('workbench.action.reloadWindow');
      });
    }),
  ];
}

async function ensureKeysToml(entries: Record<string, string>): Promise<void> {
  const dir = path.dirname(KEYS_TOML_PATH);
  fs.mkdirSync(dir, { recursive: true });
  // Tighten perms on the gitfix/ dir itself to 0o700. We deliberately do NOT
  // chmod ~/.config — the user may have other tools relying on its existing
  // permissions. (P2-3)
  try {
    fs.chmodSync(dir, 0o700);
  } catch (err) {
    log(`chmod gitfix config dir failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
  let existing = '';
  if (fs.existsSync(KEYS_TOML_PATH)) {
    existing = fs.readFileSync(KEYS_TOML_PATH, 'utf8');
  }
  // Fix #4: the original code had an early `return` inside the loop, which
  // skipped any remaining entries after the first key-replace. Each key is now
  // processed independently: in-place replacements accumulate in `current`,
  // new keys accumulate in `lines`, and a single write happens at the end.
  let current = existing;
  const lines: string[] = [];
  if (current.trim()) lines.push(current.trimEnd());
  for (const [k, v] of Object.entries(entries)) {
    const escaped = v.replace(/"/g, '\\"');
    if (new RegExp(`^${k}\\s*=`, 'm').test(current)) {
      // Replace existing key in-place — update `current` so subsequent
      // iterations see the already-replaced content.
      current = current.replace(
        new RegExp(`^${k}\\s*=.*$`, 'm'),
        `${k} = "${escaped}"`,
      );
      // Refresh lines[0] (the existing-content slot) with the updated text.
      if (lines.length > 0) lines[0] = current.trimEnd();
    } else {
      lines.push(`${k} = "${escaped}"`);
    }
  }
  fs.writeFileSync(KEYS_TOML_PATH, lines.join('\n') + '\n', { mode: 0o600 });
}

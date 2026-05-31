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
          { label: vscode.l10n.t('Anthropic (Claude)'), value: 'anthropic' as const, detail: vscode.l10n.t('Recommended. Best results on conflict resolution.') },
          { label: vscode.l10n.t('OpenAI (GPT)'), value: 'openai' as const, detail: undefined },
          { label: vscode.l10n.t('Ollama (local)'), value: 'ollama' as const, detail: vscode.l10n.t('No network calls; needs a local server running.') },
        ],
        { placeHolder: vscode.l10n.t('Choose an AI provider for gitfix BYO-key fallback') },
      );
      if (!provider) return;

      if (provider.value === 'ollama') {
        const host = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('Ollama host URL'),
          value: process.env.OLLAMA_HOST ?? 'http://localhost:11434',
        });
        if (!host) return;
        await ensureKeysToml({ ollama_host: host });
      } else {
        const key = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('{0} API key', provider.value === 'anthropic' ? 'Anthropic' : 'OpenAI'),
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

      const reloadLbl = vscode.l10n.t('Reload');
      void vscode.window.showInformationMessage(
        vscode.l10n.t('gitfix: {0} configured. The gfix subprocess will pick this up on the next merge — restart VS Code or reload the window now.', provider.label),
        reloadLbl,
      ).then((c) => {
        if (c === reloadLbl) vscode.commands.executeCommand('workbench.action.reloadWindow');
      });
    }),
  ];
}

export async function ensureKeysToml(entries: Record<string, string>): Promise<void> {
  const dir = path.dirname(KEYS_TOML_PATH);
  fs.mkdirSync(dir, { recursive: true });
  // Tighten perms on the gitfix/ dir itself to 0o700. We deliberately do NOT
  // chmod ~/.config — the user may have other tools relying on its existing
  // permissions.
  try {
    fs.chmodSync(dir, 0o700);
  } catch (err) {
    log(`chmod gitfix config dir failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  const existing = fs.existsSync(KEYS_TOML_PATH)
    ? fs.readFileSync(KEYS_TOML_PATH, 'utf8')
    : '';

  // Merge: start from the existing content and apply each entry in turn.
  // In-place replacements update `merged` so subsequent iterations see the
  // already-replaced content; new keys are appended at the end.
  // The function form of String.replace is used throughout to prevent `$&`,
  // `$1`, etc. in API key values from being interpreted as replacement patterns
  // (guards against keys containing `$` being silently corrupted).
  let merged = existing;
  const appended: string[] = [];

  for (const [k, v] of Object.entries(entries)) {
    const escaped = v.replace(/"/g, '\\"');
    const keyPattern = new RegExp(`^${k}\\s*=.*$`, 'm');
    if (keyPattern.test(merged)) {
      const replacement = `${k} = "${escaped}"`;
      merged = merged.replace(keyPattern, () => replacement);
    } else {
      appended.push(`${k} = "${escaped}"`);
    }
  }

  const parts: string[] = [];
  if (merged.trim()) parts.push(merged.trimEnd());
  parts.push(...appended);

  // File is written with mode 0o600 (owner read/write only) on Unix/macOS.
  // On Windows, fs.writeFile mode bits are not enforced by the OS; instead,
  // the file inherits the ACLs of its parent directory (~/.config/gitfix/).
  // Keep keys.toml inside the user profile directory so that Windows default
  // ACLs restrict access to the owning user. Do not share or move this file
  // outside the profile path.
  fs.writeFileSync(KEYS_TOML_PATH, parts.join('\n') + '\n', { mode: 0o600 });
}

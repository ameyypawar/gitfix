import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../log';

export interface StrategySettings {
  mergeStrategy: 'mergiraf' | 'text' | 'auto';
  allowRerere: boolean;
  protectedBranches: string[];
}

export function readSettings(repoPath: string): StrategySettings {
  const cfg = vscode.workspace.getConfiguration('gitfix', vscode.Uri.file(repoPath));
  const s: StrategySettings = {
    mergeStrategy: cfg.get('mergeStrategy', 'auto'),
    allowRerere: cfg.get('allowRerere', true),
    protectedBranches: cfg.get('protectedBranches', ['main', 'master', 'develop', 'release']),
  };
  // Per-repo override: .gitfix/config.toml wins over VS Code settings.
  const tomlPath = path.join(repoPath, '.gitfix', 'config.toml');
  if (fs.existsSync(tomlPath)) {
    try {
      const text = fs.readFileSync(tomlPath, 'utf8');
      const m = (_key: string, re: RegExp) => re.exec(text)?.[1];
      const strat = m('strategy', /^strategy\s*=\s*"([^"]+)"/m);
      if (strat === 'mergiraf' || strat === 'text' || strat === 'auto') s.mergeStrategy = strat;
      const rerere = m('allow_rerere', /^allow_rerere\s*=\s*(true|false)/m);
      if (rerere) s.allowRerere = rerere === 'true';
      // protected_branches is add-only for security: a repo-committed TOML can extend the
      // protected set from VS Code settings but never narrow it (workspace-trust escalation, #82).
      const branches = m('protected_branches', /^protected_branches\s*=\s*\[([^\]]+)\]/m);
      if (branches) {
        const tomlBranches = branches
          .split(',')
          .map((b) => b.trim().replace(/^"|"$/g, ''))
          .filter(Boolean);
        s.protectedBranches = [...new Set([...s.protectedBranches, ...tomlBranches])];
      }
    } catch (err) {
      log(`config.toml parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return s;
}

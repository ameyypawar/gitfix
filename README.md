# gitfix — Merge Conflict Inspector

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ameyypawar.gitfix?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ameyypawar.gitfix)
[![Open VSX](https://img.shields.io/open-vsx/v/ameyypawar/gitfix?label=Open%20VSX)](https://open-vsx.org/extension/ameyypawar/gitfix)
[![CI](https://github.com/ameyypawar/gitfix/actions/workflows/ci.yml/badge.svg)](https://github.com/ameyypawar/gitfix/actions/workflows/ci.yml)

Workspace-wide merge conflict inspector for VS Code. Companion to the built-in merge editor, powered by [`gfix`](https://gfix.space).

<p align="center"><img src="media/hero.png" alt="gitfix" width="200" /></p>

## Features

- **Activity-bar panel** listing every unresolved conflict in your active merge — across all workspace folders simultaneously
- **One-click resolution** — Take Ours, Take Theirs, Run Mergiraf (AST-aware), or get an AI suggestion
- **Auto-detection** — activates the moment you start a `git merge` in your terminal
- **CodeLens buttons** inline above every conflict marker block
- **Status bar** showing live conflict count
- **Audit trail** — gfix records every decision under `refs/gitfix/audit/*`; inspect and manage via "List Audit Refs"
- **Rerere replay** — previously accepted resolutions auto-replay on identical conflicts
- **Multi-folder support** — multiple repos merging simultaneously shown as separate tree roots

## Requirements

The `gfix` CLI must be installed and accessible from your PATH.

[Install gfix](https://gfix.space)

## Compatibility

| gitfix extension | gfix CLI (minimum) | gfix CLI (recommended) |
|---|---|---|
| 1.0.x | 0.1.0-alpha.3 | latest alpha |
| 0.99.x | 0.1.0-alpha.3 | 0.1.0-alpha.3 |
| 0.2.0-beta | 0.1.0-alpha.2 | 0.1.0-alpha.2 |
| 0.1.0-alpha | 0.1.0-alpha.1 | 0.1.0-alpha.1 |

> **Why does the extension version (1.0) differ from the CLI version (0.1)?**
> The extension is the user-facing surface and reached feature-complete first. The CLI is the substrate engine; we keep it on alpha until the merge-engine API itself is publicly committed-to. Both ship from the same release cadence and are tested together in CI.

## Quick Start

Run **Get Started with gitfix** from the Command Palette to open the interactive walkthrough.

Or manually:

1. Install `gfix`: see [gfix.space/install](https://gfix.space/install)
2. Start a merge: `git merge <branch>`
3. Open the **gitfix** panel in the Activity Bar
4. Resolve conflicts via tree right-click or inline CodeLens buttons
5. Click **Apply Merge** when all conflicts are resolved

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `gitfix.gfixPath` | `"gfix"` | Path to the gfix binary |
| `gitfix.activateOnGitMerge` | `true` | Auto-activate on merge start |
| `gitfix.codeLens.enabled` | `true` | Show inline CodeLens buttons |
| `gitfix.aiProvider` | `"host"` | AI source: `host` (Copilot etc.), `byok`, or `none` |
| `gitfix.mergeStrategy` | `"auto"` | Default resolution strategy (`mergiraf`, `text`, `auto`) |
| `gitfix.allowRerere` | `true` | Enable rerere cache replay |
| `gitfix.protectedBranches` | `["main","master","develop","release"]` | Branches requiring confirmation |
| `gitfix.telemetry.enabled` | `false` | Opt-in to anonymized usage events |

Per-repo overrides: create `.gitfix/config.toml` at your repo root. When this file is present its values take precedence over the VS Code settings above.

### `.gitfix/config.toml` schema

```toml
# Merge strategy. One of: "mergiraf" | "text" | "auto" (default "auto").
strategy = "auto"

# Enable rerere cache replay for previously seen conflicts (default true).
allow_rerere = true

# Branches that require confirmation before applying the merge.
# Default: ["main", "master", "develop", "release"].
protected_branches = ["main", "master", "develop", "release"]
```

## Commands

| Command | Description |
|---|---|
| `gitfix.refresh` | Refresh the conflict tree |
| `gitfix.resolveOurs` | Resolve selected conflict: Take Ours |
| `gitfix.resolveTheirs` | Resolve selected conflict: Take Theirs |
| `gitfix.resolveMergiraf` | Resolve selected conflict with Mergiraf (AST-aware) |
| `gitfix.resolveTakeTarget` | Resolve: keep target branch's pre-merge version |
| `gitfix.resolveBatchMergiraf` | Resolve all selected conflicts with Mergiraf |
| `gitfix.applyMerge` | Commit the merge (requires all conflicts resolved) |
| `gitfix.abortMerge` | Abort the merge, discarding all progress |
| `gitfix.showAuditRef` | Show the audit trail for the current merge |
| `gitfix.listAuditRefs` | List, view, delete, and share all audit refs |
| `gitfix.configureAiProvider` | Configure a BYOK API key for AI suggestions |
| `gitfix.openWalkthrough` | Open the Get Started walkthrough |

## Security notes

### BYOK key file permissions (#21)

When you configure a BYO API key, gitfix writes it to `~/.config/gitfix/keys.toml`.

- **macOS / Linux**: the file is created with mode `0600` (owner read/write only) and the parent directory with `0700`. Only your user account can read it.
- **Windows**: `fs.writeFile` mode bits are not enforced by the Windows kernel. The file relies on the per-user profile directory's default ACLs to restrict access. Keep `keys.toml` inside your user profile path (`%USERPROFILE%\.config\gitfix\`) and do not share or move it elsewhere.

### README badges (#50)

The version, installs, and license badges at the top of this file are served by [shields.io](https://shields.io), a third-party service. When you view this README (in a browser, on the Marketplace, or in VS Code's extension details pane), your browser fetches those badge images from shields.io servers. No gitfix user data is involved — the requests contain only the extension identifier and badge type.

## Known limitations

- **Git worktrees and one-level-nested repos are detected.** Merge state detection follows the `gitdir:` pointer when `.git` is a file (worktree), resolves the real gitdir, and probes `MERGE_HEAD` there. It also walks one level of immediate subdirectories per workspace folder (skipping `node_modules` and dotdirs) to detect merges in monorepo sub-repos.

## How it works

gitfix spawns `gfix mcp` as a subprocess and communicates over stdio using the Model Context Protocol. All conflict resolution decisions flow through `gfix`, which maintains a per-merge plan and an audit trail in `refs/gitfix/audit/`.

## Privacy

**Telemetry is off by default and currently has no live transport.** When opted in (`gitfix.telemetry.enabled: true`), gitfix logs anonymized events to the gitfix Output channel only. No data leaves your machine in v1.0. A live transport will be wired in a future release with explicit version-note disclosure.

Telemetry is automatically disabled when VS Code's global telemetry setting is off.

## License

MIT — see [LICENSE](LICENSE).

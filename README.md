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

Per-repo overrides: create `.gitfix/config.toml` at your repo root (see docs for schema).

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

## How it works

gitfix spawns `gfix mcp` as a subprocess and communicates over stdio using the Model Context Protocol. All conflict resolution decisions flow through `gfix`, which maintains a per-merge plan and an audit trail in `refs/gitfix/audit/`.

## Privacy

**Telemetry is off by default.** When opted in (`gitfix.telemetry.enabled: true`), gitfix sends anonymized usage events. Events are strictly filtered:

| Event | Properties collected |
|---|---|
| `extension.activated` | VS Code version, extension version, gfix version, LM available (bool), BYOK configured (bool) |
| `merge.preview` | Strategy, substrate, conflict counts |
| `conflict.resolved` | Resolution method (`ours`/`theirs`/`mergiraf`/`ai-suggestion`/`take-target`/`manual`), source (`codelens`/`treeview`/`batch`) |
| `merge.applied` | Branch protected (bool), conflict count, duration |
| `extension.error` | Error class name only |

**Never collected:** file paths, branch names, conflict content, error message text, user identity.

Telemetry is automatically disabled when VS Code's global telemetry setting is off.

## License

MIT — see [LICENSE](LICENSE).

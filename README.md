# gitfix — Merge Conflict Inspector

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ameyypawar.gitfix?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ameyypawar.gitfix)
[![Open VSX](https://img.shields.io/open-vsx/v/ameyypawar/gitfix?label=Open%20VSX)](https://open-vsx.org/extension/ameyypawar/gitfix)
[![CI](https://github.com/ameyypawar/gitfix/actions/workflows/ci.yml/badge.svg)](https://github.com/ameyypawar/gitfix/actions/workflows/ci.yml)

Workspace-wide merge conflict inspector for VS Code. Companion to the built-in merge editor, powered by [`gfix`](https://gfix.space).

## Features

- **Activity-bar panel** listing every unresolved conflict in your active merge
- **One-click resolution** — Take Ours, Take Theirs, or Run Mergiraf (AST-aware)
- **Auto-detection** — activates the moment you start a `git merge` in your terminal
- **Status bar** showing live conflict count
- **Audit trail** — gfix records every decision; inspect via "Show Audit Ref"

## Requirements

The `gfix` CLI must be installed and accessible from your PATH.

[Install gfix](https://gfix.space)

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `gitfix.gfixPath` | `"gfix"` | Path to the gfix binary. Override with an absolute path if gfix is not on PATH. |
| `gitfix.activateOnGitMerge` | `true` | Auto-activate the conflict tree when VS Code detects an in-progress merge. |

## Usage

1. Start a merge in your terminal: `git merge <branch>`
2. Switch to the gitfix panel in the Activity Bar
3. Right-click a conflict to resolve it
4. Finish by running `git commit` in your terminal once all conflicts are resolved

## Commands

| Command | Description |
|---|---|
| `gitfix.refresh` | Refresh the conflict tree |
| `gitfix.resolveOurs` | Resolve selected conflict by taking our side |
| `gitfix.resolveTheirs` | Resolve selected conflict by taking their side |
| `gitfix.resolveMergiraf` | Resolve selected conflict using Mergiraf (AST-aware) |
| `gitfix.showAuditRef` | Show the audit trail for the current merge |

## How it works

gitfix spawns `gfix mcp` as a subprocess and communicates over stdio using the Model Context Protocol. All conflict resolution decisions flow through `gfix`, which maintains an audit trail in `refs/gitfix/audit/`.

## Privacy

gitfix does not collect telemetry. All data stays local. The `gfix` subprocess runs entirely on your machine.

## License

MIT — see [LICENSE](LICENSE).

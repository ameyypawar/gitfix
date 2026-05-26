# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-alpha.1] - 2026-05-26

### Added
- Activity-bar conflict inspector with TreeView listing all unresolved merge conflicts
- MCP client connecting to `gfix mcp` subprocess via stdio transport
- Auto-detect merge state via `vscode.git` API and `.git/MERGE_HEAD` filesystem watcher
- Commands: `gitfix.refresh`, `gitfix.openFile`, `gitfix.resolveOurs`, `gitfix.resolveTheirs`, `gitfix.resolveMergiraf`, `gitfix.showAuditRef`
- Status bar item showing conflict count (hidden when no active merge)
- Two settings: `gitfix.gfixPath` (binary path), `gitfix.activateOnGitMerge` (auto-activate)
- Friendly error message with install guide link when `gfix` is not found on PATH
- Welcome view shown when no active merge is detected
- CI workflow (lint, package, test on Ubuntu with xvfb)
- Release workflow (publish to VS Code Marketplace and Open VSX on tag)

[Unreleased]: https://github.com/ameyypawar/gitfix/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/ameyypawar/gitfix/releases/tag/v0.1.0-alpha.1

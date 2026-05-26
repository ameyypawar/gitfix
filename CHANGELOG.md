# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-rc.1] - 2026-05-26

### Added
- Multi-folder workspace support: all workspace folders with an active merge are shown
  simultaneously as separate root items in the conflict tree. The tree label includes the
  folder name when more than one repo is merging.
- Strategy settings (`gitfix.mergeStrategy`, `gitfix.allowRerere`, `gitfix.protectedBranches`):
  VS Code settings with per-repo override via `.gitfix/config.toml`.
- Audit refs management Webview (`gitfix.listAuditRefs`): list, view, delete, and copy git
  push commands for all `refs/gitfix/audit/*` refs in the workspace.
- Opt-in telemetry (`gitfix.telemetry.enabled`, default off): anonymized usage events with
  strict PII filtering. Transport is stubbed (logs to output channel) until v1.1.
- First-run telemetry consent toast (one-shot, respects VS Code-wide telemetry setting).
- Welcome walkthrough (`gitfix.openWalkthrough`): 4-step guide covering CLI install, AI setup,
  first merge, and audit refs.
- Localization scaffold: `vscode.l10n.t()` wrapping for all user-facing strings;
  `l10n/bundle.l10n.json` seed file; `package.nls.json` for command/setting titles.
- `lint:l10n` script: CI check that no raw `'gitfix: '` strings remain outside `l10n.t()`.
- CI matrix expanded to `ubuntu-latest`, `macos-14`, `windows-latest`.
- `release.yml` now recognizes `-rc` tags as pre-release (alongside `-alpha`/`-beta`).

### Changed
- `gitfix.protectedBranches` setting replaces the hardcoded `PROTECTED` constant in apply.ts.
- Categories: `["SCM Providers", "Linters"]` (was `["SCM Providers", "Other"]`).
- Keywords expanded with `vscode-merge`, `conflict-resolution`, `rerere`.
- `preview` flag removed from `package.json` (GA release).

## [0.2.0-beta] - 2026-05-26

### Added
- CodeLens buttons (Take Ours / Take Theirs / Resolve with Mergiraf) rendered above every
  git conflict marker block. Gated on `gitfix.codeLens.enabled` setting (default: on).
- AI suggestion path: extension now advertises MCP sampling capability; conflict resolution
  requests are routed through VS Code's Language Model API (`vscode.lm`) when Copilot or
  another LM provider is installed. Setting: `gitfix.aiProvider` (host / byok / none).
- BYOK onboarding: `gitfix.configureAiProvider` command writes `~/.config/gitfix/keys.toml`
  with provider API keys as a fallback when no LM host is available.
- Audit Webview: `gitfix.showAuditRef` now opens a real side-panel Webview showing merge
  metadata, auto-resolved files (with rerere replay badges), and the decision log. Replaces
  the Phase 1 output-channel dump.
- Rerere replay badges: auto-resolved files resolved via rerere replay are annotated with a
  replay indicator in both the MergeRootItem description and the ResolvedItem tree nodes.
- New tree structure: resolved conflicts appear under a collapsible "Auto-resolved" group;
  unresolved conflicts remain at the top level as before.
- Apply Merge command (`gitfix.applyMerge`): creates the merge commit when all conflicts are
  resolved. Protected branches (main/master/develop/release) require explicit confirmation.
- Abort Merge command (`gitfix.abortMerge`): discards all merge progress with a modal
  confirmation dialog.
- Take Target command (`gitfix.resolveTakeTarget`): resolves N-way conflicts by keeping the
  target branch's pre-merge version. Context menu entry appears only when
  `target_oid !== ours_oid` (controlled by `gitfix:conflictHasTakeTarget` context key).
- Batch Mergiraf command (`gitfix.resolveBatchMergiraf`): resolves all selected conflicts
  via Mergiraf in a single batch MCP call. Enabled by `canSelectMany` on the tree view.
- Integration test suite (`test:integration` script) covering fixture setup and audit
  Webview data model. Runs in CI via xvfb on ubuntu-latest with gfix binary installed from
  the GitHub release.
- Settings: `gitfix.codeLens.enabled`, `gitfix.aiProvider`, `gitfix.ai.budgetWarningAt`.

### Changed
- Engine requirement bumped to `vscode ^1.92.0` (minimum version with stable `vscode.lm` API).
- MCP client now advertises `{ capabilities: { sampling: {} } }` so the gfix subprocess
  routes AI suggestions through the extension's vscode.lm handler rather than falling back
  to direct HTTP calls (when BYOK is not configured).
- Version bumped from 0.1.0 to 0.2.0.

### Publisher verification
Verified publisher application submitted to VS Code Marketplace. Turnaround is typically
1-2 weeks; verification will be applied in a point release if it lands before 0.2.0 final.

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

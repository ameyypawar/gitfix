import * as vscode from 'vscode';
import { log } from '../log';

// Phase 4 / v1.0: transport stubbed — no @vscode/extension-telemetry dep.
// When opted in, events are logged to the gitfix Output channel only.
// A live transport will be wired in v1.1 with a real backend key + privacy
// disclosure. The schema (EventName + GitfixTelemetry shape) stays identical
// so all existing call sites continue to compile without changes.

export type EventName =
  | 'extension.activated'
  | 'merge.preview'
  | 'conflict.resolved'
  | 'merge.applied'
  | 'extension.error';

export class GitfixTelemetry {
  private enabled = false;

  constructor(private extensionVersion: string) {}

  init(context: vscode.ExtensionContext): void {
    this.refreshEnabled();
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitfix.telemetry.enabled')) this.refreshEnabled();
    }, null, context.subscriptions);
    vscode.env.onDidChangeTelemetryEnabled?.(() => this.refreshEnabled(), null, context.subscriptions);
  }

  private refreshEnabled(): void {
    const ours = vscode.workspace.getConfiguration('gitfix').get<boolean>('telemetry.enabled', false);
    this.enabled = ours && vscode.env.isTelemetryEnabled;
  }

  send(event: EventName, properties: Record<string, string> = {}, measurements: Record<string, number> = {}): void {
    if (!this.enabled) return;
    const props = { extensionVersion: this.extensionVersion, ...sanitize(properties) };
    log(`[telemetry] ${event} ${JSON.stringify(props)} ${JSON.stringify(measurements)}`);
  }
}

/**
 * Strip any property value that looks like a file path, URL, email address,
 * contains newlines or other control characters, or is excessively long.
 * Defense-in-depth; callers must not pass PII.
 *
 * Processing order per value:
 * 1. NFKC normalize — collapses compatibility equivalents (e.g. fullwidth
 *    chars). Note: NFKC does NOT fold U+2215 DIVISION SLASH or other
 *    slash-homoglyphs, so the non-ASCII reject below is required.
 * 2. Non-ASCII reject (`/[^\x20-\x7E]/`) — drops any value containing a
 *    character outside printable ASCII. This catches Unicode confusables that
 *    mimic `/` or `\` and that NFKC alone would leave intact (e.g. U+2215
 *    DIVISION SLASH, U+FF0F FULLWIDTH SOLIDUS after normalization fails to
 *    fold them to U+002F).
 * 3. Path-separator / at-sign / control-char / length checks — same as before.
 * 4. Secret-prefix denylist — values whose normalized form begins with a known
 *    secret prefix (sk-ant-, sk-, ghp_, gho_, ghu_, ghs_, ghr_, github_pat_)
 *    are dropped entirely. No redaction-to-placeholder: the value is silently
 *    omitted, consistent with all other reject paths.
 *
 * v1 transport is stubbed to the gitfix Output channel; this is the
 * sanitizer security contract that will carry forward to v1.1+ live transport.
 */

/** Secret-token prefixes that must never appear in telemetry. */
const SECRET_PREFIX_RE = /^(sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)/i;

export function sanitize(props: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  // eslint-disable-next-line no-control-regex
  const controlCharRe = /[\x00-\x1F]/;
  for (const [k, v] of Object.entries(props)) {
    if (typeof v !== 'string') continue;
    const nv = v.normalize('NFKC');
    if (/[^\x20-\x7E]/.test(nv)) continue;
    if (SECRET_PREFIX_RE.test(nv)) continue;
    if (
      nv.includes('/') ||
      nv.includes('\\') ||
      nv.includes('@') ||
      nv.length > 64 ||
      controlCharRe.test(nv)
    ) continue;
    out[k] = nv;
  }
  return out;
}

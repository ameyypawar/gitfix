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
 * or is excessively long. Defense-in-depth; callers must not pass PII.
 */
function sanitize(props: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v !== 'string') continue;
    if (v.includes('/') || v.includes('\\') || v.includes('@') || v.length > 64) continue;
    out[k] = v;
  }
  return out;
}

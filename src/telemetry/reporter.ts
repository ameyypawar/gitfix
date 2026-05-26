import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { log } from '../log';

// Empty string = no-op transport (logs to output channel only). v1.1 will set this
// from an env-var at build time once we decide on a backend.
const APP_INSIGHTS_KEY = '';

export type EventName =
  | 'extension.activated'
  | 'merge.preview'
  | 'conflict.resolved'
  | 'merge.applied'
  | 'extension.error';

export class GitfixTelemetry {
  private reporter?: TelemetryReporter;
  private enabled = false;

  constructor(private extensionVersion: string) {}

  init(context: vscode.ExtensionContext): void {
    // Respect both VS Code-wide and our own setting.
    this.refreshEnabled();
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitfix.telemetry.enabled')) this.refreshEnabled();
    }, null, context.subscriptions);
    vscode.env.onDidChangeTelemetryEnabled?.(() => this.refreshEnabled(), null, context.subscriptions);
    if (APP_INSIGHTS_KEY) {
      this.reporter = new TelemetryReporter(APP_INSIGHTS_KEY);
      context.subscriptions.push(this.reporter);
    }
  }

  private refreshEnabled(): void {
    const ours = vscode.workspace.getConfiguration('gitfix').get<boolean>('telemetry.enabled', false);
    const vscodeWide = vscode.env.isTelemetryEnabled;
    this.enabled = ours && vscodeWide;
  }

  send(event: EventName, properties: Record<string, string> = {}, measurements: Record<string, number> = {}): void {
    if (!this.enabled) return;
    // Always include version baseline.
    const props = { extensionVersion: this.extensionVersion, ...sanitize(properties) };
    if (this.reporter) {
      this.reporter.sendTelemetryEvent(event, props, measurements);
    } else {
      // Stubbed transport: log only. Useful for development.
      log(`[telemetry] ${event} ${JSON.stringify(props)} ${JSON.stringify(measurements)}`);
    }
  }
}

/**
 * Strip any property value that looks like a file path, URL, email address,
 * or is excessively long. This is a defense-in-depth measure; callers are
 * responsible for not passing PII in the first place.
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

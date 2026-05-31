import * as vscode from 'vscode';

const channel = vscode.window.createOutputChannel('gitfix');

export function log(msg: string): void {
  const ts = new Date().toISOString();
  channel.appendLine(`[${ts}] ${msg}`);
}

export function showOutputChannel(): void {
  channel.show(true);
}

export function getLogChannel(): vscode.OutputChannel {
  return channel;
}

import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { log } from '../log';
import type {
  MergePreviewResponse,
  MergeStatusResponse,
  ConflictGetResponse,
  ConflictResolveResponse,
  ResolutionDecision,
} from './types';
import { unwrapStructuredContent } from './unwrap';

const CLIENT_NAME = 'gitfix-vscode';

export class GfixMcpClient {
  private client?: Client;
  private transport?: StdioClientTransport;

  constructor(
    private gfixPath: string,
    private extensionVersion: string,
  ) {}

  /**
   * Start the MCP subprocess and establish the handshake.
   *
   * @param opts.onSubprocessDied - Optional callback invoked when the gfix
   *   subprocess exits unexpectedly (transport close or error after start).
   *   The extension uses this to surface a "Reload Window" toast (#57).
   * @param opts.allowedRoots - Optional list of absolute repo paths to pass as
   *   GITFIX_ALLOWED_ROOTS. Required in test environments (and with gfix builds
   *   that restrict the MCP server to the launch working directory) when the
   *   fixture repo lives outside the extension host's cwd.
   */
  async start(
    opts: { enableByok: boolean; onSubprocessDied?: () => void; allowedRoots?: string[] } = { enableByok: false },
  ): Promise<void> {
    const baseEnv = process.env as Record<string, string>;
    let env: Record<string, string> | undefined;
    if (opts.enableByok || opts.allowedRoots) {
      env = { ...baseEnv };
      if (opts.enableByok) {
        env['GITFIX_BYOK'] = '1';
      }
      if (opts.allowedRoots && opts.allowedRoots.length > 0) {
        env['GITFIX_ALLOWED_ROOTS'] = opts.allowedRoots.join(path.delimiter);
      }
    }
    this.transport = new StdioClientTransport({
      command: this.gfixPath,
      args: ['mcp'],
      stderr: 'pipe',
      env,
    });

    // Forward subprocess stderr to the output channel for debugging.
    this.transport.stderr?.on('data', (chunk: Buffer) => {
      log(`[gfix stderr] ${chunk.toString().trimEnd()}`);
    });

    // Wire transport lifecycle events so callers can react to unexpected death
    // of the gfix subprocess (#57). Both onclose and onerror are guarded so they
    // fire only after the initial connect() succeeds — a failure during start()
    // itself is reported via the thrown exception, not these callbacks.
    let connected = false;
    this.transport.onclose = () => {
      if (connected) {
        log('[gfix] transport closed unexpectedly');
        opts.onSubprocessDied?.();
      }
    };
    this.transport.onerror = (err: Error) => {
      if (connected) {
        log(`[gfix] transport error: ${err.message}`);
        opts.onSubprocessDied?.();
      }
    };

    this.client = new Client(
      { name: CLIENT_NAME, version: this.extensionVersion },
      { capabilities: { sampling: {} } }, // Advertise sampling so gfix uses vscode.lm path.
    );

    await this.client.connect(this.transport);
    connected = true;
    log('MCP handshake complete');
  }

  async stop(): Promise<void> {
    try {
      await this.client?.close();
    } catch (err) {
      log(`client.close error: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await this.transport?.close();
    } catch (err) {
      log(`transport.close error: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.client = undefined;
    this.transport = undefined;
  }

  getRawClient(): Client | undefined {
    return this.client;
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new Error('MCP client not started');
    }
    return this.client;
  }

  async mergePreview(args: {
    repo_path: string;
    target: string;
    sources: string[];
    strategy?: string;
    substrate?: string;
  }): Promise<MergePreviewResponse> {
    // 30 s: may spawn mergiraf and AI analysis for large diffs.
    const res = await this.requireClient().callTool({
      name: 'gitfix_merge_preview',
      arguments: args,
    }, CallToolResultSchema, { timeout: 30_000 });
    return unwrapStructuredContent<MergePreviewResponse>(res as CallToolResult, 'gitfix_merge_preview');
  }

  async mergeStatus(args: {
    repo_path: string;
    merge_id: string;
  }): Promise<MergeStatusResponse> {
    // 10 s: query only, no AI or subprocess involved.
    const res = await this.requireClient().callTool({
      name: 'gitfix_merge_status',
      arguments: args,
    }, CallToolResultSchema, { timeout: 10_000 });
    return unwrapStructuredContent<MergeStatusResponse>(res as CallToolResult, 'gitfix_merge_status');
  }

  async conflictGet(args: {
    repo_path: string;
    merge_id: string;
    conflict_id: string;
    include_ai_suggestion?: boolean;
  }): Promise<ConflictGetResponse> {
    // 30 s: may invoke AI for suggestion caching.
    const res = await this.requireClient().callTool({
      name: 'gitfix_conflict_get',
      arguments: args,
    }, CallToolResultSchema, { timeout: 30_000 });
    return unwrapStructuredContent<ConflictGetResponse>(res as CallToolResult, 'gitfix_conflict_get');
  }

  async conflictResolve(args: {
    repo_path: string;
    merge_id: string;
    conflict_id: string;
    resolution: ResolutionDecision;
  }): Promise<ConflictResolveResponse> {
    // 30 s: may invoke AI if resolution kind is 'ai-suggestion'.
    const res = await this.requireClient().callTool({
      name: 'gitfix_conflict_resolve',
      arguments: args,
    }, CallToolResultSchema, { timeout: 30_000 });
    return unwrapStructuredContent<ConflictResolveResponse>(res as CallToolResult, 'gitfix_conflict_resolve');
  }

  async mergeApply(args: {
    repo_path: string;
    merge_id: string;
    auto_approve?: boolean;
  }): Promise<{ merge_id: string; commit_oid: string; audit_ref: string }> {
    // 30 s: writes the merge commit and audit ref.
    const res = await this.requireClient().callTool({
      name: 'gitfix_merge_apply',
      arguments: args,
    }, CallToolResultSchema, { timeout: 30_000 });
    return unwrapStructuredContent<{ merge_id: string; commit_oid: string; audit_ref: string }>(res as CallToolResult, 'gitfix_merge_apply');
  }

  async mergeAbort(args: { repo_path: string; merge_id: string }): Promise<{ merge_id: string; aborted: boolean }> {
    // 10 s: abort is a quick git reset operation.
    const res = await this.requireClient().callTool({
      name: 'gitfix_merge_abort',
      arguments: args,
    }, CallToolResultSchema, { timeout: 10_000 });
    return unwrapStructuredContent<{ merge_id: string; aborted: boolean }>(res as CallToolResult, 'gitfix_merge_abort');
  }

  async conflictResolveBatch(args: {
    repo_path: string;
    merge_id: string;
    decisions: Array<{ conflict_id: string; resolution: ResolutionDecision }>;
  }): Promise<{ merge_id: string; resolved: number; failed: number; remaining_unresolved: number }> {
    // 60 s: resolves multiple conflicts, each potentially invoking AI.
    const res = await this.requireClient().callTool({
      name: 'gitfix_conflict_resolve_batch',
      arguments: args,
    }, CallToolResultSchema, { timeout: 60_000 });
    return unwrapStructuredContent<{ merge_id: string; resolved: number; failed: number; remaining_unresolved: number }>(res as CallToolResult, 'gitfix_conflict_resolve_batch');
  }
}

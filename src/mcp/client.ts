import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
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
const CLIENT_VERSION = '0.2.0';

export class GfixMcpClient {
  private client?: Client;
  private transport?: StdioClientTransport;

  constructor(private gfixPath: string) {}

  async start(opts: { enableByok: boolean } = { enableByok: false }): Promise<void> {
    this.transport = new StdioClientTransport({
      command: this.gfixPath,
      args: ['mcp'],
      stderr: 'pipe',
      env: opts.enableByok
        ? { ...process.env as Record<string, string>, GITFIX_BYOK: '1' }
        : undefined,
    });

    // Forward subprocess stderr to the output channel for debugging.
    this.transport.stderr?.on('data', (chunk: Buffer) => {
      log(`[gfix stderr] ${chunk.toString().trimEnd()}`);
    });

    this.client = new Client(
      { name: CLIENT_NAME, version: CLIENT_VERSION },
      { capabilities: { sampling: {} } }, // Advertise sampling so gfix uses vscode.lm path.
    );

    await this.client.connect(this.transport);
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
    const res = await this.requireClient().callTool({
      name: 'gitfix_merge_preview',
      arguments: args,
    });
    return unwrapStructuredContent<MergePreviewResponse>(res as CallToolResult, 'gitfix_merge_preview');
  }

  async mergeStatus(args: {
    repo_path: string;
    merge_id: string;
  }): Promise<MergeStatusResponse> {
    const res = await this.requireClient().callTool({
      name: 'gitfix_merge_status',
      arguments: args,
    });
    return unwrapStructuredContent<MergeStatusResponse>(res as CallToolResult, 'gitfix_merge_status');
  }

  async conflictGet(args: {
    repo_path: string;
    merge_id: string;
    conflict_id: string;
    include_ai_suggestion?: boolean;
  }): Promise<ConflictGetResponse> {
    const res = await this.requireClient().callTool({
      name: 'gitfix_conflict_get',
      arguments: args,
    });
    return unwrapStructuredContent<ConflictGetResponse>(res as CallToolResult, 'gitfix_conflict_get');
  }

  async conflictResolve(args: {
    repo_path: string;
    merge_id: string;
    conflict_id: string;
    resolution: ResolutionDecision;
  }): Promise<ConflictResolveResponse> {
    const res = await this.requireClient().callTool({
      name: 'gitfix_conflict_resolve',
      arguments: args,
    });
    return unwrapStructuredContent<ConflictResolveResponse>(res as CallToolResult, 'gitfix_conflict_resolve');
  }

  async mergeApply(args: {
    repo_path: string;
    merge_id: string;
    auto_approve?: boolean;
  }): Promise<{ merge_id: string; commit_oid: string; audit_ref: string }> {
    const res = await this.requireClient().callTool({
      name: 'gitfix_merge_apply',
      arguments: args,
    });
    return unwrapStructuredContent<{ merge_id: string; commit_oid: string; audit_ref: string }>(res as CallToolResult, 'gitfix_merge_apply');
  }

  async mergeAbort(args: { repo_path: string; merge_id: string }): Promise<{ merge_id: string; aborted: boolean }> {
    const res = await this.requireClient().callTool({
      name: 'gitfix_merge_abort',
      arguments: args,
    });
    return unwrapStructuredContent<{ merge_id: string; aborted: boolean }>(res as CallToolResult, 'gitfix_merge_abort');
  }

  async conflictResolveBatch(args: {
    repo_path: string;
    merge_id: string;
    decisions: Array<{ conflict_id: string; resolution: ResolutionDecision }>;
  }): Promise<{ merge_id: string; resolved: number; failed: number; remaining_unresolved: number }> {
    const res = await this.requireClient().callTool({
      name: 'gitfix_conflict_resolve_batch',
      arguments: args,
    });
    return unwrapStructuredContent<{ merge_id: string; resolved: number; failed: number; remaining_unresolved: number }>(res as CallToolResult, 'gitfix_conflict_resolve_batch');
  }
}

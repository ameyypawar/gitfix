import * as vscode from 'vscode';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { log } from '../log';

/**
 * Wires up the MCP `sampling/createMessage` handler on the given client.
 * Routes each request to vscode.lm and returns the model's response.
 *
 * The MCP SDK exposes setRequestHandler on the underlying Server-side, but for
 * the *client* side we use `setNotificationHandler`-like semantics via the
 * server's request schemas. The @modelcontextprotocol/sdk v1.x supports
 * `client.setRequestHandler(schema, handler)`.
 */
export async function installSamplingHost(client: Client): Promise<{
  available: boolean;
  modelLabel?: string;
}> {
  // Detect whether vscode.lm has any models available right now.
  let models: vscode.LanguageModelChat[] = [];
  try {
    models = await vscode.lm.selectChatModels({});
  } catch (err) {
    log(`vscode.lm.selectChatModels failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (models.length === 0) {
    log('vscode.lm reports zero models; sampling host inactive');
    return { available: false };
  }

  log(`vscode.lm host active: ${models.length} model(s); preferring ${models[0].name}`);

  client.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    const { messages, systemPrompt, maxTokens, modelPreferences } =
      request.params;

    // Map MCP messages to vscode.lm messages. MCP sampling messages have role
    // 'user' | 'assistant' and a content union; we coerce text content only
    // (gfix never sends multimodal in v1).
    const lmMessages: vscode.LanguageModelChatMessage[] = [];
    if (systemPrompt) {
      // vscode.lm has no explicit system role; prepend as a user-role priming msg.
      lmMessages.push(vscode.LanguageModelChatMessage.User(`[SYSTEM]\n${systemPrompt}`));
    }
    for (const m of messages) {
      // content is a discriminated union (text | image | audio | tool_use | tool_result)
      // or an array of those. gfix v1 only sends text; coerce others to a placeholder.
      const content = m.content;
      let text: string;
      if (Array.isArray(content)) {
        text = content
          .map((c) => {
            const block = c as { type: string; text?: string };
            return block.type === 'text' && block.text ? block.text : `[${block.type}]`;
          })
          .join('');
      } else {
        const block = content as { type: string; text?: string };
        text = block.type === 'text' && block.text
          ? block.text
          : `[unsupported content type ${block.type}]`;
      }
      lmMessages.push(
        m.role === 'assistant'
          ? vscode.LanguageModelChatMessage.Assistant(text)
          : vscode.LanguageModelChatMessage.User(text),
      );
    }

    // Pick a model honoring modelPreferences.hints[].name if provided.
    const hints = modelPreferences?.hints?.map((h) => h.name).filter(Boolean) ?? [];
    const candidates = await vscode.lm.selectChatModels({});
    const picked =
      candidates.find((m) => hints.some((h) => m.id.includes(h!) || m.name.includes(h!))) ??
      candidates[0];

    if (!picked) {
      throw new Error('no vscode.lm model available');
    }

    const cts = new vscode.CancellationTokenSource();
    const response = await picked.sendRequest(
      lmMessages,
      { justification: 'gitfix is generating a conflict resolution suggestion.' },
      cts.token,
    );

    let buffer = '';
    for await (const chunk of response.text) {
      buffer += chunk;
      if (maxTokens && buffer.length >= maxTokens * 4) break; // ~4 chars/token rough cap
    }

    return {
      model: picked.id,
      role: 'assistant' as const,
      content: { type: 'text' as const, text: buffer },
      stopReason: 'endTurn',
    };
  });

  return { available: true, modelLabel: models[0].name };
}

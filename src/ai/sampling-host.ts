import * as vscode from 'vscode';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { log } from '../log';

/**
 * Rough heuristic: average characters per token used to convert a maxTokens
 * budget into a character-length ceiling for streamed responses.
 *
 * 4 chars/token is a reasonable English estimate but significantly undercounts
 * CJK text (each ideograph is ~1 token, not 4 chars). This is intentionally
 * conservative — overshooting by a small factor is preferable to cutting off
 * responses too early. (#44)
 */
const CHARS_PER_TOKEN_HEURISTIC = 4;

/**
 * Select the best available vscode.lm model honoring the given hints.
 * Called fresh on every sampling request (fix #5 — no caching to avoid TOCTOU
 * when Copilot installs after the extension activates).
 */
export async function pickModel(
  hints: string[] = [],
): Promise<vscode.LanguageModelChat | undefined> {
  let candidates: vscode.LanguageModelChat[] = [];
  try {
    candidates = await vscode.lm.selectChatModels({});
  } catch (err) {
    log(`vscode.lm.selectChatModels failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
  return (
    candidates.find((m) => hints.some((h) => m.id.includes(h) || m.name.includes(h))) ??
    candidates[0]
  );
}

/**
 * Wires up the MCP `sampling/createMessage` handler on the given client.
 * Routes each request to vscode.lm and returns the model's response.
 *
 * Fix #5: the handler is always installed regardless of whether models are
 * available at activation time. Each request calls pickModel() fresh, so
 * Copilot (or another LM provider) that installs after activation is picked
 * up automatically without requiring a window reload.
 *
 * The @modelcontextprotocol/sdk v1.x supports
 * `client.setRequestHandler(schema, handler)`.
 */
export async function installSamplingHost(client: Client): Promise<{
  available: boolean;
  modelLabel?: string;
}> {
  // Per-session request counter for the budget warning (#23).
  let requestCount = 0;
  let budgetWarningFired = false;
  // Report initial availability for CodeLens / info-toast purposes, but do
  // NOT gate handler installation on this check (fix #5).
  let initialModels: vscode.LanguageModelChat[] = [];
  try {
    initialModels = await vscode.lm.selectChatModels({});
  } catch (err) {
    log(`vscode.lm.selectChatModels (initial check) failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (initialModels.length === 0) {
    log('vscode.lm reports zero models at activation; sampling handler still installed for late-arriving providers');
  } else {
    log(`vscode.lm host active: ${initialModels.length} model(s); preferring ${initialModels[0].name}`);
  }

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
    // pickModel() calls selectChatModels fresh each time (fix #5).
    const hints = modelPreferences?.hints?.map((h) => h.name).filter((h): h is string => typeof h === 'string') ?? [];
    const picked = await pickModel(hints);

    if (!picked) {
      throw new Error('no vscode.lm model available');
    }

    // Increment per-session counter and emit a one-time warning when the
    // configured threshold is reached (#23). Soft-continue: the request is
    // NOT blocked; the warning is purely informational.
    // Read live so changes to gitfix.ai.budgetWarningAt take effect immediately.
    const budgetWarningAt = vscode.workspace
      .getConfiguration('gitfix')
      .get<number>('ai.budgetWarningAt', 8);
    requestCount += 1;
    if (!budgetWarningFired && budgetWarningAt > 0 && requestCount >= budgetWarningAt) {
      budgetWarningFired = true;
      vscode.window.showWarningMessage(
        // eslint-disable-next-line max-len
        vscode.l10n.t('gitfix: {0} AI suggestion requests used this session. You can adjust the threshold in gitfix.ai.budgetWarningAt.', requestCount),
      );
    }

    const cts = new vscode.CancellationTokenSource();
    try {
      const response = await picked.sendRequest(
        lmMessages,
        { justification: 'gitfix is generating a conflict resolution suggestion.' },
        cts.token,
      );

      let buffer = '';
      for await (const chunk of response.text) {
        buffer += chunk;
        if (maxTokens && buffer.length >= maxTokens * CHARS_PER_TOKEN_HEURISTIC) {
          // Cancel upstream generation so we stop burning quota. (P2-1)
          cts.cancel();
          break;
        }
      }

      return {
        model: picked.id,
        role: 'assistant' as const,
        content: { type: 'text' as const, text: buffer },
        stopReason: 'endTurn',
      };
    } finally {
      cts.dispose();
    }
  });

  return {
    available: initialModels.length > 0,
    modelLabel: initialModels[0]?.name,
  };
}

# Configure an AI provider (optional)

gitfix can suggest resolutions for ambiguous conflicts using an LLM. Three modes:

| Mode | Source | Setup |
|------|--------|-------|
| `host` | VS Code Language Model (Copilot, etc.) | No config — uses whatever VS Code exposes |
| `byok` | Your own API key | Run **Configure AI Provider** and enter a key |
| `none` | Disabled | Set `gitfix.aiProvider` to `none` in Settings |

**host** is the default. If VS Code exposes a model (e.g. you have GitHub Copilot), AI suggestions appear automatically. If no model is found, gitfix falls back to `byok` if configured.

Run **Configure AI Provider** from the Command Palette (`gitfix.configureAiProvider`) to enter a BYOK key. Supported providers: Anthropic, OpenAI, Ollama.

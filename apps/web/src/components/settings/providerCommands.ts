/**
 * Per-provider install + setup commands. Used by ProvidersSettings to drive
 * the Install button (one-shot exec) and the Set up dialog (interactive PTY).
 *
 * Cursor is intentionally absent — Cursor's CLI only supports API-key auth,
 * which we don't surface yet.
 */
export interface ProviderCommands {
  readonly install: string;
  readonly setup: string;
  readonly setupHint: string;
}

export const PROVIDER_COMMANDS: Readonly<Record<string, ProviderCommands>> = {
  claudeAgent: {
    install: "npm i -g @anthropic-ai/claude-code",
    setup: "claude",
    setupHint:
      "Claude Code prints a URL on first run. Open it in your browser, complete OAuth, then paste the code back here.",
  },
  codex: {
    install: "npm i -g @openai/codex",
    setup: "codex login --device-auth",
    setupHint:
      "Codex prints a URL and short code. Open the URL in your browser, enter the code, and finish OAuth there.",
  },
  opencode: {
    install: "npm i -g opencode-ai",
    setup: "opencode auth login",
    setupHint: "Pick the OpenCode provider, then follow the prompts.",
  },
};

export function getProviderCommands(providerId: string): ProviderCommands | null {
  return PROVIDER_COMMANDS[providerId] ?? null;
}

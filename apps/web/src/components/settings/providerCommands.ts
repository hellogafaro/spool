/**
 * Per-provider setup commands. Cloud environments bake the CLIs into the image,
 * so the settings UI only needs to open the provider's auth flow.
 */
export interface ProviderCommands {
  readonly setup: string;
  readonly setupHint: string;
}

export const PROVIDER_COMMANDS: Readonly<Record<string, ProviderCommands>> = {
  claudeAgent: {
    setup: "claude",
    setupHint:
      "Claude Code prints a URL on first run. Open it in your browser, complete OAuth, then paste the code back here.",
  },
  codex: {
    setup: "codex login --device-auth",
    setupHint:
      "Codex prints a URL and short code. Open the URL in your browser, enter the code, and finish OAuth there.",
  },
  cursor: {
    setup: "agent login",
    setupHint: "Cursor Agent opens a login flow. Follow the prompts to authenticate Cursor.",
  },
  opencode: {
    setup: "opencode auth login",
    setupHint: "Pick the OpenCode provider, then follow the prompts.",
  },
};

export function getProviderCommands(providerId: string): ProviderCommands | null {
  return PROVIDER_COMMANDS[providerId] ?? null;
}

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

/**
 * `npm install -g` streams hundreds of progress + dependency-tree lines.
 * Each line becomes a WS frame from env→relay→web; that volume saturates
 * bun's event loop on the env, CF closes the WS for keepalive timeout, and
 * the relay→client bridge cascades down. Redirect output to a log file so
 * the PTY emits ~nothing across the bridge but failures stay diagnosable
 * via `cat $TRUNK_HOME/install-<provider>.log` over SSH.
 */
function quietInstall(pkg: string, providerId: string): string {
  return `npm i -g ${pkg} > "\${TRUNK_HOME:-/data}/install-${providerId}.log" 2>&1`;
}

export const PROVIDER_COMMANDS: Readonly<Record<string, ProviderCommands>> = {
  claudeAgent: {
    install: quietInstall("@anthropic-ai/claude-code", "claudeAgent"),
    setup: "claude",
    setupHint:
      "Claude Code prints a URL on first run. Open it in your browser, complete OAuth, then paste the code back here.",
  },
  codex: {
    install: quietInstall("@openai/codex", "codex"),
    setup: "codex login --device-auth",
    setupHint:
      "Codex prints a URL and short code. Open the URL in your browser, enter the code, and finish OAuth there.",
  },
  opencode: {
    install: quietInstall("opencode-ai", "opencode"),
    setup: "opencode auth login",
    setupHint: "Pick the OpenCode provider, then follow the prompts.",
  },
};

export function getProviderCommands(providerId: string): ProviderCommands | null {
  return PROVIDER_COMMANDS[providerId] ?? null;
}
